import json

from app.core import languagetool
from app.core.config import settings
from scripts import build_seed


def _item(de, example_de):
    return {
        "kind": "chunk", "de": de, "en": "x", "pos": "phrase", "cefr": "A2",
        "example_de": example_de, "example_en": "x",
    }  # fmt: skip


def test_skip_lt_keeps_old_results_and_flags_new_items(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "seed_dir", tmp_path)
    (tmp_path / "source").mkdir()
    src = tmp_path / "source" / "work.json"

    def write_source(items):
        src.write_text(json.dumps({"deck": "work", "units": [{"title": "T", "items": items}]}))

    # First build with LanguageTool (stubbed): one clean, one flagged.
    monkeypatch.setattr(
        languagetool, "check",
        lambda t: [{"rule": {"id": "X"}, "message": "m", "context": {"text": t}}] if "Fehler" in t else [],
    )  # fmt: skip
    write_source([_item("Guten Morgen", "Guten Morgen."), _item("mit Fehler", "Mit Fehler.")])
    assert build_seed.build("work") == (2, 1)

    # Rebuild with --skip-lt: LanguageTool must not be called at all.
    def no_lt(_):
        raise AssertionError("LanguageTool called with --skip-lt")

    monkeypatch.setattr(languagetool, "check", no_lt)
    write_source(
        [
            _item("Guten Morgen", "Guten Morgen."),  # unchanged, was ok
            _item("mit Fehler", "Mit Fehler."),  # unchanged, was flagged
            _item("Bis morgen", "Bis morgen."),  # new
            _item("Guten Tag", "Guten Tag, Frau Weber."),  # new
        ]
    )
    assert build_seed.build("work", skip_lt=True) == (4, 3)
    items = {
        i["de"]: i for i in json.loads((tmp_path / "work.json").read_text())["units"][0]["items"]
    }
    assert items["Guten Morgen"]["status"] == "ok"
    assert items["mit Fehler"]["review_notes"][0]["rule"] == "X"
    assert items["Bis morgen"]["status"] == "needs_review"
    assert items["Bis morgen"]["review_notes"][0]["rule"] == "LT_SKIPPED"

    # Changing an item's content counts as new: it loses its earlier ok.
    write_source([_item("Guten Morgen", "Guten Morgen, Herr Weber.")])
    build_seed.build("work", skip_lt=True)
    out = json.loads((tmp_path / "work.json").read_text())["units"][0]["items"][0]
    assert out["status"] == "needs_review"
