import { useEffect, useState, type FormEvent } from "react";
import type { Beneficiary, BeneficiaryInput, Category, LanguageCode } from "../api/types";
import { useLanguages } from "../hooks/useLanguages";
import { Modal } from "./Modal";
import { Button, Field, cx, inputClass } from "./ui";

const VISIT_TYPES = [
  "ANC check-up 1",
  "ANC check-up 2",
  "ANC check-up 3",
  "ANC check-up 4",
  "TT / Td injection",
  "Ultrasound scan",
  "Blood test (Hb)",
  "PNC visit (day 3)",
  "PNC visit (day 7)",
  "PNC visit (day 14)",
  "PNC visit (day 42)",
  "Baby immunisation",
];

const empty: BeneficiaryInput = {
  name: "",
  phone: "",
  language: "hi-IN",
  village: "",
  category: "pregnant",
  edd: "",
  delivery_date: "",
  next_visit_date: "",
  next_visit_type: "",
  notes: "",
};

function fromBeneficiary(b: Beneficiary): BeneficiaryInput {
  return {
    name: b.name,
    phone: b.phone,
    language: b.language,
    village: b.village,
    category: b.category,
    edd: b.edd ?? "",
    delivery_date: b.delivery_date ?? "",
    next_visit_date: b.next_visit_date ?? "",
    next_visit_type: b.next_visit_type ?? "",
    notes: b.notes ?? "",
  };
}

/** Converts empty strings to null so the backend gets clean optional fields. */
function clean(v: BeneficiaryInput): BeneficiaryInput {
  const n = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);
  return {
    name: v.name.trim(),
    phone: v.phone.replace(/\D/g, ""),
    language: v.language,
    village: v.village.trim(),
    category: v.category,
    edd: v.category === "pregnant" ? n(v.edd) : null,
    delivery_date: v.category === "postnatal" ? n(v.delivery_date) : null,
    next_visit_date: n(v.next_visit_date),
    next_visit_type: n(v.next_visit_type),
    notes: (v.notes ?? "").trim(),
  };
}

export function BeneficiaryForm({
  open,
  onClose,
  initial,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Beneficiary | null;
  onSubmit: (input: BeneficiaryInput) => Promise<void>;
}) {
  const { languages } = useLanguages();
  const [v, setV] = useState<BeneficiaryInput>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof BeneficiaryInput, string>>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setV(initial ? fromBeneficiary(initial) : empty);
      setErrors({});
      setSubmitError(null);
    }
  }, [open, initial]);

  const set = <K extends keyof BeneficiaryInput>(k: K, val: BeneficiaryInput[K]) => setV((p) => ({ ...p, [k]: val }));

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (!v.name.trim()) e.name = "Name is required";
    const digits = v.phone.replace(/\D/g, "");
    if (!/^\d{10}$/.test(digits)) e.phone = "Enter a 10-digit mobile number (without +91)";
    if (!v.village.trim()) e.village = "Village is required";
    if (v.category === "pregnant" && !v.edd) e.edd = "Expected delivery date is required";
    if (v.category === "postnatal" && !v.delivery_date) e.delivery_date = "Delivery date is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev?: FormEvent) => {
    ev?.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await onSubmit(clean(v));
      onClose();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Edit details" : "Add a woman"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={busy}>
            {initial ? "Save changes" : "Add"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1">
          {(["pregnant", "postnatal"] as Category[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set("category", c)}
              className={cx(
                "rounded-lg py-2 text-sm font-medium transition-colors",
                v.category === c ? "bg-white text-brand-800 shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {c === "pregnant" ? "Pregnant" : "New mother"}
            </button>
          ))}
        </div>

        <Field label="Full name" error={errors.name}>
          <input className={inputClass} value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Sunita Devi" autoFocus />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile number" error={errors.phone} hint="10 digits, without +91">
            <div className="flex">
              <span className="inline-flex items-center rounded-l-xl border border-r-0 border-line bg-stone-50 px-3 text-sm text-muted">+91</span>
              <input
                className={cx(inputClass, "rounded-l-none")}
                inputMode="numeric"
                maxLength={10}
                value={v.phone}
                onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="9876543210"
              />
            </div>
          </Field>
          <Field label="Language she speaks">
            <select className={inputClass} value={v.language} onChange={(e) => set("language", e.target.value as LanguageCode)}>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.native === l.name ? l.name : `${l.native} (${l.name})`}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Village / area" error={errors.village}>
          <input className={inputClass} value={v.village} onChange={(e) => set("village", e.target.value)} placeholder="e.g. Rampur" />
        </Field>

        {v.category === "pregnant" ? (
          <Field label="Expected delivery date (EDD)" error={errors.edd}>
            <input type="date" className={inputClass} value={v.edd ?? ""} onChange={(e) => set("edd", e.target.value)} />
          </Field>
        ) : (
          <Field label="Delivery date" error={errors.delivery_date}>
            <input type="date" className={inputClass} value={v.delivery_date ?? ""} onChange={(e) => set("delivery_date", e.target.value)} />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Next visit">
            <input
              className={inputClass}
              list="visit-types"
              value={v.next_visit_type ?? ""}
              onChange={(e) => set("next_visit_type", e.target.value)}
              placeholder="e.g. ANC check-up 3"
            />
            <datalist id="visit-types">
              {VISIT_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="Next visit date">
            <input type="date" className={inputClass} value={v.next_visit_date ?? ""} onChange={(e) => set("next_visit_date", e.target.value)} />
          </Field>
        </div>

        <Field label="Notes" hint="Anything the call should know about, e.g. previous high BP.">
          <textarea className={cx(inputClass, "min-h-20")} value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>

        {submitError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
