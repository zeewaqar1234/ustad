"""Streak with 2 auto-freezes per ISO week, attendance %, builder gate (docs/engagement.md §6.2, §6.6)."""

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DayLog

FREEZES_PER_WEEK = 2


def get_day(db: Session, d: date) -> DayLog:
    day = db.get(DayLog, d)
    if day is None:
        day = DayLog(
            date=d, study_day=False, freeze_used=False, minutes=0.0,
            manzil_done=False, sabqi_done=False, sabaq_done=False,
        )  # fmt: skip
        db.add(day)
        db.flush()
    return day


def refresh_study_day(day: DayLog) -> None:
    """Study day = Manzil done (or nothing due) + Sabqi, Sabaq, or one other block (Mazmoon submitted,
    voice session reviewed, Diktat 5 of 5, text read with its questions). Opening the app never counts."""
    day.study_day = day.manzil_done and (day.sabqi_done or day.sabaq_done or day.other_done)


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _freezes_used(db: Session, d: date) -> int:
    start = _week_start(d)
    rows = db.scalars(
        select(DayLog).where(DayLog.date >= start, DayLog.date < start + timedelta(days=7))
    )
    return sum(1 for r in rows if r.freeze_used)


def streak_info(db: Session, today: date) -> dict:
    first = db.scalar(select(DayLog.date).where(DayLog.study_day).order_by(DayLog.date).limit(1))
    streak = 0
    if first is not None:
        # Missed days are bridged by freezes (auto-applied; missing one day is fine, Lally et al.
        # 2010). Freezes for a gap are only spent if the streak survives the whole gap.
        pending: list[DayLog] = []
        d = today - timedelta(days=1)
        while d >= first:
            day = get_day(db, d)
            if day.study_day:
                for p in pending:
                    p.freeze_used = True
                pending.clear()
                streak += 1
            elif not day.freeze_used:
                in_week = sum(1 for p in pending if _week_start(p.date) == _week_start(d))
                if _freezes_used(db, d) + in_week >= FREEZES_PER_WEEK:
                    break
                pending.append(day)
            d -= timedelta(days=1)
        if get_day(db, today).study_day:
            streak += 1
    db.commit()
    week_start = _week_start(today)
    elapsed = (today - week_start).days + 1
    studied = sum(1 for r in _days(db, week_start, today) if r.study_day)
    return {
        "current": streak,
        "freezes_left": FREEZES_PER_WEEK - _freezes_used(db, today),
        "attendance_week": round(100 * studied / elapsed),
        "studied_week": studied,
        "days_in_week_so_far": elapsed,
    }


def _days(db: Session, start: date, end: date) -> list[DayLog]:
    return list(db.scalars(select(DayLog).where(DayLog.date >= start, DayLog.date <= end)))


def study_days_last_7(db: Session, today: date) -> int:
    return sum(1 for r in _days(db, today - timedelta(days=6), today) if r.study_day)
