import { groupTurn } from "./groups";
import { newId } from "./ids";
import {
  isSetBased,
  type ActivitySessionExercise,
  type CardioSessionExercise,
  type Exercise,
  type SessionExercise,
  type SetBasedSessionExercise,
  type StrengthSessionExercise,
  type StrengthSetResult,
  type StrengthTarget,
  type SwimmingSessionExercise,
  type TimedSessionExercise,
  type TimedSetResult,
  type TimedTarget,
  type Workout,
  type WorkoutSession,
} from "./types";

// All functions here are pure: they return new session objects and never mutate inputs.

export function createSession(
  workout: Workout,
  exercises: Exercise[],
  now: Date = new Date(),
): WorkoutSession {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  return {
    id: newId(),
    workoutId: workout.id,
    workoutName: workout.name,
    workoutType: workout.type,
    startedAt: now.toISOString(),
    ...leaveByFor(workout.leaveBy, now),
    status: "active",
    exercises: workout.exercises.map((item): SessionExercise => {
      const def = byId.get(item.exerciseId);
      const base = {
        id: item.id,
        exerciseId: item.exerciseId,
        exerciseName: def?.name ?? `Unknown exercise (${item.exerciseId})`,
        status: "pending" as const,
        ...(def ? {} : { missingDefinition: true }),
        ...(item.group ? { group: item.group } : {}),
      };
      // Deep-copy the target so the session never aliases the mutable template.
      const target = structuredClone(item.target);
      switch (target.kind) {
        case "strength":
          return { ...base, kind: "strength", prescribed: target, sets: initialSets(target) };
        case "timed":
          return { ...base, kind: "timed", prescribed: target, sets: initialTimedSets(target) };
        case "cardio":
          return { ...base, kind: "cardio", prescribed: target };
        case "swimming":
          return { ...base, kind: "swimming", prescribed: target };
      }
    }),
  };
}

/** Deadline on the session's own day. No deadline if that time has already passed when starting. */
function leaveByFor(leaveBy: string | undefined, now: Date): { leaveByAt?: string } {
  const m = leaveBy?.match(/^(\d{2}):(\d{2})$/);
  if (!m) return {};
  const at = new Date(now);
  at.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return at > now ? { leaveByAt: at.toISOString() } : {};
}

export function initialSets(target: StrengthTarget): StrengthSetResult[] {
  return Array.from({ length: target.sets }, (_, i) => pendingSet(i + 1, target));
}

export function initialTimedSets(target: TimedTarget): TimedSetResult[] {
  return Array.from({ length: target.sets }, (_, i) => ({ setNumber: i + 1, status: "pending" as const }));
}

function pendingSet(setNumber: number, target: StrengthTarget): StrengthSetResult {
  return {
    setNumber,
    targetReps: target.reps,
    reps: target.reps,
    ...(target.weightKg !== undefined ? { weightKg: target.weightKg } : {}),
    status: "pending",
  };
}

function mapExercise(
  session: WorkoutSession,
  exerciseId: string,
  fn: (ex: SessionExercise) => SessionExercise,
): WorkoutSession {
  let found = false;
  const exercises = session.exercises.map((ex) => {
    if (ex.id !== exerciseId) return ex;
    found = true;
    return fn(ex);
  });
  if (!found) throw new Error(`Exercise ${exerciseId} is not part of this session`);
  return { ...session, exercises };
}

function mapStrength(
  session: WorkoutSession,
  exerciseId: string,
  fn: (ex: StrengthSessionExercise) => StrengthSessionExercise,
): WorkoutSession {
  return mapExercise(session, exerciseId, (ex) => {
    if (ex.kind !== "strength") throw new Error(`Exercise ${exerciseId} is not a strength exercise`);
    return fn(ex);
  });
}

