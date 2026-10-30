"""Internal readiness estimate: what Zee's own work in the app says about each skill.

Every number is computed from his rows with the formulas in docs/v2/metrics.md ("Readiness"), using the
parameters in data/official/readiness_method.json. A skill with no evidence is "No evidence yet", never a
default number. The model is Bayesian: success and failure counts (older evidence discounted) update a
uniform Beta prior, so a few events give a wide range and more practice narrows it. The confidence figure is
100 minus the width of the 95 % range, nothing more. Where Zee enters real practice tests, the estimate is
checked against them (calibration). No model call is made here: this decides numbers, never an LLM.
"""

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import local_date
from app.models import EvidenceEvent, ExamResult, PlacementResult, Profile
from app.services import standing as st

NO_EVIDENCE = "No evidence yet"


def rm() -> dict:
    return st._load("readiness_method.json")


@dataclass(frozen=True)
class Ev:
    day: date
    skill: str
    source: str
    ok: bool
    band: str | None
    ref: str = ""


def load_events(db: Session) -> list[Ev]:
    out = []
    sentences: dict[tuple[str, date], Ev] = {}
    for e in db.scalars(select(EvidenceEvent)):
        ev = Ev(
            local_date(e.ts),
            e.skill,
            e.source,
            e.outcome == "correct",
            (e.meta_json or {}).get("band"),
            e.source_ref,
        )
        if e.source == "diktat":
            # one answer per sentence: every wrong word is its own event, so collapse them (right only if no word was wrong)
            key = (e.source_ref, ev.day)
            prev = sentences.get(key)
            sentences[key] = (
                ev
                if prev is None
                else Ev(ev.day, ev.skill, ev.source, prev.ok and ev.ok, None, ev.ref)
            )
        else:
            out.append(ev)
    return out + list(sentences.values())


def target_share(level: str) -> float:
    return st.exam(level)["pass_points"] / st.exam(level)["module_max_points"]


def posterior(succ: float, fail: float) -> dict:
    m = rm()
    a, b = m["prior"]["alpha"] + succ, m["prior"]["beta"] + fail
    mean = a / (a + b)
    sd = math.sqrt(a * b / ((a + b) ** 2 * (a + b + 1)))
    lo, hi = max(0.0, mean - m["ci_z"] * sd), min(1.0, mean + m["ci_z"] * sd)
    return {"mean": mean, "lo": lo, "hi": hi, "confidence_pct": half_up_pct(1 - (hi - lo))}


def half_up_pct(x: float) -> int:
    return st.half_up(x * method_percent())


def method_percent() -> int:
    return st.method()["percent"]


def _counts(events: list[Ev], skill: str, today: date) -> tuple[float, float, float, int]:
    """Weighted successes, failures, effective events and raw event count for one skill."""
    stream = rm()["streams"][skill]
    hl = rm()["half_life_days"]
    s = f = n_eff = 0.0
    n = 0
    for e in events:
        w_src = stream["sources"].get(e.source)
        if e.skill != skill or w_src is None or e.day > today:
            continue
        if e.band is not None and e.band not in stream.get("placement_bands", [e.band]):
            continue  # placement items below B1 (A2) say nothing about B1 readiness
        w = w_src / 2 ** (max((today - e.day).days, 0) / hl)
        s += w * e.ok
        f += w * (not e.ok)
        n_eff += w
        n += 1
    return s, f, n_eff, n


def skill_at(events: list[Ev], skill: str, today: date) -> dict | None:
    s, f, n_eff, n = _counts(events, skill, today)
    if n < rm()["min_events_shown"]:
        return None
    return {**posterior(s, f), "n": n, "n_eff": n_eff}


def status_of(lo: float, hi: float, target: float) -> str:
    if lo >= target:
        return "at_or_above"
    return "near" if hi >= target else "below"


def status_words(target: float) -> dict[str, str]:
    t = st.half_up(target * method_percent())
    return {
        "at_or_above": f"At or above the {t}% line",
        "near": f"Near the {t}% line",
        "below": f"Below the {t}% line",
        "none": NO_EVIDENCE,
    }


