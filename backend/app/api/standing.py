"""V2: Stand box, Progress page, goals and exam results (docs/v2/metrics.md)."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.auth import require_user
from app.core.clock import local_date
from app.db import DB, utcnow
from app.models import ExamResult
from app.services import standing as st

router = APIRouter(prefix="/api", dependencies=[Depends(require_user)])


@router.get("/standing")
def get_standing(db: DB):
    return st.standing(db, utcnow())


@router.get("/progress")
def get_progress(db: DB):
    return st.progress(db, utcnow())


class GoalsIn(BaseModel):
    target_exam: Literal["B1", "B2"]
    target_date: date | None = None
    weekly_hours: float | None = Field(default=None, gt=0, le=100)


@router.get("/goals")
def get_goals(db: DB):
    return st.get_goals(db)


@router.post("/goals")
def set_goals(body: GoalsIn, db: DB):
    if body.target_date and body.target_date <= local_date(utcnow()):
        raise HTTPException(422, "Pick a target date in the future, or leave it empty.")
    out = st.set_goals(db, body.target_exam, body.target_date, body.weekly_hours)
    db.commit()
    return out


class ResultIn(BaseModel):
    level: Literal["B1", "B2"]
    module: Literal["lesen", "hoeren", "schreiben", "sprechen"]
    kind: Literal["real_exam", "practice_full", "practice_teil"]
    taken: date
    teil: int | None = None
    raw: float | None = None
    teile: dict[int, float] | None = None
    points: float | None = None
    note: str = Field(default="", max_length=300)


@router.get("/exam-results")
def list_results(db: DB):
    rows = db.scalars(select(ExamResult).order_by(ExamResult.taken.desc(), ExamResult.id.desc()))
    return {"results": [
        {"id": r.id, "taken": r.taken.isoformat(), "level": r.level, "module": r.module, "kind": r.kind,
         "teil": r.teil, "raw": r.raw, "raw_max": r.raw_max, "points": r.points,
         "points_max": r.points_max, "note": r.note}
        for r in rows
    ]}  # fmt: skip


@router.get("/exam-format")
def exam_format():
    """The official task lists and scoring Zee enters results against (data/official)."""
    return {lv: {"exam": st.exam(lv)["exam"], "pass_points": st.exam(lv)["pass_points"],
                 "modules": st.exam(lv)["modules"], "sources": st.exam(lv)["sources"]}
            for lv in st.LEVELS}  # fmt: skip


@router.post("/exam-results")
def add_result(body: ResultIn, db: DB):
    if body.taken > local_date(utcnow()):
        raise HTTPException(422, "The date is in the future.")
    try:
        e = st.entry_points(body.level, body.module, body.kind, teil=body.teil, raw=body.raw,
                            teile=body.teile, points=body.points)  # fmt: skip
    except st.EntryError as err:
        raise HTTPException(422, str(err)) from err
    row = ExamResult(taken=body.taken, level=body.level, module=body.module, kind=body.kind,
                     teil=body.teil if body.kind == "practice_teil" else None, raw=e["raw"],
                     raw_max=e["raw_max"], points=e["points"], points_max=e["points_max"],
                     note=body.note, meta_json=e["meta"])  # fmt: skip
    db.add(row)
    db.commit()
    return st.standing(db, utcnow())
