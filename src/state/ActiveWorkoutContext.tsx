import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  addExerciseToSession,
  completeNextSet,
  createSession,
  finishSession,
  reopenSession,
  setSessionNotes,
  uncompleteSet,
  type CompleteSetResult,
} from "../domain/session";
import { supersetNext } from "../domain/groups";
import { planChangesFromSession, type AddedExerciseSource } from "../domain/planChanges";
import {
  applyIntervalProgress,
  buildIntervalPlan,
  extendIntervalStep,
  intervalPosition,
  pauseIntervals,
  resumeIntervals,
  rewindIntervalStep,
  skipIntervalStep,
  startIntervals as startIntervalState,
} from "../domain/intervals";
import { newId } from "../domain/ids";
import type { Exercise, IntervalTimerState, RestTimerState, Workout, WorkoutSession } from "../domain/types";
import { countdownTick, holdWakeLock, intervalPhaseFeedback } from "../services/feedback";
import { notifyPlanChangesQueued, requestSync } from "../services/syncEvents";
import {
  clearActiveWorkout,
  commitCompletedSession,
  getActiveSession,
  getIntervalTimer,
  getRestTimer,
  getSession,
  putActiveSession,
  putIntervalTimer,
  putRestTimer,
  reopenCompletedSession,
} from "../storage/indexedDb";
import { notifyHistoryChanged } from "./history";

// Belt-and-braces: the active session is mirrored to localStorage so a failing IndexedDB
// (private browsing, quota, corruption) can never lose recorded progress.
const BACKUP_KEY = "kinetic.activeSessionBackup";

function backup(session: WorkoutSession | undefined) {
  try {
    if (session) localStorage.setItem(BACKUP_KEY, JSON.stringify(session));
    else localStorage.removeItem(BACKUP_KEY);
  } catch {
    /* best effort */
  }
}

function readBackup(): WorkoutSession | undefined {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    const s = raw ? (JSON.parse(raw) as WorkoutSession) : undefined;
    return s?.status === "active" ? s : undefined;
  } catch {
    return undefined;
  }
}

interface ActiveWorkoutValue {
  ready: boolean;
  session?: WorkoutSession;
  restTimer?: RestTimerState;
  intervalTimer?: IntervalTimerState;
  storageError?: string;
  start: (workout: Workout, exercises: Exercise[]) => Promise<WorkoutSession>;
  /** Applies a pure session update and persists it immediately. */
  update: (fn: (s: WorkoutSession) => WorkoutSession) => void;
  /** `nextExerciseId` is set inside a superset: the member to move to next. */
  completeSet: (exerciseId: string, values: { weightKg?: number; reps?: number }) => (CompleteSetResult & { nextExerciseId?: string }) | undefined;
  /** Adds a library exercise to today's workout, up next (after a running interval sequence). Returns its session id. */
  addExercise: (exercise: Exercise, source: AddedExerciseSource) => string | undefined;
  startRest: (exerciseId: string, setNumber: number, seconds: number) => void;
  adjustRest: (deltaSeconds: number) => void;
  clearRest: () => void;
  /** Starts the auto-advancing interval timer for the block of timed exercises beginning here. Returns false if nothing is pending. */
  startIntervals: (exerciseId: string) => boolean;
  pauseIntervals: () => void;
  resumeIntervals: () => void;
  skipInterval: () => void;
  /** Back: restart the current work step or go to the previous one, reopening anything already recorded. */
  backInterval: () => void;
  extendInterval: (seconds: number) => void;
  stopIntervals: () => void;
  finish: (notes?: string) => Promise<WorkoutSession | undefined>;
  discard: () => Promise<void>;
  /** Makes a finished session active again to complete what was skipped. Fails if another workout is active. */
  resumeSession: (sessionId: string) => Promise<WorkoutSession>;
}

const Ctx = createContext<ActiveWorkoutValue | null>(null);