function mapTimed(
  session: WorkoutSession,
  exerciseId: string,
  fn: (ex: TimedSessionExercise) => TimedSessionExercise,
): WorkoutSession {
  return mapExercise(session, exerciseId, (ex) => {
    if (ex.kind !== "timed") throw new Error(`Exercise ${exerciseId} is not a timed exercise`);
    return fn(ex);
  });
}

export function findExercise(session: WorkoutSession, exerciseId: string) {
  return session.exercises.find((e) => e.id === exerciseId);
}

export function nextPendingSet<T extends SetBasedSessionExercise>(ex: T): T["sets"][number] | undefined {
  return (ex.sets as T["sets"][number][]).find((s) => s.status === "pending");
}

/** Recomputes a set-based exercise's status from its sets, preserving an explicit skip. */
export function deriveSetStatus(ex: SetBasedSessionExercise): SetBasedSessionExercise["status"] {
  if (ex.status === "skipped") return "skipped";
  const done = ex.sets.filter((s) => s.status === "completed").length;
  const pending = ex.sets.filter((s) => s.status === "pending").length;
  if (done > 0 && pending === 0) return "completed";
  if (done > 0) return "in_progress";
  return "pending";
}

export interface CompleteSetResult {
  session: WorkoutSession;
  completedSet: StrengthSetResult;
  /** True when no pending sets remain on the exercise after this completion. */
  exerciseComplete: boolean;
}

/** Completes the next pending set using the currently displayed weight/reps. */
export function completeNextSet(
  session: WorkoutSession,
  exerciseId: string,
  values: { weightKg?: number; reps?: number } = {},
  now: Date = new Date(),
): CompleteSetResult {
  let completedSet: StrengthSetResult | undefined;
  let exerciseComplete = false;
  const next = mapStrength(session, exerciseId, (ex) => {
    const target = nextPendingSet(ex);
    if (!target) throw new Error("No pending sets remain");
    const sets = ex.sets.map((s) => {
      if (s !== target) return s;
      completedSet = {
        ...s,
        ...("weightKg" in values ? { weightKg: values.weightKg } : {}),
        ...("reps" in values ? { reps: values.reps } : {}),
        status: "completed",
        completedAt: now.toISOString(),
      };
      if (completedSet.weightKg === undefined) delete completedSet.weightKg;
      return completedSet;
    });
    const updated: StrengthSessionExercise = { ...ex, sets, status: ex.status === "skipped" ? "pending" : ex.status };
    updated.status = deriveSetStatus(updated);
    exerciseComplete = updated.status === "completed";
    return updated;
  });
  return { session: next, completedSet: completedSet!, exerciseComplete };
}

/** Edits a single set's values. Works for pending sets and, when explicitly requested, completed ones. */
export function updateSet(
  session: WorkoutSession,
  exerciseId: string,
  setNumber: number,
  patch: { weightKg?: number | null; reps?: number | null },
): WorkoutSession {
  return mapStrength(session, exerciseId, (ex) => ({
    ...ex,
    sets: ex.sets.map((s) => {
      if (s.setNumber !== setNumber) return s;
      const updated = { ...s };
      if (patch.weightKg !== undefined) {
        if (patch.weightKg === null) delete updated.weightKg;
        else updated.weightKg = patch.weightKg;
      }
      if (patch.reps !== undefined) {
        if (patch.reps === null) delete updated.reps;
        else updated.reps = patch.reps;
      }
      return updated;
    }),
  }));
}

/**
 * Reopens a completed or skipped set (tapped by mistake, skipped by a toddler, rewound in the interval timer).
 * Reopening a set also un-skips its exercise.
 */
export function uncompleteSet(session: WorkoutSession, exerciseId: string, setNumber: number): WorkoutSession {
  return mapExercise(session, exerciseId, (ex) => {
    if (!isSetBased(ex)) throw new Error("Not a set-based exercise");
    const sets = (ex.sets as (StrengthSetResult | TimedSetResult)[]).map((s) => {
      if (s.setNumber !== setNumber) return s;
      const { completedAt: _completedAt, ...rest } = s;
      if ("durationSeconds" in rest) delete rest.durationSeconds;
      return { ...rest, status: "pending" as const };
    });
    const updated = { ...ex, sets, status: "pending" } as SetBasedSessionExercise;
    return { ...updated, status: deriveSetStatus(updated) };
  });
}

