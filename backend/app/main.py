"""MomCheck API (FastAPI). Serves the built React app from frontend/dist as well."""
from __future__ import annotations

import difflib
import io
import logging
import os
import re
import secrets
import statistics
import wave
from datetime import date, datetime, timedelta
from typing import Any, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator
from sqlmodel import Session, func, select

from . import auth, prompts, protocol, telephony, usage
from .auth import current_asha
from .config import ROOT_DIR, get_settings
from .db import get_session, init_db
from .gnani import speech
from .gnani.speech import SpeechError
from .languages import LANGUAGES
from .llm import LLMError
from .models import Alert, Asha, Beneficiary, Briefing, Call, Note, utcnow
from .seed import delete_women, reset_demo, seed_sample
from .services import briefing, calls, notes
from .services.briefing import _start_of_today_utc
from .services.serialize import alert_out, beneficiary_out, call_out, days_since_delivery, iso, note_out, today, weeks_pregnant

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="MomCheck", version="1.0.0")

MAX_AUDIO_BYTES = 6 * 1024 * 1024


@app.on_event("startup")
def _startup() -> None:
    init_db()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class BeneficiaryIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    language: Optional[str] = None
    village: Optional[str] = None
    category: Optional[str] = None
    edd: Optional[date] = None
    delivery_date: Optional[date] = None
    next_visit_date: Optional[date] = None
    next_visit_type: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: Optional[str]) -> Optional[str]:
        return v if v is None else _ten_digits(v)

    @field_validator("language")
    @classmethod
    def _language(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in LANGUAGES:
            raise ValueError(f"Unsupported language {v}")
        return v

    @field_validator("category")
    @classmethod
    def _category(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("pregnant", "postnatal"):
            raise ValueError("category must be 'pregnant' or 'postnatal'")
        return v


def _ten_digits(v: str) -> str:
    digits = "".join(ch for ch in v if ch.isdigit())[-10:]
    if len(digits) != 10:
        raise ValueError("Phone number must have 10 digits")
    return digits


def _valid_pin(v: str) -> str:
    if not (v.isdigit() and 4 <= len(v) <= 6):
        raise ValueError("PIN must be 4 to 6 digits")
    return v


class LoginIn(BaseModel):
    phone: str
    pin: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return _ten_digits(v)


class SignupIn(BaseModel):
    name: str
    phone: str
    area: str
    language: str = "hi-IN"
    pin: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return _ten_digits(v)

    @field_validator("pin")
    @classmethod
    def _pin(cls, v: str) -> str:
        return _valid_pin(v)

    @field_validator("name", "area")
    @classmethod
    def _required(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("required")
        return v.strip()

    @field_validator("language")
    @classmethod
    def _language(cls, v: str) -> str:
        if v not in LANGUAGES:
            raise ValueError(f"Unsupported language {v}")
        return v


class DemoLoginIn(BaseModel):
    asha_id: int


class NoteLinkIn(BaseModel):
    beneficiary_id: Optional[int] = None


class NoteIn(BaseModel):
    transcript: str
    detected_language: Optional[str] = None
    beneficiary_id: Optional[int] = None
    beneficiary_name: Optional[str] = None
    action: str = ""
    follow_up_date: Optional[date] = None
    summary: str = ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _get_beneficiary(session: Session, bid: int, asha: Asha) -> Beneficiary:
    b = session.get(Beneficiary, bid)
    if b is None or b.asha_id != asha.id:
        raise HTTPException(404, "Beneficiary not found")
    return b


def _get_call(session: Session, cid: int, asha: Asha) -> Call:
    c = session.get(Call, cid)
    if c is None:
        raise HTTPException(404, "Call not found")
    _get_beneficiary(session, c.beneficiary_id, asha)  # 404 unless the call belongs to one of her women
    return c


def _names(session: Session, asha: Asha) -> dict[int, Beneficiary]:
    return {b.id: b for b in session.exec(select(Beneficiary).where(Beneficiary.asha_id == asha.id)).all()}


def _phone_calls_ready() -> bool:
    s = get_settings()
    return s.phone_calls_enabled and s.phone_calls_configured and s.public_base_url.startswith("https://")


def _demo_limit(request: Request, asha: Asha, bucket: str, per_day: int) -> None:
    """Visitors to the shared demo accounts get a daily allowance; an ASHA's own account doesn't."""
    if asha.is_demo:
        usage.limit(request, bucket, per_day)


def _me(asha: Asha) -> dict[str, Any]:
    return {
        "id": asha.id,
        "name": asha.name,
        "phone": asha.phone,
        "area": asha.area,
        "language": asha.language,
        "is_demo": asha.is_demo,
        # Real phone calls need Twilio, and are kept to private accounts (the trial can only ring verified numbers).
        "phone_calls": _phone_calls_ready() and not asha.is_demo,
        "has_voice": bool(asha.voice_embedding),
        "use_own_voice": bool(asha.use_own_voice),
        "voice_consent_at": iso(asha.voice_consent_at),
        "facilities": asha.facilities or {},
    }


def _languages() -> list[dict[str, Any]]:
    return [{"code": code, **meta, "enabled": True} for code, meta in LANGUAGES.items()]


def _call_json(session: Session, c: Call) -> dict[str, Any]:  # caller has already checked ownership
    b = session.get(Beneficiary, c.beneficiary_id)
    return call_out(c, b)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health() -> dict[str, Any]:
    # Render sets RENDER_GIT_COMMIT, so this shows which commit is live.
    return {"ok": True, "commit": os.getenv("RENDER_GIT_COMMIT", "local")[:7], "phone_calls": _phone_calls_ready()}


@app.get("/api/languages")
def languages() -> list[dict[str, Any]]:
    return _languages()


# ---- accounts ---------------------------------------------------------------
@app.get("/api/auth/demo-accounts")
def demo_accounts(session: Session = Depends(get_session)) -> list[dict[str, Any]]:
    out = []
    for a in session.exec(select(Asha).where(Asha.is_demo == True).order_by(Asha.id)).all():  # noqa: E712
        women = session.exec(select(Beneficiary).where(Beneficiary.asha_id == a.id)).all()
        out.append(
            {
                "id": a.id,
                "name": a.name,
                "area": a.area,
                "language": a.language,
                "women": len(women),
                "languages": sorted({w.language for w in women}),
            }
        )
    return out


@app.post("/api/auth/demo")
def demo_login(body: DemoLoginIn, request: Request, response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    asha = session.get(Asha, body.asha_id)
    if asha is None or not asha.is_demo:
        raise HTTPException(404, "Demo account not found")
    auth.set_session(response, request, asha)
    return _me(asha)


@app.post("/api/auth/login")
def login(body: LoginIn, request: Request, response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    auth.check_not_locked(body.phone)
    asha = session.exec(select(Asha).where(Asha.phone == body.phone, Asha.is_demo == False)).first()  # noqa: E712
    if asha is None or not auth.check_pin(body.pin, asha.pin_hash):
        auth.record_failure(body.phone)
        raise HTTPException(401, "Phone number or PIN is wrong")
    auth.clear_failures(body.phone)
    auth.set_session(response, request, asha)
    return _me(asha)


@app.post("/api/auth/signup")
def signup(body: SignupIn, request: Request, response: Response, session: Session = Depends(get_session)) -> dict[str, Any]:
    if session.exec(select(Asha).where(Asha.phone == body.phone)).first():
        raise HTTPException(409, "An account with this phone number already exists. Sign in instead.")
    asha = Asha(name=body.name, phone=body.phone, area=body.area, language=body.language, pin_hash=auth.hash_pin(body.pin))
    session.add(asha)
    session.commit()
    session.refresh(asha)
    auth.set_session(response, request, asha)
    return _me(asha)


@app.post("/api/auth/logout")
def logout(response: Response) -> dict[str, bool]:
    auth.clear_session(response)
    return {"ok": True}


@app.get("/api/auth/me")
def me(asha: Asha = Depends(current_asha)) -> dict[str, Any]:
    return _me(asha)


@app.post("/api/auth/reset-demo")
def reset_demo_account(asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, int]:
    if not asha.is_demo:
        raise HTTPException(400, "Only demo accounts can be reset")
    briefing.clear_cache(asha.id)
    return {"created": reset_demo(session, asha)}


# ---- dashboard --------------------------------------------------------------
@app.get("/api/dashboard")
def dashboard(asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, Any]:
    women = _names(session, asha)
    ids = list(women)
    since = _start_of_today_utc()
    todays = session.exec(select(Call).where(Call.triggered_at >= since, Call.beneficiary_id.in_(ids))).all()
    open_alerts = session.exec(
        select(Alert).where(Alert.status == "open", Alert.beneficiary_id.in_(ids)).order_by(Alert.created_at.desc())
    ).all()
    horizon = today() + timedelta(days=7)
    due = [b for b in women.values() if b.next_visit_date and b.next_visit_date <= horizon]
    due.sort(key=lambda b: b.next_visit_date)
    recent = session.exec(
        select(Call).where(Call.beneficiary_id.in_(ids)).order_by(Call.triggered_at.desc()).limit(10)
    ).all()
    return {
        "totals": {
            "beneficiaries": len(women),
            "pregnant": sum(1 for b in women.values() if b.category == "pregnant"),
            "postnatal": sum(1 for b in women.values() if b.category == "postnatal"),
        },
        "today": {
            "calls": len(todays),
            "completed": sum(1 for c in todays if c.status == "completed"),
            "danger": sum(1 for c in todays if c.outcome == "DANGER_SIGN"),
        },
        "open_alerts": len(open_alerts),
        "alerts": [alert_out(a, women[a.beneficiary_id]) for a in open_alerts if a.beneficiary_id in women],
        "visits_due": [beneficiary_out(session, b) for b in due],
        "recent_calls": [call_out(c, women[c.beneficiary_id]) for c in recent if c.beneficiary_id in women],
        "languages": _languages(),
        "impact": _impact(session, asha, women),
        "map": _map(asha, women, open_alerts),
    }


def _impact(session: Session, asha: Asha, women: dict[int, Beneficiary]) -> dict[str, Any]:
    """The last seven days, for the ASHA's impact panel."""
    ids = list(women)
    start = datetime.combine(today() - timedelta(days=6), datetime.min.time())  # IST day boundaries, approx in UTC
    since = start - timedelta(hours=5, minutes=30)
    week_calls = session.exec(select(Call).where(Call.beneficiary_id.in_(ids), Call.triggered_at >= since)).all()
    week_alerts = session.exec(select(Alert).where(Alert.beneficiary_id.in_(ids), Alert.created_at >= since)).all()
    notes_count = session.exec(
        select(func.count()).select_from(Note).where(Note.asha_id == asha.id, Note.created_at >= since)
    ).one()
    minutes = [
        (a.acknowledged_at - a.created_at).total_seconds() / 60 for a in week_alerts if a.acknowledged_at and a.acknowledged_at >= a.created_at
    ]
    done = [c for c in week_calls if c.status == "completed"]
    days = []
    for i in range(7):
        d = today() - timedelta(days=6 - i)
        lo = datetime.combine(d, datetime.min.time()) - timedelta(hours=5, minutes=30)
        hi = lo + timedelta(days=1)
        days.append(
            {
                "date": d.isoformat(),
                "calls": sum(1 for c in week_calls if lo <= c.triggered_at < hi),
                "danger": sum(1 for a in week_alerts if lo <= a.created_at < hi),
            }
        )
    return {
        "calls": len(week_calls),
        "reached": len({c.beneficiary_id for c in done}),
        "women": len(women),
        "red": sum(1 for a in week_alerts if a.severity == "high"),
        "amber": sum(1 for a in week_alerts if a.severity != "high"),
        "minutes_to_action": round(statistics.median(minutes)) if minutes else None,
        "notes": notes_count,
        "languages": len({c.language for c in done}),
        "own_voice_calls": sum(1 for c in week_calls if c.own_voice),
        "days": days,
    }


def _map(asha: Asha, women: dict[int, Beneficiary], open_alerts: list[Alert]) -> dict[str, Any]:
    level: dict[int, str] = {}
    for a in open_alerts:
        if a.severity == "high" or a.beneficiary_id not in level:
            level[a.beneficiary_id] = "high" if a.severity == "high" else "watch"
    places = []
    for kind, f in (asha.facilities or {}).items():
        if isinstance(f, dict) and f.get("lat") is not None and f.get("lng") is not None:
            places.append({"kind": kind, "name": f.get("name") or kind.upper(), "phone": f.get("phone") or "", "lat": f["lat"], "lng": f["lng"]})
    return {
        "women": [
            {"id": b.id, "name": b.name, "village": b.village, "category": b.category, "lat": b.lat, "lng": b.lng, "risk": level.get(b.id, "normal")}
            for b in women.values()
            if b.lat is not None and b.lng is not None
        ],
        "unplaced": sum(1 for b in women.values() if b.lat is None or b.lng is None),
        "facilities": places,
    }


@app.get("/api/beneficiaries")
def list_beneficiaries(
    q: str = "",
    language: str = "",
    category: str = "",
    asha: Asha = Depends(current_asha),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    query = select(Beneficiary).where(Beneficiary.asha_id == asha.id).order_by(Beneficiary.name)
    if language:
        query = query.where(Beneficiary.language == language)
    if category:
        query = query.where(Beneficiary.category == category)
    rows = session.exec(query).all()
    if q:
        ql = q.lower()
        rows = [b for b in rows if ql in b.name.lower() or ql in b.village.lower() or ql in b.phone]
    return [beneficiary_out(session, b) for b in rows]


@app.post("/api/beneficiaries")
def create_beneficiary(
    body: BeneficiaryIn, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)
) -> dict[str, Any]:
    if not body.name or not body.phone or not body.language or not body.category:
        raise HTTPException(422, "name, phone, language and category are required")
    b = Beneficiary(**body.model_dump(exclude_none=True), asha_id=asha.id)
    session.add(b)
    session.commit()
    session.refresh(b)
    return beneficiary_out(session, b)


@app.get("/api/beneficiaries/{bid}")
def get_beneficiary(bid: int, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, Any]:
    b = _get_beneficiary(session, bid, asha)
    out = beneficiary_out(session, b)
    out["calls"] = [
        call_out(c, b)
        for c in session.exec(select(Call).where(Call.beneficiary_id == bid).order_by(Call.triggered_at.desc())).all()
    ]
    out["visit_notes"] = [
        note_out(n, b.name)
        for n in session.exec(select(Note).where(Note.beneficiary_id == bid).order_by(Note.created_at.desc())).all()
    ]
    out["ask_token"] = b.ask_token
    out["alerts"] = [
        alert_out(a, b)
        for a in session.exec(select(Alert).where(Alert.beneficiary_id == bid).order_by(Alert.created_at.desc())).all()
    ]
    return out


@app.patch("/api/beneficiaries/{bid}")
def update_beneficiary(
    bid: int, body: BeneficiaryIn, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)
) -> dict[str, Any]:
    b = _get_beneficiary(session, bid, asha)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(b, key, value)
    session.add(b)
    session.commit()
    session.refresh(b)
    return beneficiary_out(session, b)


@app.delete("/api/beneficiaries/{bid}")
def delete_beneficiary(bid: int, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, bool]:
    delete_women(session, [_get_beneficiary(session, bid, asha)])
    return {"ok": True}


# ---- calls ------------------------------------------------------------------
@app.post("/api/beneficiaries/{bid}/call")
async def start_call(
    request: Request,
    bid: int,
    phone_line: bool = Query(True),
    asha: Asha = Depends(current_asha),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    _demo_limit(request, asha, "conversation", 25)
    b = _get_beneficiary(session, bid, asha)
    try:
        call, reply = await calls.start_call(session, b, phone_line=phone_line)
    except SpeechError as exc:
        raise HTTPException(502, f"Text-to-speech failed: {exc}") from exc
    return {"call": call_out(call, b), "reply": reply}


@app.post("/api/beneficiaries/{bid}/phone-call")
async def start_phone_call(bid: int, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, Any]:
    """Ring her real phone through Twilio. Her side of the call happens on the phone, not in the browser."""
    b = _get_beneficiary(session, bid, asha)
    if asha.is_demo:
        raise HTTPException(403, "Real phone calls are only available in your own account. Use the browser call in demo accounts.")
    busy = session.exec(
        select(Call).where(Call.beneficiary_id == b.id, Call.channel == "phone", Call.status.in_(["ringing", "in_progress"]))
    ).first()
    if busy and busy.triggered_at > utcnow() - timedelta(minutes=10):  # older ones are stale records
        raise HTTPException(409, "A phone call to her is already in progress.")
    try:
        call = await telephony.place_call(session, b)
    except telephony.PhoneCallError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    return call_out(call, b)


@app.post("/api/calls/{cid}/hangup")
async def hangup_call(cid: int, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, Any]:
    call = _get_call(session, cid, asha)
    if call.channel == "phone" and call.provider_sid and call.status in ("ringing", "in_progress"):
        await telephony.hangup(call.provider_sid)
    return _call_json(session, call)


@app.get("/api/calls")
def list_calls(
    beneficiary_id: Optional[int] = None,
    limit: int = 50,
    asha: Asha = Depends(current_asha),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    women = _names(session, asha)
    query = select(Call).where(Call.beneficiary_id.in_(list(women))).order_by(Call.triggered_at.desc()).limit(min(limit, 200))
    if beneficiary_id:
        query = query.where(Call.beneficiary_id == beneficiary_id)
    return [call_out(c, women[c.beneficiary_id]) for c in session.exec(query).all() if c.beneficiary_id in women]


@app.get("/api/calls/{cid}")
def get_call(cid: int, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, Any]:
    return _call_json(session, _get_call(session, cid, asha))


@app.post("/api/calls/{cid}/turn")
async def call_turn(
    cid: int,
    audio: UploadFile = File(...),
    phone_line: str = Form("false"),
    asha: Asha = Depends(current_asha),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    call = _get_call(session, cid, asha)
    data = await audio.read()
    if not data:
        raise HTTPException(400, "Empty audio")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio too long (max 30 seconds)")
    try:
        return await calls.take_turn(
            session, call, data, audio.filename or "turn.wav", phone_line.lower() in ("1", "true", "yes", "on")
        )
    except calls.CallError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    except SpeechError as exc:
        raise HTTPException(502, f"Text-to-speech failed: {exc}") from exc


@app.post("/api/calls/{cid}/end")
async def call_end(cid: int, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, Any]:
    call = await calls.end_call(session, _get_call(session, cid, asha))
    return _call_json(session, call)


# ---- alerts -----------------------------------------------------------------
@app.get("/api/alerts")
def list_alerts(status: str = "", asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> list[dict[str, Any]]:
    women = _names(session, asha)
    query = select(Alert).where(Alert.beneficiary_id.in_(list(women))).order_by(Alert.created_at.desc())
    if status:
        query = query.where(Alert.status == status)
    return [alert_out(a, women[a.beneficiary_id]) for a in session.exec(query).all() if a.beneficiary_id in women]


@app.post("/api/alerts/{aid}/ack")
def ack_alert(aid: int, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, Any]:
    a = session.get(Alert, aid)
    if a is None:
        raise HTTPException(404, "Alert not found")
    b = _get_beneficiary(session, a.beneficiary_id, asha)
    a.status = "acknowledged"
    a.acknowledged_at = utcnow()
    session.add(a)
    session.commit()
    session.refresh(a)
    briefing.clear_cache(asha.id)
    return alert_out(a, b)


# ---- voice notes ------------------------------------------------------------
@app.post("/api/notes/draft")
async def note_draft(
    request: Request,
    audio: UploadFile = File(...),
    language: str = Form(""),
    asha: Asha = Depends(current_asha),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    _demo_limit(request, asha, "note", 20)
    data = await audio.read()
    if not data:
        raise HTTPException(400, "Empty audio")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio too long (max 30 seconds)")
    try:
        return await notes.draft_note(session, asha, data, audio.filename or "note.wav", language or None)
    except SpeechError as exc:
        raise HTTPException(502, f"Speech recognition failed: {exc}") from exc


@app.post("/api/notes")
def create_note(body: NoteIn, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, Any]:
    if body.beneficiary_id is not None:
        _get_beneficiary(session, body.beneficiary_id, asha)
    n = Note(**body.model_dump(exclude={"beneficiary_name"}), asha_id=asha.id)
    session.add(n)
    session.commit()
    session.refresh(n)
    b = session.get(Beneficiary, n.beneficiary_id) if n.beneficiary_id else None
    return note_out(n, b.name if b else None)


def _get_note(session: Session, nid: int, asha: Asha) -> Note:
    n = session.get(Note, nid)
    if not n or n.asha_id != asha.id:
        raise HTTPException(404, "Note not found")
    return n


@app.get("/api/notes")
def list_notes(
    limit: int = Query(50, ge=1, le=200), asha: Asha = Depends(current_asha), session: Session = Depends(get_session)
) -> list[dict[str, Any]]:
    women = _names(session, asha)
    rows = session.exec(select(Note).where(Note.asha_id == asha.id).order_by(Note.created_at.desc()).limit(limit)).all()
    return [note_out(n, women[n.beneficiary_id].name if n.beneficiary_id in women else None) for n in rows]


@app.patch("/api/notes/{nid}")
def link_note(nid: int, body: NoteLinkIn, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, Any]:
    """Link a note to one of her women (or unlink it with beneficiary_id null)."""
    n = _get_note(session, nid, asha)
    b = _get_beneficiary(session, body.beneficiary_id, asha) if body.beneficiary_id is not None else None
    n.beneficiary_id = b.id if b else None
    session.add(n)
    session.commit()
    session.refresh(n)
    return note_out(n, b.name if b else None)


@app.delete("/api/notes/{nid}")
def delete_note(nid: int, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, bool]:
    session.delete(_get_note(session, nid, asha))
    session.commit()
    return {"ok": True}


# ---- briefing ---------------------------------------------------------------
@app.get("/api/briefing")
async def get_briefing(
    language: str = "", asha: Asha = Depends(current_asha), session: Session = Depends(get_session)
) -> dict[str, Any]:
    language = language or asha.language
    if language not in LANGUAGES:
        raise HTTPException(400, f"Unsupported language {language}")
    text, used = await briefing.briefing_text(session, asha, language)
    return {"text": text, "language": used, "day": today().isoformat()}


@app.get("/api/briefings")
def list_briefings(
    limit: int = Query(30, ge=1, le=100), asha: Asha = Depends(current_asha), session: Session = Depends(get_session)
) -> list[dict[str, Any]]:
    """Her saved briefings, newest day first (one per day and language)."""
    return briefing.history(session, asha, limit)


@app.get("/api/briefings/{brid}/audio")
async def saved_briefing_audio(request: Request, brid: int, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> Response:
    _demo_limit(request, asha, "briefing", 15)
    b = session.get(Briefing, brid)
    if not b or b.asha_id != asha.id:
        raise HTTPException(404, "Briefing not found")
    try:
        audio = await briefing.speak(b.text, b.language)
    except SpeechError as exc:
        raise HTTPException(502, f"Text-to-speech failed: {exc}") from exc
    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "private, max-age=3600"})


@app.get("/api/briefing/audio")
async def get_briefing_audio(
    request: Request, language: str = "", asha: Asha = Depends(current_asha), session: Session = Depends(get_session)
) -> Response:
    _demo_limit(request, asha, "briefing", 15)
    language = language or asha.language
    if language not in LANGUAGES:
        raise HTTPException(400, f"Unsupported language {language}")
    try:
        audio = await briefing.briefing_audio(session, asha, language)
    except SpeechError as exc:
        raise HTTPException(502, f"Text-to-speech failed: {exc}") from exc
    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})



# ---- her own voice (Gnani voice cloning) -------------------------------------
class SettingsIn(BaseModel):
    use_own_voice: Optional[bool] = None
    facilities: Optional[dict[str, Any]] = None


def _norm(text: str) -> str:
    return re.sub(r"[\W_]+", "", text.lower())


def _wav_seconds(data: bytes) -> float | None:
    try:
        with wave.open(io.BytesIO(data)) as w:
            return w.getnframes() / float(w.getframerate())
    except (wave.Error, EOFError):
        return None


@app.get("/api/me/voice/script")
def voice_script(asha: Asha = Depends(current_asha)) -> dict[str, str]:
    lang = asha.language if asha.language in prompts.VOICE_SCRIPTS else "en-IN"
    return {"text": prompts.voice_script(lang, asha.name, asha.area), "language": lang}


@app.post("/api/me/voice")
async def set_voice(
    request: Request,
    audio: UploadFile = File(...),
    consent: str = Form("false"),
    asha: Asha = Depends(current_asha),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """She reads the consent script aloud; the recording becomes her voice for calls."""
    _demo_limit(request, asha, "voice", 3)
    if consent.lower() not in ("1", "true", "yes", "on"):
        raise HTTPException(400, "Please tick the consent box first.")
    data = await audio.read()
    seconds = _wav_seconds(data)
    if seconds is None:
        raise HTTPException(400, "Please record your voice in the app.")
    if seconds < 5:
        raise HTTPException(422, "That was too short. Please read the whole passage (about 15 seconds).")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Recording too long (max 30 seconds)")
    script = voice_script(asha)
    try:
        heard = await speech.transcribe(data, filename="voice.wav", language_code=f"{script['language']},en-IN" if script["language"] != "en-IN" else "en-IN,hi-IN")
    except SpeechError as exc:
        raise HTTPException(502, f"Speech recognition failed: {exc}") from exc
    match = difflib.SequenceMatcher(None, _norm(heard.get("transcript") or ""), _norm(script["text"])).ratio()
    if match < 0.45:
        raise HTTPException(422, "We couldn't match your recording to the passage. Please read it aloud clearly, in a quiet place.")
    try:
        embedding = await speech.voice_embedding(data)
    except SpeechError as exc:
        raise HTTPException(502, f"Voice cloning failed: {exc}") from exc
    asha.voice_embedding = embedding
    asha.voice_consent_at = utcnow()
    asha.use_own_voice = True
    session.add(asha)
    session.commit()
    session.refresh(asha)
    return _me(asha)


@app.delete("/api/me/voice")
def delete_voice(asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, Any]:
    asha.voice_embedding, asha.voice_consent_at = None, None
    session.add(asha)
    session.commit()
    session.refresh(asha)
    return _me(asha)


@app.post("/api/me/voice/preview")
async def voice_preview(request: Request, language: str = Query("hi-IN"), asha: Asha = Depends(current_asha)) -> dict[str, str]:
    _demo_limit(request, asha, "preview", 15)
    if not asha.voice_embedding:
        raise HTTPException(404, "Record your voice first.")
    if language not in LANGUAGES:
        raise HTTPException(400, f"Unsupported language {language}")
    text = prompts.greeting_for(language, "Sunita", own_voice=True)
    try:
        audio, _, _ = await calls.speak(text, language, False, asha.voice_embedding)
    except SpeechError as exc:
        raise HTTPException(502, f"Text-to-speech failed: {exc}") from exc
    return {"text": text, "audio": audio}


@app.patch("/api/me")
def update_settings(body: SettingsIn, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, Any]:
    if body.use_own_voice is not None:
        asha.use_own_voice = body.use_own_voice
    if body.facilities is not None:
        clean: dict[str, Any] = {}
        for kind in ("phc", "hospital", "anm"):
            f = body.facilities.get(kind) or {}
            if not isinstance(f, dict):
                continue
            prev = (asha.facilities or {}).get(kind) or {}
            entry = {"name": str(f.get("name") or "").strip()[:120], "phone": re.sub(r"[^\d+\- ]", "", str(f.get("phone") or ""))[:20]}
            for k in ("lat", "lng"):  # keep map positions set earlier
                v = f.get(k, prev.get(k))
                if isinstance(v, (int, float)):
                    entry[k] = float(v)
            if entry["name"] or entry["phone"]:
                clean[kind] = entry
        asha.facilities = clean
    session.add(asha)
    session.commit()
    session.refresh(asha)
    return _me(asha)


# ---- "Ask MomCheck": her own link -------------------------------------------
ASK_SESSIONS_PER_DAY = 15


@app.post("/api/beneficiaries/{bid}/ask-link")
def ask_link(bid: int, rotate: bool = False, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, str]:
    b = _get_beneficiary(session, bid, asha)
    if rotate or not b.ask_token:
        b.ask_token = secrets.token_urlsafe(9)
        session.add(b)
        session.commit()
    return {"token": b.ask_token, "path": f"/m/{b.ask_token}"}


def _ask_woman(session: Session, token: str) -> Beneficiary:
    b = session.exec(select(Beneficiary).where(Beneficiary.ask_token == token)).first() if len(token) >= 8 else None
    if b is None:
        raise HTTPException(404, "This link doesn't work any more. Please ask your ASHA for a new one.")
    return b


def _ask_call(session: Session, b: Beneficiary, cid: int) -> Call:
    c = session.get(Call, cid)
    if c is None or c.beneficiary_id != b.id or c.channel not in ("ask", "checkin"):
        raise HTTPException(404, "Conversation not found")
    return c


@app.get("/api/ask/{token}")
def ask_info(token: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    """Public: what her page needs. Nothing else about her is exposed."""
    b = _ask_woman(session, token)
    asha = session.get(Asha, b.asha_id) if b.asha_id else None
    return {
        "first_name": b.name.split()[0],
        "language": b.language,
        "category": b.category,
        "asha_name": asha.name if asha else "",
        "asha_voice": bool(asha and asha.voice_embedding and asha.use_own_voice),
        "self_registered": b.source == "self",
        "weeks_pregnant": weeks_pregnant(b),
        "days_since_delivery": days_since_delivery(b),
        "schedule": protocol.checkin_schedule(b.category, b.edd, b.delivery_date, today()),
    }


@app.post("/api/ask/{token}/start")
async def ask_start(request: Request, token: str, mode: str = "ask", session: Session = Depends(get_session)) -> dict[str, Any]:
    """mode=ask: she has a question. mode=checkin: her scheduled check-in (MomCheck goes through the checklist)."""
    usage.limit(request, "conversation", 25)
    b = _ask_woman(session, token)
    recent = session.exec(
        select(func.count()).select_from(Call).where(
            Call.beneficiary_id == b.id, Call.channel.in_(["ask", "checkin"]), Call.triggered_at >= utcnow() - timedelta(days=1)
        )
    ).one()
    if recent >= ASK_SESSIONS_PER_DAY:
        raise HTTPException(429, "You have talked to MomCheck many times today. Please call your ASHA, or 108 in an emergency.")
    try:
        call, reply = await calls.start_call(session, b, phone_line=False, channel="checkin" if mode == "checkin" else "ask")
    except SpeechError as exc:
        raise HTTPException(502, f"Text-to-speech failed: {exc}") from exc
    return {"call_id": call.id, "reply_text": reply["reply_text"], "reply_audio": reply["reply_audio"]}


@app.post("/api/ask/{token}/calls/{cid}/turn")
async def ask_turn(token: str, cid: int, audio: UploadFile = File(...), session: Session = Depends(get_session)) -> dict[str, Any]:
    b = _ask_woman(session, token)
    call = _ask_call(session, b, cid)
    data = await audio.read()
    if not data:
        raise HTTPException(400, "Empty audio")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio too long (max 30 seconds)")
    try:
        t = await calls.take_turn(session, call, data, audio.filename or "turn.wav", False)
    except calls.CallError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    return {k: t[k] for k in ("user_text", "reply_text", "reply_audio", "end_call", "alert_raised")} | {"asha_told": bool(t["danger_signs"])}


@app.post("/api/ask/{token}/calls/{cid}/end")
async def ask_end(token: str, cid: int, session: Session = Depends(get_session)) -> dict[str, Any]:
    b = _ask_woman(session, token)
    call = await calls.end_call(session, _ask_call(session, b, cid))
    return {"status": call.status, "asha_told": bool(call.danger_signs)}



@app.get("/api/ask/{token}/calendar.ics")
def ask_calendar(token: str, request: Request, session: Session = Depends(get_session)) -> Response:
    """Her check-ins as phone-calendar reminders: on the day, her phone reminds her and the link opens MomCheck."""
    b = _ask_woman(session, token)
    base = get_settings().public_base_url or str(request.base_url).rstrip("/")  # Render sets the public https URL
    link = f"{base}/m/{token}"
    stamp = utcnow().strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MomCheck//Check-ins//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"]
    for i, c in enumerate(protocol.checkin_schedule(b.category, b.edd, b.delivery_date, today(), count=12)):
        d = date.fromisoformat(c["date"]).strftime("%Y%m%d")
        lines += [
            "BEGIN:VEVENT",
            f"UID:momcheck-{token}-{i}@momcheck",
            f"DTSTAMP:{stamp}",
            f"DTSTART;TZID=Asia/Kolkata:{d}T100000",
            f"DTEND;TZID=Asia/Kolkata:{d}T101500",
            f"SUMMARY:MomCheck check-in ({c['label']})",
            f"DESCRIPTION:Tap to talk to MomCheck: {link}",
            f"URL:{link}",
            "BEGIN:VALARM",
            "TRIGGER:PT0M",
            "ACTION:DISPLAY",
            "DESCRIPTION:MomCheck check-in",
            "END:VALARM",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return Response(
        content="\r\n".join(lines) + "\r\n",
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="momcheck-checkins.ics"'},
    )


# ---- mothers join on their own ------------------------------------------------
class JoinIn(BaseModel):
    name: str
    language: str
    category: str
    weeks: Optional[int] = None  # pregnant: weeks now
    days_since_birth: Optional[int] = None  # new mother
    village: str = ""


SELF_KEEP_DAYS = 3  # self-registered demo mothers are removed after this


@app.post("/api/join")
def join(request: Request, body: JoinIn, session: Session = Depends(get_session)) -> dict[str, str]:
    """A mother registers herself (no phone number) and gets her own MomCheck link and check-in schedule.

    In the public demo she joins a demo ASHA's list: Hindi speakers Meena's (Barabanki), others Savita's (Pune).
    """
    usage.limit(request, "join", 3)
    name = re.sub(r"[^\w\s.'-]", "", body.name, flags=re.UNICODE).strip()[:30]
    if len(name) < 2:
        raise HTTPException(422, "Please enter your first name.")
    if body.language not in LANGUAGES:
        raise HTTPException(422, "Please choose your language.")
    if body.category not in ("pregnant", "postnatal"):
        raise HTTPException(422, "Please choose pregnant or new mother.")
    t = today()
    b = Beneficiary(name=name, phone="", language=body.language, village=body.village.strip()[:60] or "Joined online", category=body.category, source="self")
    if body.category == "pregnant":
        if body.weeks is None or not 4 <= body.weeks <= 42:
            raise HTTPException(422, "Please enter how many weeks pregnant you are (4 to 42).")
        b.edd = t + timedelta(weeks=40 - body.weeks)
    else:
        if body.days_since_birth is None or not 0 <= body.days_since_birth <= 42:
            raise HTTPException(422, "Please enter how many days ago your baby was born (0 to 42).")
        b.delivery_date = t - timedelta(days=body.days_since_birth)
    phone = "9000000100" if body.language == "hi-IN" else "9000000200"
    asha = session.exec(select(Asha).where(Asha.phone == phone, Asha.is_demo == True)).first()  # noqa: E712
    b.asha_id = asha.id if asha else None
    b.ask_token = secrets.token_urlsafe(9)
    # Keep the demo tidy: drop self-registered mothers after a few days
    old = session.exec(
        select(Beneficiary).where(Beneficiary.source == "self", Beneficiary.created_at < utcnow() - timedelta(days=SELF_KEEP_DAYS))
    ).all()
    if old:
        delete_women(session, old)
    session.add(b)
    session.commit()
    return {"token": b.ask_token, "path": f"/m/{b.ask_token}"}


# ---- interpreter: the ASHA and the woman each speak their own language -----------
@app.post("/api/beneficiaries/{bid}/interpreter")
def start_interpreter(request: Request, bid: int, asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, Any]:
    _demo_limit(request, asha, "conversation", 25)
    b = _get_beneficiary(session, bid, asha)
    return call_out(calls.start_interpreter(session, b), b)


@app.post("/api/calls/{cid}/interpret")
async def interpret(
    cid: int,
    audio: UploadFile = File(...),
    speaker: str = Form(...),
    asha: Asha = Depends(current_asha),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    if speaker not in ("asha", "mother"):
        raise HTTPException(400, "speaker must be 'asha' or 'mother'")
    call = _get_call(session, cid, asha)
    data = await audio.read()
    if not data:
        raise HTTPException(400, "Empty audio")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio too long (max 30 seconds)")
    try:
        return await calls.interpret_turn(session, call, data, audio.filename or "turn.wav", speaker)
    except calls.CallError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


# ---- usage (the owner's view of the credits being spent) ----------------------------
@app.get("/api/usage")
def get_usage(asha: Asha = Depends(current_asha)) -> dict[str, Any]:
    if asha.is_demo:
        raise HTTPException(403, "Usage is shown in your own account only.")
    return usage.report()


@app.exception_handler(usage.BudgetExceeded)
async def _budget_exceeded(_, exc: usage.BudgetExceeded):
    return JSONResponse(status_code=429, content={"detail": str(exc)})


# ---- demo -------------------------------------------------------------------
@app.post("/api/demo/seed")
def demo_seed(asha: Asha = Depends(current_asha), session: Session = Depends(get_session)) -> dict[str, int]:
    """Adds sample women to an account that has none."""
    return {"created": seed_sample(session, asha)}


@app.exception_handler(LLMError)
async def _llm_error(_, exc: LLMError):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=502, content={"detail": f"AI service error: {exc}"})


app.include_router(telephony.router)  # Twilio status callback + media-stream WebSocket


# ---------------------------------------------------------------------------
# Frontend (built React app)
# ---------------------------------------------------------------------------
DIST = ROOT_DIR / "frontend" / "dist"
if DIST.exists():
    if (DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        file = DIST / path
        if path and file.is_file():
            return FileResponse(file)
        return FileResponse(DIST / "index.html")
