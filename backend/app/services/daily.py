"""Daily loop: Manzil (due reviews) -> Sabqi (last 7 days + yesterday's misses) -> Sabaq (new unit).

Rules from docs/pedagogy.md §3-4: revision before new material, Sabaq locked until Manzil is done,
Manzil cap 60 (90 on a Makeup day, and no new Sabaq until backlog < 30), max 3 repetitions of the
same card per day before it goes back to the scheduler (P4).
"""

from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import day_bounds, local_date
from app.models import Card, DayLog, Item, Lesson, ReviewLog
from app.services.streak import get_day, refresh_study_day

MANZIL_CAP, MAKEUP_CAP, MAKEUP_BACKLOG = 60, 90, 30
MAX_REPS_PER_DAY = 3
SABQI_CAP = 15


def is_makeup(db: Session, today: date) -> bool:
    """Yesterday was missed and there is study history before it."""
    yesterday = db.get(DayLog, today - timedelta(days=1))
    if yesterday is not None and yesterday.study_day:
        return False
    earlier = db.scalar(
        select(func.count()).select_from(DayLog).where(DayLog.study_day, DayLog.date < today)
    )
    return bool(earlier)


def _today(model, now: datetime, block: str):
    start, end = day_bounds(local_date(now))
    return (model.block == block, model.ts >= start, model.ts < end)


def _reviews_today(db: Session, now: datetime, block: str):
    return select(ReviewLog).where(*_today(ReviewLog, now, block)).order_by(ReviewLog.id)


def due_count(db: Session, now: datetime) -> int:
    return db.scalar(
        select(func.count())
        .select_from(Card)
        .where(Card.introduced_at.is_not(None), Card.due <= now)
    )


def manzil_next(db: Session, now: datetime) -> Card | None:
    cap = MAKEUP_CAP if is_makeup(db, local_date(now)) else MANZIL_CAP
    done = list(db.scalars(_reviews_today(db, now, "manzil")))
    if len(done) >= cap:
        return None  # cap reached: the rest rolls over to tomorrow
    reps: dict[int, int] = {}
    for r in done:
        reps[r.card_id] = reps.get(r.card_id, 0) + 1
    tired = [cid for cid, n in reps.items() if n >= MAX_REPS_PER_DAY]
    q = select(Card).where(Card.introduced_at.is_not(None), Card.due <= now)
    if tired:
        q = q.where(Card.id.not_in(tired))
    last = done[-1].card_id if done else None
    cards = list(db.scalars(q.order_by(Card.due).limit(2)))
    # avoid showing the card that was just answered twice in a row if anything else is due
    if len(cards) == 2 and cards[0].id == last:
        return cards[1]
    return cards[0] if cards else None


def sabqi_queue(db: Session, now: datetime) -> list[Card]:
    today = local_date(now)
    week_start, _ = day_bounds(today - timedelta(days=7))
    today_start, _ = day_bounds(today)
    y_start, _ = day_bounds(today - timedelta(days=1))
    practised = set(db.scalars(select(ReviewLog.card_id).where(*_today(ReviewLog, now, "sabqi"))))
    if len(practised) >= SABQI_CAP:
        return []
    missed = set(
        db.scalars(
            select(ReviewLog.card_id).where(
                ReviewLog.rating == 1, ReviewLog.ts >= y_start, ReviewLog.ts < today_start
            )
        )
    )
    recent = set(
        db.scalars(
            select(Card.id).where(
                Card.card_type == "produce",
                Card.introduced_at >= week_start,
                Card.introduced_at < today_start,
            )
        )
    )
    ids = [i for i in [*sorted(missed), *sorted(recent - missed)] if i not in practised]
    ids = ids[: SABQI_CAP - len(practised)]
    return [db.get(Card, i) for i in ids]


def next_unit_order(db: Session) -> int | None:
    return db.scalar(
        select(func.min(Item.unit_order))
        .join(Card)
        .where(Item.status == "ok", Card.introduced_at.is_(None))
    )


def todays_lesson(db: Session, today: date) -> Lesson | None:
    return db.scalar(select(Lesson).where(Lesson.date == today).order_by(Lesson.id.desc()).limit(1))


def sabaq_lock(db: Session, now: datetime) -> str | None:
    """Why the Sabaq is locked, or None if it can start."""
    today = local_date(now)
    day = get_day(db, today)
    if not day.manzil_done:
        return "Finish Manzil first."
    if is_makeup(db, today) and due_count(db, now) >= MAKEUP_BACKLOG:
        return f"Makeup day: bring the backlog under {MAKEUP_BACKLOG} first."
    return None


def start_or_get_lesson(db: Session, now: datetime) -> Lesson | None:
    today = local_date(now)
    lesson = todays_lesson(db, today)
    if lesson:
        return lesson
    order = next_unit_order(db)
    if order is None:
        return None
    items = list(
        db.scalars(
            select(Item).where(Item.unit_order == order, Item.status == "ok").order_by(Item.id)
        )
    )
    first = items[0]
    lesson = Lesson(
        date=today, type="chunks", unit_order=order, title=first.unit_title,
        scenario=first.scenario, items=[i.id for i in items], status="open",
    )  # fmt: skip
    db.add(lesson)
    db.commit()
    return lesson


def mark_block(db: Session, now: datetime, block: str) -> DayLog:
    day = get_day(db, local_date(now))
    setattr(day, f"{block}_done", True)
    refresh_study_day(day)
    db.commit()
    return day


def add_minutes(db: Session, now: datetime, elapsed_ms: int) -> None:
    """Active time: an answer that took longer than 60 s counts as 60 s (idle not counted)."""
    day = get_day(db, local_date(now))
    day.minutes += min(max(elapsed_ms, 0), 60_000) / 60_000
