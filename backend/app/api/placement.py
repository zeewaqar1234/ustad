"""Placement test: items without answers, then score, level_band, known items, writing sample."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app import content
from app.core.auth import require_user
from app.core.clock import local_date
from app.db import DB, utcnow
from app.llm.provider import Provider, get_provider
from app.models import Homework, PlacementResult, Profile
from app.services import evidence, ghalti, grading
from app.services import placement as svc
from app.services.ghalti import sentences

router = APIRouter(prefix="/api/placement", dependencies=[Depends(require_user)])
LLM = Annotated[Provider, Depends(get_provider)]


@router.get("")
def get_test(db: DB):
    last = db.query(PlacementResult).order_by(PlacementResult.id.desc()).first()
    return {
        "items": [svc.public(i) for i in svc.items(db)],
        "writing": content.load("placement")["writing"],
        "last_result": {"ts": last.ts.isoformat(), "level_band": last.level_band} if last else None,
    }


class PlacementIn(BaseModel):
    answers: dict[str, str]
    writing: str = Field(min_length=1, max_length=5000)


@router.post("")
def submit(body: PlacementIn, db: DB, llm: LLM):
    now = utcnow()
    by_band, results = svc.score(db, body.answers)
    if not results:
        raise HTTPException(409, "No placement items available")
    writing = content.load("placement")["writing"]
    if len(sentences(body.writing)) < writing["min_sentences"]:
        raise HTTPException(422, f"Write at least {writing['min_sentences']} sentences.")
    grade = grading.grade_text(db, llm, body.writing, writing["prompt_en"])
    d = local_date(now)
    hw = Homework(kind="placement", assigned=d, due=d, prompt=writing["prompt_en"],
                  submission=body.writing, grade_json=grade, submitted_at=now,
                  status="lt_only" if grade["source"] == "languagetool_only" else "graded")  # fmt: skip
    db.add(hw)
    db.flush()
    if hw.status == "graded":
        ghalti.from_grade(db, now, grade, "placement")
        evidence.record_grade(db, now, grade, skill="writing", source="placement",
                              source_ref=f"homework:{hw.id}")  # fmt: skip
    for r in results:
        evidence.record_event(
            db, now, "grammar" if r["item"]["skill"] == "grammar" else "vocab", "placement",
            "correct" if r["ok"] else "error", source_ref=r["id"],
            pattern_code=r["item"].get("pattern") or None, meta={"band": r["item"]["band"]},
        )  # fmt: skip
    band = svc.level(by_band, grade["score_10"])
    marked = svc.mark_known(db, now, results)
    profile = db.get(Profile, 1)
    profile.level_band = band
    db.add(PlacementResult(ts=now, answers=body.answers, by_band=by_band, level_band=band,
                           writing_homework_id=hw.id, items_marked=marked))  # fmt: skip
    db.commit()
    return {
        "level_band": band, "by_band": by_band, "items_marked": marked, "writing": grade,
        "results": [{k: r[k] for k in ("id", "given", "expected", "ok")} for r in results],
    }  # fmt: skip
