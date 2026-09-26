import { Pause, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { formatClock } from "../../domain/format";
import { intervalPosition } from "../../domain/intervals";
import { useNow } from "../../hooks/useNow";
import { useActiveWorkout } from "../../state/ActiveWorkoutContext";
import { PHASE_STYLE } from "./IntervalPage";
import { RestTimerBar } from "./RestTimerBar";

/** Sticky timer area for workout screens: the running interval sequence, otherwise the rest timer. */
export function TimerDock() {
  const { intervalTimer } = useActiveWorkout();
  return intervalTimer ? <IntervalBar /> : <RestTimerBar />;
}

function IntervalBar() {
  const { intervalTimer, session, pauseIntervals, resumeIntervals } = useActiveWorkout();
  const now = useNow(250, !!intervalTimer && !intervalTimer.pausedAt);
  if (!intervalTimer || !session) return null;
  const pos = intervalPosition(intervalTimer, now);
  if (!pos.step) return null;
  const style = PHASE_STYLE[pos.step.phase];
  const paused = !!intervalTimer.pausedAt;
  const name = session.exercises.find((e) => e.id === pos.step!.exerciseId)?.exerciseName ?? "";
  return (
    <div className="hud flex items-center gap-3 rounded-lg px-4 py-3" role="timer">
      <Link to={`/workout/${session.id}/intervals`} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0">
          <div className={`label ${style.text}`}>{paused ? "Paused" : style.label} · tap to open</div>
          <div className="flex items-baseline gap-2">
            <span className={`font-display text-3xl font-bold leading-none tnum ${style.text}`}>{formatClock(Math.ceil(pos.remainingMs / 1000))}</span>
            <span className="truncate text-sm text-ink-2">{name}</span>
          </div>
        </div>
      </Link>
      <button className="btn-secondary h-11 w-11" aria-label={paused ? "Resume intervals" : "Pause intervals"} onClick={paused ? resumeIntervals : pauseIntervals}>
        {paused ? <Play size={18} /> : <Pause size={18} />}
      </button>
    </div>
  );
}
