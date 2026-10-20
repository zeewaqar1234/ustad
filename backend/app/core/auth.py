"""Single-user password login: argon2 hash + httpOnly session cookie + login rate limit."""

import hashlib
import secrets
import time
from collections import defaultdict, deque
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import DB, utcnow
from app.models import AuthSession, Profile

COOKIE = "ustad_session"
MAX_FAILS, WINDOW_S = 5, 15 * 60

_hasher = PasswordHasher()
_fails: dict[str, deque[float]] = defaultdict(deque)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(db: Session, password: str) -> bool:
    profile = db.get(Profile, 1)
    stored = (profile.password_hash if profile else None) or settings.password_hash
    if not stored:
        return False
    try:
        return _hasher.verify(stored, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def rate_limited(ip: str) -> bool:
    q, now = _fails[ip], time.monotonic()
    while q and now - q[0] > WINDOW_S:
        q.popleft()
    return len(q) >= MAX_FAILS


def record_failure(ip: str) -> None:
    _fails[ip].append(time.monotonic())


def reset_failures() -> None:
    _fails.clear()


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session) -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        AuthSession(
            token_hash=_digest(token), expires=utcnow() + timedelta(days=settings.session_days)
        )
    )
    db.commit()
    return token


def delete_session(db: Session, token: str | None) -> None:
    if token:
        db.query(AuthSession).filter_by(token_hash=_digest(token)).delete()
        db.commit()


def require_user(request: Request, db: DB) -> None:
    token = request.cookies.get(COOKIE)
    s = db.get(AuthSession, _digest(token)) if token else None
    if s is None or s.expires < utcnow():
        raise HTTPException(status_code=401, detail="Not logged in")
