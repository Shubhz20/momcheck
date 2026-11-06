"""Backend LLM (Google Gemini): call analysis, note extraction, briefing text.

The phone conversation itself runs on Gnani Agent Builder's own LLM. This module only
post-processes text that Gnani STT / Agent Builder already produced.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

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

    s = get_settings()
    client = _get_client()
    contents = [types.Content(role=role, parts=[types.Part(text=text)]) for role, text in history]
    try:
        resp = await client.aio.models.generate_content(
            model=s.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system, temperature=temperature, response_mime_type="application/json"
            ),
        )
    except Exception as exc:
        raise LLMError(f"Gemini request failed: {exc}") from exc
    try:
        return _parse_json(resp.text or "")
    except (ValueError, LLMError) as exc:
        raise LLMError(f"Gemini returned invalid JSON: {exc}") from exc


async def complete_json(prompt: str, *, temperature: float = 0.2) -> dict[str, Any]:
    from google.genai import types

    s = get_settings()
    client = _get_client()
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            resp = await client.aio.models.generate_content(
                model=s.gemini_model,
                contents=prompt if attempt == 0 else f"{prompt}\n\nYour previous answer was not valid JSON ({last_error}). Return only valid JSON.",
                config=types.GenerateContentConfig(temperature=temperature, response_mime_type="application/json"),
            )
            return _parse_json(resp.text or "")
        except (ValueError, LLMError) as exc:  # JSON problems -> retry once
            last_error = exc
            log.warning("LLM JSON parse failed (attempt %d): %s", attempt + 1, exc)
        except Exception as exc:  # network / quota / model errors
            raise LLMError(f"Gemini request failed: {exc}") from exc
    raise LLMError(f"LLM returned invalid JSON twice: {last_error}")
