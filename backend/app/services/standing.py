"""V2 Stand box: where Zee stands per Goethe module, from his own rows and the official scales only.

Every number comes from data/official/*.json (exam facts, method parameters) or from Zee's rows
(exam_result, evidence_event, activity_log). Formulas: docs/v2/metrics.md. No data = "Not measured yet".
Nothing here asks a model. A test checks that this file holds no numeric literal beyond 0, 1 and 2.
"""

import json
import math
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from functools import cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import local_date
from app.core.config import settings
from app.models import ActivityLog, EvidenceEvent, ExamResult, Item, Pattern, Profile

MODULES = ("lesen", "hoeren", "schreiben", "sprechen")
KINDS = ("real_exam", "practice_full", "practice_teil", "app_check")
LEVELS = ("B1", "B2")
NOT_MEASURED = "Not measured yet"


@cache
def _load(name: str) -> dict:
    return json.loads((settings.official_dir / name).read_text(encoding="utf-8"))


def clear_cache() -> None:
    _load.cache_clear()


def method() -> dict:
    return _load("standing_method.json")


def exam(level: str) -> dict:
    return _load(f"goethe_{level.lower()}.json")


def cefr() -> dict:
    return _load("cefr.json")


def half_up(x: float) -> int:
    return math.floor(x + 1 / 2)


def measurable_max(level: str, module: str) -> float:
    """Points a practice result can reach: the module maximum, minus Aussprache for Sprechen."""
    m = exam(level)["modules"][module]
    return (
        m["raw_max"] - m.get("pronunciation_max", 0)
        if module == "sprechen"
        else exam(level)["module_max_points"]
    )


# --- goals (stored in profile.settings_json["goals"]) ---------------------------------------------


def get_goals(db: Session) -> dict:
    p = db.get(Profile, 1)
    g = dict((p.settings_json or {}).get("goals", {})) if p else {}
    return {
        "target_exam": g.get("target_exam", "B1"),
        "target_date": g.get("target_date"),
        "weekly_hours": g.get("weekly_hours"),
    }


def set_goals(
    db: Session, target_exam: str, target_date: date | None, weekly_hours: float | None
) -> dict:
    p = db.get(Profile, 1)
    assert p is not None
    goals = {
        "target_exam": target_exam,
        "target_date": target_date.isoformat() if target_date else None,
        "weekly_hours": weekly_hours,
    }
    p.settings_json = {**(p.settings_json or {}), "goals": goals}
    db.flush()
    return get_goals(db)


# --- turning an entered result into points --------------------------------------------------------


class EntryError(ValueError):
    pass


def teil_def(level: str, module: str, n: int) -> dict:
    for t in exam(level)["modules"][module]["teile"]:
        if t["n"] == n:
            return t
    raise EntryError(f"{module} has no Teil {n} in the {level} exam.")


def entry_points(
    level: str, module: str, kind: str, *, teil: int | None = None, raw: float | None = None,
    teile: dict[int, float] | None = None, points: float | None = None,
) -> dict:  # fmt: skip
    """Official scoring for one entered result. Returns raw, raw_max, points, points_max, meta."""
    if level not in LEVELS or module not in MODULES:
        raise EntryError("Unknown exam level or module.")
    m = exam(level)["modules"][module]
    full = exam(level)["module_max_points"]
    meas = measurable_max(level, module)
    if kind == "real_exam":
        if points is None or not 0 <= points <= full or points != int(points):
            raise EntryError(f"Enter the whole module points from the certificate, 0 to {full}.")
        return {
            "raw": None,
            "raw_max": None,
            "points": float(points),
            "points_max": float(full),
            "meta": {},
        }
    scored = module in ("schreiben", "sprechen")  # points given by a rater; Lesen/Hören count items

    def whole(v: float, what: str) -> None:
        if not scored and v != int(v):
            raise EntryError(f"{what} counts whole items.")

    cap = (lambda t: t["max"]) if scored else (lambda t: t["items"])
    if kind == "practice_teil":
        if teil is None or raw is None:
            raise EntryError("Enter the Teil and the score.")
        t = teil_def(level, module, teil)
        whole(raw, f"{module} Teil {teil}")
        if not 0 <= raw <= cap(t):
            raise EntryError(f"{module} Teil {teil}: score must be 0 to {cap(t)}.")
        pts = raw / cap(t) * meas
        return {"raw": float(raw), "raw_max": float(cap(t)), "points": float(pts),
                "points_max": float(meas), "meta": {"teil": teil}}  # fmt: skip
    if kind == "practice_full":
        if not teile or set(teile) != {t["n"] for t in m["teile"]}:
            raise EntryError("A whole test needs a score for every Teil.")
        total = 0.0
        for t in m["teile"]:
            v = teile[t["n"]]
            whole(v, f"{module} Teil {t['n']}")
            if not 0 <= v <= cap(t):
                raise EntryError(f"{module} Teil {t['n']}: score must be 0 to {cap(t)}.")
            total += v
        raw_max = float(sum(cap(t) for t in m["teile"]))
        pts = (
            total if scored else min(float(full), float(half_up(total * m["raw_to_points_factor"])))
        )
        return {"raw": float(total), "raw_max": raw_max, "points": float(pts), "points_max": float(meas),
                "meta": {"teile": {str(k): v for k, v in teile.items()}}}  # fmt: skip
    raise EntryError("Unknown kind of result.")


