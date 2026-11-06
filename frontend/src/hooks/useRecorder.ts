import { useCallback, useEffect, useRef, useState } from "react";
import { MicCapture, MicError, frameRms, meterLevel } from "../audio/recorder";
import { concatFloat32, toCleanWav16k } from "../audio/wav";

export type RecorderState = "idle" | "requesting" | "recording" | "processing";

export interface RecordingResult {
  wav: Blob;
  durationSec: number;
}

/**
 * One-shot microphone recorder for voice notes. Returns a 16 kHz mono WAV and
 * stops automatically after `maxSeconds`.
 */
export function useRecorder(maxSeconds = 30) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const micRef = useRef<MicCapture | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const resolveRef = useRef<((r: RecordingResult | null) => void) | null>(null);

  const teardown = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    micRef.current?.close();
    micRef.current = null;
    setLevel(0);
  }, []);

  useEffect(
    () => () => {
      resolveRef.current?.(null);
      resolveRef.current = null;
      teardown();
    },
    [teardown],
  );

  const stop = useCallback(async () => {
    const mic = micRef.current;
    if (!mic) return;
    const sampleRate = mic.sampleRate;
    const chunks = chunksRef.current;
    chunksRef.current = [];
    teardown();
    setState("processing");
    try {
      const samples = concatFloat32(chunks);
      const durationSec = samples.length / sampleRate;
      if (durationSec < 0.6) throw new Error("That was too short. Tap the mic and speak your note.");
      const wav = await toCleanWav16k(samples, sampleRate);
      resolveRef.current?.({ wav, durationSec });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't process the recording.");
      resolveRef.current?.(null);
    } finally {
      resolveRef.current = null;
      setState("idle");
    }
  }, [teardown]);

  /** Starts recording; resolves with the WAV when recording stops (manually or at the time limit). */
  const start = useCallback(async (): Promise<RecordingResult | null> => {
    setError(null);
    setState("requesting");
    let mic: MicCapture;
    try {
      mic = await MicCapture.open({ noiseSuppression: true, echoCancellation: true, autoGainControl: true });
    } catch (e) {
      setState("idle");
      setError(e instanceof MicError ? e.message : "Couldn't open the microphone.");
      return null;
    }
    micRef.current = mic;
    chunksRef.current = [];
    mic.onFrame = (f) => {
      chunksRef.current.push(f);
      setLevel(meterLevel(frameRms(f)));
    };

    const done = new Promise<RecordingResult | null>((resolve) => {
      resolveRef.current = resolve;
    });

    startedAtRef.current = Date.now();
    setElapsed(0);
    setState("recording");
    timerRef.current = window.setInterval(() => {
      const secs = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(secs);
      if (secs >= maxSeconds) void stop();
    }, 200);

    return done;
  }, [maxSeconds, stop]);

  return { state, elapsed, level, error, start, stop, maxSeconds };
}
