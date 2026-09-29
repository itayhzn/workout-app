import { CalendarDays, CloudOff, Dumbbell, GitBranch, HardDrive, History, ListChecks, Menu, Settings, Smartphone, Users, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Banner, Spinner } from "../../components/ui";
import { PersonSwitcher } from "../../components/People";
import { useSyncSummary } from "../../components/SyncStatus";
import { saveModePreference } from "../../services/settings";
import { useSync } from "../../state/SyncContext";
import { useConfig } from "../../state/ConfigContext";
import { KineticMark } from "../phone/PhoneLayout";

const NAV = [
  { to: "/manage/workouts", label: "Workouts", icon: ListChecks },
  { to: "/manage/exercises", label: "Exercises", icon: Dumbbell },
  { to: "/manage/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/manage/history", label: "History", icon: History },
  { to: "/manage/people", label: "People", icon: Users },
  { to: "/manage/settings", label: "Settings", icon: Settings },
];

function SourceStatus() {
  const { source, localEdits, githubConnected, offlineError } = useConfig();
  let icon = <HardDrive size={14} />;
  let text = "Deployed JSON · read-only";
  let tone = "text-ink-2";
  if (localEdits) {
    text = "Unpublished local edits";
    tone = "text-warn";
  } else if (source === "github" || githubConnected) {
    icon = <GitBranch size={14} />;
    text = "Connected to GitHub";
    tone = "text-emerald";
  }
  if (offlineError) {
    icon = <CloudOff size={14} />;
    text = "Plan not refreshed · saved copy";
    tone = "text-warn";
  }
  return (
    <Link to="/manage/settings" className={`flex items-center gap-2 rounded px-3 py-2 text-xs hover:bg-elevated ${tone}`}>
      {icon} {text}
    </Link>
  );
}

function SidebarSync() {
  const { configured } = useSync();
  const s = useSyncSummary();
  if (!configured) return null;
  return (
    <Link to="/manage/settings" className={`flex items-center gap-2 rounded px-3 py-2 text-xs hover:bg-elevated ${s.tone}`}>
      <s.Icon size={14} className={s.spinning ? "animate-spin" : ""} /> {s.text}
    </Link>
  );
}

export function ManageLayout() {
  const config = useConfig();
  const onSettings = useLocation().pathname.startsWith("/manage/settings");
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-4" aria-label="Management">
      <div className="mb-4 flex items-center gap-2 px-2 font-display text-xl font-bold tracking-tight">
        <KineticMark /> KINETIC
      </div>
      <div className="mb-4">
        <PersonSwitcher manageLink />
      </div>
      <div className="label mb-2 px-3">Manage</div>
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => setNavOpen(false)}
          className={({ isActive }) =>
            `flex h-11 items-center gap-3 rounded px-3 font-semibold ${isActive ? "bg-volt text-black" : "text-ink-2 hover:bg-elevated hover:text-ink"}`
          }
        >
          <Icon size={18} /> {label}
        </NavLink>
      ))}
      <div className="flex-1" />
      <SourceStatus />
      <SidebarSync />
      <button
        className="flex h-11 items-center gap-3 rounded px-3 text-sm font-semibold text-ink-2 hover:bg-elevated hover:text-ink"
        onClick={() => {
          saveModePreference("workout");
          navigate("/");
        }}
      >
        <Smartphone size={18} /> Workout mode
      </button>
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-line bg-card lg:block">{sidebar}</aside>
      {navOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setNavOpen(false)}>
          <aside className="h-full w-64 border-r border-line bg-card" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-3 backdrop-blur lg:hidden">
          <button className="btn-ghost h-10 w-10" aria-label={navOpen ? "Close menu" : "Open menu"} onClick={() => setNavOpen((o) => !o)}>
            {navOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="font-display font-bold">KINETIC</span>
        </header>
        <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 p-4 md:p-8">
          {config.localEdits && (
            <Banner action={<Link to="/manage/settings" className="btn-ghost h-8 px-2 text-xs">Publish</Link>}>
              You have changes saved only in this browser. Publish them to GitHub or export the JSON files from Settings.
            </Banner>
          )}
          {config.offlineError && (
            <Banner action={<Link to="/manage/settings" className="btn-ghost h-8 px-2 text-xs">Settings</Link>}>
              Couldn't load the latest plan ({config.offlineError}). Showing {config.source === "static" ? "the copy deployed with the site" : "the last saved copy"}. If this
              keeps happening, check the GitHub token in Settings.
            </Banner>
          )}
          {config.status === "error" && (
            <Banner tone="error" action={<button className="btn-ghost h-8 px-2 text-xs" onClick={config.reload}>Retry</button>}>
              Couldn't load configuration: {config.error}
            </Banner>
          )}
          {/* Settings always renders: it's where a broken connection gets fixed. */}
          {config.status === "loading" ? <Spinner /> : config.status === "ready" || onSettings ? <Outlet /> : null}
        </main>
      </div>
    </div>
  );
}
