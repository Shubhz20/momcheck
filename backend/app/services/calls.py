"""Follow-up voice calls run by our own agent loop.

Each turn: her audio -> Gnani Prisma STT -> Gemini (decides what to say) -> Gnani Timbre TTS -> reply audio.
Danger signs raise an alert for the ASHA immediately, during the call. When the call ends, the
whole transcript is reviewed again to set the outcome and an English summary.
"""
from __future__ import annotations

import base64
import json
import logging
import time
from typing import Any

from sqlmodel import Session, select

from .. import llm, prompts
from ..config import get_settings
from ..gnani import speech
from ..languages import language_name
from ..models import Alert, Beneficiary, Call, utcnow
from .serialize import days_since_delivery, today, weeks_pregnant

log = logging.getLogger("calls")

OUTCOMES = ("DANGER_SIGN", "ROUTINE", "CALLBACK", "NOT_REACHABLE")
HIGH_SEVERITY_WORDS = ("bleeding", "fits", "convulsion", "breathing", "not moving", "sleepy")


class CallError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _next_visit_line(b: Beneficiary) -> str:
    if not b.next_visit_date:
        return "not scheduled yet"
    return f"{b.next_visit_type or 'Check-up'} on {b.next_visit_date.strftime('%d %B %Y')}"


def _signs_for(b: Beneficiary) -> list[str]:
    return prompts.POSTNATAL_DANGER_SIGNS if b.category == "postnatal" else prompts.PREGNANCY_DANGER_SIGNS


def _system_prompt(b: Beneficiary) -> str:
    return prompts.render_system_prompt(
        name=b.name,
        village=b.village,
        asha_name=get_settings().asha_name,
        category=b.category,
        weeks_pregnant=weeks_pregnant(b),
        days_since_delivery=days_since_delivery(b),
        next_visit_line=_next_visit_line(b),
        today=today().strftime("%d %B %Y"),
        language_name=language_name(b.language),
    )


def _stt_languages(lang: str) -> str:
    # Prisma v3.0 accepts up to 4 languages; adding English (and Hindi) covers code-mixed speech.
    langs = [lang, "en-IN"] if lang != "en-IN" else ["en-IN", "hi-IN"]
    if "hi-IN" not in langs:
        langs.append("hi-IN")
    return ",".join(langs)


async def _speak(text: str, language: str, phone_line: bool) -> tuple[str, int]:
    started = time.perf_counter()
    audio = await speech.synthesize(
        text, language, sample_rate=8000 if phone_line else 24000, container="mp3"
    )
    ms = int((time.perf_counter() - started) * 1000)
    return "data:audio/mpeg;base64," + base64.b64encode(audio).decode(), ms


def _severity(signs: list[str]) -> str:
    joined = " ".join(signs).lower()
    return "high" if any(w in joined for w in HIGH_SEVERITY_WORDS) else "medium"


def _upsert_alert(session: Session, call: Call, signs: list[str]) -> bool:
    """Create or update the alert for this call. Returns True if a new alert was created."""
    alert = session.exec(select(Alert).where(Alert.call_id == call.id)).first()
    if alert is None:
        session.add(
            Alert(
                beneficiary_id=call.beneficiary_id,
                call_id=call.id,
                severity=_severity(signs),
                reason="Reported on follow-up call: " + ", ".join(signs),
                danger_signs=signs,
            )
        )
        return True
    merged = list(dict.fromkeys([*(alert.danger_signs or []), *signs]))
    if merged != alert.danger_signs:
        alert.danger_signs = merged
        alert.reason = "Reported on follow-up call: " + ", ".join(merged)
        alert.severity = _severity(merged)
        session.add(alert)
    return False


def _clean_signs(raw: Any, allowed: list[str]) -> list[str]:
    if not isinstance(raw, list):
        return []
    lookup = {s.lower(): s for s in allowed}
    out = []
    for item in raw:
        label = lookup.get(str(item).strip().lower(), str(item).strip())
        if label and label not in out:
            out.append(label)
    return out


# ---------------------------------------------------------------------------
async def start_call(session: Session, b: Beneficiary, phone_line: bool = True) -> tuple[Call, dict[str, Any]]:
    greeting = prompts.greeting_for(b.language, b.name)
    call = Call(
        beneficiary_id=b.id,
        language=b.language,
        phone_line=phone_line,
        transcript=[{"role": "assistant", "content": greeting, "language": b.language}],
    )
    session.add(call)
    session.commit()
    session.refresh(call)
    audio, tts_ms = await _speak(greeting, b.language, phone_line)
    reply = {
        "user_text": None,
        "detected_language": None,
        "reply_text": greeting,
        "reply_audio": audio,
        "end_call": False,
        "alert_raised": False,
        "timings": {"stt_ms": None, "llm_ms": 0, "tts_ms": tts_ms},
    }
    return call, reply


