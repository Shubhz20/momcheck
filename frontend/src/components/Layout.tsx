import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Mic, Sunrise, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Logo, LogoMark } from "./Logo";
import { cx } from "./ui";

const NAV: { to: string; label: string; short: string; icon: ReactNode; end?: boolean }[] = [
  { to: "/", label: "Dashboard", short: "Home", icon: <LayoutDashboard className="size-5" />, end: true },
  { to: "/women", label: "Women", short: "Women", icon: <Users className="size-5" /> },
  { to: "/note", label: "Voice note", short: "Note", icon: <Mic className="size-5" /> },
  { to: "/briefing", label: "Daily briefing", short: "Briefing", icon: <Sunrise className="size-5" /> },
];

function PoweredBy({ className }: { className?: string }) {
  return (
    <p className={cx("text-[11px] leading-relaxed text-muted", className)}>
      Powered by <span className="font-medium text-brand-800">Gnani AI</span>: Prisma STT · Timbre TTS · Voice API platform
      <br />
      Reasoning by Gemini
    </p>
  );
}

export function Layout() {
  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-white/70 px-4 py-5 backdrop-blur md:flex">
        <Logo />
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-brand-50 text-brand-800" : "text-muted hover:bg-stone-100 hover:text-ink",
                )
              }
            >
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto rounded-xl bg-blush-50 p-3">
          <p className="text-xs leading-relaxed text-blush-600">
            Screening and reminders only. MomCheck never diagnoses. Every danger sign goes to a health worker.
          </p>
        </div>
        <PoweredBy className="mt-4 px-1" />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur md:hidden">
        <LogoMark className="size-8" />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold text-ink">MomCheck</div>
          <div className="text-[10.5px] text-muted">Maternal follow-up calls, in every Indian language</div>
        </div>
      </header>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8">
          <Outlet />
          <PoweredBy className="mt-12 text-center md:hidden" />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-white/95 backdrop-blur md:hidden">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              cx("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium", isActive ? "text-brand-700" : "text-muted")
            }
          >
            {n.icon}
            {n.short}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
