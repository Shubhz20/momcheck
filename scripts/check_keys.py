"""Check that the API keys in .env work, using real calls and synthetic audio only.

    .venv/bin/python scripts/check_keys.py

1. Timbre TTS speaks a sentence in Hindi and Tamil (saved to tmp/).
2. Prisma STT transcribes that audio back (a round trip).
3. Gemini returns a small JSON answer.
"""
from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import llm  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.gnani import speech  # noqa: E402

SAMPLES = {
    "hi-IN": "नमस्ते सुनीता जी, मैं जननी साथी हूँ। क्या आपके पैरों में सूजन है?",
    "ta-IN": "வணக்கம் லக்ஷ்மி, நான் ஜனனி சாத்தி. உங்களுக்கு காய்ச்சல் இருக்கிறதா?",
}


def ok(msg: str) -> None:
    print(f"  ✅ {msg}")


def fail(msg: str) -> None:
    print(f"  ❌ {msg}")


async def main() -> int:
    s = get_settings()
    out_dir = ROOT / "tmp"
    out_dir.mkdir(exist_ok=True)
    failures = 0

    print(f"\n1+2. Gnani Timbre TTS ({s.tts_model}, voice {s.tts_voice}) -> Prisma STT ({s.stt_model})")
    if not s.speech_api_key:
        fail("GNANI_SPEECH_API_KEY is empty in .env")
        failures += 1
    else:
        for lang, text in SAMPLES.items():
            try:
                t0 = time.perf_counter()
                audio = await speech.synthesize(text, lang, sample_rate=16000)
                path = out_dir / f"check_{lang}.wav"
                path.write_bytes(audio)
                ok(f"TTS {lang}: {len(audio) // 1024} KB in {time.perf_counter() - t0:.2f}s -> {path.relative_to(ROOT)}")
            except speech.SpeechError as exc:
                fail(f"TTS {lang}: {exc}")
                failures += 1
                continue
            try:
                t0 = time.perf_counter()
                result = await speech.transcribe(audio, f"check_{lang}.wav", language_code=f"{lang},en-IN")
                ok(f"STT {lang} in {time.perf_counter() - t0:.2f}s: \"{result.get('transcript')}\" "
                   f"(detected {result.get('detected_language_code')})")
            except speech.SpeechError as exc:
                fail(f"STT {lang}: {exc}")
                failures += 1

    print(f"\n3. Gemini ({s.gemini_model})")
    if not s.gemini_api_key:
        fail("GEMINI_API_KEY is empty in .env")
        failures += 1
    else:
        try:
            t0 = time.perf_counter()
            result = await llm.complete_json('Return JSON {"ok": true, "greeting": "<namaste in Tamil script>"}')
            ok(f"{result} in {time.perf_counter() - t0:.2f}s")
        except llm.LLMError as exc:
            fail(str(exc))
            failures += 1
            try:
                from google import genai

                names = [m.name for m in genai.Client(api_key=s.gemini_api_key).models.list() if "flash" in m.name]
                print("     Available flash models:", ", ".join(names[:10]), "(set GEMINI_MODEL in .env)")
            except Exception as exc2:  # noqa: BLE001
                print("     Could not list models:", exc2)

    print("\nAll good! 🎉" if failures == 0 else f"\n{failures} check(s) failed.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
