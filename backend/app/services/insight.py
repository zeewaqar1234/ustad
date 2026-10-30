"""Plain-English analysis of the level and practice numbers. The model only words facts the app computed: every number
it writes must appear in the facts, otherwise the answer is dropped and a fixed template is shown instead."""

import hashlib
import json
import logging
import re
from datetime import datetime

from sqlalchemy.orm import Session

from app.llm import prompt
from app.llm.provider import LLMInvalid, LLMUnavailable, Provider, complete_json
from app.llm.schemas import Insight
from app.models import Profile
from app.services import ghalti
from app.services import readiness as rd
from app.services import standing as st

log = logging.getLogger(__name__)
_NUM = re.compile(r"\d+(?:[.,]\d+)?")


def _k() -> int:
    return rd.rm()["insight"]["max_items"]


def _pct(x: float | None) -> int | None:
    return None if x is None else st.half_up(x * st.method()["percent"])


def facts(db: Session, now: datetime) -> dict:
    r = rd.readiness(db, now)
    tags = sorted(ghalti.tag_stats(db, now).items(), key=lambda kv: (-kv[1]["errors"], kv[0]))[
        : rd.rm()["insight"]["max_items"]
    ]
    ms = r["milestone"]
    pr = r["practice"]
    return {
        "placement_label": r["level"]["label"],
        "working_on_band": r["level"]["working_on"],
        "goal": {
            "exam": r["target"]["exam"],
            "target_date": r["goals"]["target_date"],
            "days_left": ms["days_left"],
        },
        "line_pct": _pct(r["line"]["share"]),
        "practice": {
            "measured_skills": pr["measured"],
            "of": pr["of"],
            "practised_skills": pr["practised"],
            "skills_at_line": pr["at_line"],
            "right_pct": _pct(pr["mean"]),
            "plus_minus_pts": pr["pm_pts"],
            "answers": pr["n"],
        },
        "skills": [
            {
                "skill": s["label"],
                "measured": s["measured"],
                "right_pct": _pct(s["mean"]),
                "plus_minus_pts": s["pm_pts"],
                "answers": s["n"],
                "trend_pts_28_days": s["trend_pts"],
                "status": s["status_word"],
                "at_line": s["status"] == "at_or_above",
                "proxy": bool(s["proxy"]),
                "how_to_measure": s["measure"],
            }
            for s in r["skills"]
        ],
        "hours_since_placement": round(r["hours_since_placement"], 1)
        if r["hours_since_placement"] is not None
        else None,
        "pace_hours_per_week": round(r["pace"]["hours_per_week"], 1)
        if r["pace"]["measured"]
        else None,
        "milestone": {
            "state": ms.get("state"),
            "forecast_date": ms["forecast_date"],
            "hours_needed": round(ms["hours_needed"], 1)
            if ms["hours_needed"] is not None
            else None,
            "needed_per_week": round(ms["needed_per_week"], 1)
            if ms["needed_per_week"] is not None
            else None,
        },
        "error_tags_30_days": [
            {"tag": t, "errors": s["errors"], "recurring": s["recurring"]} for t, s in tags
        ],
    }


def _numbers(obj) -> set[str]:
    return {m.replace(",", ".") for m in _NUM.findall(json.dumps(obj, ensure_ascii=False))}


_LEVEL = re.compile(r"\b[ABC][12](?:\.\d)?\b")


def _numbers_of(obj) -> set[str]:
    nums = _numbers(obj)
    return nums | {n.rstrip("0").rstrip(".") for n in nums if "." in n}  # 74.0 may be written 74


