"""ASHA sign-in: PIN hashing, signed session cookies, and the `current_asha` dependency.

Demo accounts have no PIN and can be opened by anyone. Private accounts sign in with phone + PIN.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from collections import defaultdict

from fastapi import Depends, HTTPException, Request, Response
from sqlmodel import Session

from .config import get_settings
from .db import get_session
from .models import Asha

COOKIE = "mc_session"
SESSION_DAYS = 30
_PBKDF2_ROUNDS = 200_000


# ---- PINs -------------------------------------------------------------------
def hash_pin(pin: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), _PBKDF2_ROUNDS).hex()
    return f"pbkdf2${_PBKDF2_ROUNDS}${salt}${digest}"


def check_pin(pin: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _, rounds, salt, digest = stored.split("$")
        candidate = hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), int(rounds)).hex()
    except ValueError:
        return False
    return hmac.compare_digest(candidate, digest)


# ---- Wrong-PIN limit (per phone, in memory) ---------------------------------
_MAX_FAILURES = 5
_LOCK_SECONDS = 10 * 60
_failures: dict[str, list[float]] = defaultdict(list)


def check_not_locked(phone: str) -> None:
    recent = [t for t in _failures[phone] if time.time() - t < _LOCK_SECONDS]
    _failures[phone] = recent
    if len(recent) >= _MAX_FAILURES:
        raise HTTPException(429, "Too many wrong PINs. Try again in 10 minutes.")


def record_failure(phone: str) -> None:
    _failures[phone].append(time.time())


def clear_failures(phone: str) -> None:
    _failures.pop(phone, None)


# ---- Session cookie ---------------------------------------------------------
def _sign(payload: str) -> str:
    return hmac.new(get_settings().secret_key.encode(), payload.encode(), hashlib.sha256).hexdigest()[:40]


def make_token(asha_id: int) -> str:
    payload = f"{asha_id}.{int(time.time())}"
    return f"{payload}.{_sign(payload)}"


def read_token(token: str | None) -> int | None:
    if not token:
        return None
    try:
        asha_id, issued, sig = token.split(".")
    except ValueError:
        return None
    if not hmac.compare_digest(sig, _sign(f"{asha_id}.{issued}")):
        return None
    if time.time() - int(issued) > SESSION_DAYS * 86400:
        return None
    return int(asha_id)


def set_session(response: Response, request: Request, asha: Asha) -> None:
    https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(
        COOKIE, make_token(asha.id), max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax", secure=https, path="/"
    )


def clear_session(response: Response) -> None:
    response.delete_cookie(COOKIE, path="/")


def current_asha(request: Request, session: Session = Depends(get_session)) -> Asha:
    asha_id = read_token(request.cookies.get(COOKIE))
    asha = session.get(Asha, asha_id) if asha_id else None
    if asha is None:
        raise HTTPException(401, "Please sign in")
    return asha