# --- evidence -> estimate -------------------------------------------------------------------------


def _weight(kind: str, age_days: float) -> float:
    mt = method()
    return mt["evidence_weights"][kind] * 1 / 2 ** (max(age_days, 0) / mt["half_life_days"])


def _status(low: float, high: float, pass_points: float) -> str:
    if low >= pass_points:
        return "at_or_above"
    return "near" if high >= pass_points else "below"


STATUS_WORDS = {
    "at_or_above": "At or above the pass line",
    "near": "Near the pass line",
    "below": "Below the pass line",
    "none": NOT_MEASURED,
}


def evidence_list(rows: list[ExamResult], today: date) -> list[dict]:
    out = []
    for r in sorted(rows, key=lambda r: (r.taken, r.id), reverse=True):
        age = (today - r.taken).days
        out.append({
            "id": r.id, "date": r.taken.isoformat(), "kind": r.kind, "teil": r.teil,
            "points": round(r.points, 1), "points_max": r.points_max, "raw": r.raw, "raw_max": r.raw_max,
            "weight": method()["evidence_weights"][r.kind], "weight_today": round(_weight(r.kind, age), 2),
            "note": r.note,
        })  # fmt: skip
    return out


def estimate(level: str, module: str, rows: list[ExamResult], today: date) -> dict:
    """Recency-weighted mean of evidence points with a range (docs/v2/metrics.md)."""
    mt = method()
    pass_points = exam(level)["pass_points"]
    full = exam(level)["module_max_points"]
    base = {"module": module, "label": exam(level)["modules"][module]["label"], "pass": pass_points,
            "n": len(rows), "evidence": evidence_list(rows, today)}  # fmt: skip
    if not rows:
        return {**base, "state": "none", "status": "none", "status_word": NOT_MEASURED, "low": None,
                "high": None, "centre": None, "official": False, "to_pass": None,
                "action": f"Measure {base['label']} (official practice test)"}  # fmt: skip
    real = [r for r in rows if r.kind == "real_exam"]
    if real:
        r = max(real, key=lambda r: (r.taken, r.id))
        status = _status(r.points, r.points, pass_points)
        return {**base, "state": "official", "status": status, "status_word": STATUS_WORDS[status],
                "low": r.points, "high": r.points, "centre": r.points, "official": True,
                "to_pass": max(0, half_up(pass_points - r.points)), "action": None}  # fmt: skip
    ws, ps = [], []
    for r in rows:
        ws.append(_weight(r.kind, (today - r.taken).days))
        ps.append(r.points)
    sw = sum(ws)
    mean = sum(w * p for w, p in zip(ws, ps)) / sw
    n_eff = sw * sw / sum(w * w for w in ws)
    if n_eff < mt["n_eff_min"]:
        half = float(mt["range_default"])
    else:
        sd = math.sqrt(sum(w * (p - mean) ** 2 for w, p in zip(ws, ps)) / sw)
        half = max(float(mt["range_floor"]), mt["range_z"] * sd / math.sqrt(n_eff))
    unknown = full - measurable_max(level, module)  # Aussprache for Sprechen
    low = max(0.0, mean - half)
    high = min(float(full), mean + half + unknown)
    status = _status(low, high, pass_points)
    centre = (low + high) / 2
    return {**base, "state": "estimate", "status": status, "status_word": STATUS_WORDS[status],
            "low": low, "high": high, "centre": centre, "mean": mean, "n_eff": n_eff,
            "official": False, "pronunciation_unknown": unknown or None,
            "to_pass": max(0, half_up(pass_points - centre)), "action": None}  # fmt: skip


# --- activity -> hours, pace ----------------------------------------------------------------------


