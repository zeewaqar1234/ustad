"""V1 evidence ledger: one write path for every right or wrong use, and active time per skill.

Formulas in docs/v2/metrics.md. Nothing here decides what Zee studies.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from app.core.clock import local_date
from app.models import ActivityLog, DayLog, EvidenceEvent
from app.services.streak import get_day

SKILLS = ("vocab", "grammar", "reading", "listening", "writing", "speaking")
SOURCES = (
    "review", "sabaq", "drill", "recitation", "homework", "mazmoon", "tagebuch", "voice_review",
    "shadow", "diktat", "reading_q", "exam_check", "placement",
)  # fmt: skip

# Tags a grader looks for even when the task names none (V4 replaces this with the planner's focus tags).
DEFAULT_TARGET_TAGS = (
    "V2_POSITION", "VERB_FINAL", "AUX_HABEN_SEIN", "PARTIZIP", "CASE_AKK", "CASE_DAT", "PREP_CASE",
    "ADJ_ENDING",
)  # fmt: skip
MAX_CORRECT_USES = 12


def target_tags(pattern_tags: list[str] | tuple[str, ...] = ()) -> list[str]:
    return list(dict.fromkeys([*pattern_tags, *DEFAULT_TARGET_TAGS]))


def record_event(
    db: Session, now: datetime, skill: str, source: str, outcome: str, *, source_ref: str = "",
    pattern_code: str | None = None, tag: str | None = None, severity: int | None = None,
    orig: str = "", fix: str | None = None, meta: dict | None = None,
) -> EvidenceEvent:  # fmt: skip
    assert skill in SKILLS and source in SOURCES and outcome in ("correct", "error")
    ev = EvidenceEvent(
        ts=now, skill=skill, source=source, source_ref=source_ref, pattern_code=pattern_code,
        tag=tag, outcome=outcome, severity=severity, orig=orig, fix=fix, meta_json=meta or {},
    )  # fmt: skip
    db.add(ev)
    return ev


def add_activity(
    db: Session, now: datetime, skill: str, elapsed_ms: int, cap_ms: int = 60_000
) -> None:
    """Active time: an answer that took longer than cap counts as cap (idle not counted).
    Also keeps day_log.minutes, which older screens read."""
    assert skill in SKILLS
    seconds = min(max(elapsed_ms, 0), cap_ms) / 1000
    d = local_date(now)
    row = db.get(ActivityLog, (d, skill))
    if row is None:
        row = ActivityLog(date=d, skill=skill, seconds=0.0)
        db.add(row)
    row.seconds += seconds
    get_day(db, d).minutes += seconds / 60


def mark_other_done(db: Session, now: datetime) -> DayLog:
    """A non-card block that counts towards the study day (Mazmoon, voice review, Diktat 5/5, text read)."""
    from app.services.streak import refresh_study_day

    day = get_day(db, local_date(now))
    day.other_done = True
    refresh_study_day(day)
    return day


def sentence_around(text: str, start: int, end: int) -> str:
    from app.services.ghalti import sentences

    for s, e in sentences(text):
        if s <= start and end <= e:
            return text[s:e]
    return text[start:end]


def record_grade(
    db: Session, now: datetime, grade: dict, *, skill: str, source: str, source_ref: str = "",
    pattern_code: str | None = None, meta: dict | None = None,
) -> None:  # fmt: skip
    """Every error and every correct use of a model-graded text. LanguageTool-only grades are provisional
    and are not written (same rule as the Ghalti Register)."""
    if grade.get("source") == "languagetool_only":
        return
    text = grade["original"]
    for e in grade["errors"]:
        record_event(
            db, now, skill, source, "error", source_ref=source_ref, pattern_code=pattern_code,
            tag=e["tag"], severity=e.get("severity"), orig=sentence_around(text, e["start"], e["end"]),
            fix=e["fix"], meta={**(meta or {}), "span": e["span"], "reason": e.get("reason_en", "")},
        )  # fmt: skip
    for u in grade.get("correct_uses", []):
        record_event(
            db, now, skill, source, "correct", source_ref=source_ref, pattern_code=pattern_code,
            tag=u["tag"], orig=sentence_around(text, u["start"], u["end"]),
            meta={**(meta or {}), "span": u["span"]},
        )  # fmt: skip


def card_skill_tag(card) -> tuple[str, str | None]:
    """fix_sentence cards carry a grammar tag (from the Ghalti item); gender cards are GENDER; the rest is vocab."""
    if card.card_type == "fix_sentence":
        tags = card.item.tags or []
        return "grammar", (tags[0] if tags else None)
    if card.card_type == "gender":
        return "vocab", "GENDER"
    return "vocab", None


def record_card_review(
    db: Session, now: datetime, card, rating: int, block: str, elapsed_ms: int
) -> None:
    """Rating 1 (Again) is an error, 3 and 4 are correct. Rating 2 (Hard: typo or umlaut slip) is neither."""
    skill, tag = card_skill_tag(card)
    add_activity(db, now, skill, elapsed_ms)
    if rating == 2:
        return
    record_event(
        db, now, skill, "sabaq" if block == "sabaq" else "review",
        "error" if rating == 1 else "correct", source_ref=f"card:{card.id}", tag=tag,
        orig=card.item.de, meta={"card_type": card.card_type, "block": block, "rating": rating},
    )  # fmt: skip


_ENDING_POS = {"ADJ": "ADJ_ENDING", "DET": "ADJ_ENDING", "NOUN": "PLURAL"}


def diktat_tag(kind: str, expected: str | None, sentence: str | None = None) -> str:
    """Error tag for one wrong Diktat word. An ending slip is ADJ_ENDING on an adjective or determiner,
    PLURAL on a noun, else OTHER. The part of speech comes from spaCy on the whole expected sentence
    (a lone word is tagged unreliably)."""
    simple = {"umlaut": "UMLAUT", "capital": "CAPITALISATION", "spelling": "SPELLING"}
    if kind in simple:
        return simple[kind]
    if kind == "ending" and expected:
        word = expected.strip(".,;:!?\"'„“()")
        try:
            from app.reading.density import _nlp

            doc = _nlp()(sentence or word)
            tok = next((t for t in doc if t.text == word), None)
            if tok is not None:
                return _ENDING_POS.get(tok.pos_, "OTHER")
        except (ImportError, OSError):  # spaCy model missing: do not guess
            return "OTHER"
    return "OTHER"
