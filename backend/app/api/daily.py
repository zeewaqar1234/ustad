from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.core.auth import require_user
from app.core.clock import local_date
from app.db import DB, utcnow
from app.models import Card, Item
from app.services import daily as svc
from app.services.streak import get_day, streak_info

router = APIRouter(prefix="/api", dependencies=[Depends(require_user)])


@router.get("/daily")
def get_daily(db: DB):
    now = utcnow()
    today = local_date(now)
    day = get_day(db, today)
    makeup = svc.is_makeup(db, today)
    if not day.manzil_done and svc.manzil_next(db, now) is None:
        day = svc.mark_block(db, now, "manzil")
    lesson = svc.todays_lesson(db, today)
    order = lesson.unit_order if lesson else svc.next_unit_order(db)
    unit = None
    if order is not None:
        first = db.scalar(select(Item).where(Item.unit_order == order).limit(1))
        n = db.scalar(
            select(func.count())
            .select_from(Item)
            .where(Item.unit_order == order, Item.status == "ok", ~Item.known_from_placement)
        )
        unit = {
            "title": first.unit_title,
            "scenario": first.scenario,
            "deck": first.deck,
            "items": n,
        }
    sabqi_left = len(svc.sabqi_queue(db, now))
    db.commit()
    return {
        "date": today.isoformat(),
        "makeup": makeup,
        "manzil": {
            "done": day.manzil_done,
            "due": svc.due_count(db, now),
            "cap": svc.MAKEUP_CAP if makeup else svc.MANZIL_CAP,
        },
        "sabqi": {"done": day.sabqi_done, "left": sabqi_left},
        "sabaq": {
            "done": day.sabaq_done,
            "locked": svc.sabaq_lock(db, now) if not day.sabaq_done else None,
            "unit": unit,
        },
        "study_day": day.study_day,
        "minutes": round(day.minutes, 1),
        "streak": streak_info(db, today),
        "cards_introduced": db.scalar(
            select(func.count()).select_from(Card).where(Card.introduced_at.is_not(None))
        ),
    }
