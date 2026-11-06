/**
 * PCM helpers: WAV encoding, resampling, and signal-level utilities.
 * Gnani Prisma STT accepts WAV/MP3/OGG/FLAC/AAC/M4A but not the WebM that Chrome records,
 * so all audio we upload is captured as raw PCM and encoded here as 16-bit mono WAV.
 */

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function concatFloat32(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/** Approximate level of the voiced part of a clip (ignores pauses), using 20 ms windows. */
export function activeRms(samples: Float32Array, sampleRate: number): number {
  const win = Math.max(1, Math.round(sampleRate * 0.02));
  const levels: number[] = [];
  for (let i = 0; i + win <= samples.length; i += win) levels.push(rms(samples.subarray(i, i + win)));
  if (!levels.length) return rms(samples);
  const sorted = [...levels].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const active = levels.filter((l) => l >= median);
  return Math.sqrt(active.reduce((s, l) => s + l * l, 0) / active.length) || rms(samples);
}

/** Pure-JS linear-interpolation resampler, used when OfflineAudioContext can't run at the target rate. */
export function resampleLinear(samples: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate) return samples;
  const outLen = Math.max(1, Math.round((samples.length * outRate) / inRate));
  const out = new Float32Array(outLen);
  const ratio = inRate / outRate;
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const t = pos - i0;
    out[i] = (samples[i0] ?? 0) * (1 - t) + (samples[i1] ?? 0) * t;
  }
  return out;
}

function makeBuffer(ctx: BaseAudioContext, samples: Float32Array, rate: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.max(1, samples.length), rate);
  buf.getChannelData(0).set(samples);
  return buf;
}

/** High-quality resample through OfflineAudioContext (falls back to linear interpolation). */
export async function resample(samples: Float32Array, inRate: number, outRate: number): Promise<Float32Array> {
  if (inRate === outRate) return samples;
  try {
    const len = Math.max(1, Math.ceil((samples.length * outRate) / inRate));
    const ctx = new OfflineAudioContext(1, len, outRate);
    const src = ctx.createBufferSource();
    src.buffer = makeBuffer(ctx, samples, inRate);
    src.connect(ctx.destination);
    src.start(0);
    const rendered = await ctx.startRendering();
    return rendered.getChannelData(0).slice();
  } catch {
    return resampleLinear(samples, inRate, outRate);
  }
}

/** Lowpass at ~0.45 × target rate before decimating, to keep the 16 kHz clean path alias-free. */
export async function toCleanWav16k(samples: Float32Array, inRate: number): Promise<Blob> {
  let filtered = samples;
  try {
    const ctx = new OfflineAudioContext(1, Math.max(1, samples.length), inRate);
    const src = ctx.createBufferSource();
    src.buffer = makeBuffer(ctx, samples, inRate);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7200;
    lp.Q.value = 0.707;
    src.connect(lp).connect(ctx.destination);
    src.start(0);
    filtered = (await ctx.startRendering()).getChannelData(0).slice();
  } catch {
    /* use unfiltered */
  }
  return encodeWav(await resample(filtered, inRate, 16000), 16000);
}

export { makeBuffer };
