import type {
  Alert,
  AskInfo,
  Beneficiary,
  BeneficiaryDetail,
  BeneficiaryInput,
  Briefing,
  Call,
  Dashboard,
  DemoAccount,
  Facilities,
  InterpretTurn,
  JoinInput,
  Language,
  LanguageCode,
  Me,
  Note,
  NoteDraft,
  SavedBriefing,
  SignupInput,
  StartCallResponse,
  TurnReply,
  UsageReport,
} from "./types";

export const SIGNED_OUT_EVENT = "momcheck:signed-out";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") message = body.detail;
    else if (Array.isArray(body?.detail) && body.detail[0]?.msg) {
      // FastAPI validation errors
      message = body.detail
        .map((d: { loc?: unknown[]; msg: string }) => `${(d.loc ?? []).slice(-1)[0] ?? "field"}: ${d.msg}`)
        .join("; ");
    }
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(message, res.status);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body instanceof FormData ? undefined : body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your internet connection.", 0);
  }
  // Session expired or signed out elsewhere: tell the app to show the sign-in page.
  if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => request<{ ok: boolean }>("GET", "/health"),

  me: () => request<Me>("GET", "/auth/me"),
  demoAccounts: () => request<DemoAccount[]>("GET", "/auth/demo-accounts"),
  demoLogin: (ashaId: number) => request<Me>("POST", "/auth/demo", { asha_id: ashaId }),
  login: (phone: string, pin: string) => request<Me>("POST", "/auth/login", { phone, pin }),
  signup: (input: SignupInput) => request<Me>("POST", "/auth/signup", input),
  logout: () => request<{ ok: boolean }>("POST", "/auth/logout"),
  resetDemo: () => request<{ created: number }>("POST", "/auth/reset-demo"),

  dashboard: () => request<Dashboard>("GET", "/dashboard"),
  languages: () => request<Language[]>("GET", "/languages"),

  beneficiaries: (f: { q?: string; language?: string; category?: string } = {}) =>
    request<Beneficiary[]>("GET", `/beneficiaries${qs(f)}`),
  beneficiary: (id: number) => request<BeneficiaryDetail>("GET", `/beneficiaries/${id}`),
  createBeneficiary: (b: BeneficiaryInput) => request<Beneficiary>("POST", "/beneficiaries", b),
  updateBeneficiary: (id: number, b: Partial<BeneficiaryInput>) => request<Beneficiary>("PATCH", `/beneficiaries/${id}`, b),
  deleteBeneficiary: (id: number) => request<{ ok: boolean }>("DELETE", `/beneficiaries/${id}`),
  startCall: (id: number, phoneLine = true) =>
    request<StartCallResponse>("POST", `/beneficiaries/${id}/call?phone_line=${phoneLine ? "true" : "false"}`),

  calls: (f: { beneficiary_id?: number; limit?: number } = {}) => request<Call[]>("GET", `/calls${qs(f)}`),
  call: (id: number) => request<Call>("GET", `/calls/${id}`),
  callTurn: (id: number, audio: Blob, phoneLine: boolean) => {
    const fd = new FormData();
    fd.append("audio", audio, "turn.wav");
    fd.append("phone_line", phoneLine ? "true" : "false");
    return request<TurnReply>("POST", `/calls/${id}/turn`, fd);
  },
  endCall: (id: number) => request<Call>("POST", `/calls/${id}/end`),
  startPhoneCall: (beneficiaryId: number) => request<Call>("POST", `/beneficiaries/${beneficiaryId}/phone-call`),
  startInterpreter: (beneficiaryId: number) => request<Call>("POST", `/beneficiaries/${beneficiaryId}/interpreter`),
  interpret: (callId: number, audio: Blob, speaker: "asha" | "mother") => {
    const fd = new FormData();
    fd.append("audio", audio, "turn.wav");
    fd.append("speaker", speaker);
    return request<InterpretTurn>("POST", `/calls/${callId}/interpret`, fd);
  },
  askLink: (beneficiaryId: number, rotate = false) =>
    request<{ token: string; path: string }>("POST", `/beneficiaries/${beneficiaryId}/ask-link${qs({ rotate: rotate ? "true" : undefined })}`),
  hangupCall: (id: number) => request<Call>("POST", `/calls/${id}/hangup`),

  alerts: (status?: "open" | "acknowledged") => request<Alert[]>("GET", `/alerts${qs({ status })}`),
  ackAlert: (id: number) => request<Alert>("POST", `/alerts/${id}/ack`),

  draftNote: (audio: Blob, language?: string) => {
    const fd = new FormData();
    fd.append("audio", audio, "note.wav");
    if (language) fd.append("language", language);
    return request<NoteDraft>("POST", "/notes/draft", fd);
  },
  saveNote: (d: NoteDraft) => request<Note>("POST", "/notes", d),
  notes: (limit = 50) => request<Note[]>("GET", `/notes${qs({ limit })}`),
  linkNote: (id: number, beneficiaryId: number | null) => request<Note>("PATCH", `/notes/${id}`, { beneficiary_id: beneficiaryId }),
  deleteNote: (id: number) => request<{ ok: boolean }>("DELETE", `/notes/${id}`),

  briefing: (language: LanguageCode) => request<Briefing>("GET", `/briefing${qs({ language })}`),
  briefingAudioUrl: (language: LanguageCode, bust: number) => `/api/briefing/audio${qs({ language, t: bust })}`,
  briefings: (limit = 30) => request<SavedBriefing[]>("GET", `/briefings${qs({ limit })}`),
  savedBriefingAudioUrl: (id: number) => `/api/briefings/${id}/audio`,

  seedDemo: () => request<{ created: number }>("POST", "/demo/seed"),

  voiceScript: () => request<{ text: string; language: LanguageCode }>("GET", "/me/voice/script"),
  setVoice: (audio: Blob) => {
    const fd = new FormData();
    fd.append("audio", audio, "voice.wav");
    fd.append("consent", "true");
    return request<Me>("POST", "/me/voice", fd);
  },
  deleteVoice: () => request<Me>("DELETE", "/me/voice"),
  previewVoice: (language: LanguageCode) => request<{ text: string; audio: string }>("POST", `/me/voice/preview${qs({ language })}`),
  updateSettings: (s: { use_own_voice?: boolean; facilities?: Facilities }) => request<Me>("PATCH", "/me", s),

  // Public: the mother's own page (no sign-in; the token in her link is the key)
  askInfo: (token: string) => request<AskInfo>("GET", `/ask/${token}`),
  askStart: (token: string, mode: "ask" | "checkin" = "ask") =>
    request<{ call_id: number; reply_text: string; reply_audio: string }>("POST", `/ask/${token}/start${qs({ mode })}`),
  askCalendarUrl: (token: string) => `/api/ask/${token}/calendar.ics`,
  join: (input: JoinInput) => request<{ token: string; path: string }>("POST", "/join", input),
  usage: () => request<UsageReport>("GET", "/usage"),
  askTurn: (token: string, callId: number, audio: Blob) => {
    const fd = new FormData();
    fd.append("audio", audio, "turn.wav");
    return request<{ user_text: string | null; reply_text: string; reply_audio: string; end_call: boolean; alert_raised: boolean; asha_told: boolean }>(
      "POST",
      `/ask/${token}/calls/${callId}/turn`,
      fd,
    );
  },
  askEnd: (token: string, callId: number) => request<{ status: string; asha_told: boolean }>("POST", `/ask/${token}/calls/${callId}/end`),
};
