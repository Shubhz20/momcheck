import type { Language } from "../api/types";

/** Fallback language names, used until /api/languages has loaded. */
export const LANGUAGES: Language[] = [
  { code: "hi-IN", name: "Hindi", native: "हिन्दी", enabled: true },
  { code: "bn-IN", name: "Bengali", native: "বাংলা", enabled: true },
  { code: "ta-IN", name: "Tamil", native: "தமிழ்", enabled: true },
  { code: "te-IN", name: "Telugu", native: "తెలుగు", enabled: true },
  { code: "mr-IN", name: "Marathi", native: "मराठी", enabled: true },
  { code: "kn-IN", name: "Kannada", native: "ಕನ್ನಡ", enabled: true },
  { code: "ml-IN", name: "Malayalam", native: "മലയാളം", enabled: true },
  { code: "gu-IN", name: "Gujarati", native: "ગુજરાતી", enabled: true },
  { code: "pa-IN", name: "Punjabi", native: "ਪੰਜਾਬੀ", enabled: true },
  { code: "en-IN", name: "English", native: "English", enabled: true },
];

export function languageLabel(code: string | null | undefined, list: Language[] = LANGUAGES): string {
  if (!code) return "—";
  const l = list.find((x) => x.code === code) ?? LANGUAGES.find((x) => x.code === code);
  if (!l) return code;
  return l.native === l.name ? l.name : `${l.native} · ${l.name}`;
}

export function languageName(code: string | null | undefined): string {
  if (!code) return "—";
  return LANGUAGES.find((x) => x.code === code)?.name ?? code;
}

/** Backend timestamps are UTC; tolerate naive ISO strings (no timezone suffix). */
export function parseTimestamp(ts: string): Date {
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(ts);
  return new Date(hasZone ? ts : `${ts}Z`);
}

/** Dates are YYYY-MM-DD local calendar dates. */
export function parseDate(d: string): Date {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}

const rtf = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" });

export function timeAgo(ts: string | null | undefined): string {
  if (!ts) return "—";
  const diffSec = Math.round((parseTimestamp(ts).getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diffSec / 86400), "day");
  return formatDateTime(ts);
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return parseDate(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  return parseTimestamp(ts).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Whole days from today (local) to the given date. Negative = in the past. */
export function daysFromToday(d: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parseDate(d).getTime() - today.getTime()) / 86400000);
}

export function dueLabel(d: string | null | undefined): { text: string; tone: "overdue" | "today" | "soon" | "later" } {
  if (!d) return { text: "Not scheduled", tone: "later" };
  const n = daysFromToday(d);
  if (n < 0) return { text: `Overdue by ${-n} day${n === -1 ? "" : "s"}`, tone: "overdue" };
  if (n === 0) return { text: "Today", tone: "today" };
  if (n === 1) return { text: "Tomorrow", tone: "soon" };
  if (n <= 7) return { text: `In ${n} days`, tone: "soon" };
  return { text: formatDate(d), tone: "later" };
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function stageLabel(b: { category: string; weeks_pregnant: number | null; days_since_delivery: number | null }): string {
  if (b.category === "pregnant") return b.weeks_pregnant != null ? `${b.weeks_pregnant} weeks pregnant` : "Pregnant";
  return b.days_since_delivery != null ? `${b.days_since_delivery} days after delivery` : "Postnatal";
}

export function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  // Array.from keeps Indic grapheme starts intact better than indexing
  const first = Array.from(parts[0])[0] ?? "";
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] ?? "" : "";
  return (first + last).toUpperCase();
}