def _hours(seconds: float) -> float:
    return seconds / method()["seconds_per_hour"]


def activity_by_day(db: Session) -> dict[date, dict[str, float]]:
    out: dict[date, dict[str, float]] = defaultdict(dict)
    for r in db.scalars(select(ActivityLog)):
        out[r.date][r.skill] = r.seconds
    return out


def hours_in(act: dict[date, dict[str, float]], skills, start: date, end: date) -> float:
    """Active hours of the skills on days start..end inclusive."""
    return _hours(
        sum(v for d, row in act.items() if start <= d <= end for s, v in row.items() if s in skills)
    )


def hours_by_skill(act, start: date, end: date) -> dict[str, float]:
    from app.services.evidence import SKILLS

    return {s: hours_in(act, (s,), start, end) for s in SKILLS}


def pace(act: dict[date, dict[str, float]], today: date) -> dict:
    mt = method()
    window = mt["pace_window_days"]
    start = today - timedelta(days=window - 1)
    days = len([d for d, row in act.items() if start <= d <= today and sum(row.values()) > 0])
    weeks = window / mt["week_days"]
    if days < mt["pace_min_days"]:
        return {"measured": False, "days_with_activity": days,
                "note": f"{NOT_MEASURED}. Pace needs {mt['pace_min_days']} days with study time in the last {window}; so far {days}."}  # fmt: skip
    per_skill = {s: h / weeks for s, h in hours_by_skill(act, start, today).items()}
    return {"measured": True, "days_with_activity": days, "window_days": window,
            "hours_per_week": sum(per_skill.values()), "per_skill": per_skill}  # fmt: skip


def weekly_hours(act, today: date) -> dict:
    """Stacked weekly hours per skill, the last N weeks, oldest first (weeks start on Monday)."""
    mt = method()
    this_monday = today - timedelta(days=today.weekday())
    weeks = []
    for i in range(mt["weeks_shown"] - 1, -1, -1):
        start = this_monday - timedelta(days=i * mt["week_days"])
        end = start + timedelta(days=mt["week_days"] - 1)
        weeks.append(
            {"week_start": start.isoformat(), "hours": hours_by_skill(act, start, min(end, today))}
        )
    return {"weeks": weeks}


# --- forecast -------------------------------------------------------------------------------------


def _fit(xs: list[float], ys: list[float]) -> tuple[float, float, float] | None:
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return None
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    syy = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (my + slope * (x - mx))) ** 2 for x, y in zip(xs, ys))
    r2 = 1 - ss_res / syy if syy else 0.0
    return my - slope * mx, slope, r2


def forecast(level: str, module: str, rows: list[ExamResult], act, today: date) -> dict:
    mt = method()
    label = exam(level)["modules"][module]["label"]
    skills = mt["skills_for_module"][module]
    pass_points = exam(level)["pass_points"]
    if any(r.kind == "real_exam" for r in rows):
        return {"state": "official", "text": "An official result is entered; no forecast."}
    n = len(rows)
    if n < mt["forecast_min_items"]:
        more = mt["forecast_min_items"] - n
        word = "check" if more == 1 else "checks"
        return {"state": "need_more", "missing": more,
                "text": f"Forecast needs {more} more {label} {word}: {mt['forecast_min_items']} in total, "
                        f"spanning at least {mt['forecast_min_span_days']} days."}  # fmt: skip
    dates = sorted(r.taken for r in rows)
    span = (dates[-1] - dates[0]).days
    if span < mt["forecast_min_span_days"]:
        return {"state": "need_span", "span_days": span,
                "text": f"Forecast needs {label} checks spanning at least {mt['forecast_min_span_days']} days; so far {span}."}  # fmt: skip
    first_day = min([dates[0], *act]) if act else dates[0]
    xs = [hours_in(act, skills, first_day, r.taken) for r in rows]
    fit = _fit(xs, [r.points for r in rows])
    if fit is None or fit[1] <= 0 or fit[2] < mt["forecast_min_r2"]:
        return {"state": "no_trend", "text": "No reliable trend yet."}
    a, slope, r2 = fit
    x_now = hours_in(act, skills, first_day, today)
    target = pass_points
    fitted_now = a + slope * x_now
    start = today - timedelta(days=mt["pace_window_days"] - 1)
    weekly = hours_in(act, skills, start, today) / (mt["pace_window_days"] / mt["week_days"])
    base = {"slope_per_hour": slope, "r2": r2, "fitted_now": fitted_now, "weekly_hours": weekly}
    assumption = (
        f"Assumes your last {mt['pace_window_days']} days' pace ({weekly:.1f} h/week of "
        f"{' and '.join(skills)} practice) and that the trend continues."
    )
    if fitted_now >= target:
        return {**base, "state": "reached", "hours_needed": 0.0, "assumption": assumption,
                "text": "The trend is at the pass line now."}  # fmt: skip
    needed = (target - fitted_now) / slope
    if weekly <= 0:
        return {**base, "state": "no_pace", "hours_needed": needed,
                "text": f"No {label} practice in the last {mt['pace_window_days']} days, so no date."}  # fmt: skip
    days = needed / weekly * mt["week_days"]
    if days > mt["forecast_max_months"] * mt["days_per_month"]:
        return {**base, "state": "far", "hours_needed": needed, "assumption": assumption,
                "text": "More than a year at this pace."}  # fmt: skip
    when = today + timedelta(days=math.ceil(days))
    return {**base, "state": "date", "hours_needed": needed, "date": when.isoformat(),
            "assumption": assumption, "text": f"About {when.strftime('%b %Y')} at this pace."}  # fmt: skip


