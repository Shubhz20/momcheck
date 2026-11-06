"""MomCheck API (FastAPI). Serves the built React app from frontend/dist as well."""
from __future__ import annotations

import logging
import os
from datetime import date, timedelta
from typing import Any, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator
from sqlmodel import Session, func, select

from .config import ROOT_DIR
from .db import get_session, init_db
from .gnani.speech import SpeechError
from .languages import LANGUAGES
from .llm import LLMError
from .models import Alert, Beneficiary, Call, Note
from .seed import seed_demo
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
        if v is None:
            return v
        digits = "".join(ch for ch in v if ch.isdigit())[-10:]
        if len(digits) != 10:
            raise ValueError("Phone number must have 10 digits")
        return digits

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
def _get_beneficiary(session: Session, bid: int) -> Beneficiary:
    b = session.get(Beneficiary, bid)
    if b is None:
        raise HTTPException(404, "Beneficiary not found")
    return b


def _get_call(session: Session, cid: int) -> Call:
    c = session.get(Call, cid)
    if c is None:
        raise HTTPException(404, "Call not found")
    return c


def _names(session: Session) -> dict[int, Beneficiary]:
    return {b.id: b for b in session.exec(select(Beneficiary)).all()}


def _languages() -> list[dict[str, Any]]:
    return [{"code": code, **meta, "enabled": True} for code, meta in LANGUAGES.items()]


def _call_json(session: Session, c: Call) -> dict[str, Any]:
    b = session.get(Beneficiary, c.beneficiary_id)
    return call_out(c, b.name if b else "")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health() -> dict[str, Any]:
    # Render sets RENDER_GIT_COMMIT, so this shows which commit is live.
    return {"ok": True, "commit": os.getenv("RENDER_GIT_COMMIT", "local")[:7]}


@app.get("/api/languages")
def languages() -> list[dict[str, Any]]:
    return _languages()


@app.get("/api/dashboard")
def dashboard(session: Session = Depends(get_session)) -> dict[str, Any]:
    women = _names(session)
    since = _start_of_today_utc()
    todays = session.exec(select(Call).where(Call.triggered_at >= since)).all()
    open_alerts = session.exec(select(Alert).where(Alert.status == "open").order_by(Alert.created_at.desc())).all()
    horizon = today() + timedelta(days=7)
    due = [b for b in women.values() if b.next_visit_date and b.next_visit_date <= horizon]
    due.sort(key=lambda b: b.next_visit_date)
    recent = session.exec(select(Call).order_by(Call.triggered_at.desc()).limit(10)).all()
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
    q: str = "", language: str = "", category: str = "", session: Session = Depends(get_session)
) -> list[dict[str, Any]]:
    query = select(Beneficiary).order_by(Beneficiary.name)
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
def create_beneficiary(body: BeneficiaryIn, session: Session = Depends(get_session)) -> dict[str, Any]:
    if not body.name or not body.phone or not body.language or not body.category:
        raise HTTPException(422, "name, phone, language and category are required")
    b = Beneficiary(**body.model_dump(exclude_none=True))
    session.add(b)
    session.commit()
    session.refresh(b)
    return beneficiary_out(session, b)


@app.get("/api/beneficiaries/{bid}")
def get_beneficiary(bid: int, session: Session = Depends(get_session)) -> dict[str, Any]:
    b = _get_beneficiary(session, bid)
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
def update_beneficiary(bid: int, body: BeneficiaryIn, session: Session = Depends(get_session)) -> dict[str, Any]:
    b = _get_beneficiary(session, bid)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(b, key, value)
    session.add(b)
    session.commit()
    session.refresh(b)
    return beneficiary_out(session, b)


@app.delete("/api/beneficiaries/{bid}")
def delete_beneficiary(bid: int, session: Session = Depends(get_session)) -> dict[str, bool]:
    b = _get_beneficiary(session, bid)
    for model in (Alert, Note):
        for row in session.exec(select(model).where(model.beneficiary_id == bid)).all():
            session.delete(row)
    for row in session.exec(select(Call).where(Call.beneficiary_id == bid)).all():
        session.delete(row)
    session.delete(b)
    session.commit()
    return {"ok": True}


# ---- calls ------------------------------------------------------------------
@app.post("/api/beneficiaries/{bid}/call")
async def start_call(
    bid: int, phone_line: bool = Query(True), session: Session = Depends(get_session)
) -> dict[str, Any]:
    b = _get_beneficiary(session, bid)
    try:
        call, reply = await calls.start_call(session, b, phone_line=phone_line)
    except SpeechError as exc:
        raise HTTPException(502, f"Text-to-speech failed: {exc}") from exc
    return {"call": call_out(call, b.name), "reply": reply}


