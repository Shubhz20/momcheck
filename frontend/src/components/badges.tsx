import { AlertTriangle, BellRing, CheckCircle2, Phone, PhoneMissed, PhoneOutgoing, Radio, RotateCcw, XCircle } from "lucide-react";
import type { Call, CallOutcome, Risk } from "../api/types";
import { Badge } from "./ui";

export function OutcomeBadge({ call }: { call: Pick<Call, "status" | "outcome"> }) {
  if (call.status === "ringing")
    return (
      <Badge tone="blue" icon={<BellRing className="size-3" />}>
        Ringing
      </Badge>
    );
  if (call.status === "failed")
    return (
      <Badge tone="neutral" icon={<XCircle className="size-3" />}>
        Couldn't connect
      </Badge>
    );
  if (call.status === "not_answered")
    return (
      <Badge tone="neutral" icon={<PhoneMissed className="size-3" />}>
        No answer
      </Badge>
    );
  if (call.status === "in_progress")
    return (
      <Badge tone="blue" icon={<PhoneOutgoing className="size-3" />}>
        In progress
      </Badge>
    );
  if (call.status === "abandoned" && !call.outcome)
    return (
      <Badge tone="neutral" icon={<XCircle className="size-3" />}>
        Ended early
      </Badge>
    );
  return <OutcomeOnly outcome={call.outcome} />;
}

/** How the call happened: her real phone (Twilio), or a browser call with the simulated 8 kHz phone line. */
export function ChannelBadge({ call }: { call: Pick<Call, "channel" | "phone_line"> }) {
  if (call.channel === "phone")
    return (
      <Badge tone="brand" icon={<Phone className="size-3" />}>
        Real phone call
      </Badge>
    );
  if (!call.phone_line) return null;
  return (
    <Badge tone="neutral" icon={<Radio className="size-3" />}>
      Browser · 8 kHz phone-line sim
    </Badge>
  );
}

export function OutcomeOnly({ outcome }: { outcome: CallOutcome | null }) {
  switch (outcome) {
    case "DANGER_SIGN":
      return (
        <Badge tone="red" icon={<AlertTriangle className="size-3" />}>
          Danger sign
        </Badge>
      );
    case "ROUTINE":
      return (
        <Badge tone="green" icon={<CheckCircle2 className="size-3" />}>
          All well
        </Badge>
      );
    case "CALLBACK":
      return (
        <Badge tone="amber" icon={<RotateCcw className="size-3" />}>
          Call back
        </Badge>
      );
    case "NOT_REACHABLE":
      return (
        <Badge tone="neutral" icon={<PhoneMissed className="size-3" />}>
          Not reachable
        </Badge>
      );
    default:
      return <Badge tone="neutral">Completed</Badge>;
  }
}

export function RiskBadge({ risk }: { risk: Risk }) {
  if (risk === "high")
    return (
      <Badge tone="red" icon={<AlertTriangle className="size-3" />}>
        High risk
      </Badge>
    );
  if (risk === "watch") return <Badge tone="amber">Watch</Badge>;
  return <Badge tone="green">Normal</Badge>;
}

export function DangerChips({ signs }: { signs: string[] }) {
  if (!signs?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {signs.map((s) => (
        <span key={s} className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
          {s}
        </span>
      ))}
    </div>
  );
}
