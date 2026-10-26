"""Shadowing (Takrar) score: word match of the transcript against the reference text.

Web Speech gives no pronunciation score (free-resources decision, docs/architecture.md §8), so the
only score is "which reference words did the recogniser hear", in order. No fluency, no pace, no time.
Disfluencies are stripped first, extra words are ignored, case/punctuation/umlaut spelling do not count,
and digits match number words ("3" = "drei").
"""

import re
from difflib import SequenceMatcher

from app.voice.disfluency import clean

_WORD = re.compile(r"[\wäöüÄÖÜß]+(?:-[\wäöüÄÖÜß]+)*")
_FOLD = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"})
NUMBERS = {
    "0": "null", "1": "eins", "2": "zwei", "3": "drei", "4": "vier", "5": "fünf", "6": "sechs",
    "7": "sieben", "8": "acht", "9": "neun", "10": "zehn", "11": "elf", "12": "zwölf",
    "20": "zwanzig", "30": "dreißig", "100": "hundert",
}  # fmt: skip


def norm(word: str) -> str:
    w = word.lower()
    w = NUMBERS.get(w, w)
    if w == "ein":  # "1 Uhr" is read as "ein Uhr"; "eins"/"ein" are the same number word
        w = "eins"
    return w.translate(_FOLD)


def words(text: str) -> list[str]:
    return _WORD.findall(text)


def score(reference: str, transcript: str) -> dict:
    ref = words(reference)
    heard = words(clean(transcript))
    a, b = [norm(w) for w in ref], [norm(w) for w in heard]
    hit = [False] * len(ref)
    for block in SequenceMatcher(a=a, b=b, autojunk=False).get_matching_blocks():
        for k in range(block.size):
            hit[block.a + k] = True
    matched = sum(hit)
    return {
        "reference": reference,
        "heard": " ".join(heard),
        "words": [{"word": w, "ok": ok} for w, ok in zip(ref, hit, strict=True)],
        "matched": matched,
        "total": len(ref),
        "pct": round(100 * matched / len(ref)) if ref else 0,
    }


def visible_scores(scores: dict, show_fluency: bool) -> dict:
    """Stammer rule: a fluency score is never shown unless Zee turned it on in Settings.
    Web Speech has none today; this guard keeps it out if an engine ever adds one."""
    if show_fluency:
        return scores
    return {k: v for k, v in scores.items() if k not in ("fluency", "prosody", "pace", "wpm")}
