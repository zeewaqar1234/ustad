"""Drill generators produce valid items (Phase 2 acceptance), from the real pattern source files."""

from pathlib import Path

import pytest

from app.content.schemas import PatternBatch, Placement, Recitation
from app.models import Pattern
from app.services import drills

SRC = Path(__file__).resolve().parents[2] / "data" / "seed" / "source"
BATCHES = sorted((SRC / "patterns").glob("batch_*.json"))


def _patterns() -> list[Pattern]:
    out = []
    for path in BATCHES:
        for p in PatternBatch.model_validate_json(path.read_text()).patterns:
            d = p.model_dump(mode="json")
            out.append(Pattern(code=d["code"], order=d["order"], group=d["group"], title=d["title"],
                               rule_en=d["rule_en"], slot_diagram=d["slot_diagram"],
                               examples_json=d["examples"], common_error=d["common_error"],
                               tags=d["tags"], drills_json=d["drills"], homework=d["homework"]))  # fmt: skip
    return out


PATTERNS = _patterns()


def test_forty_patterns_in_eight_batches_of_five():
    assert len(BATCHES) == 8
    assert len(PATTERNS) == 40
    assert sorted(p.order for p in PATTERNS) == list(range(1, 41))
    assert len({p.code for p in PATTERNS}) == 40


def test_all_six_drill_types_are_generated():
    types = {d.type for p in PATTERNS for d in drills.generate(p)}
    assert types == set(drills.TYPES)


@pytest.mark.parametrize("p", PATTERNS, ids=[p.code for p in PATTERNS])
def test_generated_drills_are_valid(p):
    items = drills.generate(p)
    kinds = {d.type for d in items}
    assert {"surgery", "transform", "error_spot", "free"} <= kinds
    assert len({d.id for d in items}) == len(items)
    for d in items:
        exp = drills.expected(p, d.id)
        pub = d.public()
        assert "answer" not in pub and "expected" not in pub  # ask before tell
        if d.type == "free":
            assert pub["instruction"]
            continue
        # the prompt never shows the answer
        assert exp.answer.strip(".?! ") not in pub["prompt"], d.id
        if d.type == "surgery":
            assert sorted(pub["tokens"]) == sorted(exp.answer.split())
            assert pub["tokens"] != exp.answer.split()
        if d.type == "fill":
            assert pub["prompt"].count("___") == d.blanks == len(exp.answers)
            assert drills.check(p, d.id, answers=exp.answers)["correct"]
            assert not drills.check(p, d.id, answers=["x"] * d.blanks)["correct"]
            continue
        assert drills.check(p, d.id, exp.answer)["correct"], d.id
        assert not drills.check(p, d.id, "")["correct"]


def test_error_spot_wrong_sentence_is_not_accepted():
    for p in PATTERNS:
        for i, e in enumerate(p.drills_json["error_spot"]):
            assert not drills.check(p, f"{p.code}:error_spot:{i}", e["wrong"])["correct"], e


def test_auto_fill_blanks_article_ending():
    f = drills.auto_fill("Ich fahre mit dem Zug nach Frankfurt.")
    assert f == {"text": "Ich fahre mit d___ Zug nach Frankfurt.", "answers": ["em"],
                 "full": "Ich fahre mit dem Zug nach Frankfurt."}  # fmt: skip
    assert drills.auto_fill("Wir gehen nach Hause.") is None


def test_surgery_same_words_other_order_gets_a_note():
    p = next(p for p in PATTERNS if p.code == "VE_WEIL")
    s = p.drills_json["surgery"][0]["de"].split()
    res = drills.check(p, f"{p.code}:surgery:0", " ".join(reversed(s)))
    assert not res["correct"] and len(res["notes"]) == 1 and res["notes"][0].startswith("Same words")


def test_free_must_include_is_case_insensitive():
    assert drills.missing_words("wie geht es?", ["Wie"]) == []
    assert drills.missing_words("Ich stehe früh auf.", ["auf", "obwohl"]) == ["obwohl"]


def test_placement_and_recitation_sources_validate():
    pl = Placement.model_validate_json((SRC / "placement.json").read_text())
    assert 30 <= len(pl.items) <= 40 and pl.writing.min_sentences == 5
    rec = Recitation.model_validate_json((SRC / "recitation.json").read_text())
    assert {"SEIN_PRAESENS", "ARTICLE_DEFINITE", "PRONOUNS_CASE", "CONNECTOR_GROUPS"} <= {
        t.code for t in rec.tables
    }
