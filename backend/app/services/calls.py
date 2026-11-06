"""Voice conversations run by our own agent loop.

Each turn: her audio -> Gnani Prisma STT -> Gemini (decides what to say, ticks the safety checklist)
-> Gnani Timbre TTS, or Gnani voice cloning in her ASHA's own voice -> reply audio.

Three kinds of conversation share this loop:
- follow-up calls (browser or phone): MomCheck checks on her;
- "ask" conversations: she opened her own Ask MomCheck link with a question;
- interpreter sessions: the ASHA and the woman speak different languages and MomCheck translates.

Danger signs raise an alert for the ASHA immediately, during the conversation. When it ends, the whole
transcript is reviewed again to set the outcome and an English summary.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import time
from collections import OrderedDict
from typing import Any

from sqlmodel import Session, select

from .. import llm, prompts, protocol
from ..config import get_settings
from ..gnani import speech
from ..languages import language_name
from ..models import Alert, Asha, Beneficiary, Call, utcnow
from .serialize import days_since_delivery, today, weeks_pregnant

log = logging.getLogger("calls")

OUTCOMES = ("DANGER_SIGN", "ROUTINE", "CALLBACK", "NOT_REACHABLE")


class CallError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


# ---------------------------------------------------------------- context
def _next_visit_line(b: Beneficiary) -> str:
    if not b.next_visit_date:
        return "not scheduled yet"
    return f"{b.next_visit_type or 'Check-up'} on {b.next_visit_date.strftime('%d %B %Y')}"


def _asha(session: Session, b: Beneficiary) -> Asha | None:
    return session.get(Asha, b.asha_id) if b.asha_id else None


def asha_name_for(session: Session, b: Beneficiary) -> str:
    asha = _asha(session, b)
    return asha.name if asha else get_settings().asha_name


def voice_for(session: Session, b: Beneficiary) -> dict | None:
    """Her ASHA's cloned voice, if the ASHA recorded one and wants calls in her voice."""
    asha = _asha(session, b)
    if asha and asha.voice_embedding and asha.use_own_voice:
        return asha.voice_embedding
    return None


def _facility_name(asha: Asha | None, kind: str) -> str:
    f = ((asha.facilities if asha else None) or {}).get(kind) or {}
    return str(f.get("name") or "")


def _status_line(b: Beneficiary) -> str:
    if b.category == "postnatal":
        return f"new mother, {days_since_delivery(b)} days after delivery"
    return f"pregnant woman, about {weeks_pregnant(b)} weeks"


def _items(b: Beneficiary) -> list[protocol.Item]:
    return protocol.items_for(b.category, weeks_pregnant(b))


def _system_prompt(session: Session, b: Beneficiary, call: Call) -> str:
    asha = _asha(session, b)
    return prompts.render_system_prompt(
        name=b.name,
        village=b.village,
        asha_name=asha.name if asha else get_settings().asha_name,
        category=b.category,
        weeks_pregnant=weeks_pregnant(b),
        days_since_delivery=days_since_delivery(b),
        next_visit_line=_next_visit_line(b),
        today=today().strftime("%d %B %Y"),
        language_name=language_name(b.language),
        hospital=_facility_name(asha, "hospital"),
        phc=_facility_name(asha, "phc"),
        mode="ask" if call.channel == "ask" else "followup",
        own_voice=call.own_voice,
    )


def _stt_languages(lang: str) -> str:
    # Prisma v3.0 accepts up to 4 languages; adding English (and Hindi) covers code-mixed speech.
    langs = [lang, "en-IN"] if lang != "en-IN" else ["en-IN", "hi-IN"]
    if "hi-IN" not in langs:
        langs.append("hi-IN")
    return ",".join(langs)


# Same words, same voice -> same audio. Greetings repeat on every demo call, so they are synthesised once.
_audio_cache: "OrderedDict[str, tuple[str, bool]]" = OrderedDict()
_AUDIO_CACHE_SIZE = 150


