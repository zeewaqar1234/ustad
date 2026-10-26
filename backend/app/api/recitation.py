"""Pahara recitation, typed mode and by voice (docs/modules.md §5.2, §5.4 mode 2)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import require_user
from app.core.clock import local_date
from app.db import DB, utcnow
from app.models import Attempt
from app.services import evidence
from app.services import recitation as svc

router = APIRouter(prefix="/api/recitation", dependencies=[Depends(require_user)])


@router.get("")
def list_tables(db: DB):
    today = local_date(utcnow())
    out = []
    for t in svc.tables():
        p = svc.progress(db, t["code"])
        out.append({"code": t["code"], "title": t["title"], "group": t["group"],
                    "stage": svc.shown_stage(p, today), "passes": p.passes,
                    "passed_today": p.last_passed == today})  # fmt: skip
    db.commit()
    return out


def _table(code: str) -> dict:
    try:
        return svc.table(code)
    except KeyError:
        raise HTTPException(404, "No such table") from None


@router.get("/{code}")
def get_table(code: str, db: DB):
    t = _table(code)
    p = svc.progress(db, code)
    db.commit()
    return svc.view(t, svc.shown_stage(p, local_date(utcnow())))


def _recitation_event(db, now, code: str, result: dict, mode: str) -> None:
    evidence.record_event(db, now, "grammar", "recitation", "correct" if result["passed"] else "error",
                          source_ref=code, meta={"mode": mode, "wrong_cells": result["wrong"]})  # fmt: skip


class RecitalIn(BaseModel):
    rows: list[list[str]]
    elapsed_ms: int = 0


@router.post("/{code}")
def recite(code: str, body: RecitalIn, db: DB):
    _table(code)
    now = utcnow()
    result = svc.check(db, code, body.rows, local_date(now))
    _recitation_event(db, now, code, result, "typed")
    evidence.add_activity(db, now, "grammar", body.elapsed_ms)
    db.add(Attempt(ts=now, task_ref=f"recitation:{code}", correct=result["passed"],
                   input=str(body.rows)[:2000], score=result["wrong"]))  # fmt: skip
    db.commit()
    return result


class VoiceRecitalIn(BaseModel):
    rows: list[str] = Field(max_length=40)  # one transcript per row, from the browser's STT
    elapsed_ms: int = 0


@router.post("/{code}/voice")
def recite_by_voice(code: str, body: VoiceRecitalIn, db: DB):
    """Same stages and grading as typed mode; each row's transcript is matched cell by cell."""
    _table(code)
    now = utcnow()
    rows = svc.rows_from_speech(code, body.rows)
    result = svc.check(db, code, rows, local_date(now))
    result["heard"] = body.rows
    _recitation_event(db, now, code, result, "voice")
    evidence.add_activity(db, now, "grammar", body.elapsed_ms)
    db.add(Attempt(ts=now, task_ref=f"recitation_voice:{code}", correct=result["passed"],
                   input=" | ".join(body.rows)[:2000], score=result["wrong"]))  # fmt: skip
    db.commit()
    return result
