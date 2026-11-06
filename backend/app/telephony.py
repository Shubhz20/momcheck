"""Real phone calls through Twilio Programmable Voice and Media Streams.

The ASHA presses "Call her phone" and Twilio dials the woman. When she answers, Twilio opens a WebSocket
to /api/twilio/stream and streams the call audio both ways (8 kHz mu-law, 20 ms frames). Each turn:

    her speech (an energy detector finds where she stops) -> Gnani Prisma STT -> Gemini
    -> Gnani Timbre TTS (asked for mu-law directly) -> played into the call

calls.respond() is shared with browser calls, so the transcript is saved and danger-sign alerts reach
the ASHA during the call. Twilio's trial account can only ring numbers verified on the account.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import math
import secrets
import wave
from array import array
from typing import Any
from xml.sax.saxutils import quoteattr

import httpx
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from sqlmodel import Session

from . import prompts
from .config import get_settings
from .db import engine
from .gnani import speech
from .models import Beneficiary, Call, utcnow
from .services import calls

log = logging.getLogger("telephony")
router = APIRouter()

TWILIO_API = "https://api.twilio.com/2010-04-01"
SAMPLE_RATE = 8000
FRAME_BYTES = 160  # Twilio sends 20 ms of 8 kHz mu-law per media message


class PhoneCallError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


# ---------------------------------------------------------------------------
# mu-law (G.711) decoding: Twilio audio -> 16-bit PCM for Prisma
# ---------------------------------------------------------------------------
def _ulaw_to_linear(u: int) -> int:
    u = ~u & 0xFF
    exponent = (u >> 4) & 0x07
    sample = ((((u & 0x0F) << 3) + 0x84) << exponent) - 0x84
    return -sample if u & 0x80 else sample


_ULAW = [_ulaw_to_linear(i) for i in range(256)]
_ULAW_SQ = [v * v for v in _ULAW]


def ulaw_to_pcm16(data: bytes) -> bytes:
    return array("h", [_ULAW[b] for b in data]).tobytes()


def ulaw_rms(frame: bytes) -> float:
    return math.sqrt(sum(_ULAW_SQ[b] for b in frame) / max(1, len(frame)))


def pcm16_wav(pcm: bytes, rate: int = SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# End-of-speech detection on the incoming call audio
# ---------------------------------------------------------------------------
class Utterance:
    """Collects one thing she says. feed() returns the mu-law audio when she stops, or "timeout"."""

    START_FRAMES = 3  # 60 ms above the threshold starts speech
    END_FRAMES = 45  # 0.9 s of quiet ends it
    MIN_SPEECH_FRAMES = 12  # shorter bursts (clicks, a cough) are ignored
    MAX_FRAMES = 20 * 50  # 20 s cap
    PREROLL_FRAMES = 15  # keep 300 ms before speech starts so the first syllable isn't cut
    NO_SPEECH_FRAMES = 8 * 50  # 8 s of nothing -> "timeout" (ask again)
    MIN_RMS = 350.0

    def __init__(self, noise: float = 200.0) -> None:
        self.noise = noise
        self.frames: list[bytes] = []
        self.preroll: list[bytes] = []
        self.loud_run = 0
        self.quiet_run = 0
        self.speech_frames = 0
        self.waited = 0
        self.in_speech = False

    def feed(self, frame: bytes) -> bytes | str | None:
        rms = ulaw_rms(frame)
        threshold = max(self.MIN_RMS, self.noise * 2.5)
        loud = rms > threshold
        if not self.in_speech:
            self.waited += 1
            if not loud:  # follow the background level, slowly
                self.noise = min(1500.0, 0.95 * self.noise + 0.05 * rms)
            self.preroll = (self.preroll + [frame])[-self.PREROLL_FRAMES :]
            self.loud_run = self.loud_run + 1 if loud else 0
            if self.loud_run >= self.START_FRAMES:
                self.in_speech = True
                self.frames = list(self.preroll)
                self.speech_frames = self.loud_run
                self.quiet_run = 0
            elif self.waited >= self.NO_SPEECH_FRAMES:
                return "timeout"
            return None

        self.frames.append(frame)
        if loud:
            self.speech_frames += 1
            self.quiet_run = 0
        else:
            self.quiet_run += 1
        if self.quiet_run >= self.END_FRAMES or len(self.frames) >= self.MAX_FRAMES:
            if self.speech_frames < self.MIN_SPEECH_FRAMES:  # just noise: keep listening
                self.__init__(self.noise)
                return None
            return b"".join(self.frames)
        return None


# ---------------------------------------------------------------------------
# Twilio REST
# ---------------------------------------------------------------------------
def _friendly_twilio_error(body: dict[str, Any], phone: str) -> str:
    code = body.get("code")
    message = body.get("message") or "Twilio refused the call."
    if code == 21219 or "unverified" in message.lower():
        return (
            f"+91 {phone} isn't verified on the Twilio trial account, so it can't be called. Verify it in Twilio "
            "(Phone Numbers > Verified Caller IDs), or use the call in your browser."
        )
    if code in (21215, 13227) or "permission" in message.lower():
        return "Calls to India aren't switched on in Twilio. Turn on India under Voice > Settings > Geo permissions."
    return f"Twilio couldn't place the call: {message}"


async def _twilio(method: str, path: str, data: dict[str, str | list[str]] | None = None) -> httpx.Response:
    """Twilio REST call (form-encoded; a list value repeats the field, e.g. StatusCallbackEvent)."""
    s = get_settings()
    async with httpx.AsyncClient(timeout=20, auth=(s.twilio_account_sid, s.twilio_auth_token)) as client:
        return await client.request(method, f"{TWILIO_API}/Accounts/{s.twilio_account_sid}{path}", data=data)


async def hangup(call_sid: str) -> None:
    try:
        await _twilio("POST", f"/Calls/{call_sid}.json", {"Status": "completed"})
    except httpx.HTTPError as exc:
        log.warning("Hang-up request failed for %s: %s", call_sid, exc)


async def _tts_ulaw(text: str, language: str) -> bytes:
    return await speech.synthesize(text, language, sample_rate=SAMPLE_RATE, container="raw", encoding="pcm_mulaw")


_greetings: dict[int, bytes] = {}  # call id -> greeting audio, made while the phone rings


async def place_call(session: Session, b: Beneficiary) -> Call:
    """Create the call record and ask Twilio to ring her. Raises PhoneCallError with a readable message."""
    s = get_settings()
    if not s.phone_calls_configured:
        raise PhoneCallError("Phone calls aren't set up on this server (Twilio keys are missing).", 503)
    if not s.public_base_url.startswith("https://"):
        raise PhoneCallError("Phone calls need the app's public https address (PUBLIC_BASE_URL).", 503)

    greeting = prompts.greeting_for(b.language, b.name)
    call = Call(
        beneficiary_id=b.id,
        language=b.language,
        channel="phone",
        status="ringing",
        phone_line=True,
        stream_token=secrets.token_urlsafe(24),
        transcript=[{"role": "assistant", "content": greeting, "language": b.language}],
    )
    session.add(call)
    session.commit()
    session.refresh(call)

    try:  # ready before she picks up, so she hears MomCheck straight away
        _greetings[call.id] = await _tts_ulaw(greeting, b.language)
    except speech.SpeechError as exc:
        log.warning("Greeting TTS failed, will retry on answer: %s", exc)

    ws_url = "wss://" + s.public_base_url.removeprefix("https://") + "/api/twilio/stream"
    twiml = (
        f"<Response><Connect><Stream url={quoteattr(ws_url)}>"
        f'<Parameter name="call_id" value="{call.id}"/>'
        f"<Parameter name=\"token\" value={quoteattr(call.stream_token)}/>"
        "</Stream></Connect></Response>"
    )
    status_url = f"{s.public_base_url}/api/twilio/status/{call.id}?token={call.stream_token}"
    data: dict[str, str | list[str]] = {
        "To": f"+91{b.phone}",
        "From": s.twilio_from_number,
        "Twiml": twiml,
        "Timeout": "30",
        "StatusCallback": status_url,
        "StatusCallbackMethod": "POST",
        "StatusCallbackEvent": ["initiated", "ringing", "answered", "completed"],
    }
    try:
        resp = await _twilio("POST", "/Calls.json", data)
        body = resp.json()
    except Exception as exc:  # any failure must leave the call marked failed, not stuck on "ringing"
        log.exception("Twilio call request failed")
        resp, body = None, {"message": str(exc)}
    if resp is None or resp.status_code >= 300:
        message = _friendly_twilio_error(body, b.phone)
        call.status, call.outcome = "failed", "NOT_REACHABLE"
        call.summary, call.error, call.completed_at = "The call could not be placed.", message, utcnow()
        session.add(call)
        session.commit()
        _greetings.pop(call.id, None)
        raise PhoneCallError(message, 502)

    call.provider_sid = body.get("sid")
    session.add(call)
    session.commit()
    session.refresh(call)
    log.info("Phone call %s placed to %s (Twilio %s)", call.id, b.name, call.provider_sid)
    return call


# ---------------------------------------------------------------------------
# Twilio callbacks
# ---------------------------------------------------------------------------
_NOT_REACHED = {
    "no-answer": ("not_answered", "She did not answer the call."),
    "busy": ("not_answered", "Her line was busy."),
    "canceled": ("not_answered", "The call was cancelled before she answered."),
    "failed": ("failed", "The call could not be connected."),
}


@router.post("/api/twilio/status/{call_id}", include_in_schema=False)
async def twilio_status(call_id: int, request: Request, token: str = "") -> Response:
    form = await request.form()
    status = str(form.get("CallStatus") or "")
    with Session(engine) as session:
        call = session.get(Call, call_id)
        if call is None or not secrets.compare_digest(call.stream_token or "", token):
            return Response(status_code=403)
        if status in _NOT_REACHED and call.status in ("ringing", "in_progress"):
            call.status, call.summary = _NOT_REACHED[status]
            call.outcome, call.completed_at = "NOT_REACHABLE", utcnow()
        elif status == "completed" and call.status == "ringing":
            # Answered but the conversation never started (e.g. no key pressed on the trial message).
            call.status, call.outcome = "not_answered", "NOT_REACHABLE"
            call.summary, call.completed_at = "The call ended before the conversation started.", utcnow()
        session.add(call)
        session.commit()
    log.info("Twilio status for call %s: %s", call_id, status)
    return Response(status_code=204)


class PhoneConversation:
    """One live phone call on the Twilio media-stream WebSocket."""

    SAY_CHUNK = 1600  # 200 ms of audio per outgoing media message
    MAX_SILENT_PROMPTS = 3

    def __init__(self, ws: WebSocket) -> None:
        self.ws = ws
        self.stream_sid: str | None = None
        self.call_id: int | None = None
        self.language = "hi-IN"
        self.state = "connecting"  # speaking | listening | thinking | ending
        self.utterance = Utterance()
        self.pending_mark: str | None = None
        self.hang_up_after_mark = False
        self.marks = 0
        self.silent_prompts = 0
        self.tasks: set[asyncio.Task] = set()
        self.closed = False

    def _spawn(self, coro) -> None:
        task = asyncio.create_task(coro)
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)

    async def run(self) -> None:
        try:
            while True:
                msg = json.loads(await self.ws.receive_text())
                event = msg.get("event")
                if event == "start":
                    await self._on_start(msg.get("start") or {})
                elif event == "media":
                    self._on_media(msg.get("media") or {})
                elif event == "mark":
                    self._on_mark((msg.get("mark") or {}).get("name"))
                elif event == "stop":
                    break
        except WebSocketDisconnect:
            pass
        except RuntimeError:  # the socket was closed by us (hang-up) or a rejected stream
            if self.state != "ending" and self.call_id is not None:
                log.warning("Phone call %s: stream closed unexpectedly", self.call_id)
        except Exception:  # never leave the call hanging on a bug
            log.exception("Phone call %s: stream error", self.call_id)
        finally:
            self.closed = True
            await self._finish()

    # ---- events ------------------------------------------------------------
    async def _on_start(self, start: dict[str, Any]) -> None:
        self.stream_sid = start.get("streamSid")
        params = start.get("customParameters") or {}
        try:
            call_id = int(params.get("call_id", 0))
        except ValueError:
            call_id = 0
        with Session(engine) as session:
            call = session.get(Call, call_id)
            if call is None or call.channel != "phone" or not secrets.compare_digest(call.stream_token or "", str(params.get("token", ""))):
                log.warning("Rejected media stream for call %s", call_id)
                await self.ws.close()
                return
            call.status = "in_progress"
            call.provider_sid = call.provider_sid or start.get("callSid")
            session.add(call)
            session.commit()
            self.call_id, self.language = call.id, call.language
            greeting = call.transcript[0]["content"]
        log.info("Phone call %s answered", self.call_id)
        audio = _greetings.pop(self.call_id, None)
        self._spawn(self._say(greeting, audio=audio))

    def _on_media(self, media: dict[str, Any]) -> None:
        if self.state != "listening" or media.get("track", "inbound") != "inbound":
            return
        result = self.utterance.feed(base64.b64decode(media.get("payload", "")))
        if result is None:
            return
        self.state = "thinking"
        self._spawn(self._turn(None if result == "timeout" else result))

    def _on_mark(self, name: str | None) -> None:
        if not name or name != self.pending_mark:
            return
        self.pending_mark = None
        if self.hang_up_after_mark:
            self.state = "ending"
            self._spawn(self._close())
        else:
            self.utterance = Utterance(self.utterance.noise)
            self.state = "listening"

    # ---- actions -----------------------------------------------------------
    async def _turn(self, ulaw: bytes | None) -> None:
        with Session(engine) as session:
            call = session.get(Call, self.call_id)
            if call is None or call.status != "in_progress":
                return
            if ulaw is None:
                self.silent_prompts += 1
                if self.silent_prompts >= self.MAX_SILENT_PROMPTS:
                    await self._say(prompts.end_message_for(self.language), end=True)
                    return
            else:
                self.silent_prompts = 0
            try:
                turn = await calls.respond(session, call, pcm16_wav(ulaw_to_pcm16(ulaw)) if ulaw else None, "turn.wav")
            except calls.CallError as exc:
                log.error("Phone call %s: turn failed: %s", self.call_id, exc)
                self.utterance = Utterance(self.utterance.noise)
                self.state = "listening"  # she will repeat or say hello
                return
        log.info("Phone call %s: heard %r -> %r", self.call_id, turn["user_text"], turn["reply_text"])
        await self._say(turn["reply_text"], end=turn["end_call"])

    async def _say(self, text: str, *, audio: bytes | None = None, end: bool = False) -> None:
        if self.closed:
            return
        self.state = "speaking"
        if audio is None:
            try:
                audio = await _tts_ulaw(text, self.language)
            except speech.SpeechError as exc:
                log.error("Phone call %s: TTS failed: %s", self.call_id, exc)
                audio = b""
        for i in range(0, len(audio), self.SAY_CHUNK):
            payload = base64.b64encode(audio[i : i + self.SAY_CHUNK]).decode()
            await self._send({"event": "media", "streamSid": self.stream_sid, "media": {"payload": payload}})
        self.marks += 1
        name = f"say-{self.marks}"
        self.pending_mark, self.hang_up_after_mark = name, end
        await self._send({"event": "mark", "streamSid": self.stream_sid, "mark": {"name": name}})
        # Twilio echoes the mark once the audio has played. Fall back to a timer in case it never arrives.
        self._spawn(self._mark_fallback(name, len(audio) / SAMPLE_RATE + 2.0))

    async def _mark_fallback(self, name: str, seconds: float) -> None:
        await asyncio.sleep(seconds)
        if self.pending_mark == name and not self.closed:
            log.warning("Phone call %s: mark %s not echoed, continuing", self.call_id, name)
            self._on_mark(name)

    async def _send(self, msg: dict[str, Any]) -> None:
        if self.closed:
            return
        try:
            await self.ws.send_text(json.dumps(msg))
        except (WebSocketDisconnect, RuntimeError):
            self.closed = True

    async def _close(self) -> None:
        """Closing the stream ends the call (there is no TwiML after <Connect>)."""
        await asyncio.sleep(0.3)
        try:
            await self.ws.close()
        except RuntimeError:
            pass

    async def _finish(self) -> None:
        for task in list(self.tasks):
            if task is not asyncio.current_task():
                task.cancel()
        if self.call_id is None:
            return
        with Session(engine) as session:
            call = session.get(Call, self.call_id)
            if call is None:
                return
            if call.status == "in_progress":
                await calls.end_call(session, call)  # outcome, summary, alerts
                log.info("Phone call %s ended: %s", call.id, call.outcome)
            sid = call.provider_sid
        if sid:
            await hangup(sid)  # in case she is still on the line


@router.websocket("/api/twilio/stream")
async def twilio_stream(ws: WebSocket) -> None:
    await ws.accept()
    await PhoneConversation(ws).run()
