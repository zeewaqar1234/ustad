"""Internal level estimate: what Zee's own work in the app says, on the placement test's band scale.

Every number is computed from his rows with the formulas in docs/v2/metrics.md ("Level and practice"), using
the parameters in data/official/readiness_method.json. The level itself comes only from the placement test,
the one measurement that has items per band. Practice since then is the share of answers that were right
on the app's B1 work, per skill, with a 95 % range (+/- points) from a uniform Beta prior: a few answers
give a wide range, more practice narrows it. It is compared with the placement band rule (70 % right),
never with Goethe exam points. No model call is made here: this decides numbers, never an LLM.
"""

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import local_date
from app.models import EvidenceEvent, ExamResult, PlacementResult, Profile
from app.services import placement as pl
from app.services import standing as st

NO_EVIDENCE = "Not measured yet"
# placement class -> the band Zee is working on (the first band placement did not pass; None = all passed)
WORKING_ON = dict(zip(pl.CLASSES, [*pl.BANDS, None], strict=True))
# goal exam -> the last band that has to be passed
GOAL_BAND = {"B1": "B1.2", "B2": "B2"}


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


def line() -> float:
    return pl.PASS


def pts(x: float) -> int:
    return st.half_up(x * st.method()["percent"])


def posterior(succ: float, fail: float) -> dict:
    m = rm()
    a, b = m["prior"]["alpha"] + succ, m["prior"]["beta"] + fail
    mean = a / (a + b)
    sd = math.sqrt(a * b / ((a + b) ** 2 * (a + b + 1)))
    lo, hi = max(0.0, mean - m["ci_z"] * sd), min(1.0, mean + m["ci_z"] * sd)
    return {"mean": mean, "lo": lo, "hi": hi, "pm_pts": pts((hi - lo) / 2)}


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
            continue  # placement items below B1 (A2) say nothing about B1 work
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
    return {**posterior(s, f), "n": n, "n_eff": n_eff, "succ": s, "fail": f}


def status_of(lo: float, hi: float, target: float) -> str:
    if lo >= target:
        return "at_or_above"
    return "near" if hi >= target else "below"


def status_words() -> dict[str, str]:
    t = pts(line())
    return {
        "at_or_above": f"{t}% or more",
        "near": f"Around {t}%, not clear yet",
        "below": f"Under {t}%",
        "none": NO_EVIDENCE,
    }


def snapshots(events: list[Ev], skill: str, today: date) -> list[dict]:
    """The estimate as it stood at the end of each of the last weeks, from events up to that day only."""
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


def _window(events: list[Ev], skill: str, start: date, end: date) -> tuple[float, float, int]:
    """Source-weighted right and wrong answers on days start..end, without the age discount."""
    stream = rm()["streams"][skill]
    s = f = 0.0
    n = 0
    for e in events:
        w = stream["sources"].get(e.source)
        if e.skill != skill or w is None or e.source == "placement" or not start <= e.day <= end:
            continue
        if e.band is not None and e.band not in stream.get("placement_bands", [e.band]):
            continue
        s, f, n = s + w * e.ok, f + w * (not e.ok), n + 1
    return s, f, n


def trend(events: list[Ev], skill: str, today: date) -> int | None:
    """Share right in the last trend_days minus the share right in the trend_days before, in points.
    None unless both windows hold trend_min_answers answers (the age discount plays no part here)."""
    days = rm()["trend_days"]
    now = _window(events, skill, today - timedelta(days=days - 1), today)
    before = _window(
        events, skill, today - timedelta(days=2 * days - 1), today - timedelta(days=days)
    )
    if min(now[2], before[2]) < rm()["trend_min_answers"]:
        return None
    return pts(now[0] / (now[0] + now[1]) - before[0] / (before[0] + before[1]))


def placement_only(events: list[Ev], skill: str) -> bool:
    return not any(e.skill == skill and e.source != "placement" for e in events)


