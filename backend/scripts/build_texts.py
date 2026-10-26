"""Build seed reading texts: data/seed/source/texts.json -> Pydantic -> self-hosted LanguageTool
-> data/seed/texts.json. A text with a flag on its German is marked needs_review (fix the source and
rebuild). Needs `make lt-up`.
Usage: uv run python -m scripts.build_texts
"""

import json
import sys

from app.content.schemas import SeedTexts
from app.core.config import settings
from scripts.build_seed import lt_issues


def main() -> int:
    src = SeedTexts.model_validate_json((settings.seed_dir / "source" / "texts.json").read_text())
    out, flagged = [], 0
    for t in src.texts:
        notes = [i for text in t.correct_german() for i in lt_issues(text)]
        flagged += bool(notes)
        out.append({**t.model_dump(mode="json"), "status": "needs_review" if notes else "ok",
                    "review_notes": notes})  # fmt: skip
        for n in notes:
            print(f"  {t.code}: {n['rule']} in {n['context']!r}: {n['message']}")
    (settings.seed_dir / "texts.json").write_text(
        json.dumps({"texts": out}, ensure_ascii=False, indent=1) + "\n"
    )
    print(f"texts: {len(out)}, {flagged} needs_review")
    return 0


if __name__ == "__main__":
    sys.exit(main())
