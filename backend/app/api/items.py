"""needs_review queue: items, patterns and placement answers LanguageTool flagged.

They stay out of Sabaq, drills and the placement test until approved. Approving a Ghalti item starts
its fix_sentence card.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app import content
from app.core.auth import require_user
from app.db import DB, utcnow
from app.models import Item, Pattern, Profile
from app.services import placement
from app.srs import scheduler

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
            "example_de": i.wrong if i.deck == "ghalti" else i.example_de,
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
    if item.deck == "ghalti":
        for card in item.cards:
            if card.introduced_at is None:
                scheduler.introduce(card, utcnow())
    db.commit()
    return {"ok": True}


@router.get("/needs-review/grammar")
def grammar_review(db: DB):
    patterns = db.scalars(select(Pattern).where(Pattern.status == "needs_review"))
    ok = placement.approved(db)
    pl = [i for i in content.load("placement")["items"]
          if i["status"] == "needs_review" and i["id"] not in ok]  # fmt: skip
    return {
        "patterns": [{"code": p.code, "title": p.title, "notes": p.review_notes} for p in patterns],
        "placement": [{"id": i["id"], "prompt": i["prompt"], "answer": i["answer"],
                       "notes": i["review_notes"]} for i in pl],
    }  # fmt: skip


@router.post("/patterns/{code}/approve")
def approve_pattern(code: str, db: DB):
    p = db.scalar(select(Pattern).where(Pattern.code == code))
    if p is None:
        raise HTTPException(404, "No such pattern")
    p.status = "ok"
    db.commit()
    return {"ok": True}


@router.post("/placement/{item_id}/approve")
def approve_placement(item_id: str, db: DB):
    if item_id not in {i["id"] for i in content.load("placement")["items"]}:
        raise HTTPException(404, "No such placement item")
    profile = db.get(Profile, 1)
    settings = dict(profile.settings_json or {})
    settings["placement_approved"] = sorted({*settings.get("placement_approved", []), item_id})
    profile.settings_json = settings
    db.commit()
    return {"ok": True}
