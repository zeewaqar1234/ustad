"""Static learning content (patterns, placement test, recitation tables) built into data/seed/."""

import json
from functools import cache

from app.core.config import settings


@cache
def load(name: str) -> dict:
    """Built content file data/seed/<name>.json (placement, recitation)."""
    return json.loads((settings.seed_dir / f"{name}.json").read_text())
