"""Server-side TTS fallback: Piper (free, runs locally; voices thorsten/kerstin are CC0, docs/content_sources.md).

The app speaks with the browser's `speechSynthesis` first. The server is asked only when the device has
no German voice (or no speechSynthesis at all). Piper is a separate program, configured with PIPER_BIN
and PIPER_MODEL; without it this module reports "unavailable" and the app shows the text only.
Results are cached in audio/tts/ (git-ignored) by hash of model + text.
"""

import hashlib
import subprocess
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import utcnow
from app.models import CostLedger

MAX_CHARS = 600


class TTSUnavailable(Exception):
    pass


def configured() -> bool:
    return bool(settings.piper_bin and settings.piper_model)


def synth(db: Session, text: str) -> Path:
    text = " ".join(text.split())
    if not text or len(text) > MAX_CHARS:
        raise ValueError(f"text must be 1..{MAX_CHARS} characters")
    if not configured():
        raise TTSUnavailable("Piper is not configured (PIPER_BIN, PIPER_MODEL)")
    key = hashlib.sha256(f"{settings.piper_model}\n{text}".encode()).hexdigest()[:32]
    out = settings.audio_dir / "tts" / f"{key}.wav"
    if out.exists():
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp.wav")
    try:
        # text goes in on stdin, never through a shell
        subprocess.run(
            [settings.piper_bin, "--model", settings.piper_model, "--output_file", str(tmp)],
            input=text.encode(), capture_output=True, timeout=60, check=True,
        )  # fmt: skip
    except (OSError, subprocess.SubprocessError) as e:
        tmp.unlink(missing_ok=True)
        raise TTSUnavailable(f"Piper failed: {e}") from e
    if not tmp.exists() or tmp.stat().st_size == 0:
        raise TTSUnavailable("Piper wrote no audio")
    tmp.replace(out)
    db.add(CostLedger(ts=utcnow(), vendor="piper", model=Path(settings.piper_model).name,
                      units=len(text), unit_type="chars", eur=0.0))  # fmt: skip
    db.flush()
    return out
