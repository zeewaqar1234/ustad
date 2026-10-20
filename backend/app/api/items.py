"""needs_review queue: items LanguageTool flagged. They stay out of Sabaq until approved."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.core.auth import require_user
from app.db import DB
from app.models import Item

router = APIRouter(prefix="/api/items", dependencies=[Depends(require_user)])


@router.get("/needs-review")
def needs_review(db: DB):
    items = db.scalars(select(Item).where(Item.status == "needs_review").order_by(Item.unit_order))
    return [
        {
            "id": i.id,
            "deck": i.deck,
            "de": i.de,
            "en": i.en,
            "example_de": i.example_de,
            "notes": i.review_notes,
        }
        for i in items
    ]


@router.post("/{item_id}/approve")
def approve(item_id: int, db: DB):
    item = db.get(Item, item_id)
    if item is None:
        raise HTTPException(404, "No such item")
    item.status = "ok"
    db.commit()
    return {"ok": True}
