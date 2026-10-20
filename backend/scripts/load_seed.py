"""Load data/seed/<deck>.json into the DB. Idempotent: matches items on (deck, de), creates missing cards.

Sabaq order is fixed: units interleave connector, work, life (connector unit 1, work 1, life 1, ...).
Usage: uv run python -m scripts.load_seed
"""

import json
import sys

from sqlalchemy import select

from app.core.config import settings
from app.db import SessionLocal
from app.models import Card, Item, Profile
from app.services.cards import card_types_for

DECKS = ["connector", "work", "life"]


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
                    for k, v in fields.items():
                        setattr(item, k, v)
                    if it["status"] == "needs_review" and item.status == "ok" and not item.cards:
                        item.status = "needs_review"
                    counts["items_updated"] += 1
                db.flush()
                have = {c.card_type for c in item.cards}
                for ct in card_types_for(item):
                    if ct not in have:
                        db.add(Card(item_id=item.id, card_type=ct))
                        counts["cards_new"] += 1
    db.commit()
    db.close()
    return counts


if __name__ == "__main__":
    print(load())
    sys.exit(0)
