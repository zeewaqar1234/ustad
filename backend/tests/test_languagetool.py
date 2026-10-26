import httpx
import pytest

from app.core import languagetool
from app.core.config import settings


def _lt_up() -> bool:
    try:
        return httpx.get(f"{settings.languagetool_url}/v2/languages", timeout=2).status_code == 200
    except httpx.HTTPError:
        return False


@pytest.mark.languagetool
@pytest.mark.skipif(not _lt_up(), reason="LanguageTool not running (make lt-up)")
def test_wrong_auxiliary_is_flagged():
    matches = languagetool.check("Ich habe gestern nach Hause gegangen.")
    assert matches, "expected at least one match for haben + gegangen"
    assert any(m["rule"]["id"] == "HILFSVERB_HABEN_SEIN" for m in matches)


@pytest.mark.languagetool
@pytest.mark.skipif(not _lt_up(), reason="LanguageTool not running (make lt-up)")
def test_grader_fallback_uses_languagetool_tags(db):
    """Model offline: the red-pen view still comes from the self-hosted LanguageTool, with tags."""
    from app.llm.provider import LLMUnavailable
    from app.services import grading

    class Down:
        vendor, model = "ollama", "down"

        def chat(self, messages, schema, **kw):
            raise LLMUnavailable("offline")

    # LanguageTool 6.8 catches this one, but NOT the inverted "Am Wochenende habe ich nach Frankfurt
    # gefahren." (checked 2026-10-21): the LT-only fallback is a safety net, not a grader.
    grade = grading.grade_text(db, Down(), "Ich habe gestern nach Hause gegangen.")
    assert grade["source"] == "languagetool_only"
    assert "AUX_HABEN_SEIN" in {e["tag"] for e in grade["errors"]}
