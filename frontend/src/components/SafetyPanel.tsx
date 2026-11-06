import { AlertOctagon, AlertTriangle, Check, Circle, ShieldCheck } from "lucide-react";
import type { CheckItem, Triage } from "../api/types";
import { cx } from "./ui";

const GROUP_LABEL: Record<CheckItem["group"], string> = {
  pregnancy: "Pregnancy",
  mother: "Mother",
  mood: "Mood",
  newborn: "Baby",
  care: "Care",
};

const RISK: Record<Triage | "none", { label: string; sub: string; bar: string; text: string }> = {
  none: { label: "Checking…", sub: "MomCheck is asking her questions", bar: "w-[8%] bg-stone-400", text: "" },
  green: { label: "All clear so far", sub: "No danger signs reported", bar: "w-1/3 bg-emerald-500", text: "text-emerald-600" },
  amber: { label: "Needs a visit within a day", sub: "A health worker should see her today or tomorrow", bar: "w-2/3 bg-amber-500", text: "text-amber-600" },
  red: { label: "Go to hospital now", sub: "Danger sign: she has been told to go now; you are alerted", bar: "w-full bg-red-600", text: "text-red-600" },
};

/**
 * The live safety checklist the ASHA watches during a conversation: every question MomCheck must cover,
 * ticked as she answers, and a risk meter that turns red the moment a danger sign comes up.
 */
export function SafetyPanel({
  checklist,
  triage,
  dark = false,
  compact = false,
  className,
}: {
  checklist: CheckItem[];
  triage: Triage | null;
  dark?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const risk = RISK[triage ?? "none"];
  const done = checklist.filter((i) => i.state).length;
  const groups = [...new Set(checklist.map((i) => i.group))];
  return (
    <div className={cx("rounded-2xl p-4", dark ? "bg-black/20 ring-1 ring-white/10" : "bg-white ring-1 ring-line", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className={cx("flex items-center gap-1.5 text-sm font-semibold", dark ? "text-white" : "text-ink")}>
          <ShieldCheck className={cx("size-4", dark ? "text-brand-200" : "text-brand-700")} /> Safety check
        </p>
        <span className={cx("text-xs", dark ? "text-brand-100/70" : "text-muted")}>
          {done} of {checklist.length} checked
        </span>
      </div>

      {/* Risk meter */}
      <div className="mt-3">
        <div className={cx("h-2.5 overflow-hidden rounded-full", dark ? "bg-white/10" : "bg-stone-100")}>
          <div className={cx("h-full rounded-full transition-all duration-700", risk.bar)} />
        </div>
        <div className="mt-2 flex items-start gap-2">
          {triage === "red" ? (
            <AlertOctagon className="mt-0.5 size-4 shrink-0 text-red-500" />
          ) : triage === "amber" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          ) : triage === "green" ? (
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          ) : null}
          <div>
            <p className={cx("text-sm font-semibold", triage ? (dark && triage === "red" ? "text-red-300" : dark && triage === "amber" ? "text-amber-300" : dark ? "text-emerald-300" : risk.text) : dark ? "text-white/80" : "text-muted")}>
              {risk.label}
            </p>
            {!compact && <p className={cx("text-xs", dark ? "text-brand-100/60" : "text-muted")}>{risk.sub}</p>}
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className={cx("mt-3 space-y-3", compact && "grid grid-cols-2 gap-x-3 gap-y-1 space-y-0")}>
        {groups.map((g) => (
          <div key={g} className={cx(compact && "contents")}>
            {!compact && groups.length > 1 && (
              <p className={cx("mb-1 text-[10.5px] font-semibold uppercase tracking-wide", dark ? "text-brand-100/50" : "text-muted")}>{GROUP_LABEL[g]}</p>
            )}
            <ul className={cx(compact ? "contents" : "space-y-0.5")}>
              {checklist
                .filter((i) => i.group === g)
                .map((i) => (
                  <Row key={`${i.id}-${i.state ?? "none"}`} item={i} dark={dark} />
                ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ item, dark }: { item: CheckItem; dark: boolean }) {
  const s = item.state;
  const icon =
    s === "danger" ? (
      <AlertOctagon className="size-4 text-red-500" />
    ) : s === "concern" ? (
      <AlertTriangle className="size-4 text-amber-500" />
    ) : s === "ok" ? (
      <Check className="size-4 text-emerald-500" />
    ) : (
      <Circle className={cx("size-3.5", dark ? "text-white/25" : "text-stone-300")} />
    );
  return (
    <li
      className={cx(
        "flex items-center gap-2 rounded-lg px-1.5 py-1 text-[13px]",
        s && "row-pop",
        s === "danger" && (dark ? "bg-red-500/20 font-semibold text-red-100" : "bg-red-50 font-semibold text-red-800"),
        s === "concern" && (dark ? "bg-amber-400/15 text-amber-100" : "bg-amber-50 text-amber-900"),
        s === "ok" && (dark ? "text-white/90" : "text-ink"),
        !s && (dark ? "text-white/45" : "text-muted"),
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 truncate">{item.label}</span>
    </li>
  );
}
