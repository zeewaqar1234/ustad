"""Reader service (docs/modules.md §5.3): seed texts, Zee's known-word set, density, tap-to-gloss,
add a word to SRS, comprehension check. Answers never leave the server before an attempt."""

import json
import threading
from datetime import date, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import local_date
from app.core.config import settings
from app.models import Attempt, Card, Item, ReadingText
from app.reading import density
from app.services import evidence
from app.services.cards import card_types_for
from app.srs import scheduler

READER_DECK = "reader"
READER_UNIT_ORDER = 1_000_001  # outside the Sabaq order, like the ghalti deck
READ_CAP_MS = 15 * 60_000  # one text, read and answered: at most 15 active minutes count
_seed_lock = threading.Lock()
_known_cache: dict[tuple, set[str]] = {}


# --- seed texts ---------------------------------------------------------------------------------


def ensure_seed(db: Session) -> int:
    """Insert or refresh the built seed texts (data/seed/texts.json). Keeps read state. Idempotent.
    Commits inside a lock: the Home screen asks for texts and Diktat at the same moment, and two
    requests inserting the same seed code would collide."""
    path = settings.seed_dir / "texts.json"
    if not path.exists():
        return 0
    with _seed_lock:
        added = 0
        try:
            for t in json.loads(path.read_text())["texts"]:
                added += _upsert_seed(db, t)
            db.commit()
        except IntegrityError:  # another process got there first: its rows are as good
            db.rollback()
            return 0
    return added


def _upsert_seed(db: Session, t: dict) -> int:
    row = db.scalar(select(ReadingText).where(ReadingText.code == t["code"]))
    new = row is None
    if new:
        row = ReadingText(code=t["code"], kind="graded")
        db.add(row)
    row.title, row.topic, row.level = t["title"], t["topic"], t["level"]
    row.series_episode = t.get("series_episode")
    row.sentences_json, row.glossary_json = t["sentences"], t["glossary"]
    row.questions_json = t["questions"]
    row.body_de = " ".join(s["de"] for s in t["sentences"])
    row.credit, row.licence, row.source_url = t["credit"], t["licence"], t.get("source_url")
    row.status, row.review_notes = t["status"], t["review_notes"]
    db.flush()
    return int(new)


# --- known words --------------------------------------------------------------------------------


def known_items(db: Session):
    taught = select(Card.item_id).where(Card.introduced_at.is_not(None))
    return select(Item).where(
        Item.deck != "ghalti", or_(Item.id.in_(taught), Item.known_from_placement)
    )


def known_words(db: Session) -> set[str]:
    """Lower-case lemmas and forms of every item Zee has been taught or marked known by placement.
    Cached until the taught set changes."""
    key = (
        db.scalar(select(func.count()).select_from(Card).where(Card.introduced_at.is_not(None))),
        db.scalar(select(func.count()).select_from(Item).where(Item.known_from_placement)),
        db.scalar(select(func.max(Item.id))),
    )
    if key not in _known_cache:
        texts = []
        for it in db.scalars(known_items(db)):
            texts += [it.de, *(it.alt or [])]
            if it.lemma:
                texts.append(it.lemma)
        _known_cache.clear()
        _known_cache[key] = density.lemmas_of(texts)
    return _known_cache[key]


def measure(db: Session, t: ReadingText) -> density.Density:
    return density.text_density(t.body_de, known_words(db))


# --- views --------------------------------------------------------------------------------------


def words(t: ReadingText) -> int:
    return len(t.body_de.split())


def summary(db: Session, t: ReadingText) -> dict:
    return {
        "id": t.id, "title": t.title, "topic": t.topic, "level": t.level, "kind": t.kind,
        "series_episode": t.series_episode, "words": words(t), "known_pct": measure(db, t).pct,
        "for_date": t.for_date.isoformat() if t.for_date else None, "read": t.read_at is not None,
        "score": (t.result_json or {}).get("score"), "status": t.status,
    }  # fmt: skip


def public_questions(t: ReadingText) -> list[dict]:
    return [
        {k: q[k] for k in ("id", "kind", "prompt", "left", "options")} for q in t.questions_json
    ]


def detail(db: Session, t: ReadingText) -> dict:
    d = measure(db, t)
    return {
        "id": t.id, "title": t.title, "topic": t.topic, "level": t.level, "kind": t.kind,
        "series_episode": t.series_episode, "status": t.status,
        "review_notes": [n.get("message", "") for n in t.review_notes or []],
        "credit": t.credit, "licence": t.licence, "source_url": t.source_url,
        "sentences": t.sentences_json, "glossary": t.glossary_json,
        "density": {"known_pct": d.pct, "words": d.words, "unknown": d.unknown},
        "questions": public_questions(t), "result": t.result_json,
    }  # fmt: skip


def today_and_library(db: Session, today: date) -> tuple[list[ReadingText], list[ReadingText]]:
    ensure_seed(db)
    every = list(
        db.scalars(
            select(ReadingText).order_by(ReadingText.for_date.desc().nulls_last(), ReadingText.id)
        )
    )
    todays = [t for t in every if t.for_date == today]
    if not todays:
        todays = [t for t in every if t.kind == "graded" and t.read_at is None][:2]
    return todays, every


# --- tap to gloss, add to SRS -------------------------------------------------------------------


