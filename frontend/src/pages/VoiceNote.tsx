import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Mic, RotateCcw, Square } from "lucide-react";
import { api } from "../api/client";
import type { Beneficiary, NoteDraft } from "../api/types";
import { useToast } from "../components/Toast";
import { Button, Card, ErrorBox, Field, PageHeader, Spinner, cx, inputClass } from "../components/ui";
import { useRecorder } from "../hooks/useRecorder";
import { languageName } from "../lib/format";

type Step = "record" | "transcribing" | "confirm" | "saved";

export function VoiceNotePage() {
  const toast = useToast();
  const [params] = useSearchParams();
  const preselect = params.get("beneficiary");
  const rec = useRecorder(30);
  const [step, setStep] = useState<Step>("record");
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [women, setWomen] = useState<Beneficiary[]>([]);
  const [savedFor, setSavedFor] = useState<{ id: number | null; name: string | null } | null>(null);

  useEffect(() => {
    api
      .beneficiaries()
      .then(setWomen)
      .catch(() => setWomen([]));
  }, []);

  const recording = rec.state === "recording";
  const remaining = Math.max(0, Math.ceil(rec.maxSeconds - rec.elapsed));

  const toggle = async () => {
    if (recording) {
      void rec.stop();
      return;
    }
    setError(null);
    const result = await rec.start();
    if (!result) return;
    setStep("transcribing");
    try {
      const d = await api.draftNote(result.wav);
      const forced = preselect ? women.find((w) => w.id === Number(preselect)) : undefined;
      setDraft(
        forced && !d.beneficiary_id ? { ...d, beneficiary_id: forced.id, beneficiary_name: forced.name } : d,
      );
      setStep("confirm");
    } catch (e) {
      setError((e as Error).message);
      setStep("record");
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const note = await api.saveNote(draft);
      toast.success("Visit note saved");
      setSavedFor({ id: note.beneficiary_id, name: note.beneficiary_name });
      setStep("saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft(null);
    setError(null);
    setSavedFor(null);
    setStep("record");
  };

  const set = <K extends keyof NoteDraft>(k: K, v: NoteDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <>
      <PageHeader title="Voice note" subtitle="After a home visit, say what you did in your own words. MomCheck writes it down." />

      {step === "record" || step === "transcribing" ? (
        <Card className="mx-auto max-w-xl p-6 text-center md:p-10">
          {step === "transcribing" ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Spinner className="size-8" />
              <p className="font-medium text-ink">Listening to your note…</p>
              <p className="text-sm text-muted">Gnani Prisma is transcribing it, then the details are pulled out for you to check.</p>
            </div>
          ) : (
            <>
              <button
                onClick={() => void toggle()}
                disabled={rec.state === "requesting" || rec.state === "processing"}
                aria-label={recording ? "Stop recording" : "Start recording"}
                className={cx(
                  "relative mx-auto flex size-32 items-center justify-center rounded-full text-white shadow-xl transition-transform active:scale-95 disabled:opacity-60",
                  recording ? "rec-pulse bg-blush-600" : "bg-brand-700 hover:bg-brand-800",
                )}
                style={recording ? { boxShadow: `0 0 0 ${8 + rec.level * 30}px rgb(225 29 72 / ${0.12 + rec.level * 0.2})` } : undefined}
              >
                {rec.state === "requesting" || rec.state === "processing" ? (
                  <Spinner className="size-9 text-white" />
                ) : recording ? (
                  <Square className="size-10 fill-current" />
                ) : (
                  <Mic className="size-12" />
                )}
              </button>
              <p className="mt-6 text-lg font-medium text-ink">
                {recording ? `Recording… ${remaining}s left` : rec.state === "requesting" ? "Allow the microphone…" : "Tap to record"}
              </p>
              <p className="mt-1 text-sm text-muted">{recording ? "Tap again when you're done." : "Up to 30 seconds, in any Indian language."}</p>
              <div className="mx-auto mt-6 max-w-sm rounded-xl bg-brand-50 px-4 py-3 text-left text-sm text-brand-900">
                <p className="text-xs font-medium uppercase tracking-wide text-brand-700">For example</p>
                <p className="mt-1 italic">“Sunita ko BP check ke liye PHC bheja, agle hafte phir jaana hai”</p>
              </div>
              {(error || rec.error) && (
                <div className="mt-5 text-left">
                  <ErrorBox error={(error || rec.error) as string} />
                </div>
              )}
            </>
          )}
        </Card>
      ) : step === "confirm" && draft ? (
        <Card className="mx-auto max-w-xl p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-ink">Check and save</h2>
            {draft.detected_language && <span className="text-xs text-muted">Heard in {languageName(draft.detected_language)}</span>}
          </div>
          <div className="mb-4 rounded-xl bg-stone-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">What you said</p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink">{draft.transcript}</p>
          </div>
          <div className="space-y-4">
            <Field label="Woman">
              <select
                className={inputClass}
                value={draft.beneficiary_id ?? ""}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  set("beneficiary_id", id);
                  set("beneficiary_name", women.find((w) => w.id === id)?.name ?? null);
                }}
              >
                <option value="">Not linked to anyone</option>
                {women.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · {w.village}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="What was done">
              <input className={inputClass} value={draft.action} onChange={(e) => set("action", e.target.value)} />
            </Field>
            <Field label="Follow-up date">
              <input type="date" className={inputClass} value={draft.follow_up_date ?? ""} onChange={(e) => set("follow_up_date", e.target.value || null)} />
            </Field>
            <Field label="Summary">
              <textarea className={cx(inputClass, "min-h-20")} value={draft.summary} onChange={(e) => set("summary", e.target.value)} />
            </Field>
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={reset} icon={<RotateCcw className="size-4" />}>
              Record again
            </Button>
            <Button onClick={() => void save()} loading={saving} icon={<Check className="size-4" />}>
              Save note
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="mx-auto max-w-xl p-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Check className="size-7" />
          </div>
          <p className="mt-4 text-lg font-medium text-ink">Note saved</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {savedFor?.id && (
              <Link
                to={`/women/${savedFor.id}`}
                className="inline-flex h-10 items-center rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-stone-50"
              >
                Open {savedFor.name ?? "her"}'s profile
              </Link>
            )}
            <Button onClick={reset} icon={<Mic className="size-4" />}>
              Record another
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