def _cache_key(text: str, language: str, rate: int, voice: dict | None) -> str:
    v = hashlib.sha1(voice["embedding"].encode()).hexdigest() if voice else "timbre"
    return hashlib.sha1(f"{text}|{language}|{rate}|{v}".encode()).hexdigest()


async def speak(text: str, language: str, phone_line: bool, voice: dict | None = None) -> tuple[str, int, bool]:
    """Returns (MP3 data URL, ms, spoke_in_cloned_voice). Falls back to Timbre if cloning fails."""
    started = time.perf_counter()
    key = _cache_key(text, language, 8000 if phone_line else 24000, voice)
    if key in _audio_cache:
        _audio_cache.move_to_end(key)
        url, cloned = _audio_cache[key]
        return url, int((time.perf_counter() - started) * 1000), cloned
    rate = 8000 if phone_line else 24000
    audio, cloned = None, False
    if voice:
        try:
            audio = await speech.synthesize_cloned(text, voice, sample_rate=rate, container="mp3")
            cloned = True
        except speech.SpeechError as exc:
            log.warning("Cloned voice failed, using Timbre: %s", exc)
    if audio is None:
        audio = await speech.synthesize(text, language, sample_rate=rate, container="mp3")
    ms = int((time.perf_counter() - started) * 1000)
    url = "data:audio/mpeg;base64," + base64.b64encode(audio).decode()
    if cloned or not voice:  # don't cache a fallback as if it were her voice
        _audio_cache[key] = (url, cloned)
        if len(_audio_cache) > _AUDIO_CACHE_SIZE:
            _audio_cache.popitem(last=False)
    return url, ms, cloned


# ---------------------------------------------------------------- alerts
def _upsert_alert(session: Session, call: Call, signs: list[str]) -> bool:
    """Create or update the alert for this call. Returns True if a new alert was created."""
    alert = session.exec(select(Alert).where(Alert.call_id == call.id)).first()
    where = {
        "ask": "Reported when she asked MomCheck",
        "checkin": "Reported on her scheduled check-in",
        "interpreter": "Reported during a home visit (interpreter)",
    }.get(
        call.channel, "Reported on a follow-up call"
    )
    if alert is None:
        session.add(
            Alert(
                beneficiary_id=call.beneficiary_id,
                call_id=call.id,
                severity=protocol.severity_of(signs),
                reason=f"{where}: " + ", ".join(signs),
                danger_signs=signs,
            )
        )
        return True
    merged = list(dict.fromkeys([*(alert.danger_signs or []), *signs]))
    if merged != alert.danger_signs:
        alert.danger_signs = merged
        alert.reason = alert.reason.split(": ")[0] + ": " + ", ".join(merged)
        alert.severity = protocol.severity_of(merged)
        if alert.status != "open":  # a new sign re-opens a handled alert
            alert.status, alert.acknowledged_at = "open", None
        session.add(alert)
    return False


def _clean_signs(raw: Any, allowed: list[protocol.Sign]) -> list[str]:
    if not isinstance(raw, list):
        return []
    lookup = {s.label.lower(): s.label for s in allowed}
    out = []
    for item in raw:
        label = lookup.get(str(item).strip().lower())
        if label and label not in out:
            out.append(label)
    return out


def _record_signs(session: Session, call: Call, b: Beneficiary, signs: list[str], checklist_update: Any) -> bool:
    """Merge signs and checklist into the call, update triage, raise or update the alert."""
    call.checklist = protocol.merge_checklist(call.checklist, checklist_update if isinstance(checklist_update, dict) else None, signs, _items(b))
    alert_raised = False
    if signs:
        call.danger_signs = list(dict.fromkeys([*(call.danger_signs or []), *signs]))
        alert_raised = _upsert_alert(session, call, call.danger_signs)
    call.triage = protocol.triage(call.danger_signs or [], call.checklist)
    return alert_raised


