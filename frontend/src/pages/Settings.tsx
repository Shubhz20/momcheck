import { useEffect, useState } from "react";
import { AudioLines, Building2, Check, Gauge, Hospital, Mic, Play, ShieldCheck, Square, Trash2, UserRound } from "lucide-react";
import { api } from "../api/client";
import type { Facilities, LanguageCode, UsageReport } from "../api/types";
import { playClip, stopClip, unlockAudio } from "../audio/player";
import { useToast } from "../components/Toast";
import { Button, Card, ErrorBox, Field, PageHeader, SectionHeader, Spinner, cx, inputClass } from "../components/ui";
import { useAuth, useMe } from "../hooks/useAuth";
import { useLanguages } from "../hooks/useLanguages";
import { useRecorder } from "../hooks/useRecorder";
import { formatDateTime } from "../lib/format";

export function SettingsPage() {
  return (
    <>
      <PageHeader title="My voice & settings" subtitle="Make MomCheck sound like you, and tell it where to send women in an emergency." />
      <div className="grid gap-6 lg:grid-cols-2">
        <VoiceCard />
        <FacilitiesCard />
        <UsageCard />
      </div>
    </>
  );
}

/** Gnani voice cloning: she reads a short consent passage once; MomCheck then speaks to her women in her voice. */
function VoiceCard() {
  const me = useMe();
  const { signedIn } = useAuth();
  const toast = useToast();
  const { languages } = useLanguages();
  const rec = useRecorder(30);
  const [script, setScript] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewLang, setPreviewLang] = useState<LanguageCode>("ta-IN");
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    api
      .voiceScript()
      .then((s) => setScript(s.text))
      .catch(() => setScript(null));
    return () => stopClip();
  }, []);

  const record = async () => {
    if (rec.state === "recording") {
      void rec.stop();
      return;
    }
    setError(null);
    const result = await rec.start();
    if (!result) return;
    setSaving(true);
    try {
      signedIn(await api.setVoice(result.wav));
      toast.success("Your voice is ready. Calls will now use it.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const preview = async () => {
    unlockAudio();
    setPreviewing(true);
    setError(null);
    try {
      const r = await api.previewVoice(previewLang);
      await playClip(r.audio);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const toggle = async () => {
    try {
      signedIn(await api.updateSettings({ use_own_voice: !me.use_own_voice }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete your voice? Calls will use MomCheck's standard voice.")) return;
    try {
      signedIn(await api.deleteVoice());
      toast.success("Your voice was deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const recording = rec.state === "recording";

  return (
    <section>
      <SectionHeader title="Calls in your own voice" subtitle="Women pick up and trust a voice they know" />
      <Card className="p-5">
        {me.has_voice ? (
          <>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-blush-50 p-2.5 text-blush-600">
                <AudioLines className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">Your voice is ready</p>
                <p className="text-sm text-muted">Recorded with your consent on {formatDateTime(me.voice_consent_at)}. It can speak all 10 languages.</p>
              </div>
            </div>
            <label className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2.5">
              <span className="text-sm text-ink">Use my voice for calls and the interpreter</span>
              <button
                role="switch"
                aria-checked={me.use_own_voice}
                onClick={() => void toggle()}
                className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", me.use_own_voice ? "bg-brand-600" : "bg-stone-300")}
              >
                <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-all", me.use_own_voice ? "left-6" : "left-1")} />
              </button>
            </label>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1">
                <Field label="Hear yourself speak">
                  <select className={inputClass} value={previewLang} onChange={(e) => setPreviewLang(e.target.value as LanguageCode)}>
                    {languages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.native === l.name ? l.name : `${l.native} (${l.name})`}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Button variant="secondary" onClick={() => void preview()} loading={previewing} icon={<Play className="size-4" />}>
                Play sample
              </Button>
              <Button variant="ghost" onClick={() => void remove()} icon={<Trash2 className="size-4" />} className="text-red-700 hover:bg-red-50">
                Delete
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              Read the passage below aloud once (about 15 seconds). Gnani voice cloning learns your voice, and MomCheck then calls your women in it,
              in any of the 10 languages. It always tells them it is an automated assistant.
            </p>
            <div className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-[15px] leading-relaxed text-brand-950 ring-1 ring-brand-100">
              {script ?? <Spinner className="size-4" />}
            </div>
            <label className="mt-4 flex items-start gap-2.5 text-sm text-ink">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-brand-700" />
              <span>
                This is my own voice, and I agree that MomCheck may use it to speak with the women I look after. I can delete it at any time.
              </span>
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void record()}
                disabled={!consent || saving || rec.state === "requesting" || rec.state === "processing"}
                loading={saving}
                variant={recording ? "danger" : "primary"}
                icon={recording ? <Square className="size-4 fill-current" /> : <Mic className="size-4" />}
              >
                {saving ? "Learning your voice…" : recording ? `Recording… ${Math.ceil(rec.elapsed)}s, tap when done` : "Record the passage"}
              </Button>
              {recording && <span className="h-2 rounded-full bg-blush-500 transition-all" style={{ width: `${20 + rec.level * 120}px` }} />}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="size-3.5" /> MomCheck checks that the recording is this passage, read live, before using it.
            </p>
          </>
        )}
        {(error || rec.error) && (
          <div className="mt-4">
            <ErrorBox error={(error || rec.error) as string} />
          </div>
        )}
      </Card>
    </section>
  );
}

/** Her referral places: MomCheck names them on calls, and alerts show them as next steps. */
function FacilitiesCard() {
  const me = useMe();
  const { signedIn } = useAuth();
  const toast = useToast();
  const [f, setF] = useState<Facilities>(me.facilities ?? {});
  const [saving, setSaving] = useState(false);

  const set = (kind: keyof Facilities, key: "name" | "phone", value: string) =>
    setF((cur) => ({ ...cur, [kind]: { name: "", phone: "", ...cur[kind], [key]: value } }));

  const save = async () => {
    setSaving(true);
    try {
      signedIn(await api.updateSettings({ facilities: f }));
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const rows: { kind: keyof Facilities; title: string; hint: string; icon: JSX.Element }[] = [
    { kind: "hospital", title: "Hospital for emergencies (FRU)", hint: "Where MomCheck tells her to go for a RED sign", icon: <Hospital className="size-4" /> },
    { kind: "phc", title: "Nearest health centre (PHC)", hint: "For AMBER signs that get worse", icon: <Building2 className="size-4" /> },
    { kind: "anm", title: "Your ANM", hint: "Shown on RED alerts so you can tell her", icon: <UserRound className="size-4" /> },
  ];

  return (
    <section>
      <SectionHeader title="Where you send women" subtitle="MomCheck names these on calls and in alerts" />
      <Card className="space-y-5 p-5">
        {rows.map((r) => (
          <div key={r.kind}>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              {r.icon} {r.title}
            </p>
            <p className="text-xs text-muted">{r.hint}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
              <input className={inputClass} placeholder="Name" value={f[r.kind]?.name ?? ""} onChange={(e) => set(r.kind, "name", e.target.value)} />
              <input className={inputClass} placeholder="Phone" inputMode="tel" value={f[r.kind]?.phone ?? ""} onChange={(e) => set(r.kind, "phone", e.target.value)} />
            </div>
          </div>
        ))}
        <Button onClick={() => void save()} loading={saving} icon={<Check className="size-4" />}>
          Save
        </Button>
      </Card>
    </section>
  );
}

/** The owner's view of the paid APIs: today's use against the daily caps that protect the credits. */
function UsageCard() {
  const me = useMe();
  const [data, setData] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (me.is_demo) return;
    api
      .usage()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [me.is_demo]);
  if (me.is_demo) return null;

  const rows: { label: string; used: number; cap: number; unit: (n: number) => string }[] = data
    ? [
        { label: "Prisma speech-to-text", used: data.today.stt_seconds ?? 0, cap: data.caps.stt_seconds, unit: (n) => `${(n / 60).toFixed(1)} min` },
        { label: "Timbre speech + voice cloning", used: data.today.tts_chars ?? 0, cap: data.caps.tts_chars, unit: (n) => `${Math.round(n).toLocaleString("en-IN")} chars` },
        { label: "Gemini requests", used: data.today.llm_requests ?? 0, cap: data.caps.llm_requests, unit: (n) => Math.round(n).toLocaleString("en-IN") },
      ]
    : [];

  return (
    <section className="lg:col-span-2">
      <SectionHeader title="API use today" subtitle="Only you see this. Caps stop the public demo from using up your credits." />
      <Card className="p-5">
        {error && <ErrorBox error={error} />}
        {!data && !error && <Spinner className="size-5" />}
        {data && (
          <div className="grid gap-4 md:grid-cols-3">
            {rows.map((r) => {
              const share = r.cap > 0 ? Math.min(1, r.used / r.cap) : 0;
              const tone = share >= 0.9 ? "bg-red-600" : share >= 0.6 ? "bg-amber-500" : "bg-brand-600";
              const track = share >= 0.9 ? "bg-red-100" : share >= 0.6 ? "bg-amber-100" : "bg-brand-100";
              return (
                <div key={r.label}>
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    <Gauge className="size-4 text-brand-700" /> {r.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-ink">
                    {r.unit(r.used)} <span className="text-sm font-normal text-muted">of {r.cap > 0 ? r.unit(r.cap) : "no cap"}</span>
                  </p>
                  <div className={cx("mt-1.5 h-2 overflow-hidden rounded-full", track)}>
                    <div className={cx("h-full rounded-full", tone)} style={{ width: `${Math.max(2, share * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-xs text-muted">
          Your remaining Gnani credits are on the Usage page at app.gnani.ai/voice. Change the caps with DAILY_STT_SECONDS, DAILY_TTS_CHARS and
          DAILY_LLM_REQUESTS on Render. Demo visitors also get a daily allowance each.
        </p>
      </Card>
    </section>
  );
}
