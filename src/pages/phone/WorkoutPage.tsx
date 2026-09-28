import { ArrowRight, ChevronRight, CircleCheck, CircleSlash, Ellipsis, Flag, Timer, TriangleAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExerciseImage } from "../../components/ExerciseImage";
import { Banner, ConfirmDialog, Label, Modal, ProgressBar } from "../../components/ui";
import { formatClock, formatNumber, formatSeconds, formatTarget, formatWeight, formatWeightValue } from "../../domain/format";
import { GroupLabel } from "../../components/GroupLabel";
import { LeaveByChip } from "../../components/LeaveByChip";
import { groupRuns } from "../../domain/groups";
import { timedBlockSize } from "../../domain/intervals";
import { currentExercise, sessionStats } from "../../domain/session";
import { isSetBased, type SessionExercise, type WorkoutSession } from "../../domain/types";
import type { WeightUnit } from "../../domain/units";
import { primeAudio } from "../../services/feedback";
import { useWeightUnit } from "../../state/units";
import { useNow } from "../../hooks/useNow";
import { useActiveWorkout } from "../../state/ActiveWorkoutContext";
import { useConfig } from "../../state/ConfigContext";
import { PhoneHeader, PhoneScreen } from "./PhoneLayout";
import { TimerDock } from "./TimerDock";
import { SessionGuard } from "./SessionGuard";

export function WorkoutPage() {
  return <SessionGuard>{(session) => <WorkoutOverview session={session} />}</SessionGuard>;
}