def skill_forecast(
    snaps: list[dict], skill: str, act, today: date, target: float, cur: dict
) -> dict:
    """Hours (and date) at which the trend of this skill against its own practice hours reaches the line."""
    mt = st.method()
    label = rm()["labels"][skill]
    if cur["lo"] >= target:
        return {"state": "reached", "hours_needed": 0.0, "text": "At the line now."}
    if len(snaps) < mt["forecast_min_items"]:
        return {
            "state": "need_more",
            "text": f"{label}: needs {mt['forecast_min_items']} weeks with answers; so far {len(snaps)}.",
        }
    dates = [date.fromisoformat(s["date"]) for s in snaps]
    span = (dates[-1] - dates[0]).days
    if span < mt["forecast_min_span_days"]:
        return {
            "state": "need_span",
            "text": f"{label}: needs answers over {mt['forecast_min_span_days']} days; so far {span}.",
        }
    first = min([dates[0], *act]) if act else dates[0]
    skills = (rm()["activity_skill"][skill],)
    xs = [st.hours_in(act, skills, first, d) for d in dates]
    fit = st._fit(xs, [s["mean"] for s in snaps])
    if fit is None or fit[1] <= 0 or fit[2] < mt["forecast_min_r2"]:
        return {"state": "no_trend", "text": f"{label}: no steady rise yet, so no estimate."}
    a, slope, r2 = fit
    fitted_now = a + slope * st.hours_in(act, skills, first, today)
    start = today - timedelta(days=mt["pace_window_days"] - 1)
    weekly = st.hours_in(act, skills, start, today) / (mt["pace_window_days"] / mt["week_days"])
    base = {"slope_per_hour": slope, "r2": r2, "weekly_hours": weekly}
    if (
        fitted_now >= target
    ):  # the trend is there but the range still spans the line: more answers decide, not more hours
        return {
            **base,
            "state": "unclear",
            "text": f"{label}: the trend is at {pts(target)}%; more answers will make it clear.",
        }
    needed = (target - fitted_now) / slope
    if weekly <= 0:
        return {
            **base,
            "state": "no_pace",
            "hours_needed": needed,
            "text": f"{label}: no practice in the last {mt['pace_window_days']} days.",
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
        "text": f"About {when.strftime('%d %b %Y')} at this pace.",
    }


def calibration(db: Session, events: list[Ev], level: str) -> dict:
    """In-app accuracy against Zee's own practice tests: for Lesen and Hören points are the share of correct
    items, so the share right in the app before the test day can be compared with them."""
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
            "note": "No practice test entered yet, so the app's numbers have not been checked against one.",
        }
    errs = [abs(r["estimate_pts"] - r["actual_pts"]) for r in rows]
    return {
        "n": len(rows),
        "skipped": skipped,
        "mean_abs_error_pts": sum(errs) / len(errs),
        "rows": rows,
    }


def level_info(db: Session, goal_exam: str) -> dict:
    p = db.get(Profile, 1)
    pr = db.scalars(select(PlacementResult).order_by(PlacementResult.ts.desc())).first()
    label = p.level_band if p else None
    if (
        label not in WORKING_ON
    ):  # not placed, or a value the placement rule never writes: no level, no bands passed
        label = None
    working = WORKING_ON.get(label) if label else None
    goal_band = GOAL_BAND[goal_exam]
    passed = [] if label is None else pl.BANDS[: pl.BANDS.index(working)] if working else pl.BANDS
    return {
        "label": label,
        "taken": local_date(pr.ts).isoformat() if pr and label else None,
        "working_on": working,
        "bands": pl.BANDS,
        "passed": passed,
        "goal_band": goal_band,
        "goal_reached": label is not None and goal_band in passed,
        "note": "From the app's placement test (grammar, vocabulary and a writing sample). A writing score "
        "under 5 of 10 moves the result one band down. Not an official CEFR result.",
    }


def readiness(db: Session, now: datetime) -> dict:
    today = local_date(now)
    goals = st.get_goals(db)
    level = goals["target_exam"]
    target = line()
    words = status_words()
    events = load_events(db)
    act = st.activity_by_day(db)
    mt = st.method()
    start28 = today - timedelta(days=mt["pace_window_days"] - 1)
    weeks = mt["pace_window_days"] / mt["week_days"]
    skills = []
    pool_s = pool_f = 0.0
    pool_n = 0
    for sk in rm()["skills"]:
        cfg = rm()["streams"][sk]
        cur = skill_at(events, sk, today)
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
                {**row, "measured": False, "status": "none", "status_word": NO_EVIDENCE,
                 "mean": None, "lo": None, "hi": None, "pm_pts": None, "n": 0, "trend_pts": None,
                 "history": [], "placement_only": False, "forecast": None}
            )  # fmt: skip
            continue
        status = status_of(cur["lo"], cur["hi"], target)
        only_placement = placement_only(events, sk)
        snaps = [] if only_placement else snapshots(events, sk, today)
        fc = (
            {
                "state": "placement_only",
                "text": f"{row['label']}: only the placement test measures this so far.",
            }
            if only_placement
            else skill_forecast(snaps, sk, act, today, target, cur)
        )
        skills.append(
            {**row, "measured": True, "status": status, "status_word": words[status],
             "mean": cur["mean"], "lo": cur["lo"], "hi": cur["hi"], "pm_pts": cur["pm_pts"],
             "n": cur["n"], "trend_pts": trend(events, sk, today), "history": snaps,
             "placement_only": only_placement, "forecast": fc}
        )  # fmt: skip
    lv = level_info(db, level)
    placed = date.fromisoformat(lv["taken"]) if lv["taken"] else None
    # the headline figure: practice answers only (no placement items), from the placement day on when placed
    since = [e for e in events if e.source != "placement" and (placed is None or e.day >= placed)]
    for sk in rm()["skills"]:
        succ, fail, _, n = _counts(since, sk, today)
        pool_s, pool_f, pool_n = pool_s + succ, pool_f + fail, pool_n + n
    measured = [s for s in skills if s["measured"]]
    # skills only the placement test measures cannot move before a retake, so they do not gate it
    practised = [s for s in measured if not s["placement_only"]]
    at_line = [s for s in practised if s["status"] == "at_or_above"]
    practice = {"measured": len(measured), "of": len(skills), "practised": len(practised),
                "at_line": len(at_line), "n": pool_n, "since_placement": placed is not None}  # fmt: skip
    if pool_n:
        practice.update(posterior(pool_s, pool_f))
    else:
        practice.update(mean=None, lo=None, hi=None, pm_pts=None)
    all_skills = tuple(rm()["activity_skill"].values())
    pace = st.pace(act, today)
    return {
        "today": today.isoformat(),
        "goals": goals,
        "level": lv,
        "line": {"share": target, "source": rm()["line_from"]},
        "target": {"exam": st.exam(level)["exam"], "level": level},
        "practice": practice,
        "move_up": move_up(lv, skills, practised, len(at_line)),
        "skills": skills,
        "pace": pace,
        "hours_since_placement": st.hours_in(act, all_skills, placed, today) if placed else None,
        "milestone": milestone(goals, skills, pace, today),
        "calibration": calibration(db, events, level),
        "b2_note": "The app's lessons are B1 material. For a B2 goal this shows your B1 foundation."
        if level == "B2"
        else None,
    }


