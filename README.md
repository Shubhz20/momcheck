# MomCheck

**A voice assistant that follows up with pregnant women and new mothers in 10 Indian languages, and alerts the ASHA worker the moment something is wrong.**

**Live:** <https://momcheck.onrender.com> (pick a demo ASHA, no sign-up) · **One-page pitch:** [docs/PITCH.md](docs/PITCH.md) · Built on **Gnani AI** Prisma STT, Timbre TTS and voice cloning

An ASHA worker looks after every pregnant woman and newborn in her village. Following up with each of them means walking door to door or making calls from her own phone, often in a language that isn't the mother's. When a danger sign is missed, the referral comes late.

## What it does

- **Follow-up conversations in her language.** MomCheck checks on her and her baby, one question at a time, using the government's danger-sign checklist (MCP card; Home-Based Newborn Care after birth, plus a gentle mood check).
- **Red / Amber triage.** Every danger sign is graded. For a red sign she is told to go to the ASHA's named hospital now (108/102 free ambulance), and the ASHA gets an **action card** with the next steps and her ANM. A **live checklist and risk meter** fill in as the conversation runs, with English subtitles.
- **In the ASHA's own voice.** The ASHA reads a short consent passage once; **Gnani voice cloning** then speaks to her women in her voice, in any of the 10 languages. MomCheck always says it is an automated assistant.
- **Interpreter for home visits.** The ASHA speaks her language; the mother hears hers, in the ASHA's voice, and her reply comes back translated. Danger signs still raise alerts.
- **Ask MomCheck.** Each mother gets a personal link or QR code to talk to MomCheck whenever she's worried. No app or sign-in, and her ASHA is alerted to danger signs.
- **For the ASHA:** spoken visit notes, a spoken daily briefing (kept day by day), a map of her women by risk, and a 7-day impact panel.

> **Safety:** MomCheck screens and escalates. It never diagnoses or prescribes, and every danger sign goes to a human health worker. All names and numbers in this project are synthetic.

## How it works

**Who uses what.** The dashboard is for the ASHA worker. Each ASHA has her own account and sees only the women she looks after. Mothers never see the dashboard: MomCheck talks with them by phone call, or on their own Ask MomCheck page (`/m/<token>`, public, shows only her first name).

**Two ways to place a call**
- **Call her phone**: a real phone call through Twilio. Twilio streams the call audio (8 kHz) to our server over a WebSocket, and MomCheck's replies are streamed back into the call. The ASHA watches the conversation live on her dashboard and can hang up. This needs an **upgraded** Twilio account, because Twilio's free trial blocks live call audio (`<Stream>`), so it is switched off in the hosted demo (`PHONE_CALLS=on` turns it on). It was tested end to end with a simulated Twilio media stream.
- **Browser call**: the same conversation in the browser, where you speak as the mother. Anyone can try this in the demo accounts, at no cost. A phone-line mode squeezes the microphone audio to 8 kHz with background noise to imitate a real call.

**Try it:** open the app and pick a demo ASHA: **Meena Kumari**, a rural ASHA in Barabanki (UP) whose women speak Hindi, or **Savita Jadhav**, an urban ASHA in Pune whose ward has migrant families speaking nine different languages.

MomCheck's voice conversation is our own agent loop, built on Gnani AI's speech models:

```
 her voice ──▶ [her phone via Twilio, 8 kHz | browser + phone-line sim] ──▶ Gnani Prisma STT (prisma-v3.0, her language + English)
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
| **Timbre TTS** (REST, `timbre-v3.0`, voice *Chetana*) | MomCheck's spoken replies in all 10 languages (8 kHz mu-law straight into phone calls), the interpreter's voice, and the ASHA's daily briefing |
| **Voice cloning** (`/api/v1/tts/voice-clone/embeddings`, then `vachana-vc-v1`) | The ASHA's own voice for calls and the interpreter. One sample in her language speaks all 10 languages. Her consent passage is checked with Prisma before the voice is made |

**Gemini** (Google) does the reasoning: the conversation and the safety checklist, the end-of-call review, translation for the interpreter, extracting fields from voice notes, and writing the briefing.

The danger signs, their urgency (red/amber) and the checklist per stage live in [`backend/app/protocol.py`](backend/app/protocol.py).

### Languages
Hindi · English/Hinglish · Bengali · Gujarati · Kannada · Malayalam · Marathi · Punjabi · Tamil · Telugu

### Noisy phone lines
The call screen has a **phone-line mode**. It downsamples the microphone audio to 8 kHz, band-limits it to 300–3400 Hz and mixes in background noise before sending it to Prisma. [`eval/noise_eval.py`](eval/noise_eval.py) measures this across all 10 languages (30 synthetic replies, 8 kHz G.711 µ-law, street noise from 20 to 0 dB SNR):

| Condition | Character error | Danger sign detected |
|---|---|---|
| Clean 16 kHz | 6.8% | 100% |
| Phone line 8 kHz | 7.3% | 100% |
| + street noise 10 dB SNR | 7.3% | 100% |
| + street noise 5 dB SNR | 11.4% | 100% |
| + street noise 0 dB SNR | 28.3% | 83% |

Full results in [`eval/REPORT.md`](eval/REPORT.md) and on the app's "How well it hears" page.

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

Open http://localhost:5173, choose a demo ASHA account, open any woman's profile and start a follow-up call. Real phone calls need the Twilio keys in `.env` and a public https deployment, because Twilio has to reach the app.

## Deploy (free)

The `Dockerfile` builds the dashboard and serves it from the API, so the whole app runs as one service. `render.yaml` deploys it to Render's free tier. Use a free Neon Postgres database for `DATABASE_URL`. For phone calls, add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` in the Render dashboard.

## Project layout

```
backend/app/        FastAPI app
  auth.py           ASHA accounts: PIN sign-in, session cookie
  telephony.py      real phone calls: Twilio dialling, media-stream WebSocket, end-of-speech detection
  seed.py           demo ASHA accounts and their women
  gnani/speech.py   Gnani Prisma STT, Timbre TTS and voice cloning client
  services/calls.py the voice agent loop (STT -> Gemini -> TTS), alerts, call review
  services/notes.py ASHA voice notes
  services/briefing.py spoken daily briefing
  protocol.py       danger signs (red/amber), the checklist per stage, triage
  prompts.py        agent instructions, greetings in 10 languages, interpreter and review prompts
  demo_history.py   a week of synthetic history for the demo accounts
frontend/           React dashboard (Vite + Tailwind)
eval/               noise robustness evaluation
scripts/            key checks
docs/API.md         API contract
```
