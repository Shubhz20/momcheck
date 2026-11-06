import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, Plus, Search, Users } from "lucide-react";
import { api } from "../api/client";
import type { Beneficiary, BeneficiaryInput } from "../api/types";
import { BeneficiaryForm } from "../components/BeneficiaryForm";
import { OutcomeBadge, RiskBadge } from "../components/badges";
import { useToast } from "../components/Toast";
import { Avatar, Button, Card, EmptyState, ErrorBox, PageHeader, SkeletonList, cx, inputClass } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useLanguages } from "../hooks/useLanguages";
import { dueLabel, languageName, stageLabel, timeAgo } from "../lib/format";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Row({ b }: { b: Beneficiary }) {
  const due = dueLabel(b.next_visit_date);
  return (
    <Link to={`/women/${b.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-stone-50">
      <Avatar name={b.name} tone={b.risk === "high" ? "red" : "rose"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-ink">{b.name}</span>
          <RiskBadge risk={b.risk} />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {stageLabel(b)} · {languageName(b.language)} · {b.village}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted sm:hidden">
          <span className={cx(due.tone === "overdue" && "text-red-700", due.tone === "today" && "text-amber-700")}>Next visit: {due.text}</span>
        </p>
      </div>
      <div className="hidden w-40 text-right text-xs sm:block">
        <p className="text-muted">Next visit</p>
        <p className={cx("font-medium", due.tone === "overdue" ? "text-red-700" : due.tone === "today" ? "text-amber-700" : "text-ink")}>{due.text}</p>
      </div>
      <div className="hidden w-36 text-right md:block">
        {b.last_call ? (
          <div className="flex flex-col items-end gap-1">
            <OutcomeBadge call={b.last_call} />
            <span className="text-[11px] text-muted">{timeAgo(b.last_call.triggered_at)}</span>
          </div>
        ) : (
          <span className="text-xs text-muted">Not called yet</span>
        )}
      </div>
      <ChevronRight className="size-4 shrink-0 text-stone-400" />
    </Link>
  );
}

export function BeneficiariesPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { languages } = useLanguages();
  const [q, setQ] = useState("");
  const [language, setLanguage] = useState("");
  const [category, setCategory] = useState("");
  const dq = useDebounced(q);
  const [formOpen, setFormOpen] = useState(params.get("add") === "1");

  const { data, error, loading, reload } = useAsync(() => api.beneficiaries({ q: dq, language, category }), [dq, language, category]);

  const closeForm = () => {
    setFormOpen(false);
    if (params.get("add")) {
      params.delete("add");
      setParams(params, { replace: true });
    }
  };

  const create = async (input: BeneficiaryInput) => {
    const b = await api.createBeneficiary(input);
    toast.success(`${b.name} added`);
    navigate(`/women/${b.id}`);
  };

  const filtered = Boolean(dq || language || category);

  return (
    <>
      <PageHeader
        title="Women"
        subtitle="Pregnant women and new mothers in your care"
        action={
          <Button onClick={() => setFormOpen(true)} icon={<Plus className="size-4" />}>
            Add
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input className={cx(inputClass, "pl-9")} placeholder="Search by name, village or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <select className={cx(inputClass, "sm:w-44")} value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Filter by language">
            <option value="">All languages</option>
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native === l.name ? l.name : `${l.native} (${l.name})`}
              </option>
            ))}
          </select>
          <select className={cx(inputClass, "sm:w-40")} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
            <option value="">Everyone</option>
            <option value="pregnant">Pregnant</option>
            <option value="postnatal">New mothers</option>
          </select>
        </div>
      </div>

      {error && !data ? (
        <ErrorBox error={error} onRetry={() => void reload()} />
      ) : loading && !data ? (
        <SkeletonList rows={5} />
      ) : data && data.length ? (
        <Card className="divide-y divide-line/70 overflow-hidden">
          {data.map((b) => (
            <Row key={b.id} b={b} />
          ))}
        </Card>
      ) : (
        <EmptyState
          icon={<Users className="size-6" />}
          title={filtered ? "No matches" : "No women registered yet"}
          action={
            !filtered && (
              <Button onClick={() => setFormOpen(true)} icon={<Plus className="size-4" />}>
                Add a woman
              </Button>
            )
          }
        >
          {filtered ? "Try a different search or clear the filters." : "Add someone to start follow-up calls, or load demo data from the dashboard."}
        </EmptyState>
      )}

      <BeneficiaryForm open={formOpen} onClose={closeForm} onSubmit={create} />
    </>
  );
}
