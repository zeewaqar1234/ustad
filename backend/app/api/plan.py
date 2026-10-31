"""V4: today's plan and the last plans with the numbers they were built from."""

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.auth import require_user
from app.db import DB, utcnow
from app.models import DailyPlan
from app.services import learner, planner

router = APIRouter(prefix="/api", dependencies=[Depends(require_user)])


@router.get("/plan")
def today_plan(db: DB):
    row = planner.get_or_build(db, utcnow())
    db.commit()
    return planner.view(row)


@router.get("/plans")
def plans(db: DB):
    """The last plans, newest first, each with the data it was built from (no silent behaviour)."""
    rows = db.scalars(
        select(DailyPlan).order_by(DailyPlan.date.desc()).limit(learner.method()["plans_listed"])
    )
    return {"plans": [{**planner.view(r), "data": r.data_json} for r in rows]}
