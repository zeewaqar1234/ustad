"""Reader API (docs/modules.md §5.3). Comprehension answers stay on the server until an attempt."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import require_user
from app.db import DB, utcnow
from app.llm.provider import LLMInvalid, LLMUnavailable, Provider, get_provider
from app.models import ReadingText
from app.reading import author
from app.reading import texts as svc

router = APIRouter(prefix="/api/texts", dependencies=[Depends(require_user)])
LLM = Annotated[Provider, Depends(get_provider)]


def _text(db, tid: int) -> ReadingText:
    t = db.get(ReadingText, tid)
    if t is None:
        raise HTTPException(404, "No such text")
    return t


@router.get("")
def list_texts(db: DB):
    todays, every = svc.today_and_library(db, svc.today(utcnow()))
    db.commit()
    return {"today": [svc.summary(db, t) for t in todays],
            "library": [svc.summary(db, t) for t in every]}  # fmt: skip


@router.get("/gloss")
def gloss(word: str, db: DB, text_id: int | None = None):
    if not word.strip() or len(word) > 60:
        raise HTTPException(422, "One word, please")
    return svc.gloss(db, word, db.get(ReadingText, text_id) if text_id else None)


@router.post("/generate")
def generate(db: DB, llm: LLM):
    """Make today's and tomorrow's texts now (the nightly job does the same at night)."""
    try:
        made = author.ensure(db, llm, svc.today(utcnow()), days=2)
    except (LLMUnavailable, LLMInvalid) as e:
        db.commit()  # texts finished before the failure stay
        raise HTTPException(503, f"The local model is offline or failed: {e}") from None
    db.commit()
    return {"made": len(made), "texts": [svc.summary(db, t) for t in made]}


@router.get("/{tid}")
def get_text(tid: int, db: DB):
    return svc.detail(db, _text(db, tid))


class AddIn(BaseModel):
    word: str = Field(min_length=1, max_length=60)
    lemma: str | None = Field(default=None, max_length=100)
    en: str = Field(min_length=1, max_length=300)
    gender: Literal["m", "f", "n"] | None = None


@router.post("/{tid}/add")
def add(tid: int, body: AddIn, db: DB):
    item, added = svc.add_word(db, utcnow(), _text(db, tid), body.word, body.lemma, body.en,
                               body.gender)  # fmt: skip
    db.commit()
    return {"item_id": item.id, "added": added}


class AnswersIn(BaseModel):
    answers: dict[str, list[int]]
    elapsed_ms: int = Field(default=0, ge=0)


@router.post("/{tid}/answers")
def answers(tid: int, body: AnswersIn, db: DB):
    res = svc.check_answers(db, utcnow(), _text(db, tid), body.answers, body.elapsed_ms)
    db.commit()
    return res


class ReadIn(BaseModel):
    elapsed_ms: int = Field(default=0, ge=0)


@router.post("/{tid}/read")
def read(tid: int, body: ReadIn, db: DB):
    svc.mark_read(db, utcnow(), _text(db, tid), body.elapsed_ms)
    db.commit()
    return {"ok": True}
