"""Diktat (Imla), docs/modules.md §5.5: hear one sentence, type it, see a diff by error kind.

5 sentences a day, fixed the first time the day is asked for. Sources in order: sentences of items Zee
has been taught (ask before tell: never an untaught item), then sentences of texts he has read, then
seed text sentences. The word diff names the kind of each error: umlaut (ä/ö/ü/ß), capital, ending,
spelling, missing, extra.
"""

import difflib
import random
import re
import threading
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Attempt, Card, DictationItem, Item, ReadingText
from app.reading.texts import ensure_seed
from app.services import daily
from app.srs.grader import _char_diff

PER_DAY = 5
_pick_lock = threading.Lock()
# articles and pronouns whose last letter carries case/gender (den/dem, ihn/ihm, die/der)
CLOSED_FORMS = {
    "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "eines",
    "kein", "keine", "keinen", "keinem", "keiner", "keines", "ihn", "ihm", "ihr", "ihre", "ihren",
    "ihrem", "ihrer", "mein", "meine", "meinen", "meinem", "meiner", "sein", "seine", "seinen",
    "seinem", "seiner", "dies", "dieser", "diese", "diesen", "diesem", "dieses", "wer", "wen", "wem",
}  # fmt: skip
# inflection endings (case, gender, number, person): "einen"/"einem", "gute"/"guten", "neu"/"neue"
ENDINGS = {"", "e", "en", "em", "er", "es", "n", "m", "r", "s", "t", "st", "et", "te", "ten", "ter"}
MIN_WORDS, MAX_WORDS = 4, 14
_PUNCT = re.compile(r"^[^\wäöüÄÖÜß]+|[^\wäöüÄÖÜß]+$")
_FOLD = str.maketrans({"ä": "a", "ö": "o", "ü": "u"})
KIND_TAG = {"umlaut": "UMLAUT", "capital": "CAPITALISATION", "ending": "OTHER",
            "spelling": "SPELLING", "missing": "OTHER", "extra": "OTHER"}  # fmt: skip


# --- choosing the sentences ---------------------------------------------------------------------


def _fits(s: str | None) -> bool:
    return bool(s) and MIN_WORDS <= len(s.split()) <= MAX_WORDS


def _pool(db: Session) -> list[list[tuple[str, str]]]:
    """Candidate (ref, sentence) lists by priority."""
    taught = (
        select(Item)
        .join(Card, Card.item_id == Item.id)
        .where(Card.introduced_at.is_not(None), Item.status == "ok", Item.deck != "ghalti")
        .order_by(Card.introduced_at.desc())
    )
    items, seen = [], set()
    for it in db.scalars(taught):
        s = it.example_de if it.kind in ("word", "chunk") else it.de
        if it.id not in seen and _fits(s):
            seen.add(it.id)
            items.append((f"item:{it.id}", s))
    texts = list(db.scalars(select(ReadingText).where(ReadingText.status == "ok")))
    read = [(f"text:{t.id}:{n}", s["de"]) for t in texts if t.read_at
            for n, s in enumerate(t.sentences_json) if _fits(s["de"])]  # fmt: skip
    rest = [(f"text:{t.id}:{n}", s["de"]) for t in texts if not t.read_at
            for n, s in enumerate(t.sentences_json) if _fits(s["de"])]  # fmt: skip
    return [items, read, rest]


def _rows(db: Session, d: date) -> list[DictationItem]:
    q = select(DictationItem).where(DictationItem.date == d).order_by(DictationItem.idx)
    return list(db.scalars(q))


def todays(db: Session, d: date) -> list[DictationItem]:
    """The day's sentences, chosen once. Chosen and committed inside a lock (two first requests at
    the same moment would both insert the day's set)."""
    rows = _rows(db, d)
    if rows:
        return rows
    ensure_seed(db)
    with _pick_lock:
        db.expire_all()
        if rows := _rows(db, d):
            return rows
        used = {r for (r,) in db.execute(select(DictationItem.ref))}
        rng = random.Random(d.toordinal())
        picked: list[tuple[str, str]] = []
        for tier in _pool(db):
            fresh = [
                c for c in tier if c[0] not in used
            ] or tier  # repeats only when nothing is new
            rng.shuffle(fresh)
            for c in fresh:
                if len(picked) < PER_DAY and c[1] not in {p[1] for p in picked}:
                    picked.append(c)
        for i, (ref, s) in enumerate(picked):
            db.add(DictationItem(date=d, idx=i, ref=ref, de=s))
        try:
            db.commit()
        except IntegrityError:  # another process chose first
            db.rollback()
    return _rows(db, d)


# --- the diff -----------------------------------------------------------------------------------


