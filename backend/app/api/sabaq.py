"""Sabaq: today's new unit. Each item is attempted before it is shown (ask before tell)."""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import require_user
from app.core.clock import day_bounds, local_date
from app.db import DB, utcnow
from app.models import Item, ReviewLog
from app.services import cards as cardsvc
from app.services import daily as svc
from app.srs import grader, scheduler

router = APIRouter(prefix="/api/sabaq", dependencies=[Depends(require_user)])


def _produce(item: Item):
    return next(c for c in item.cards if c.card_type == "produce")


def _view(db: Session, lesson) -> dict:
    items = []
    for iid in lesson.items:
        item = db.get(Item, iid)
        produce = _produce(item)
        done = produce.introduced_at is not None
        hint = "with article" if item.pos == "noun" and item.gender else None
        items.append(
            {
                "item_id": item.id, "prompt": item.en, "hint": hint, "done": done,
                "reveal": cardsvc.item_reveal(item) if done else None,
            }
        )  # fmt: skip
    return {
        "lesson_id": lesson.id, "title": lesson.title, "scenario": lesson.scenario,
        "status": lesson.status, "items": items,
    }  # fmt: skip


@router.get("")
def get_sabaq(db: DB):
    now = utcnow()
    lesson = svc.todays_lesson(db, local_date(now))
    if lesson is None:
        reason = svc.sabaq_lock(db, now)
        if reason:
            return {"locked": reason}
        lesson = svc.start_or_get_lesson(db, now)
        if lesson is None:
            return {"locked": "No new units left. Manzil and Sabqi keep running."}
    return _view(db, lesson)


class AttemptIn(BaseModel):
    item_id: int
    answer: str = ""
    elapsed_ms: int = 0


@router.post("/attempt")
def attempt(body: AttemptIn, db: DB):
    now = utcnow()
    lesson = svc.todays_lesson(db, local_date(now))
    if lesson is None or body.item_id not in lesson.items:
        raise HTTPException(404, "Item is not in today's Sabaq")
    item = db.get(Item, body.item_id)
    produce = _produce(item)
    if produce.introduced_at is not None:
        raise HTTPException(409, "Already attempted")
    exp, alts = cardsvc.expected(produce)
    g = grader.grade(body.answer, exp, alts)
    # The production card starts now with this first attempt; sibling cards start tomorrow.
    tomorrow, _ = day_bounds(local_date(now) + timedelta(days=1))
    for card in item.cards:
        if card is produce:
            scheduler.introduce(card, now)
            scheduler.review(card, g.rating, now)
        else:
            scheduler.introduce(card, now, due=tomorrow)
    db.add(
        ReviewLog(
            card_id=produce.id, ts=now, rating=g.rating, answer_given=body.answer,
            elapsed_ms=body.elapsed_ms, block="sabaq",
        )
    )  # fmt: skip
    svc.add_minutes(db, now, body.elapsed_ms)
    db.flush()
    if all(_produce(db.get(Item, i)).introduced_at is not None for i in lesson.items):
        lesson.status, lesson.completed_at = "done", now
        svc.mark_block(db, now, "sabaq")
    db.commit()
    return {
        "grade": {"rating": g.rating, "verdict": g.verdict, "expected": g.expected,
                  "notes": g.notes, "diff": g.diff},
        "item": cardsvc.item_reveal(item),
        "lesson_done": lesson.status == "done",
    }  # fmt: skip
