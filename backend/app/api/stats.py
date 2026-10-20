from fastapi import APIRouter, Depends

from app.core.auth import require_user
from app.core.clock import local_date
from app.db import DB, utcnow
from app.models import Profile
from app.services.streak import study_days_last_7

router = APIRouter(prefix="/api/stats", dependencies=[Depends(require_user)])


@router.get("/gate")
def gate(db: DB):
    """Builder gate (docs/engagement.md §6.6): new features only if Zee studied >= 5 of the last 7 days."""
    days = study_days_last_7(db, local_date(utcnow()))
    profile = db.get(Profile, 1)
    override = bool(profile and profile.gate_override)
    return {"study_days_last_7": days, "open": days >= 5 or override, "override": override}
