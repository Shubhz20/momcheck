import type { TranscriptTurn } from "../api/types";
import { languageName } from "../lib/format";
import { cx } from "./ui";

const WHO: Record<TranscriptTurn["role"], string> = { assistant: "MomCheck", user: "Mother", asha: "ASHA" };

export function Transcript({ turns, ashaName }: { turns: TranscriptTurn[]; ashaName?: string }) {
  if (!turns?.length) return <p className="text-sm text-muted">No transcript available for this conversation.</p>;
  return (
    <div className="space-y-2.5">
      {turns.map((t, i) => {
        const left = t.role !== "user";
        return (
          <div key={i} className={cx("flex", left ? "justify-start" : "justify-end")}>
            <div className={cx("max-w-[85%]", !left && "text-right")}>
              <div className={cx("mb-0.5 text-[11px] font-medium uppercase tracking-wide", t.role === "assistant" ? "text-brand-700" : t.role === "asha" ? "text-sky-700" : "text-blush-600")}>
                {t.role === "asha" && ashaName ? ashaName.split(" ")[0] : WHO[t.role]}
                {t.language ? <span className="ml-1 normal-case text-muted">· {t.language}</span> : null}
              </div>
              <div
                className={cx(
                  "inline-block rounded-2xl px-3.5 py-2 text-left text-[15px] leading-relaxed",
                  t.role === "assistant" ? "rounded-tl-sm bg-brand-50 text-ink" : t.role === "asha" ? "rounded-tl-sm bg-sky-50 text-ink" : "rounded-tr-sm bg-blush-50 text-ink",
                )}
              >
                {t.content}
                {t.translation && (
                  <span className="mt-1.5 block border-t border-black/5 pt-1.5 text-[14px]">
                    <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                      Heard in {languageName(t.translation_language)}:
                    </span>
                    {t.translation}
                  </span>
                )}
                {t.en && t.language !== "en-IN" && <span className="mt-1 block text-[12.5px] italic text-muted">{t.en}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
