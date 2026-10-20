"""Build seed decks: data/seed/source/*.json -> Pydantic validation -> LanguageTool -> data/seed/<deck>.json.

Items with LanguageTool matches are marked needs_review (they stay out of Sabaq until approved).
Needs the self-hosted LanguageTool container (make lt-up). Never the public API.
Usage: uv run python -m scripts.build_seed [deck ...]

--skip-lt: no LanguageTool call. Items already in the built deck with unchanged content keep their
earlier LanguageTool result; every new or changed item is marked needs_review (note rule LT_SKIPPED).
Usage: uv run python -m scripts.build_seed --skip-lt [deck ...]
"""

import json
import sys
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.core import languagetool
from app.core.config import settings

# Rules that fire on fragments/short chunks, not on German errors.
IGNORED_RULES = {
    "UPPERCASE_SENTENCE_START",
    "PUNCTUATION_PARAGRAPH_END",
    "DE_SENTENCE_WHITESPACE",
    "WHITESPACE_RULE",
}


class SeedItem(BaseModel):
    kind: Literal["chunk", "word"]
    de: str = Field(min_length=1)
    en: str = Field(min_length=1)
    alt: list[str] = []
    gender: Literal["m", "f", "n"] | None = None
    plural: str | None = None
    pos: Literal["noun", "verb", "adj", "adv", "conj", "prep", "phrase"]
    tags: list[str] = []
    cefr: Literal["A1", "A2", "B1", "B2"]
    example_de: str
    example_en: str

    @model_validator(mode="after")
    def _checks(self):
        text = " ".join([self.de, self.en, self.example_de, self.example_en, *self.alt])
        if "—" in text or "–" in text:
            raise ValueError("no em/en dashes")
        if self.pos == "noun" and self.kind == "word" and self.gender is None:
            raise ValueError(f"noun without gender: {self.de}")
        return self


class SeedUnit(BaseModel):
    title: str
    scenario: str = ""
    items: list[SeedItem] = Field(min_length=1)


class SeedDeck(BaseModel):
    deck: Literal["connector", "work", "life"]
    units: list[SeedUnit]

    @model_validator(mode="after")
    def _connector_tags(self):
        if self.deck == "connector":
            for u in self.units:
                for it in u.items:
                    verb = [t for t in it.tags if t.startswith("verb:")]
                    if len(verb) != 1 or "connector" not in it.tags:
                        raise ValueError(f"connector needs one verb:* tag: {it.de}")
        return self


def lt_issues(text: str) -> list[dict]:
    return [
        {
            "text": text,
            "rule": m["rule"]["id"],
            "message": m["message"],
            "context": m["context"]["text"],
            "suggestions": [r["value"] for r in m.get("replacements", [])[:3]],
        }
        for m in languagetool.check(text)
        if m["rule"]["id"] not in IGNORED_RULES
    ]


LT_SKIPPED = {"rule": "LT_SKIPPED", "message": "LanguageTool not run; review by hand."}


def previous_results(deck_name: str) -> dict[str, dict]:
    """Built items from the last run, keyed by their source content, for --skip-lt reuse."""
    out = settings.seed_dir / f"{deck_name}.json"
    if not out.exists():
        return {}
    prev = {}
    for unit in json.loads(out.read_text())["units"]:
        for it in unit["items"]:
            src = SeedItem.model_validate(it).model_dump_json()
            prev[src] = {"status": it["status"], "review_notes": it["review_notes"]}
    return prev


def build(deck_name: str, skip_lt: bool = False) -> tuple[int, int]:
    src = settings.seed_dir / "source" / f"{deck_name}.json"
    deck = SeedDeck.model_validate_json(src.read_text())
    prev = previous_results(deck_name) if skip_lt else {}
    out_units, flagged, total = [], 0, 0
    for n, unit in enumerate(deck.units, start=1):
        items = []
        for it in unit.items:
            if skip_lt:
                result = prev.get(it.model_dump_json()) or {
                    "status": "needs_review",
                    "review_notes": [{"text": it.de, **LT_SKIPPED}],
                }
            else:
                texts = [it.example_de] + ([it.de] if it.kind == "chunk" else [])
                notes = [issue for t in texts for issue in lt_issues(t)]
                result = {"status": "needs_review" if notes else "ok", "review_notes": notes}
            total += 1
            flagged += result["status"] == "needs_review"
            items.append({**it.model_dump(), **result})
        out_units.append(
            {"unit": n, "title": unit.title, "scenario": unit.scenario, "items": items}
        )
    out = settings.seed_dir / f"{deck_name}.json"
    out.write_text(
        json.dumps({"deck": deck_name, "units": out_units}, ensure_ascii=False, indent=1) + "\n"
    )
    return total, flagged


def main() -> int:
    args = sys.argv[1:]
    skip_lt = "--skip-lt" in args
    names = [a for a in args if a != "--skip-lt"] or ["connector", "work", "life"]
    for name in names:
        total, flagged = build(name, skip_lt)
        print(f"{name}: {total} items, {flagged} needs_review")
    return 0


if __name__ == "__main__":
    sys.exit(main())