def snapshots(events: list[Ev], skill: str, today: date) -> list[dict]:
    """Readiness as it stood at the end of each of the last weeks, from events up to that day only."""
    m = rm()
    out = []
    for i in range(m["snapshot_weeks"] - 1, -1, -1):
        d = today - timedelta(days=i * st.method()["week_days"])
        r = skill_at(events, skill, d)
        if r and r["n_eff"] >= m["snapshot_min_n_eff"]:
            out.append(
                {
                    "date": d.isoformat(),
                    "mean": r["mean"],
                    "lo": r["lo"],
                    "hi": r["hi"],
                    "n": r["n"],
                }
            )
    return out


def skill_forecast(
    snaps: list[dict], skill: str, act, today: date, target: float, cur: dict
) -> dict:
    """Date at which the trend of this skill's readiness against its own practice hours reaches the target."""
    mt = st.method()
    label = rm()["labels"][skill]
    if cur["lo"] >= target:
        return {"state": "reached", "hours_needed": 0.0, "text": "At or above the line now."}
    if len(snaps) < mt["forecast_min_items"]:
        more = mt["forecast_min_items"] - len(snaps)
        return {
            "state": "need_more",
            "text": f"Forecast needs {more} more weekly {label} snapshots with enough evidence.",
        }
    dates = [date.fromisoformat(s["date"]) for s in snaps]
    span = (dates[-1] - dates[0]).days
    if span < mt["forecast_min_span_days"]:
        return {
            "state": "need_span",
            "text": f"Forecast needs {label} evidence over at least {mt['forecast_min_span_days']} days; so far {span}.",
        }
    first = min([dates[0], *act]) if act else dates[0]
    skills = (rm()["activity_skill"][skill],)
    xs = [st.hours_in(act, skills, first, d) for d in dates]
    fit = st._fit(xs, [s["mean"] for s in snaps])
    if fit is None or fit[1] <= 0 or fit[2] < mt["forecast_min_r2"]:
        return {"state": "no_trend", "text": "No reliable trend yet."}
    a, slope, r2 = fit
    fitted_now = a + slope * st.hours_in(act, skills, first, today)
    start = today - timedelta(days=mt["pace_window_days"] - 1)
    weekly = st.hours_in(act, skills, start, today) / (mt["pace_window_days"] / mt["week_days"])
    base = {"slope_per_hour": slope, "r2": r2, "weekly_hours": weekly}
    if fitted_now >= target:
        return {
            **base,
            "state": "reached",
            "hours_needed": 0.0,
            "text": "The trend is at the line now.",
        }
    needed = (target - fitted_now) / slope
    if weekly <= 0:
        return {
            **base,
            "state": "no_pace",
            "hours_needed": needed,
            "text": f"No {label} practice in the last {mt['pace_window_days']} days, so no date.",
        }
    days = needed / weekly * mt["week_days"]
    if days > mt["forecast_max_months"] * mt["days_per_month"]:
        return {
            **base,
            "state": "far",
            "hours_needed": needed,
            "text": "More than a year at this pace.",
        }
    when = today + timedelta(days=math.ceil(days))
    return {
        **base,
        "state": "date",
        "hours_needed": needed,
        "date": when.isoformat(),
        "text": f"About {when.strftime('%b %Y')} at this pace.",
    }


def vocab_census(db: Session) -> dict | None:
    w = st.wordlist_coverage(db)
    if not w["measured"]:
        return None
    mean = w["mature"] / w["list_lemmas"]
    return {
        "mean": mean,
        "lo": mean,
        "hi": mean,
        "confidence_pct": 0,
        "n": w["mature"],
        "n_eff": float(w["mature"]),
        "census": True,
        "list_lemmas": w["list_lemmas"],
    }


