"""Prepare a throwaway DB for the Playwright smoke test: set the password from E2E_PASSWORD and make the
"und" produce card due now, so the review screen has a typed card to show. Never run on the real DB.
Usage: DATABASE_URL=sqlite:///<scratch>/e2e.db E2E_PASSWORD=... uv run python -m scripts.e2e_setup
"""

import os
import sys

from sqlalchemy import select

from app.core.auth import hash_password
from app.core.config import settings
from app.db import SessionLocal, utcnow
from app.models import Card, Item, Profile


def main() -> int:
    pw = os.environ.get("E2E_PASSWORD", "")
    if "e2e" not in settings.database_url or len(pw) < 10:
        print("Needs DATABASE_URL containing 'e2e' and E2E_PASSWORD (10+ chars).")
        return 1
    db = SessionLocal()
    profile = db.get(Profile, 1) or Profile(id=1, name="Zee")
    profile.password_hash = hash_password(pw)
    db.merge(profile)
    card = db.scalar(
        select(Card)
        .join(Item)
        .where(Item.deck == "connector", Item.de == "und", Card.card_type == "produce")
    )
    now = utcnow()
    card.introduced_at, card.due, card.state = now, now, 1
    db.commit()
    print(f"ready: card {card.id} due")
    return 0


if __name__ == "__main__":
    sys.exit(main())
