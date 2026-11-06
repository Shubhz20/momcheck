"""Database tables."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Asha(SQLModel, table=True):
    """An ASHA worker's account. Each one sees only her own women, calls, alerts and notes."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    phone: str = Field(index=True)  # 10 digits; used to sign in
    area: str = ""  # village / ward she covers
    language: str = "hi-IN"  # language of her daily briefing
    pin_hash: Optional[str] = None  # None for the public demo accounts
    is_demo: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class Beneficiary(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    asha_id: Optional[int] = Field(default=None, foreign_key="asha.id", index=True)
    name: str
    phone: str = Field(index=True)
    language: str = "hi-IN"
    village: str = ""
    category: str = "pregnant"  # pregnant | postnatal
    edd: Optional[date] = None
    delivery_date: Optional[date] = None
    next_visit_date: Optional[date] = None
    next_visit_type: Optional[str] = None
    notes: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class Call(SQLModel, table=True):
    """A follow-up voice conversation (Prisma STT -> Gemini -> Timbre TTS)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    beneficiary_id: int = Field(foreign_key="beneficiary.id", index=True)
    language: str
    # in_progress | completed | abandoned; phone calls also: ringing | not_answered | failed
    status: str = "in_progress"
    channel: str = "browser"  # browser | phone
    provider_sid: Optional[str] = None  # Twilio Call SID for phone calls
    stream_token: Optional[str] = None  # secret that the Twilio media stream must present
    outcome: Optional[str] = None  # DANGER_SIGN | ROUTINE | CALLBACK | NOT_REACHABLE
    danger_signs: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    summary: Optional[str] = None
    transcript: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    extraction: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    phone_line: bool = False
    duration_sec: Optional[int] = None
    error: Optional[str] = None
    triggered_at: datetime = Field(default_factory=utcnow)
    completed_at: Optional[datetime] = None


class Alert(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    beneficiary_id: int = Field(foreign_key="beneficiary.id", index=True)
    call_id: Optional[int] = Field(default=None, foreign_key="call.id")
    severity: str = "high"  # high | medium
    reason: str = ""
    danger_signs: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    status: str = "open"  # open | acknowledged
    created_at: datetime = Field(default_factory=utcnow)


class Note(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    asha_id: Optional[int] = Field(default=None, foreign_key="asha.id", index=True)
    beneficiary_id: Optional[int] = Field(default=None, foreign_key="beneficiary.id", index=True)
    transcript: str
    detected_language: Optional[str] = None
    action: str = ""
    follow_up_date: Optional[date] = None
    summary: str = ""
    created_at: datetime = Field(default_factory=utcnow)