@app.get("/api/calls")
def list_calls(
    beneficiary_id: Optional[int] = None, limit: int = 50, session: Session = Depends(get_session)
) -> list[dict[str, Any]]:
    query = select(Call).order_by(Call.triggered_at.desc()).limit(min(limit, 200))
    if beneficiary_id:
        query = query.where(Call.beneficiary_id == beneficiary_id)
    women = _names(session)
    return [call_out(c, women[c.beneficiary_id].name) for c in session.exec(query).all() if c.beneficiary_id in women]


@app.get("/api/calls/{cid}")
def get_call(cid: int, session: Session = Depends(get_session)) -> dict[str, Any]:
    return _call_json(session, _get_call(session, cid))


@app.post("/api/calls/{cid}/turn")
async def call_turn(
    cid: int,
    audio: UploadFile = File(...),
    phone_line: str = Form("false"),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    call = _get_call(session, cid)
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
async def call_end(cid: int, session: Session = Depends(get_session)) -> dict[str, Any]:
    call = await calls.end_call(session, _get_call(session, cid))
    return _call_json(session, call)


# ---- alerts -----------------------------------------------------------------
@app.get("/api/alerts")
def list_alerts(status: str = "", session: Session = Depends(get_session)) -> list[dict[str, Any]]:
    query = select(Alert).order_by(Alert.created_at.desc())
    if status:
        query = query.where(Alert.status == status)
    women = _names(session)
    return [alert_out(a, women[a.beneficiary_id]) for a in session.exec(query).all() if a.beneficiary_id in women]


@app.post("/api/alerts/{aid}/ack")
def ack_alert(aid: int, session: Session = Depends(get_session)) -> dict[str, Any]:
    a = session.get(Alert, aid)
    if a is None:
        raise HTTPException(404, "Alert not found")
    a.status = "acknowledged"
    session.add(a)
    session.commit()
    session.refresh(a)
    return alert_out(a, _get_beneficiary(session, a.beneficiary_id))


# ---- voice notes ------------------------------------------------------------
@app.post("/api/notes/draft")
async def note_draft(
    audio: UploadFile = File(...), language: str = Form(""), session: Session = Depends(get_session)
) -> dict[str, Any]:
    data = await audio.read()
    if not data:
        raise HTTPException(400, "Empty audio")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio too long (max 30 seconds)")
    try:
        return await notes.draft_note(session, data, audio.filename or "note.wav", language or None)
    except SpeechError as exc:
        raise HTTPException(502, f"Speech recognition failed: {exc}") from exc


@app.post("/api/notes")
def create_note(body: NoteIn, session: Session = Depends(get_session)) -> dict[str, Any]:
    if body.beneficiary_id is not None:
        _get_beneficiary(session, body.beneficiary_id)
    n = Note(**body.model_dump(exclude={"beneficiary_name"}))
    session.add(n)
    session.commit()
    session.refresh(n)
    b = session.get(Beneficiary, n.beneficiary_id) if n.beneficiary_id else None
    return note_out(n, b.name if b else None)


# ---- briefing ---------------------------------------------------------------
@app.get("/api/briefing")
async def get_briefing(language: str = "hi-IN", session: Session = Depends(get_session)) -> dict[str, Any]:
    if language not in LANGUAGES:
        raise HTTPException(400, f"Unsupported language {language}")
    text, used = await briefing.briefing_text(session, language)
    return {"text": text, "language": used}


@app.get("/api/briefing/audio")
async def get_briefing_audio(language: str = "hi-IN", session: Session = Depends(get_session)) -> Response:
    if language not in LANGUAGES:
        raise HTTPException(400, f"Unsupported language {language}")
    try:
        audio = await briefing.briefing_audio(session, language)
    except SpeechError as exc:
        raise HTTPException(502, f"Text-to-speech failed: {exc}") from exc
    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})


# ---- demo -------------------------------------------------------------------
@app.post("/api/demo/seed")
def demo_seed(session: Session = Depends(get_session)) -> dict[str, int]:
    return {"created": seed_demo(session)}


@app.exception_handler(LLMError)
async def _llm_error(_, exc: LLMError):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=502, content={"detail": f"AI service error: {exc}"})


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
