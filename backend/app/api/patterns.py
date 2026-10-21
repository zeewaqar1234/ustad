"""Grammar patterns + drills (docs/modules.md §5.2). Drills never send their answer before an attempt."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import require_user
from app.db import DB, utcnow
from app.llm.provider import Provider, get_provider
from app.models import Attempt, Pattern
from app.services import daily as dailysvc
from app.services import drills, ghalti, grading

router = APIRouter(prefix="/api", dependencies=[Depends(require_user)])
LLM = Annotated[Provider, Depends(get_provider)]
DONE_PCT = 0.8


def current_pattern(db: Session) -> Pattern | None:
    """Next pattern in the fixed order that is approved, not done and not known from placement."""
    return db.scalar(
        select(Pattern)
        .where(
            Pattern.status == "ok",
            Pattern.done_at.is_(None),
            Pattern.known_from_placement.is_(False),
        )
        .order_by(Pattern.order)
        .limit(1)
    )


def _get(db: Session, code: str) -> Pattern:
    p = db.scalar(select(Pattern).where(Pattern.code == code))
    if p is None:
        raise HTTPException(404, "No such pattern")
    return p


@router.get("/patterns")
def list_patterns(db: DB):
    cur = current_pattern(db)
    rows = db.scalars(select(Pattern).order_by(Pattern.order))
    return {
        "current": cur.code if cur else None,
        "patterns": [
            {"code": p.code, "order": p.order, "group": p.group, "title": p.title,
             "status": p.status, "done": p.done_at is not None, "known": p.known_from_placement,
             "best_pct": p.best_pct, "rounds": p.rounds}
            for p in rows
        ],
    }  # fmt: skip


@router.get("/patterns/{code}")
def pattern_card(code: str, db: DB):
    p = _get(db, code)
    return {
        "code": p.code, "order": p.order, "group": p.group, "title": p.title, "rule_en": p.rule_en,
        "slot_diagram": p.slot_diagram, "examples": p.examples_json, "common_error": p.common_error,
        "tags": p.tags, "homework": p.homework, "status": p.status, "review_notes": p.review_notes,
        "done": p.done_at is not None, "best_pct": p.best_pct,
        "drill_types": sorted({d.type for d in drills.generate(p)}),
    }  # fmt: skip


@router.get("/drills/{code}")
def drill_round(code: str, db: DB):
    p = _get(db, code)
    if p.status != "ok":
        raise HTTPException(409, "This pattern is waiting in the check queue.")
    return {"code": p.code, "title": p.title, "started": utcnow().isoformat(),
            "drills": [d.public() for d in drills.generate(p)]}  # fmt: skip


class DrillAnswerIn(BaseModel):
    drill_id: str
    answer: str = ""
    answers: list[str] = []
    elapsed_ms: int = 0


@router.post("/drills/answer")
def drill_answer(body: DrillAnswerIn, db: DB, llm: LLM):
    now = utcnow()
    code = body.drill_id.split(":")[0]
    p = _get(db, code)
    if p.status != "ok":
        raise HTTPException(409, "This pattern is waiting in the check queue.")
    try:
        exp = drills.expected(p, body.drill_id)
    except (KeyError, IndexError, ValueError):
        raise HTTPException(404, "No such drill") from None
    kind = body.drill_id.split(":")[1]
    grade = None
    if kind == "free":
        if not body.answer.strip():
            raise HTTPException(422, "Write a sentence first.")
        task = p.drills_json["free"]["prompt_en"]
        grade = grading.grade_text(db, llm, body.answer, task)
        missing = drills.missing_words(body.answer, exp.must_include)
        serious = [e for e in grade["errors"] if e["severity"] >= 2]
        correct = not missing and not serious
        result = {"correct": correct, "missing": missing, "grade": grade, "tag": exp.tag}
        if grade["source"] != "languagetool_only":  # provisional results stay out of Ghalti
            ghalti.from_grade(db, now, grade, "drill")
    else:
        result = drills.check(p, body.drill_id, body.answer, body.answers)
        correct = result["correct"]
        same_words = any(n.startswith("Same words") for n in result.get("notes", []))
        if not correct and not same_words:
            given = " / ".join(body.answers) if kind == "fill" else body.answer
            ghalti.record(db, now, "drill", given or "(no answer)", result["expected"], exp.tag,
                          f"{p.title} ({kind})")  # fmt: skip
    db.add(
        Attempt(ts=now, task_ref=f"drill:{body.drill_id}", correct=correct,
                input=body.answer or " / ".join(body.answers),
                error_tags=[] if correct else [exp.tag])
    )  # fmt: skip
    dailysvc.add_minutes(db, now, body.elapsed_ms)
    db.commit()
    return result


class FinishIn(BaseModel):
    started: datetime


@router.post("/drills/{code}/finish")
def finish_round(code: str, body: FinishIn, db: DB):
    """Score = first attempt per drill since the round started. >= 80 % marks the pattern done."""
    now = utcnow()
    p = _get(db, code)
    ids = [d.id for d in drills.generate(p)]
    first: dict[str, bool] = {}
    rows = db.scalars(
        select(Attempt)
        .where(Attempt.task_ref.like(f"drill:{code}:%"), Attempt.ts >= body.started)
        .order_by(Attempt.id)
    )
    for a in rows:
        first.setdefault(a.task_ref.removeprefix("drill:"), a.correct)
    pct = sum(first.get(i, False) for i in ids) / len(ids)
    p.rounds += 1
    p.best_pct = max(p.best_pct, pct)
    newly_done = pct >= DONE_PCT and p.done_at is None
    if newly_done:
        p.done_at = now
    db.commit()
    return {"pct": round(pct, 2), "answered": len(first), "total": len(ids),
            "done": p.done_at is not None, "newly_done": newly_done}  # fmt: skip
