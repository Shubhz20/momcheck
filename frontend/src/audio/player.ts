/**
 * A single shared <audio> element for Janani's voice.
 * Mobile Safari only lets audio play after a user gesture, so unlockAudio() is called from the
 * "Start follow-up call" click. Reusing the same element keeps it unlocked for later replies.
 */
import { encodeWav } from "./wav";

let el: HTMLAudioElement | null = null;
let silentUrl: string | null = null;
let pending: ((r: "ended" | "stopped") => void) | null = null;

function audio(): HTMLAudioElement {
  if (!el) {
    el = new Audio();
    el.preload = "auto";
  }
  return el;
}

/** Call synchronously inside a click/tap handler. */
export function unlockAudio() {
  const a = audio();
  if (!silentUrl) silentUrl = URL.createObjectURL(encodeWav(new Float32Array(800), 8000));
  a.src = silentUrl;
  a.play()
    .then(() => a.pause())
    .catch(() => undefined);
}

export class AutoplayBlockedError extends Error {}

/** Plays a clip and resolves when it finishes ("ended") or is cut off by stopClip() ("stopped"). */
export function playClip(src: string): Promise<"ended" | "stopped"> {
  stopClip();
  const a = audio();
  return new Promise((resolve, reject) => {
    pending = resolve;
    a.onended = () => {
      pending = null;
      resolve("ended");
    };
    a.onerror = () => {
      pending = null;
      reject(new Error("Couldn't play Janani's reply."));
    };
    a.src = src;
    a.currentTime = 0;
    a.play().catch((e: unknown) => {
      pending = null;
      a.onended = null;
      a.onerror = null;
      if (e instanceof DOMException && e.name === "NotAllowedError") reject(new AutoplayBlockedError("Tap to hear Janani"));
      else reject(e instanceof Error ? e : new Error(String(e)));
    });
  });
}

export function stopClip() {
  if (!el) return;
  el.onended = null;
  el.onerror = null;
  el.pause();
  const p = pending;
  pending = null;
  p?.("stopped");
}
