"""Writing grader (docs/modules.md §5.6, docs/llm.md): red-pen result as a plain dict for grade_json.

1. LanguageTool pre-check (self-hosted) catches spelling and some grammar; its matches go to the model as hints.
2. Grader role on the local model returns GradeResult JSON (validated, one retry).
3. Every error span must occur in Zee's text; spans that do not are dropped (counted in `dropped_errors`).
4. The corrected text is generated German, so it goes through LanguageTool too: flags -> needs_review.
If the model is unavailable or fails twice, the result comes from LanguageTool alone (source "languagetool_only").
"""

import logging
import re

import httpx
from sqlalchemy.orm import Session

from app.core import languagetool
from app.llm import prompt
from app.llm.provider import LLMInvalid, LLMUnavailable, Provider, complete_json
from app.llm.schemas import ErrorTag, GradeResult

log = logging.getLogger(__name__)

# Rules that fire on learner fragments or layout, not on German errors.
IGNORED_LT_RULES = {"WHITESPACE_RULE", "DE_SENTENCE_WHITESPACE", "PUNCTUATION_PARAGRAPH_END"}

LT_RULE_TAGS = {
    "HILFSVERB_HABEN_SEIN": ErrorTag.AUX_HABEN_SEIN,
    "DE_AGREEMENT": ErrorTag.GENDER,
    "DE_AGREEMENT2": ErrorTag.ADJ_ENDING,
    "DE_CASE": ErrorTag.CAPITALISATION,
    "DE_VERBAGREEMENT": ErrorTag.OTHER,
    "PRAEP_DAT": ErrorTag.PREP_CASE,
    "PRAEP_AKK": ErrorTag.PREP_CASE,
    "PRAEP_GEN": ErrorTag.PREP_CASE,
}
LT_CATEGORY_TAGS = {"TYPOS": ErrorTag.SPELLING, "CASING": ErrorTag.CAPITALISATION}


def lt_tag(match: dict) -> ErrorTag:
    rule = match["rule"]["id"]
    if rule in LT_RULE_TAGS:
        return LT_RULE_TAGS[rule]
    if rule.startswith("PRAEP_"):
        return ErrorTag.PREP_CASE
    return LT_CATEGORY_TAGS.get(match["rule"].get("category", {}).get("id", ""), ErrorTag.OTHER)


def lt_check(text: str) -> list[dict] | None:
    """LanguageTool matches, or None if the container is not reachable."""
    try:
        return [m for m in languagetool.check(text) if m["rule"]["id"] not in IGNORED_LT_RULES]
    except httpx.HTTPError as e:
        log.warning("LanguageTool unavailable: %s", e)
        return None


def lt_notes(text: str) -> list[dict] | None:
    matches = lt_check(text)
    if matches is None:
        return None
    return [
        {"text": text, "rule": m["rule"]["id"], "message": m["message"],
         "suggestions": [r["value"] for r in m.get("replacements", [])[:3]]}
        for m in matches
    ]  # fmt: skip


def _locate(text: str, errors: list[dict]) -> tuple[list[dict], int]:
    """Add start/end offsets; drop errors whose span is not in the text. Searches left to right."""
    out, dropped, pos = [], 0, 0
    for e in errors:
        i = text.find(e["span"], pos)
        if i < 0:
            i = text.find(e["span"])
        if i < 0:
            m = re.search(re.escape(e["span"]), text, re.IGNORECASE)
            if not m:
                dropped += 1
                continue
            i = m.start()
            e = {**e, "span": m.group(0)}
        out.append({**e, "start": i, "end": i + len(e["span"])})
        pos = i + len(e["span"])
    out.sort(key=lambda e: e["start"])
    # overlapping spans cannot both be underlined; keep the first
    clean: list[dict] = []
    for e in out:
        if clean and e["start"] < clean[-1]["end"]:
            dropped += 1
            continue
        clean.append(e)
    return clean, dropped


def _user_message(text: str, task: str, matches: list[dict] | None) -> str:
    hints = "LanguageTool was not available."
    if matches is not None:
        hints = (
            "\n".join(
                f'- "{text[m["offset"] : m["offset"] + m["length"]]}": {m["message"]} ({m["rule"]["id"]})'
                for m in matches
            )
            or "- no matches"
        )
    return (
        f"Task given to Zee: {task or 'free writing (Tagebuch)'}\n\n"
        f"LanguageTool pre-check (can be incomplete or wrong):\n{hints}\n\n"
        f"Zee's text:\n{text}"
    )


def _lt_only(text: str, matches: list[dict] | None, reason: str) -> dict:
    errors, corrected, shift = [], text, 0
    for m in sorted(matches or [], key=lambda m: m["offset"]):
        span = text[m["offset"] : m["offset"] + m["length"]]
        fix = m["replacements"][0]["value"] if m.get("replacements") else span
        errors.append({"span": span, "fix": fix, "tag": lt_tag(m).value, "reason_en": m["message"],
                       "severity": 1 if lt_tag(m) in (ErrorTag.SPELLING, ErrorTag.CAPITALISATION) else 2})  # fmt: skip
        a, b = m["offset"] + shift, m["offset"] + m["length"] + shift
        corrected = corrected[:a] + fix + corrected[b:]
        shift += len(fix) - len(span)
    located, dropped = _locate(text, errors)
    return {
        "source": "languagetool_only", "model": None, "fallback_reason": reason,
        "original": text, "score_10": None, "corrected_text": corrected, "errors": located,
        "teaching_points": [], "model_sentence_for_srs": [], "dropped_errors": dropped,
        "lt_available": matches is not None, "needs_review": True,
        "review_notes": [{"rule": "LT_ONLY", "message": "No tutor grading; LanguageTool only."}],
    }  # fmt: skip


def grade_text(db: Session, provider: Provider, text: str, task: str = "") -> dict:
    text = text.strip()
    matches = lt_check(text)
    try:
        result: GradeResult = complete_json(
            db,
            provider,
            "grader",
            prompt("grader"),
            _user_message(text, task, matches),
            GradeResult,
        )
    except (LLMUnavailable, LLMInvalid) as e:
        log.warning("Grader fallback to LanguageTool only: %s", e)
        return _lt_only(text, matches, type(e).__name__)
    errors, dropped = _locate(text, [e.model_dump(mode="json") for e in result.errors])
    notes = lt_notes(result.corrected_text) if result.corrected_text.strip() else []
    if notes is None:
        notes = [{"rule": "LT_SKIPPED", "message": "LanguageTool not reachable; check by hand."}]
    return {
        "source": provider.vendor, "model": provider.model, "fallback_reason": None,
        "original": text, "score_10": result.score_10, "corrected_text": result.corrected_text,
        "errors": errors, "teaching_points": result.teaching_points[:3],
        "model_sentence_for_srs": result.model_sentence_for_srs, "dropped_errors": dropped,
        "lt_available": matches is not None, "needs_review": bool(notes), "review_notes": notes,
    }  # fmt: skip
