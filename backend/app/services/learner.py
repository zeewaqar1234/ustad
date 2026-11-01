"""V4 learner model: what the evidence ledger says Zee gets wrong, per tag, per pattern, per word.

Pure functions over `evidence_event` (and `card.lapses`). Nothing here calls a model and nothing decides
what Zee studies; `services/planner.py` reads these numbers. Parameters: data/official/planner_method.json.
Formulas: docs/v2/metrics.md, section V4.
"""

import json
from datetime import datetime, timedelta
from functools import cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Card, EvidenceEvent, Item, Pattern


@cache
def method() -> dict:
    return json.loads((settings.official_dir / "planner_method.json").read_text())


def weight(now: datetime, ts: datetime) -> float:
    """Recency weight 0.5 ^ (age in days / half-life). Future timestamps count as age 0."""
    age = max((now - ts).total_seconds() / 86_400, 0)
    return 0.5 ** (age / method()["half_life_days"])


def family_of(tag: str) -> str | None:
    for name, tags in method()["families"].items():
        if tag in tags:
            return name
    return None


def label(tag: str) -> str:
    return method()["labels"].get(tag, tag)


def tag_model(db: Session, now: datetime) -> dict[str, dict]:
    """Per tag over the focus window (30 days).

    errors, correct: raw counts. opportunities = errors + correct. w_errors, w_correct: recency-weighted.
    rate = (w_errors + prior errors) / (w_errors + w_correct + prior errors + prior correct).
    by_skill: {skill: {errors, correct}}. samples: the most recent error sentences with their fix."""
    m = method()
    since = now - timedelta(days=m["focus"]["window_days"])
    rows = db.scalars(
        select(EvidenceEvent)
        .where(EvidenceEvent.tag.is_not(None), EvidenceEvent.ts >= since)
        .order_by(EvidenceEvent.ts.desc(), EvidenceEvent.id.desc())
    )
    out: dict[str, dict] = {}
    for e in rows:
        s = out.setdefault(
            e.tag,
            {"errors": 0, "correct": 0, "w_errors": 0.0, "w_correct": 0.0, "by_skill": {},
             "samples": [], "last_error": None},
        )  # fmt: skip
        w = weight(now, e.ts)
        bs = s["by_skill"].setdefault(e.skill, {"errors": 0, "correct": 0})
        if e.outcome == "error":
            s["errors"] += 1
            s["w_errors"] += w
            bs["errors"] += 1
            s["last_error"] = s["last_error"] or e.ts
            if len(s["samples"]) < m["samples_per_tag"] and e.orig and e.fix:
                s["samples"].append({"skill": e.skill, "orig": e.orig, "fix": e.fix})
        else:
            s["correct"] += 1
            s["w_correct"] += w
            bs["correct"] += 1
    prior = m["prior"]
    for tag, s in out.items():
        s["opportunities"] = s["errors"] + s["correct"]
        den = s["w_errors"] + s["w_correct"] + prior["errors"] + prior["correct"]
        s["rate"] = (s["w_errors"] + prior["errors"]) / den
        s["skills"] = sorted(k for k, v in s["by_skill"].items() if v["errors"] or v["correct"])
        s["family"] = family_of(tag)
    return out


def focus_candidates(model: dict[str, dict]) -> list[tuple[str, dict]]:
    """Tags with a smoothed rate above the threshold and enough opportunities, highest rate first.
    Ties go to the tag seen in more skills, then alphabetical."""
    f, skip = method()["focus"], set(method()["ignore_tags"])
    ok = [
        (t, s) for t, s in model.items()
        if t not in skip and s["opportunities"] >= f["min_opportunities"] and s["rate"] > f["min_rate"]
    ]  # fmt: skip
    return sorted(ok, key=lambda kv: (-round(kv[1]["rate"], 6), -len(kv[1]["skills"]), kv[0]))


def pattern_state(accuracy: float | None, last_seen: datetime | None, now: datetime) -> str:
    """new (no events) / shaky (< 60 %) / solid (> 85 % and last seen more than 14 days ago) / ok."""
    p = method()["pattern"]
    if accuracy is None:
        return "new"
    if accuracy < p["shaky_below"]:
        return "shaky"
    if (
        accuracy > p["solid_above"]
        and last_seen
        and (now - last_seen).days > p["solid_unseen_days"]
    ):
        return "solid"
    return "ok"


def pattern_states(db: Session, now: datetime) -> dict[str, dict]:
    """Per pattern: accuracy over its last 20 events. Events with its pattern_code always count; events that only
    share one of its tags count once the pattern is taught (done or known from placement): a mistake in a
    structure you have not been taught yet is not a mark against that lesson. One rule for Today and Progress."""
    n = method()["pattern"]["last_events"]
    out: dict[str, dict] = {}
    for p in db.scalars(select(Pattern).order_by(Pattern.order)):
        taught = p.done_at is not None or p.known_from_placement
        cond = EvidenceEvent.pattern_code == p.code
        if taught and p.tags:
            cond = cond | EvidenceEvent.tag.in_(p.tags)
        q = select(EvidenceEvent).where(cond)
        evs = list(
            db.scalars(q.order_by(EvidenceEvent.ts.desc(), EvidenceEvent.id.desc()).limit(n))
        )
        acc = sum(e.outcome == "correct" for e in evs) / len(evs) if evs else None
        last = evs[0].ts if evs else None
        out[p.code] = {"events": len(evs), "accuracy": acc, "last_seen": last,
                       "state": pattern_state(acc, last, now),
                       "done": p.done_at is not None or p.known_from_placement}  # fmt: skip
    return out


def weak_words(db: Session) -> list[dict]:
    """Cards with at least 2 lapses. Reader look-ups are not recorded anywhere yet, so they are not counted."""
    need = method()["weak_word_lapses"]
    rows = db.execute(
        select(Item.de, Card.lapses).join(Card, Card.item_id == Item.id)
        .where(Card.lapses >= need).order_by(Card.lapses.desc(), Item.de)
    )  # fmt: skip
    return [{"de": de, "lapses": n} for de, n in rows]
