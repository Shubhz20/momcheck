"""MomCheck API (FastAPI). Serves the built React app from frontend/dist as well."""
from __future__ import annotations

import logging
import os
from datetime import date, timedelta
from typing import Any, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator
from sqlmodel import Session, func, select

from . import auth, telephony
from .auth import current_asha
from .config import ROOT_DIR, get_settings
from .db import get_session, init_db
from .gnani.speech import SpeechError
from .languages import LANGUAGES
from .llm import LLMError
from .models import Alert, Asha, Beneficiary, Call, Note, utcnow
from .seed import delete_women, reset_demo, seed_sample
from .services import briefing, calls, notes
from .services.briefing import _start_of_today_utc
from .services.serialize import alert_out, beneficiary_out, call_out, note_out, today

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
    return s.phone_calls_configured and s.public_base_url.startswith("https://")


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
    }


def _languages() -> list[dict[str, Any]]:
    return [{"code": code, **meta, "enabled": True} for code, meta in LANGUAGES.items()]


def _call_json(session: Session, c: Call) -> dict[str, Any]:  # caller has already checked ownership
    b = session.get(Beneficiary, c.beneficiary_id)
    return call_out(c, b.name if b else "")


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
        "recent_calls": [call_out(c, women[c.beneficiary_id].name) for c in recent if c.beneficiary_id in women],
        "languages": _languages(),
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
        call_out(c, b.name)
        for c in session.exec(select(Call).where(Call.beneficiary_id == bid).order_by(Call.triggered_at.desc())).all()
    ]
    out["notes"] = [
        note_out(n, b.name)
        for n in session.exec(select(Note).where(Note.beneficiary_id == bid).order_by(Note.created_at.desc())).all()
    ]
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
    bid: int,
    phone_line: bool = Query(True),
    asha: Asha = Depends(current_asha),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    b = _get_beneficiary(session, bid, asha)
    try:
        call, reply = await calls.start_call(session, b, phone_line=phone_line)
    except SpeechError as exc:
        raise HTTPException(502, f"Text-to-speech failed: {exc}") from exc
    return {"call": call_out(call, b.name), "reply": reply}


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
    return call_out(call, b.name)


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
    return [call_out(c, women[c.beneficiary_id].name) for c in session.exec(query).all() if c.beneficiary_id in women]


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
    session.add(a)
    session.commit()
    session.refresh(a)
    briefing.clear_cache(asha.id)
    return alert_out(a, b)


# ---- voice notes ------------------------------------------------------------
@app.post("/api/notes/draft")
async def note_draft(
    audio: UploadFile = File(...),
    language: str = Form(""),
    asha: Asha = Depends(current_asha),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
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


# ---- briefing ---------------------------------------------------------------
@app.get("/api/briefing")
async def get_briefing(
    language: str = "", asha: Asha = Depends(current_asha), session: Session = Depends(get_session)
) -> dict[str, Any]:
    language = language or asha.language
    if language not in LANGUAGES:
        raise HTTPException(400, f"Unsupported language {language}")
    text, used = await briefing.briefing_text(session, asha, language)
    return {"text": text, "language": used}


@app.get("/api/briefing/audio")
async def get_briefing_audio(
    language: str = "", asha: Asha = Depends(current_asha), session: Session = Depends(get_session)
) -> Response:
    language = language or asha.language
    if language not in LANGUAGES:
        raise HTTPException(400, f"Unsupported language {language}")
    try:
        audio = await briefing.briefing_audio(session, asha, language)
    except SpeechError as exc:
        raise HTTPException(502, f"Text-to-speech failed: {exc}") from exc
    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})


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
