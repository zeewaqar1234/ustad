"""Set the login password (stored as an argon2 hash in profile). Usage: make password"""

import getpass
import sys

from app.core.auth import hash_password
from app.db import SessionLocal
from app.models import Profile


def main() -> int:
    pw = getpass.getpass("New password: ")
    if len(pw) < 10:
        print("Use at least 10 characters.")
        return 1
    if getpass.getpass("Repeat: ") != pw:
        print("Passwords differ.")
        return 1
    db = SessionLocal()
    profile = db.get(Profile, 1) or Profile(id=1, name="Zee")
    profile.password_hash = hash_password(pw)
    db.merge(profile)
    db.commit()
    print("Password set.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
