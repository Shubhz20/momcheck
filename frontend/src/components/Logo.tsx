export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#0f766e" />
      <path
        d="M32 47s-13-7.6-13-17.2C19 25 22.4 22 26.3 22c2.5 0 4.6 1.3 5.7 3.3 1.1-2 3.2-3.3 5.7-3.3 3.9 0 7.3 3 7.3 7.8C45 39.4 32 47 32 47z"
        fill="#fda4af"
      />
      <path d="M48 20c2.2 2.4 3.5 5.6 3.5 9M52.5 15.5c3.4 3.6 5.5 8.4 5.5 13.5" stroke="#ccfbf1" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-tight">
        <div className="text-[15px] font-semibold text-ink">Janani Saathi</div>
        <div className="text-[11px] text-muted">Maternal follow-up calls, in every Indian language</div>
      </div>
    </div>
  );
}