/**
 * Sessions are only ever changed by being resumed and finished again, which moves completedAt later.
 * So when two copies of the same session meet (devices, sync), the later completedAt is the newer one.
 */
export function isNewerSession(a: WorkoutSession, b: WorkoutSession): boolean {
  return (a.completedAt ?? "") > (b.completedAt ?? "");
}

/** True when a finished session still has skipped work that could be picked up again. */
export function hasUnfinishedWork(session: WorkoutSession): boolean {
  return session.exercises.some((ex) => ex.status === "skipped" || (isSetBased(ex) && ex.sets.some((s) => s.status === "skipped")));
}

export function unfinishedCount(session: WorkoutSession): number {
  return session.exercises.filter((ex) => ex.status === "skipped" || (isSetBased(ex) && ex.sets.some((s) => s.status === "skipped"))).length;
}

/**
 * Turns a finished session back into an active one so the rest can be done later: skipped sets and
 * exercises reopen, and the time spent finished is excluded from the workout's duration.
 */
export function reopenSession(session: WorkoutSession, now: Date = new Date()): WorkoutSession {
  const { completedAt, ...rest } = session;
  const gap = completedAt ? Math.max(0, now.getTime() - Date.parse(completedAt)) : 0;
  return {
    ...rest,
    status: "active",
    pausedMs: (session.pausedMs ?? 0) + gap,
    exercises: session.exercises.map((ex): SessionExercise => {
      if (isSetBased(ex)) {
        const sets = (ex.sets as (StrengthSetResult | TimedSetResult)[]).map((s) => (s.status === "skipped" ? { ...s, status: "pending" as const } : s));
        const updated = { ...ex, sets, status: "pending" } as SetBasedSessionExercise;
        return { ...updated, status: deriveSetStatus(updated) };
      }
      if (ex.status !== "skipped") return ex;
      return { ...ex, status: hasActivityData(ex) ? "in_progress" : "pending" };
    }),
  };
}

/** Records a timed set (from the interval timer or a manual tap). Completes the next pending set by default. */
export function completeTimedSet(
  session: WorkoutSession,
  exerciseId: string,
  opts: { setNumber?: number; durationSeconds?: number; status?: "completed" | "skipped"; at?: Date } = {},
): WorkoutSession {
  return mapTimed(session, exerciseId, (ex) => {
    const target = opts.setNumber !== undefined ? ex.sets.find((s) => s.setNumber === opts.setNumber) : nextPendingSet(ex);
    if (!target || target.status !== "pending") return ex;
    const status = opts.status ?? "completed";
    const sets = ex.sets.map((s): TimedSetResult =>
      s !== target
        ? s
        : status === "completed"
          ? {
              setNumber: s.setNumber,
              durationSeconds: opts.durationSeconds ?? ex.prescribed.workSeconds,
              completedAt: (opts.at ?? new Date()).toISOString(),
              status,
            }
          : { setNumber: s.setNumber, status },
    );
    const updated: TimedSessionExercise = { ...ex, sets, status: ex.status === "skipped" ? "pending" : ex.status };
    // A skipped set with nothing left pending still leaves the exercise done if any set was worked.
    const pending = sets.some((x) => x.status === "pending");
    const done = sets.some((x) => x.status === "completed");
    updated.status = !pending ? (done ? "completed" : "skipped") : deriveSetStatus(updated);
    return updated;
  });
}

