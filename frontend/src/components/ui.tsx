import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AlertCircle, Loader2, RotateCw } from "lucide-react";
import { initials } from "../lib/format";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "rose";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 shadow-sm disabled:bg-brand-700/50",
  secondary: "bg-white text-ink border border-line hover:bg-stone-50 disabled:text-muted",
  ghost: "text-brand-800 hover:bg-brand-50 disabled:text-muted",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm disabled:bg-red-600/50",
  rose: "bg-blush-100 text-blush-600 hover:bg-blush-200 disabled:opacity-60",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-base gap-2 rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  children,
  className,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(31,42,46,0.04)]", className)}>{children}</div>;
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "brand" | "rose" | "red" | "amber" | "green" | "blue";
const tones: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-700 ring-stone-200",
  brand: "bg-brand-50 text-brand-800 ring-brand-200",
  rose: "bg-blush-50 text-blush-600 ring-blush-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
};

export function Badge({ tone = "neutral", children, icon, className }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-brand-700", className)} aria-label="Loading" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-stone-200/70", className)} />;
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  const msg = typeof error === "string" ? error : error.message;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">{msg}</div>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1 font-medium text-red-700 hover:underline">
          <RotateCw className="size-3.5" /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      {icon && <div className="mb-3 rounded-full bg-brand-50 p-3 text-brand-700">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({ name, tone = "brand", size = "md" }: { name: string; tone?: "brand" | "rose" | "red"; size?: "md" | "lg" }) {
  const t = { brand: "bg-brand-100 text-brand-800", rose: "bg-blush-100 text-blush-600", red: "bg-red-100 text-red-700" }[tone];
  return (
    <div className={cx("flex shrink-0 items-center justify-center rounded-full font-semibold", t, size === "lg" ? "size-14 text-lg" : "size-10 text-sm")}>
      {initials(name)}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "block w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-stone-50";
