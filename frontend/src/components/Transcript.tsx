import type { TranscriptTurn } from "../api/types";
import { cx } from "./ui";

export function Transcript({ turns }: { turns: TranscriptTurn[] }) {
  if (!turns?.length) return <p className="text-sm text-muted">No transcript available for this call.</p>;
  return (
    <div className="space-y-2.5">
      {turns.map((t, i) => {
        const isAgent = t.role === "assistant";
        return (
          <div key={i} className={cx("flex", isAgent ? "justify-start" : "justify-end")}>
            <div className={cx("max-w-[85%]", isAgent ? "" : "text-right")}>
              <div className={cx("mb-0.5 text-[11px] font-medium uppercase tracking-wide", isAgent ? "text-brand-700" : "text-blush-600")}>
                {isAgent ? "Janani Saathi" : "Mother"}
                {t.language ? <span className="ml-1 normal-case text-muted">· {t.language}</span> : null}
              </div>
              <div
                className={cx(
                  "inline-block rounded-2xl px-3.5 py-2 text-left text-[15px] leading-relaxed",
                  isAgent ? "rounded-tl-sm bg-brand-50 text-ink" : "rounded-tr-sm bg-blush-50 text-ink",
                )}
              >
                {t.content}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