def calibration(db: Session, events: list[Ev], level: str) -> dict:
    """Estimate against Zee's own practice tests: for Lesen and Hören points are the share of correct items,
    so they are directly comparable to the reading and listening readiness on the test day."""
    pairs = {"lesen": "reading", "hoeren": "listening"}
    rows = []
    skipped = 0
    for r in db.scalars(
        select(ExamResult).where(ExamResult.level == level, ExamResult.voided.is_(False))
    ):
        skill = pairs.get(r.module)
        if skill is None:
            continue
        est = skill_at(
            [e for e in events if e.day < r.taken], skill, r.taken
        )  # evidence before the test only
        if est is None or est["n_eff"] < rm()["snapshot_min_n_eff"]:
            skipped += 1  # too little evidence before that test to say anything
            continue
        actual = r.points / r.points_max
        rows.append(
            {
                "date": r.taken.isoformat(),
                "module": r.module,
                "kind": r.kind,
                "estimate_pts": est["mean"] * st.exam(level)["module_max_points"],
                "actual_pts": actual * st.exam(level)["module_max_points"],
            }
        )
    if not rows and skipped:
        return {"n": 0, "skipped": skipped,
                "note": f"{skipped} practice tests had too little recorded practice before them to compare with."}  # fmt: skip
    if not rows:
        return {
            "n": 0,
            "note": "No practice test entered yet, so the estimate has not been checked against anything. "
            "Enter an official practice test for Lesen or Hören in Settings.",
        }
    errs = [abs(r["estimate_pts"] - r["actual_pts"]) for r in rows]
    return {
        "n": len(rows),
        "skipped": skipped,
        "mean_abs_error_pts": sum(errs) / len(errs),
        "rows": rows,
    }


def level_info(db: Session) -> dict:
    p = db.get(Profile, 1)
    pr = db.scalars(select(PlacementResult).order_by(PlacementResult.ts.desc())).first()
    return {
        "label": p.level_band if p else None,
        "taken": local_date(pr.ts).isoformat() if pr else None,
        "note": "From the app's own placement test (grammar, vocabulary and a writing sample). "
        "Not an official CEFR result.",
    }


def readiness(db: Session, now: datetime) -> dict:
    today = local_date(now)
    goals = st.get_goals(db)
    level = goals["target_exam"]
    target = target_share(level)
    words = status_words(target)
    events = load_events(db)
    act = st.activity_by_day(db)
    mt = st.method()
    start28 = today - timedelta(days=mt["pace_window_days"] - 1)
    weeks = mt["pace_window_days"] / mt["week_days"]
    skills = []
    for sk in rm()["skills"]:
        cfg = rm()["streams"][sk]
        cur = vocab_census(db) if sk == "vocab" else None
        snaps = [] if cur else snapshots(events, sk, today)
        cur = cur or skill_at(events, sk, today)
        hours = st.hours_in(act, (rm()["activity_skill"][sk],), start28, today)
        row = {
            "skill": sk,
            "label": rm()["labels"][sk],
            "proxy": cfg.get("proxy"),
            "measure": cfg["measure"],
            "pace_per_week": hours / weeks,
            "hours_28": hours,
        }
        if cur is None:
            skills.append(
                {
                    **row,
                    "measured": False,
                    "status": "none",
                    "status_word": NO_EVIDENCE,
                    "mean": None,
                    "lo": None,
                    "hi": None,
                    "confidence_pct": 0,
                    "n": 0,
                    "history": [],
                    "forecast": None,
                }
            )
            continue
        census = bool(cur.get("census"))
        # a word count has no official pass equivalent: it is shown, never compared with the line
        status = "indicator" if census else status_of(cur["lo"], cur["hi"], target)
        status_word = (
            f"{cur['n']} of {cur['list_lemmas']} list words mature" if census else words[status]
        )
        fc = None if census else skill_forecast(snaps, sk, act, today, target, cur)
        skills.append(
            {
                **row,
                "measured": True,
                "status": status,
                "status_word": status_word,
                "mean": cur["mean"],
                "lo": cur["lo"],
                "hi": cur["hi"],
                "confidence_pct": cur["confidence_pct"],
                "n": cur["n"],
                "census": bool(cur.get("census")),
                "history": snaps,
                "forecast": fc,
            }
        )
    scored = [
        s for s in skills if s["status"] != "indicator"
    ]  # the word-list count is not part of the overall
    measured = [s for s in scored if s["measured"]]
    overall = {"measured": len(measured), "of": len(scored)}
    if measured:
        lo = sum(s["lo"] for s in measured) / len(measured)
        hi = sum(s["hi"] for s in measured) / len(measured)
        mean = sum(s["mean"] for s in measured) / len(measured)
        conf = sum(s["confidence_pct"] for s in scored) / len(
            scored
        )  # unmeasured skills count as 0
        overall.update(
            mean=mean,
            lo=lo,
            hi=hi,
            confidence_pct=st.half_up(conf),
            status=status_of(lo, hi, target) if len(measured) == len(scored) else "partial",
            status_word=(
                words[status_of(lo, hi, target)]
                if len(measured) == len(scored)
                else f"Partial: {len(measured)} of {len(scored)} skills measured"
            ),
        )
    else:
        overall.update(
            mean=None, lo=None, hi=None, confidence_pct=0, status="none", status_word=NO_EVIDENCE
        )
    pace = st.pace(act, today)
    return {
        "today": today.isoformat(),
        "goals": goals,
        "level": level_info(db),
        "target": {
            "exam": st.exam(level)["exam"],
            "level": level,
            "share": target,
            "source": st.exam(level)["sources"]["rules"],
        },
        "overall": overall,
        "skills": skills,
        "pace": pace,
        "milestone": milestone(goals, skills, pace, today),
        "calibration": calibration(db, events, level),
        "b2_note": "The app's exercises are B1 level. For a B2 goal this shows your B1 foundation."
        if level == "B2"
        else None,
    }


