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
    # Her own voice (Gnani voice cloning): an embedding made from a short sample she recorded with consent
    voice_embedding: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    voice_consent_at: Optional[datetime] = None
    use_own_voice: bool = True
    # Where she sends women: {"phc": {...}, "hospital": {...}, "anm": {...}}, each {name, phone, lat?, lng?}
    facilities: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
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
    lat: Optional[float] = None  # home location, for the ASHA's map
    lng: Optional[float] = None
    ask_token: Optional[str] = Field(default=None, index=True)  # her personal "Ask MomCheck" link
    created_at: datetime = Field(default_factory=utcnow)


class Call(SQLModel, table=True):
    """A follow-up voice conversation (Prisma STT -> Gemini -> Timbre TTS)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    beneficiary_id: int = Field(foreign_key="beneficiary.id", index=True)
    language: str
    # in_progress | completed | abandoned; phone calls also: ringing | not_answered | failed
    status: str = "in_progress"
    # browser | phone | ask (she started it from her Ask MomCheck link) | interpreter (ASHA <-> her, translated)
    channel: str = "browser"
    provider_sid: Optional[str] = None  # Twilio Call SID for phone calls
    stream_token: Optional[str] = None  # secret that the Twilio media stream must present
    outcome: Optional[str] = None  # DANGER_SIGN | ROUTINE | CALLBACK | NOT_REACHABLE
    danger_signs: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    summary: Optional[str] = None
    transcript: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    extraction: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    checklist: Optional[dict[str, str]] = Field(default=None, sa_column=Column(JSON))  # item id -> ok | concern | danger
    triage: Optional[str] = None  # red | amber | green
    own_voice: bool = False  # MomCheck spoke in the ASHA's cloned voice
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
    acknowledged_at: Optional[datetime] = None


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


class Briefing(SQLModel, table=True):
    """A saved daily briefing: one per ASHA, day (IST) and language. Generating it again the same day replaces it."""
    id: Optional[int] = Field(default=None, primary_key=True)
    asha_id: int = Field(foreign_key="asha.id", index=True)
    day: date = Field(index=True)
    language: str
    text: str
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
