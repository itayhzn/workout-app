import { ChevronDown, ChevronRight, Download, History, Monitor, Play, RotateCcw, Scale, Settings, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { WeightUnitToggle } from "../../components/WeightUnitToggle";
import { Banner, ConfirmDialog, EmptyState, Label, Modal, ProgressBar, Spinner, TypeBadge } from "../../components/ui";
import { estimateWorkoutMinutes, formatClock, formatMinutes, formatNumber, sessionDurationMs } from "../../domain/format";
import { weekdayOf } from "../../domain/schedule";
import { sessionStats } from "../../domain/session";
import type { Workout, WorkoutSession } from "../../domain/types";
import { useNow } from "../../hooks/useNow";
import { exportHistory } from "../../services/historyService";
import { loadTimerSound, saveModePreference, saveTimerSound } from "../../services/settings";
import { useActiveWorkout } from "../../state/ActiveWorkoutContext";
import { useConfig } from "../../state/ConfigContext";
import { useSessions } from "../../state/history";
import { getAppState, setAppState } from "../../storage/indexedDb";
import { KineticMark, PhoneScreen } from "./PhoneLayout";
import { WorkoutPreviewCard } from "./WorkoutPreviewCard";

const LAST_SELECTED_KEY = "lastSelectedWorkout";

export function PhoneHome() {
  const config = useConfig();
  const active = useActiveWorkout();
  const navigate = useNavigate();
  const { sessions: recent } = useSessions(5);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [pendingStart, setPendingStart] = useState<Workout>();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const today = new Date();
  const todayIds = config.schedule[weekdayOf(today)] ?? [];
  const todays = todayIds.map((id) => config.workoutById(id)).filter((w): w is Workout => !!w);
  const selected = selectedId ? config.workoutById(selectedId) : undefined;

  useEffect(() => {
    getAppState<string>(LAST_SELECTED_KEY).then((id) => id && setSelectedId((cur) => cur ?? id)).catch(() => {});
  }, []);

  const select = (id: string) => {
    setSelectedId(id);
    setPickerOpen(false);
    setAppState(LAST_SELECTED_KEY, id).catch(() => {});
  };

  const doStart = async (w: Workout) => {
    setBusy(true);
    setError(undefined);
    try {
      if (active.session) await active.discard();
      const s = await active.start(w, config.exercises);
      navigate(`/workout/${s.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setPendingStart(undefined);
    }
  };

  const requestStart = (w: Workout) => (active.session ? setPendingStart(w) : doStart(w));

  return (
    <PhoneScreen>
      <header className="pt-safe flex h-16 items-center justify-between">
        <div className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
          <KineticMark /> KINETIC
        </div>
        <div className="flex gap-1">
          <Link to="/history" className="btn-ghost h-11 w-11" aria-label="Workout history">
            <History size={20} />
          </Link>
          <button className="btn-ghost h-11 w-11" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={20} />
          </button>
        </div>
      </header>

      <div>
        {config.status === "ready" && todays.length === 0 && <Label className="text-volt">Rest day</Label>}
        <h1 className="mt-1 font-display text-2xl font-bold">
          Today, {today.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
        </h1>
      </div>

      {config.offlineError && <Banner>Couldn't refresh workouts — using the saved copy.</Banner>}
      {active.storageError && <Banner tone="error">Device storage problem: {active.storageError}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      {active.session && <ActiveWorkoutCard session={active.session} onDiscard={() => setConfirmDiscard(true)} />}

      {config.status === "loading" && <Spinner label="Loading workouts…" />}
      {config.status === "error" && (
        <Banner tone="error" action={<button className="btn-ghost h-8 px-2 text-xs" onClick={config.reload}><RotateCcw size={14} /> Retry</button>}>
          Couldn't load workouts: {config.error}
        </Banner>
      )}

      {config.status === "ready" && (
        <>
          {todays.map((w) => (
            <WorkoutPreviewCard key={w.id} workout={w} label="Scheduled today" onStart={() => requestStart(w)} highlight={!active.session} busy={busy} />
          ))}
          {todays.length === 0 && (
            <EmptyState title="No workout scheduled today" body="Choose a workout below, or enjoy the rest day." />
          )}

          <section>
            <button
              className="card flex h-14 w-full items-center justify-between px-4 font-semibold"
              onClick={() => setPickerOpen((o) => !o)}
              aria-expanded={pickerOpen}
            >
              Choose another workout
              <ChevronDown size={20} className={`transition ${pickerOpen ? "rotate-180" : ""}`} />
            </button>
            {pickerOpen && (
              <ul className="card mt-2 divide-y divide-line overflow-hidden">
                {config.workouts.map((w) => (
                  <li key={w.id}>
                    <button className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevated ${w.id === selectedId ? "bg-elevated" : ""}`} onClick={() => select(w.id)}>
                      <span className="flex-1 font-semibold">{w.name}</span>
                      <TypeBadge type={w.type} />
                      <span className="w-16 text-right text-sm text-ink-2 tnum">~{estimateWorkoutMinutes(w)} min</span>
                    </button>
                  </li>
                ))}
                {config.workouts.length === 0 && <li className="px-4 py-3 text-sm text-ink-2">No workouts configured yet.</li>}
              </ul>
            )}
          </section>

          {selected && !todays.some((w) => w.id === selected.id) && (
            <WorkoutPreviewCard
              workout={selected}
              label="Selected"
              onStart={() => requestStart(selected)}
              onDismiss={() => setSelectedId(undefined)}
              highlight={!active.session && todays.length === 0}
              busy={busy}
            />
          )}
        </>
      )}

      <RecentWorkouts sessions={recent} />

      <ConfirmDialog
        open={!!pendingStart}
        title="Replace workout in progress?"
        body={`Your current ${active.session?.workoutName} workout will be discarded and ${pendingStart?.name} will start.`}
        confirmLabel="Discard & start"
        danger
        busy={busy}
        onConfirm={() => pendingStart && doStart(pendingStart)}
        onCancel={() => setPendingStart(undefined)}
      />
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard workout?"
        body="All sets recorded in this workout will be lost. This cannot be undone."
        confirmLabel="Discard"
        danger
        onConfirm={async () => {
          await active.discard();
          setConfirmDiscard(false);
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
      <PhoneSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </PhoneScreen>
  );
}

