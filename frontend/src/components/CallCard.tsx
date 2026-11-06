import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Clock, MessageSquareText, PhoneCall } from "lucide-react";
import type { Call } from "../api/types";
import { formatDateTime, formatDuration, languageName, timeAgo } from "../lib/format";
import { ChannelBadge, DangerChips, OutcomeBadge } from "./badges";
import { Transcript } from "./Transcript";
import { Button, cx } from "./ui";

export function isLive(call: Pick<Call, "status">): boolean {
  return call.status === "ringing" || call.status === "in_progress";
}

/** Where a live call is shown: the in-browser call screen, or the phone-call monitor. */
export function liveCallPath(call: Pick<Call, "id" | "channel">): string {
  return call.channel === "phone" ? `/phone-call/${call.id}` : `/call/${call.id}`;
}

/** Compact row used on the dashboard. */
export function CallRow({ call }: { call: Call }) {
  const to = isLive(call) ? liveCallPath(call) : `/women/${call.beneficiary_id}`;
  return (
    <Link to={to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-stone-50">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-ink">{call.beneficiary_name}</span>
          <OutcomeBadge call={call} />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {languageName(call.language)} · {timeAgo(call.triggered_at)}
          {call.summary ? ` · ${call.summary}` : ""}
        </p>
      </div>
    </Link>
  );
}

/** Full card used in the beneficiary's call history. */
export function CallCard({ call, defaultOpen = false }: { call: Call; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const isDanger = call.outcome === "DANGER_SIGN";
  return (
    <div className={cx("rounded-2xl border bg-white p-4", isDanger ? "border-red-200" : "border-line")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <OutcomeBadge call={call} />
          <span className="text-xs text-muted">{languageName(call.language)}</span>
          <ChannelBadge call={call} />
        </div>
        <div className="flex items-center gap-1 text-xs text-muted">
          <Clock className="size-3.5" />
          {formatDateTime(call.triggered_at)}
          {call.duration_sec != null && <span>· {formatDuration(call.duration_sec)}</span>}
        </div>
      </div>

      {call.danger_signs?.length > 0 && (
        <div className="mt-3">
          <DangerChips signs={call.danger_signs} />
        </div>
      )}
      {call.summary && <p className="mt-3 text-sm leading-relaxed text-ink">{call.summary}</p>}
      {call.error && <p className="mt-3 text-sm text-red-700">{call.error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {call.transcript?.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} icon={<MessageSquareText className="size-4" />}>
            {open ? "Hide transcript" : `View transcript (${call.transcript.length})`}
            <ChevronDown className={cx("size-4 transition-transform", open && "rotate-180")} />
          </Button>
        )}
        {isLive(call) && (
          <Link
            to={liveCallPath(call)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-sm font-medium text-white hover:bg-brand-800"
          >
            <PhoneCall className="size-3.5" /> Return to call
          </Link>
        )}
      </div>

      {open && (
        <div className="mt-3 border-t border-line pt-4">
          <Transcript turns={call.transcript} />
        </div>
      )}
    </div>
  );
}
