import { AlertTriangle, CheckCircle2, PhoneMissed, PhoneOutgoing, Radio, RotateCcw, XCircle } from "lucide-react";
import type { Call, CallOutcome, Risk } from "../api/types";
import { Badge } from "./ui";

export function OutcomeBadge({ call }: { call: Pick<Call, "status" | "outcome"> }) {
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

export function PhoneLineBadge() {
  return (
    <Badge tone="neutral" icon={<Radio className="size-3" />}>
      Phone line · 8 kHz
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
