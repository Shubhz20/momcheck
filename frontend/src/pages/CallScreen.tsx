import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Hand, LayoutDashboard, Mic, MicOff, PhoneCall, PhoneOff, Radio, Square, Volume2 } from "lucide-react";
import { api } from "../api/client";
import type { Call, StartCallResponse, TurnReply, TurnTimings } from "../api/types";
import { NOISE_LEVELS, toPhoneLineWav, type NoiseLevel } from "../audio/phoneLine";
import { AutoplayBlockedError, playClip, stopClip, unlockAudio } from "../audio/player";
import { MicCapture, MicError } from "../audio/recorder";
import { UtteranceDetector } from "../audio/vad";
import { toCleanWav16k } from "../audio/wav";
import { DangerChips, OutcomeBadge, PhoneLineBadge } from "../components/badges";
import { Spinner, cx } from "../components/ui";
import { formatDuration, languageLabel, parseTimestamp } from "../lib/format";
import { loadPref, savePref } from "../lib/prefs";
import { useLanguages } from "../hooks/useLanguages";

type Phase = "loading" | "resume" | "speaking" | "listening" | "hearing" | "thinking" | "ending" | "ended" | "fatal";

interface LiveTurn {
  role: "assistant" | "user";
  content: string;
  timings?: TurnTimings;
  phoneLine?: boolean;
}

