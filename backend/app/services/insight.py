"""Plain-English analysis of the readiness numbers. The model only words facts the app computed: every number
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
    return {
        "placement_label": r["level"]["label"],
        "goal": {
            "exam": r["target"]["exam"],
            "target_date": r["goals"]["target_date"],
            "line_pct": _pct(r["target"]["share"]),
            "days_left": ms["days_left"],
        },
        "overall": {
            "measured_skills": r["overall"]["measured"],
            "of": r["overall"]["of"],
            "readiness_pct": _pct(r["overall"]["mean"]),
            "confidence_pct": r["overall"]["confidence_pct"],
        },
        "skills": [
            {
                "skill": s["label"],
                "measured": s["measured"],
                "readiness_pct": _pct(s["mean"]),
                "range_pct": [_pct(s["lo"]), _pct(s["hi"])] if s["measured"] else None,
                "confidence_pct": s["confidence_pct"],
                "events": s["n"],
                "status": s["status_word"],
                "proxy": bool(s["proxy"]),
                "how_to_measure": s["measure"],
                "forecast": s["forecast"]["text"] if s["forecast"] else None,
            }
            for s in r["skills"]
        ],
        "pace_hours_per_week": round(r["pace"]["hours_per_week"], 1)
        if r["pace"]["measured"]
        else None,
        "milestone": {
            "state": ms.get("state"),
            "forecast_date": ms["forecast_date"],
            "hours_needed": round(ms["hours_needed"], 1) if "hours_needed" in ms else None,
            "needed_per_week": round(ms["needed_per_week"], 1)
            if ms["needed_per_week"] is not None
            else None,
        },
        "error_tags_30_days": [
            {"tag": t, "errors": s["errors"], "recurring": s["recurring"]} for t, s in tags
        ],
        "practice_test_check": r["calibration"].get("mean_abs_error_pts"),
    }


def _numbers(obj) -> set[str]:
    return {m.replace(",", ".") for m in _NUM.findall(json.dumps(obj, ensure_ascii=False))}


def numbers_ok(out: Insight, f: dict) -> bool:
    allowed = _numbers(f)
    # a number the facts hold as 74.0 may be written 74; as 3 hours may be written 3.0
    allowed |= {n.rstrip("0").rstrip(".") for n in allowed if "." in n}
    text = " ".join([out.summary, *out.strengths, *out.weaknesses, *out.next_steps])
    return all(n.replace(",", ".") in allowed for n in _NUM.findall(text))


def template(f: dict) -> Insight:
    """No model: the same facts in fixed sentences."""
    ov = f["overall"]
    measured = [s for s in f["skills"] if s["measured"]]
    if not measured:
        return Insight(
            summary="No skill has evidence yet, so the app shows no level. Take the placement test "
            "and do the daily tasks; every answer narrows the range.",
            strengths=[],
            weaknesses=[],
            next_steps=[f"{s['skill']}: nothing recorded yet." for s in f["skills"]][: _k()],
        )
    summary = (
        f"{ov['measured_skills']} of {ov['of']} skills have evidence. Overall readiness is "
        f"{ov['readiness_pct']}% against a {f['goal']['line_pct']}% line, with {ov['confidence_pct']}% confidence."
    )
    best = sorted(measured, key=lambda s: -s["readiness_pct"])[: _k()]
    worst = sorted(measured, key=lambda s: s["readiness_pct"])[: _k()]
    missing = [s for s in f["skills"] if not s["measured"]]
    steps = []
    for s in worst[:2]:
        if s["status"].startswith("At or above"):
            steps.append(
                f"{s['skill']}: at the line, more answers narrow the {s['range_pct'][0]}% to {s['range_pct'][1]}% range."
            )
        else:
            steps.append(f"{s['skill']}: {s['status'].lower()}. {s['how_to_measure']}")
    steps += [f"{s['skill']}: no evidence yet. {s['how_to_measure']}" for s in missing[:1]]
    return Insight(
        summary=summary,
        strengths=[
            f"{s['skill']}: {s['readiness_pct']}% from {s['events']} events."
            for s in best
            if s["status"].startswith("At or above")
        ][: _k()],
        weaknesses=[
            f"{s['skill']}: {s['readiness_pct']}%, {s['status'].lower()}."
            for s in worst
            if not s["status"].startswith("At or above")
        ][: _k()],
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
