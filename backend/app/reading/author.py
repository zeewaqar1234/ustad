"""Nightly Author job (docs/llm.md, docs/modules.md §5.3): 2 graded texts per day, generated ahead.

Each text: Author JSON (`GradedText`) -> known-word density against Zee's SRS words -> if outside
93-99 %, one regeneration with feedback (the closer one is kept) -> LanguageTool -> stored, flagged
`needs_review` when LanguageTool finds something or is not reachable. Slot 1 of each day is the next
episode of the story serial; slot 2 rotates through the interest topics.
"""

import logging
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.content.schemas import GradedText
from app.llm import prompt
from app.llm.provider import LLMInvalid, LLMUnavailable, Provider, complete_json
from app.models import Item, Profile, ReadingText
from app.reading import density
from app.reading.texts import ensure_seed, known_items, known_words
from app.services.grading import lt_notes

log = logging.getLogger(__name__)
TEXTS_PER_DAY = 2
DENSITY_RANGE = (93.0, 99.0)
KNOWN_IN_PROMPT = 400
ROTATION = ["markets", "crypto", "history", "pk_de", "work", "life"]
BRIEFS = {
    "serial": "Next episode of the story serial: Bilal, a Pakistani trainee in the IT team of a bank "
    "in Frankfurt. Continue from the previous episode below; small everyday events, one clear scene.",
    "markets": "A short explainer about markets or money in Germany (e.g. what an index, a fund, "
    "inflation or a savings plan is). No current prices or dates.",
    "crypto": "A plain explainer about one crypto idea (e.g. what a wallet, a blockchain or a "
    "stablecoin is) with one risk named. No prices, no advice to buy.",
    "history": "A true, well-known anecdote from German history, told simply.",
    "pk_de": "A comparison between everyday life in Pakistan and Germany (food, family, work, "
    "weather, holidays), friendly and specific.",
    "work": "A situation at work in a German office: a meeting, an email, a deadline, a colleague.",
    "life": "Everyday life in Germany: shopping, a doctor, the train, the neighbours, paperwork.",
}


def _learner(db: Session) -> str:
    p = db.get(Profile, 1)
    return f"Level: {p.level_band if p else 'B1.1'}."


def _known_list(db: Session) -> str:
    q = known_items(db).order_by(Item.freq_rank.is_(None), Item.freq_rank, Item.id)
    words = list(dict.fromkeys(i.de for i in db.scalars(q.limit(KNOWN_IN_PROMPT))))
    return ", ".join(words) if words else "(none recorded yet: use common A2/B1 words)"


def system_prompt(db: Session) -> str:
    """Static parts first so the prefix repeats between calls."""
    return f"{prompt('author')}\n{_learner(db)}\nWords he knows:\n{_known_list(db)}"


def _next_episode(db: Session) -> tuple[int, ReadingText | None]:
    last = db.scalar(
        select(ReadingText)
        .where(ReadingText.topic == "serial")
        .order_by(ReadingText.series_episode.desc())
        .limit(1)
    )
    return ((last.series_episode or 0) + 1 if last else 1), last


def _brief(db: Session, topic: str) -> tuple[str, int | None]:
    if topic != "serial":
        return f"Topic: {topic}. {BRIEFS[topic]}\nseries_episode: null", None
    n, prev = _next_episode(db)
    prev_txt = f"\nPrevious episode ({prev.title}):\n{prev.body_de}" if prev else ""
    return f"Topic: serial. {BRIEFS['serial']}\nseries_episode: {n}{prev_txt}", n


def _distance(pct: float) -> float:
    lo, hi = DENSITY_RANGE
    return 0.0 if lo <= pct <= hi else min(abs(pct - lo), abs(pct - hi))


def _feedback(d: density.Density) -> str:
    if d.pct < DENSITY_RANGE[0]:
        return (f"Too hard: only {d.pct} % known words. Probably new to him: "
                f"{', '.join(d.unknown[:25])}. Rewrite with simpler words he knows; "
                f"keep at most 5 % new words.")  # fmt: skip
    return (f"Too easy: {d.pct} % known words. Use 3 to 6 useful new words and put them in the "
            f"glossary.")  # fmt: skip


def write_text(db: Session, llm: Provider, topic: str, for_date: date | None) -> ReadingText:
    system = system_prompt(db)
    brief, episode = _brief(db, topic)
    known = known_words(db)
    best: tuple[GradedText, density.Density] | None = None
    user = brief
    for _ in range(2):  # first draft + at most one regeneration (docs/llm.md "Level control")
        try:
            draft = complete_json(db, llm, "author", system, user, GradedText)
        except (LLMInvalid, LLMUnavailable):
            if best is None:
                raise
            break  # the regeneration failed: keep the first draft
        finally:
            db.commit()  # ledger rows now: do not hold the SQLite write lock through slow calls
        draft.topic, draft.series_episode = topic, episode
        d = density.text_density(" ".join(s.de for s in draft.sentences), known)
        if best is None or _distance(d.pct) < _distance(best[1].pct):
            best = (draft, d)
        if _distance(d.pct) == 0:
            break
        user = f"{brief}\n\n{_feedback(d)}"
    assert best is not None
    draft, d = best
    notes: list[dict] = []
    for text in draft.correct_german():
        n = lt_notes(text)
        if n is None:
            notes = [{"rule": "LT_SKIPPED", "message": "LanguageTool not run; review by hand."}]
            break
        notes += n
    t = ReadingText(
        kind="generated", title=draft.title, topic=topic, level=draft.level,
        series_episode=episode, body_de=" ".join(s.de for s in draft.sentences),
        sentences_json=[s.model_dump() for s in draft.sentences],
        glossary_json=[g.model_dump() for g in draft.glossary],
        questions_json=[q.model_dump() for q in draft.questions], known_density=d.ratio,
        for_date=for_date, licence="own (generated)", credit="Ustad Author (local model)",
        status="needs_review" if notes else "ok", review_notes=notes,
    )  # fmt: skip
    db.add(t)
    db.flush()
    return t


def topics_for(d: date) -> list[str]:
    return ["serial", ROTATION[d.toordinal() % len(ROTATION)]]


def ensure(db: Session, llm: Provider, start: date, days: int) -> list[ReadingText]:
    """Fill each day in [start, start+days) up to TEXTS_PER_DAY. LLMUnavailable propagates."""
    ensure_seed(db)
    made = []
    for i in range(days):
        d = start + timedelta(days=i)
        have = db.scalar(
            select(func.count()).select_from(ReadingText).where(ReadingText.for_date == d)
        )
        for topic in topics_for(d)[have:TEXTS_PER_DAY]:
            made.append(write_text(db, llm, topic, d))
            db.commit()  # keep finished texts if a later call fails
    return made
