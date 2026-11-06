import { AudioWaveform, ShieldCheck } from "lucide-react";
import { Card, PageHeader, SectionHeader, cx } from "../components/ui";
import { languageName } from "../lib/format";
import { NOISE_BY_LANGUAGE, NOISE_CONDITIONS, NOISE_SUMMARY } from "../lib/noiseResults";

const pct = (x: number | null) => (x == null ? "–" : `${(x * 100).toFixed(1)}%`);
const short = (c: string) => c.replace("Phone line + street noise ", "+ noise ").replace("Phone line (8 kHz, µ-law)", "Phone line 8 kHz").replace(" SNR", "");

/** How well Gnani Prisma hears on bad phone lines: results of eval/noise_eval.py. */
export function QualityPage() {
  const worstHeld = [...NOISE_SUMMARY].reverse().find((s) => s.detected === s.total);
  return (
    <>
      <PageHeader
        title="How well MomCheck hears"
        subtitle="Women call from crowded homes, markets and fields on 2G phone lines. We tested Gnani Prisma on exactly that."
      />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="flex flex-col justify-center p-6">
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted">
            <ShieldCheck className="size-4 text-brand-700" /> Danger signs caught
          </p>
          <p className="mt-2 text-5xl font-semibold tabular-nums text-ink">100%</p>
          <p className="mt-2 text-sm text-muted">
            on an 8 kHz phone line with street noise down to <b className="text-ink">{worstHeld ? short(worstHeld.condition).replace("+ noise ", "") : "5 dB"}</b> SNR, in all
            10 languages. At 0 dB, where the noise is as loud as her voice, {NOISE_SUMMARY[NOISE_SUMMARY.length - 1].detected} of 30.
          </p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <AudioWaveform className="size-4 text-brand-700" /> How we tested
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink/90">
            <li>3 replies a woman might give, in each of 10 languages (30 sentences, synthetic), spoken by Gnani Timbre.</li>
            <li>Squeezed to a phone line: 8 kHz, 300–3400 Hz band, G.711 µ-law codec.</li>
            <li>Street and market noise mixed in at 20, 10, 5 and 0 dB SNR.</li>
            <li>Transcribed by Gnani Prisma (prisma-v3.0), then checked by Gemini for the danger sign.</li>
          </ol>
          <p className="mt-3 text-xs text-muted">Text-to-speech is cleaner than real voices, so real calls will score lower. The trend across noise levels is the point.</p>
        </Card>
      </div>

      <section className="mt-8">
        <SectionHeader title="By noise level" subtitle="Character error rate (lower is better) and danger signs detected" />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">Condition</th>
                <th className="px-4 py-2.5 text-right font-medium">Error rate</th>
                <th className="px-4 py-2.5 text-right font-medium">Danger sign detected</th>
              </tr>
            </thead>
            <tbody>
              {NOISE_SUMMARY.map((s) => (
                <tr key={s.condition} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5 text-ink">{s.condition}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink">{pct(s.cer)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                    {Math.round((s.detected / s.total) * 100)}% <span className="text-muted">({s.detected}/{s.total})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="mt-8">
        <SectionHeader title="By language" subtitle="Character error rate; darker cells mean more errors" />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-3 py-2.5 font-medium">Language</th>
                {NOISE_CONDITIONS.map((c) => (
                  <th key={c} className="px-3 py-2.5 text-right font-medium">
                    {short(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOISE_BY_LANGUAGE.map((row) => (
                <tr key={row.lang} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2 text-ink">
                    {languageName(row.lang)}
                    {row.lang === "en-IN" && <span className="ml-1 text-xs text-muted">(Hinglish)</span>}
                  </td>
                  {row.cer.map((v, i) => (
                    <td key={i} className="px-1.5 py-1 text-right">
                      <span
                        className={cx("block rounded-md px-1.5 py-1 tabular-nums text-ink")}
                        style={{ backgroundColor: `rgb(225 29 72 / ${Math.min(0.45, (v ?? 0) * 1.1).toFixed(2)})` }}
                      >
                        {pct(v)}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          The Hinglish row looks worse only because Prisma writes code-mixed speech the natural way, Hindi words in Devanagari and English in Latin
          (“मुझे थोड़ा bleeding हो रहा है since last night”), while our reference was romanised. The words are right, and its danger signs were
          detected.
        </p>
      </section>
    </>
  );
}
