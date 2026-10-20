"""Manzil + Sabqi reviews. The prompt never carries the answer; the answer comes after an attempt."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import require_user
from app.core.clock import day_bounds, local_date
from app.db import DB, utcnow
from app.models import Card, ReviewLog
from app.services import cards as cardsvc
from app.services import daily as svc
from app.srs import grader, scheduler

router = APIRouter(prefix="/api/review", dependencies=[Depends(require_user)])

Block = Literal["manzil", "sabqi"]


def _next(db: Session, block: Block) -> Card | None:
    now = utcnow()
    if block == "manzil":
        return svc.manzil_next(db, now)
    queue = svc.sabqi_queue(db, now)
    return queue[0] if queue else None


@router.get("/next")
def next_card(db: DB, block: Block = "manzil"):
    now = utcnow()
    card = _next(db, block)
    if card is None:
        practised = True
        if block == "sabqi":
            start, end = day_bounds(local_date(now))
            practised = bool(
                db.scalar(
                    select(func.count())
                    .select_from(ReviewLog)
                    .where(ReviewLog.block == "sabqi", ReviewLog.ts >= start, ReviewLog.ts < end)
                )
            )
        if practised:
            svc.mark_block(db, now, block)
        return {"card": None, "left": 0}
    left = svc.due_count(db, now) if block == "manzil" else len(svc.sabqi_queue(db, now))
    return {"card": cardsvc.prompt(card), "left": left}


class RevealIn(BaseModel):
    card_id: int


@router.post("/reveal")
def reveal(body: RevealIn, db: DB):
    """Recognition cards: Zee answers in his head, then reveals and rates himself."""
    card = db.get(Card, body.card_id)
    if card is None or card.card_type != "recog":
        raise HTTPException(404, "No such recognition card")
    return {"item": cardsvc.item_reveal(card.item)}


class AnswerIn(BaseModel):
    card_id: int
    block: Block = "manzil"
    answer: str | None = None  # typed / chosen answer
    self_rating: int | None = Field(None, ge=1, le=4)  # recog cards only
    elapsed_ms: int = 0


@router.post("/answer")
def answer(body: AnswerIn, db: DB):
    now = utcnow()
    card = db.get(Card, body.card_id)
    if card is None or card.introduced_at is None:
        raise HTTPException(404, "No such card")
    result = None
    if card.card_type == "recog":
        if body.self_rating is None:
            raise HTTPException(422, "self_rating required for recognition cards")
        rating, auto = body.self_rating, False
    else:
        exp, alts = cardsvc.expected(card)
        g = grader.grade(body.answer or "", exp, alts)
        rating, auto = g.rating, True
        result = {"rating": g.rating, "verdict": g.verdict, "expected": g.expected,
                  "notes": g.notes, "diff": g.diff}  # fmt: skip
    scheduled = body.block == "manzil"
    if scheduled:
        scheduler.review(card, rating, now)
    db.add(
        ReviewLog(
            card_id=card.id, ts=now, rating=rating, answer_given=body.answer, auto_graded=auto,
            elapsed_ms=body.elapsed_ms, block=body.block, scheduled=scheduled,
        )
    )  # fmt: skip
    svc.add_minutes(db, now, body.elapsed_ms)
    db.commit()
    return {
        "rating": rating,
        "grade": result,
        "item": cardsvc.item_reveal(card.item),
        "next_due": card.due.isoformat() if card.due else None,
    }
