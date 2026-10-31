"""V4 planner: one `daily_plan` row per day, built from the learner model. Deterministic Python.

The local model never decides what Zee studies; it only writes content (texts, tutor lines) inside the
constraints this plan hands over. Order of work: understand (services/learner.py), then decide (here).
Parameters: data/official/planner_method.json. Formulas: docs/v2/metrics.md, section V4.
"""

import logging
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import local_date
from app.models import DailyPlan, Pattern, RecitationProgress
from app.services import daily as daily_svc
from app.services import learner, structure

log = logging.getLogger(__name__)


# --- helpers ------------------------------------------------------------------------------------


def _approved(p: Pattern) -> bool:
    return p.status == "ok"


def _taught(p: Pattern) -> bool:
    return p.done_at is not None or p.known_from_placement


def fixed_next_pattern(db: Session) -> Pattern | None:
    """The next pattern in the fixed order that is approved, not done and not known from placement."""
    return db.scalar(
        select(Pattern)
        .where(
            Pattern.status == "ok",
            Pattern.done_at.is_(None),
            Pattern.known_from_placement.is_(False),
        )
        .order_by(Pattern.order)
        .limit(1)
    )


def _covering(patterns: list[Pattern], tag: str) -> tuple[Pattern | None, Pattern | None]:
    """(taught pattern, untaught pattern) that cover a tag. A pattern whose main tag is `tag` wins."""
    mine = sorted((p for p in patterns if _approved(p) and tag in (p.tags or [])),
                  key=lambda p: ((p.tags or [""])[0] != tag, p.order))  # fmt: skip
    taught = next((p for p in mine if _taught(p)), None)
    untaught = next((p for p in mine if not _taught(p)), None)
    return taught, untaught


def _errors_by_skill(by_skill: dict) -> str:
    parts = sorted(
        ((s, v["errors"]) for s, v in by_skill.items() if v["errors"]),
        key=lambda kv: (-kv[1], kv[0]),
    )
    return ", ".join(f"{s} {n}" for s, n in parts)


def speaking_goal(tag: str) -> str | None:
    return learner.method()["speaking_goals"].get(tag)


# --- build --------------------------------------------------------------------------------------


def _sabaq_unit(db: Session, today: date) -> dict | None:
    from app.models import Item

    lesson = daily_svc.todays_lesson(db, today)
    order = lesson.unit_order if lesson else daily_svc.next_unit_order(db)
    if order is None:
        return None
    first = db.scalar(select(Item).where(Item.unit_order == order).limit(1))
    return {"unit_order": order, "title": first.unit_title, "scenario": first.scenario}


def _diktat_picks(db: Session, focus: list[dict]) -> list[dict]:
    """Taught sentences that contain a focus structure, one per focus tag in turn."""
    from app.listening import diktat

    want = learner.method()["diktat_focus_sentences"]
    if not focus:
        return []
    items = diktat._pool(db)[0]
    picks: list[dict] = []
    used: set[str] = set()
    for _ in range(want):
        for f in focus:
            if len(picks) >= want:
                break
            hit = next(((r, s) for r, s in items if r not in used
                        and (structure.count_uses(f["tag"], s) or 0) > 0), None)  # fmt: skip
            if hit:
                used.add(hit[0])
                picks.append({"ref": hit[0], "de": hit[1], "tag": f["tag"]})
    return picks[:want]


def reading_constraints(db: Session, now: datetime) -> dict | None:
    """Constraints for the Author: the first focus tag as a structure to use at least 3 times. Pure function
    of the learner model, so the nightly job can use it before the day's plan exists."""
    model = learner.tag_model(db, now)
    cands = learner.focus_candidates(model)
    if not cands:
        return None
    return _reading_from(cands[0][0], local_date(now))


def _reading_from(tag: str, today: date) -> dict:
    from app.reading.author import topics_for

    r = learner.method()["reading"]
    return {"topic": topics_for(today)[1], "tag": tag, "label": learner.label(tag),
            "min_uses": r["structure_min_uses"], "density": [r["density_low"], r["density_high"]],
            "checkable": structure.checkable(tag)}  # fmt: skip


