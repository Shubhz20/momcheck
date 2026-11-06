// Mirrors docs/API.md. Keep in sync with the backend contract.

export type LanguageCode =
  | "hi-IN"
  | "en-IN"
  | "bn-IN"
  | "gu-IN"
  | "kn-IN"
  | "ml-IN"
  | "mr-IN"
  | "pa-IN"
  | "ta-IN"
  | "te-IN";

export interface Language {
  code: LanguageCode;
  name: string;
  native: string;
  enabled: boolean; // a call agent exists for this language
}

export type Category = "pregnant" | "postnatal";
export type Risk = "normal" | "watch" | "high";

export interface Beneficiary {
  id: number;
  name: string;
  phone: string;
  language: LanguageCode;
  village: string;
  category: Category;
  edd: string | null;
  delivery_date: string | null;
  weeks_pregnant: number | null;
  days_since_delivery: number | null;
  next_visit_date: string | null;
  next_visit_type: string | null;
  notes: string;
  risk: Risk;
  open_alerts: number;
  last_call: Call | null;
  created_at: string;
}

export interface TranscriptTurn {
  role: "assistant" | "user";
  content: string;
  language?: string | null;
}

export type CallStatus = "in_progress" | "completed" | "abandoned";
export type CallOutcome = "DANGER_SIGN" | "ROUTINE" | "CALLBACK" | "NOT_REACHABLE";

/** A follow-up call is a live voice conversation: Prisma STT → Gemini → Timbre TTS. */
export interface Call {
  id: number;
  beneficiary_id: number;
  beneficiary_name: string;
  language: LanguageCode;
  status: CallStatus;
  outcome: CallOutcome | null;
  danger_signs: string[];
  summary: string | null;
  transcript: TranscriptTurn[];
  phone_line: boolean;
  duration_sec: number | null;
  error: string | null;
  triggered_at: string;
  completed_at: string | null;
}

export interface TurnTimings {
  stt_ms: number | null;
  llm_ms: number;
  tts_ms: number;
}

export interface TurnReply {
  user_text: string | null;
  detected_language: string | null;
  reply_text: string;
  reply_audio: string; // data URL
  end_call: boolean;
  alert_raised: boolean;
  timings: TurnTimings;
}

export interface StartCallResponse {
  call: Call;
  reply: TurnReply;
}

export interface Alert {
  id: number;
  beneficiary_id: number;
  beneficiary_name: string;
  phone: string;
  village: string;
  call_id: number | null;
  severity: "high" | "medium";
  reason: string;
  danger_signs: string[];
  status: "open" | "acknowledged";
  created_at: string;
}

export interface Note {
  id: number;
  beneficiary_id: number | null;
  beneficiary_name: string | null;
  transcript: string;
  detected_language: string | null;
  action: string;
  follow_up_date: string | null;
  summary: string;
  created_at: string;
}

export interface NoteDraft {
  transcript: string;
  detected_language: string | null;
  beneficiary_id: number | null;
  beneficiary_name: string | null;
  action: string;
  follow_up_date: string | null;
  summary: string;
}

export interface Dashboard {
  totals: { beneficiaries: number; pregnant: number; postnatal: number };
  today: { calls: number; completed: number; danger: number };
  open_alerts: number;
  alerts: Alert[];
  visits_due: Beneficiary[];
  recent_calls: Call[];
  languages: Language[];
}

export type BeneficiaryDetail = Beneficiary & {
  calls: Call[];
  notes: Note[];
  alerts: Alert[];
};

export interface BeneficiaryInput {
  name: string;
  phone: string;
  language: LanguageCode;
  village: string;
  category: Category;
  edd?: string | null;
  delivery_date?: string | null;
  next_visit_date?: string | null;
  next_visit_type?: string | null;
  notes?: string;
}

export interface Briefing {
  text: string;
  language: LanguageCode;
}
