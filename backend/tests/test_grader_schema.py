"""Grader schema validation with 5 fixture sentences containing known errors (Phase 2 acceptance).

The model is mocked with a recorded reply per fixture; tests/test_grader_llm.py runs the same fixtures
against a real local Ollama model when RUN_OLLAMA=1.
"""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy import select

from app.core import languagetool
from app.db import utcnow
from app.llm.provider import LLMUnavailable, Usage, inline_schema
from app.llm.schemas import ErrorTag, GradeResult
from app.models import Card, CostLedger, Item, Mistake
from app.services import ghalti, grading

FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "grader_fixtures.json").read_text())[
    "fixtures"
]


class FakeLLM:
    vendor, model = "ollama", "fake"

    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls: list[list[dict]] = []

    def chat(self, messages, schema, **kw):
        self.calls.append(messages)
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return (r if isinstance(r, str) else json.dumps(r)), Usage(100, 50)


@pytest.fixture(autouse=True)
def no_languagetool(monkeypatch):
    monkeypatch.setattr(languagetool, "check", lambda text, **kw: [])


@pytest.mark.parametrize("fx", FIXTURES, ids=[f["id"] for f in FIXTURES])
def test_fixture_grades_validate_and_carry_expected_tags(db, fx):
    GradeResult.model_validate(fx["model_reply"])  # the recorded reply itself matches the schema
    grade = grading.grade_text(db, FakeLLM(fx["model_reply"]), fx["text"], "test")
    tags = {e["tag"] for e in grade["errors"]}
    assert set(fx["expected_tags"]) <= tags
    assert grade["dropped_errors"] == 0
    for e in grade["errors"]:
        assert fx["text"][e["start"] : e["end"]] == e["span"]
        assert e["tag"] in ErrorTag.__members__
    assert grade["score_10"] is not None and len(grade["teaching_points"]) <= 3


@pytest.mark.parametrize("fx", FIXTURES, ids=[f["id"] for f in FIXTURES])
def test_fixture_correct_uses_are_located_and_kept(db, fx):
    grade = grading.grade_text(db, FakeLLM(fx["model_reply"]), fx["text"], "test")
    got = [(u["span"], u["tag"]) for u in grade["correct_uses"]]
    assert got == [(u["span"], u["tag"]) for u in fx["expected_correct_uses"]]
    assert grade["dropped_correct_uses"] == 0
    for u in grade["correct_uses"]:
        assert fx["text"][u["start"] : u["end"]] == u["span"]
        assert not any(u["start"] < e["end"] and e["start"] < u["end"] for e in grade["errors"])


def test_schema_rejects_bad_output():
    good = FIXTURES[0]["model_reply"]
    for bad in (
        {**good, "errors": [{**good["errors"][0], "tag": "VERB_POSITION"}]},  # not in the taxonomy
        {**good, "teaching_points": ["a", "b", "c", "d"]},  # max 3
        {**good, "score_10": 11},
        {**good, "errors": [{**good["errors"][0], "severity": 4}]},
    ):
        with pytest.raises(ValidationError):
            GradeResult.model_validate(bad)


def test_schema_sent_to_model_has_no_refs():
    assert "$ref" not in json.dumps(inline_schema(GradeResult))


def test_retry_once_with_validation_error_then_succeed(db):
    fx = FIXTURES[0]
    llm = FakeLLM("{not json", fx["model_reply"])
    grade = grading.grade_text(db, llm, fx["text"])
    assert grade["source"] == "ollama"
    assert "failed validation" in llm.calls[1][-1]["content"]
    rows = db.scalars(select(CostLedger)).all()
    assert len(rows) == 2 and all(r.eur == 0 and r.units == 150 for r in rows)


def test_two_invalid_replies_fall_back_to_languagetool(db):
    grade = grading.grade_text(db, FakeLLM("[]", {"score_10": 99}), "Ich bin müde.")
    assert grade["source"] == "languagetool_only" and grade["fallback_reason"] == "LLMInvalid"


def test_unreachable_model_falls_back(db):
    grade = grading.grade_text(db, FakeLLM(LLMUnavailable("down")), "Ich bin müde.")
    assert grade["source"] == "languagetool_only" and grade["score_10"] is None


def test_span_not_in_text_is_dropped(db):
    reply = {**FIXTURES[0]["model_reply"]}
    reply["errors"] = [*reply["errors"], {**reply["errors"][0], "span": "nicht im Text"}]
    grade = grading.grade_text(db, FakeLLM(reply), FIXTURES[0]["text"])
    assert grade["dropped_errors"] == 1 and len(grade["errors"]) == 1


def test_errors_become_ghalti_rows_and_fix_sentence_cards(db):
    fx = FIXTURES[1]
    grade = grading.grade_text(db, FakeLLM(fx["model_reply"]), fx["text"])
    rows = ghalti.from_grade(db, utcnow(), grade, "homework")
    assert {m.tag for m in rows} == {"V2_POSITION", "VERB_FINAL"}
    item = db.scalar(select(Item).where(Item.deck == "ghalti"))
    assert item.wrong == fx["text"]
    assert item.de == fx["model_reply"]["corrected_text"]  # both fixes applied to the sentence
    card = db.scalar(select(Card).where(Card.item_id == item.id))
    assert card.card_type == "fix_sentence" and card.introduced_at is not None  # LT clean -> live
    # the same mistake again counts as a repeat, not a new row
    ghalti.from_grade(db, utcnow(), grade, "homework")
    assert db.scalar(select(Mistake).where(Mistake.tag == "VERB_FINAL")).count == 2


def test_flagged_correction_waits_for_review(db, monkeypatch):
    monkeypatch.setattr(
        languagetool,
        "check",
        lambda text, **kw: [{"rule": {"id": "X"}, "message": "m", "replacements": [],
                             "offset": 0, "length": 1}],
    )  # fmt: skip
    fx = FIXTURES[0]
    grade = grading.grade_text(db, FakeLLM(fx["model_reply"]), fx["text"])
    assert grade["needs_review"]
    ghalti.from_grade(db, utcnow(), grade, "homework")
    item = db.scalar(select(Item).where(Item.deck == "ghalti"))
    assert item.status == "needs_review" and item.cards[0].introduced_at is None


def test_malformed_ollama_reply_is_unavailable(monkeypatch):
    import httpx

    from app.llm.provider import OllamaProvider

    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(
        200, json={"oops": 1}, request=httpx.Request("POST", "http://x")))  # fmt: skip
    with pytest.raises(LLMUnavailable):
        OllamaProvider().chat([], {})
