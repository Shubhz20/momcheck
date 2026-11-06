import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Languages, MapPin, Mic, NotebookPen, Pencil, Phone, PhoneCall, PhoneOutgoing, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { Alert, BeneficiaryDetail, BeneficiaryInput } from "../api/types";
import { unlockAudio } from "../audio/player";
import { AlertCard } from "../components/AlertCard";
import { BeneficiaryForm } from "../components/BeneficiaryForm";
import { CallCard } from "../components/CallCard";
import { RiskBadge } from "../components/badges";
import { useToast } from "../components/Toast";
import { Avatar, Badge, Button, Card, ErrorBox, SectionHeader, Skeleton, SkeletonList, cx } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useLanguages } from "../hooks/useLanguages";
import { dueLabel, formatDate, formatDateTime, languageLabel, languageName, stageLabel, timeAgo } from "../lib/format";
import { loadPref } from "../lib/prefs";

function InfoItem({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-lg bg-white/80 p-1.5 text-muted ring-1 ring-line">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <div className="text-sm font-medium text-ink">{children}</div>
      </div>
    </div>
  );
}

export function BeneficiaryDetailPage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const navigate = useNavigate();
  const toast = useToast();
  const { languages } = useLanguages();
  const { data, error, loading, reload, setData } = useAsync<BeneficiaryDetail>(() => api.beneficiary(id), [id]);

  const [calling, setCalling] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const startCall = async () => {
    if (!data) return;
    // Must run inside the click so mobile browsers allow Janani's voice to play later
    unlockAudio();
    setCalling(true);
    setCallError(null);
    try {
      const res = await api.startCall(data.id, loadPref("js.phoneLine", true));
      navigate(`/call/${res.call.id}`, { state: { start: res } });
    } catch (e) {
      setCallError((e as Error).message);
      setCalling(false);
    }
  };

  const save = async (input: BeneficiaryInput) => {
    await api.updateBeneficiary(id, input);
    toast.success("Details updated");
    await reload(true);
  };

  const remove = async () => {
    if (!data) return;
    if (!window.confirm(`Remove ${data.name}? Her call history will also be deleted.`)) return;
    try {
      await api.deleteBeneficiary(id);
      toast.success(`${data.name} removed`);
      navigate("/women");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onAlertChanged = (a: Alert) => {
    if (data) setData({ ...data, alerts: data.alerts.map((x) => (x.id === a.id ? a : x)) });
    void reload(true);
  };

  if (error && !data)
    return (
      <>
        <BackLink />
        <ErrorBox error={error} onRetry={() => void reload()} />
      </>
    );

  if (loading && !data)
    return (
      <>
        <BackLink />
        <Skeleton className="h-44 w-full" />
        <div className="mt-6">
          <SkeletonList rows={3} />
        </div>
      </>
    );

  if (!data) return null;

  const due = dueLabel(data.next_visit_date);
  const activeCall = data.calls.find((c) => c.status === "in_progress");
  const openAlerts = data.alerts.filter((a) => a.status === "open");
  const pastAlerts = data.alerts.filter((a) => a.status !== "open");

  return (
    <>
      <BackLink />

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-blush-50 via-white to-brand-50 p-5 md:p-6">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar name={data.name} tone={data.risk === "high" ? "red" : "rose"} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-ink">{data.name}</h1>
                <RiskBadge risk={data.risk} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {stageLabel(data)}
                {data.category === "pregnant" && data.edd ? ` · Due ${formatDate(data.edd)}` : ""}
                {data.category === "postnatal" && data.delivery_date ? ` · Delivered ${formatDate(data.delivery_date)}` : ""}
              </p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} icon={<Pencil className="size-4" />}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={remove} icon={<Trash2 className="size-4" />} className="text-red-700 hover:bg-red-50">
                <span className="sr-only sm:not-sr-only">Remove</span>
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem icon={<Phone className="size-4" />} label="Mobile">
              <a href={`tel:+91${data.phone}`} className="hover:underline">
                +91 {data.phone}
              </a>
            </InfoItem>
            <InfoItem icon={<Languages className="size-4" />} label="Language">
              {languageLabel(data.language, languages)}
            </InfoItem>
            <InfoItem icon={<MapPin className="size-4" />} label="Village">
              {data.village}
            </InfoItem>
            <InfoItem icon={<CalendarDays className="size-4" />} label="Next visit">
              {data.next_visit_type ?? "Not scheduled"}
              {data.next_visit_date && (
                <span className={cx("ml-1 font-normal", due.tone === "overdue" ? "text-red-700" : due.tone === "today" ? "text-amber-700" : "text-muted")}>
                  · {due.text}
                </span>
              )}
            </InfoItem>
          </div>
          {data.notes && <p className="mt-4 rounded-xl bg-white/70 px-3 py-2 text-sm text-ink ring-1 ring-line">{data.notes}</p>}
        </div>

        {/* Call action */}
        <div className="border-t border-line p-5 md:p-6">
          {activeCall ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className="ring-pulse flex size-12 items-center justify-center rounded-full bg-brand-600 text-white">
                <PhoneOutgoing className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">A follow-up call is in progress</p>
                <p className="text-sm text-muted">Started {timeAgo(activeCall.triggered_at)}.</p>
              </div>
              <Link
                to={`/call/${activeCall.id}`}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-800"
              >
                <PhoneCall className="size-4" /> Return to call
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <Button size="lg" onClick={startCall} loading={calling} icon={<PhoneCall className="size-5" />} className="w-full sm:w-auto">
                {calling ? "Connecting…" : "Start follow-up call"}
              </Button>
              <p className="flex-1 text-sm text-muted">
                Janani will speak with her in {languageName(data.language)}, remind her about her next visit, and check for danger signs. Any danger
                sign alerts you straight away.
              </p>
            </div>
          )}
          {callError && (
            <div className="mt-3">
              <ErrorBox error={callError} />
            </div>
          )}
        </div>
      </Card>

      {openAlerts.length > 0 && (
        <section className="mt-6">
          <SectionHeader title="Open alerts" />
          <div className="space-y-3">
            {openAlerts.map((a) => (
              <AlertCard key={a.id} alert={a} onChanged={onAlertChanged} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <SectionHeader title="Call history" subtitle={data.calls.length ? `${data.calls.length} call${data.calls.length > 1 ? "s" : ""}` : undefined} />
          {data.calls.length ? (
            <div className="space-y-3">
              {data.calls.map((c) => (
                <CallCard key={c.id} call={c} />
              ))}
            </div>
          ) : (
            <Card className="px-4 py-6 text-sm text-muted">No calls yet. Start a follow-up call above.</Card>
          )}
        </section>

        <section className="lg:col-span-2">
          <SectionHeader
            title="Visit notes"
            action={
              <Link to={`/note?beneficiary=${data.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                <Mic className="size-4" /> Add note
              </Link>
            }
          />
          {data.notes.length ? (
            <div className="space-y-3">
              {data.notes.map((n) => (
                <Card key={n.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone="brand" icon={<NotebookPen className="size-3" />}>
                      Visit note
                    </Badge>
                    <span className="text-xs text-muted">{formatDateTime(n.created_at)}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink">{n.summary || n.action}</p>
                  {n.action && n.summary && n.action !== n.summary && <p className="mt-1 text-sm text-muted">{n.action}</p>}
                  {n.follow_up_date && <p className="mt-1 text-xs text-brand-800">Follow up: {formatDate(n.follow_up_date)}</p>}
                  <p className="mt-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs italic text-muted">“{n.transcript}”</p>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="px-4 py-6 text-sm text-muted">No visit notes yet. Record a spoken note after a home visit.</Card>
          )}

          {pastAlerts.length > 0 && (
            <div className="mt-6">
              <SectionHeader title="Past alerts" />
              <div className="space-y-3">
                {pastAlerts.map((a) => (
                  <AlertCard key={a.id} alert={a} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <BeneficiaryForm open={editOpen} onClose={() => setEditOpen(false)} initial={data} onSubmit={save} />
    </>
  );
}

function BackLink() {
  return (
    <Link to="/women" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
      <ArrowLeft className="size-4" /> All women
    </Link>
  );
}
