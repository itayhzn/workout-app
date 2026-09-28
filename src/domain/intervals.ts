import { completeTimedSet } from "./session";
import { groupRuns } from "./groups";
import type { IntervalStep, IntervalTimerState, TimedSessionExercise, TimedSetResult, WorkoutSession } from "./types";

// Pure interval-timer logic. The position is always derived from the clock (never a ticking counter),
// so the sequence stays correct through throttled tabs, screen lock and reloads.

export const PREP_SECONDS = 5;

/**
 * Builds the step sequence for the block of consecutive timed exercises starting at `startExerciseId`.
 * Only pending sets are included; completed/skipped exercises inside the block are passed over.
 * Each work set is followed by that exercise's rest, except the very last one.
 */
export function buildIntervalPlan(session: WorkoutSession, startExerciseId: string, prepSeconds = PREP_SECONDS): IntervalStep[] {
  let start = session.exercises.findIndex((e) => e.id === startExerciseId);
  if (start === -1) return [];
  // Starting inside a circuit starts the whole circuit.
  const group = session.exercises[start].group;
  while (group && start > 0 && session.exercises[start - 1].group === group) start--;
  const block: TimedSessionExercise[] = [];
  for (const ex of session.exercises.slice(start)) {
    if (ex.kind !== "timed") break;
    block.push(ex);
  }
  const work: IntervalStep[] = [];
  const restAfter: number[] = [];
  const add = (ex: TimedSessionExercise, set: TimedSetResult) => {
    if (set.status !== "pending") return;
    work.push({ exerciseId: ex.id, setNumber: set.setNumber, phase: "work", durationSeconds: ex.prescribed.workSeconds });
    restAfter.push(ex.prescribed.restSeconds);
  };
  for (const run of groupRuns(block)) {
    if (run.length > 1) {
      // Circuit: one set of each station per round.
      const rounds = Math.max(...run.map((ex) => ex.sets.length));
      for (let r = 0; r < rounds; r++) for (const ex of run) if (ex.sets[r]) add(ex, ex.sets[r]);
    } else {
      for (const set of run[0].sets) add(run[0], set);
    }
  }
  if (!work.length) return [];
  const steps: IntervalStep[] = [];
  if (prepSeconds > 0) steps.push({ ...work[0], phase: "prep", durationSeconds: prepSeconds });
  work.forEach((w, i) => {
    steps.push(w);
    const next = work[i + 1];
    if (next && restAfter[i] > 0) steps.push({ exerciseId: next.exerciseId, setNumber: next.setNumber, phase: "rest", durationSeconds: restAfter[i] });
  });
  return steps;
}

export function startIntervals(steps: IntervalStep[], now: number = Date.now()): IntervalTimerState {
  return { steps, startedAt: now, skippedSteps: [] };
}

export interface IntervalPosition {
  index: number;
  step?: IntervalStep;
  /** Milliseconds left in the current step. */
  remainingMs: number;
  totalRemainingMs: number;
  totalMs: number;
  finished: boolean;
}

/** May be negative right after the first step was extended — that simply means more time left in it. */
function elapsedMs(state: IntervalTimerState, now: number): number {
  return (state.pausedAt ?? now) - state.startedAt;
}

export function intervalPosition(state: IntervalTimerState, now: number = Date.now()): IntervalPosition {
  const elapsed = elapsedMs(state, now);
  const totalMs = state.steps.reduce((sum, s) => sum + s.durationSeconds * 1000, 0);
  let end = 0;
  for (let i = 0; i < state.steps.length; i++) {
    end += state.steps[i].durationSeconds * 1000;
    if (elapsed < end) {
      return { index: i, step: state.steps[i], remainingMs: end - elapsed, totalRemainingMs: totalMs - elapsed, totalMs, finished: false };
    }
  }
  return { index: state.steps.length, remainingMs: 0, totalRemainingMs: 0, totalMs, finished: true };
}

export function pauseIntervals(state: IntervalTimerState, now: number = Date.now()): IntervalTimerState {
  return state.pausedAt ? state : { ...state, pausedAt: now };
}

export function resumeIntervals(state: IntervalTimerState, now: number = Date.now()): IntervalTimerState {
  if (!state.pausedAt) return state;
  const { pausedAt, ...rest } = state;
  return { ...rest, startedAt: state.startedAt + (now - pausedAt) };
}

/** Jumps to the next step. Skipping a work step records that set as skipped. */
export function skipIntervalStep(state: IntervalTimerState, now: number = Date.now()): IntervalTimerState {
  const pos = intervalPosition(state, now);
  if (pos.finished || !pos.step) return state;
  return {
    ...state,
    startedAt: state.startedAt - pos.remainingMs,
    skippedSteps: pos.step.phase === "work" ? [...state.skippedSteps, pos.index] : state.skippedSteps,
  };
}

/** Adds (or removes) time from the current step. */
export function extendIntervalStep(state: IntervalTimerState, seconds: number, now: number = Date.now()): IntervalTimerState {
  const pos = intervalPosition(state, now);
  if (pos.finished) return state;
  // Shifting the anchor forward lengthens the current step; never shorten it below zero.
  return { ...state, startedAt: state.startedAt + Math.max(seconds * 1000, -pos.remainingMs) };
}

/** Records every work step that has ended as a completed (or skipped) set. Returns the same object when nothing changed. */
export function applyIntervalProgress(session: WorkoutSession, state: IntervalTimerState, now: number = Date.now()): WorkoutSession {
  const elapsed = elapsedMs(state, now);
  let next = session;
  let end = 0;
  state.steps.forEach((step, i) => {
    end += step.durationSeconds * 1000;
    if (step.phase !== "work" || end > elapsed) return;
    const ex = next.exercises.find((e) => e.id === step.exerciseId);
    const set = ex?.kind === "timed" ? ex.sets.find((s) => s.setNumber === step.setNumber) : undefined;
    if (!set || set.status !== "pending") return;
    const skipped = state.skippedSteps.includes(i);
    next = completeTimedSet(next, step.exerciseId, {
      setNumber: step.setNumber,
      status: skipped ? "skipped" : "completed",
      durationSeconds: step.durationSeconds,
      at: new Date(state.startedAt + end),
    });
  });
  return next;
}

/** Number of consecutive timed exercises (with work left) starting at this one. */
export function timedBlockSize(session: WorkoutSession, exerciseId: string): number {
  const start = session.exercises.findIndex((e) => e.id === exerciseId);
  let n = 0;
  for (const e of session.exercises.slice(start)) {
    if (e.kind !== "timed") break;
    if (e.sets.some((x) => x.status === "pending")) n++;
  }
  return n;
}
