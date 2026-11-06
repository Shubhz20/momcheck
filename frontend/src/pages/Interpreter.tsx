import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Languages, Mic, Square } from "lucide-react";
import { api } from "../api/client";
import type { Call, LiveState, TranscriptTurn } from "../api/types";
import { playClip, stopClip, unlockAudio } from "../audio/player";
import { OutcomeBadge, OwnVoiceBadge } from "../components/badges";
import { SafetyPanel } from "../components/SafetyPanel";
import { Avatar, Button, Card, ErrorBox, Skeleton, Spinner, cx } from "../components/ui";
import { useMe } from "../hooks/useAuth";
import { useLanguages } from "../hooks/useLanguages";
import { useRecorder } from "../hooks/useRecorder";
import { languageName } from "../lib/format";

type Speaker = "asha" | "mother";

/**
 * Home-visit interpreter: the ASHA and the woman speak different languages. Each taps her own button and
 * speaks; MomCheck says it in the other's language (to the woman, in the ASHA's own voice if she recorded it).
 */
export function InterpreterPage() {
  const { callId } = useParams();
  const id = Number(callId);
  const me = useMe();
  const { languages } = useLanguages();
  const rec = useRecorder(30);
  const [call, setCall] = useState<Call | null>(null);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [live, setLive] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [busy, setBusy] = useState<Speaker | null>(null);
  const [playing, setPlaying] = useState<Speaker | null>(null);
  const [ending, setEnding] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .call(id)
      .then((c) => {
        setCall(c);
        setTurns(c.transcript);
        setLive({ checklist: c.checklist, triage: c.triage, danger_signs: c.danger_signs });
      })
      .catch((e: Error) => setError(e.message));
    return () => stopClip();
  }, [id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const native = (code: string) => languages.find((l) => l.code === code)?.native ?? languageName(code);

  const talk = async (who: Speaker) => {
    if (!call) return;
    if (rec.state === "recording") {
      if (speaker === who) void rec.stop();
      return;
    }
    unlockAudio();
    stopClip();
    setError(null);
    setSpeaker(who);
    const result = await rec.start();
    setSpeaker(null);
    if (!result) return;
    setBusy(who);
    try {
      const r = await api.interpret(call.id, result.wav, who);
      setTurns((t) => [
        ...t,
        { role: who === "asha" ? "asha" : "user", content: r.text, language: r.language, translation: r.translation, translation_language: r.translation_language, en: r.english ?? undefined },
      ]);
      setLive({ checklist: r.checklist, triage: r.triage, danger_signs: r.danger_signs });
      setBusy(null);
      setPlaying(who === "asha" ? "mother" : "asha");
      await playClip(r.audio).catch(() => undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      setPlaying(null);
    }
  };

  const end = async () => {
    if (!call) return;
    setEnding(true);
    stopClip();
    try {
      const c = await api.endCall(call.id);
      setCall(c);
      setLive({ checklist: c.checklist, triage: c.triage, danger_signs: c.danger_signs });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnding(false);
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

  const first = call.beneficiary_name.split(" ")[0];
  const ashaFirst = me.name.split(" ")[0];
  const ended = call.status !== "in_progress";

  const sides: { who: Speaker; name: string; lang: string; hint: string }[] = [
    { who: "asha", name: ashaFirst, lang: me.language, hint: `${first} hears it in ${languageName(call.language)}` },
    { who: "mother", name: first, lang: call.language, hint: `You hear it in ${languageName(me.language)}` },
  ];

  return (
    <>
      <Link to={`/women/${call.beneficiary_id}`} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> {call.beneficiary_name}
      </Link>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-sky-50 via-white to-blush-50 p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl bg-sky-100 p-2 text-sky-700">
                <Languages className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold text-ink">Interpreter</h1>
                <p className="text-sm text-muted">
                  {native(me.language)} <ArrowRight className="inline size-3.5" /> {native(call.language)} and back · Gnani Prisma hears, Gemini translates, Gnani speaks
                </p>
              </div>
              {ended ? (
                <OutcomeBadge call={call} />
              ) : (
                <Button variant="secondary" onClick={() => void end()} loading={ending} icon={<Check className="size-4" />}>
                  End and save
                </Button>
              )}
            </div>
            {call.own_voice && !ended && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                <OwnVoiceBadge name={me.name} /> {first} hears your words in your own voice, in {languageName(call.language)}.
              </p>
            )}

            {!ended && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {sides.map((s) => {
                  const recording = speaker === s.who && rec.state === "recording";
                  const translating = busy === s.who;
                  const hearing = playing === s.who;
                  const disabled = (rec.state === "recording" && !recording) || busy !== null || rec.state === "requesting" || rec.state === "processing";
                  return (
                    <button
                      key={s.who}
                      onClick={() => void talk(s.who)}
                      disabled={disabled}
                      className={cx(
                        "flex items-center gap-4 rounded-2xl p-4 text-left shadow-sm ring-1 transition-colors disabled:opacity-50",
                        recording
                          ? "bg-blush-600 text-white ring-blush-600"
                          : s.who === "asha"
                            ? "bg-white ring-sky-200 hover:bg-sky-50"
                            : "bg-white ring-blush-200 hover:bg-blush-50",
                      )}
                    >
                      <span
                        className={cx(
                          "flex size-14 shrink-0 items-center justify-center rounded-full",
                          recording ? "rec-pulse bg-white/20" : s.who === "asha" ? "bg-sky-600 text-white" : "bg-blush-600 text-white",
                        )}
                        style={recording ? { boxShadow: `0 0 0 ${4 + rec.level * 18}px rgb(255 255 255 / 0.25)` } : undefined}
                      >
                        {translating ? <Spinner className="size-6 text-white" /> : recording ? <Square className="size-5 fill-current" /> : <Mic className="size-6" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-base font-semibold">
                          {recording ? `${s.name} is speaking… tap when done` : translating ? "Translating…" : hearing ? `${s.name} is hearing…` : `${s.name} speaks`}
                        </span>
                        <span className={cx("block text-sm", recording ? "text-white/80" : "text-muted")}>
                          {native(s.lang)} · {s.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {(error || rec.error) && (
              <div className="mt-4">
                <ErrorBox error={(error || rec.error) as string} />
              </div>
            )}
            {ended && call.summary && <p className="mt-4 rounded-xl bg-white/80 px-3 py-2 text-sm text-ink ring-1 ring-line">{call.summary}</p>}
          </div>

          <div ref={scrollRef} className="max-h-[55vh] space-y-3 overflow-y-auto border-t border-line p-5 md:p-6">
            {turns.length === 0 && !busy && (
              <p className="text-sm text-muted">
                Hold the phone between you. Tap your button, speak, and tap again. MomCheck says it in the other language. Danger signs {first}{" "}
                mentions alert you automatically.
              </p>
            )}
            {turns.map((t, i) => {
              const asha = t.role === "asha";
              return (
                <div key={i} className={cx("flex items-start gap-2.5", !asha && "flex-row-reverse")}>
                  <Avatar name={asha ? me.name : call.beneficiary_name} tone={asha ? "brand" : "rose"} />
                  <div className={cx("max-w-[80%] rounded-2xl px-3.5 py-2.5", asha ? "rounded-tl-sm bg-sky-50" : "rounded-tr-sm bg-blush-50")}>
                    <p className="text-[15px] leading-relaxed text-ink">{t.content}</p>
                    {t.translation && (
                      <p className="mt-1.5 border-t border-black/5 pt-1.5 text-[15px] leading-relaxed text-ink">
                        <span className="mr-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">{native(t.translation_language ?? "")}</span>
                        {t.translation}
                      </p>
                    )}
                    {t.en && <p className="mt-1 text-[12.5px] italic text-muted">{t.en}</p>}
                  </div>
                </div>
              );
            })}
            {busy && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Spinner className="size-4" /> Gnani Prisma is listening, then translating…
              </p>
            )}
          </div>
        </Card>

        <aside className="space-y-4">
          {live && <SafetyPanel checklist={live.checklist} triage={live.triage} />}
          {ended && (
            <Link
              to={`/women/${call.beneficiary_id}`}
              className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-stone-50"
            >
              Back to {first}'s profile
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