def build(db: Session, now: datetime) -> dict:
    """Compute the plan for the day of `now`. Returns {"plan", "data", "why"}; stores nothing."""
    m = learner.method()
    today = local_date(now)
    model = learner.tag_model(db, now)
    states = learner.pattern_states(db, now)
    patterns = list(db.scalars(select(Pattern).order_by(Pattern.order)))
    by_code = {p.code: p for p in patterns}

    # 1. understand: which mistakes repeat, in which skills, and which pattern teaches them
    focus: list[dict] = []
    for tag, s in learner.focus_candidates(model)[: m["focus"]["max_tags"]]:
        taught, untaught = _covering(patterns, tag)
        focus.append({
            "tag": tag, "label": learner.label(tag), "family": s["family"], "rate": round(s["rate"], 3),
            "errors": s["errors"], "correct": s["correct"], "opportunities": s["opportunities"],
            "by_skill": s["by_skill"], "samples": s["samples"],
            "taught_pattern": taught.code if taught else None,
            "untaught_pattern": untaught.code if untaught else None,
        })  # fmt: skip

    # 2. decide
    makeup = daily_svc.is_makeup(db, today)
    review = None
    shaky = [
        (c, st) for c, st in states.items()
        if st["done"] and st["state"] == "shaky" and st["events"] >= m["pattern"]["review_min_events"]
        and not by_code[c].known_from_placement and _approved(by_code[c])
    ]  # fmt: skip
    if shaky:
        c, st = min(shaky, key=lambda x: (x[1]["accuracy"], by_code[x[0]].order))
        review = {"pattern_code": c, "title": by_code[c].title, "accuracy": round(st["accuracy"], 3),
                  "events": st["events"]}  # fmt: skip

    new_unit: dict = {"makeup": makeup, "sabaq": None, "pattern": None}
    if not makeup:
        new_unit["sabaq"] = _sabaq_unit(db, today)
        pulled = next(((f, by_code[f["untaught_pattern"]]) for f in focus
                       if not f["taught_pattern"] and f["untaught_pattern"]), None)  # fmt: skip
        if pulled:
            f, p = pulled
            new_unit["pattern"] = {"code": p.code, "title": p.title, "pulled_forward": True,
                                   "for_tag": f["tag"]}  # fmt: skip
        else:
            p = fixed_next_pattern(db)
            if p:
                new_unit["pattern"] = {"code": p.code, "title": p.title, "pulled_forward": False,
                                       "for_tag": None}  # fmt: skip

    sabqi: list[dict] = []
    if review:
        sabqi.append({"pattern_code": review["pattern_code"], "title": review["title"],
                      "n": m["sabqi_drills"], "reteach": True,
                      "reason": f"fell to shaky: {round(review['accuracy'] * review['events'])} of "
                                f"{review['events']} recent answers right"})  # fmt: skip
    for f in focus:
        code = f["taught_pattern"]
        if code and all(x["pattern_code"] != code for x in sabqi):
            sabqi.append({"pattern_code": code, "title": by_code[code].title, "n": m["sabqi_drills"],
                          "reteach": True, "reason": f"focus: {f['label']}"})  # fmt: skip

    must = []
    if new_unit["pattern"]:
        must.append(
            {
                "kind": "pattern",
                "code": new_unit["pattern"]["code"],
                "label": new_unit["pattern"]["title"],
            }
        )
    if focus:
        must.append({"kind": "tag", "code": focus[0]["tag"], "label": focus[0]["label"]})
    mazmoon = {"must_use": must[:2], "note": "Used by the Mazmoon task when it exists (Phase V3)."}

    reading = _reading_from(focus[0]["tag"], today) if focus else None
    goal_tag = next((f["tag"] for f in focus if speaking_goal(f["tag"])), None)
    speaking = {"tag": goal_tag, "text": speaking_goal(goal_tag)} if goal_tag else None
    diktat = {"picks": _diktat_picks(db, focus), "essay_correction": None}

    # Rote then use (SPEC P3): a day with new chunks or a recitation also gets one use task.
    recited = db.scalar(
        select(RecitationProgress.code).where(RecitationProgress.last_passed == today).limit(1)
    )
    use_task = None
    if new_unit["sabaq"] or recited:
        code = (new_unit["pattern"] or {}).get("code") or (
            focus[0]["taught_pattern"] if focus else None
        )
        what = new_unit["sabaq"]["title"] if new_unit["sabaq"] else f"table {recited}"
        use_task = {"pattern_code": code, "kind": "free_drill",
                    "text": f"Write one new sentence of your own with the forms from {what}."}  # fmt: skip

    # 3. describe, from numbers only
    if focus:
        f0 = focus[0]
        skills = _errors_by_skill(f0["by_skill"])
        why = (
            f"Focus: {f0['label']} ({f0['tag']}). {f0['errors']} errors in {f0['opportunities']} uses "
            f"in {m['focus']['window_days']} days" + (f" ({skills})." if skills else ".")
        )
        if len(focus) > 1:
            f1 = focus[1]
            why += f" Also: {f1['label']}, {f1['errors']} errors in {f1['opportunities']} uses."
        if f0["family"] and len(focus) > 1 and focus[1]["family"] == f0["family"]:
            why += f" Both belong to: {f0['family']}."
    else:
        why = (
            f"No repeated mistake yet: no tag has {m['focus']['min_opportunities']} or more uses "
            f"in {m['focus']['window_days']} days with an error rate above "
            f"{round(m['focus']['min_rate'] * 100)} %. New material follows the fixed order."
        )
    blocks = {
        "sabqi": "; ".join(f"{s['n']} drills on {s['title']}" for s in sabqi) or None,
        "diktat": (f"{len(diktat['picks'])} sentences with {learner.label(diktat['picks'][0]['tag'])}"
                   if diktat["picks"] else None),
        "speaking": (f"Questions that invite {learner.label(goal_tag)}" if goal_tag else None),
        "reading": (f"A text that uses {reading['label']} at least {reading['min_uses']} times"
                    if reading else None),
        "sabaq": (new_unit["pattern"]["title"] + (" (moved up for your mistakes)" if new_unit["pattern"]["pulled_forward"] else "")
                  if new_unit["pattern"] else None),
    }  # fmt: skip

    top = sorted(model.items(), key=lambda kv: (-kv[1]["errors"], kv[0]))[:8]
    data = {
        "window_days": m["focus"]["window_days"],
        "makeup": makeup,
        "rule": f"focus = smoothed error rate above {round(m['focus']['min_rate'] * 100)} % and at least "
        f"{m['focus']['min_opportunities']} uses",
        "tags": [
            {
                "tag": t,
                "errors": s["errors"],
                "correct": s["correct"],
                "opportunities": s["opportunities"],
                "rate": round(s["rate"], 3),
            }
            for t, s in top
        ],
        "shaky_patterns": [
            {"pattern_code": c, "accuracy": round(st["accuracy"], 3), "events": st["events"]}
            for c, st in shaky
        ],
        "weak_words": len(learner.weak_words(db)),
    }
    plan = {"focus": focus, "review_pattern": review, "new_unit": new_unit, "sabqi_drills": sabqi,
            "mazmoon": mazmoon, "reading": reading, "diktat": diktat, "speaking_goal": speaking,
            "use_task": use_task, "blocks": blocks}  # fmt: skip
    return {"plan": plan, "data": data, "why": why}


