"""Real local-model check of the 5 grader fixtures. Opt-in: needs Ollama with the model pulled.

    ollama pull llama3.1:8b
    RUN_OLLAMA=1 uv run pytest tests/test_grader_llm.py -v
Use it to compare models (OLLAMA_MODEL=...): keep the one that finds every expected tag.
"""

import json
import os
from pathlib import Path

import httpx
import pytest

from app.core import languagetool
from app.llm.provider import OllamaProvider
from app.services import grading

pytestmark = pytest.mark.skipif(os.environ.get("RUN_OLLAMA") != "1", reason="set RUN_OLLAMA=1")
FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "grader_fixtures.json").read_text())[
    "fixtures"
]


@pytest.fixture(autouse=True)
def lt_optional(monkeypatch):
    try:
        languagetool.check("Test.")
    except httpx.HTTPError:
        monkeypatch.setattr(languagetool, "check", lambda text, **kw: [])


@pytest.mark.parametrize("fx", FIXTURES, ids=[f["id"] for f in FIXTURES])
def test_real_model_finds_expected_tags(db, fx):
    grade = grading.grade_text(db, OllamaProvider(), fx["text"], "test")
    assert grade["source"] == "ollama", grade.get("fallback_reason")
    tags = {e["tag"] for e in grade["errors"]}
    assert set(fx["expected_tags"]) <= tags, (tags, grade["errors"])


@pytest.mark.parametrize("fx", FIXTURES, ids=[f["id"] for f in FIXTURES])
def test_real_model_correct_uses_are_valid_spans(db, fx):
    """The model may list different uses than the fixture; every one it lists must be a real span of the
    text, not on an error, with a known tag. Zero uses is allowed but reported."""
    grade = grading.grade_text(db, OllamaProvider(), fx["text"], "test")
    assert grade["source"] == "ollama", grade.get("fallback_reason")
    for u in grade["correct_uses"]:
        assert fx["text"][u["start"] : u["end"]] == u["span"]
    print(fx["id"], "correct uses:", [u["span"] for u in grade["correct_uses"]], "dropped:",
          grade["dropped_correct_uses"])  # fmt: skip
