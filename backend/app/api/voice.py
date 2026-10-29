"""Voice tutor API (docs/modules.md §5.4): roleplay / free-talk sessions, shadowing, settings, TTS fallback.

The browser does STT and TTS (Web Speech API); this API gets text only. A turn reaches the server
only when Zee taps Send, so the server never ends a turn. Typed turns are treated the same as spoken ones.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.auth import require_user
from app.core.clock import local_date
from app.db import DB, utcnow
from app.llm.provider import Provider, get_provider
from app.models import Attempt, Card, Item, Profile, VoiceSession
from app.services import daily, evidence
from app.voice import shadowing, tts
from app.voice import tutor as svc
from app.voice.disfluency import clean

router = APIRouter(prefix="/api/voice", dependencies=[Depends(require_user)])
LLM = Annotated[Provider, Depends(get_provider)]
DEFAULTS = {"show_fluency": False, "talk_mode": "tap"}


def voice_settings(db) -> dict:
    p = db.get(Profile, 1)
    return {**DEFAULTS, **((p.settings_json or {}).get("voice", {}) if p else {})}


@router.get("/settings")
def get_settings(db: DB):
    return voice_settings(db)


class SettingsIn(BaseModel):
    show_fluency: bool = False
    talk_mode: Literal["hold", "tap"] = "tap"


@router.post("/settings")
def set_settings(body: SettingsIn, db: DB):
    p = db.get(Profile, 1)
    p.settings_json = {**(p.settings_json or {}), "voice": body.model_dump()}
    db.commit()
    return voice_settings(db)


@router.get("/scenarios")
def list_scenarios():
    return [
        {k: s[k] for k in ("code", "kind", "title", "level", "setting_en", "goal_en", "address",
                           "chunks")}
        for s in svc.scenarios()
    ]  # fmt: skip


def _session(db, sid: int) -> VoiceSession:
    s = db.get(VoiceSession, sid)
    if s is None:
        raise HTTPException(404, "No such session")
    return s


def view(s: VoiceSession) -> dict:
    sc = svc.scenario(s.scenario_code, include_flagged=True)
    return {"id": s.id, "mode": s.mode, "scenario": {"code": sc["code"], "title": sc["title"],
            "goal_en": sc["goal_en"], "chunks": sc["chunks"]}, "status": s.status,
            "turns": [svc.view_turn(t) for t in s.turns], "review": s.review_json}  # fmt: skip


class StartIn(BaseModel):
    scenario_code: str


@router.post("/session")
def start(body: StartIn, db: DB):
    try:
        sc = svc.scenario(body.scenario_code)
    except KeyError:
        raise HTTPException(404, "No such scenario") from None
    s = svc.start(db, sc)
    db.commit()
    return view(s)


@router.get("/session/{sid}")
def get_session(sid: int, db: DB):
    return view(_session(db, sid))


class TurnIn(BaseModel):
    session_id: int
    text: str = Field(min_length=1, max_length=2000)
    input_mode: Literal["voice", "text"] = "voice"
    stt_restarts: int = Field(default=0, ge=0)
    elapsed_ms: int = Field(default=0, ge=0)


@router.post("/turn")
def turn(body: TurnIn, db: DB, llm: LLM):
    s = _session(db, body.session_id)
    if s.status != "open":
        raise HTTPException(409, "Session already reviewed")
    if not clean(body.text):
        raise HTTPException(422, "Only fillers were heard. Say it again or type it.")
    now = utcnow()
    t = svc.take_turn(db, llm, s, body.text, body.input_mode, body.stt_restarts)
    # spoken turns are speaking time, typed turns are writing time
    evidence.add_activity(db, now, "speaking" if body.input_mode == "voice" else "writing",
                          body.elapsed_ms)  # fmt: skip
    db.commit()
    return svc.view_turn(t)


@router.post("/session/{sid}/review")
def review(sid: int, db: DB, llm: LLM):
    """End the session: grade every line in one call (long timeout, settings.ollama_review_timeout),
    stars, Ghalti. Repeatable while the result is LanguageTool-only."""
    s = _session(db, sid)
    if s.status == "reviewed":
        return view(s)
    if not any(t.user_clean for t in s.turns):
        s.status, s.ended = "reviewed", utcnow()
        s.review_json = {"source": None, "lines": [], "teaching_points": [],
                         "summary": svc.summary([])}  # fmt: skip
    else:
        svc.review(db, llm, s)
    db.commit()
    return view(s)


# --- Shadowing (Takrar) -------------------------------------------------------------------------


def _shadow_text(item: Item) -> str:
    return item.example_de if item.kind in ("word", "chunk") and item.example_de else item.de


@router.get("/shadow")
def shadow_sentences(db: DB, limit: int = 8):
    """Sentences from today's Sabaq, only items already attempted (ask before tell), else recent items."""
    today = local_date(utcnow())
    lesson = daily.todays_lesson(db, today)
    ids = list(lesson.items) if lesson else []
    q = (
        select(Item)
        .join(Card, Card.item_id == Item.id)
        .where(Card.card_type == "produce", Card.introduced_at.is_not(None), Item.status == "ok",
               Item.deck != "ghalti")
    )  # fmt: skip
    today_items = list(db.scalars(q.where(Item.id.in_(ids)))) if ids else []
    source = "sabaq"
    items = today_items
    if not items:
        source = "recent"
        items = list(db.scalars(q.order_by(Card.introduced_at.desc()).limit(min(limit, 20))))
    return {
        "source": source,
        "sentences": [{"item_id": i.id, "de": _shadow_text(i), "en": i.example_en or i.en}
                      for i in items[: min(limit, 20)]],
    }  # fmt: skip


