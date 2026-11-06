"""Gnani Speech APIs: Prisma STT (REST) and Timbre TTS (REST).

Docs: https://docs.gnani.ai/api/STT/speech-to-text.md, https://docs.gnani.ai/api/TTS/tts-inference.md
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

import httpx

from ..config import get_settings

log = logging.getLogger("gnani.speech")

# TTS allows only one active request per key at a time (429 RATE_LIMITED otherwise).
_tts_lock = asyncio.Lock()


class SpeechError(RuntimeError):
    def __init__(self, message: str, status: int | None = None, body: Any = None):
        super().__init__(message)
        self.status = status
        self.body = body


def _headers() -> dict[str, str]:
    key = get_settings().speech_api_key
    if not key:
        raise SpeechError("GNANI_SPEECH_API_KEY is not set")
    return {"X-API-Key-ID": key}


def _error_message(resp: httpx.Response) -> str:
    try:
        body = resp.json()
    except ValueError:
        return resp.text[:300]
    if isinstance(body, dict):
        if isinstance(body.get("error"), dict):
            return body["error"].get("message") or json.dumps(body["error"])
        if isinstance(body.get("detail"), dict):
            return body["detail"].get("message") or json.dumps(body["detail"])
        return body.get("message") or json.dumps(body)[:300]
    return str(body)[:300]


async def transcribe(
    audio: bytes,
    filename: str = "audio.wav",
    language_code: str = "indic-auto",
    *,
    model: str | None = None,
    keyterms: list[str] | None = None,
    topic: str | None = None,
    itn: bool = True,
) -> dict[str, Any]:
    """Transcribe a clip of up to 30 s. Returns the raw Prisma response (transcript, detected_language_code, ...)."""
    s = get_settings()
    model = model or s.stt_model
    data: dict[str, str] = {"language_code": language_code, "format": "transcribe" if itn else "verbatim"}
    if model and model != "prisma-v2.5":
        data["model"] = model
    if model == "prisma-v3.0":
        if keyterms:
            data["keyterms"] = json.dumps([k for k in keyterms if k][:200], ensure_ascii=False)
        if topic:
            data["topic"] = topic[:1600]
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{s.speech_base_url}/stt/v3",
                headers=_headers(),
                data=data,
                files={"audio_file": (filename, audio)},
            )
    except httpx.HTTPError as exc:
        raise SpeechError(f"STT request failed: {type(exc).__name__}: {exc}") from exc
    if resp.status_code != 200:
        raise SpeechError(f"STT failed ({resp.status_code}): {_error_message(resp)}", resp.status_code, resp.text)
    body = resp.json()
    log.info("STT %s %.2fs request_id=%s", language_code, time.perf_counter() - started, body.get("request_id"))
    return body


async def synthesize(
    text: str,
    language: str,
    *,
    voice: str | None = None,
    model: str | None = None,
    speed: float = 1.0,
    sample_rate: int = 24000,
    container: str = "wav",
    encoding: str = "linear_pcm",
) -> bytes:
    """Synthesize speech and return audio bytes (WAV by default).

    encoding="pcm_mulaw" with container="raw" gives 8-bit mu-law, the format phone networks (Twilio) use.
    """
    s = get_settings()
    payload = {
        "text": text,
        "voice": voice or s.tts_voice,
        "model": model or s.tts_model,
        "language": language,
        "speed": speed,
        "audio_config": {
            "sample_rate": sample_rate,
            "num_channels": 1,
            "sample_width": 1 if encoding in ("pcm_mulaw", "pcm_alaw") else 2,
            "encoding": encoding,
            "container": container,
        },
    }
    started = time.perf_counter()
    async with _tts_lock:
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    f"{s.speech_base_url}/api/v1/tts/inference", headers=_headers(), json=payload
                )
        except httpx.HTTPError as exc:
            raise SpeechError(f"TTS request failed: {type(exc).__name__}: {exc}") from exc
    if resp.status_code != 200:
        raise SpeechError(f"TTS failed ({resp.status_code}): {_error_message(resp)}", resp.status_code, resp.text)
    log.info("TTS %s %d chars %.2fs", language, len(text), time.perf_counter() - started)
    return resp.content


# ---- Voice cloning (https://docs.gnani.ai/api/VC/voice-clone-embeddings.md) -------------------------
VC_MODEL = "vachana-vc-v1"


async def voice_embedding(audio: bytes, filename: str = "voice.wav") -> dict[str, Any]:
    """Turn 5-30 s of clean speech into a speaker embedding ({embedding, shape, dtype}). Done once per voice."""
    s = get_settings()
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{s.speech_base_url}/api/v1/tts/voice-clone/embeddings",
                headers=_headers(),
                files={"audio_file": (filename, audio, "audio/wav")},
            )
    except httpx.HTTPError as exc:
        raise SpeechError(f"Voice cloning request failed: {type(exc).__name__}: {exc}") from exc
    if resp.status_code != 200:
        raise SpeechError(f"Voice cloning failed ({resp.status_code}): {_error_message(resp)}", resp.status_code, resp.text)
    emb = (resp.json().get("data") or {}).get("voice_clone_embedding")
    if not isinstance(emb, dict) or not emb.get("embedding"):
        raise SpeechError("Voice cloning returned no embedding")
    return {"embedding": emb["embedding"], "shape": emb.get("shape") or [1, 768], "dtype": emb.get("dtype") or "torch.bfloat16"}


async def synthesize_cloned(text: str, embedding: dict[str, Any], *, sample_rate: int = 24000, container: str = "wav") -> bytes:
    """Speak `text` (any supported language) in a cloned voice."""
    s = get_settings()
    payload = {
        "text": text,
        "model": VC_MODEL,
        "audio_config": {"sample_rate": sample_rate, "num_channels": 1, "sample_width": 2, "encoding": "linear_pcm", "container": container},
        "speaker_embedding": embedding,
    }
    started = time.perf_counter()
    async with _tts_lock:
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(f"{s.speech_base_url}/api/v1/tts/inference", headers=_headers(), json=payload)
        except httpx.HTTPError as exc:
            raise SpeechError(f"Cloned TTS request failed: {type(exc).__name__}: {exc}") from exc
    if resp.status_code != 200:
        raise SpeechError(f"Cloned TTS failed ({resp.status_code}): {_error_message(resp)}", resp.status_code, resp.text)
    log.info("VC TTS %d chars %.2fs", len(text), time.perf_counter() - started)
    return resp.content
