"""Diktat API (docs/modules.md §5.5). `say` is for the browser's speechSynthesis only; the screen does
not show it before an attempt."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.auth import require_user
from app.core.clock import local_date
from app.db import DB, utcnow
from app.listening import diktat
from app.models import DictationItem

router = APIRouter(prefix="/api/dictation", dependencies=[Depends(require_user)])


@router.get("/today")
def today(db: DB):
    d = local_date(utcnow())
    rows = diktat.todays(db, d)
    db.commit()
    return {
        "date": d.isoformat(), "total": len(rows), "done": sum(1 for r in rows if r.result_json),
        "sentences": [{"ref": r.ref, "say": r.de, "words": len(r.de.split()),
                       "done": r.result_json is not None, "result": r.result_json} for r in rows],
    }  # fmt: skip


class CheckIn(BaseModel):
    ref: str = Field(max_length=40)
    typed: str = Field(max_length=500)
    elapsed_ms: int = Field(default=0, ge=0)
    replays: int = Field(default=0, ge=0)


@router.post("/check")
def check(body: CheckIn, db: DB):
    d = local_date(utcnow())
    row = db.scalar(select(DictationItem).where(DictationItem.date == d,
                                                DictationItem.ref == body.ref))  # fmt: skip
    if row is None:
        raise HTTPException(404, "Not one of today's sentences")
    res = diktat.submit(db, utcnow(), row, body.typed, body.elapsed_ms, body.replays)
    db.commit()
    return res
