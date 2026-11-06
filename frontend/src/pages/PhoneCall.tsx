import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, BellRing, PhoneCall as PhoneCallIcon, PhoneOff } from "lucide-react";
import { api } from "../api/client";
import type { Call } from "../api/types";
import { isLive } from "../components/CallCard";
import { ChannelBadge, DangerChips, OutcomeBadge } from "../components/badges";
import { Transcript } from "../components/Transcript";
import { Avatar, Button, Card, ErrorBox, Skeleton, cx } from "../components/ui";
import { formatDuration, languageName, parseTimestamp } from "../lib/format";

const POLL_MS = 1500;
const REVIEW_WAIT_MS = 30_000; // after hang-up, keep polling until the automatic review has filled in the outcome

/** The ASHA's view of a real phone call: MomCheck is talking with the woman on her own phone. */
export function PhoneCallPage() {
  const { callId } = useParams();
  const id = Number(callId);
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hangingUp, setHangingUp] = useState(false);
  const endedAt = useRef<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let stop = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const c = await api.call(id);
        if (stop) return;
        setCall(c);
        setError(null);
        const reviewed = c.outcome !== null || c.summary !== null;
        if (!isLive(c) && endedAt.current === null) endedAt.current = Date.now();
        const waiting = !isLive(c) && !reviewed && Date.now() - (endedAt.current ?? 0) < REVIEW_WAIT_MS;
        if (isLive(c) || waiting) timer = window.setTimeout(poll, POLL_MS);
      } catch (e) {
        if (stop) return;
        setError((e as Error).message);
        timer = window.setTimeout(poll, POLL_MS * 2);
      }
    };
    void poll();
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      window.clearInterval(tick);
    };
  }, [id]);

  const hangUp = async () => {
    setHangingUp(true);
    try {
      setCall(await api.hangupCall(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setHangingUp(false);
    }
  };

  if (!call)
    return error ? (
      <ErrorBox error={error} />
    ) : (
      <>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="mt-4 h-64 w-full" />
      </>
    );

  const live = isLive(call);
  const elapsed = Math.max(0, Math.round((now - parseTimestamp(call.triggered_at).getTime()) / 1000));
  const reviewing = !live && (call.status === "completed" || call.status === "abandoned") && !call.summary;

  return (
    <>
      <Link to={`/women/${call.beneficiary_id}`} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> {call.beneficiary_name}
      </Link>

      <Card className={cx("overflow-hidden", call.danger_signs.length > 0 && "ring-2 ring-red-300")}>
        <div className="bg-gradient-to-br from-brand-50 via-white to-blush-50 p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative">
              <Avatar name={call.beneficiary_name} tone="rose" size="lg" />
              {live && <span className="ring-pulse absolute inset-0 rounded-full" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-ink">{call.beneficiary_name}</h1>
                <OutcomeBadge call={call} />
                <ChannelBadge call={call} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {call.status === "ringing" && "Ringing her phone…"}
                {call.status === "in_progress" && `MomCheck is talking with her in ${languageName(call.language)} · ${formatDuration(elapsed)}`}
                {reviewing && "Call ended. Reviewing the conversation…"}
                {!live && !reviewing && (call.summary ?? "Call ended.")}
              </p>
            </div>
            {live && (
              <Button variant="danger" onClick={() => void hangUp()} loading={hangingUp} icon={<PhoneOff className="size-4" />}>
                Hang up
              </Button>
            )}
          </div>

          {call.status === "ringing" && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-white/80 px-3 py-2 text-sm text-muted ring-1 ring-line">
              <BellRing className="mt-0.5 size-4 shrink-0 text-brand-700" />
              On a Twilio trial account she first hears a short trial message and has to press any key. Then MomCheck greets her.
            </p>
          )}

          {call.danger_signs.length > 0 && (
            <div className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 ring-1 ring-red-200">
              <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
                <AlertTriangle className="size-4" /> Danger sign reported. You have been alerted.
              </p>
              <div className="mt-2">
                <DangerChips signs={call.danger_signs} />
              </div>
            </div>
          )}
          {call.error && <p className="mt-3 text-sm text-red-700">{call.error}</p>}
          {error && <p className="mt-3 text-xs text-muted">Connection problem, retrying… ({error})</p>}
        </div>

        <div className="border-t border-line p-5 md:p-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <PhoneCallIcon className="size-4 text-brand-700" /> Conversation {live && <span className="text-xs font-normal text-muted">(updates live)</span>}
          </h2>
          <Transcript turns={call.transcript} />
        </div>
      </Card>

      {!live && (
        <div className="mt-5">
          <Link
            to={`/women/${call.beneficiary_id}`}
            className="inline-flex h-10 items-center rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-stone-50"
          >
            Back to {call.beneficiary_name.split(" ")[0]}'s profile
          </Link>
        </div>
      )}
    </>
  );
}
