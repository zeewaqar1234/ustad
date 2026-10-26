"""Commute Podcast (docs/modules.md §5.5): a 10 to 20 min episode from today's Sabaq sentences and
yesterday's mistakes, read slowly with pauses to answer in your head, then the answer.

`speechSynthesis` cannot write files, so audio comes from Piper on the server (docs/architecture.md §8).
Segments are synthesised one by one (cached by text), joined with silence into one WAV, then encoded
to mp3 with ffmpeg when it is installed. One episode per day; building again replaces it.

Without an English Piper voice the items are German only: hear the sentence, say it in your head,
hear it again. With one (PIPER_MODEL_EN): English prompt, pause, German answer.
"""

import shutil
import subprocess
import wave
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import day_bounds, local_date
from app.core.config import settings
from app.models import AudioAsset, Card, Item, Mistake
from app.services import daily
from app.voice import tts

SLOW = 1.3  # Piper length_scale: 30 % slower than normal
THINK_S = 4.0  # pause to answer in your head
AFTER_S = 1.5
CHARS_PER_S = 11.0  # slow German, for the length estimate before synthesis
TARGET_S, MAX_S = 10 * 60, 20 * 60


@dataclass
class Seg:
    kind: str  # title / prompt / answer / pause
    text: str
    lang: str = "de"
    seconds: float = 0.0  # pauses only

    def view(self) -> dict:
        return {
            "kind": self.kind,
            "text": self.text if self.kind != "pause" else f"{self.seconds:g} s",
        }


def english_voice() -> bool:
    return bool(settings.piper_model_en)


def ffmpeg() -> str | None:
    return shutil.which(settings.ffmpeg_bin) if settings.ffmpeg_bin else None


def _sentence(it: Item) -> tuple[str, str]:
    if it.kind in ("word", "chunk") and it.example_de:
        return it.example_de, it.example_en or it.en
    return it.de, it.en


def _taught_items(db: Session, today: date) -> list[Item]:
    """Today's Sabaq items already taught first (ask before tell), then the most recently taught."""
    lesson = daily.todays_lesson(db, today)
    taught_q = (
        select(Item)
        .join(Card, Card.item_id == Item.id)
        .where(Card.introduced_at.is_not(None), Item.status == "ok", Item.deck != "ghalti")
        .order_by(Card.introduced_at.desc())
    )
    taught = list(dict.fromkeys(db.scalars(taught_q)))
    first = [i for i in taught if lesson and i.id in (lesson.items or [])]
    return first + [i for i in taught if i not in first]


def _yesterdays_mistakes(db: Session, today: date) -> list[tuple[str, str]]:
    start, end = day_bounds(today - timedelta(days=1))
    out = []
    for m in db.scalars(select(Mistake).where(Mistake.last_ts >= start, Mistake.last_ts < end)
                        .order_by(Mistake.last_ts)):  # fmt: skip
        card = db.get(Card, m.card_id) if m.card_id else None
        if card and card.item.wrong and card.item.status == "ok":
            out.append((card.item.wrong, card.item.de))  # whole sentences from the fix card
        else:
            out.append((m.orig, m.fix))
    return out


def _estimate(segs: list[Seg]) -> float:
    return sum(s.seconds if s.kind == "pause" else len(s.text) / CHARS_PER_S for s in segs)


def script(db: Session, today: date) -> list[Seg]:
    en = english_voice()
    segs = [Seg("title", f"Ustad Podcast. {today.day}.{today.month}.{today.year}.")]
    mistakes = _yesterdays_mistakes(db, today)
    if mistakes:
        segs.append(Seg("title", "Teil eins: Fehler von gestern. Erst falsch, dann richtig."))
        for wrong, right in mistakes:
            segs += [Seg("prompt", f"Falsch: {wrong}"), Seg("pause", "", seconds=THINK_S),
                     Seg("answer", f"Richtig: {right}"), Seg("pause", "", seconds=AFTER_S)]  # fmt: skip
    items = _taught_items(db, today)
    if items:
        segs.append(Seg("title", "Sätze von heute. Sag sie in Gedanken, dann hörst du sie."))
    for it in items:
        de, en_text = _sentence(it)
        block = (
            [Seg("prompt", en_text, lang="en"), Seg("pause", "", seconds=THINK_S),
             Seg("answer", de), Seg("pause", "", seconds=AFTER_S)]
            if en else
            [Seg("answer", de), Seg("pause", "", seconds=THINK_S), Seg("answer", de),
             Seg("pause", "", seconds=AFTER_S)]
        )  # fmt: skip
        if _estimate(segs + block) > MAX_S:
            break
        segs += block
        if _estimate(segs) >= TARGET_S:
            break
    if len(segs) > 1:
        segs.append(Seg("title", "Ende. Bis morgen."))
    return segs


