"""Convert old mistake/attempt/review rows into evidence events (idempotent). Usage: python -m scripts.backfill_evidence"""

import sys

from app.db import SessionLocal
from app.services import backfill


def main() -> int:
    db = SessionLocal()
    n = backfill.run(db)
    db.commit()
    print(f"{n} evidence events added.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