/** Changes today's timed prescription; the set count adds/removes trailing pending sets. */
export function updateTimedPrescription(
  session: WorkoutSession,
  exerciseId: string,
  patch: Partial<Pick<TimedTarget, "sets" | "workSeconds" | "restSeconds">>,
): WorkoutSession {
  return mapTimed(session, exerciseId, (ex) => {
    const prescribed: TimedTarget = { ...ex.prescribed, ...patch };
    let sets = ex.sets;
    if (patch.sets !== undefined) {
      const locked = sets.filter((s) => s.status !== "pending").length;
      const desired = Math.max(patch.sets, locked, 1);
      prescribed.sets = desired;
      const kept: TimedSetResult[] = [];
      let toRemove = Math.max(0, sets.length - desired);
      for (let i = sets.length - 1; i >= 0; i--) {
        if (toRemove > 0 && sets[i].status === "pending") {
          toRemove--;
          continue;
        }
        kept.unshift(sets[i]);
      }
      for (let n = kept.length + 1; n <= desired; n++) kept.push({ setNumber: n, status: "pending" });
      sets = kept.map((x, i) => ({ ...x, setNumber: i + 1 }));
    }
    const updated = { ...ex, prescribed, sets };
    return { ...updated, status: deriveSetStatus(updated) };
  });
}

/**
 * Changes today's prescription. The template is never touched.
 * Weight/reps edits flow into upcoming (pending) sets only; completed sets keep their recorded values.
 * Changing the set count adds or removes trailing pending sets.
 */
export function updatePrescription(
  session: WorkoutSession,
  exerciseId: string,
  patch: Partial<Omit<StrengthTarget, "kind">> & { weightKg?: number | undefined },
): WorkoutSession {
  return mapStrength(session, exerciseId, (ex) => {
    const prescribed: StrengthTarget = { ...ex.prescribed, ...patch };
    if ("weightKg" in patch && (patch.weightKg === undefined || patch.weightKg === 0)) {
      delete prescribed.weightKg;
    }
    let sets = ex.sets.map((s) => {
      if (s.status !== "pending") return s;
      const next = { ...s };
      if ("reps" in patch) {
        next.reps = prescribed.reps;
        next.targetReps = prescribed.reps;
      }
      if ("weightKg" in patch) {
        if (prescribed.weightKg === undefined) delete next.weightKg;
        else next.weightKg = prescribed.weightKg;
      }
      return next;
    });

    if (patch.sets !== undefined) {
      const locked = sets.filter((s) => s.status !== "pending").length;
      const desired = Math.max(patch.sets, locked, 1);
      prescribed.sets = desired;
      if (desired > sets.length) {
        for (let n = sets.length + 1; n <= desired; n++) sets.push(pendingSet(n, prescribed));
      } else if (desired < sets.length) {
        // Drop pending sets from the end until we hit the desired count.
        const result: StrengthSetResult[] = [];
        let toRemove = sets.length - desired;
        for (let i = sets.length - 1; i >= 0; i--) {
          if (toRemove > 0 && sets[i].status === "pending") {
            toRemove--;
            continue;
          }
          result.unshift(sets[i]);
        }
        sets = result.map((s, i) => ({ ...s, setNumber: i + 1 }));
      }
    }
    const updated = { ...ex, prescribed, sets };
    return { ...updated, status: deriveSetStatus(updated) };
  });
}

export function skipExercise(session: WorkoutSession, exerciseId: string): WorkoutSession {
  return mapExercise(session, exerciseId, (ex) => {
    if (isSetBased(ex)) {
      return {
        ...ex,
        status: "skipped",
        sets: (ex.sets as (StrengthSetResult | TimedSetResult)[]).map((s) => (s.status === "pending" ? { ...s, status: "skipped" } : s)),
      } as SetBasedSessionExercise;
    }
    const { timerStartedAt: _t, ...rest } = ex;
    return { ...rest, status: "skipped" } as SessionExercise;
  });
}

