# Janani Saathi: Build Plan

## Users

- **ASHA worker:** follows up with pregnant women and new mothers. She uses the dashboard, records voice notes and listens to the daily briefing.
- **Beneficiary:** a pregnant woman or new mother. She talks to Janani in her own language.
- **PHC supervisor:** reads call summaries and danger-sign alerts.

## Core flows

1. **Follow-up call.** This is a voice conversation run by our own agent loop: Prisma STT, then Gemini, then Timbre TTS. Janani greets her by name, screens for danger signs one question at a time, reminds her of the next visit and answers common doubts. A danger sign raises an alert during the call. When the call ends, the transcript is reviewed to set the outcome (`DANGER_SIGN`, `ROUTINE`, `CALLBACK`, `NOT_REACHABLE`) and write an English summary.
2. **Phone-line mode.** The call screen can degrade the audio to 8 kHz and add background noise, to show how the system copes with real call quality.
3. **ASHA voice notes.** She speaks a short note after a home visit. Prisma STT transcribes it (with automatic language detection), Gemini turns it into a structured record, she confirms it, and it is saved.
4. **Daily briefing.** A spoken summary in the ASHA's language, written by Gemini and spoken by Timbre TTS.

## Scope

Only the Gnani API platform (app.gnani.ai/voice) is used: Prisma STT and Timbre TTS. Agent Builder is outside the challenge's scope, so the conversation loop is our own. Gemini is the reasoning LLM, since Evon is not on the API platform before 10 November. All data is synthetic.

## Milestones

- [x] Backend: beneficiaries, voice agent loop, alerts, notes, briefing
- [x] Noise evaluation script
- [ ] Dashboard and call screen
- [ ] Key check with real APIs
- [ ] Deploy (live URL)
- [ ] Run the noise evaluation and publish the report
- [ ] Demo videos (1:30+ main, 60 s cut) and posts