def live_state(call: Call, b: Beneficiary) -> dict[str, Any]:
    """What the ASHA's live panel shows: the checklist, the risk level and the signs so far."""
    return {
        "checklist": protocol.checklist_out(b.category, weeks_pregnant(b), call.checklist),
        "triage": call.triage,
        "danger_signs": call.danger_signs or [],
    }


# ---------------------------------------------------------------- conversations
async def start_call(session: Session, b: Beneficiary, phone_line: bool = True, channel: str = "browser") -> tuple[Call, dict[str, Any]]:
    """Start a follow-up call (channel browser) or one she started from her link (channel ask)."""
    voice = voice_for(session, b)
    name = b.name.split()[0] if channel in ("ask", "checkin") else b.name
    greeting = prompts.greeting_for(b.language, name, own_voice=bool(voice), mode="ask" if channel == "ask" else "followup")
    call = Call(
        beneficiary_id=b.id,
        language=b.language,
        channel=channel,
        phone_line=phone_line,
        own_voice=bool(voice),
        transcript=[{"role": "assistant", "content": greeting, "language": b.language}],
    )
    session.add(call)
    session.commit()
    session.refresh(call)
    audio, tts_ms, cloned = await speak(greeting, b.language, phone_line, voice)
    if voice and not cloned:
        call.own_voice = False
        session.add(call)
        session.commit()
    reply = {
        "user_text": None,
        "user_en": None,
        "detected_language": None,
        "reply_text": greeting,
        "reply_en": None,
        "reply_audio": audio,
        "end_call": False,
        "alert_raised": False,
        "timings": {"stt_ms": None, "llm_ms": 0, "tts_ms": tts_ms},
        **live_state(call, b),
    }
    return call, reply


async def _transcribe(b: Beneficiary, audio: bytes, filename: str, language_code: str | None = None) -> tuple[str, str | None, int]:
    started = time.perf_counter()
    try:
        stt = await speech.transcribe(
            audio,
            filename=filename or "turn.wav",
            language_code=language_code or _stt_languages(b.language),
            keyterms=[b.name, *(b.village.split(",")[:1]), "ASHA", "PHC", "108", "102", "IFA"],
            topic="A pregnant woman or new mother talking about her health and her baby's with a maternal-health assistant.",
        )
    except speech.SpeechError as exc:
        raise CallError(f"Speech recognition failed: {exc}", 502) from exc
    return (stt.get("transcript") or "").strip(), stt.get("detected_language_code"), int((time.perf_counter() - started) * 1000)


async def respond(session: Session, call: Call, audio: bytes | None, filename: str = "turn.wav") -> dict[str, Any]:
    """One turn without the spoken reply: her audio -> Prisma STT -> Gemini -> saved transcript (+ alert).

    audio=None means she said nothing (e.g. silence on a phone call); the assistant then asks again.
    """
    if call.status != "in_progress":
        raise CallError("This call has already ended.", 409)
    b = session.get(Beneficiary, call.beneficiary_id)

    # 1. Speech to text (Gnani Prisma)
    stt_ms = None
    user_text, detected = "", None
    if audio:
        user_text, detected, stt_ms = await _transcribe(b, audio, filename)

    # 2. Decide what to say (Gemini), with the full conversation so far
    history: list[tuple[str, str]] = [
        (
            "user",
            {
                "ask": "(She opened her Ask MomCheck link and tapped Talk.)",
                "checkin": "(She opened her MomCheck link for her scheduled check-in. She is the woman herself.)",
            }.get(call.channel, "(The call has connected.)"),
        )
    ]
    for t in call.transcript:
        if t["role"] == "assistant":
            history.append(("model", json.dumps({"reply": t["content"], "end_call": False}, ensure_ascii=False)))
        else:
            history.append(("user", t["content"]))
    history.append(("user", user_text or "(inaudible)"))
    user_turns = sum(1 for t in call.transcript if t["role"] == "user") + 1
    if user_turns >= get_settings().max_turns:
        history.append(("user", "(System: the conversation is running long. Thank her and say goodbye now; set end_call to true.)"))

    started = time.perf_counter()
    try:
        result = await llm.chat_json(_system_prompt(session, b, call), history)
    except llm.LLMError as exc:
        raise CallError(f"The assistant could not respond: {exc}", 502) from exc
    llm_ms = int((time.perf_counter() - started) * 1000)
    reply_text = str(result.get("reply") or "").strip() or prompts.end_message_for(b.language)
    reply_en = str(result.get("reply_en") or "").strip() or None
    user_en = str(result.get("heard_en") or "").strip() or None
    end_call = bool(result.get("end_call"))
    signs = _clean_signs(result.get("danger_signs"), protocol.signs_for(b.category))

    # 3. Save the turn; raise an alert straight away if a danger sign was reported
    transcript = list(call.transcript)
    if user_text:
        transcript.append({"role": "user", "content": user_text, "language": detected, "en": user_en})
    transcript.append({"role": "assistant", "content": reply_text, "language": b.language, "en": reply_en})
    call.transcript = transcript
    alert_raised = _record_signs(session, call, b, signs, result.get("checklist"))
    session.add(call)
    session.commit()
    return {
        "user_text": user_text or None,
        "user_en": user_en if user_text else None,
        "detected_language": detected,
        "reply_text": reply_text,
        "reply_en": reply_en,
        "end_call": end_call,
        "alert_raised": alert_raised,
        "stt_ms": stt_ms,
        "llm_ms": llm_ms,
        **live_state(call, b),
    }


