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


def test_load_seed_sends_edited_german_back_to_review(tmp_path, monkeypatch, session_factory):
    from app.models import Item
    from scripts import load_seed

    monkeypatch.setattr(settings, "seed_dir", tmp_path)
    monkeypatch.setattr(load_seed, "SessionLocal", session_factory)

    def write_built(example_de, status):
        it = {**_item("Bis morgen", example_de), "alt": [], "gender": None, "plural": None,
              "tags": [], "status": status, "review_notes": []}  # fmt: skip
        unit = {"unit": 1, "title": "T", "scenario": "", "items": [it]}
        (tmp_path / "work.json").write_text(json.dumps({"deck": "work", "units": [unit]}))

    def status():
        with session_factory() as s:
            return s.query(Item).filter_by(deck="work", de="Bis morgen").one().status

    write_built("Bis morgen.", "needs_review")
    load_seed.load()
    assert status() == "needs_review"

    with session_factory() as s:  # approved in the check queue
        s.query(Item).filter_by(de="Bis morgen").one().status = "ok"
        s.commit()
    load_seed.load()  # unchanged German: approval sticks
    assert status() == "ok"

    write_built("Bis morgen, Frau Weber.", "needs_review")  # edited, flagged
    load_seed.load()
    assert status() == "needs_review"
