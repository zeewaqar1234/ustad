"""Ghalti Register (docs/modules.md §5.7): store mistakes, turn graded errors into fix_sentence cards.

One fix_sentence card per wrong sentence: prompt = Zee's sentence, answer = the sentence with all its
fixes applied. The corrected sentence is generated German, so it must pass LanguageTool; otherwise the
item is needs_review and the card starts only after approval in the check queue.
"""

import re
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import utcnow
from app.models import Card, EvidenceEvent, Item, Mistake
from app.services.grading import lt_notes
from app.srs import scheduler

DECK = "ghalti"
UNIT_ORDER = 1_000_000  # outside the Sabaq order; ghalti items never become a Sabaq unit
_SENTENCE = re.compile(r"[^.!?\n]+[.!?]?")


def sentences(text: str) -> list[tuple[int, int]]:
    """(start, end) of each sentence, trimmed."""
    out = []
    for m in _SENTENCE.finditer(text):
        s, e = m.start(), m.end()
        while s < e and text[s].isspace():
            s += 1
        while e > s and text[e - 1].isspace():
            e -= 1
        if s < e:
            out.append((s, e))
    return out


def record(
    db: Session, now: datetime, source: str, orig: str, fix: str, tag: str, note: str = "",
    card_id: int | None = None,
) -> Mistake:  # fmt: skip
    """Add a mistake, or count a repeat of the same (orig, tag)."""
    m = db.scalar(
        select(Mistake).where(func.lower(Mistake.orig) == orig.lower(), Mistake.tag == tag)
    )
    if m is None:
        m = Mistake(ts=now, last_ts=now, source=source, orig=orig, fix=fix, tag=tag, note=note,
                    card_id=card_id)  # fmt: skip
        db.add(m)
    else:
        m.count += 1
        m.last_ts = now
        m.fix, m.note = fix, note or m.note
        m.card_id = m.card_id or card_id
    db.flush()
    return m


def fix_card(db: Session, now: datetime, wrong: str, right: str, tag: str, reason: str) -> Card:
    item = db.scalar(select(Item).where(Item.deck == DECK, Item.de == right))
    if item is None:
        notes = lt_notes(right)
        if notes is None:
            notes = [{"text": right, "rule": "LT_SKIPPED", "message": "LanguageTool not run."}]
        item = Item(
            deck=DECK, unit=0, unit_order=UNIT_ORDER, unit_title="Ghalti Register", kind="sentence",
            de=right, en=reason, wrong=wrong, pos="phrase", tags=[tag], source="ghalti",
            status="needs_review" if notes else "ok", review_notes=notes,
        )  # fmt: skip
        db.add(item)
        db.flush()
    card = db.scalar(select(Card).where(Card.item_id == item.id, Card.card_type == "fix_sentence"))
    if card is None:
        card = Card(item_id=item.id, card_type="fix_sentence")
        db.add(card)
        db.flush()
    if card.introduced_at is None and item.status == "ok":
        scheduler.introduce(card, now)
    return card


def from_grade(db: Session, now: datetime, grade: dict, source: str) -> list[Mistake]:
    """Every error of a graded text -> Ghalti row; every wrong sentence -> one fix_sentence card."""
    text = grade["original"]
    out: list[Mistake] = []
    for s, e in sentences(text):
        errs = [x for x in grade["errors"] if s <= x["start"] and x["end"] <= e]
        if not errs:
            continue
        wrong = text[s:e]
        right, shift = wrong, -s
        for x in sorted(errs, key=lambda x: x["start"]):
            a, b = x["start"] + shift, x["end"] + shift
            right = right[:a] + x["fix"] + right[b:]
            shift += len(x["fix"]) - (x["end"] - x["start"])
        right = re.sub(r"\s{2,}", " ", right).strip()
        card = None
        if right != wrong:
            card = fix_card(db, now, wrong, right, errs[0]["tag"], errs[0]["reason_en"])
        seen: set[str] = set()
        for x in errs:
            if (
                x["tag"] in seen
            ):  # two errors of one kind in one sentence: one mistake, not a repeat
                continue
            seen.add(x["tag"])
            out.append(
                record(db, now, source, wrong, right, x["tag"], x["reason_en"],
                       card.id if card else None)
            )  # fmt: skip
    return out


RECURRING_DAYS = 30
RECURRING_MIN_ERRORS = 3
RECURRING_MIN_SENTENCES = 2
MIN_EVENTS_FOR_RATE = 5


def tag_stats(db: Session, now: datetime) -> dict[str, dict]:
    """Per tag over the last 30 days, from the evidence ledger (docs/v2/metrics.md, "Ghalti by tag").

    recurring = at least 3 error events from at least 2 different sentences.
    rate = errors / (errors + correct uses), only with at least 5 events; else None ("too few uses")."""
    since = now - timedelta(days=RECURRING_DAYS)
    rows = db.execute(
        select(
            EvidenceEvent.tag,
            EvidenceEvent.outcome,
            func.coalesce(func.nullif(EvidenceEvent.orig, ""), EvidenceEvent.source_ref),
        ).where(EvidenceEvent.tag.is_not(None), EvidenceEvent.ts >= since)
    )
    stats: dict[str, dict] = {}
    for tag, outcome, orig in rows:
        s = stats.setdefault(tag, {"errors": 0, "correct": 0, "sentences": set()})
        if outcome == "error":
            s["errors"] += 1
            s["sentences"].add(orig.strip().lower())
        else:
            s["correct"] += 1
    for s in stats.values():
        n = s["errors"] + s["correct"]
        s["recurring"] = (
            s["errors"] >= RECURRING_MIN_ERRORS
            and len(s.pop("sentences")) >= RECURRING_MIN_SENTENCES
        )
        s.pop("sentences", None)
        s["rate"] = round(s["errors"] / n, 3) if n >= MIN_EVENTS_FOR_RATE else None
    return stats


def register(db: Session, now: datetime | None = None) -> dict:
    now = now or utcnow()
    rows = list(db.scalars(select(Mistake).order_by(Mistake.last_ts.desc())))
    stats = tag_stats(db, now)
    by_tag: dict[str, int] = {}
    for m in rows:
        by_tag[m.tag] = by_tag.get(m.tag, 0) + m.count
    recurring = {t for t, s in stats.items() if s["recurring"]}
    # top 10 are habits (tags), not sentences: most errors in 30 days first
    top = sorted(stats.items(), key=lambda kv: (-kv[1]["errors"], kv[0]))[:10]

    def view(m: Mistake) -> dict:
        return {"id": m.id, "ts": m.ts.isoformat(), "last_ts": m.last_ts.isoformat(),
                "source": m.source, "orig": m.orig, "fix": m.fix, "tag": m.tag, "note": m.note,
                "count": m.count, "card_id": m.card_id, "recurring": m.tag in recurring}  # fmt: skip

    return {
        "total": sum(by_tag.values()),
        "by_tag": sorted(
            (
                {"tag": t, "count": c, "errors_30d": stats.get(t, {}).get("errors", 0),
                 "correct_30d": stats.get(t, {}).get("correct", 0),
                 "rate": stats.get(t, {}).get("rate"), "recurring": t in recurring}
                for t, c in by_tag.items()
            ),
            key=lambda r: -r["count"],
        ),
        "top_tags": [{"tag": t, **{k: v for k, v in s.items()}} for t, s in top if s["errors"]],
        "top10": [view(m) for m in sorted(rows, key=lambda m: (-m.count, -m.last_ts.timestamp()))[:10]],
        "rows": [view(m) for m in rows],
    }  # fmt: skip
