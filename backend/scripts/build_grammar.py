"""Build grammar content: data/seed/source/{patterns/batch_*.json, placement.json, recitation.json}
-> Pydantic validation -> self-hosted LanguageTool -> data/seed/{patterns,placement,recitation}.json.

Patterns are checked batch by batch (5 per batch). A pattern with any LanguageTool flag on its correct
German is marked needs_review and stays out of drills until approved in the check queue.
Placement items with a flagged answer are marked needs_review (kept in the test, flagged in the queue).
Needs `make lt-up`. Usage: uv run python -m scripts.build_grammar
"""

import json
import sys

from app.content.schemas import PatternBatch, Placement, Recitation
from app.core.config import settings
from scripts.build_seed import lt_issues

SRC = settings.seed_dir / "source"


def _write(name: str, data: dict) -> None:
    (settings.seed_dir / f"{name}.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    )


def build_patterns() -> tuple[int, int]:
    out, flagged, codes, orders = [], 0, set(), set()
    for path in sorted((SRC / "patterns").glob("batch_*.json")):
        batch = PatternBatch.model_validate_json(path.read_text())
        for p in batch.patterns:
            if p.code in codes or p.order in orders:
                raise ValueError(f"duplicate code/order: {p.code} {p.order}")
            codes.add(p.code)
            orders.add(p.order)
            notes = [issue for t in p.correct_german() for issue in lt_issues(t)]
            flagged += bool(notes)
            out.append(
                {**p.model_dump(mode="json"), "batch": batch.batch,
                 "status": "needs_review" if notes else "ok", "review_notes": notes}
            )  # fmt: skip
        print(f"{path.name}: {len(batch.patterns)} patterns checked")
    out.sort(key=lambda p: p["order"])
    _write("patterns", {"patterns": out})
    return len(out), flagged


def build_placement() -> tuple[int, int]:
    pl = Placement.model_validate_json((SRC / "placement.json").read_text())
    items, flagged = [], 0
    for it in pl.items:
        notes = []
        if it.mode == "type" and it.skill == "grammar":
            notes = [issue for t in [it.answer, *it.alt] for issue in lt_issues(t)]
        flagged += bool(notes)
        items.append(
            {**it.model_dump(mode="json"), "status": "needs_review" if notes else "ok",
             "review_notes": notes}
        )  # fmt: skip
    _write("placement", {"items": items, "writing": pl.writing.model_dump()})
    return len(items), flagged


def build_recitation() -> int:
    rec = Recitation.model_validate_json((SRC / "recitation.json").read_text())
    _write("recitation", rec.model_dump())
    return len(rec.tables)


def main() -> int:
    total, flagged = build_patterns()
    print(f"patterns: {total}, {flagged} needs_review")
    total, flagged = build_placement()
    print(f"placement: {total} items, {flagged} needs_review")
    print(f"recitation: {build_recitation()} tables")
    return 0


if __name__ == "__main__":
    sys.exit(main())
