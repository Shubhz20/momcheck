# MomCheck: Backend API

All routes are under `/api` and use JSON unless noted. Dates are `YYYY-MM-DD`; timestamps are ISO 8601 UTC.

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
  status: "in_progress" | "completed" | "abandoned";
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
| GET | `/api/health` | | `{ ok: true; commit: string }`: `commit` is the deployed git commit (`local` in development) |
| GET | `/api/dashboard` | | `Dashboard` |
| GET | `/api/languages` | | `Language[]` |
| GET | `/api/beneficiaries` | `?q=&language=&category=` | `Beneficiary[]` |
| POST | `/api/beneficiaries` | name, phone, language, village, category, edd?, delivery_date?, next_visit_date?, next_visit_type?, notes? | `Beneficiary` |
| GET | `/api/beneficiaries/{id}` | | `Beneficiary & { calls: Call[]; notes: Note[]; alerts: Alert[] }` |
| PATCH | `/api/beneficiaries/{id}` | any POST field | `Beneficiary` |
| DELETE | `/api/beneficiaries/{id}` | | `{ ok: true }` |
| POST | `/api/beneficiaries/{id}/call` | | `{ call: Call; reply: TurnReply }`: starts a voice call, `reply` is MomCheck's spoken greeting |
| GET | `/api/calls/{id}` | | `Call` |
| POST | `/api/calls/{id}/turn` | multipart: `audio` (WAV mono, 8 or 16 kHz, ≤ 30 s), `phone_line` (`"true"`/`"false"`) | `TurnReply` |
| POST | `/api/calls/{id}/end` | | `Call` (analysed: outcome, danger signs, summary; alerts created) |
| GET | `/api/calls` | `?beneficiary_id=&limit=` | `Call[]` |
| GET | `/api/alerts` | `?status=open` | `Alert[]` |
| POST | `/api/alerts/{id}/ack` | | `Alert` |
| POST | `/api/notes/draft` | multipart: `audio` (WAV, 16 kHz mono, ≤ 30 s), `language?` | `NoteDraft` |
| POST | `/api/notes` | `NoteDraft` | `Note` |
| GET | `/api/briefing` | `?language=hi-IN` | `{ text: string; language: LanguageCode }` |
| GET | `/api/briefing/audio` | `?language=hi-IN` | `audio/wav` |
| POST | `/api/demo/seed` | | `{ created: number }`: adds sample beneficiaries if none exist |

Errors are returned as `{ "detail": "human readable message" }` with a 4xx or 5xx status.
