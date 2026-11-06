"""Noise robustness evaluation for Janani Saathi (synthetic data only).

For each language, scripted replies a woman might give on a follow-up call are spoken by Gnani Timbre TTS,
degraded to phone-line quality (8 kHz band 300-3400 Hz, G.711 mu-law codec) plus background noise at several
SNRs, transcribed by Gnani Prisma STT, and checked with Gemini for the danger sign.

    .venv/bin/pip install -r eval/requirements.txt
    .venv/bin/python eval/noise_eval.py                # all 10 languages
    .venv/bin/python eval/noise_eval.py --langs hi-IN ta-IN --snrs 10 0

Writes eval/output/results.json and eval/REPORT.md.
"""
from __future__ import annotations

import argparse
import asyncio
import io
import json
import re
import sys
import time
import unicodedata
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import llm  # noqa: E402
from app.gnani import speech  # noqa: E402
from app.languages import language_name  # noqa: E402

SR = 16000
SWELL = "Sudden swelling of face, hands or feet"
MOVE = "Baby moving less than usual or not moving"
BLEED = "Bleeding from the vagina"
FEVER = "High fever"
HEAD = "Severe headache, blurred vision or dizziness"

# (reference text, expected danger sign or None). Synthetic replies, no real people.
UTTERANCES: dict[str, list[tuple[str, str | None]]] = {
    "hi-IN": [("हाँ दीदी, दो दिन से मेरे पैरों और चेहरे पर बहुत सूजन है।", SWELL),
              ("कल रात से बच्चा पेट में कम हिल रहा है।", MOVE),
              ("नहीं, मैं ठीक हूँ, आयरन की गोली रोज़ ले रही हूँ।", None)],
    "en-IN": [("Haan didi, since morning I have a bad headache and my vision is blurry.", HEAD),
              ("Mujhe thoda bleeding ho raha hai since last night.", BLEED),
              ("I am fine, next week checkup ke liye PHC jaungi.", None)],
    "mr-IN": [("हो ताई, दोन दिवसांपासून माझ्या पायांना खूप सूज आली आहे.", SWELL),
              ("काल रात्रीपासून मला ताप आहे आणि अंग दुखतंय.", FEVER),
              ("नाही, मी बरी आहे, रोज लोहाची गोळी घेते.", None)],
    "bn-IN": [("হ্যাঁ দিদি, দুদিন ধরে আমার পা আর মুখ খুব ফুলে গেছে।", SWELL),
              ("কাল রাত থেকে বাচ্চা পেটে কম নড়ছে।", MOVE),
              ("না, আমি ভালো আছি, রোজ আয়রন ট্যাবলেট খাচ্ছি।", None)],
    "ta-IN": [("ஆமாம் அக்கா, இரண்டு நாளாக என் கால் மற்றும் முகம் ரொம்ப வீங்கி இருக்கு.", SWELL),
              ("நேற்று இரவிலிருந்து கொஞ்சம் ரத்தப்போக்கு இருக்கு.", BLEED),
              ("இல்லை, நான் நன்றாக இருக்கிறேன், தினமும் இரும்புச்சத்து மாத்திரை சாப்பிடுகிறேன்.", None)],
    "te-IN": [("అవును అక్కా, రెండు రోజులుగా నా కాళ్ళు, ముఖం బాగా వాచాయి.", SWELL),
              ("నిన్న రాత్రి నుండి తలనొప్పి చాలా ఎక్కువగా ఉంది, కళ్ళు మసకగా కనిపిస్తున్నాయి.", HEAD),
              ("లేదు, నేను బాగానే ఉన్నాను, రోజూ ఐరన్ మాత్ర వేసుకుంటున్నాను.", None)],
    "kn-IN": [("ಹೌದು ಅಕ್ಕ, ಎರಡು ದಿನದಿಂದ ನನ್ನ ಕಾಲು ಮತ್ತು ಮುಖ ತುಂಬಾ ಊದಿಕೊಂಡಿದೆ.", SWELL),
              ("ನಿನ್ನೆ ರಾತ್ರಿಯಿಂದ ಮಗು ಹೊಟ್ಟೆಯಲ್ಲಿ ಕಡಿಮೆ ಆಡುತ್ತಿದೆ.", MOVE),
              ("ಇಲ್ಲ, ನಾನು ಚೆನ್ನಾಗಿದ್ದೇನೆ, ಪ್ರತಿದಿನ ಕಬ್ಬಿಣದ ಮಾತ್ರೆ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದ್ದೇನೆ.", None)],
    "ml-IN": [("അതെ ചേച്ചി, രണ്ടു ദിവസമായി എന്റെ കാലും മുഖവും നന്നായി നീര് വച്ചിട്ടുണ്ട്.", SWELL),
              ("ഇന്നലെ രാത്രി മുതൽ എനിക്ക് നല്ല പനിയുണ്ട്.", FEVER),
              ("ഇല്ല, എനിക്ക് സുഖമാണ്, ദിവസവും അയൺ ഗുളിക കഴിക്കുന്നുണ്ട്.", None)],
    "gu-IN": [("હા બેન, બે દિવસથી મારા પગ અને મોઢા પર બહુ સોજો છે.", SWELL),
              ("ગઈ રાતથી મને થોડું લોહી પડે છે.", BLEED),
              ("ના, હું સારી છું, રોજ આયર્નની ગોળી લઉં છું.", None)],
    "pa-IN": [("ਹਾਂ ਦੀਦੀ, ਦੋ ਦਿਨਾਂ ਤੋਂ ਮੇਰੇ ਪੈਰਾਂ ਤੇ ਮੂੰਹ ਤੇ ਬਹੁਤ ਸੋਜ ਹੈ।", SWELL),
              ("ਕੱਲ੍ਹ ਰਾਤ ਤੋਂ ਬੱਚਾ ਢਿੱਡ ਵਿੱਚ ਘੱਟ ਹਿਲ ਰਿਹਾ ਹੈ।", MOVE),
              ("ਨਹੀਂ, ਮੈਂ ਠੀਕ ਹਾਂ, ਰੋਜ਼ ਆਇਰਨ ਦੀ ਗੋਲੀ ਲੈਂਦੀ ਹਾਂ।", None)],
}
ALL_SIGNS = [SWELL, MOVE, BLEED, FEVER, HEAD]