export function unskipExercise(session: WorkoutSession, exerciseId: string): WorkoutSession {
  return mapExercise(session, exerciseId, (ex) => {
    if (isSetBased(ex)) {
      const sets = (ex.sets as (StrengthSetResult | TimedSetResult)[]).map((s) => (s.status === "skipped" ? { ...s, status: "pending" as const } : s));
      const updated = { ...ex, sets, status: "pending" } as SetBasedSessionExercise;
      return { ...updated, status: deriveSetStatus(updated) };
    }
    const hasData = hasActivityData(ex);
    return { ...ex, status: hasData ? "in_progress" : "pending" };
  });
}

type ActivityPatch =
  | Partial<Pick<CardioSessionExercise, "actualDurationSeconds" | "actualDistanceKm" | "timerStartedAt">>
  | Partial<Pick<SwimmingSessionExercise, "actualDurationSeconds" | "actualDistanceMeters" | "timerStartedAt">>;

function hasActivityData(ex: ActivitySessionExercise): boolean {
  if (ex.actualDurationSeconds || ex.timerStartedAt) return true;
  return ex.kind === "cardio" ? !!ex.actualDistanceKm : !!ex.actualDistanceMeters;
}

/** Updates cardio/swimming actuals. Keys set to undefined are removed. */
export function updateActivity(session: WorkoutSession, exerciseId: string, patch: ActivityPatch): WorkoutSession {
  return mapExercise(session, exerciseId, (ex) => {
    if (isSetBased(ex)) throw new Error("Not an activity exercise");
    const updated = { ...ex, ...patch } as CardioSessionExercise | SwimmingSessionExercise;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete (updated as unknown as Record<string, unknown>)[k];
    }
    if (updated.status === "pending" && hasActivityData(updated)) updated.status = "in_progress";
    return updated;
  });
}

/** Marks a cardio/swimming activity complete, folding any running stopwatch into the duration. */
export function completeActivity(session: WorkoutSession, exerciseId: string, now: number = Date.now()): WorkoutSession {
  return mapExercise(session, exerciseId, (ex) => {
    if (isSetBased(ex)) throw new Error("Not an activity exercise");
    const { timerStartedAt, ...rest } = ex;
    const running = timerStartedAt ? Math.round((now - timerStartedAt) / 1000) : 0;
    return {
      ...rest,
      ...(running ? { actualDurationSeconds: (ex.actualDurationSeconds ?? 0) + running } : {}),
      status: "completed",
    } as SessionExercise;
  });
}

/** Re-opens a completed exercise for further edits. */
export function reopenExercise(session: WorkoutSession, exerciseId: string): WorkoutSession {
  return mapExercise(session, exerciseId, (ex) => {
    if (isSetBased(ex)) return { ...ex, status: deriveSetStatus({ ...ex, status: "pending" }) };
    return { ...ex, status: "in_progress" };
  });
}

export function setExerciseNotes(session: WorkoutSession, exerciseId: string, notes: string): WorkoutSession {
  return mapExercise(session, exerciseId, (ex) => {
    const next: SessionExercise = { ...ex, notes };
    if (!notes.trim()) delete next.notes;
    return next;
  });
}

export function setSessionNotes(session: WorkoutSession, notes: string): WorkoutSession {
  const next: WorkoutSession = { ...session, notes };
  if (!notes.trim()) delete next.notes;
  return next;
}

/**
 * Finishes a workout. Unfinished work is marked skipped:
 * - strength: remaining pending sets are skipped; the exercise counts as completed if any set was done.
 * - activities: completed if any duration/distance was recorded, otherwise skipped.
 */
export function finishSession(session: WorkoutSession, now: Date = new Date()): WorkoutSession {
  const nowMs = now.getTime();
  const exercises = session.exercises.map((ex): SessionExercise => {
    if (ex.status === "completed" || ex.status === "skipped") {
      if (!isSetBased(ex) && ex.timerStartedAt) return stripTimer(ex);
      return ex;
    }
    if (isSetBased(ex)) {
      const anyDone = ex.sets.some((s) => s.status === "completed");
      return {
        ...ex,
        sets: (ex.sets as (StrengthSetResult | TimedSetResult)[]).map((s) => (s.status === "pending" ? { ...s, status: "skipped" } : s)),
        status: anyDone ? "completed" : "skipped",
      } as SetBasedSessionExercise;
    }
    const withTime = ex.timerStartedAt
      ? completeActivityValue(ex, nowMs)
      : ex;
    return { ...withTime, status: hasActivityData(withTime) ? "completed" : "skipped" };
  });
  return { ...session, exercises, status: "completed", completedAt: now.toISOString() };
}