# --- storage ------------------------------------------------------------------------------------


def get_or_build(db: Session, now: datetime) -> DailyPlan:
    """Today's plan. Created on the first request of the day and never changed afterwards."""
    today = local_date(now)
    row = db.get(DailyPlan, today)
    if row is not None:
        return row
    out = build(db, now)
    row = DailyPlan(
        date=today, created=now, plan_json=out["plan"], data_json=out["data"], why=out["why"]
    )
    try:
        with db.begin_nested():
            db.add(row)
    except IntegrityError:  # another request built it first
        db.expire_all()
        existing = db.get(DailyPlan, today)
        if existing is not None:
            return existing
        raise
    return row


def view(row: DailyPlan) -> dict:
    return {"date": row.date.isoformat(), "why": row.why, **row.plan_json}


def current_pattern(db: Session, now: datetime) -> Pattern | None:
    """The pattern for new teaching today: the plan's (possibly pulled forward), else the fixed order."""
    code = ((get_or_build(db, now).plan_json.get("new_unit") or {}).get("pattern") or {}).get(
        "code"
    )
    if code:
        p = db.scalar(select(Pattern).where(Pattern.code == code))
        if p is not None and p.status == "ok" and p.done_at is None and not p.known_from_placement:
            return p
    return fixed_next_pattern(db)


def diktat_picks_for(db: Session, d: date, now: datetime) -> list[dict]:
    """The plan's Diktat sentences for day `d`. Only today's plan exists or is built."""
    if d == local_date(now):
        return get_or_build(db, now).plan_json.get("diktat", {}).get("picks", [])
    row = db.get(DailyPlan, d)
    return row.plan_json.get("diktat", {}).get("picks", []) if row else []
