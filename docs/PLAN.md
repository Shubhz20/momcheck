# Janani Saathi: Build Plan

## Users

- **ASHA worker:** follows up with pregnant women and new mothers in her village. She uses the dashboard and records voice notes.
- **Beneficiary:** a pregnant woman or new mother. She receives the calls on any phone, including basic feature phones.
- **PHC supervisor:** reads call summaries and danger-sign alerts across ASHAs.

## Core flows

1. **Follow-up call.** The ASHA (or a schedule) triggers a call. The agent greets the woman by name and reminds her of her next ANC visit or vaccination. It asks the danger-sign screening questions and answers common doubts from the knowledge base. The call ends with an outcome tag: `DANGER_SIGN`, `ROUTINE`, `CALLBACK`, or `NOT_REACHABLE`.
2. **Post-call webhook.** The platform sends the transcript, detected language, and extracted answers. They are stored against the beneficiary. A `DANGER_SIGN` result raises an alert for the ASHA.
3. **ASHA voice notes.** She speaks a short note after a home visit. Prisma STT transcribes it, it is turned into a structured record (beneficiary, action, follow-up date), she confirms it, and it is saved.
4. **Daily briefing.** A spoken summary in the ASHA's language, generated with Timbre TTS: calls made, alerts, visits due today.
5. **Call summaries.** Recordings are transcribed and summarised for the supervisor view.

## Gnani stack

| Component | API |
|---|---|
| Voice agent | Agent Builder Platform API: Create Agent, Update Agent, FAQs, Trigger Call, Conversation Logs/Stats/Audio, post-call webhook |
| Speech to text | Prisma v2.5 / v3.0 (`mr-IN`, `hi-IN`, `en-IN`; `indic-auto` on v3.0): REST for voice notes, Batch for recordings |
| Text to speech | Timbre v2.5: REST/SSE for briefings |

## Architecture

```
ASHA dashboard (React) ──▶ FastAPI backend ──▶ Gnani Agent Builder ──▶ phone call to beneficiary
        ▲                     │   ▲                     │
        │                     │   └── post-call webhook ┘ (transcript, outcome, extraction)
        │                     ├──▶ Prisma STT  (voice notes, recordings)
        │                     ├──▶ Timbre TTS  (daily briefing)
        │                     ├──▶ LLM         (note extraction, summaries)
        └─────────────────────┴──▶ Postgres    (beneficiaries, calls, alerts, notes)
```

## Evaluation

We generate test utterances in Marathi, Hindi and Hinglish, add background noise at several SNR levels, and downsample to 8 kHz to simulate a phone line. Each variant goes through Prisma STT and the extraction step. We report WER and field-level accuracy.

## Milestones

- [ ] API probes: STT, TTS, Agent Builder
- [ ] Agent setup script (prompt, languages, FAQs, outcomes, webhook)
- [ ] Backend: beneficiaries, trigger call, webhook, alerts
- [ ] Dashboard
- [ ] Deploy (live URL)
- [ ] Voice notes
- [ ] Daily briefing
- [ ] Call summaries
- [ ] Noise evaluation
- [ ] Demo video and write-up