function stripTimer<T extends CardioSessionExercise | SwimmingSessionExercise>(ex: T): T {
  const { timerStartedAt: _t, ...rest } = ex;
  return rest as T;
}

function completeActivityValue<T extends CardioSessionExercise | SwimmingSessionExercise>(ex: T, now: number): T {
  const running = ex.timerStartedAt ? Math.round((now - ex.timerStartedAt) / 1000) : 0;
  return { ...stripTimer(ex), actualDurationSeconds: (ex.actualDurationSeconds ?? 0) + running };
}

/** The exercise the user should do next: first in-progress, otherwise first pending. */
export function currentExercise(session: WorkoutSession): SessionExercise | undefined {
  const next =
    session.exercises.find((e) => e.status === "in_progress") ??
    session.exercises.find((e) => e.status === "pending");
  // Inside a superset/circuit, it's whichever member's turn it is in the rotation.
  return next?.group ? (groupTurn(session, next.id) ?? next) : next;
}

export interface SessionStats {
  exercisesTotal: number;
  exercisesCompleted: number;
  exercisesSkipped: number;
  setsCompleted: number;
  setsTotal: number;
  volumeKg: number;
  distanceKm: number;
  /** Seconds of timed work completed. */
  timedSeconds: number;
}

export function sessionStats(session: WorkoutSession): SessionStats {
  const stats: SessionStats = {
    exercisesTotal: session.exercises.length,
    exercisesCompleted: 0,
    exercisesSkipped: 0,
    setsCompleted: 0,
    setsTotal: 0,
    volumeKg: 0,
    distanceKm: 0,
    timedSeconds: 0,
  };
  for (const ex of session.exercises) {
    if (ex.status === "completed") stats.exercisesCompleted++;
    if (ex.status === "skipped") stats.exercisesSkipped++;
    if (ex.kind === "strength") {
      stats.setsTotal += ex.sets.length;
      for (const s of ex.sets) {
        if (s.status !== "completed") continue;
        stats.setsCompleted++;
        stats.volumeKg += (s.weightKg ?? 0) * (s.reps ?? 0);
      }
    } else if (ex.kind === "timed") {
      stats.setsTotal += ex.sets.length;
      for (const s of ex.sets) {
        if (s.status !== "completed") continue;
        stats.setsCompleted++;
        stats.timedSeconds += s.durationSeconds ?? 0;
      }
    } else if (ex.kind === "cardio") {
      stats.distanceKm += ex.actualDistanceKm ?? 0;
    } else {
      stats.distanceKm += (ex.actualDistanceMeters ?? 0) / 1000;
    }
  }
  return stats;
}

export interface PreviousPerformance {
  sessionId: string;
  date: string;
  exercise: SessionExercise;
}

/** Most recent completed session (other than `excludeSessionId`) where this exercise had recorded work. */
export function lastPerformance(
  history: WorkoutSession[],
  exerciseId: string,
  excludeSessionId?: string,
): PreviousPerformance | undefined {
  const sorted = [...history]
    .filter((s) => s.status === "completed" && s.id !== excludeSessionId && s.completedAt)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
  for (const s of sorted) {
    const ex = s.exercises.find(
      (e) =>
        e.exerciseId === exerciseId &&
        (isSetBased(e) ? e.sets.some((set) => set.status === "completed") : e.status === "completed"),
    );
    if (ex) return { sessionId: s.id, date: s.completedAt!, exercise: ex };
  }
  return undefined;
}