async def take_turn(session: Session, call: Call, audio: bytes, filename: str, phone_line: bool) -> dict[str, Any]:
    """Browser turn: respond(), then the spoken reply as an MP3 data URL."""
    if call.status != "in_progress":
        raise CallError("This call has already ended.", 409)
    call.phone_line = call.phone_line or phone_line
    turn = await respond(session, call, audio, filename)
    b = session.get(Beneficiary, call.beneficiary_id)
    try:
        audio_url, tts_ms, _ = await speak(turn["reply_text"], call.language, call.phone_line, voice_for(session, b) if call.own_voice else None)
    except speech.SpeechError as exc:
        raise CallError(f"Text-to-speech failed: {exc}", 502) from exc
    stt_ms, llm_ms = turn.pop("stt_ms"), turn.pop("llm_ms")
    return {**turn, "reply_audio": audio_url, "timings": {"stt_ms": stt_ms, "llm_ms": llm_ms, "tts_ms": tts_ms}}


# ---------------------------------------------------------------- interpreter
def start_interpreter(session: Session, b: Beneficiary) -> Call:
    call = Call(beneficiary_id=b.id, language=b.language, channel="interpreter", own_voice=bool(voice_for(session, b)), transcript=[])
    session.add(call)
    session.commit()
    session.refresh(call)
    return call


