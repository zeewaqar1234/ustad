"""Fixture evidence for the readiness screenshots: weeks of reading, grammar, writing, speaking and Diktat
answers plus practice hours, in a throwaway DB only (refuses unless DATABASE_URL contains 'e2e').
Usage: DATABASE_URL=sqlite:///<scratch>/e2e.db uv run python -m scripts.e2e_fixture_readiness
"""

import sys
from datetime import timedelta

from app.core.clock import local_date
from app.core.config import settings
from app.db import SessionLocal, utcnow
from app.models import ActivityLog, EvidenceEvent, PlacementResult, Profile


def main() -> int:
    if "e2e" not in settings.database_url:
        print("Needs DATABASE_URL containing 'e2e'.")
        return 1
    db = SessionLocal()
    now = utcnow()
    today = local_date(now)
    # (skill, source, weeks back, correct, errors per week) rising accuracy over 8 weeks
    plan = [("reading", "reading_q", 8, 10, 6), ("grammar", "drill", 8, 14, 4), ("writing", "homework", 6, 12, 4),
            ("speaking", "voice_review", 4, 10, 3), ("listening", "diktat", 5, 10, 4)]  # fmt: skip
    for skill, source, weeks, base, bad in plan:
        for w in range(weeks - 1, -1, -1):
            wrong = max(1, bad - (weeks - 1 - w) * 2 // 3)
            ts = now - timedelta(days=w * 7 + 1)
            for i in range(base + wrong):
                db.add(
                    EvidenceEvent(
                        ts=ts,
                        skill=skill,
                        source=source,
                        outcome="error" if i < wrong else "correct",
                    )
                )
            for d in range(7):
                day = today - timedelta(days=w * 7 + d)
                row = db.get(ActivityLog, (day, skill))
                if row is None:
                    db.add(ActivityLog(date=day, skill=skill, seconds=20 * 60))
    p = db.get(Profile, 1)
    p.level_band = "B1.1"
    db.add(PlacementResult(answers={}, by_band={}, level_band="B1.1", ts=now - timedelta(days=60)))
    db.commit()
    print("fixture evidence added")
    return 0


if __name__ == "__main__":
    sys.exit(main())