function ms(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`;
}

function TimingChips({ t }: { t: TurnTimings }) {
  const parts: string[] = [];
  if (t.stt_ms != null) parts.push(`Prisma STT ${ms(t.stt_ms)}`);
  parts.push(`Gemini ${ms(t.llm_ms)}`);
  parts.push(`Timbre TTS ${ms(t.tts_ms)}`);
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {parts.map((p) => (
        <span key={p} className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10.5px] text-brand-100/90">
          {p}
        </span>
      ))}
    </div>
  );
}

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function initialTurns(call: Call, greeting?: TurnReply): LiveTurn[] {
  const turns: LiveTurn[] = (call.transcript ?? []).map((t) => ({ role: t.role, content: t.content, phoneLine: t.role === "user" && call.phone_line }));
  if (greeting) {
    const last = [...turns].reverse().find((t) => t.role === "assistant");
    if (last && last.content.trim() === greeting.reply_text.trim()) last.timings = greeting.timings;
    else turns.push({ role: "assistant", content: greeting.reply_text, timings: greeting.timings });
  }
  return turns;
}

export function CallScreen() {
  const { callId: callIdParam } = useParams();
  const callId = Number(callIdParam);
  const location = useLocation();
  const navigate = useNavigate();
  const { languages } = useLanguages();

  const [call, setCall] = useState<Call | null>(null);
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [manual, setManual] = useState(false);
  const [level, setLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [phoneLine, setPhoneLine] = useState<boolean>(() => loadPref("js.phoneLine", true));
  const [noise, setNoise] = useState<NoiseLevel>(() => loadPref<NoiseLevel>("js.noise", "market"));
  const [alertRaised, setAlertRaised] = useState(false);
  const [blockedAudio, setBlockedAudio] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [result, setResult] = useState<Call | null>(null);
  const [endError, setEndError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const micRef = useRef<MicCapture | null>(null);
  const micPromiseRef = useRef<Promise<MicCapture> | null>(null);
  const vadRef = useRef<UtteranceDetector | null>(null);
  const endedRef = useRef(false);
  const endAfterSpeechRef = useRef(false);
  const phoneLineRef = useRef(phoneLine);
  const noiseRef = useRef(noise);
  const mutedRef = useRef(muted);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);

  phoneLineRef.current = phoneLine;
  noiseRef.current = noise;
  mutedRef.current = muted;

  useEffect(() => savePref("js.phoneLine", phoneLine), [phoneLine]);
  useEffect(() => savePref("js.noise", noise), [noise]);

  // Call timer
  useEffect(() => {
    if (phase === "ended" || phase === "loading" || phase === "fatal") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  // Keep the newest turn in view
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns, phase]);

  const teardownMic = useCallback(() => {
    vadRef.current?.destroy();
    vadRef.current = null;
    micRef.current?.close();
    micRef.current = null;
    micPromiseRef.current = null;
    setLevel(0);
  }, []);

  // Stop everything if the user leaves the screen
  useEffect(
    () => () => {
      stopClip();
      teardownMic();
    },
    [teardownMic],
  );

  // ----- conversation loop -----

  const hangUp = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    stopClip();
    teardownMic();
    setBlockedAudio(null);
    setPhase("ending");
    setEndError(null);
    try {
      const c = await api.endCall(callId);
      setResult(c);
      setCall(c);
    } catch (e) {
      setEndError((e as Error).message);
    } finally {
      setPhase("ended");
    }
  }, [callId, teardownMic]);

  const retryEnd = async () => {
    setPhase("ending");
    setEndError(null);
    try {
      const c = await api.endCall(callId);
      setResult(c);
      setCall(c);
    } catch (e) {
      setEndError((e as Error).message);
    } finally {
      setPhase("ended");
    }
  };

  const sendTurnRef = useRef<(samples: Float32Array, sr: number) => void>(() => {});

  const ensureMic = useCallback(async (): Promise<MicCapture> => {
    if (micRef.current) return micRef.current;
    if (!micPromiseRef.current) {
      // Keep real room noise (noiseSuppression off) so Prisma hears what a phone would carry
      micPromiseRef.current = MicCapture.open({ echoCancellation: true, noiseSuppression: false, autoGainControl: true }).then((mic) => {
        micRef.current = mic;
        mic.setMuted(mutedRef.current);
        vadRef.current = new UtteranceDetector(mic, {
          onState: (s, isManual) => {
            if (endedRef.current) return;
            setManual(isManual);
            if (s === "waiting") setPhase("listening");
            else if (s === "speaking") setPhase("hearing");
          },
          onLevel: (l) => setLevel(l),
          onUtterance: (samples, sr) => sendTurnRef.current(samples, sr),
        });
        return mic;
      });
      micPromiseRef.current.catch(() => {
        micPromiseRef.current = null;
      });
    }
    return micPromiseRef.current;
  }, []);

  const startListening = useCallback(async () => {
    if (endedRef.current) return;
    try {
      await ensureMic();
      if (endedRef.current) return;
      vadRef.current?.setMuted(mutedRef.current);
      vadRef.current?.listen();
      setPhase("listening");
    } catch (e) {
      setFatal(e instanceof MicError ? e.message : "Couldn't open the microphone.");
      setPhase("fatal");
    }
  }, [ensureMic]);

  const afterSpeech = useCallback(() => {
    if (endedRef.current) return;
    if (endAfterSpeechRef.current) {
      void hangUp();
      return;
    }
    // Small gap so the tail of Janani's voice isn't picked up as speech
    window.setTimeout(() => void startListening(), 250);
  }, [hangUp, startListening]);

  const speak = useCallback(
    async (reply: TurnReply) => {
      if (endedRef.current) return;
      vadRef.current?.pause();
      if (reply.end_call) endAfterSpeechRef.current = true;
      if (!reply.reply_audio) {
        afterSpeech();
        return;
      }
      setPhase("speaking");
      try {
        const r = await playClip(reply.reply_audio);
        if (r === "ended") afterSpeech();
      } catch (e) {
        if (e instanceof AutoplayBlockedError) {
          setBlockedAudio(reply.reply_audio);
        } else {
          setNotice("Couldn't play Janani's voice. Her reply is shown below.");
          afterSpeech();
        }
      }
    },
    [afterSpeech],
  );

  const sendTurn = useCallback(
    async (samples: Float32Array, sr: number) => {
      if (endedRef.current) return;
      setPhase("thinking");
      setNotice(null);
      const pl = phoneLineRef.current;
      try {
        const wav = pl ? await toPhoneLineWav(samples, sr, noiseRef.current) : await toCleanWav16k(samples, sr);
        const reply = await api.callTurn(callId, wav, pl);
        if (endedRef.current) return;
        setTurns((t) => [
          ...t,
          ...(reply.user_text ? [{ role: "user" as const, content: reply.user_text, phoneLine: pl }] : []),
          { role: "assistant" as const, content: reply.reply_text, timings: reply.timings },
        ]);
        if (reply.alert_raised) setAlertRaised(true);
        await speak(reply);
      } catch (e) {
        if (endedRef.current) return;
        setNotice(`${(e as Error).message} Please say that again.`);
        void startListening();
      }
    },
    [callId, speak, startListening],
  );
  sendTurnRef.current = (s, sr) => void sendTurn(s, sr);

  // ----- initial load -----
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const start = (location.state as { start?: StartCallResponse } | null)?.start;
    if (start && start.call.id === callId) {
      // Drop the router state so a reload doesn't replay the greeting
      navigate(location.pathname, { replace: true, state: null });
      setCall(start.call);
      setTurns(initialTurns(start.call, start.reply));
      if (start.call.status !== "in_progress") {
        endedRef.current = true;
        setResult(start.call);
        setPhase("ended");
        return;
      }
      // Ask for the mic while the greeting plays, so the permission prompt doesn't interrupt her answer
      void ensureMic().catch(() => undefined);
      void speak(start.reply);
      return;
    }
    api
      .call(callId)
      .then((c) => {
        setCall(c);
        setTurns(initialTurns(c));
        if (c.status === "in_progress") setPhase("resume");
        else {
          endedRef.current = true;
          setResult(c);
          setPhase("ended");
        }
      })
      .catch((e: Error) => {
        setFatal(e.message);
        setPhase("fatal");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  // ----- controls -----

  const onTalkButton = () => {
    const vad = vadRef.current;
    if (phase === "speaking") {
      // Interrupt Janani and answer now
      stopClip();
      setBlockedAudio(null);
      afterSpeech();
      return;
    }
    if (!vad) return;
    if (phase === "listening") vad.forceStart();
    else if (phase === "hearing") vad.finish();
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    mutedRef.current = m;
    vadRef.current?.setMuted(m);
  };

  const resume = () => {
    unlockAudio();
    void startListening();
  };

  const playBlocked = async () => {
    if (!blockedAudio) return;
    const src = blockedAudio;
    setBlockedAudio(null);
    try {
      const r = await playClip(src);
      if (r === "ended") afterSpeech();
    } catch {
      setNotice("Couldn't play Janani's voice. Her reply is shown below.");
      afterSpeech();
    }
  };

  // ----- render -----

  const name = call?.beneficiary_name ?? "…";
  const startedAt = call ? parseTimestamp(call.triggered_at).getTime() : now;
  const elapsedSec =
    phase === "ended" && result?.duration_sec != null ? result.duration_sec : Math.max(0, (now - startedAt) / 1000);
  const live = phase === "speaking" || phase === "listening" || phase === "hearing" || phase === "thinking";

  const status: Record<Phase, ReactNode> = {
    loading: "Connecting…",
    resume: "Call paused",
    speaking: blockedAudio ? "Tap to hear Janani" : "Janani is speaking…",
    listening: muted ? "Muted" : manual ? "Recording…" : "Listening… speak now",
    hearing: manual ? "Recording… tap when done" : "Hearing you…",
    thinking: "Janani is thinking…",
    ending: "Ending call and reviewing…",
    ended: "Call ended",
    fatal: "Can't continue",
  };

  if (phase === "fatal")
    return (
      <Shell>
        <div className="mx-auto mt-24 max-w-md rounded-2xl bg-white/10 p-6 text-center">
          <AlertTriangle className="mx-auto size-8 text-blush-200" />
          <p className="mt-3 font-medium">{fatal}</p>
          <div className="mt-5 flex justify-center gap-2">
            {call && (
              <button onClick={() => void hangUp()} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium">
                End call
              </button>
            )}
            <button onClick={() => navigate(-1)} className="rounded-xl bg-white/15 px-4 py-2 text-sm font-medium">
              Go back
            </button>
          </div>
        </div>
      </Shell>
    );

  return (
    <Shell>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <Link
          to={call ? `/women/${call.beneficiary_id}` : "/"}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-brand-100/80 hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="size-4" /> Profile
        </Link>
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-brand-100/70">Follow-up call</span>
        <span className="w-16" />
      </div>

      {/* Caller header */}
      <div className="flex flex-col items-center px-4 pt-6 text-center">
        <Orb phase={phase} level={level} muted={muted} name={name} />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{name}</h1>
        <p className="mt-1 text-sm text-brand-100/80">
          {call ? languageLabel(call.language, languages) : ""} · <span className="font-mono">{clock(elapsedSec)}</span>
        </p>
        <div className="mt-3 flex h-6 items-center gap-2 text-sm font-medium text-white">
          {phase === "speaking" && !blockedAudio && <EqBars />}
          {phase === "thinking" && <Dots />}
          {(phase === "loading" || phase === "ending") && <Spinner className="size-4 text-brand-100" />}
          <span>{status[phase]}</span>
        </div>
      </div>

      {/* Live danger banner */}
      {alertRaised && (
        <div className="slide-down mx-4 mt-4 flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold shadow-lg shadow-red-900/30">
          <AlertTriangle className="size-5 shrink-0" />
          Danger sign detected: ASHA alerted
        </div>
      )}
      {notice && <div className="mx-4 mt-3 rounded-xl bg-amber-400/15 px-4 py-2.5 text-sm text-amber-100">{notice}</div>}

      {/* Transcript */}
      <div ref={scrollRef} className="mx-4 mt-4 min-h-40 flex-1 space-y-3 overflow-y-auto rounded-2xl bg-black/15 p-4 ring-1 ring-white/10">
        {turns.length === 0 && phase === "loading" && <p className="text-center text-sm text-brand-100/60">Connecting the call…</p>}
        {turns.map((t, i) => (
          <div key={i} className={cx("flex", t.role === "assistant" ? "justify-start" : "justify-end")}>
            <div className={cx("max-w-[85%]", t.role === "user" && "text-right")}>
              <div className={cx("mb-0.5 text-[10.5px] font-semibold uppercase tracking-wide", t.role === "assistant" ? "text-brand-200" : "text-blush-200")}>
                {t.role === "assistant" ? "Janani" : name}
                {t.phoneLine && <span className="ml-1.5 font-normal normal-case text-white/50">📞 8 kHz</span>}
              </div>
              <div
                className={cx(
                  "inline-block rounded-2xl px-3.5 py-2 text-left text-[15px] leading-relaxed",
                  t.role === "assistant" ? "rounded-tl-sm bg-white/12 text-white" : "rounded-tr-sm bg-blush-200 text-ink",
                )}
              >
                {t.content}
              </div>
              {t.timings && <TimingChips t={t.timings} />}
            </div>
          </div>
        ))}
        {phase === "thinking" && (
          <div className="flex justify-end">
            <span className="rounded-2xl rounded-tr-sm bg-blush-200/30 px-3.5 py-2 text-sm text-white/80">
              <Dots />
            </span>
          </div>
        )}
      </div>

      {/* Result after the call */}
      {phase === "ended" && <ResultCard call={result} error={endError} onRetry={retryEnd} />}

      {/* Controls */}
      {phase !== "ended" && (
        <div className="px-4 pb-4 pt-4">
          {phase === "resume" ? (
            <button
              onClick={resume}
              className="mx-auto flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-emerald-500 text-base font-semibold text-white shadow-lg hover:bg-emerald-600"
            >
              <PhoneCall className="size-5" /> Continue call
            </button>
          ) : blockedAudio ? (
            <button
              onClick={() => void playBlocked()}
              className="mx-auto flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-white text-base font-semibold text-brand-900 shadow-lg"
            >
              <Volume2 className="size-5" /> Tap to hear Janani
            </button>
          ) : (
            <div className="flex items-end justify-center gap-6">
              <RoundButton label={muted ? "Unmute" : "Mute"} onClick={toggleMute} disabled={!live} active={muted}>
                {muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
              </RoundButton>
              <TalkButton phase={phase} manual={manual} onClick={onTalkButton} muted={muted} />
              <RoundButton label="End" onClick={() => void hangUp()} disabled={phase === "ending" || phase === "loading"} danger>
                <PhoneOff className="size-6" />
              </RoundButton>
            </div>
          )}
        </div>
      )}

      {/* Phone-line simulation */}
      <PhoneLinePanel phoneLine={phoneLine} setPhoneLine={setPhoneLine} noise={noise} setNoise={setNoise} disabled={phase === "ended"} />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-brand-900 via-[#0d3f3b] to-[#082422] text-white">
      <div className="safe-bottom mx-auto flex min-h-[100dvh] max-w-2xl flex-col">{children}</div>
    </div>
  );
}

function Orb({ phase, level, muted, name }: { phase: Phase; level: number; muted: boolean; name: string }) {
  const listening = (phase === "listening" || phase === "hearing") && !muted;
  const initial = Array.from(name.trim())[0] ?? "?";
  return (
    <div className="relative flex size-28 items-center justify-center">
      {phase === "speaking" && (
        <>
          <span className="speak-ring absolute inset-0 rounded-full" style={{ backgroundColor: "rgb(45 212 191 / 0.35)" }} />
          <span className="speak-ring delay absolute inset-0 rounded-full" style={{ backgroundColor: "rgb(45 212 191 / 0.35)" }} />
        </>
      )}
      <div
        className={cx(
          "relative flex size-28 items-center justify-center rounded-full text-4xl font-semibold transition-shadow duration-100",
          phase === "speaking" ? "bg-brand-500 text-white" : listening ? "bg-blush-200 text-blush-600" : "bg-white/15 text-white",
        )}
        style={listening ? { boxShadow: `0 0 0 ${6 + level * 26}px rgb(253 164 175 / ${0.18 + level * 0.25})` } : undefined}
      >
        {initial}
      </div>
    </div>
  );
}

function EqBars() {
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="eq-bar block h-4 w-1 rounded-full bg-brand-200" />
      ))}
    </span>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="dot-blink block size-1.5 rounded-full bg-current" />
      ))}
    </span>
  );
}

function RoundButton({
  children,
  label,
  onClick,
  disabled,
  danger,
  active,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={cx(
          "flex size-14 items-center justify-center rounded-full transition-colors disabled:opacity-40",
          danger ? "bg-red-600 hover:bg-red-700" : active ? "bg-white text-brand-900" : "bg-white/15 hover:bg-white/25",
        )}
      >
        {children}
      </button>
      <span className="text-[11px] text-brand-100/80">{label}</span>
    </div>
  );
}

function TalkButton({ phase, manual, onClick, muted }: { phase: Phase; manual: boolean; onClick: () => void; muted: boolean }) {
  let label = "Tap to talk";
  let icon: ReactNode = <Hand className="size-7" />;
  let disabled = false;
  let tone = "bg-white text-brand-900";
  if (phase === "speaking") {
    label = "Interrupt";
    icon = <Hand className="size-7" />;
  } else if (phase === "hearing") {
    label = manual ? "Done speaking" : "Done";
    icon = <Square className="size-6 fill-current" />;
    tone = "bg-blush-400 text-white rec-pulse";
  } else if (phase === "listening") {
    label = "Tap to talk";
    icon = <Mic className="size-7" />;
    disabled = muted;
  } else {
    label = phase === "thinking" ? "Please wait" : "…";
    disabled = true;
    tone = "bg-white/30 text-white";
  }
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={cx("flex size-20 items-center justify-center rounded-full shadow-xl transition-transform active:scale-95 disabled:opacity-50", tone)}
      >
        {icon}
      </button>
      <span className="text-xs font-medium text-white">{label}</span>
    </div>
  );
}

function PhoneLinePanel({
  phoneLine,
  setPhoneLine,
  noise,
  setNoise,
  disabled,
}: {
  phoneLine: boolean;
  setPhoneLine: (v: boolean) => void;
  noise: NoiseLevel;
  setNoise: (n: NoiseLevel) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mx-4 mb-4 rounded-2xl bg-black/20 p-4 ring-1 ring-white/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Radio className="size-4 text-brand-200" /> 📞 Phone-line mode
          </p>
          <p className="mt-0.5 text-xs text-brand-100/70">Simulate a noisy phone line (8 kHz)</p>
        </div>
        <button
          role="switch"
          aria-checked={phoneLine}
          aria-label="Simulate a noisy phone line (8 kHz)"
          disabled={disabled}
          onClick={() => setPhoneLine(!phoneLine)}
          className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50", phoneLine ? "bg-brand-500" : "bg-white/20")}
        >
          <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-all", phoneLine ? "left-6" : "left-1")} />
        </button>
      </div>
      <div className={cx("mt-3 transition-opacity", !phoneLine && "pointer-events-none opacity-40")}>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-brand-100/60">Background noise</p>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-white/10 p-1">
          {NOISE_LEVELS.map((n) => (
            <button
              key={n.value}
              title={n.hint}
              disabled={disabled || !phoneLine}
              onClick={() => setNoise(n.value)}
              className={cx(
                "rounded-lg px-1 py-1.5 text-xs font-medium transition-colors",
                noise === n.value ? "bg-white text-brand-900" : "text-white/80 hover:bg-white/10",
              )}
            >
              {n.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-brand-100/60">
          {phoneLine
            ? `Her voice is band-limited to 300–3400 Hz, mixed with ${NOISE_LEVELS.find((n) => n.value === noise)?.hint.toLowerCase()} noise, and sent to Prisma at 8 kHz.`
            : "Clean 16 kHz audio is sent to Prisma."}
        </p>
      </div>
    </div>
  );
}

function ResultCard({ call, error, onRetry }: { call: Call | null; error: string | null; onRetry: () => void }) {
  if (error || !call)
    return (
      <div className="mx-4 mt-4 rounded-2xl bg-white p-5 text-ink">
        <p className="font-medium">The call ended, but the review couldn't be saved.</p>
        {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
        <button onClick={onRetry} className="mt-3 rounded-xl bg-brand-700 px-4 py-2 text-sm font-medium text-white">
          Try again
        </button>
      </div>
    );
  const danger = call.outcome === "DANGER_SIGN";
  return (
    <div className={cx("slide-down mx-4 mt-4 rounded-2xl bg-white p-5 text-ink shadow-xl", danger && "ring-2 ring-red-400")}>
      <div className="flex flex-wrap items-center gap-2">
        <OutcomeBadge call={call} />
        {call.phone_line && <PhoneLineBadge />}
        {call.duration_sec != null && <span className="text-xs text-muted">{formatDuration(call.duration_sec)}</span>}
      </div>
      {danger && (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-red-700">
          <AlertTriangle className="size-4" /> The ASHA has been alerted. Please follow up today.
        </p>
      )}
      {call.danger_signs?.length > 0 && (
        <div className="mt-3">
          <DangerChips signs={call.danger_signs} />
        </div>
      )}
      {call.summary && <p className="mt-3 text-sm leading-relaxed">{call.summary}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to={`/women/${call.beneficiary_id}`}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
        >
          <ArrowLeft className="size-4" /> Back to {call.beneficiary_name}'s profile
        </Link>
        <Link to="/" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium hover:bg-stone-50">
          <LayoutDashboard className="size-4" /> Dashboard
        </Link>
      </div>
    </div>
  );
}
