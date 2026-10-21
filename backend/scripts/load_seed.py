"""Load data/seed/<deck>.json into the DB. Idempotent: matches items on (deck, de), creates missing cards.

Sabaq order is fixed: units interleave connector, work, life (connector unit 1, work 1, life 1, ...).
Usage: uv run python -m scripts.load_seed
"""

import json
import sys

from sqlalchemy import select

from app.core.config import settings
from app.db import SessionLocal
from app.models import Card, Item, Pattern, Profile
from app.services.cards import card_types_for

DECKS = ["connector", "work", "life"]
GERMAN_FIELDS = ("alt", "plural", "example_de")  # "de" is the match key


def load() -> dict[str, int]:
    db = SessionLocal()
    counts = {"items_new": 0, "items_updated": 0, "cards_new": 0}
    if db.get(Profile, 1) is None:
        db.add(Profile(id=1, name="Zee"))
    for d_idx, name in enumerate(DECKS):
        path = settings.seed_dir / f"{name}.json"
        if not path.exists():
            print(f"skip {name}: {path} missing (run make seed-build)")
            continue
        data = json.loads(path.read_text())
        for unit in data["units"]:
            for it in unit["items"]:
                item = db.scalar(select(Item).where(Item.deck == name, Item.de == it["de"]))
                fields = {
                    k: it[k]
                    for k in ("kind", "en", "alt", "gender", "plural", "pos", "tags", "cefr",
                              "example_de", "example_en", "review_notes")
                }  # fmt: skip
                fields.update(
                    unit=unit["unit"], unit_order=unit["unit"] * len(DECKS) + d_idx,
                    unit_title=unit["title"], scenario=unit["scenario"],
                )  # fmt: skip
                if item is None:
                    item = Item(deck=name, de=it["de"], status=it["status"], **fields)
                    db.add(item)
                    counts["items_new"] += 1
                else:
                    # German text edited and the new build flagged it (or skipped LanguageTool): back to
                    # review. An unchanged item keeps its status, so an approval in the check queue sticks.
                    german_changed = any(getattr(item, k) != it[k] for k in GERMAN_FIELDS)
                    for k, v in fields.items():
                        setattr(item, k, v)
                    if german_changed and it["status"] == "needs_review":
                        item.status = "needs_review"
                    counts["items_updated"] += 1
                db.flush()
                have = {c.card_type for c in item.cards}
                for ct in card_types_for(item):
                    if ct not in have:
                        db.add(Card(item_id=item.id, card_type=ct))
                        counts["cards_new"] += 1
    counts.update(load_patterns(db))
    db.commit()
    db.close()
    return counts


PATTERN_FIELDS = ("order", "group", "title", "rule_en", "slot_diagram", "common_error", "tags",
                  "homework", "review_notes")  # fmt: skip


def load_patterns(db) -> dict[str, int]:
    """data/seed/patterns.json -> pattern table, matched on code. Edited German goes back to review."""
    path = settings.seed_dir / "patterns.json"
    if not path.exists():
        print(f"skip patterns: {path} missing (run make grammar-build)")
        return {}
    counts = {"patterns_new": 0, "patterns_updated": 0}
    for p in json.loads(path.read_text())["patterns"]:
        row = db.scalar(select(Pattern).where(Pattern.code == p["code"]))
        fields = {k: p[k] for k in PATTERN_FIELDS}
        fields.update(examples_json=p["examples"], drills_json=p["drills"])
        if row is None:
            db.add(Pattern(code=p["code"], status=p["status"], **fields))
            counts["patterns_new"] += 1
            continue
        changed = row.examples_json != p["examples"] or row.drills_json != p["drills"]
        for k, v in fields.items():
            setattr(row, k, v)
        if changed and p["status"] == "needs_review":
            row.status = "needs_review"
        counts["patterns_updated"] += 1
    db.flush()
    return counts


if __name__ == "__main__":
    print(load())
    sys.exit(0)
