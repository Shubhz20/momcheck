"""Settings loaded from environment variables (and a local .env file in development)."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")


def _env(name: str, default: str = "") -> str:
    """Environment variable, falling back to `default` when unset or empty."""
    return (os.getenv(name) or "").strip() or default


class Settings:
    def __init__(self) -> None:
        self.speech_api_key = _env("GNANI_SPEECH_API_KEY")
        self.speech_base_url = _env("GNANI_SPEECH_BASE_URL", "https://api.vachana.ai").rstrip("/")
        self.tts_model = _env("GNANI_TTS_MODEL", "timbre-v3.0")
        self.tts_voice = _env("GNANI_TTS_VOICE", "Chetana")
        self.stt_model = _env("GNANI_STT_MODEL", "prisma-v3.0")

        self.llm_provider = _env("LLM_PROVIDER", "gemini")
        self.gemini_api_key = _env("GEMINI_API_KEY")
        # gemini-2.5-flash is closed to new API keys; flash-lite answers in ~1.5 s, which suits a live call.
        self.gemini_model = _env("GEMINI_MODEL", "gemini-3.5-flash-lite")
        self.gemini_fallback_models = [
            m.strip()
            for m in _env("GEMINI_FALLBACK_MODELS", "gemini-3-flash-preview,gemini-3.1-flash-lite").split(",")
            if m.strip()
        ]

        self.database_url = self._normalise_db_url(_env("DATABASE_URL", f"sqlite:///{ROOT_DIR / 'momcheck.db'}"))
        self.asha_name = _env("ASHA_NAME", "Asha didi")
        self.max_turns = int(_env("MAX_CALL_TURNS", "14"))

    @staticmethod
    def _normalise_db_url(url: str) -> str:
        # Neon/Heroku style URLs -> SQLAlchemy + psycopg3 driver
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
