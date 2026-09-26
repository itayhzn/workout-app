import { Hourglass, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatClock, formatRest } from "../../domain/format";
import { useNow } from "../../hooks/useNow";
import { restFinishedFeedback } from "../../services/feedback";
import { useActiveWorkout } from "../../state/ActiveWorkoutContext";

/** Sticky rest timer. Remaining time is always derived from the absolute end timestamp. */
export function RestTimerBar() {
  const { restTimer, session, adjustRest, clearRest, startRest } = useActiveWorkout();
  const now = useNow(250, !!restTimer);
  const [expanded, setExpanded] = useState(false);
  const remainingMs = restTimer ? Math.max(0, restTimer.endsAt - now) : 0;
  const finished = !!restTimer && remainingMs === 0;

  // Buzz only when we observe the transition live, not when reopening the app long after.
  const prevRemaining = useRef(remainingMs);
  useEffect(() => {
    if (restTimer && prevRemaining.current > 0 && remainingMs === 0 && now - restTimer.endsAt < 3000) {
      restFinishedFeedback();
    }
    prevRemaining.current = remainingMs;
  }, [remainingMs, restTimer, now]);

  if (!restTimer) return null;
  const ex = session?.exercises.find((e) => e.id === restTimer.exerciseId);
  const progress = 1 - remainingMs / (restTimer.originalDurationSeconds * 1000);

  return (
    <div
      className={`hud relative overflow-hidden rounded-lg transition ${finished ? "animate-pulse-volt border-volt" : ""}`}
      role="timer"
      aria-live={finished ? "assertive" : "off"}
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-highlight">
        <div className="h-full bg-volt transition-[width] duration-300" style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded}>
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded ${finished ? "bg-volt text-black" : "bg-volt/15 text-volt"}`}>
            <Hourglass size={20} />
          </div>
          <div className="min-w-0">
            <div className="label">{finished ? "Rest over — go!" : "Rest"}</div>
            <div className="font-display text-3xl font-bold leading-none text-volt tnum">{formatClock(remainingMs / 1000)}</div>
          </div>
        </button>
        {finished ? (
          <button className="btn-primary h-11 px-4" onClick={clearRest}>
            Dismiss
          </button>
        ) : (
          <>
            <button className="btn-secondary h-11 px-3 normal-case text-cyan" onClick={() => adjustRest(30)}>
              +30s
            </button>
            <button className="btn-ghost h-11 px-3 normal-case" onClick={clearRest}>
              Skip
            </button>
          </>
        )}
      </div>
      {expanded && (
        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2 text-sm text-ink-2">
          <span className="truncate">
            After {ex?.exerciseName ?? "exercise"} · set {restTimer.setNumber} · default {formatRest(restTimer.originalDurationSeconds)}
          </span>
          <span className="flex shrink-0 gap-1">
            <button className="btn-ghost h-9 px-2 normal-case" onClick={() => adjustRest(-15)} disabled={finished}>
              −15s
            </button>
            <button
              className="btn-ghost h-9 px-2 normal-case"
              onClick={() => startRest(restTimer.exerciseId, restTimer.setNumber, restTimer.originalDurationSeconds)}
            >
              <RotateCcw size={14} /> Reset
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
