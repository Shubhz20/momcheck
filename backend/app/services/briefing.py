"""Spoken daily briefing for the ASHA worker: Gemini writes it, Gnani Timbre speaks it."""
from __future__ import annotations

import io
import json
import logging
import re
import time
import wave
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from .. import llm, prompts
from ..gnani import speech
from ..languages import language_name
from ..models import Alert, Asha, Beneficiary, Briefing, Call, utcnow
from .serialize import IST, iso, today

log = logging.getLogger("briefing")

_cache: dict[tuple[int, str], tuple[float, str]] = {}
_CACHE_SECONDS = 180


def _start_of_today_utc() -> datetime:
    start_ist = datetime.combine(today(), datetime.min.time(), tzinfo=IST)
    return start_ist.astimezone(timezone.utc).replace(tzinfo=None)


def briefing_data(session: Session, asha: Asha) -> dict:
    women = {b.id: b for b in session.exec(select(Beneficiary).where(Beneficiary.asha_id == asha.id)).all()}
    ids = list(women)
    since = _start_of_today_utc()
    calls = session.exec(select(Call).where(Call.triggered_at >= since, Call.beneficiary_id.in_(ids))).all()
    alerts = session.exec(
        select(Alert).where(Alert.status == "open", Alert.beneficiary_id.in_(ids)).order_by(Alert.created_at.desc())
    ).all()
    horizon = today() + timedelta(days=3)
    due = sorted(
        (b for b in women.values() if b.next_visit_date and b.next_visit_date <= horizon),
        key=lambda b: b.next_visit_date,
    )
    return {
        "date": today().isoformat(),
        "calls_today": len(calls),
        "answered_today": sum(1 for c in calls if c.status == "completed"),
        "open_alerts": [
            {
                "name": women[a.beneficiary_id].name,
                "village": women[a.beneficiary_id].village,
                "signs": a.danger_signs or [a.reason],
                "severity": a.severity,
            }
            for a in alerts
            if a.beneficiary_id in women
        ],
        "visits_due": [
            {"name": b.name, "date": b.next_visit_date.isoformat(), "visit": b.next_visit_type} for b in due
        ],
    }


def _fallback_text(data: dict) -> str:
    parts = [f"Good morning. Today {data['calls_today']} follow-up calls were made and {data['answered_today']} were answered."]
    if data["open_alerts"]:
        names = ", ".join(f"{a['name']} from {a['village']}" for a in data["open_alerts"])
        parts.append(f"Please call these women today, they reported danger signs: {names}.")
    else:
        parts.append("There are no danger alerts right now.")
    if data["visits_due"]:
        parts.append("Visits due soon: " + ", ".join(v["name"] for v in data["visits_due"]) + ".")
    parts.append("Thank you for your work.")
    return " ".join(parts)


def clear_cache(asha_id: int) -> None:
    for key in [k for k in _cache if k[0] == asha_id]:
        _cache.pop(key, None)


async def briefing_text(session: Session, asha: Asha, language: str) -> tuple[str, str]:
    """Returns (text, language actually used)."""
    cached = _cache.get((asha.id, language))
    if cached and time.time() - cached[0] < _CACHE_SECONDS:
        return cached[1], language
    data = briefing_data(session, asha)
    try:
        result = await llm.complete_json(
            prompts.BRIEFING_PROMPT.format(
                asha_name=asha.name,
                language_name=language_name(language),
                data=json.dumps(data, ensure_ascii=False),
            ),
            temperature=0.5,
        )
        text = str(result.get("text") or "").strip()
        if not text:
            raise llm.LLMError("empty briefing")
    except llm.LLMError as exc:
        log.warning("Briefing LLM failed, using English template: %s", exc)
        text, language = _fallback_text(data), "en-IN"
    _cache[(asha.id, language)] = (time.time(), text)
    _save(session, asha, language, text)
    return text, language


def _save(session: Session, asha: Asha, language: str, text: str) -> None:
    """Keep today's briefing. A newer one on the same day (same language) replaces it."""
    row = session.exec(
        select(Briefing).where(Briefing.asha_id == asha.id, Briefing.day == today(), Briefing.language == language)
    ).first()
    if row:
        row.text, row.updated_at = text, utcnow()
    else:
        row = Briefing(asha_id=asha.id, day=today(), language=language, text=text)
    session.add(row)
    session.commit()


def briefing_out(b: Briefing) -> dict:
    return {"id": b.id, "day": b.day.isoformat(), "language": b.language, "text": b.text, "updated_at": iso(b.updated_at)}


def history(session: Session, asha: Asha, limit: int = 30) -> list[dict]:
    rows = session.exec(
        select(Briefing).where(Briefing.asha_id == asha.id).order_by(Briefing.day.desc(), Briefing.updated_at.desc()).limit(limit)
    ).all()
    return [briefing_out(b) for b in rows]


def _chunks(text: str, limit: int = 280) -> list[str]:
    sentences = re.split(r"(?<=[.!?।|])\s+", text)
    out: list[str] = []
    current = ""
    for s in sentences:
        if len(current) + len(s) + 1 > limit and current:
            out.append(current.strip())
            current = s
        else:
            current = f"{current} {s}"
    if current.strip():
        out.append(current.strip())
    return out


def _concat_wavs(parts: list[bytes]) -> bytes:
    """Join WAV clips. Gnani TTS WAVs carry a streaming header (nframes = 2**31 - 1), so the frame
    count is never copied: readframes reads to the end of each clip and the writer fills in the real size."""
    buf = io.BytesIO()
    params = None
    frames: list[bytes] = []
    for p in parts:
        with wave.open(io.BytesIO(p)) as w:
            params = params or w.getparams()
            frames.append(w.readframes(w.getnframes()))
    with wave.open(buf, "wb") as out:
        out.setparams(params._replace(nframes=0))
        for f in frames:
            out.writeframes(f)
    return buf.getvalue()


async def speak(text: str, language: str) -> bytes:
    parts = [await speech.synthesize(chunk, language) for chunk in _chunks(text)]
    return parts[0] if len(parts) == 1 else _concat_wavs(parts)


async def briefing_audio(session: Session, asha: Asha, language: str) -> bytes:
    text, used_language = await briefing_text(session, asha, language)
    return await speak(text, used_language)
