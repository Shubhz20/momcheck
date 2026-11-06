# Janani Saathi: Dashboard

React 18 + TypeScript + Vite + Tailwind CSS v4. Built against [`../docs/API.md`](../docs/API.md).

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api to http://localhost:8000
npm run build    # type-checks, then writes dist/ (served by FastAPI at /)
```

## Structure

```
src/
  api/          types.ts (API contract) · client.ts (fetch wrapper)
  audio/        recorder.ts (mic → PCM) · vad.ts (energy VAD) · phoneLine.ts (8 kHz noisy-line simulator)
                wav.ts (WAV encode, resample) · player.ts (Janani's voice playback, mobile unlock)
  components/   layout, cards, badges, modal, toast, form
  hooks/        useAsync · useRecorder (voice notes) · useLanguages
  pages/        Dashboard · Beneficiaries · BeneficiaryDetail · CallScreen · VoiceNote · Briefing
```

## The call screen (`/call/:callId`)

1. **Start follow-up call** (on a woman's profile) calls `POST /api/beneficiaries/{id}/call` and opens the call screen, which plays Janani's greeting.
2. After Janani finishes speaking, the mic listens. The VAD starts on speech and stops after about 1.2 s of silence (25 s max). **Tap to talk / Done** is a manual fallback, and Mute pauses listening. Nothing is recorded while Janani is speaking, which avoids echo.
3. Each utterance is encoded as WAV and sent to `POST /api/calls/{id}/turn`. The reply's text, audio and per-stage latency (Prisma STT · Gemini · Timbre TTS) appear in the transcript.
4. When `alert_raised` is set, a red "Danger sign detected: ASHA alerted" banner appears. On `end_call` or hang-up, the app calls `POST /api/calls/{id}/end` and shows the result.

**Phone-line mode** (on by default) mixes procedural background noise into the recording (Low / Market / Very noisy). It then band-limits the audio to 300–3400 Hz, resamples it to 8 kHz and applies G.711 µ-law companding before upload (`phone_line=true`). With it off, the app sends clean 16 kHz WAV.

The microphone needs HTTPS (or `localhost`).
