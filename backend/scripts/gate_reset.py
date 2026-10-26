"""Close the builder override (profile.gate_override = false). Usage: make gate-reset"""

import sys

from app.db import SessionLocal
from app.models import Profile


def main() -> int:
    db = SessionLocal()
    profile = db.get(Profile, 1)
    if profile is None:
        print("No profile yet. Nothing to reset.")
        return 0
    profile.gate_override = False
    db.commit()
    print("gate_override = false. GET /api/stats/gate now follows the 5-of-7 rule.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
