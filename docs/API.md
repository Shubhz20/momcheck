# MomCheck: Backend API

All routes are under `/api` and use JSON unless noted. Dates are `YYYY-MM-DD`; timestamps are ISO 8601 UTC.

## Accounts

Each ASHA worker has an account and sees only her own women, calls, alerts and notes. Every route below except
`/api/health`, `/api/languages`, `/api/auth/*` (other than `me` and `reset-demo`) and the Twilio callbacks needs the
`mc_session` cookie set by a sign-in route, and returns `401` without it. Records of another ASHA return `404`.
Two **demo accounts** (no PIN, synthetic data) are created on startup: Meena Kumari (rural Barabanki, Hindi) and
Savita Jadhav (urban Pune ward, nine languages).

```ts
interface Me { id: number; name: string; phone: string; area: string; language: LanguageCode;
  is_demo: boolean; phone_calls: boolean }   // phone_calls: real phone calls are available to this account
interface DemoAccount { id: number; name: string; area: string; language: LanguageCode; women: number; languages: LanguageCode[] }
```

## Types

```ts
type LanguageCode = "hi-IN" | "en-IN" | "bn-IN" | "gu-IN" | "kn-IN" | "ml-IN" | "mr-IN" | "pa-IN" | "ta-IN" | "te-IN";

interface Language { code: LanguageCode; name: string; native: string; enabled: boolean } // all 10 are enabled

interface Beneficiary {
  id: number;
  name: string;
  phone: string;               // 10 digits, no country code
  language: LanguageCode;
  village: string;
  category: "pregnant" | "postnatal";
  edd: string | null;          // expected delivery date (pregnant)
  delivery_date: string | null;// (postnatal)
  weeks_pregnant: number | null;   // computed from edd
  days_since_delivery: number | null;
  next_visit_date: string | null;
  next_visit_type: string | null;  // e.g. "ANC check-up 3", "TT-2 injection", "PNC visit day 7"
  notes: string;
  risk: "normal" | "watch" | "high";  // high = open danger alert
  open_alerts: number;
  last_call: Call | null;
  created_at: string;
}

interface TranscriptTurn { role: "assistant" | "user"; content: string; language?: string | null }

interface Call {
  // A follow-up "call" is a live voice conversation run by our own agent loop:
  // Prisma STT (her speech -> text) -> Gemini (what to say next) -> Timbre TTS (reply audio).
  id: number;
  beneficiary_id: number;
  beneficiary_name: string;
  language: LanguageCode;
  status: "ringing" | "in_progress" | "completed" | "abandoned" | "not_answered" | "failed"; // ringing/not_answered/failed: phone calls only
  channel: "browser" | "phone";      // phone = her real phone rang (Twilio)
  outcome: "DANGER_SIGN" | "ROUTINE" | "CALLBACK" | "NOT_REACHABLE" | null;
  danger_signs: string[];      // English labels, e.g. "Sudden swelling of face, hands or feet"
  summary: string | null;      // English, 1-3 sentences (set when the call ends)
  transcript: TranscriptTurn[];
  phone_line: boolean;         // true if the audio was degraded to phone-line quality
  duration_sec: number | null;
  error: string | null;
  triggered_at: string;        // call start
  completed_at: string | null;
}

interface TurnReply {
  user_text: string | null;          // what Prisma heard (null for the opening greeting)
  detected_language: string | null;
  reply_text: string;                // what MomCheck says, in her language
  reply_audio: string;               // data URL, e.g. "data:audio/mpeg;base64,..." (Timbre TTS)
  end_call: boolean;                 // true when MomCheck has said goodbye -> client should POST /end
  alert_raised: boolean;             // true if a danger sign was detected in this turn (alert created)
  timings: { stt_ms: number | null; llm_ms: number; tts_ms: number };
}

interface Alert {
  id: number;
  beneficiary_id: number;
  beneficiary_name: string;
  phone: string;
  village: string;
  call_id: number | null;
  severity: "high" | "medium";
  reason: string;              // English, one line
  danger_signs: string[];
  status: "open" | "acknowledged";
  created_at: string;
}

interface Note {
  id: number;
  beneficiary_id: number | null;
  beneficiary_name: string | null;
  transcript: string;
  detected_language: string | null;
  action: string;              // what the ASHA did, English
  follow_up_date: string | null;
  summary: string;             // English one-liner
  created_at: string;
}

interface NoteDraft { transcript: string; detected_language: string | null; beneficiary_id: number | null;
  beneficiary_name: string | null; action: string; follow_up_date: string | null; summary: string }

interface Dashboard {
  totals: { beneficiaries: number; pregnant: number; postnatal: number };
  today: { calls: number; completed: number; danger: number };
  open_alerts: number;
  alerts: Alert[];             // open alerts, newest first
  visits_due: Beneficiary[];   // next_visit_date within the next 7 days (incl. overdue), soonest first
  recent_calls: Call[];        // latest 10
  languages: Language[];
}
```

