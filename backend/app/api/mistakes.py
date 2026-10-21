"""Ghalti Register (docs/modules.md §5.7): table, by-tag heat map, top 10 recurring."""

from fastapi import APIRouter, Depends

from app.core.auth import require_user
from app.db import DB
from app.services import ghalti

router = APIRouter(prefix="/api/mistakes", dependencies=[Depends(require_user)])


@router.get("")
def mistakes(db: DB):
    return ghalti.register(db)
