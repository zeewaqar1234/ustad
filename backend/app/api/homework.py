"""Homework + Tagebuch with red-pen grading (docs/modules.md §5.6).

A result from LanguageTool alone (tutor model offline) is provisional: shown, but not written to the
Ghalti Register, so a later re-grade does not count the same mistakes twice.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.patterns import current_pattern
from app.core.auth import require_user
from app.core.clock import local_date
from app.db import DB, utcnow
from app.llm.provider import Provider, get_provider
from app.models import Homework
from app.services import ghalti, grading

router = APIRouter(prefix="/api/homework", dependencies=[Depends(require_user)])
LLM = Annotated[Provider, Depends(get_provider)]
FALLBACK_PROMPT = "Write 4 sentences about your day. Use weil once and one verb in the Perfekt."


def view(h: Homework) -> dict:
    return {"id": h.id, "kind": h.kind, "assigned": h.assigned.isoformat(), "prompt": h.prompt,
            "submission": h.submission, "grade": h.grade_json, "status": h.status or "open",
            "pattern_id": h.pattern_id}  # fmt: skip


def _grade(db: Session, llm: Provider, h: Homework, text: str) -> None:
    now = utcnow()
    grade = grading.grade_text(db, llm, text, h.prompt if h.kind == "homework" else "")
    h.submission, h.grade_json, h.submitted_at = text, grade, now
    h.status = "lt_only" if grade["source"] == "languagetool_only" else "graded"
    if h.status == "graded":
        ghalti.from_grade(db, now, grade, h.kind)


def _today_row(db: Session) -> Homework | None:
    return db.scalar(
        select(Homework)
        .where(Homework.kind == "homework", Homework.assigned == local_date(utcnow()))
        .limit(1)
    )


def _new_today(db: Session) -> Homework:
    d = local_date(utcnow())
    p = current_pattern(db)
    return Homework(kind="homework", assigned=d, due=d, pattern_id=p.id if p else None,
                    prompt=(p.homework if p and p.homework else FALLBACK_PROMPT))  # fmt: skip


@router.get("/today")
def today(db: DB):
    """Read only. Before Zee starts, a preview with id null; POST /today creates the row."""
    h = _today_row(db)
    return view(h if h is not None else _new_today(db))


@router.post("/today")
def start_today(db: DB):
    h = _today_row(db)
    if h is None:
        h = _new_today(db)
        db.add(h)
        db.commit()
    return view(h)


class SubmitIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


@router.post("/{hw_id}/submit")
def submit(hw_id: int, body: SubmitIn, db: DB, llm: LLM):
    h = db.get(Homework, hw_id)
    if h is None or h.kind == "placement":
        raise HTTPException(404, "No such homework")
    if h.status == "graded":
        raise HTTPException(409, "Already graded")
    _grade(db, llm, h, body.text)
    db.commit()
    return view(h)


@router.post("/{hw_id}/regrade")
def regrade(hw_id: int, db: DB, llm: LLM):
    """Retry the tutor model for a LanguageTool-only result."""
    h = db.get(Homework, hw_id)
    if h is None or h.status != "lt_only" or not h.submission:
        raise HTTPException(409, "Only LanguageTool-only results can be re-graded")
    _grade(db, llm, h, h.submission)
    db.commit()
    return view(h)


class TagebuchIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


@router.post("/tagebuch")
def tagebuch(body: TagebuchIn, db: DB, llm: LLM):
    d = local_date(utcnow())
    h = Homework(kind="tagebuch", assigned=d, due=d, prompt="Tagebuch")
    db.add(h)
    db.flush()
    _grade(db, llm, h, body.text)
    db.commit()
    return view(h)


@router.get("")
def history(db: DB, kind: Literal["homework", "tagebuch", "all"] = "all", limit: int = 30):
    q = select(Homework).where(Homework.kind != "placement")
    if kind != "all":
        q = q.where(Homework.kind == kind)
    return [view(h) for h in db.scalars(q.order_by(Homework.id.desc()).limit(min(limit, 100)))]


@router.get("/{hw_id}")
def get_one(hw_id: int, db: DB):
    h = db.get(Homework, hw_id)
    if h is None:
        raise HTTPException(404, "No such homework")
    return view(h)
