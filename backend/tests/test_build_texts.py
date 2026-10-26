"""Phase 4 seed reading texts: the built file is valid, B1 length, 3 questions, no dashes, status set."""

import json

from app.content.schemas import SeedTexts
from app.core.config import settings


def _built() -> dict:
    return json.loads((settings.seed_dir / "texts.json").read_text())


def test_built_texts_validate_and_fit_the_reader():
    data = _built()
    texts = SeedTexts.model_validate(data).texts
    assert len(texts) >= 6
    assert len({t.code for t in texts}) == len(texts)
    for t in texts:
        assert 120 <= t.words() <= 250, (t.code, t.words())
        assert len(t.questions) == 3
        assert {q.kind for q in t.questions} == {"rf", "mc", "match"}
        assert all(len(s.de.split()) <= 18 for s in t.sentences), t.code
        assert t.credit and t.licence


def test_no_dashes_and_every_text_has_a_status():
    for raw in _built()["texts"]:
        blob = json.dumps(raw, ensure_ascii=False)
        assert "—" not in blob and "–" not in blob, raw["code"]
        assert raw["status"] in ("ok", "needs_review")
        assert isinstance(raw["review_notes"], list)
        assert (raw["status"] == "ok") == (not raw["review_notes"])


def test_serial_episodes_continue():
    eps = sorted(t.series_episode for t in SeedTexts.model_validate(_built()).texts
                 if t.topic == "serial")  # fmt: skip
    assert eps[:2] == [1, 2]