def numbers_ok(out: Insight, f: dict) -> bool:
    """Every number must come from the facts, a number about a skill must belong to a skill named in the same
    sentence, a level label may only be the placement label or the goal exam, and each item stays short."""
    cap = rd.rm()["insight"]["max_chars"]
    items = [out.summary, *out.strengths, *out.weaknesses, *out.next_steps]
    if (
        any(len(t) > cap for t in [*out.strengths, *out.weaknesses, *out.next_steps])
        or len(out.summary) > cap * 2
    ):
        return False
    labels = [f["placement_label"], f["working_on_band"], f["goal"]["exam"].rsplit(" ", 1)[-1]]
    # quoting a label as given is fine ("A2+", "B1 Board"), and the app's lessons are "B1 work"
    allowed_levels = {"B1", *(x for lb in labels if lb for x in [lb, *_LEVEL.findall(lb)])}
    general = _numbers_of({k: v for k, v in f.items() if k != "skills"})
    by_skill = {s["skill"]: _numbers_of(s) for s in f["skills"]}
    everything = general.union(*by_skill.values())
    for text in items:
        if any(lv not in allowed_levels for lv in _LEVEL.findall(text)):
            return False
        for sentence in re.split(r"(?<=[.!?])\s+", text):
            nums = {n.replace(",", ".") for n in _NUM.findall(_LEVEL.sub("", sentence))}
            named = [name for name in by_skill if name.lower() in sentence.lower()]
            allowed = general.union(*(by_skill[n] for n in named)) if named else everything
            if not nums <= allowed:
                return False
    return True


def template(f: dict) -> Insight:
    """No model: the same facts in fixed sentences."""
    pr = f["practice"]
    measured = [s for s in f["skills"] if s["measured"]]
    if not measured:
        return Insight(
            summary="No skill has answers yet, so there is nothing to analyse. Take the placement test "
            "and do the daily tasks; every answer narrows the range.",
            strengths=[],
            weaknesses=[],
            next_steps=[f"{s['skill']}: {s['how_to_measure']}" for s in f["skills"]][: _k()],
        )
    summary = (
        f"On B1 work you get {pr['right_pct']}% right, give or take {pr['plus_minus_pts']} points, "
        f"from {pr['answers']} practice answers. {pr['skills_at_line']} of {pr['practised_skills']} practised skills "
        f"are at {f['line_pct']}% or more."
        if pr["right_pct"] is not None
        else "Only the placement test has answers so far. Practice in the modules adds the first practice figures."
    )
    at = [s for s in measured if s["at_line"]]  # by the range, the same rule as skills_at_line
    under = [s for s in measured if not s["at_line"]]
    best = sorted(at, key=lambda s: -s["right_pct"])[: _k()]
    worst = sorted(under, key=lambda s: s["right_pct"])[: _k()]
    missing = [s for s in f["skills"] if not s["measured"]]
    steps = [f"{s['skill']}: {s['how_to_measure']}" for s in worst[:2]]
    steps += [f"{s['skill']}: no answers yet. {s['how_to_measure']}" for s in missing[:1]]
    return Insight(
        summary=summary,
        strengths=[
            f"{s['skill']}: {s['right_pct']}% right from {s['answers']} answers." for s in best
        ],
        weaknesses=[
            f"{s['skill']}: {s['right_pct']}% right from {s['answers']} answers." for s in worst
        ],
        next_steps=steps[: _k()],
    )


def get_insight(db: Session, provider: Provider, now: datetime, force: bool = False) -> dict:
    f = facts(db, now)
    key = hashlib.sha256(json.dumps(f, sort_keys=True, default=str).encode()).hexdigest()
    p = db.get(Profile, 1)
    cached = (p.settings_json or {}).get("insight") if p else None
    if cached and cached.get("key") == key and not force:
        return {**cached, "cached": True}
    source = "model"
    try:
        out = complete_json(
            db,
            provider,
            "analyst",
            prompt("insight"),
            json.dumps(f, ensure_ascii=False, default=str),
            Insight,
        )
        if not numbers_ok(out, f):
            log.warning("Insight dropped: it used a number that is not in the facts")
            out, source = template(f), "template"
    except (LLMUnavailable, LLMInvalid) as e:
        log.warning("Insight model unavailable: %s", e)
        out, source = template(f), "template"
    res = {
        "key": key,
        "source": source,
        "generated": now.isoformat(),
        **out.model_dump(),
        "facts": f,
    }
    if p is not None:
        p.settings_json = {**(p.settings_json or {}), "insight": res}
    db.commit()
    return {**res, "cached": False}
