/**
 * Phone-line simulator: makes a clean browser recording sound like a call from a busy place,
 * so the demo exercises Prisma STT on realistic telephony audio.
 *
 *   speech + procedural background noise (at a target SNR)
 *     → band-pass 300–3400 Hz (BiquadFilterNode, the classic narrowband channel)
 *     → resample to 8 kHz (OfflineAudioContext)
 *     → G.711 µ-law companding round trip (8-bit quantisation artefacts)
 *
 * No external noise files: pink/brown noise, crowd-like modulation and clatter bursts are generated here.
 */
import { activeRms, encodeWav, makeBuffer, resample, resampleLinear } from "./wav";

export type NoiseLevel = "off" | "low" | "market" | "very_noisy";

export const NOISE_LEVELS: { value: NoiseLevel; label: string; hint: string; snrDb: number | null }[] = [
  { value: "off", label: "Off", hint: "Line only", snrDb: null },
  { value: "low", label: "Low", hint: "Quiet room, ~20 dB SNR", snrDb: 20 },
  { value: "market", label: "Market", hint: "Busy street, ~10 dB SNR", snrDb: 10 },
  { value: "very_noisy", label: "Very noisy", hint: "Crowd and traffic, ~4 dB SNR", snrDb: 4 },
];

export const PHONE_RATE = 8000;

// ---------- procedural noise ----------

function pinkNoise(n: number): Float32Array {
  // Paul Kellet's refined pink-noise filter
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  return out;
}

function brownNoise(n: number): Float32Array {
  const out = new Float32Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    out[i] = last * 3.5;
  }
  return out;
}

/** Slow random amplitude envelope (0.35–1.0) that makes steady noise feel like a crowd. */
function crowdEnvelope(n: number, sr: number): Float32Array {
  const env = new Float32Array(n);
  const parts = Array.from({ length: 3 }, () => ({ f: 0.3 + Math.random() * 2.2, p: Math.random() * Math.PI * 2 }));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    for (const { f, p } of parts) v += Math.sin(2 * Math.PI * f * t + p);
    env[i] = 0.675 + 0.325 * (v / 3);
  }
  return env;
}

/** Short decaying bursts (utensils, horns, doors) at random intervals. */
function addClatter(buf: Float32Array, sr: number, ratePerSec: number, gain: number) {
  let i = Math.floor(Math.random() * sr * 0.5);
  while (i < buf.length) {
    const len = Math.floor(sr * (0.03 + Math.random() * 0.07));
    const amp = gain * (0.5 + Math.random());
    for (let k = 0; k < len && i + k < buf.length; k++) {
      buf[i + k] += (Math.random() * 2 - 1) * amp * Math.exp((-5 * k) / len);
    }
    i += Math.floor(sr * ((0.5 + Math.random()) / ratePerSec));
  }
}

function normalizeRms(buf: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  const r = Math.sqrt(s / Math.max(1, buf.length)) || 1;
  for (let i = 0; i < buf.length; i++) buf[i] /= r;
  return buf;
}

export function generateNoise(level: NoiseLevel, n: number, sr: number): Float32Array {
  if (level === "off") return new Float32Array(n);
  if (level === "low") return normalizeRms(pinkNoise(n));
  const pink = pinkNoise(n);
  const brown = brownNoise(n);
  const env = crowdEnvelope(n, sr);
  const out = new Float32Array(n);
  const brownMix = level === "very_noisy" ? 0.7 : 0.4;
  for (let i = 0; i < n; i++) out[i] = (pink[i] * (1 - brownMix) + brown[i] * brownMix) * env[i];
  normalizeRms(out);
  addClatter(out, sr, level === "very_noisy" ? 1.6 : 0.8, level === "very_noisy" ? 1.4 : 0.9);
  return normalizeRms(out);
}

// ---------- channel ----------

const MU = 255;
function mulawRoundTrip(x: Float32Array): Float32Array {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const s = Math.max(-1, Math.min(1, x[i]));
    const y = (Math.sign(s) * Math.log1p(MU * Math.abs(s))) / Math.log1p(MU);
    const q = Math.round(y * 127) / 127; // 8-bit code
    out[i] = (Math.sign(q) * (Math.pow(1 + MU, Math.abs(q)) - 1)) / MU;
  }
  return out;
}

/** RBJ biquad, used only if BiquadFilterNode rendering isn't available. */
function biquadJs(x: Float32Array, sr: number, type: "highpass" | "lowpass", f0: number, q = 0.707): Float32Array {
  const w0 = (2 * Math.PI * f0) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (type === "lowpass") {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const out = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

async function bandpass(samples: Float32Array, sr: number): Promise<Float32Array> {
  try {
    const ctx = new OfflineAudioContext(1, Math.max(1, samples.length), sr);
    const src = ctx.createBufferSource();
    src.buffer = makeBuffer(ctx, samples, sr);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 300;
    hp.Q.value = 0.707;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3400;
    lp.Q.value = 0.707;
    src.connect(hp).connect(lp).connect(ctx.destination);
    src.start(0);
    return (await ctx.startRendering()).getChannelData(0).slice();
  } catch {
    return biquadJs(biquadJs(samples, sr, "highpass", 300), sr, "lowpass", 3400);
  }
}

/**
 * Degrade a clean recording (any sample rate) to an 8 kHz phone-line signal.
 * Returns the 8 kHz samples.
 */
export async function toPhoneLine(samples: Float32Array, inRate: number, noise: NoiseLevel): Promise<Float32Array> {
  // 1. Mix in background noise at the requested SNR, relative to the voiced speech level
  const mixed = new Float32Array(samples);
  const level = NOISE_LEVELS.find((l) => l.value === noise);
  if (level && level.snrDb !== null) {
    const speech = activeRms(samples, inRate) || 0.05;
    const noiseGain = speech / Math.pow(10, level.snrDb / 20);
    const n = generateNoise(noise, samples.length, inRate);
    for (let i = 0; i < mixed.length; i++) mixed[i] += n[i] * noiseGain;
  }

  // 2. Narrowband telephone channel at the source rate (also acts as the anti-alias filter)
  const banded = await bandpass(mixed, inRate);

  // 3. Down to 8 kHz
  let narrow: Float32Array;
  try {
    narrow = await resample(banded, inRate, PHONE_RATE);
  } catch {
    narrow = resampleLinear(banded, inRate, PHONE_RATE);
  }

  // 4. Keep the peak under full scale, then G.711 µ-law companding
  let peak = 0;
  for (let i = 0; i < narrow.length; i++) peak = Math.max(peak, Math.abs(narrow[i]));
  if (peak > 0.95) for (let i = 0; i < narrow.length; i++) narrow[i] *= 0.95 / peak;
  return mulawRoundTrip(narrow);
}

export async function toPhoneLineWav(samples: Float32Array, inRate: number, noise: NoiseLevel): Promise<Blob> {
  return encodeWav(await toPhoneLine(samples, inRate, noise), PHONE_RATE);
}
