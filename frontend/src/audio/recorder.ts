/**
 * Microphone capture as raw PCM frames (Float32, native sample rate).
 * Capturing PCM directly (instead of MediaRecorder) avoids codec/decoding differences between browsers
 * and lets the VAD and phone-line DSP work on the samples in real time.
 */

export interface MicOptions {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error("This browser can't process audio. Please use a recent Chrome or Safari.");
  return Ctor;
}

export class MicError extends Error {}

export class MicCapture {
  readonly sampleRate: number;
  onFrame: ((frame: Float32Array) => void) | null = null;

  private constructor(
    private stream: MediaStream,
    private ctx: AudioContext,
    private source: MediaStreamAudioSourceNode,
    private processor: ScriptProcessorNode,
  ) {
    this.sampleRate = ctx.sampleRate;
    processor.onaudioprocess = (e) => {
      // getChannelData returns a reused buffer, so copy it before handing it out
      this.onFrame?.(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
  }

  static async open(opts: MicOptions = {}): Promise<MicCapture> {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new MicError("Microphone is not available. Open the app over HTTPS in Chrome or Safari.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: opts.echoCancellation ?? true,
          noiseSuppression: opts.noiseSuppression ?? true,
          autoGainControl: opts.autoGainControl ?? true,
        },
      });
    } catch {
      throw new MicError("Microphone permission was denied. Allow microphone access and try again.");
    }
    const Ctor = audioContextCtor();
    const ctx = new Ctor();
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessorNode is deprecated but works in every browser without a separate worklet module.
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    source.connect(processor);
    processor.connect(ctx.destination); // required for onaudioprocess to fire; the output stays silent
    return new MicCapture(stream, ctx, source, processor);
  }

  setMuted(muted: boolean) {
    this.stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  close() {
    this.onFrame = null;
    try {
      this.processor.onaudioprocess = null;
      this.source.disconnect();
      this.processor.disconnect();
    } catch {
      /* already disconnected */
    }
    this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx.state !== "closed") void this.ctx.close();
  }
}

export function frameRms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return frame.length ? Math.sqrt(sum / frame.length) : 0;
}

/** Maps RMS to a 0..1 meter value with a perceptual curve. */
export function meterLevel(r: number): number {
  return Math.max(0, Math.min(1, Math.sqrt(r) * 2.2));
}