## Endpoints

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/api/health` | | `{ ok: true; commit: string; phone_calls: boolean }`: `commit` is the deployed git commit (`local` in development); `phone_calls` is true when phone calls are switched on and Twilio is configured |
| GET | `/api/auth/demo-accounts` | | `DemoAccount[]` |
| POST | `/api/auth/demo` | `{ asha_id }` | `Me` (signs in to a demo account) |
| POST | `/api/auth/login` | `{ phone, pin }` | `Me`. `401` wrong phone/PIN, `429` after 5 wrong PINs (10 min) |
| POST | `/api/auth/signup` | `{ name, phone, area, language, pin }` (PIN 4–6 digits) | `Me`. `409` if the phone already has an account |
| POST | `/api/auth/logout` | | `{ ok: true }` |
| GET | `/api/auth/me` | | `Me` |
| POST | `/api/auth/reset-demo` | | `{ created: number }`: demo accounts only; restores the starting data |
| GET | `/api/dashboard` | | `Dashboard` (includes `impact`: the last 7 days, and `map`: her women with risk, and her facilities) |
| GET | `/api/languages` | | `Language[]` |
| GET | `/api/beneficiaries` | `?q=&language=&category=` | `Beneficiary[]` |
| POST | `/api/beneficiaries` | name, phone, language, village, category, edd?, delivery_date?, next_visit_date?, next_visit_type?, notes? | `Beneficiary` |
| GET | `/api/beneficiaries/{id}` | | `Beneficiary & { calls: Call[]; visit_notes: Note[]; alerts: Alert[] }` (`notes` stays the free-text field from her profile) |
| PATCH | `/api/beneficiaries/{id}` | any POST field | `Beneficiary` |
| DELETE | `/api/beneficiaries/{id}` | | `{ ok: true }` |
| POST | `/api/beneficiaries/{id}/call` | | `{ call: Call; reply: TurnReply }`: starts a voice call, `reply` is MomCheck's spoken greeting |
| POST | `/api/beneficiaries/{id}/phone-call` | | `Call` (status `ringing`, channel `phone`): rings her real phone through Twilio. `403` for demo accounts, `503` if phone calls are off (`PHONE_CALLS`) or Twilio isn't configured, `502` with a readable reason if Twilio refuses (e.g. number not verified on a trial account) |
| POST | `/api/calls/{id}/hangup` | | `Call`: ends a ringing or live phone call |
| GET | `/api/calls/{id}` | | `Call` (poll it to follow a live phone call; the transcript grows turn by turn) |
| POST | `/api/calls/{id}/turn` | multipart: `audio` (WAV mono, 8 or 16 kHz, ≤ 30 s), `phone_line` (`"true"`/`"false"`) | `TurnReply` |
| POST | `/api/calls/{id}/end` | | `Call` (analysed: outcome, danger signs, summary; alerts created) |
| GET | `/api/calls` | `?beneficiary_id=&limit=` | `Call[]` |
| GET | `/api/alerts` | `?status=open` | `Alert[]` |
| POST | `/api/alerts/{id}/ack` | | `Alert` |
| POST | `/api/notes/draft` | multipart: `audio` (WAV, 16 kHz mono, ≤ 30 s), `language?` | `NoteDraft` |
| POST | `/api/notes` | `NoteDraft` | `Note` |
| GET | `/api/notes` | `?limit=50` | `Note[]`: all her saved notes, newest first, including ones not linked to a woman |
| PATCH | `/api/notes/{id}` | `{ beneficiary_id: number \| null }` | `Note`: link the note to one of her women, or unlink it |
| DELETE | `/api/notes/{id}` | | `{ ok: true }` |
| GET | `/api/briefing` | `?language=hi-IN` | `{ text: string; language: LanguageCode; day: string }`. Also saved as that day's briefing (one per day and language; a newer one the same day replaces it) |
| GET | `/api/briefing/audio` | `?language=hi-IN` | `audio/wav` |
| GET | `/api/briefings` | `?limit=30` | `{ id, day, language, text, updated_at }[]`: her saved briefings, newest day first |
| GET | `/api/briefings/{id}/audio` | | `audio/wav`: a saved briefing, spoken again |
| GET | `/api/me/voice/script` | | `{ text, language }`: the consent passage she reads aloud |
| POST | `/api/me/voice` | multipart: `audio` (WAV 5–30 s), `consent` = `true` | `Me`. Prisma checks the recording matches the passage, then Gnani voice cloning makes her voice |
| POST | `/api/me/voice/preview` | `?language=ta-IN` | `{ text, audio }`: a sample greeting in her voice (MP3 data URL) |
| DELETE | `/api/me/voice` | | `Me` |
| PATCH | `/api/me` | `{ use_own_voice?, facilities? }` | `Me`. Facilities: `{ phc?, hospital?, anm? }`, each `{ name, phone }` |
| POST | `/api/beneficiaries/{id}/interpreter` | | `Call` (channel `interpreter`) |
| POST | `/api/calls/{id}/interpret` | multipart: `audio`, `speaker` = `asha` or `mother` | `InterpretTurn`: what was said, the translation, English, audio for the other side, live checklist |
| POST | `/api/beneficiaries/{id}/ask-link` | `?rotate=true` makes a new one | `{ token, path }`: her personal Ask MomCheck link |
| GET | `/api/ask/{token}` | public | `{ first_name, language, category, asha_name, asha_voice }` |
| POST | `/api/ask/{token}/start` | public | `{ call_id, reply_text, reply_audio }` (15 conversations per day per link) |
| POST | `/api/ask/{token}/calls/{id}/turn` | public, multipart `audio` | `{ user_text, reply_text, reply_audio, end_call, alert_raised, asha_told }` |
| POST | `/api/ask/{token}/calls/{id}/end` | public | `{ status, asha_told }` |
| POST | `/api/demo/seed` | | `{ created: number }`: adds sample women to the signed-in account if it has none |
| POST | `/api/twilio/status/{call_id}?token=` | Twilio status callback (form) | `204`. Marks unanswered / busy / failed calls |
| WS | `/api/twilio/stream` | Twilio Media Stream (bidirectional, 8 kHz mu-law) | The live phone conversation; the `start` message must carry the call's `call_id` and `token` |

Errors are returned as `{ "detail": "human readable message" }` with a 4xx or 5xx status.