def move_up(lv: dict, skills: list[dict], practised: list[dict], at_line: int) -> dict:
    """Whether practice says the next placement band may be within reach. Only a placement retake moves the level.
    Counts skills with practice answers; a skill only the placement test measures is named, not counted."""
    t = pts(line())
    if lv["label"] is None:
        return {"ready": False, "text": "Take the placement test to get a starting level."}
    if lv["working_on"] not in rm()["move_up_bands"]:
        return {"ready": False, "text": rm()["move_up_note"]}
    unpractised = [s["label"] for s in skills if s not in practised]
    rest = f" Not counted, no practice answers: {', '.join(unpractised)}." if unpractised else ""
    if practised and at_line == len(practised) and len(practised) >= rm()["move_up_min_skills"]:
        return {
            "ready": True,
            "text": f"Every practised skill is at {t}% or more on B1 work. Retake the placement test to see if you moved past {lv['working_on']}.{rest}",
        }
    return {
        "ready": False,
        "text": f"{at_line} of {len(practised)} practised skills at {t}% or more on B1 work. When all are, retake the placement test.{rest}",
    }


def milestone(goals: dict, skills: list[dict], pace: dict, today: date) -> dict:
    """Hours and date to bring every measured skill to the line (the slowest skill decides the date)."""
    mt = st.method()
    out: dict = {
        "target_date": goals["target_date"],
        "days_left": None,
        "forecast_date": None,
        "needed_per_week": None,
        "hours_needed": None,
        "pace_per_week": (pace.get("hours_per_week") or 0.0) if pace["measured"] else None,
        "text": None,
        "note": None,
        "unclear": [],
    }
    if goals["target_date"]:
        out["days_left"] = (date.fromisoformat(goals["target_date"]) - today).days
    # a skill only the placement test measures has no practice trend: it is named, not forecast
    counted = [s for s in skills if s["measured"] and not s["placement_only"]]
    below = [s for s in counted if s["status"] != "at_or_above"]
    left_out = [s["label"] for s in skills if s not in counted]
    if left_out and counted:
        out["note"] = f"Time to goal leaves out {', '.join(left_out)}: no practice answers yet."
    if not below:
        out["state"] = "reached" if counted else "none"
        return out
    # "unclear": the trend is at the line but the range still spans it, so answers decide, not hours. Named, not blocking.
    unclear = [s for s in below if s["forecast"]["state"] == "unclear"]
    timed = [s for s in below if s not in unclear]
    out["unclear"] = [s["label"] for s in unclear]
    missing = [
        s for s in timed if s["forecast"]["state"] not in ("date", "far", "no_pace", "reached")
    ]
    if missing:
        out["state"] = "need_data"
        out["text"] = " ".join(s["forecast"]["text"] for s in missing + unclear)
        return out
    if not timed:
        out["state"] = "unclear"
        out["text"] = " ".join(s["forecast"]["text"] for s in unclear)
        return out
    fcs = [s["forecast"] for s in timed]
    dated = [f for f in fcs if f["state"] == "date"]
    if any(f["state"] in ("far", "no_pace") for f in fcs):
        out["state"] = "far"
        out["text"] = "More than a year at this pace, or a skill with no recent practice."
    else:
        out["state"] = "date"
        out["forecast_date"] = max(f["date"] for f in dated)
    out["hours_needed"] = sum(f["hours_needed"] for f in fcs)
    out["slowest"] = max(timed, key=lambda s: s["forecast"]["hours_needed"])["label"]
    if out["days_left"] is not None and out["days_left"] > 0:
        out["needed_per_week"] = out["hours_needed"] / (out["days_left"] / mt["week_days"])
    return out