function WorkoutOverview({ session }: { session: WorkoutSession }) {
  const { discard, storageError } = useActiveWorkout();
  const navigate = useNavigate();
  const now = useNow();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const stats = sessionStats(session);
  const done = stats.exercisesCompleted + stats.exercisesSkipped;
  const current = currentExercise(session);
  const allDone = done === stats.exercisesTotal;

  return (
    <PhoneScreen
      footer={
        <>
          <TimerDock />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Link to={`/workout/${session.id}/finish`} className={`${allDone ? "btn-primary shadow-volt" : "btn-secondary"} h-14 text-base`}>
              <Flag size={18} /> Finish workout
            </Link>
            <button className="btn-secondary h-14 w-14" aria-label="More actions" onClick={() => setMenuOpen(true)}>
              <Ellipsis size={20} />
            </button>
          </div>
        </>
      }
    >
      <PhoneHeader title="Active workout" back="/" right={<LeaveByChip session={session} className="mr-1" />} />
      {storageError && <Banner tone="error">Progress may not be saved: {storageError}</Banner>}

      <div className="flex items-center justify-between gap-3">
        <h1 className="flex min-w-0 items-center gap-2 font-display text-4xl font-bold uppercase tracking-tight">
          <span className="h-3 w-3 shrink-0 rounded-full bg-volt" />
          <span className="truncate">{session.workoutName}</span>
        </h1>
        <div className="flex shrink-0 items-center gap-1.5 rounded bg-elevated px-3 py-2 font-display text-lg font-bold tnum">
          <Timer size={18} className="text-ink-2" /> {formatClock((now - Date.parse(session.startedAt)) / 1000)}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label>
            <span className="text-emerald">{done}</span> / {stats.exercisesTotal} exercises complete
          </Label>
          <span className="font-display text-sm font-bold tnum">{stats.exercisesTotal ? Math.round((done / stats.exercisesTotal) * 100) : 0}%</span>
        </div>
        <ProgressBar value={stats.exercisesTotal ? done / stats.exercisesTotal : 0} />
      </div>

      <ul className="flex flex-col gap-3">
        {groupRuns(session.exercises).map((run) => {
          const item = (ex: SessionExercise) =>
            ex.id === current?.id ? <CurrentExerciseCard session={session} ex={ex} /> : <ExerciseTile session={session} ex={ex} />;
          if (run.length < 2) return <li key={run[0].id}>{item(run[0])}</li>;
          const rounds = Math.max(...run.map((e) => (isSetBased(e) ? e.sets.length : 1)));
          return (
            <li key={run[0].id} className="rounded-xl border border-dashed border-volt/40 p-2">
              <GroupLabel kind={run[0].kind} rounds={rounds} className="mb-2 ml-1" />
              <ul className="flex flex-col gap-2">
                {run.map((ex) => (
                  <li key={ex.id}>{item(ex)}</li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Workout actions">
        <button
          className="card flex h-14 w-full items-center gap-3 px-4 text-left text-danger"
          onClick={() => {
            setMenuOpen(false);
            setConfirmDiscard(true);
          }}
        >
          <Trash2 size={18} /> Discard workout
        </button>
      </Modal>
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard workout?"
        body="All sets recorded in this workout will be lost. This cannot be undone."
        confirmLabel="Discard"
        danger
        onConfirm={async () => {
          await discard();
          navigate("/", { replace: true });
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </PhoneScreen>
  );
}

function exerciseSummary(ex: SessionExercise, unit: WeightUnit): string {
  if (isSetBased(ex)) {
    const done = ex.sets.filter((s) => s.status === "completed").length;
    const detail = ex.kind === "strength" ? formatWeight(ex.prescribed.weightKg, unit) : formatSeconds(ex.prescribed.workSeconds);
    if (ex.status === "completed") return `${done} set${done === 1 ? "" : "s"} complete · ${detail}`;
    if (ex.status === "skipped") return done ? `${done} of ${ex.sets.length} sets · skipped` : "Skipped";
  } else if (ex.status === "completed") {
    const parts = [];
    if (ex.actualDurationSeconds) parts.push(formatClock(ex.actualDurationSeconds));
    if (ex.kind === "cardio" && ex.actualDistanceKm) parts.push(`${formatNumber(ex.actualDistanceKm)} km`);
    if (ex.kind === "swimming" && ex.actualDistanceMeters) parts.push(`${ex.actualDistanceMeters} m`);
    return parts.join(" · ") || "Complete";
  } else if (ex.status === "skipped") return "Skipped";
  return formatTarget(ex.prescribed, unit);
}

function ExerciseTile({ session, ex }: { session: WorkoutSession; ex: SessionExercise }) {
  const { exerciseById } = useConfig();
  const unit = useWeightUnit();
  const def = exerciseById(ex.exerciseId);
  const complete = ex.status === "completed";
  const skipped = ex.status === "skipped";
  return (
    <Link
      to={`/workout/${session.id}/exercise/${ex.id}`}
      className={`card flex items-center gap-4 p-3 transition hover:border-line-strong ${complete || skipped ? "bg-canvas" : ""}`}
    >
      <div className="relative">
        <ExerciseImage path={def?.imagePath} type={def?.type} alt={ex.exerciseName} className="h-[72px] w-[72px]" muted={complete || skipped} />
        {complete && <CircleCheck size={28} className="absolute inset-0 m-auto text-emerald" />}
      </div>
      <div className="min-w-0 flex-1">
        {!complete && !skipped && <Label className="mb-0.5">Upcoming</Label>}
        <div className={`truncate text-lg font-semibold ${complete || skipped ? "text-ink-2" : ""}`}>{ex.exerciseName}</div>
        <div className="truncate text-sm text-ink-2 tnum">{exerciseSummary(ex, unit)}</div>
        {ex.missingDefinition && (
          <div className="mt-1 flex items-center gap-1 text-xs text-warn">
            <TriangleAlert size={12} /> Exercise definition missing
          </div>
        )}
      </div>
      {complete ? (
        <CircleCheck size={26} className="shrink-0 text-emerald" aria-label="Completed" />
      ) : skipped ? (
        <CircleSlash size={22} className="shrink-0 text-ink-3" aria-label="Skipped" />
      ) : (
        <ChevronRight size={20} className="shrink-0 text-ink-3" />
      )}
    </Link>
  );
}

function CurrentExerciseCard({ session, ex }: { session: WorkoutSession; ex: SessionExercise }) {
  const { exerciseById } = useConfig();
  const { startIntervals, intervalTimer } = useActiveWorkout();
  const navigate = useNavigate();
  const unit = useWeightUnit();
  const def = exerciseById(ex.exerciseId);
  const url = `/workout/${session.id}/exercise/${ex.id}`;
  const nextSet = isSetBased(ex) ? ex.sets.find((s) => s.status === "pending") : undefined;
  const block = ex.kind === "timed" ? timedBlockSize(session, ex.id) : 0;
  const running = !!intervalTimer?.steps.some((st) => st.exerciseId === ex.id);
  return (
    <div className="card relative overflow-hidden border-line-strong bg-elevated">
      <div className="h-1 bg-volt" />
      <div className="p-4">
        <Link to={url} className="flex items-center gap-4">
          <div className="relative">
            <ExerciseImage path={def?.imagePath} type={def?.type} alt={ex.exerciseName} className="h-[72px] w-[72px]" />
            <span className="absolute bottom-1 left-1 rounded-sm bg-volt px-1 font-display text-[10px] font-bold text-black">NOW</span>
          </div>
          <div className="min-w-0 flex-1">
            <Label className="flex items-center gap-1.5 text-volt">
              <span className="h-2 w-2 rounded-full bg-volt" />
              {running ? "Timer running" : ex.status === "in_progress" ? "In progress" : "Up next"}
              {nextSet && isSetBased(ex) && ex.sets.length > 1 && ` · Set ${nextSet.setNumber} of ${ex.sets.length}`}
            </Label>
            <div className="truncate font-display text-xl font-bold">{ex.exerciseName}</div>
            <div className="text-sm text-ink-2 tnum">Target: {formatTarget(ex.prescribed, unit)}</div>
          </div>
        </Link>
        {ex.missingDefinition && (
          <div className="mt-3">
            <Banner>This exercise no longer exists in the library. You can still log it or skip it.</Banner>
          </div>
        )}
        {ex.kind === "timed" && block > 1 && (
          <p className="mt-3 text-sm text-ink-2">
            Runs all {block} timed exercises back to back, moving on automatically.
          </p>
        )}
        {ex.kind === "strength" && (
          <div className="mt-4 grid grid-cols-4 gap-1.5 rounded bg-canvas p-1.5">
            {ex.sets.slice(0, 8).map((s) => (
              <div
                key={s.setNumber}
                className={`rounded px-1 py-2 text-center ${s === nextSet ? "bg-volt/15 text-volt" : "bg-card"} ${s.status === "skipped" ? "opacity-40" : ""}`}
              >
                <div className="label text-[10px]">Set {s.setNumber}</div>
                <div className={`font-display text-sm font-bold tnum ${s.status === "completed" ? "text-emerald" : s === nextSet ? "" : "text-ink-3"}`}>
                  {s.reps ?? "–"} × {formatWeightValue(s.weightKg, unit)}
                </div>
              </div>
            ))}
          </div>
        )}
        {ex.kind === "timed" ? (
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            <button
              className="btn-primary h-14 text-base normal-case"
              onClick={() => {
                primeAudio();
                if (running || startIntervals(ex.id)) navigate(`/workout/${session.id}/intervals`);
              }}
            >
              <Timer size={18} /> {running ? "Open timer" : block > 1 ? "Start intervals" : "Start timer"}
            </button>
            <Link to={url} className="btn-secondary h-14 px-4 normal-case">
              Details
            </Link>
          </div>
        ) : (
          <Link to={url} className="btn-primary mt-4 h-14 w-full text-base normal-case">
            {ex.status === "in_progress" ? "Continue exercise" : "Start exercise"} <ArrowRight size={18} />
          </Link>
        )}
      </div>
    </div>
  );
}

