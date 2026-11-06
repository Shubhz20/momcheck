import { useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Ambulance, BellRing, CalendarPlus, CalendarHeart, MessageCircleQuestion, Mic, PhoneOff, Square } from "lucide-react";
import { api } from "../api/client";
import type { AskInfo } from "../api/types";
import { playClip, stopClip, unlockAudio } from "../audio/player";
import { LogoMark } from "../components/Logo";
import { Spinner, cx } from "../components/ui";
import { useRecorder } from "../hooks/useRecorder";
import { askStrings } from "../lib/askStrings";

type Phase = "idle" | "starting" | "speaking" | "ready" | "recording" | "thinking" | "ended";

interface Line {
  who: "her" | "momcheck";
  text: string;
}

/** The mother's own page: she opens her link (or scans the QR on her card) and talks to MomCheck. No sign-in. */
export function AskMomCheckPage() {
  const { token = "" } = useParams();
  const rec = useRecorder(30);
  const [info, setInfo] = useState<AskInfo | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [callId, setCallId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [told, setTold] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .askInfo(token)
      .then(setInfo)
      .catch((e: Error) => setFatal(e.message));
    return () => stopClip();
  }, [token]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, phase]);

  // If she closes the page mid-conversation, end it so her ASHA doesn't see it as still going
  useEffect(() => {
    if (callId == null || phase === "ended" || phase === "idle") return;
    const leave = () => navigator.sendBeacon?.(`/api/ask/${token}/calls/${callId}/end`);
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [callId, phase, token]);

  const say = async (audio: string) => {
    setPhase("speaking");
    await playClip(audio).catch(() => undefined);
  };

  const start = async (mode: "ask" | "checkin") => {
    unlockAudio();
    setError(null);
    setTold(false);
    setLines([]);
    setPhase("starting");
    try {
      const r = await api.askStart(token, mode);
      setCallId(r.call_id);
      setLines([{ who: "momcheck", text: r.reply_text }]);
      await say(r.reply_audio);
      setPhase("ready");
    } catch (e) {
      setError((e as Error).message);
      setPhase("idle");
    }
  };

  const finish = async (id: number) => {
    stopClip();
    setPhase("ended");
    try {
      const r = await api.askEnd(token, id);
      if (r.asha_told) setTold(true);
    } catch {
      /* the conversation is saved turn by turn anyway */
    }
  };

  const mic = async () => {
    if (callId == null) return;
    if (phase === "speaking") {
      stopClip();
      setPhase("ready");
      return;
    }
    if (phase === "recording") {
      void rec.stop();
      return;
    }
    if (phase !== "ready") return;
    setError(null);
    setPhase("recording");
    const result = await rec.start();
    if (!result) {
      setPhase("ready");
      return;
    }
    setPhase("thinking");
    try {
      const r = await api.askTurn(token, callId, result.wav);
      setLines((l) => [...l, ...(r.user_text ? [{ who: "her" as const, text: r.user_text }] : []), { who: "momcheck", text: r.reply_text }]);
      if (r.asha_told) setTold(true);
      await say(r.reply_audio);
      if (r.end_call) await finish(callId);
      else setPhase("ready");
    } catch (e) {
      setError((e as Error).message);
      setPhase("ready");
    }
  };

  if (fatal)
    return (
      <Shell>
        <div className="mx-auto mt-24 max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-line">
          <p className="font-medium text-ink">{fatal}</p>
          <a href="tel:108" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white">
            <Ambulance className="size-4" /> 108
          </a>
        </div>
      </Shell>
    );
  if (!info)
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-6" />
        </div>
      </Shell>
    );

  const t = askStrings(info.language, info.asha_name);
  const inCall = callId != null && phase !== "ended" && phase !== "idle";

  return (
    <Shell>
      <header className="flex items-center gap-2 px-5 pt-5">
        <LogoMark className="size-8" />
        <span className="text-lg font-semibold text-ink">MomCheck</span>
        {info.asha_name && <span className="ml-auto text-xs text-muted">ASHA: {info.asha_name}</span>}
      </header>

      <div className="px-5 pt-6">
        <h1 className="text-2xl font-semibold text-ink">{info.first_name} 🙏</h1>
        <p className="mt-2 text-[17px] leading-relaxed text-ink/80">{t.intro}</p>
      </div>

      {told && (
        <div className="slide-down mx-5 mt-4 flex items-start gap-2 rounded-2xl bg-amber-100 px-4 py-3 text-[15px] font-medium text-amber-950 ring-1 ring-amber-300">
          <BellRing className="mt-0.5 size-5 shrink-0" /> {t.told}
        </div>
      )}

      {!inCall && lines.length === 0 && info.schedule.length > 0 && (
        <div className="mx-5 mt-5 rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-line">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <CalendarHeart className="size-5 text-blush-600" /> {t.schedule}
          </p>
          <ul className="mt-2 space-y-1">
            {info.schedule.slice(0, 4).map((c, i) => {
              const isToday = c.date === new Date().toLocaleDateString("en-CA");
              return (
                <li key={c.date} className={cx("flex items-center justify-between rounded-lg px-2 py-1.5 text-[15px]", i === 0 && "bg-blush-50")}>
                  <span className="text-ink">
                    {isToday ? t.today : new Date(`${c.date}T00:00:00`).toLocaleDateString(info.language, { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <span className="text-xs text-muted">{c.label}</span>
                </li>
              );
            })}
          </ul>
          <a
            href={api.askCalendarUrl(token)}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blush-50 px-3 py-2.5 text-sm font-semibold text-blush-600 ring-1 ring-blush-200"
          >
            <CalendarPlus className="size-4" /> {t.remind}
          </a>
          <p className="mt-2 text-center text-[11px] text-muted">On those days your phone reminds you. Tap it and MomCheck checks on you. Keep this page: it is your link.</p>
        </div>
      )}

      <div ref={scrollRef} className="mx-5 mt-4 flex-1 space-y-2.5 overflow-y-auto">
        {lines.map((l, i) => (
          <div key={i} className={cx("flex", l.who === "her" ? "justify-end" : "justify-start")}>
            <p
              className={cx(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-[16px] leading-relaxed",
                l.who === "her" ? "rounded-tr-sm bg-blush-100 text-ink" : "rounded-tl-sm bg-white text-ink shadow-sm ring-1 ring-line",
              )}
            >
              {l.text}
            </p>
          </div>
        ))}
        {phase === "thinking" && <p className="text-sm text-muted">{t.thinking}</p>}
      </div>

      <div className="flex flex-col items-center gap-3 px-5 pb-4 pt-5">
        {!inCall ? (
          <div className="flex w-full max-w-sm flex-col gap-2.5">
            <button
              onClick={() => void start("checkin")}
              disabled={phase === "starting"}
              className="flex h-16 w-full items-center justify-center gap-3 rounded-full bg-brand-700 text-lg font-semibold text-white shadow-xl active:scale-[0.98] disabled:opacity-60"
            >
              {phase === "starting" ? <Spinner className="size-6 text-white" /> : <Mic className="size-6" />} {t.checkin}
            </button>
            <button
              onClick={() => void start("ask")}
              disabled={phase === "starting"}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-base font-semibold text-brand-800 ring-1 ring-brand-200 active:scale-[0.98] disabled:opacity-60"
            >
              <MessageCircleQuestion className="size-5" /> {t.ask}
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => void mic()}
              disabled={phase === "thinking" || phase === "starting"}
              aria-label={phase === "recording" ? t.done : t.tap}
              className={cx(
                "flex size-28 items-center justify-center rounded-full text-white shadow-xl transition-transform active:scale-95 disabled:opacity-60",
                phase === "recording" ? "rec-pulse bg-blush-600" : "bg-brand-700",
              )}
              style={phase === "recording" ? { boxShadow: `0 0 0 ${8 + rec.level * 30}px rgb(225 29 72 / ${0.15 + rec.level * 0.2})` } : undefined}
            >
              {phase === "thinking" || phase === "starting" ? (
                <Spinner className="size-9 text-white" />
              ) : phase === "recording" ? (
                <Square className="size-10 fill-current" />
              ) : (
                <Mic className="size-12" />
              )}
            </button>
            <p className="text-base font-medium text-ink">{phase === "recording" ? t.done : phase === "thinking" ? t.thinking : t.tap}</p>
            <button onClick={() => callId != null && void finish(callId)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted hover:bg-stone-100">
              <PhoneOff className="size-4" /> End
            </button>
          </>
        )}
        {(error || rec.error) && <p className="text-center text-sm text-red-700">{error || rec.error}</p>}
        <a href="tel:108" className="mt-1 inline-flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200">
          <Ambulance className="size-4" /> {t.emergency}
        </a>
        <p className="text-center text-[11px] text-muted">MomCheck is an automated assistant, not a doctor. Built on Gnani AI speech.</p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-blush-50 via-canvas to-brand-50">
      <div className="safe-bottom mx-auto flex min-h-[100dvh] max-w-md flex-col">{children}</div>
    </div>
  );
}
