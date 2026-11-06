import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";
import { LayoutDashboard, LogOut, Mic, RotateCcw, Sunrise, Users } from "lucide-react";
import { api } from "../api/client";
import { useAuth, useMe } from "../hooks/useAuth";
import { Logo, LogoMark } from "./Logo";
import { useToast } from "./Toast";
import { Avatar, Button, cx } from "./ui";

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

function AccountBox() {
  const me = useMe();
  const { signOut } = useAuth();
  return (
    <div className="mt-6 rounded-xl border border-line bg-white p-3">
      <div className="flex items-center gap-2.5">
        <Avatar name={me.name} tone="rose" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{me.name}</p>
          <p className="truncate text-xs text-muted">{me.is_demo ? "Demo ASHA account" : "ASHA worker"} · {me.area}</p>
        </div>
      </div>
      <Button variant="secondary" size="sm" onClick={() => void signOut()} icon={<LogOut className="size-4" />} className="mt-3 w-full">
        {me.is_demo ? "Switch account" : "Sign out"}
      </Button>
    </div>
  );
}

function DemoBanner() {
  const me = useMe();
  const toast = useToast();
  const [resetting, setResetting] = useState(false);
  if (!me.is_demo) return null;
  const reset = async () => {
    if (!window.confirm("Reset this demo account? Calls, alerts and notes made on it will be removed.")) return;
    setResetting(true);
    try {
      await api.resetDemo();
      window.location.assign("/");
    } catch (e) {
      toast.error((e as Error).message);
      setResetting(false);
    }
  };
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
      <p className="min-w-0 flex-1">
        You're using <span className="font-medium">{me.name}</span>'s demo account. Names and numbers are made up, and other visitors may use it
        too.
      </p>
      <Button variant="secondary" size="sm" onClick={() => void reset()} loading={resetting} icon={<RotateCcw className="size-4" />}>
        Reset demo data
      </Button>
    </div>
  );
}

export function Layout() {
  const { signOut } = useAuth();
  const location = useLocation();
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
        <AccountBox />
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
        <button
          onClick={() => void signOut()}
          className="ml-auto rounded-lg p-2 text-muted hover:bg-stone-100 hover:text-ink"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="size-5" />
        </button>
      </header>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8">
          <DemoBanner />
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
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
