import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cx } from "./ui";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const Ctx = createContext<ToastApi>({ success: () => {}, error: () => {}, info: () => {} });

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId++;
      setToasts((t) => [...t.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  const api: ToastApi = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 md:top-auto md:bottom-6 md:right-6 md:left-auto md:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-3 pr-2 text-sm shadow-lg",
              t.kind === "success" && "border-emerald-200",
              t.kind === "error" && "border-red-200",
              t.kind === "info" && "border-line",
            )}
          >
            {t.kind === "success" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
            {t.kind === "error" && <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" />}
            {t.kind === "info" && <Info className="mt-0.5 size-4 shrink-0 text-brand-700" />}
            <span className="flex-1 text-ink">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-muted hover:bg-stone-100" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