class ShadowIn(BaseModel):
    """Either a Sabaq item, or a "Say it better" line (session_id + turn). The reference text is
    always looked up on the server."""

    item_id: int | None = None
    session_id: int | None = None
    turn: int | None = None
    transcript: str = Field(max_length=2000)
    stt_restarts: int = Field(default=0, ge=0)
    elapsed_ms: int = Field(default=0, ge=0)


def _shadow_reference(db, body: ShadowIn) -> tuple[str, str]:
    if body.item_id is not None:
        item = db.get(Item, body.item_id)
        # ask before tell: only items already attempted (same rule as the GET list)
        taught = item is not None and any(
            c.card_type == "produce" and c.introduced_at is not None for c in item.cards
        )
        if taught and item.status == "ok" and item.deck != "ghalti":
            return _shadow_text(item), f"shadow:{item.id}"
    elif body.session_id is not None:
        s = db.get(VoiceSession, body.session_id)
        lines = (s.review_json or {}).get("lines", []) if s else []
        line = next((ln for ln in lines if ln["turn"] == body.turn), None)
        if line is not None:
            return line["better"], f"shadow_better:{s.id}:{body.turn}"
    raise HTTPException(404, "No such sentence")


@router.post("/shadow")
def shadow_attempt(body: ShadowIn, db: DB):
    reference, ref = _shadow_reference(db, body)
    result = shadowing.score(reference, body.transcript)
    now = utcnow()
    evidence.add_activity(db, now, "speaking", body.elapsed_ms)
    evidence.record_event(db, now, "speaking", "shadow", "correct" if result["pct"] >= 90 else "error",
                          source_ref=ref, meta={"kind": "recognition", "pct": result["pct"]})  # fmt: skip
    db.add(Attempt(ts=utcnow(), task_ref=ref, input=body.transcript[:2000],
                   correct=result["pct"] >= 80, score=result["pct"]))  # fmt: skip
    db.commit()
    return shadowing.visible_scores(result, voice_settings(db)["show_fluency"])


# --- Server TTS fallback (Piper) ----------------------------------------------------------------


class TTSIn(BaseModel):
    text: str = Field(min_length=1, max_length=tts.MAX_CHARS)


@router.get("/tts/status")
def tts_status():
    return {"piper": tts.configured()}


@router.post("/tts")
def speak(body: TTSIn, db: DB):
    try:
        path = tts.synth(db, body.text)
    except tts.TTSUnavailable as e:
        raise HTTPException(503, str(e)) from None
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    db.commit()
    return FileResponse(path, media_type="audio/wav")
