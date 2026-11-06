# MomCheck

**A voice assistant that follows up with pregnant women and new mothers in 10 Indian languages, and alerts the ASHA worker the moment something is wrong.**

An ASHA worker looks after every pregnant woman and newborn in her village. Following up with each of them means walking door to door or making calls from her own phone. When a danger sign is missed, the referral comes late.

MomCheck takes over the routine follow-up conversation. In the woman's own language, MomCheck:

- greets her by name and checks on her and her baby,
- asks the standard danger-sign questions from the Mother and Child Protection card (bleeding, swelling, severe headache, fever, reduced baby movement and others), one at a time,
- reminds her of her next check-up and answers common questions,
- **raises an alert for the ASHA during the call** if she reports a danger sign.

When the call ends, the ASHA sees an English summary, the outcome and the full transcript on her dashboard. She can also record a spoken note after a home visit, and it is saved as a structured record. Each morning she gets a **spoken briefing** in her own language.

> **Safety:** MomCheck screens and escalates. It never diagnoses or prescribes, and every danger sign goes to a human health worker. All names and numbers in this project are synthetic.

## How it works

MomCheck's voice conversation is our own agent loop, built on Gnani AI's speech models:

```
 her voice ──▶ [Phone-line simulation: 8 kHz, noise] ──▶ Gnani Prisma STT (prisma-v3.0, her language + English)
                                                                │ text
                                                                ▼
                    Gemini: decides the next question, spots danger signs ──▶ alert to ASHA (live)
                                                                │ reply text
                                                                ▼
 her phone ◀── Gnani Timbre TTS (timbre-v3.0, voice "Chetana", 8 kHz on phone lines)
```

| Gnani AI technology | Used for |
|---|---|
| **Prisma STT** (REST, `prisma-v3.0`) | Every turn of the conversation; a language pair (her language plus English) handles code-mixed speech like Hinglish and Tanglish; key terms (her name, village, "PHC") improve accuracy; also used for the ASHA's voice notes |
| **Timbre TTS** (REST, `timbre-v3.0`, voice *Chetana*) | MomCheck's spoken replies in all 10 languages, plus the ASHA's daily briefing |

**Gemini** (Google) does the reasoning: the conversation, the end-of-call review, extracting fields from voice notes, and writing the briefing.

### Languages
Hindi · English/Hinglish · Bengali · Gujarati · Kannada · Malayalam · Marathi · Punjabi · Tamil · Telugu

### Noisy phone lines
The call screen has a **phone-line mode**. It downsamples the microphone audio to 8 kHz, band-limits it to 300–3400 Hz and mixes in background noise before sending it to Prisma, so we can see how MomCheck copes with real-world call quality. [`eval/noise_eval.py`](eval/noise_eval.py) measures this systematically across all 10 languages; results are in [`eval/REPORT.md`](eval/REPORT.md).

## Run locally

Requires Python 3.10+ and Node 18+.

```bash
cp .env.example .env          # add GNANI_SPEECH_API_KEY and GEMINI_API_KEY
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
.venv/bin/python scripts/check_keys.py           # real round trip: Timbre -> Prisma -> Gemini

# API on :8000
cd backend && ../.venv/bin/uvicorn app.main:app --reload --port 8000
# Dashboard on :5173 (in another terminal)
cd frontend && npm install && npm run dev
```

Open http://localhost:5173, click **Load demo data**, open any woman's profile and start a follow-up call.

## Deploy (free)

The `Dockerfile` builds the dashboard and serves it from the API, so the whole app runs as one service. `render.yaml` deploys it to Render's free tier. Use a free Neon Postgres database for `DATABASE_URL`.

## Project layout

```
backend/app/        FastAPI app
  gnani/speech.py   Gnani Prisma STT + Timbre TTS client
  services/calls.py the voice agent loop (STT -> Gemini -> TTS), alerts, call review
  services/notes.py ASHA voice notes
  services/briefing.py spoken daily briefing
  prompts.py        agent instructions, danger signs, greetings in 10 languages
frontend/           React dashboard (Vite + Tailwind)
eval/               noise robustness evaluation
scripts/            key checks
docs/API.md         API contract
```