# ---------------------------------------------------------------- audio utils
def wav_to_array(data: bytes) -> np.ndarray:
    with wave.open(io.BytesIO(data)) as w:
        assert w.getsampwidth() == 2 and w.getnchannels() == 1, "expected 16-bit mono"
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    if sr != SR:
        x = np.interp(np.linspace(0, len(x), int(len(x) * SR / sr), endpoint=False), np.arange(len(x)), x)
    return x


def array_to_wav(x: np.ndarray, sr: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
    return buf.getvalue()


def bandpass(x: np.ndarray, sr: int, lo: float, hi: float) -> np.ndarray:
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / sr)
    spec[(freqs < lo) | (freqs > hi)] = 0
    return np.fft.irfft(spec, n=len(x)).astype(np.float32)


def mulaw(x: np.ndarray, mu: float = 255.0) -> np.ndarray:
    """G.711 mu-law encode + decode (8-bit), as on a phone line."""
    y = np.sign(x) * np.log1p(mu * np.abs(np.clip(x, -1, 1))) / np.log1p(mu)
    q = np.round((y + 1) / 2 * 255) / 255 * 2 - 1
    return (np.sign(q) * (np.expm1(np.abs(q) * np.log1p(mu)) / mu)).astype(np.float32)


def street_noise(n: int, rng: np.random.Generator) -> np.ndarray:
    """Procedural 'busy street / market' noise: pink noise + low rumble + random horn-like tones and clatter."""
    white = rng.standard_normal(n)
    spec = np.fft.rfft(white)
    f = np.fft.rfftfreq(n, 1 / SR)
    spec[1:] /= np.sqrt(f[1:])  # pink
    pink = np.fft.irfft(spec, n=n)
    t = np.arange(n) / SR
    rumble = 0.6 * np.sin(2 * np.pi * 55 * t) * (1 + 0.5 * np.sin(2 * np.pi * 0.3 * t))
    noise = pink / (np.std(pink) + 1e-9) + 0.3 * rumble
    for _ in range(max(1, n // SR)):  # bursts: horns / utensils
        start = rng.integers(0, max(1, n - SR // 3))
        length = int(rng.integers(SR // 20, SR // 3))
        tone = np.sin(2 * np.pi * rng.uniform(300, 900) * t[:length]) * np.hanning(length)
        noise[start : start + length] += 1.5 * tone
    return (noise / (np.std(noise) + 1e-9)).astype(np.float32)


def degrade(x: np.ndarray, snr_db: float | None, rng: np.random.Generator) -> tuple[bytes, int]:
    """Returns (wav bytes, sample rate). snr_db=None -> phone line without added noise."""
    if snr_db is not None:
        noise = street_noise(len(x), rng)
        sp = np.sqrt(np.mean(x**2)) + 1e-9
        x = x + noise * sp / (10 ** (snr_db / 20))
        x = x / max(1.0, np.max(np.abs(x)))
    x = bandpass(x, SR, 300, 3400)[::2]  # 16 kHz -> 8 kHz
    return array_to_wav(mulaw(x), 8000), 8000


# ---------------------------------------------------------------- metrics
def normalise(text: str) -> str:
    text = unicodedata.normalize("NFC", text.lower())
    text = re.sub(r"[^\w\s]", " ", text)  # drop punctuation incl. danda
    return re.sub(r"\s+", " ", text).strip()


def cer(ref: str, hyp: str) -> float:
    r, h = normalise(ref), normalise(hyp)
    if not r:
        return 0.0
    prev = list(range(len(h) + 1))
    for i, rc in enumerate(r, 1):
        cur = [i]
        for j, hc in enumerate(h, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rc != hc)))
        prev = cur
    return prev[-1] / len(r)


async def detect_signs(texts: list[str]) -> list[str | None]:
    prompt = (
        "Each line below is what a pregnant woman said on a follow-up phone call (transcribed from a noisy line; "
        "any Indian language). For each line, return the ONE danger sign she reports from this list, or null:\n"
        + "\n".join(f"- {s}" for s in ALL_SIGNS)
        + "\n\nLines:\n"
        + "\n".join(f"{i}: {t or '(empty)'}" for i, t in enumerate(texts))
        + '\n\nReturn JSON: {"answers": [<label or null>, ...]} with one entry per line, in order.'
    )
    result = await llm.complete_json(prompt, temperature=0)
    answers = result.get("answers") or []
    return [(a if a in ALL_SIGNS else None) for a in answers] + [None] * (len(texts) - len(answers))


# ---------------------------------------------------------------- main
async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", nargs="*", default=list(UTTERANCES))
    ap.add_argument("--snrs", nargs="*", type=float, default=[20, 10, 5, 0])
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    rng = np.random.default_rng(args.seed)
    out_dir = ROOT / "eval" / "output"
    (out_dir / "audio").mkdir(parents=True, exist_ok=True)

    conditions: list[tuple[str, float | None, bool]] = [("Clean (16 kHz)", None, False), ("Phone line (8 kHz, µ-law)", None, True)]
    conditions += [(f"Phone line + street noise {snr:g} dB SNR", snr, True) for snr in args.snrs]

    rows = []
    for lang in args.langs:
        for idx, (ref, sign) in enumerate(UTTERANCES[lang]):
            clean_wav = await speech.synthesize(ref, lang, sample_rate=SR)
            x = wav_to_array(clean_wav)
            for cname, snr, phone in conditions:
                if phone:
                    wav, _ = degrade(x, snr, rng)
                else:
                    wav = array_to_wav(x, SR)
                tag = f"{lang}_{idx}_{'clean' if not phone else ('phone' if snr is None else f'snr{snr:g}')}"
                (out_dir / "audio" / f"{tag}.wav").write_bytes(wav)
                t0 = time.perf_counter()
                stt = await speech.transcribe(wav, f"{tag}.wav", language_code=f"{lang},en-IN" if lang != "en-IN" else "en-IN,hi-IN")
                hyp = stt.get("transcript") or ""
                rows.append({"lang": lang, "idx": idx, "condition": cname, "ref": ref, "hyp": hyp,
                             "cer": round(cer(ref, hyp), 4), "expected_sign": sign,
                             "stt_ms": int((time.perf_counter() - t0) * 1000)})
                print(f"{lang} #{idx} {cname:<38} CER {rows[-1]['cer']:.2f}  {hyp[:60]}")

    # danger-sign detection, one Gemini call per condition
    for cname, _, _ in conditions:
        subset = [r for r in rows if r["condition"] == cname]
        preds = await detect_signs([r["hyp"] for r in subset])
        for r, p in zip(subset, preds):
            r["detected_sign"] = p
            r["sign_correct"] = p == r["expected_sign"]

    (out_dir / "results.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    write_report(rows, [c[0] for c in conditions], args.langs)
    print("\nWrote eval/REPORT.md and eval/output/results.json")


def write_report(rows: list[dict], conditions: list[str], langs: list[str]) -> None:
    def avg(xs):
        return sum(xs) / len(xs) if xs else float("nan")

    lines = [
        "# Noise robustness: Gnani Prisma STT on phone-line audio",
        "",
        "Synthetic replies a woman might give on a follow-up call (3 per language) were spoken by **Gnani Timbre TTS**, "
        "degraded to phone-line quality (8 kHz, 300–3400 Hz band, G.711 µ-law) with procedural street/market noise "
        "at several SNRs, transcribed by **Gnani Prisma STT** (`prisma-v3.0`), and checked by Gemini for the danger sign.",
        "",
        "| Condition | Avg CER ↓ | Danger sign detected correctly ↑ |",
        "|---|---|---|",
    ]
    for c in conditions:
        sub = [r for r in rows if r["condition"] == c]
        lines.append(f"| {c} | {avg([r['cer'] for r in sub]):.1%} | {avg([r['sign_correct'] for r in sub]):.0%} ({sum(r['sign_correct'] for r in sub)}/{len(sub)}) |")
    lines += ["", "## Character error rate by language", "", "| Language | " + " | ".join(conditions) + " |", "|---|" + "---|" * len(conditions)]
    for lang in langs:
        cells = [f"{avg([r['cer'] for r in rows if r['lang'] == lang and r['condition'] == c]):.1%}" for c in conditions]
        lines.append(f"| {language_name(lang)} | " + " | ".join(cells) + " |")
    lines += ["", "CER = character edit distance / reference length, after removing punctuation. Text-to-speech audio is cleaner than real speech, so real calls will score worse; the trend across noise levels is what this measures.", ""]
    (ROOT / "eval" / "REPORT.md").write_text("\n".join(lines))


if __name__ == "__main__":
    asyncio.run(main())