def _bare(w: str) -> str:
    return _PUNCT.sub("", w)


def _fold(w: str, digraph: bool = False) -> str:
    """Lower case, umlauts as plain vowels (or as ae/oe/ue), ß as ss."""
    w = _bare(w).lower().replace("ß", "ss")
    if digraph:
        return w.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
    return w.translate(_FOLD)


def _umlaut_only(g: str, e: str) -> bool:
    """Same word apart from ä/ö/ü/ß spelling, in either direction (Strasse, Muller, Mueller, Mädchen)."""
    return (
        g.lower() in (_fold(e), _fold(e, True))
        or e.lower() in (_fold(g), _fold(g, True))
        or (_fold(g) == _fold(e) and g.lower() != e.lower())
    )


def classify(given: str, expected: str) -> str:
    g, e = _bare(given), _bare(expected)
    if g == e:
        return "ok"
    if g.lower() == e.lower():
        return "capital"
    if _umlaut_only(g, e):
        return "umlaut"
    gl, el = g.lower(), e.lower()
    if gl in CLOSED_FORMS and el in CLOSED_FORMS and gl[0] == el[0]:
        return "ending"  # den/dem, ihn/ihm, die/der: a case ending on an article or pronoun
    stem = len(_common_prefix(gl, el))
    short, long_ = sorted((gl, el), key=len)
    doubled = len(long_) == len(short) + 1 and any(
        long_[:i] + long_[i + 1 :] == short and long_[i] == long_[i - 1]
        for i in range(1, len(long_))
    )
    if not doubled and stem >= 3 and gl[stem:] in ENDINGS and el[stem:] in ENDINGS:
        return "ending"
    return "spelling"


def _common_prefix(a: str, b: str) -> str:
    n = 0
    while n < min(len(a), len(b)) and a[n] == b[n]:
        n += 1
    return a[:n]


def word_diff(typed: str, expected: str) -> list[dict]:
    """Align words (umlaut- and case-folded so near misses pair up), then name each difference."""
    gw, ew = typed.split(), expected.split()
    gk = [_fold(w) for w in gw]
    ek = [_fold(w) for w in ew]
    out: list[dict] = []
    sm = difflib.SequenceMatcher(a=gk, b=ek, autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op in ("equal", "replace"):
            for k in range(max(i2 - i1, j2 - j1)):
                g = gw[i1 + k] if i1 + k < i2 else None
                e = ew[j1 + k] if j1 + k < j2 else None
                if g is None:
                    out.append({"given": None, "expected": e, "kind": "missing"})
                elif e is None:
                    out.append({"given": g, "expected": None, "kind": "extra"})
                else:
                    kind = classify(g, e)
                    out.append({"given": g, "expected": e, "kind": kind,
                                "capital": kind not in ("ok", "capital") and _bare(g)[:1] != _bare(e)[:1]
                                and _bare(g)[:1].lower() == _bare(e)[:1].lower()})  # fmt: skip
        elif op == "delete":
            out += [{"given": g, "expected": None, "kind": "extra"} for g in gw[i1:i2]]
        else:  # insert
            out += [{"given": None, "expected": e, "kind": "missing"} for e in ew[j1:j2]]
    return out


def check(typed: str, expected: str) -> dict:
    words = word_diff(typed, expected)
    counts: dict[str, int] = {}
    for w in words:
        counts[w["kind"]] = counts.get(w["kind"], 0) + 1
        if w.get("capital"):  # e.g. gute -> Guten: an ending and a capital letter
            counts["capital"] = counts.get("capital", 0) + 1
    extra = counts.get("extra", 0)
    accuracy = round(100 * counts.get("ok", 0) / (len(expected.split()) + extra), 1)
    return {"expected": expected, "accuracy": accuracy, "words": words, "counts": counts,
            "diff": [list(p) for p in _char_diff(typed.strip(), expected)]}  # fmt: skip


def submit(db: Session, now: datetime, row: DictationItem, typed: str, elapsed_ms: int,
           replays: int) -> dict:  # fmt: skip
    """First attempt is kept; a repeat returns it (no second try on the same sentence today)."""
    if row.result_json:
        return row.result_json
    res = {"ref": row.ref, **check(typed, row.de), "replays": replays}
    row.typed, row.accuracy, row.result_json, row.ts = typed, res["accuracy"], res, now
    tags = sorted({KIND_TAG[k] for k in res["counts"] if k != "ok"})
    db.add(Attempt(ts=now, task_ref=f"diktat:{row.ref}", input=typed[:2000],
                   correct=res["accuracy"] == 100, error_tags=tags, score=res["accuracy"]))  # fmt: skip
    daily.add_minutes(db, now, elapsed_ms)
    db.flush()
    return res
