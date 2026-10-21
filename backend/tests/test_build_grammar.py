"""build_grammar: validation + LanguageTool flags -> needs_review; load_patterns is idempotent."""

import json
import shutil
from pathlib import Path

from sqlalchemy import select

from app.core.config import settings
from app.models import Pattern
from scripts import build_grammar, load_seed

SRC = Path(__file__).resolve().parents[2] / "data" / "seed" / "source"


def _setup(tmp_path, monkeypatch, flag_text: str | None = None):
    seed = tmp_path / "seed"
    shutil.copytree(SRC, seed / "source")
    monkeypatch.setattr(settings, "seed_dir", seed)
    monkeypatch.setattr(build_grammar, "SRC", seed / "source")
    monkeypatch.setattr(
        build_grammar,
        "lt_issues",
        lambda t: [{"text": t, "rule": "X", "message": "m"}] if t == flag_text else [],
    )
    return seed


def test_build_flags_only_the_pattern_with_a_match(tmp_path, monkeypatch):
    first = json.loads((SRC / "patterns" / "batch_01.json").read_text())["patterns"][0]
    seed = _setup(tmp_path, monkeypatch, flag_text=first["examples"][0]["de"])
    assert build_grammar.build_patterns() == (40, 1)
    built = json.loads((seed / "patterns.json").read_text())["patterns"]
    assert [p["order"] for p in built] == list(range(1, 41))
    assert built[0]["status"] == "needs_review" and built[1]["status"] == "ok"
    assert build_grammar.build_placement()[0] >= 30
    assert build_grammar.build_recitation() >= 10


def test_load_patterns_idempotent_and_keeps_approval(tmp_path, monkeypatch, db):
    _setup(tmp_path, monkeypatch)
    build_grammar.build_patterns()
    assert load_seed.load_patterns(db) == {"patterns_new": 40, "patterns_updated": 0}
    p = db.scalar(select(Pattern).where(Pattern.order == 1))
    p.status = "needs_review"
    db.flush()
    assert load_seed.load_patterns(db) == {"patterns_new": 0, "patterns_updated": 40}
    # unchanged content does not touch the status (approvals stick, flags stick)
    assert db.scalar(select(Pattern).where(Pattern.order == 1)).status == "needs_review"


def test_built_patterns_match_source():
    """data/seed/patterns.json must be rebuilt after a source edit (make grammar-build)."""
    from app.content.schemas import PatternBatch

    built = {
        p["code"]: p for p in json.loads((SRC.parent / "patterns.json").read_text())["patterns"]
    }
    for path in sorted((SRC / "patterns").glob("batch_*.json")):
        for p in PatternBatch.model_validate_json(path.read_text()).patterns:
            d = p.model_dump(mode="json")
            assert built[p.code]["drills"] == d["drills"], f"{p.code}: run make grammar-build"
            assert built[p.code]["examples"] == d["examples"], f"{p.code}: run make grammar-build"
