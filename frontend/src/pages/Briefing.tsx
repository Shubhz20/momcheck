import { useState } from "react";
import { Sunrise, Volume2 } from "lucide-react";
import { api } from "../api/client";
import type { Briefing, LanguageCode } from "../api/types";
import { Button, Card, ErrorBox, Field, PageHeader, Skeleton, inputClass } from "../components/ui";
import { useLanguages } from "../hooks/useLanguages";
import { loadPref, savePref } from "../lib/prefs";

export function BriefingPage() {
  const { languages } = useLanguages();
  const [language, setLanguage] = useState<LanguageCode>(() => loadPref<LanguageCode>("js.briefingLang", "hi-IN"));
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setAudioError(false);
    setAudioSrc(null);
    savePref("js.briefingLang", language);
    try {
      const b = await api.briefing(language);
      setBriefing(b);
      setAudioSrc(api.briefingAudioUrl(b.language ?? language, Date.now()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Daily briefing" subtitle="A short spoken summary of today: calls, danger signs and visits due. Listen while you walk." />

      <Card className="max-w-2xl p-5 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Language">
              <select className={inputClass} value={language} onChange={(e) => setLanguage(e.target.value as LanguageCode)}>
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.native === l.name ? l.name : `${l.native} (${l.name})`}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Button size="lg" onClick={() => void generate()} loading={loading} icon={<Sunrise className="size-5" />}>
            {briefing ? "Generate again" : "Generate briefing"}
          </Button>
        </div>

        {error && (
          <div className="mt-5">
            <ErrorBox error={error} onRetry={() => void generate()} />
          </div>
        )}

        {loading && (
          <div className="mt-6 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        )}

        {briefing && !loading && (
          <div className="mt-6">
            <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-blush-50 p-5">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-brand-800">
                <Volume2 className="size-4" /> Spoken by Gnani Timbre
              </p>
              {audioSrc && !audioError ? (
                <audio key={audioSrc} controls autoPlay src={audioSrc} onError={() => setAudioError(true)} className="mt-3 w-full" />
              ) : audioError ? (
                <p className="mt-3 text-sm text-red-700">The audio couldn't be generated. The text is below.</p>
              ) : null}
              <p className="mt-4 whitespace-pre-line text-[16px] leading-relaxed text-ink">{briefing.text}</p>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
