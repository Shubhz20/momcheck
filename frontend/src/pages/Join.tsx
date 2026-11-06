import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Baby, HeartHandshake, ShieldCheck } from "lucide-react";
import { api } from "../api/client";
import type { Category, LanguageCode } from "../api/types";
import { LogoMark } from "../components/Logo";
import { Button, ErrorBox, Field, cx, inputClass } from "../components/ui";
import { useLanguages } from "../hooks/useLanguages";

/** A mother signs herself up: no phone number, just her stage and language. She gets her own MomCheck page. */
export function JoinPage() {
  const navigate = useNavigate();
  const { languages } = useLanguages();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<LanguageCode>("hi-IN");
  const [category, setCategory] = useState<Category>("pregnant");
  const [weeks, setWeeks] = useState("");
  const [days, setDays] = useState("");
  const [village, setVillage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await api.join({
        name,
        language,
        category,
        village,
        ...(category === "pregnant" ? { weeks: Number(weeks) } : { days_since_birth: Number(days) }),
      });
      navigate(r.path);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-blush-50 via-canvas to-brand-50">
      <div className="mx-auto max-w-md px-5 pb-10 pt-5">
        <div className="flex items-center gap-2">
          <LogoMark className="size-8" />
          <span className="text-lg font-semibold text-ink">MomCheck</span>
          <Link to="/" className="ml-auto inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <ArrowLeft className="size-4" /> Back
          </Link>
        </div>

        <h1 className="mt-6 text-2xl font-semibold text-ink">Try MomCheck as a mother</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Tell us how far along you are. MomCheck then checks on you on the right days, in your language: you open your page, tap, and talk.
        </p>

        <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-line">
          <Field label="Your first name (or a nickname)">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required autoComplete="off" />
          </Field>
          <Field label="Language you are most comfortable in">
            <select className={inputClass} value={language} onChange={(e) => setLanguage(e.target.value as LanguageCode)}>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.native === l.name ? l.name : `${l.native} (${l.name})`}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">I am</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["pregnant", "Pregnant", <HeartHandshake key="p" className="size-5" />],
                  ["postnatal", "A new mother", <Baby key="b" className="size-5" />],
                ] as const
              ).map(([value, label, icon]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setCategory(value)}
                  className={cx(
                    "flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-medium ring-1 transition-colors",
                    category === value ? "bg-blush-600 text-white ring-blush-600" : "bg-white text-ink ring-line hover:bg-blush-50",
                  )}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>
          {category === "pregnant" ? (
            <Field label="How many weeks pregnant are you?" hint="Your MCP card shows it. A good guess is fine.">
              <input className={inputClass} type="number" inputMode="numeric" min={4} max={42} value={weeks} onChange={(e) => setWeeks(e.target.value)} required />
            </Field>
          ) : (
            <Field label="How many days ago was your baby born?" hint="MomCheck follows you and your baby for the first 6 weeks.">
              <input className={inputClass} type="number" inputMode="numeric" min={0} max={42} value={days} onChange={(e) => setDays(e.target.value)} required />
            </Field>
          )}
          <Field label="Village or area (optional)">
            <input className={inputClass} value={village} onChange={(e) => setVillage(e.target.value)} maxLength={60} autoComplete="off" />
          </Field>
          {error && <ErrorBox error={error} />}
          <Button type="submit" size="lg" loading={saving} className="w-full">
            Get my MomCheck
          </Button>
          <p className="flex gap-2 text-xs leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-700" />
            No phone number needed. This is a demo: please use a nickname and no real health records. Your entry is removed after 3 days.
            In the demo you join the list of a sample ASHA worker, who sees your check-ins and any danger sign.
          </p>
        </form>
      </div>
    </div>
  );
}
