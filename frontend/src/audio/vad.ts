/**
 * Energy-based voice activity detection over MicCapture frames.
 *
 * - "waiting": tracks an adaptive noise floor and starts an utterance when the RMS stays above
 *   max(minThreshold, noiseFloor × 2.5) for two consecutive frames. Keeps a short pre-roll so the
 *   first syllable isn't clipped.
 * - "speaking": collects frames and ends the utterance after `silenceMs` of quiet, or at `maxMs`.
 *   Blips shorter than `minSpeechMs` of voiced audio are discarded.
 * - Manual mode (forceStart): records until finish() is called. This is the push-to-talk fallback.
 */
import { MicCapture, frameRms, meterLevel } from "./recorder";
import { concatFloat32 } from "./wav";

export type VadState = "paused" | "waiting" | "speaking";

export interface VadOptions {
  silenceMs?: number;
  maxMs?: number;
  minSpeechMs?: number;
  preRollMs?: number;
  minThreshold?: number;
}

export interface VadHandlers {
  onState?: (s: VadState, manual: boolean) => void;
  onLevel?: (level: number) => void;
  onUtterance: (samples: Float32Array, sampleRate: number) => void;
}

export class UtteranceDetector {
  private state: VadState = "paused";
  private manual = false;
  private noiseFloor = 0.008;
  private threshold = 0.02;
  private loudFrames = 0;
  private preRoll: Float32Array[] = [];
  private preRollLen = 0;
  private chunks: Float32Array[] = [];
  private totalMs = 0;
  private voicedMs = 0;
  private silenceRunMs = 0;
  private muted = false;
  private readonly o: Required<VadOptions>;

  constructor(
    private mic: MicCapture,
    private h: VadHandlers,
    opts: VadOptions = {},
  ) {
    this.o = {
      silenceMs: opts.silenceMs ?? 1200,
      maxMs: opts.maxMs ?? 25000,
      minSpeechMs: opts.minSpeechMs ?? 280,
      preRollMs: opts.preRollMs ?? 350,
      minThreshold: opts.minThreshold ?? 0.012,
    };
    mic.onFrame = (f) => this.onFrame(f);
  }

  get current(): VadState {
    return this.state;
  }

  get isManual(): boolean {
    return this.manual;
  }

  private setState(s: VadState) {
    this.state = s;
    this.h.onState?.(s, this.manual);
  }

  /** Start waiting for her to speak. */
  listen() {
    this.manual = false;
    this.chunks = [];
    this.loudFrames = 0;
    this.setState("waiting");
  }

  /** Stop listening (e.g. while MomCheck is speaking). Discards any partial utterance. */
  pause() {
    this.manual = false;
    this.chunks = [];
    this.setState("paused");
  }

  /** Push-to-talk: begin an utterance now and keep recording until finish(). */
  forceStart() {
    this.manual = true;
    this.beginUtterance();
  }

  /** End the current utterance now ("tap when done"). Returns false if nothing was being recorded. */
  finish(): boolean {
    if (this.state !== "speaking") return false;
    this.finalize(true);
    return true;
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.mic.setMuted(m);
    if (m && this.state === "speaking" && !this.manual) {
      // Muting mid-utterance: treat what we have as the end of her turn
      this.finalize(false);
    }
  }

  destroy() {
    this.mic.onFrame = null;
    this.state = "paused";
  }

  private beginUtterance() {
    this.chunks = [...this.preRoll];
    this.totalMs = 0;
    this.voicedMs = 0;
    this.silenceRunMs = 0;
    this.setState("speaking");
  }

  private onFrame(frame: Float32Array) {
    const level = this.muted ? 0 : frameRms(frame);
    this.h.onLevel?.(meterLevel(level));
    const frameMs = (frame.length / this.mic.sampleRate) * 1000;

    // Pre-roll ring buffer (always maintained so a forced start also gets it)
    this.preRoll.push(frame);
    this.preRollLen += frameMs;
    while (this.preRollLen > this.o.preRollMs && this.preRoll.length > 1) {
      const dropped = this.preRoll.shift()!;
      this.preRollLen -= (dropped.length / this.mic.sampleRate) * 1000;
    }

    if (this.state === "paused" || this.muted) return;

    if (this.state === "waiting") {
      const th = Math.max(this.o.minThreshold, this.noiseFloor * 2.5);
      if (level < th) {
        // Track the room's noise floor slowly, so a noisy room raises the bar
        this.noiseFloor = this.noiseFloor * 0.96 + level * 0.04;
        this.loudFrames = 0;
      } else {
        this.loudFrames++;
      }
      if (this.loudFrames >= 2) {
        this.threshold = th;
        this.beginUtterance();
      }
      return;
    }

    // speaking
    this.chunks.push(frame);
    this.totalMs += frameMs;
    if (level >= this.threshold * 0.7) {
      this.voicedMs += frameMs;
      this.silenceRunMs = 0;
    } else {
      this.silenceRunMs += frameMs;
    }
    if (this.totalMs >= this.o.maxMs) this.finalize(true);
    else if (!this.manual && this.silenceRunMs >= this.o.silenceMs) this.finalize(false);
  }

  private finalize(force: boolean) {
    const sr = this.mic.sampleRate;
    if (!force && this.voicedMs < this.o.minSpeechMs) {
      // A cough or a bang, not speech: keep waiting
      this.chunks = [];
      this.manual = false;
      this.setState("waiting");
      return;
    }
    let samples = concatFloat32(this.chunks);
    // Trim trailing silence but keep ~250 ms of tail
    if (!this.manual && this.silenceRunMs > 250) {
      const trim = Math.floor(((this.silenceRunMs - 250) / 1000) * sr);
      samples = samples.subarray(0, Math.max(0, samples.length - trim));
    }
    this.chunks = [];
    this.manual = false;
    this.setState("paused");
    if (samples.length > sr * 0.2) this.h.onUtterance(samples, sr);
    else this.listen();
  }
}
