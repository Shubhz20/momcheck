import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, MapPin, Phone } from "lucide-react";
import { api } from "../api/client";
import type { Alert } from "../api/types";
import { timeAgo } from "../lib/format";
import { DangerChips } from "./badges";
import { useToast } from "./Toast";
import { Badge, Button, cx } from "./ui";

export function AlertCard({ alert, onChanged }: { alert: Alert; onChanged?: (a: Alert) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const open = alert.status === "open";
  const high = alert.severity === "high";

  const ack = async () => {
    setBusy(true);
    try {
      const updated = await api.ackAlert(alert.id);
      toast.success(`Alert for ${alert.beneficiary_name} marked as handled`);
      onChanged?.(updated);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cx(
        "rounded-2xl border p-4",
        open ? (high ? "border-red-200 bg-red-50/70" : "border-amber-200 bg-amber-50/60") : "border-line bg-white opacity-80",
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cx("mt-0.5 rounded-full p-2", open ? (high ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800") : "bg-stone-100 text-muted")}>
          <AlertTriangle className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/women/${alert.beneficiary_id}`} className="font-semibold text-ink hover:underline">
              {alert.beneficiary_name}
            </Link>
            {open ? (
              <Badge tone={high ? "red" : "amber"}>{high ? "Urgent" : "Needs attention"}</Badge>
            ) : (
              <Badge tone="neutral" icon={<Check className="size-3" />}>
                Handled
              </Badge>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            {alert.village && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {alert.village}
              </span>
            )}
            <span>{timeAgo(alert.created_at)}</span>
          </p>
          <p className="mt-2 text-sm text-ink">{alert.reason}</p>
          {alert.danger_signs?.length > 0 && (
            <div className="mt-2">
              <DangerChips signs={alert.danger_signs} />
            </div>
          )}
          {open && (
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={`tel:+91${alert.phone}`}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-red-700"
              >
                <Phone className="size-4" />
                Call her
              </a>
              <Button variant="secondary" size="md" className="h-9" onClick={ack} loading={busy} icon={<Check className="size-4" />}>
                Acknowledge
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
