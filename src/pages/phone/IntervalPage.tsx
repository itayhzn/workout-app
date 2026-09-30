import { ArrowRight, CircleCheck, Pause, Play, Plus, SkipBack, SkipForward, Square } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ExerciseImage } from "../../components/ExerciseImage";
import { Label, ProgressBar } from "../../components/ui";
import { formatClock } from "../../domain/format";
import { intervalPosition } from "../../domain/intervals";
import type { IntervalPhase, IntervalTimerState, SessionExercise, WorkoutSession } from "../../domain/types";
import { useNow } from "../../hooks/useNow";
import { primeAudio } from "../../services/feedback";
import { useActiveWorkout } from "../../state/ActiveWorkoutContext";
import { useConfig } from "../../state/ConfigContext";
import { PhoneHeader, PhoneScreen } from "./PhoneLayout";
import { SessionGuard } from "./SessionGuard";

export const PHASE_STYLE: Record<IntervalPhase, { label: string; text: string; ring: string; bg: string }> = {
  prep: { label: "Get ready", text: "text-ink", ring: "stroke-ink-2", bg: "bg-highlight/40" },
  work: { label: "Work", text: "text-volt", ring: "stroke-volt", bg: "bg-volt/10" },
  rest: { label: "Rest", text: "text-cyan", ring: "stroke-cyan", bg: "bg-cyan/10" },
};

export function IntervalPage() {
  return <SessionGuard>{(session) => <IntervalScreen session={session} />}</SessionGuard>;
}

function IntervalScreen({ session }: { session: WorkoutSession }) {
  const { intervalTimer } = useActiveWorkout();
  if (!intervalTimer) return <IntervalsDone session={session} />;
  return <IntervalRunner session={session} timer={intervalTimer} />;
}

function nextOpenExercise(session: WorkoutSession): SessionExercise | undefined {
  return session.exercises.find((e) => e.status === "pending" || e.status === "in_progress");
}

function IntervalsDone({ session }: { session: WorkoutSession }) {
  const next = nextOpenExercise(session);
  return (
    <PhoneScreen
      footer={
        next ? (
          <Link to={`/workout/${session.id}/exercise/${next.id}`} className="btn-primary h-14 text-base normal-case">
            Next: {next.exerciseName} <ArrowRight size={18} />
          </Link>
        ) : (
          <Link to={`/workout/${session.id}/finish`} className="btn-primary h-14 text-base">
            Finish workout
          </Link>
        )
      }
    >
      <PhoneHeader title="Intervals" back={`/workout/${session.id}`} />
      <div className="card flex flex-col items-center gap-3 border-emerald/50 bg-emerald/10 p-8 text-center shadow-emerald">
        <CircleCheck size={48} className="text-emerald" />
        <div className="font-display text-2xl font-bold text-emerald">Intervals complete</div>
        <Link to={`/workout/${session.id}`} className="btn-secondary h-11 px-4">
          Back to workout
        </Link>
      </div>
    </PhoneScreen>
  );
}

function Ring({ fraction, className }: { fraction: number; className: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="4" className="stroke-highlight" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        className={`${className} transition-[stroke-dashoffset] duration-200`}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fraction)))}
      />
    </svg>
  );
}

