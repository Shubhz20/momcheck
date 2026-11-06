"""Backend LLM (Google Gemini): the call agent's replies, call review, note extraction, briefing text.

Gnani Prisma STT turns speech into text and Timbre TTS speaks the reply; this module decides what
to say. Models are tried in order (GEMINI_MODEL, then GEMINI_FALLBACK_MODELS) when one is busy.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from . import usage
from .config import get_settings

log = logging.getLogger("llm")


class LLMError(RuntimeError):
    pass


_client = None


def _get_client():
    global _client
    if _client is None:
        s = get_settings()
        if not s.gemini_api_key:
            raise LLMError("GEMINI_API_KEY is not set")
        from google import genai

        _client = genai.Client(api_key=s.gemini_api_key)
    return _client


_RETRYABLE = ("503", "429", "404", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "NOT_FOUND", "overloaded")


async def _generate(contents, config):
    """generate_content on GEMINI_MODEL, moving to the fallback models on busy/quota/missing-model errors."""
    s = get_settings()
    client = _get_client()
    models = [s.gemini_model] + [m for m in s.gemini_fallback_models if m != s.gemini_model]
    last: Exception | None = None
    for model in models:
        try:
            resp = await client.aio.models.generate_content(model=model, contents=contents, config=config)
            usage.record("llm_requests")
            return resp
        except Exception as exc:
            if not any(code in str(exc) for code in _RETRYABLE):
                raise
            log.warning("Gemini %s unavailable, trying next model: %s", model, str(exc)[:120])
            last = exc
    raise last  # type: ignore[misc]


def _parse_json(text: str) -> dict[str, Any]:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fenced:
        text = fenced.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise LLMError(f"LLM did not return JSON: {text[:200]}")
    return json.loads(text[start : end + 1])


async def chat_json(system: str, history: list[tuple[str, str]], *, temperature: float = 0.4) -> dict[str, Any]:
    """Multi-turn chat. history = [(role, text)] with role "user" or "model". Returns parsed JSON."""
    from google.genai import types

    usage.check("llm_requests")

    contents = [types.Content(role=role, parts=[types.Part(text=text)]) for role, text in history]
    config = types.GenerateContentConfig(system_instruction=system, temperature=temperature, response_mime_type="application/json")
    last: Exception | None = None
    for attempt in range(2):  # one retry: a mother mid-conversation shouldn't hit a one-off glitch
        try:
            resp = await _generate(contents, config)
            return _parse_json(resp.text or "")
        except (ValueError, LLMError) as exc:
            last = LLMError(f"Gemini returned invalid JSON: {exc}")
        except Exception as exc:  # noqa: BLE001
            last = LLMError(f"Gemini request failed: {exc}")
        log.warning("Gemini chat attempt %d failed: %s", attempt + 1, last)
        await asyncio.sleep(0.6)
    raise last  # type: ignore[misc]


async def complete_json(prompt: str, *, temperature: float = 0.2) -> dict[str, Any]:
    from google.genai import types

    usage.check("llm_requests")

    last_error: Exception | None = None
    for attempt in range(2):
        try:
            resp = await _generate(
                prompt if attempt == 0 else f"{prompt}\n\nYour previous answer was not valid JSON ({last_error}). Return only valid JSON.",
                types.GenerateContentConfig(temperature=temperature, response_mime_type="application/json"),
            )
            return _parse_json(resp.text or "")
        except (ValueError, LLMError) as exc:  # JSON problems -> retry once
            last_error = exc
            log.warning("LLM JSON parse failed (attempt %d): %s", attempt + 1, exc)
        except Exception as exc:  # network / quota / model errors
            raise LLMError(f"Gemini request failed: {exc}") from exc
    raise LLMError(f"LLM returned invalid JSON twice: {last_error}")
