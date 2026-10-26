"""V1: convert old rows into evidence_event. Every converted row carries meta_json.backfilled = true and a
`backfill_key`, so running it twice adds nothing. Minutes already in day_log stay unsplit: activity_log
starts at the migration date."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Attempt,
    Card,
    EvidenceEvent,
    Mistake,
    Pattern,
    ReadingText,
    ReviewLog,
    VoiceSession,
    VoiceTurn,
)
from app.services import drills

WRITING_SOURCES = {"homework": "homework", "tagebuch": "tagebuch", "placement": "placement"}


def _existing_keys(db: Session) -> set[str]:
    keys = set()
    for (meta,) in db.execute(select(EvidenceEvent.meta_json)):
        if meta and meta.get("backfill_key"):
            keys.add(meta["backfill_key"])
    return keys


def _drill_tag(db: Session, code: str, drill_id: str) -> str | None:
    p = db.scalar(select(Pattern).where(Pattern.code == code))
    try:
        return drills.expected(p, drill_id).tag if p is not None else None
    except (KeyError, IndexError, ValueError):
        return None


def run(db: Session) -> int:
    seen = _existing_keys(db)
    # Rows written after V1 went live already have live events: only convert older rows.
    live = [
        ts for ts, meta in db.execute(select(EvidenceEvent.ts, EvidenceEvent.meta_json))
        if not (meta or {}).get("backfilled")
    ]  # fmt: skip
    cutoff = min(live) if live else None
    added = 0

    def add(key: str, ts, skill, source, outcome, **kw) -> None:
        nonlocal added
        if key in seen or (cutoff is not None and ts is not None and ts >= cutoff):
            return
        seen.add(key)
        meta = {**kw.pop("meta", {}), "backfilled": True, "backfill_key": key}
        db.add(
            EvidenceEvent(ts=ts, skill=skill, source=source, outcome=outcome, meta_json=meta, **kw)
        )
        added += 1

    # Ghalti rows from graded texts (drill and voice rows come from attempts and voice reviews below)
    for m in db.scalars(select(Mistake).where(Mistake.source.in_(list(WRITING_SOURCES)))):
        add(f"mistake:{m.id}", m.ts, "writing", WRITING_SOURCES[m.source], "error",
            source_ref=f"mistake:{m.id}", tag=m.tag, orig=m.orig, fix=m.fix,
            meta={"count": m.count})  # fmt: skip

    for a in db.scalars(select(Attempt).order_by(Attempt.id)):
        ref, _, rest = a.task_ref.partition(":")
        key = f"attempt:{a.id}"
        if ref == "drill":
            if not (a.input or "").strip(" /"):
                continue  # "I don't know" is not evidence either way
            code = rest.split(":")[0]
            tag = (a.error_tags or [None])[0] or _drill_tag(db, code, rest)
            if tag is None:
                continue  # cannot tell which structure a correct old drill practised
            add(key, a.ts, "grammar", "drill", "correct" if a.correct else "error",
                source_ref=rest, pattern_code=code, tag=tag)  # fmt: skip
        elif ref == "diktat":
            if a.correct:
                add(key, a.ts, "listening", "diktat", "correct", source_ref=rest)
            for i, tag in enumerate(a.error_tags or []):
                add(f"{key}:{i}", a.ts, "listening", "diktat", "error", source_ref=rest, tag=tag,
                    meta={"coarse_tag": True})  # fmt: skip
        elif ref in ("recitation", "recitation_voice"):
            add(key, a.ts, "grammar", "recitation", "correct" if a.correct else "error",
                source_ref=rest, meta={"mode": "voice" if ref.endswith("voice") else "typed"})  # fmt: skip
        elif ref in ("shadow", "shadow_better"):
            pct = a.score or 0
            add(key, a.ts, "speaking", "shadow", "correct" if pct >= 90 else "error",
                source_ref=rest, meta={"kind": "recognition", "pct": pct})  # fmt: skip

    for t in db.scalars(select(ReadingText).where(ReadingText.result_json.is_not(None))):
        for r in (t.result_json or {}).get("results", []):
            add(f"text:{t.id}:{r['id']}", t.read_at or t.created,
                "reading", "reading_q", "correct" if r["correct"] else "error",
                source_ref=f"text:{t.id}:{r['id']}")  # fmt: skip

    q = (
        select(ReviewLog, Card)
        .join(Card, Card.id == ReviewLog.card_id)
        .where(Card.card_type == "fix_sentence", ReviewLog.rating != 2)
    )  # fmt: skip
    for log, card in db.execute(q):
        tags = card.item.tags or []
        add(f"review:{log.id}", log.ts, "grammar", "review", "error" if log.rating == 1 else "correct",
            source_ref=f"card:{card.id}", tag=tags[0] if tags else None, orig=card.item.de)  # fmt: skip

    # voice reviews: the input mode of each line decides speaking or writing
    for s in db.scalars(select(VoiceSession).where(VoiceSession.review_json.is_not(None))):
        if s.status != "reviewed":
            continue
        modes = {
            t.idx: t.input_mode
            for t in db.scalars(select(VoiceTurn).where(VoiceTurn.session_id == s.id))
        }
        for ln in (s.review_json or {}).get("lines", []):
            if not ln.get("graded"):
                continue
            skill = "speaking" if modes.get(ln["turn"]) == "voice" else "writing"
            errs = ln.get("errors") or []
            if not errs:
                add(f"voice:{s.id}:{ln['turn']}", s.ended or s.started, skill, "voice_review", "correct",
                    source_ref=f"voice:{s.id}:{ln['turn']}", orig=ln["said"])  # fmt: skip
            for i, e in enumerate(errs):
                add(f"voice:{s.id}:{ln['turn']}:{i}", s.ended or s.started, skill, "voice_review",
                    "error", source_ref=f"voice:{s.id}:{ln['turn']}", tag=e["tag"],
                    severity=e.get("severity"), orig=ln["said"], fix=e["fix"])  # fmt: skip
    db.flush()
    return added