export function ActiveWorkoutProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<WorkoutSession>();
  const [restTimer, setRestTimer] = useState<RestTimerState>();
  const [intervalTimer, setIntervalTimer] = useState<IntervalTimerState>();
  const intervalRef = useRef<IntervalTimerState | undefined>(undefined);
  const [storageError, setStorageError] = useState<string>();
  const sessionRef = useRef<WorkoutSession | undefined>(undefined);
  const timerRef = useRef<RestTimerState | undefined>(undefined);
  // Serialize writes so an older snapshot never lands after a newer one.
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());

  const persist = useCallback((write: () => Promise<void>) => {
    writeChain.current = writeChain.current
      .then(write)
      .then(() => setStorageError(undefined))
      .catch((e: unknown) => setStorageError(e instanceof Error ? e.message : "Could not save to device storage"));
    return writeChain.current;
  }, []);

  const applySession = useCallback(
    (next: WorkoutSession | undefined) => {
      sessionRef.current = next;
      setSession(next);
      backup(next);
      if (next) persist(() => putActiveSession(next));
    },
    [persist],
  );

  const applyTimer = useCallback(
    (next: RestTimerState | undefined) => {
      timerRef.current = next;
      setRestTimer(next);
      persist(() => putRestTimer(next));
    },
    [persist],
  );

  const applyIntervals = useCallback(
    (next: IntervalTimerState | undefined) => {
      intervalRef.current = next;
      setIntervalTimer(next);
      persist(() => putIntervalTimer(next));
    },
    [persist],
  );

  useEffect(() => {
    (async () => {
      let s: WorkoutSession | undefined;
      let t: RestTimerState | undefined;
      let iv: IntervalTimerState | undefined;
      try {
        [s, t, iv] = await Promise.all([getActiveSession(), getRestTimer(), getIntervalTimer()]);
      } catch (e) {
        setStorageError(e instanceof Error ? e.message : "Device storage unavailable");
      }
      s ??= readBackup();
      if (s && s.status !== "active") s = undefined;
      sessionRef.current = s;
      timerRef.current = s ? t : undefined;
      intervalRef.current = s ? iv : undefined;
      setSession(s);
      setRestTimer(s ? t : undefined);
      setIntervalTimer(s ? iv : undefined);
      setReady(true);
    })();
  }, []);

  const start = useCallback(
    async (workout: Workout, exercises: Exercise[]) => {
      const s = createSession(workout, exercises);
      applyTimer(undefined);
      applyIntervals(undefined);
      applySession(s);
      await writeChain.current;
      return s;
    },
    [applySession, applyTimer, applyIntervals],
  );

  const update = useCallback(
    (fn: (s: WorkoutSession) => WorkoutSession) => {
      const cur = sessionRef.current;
      if (!cur) return;
      applySession(fn(cur));
    },
    [applySession],
  );

  const addExercise = useCallback(
    (exercise: Exercise, source: AddedExerciseSource) => {
      const cur = sessionRef.current;
      if (!cur) return undefined;
      const busyIds = new Set(intervalRef.current?.steps.map((st) => st.exerciseId) ?? []);
      const id = newId();
      applySession(addExerciseToSession(cur, exercise, source.target, { from: source.from, busyIds, id }));
      return id;
    },
    [applySession],
  );

  const startRest = useCallback(
    (exerciseId: string, setNumber: number, seconds: number) => {
      if (seconds <= 0) return applyTimer(undefined);
      applyTimer({ exerciseId, setNumber, endsAt: Date.now() + seconds * 1000, originalDurationSeconds: seconds });
    },
    [applyTimer],
  );

  const completeSet = useCallback(
    (exerciseId: string, values: { weightKg?: number; reps?: number }) => {
      const cur = sessionRef.current;
      if (!cur) return undefined;
      const result = completeNextSet(cur, exerciseId, values);
      applySession(result.session);
      const ex = result.session.exercises.find((e) => e.id === exerciseId);
      // Supersets: go straight to the next member within a round; rest only when the round ends.
      const step = supersetNext(result.session, exerciseId);
      // Rest after every set except when nothing is left in the workout.
      const workLeft = result.session.exercises.some((e) => e.status === "pending" || e.status === "in_progress");
      if (ex?.kind === "strength" && workLeft && step.rest) startRest(exerciseId, result.completedSet.setNumber, ex.prescribed.restSeconds);
      else applyTimer(undefined);
      return { ...result, nextExerciseId: step.nextExerciseId };
    },
    [applySession, applyTimer, startRest],
  );

  const adjustRest = useCallback(
    (delta: number) => {
      const t = timerRef.current;
      if (!t) return;
      const base = Math.max(t.endsAt, Date.now());
      applyTimer({ ...t, endsAt: base + delta * 1000 });
    },
    [applyTimer],
  );

  const clearRest = useCallback(() => applyTimer(undefined), [applyTimer]);

  const startIntervals = useCallback(
    (exerciseId: string) => {
      const cur = sessionRef.current;
      if (!cur) return false;
      const steps = buildIntervalPlan(cur, exerciseId);
      if (!steps.length) return false;
      applyTimer(undefined);
      applyIntervals(startIntervalState(steps));
      return true;
    },
    [applyTimer, applyIntervals],
  );

  const withIntervals = useCallback(
    (fn: (t: IntervalTimerState) => IntervalTimerState) => {
      const t = intervalRef.current;
      if (t) applyIntervals(fn(t));
    },
    [applyIntervals],
  );
  const pause = useCallback(() => withIntervals((t) => pauseIntervals(t)), [withIntervals]);
  const resume = useCallback(() => withIntervals((t) => resumeIntervals(t)), [withIntervals]);
  const skipInterval = useCallback(() => withIntervals((t) => skipIntervalStep(t)), [withIntervals]);
  const backInterval = useCallback(() => {
    const t = intervalRef.current;
    const cur = sessionRef.current;
    if (!t || !cur) return;
    const { state, reopened } = rewindIntervalStep(t);
    let next = cur;
    for (const step of reopened) {
      const ex = next.exercises.find((e) => e.id === step.exerciseId);
      const set = ex?.kind === "timed" ? ex.sets.find((s) => s.setNumber === step.setNumber) : undefined;
      if (set && set.status !== "pending") next = uncompleteSet(next, step.exerciseId, step.setNumber);
    }
    if (next !== cur) applySession(next);
    applyIntervals(state);
  }, [applySession, applyIntervals]);
  const extendInterval = useCallback((sec: number) => withIntervals((t) => extendIntervalStep(t, sec)), [withIntervals]);
  const stopIntervals = useCallback(() => {
    const t = intervalRef.current;
    const cur = sessionRef.current;
    if (t && cur) {
      const next = applyIntervalProgress(cur, t);
      if (next !== cur) applySession(next);
    }
    applyIntervals(undefined);
  }, [applyIntervals, applySession]);

  // Global interval ticker: records finished sets, plays cues and ends the sequence. Runs on any page.
  const lastIndex = useRef<number>(-1);
  const lastSecond = useRef<number>(-1);
  useEffect(() => {
    if (!intervalTimer || intervalTimer.pausedAt) {
      holdWakeLock(!!intervalTimer);
      return;
    }
    holdWakeLock(true);
    const onVisible = () => document.visibilityState === "visible" && holdWakeLock(true);
    document.addEventListener("visibilitychange", onVisible);
    const tick = () => {
      const t = intervalRef.current;
      const cur = sessionRef.current;
      if (!t || !cur) return;
      const now = Date.now();
      const pos = intervalPosition(t, now);
      const next = applyIntervalProgress(cur, t, now);
      if (next !== cur) applySession(next);
      // Cues only when observed live (not when catching up after the screen was off for a while).
      if (pos.index !== lastIndex.current) {
        const live = lastIndex.current !== -1 && pos.index === lastIndex.current + 1;
        if (live) intervalPhaseFeedback(pos.finished ? "done" : pos.step!.phase);
        lastIndex.current = pos.index;
      }
      const sec = Math.ceil(pos.remainingMs / 1000);
      if (!pos.finished && sec !== lastSecond.current && sec <= 3 && sec >= 1 && pos.step!.durationSeconds > 5) countdownTick();
      lastSecond.current = sec;
      if (pos.finished) applyIntervals(undefined);
    };
    lastIndex.current = intervalPosition(intervalTimer).index;
    tick();
    const id = window.setInterval(tick, 200);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalTimer, applySession, applyIntervals]);

  useEffect(() => () => void holdWakeLock(false), []);

  const finish = useCallback(
    async (notes?: string) => {
      const cur = sessionRef.current;
      if (!cur) return undefined;
      const iv = intervalRef.current;
      const progressed = iv ? applyIntervalProgress(cur, iv) : cur;
      const done = finishSession(notes !== undefined ? setSessionNotes(progressed, notes) : progressed);
      await writeChain.current;
      // If this throws, the active session is still intact in storage and in memory.
      // Target changes and "keep" choices for added exercises are queued with it, then saved to the plan.
      const planChanges = planChangesFromSession(done);
      await commitCompletedSession(done, planChanges);
      sessionRef.current = undefined;
      timerRef.current = undefined;
      intervalRef.current = undefined;
      setSession(undefined);
      setRestTimer(undefined);
      setIntervalTimer(undefined);
      backup(undefined);
      notifyHistoryChanged();
      requestSync();
      if (planChanges.length) notifyPlanChangesQueued();
      return done;
    },
    [],
  );

  const resumeSession = useCallback(
    async (sessionId: string) => {
      if (sessionRef.current) throw new Error("Finish or discard the workout in progress first.");
      const stored = await getSession(sessionId);
      if (!stored) throw new Error("That workout isn't stored on this device.");
      const reopened = reopenSession(stored);
      await writeChain.current;
      await reopenCompletedSession(reopened);
      sessionRef.current = reopened;
      timerRef.current = undefined;
      intervalRef.current = undefined;
      setSession(reopened);
      setRestTimer(undefined);
      setIntervalTimer(undefined);
      backup(reopened);
      notifyHistoryChanged();
      return reopened;
    },
    [],
  );

  const discard = useCallback(async () => {
    sessionRef.current = undefined;
    timerRef.current = undefined;
    intervalRef.current = undefined;
    setSession(undefined);
    setRestTimer(undefined);
    setIntervalTimer(undefined);
    backup(undefined);
    await persist(() => clearActiveWorkout());
  }, [persist]);

  const value = useMemo(
    () => ({
      ready,
      session,
      restTimer,
      intervalTimer,
      storageError,
      start,
      update,
      completeSet,
      addExercise,
      startRest,
      adjustRest,
      clearRest,
      startIntervals,
      pauseIntervals: pause,
      resumeIntervals: resume,
      skipInterval,
      backInterval,
      extendInterval,
      stopIntervals,
      finish,
      discard,
      resumeSession,
    }),
    [ready, session, restTimer, intervalTimer, storageError, start, update, completeSet, addExercise, startRest, adjustRest, clearRest, startIntervals, pause, resume, skipInterval, backInterval, extendInterval, stopIntervals, finish, discard, resumeSession],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveWorkout(): ActiveWorkoutValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useActiveWorkout must be used inside ActiveWorkoutProvider");
  return ctx;
}
