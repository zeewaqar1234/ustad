"""Build voice scenario cards: data/seed/source/scenarios.json -> Pydantic -> self-hosted LanguageTool
-> data/seed/scenarios.json. A scenario with a flag on its German is marked needs_review and is not
offered until approved (fix the source and rebuild). Needs `make lt-up`.
Usage: uv run python -m scripts.build_voice
"""

import json
import sys

from app.content.schemas import Scenarios
from app.core.config import settings
from scripts.build_seed import lt_issues


def main() -> int:
    src = Scenarios.model_validate_json(
        (settings.seed_dir / "source" / "scenarios.json").read_text()
    )
    out, flagged = [], 0
    for s in src.scenarios:
        notes = [i for text in s.correct_german() for i in lt_issues(text)]
        flagged += bool(notes)
        out.append({**s.model_dump(mode="json"), "status": "needs_review" if notes else "ok",
                    "review_notes": notes})  # fmt: skip
        for n in notes:
            print(f"  {s.code}: {n['rule']} in {n['text']!r}: {n['message']}")
    (settings.seed_dir / "scenarios.json").write_text(
        json.dumps({"scenarios": out}, ensure_ascii=False, indent=1) + "\n"
    )
    print(f"scenarios: {len(out)}, {flagged} needs_review")
    return 0


if __name__ == "__main__":
    sys.exit(main())