def milestone(goals: dict, skills: list[dict], pace: dict, today: date) -> dict:
    """Date and effort to bring every measured skill to the line (the slowest skill decides the date)."""
    mt = st.method()
    out: dict = {
        "target_date": goals["target_date"],
        "days_left": None,
        "forecast_date": None,
        "needed_per_week": None,
        "note": None,
    }
    if goals["target_date"]:
        out["days_left"] = (date.fromisoformat(goals["target_date"]) - today).days
    below = [s for s in skills if s["measured"] and s["status"] not in ("at_or_above", "indicator")]
    unmeasured = [s["label"] for s in skills if not s["measured"]]
    skills = [s for s in skills if s["status"] != "indicator"]
    if unmeasured:
        out["note"] = (
            f"{NO_EVIDENCE} for {', '.join(unmeasured)}; the milestone covers measured skills only."
        )
    if not below:
        out["forecast_date"] = None
        out["state"] = "reached" if any(s["measured"] for s in skills) else "none"
        return out
    fcs = [s["forecast"] for s in below]
    if any(f is None or f["state"] not in ("date", "far", "no_pace", "reached") for f in fcs):
        missing = [
            s["label"]
            for s in below
            if s["forecast"] is None
            or s["forecast"]["state"] not in ("date", "far", "no_pace", "reached")
        ]
        out["state"] = "need_data"
        out["text"] = f"{NO_EVIDENCE} of a trend for: {', '.join(missing)}."
        return out
    dated = [f for f in fcs if f["state"] == "date"]
    if any(f["state"] in ("far", "no_pace") for f in fcs):
        out["state"] = "far"
        out["text"] = "More than a year at this pace, or no recent practice in a skill."
    elif dated:
        out["state"] = "date"
        out["forecast_date"] = max(f["date"] for f in dated)
    else:
        out["state"] = "reached"
    need_hours = sum(f["hours_needed"] for f in fcs)
    pace_now = (pace.get("hours_per_week") or 0.0) if pace["measured"] else None
    if out["days_left"] is not None and out["days_left"] > 0:
        out["needed_per_week"] = need_hours / (out["days_left"] / mt["week_days"])
        out["pace_per_week"] = pace_now
    out["hours_needed"] = need_hours
    return out
