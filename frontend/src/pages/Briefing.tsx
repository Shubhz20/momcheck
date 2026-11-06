import { useState } from "react";
import { CalendarDays, Play, Sunrise, Volume2 } from "lucide-react";
import { api } from "../api/client";
import type { Briefing, LanguageCode, SavedBriefing } from "../api/types";
import { Badge, Button, Card, ErrorBox, Field, PageHeader, SectionHeader, Skeleton, SkeletonList, cx, inputClass } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useMe } from "../hooks/useAuth";
import { useLanguages } from "../hooks/useLanguages";
import { daysFromToday, formatDate, formatDateTime, languageName } from "../lib/format";
import { loadPref, savePref } from "../lib/prefs";

export function BriefingPage() {
  const { languages } = useLanguages();
  const me = useMe();
  const [language, setLanguage] = useState<LanguageCode>(() => loadPref<LanguageCode>(`js.briefingLang.${me.id}`, me.language));
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState(false);
  const saved = useAsync<SavedBriefing[]>(() => api.briefings(), []);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setAudioError(false);
    setAudioSrc(null);
    savePref(`js.briefingLang.${me.id}`, language);
    try {
      const b = await api.briefing(language);
      setBriefing(b);
      setAudioSrc(api.briefingAudioUrl(b.language ?? language, Date.now()));
      void saved.reload(true);
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

      <EarlierBriefings
        items={(saved.data ?? []).filter((x) => !(briefing && x.day === briefing.day && x.language === briefing.language))}
        loading={saved.loading && !saved.data}
        error={saved.error}
      />
    </>
  );
}

function dayLabel(day: string): string {
  const d = daysFromToday(day);
  return d === 0 ? "Today" : d === -1 ? "Yesterday" : formatDate(day);
}

/** Each day's briefing is kept (one per language), so she can listen to an earlier day again. */
function EarlierBriefings({ items, loading, error }: { items: SavedBriefing[]; loading: boolean; error: Error | null }) {
  const [playing, setPlaying] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  if (error) return null;
  return (
    <section className="mt-8 max-w-2xl">
      <SectionHeader title="Saved briefings" subtitle="The latest briefing of each day is kept here" />
      {loading ? (
        <SkeletonList rows={2} />
      ) : !items.length ? (
        <Card className="px-4 py-6 text-sm text-muted">No saved briefings yet. Each day's briefing is kept here once you generate it.</Card>
      ) : (
        <div className="space-y-3">
          {items.map((b) => (
            <Card key={b.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <CalendarDays className="size-4 text-brand-700" /> {dayLabel(b.day)}
                </p>
                <Badge>{languageName(b.language)}</Badge>
                <span className="text-xs text-muted">Updated {formatDateTime(b.updated_at)}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setPlaying(b.id)}
                  disabled={playing === b.id}
                  icon={<Play className="size-3.5" />}
                >
                  Listen
                </Button>
              </div>
              {playing === b.id && <audio controls autoPlay src={api.savedBriefingAudioUrl(b.id)} className="mt-3 w-full" />}
              <button
                onClick={() => setOpen(open === b.id ? null : b.id)}
                className={cx("mt-2 block whitespace-pre-line text-left text-sm leading-relaxed text-ink", open !== b.id && "line-clamp-3")}
                title={open === b.id ? "Show less" : "Show all"}
              >
                {b.text}
              </button>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
