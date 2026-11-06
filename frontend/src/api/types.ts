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

/** The signed-in ASHA worker. */
export interface Me {
  id: number;
  name: string;
  phone: string;
  area: string;
  language: LanguageCode;
  is_demo: boolean;
  phone_calls: boolean; // real phone calls (Twilio) are available to this account
  has_voice: boolean; // she recorded her voice (Gnani voice cloning)
  use_own_voice: boolean; // calls speak in her voice
  voice_consent_at: string | null;
  facilities: Facilities;
}

export interface Facility {
  name: string;
  phone: string;
  lat?: number;
  lng?: number;
}

/** Where she sends women: nearest PHC, the hospital (FRU) and her supervising ANM. */
export interface Facilities {
  phc?: Facility;
  hospital?: Facility;
  anm?: Facility;
}

export interface DemoAccount {
  id: number;
  name: string;
  area: string;
  language: LanguageCode;
  women: number;
  languages: LanguageCode[];
}

export interface SignupInput {
  name: string;
  phone: string;
  area: string;
  language: LanguageCode;
  pin: string;
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
  role: "assistant" | "user" | "asha"; // asha = the ASHA speaking through the interpreter
  content: string;
  language?: string | null;
  en?: string; // English subtitle
  translation?: string; // interpreter: what the other side heard
  translation_language?: string;
}

export type Triage = "red" | "amber" | "green";
export type CheckState = "ok" | "concern" | "danger";

/** One row of the live safety checklist. */
export interface CheckItem {
  id: string;
  label: string;
  group: "pregnancy" | "mother" | "newborn" | "mood" | "care";
  state: CheckState | null;
}

// Phone calls (Twilio) also go through "ringing", and can end as "not_answered" or "failed".
export type CallStatus = "ringing" | "in_progress" | "completed" | "abandoned" | "not_answered" | "failed";
export type CallChannel = "browser" | "phone" | "ask" | "interpreter";
export type CallOutcome = "DANGER_SIGN" | "ROUTINE" | "CALLBACK" | "NOT_REACHABLE";

/** A follow-up call is a live voice conversation: Prisma STT → Gemini → Timbre TTS. */
export interface Call {
  id: number;
  beneficiary_id: number;
  beneficiary_name: string;
  language: LanguageCode;
  status: CallStatus;
  // "phone" = her real phone rang (Twilio); "browser" = the call ran in this browser;
  // "ask" = she started it from her Ask MomCheck link; "interpreter" = ASHA and her, translated
  channel: CallChannel;
  own_voice: boolean; // MomCheck spoke in the ASHA's cloned voice
  outcome: CallOutcome | null;
  triage: Triage | null;
  danger_signs: string[];
  checklist: CheckItem[];
  summary: string | null;
  callback_time: string | null;
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

export interface LiveState {
  checklist: CheckItem[];
  triage: Triage | null;
  danger_signs: string[];
}

export interface TurnReply extends LiveState {
  user_text: string | null;
  user_en: string | null;
  detected_language: string | null;
  reply_text: string;
  reply_en: string | null;
  reply_audio: string; // data URL
  end_call: boolean;
  alert_raised: boolean;
  timings: TurnTimings;
}

export interface InterpretTurn extends LiveState {
  speaker: "asha" | "mother";
  text: string;
  language: string;
  translation: string;
  translation_language: string;
  english: string | null;
  audio: string; // data URL
  own_voice: boolean;
  alert_raised: boolean;
  timings: TurnTimings;
}

/** Public: what her Ask MomCheck page knows. */
export interface AskInfo {
  first_name: string;
  language: LanguageCode;
  category: Category;
  asha_name: string;
  asha_voice: boolean;
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
  level: "red" | "amber";
  groups: ("pregnancy" | "mother" | "newborn" | "mood")[];
  reason: string;
  danger_signs: string[];
  status: "open" | "acknowledged";
  created_at: string;
  acknowledged_at: string | null;
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
  impact: Impact;
  map: AreaMap;
}

/** The last seven days. */
export interface Impact {
  calls: number;
  reached: number;
  women: number;
  red: number;
  amber: number;
  minutes_to_action: number | null;
  notes: number;
  languages: number;
  own_voice_calls: number;
  days: { date: string; calls: number; danger: number }[];
}

export interface AreaMap {
  women: { id: number; name: string; village: string; category: Category; lat: number; lng: number; risk: Risk }[];
  unplaced: number;
  facilities: { kind: "phc" | "hospital" | "anm"; name: string; phone: string; lat: number; lng: number }[];
}

export type BeneficiaryDetail = Beneficiary & {
  calls: Call[];
  /** Spoken visit notes. (`notes` is the free-text field typed in her profile.) */
  visit_notes: Note[];
  alerts: Alert[];
  ask_token: string | null; // her personal Ask MomCheck link (/m/<token>)
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
  day: string;
}

/** A briefing kept from an earlier generation: one per day and language. */
export interface SavedBriefing extends Briefing {
  id: number;
  updated_at: string;
}