def _analyse(word: str, t: ReadingText | None = None) -> density.Tok:
    """`word` analysed in its sentence when the text is known (spaCy is unreliable on a lone word:
    "Quittungen" alone gives "Quittunge", in a sentence "Quittung")."""
    for s in t.sentences_json if t else []:
        for tok in density.tokens(s["de"]):
            if tok.surface == word:
                return tok
    toks = [x for x in density.tokens(word) if density._WORD.search(x.surface)]
    return toks[0] if toks else density.Tok(word, word, "X")


def _find_item(db: Session, lemma: str, word: str) -> Item | None:
    keys = {lemma.lower(), word.lower()}
    return db.scalar(
        select(Item)
        .where(Item.deck != "ghalti",
               or_(func.lower(Item.de).in_(keys), func.lower(Item.lemma).in_(keys)))
        .order_by(Item.id).limit(1)
    )  # fmt: skip


def _taught(item: Item | None) -> bool:
    return item is not None and any(c.introduced_at is not None for c in item.cards)


def gloss(db: Session, word: str, t: ReadingText | None) -> dict:
    word = word.strip(" .,;:!?\"'()„“”»«")
    entry = None
    for g in t.glossary_json if t else []:
        if word.lower() in (g["word"].lower(), g["lemma"].lower()):
            entry = g
            break
    tok = None if entry else _analyse(word, t)
    lemma = entry["lemma"] if entry else tok.lemma
    item = _find_item(db, lemma, word)
    known = known_words(db)
    # a noun's gender from spaCy is a guess from context: used only when nothing better is stored
    guess = tok.gender if tok and tok.pos == "NOUN" else None
    return {
        "word": word, "lemma": lemma,
        "en": entry["en"] if entry else (item.en if item else None),
        "gender": entry.get("gender") if entry else (item.gender if item else None),
        "gender_guess": None if entry or (item and item.gender) else guess,  # shown, never saved
        "plural": entry.get("plural") if entry else (item.plural if item else None),
        "item_id": item.id if item else None, "in_srs": _taught(item),
        "known": lemma.lower() in known or word.lower() in known,
    }  # fmt: skip


def _example(t: ReadingText, word: str) -> tuple[str | None, str | None]:
    for s in t.sentences_json:
        if word.lower() in s["de"].lower():
            return s["de"], s["en"]
    return None, None


def add_word(db: Session, now: datetime, t: ReadingText, word: str, lemma: str | None, en: str,
             gender: str | None) -> tuple[Item, bool]:  # fmt: skip
    """Add to SRS, taught now. An existing untaught item is introduced instead of duplicated."""
    lemma = (lemma or _analyse(word, t).lemma).strip()
    item = _find_item(db, lemma, word)
    if _taught(item):
        return item, False
    if item is None:
        ex_de, ex_en = _example(t, word)
        item = Item(
            deck=READER_DECK, unit=0, unit_order=READER_UNIT_ORDER, unit_title="From reading",
            kind="word", de=lemma, en=en.strip(), lemma=lemma, gender=gender,
            pos="noun" if gender else None, example_de=ex_de, example_en=ex_en,
            source=f"reader:{t.id}", status="ok",
        )  # fmt: skip
        db.add(item)
        db.flush()
        for ct in card_types_for(item):
            db.add(Card(item_id=item.id, card_type=ct))
        db.flush()
        db.refresh(item)
    for c in item.cards:
        if c.introduced_at is None:
            scheduler.introduce(c, now)
    db.flush()
    return item, True


# --- comprehension ------------------------------------------------------------------------------


def check_answers(db: Session, now: datetime, t: ReadingText, answers: dict[str, list[int]],
                  elapsed_ms: int) -> dict:  # fmt: skip
    """Score per answer slot (rf/mc: 1, match: one per left statement). First attempt is kept."""
    if t.result_json:
        return t.result_json
    results, got, total = [], 0, 0
    for q in t.questions_json:
        given = [int(a) for a in answers.get(q["id"], [])]
        right = sum(1 for i, a in enumerate(q["answer"]) if i < len(given) and given[i] == a)
        got, total = got + right, total + len(q["answer"])
        results.append({"id": q["id"], "correct": given == q["answer"], "given": given,
                        "answer": q["answer"]})  # fmt: skip
    score = round(100 * got / total) if total else 0
    t.result_json = {"score": score, "results": results}
    mark_read(db, now, t, elapsed_ms)
    evidence.mark_other_done(db, now)
    kinds = {q["id"]: q["kind"] for q in t.questions_json}
    for r in results:
        evidence.record_event(db, now, "reading", "reading_q", "correct" if r["correct"] else "error",
                              source_ref=f"text:{t.id}:{r['id']}", meta={"question_type": kinds.get(r["id"])})  # fmt: skip
    db.add(Attempt(ts=now, task_ref=f"text:{t.id}", input=json.dumps(answers)[:2000],
                   correct=score >= 60, score=score))  # fmt: skip
    db.flush()
    return t.result_json


def mark_read(db: Session, now: datetime, t: ReadingText, elapsed_ms: int) -> None:
    if t.read_at is None:  # reading time counts once per text, whichever call comes first
        t.read_at = now
        evidence.add_activity(db, now, "reading", elapsed_ms, cap_ms=READ_CAP_MS)


def today(now: datetime) -> date:
    return local_date(now)