def needed_pace(goals: dict, modules: list[dict], today: date) -> dict | None:
    """Hours per week needed to reach the pass line by the target date, same model as the forecast."""
    if not goals["target_date"]:
        return None
    left = (date.fromisoformat(goals["target_date"]) - today).days
    if left <= 0:
        return {"measured": False, "note": "The target date has passed."}
    weeks = left / method()["week_days"]
    total, missing = 0.0, []
    for m in modules:
        if m["status"] == "at_or_above":
            continue
        f = m["forecast"]
        if f["state"] in ("date", "far", "no_pace", "reached"):
            total += f["hours_needed"]
        else:
            missing.append(m["label"])
    if missing:
        return {"measured": False,
                "note": f"{NOT_MEASURED}. Needs a reliable trend for: {', '.join(missing)}."}  # fmt: skip
    return {"measured": True, "hours_per_week": total / weeks}


# --- indicators -----------------------------------------------------------------------------------


def grammar_states(db: Session, today: date) -> list[dict]:
    """Same rule as the planner (services/learner.py pattern_states), so Today and Progress never disagree."""
    from app.db import utcnow
    from app.services import learner

    states = learner.pattern_states(db, utcnow())
    return [
        {"code": p.code, "title": p.title, "state": states[p.code]["state"],
         "accuracy": states[p.code]["accuracy"], "events": states[p.code]["events"]}
        for p in db.scalars(select(Pattern).order_by(Pattern.order))
    ]  # fmt: skip


def error_rate(db: Session, now: datetime, since_days: int | None = None) -> dict:
    mt = method()["indicators"]
    days = since_days or mt["error_rate_window_days"]
    rows = list(db.scalars(
        select(EvidenceEvent).where(
            EvidenceEvent.ts >= now - timedelta(days=days),
            EvidenceEvent.skill.in_(mt["error_rate_skills"]),
            EvidenceEvent.tag.in_(mt["error_rate_tags"]),
        )
    ))  # fmt: skip
    n = len(rows)
    errs = sum(1 for r in rows if r.outcome == "error")
    base = {"window_days": days, "tags": mt["error_rate_tags"], "target_pct": mt["error_rate_target_pct"],
            "target_source": mt["error_rate_source"], "opportunities": n, "min": mt["error_rate_min_opportunities"]}  # fmt: skip
    if n < mt["error_rate_min_opportunities"]:
        return {**base, "measured": False,
                "note": f"{NOT_MEASURED}. Needs {mt['error_rate_min_opportunities']} graded uses of "
                        f"these tags in {days} days; so far {n}."}  # fmt: skip
    return {**base, "measured": True, "errors": errs, "rate_pct": errs / n * method()["percent"]}


