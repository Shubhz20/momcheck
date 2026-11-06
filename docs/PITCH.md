# MomCheck: solution pitch

**Voice follow-up for every pregnant woman and new mother, in her own language, with her ASHA worker in the loop.**
Live app: <https://momcheck.onrender.com> (open a demo ASHA, no sign-up) · Code: <https://github.com/Shubhz20/momcheck> · **One-page PDF: [MomCheck-Pitch.pdf](MomCheck-Pitch.pdf)**

## The problem
Mothers die in India mostly from delays: in recognising a danger sign, reaching care, and getting care. The person meant to catch the first delay is the ASHA worker. She looks after every pregnant woman and newborn in her village, mostly on foot, often in a language that isn't the mother's own (urban wards have migrant families from all over India). She cannot ask every woman about every danger sign every week.

## What MomCheck does
- **Follow-up conversations in 10 Indian languages**, code-mixed speech included. MomCheck works through the government's danger-sign checklist (MCP card, plus Home-Based Newborn Care after birth, plus a gentle two-question mood check) one question at a time.
- **Red / Amber triage and an action card.** Each danger sign is graded. For a red sign MomCheck tells her to go to *her* named hospital now (108/102 free ambulance), and the ASHA instantly gets the steps: call her, the hospital, and her ANM. The ASHA watches a **live checklist and risk meter** while the conversation runs.
- **The ASHA's own voice.** She reads a short consent passage once, and **Gnani voice cloning** lets MomCheck speak to her women in her voice, in any of the 10 languages. Women pick up a voice they trust. MomCheck always says it is an automated assistant.
- **Interpreter for home visits.** The ASHA speaks Marathi; the Tamil mother hears Tamil in the ASHA's voice. Her reply comes back in Marathi, and danger signs still raise alerts.
- **Ask MomCheck.** Every mother gets a personal link or QR code. When she is worried she opens it on any phone browser and asks in her language, and her ASHA hears about any danger sign.
- **For the ASHA:** spoken visit notes become records, a spoken daily briefing is kept day by day, and a map of her women by risk sits beside a 7-day impact panel (calls, mothers reached, danger signs caught, minutes to act).

## Gnani AI technology
| Model | How MomCheck uses it |
|---|---|
| **Prisma STT** `prisma-v3.0` | Every turn, the interpreter, voice notes and the consent check. Language pairs (her language + English) for code-mixed speech; key terms (her name, village, PHC, IFA) and a topic hint |
| **Timbre TTS** `timbre-v3.0` | MomCheck's voice in 10 languages, the daily briefing, and 8 kHz audio for phone lines |
| **Voice cloning** `vachana-vc-v1` | The ASHA's own voice, made from one Hindi or Marathi sample, speaking Tamil, Bengali and every other language |

Gemini does the reasoning (what to say next, grading, translation, summaries). The conversation loop is our own: Prisma → Gemini → Timbre or the cloned voice.

## Evidence: noisy phone lines
30 synthetic replies in 10 languages, spoken by Timbre, squeezed to an 8 kHz µ-law phone line with street noise, transcribed by Prisma:
**100% of danger signs detected down to 5 dB SNR**, with about 7% character error up to 10 dB. At 0 dB, where noise is as loud as her voice, 83% were detected ([eval/REPORT.md](../eval/REPORT.md)). Prisma writes Hinglish naturally ("मुझे थोड़ा bleeding हो रहा है").

## Safety and responsibility
It screens and escalates, never diagnoses or prescribes. The protocol comes from MCP/HBNC guidance. Voice cloning needs the ASHA's read-aloud consent, which Prisma checks against the passage, and she can delete her voice at any time. If someone else answers a shared phone, MomCheck mentions nothing about her health. A mother's link reveals only her first name. All data in the demo is synthetic.

## Status and next steps
A working web app, deployed on free infrastructure. Real phone calls (Twilio Media Streams, 8 kHz µ-law, voice-activity detection) are built and tested against a simulated stream; they need a paid telephony account to switch on. Next: Gnani streaming APIs to cut reply time from about 4 s, a pilot with real ASHAs, and an ANM supervisor view.
