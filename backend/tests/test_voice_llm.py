"""Real local-model check of the voice pipeline. Opt-in: needs Ollama with the model pulled.

    RUN_OLLAMA=1 uv run pytest tests/test_voice_llm.py -v
One tutor turn and one "Say it better" review per fixture transcript, against the real model.
"""

import os

import httpx
import pytest

from app import content
from app.core import languagetool
from app.llm.provider import OllamaProvider
from app.voice import tutor
from tests.test_voice import FIXTURES

pytestmark = pytest.mark.skipif(os.environ.get("RUN_OLLAMA") != "1", reason="set RUN_OLLAMA=1")


@pytest.fixture(autouse=True)
def lt_optional(monkeypatch):
    try:
        languagetool.check("Test.")
    except httpx.HTTPError:
        monkeypatch.setattr(languagetool, "check", lambda text, **kw: [])


@pytest.mark.parametrize("fx", FIXTURES, ids=[f["id"] for f in FIXTURES])
def test_real_model_turn_and_review(db, fx):
    assert content.load("scenarios")
    llm = OllamaProvider()
    s = tutor.start(db, tutor.scenario(fx["scenario"]))
    t = tutor.take_turn(db, llm, s, fx["raw"], "voice")
    assert t.tutor_status == "ok" and t.reply_de
    db.refresh(s)
    review = tutor.review(db, llm, s)
    assert review["source"] == "ollama"
    tags = {e["tag"] for line in review["lines"] for e in line["errors"]}
    assert fx["expected_tag"] in tags, (tags, review["lines"])
