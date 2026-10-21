"""Placement test (docs/phases.md Phase 2): ~35 items + one 5-sentence writing sample.

Sets profile.level_band and marks known items. Level rule: work through the bands in order (A2, B1.1,
B1.2, B2); the first band under 70 % correct is the class Zee studies in. A writing score under 5/10
moves the result one class down (writing is the skill this app checks hardest).
Known items: a correct vocab answer marks its seed item known; its cards start in review with a first
check in 14-27 days instead of being taught as new. A correct grammar answer marks its pattern known.
Items whose answer LanguageTool flagged (needs_review) are left out of the test until approved.
"""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import content
from app.models import Item, Pattern, Profile
from app.srs import grader

BANDS = ["A2", "B1.1", "B1.2", "B2"]
# class to study in when the first band under the pass mark is the key (None = all passed)
CLASS_FOR = {"A2": "A2+", "B1.1": "B1.1", "B1.2": "B1.2", "B2": "B1 Board", None: "B2.1"}
CLASSES = ["A2+", "B1.1", "B1.2", "B1 Board", "B2.1"]
PASS = 0.7


def approved(db: Session) -> set[str]:
    profile = db.get(Profile, 1)
    return set((profile.settings_json or {}).get("placement_approved", [])) if profile else set()


def items(db: Session) -> list[dict]:
    ok = approved(db)
    return [i for i in content.load("placement")["items"] if i["status"] == "ok" or i["id"] in ok]


def public(item: dict) -> dict:
    """What the client sees: no answer, no marks."""
    hint = None
    if item["skill"] == "vocab" and item["answer"].split()[0] in ("der", "die", "das"):
        hint = "with article"
    return {"id": item["id"], "band": item["band"], "mode": item["mode"], "prompt": item["prompt"],
            "choices": item["choices"], "hint": hint}  # fmt: skip


def score(db: Session, answers: dict[str, str]) -> tuple[dict, list[dict]]:
    by_band = {b: {"correct": 0, "total": 0} for b in BANDS}
    results = []
    for it in items(db):
        given = answers.get(it["id"], "")
        if it["mode"] == "choice":
            ok = given.strip() == it["answer"]
        else:
            ok = grader.grade(given, it["answer"], it["alt"]).rating >= grader.HARD
        by_band[it["band"]]["total"] += 1
        by_band[it["band"]]["correct"] += ok
        results.append({"id": it["id"], "given": given, "expected": it["answer"], "ok": ok,
                        "item": it})  # fmt: skip
    return by_band, results


def level(by_band: dict, writing_score: int | None) -> str:
    first_fail = None
    for b in BANDS:
        c, t = by_band[b]["correct"], by_band[b]["total"]
        if t and c / t < PASS:
            first_fail = b
            break
    cls = CLASS_FOR[first_fail]
    if writing_score is not None and writing_score < 5:
        cls = CLASSES[max(0, CLASSES.index(cls) - 1)]
    return cls


def mark_known(db: Session, now: datetime, results: list[dict]) -> int:
    marked = 0
    for r in results:
        if not r["ok"]:
            continue
        it = r["item"]
        if it["pattern"]:
            p = db.scalar(select(Pattern).where(Pattern.code == it["pattern"]))
            if p is not None:
                p.known_from_placement = True
        for m in it["marks"]:
            item = db.scalar(select(Item).where(Item.deck == m["deck"], Item.de == m["de"]))
            if item is None or item.known_from_placement:
                continue
            item.known_from_placement = True
            marked += 1
            for card in item.cards:
                if card.introduced_at is None:
                    # known: skip teaching, schedule a first check later (FSRS Review state)
                    card.introduced_at = now
                    card.state, card.step = 2, None
                    card.stability, card.difficulty = 20.0, 5.0
                    card.last_review = now
                    card.due = now + timedelta(days=14 + item.id % 14)
    db.flush()
    return marked
