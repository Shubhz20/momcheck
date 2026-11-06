import { useState, type ReactNode } from "react";
import { AlertOctagon, AlertTriangle, HeartPulse, Languages, PhoneCall, Timer, Users } from "lucide-react";
import type { Impact } from "../api/types";
import { parseDate } from "../lib/format";
import { Card, cx } from "./ui";

function Tile({ label, value, note, icon, children }: { label: string; value: ReactNode; note?: ReactNode; icon: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <span className="text-brand-700">{icon}</span>
        {label}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
      {children}
    </div>
  );
}

/** The last seven days of her work: calls made, mothers reached, danger signs caught and how fast she acted. */
export function ImpactPanel({ impact }: { impact: Impact }) {
  const danger = impact.red + impact.amber;
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold text-ink">Your last 7 days</h2>
          <p className="text-sm text-muted">What MomCheck and you did together</p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Follow-up calls" value={impact.calls} note={impact.own_voice_calls ? `${impact.own_voice_calls} in your own voice` : "Made by MomCheck"} icon={<PhoneCall className="size-3.5" />} />
          <Tile label="Mothers reached" value={`${impact.reached} of ${impact.women}`} note="Spoke with MomCheck this week" icon={<Users className="size-3.5" />} />
          <Tile label="Danger signs caught" value={danger} icon={<HeartPulse className="size-3.5" />}>
            <p className="mt-0.5 flex flex-wrap gap-x-2.5 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <AlertOctagon className="size-3 text-red-600" /> {impact.red} red
              </span>
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="size-3 text-amber-500" /> {impact.amber} amber
              </span>
            </p>
          </Tile>
          <Tile
            label="Time to act on an alert"
            value={impact.minutes_to_action != null ? `${impact.minutes_to_action} min` : "–"}
            note={impact.minutes_to_action != null ? "Median, from alert to you handling it" : "No alerts handled yet"}
            icon={<Timer className="size-3.5" />}
          />
        </div>
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Calls per day</p>
            <p className="inline-flex items-center gap-1 text-xs text-muted">
              <AlertOctagon className="size-3 text-red-600" /> danger sign that day
            </p>
          </div>
          <DayColumns days={impact.days} />
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <Languages className="size-3.5" /> {impact.languages} language{impact.languages === 1 ? "" : "s"} spoken this week
          </p>
        </Card>
      </div>
    </section>
  );
}

function DayColumns({ days }: { days: Impact["days"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.calls));
  const H = 96; // plot height in px
  const label = (d: string) => parseDate(d).toLocaleDateString("en-IN", { weekday: "short" });
  const full = (d: string) => parseDate(d).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
  return (
    <div className="mt-3">
      <div className="relative" style={{ height: H + 18 }}>
        {/* hairline baseline + one recessive max gridline */}
        <div className="absolute inset-x-0 border-t border-stone-200" style={{ top: 18 + H }} />
        <div className="absolute inset-x-0 border-t border-stone-100" style={{ top: 18 }} />
        <span className="absolute -top-0.5 right-0 text-[10px] tabular-nums text-muted">{max}</span>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between" style={{ top: 18 }}>
          {days.map((d, i) => {
            const h = d.calls ? Math.max(4, Math.round((d.calls / max) * H)) : 0;
            return (
              <div
                key={d.date}
                className="relative flex h-full flex-1 cursor-default items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${full(d.date)}: ${d.calls} calls${d.danger ? `, ${d.danger} danger sign` : ""}`}
              >
                {d.danger > 0 && (
                  <AlertOctagon className="absolute size-3.5 text-red-600" style={{ bottom: h + 4 }} aria-hidden />
                )}
                <div
                  className={cx("w-full max-w-6 rounded-t bg-brand-600 transition-opacity", hover !== null && hover !== i && "opacity-40")}
                  style={{ height: h }}
                />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] text-white shadow-lg">
                    {full(d.date)} · {d.calls} call{d.calls === 1 ? "" : "s"}
                    {d.danger ? ` · ${d.danger} danger sign${d.danger === 1 ? "" : "s"}` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex justify-between">
        {days.map((d, i) => (
          <span key={d.date} className={cx("flex-1 text-center text-[11px]", i === days.length - 1 ? "font-semibold text-ink" : "text-muted")}>
            {i === days.length - 1 ? "Today" : label(d.date)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Calls per day, last 7 days</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th>{full(d.date)}</th>
              <td>{d.calls} calls</td>
              <td>{d.danger} danger signs</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
