from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from app.core import auth
from app.core.config import settings
from app.db import DB

router = APIRouter(prefix="/auth")


class LoginIn(BaseModel):
    password: str


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: DB):
    ip = request.client.host if request.client else "unknown"
    if auth.rate_limited(ip):
        raise HTTPException(status_code=429, detail="Too many attempts. Wait 15 minutes.")
    if not auth.verify_password(db, body.password):
        auth.record_failure(ip)
        raise HTTPException(status_code=401, detail="Wrong password.")
    token = auth.create_session(db)
    response.set_cookie(
        auth.COOKIE, token, max_age=settings.session_days * 86400,
        httponly=True, secure=settings.cookie_secure, samesite="lax", path="/",
    )  # fmt: skip
    return {"ok": True}


@router.post("/logout")
def logout(request: Request, response: Response, db: DB):
    auth.delete_session(db, request.cookies.get(auth.COOKIE))
    response.delete_cookie(auth.COOKIE, path="/")
    return {"ok": True}


@router.get("/me", dependencies=[Depends(auth.require_user)])
def me():
    return {"user": "Zee"}
