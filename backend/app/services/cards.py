"""What each card type asks, and what counts as the answer. Prompts never contain the answer."""

import re

from app.models import Card, Item

ARTICLE = {"m": "der", "f": "die", "n": "das"}
SYMBOL = {"m": "▲", "f": "●", "n": "■"}  # grayscale-safe gender marks (docs/modules.md §5.1)


def card_types_for(item: Item) -> list[str]:
    if item.deck == "connector":
        types = ["produce", "recog"]
        if cloze_parts(item):
            types.append("cloze")
        return types
    if item.pos == "noun" and item.gender in ARTICLE:
        return ["produce", "gender", "recog"]
    return ["produce", "recog"]


def cloze_parts(item: Item) -> tuple[str, str] | None:
    """(sentence with blank, connector as written in it); only for one-word connectors."""
    if not item.example_de or " " in item.de.strip():
        return None
    m = re.search(rf"(?<![\wäöüß]){re.escape(item.de)}(?![\wäöüß])", item.example_de, re.IGNORECASE)
    if not m:
        return None
    return item.example_de[: m.start()] + "____" + item.example_de[m.end() :], m.group(0)


def with_article(item: Item, word: str) -> str:
    return (
        f"{ARTICLE[item.gender]} {word}" if item.pos == "noun" and item.gender in ARTICLE else word
    )


def expected(card: Card) -> tuple[str, list[str]]:
    item = card.item
    if card.card_type == "gender":
        return ARTICLE[item.gender], []
    if card.card_type == "cloze":
        parts = cloze_parts(item)
        assert parts
        return parts[1], [item.de]
    return with_article(item, item.de), [with_article(item, a) for a in item.alt or []]


def item_reveal(item: Item) -> dict:
    return {
        "item_id": item.id,
        "de": with_article(item, item.de),
        "en": item.en,
        "gender": item.gender,
        "symbol": SYMBOL.get(item.gender or ""),
        "plural": item.plural,
        "example_de": item.example_de,
        "example_en": item.example_en,
        "tags": item.tags,
        "status": item.status,
    }


def prompt(card: Card) -> dict:
    item = card.item
    base = {"card_id": card.id, "card_type": card.card_type, "deck": item.deck, "kind": item.kind}
    if card.card_type == "produce":
        hint = "with article" if item.pos == "noun" and item.gender else None
        return {**base, "mode": "type", "prompt": item.en, "hint": hint}
    if card.card_type == "recog":
        return {
            **base,
            "mode": "reveal",
            "prompt": item.de,
            "symbol": SYMBOL.get(item.gender or ""),
            "hint": "Say the meaning, then reveal",
        }
    if card.card_type == "gender":
        return {**base, "mode": "choice", "prompt": item.de, "choices": ["der", "die", "das"]}
    if card.card_type == "cloze":
        parts = cloze_parts(item)
        assert parts
        return {**base, "mode": "type", "prompt": parts[0], "hint": item.example_en}
    raise ValueError(card.card_type)