# --- audio --------------------------------------------------------------------------------------


def _params(path: Path):
    with wave.open(str(path), "rb") as w:
        return w.getnchannels(), w.getsampwidth(), w.getframerate()


def _resample(src: Path, rate: int, channels: int) -> Path:
    exe = ffmpeg()
    if not exe:
        raise tts.TTSUnavailable("The two Piper voices differ in sample rate; install ffmpeg.")
    out = src.with_suffix(f".{rate}.wav")
    if not out.exists():
        subprocess.run([exe, "-y", "-loglevel", "error", "-i", str(src), "-ar", str(rate),
                        "-ac", str(channels), str(out)], capture_output=True, check=True,
                       timeout=120)  # fmt: skip
    return out


def join(parts: list[Path | float], out: Path) -> float:
    """Concatenate WAV files and silences (float = seconds). All audio takes the first file's format.
    Returns the duration in seconds."""
    files = [p for p in parts if isinstance(p, Path)]
    if not files:
        raise ValueError("no audio")
    ch, width, rate = _params(files[0])
    frames = 0
    with wave.open(str(out), "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(width)
        w.setframerate(rate)
        for p in parts:
            if isinstance(p, Path):
                src = p if _params(p) == (ch, width, rate) else _resample(p, rate, ch)
                with wave.open(str(src), "rb") as r:
                    data = r.readframes(r.getnframes())
                    n = r.getnframes()
            else:
                n = round(p * rate)
                data = b"\x00" * (n * ch * width)
            w.writeframes(data)
            frames += n
    return frames / rate


def build(db: Session, now: datetime) -> AudioAsset:
    if not tts.configured():
        raise tts.TTSUnavailable("Piper is not configured (PIPER_BIN, PIPER_MODEL)")
    today = local_date(now)
    segs = script(db, today)
    if len(segs) <= 1:
        raise ValueError("Nothing to read yet: finish a Sabaq first.")
    parts: list[Path | float] = []
    for s in segs:
        if s.kind == "pause":
            parts.append(s.seconds)
            continue
        model = settings.piper_model_en if s.lang == "en" else None
        parts.append(
            tts.synth(db, s.text, model=model, length_scale=None if s.lang == "en" else SLOW)
        )
        if s.kind == "title":
            parts.append(1.0)
    folder = settings.audio_dir / "podcast"
    folder.mkdir(parents=True, exist_ok=True)
    stem = folder / today.isoformat()
    tmp = stem.with_suffix(".build.wav")
    try:
        duration = join(parts, tmp)  # a failed build never touches today's current episode
        path, fmt = tmp, "wav"
        exe = ffmpeg()
        if exe:
            mp3 = stem.with_suffix(".build.mp3")
            try:
                subprocess.run([exe, "-y", "-loglevel", "error", "-i", str(tmp), "-codec:a",
                                "libmp3lame", "-b:a", "64k", "-ac", "1", str(mp3)],
                               capture_output=True, check=True, timeout=600)  # fmt: skip
                path, fmt = mp3, "mp3"
            except (OSError, subprocess.SubprocessError):
                mp3.unlink(missing_ok=True)  # keep the WAV
    except (OSError, subprocess.SubprocessError, wave.Error) as e:
        tmp.unlink(missing_ok=True)
        raise tts.TTSUnavailable(f"Building the episode failed: {e}") from e
    final = stem.with_suffix(f".{fmt}")
    path.replace(final)
    if path != tmp:
        tmp.unlink(missing_ok=True)
    path = final
    ref = f"podcast:{today.isoformat()}"
    for old in db.scalars(select(AudioAsset).where(AudioAsset.text_ref == ref)):
        if Path(old.path) != path:
            Path(old.path).unlink(missing_ok=True)
        db.delete(old)
    asset = AudioAsset(path=str(path), kind="podcast", text_ref=ref, voice=Path(settings.piper_model).name,
                       duration_s=round(duration, 1), created=now,
                       meta_json={"date": today.isoformat(), "format": fmt,
                                  "segments": sum(1 for s in segs if s.kind != "pause"),
                                  "script": [s.view() for s in segs]})  # fmt: skip
    db.add(asset)
    db.flush()
    return asset


def view(a: AudioAsset) -> dict:
    m = a.meta_json
    return {"id": a.id, "date": m["date"], "url": f"/api/podcast/{a.id}/audio",
            "duration_s": a.duration_s, "format": m["format"], "segments": m["segments"],
            "script": m["script"]}  # fmt: skip


def latest(db: Session) -> AudioAsset | None:
    return db.scalar(select(AudioAsset).where(AudioAsset.kind == "podcast")
                     .order_by(AudioAsset.created.desc()).limit(1))  # fmt: skip
