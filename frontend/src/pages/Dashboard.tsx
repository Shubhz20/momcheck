import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BellRing, CalendarClock, Database, Languages, PhoneCall, Users } from "lucide-react";
import { api } from "../api/client";
import type { Alert, Beneficiary, Dashboard as DashboardData } from "../api/types";
import { AlertCard } from "../components/AlertCard";
import { CallRow } from "../components/CallCard";
import { RiskBadge } from "../components/badges";
import { useToast } from "../components/Toast";
import { Avatar, Button, Card, EmptyState, ErrorBox, PageHeader, SectionHeader, Skeleton, SkeletonList, cx } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useMe } from "../hooks/useAuth";
import { useLanguages } from "../hooks/useLanguages";
import { dueLabel, formatDate, stageLabel } from "../lib/format";

function StatCard({ label, value, sub, icon, tone = "brand" }: { label: string; value: ReactNode; sub?: string; icon: ReactNode; tone?: "brand" | "rose" | "red" | "amber" }) {
  const t = {
    brand: "bg-brand-50 text-brand-700",
    rose: "bg-blush-50 text-blush-600",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
  }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold text-ink">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
        </div>
        <div className={cx("rounded-xl p-2", t)}>{icon}</div>
      </div>
    </Card>
  );
}

function VisitRow({ b }: { b: Beneficiary }) {
  const due = dueLabel(b.next_visit_date);
  const toneClass = {
    overdue: "text-red-700 bg-red-50",
    today: "text-amber-800 bg-amber-50",
    soon: "text-brand-800 bg-brand-50",
    later: "text-muted bg-stone-100",
  }[due.tone];
  return (
    <Link to={`/women/${b.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-stone-50">
      <Avatar name={b.name} tone={b.risk === "high" ? "red" : "rose"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-ink">{b.name}</span>
          {b.risk !== "normal" && <RiskBadge risk={b.risk} />}
        </div>
        <p className="truncate text-xs text-muted">
          {b.next_visit_type ?? "Visit"} · {stageLabel(b)} · {b.village}
        </p>
      </div>
      <div className="text-right">
        <span className={cx("inline-block rounded-lg px-2 py-1 text-xs font-medium", toneClass)}>{due.text}</span>
        <p className="mt-0.5 text-[11px] text-muted">{formatDate(b.next_visit_date)}</p>
      </div>
    </Link>
  );
}

export function DashboardPage() {
  const toast = useToast();
  const me = useMe();
  const greeting = `Namaste, ${me.name.split(" ")[0]} 🙏`;
  const { refresh: refreshLanguages } = useLanguages();
  const { data, error, loading, reload, setData } = useAsync<DashboardData>(() => api.dashboard(), []);
  const [seeding, setSeeding] = useState(false);

  const seed = async () => {
    setSeeding(true);
    try {
      const r = await api.seedDemo();
      toast.success(r.created ? `Added ${r.created} sample women` : "You already have women registered");
      await reload();
      refreshLanguages();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSeeding(false);
    }
  };

  const onAlertChanged = (a: Alert) => {
    if (!data) return;
    const alerts = data.alerts.filter((x) => x.id !== a.id);
    setData({ ...data, alerts, open_alerts: Math.max(0, data.open_alerts - 1) });
    void reload(true);
  };

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  if (error && !data)
    return (
      <>
        <PageHeader title="Dashboard" subtitle={today} />
        <ErrorBox error={error} onRetry={() => void reload()} />
      </>
    );

  if (loading && !data)
    return (
      <>
        <PageHeader title="Dashboard" subtitle={today} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="mt-6">
          <SkeletonList rows={4} />
        </div>
      </>
    );

  if (!data) return null;

  if (data.totals.beneficiaries === 0)
    return (
      <>
        <PageHeader title={greeting} subtitle={today} />
        <EmptyState
          icon={<Users className="size-6" />}
          title="No women registered yet"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={seed} loading={seeding} icon={<Database className="size-4" />}>
                Load sample women
              </Button>
              <Link to="/women?add=1" className="inline-flex h-10 items-center rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-stone-50">
                Add a woman
              </Link>
            </div>
          }
        >
          Add the pregnant women and new mothers you look after. MomCheck will call each of them in her own language, check for danger
          signs, and alert you right away.
        </EmptyState>
      </>
    );

  const enabledLangs = data.languages.filter((l) => l.enabled);

  return (
    <>
      <PageHeader title={greeting} subtitle={`${today} · Here's how your women are doing`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Women"
          value={data.totals.beneficiaries}
          sub={`${data.totals.pregnant} pregnant · ${data.totals.postnatal} new mothers`}
          icon={<Users className="size-5" />}
          tone="rose"
        />
        <StatCard label="Calls today" value={data.today.calls} sub={`${data.today.completed} completed`} icon={<PhoneCall className="size-5" />} />
        <StatCard
          label="Danger signs today"
          value={data.today.danger}
          sub={data.today.danger ? "Escalated to you" : "None reported"}
          icon={<AlertTriangle className="size-5" />}
          tone={data.today.danger ? "red" : "brand"}
        />
        <StatCard
          label="Open alerts"
          value={data.open_alerts}
          sub={data.open_alerts ? "Need your attention" : "All handled"}
          icon={<BellRing className="size-5" />}
          tone={data.open_alerts ? "red" : "brand"}
        />
      </div>

      {data.alerts.length > 0 && (
        <section className="mt-8">
          <SectionHeader title="Needs attention now" subtitle="Danger signs reported on follow-up calls" />
          <div className="grid gap-3 lg:grid-cols-2">
            {data.alerts.map((a) => (
              <AlertCard key={a.id} alert={a} onChanged={onAlertChanged} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <SectionHeader
            title="Visits due this week"
            subtitle="Includes overdue visits"
            action={
              <Link to="/women" className="text-sm font-medium text-brand-700 hover:underline">
                All women
              </Link>
            }
          />
          <Card className="p-1.5">
            {data.visits_due.length ? (
              <div className="divide-y divide-line/70">
                {data.visits_due.map((b) => (
                  <VisitRow key={b.id} b={b} />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-6 text-sm text-muted">
                <CalendarClock className="size-5 text-brand-600" /> No visits due in the next 7 days.
              </div>
            )}
          </Card>
        </section>

        <section className="lg:col-span-2">
          <SectionHeader title="Recent calls" />
          <Card className="p-1.5">
            {data.recent_calls.length ? (
              <div className="divide-y divide-line/70">
                {data.recent_calls.map((c) => (
                  <CallRow key={c.id} call={c} />
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-sm text-muted">No calls yet. Open a woman's profile to start a voice follow-up.</div>
            )}
          </Card>
        </section>
      </div>

      <section className="mt-8">
        <SectionHeader
          title={`${data.languages.length || 10} Indian languages`}
          subtitle={
            enabledLangs.length === data.languages.length
              ? "MomCheck can speak with every woman in her own language"
              : `${enabledLangs.length} of ${data.languages.length} ready for calls`
          }
          action={<Languages className="size-5 text-muted" />}
        />
        <div className="flex flex-wrap gap-2">
          {data.languages.map((l) => (
            <span
              key={l.code}
              title={l.enabled ? `${l.name}: ready` : `${l.name}: not available`}
              className={cx(
                "rounded-full px-3 py-1.5 text-sm ring-1 ring-inset",
                l.enabled ? "bg-brand-700 font-medium text-white ring-brand-700" : "bg-white text-muted ring-line",
              )}
            >
              {l.native}
              {l.native !== l.name && <span className={cx("ml-1.5 text-xs", l.enabled ? "text-brand-100" : "text-stone-400")}>{l.name}</span>}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