function ActiveWorkoutCard({ session, onDiscard }: { session: WorkoutSession; onDiscard: () => void }) {
  const now = useNow();
  const stats = useMemo(() => sessionStats(session), [session]);
  const elapsed = (now - Date.parse(session.startedAt)) / 1000;
  const done = stats.exercisesCompleted + stats.exercisesSkipped;
  return (
    <section className="card border-volt/50 bg-elevated p-5 shadow-volt">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2 text-volt">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-volt" /> Workout in progress
        </Label>
        <span className="font-display text-sm text-ink-2 tnum">
          {stats.setsTotal ? `Set ${stats.setsCompleted}/${stats.setsTotal}` : `${done}/${stats.exercisesTotal}`}
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-2xl font-bold">{session.workoutName}</h2>
          <p className="text-sm text-ink-2">Started {formatMinutes(elapsed * 1000)} ago</p>
        </div>
        <div className="font-display text-2xl font-bold text-volt tnum">{formatClock(elapsed)}</div>
      </div>
      <ProgressBar
        className="mt-4"
        value={stats.setsTotal ? stats.setsCompleted / stats.setsTotal : stats.exercisesTotal ? done / stats.exercisesTotal : 0}
      />
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <Link to={`/workout/${session.id}`} className="btn-primary h-14 text-base">
          <Play size={18} /> Resume workout
        </Link>
        <button className="btn-ghost h-14 px-4" onClick={onDiscard}>
          <X size={16} /> Discard
        </button>
      </div>
    </section>
  );
}

export function RecentWorkouts({ sessions, title = "Recent workouts" }: { sessions: WorkoutSession[]; title?: string }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <History size={12} /> {title}
        </Label>
        {sessions.length > 0 && (
          <Link to="/history" className="label text-volt">
            See all
          </Link>
        )}
      </div>
      {sessions.length === 0 ? (
        <div className="card px-4 py-6 text-center text-sm text-ink-2">Completed workouts will appear here.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <SessionRow session={s} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SessionRow({ session }: { session: WorkoutSession }) {
  const stats = sessionStats(session);
  const d = new Date(session.completedAt ?? session.startedAt);
  const details = [formatMinutes(sessionDurationMs(session))];
  if (stats.setsCompleted) details.push(`${stats.setsCompleted} sets`);
  if (stats.distanceKm) details.push(`${formatNumber(stats.distanceKm)} km`);
  if (stats.exercisesSkipped) details.push(`${stats.exercisesSkipped} skipped`);
  return (
    <Link to={`/history/${session.id}`} className="card flex items-center gap-4 px-4 py-3 hover:border-line-strong">
      <div className="w-12 shrink-0 rounded bg-elevated py-1 text-center">
        <div className="label text-[10px]">{d.toLocaleDateString(undefined, { month: "short" })}</div>
        <div className="font-display text-xl font-bold tnum">{d.getDate()}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{session.workoutName}</div>
        <div className="text-sm text-ink-2 tnum">{details.join(" · ")}</div>
      </div>
      <ChevronRight size={18} className="text-ink-3" />
    </Link>
  );
}

function PhoneSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [sound, setSound] = useState(loadTimerSound);
  const [msg, setMsg] = useState<string>();
  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-2">
        <button
          className="card flex h-14 items-center gap-3 px-4 text-left"
          onClick={() => {
            saveTimerSound(!sound);
            setSound(!sound);
          }}
        >
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          <span className="flex-1">Rest timer sound</span>
          <span className={`font-display text-sm font-bold ${sound ? "text-volt" : "text-ink-3"}`}>{sound ? "ON" : "OFF"}</span>
        </button>
        <div className="card flex h-14 items-center gap-3 px-4">
          <Scale size={18} />
          <span className="flex-1">Weight unit</span>
          <WeightUnitToggle />
        </div>
        <button
          className="card flex h-14 items-center gap-3 px-4 text-left"
          onClick={async () => {
            const n = await exportHistory();
            setMsg(`Exported ${n} workout${n === 1 ? "" : "s"}.`);
          }}
        >
          <Download size={18} />
          <span className="flex-1">Export workout history</span>
        </button>
        <button
          className="card flex h-14 items-center gap-3 px-4 text-left"
          onClick={() => {
            saveModePreference("manage");
            navigate("/manage/workouts");
          }}
        >
          <Monitor size={18} />
          <span className="flex-1">Switch to management mode</span>
        </button>
        {msg && <p className="text-sm text-emerald">{msg}</p>}
      </div>
    </Modal>
  );
}