def tag_weeks(db: Session, today: date) -> dict:
    """Error rate per week for the top tags by errors, weeks with enough uses only."""
    mt = method()
    ind = mt["indicators"]
    start_monday = (
        today
        - timedelta(days=today.weekday())
        - timedelta(days=(mt["weeks_shown"] - 1) * mt["week_days"])
    )
    rows = [e for e in db.scalars(select(EvidenceEvent).where(EvidenceEvent.tag.is_not(None)))
            if local_date(e.ts) >= start_monday]  # fmt: skip
    errs: dict[str, int] = defaultdict(int)
    for e in rows:
        if e.outcome == "error":
            errs[e.tag] += 1
    top = [t for t, _ in sorted(errs.items(), key=lambda kv: (-kv[1], kv[0]))[: ind["top_tags"]]]
    series = []
    for t in top:
        weeks = []
        for i in range(mt["weeks_shown"]):
            ws = start_monday + timedelta(days=i * mt["week_days"])
            we = ws + timedelta(days=mt["week_days"])
            ev = [e for e in rows if e.tag == t and ws <= local_date(e.ts) < we]
            n = len(ev)
            ok = n >= ind["tag_week_min_uses"]
            weeks.append({"week_start": ws.isoformat(), "uses": n,
                          "rate_pct": sum(1 for e in ev if e.outcome == "error") / n * mt["percent"] if ok else None})  # fmt: skip
        series.append({"tag": t, "errors": errs[t], "weeks": weeks})
    return {"min_uses": ind["tag_week_min_uses"], "tags": series}


_ARTICLE = re.compile(r"^(der|die|das|ein|eine|sich)\s+", re.IGNORECASE)


def _norm(s: str) -> str:
    s = s.split(",")[0].split("(")[0].strip().lower()
    while True:
        t = _ARTICLE.sub("", s)
        if t == s:
            return s
        s = t


def wordlist_coverage(db: Session) -> dict:
    wl = exam("B1")["word_list"]
    path = settings.private_dir / wl["private_file"]
    base = {"list": wl["name"], "list_size_official": wl["size"], "source_url": wl["source_url"]}
    if not path.exists():
        return {**base, "measured": False, "note": "Add the Goethe B1 word list to measure this."}
    lemmas = {_norm(ln) for ln in path.read_text(encoding="utf-8").splitlines()
              if ln.strip() and not ln.lstrip().startswith("#")}  # fmt: skip
    if not lemmas:
        return {**base, "measured": False, "note": "The word list file is empty."}
    mature_days = method()["indicators"]["mature_stability_days"]
    known: set[str] = set()
    for item in db.scalars(select(Item)):
        keys = {_norm(item.de)} | ({_norm(item.lemma)} if item.lemma else set())
        mature = item.known_from_placement or any(
            c.introduced_at is not None and (c.stability or 0) >= mature_days for c in item.cards
        )
        if mature:
            known |= keys & lemmas
    return {**base, "measured": True, "list_lemmas": len(lemmas), "mature": len(known)}


# --- the whole picture ----------------------------------------------------------------------------


def results_for(db: Session, level: str, module: str | None = None) -> list[ExamResult]:
    q = select(ExamResult).where(ExamResult.level == level, ExamResult.voided.is_(False))
    if module:
        q = q.where(ExamResult.module == module)
    return list(db.scalars(q.order_by(ExamResult.taken, ExamResult.id)))


def standing(db: Session, now: datetime) -> dict:
    today = local_date(now)
    goals = get_goals(db)
    level = goals["target_exam"]
    act = activity_by_day(db)
    mt = method()
    modules = []
    for mod in MODULES:
        rows = results_for(db, level, mod)
        est = estimate(level, mod, rows, today)
        est["forecast"] = forecast(level, mod, rows, act, today)
        meta = exam(level)["modules"][mod]
        est["verified"] = meta["verified"]
        est["verify_note"] = meta.get("verify_note")
        est["measure_minutes"] = meta["minutes"]
        modules.append(est)
    start28 = today - timedelta(days=mt["pace_window_days"] - 1)
    start7 = today - timedelta(days=mt["short_window_days"] - 1)
    return {
        "today": today.isoformat(),
        "exam": exam(level)["exam"], "level": level, "pass_points": exam(level)["pass_points"],
        "module_max_points": exam(level)["module_max_points"],
        "goals": goals, "modules": modules,
        "pace": pace(act, today), "needed_pace": needed_pace(goals, modules, today),
        "hours": {"last_7": hours_by_skill(act, start7, today), "last_28": hours_by_skill(act, start28, today)},
        "cefr": cefr()["levels"][level], "cefr_source": cefr()["sources"]["global_scale"],
        "sources": exam(level)["sources"],
    }  # fmt: skip


def progress(db: Session, now: datetime) -> dict:
    today = local_date(now)
    act = activity_by_day(db)
    base = standing(db, now)
    return {
        **base,
        "weekly_hours": weekly_hours(act, today),
        "grammar": grammar_states(db, today),
        "error_rate": error_rate(db, now),
        "tag_weeks": tag_weeks(db, today),
        "wordlist": wordlist_coverage(db),
        "official_task_lists": {m: exam(base["level"])["modules"][m]["teile"] for m in MODULES},
    }
