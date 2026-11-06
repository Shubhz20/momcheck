"""Protects the Gnani and Gemini credits when the public demo gets traffic.

- Every Gnani and Gemini request is counted per day (IST) in the usage table.
- Daily caps (env: DAILY_STT_SECONDS, DAILY_TTS_CHARS, DAILY_LLM_REQUESTS) stop new requests once reached.
- Per-visitor daily limits stop one person from using up the day (demo accounts and the public pages).
"""
from __future__ import annotations

import logging
import threading
from collections import defaultdict
from datetime import date

from fastapi import HTTPException, Request
from sqlmodel import Session, select

from .config import get_settings

log = logging.getLogger("usage")

LIMIT_MESSAGE = "MomCheck's free demo has reached today's limit. Please try again tomorrow."


class BudgetExceeded(Exception):
    """Today's cap for a paid API is used up. Turned into a 429 by the app."""


def _today() -> date:
    from .services.serialize import today

    return today()


def _caps() -> dict[str, float]:
    s = get_settings()
    return {"stt_seconds": s.daily_stt_seconds, "tts_chars": s.daily_tts_chars, "llm_requests": s.daily_llm_requests}


def totals(day: date | None = None) -> dict[str, float]:
    from .db import engine
    from .models import Usage

    with Session(engine) as session:
        rows = session.exec(select(Usage).where(Usage.day == (day or _today()))).all()
        return {r.kind: r.units for r in rows}


def check(kind: str) -> None:
    """Raise BudgetExceeded if today's cap for this kind is used up."""
    cap = _caps().get(kind)
    if not cap or cap <= 0:
        return
    try:
        used = totals().get(kind, 0)
    except Exception as exc:  # noqa: BLE001  (metering must never break a call)
        log.warning("Usage check failed, allowing the request: %s", exc)
        return
    if used >= cap:
        log.warning("Daily cap reached for %s (%s)", kind, cap)
        raise BudgetExceeded(LIMIT_MESSAGE)


_lock = threading.Lock()


def record(kind: str, units: float = 1) -> None:
    """Add to today's counter. Never lets a metering problem break a call."""
    from .db import engine
    from .models import Usage

    try:
        with _lock, Session(engine) as session:
            day = _today()
            row = session.exec(select(Usage).where(Usage.day == day, Usage.kind == kind)).first()
            if row is None:
                row = Usage(day=day, kind=kind, units=0)
            row.units = (row.units or 0) + units
            session.add(row)
            session.commit()
    except Exception as exc:  # noqa: BLE001
        log.warning("Usage metering failed: %s", exc)


def report() -> dict:
    """Today's use against the caps, and the last 7 days (for the owner's settings page)."""
    from datetime import timedelta

    from .db import engine
    from .models import Usage

    today = _today()
    with Session(engine) as session:
        rows = session.exec(select(Usage).where(Usage.day >= today - timedelta(days=6))).all()
    days: dict[str, dict[str, float]] = defaultdict(dict)
    for r in rows:
        days[r.day.isoformat()][r.kind] = r.units
    return {"today": days.get(today.isoformat(), {}), "caps": _caps(), "days": dict(sorted(days.items()))}


# ---- per-visitor limits (in memory: one instance, resets daily) ---------------------
_hits: dict[tuple[str, str, str], int] = defaultdict(int)


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return (fwd.split(",")[0].strip() if fwd else "") or (request.client.host if request.client else "unknown")


def limit(request: Request, bucket: str, per_day: int) -> None:
    """429 once this visitor has used `bucket` per_day times today."""
    day = _today().isoformat()
    key = (client_ip(request), day, bucket)
    if _hits[key] >= per_day:
        raise HTTPException(429, "You've tried this many times today. Please come back tomorrow, or watch the demo video.")
    _hits[key] += 1
    if len(_hits) > 50_000:  # drop old days
        for k in [k for k in _hits if k[1] != day]:
            _hits.pop(k, None)