async def take_turn(session: Session, call: Call, audio: bytes, filename: str, phone_line: bool) -> dict[str, Any]:
    if call.status != "in_progress":
        raise CallError("This call has already ended.", 409)
    b = session.get(Beneficiary, call.beneficiary_id)
    call.phone_line = call.phone_line or phone_line

    # 1. Speech to text (Gnani Prisma)
    started = time.perf_counter()
    try:
        stt = await speech.transcribe(
            audio,
            filename=filename or "turn.wav",
            language_code=_stt_languages(b.language),
            keyterms=[b.name, *(b.village.split(",")[:1]), "ASHA", "PHC", "108"],
            topic="A pregnant woman or new mother talking to a maternal-health follow-up assistant.",
        )
    except speech.SpeechError as exc:
        raise CallError(f"Speech recognition failed: {exc}", 502) from exc
    stt_ms = int((time.perf_counter() - started) * 1000)
    user_text = (stt.get("transcript") or "").strip()
    detected = stt.get("detected_language_code")

    # 2. Decide what to say (Gemini), with the full conversation so far
    history: list[tuple[str, str]] = [("user", "(The call has connected.)")]
    for t in call.transcript:
        if t["role"] == "assistant":
            history.append(("model", json.dumps({"reply": t["content"], "end_call": False, "danger_signs": []}, ensure_ascii=False)))
        else:
            history.append(("user", t["content"]))
    history.append(("user", user_text or "(inaudible)"))
    user_turns = sum(1 for t in call.transcript if t["role"] == "user") + 1
    if user_turns >= get_settings().max_turns:
        history.append(("user", "(System: the call is running long. Thank her and say goodbye now; set end_call to true.)"))

    started = time.perf_counter()
    try:
        result = await llm.chat_json(_system_prompt(b), history)
    except llm.LLMError as exc:
        raise CallError(f"The assistant could not respond: {exc}", 502) from exc
    llm_ms = int((time.perf_counter() - started) * 1000)
    reply_text = str(result.get("reply") or "").strip() or prompts.end_message_for(b.language)
    end_call = bool(result.get("end_call"))
    signs = _clean_signs(result.get("danger_signs"), _signs_for(b))

    # 3. Save the turn and raise an alert straight away if a danger sign was reported
    transcript = list(call.transcript)
    if user_text:
        transcript.append({"role": "user", "content": user_text, "language": detected})
    transcript.append({"role": "assistant", "content": reply_text, "language": b.language})
    call.transcript = transcript
    alert_raised = False
    if signs:
        call.danger_signs = list(dict.fromkeys([*(call.danger_signs or []), *signs]))
        alert_raised = _upsert_alert(session, call, signs)
    session.add(call)
    session.commit()

    # 4. Text to speech (Gnani Timbre)
    audio_url, tts_ms = await _speak(reply_text, b.language, call.phone_line)
    return {
        "user_text": user_text or None,
        "detected_language": detected,
        "reply_text": reply_text,
        "reply_audio": audio_url,
        "end_call": end_call,
        "alert_raised": alert_raised,
        "timings": {"stt_ms": stt_ms, "llm_ms": llm_ms, "tts_ms": tts_ms},
    }


async def end_call(session: Session, call: Call) -> Call:
    if call.status != "in_progress":
        return call
    b = session.get(Beneficiary, call.beneficiary_id)
    call.completed_at = utcnow()
    call.duration_sec = int((call.completed_at - call.triggered_at).total_seconds())
    user_turns = [t for t in call.transcript if t["role"] == "user"]
    if not user_turns:
        call.status = "abandoned"
        call.outcome = "NOT_REACHABLE"
        call.summary = "The call ended before she spoke."
        session.add(call)
        session.commit()
        session.refresh(call)
        return call

    call.status = "completed"
    signs = _signs_for(b)
    status_line = (
        f"new mother, {days_since_delivery(b)} days after delivery"
        if b.category == "postnatal"
        else f"pregnant, about {weeks_pregnant(b)} weeks"
    )
    text = "\n".join(f"{'Assistant' if t['role'] == 'assistant' else 'Woman'}: {t['content']}" for t in call.transcript)
    try:
        result = await llm.complete_json(
            prompts.CALL_ANALYSIS_PROMPT.format(
                name=b.name, status_line=status_line, danger_signs="\n".join(f"- {s}" for s in signs), transcript=text
            )
        )
        found = _clean_signs(result.get("danger_signs"), signs)
        all_signs = list(dict.fromkeys([*(call.danger_signs or []), *found]))
        outcome = str(result.get("outcome", "ROUTINE")).upper()
        call.outcome = "DANGER_SIGN" if all_signs else (outcome if outcome in OUTCOMES else "ROUTINE")
        call.danger_signs = all_signs
        call.summary = result.get("summary")
        call.extraction = result
        if all_signs:
            _upsert_alert(session, call, all_signs)
    except llm.LLMError as exc:
        log.error("Analysis failed for call %s: %s", call.id, exc)
        call.error = f"Automatic review failed: {exc}"
        call.outcome = "DANGER_SIGN" if call.danger_signs else None
        if not call.danger_signs:
            session.add(
                Alert(
                    beneficiary_id=b.id,
                    call_id=call.id,
                    severity="medium",
                    reason="Automatic review of the call failed. Please read the transcript.",
                )
            )
    session.add(call)
    session.commit()
    session.refresh(call)
    return call