function IntervalRunner({ session, timer }: { session: WorkoutSession; timer: IntervalTimerState }) {
  const { pauseIntervals, resumeIntervals, skipInterval, backInterval, extendInterval, stopIntervals } = useActiveWorkout();
  const { exerciseById } = useConfig();
  const navigate = useNavigate();
  const now = useNow(200, !timer.pausedAt);
  const pos = intervalPosition(timer, now);
  if (pos.finished || !pos.step) return <IntervalsDone session={session} />;

  const step = pos.step;
  const style = PHASE_STYLE[step.phase];
  const ex = session.exercises.find((e) => e.id === step.exerciseId);
  const def = ex ? exerciseById(ex.exerciseId) : undefined;
  const setCount = ex?.kind === "timed" ? ex.sets.length : 1;
  const paused = !!timer.pausedAt;
  const workSteps = timer.steps.filter((s) => s.phase === "work");
  // During prep/rest, count the upcoming work interval.
  const workIndex = timer.steps.slice(0, pos.index).filter((s) => s.phase === "work").length + 1;
  // During prep/rest the next work step is already shown as "Up next", so list the ones after it.
  const upcoming = timer.steps
    .slice(pos.index + 1)
    .filter((s) => s.phase === "work")
    .slice(step.phase === "work" ? 0 : 1, step.phase === "work" ? 3 : 4);
  const labelOf = (id: string, setNumber: number) => {
    const e = session.exercises.find((x) => x.id === id);
    const sets = e?.kind === "timed" ? e.sets.length : 1;
    return `${e?.exerciseName ?? "Exercise"}${sets > 1 ? ` · ${e?.group ? "round" : "set"} ${setNumber}` : ""}`;
  };

  return (
    <PhoneScreen
      footer={
        <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2">
          <button
            className="btn-secondary h-14 w-14"
            onClick={backInterval}
            aria-label="Back: restart this step, or go to the previous set"
            title="Back — restart this set, or tap within 3 s to go to the previous one"
          >
            <SkipBack size={20} />
          </button>
          <button className="btn-secondary h-14 w-14 normal-case" onClick={() => extendInterval(10)} aria-label="Add 10 seconds">
            <Plus size={16} />
            10s
          </button>
          <button
            className={`${paused ? "btn-primary" : "btn-secondary"} h-16 text-lg`}
            onClick={() => {
              primeAudio();
              if (paused) resumeIntervals();
              else pauseIntervals();
            }}
          >
            {paused ? <Play size={22} /> : <Pause size={22} />} {paused ? "Resume" : "Pause"}
          </button>
          <button className="btn-secondary h-14 w-14" onClick={skipInterval} aria-label={step.phase === "work" ? "Skip this set" : "Skip rest"}>
            <SkipForward size={20} />
          </button>
        </div>
      }
    >
      <PhoneHeader
        title="Intervals"
        back={`/workout/${session.id}`}
        right={
          <button
            className="btn-ghost h-11 px-3 normal-case"
            onClick={() => {
              stopIntervals();
              navigate(`/workout/${session.id}`);
            }}
          >
            <Square size={14} /> Stop
          </button>
        }
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label>
            Interval {Math.min(workIndex, workSteps.length)} of {workSteps.length}
          </Label>
          <Label className="tnum">{formatClock(pos.totalRemainingMs / 1000)} left</Label>
        </div>
        <ProgressBar value={1 - pos.totalRemainingMs / pos.totalMs} />
      </div>

      <section className={`card flex flex-col items-center gap-4 px-5 py-8 text-center ${style.bg}`} role="timer" aria-live="polite">
        <div className={`font-display text-2xl font-bold uppercase tracking-widest ${style.text}`}>{paused ? "Paused" : style.label}</div>
        <div className="relative flex h-60 w-60 items-center justify-center">
          <Ring fraction={pos.remainingMs / (step.durationSeconds * 1000)} className={style.ring} />
          <div className={`font-display text-7xl font-bold tnum ${style.text} ${paused ? "opacity-50" : ""}`}>{formatClock(Math.ceil(pos.remainingMs / 1000))}</div>
        </div>
        <div className="flex items-center gap-3">
          <ExerciseImage path={def?.imagePath} type={def?.type} alt="" className="h-14 w-14" iconSize={22} />
          <div className="text-left">
            {step.phase !== "work" && <Label>Up next</Label>}
            <div className="font-display text-2xl font-bold leading-tight">{ex?.exerciseName ?? "Exercise"}</div>
            {setCount > 1 && (
              <div className="text-sm text-ink-2">
                {ex?.group ? "Round" : "Set"} {step.setNumber} of {setCount}
              </div>
            )}
          </div>
        </div>
        {def?.tips?.[0] && <p className="max-w-xs text-sm text-ink-2">{def.tips[0]}</p>}
      </section>

      {upcoming.length > 0 && (
        <section>
          <Label className="mb-2">Coming up</Label>
          <ul className="flex flex-col gap-1.5">
            {upcoming.map((s, i) => (
              <li key={i} className="card flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-semibold">{labelOf(s.exerciseId, s.setNumber)}</span>
                <span className="text-ink-2 tnum">{formatClock(s.durationSeconds)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PhoneScreen>
  );
}
