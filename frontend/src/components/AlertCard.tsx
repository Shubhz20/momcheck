import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertOctagon, AlertTriangle, Ambulance, Check, HeartHandshake, MapPin, Phone, UserRound } from "lucide-react";
import { api } from "../api/client";
import type { Alert, Facilities } from "../api/types";
import { useMe } from "../hooks/useAuth";
import { parseTimestamp, timeAgo } from "../lib/format";
import { DangerChips } from "./badges";
import { useToast } from "./Toast";
import { Badge, Button, cx } from "./ui";

const TELE_MANAS = "14416";

/** What the ASHA should do now, from the urgency and her own referral places. */
export function actionSteps(alert: Pick<Alert, "level" | "groups" | "beneficiary_name">, f: Facilities): string[] {
  const first = alert.beneficiary_name.split(" ")[0];
  const hospital = f.hospital?.name || "the nearest government hospital";
  const phc = f.phc?.name || "the PHC";
  const anm = f.anm?.name ? `your ANM, ${f.anm.name.replace(/\s*\(ANM\)\s*$/, "")}` : "your ANM";
  const moodOnly = alert.groups.length === 1 && alert.groups[0] === "mood";
  if (alert.level === "red" && moodOnly)
    return [`Call ${first} now and stay in touch with her today.`, `Tele-MANAS, the free 24×7 helpline, is ${TELE_MANAS}.`, `Tell ${anm}.`];
  if (alert.level === "red")
    return [
      `Call ${first} now and make sure she leaves for ${hospital} today${alert.groups.includes("newborn") ? " with the baby" : ""}.`,
      "The ambulance on 108 / 102 is free for her.",
      `Tell ${anm}.`,
    ];
  if (moodOnly) return [`Visit ${first} this week and listen to her.`, "Talk to her family about support at home."];
  return [`Visit or call ${first} today or tomorrow.`, `If it is worse, send her to ${phc}.`];
}

export function AlertCard({ alert, onChanged }: { alert: Alert; onChanged?: (a: Alert) => void }) {
  const toast = useToast();
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const open = alert.status === "open";
  const red = alert.level === "red";
  const anmPhone = me.facilities.anm?.phone;
  const mood = alert.groups.includes("mood");

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

  const handledIn =
    alert.acknowledged_at != null
      ? Math.max(1, Math.round((parseTimestamp(alert.acknowledged_at).getTime() - parseTimestamp(alert.created_at).getTime()) / 60000))
      : null;

  return (
    <div
      className={cx(
        "overflow-hidden rounded-2xl border",
        open ? (red ? "border-red-300 bg-red-50/70" : "border-amber-200 bg-amber-50/60") : "border-line bg-white opacity-80",
      )}
    >
      {open && (
        <div className={cx("flex items-center gap-2 px-4 py-1.5 text-xs font-bold uppercase tracking-wide", red ? "bg-red-600 text-white" : "bg-amber-400 text-amber-950")}>
          {red ? <AlertOctagon className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
          {red ? "Red · go to hospital now" : "Amber · see her within a day"}
        </div>
      )}
      <div className="flex items-start gap-3 p-4">
        <div className={cx("mt-0.5 rounded-full p-2", open ? (red ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800") : "bg-stone-100 text-muted")}>
          {red ? <AlertOctagon className="size-4" /> : <AlertTriangle className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/women/${alert.beneficiary_id}`} className="font-semibold text-ink hover:underline">
              {alert.beneficiary_name}
            </Link>
            {!open && (
              <Badge tone="neutral" icon={<Check className="size-3" />}>
                Handled{handledIn != null ? ` in ${handledIn} min` : ""}
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
            <>
              <div className="mt-3 rounded-xl bg-white/80 px-3 py-2.5 ring-1 ring-line">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Do now</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-sm text-ink">
                  {actionSteps(alert, me.facilities).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`tel:+91${alert.phone}`}
                  className={cx(
                    "inline-flex h-9 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white shadow-sm",
                    red ? "bg-red-600 hover:bg-red-700" : "bg-brand-700 hover:bg-brand-800",
                  )}
                >
                  <Phone className="size-4" />
                  Call her
                </a>
                {red && !mood && (
                  <a href="tel:108" className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50">
                    <Ambulance className="size-4" /> 108
                  </a>
                )}
                {mood && (
                  <a href={`tel:${TELE_MANAS}`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-stone-50">
                    <HeartHandshake className="size-4" /> Tele-MANAS {TELE_MANAS}
                  </a>
                )}
                {red && anmPhone && (
                  <a href={`tel:+91${anmPhone}`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-stone-50">
                    <UserRound className="size-4" /> ANM
                  </a>
                )}
                <Button variant="secondary" size="md" className="h-9" onClick={ack} loading={busy} icon={<Check className="size-4" />}>
                  Mark handled
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
