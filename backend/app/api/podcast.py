"""Commute Podcast API (docs/modules.md §5.5). Audio is made by Piper on the server."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.core.auth import require_user
from app.core.clock import local_date
from app.db import DB, utcnow
from app.listening import podcast
from app.models import AudioAsset
from app.voice import tts

router = APIRouter(prefix="/api/podcast", dependencies=[Depends(require_user)])


@router.get("/status")
def status(db: DB):
    last = podcast.latest(db)
    return {"piper": tts.configured(), "english_voice": podcast.english_voice(),
            "encoder": "mp3" if podcast.ffmpeg() else "wav",
            "latest": podcast.view(last) if last else None}  # fmt: skip


@router.get("/script")
def script(db: DB):
    return {"items": [s.view() for s in podcast.script(db, local_date(utcnow()))]}


@router.post("/build")
def build(db: DB):
    try:
        asset = podcast.build(db, utcnow())
    except tts.TTSUnavailable as e:
        raise HTTPException(503, str(e)) from None
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    db.commit()
    return podcast.view(asset)


@router.get("/{aid}/audio")
def audio(aid: int, db: DB):
    a = db.get(AudioAsset, aid)
    if a is None or a.kind != "podcast" or not Path(a.path).exists():
        raise HTTPException(404, "No such episode")
    media = "audio/mpeg" if a.path.endswith(".mp3") else "audio/wav"
    return FileResponse(a.path, media_type=media, filename=Path(a.path).name)
