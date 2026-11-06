import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, HeartHandshake, KeyRound, Languages, MapPin, ShieldCheck, UserPlus, Users } from "lucide-react";
import { api } from "../api/client";
import type { DemoAccount, LanguageCode } from "../api/types";
import { Logo } from "../components/Logo";
import { Avatar, Button, Card, ErrorBox, Field, Skeleton, cx, inputClass } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useLanguages } from "../hooks/useLanguages";

export function LoginPage() {
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const [demos, setDemos] = useState<DemoAccount[] | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [opening, setOpening] = useState<number | null>(null);

  useEffect(() => {
    api
      .demoAccounts()
      .then(setDemos)
      .catch((e) => setDemoError((e as Error).message));
  }, []);

  const openDemo = async (id: number) => {
    setOpening(id);
    setDemoError(null);
    try {
      signedIn(await api.demoLogin(id));
      navigate("/", { replace: true });
    } catch (e) {
      setDemoError((e as Error).message);
      setOpening(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 via-canvas to-canvas">
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <Logo />

        <div className="mt-8 max-w-2xl md:mt-12">
          <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">Follow-up calls for every mother, in her own language</h1>
          <p className="mt-3 text-base leading-relaxed text-muted">
            MomCheck calls the pregnant women and new mothers an ASHA worker looks after. It checks for danger signs, reminds them about
            visits, and alerts the ASHA the moment something is wrong.
          </p>
        </div>

        <section className="mt-8">
          <Link
            to="/join"
            className="group flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-r from-blush-100 via-blush-50 to-white p-5 ring-1 ring-blush-200 transition hover:ring-blush-400"
          >
            <div className="rounded-full bg-blush-600 p-3 text-white">
              <HeartHandshake className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-ink">Try it as a mother</p>
              <p className="text-sm text-muted">
                Tell MomCheck how far along you are, then talk to it on your phone in your language. No sign-up, no phone number.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-blush-600">
              Start <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </section>

        <section className="mt-10">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-ink">Try it as an ASHA worker</h2>
              <p className="text-sm text-muted">Shared demo accounts. All names and numbers are made up.</p>
            </div>
          </div>
          {demoError && (
            <div className="mb-3">
              <ErrorBox error={demoError} />
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {demos === null && !demoError
              ? [0, 1].map((i) => <Skeleton key={i} className="h-44" />)
              : demos?.map((d) => <DemoCard key={d.id} demo={d} opening={opening === d.id} disabled={opening !== null} onOpen={() => void openDemo(d.id)} />)}
          </div>
        </section>

        <section className="mt-10 grid gap-6 md:grid-cols-5">
          <div className="md:col-span-3">
            <AccountForms />
          </div>
          <aside className="space-y-3 text-sm text-muted md:col-span-2">
            <p className="flex gap-2">
              <Users className="mt-0.5 size-4 shrink-0 text-brand-700" />
              Each ASHA sees only her own women, calls, alerts and notes.
            </p>
            <p className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-700" />
              MomCheck screens and reminds. It never diagnoses or prescribes, and every danger sign goes to a health worker.
            </p>
            <p className="flex gap-2">
              <Languages className="mt-0.5 size-4 shrink-0 text-brand-700" />
              Speech by Gnani AI (Prisma speech-to-text, Timbre text-to-speech, voice cloning) in 10 Indian languages. Reasoning by Gemini.
            </p>
          </aside>
        </section>
      </div>
    </div>
  );
}

function DemoCard({ demo, opening, disabled, onOpen }: { demo: DemoAccount; opening: boolean; disabled: boolean; onOpen: () => void }) {
  const { languages } = useLanguages();
  const native = (code: LanguageCode) => languages.find((l) => l.code === code)?.native ?? code;
  const multi = demo.languages.length > 1;
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <Avatar name={demo.name} tone="rose" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{demo.name}</p>
          <p className="flex items-center gap-1 text-sm text-muted">
            <MapPin className="size-3.5 shrink-0" />
            {demo.area}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm text-ink">
        {demo.women} women
        {multi ? ` from migrant families, speaking ${demo.languages.length} languages` : `, all speaking ${languages.find((l) => l.code === demo.languages[0])?.name ?? "one language"}`}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {demo.languages.map((code) => (
          <span key={code} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-800 ring-1 ring-inset ring-brand-100">
            {native(code)}
          </span>
        ))}
      </div>
      <div className="mt-auto pt-5">
        <Button onClick={onOpen} loading={opening} disabled={disabled} icon={!opening ? <ArrowRight className="size-4" /> : undefined} className="w-full sm:w-auto">
          Open as {demo.name.split(" ")[0]}
        </Button>
      </div>
    </Card>
  );
}

function AccountForms() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  return (
    <Card className="p-5 md:p-6">
      <div className="mb-5 inline-flex rounded-xl bg-stone-100 p-1 text-sm font-medium" role="tablist">
        {(
          [
            ["signin", "Sign in", <KeyRound key="k" className="size-4" />],
            ["signup", "Create an account", <UserPlus key="u" className="size-4" />],
          ] as const
        ).map(([key, label, icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={cx("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5", mode === key ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      {mode === "signin" ? <SignInForm /> : <SignUpForm />}
    </Card>
  );
}

function SignInForm() {
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      signedIn(await api.login(phone, pin));
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Your mobile number">
        <input className={inputClass} inputMode="tel" autoComplete="tel" placeholder="10-digit number" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </Field>
      <Field label="PIN">
        <input className={inputClass} type="password" inputMode="numeric" autoComplete="current-password" placeholder="4 to 6 digits" value={pin} onChange={(e) => setPin(e.target.value)} required />
      </Field>
      {error && <ErrorBox error={error} />}
      <Button type="submit" loading={busy} className="w-full sm:w-auto">
        Sign in
      </Button>
    </form>
  );
}

function SignUpForm() {
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const { languages } = useLanguages();
  const [form, setForm] = useState({ name: "", phone: "", area: "", language: "hi-IN" as LanguageCode, pin: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(form.pin)) {
      setError("PIN must be 4 to 6 digits");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      signedIn(await api.signup(form));
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Your name">
        <input className={inputClass} autoComplete="name" value={form.name} onChange={set("name")} required />
      </Field>
      <Field label="Your mobile number" hint="You sign in with this">
        <input className={inputClass} inputMode="tel" autoComplete="tel" placeholder="10-digit number" value={form.phone} onChange={set("phone")} required />
      </Field>
      <Field label="Village or ward you cover">
        <input className={inputClass} value={form.area} onChange={set("area")} required />
      </Field>
      <Field label="Your language" hint="For your spoken daily briefing">
        <select className={inputClass} value={form.language} onChange={set("language")}>
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.native === l.name ? l.name : `${l.native} (${l.name})`}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Choose a PIN" hint="4 to 6 digits">
        <input className={inputClass} type="password" inputMode="numeric" autoComplete="new-password" value={form.pin} onChange={set("pin")} required />
      </Field>
      <div className="sm:col-span-2">
        {error && (
          <div className="mb-3">
            <ErrorBox error={error} />
          </div>
        )}
        <Button type="submit" loading={busy} className="w-full sm:w-auto">
          Create account
        </Button>
      </div>
    </form>
  );
}
