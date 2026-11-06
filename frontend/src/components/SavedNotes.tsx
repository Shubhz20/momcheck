import { useState } from "react";
import { Link } from "react-router-dom";
import { NotebookPen, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { Beneficiary, Note } from "../api/types";
import { useAsync } from "../hooks/useAsync";
import { formatDate, formatDateTime } from "../lib/format";
import { useToast } from "./Toast";
import { Badge, Card, ErrorBox, SectionHeader, SkeletonList, cx, inputClass } from "./ui";

/** Every voice note she has saved, newest first. Notes that matched nobody can be linked to a woman here. */
export function SavedNotes({ women, refreshKey }: { women: Beneficiary[]; refreshKey: number }) {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync<Note[]>(() => api.notes(), [refreshKey]);
  const [busy, setBusy] = useState<number | null>(null);

  const replace = (n: Note) => setData(data?.map((x) => (x.id === n.id ? n : x)));

  const link = async (note: Note, beneficiaryId: number | null) => {
    setBusy(note.id);
    try {
      const n = await api.linkNote(note.id, beneficiaryId);
      replace(n);
      if (n.beneficiary_name) toast.success(`Added to ${n.beneficiary_name}'s visit notes`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (note: Note) => {
    if (!window.confirm("Delete this note?")) return;
    setBusy(note.id);
    try {
      await api.deleteNote(note.id);
      setData(data?.filter((x) => x.id !== note.id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mx-auto mt-8 max-w-xl">
      <SectionHeader title="Saved notes" subtitle={data?.length ? `${data.length} note${data.length > 1 ? "s" : ""}` : undefined} />
      {error && !data ? (
        <ErrorBox error={error} onRetry={() => void reload()} />
      ) : loading && !data ? (
        <SkeletonList rows={2} />
      ) : !data?.length ? (
        <Card className="px-4 py-6 text-sm text-muted">No notes yet. Your saved notes appear here and on each woman's profile.</Card>
      ) : (
        <div className="space-y-3">
          {data.map((n) => (
            <Card key={n.id} className={cx("p-4", busy === n.id && "opacity-60")}>
              <div className="flex items-center justify-between gap-2">
                {n.beneficiary_id ? (
                  <Link to={`/women/${n.beneficiary_id}`} className="truncate text-sm font-semibold text-ink hover:underline">
                    {n.beneficiary_name ?? "Her profile"}
                  </Link>
                ) : (
                  <Badge tone="amber" icon={<NotebookPen className="size-3" />}>
                    Not linked to anyone
                  </Badge>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-xs text-muted">{formatDateTime(n.created_at)}</span>
                  <button
                    onClick={() => void remove(n)}
                    disabled={busy === n.id}
                    className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-red-700"
                    aria-label="Delete note"
                    title="Delete note"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm font-medium text-ink">{n.summary || n.action}</p>
              {n.action && n.summary && n.action !== n.summary && <p className="mt-1 text-sm text-muted">{n.action}</p>}
              {n.follow_up_date && <p className="mt-1 text-xs text-brand-800">Follow up: {formatDate(n.follow_up_date)}</p>}
              <p className="mt-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs italic text-muted">“{n.transcript}”</p>
              {!n.beneficiary_id && women.length > 0 && (
                <label className="mt-3 block">
                  <span className="text-xs text-muted">Who was this visit for?</span>
                  <select
                    className={cx(inputClass, "mt-1")}
                    value=""
                    disabled={busy === n.id}
                    onChange={(e) => e.target.value && void link(n, Number(e.target.value))}
                  >
                    <option value="">Choose a woman…</option>
                    {women.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} · {w.village}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