async def interpret_turn(session: Session, call: Call, audio: bytes, filename: str, speaker: str) -> dict[str, Any]:
    """One side speaks; the other hears it in their own language.

    speaker="asha": the ASHA speaks her language; the woman hears it in hers, in the ASHA's own voice if recorded.
    speaker="mother": the woman speaks; the ASHA hears it in her language, and danger signs are picked up.
    """
    if call.status != "in_progress" or call.channel != "interpreter":
        raise CallError("This conversation has already ended.", 409)
    b = session.get(Beneficiary, call.beneficiary_id)
    asha = _asha(session, b)
    asha_lang = asha.language if asha else "hi-IN"
    src, dst = (asha_lang, b.language) if speaker == "asha" else (b.language, asha_lang)

    text, detected, stt_ms = await _transcribe(b, audio, filename, _stt_languages(src))
    if not text:
        raise CallError("Couldn't hear anything. Please speak again, a little closer to the phone.", 422)

    signs_allowed = protocol.signs_for(b.category)
    from_mother = speaker == "mother"
    started = time.perf_counter()
    try:
        result = await llm.complete_json(
            prompts.INTERPRET_PROMPT.format(
                asha_name=asha.name if asha else "the ASHA",
                name=b.name,
                status_line=_status_line(b),
                speaker_line=(
                    f"{b.name} said this in {language_name(src)}." if from_mother else f"{asha.name if asha else 'The ASHA'} said this to {b.name} in {language_name(src)}."
                ),
                target_language=language_name(dst),
                signs_block=(
                    "Also list any danger signs she reports, using these exact English labels:\n"
                    + "\n".join(f"- {s.label}" for s in signs_allowed)
                    + "\nand which checklist rows her words tell you about (ids: "
                    + ", ".join(i.id for i in _items(b))
                    + '), each "ok", "concern" or "danger".'
                )
                if from_mother
                else "",
                signs_keys=', "danger_signs": [...], "checklist": {...}' if from_mother else "",
                text=text.replace('"', "'"),
            ),
            temperature=0.2,
        )
    except llm.LLMError as exc:
        raise CallError(f"Translation failed: {exc}", 502) from exc
    llm_ms = int((time.perf_counter() - started) * 1000)
    translation = str(result.get("translation") or "").strip()
    english = str(result.get("english") or "").strip() or None
    if not translation:
        raise CallError("Translation came back empty. Please say that again.", 502)

    # The woman hears the ASHA in the ASHA's own voice (if recorded); the ASHA hears a standard voice.
    voice = voice_for(session, b) if not from_mother else None
    try:
        audio_url, tts_ms, cloned = await speak(translation, dst, False, voice)
    except speech.SpeechError as exc:
        raise CallError(f"Text-to-speech failed: {exc}", 502) from exc

    transcript = list(call.transcript)
    transcript.append(
        {"role": "user" if from_mother else "asha", "content": text, "language": detected or src, "translation": translation, "translation_language": dst, "en": english}
    )
    call.transcript = transcript
    alert_raised = False
    if from_mother:
        alert_raised = _record_signs(session, call, b, _clean_signs(result.get("danger_signs"), signs_allowed), result.get("checklist"))
    session.add(call)
    session.commit()
    return {
        "speaker": speaker,
        "text": text,
        "language": detected or src,
        "translation": translation,
        "translation_language": dst,
        "english": english,
        "audio": audio_url,
        "own_voice": cloned,
        "alert_raised": alert_raised,
        "timings": {"stt_ms": stt_ms, "llm_ms": llm_ms, "tts_ms": tts_ms},
        **live_state(call, b),
    }


# ---------------------------------------------------------------- end and review
def _transcript_text(call: Call) -> str:
    who = {"assistant": "MomCheck", "user": "Woman", "asha": "ASHA"}
    lines = []
    for t in call.transcript:
        line = f"{who.get(t['role'], t['role'])}: {t['content']}"
        if t.get("en"):
            line += f"  [English: {t['en']}]"
        lines.append(line)
    return "\n".join(lines)


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
        call.summary = "The conversation ended before she spoke."
        session.add(call)
        session.commit()
        session.refresh(call)
        return call

    call.status = "completed"
    signs = protocol.signs_for(b.category)
    try:
        result = await llm.complete_json(
            prompts.CALL_ANALYSIS_PROMPT.format(
                name=b.name,
                status_line=_status_line(b),
                danger_signs="\n".join(f"- {s.label} ({s.level.upper()})" for s in signs),
                items="\n".join(f"- {i.id}: {i.label}" for i in _items(b)),
                transcript=_transcript_text(call),
            )
        )
        found = _clean_signs(result.get("danger_signs"), signs)
        _record_signs(session, call, b, found, result.get("checklist"))
        outcome = str(result.get("outcome", "ROUTINE")).upper()
        call.outcome = "DANGER_SIGN" if call.danger_signs else (outcome if outcome in OUTCOMES else "ROUTINE")
        call.summary = result.get("summary")
        call.extraction = result
        if not call.danger_signs and call.outcome == "ROUTINE" and not call.triage:
            call.triage = "green"
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
                    reason="Automatic review of the conversation failed. Please read the transcript.",
                )
            )
    session.add(call)
    session.commit()
    session.refresh(call)
    return call
