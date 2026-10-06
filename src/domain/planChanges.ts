import { defaultTarget, defaultTargetKind } from "./config";
import { groupRuns } from "./groups";
import type { Exercise, ExerciseTarget, PlanItemRef, SessionExercise, Workout, WorkoutExercise, WorkoutSession } from "./types";

// Exercises added during a workout are linked to the plan item they came from ("its own workout").
// When the workout is finished, today's target changes are written back to that item, and exercises
// marked "keep" are added to the session's workout. These are queued as PlanChanges so they survive
// being offline at the gym.

export interface AddedExerciseSource {
  target: ExerciseTarget;
  from?: PlanItemRef;
}

function resolve(workouts: Workout[], workoutId: string, itemId: string, exerciseId: string): { workout: Workout; item: WorkoutExercise } | undefined {
  const workout = workouts.find((w) => w.id === workoutId);
  const item = workout?.exercises.find((x) => x.id === itemId && x.exerciseId === exerciseId);
  return workout && item ? { workout, item } : undefined;
}

/**
 * The target an added exercise starts with: the same one it would have in its own workout. Its own
 * workout is the one it was last done in (from history), else the first workout in the plan that has it.
 * With no workout using it, it gets the default target for its type and isn't linked to anything.
 */
export function sourceForAddedExercise(exercise: Exercise, workouts: Workout[], history: WorkoutSession[]): AddedExerciseSource {
  const newestFirst = history
    .filter((s) => s.status === "completed" && s.completedAt)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
  let found: { workout: Workout; item: WorkoutExercise } | undefined;
  for (const s of newestFirst) {
    for (const ex of s.exercises) {
      if (ex.exerciseId !== exercise.id) continue;
      // An exercise added to that workout points at its own workout; an ordinary one is its workout's item.
      const ref = ex.added ? ex.added.from : { workoutId: s.workoutId, itemId: ex.id };
      found = ref && resolve(workouts, ref.workoutId, ref.itemId, exercise.id);
      if (found) break;
    }
    if (found) break;
  }
  if (!found) {
    for (const workout of workouts) {
      const item = workout.exercises.find((x) => x.exerciseId === exercise.id);
      if (item) {
        found = { workout, item };
        break;
      }
    }
  }
  if (!found) return { target: defaultTarget(defaultTargetKind(exercise.type)) };
  const { workout, item } = found;
  const target = structuredClone(item.target);
  if ("restSeconds" in target) target.restSeconds = soloRest(workout, item, target.restSeconds);
  return { target, from: { workoutId: workout.id, workoutName: workout.name, itemId: item.id } };
}

/**
 * In a superset only the last member's rest is used (the others are usually 0). Done on its own,
 * the exercise rests like the end of a round.
 */
function soloRest(workout: Workout, item: WorkoutExercise, own: number): number {
  if (!item.group) return own;
  const last = groupRuns(workout.exercises).find((run) => run.includes(item))?.at(-1)?.target;
  return last && "restSeconds" in last ? Math.max(own, last.restSeconds) : own;
}

export type PlanChange =
  | {
      kind: "target";
      workoutId: string;
      itemId: string;
      exerciseId: string;
      targetKind: ExerciseTarget["kind"];
      /** Target fields to set (only the ones changed during the workout). */
      set: Record<string, number | string>;
      /** Target fields that were cleared (e.g. a weight removed to make it bodyweight). */
      unset: string[];
    }
  | {
      kind: "add";
      workoutId: string;
      /** Insert after this item (after its whole superset/circuit); at the start when absent, at the end when it's gone. */
      afterItemId?: string;
      item: WorkoutExercise;
    };

/** The target fields that differ between how it started and how it ended. */
export function targetDiff(from: ExerciseTarget, to: ExerciseTarget): { set: Record<string, number | string>; unset: string[] } | undefined {
  if (from.kind !== to.kind) return undefined;
  const a = from as unknown as Record<string, unknown>;
  const b = to as unknown as Record<string, unknown>;
  const set: Record<string, number | string> = {};
  const unset: string[] = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (key === "kind" || a[key] === b[key]) continue;
    if (b[key] === undefined) unset.push(key);
    else set[key] = b[key] as number | string;
  }
  return Object.keys(set).length || unset.length ? { set, unset } : undefined;
}

/** The plan changes a finished (or finishing) session asks for. */
export function planChangesFromSession(session: WorkoutSession): PlanChange[] {
  const changes: PlanChange[] = [];
  session.exercises.forEach((ex, i) => {
    const added = ex.added;
    if (!added) return;
    const diff = added.from && targetDiff(added.startTarget, ex.prescribed);
    if (added.from && diff) {
      changes.push({
        kind: "target",
        workoutId: added.from.workoutId,
        itemId: added.from.itemId,
        exerciseId: ex.exerciseId,
        targetKind: ex.prescribed.kind,
        ...diff,
      });
    }
    if (added.keep) {
      changes.push({
        kind: "add",
        workoutId: session.workoutId,
        afterItemId: previousPlanItem(session.exercises, i),
        // The session exercise id becomes the item id, so applying this twice adds it once.
        item: { id: ex.id, exerciseId: ex.exerciseId, target: structuredClone(ex.prescribed) },
      });
    }
  });
  return changes;
}

/** The nearest earlier exercise that is (or is about to be) an item of the session's workout. */
function previousPlanItem(exercises: SessionExercise[], index: number): string | undefined {
  for (let j = index - 1; j >= 0; j--) {
    const ex = exercises[j];
    if (!ex.added || ex.added.keep) return ex.id;
  }
  return undefined;
}

/** Applies the changes for one workout. Returns the same object when nothing applies. Safe to apply twice. */
export function applyPlanChanges(workout: Workout, changes: PlanChange[]): Workout {
  let items = workout.exercises;
  for (const change of changes) {
    if (change.workoutId !== workout.id) continue;
    if (change.kind === "target") {
      const i = items.findIndex((x) => x.id === change.itemId && x.exerciseId === change.exerciseId && x.target.kind === change.targetKind);
      if (i === -1) continue; // removed from the plan since
      const target = { ...items[i].target, ...change.set } as Record<string, unknown>;
      for (const key of change.unset) delete target[key];
      if (JSON.stringify(target) === JSON.stringify(items[i].target)) continue;
      items = items.map((x, j) => (j === i ? { ...x, target: target as unknown as ExerciseTarget } : x));
    } else {
      if (items.some((x) => x.id === change.item.id)) continue;
      let at = 0;
      if (change.afterItemId !== undefined) {
        const after = items.findIndex((x) => x.id === change.afterItemId);
        if (after === -1) at = items.length;
        else {
          at = after + 1;
          const g = items[after].group;
          while (g && items[at]?.group === g) at++;
        }
      }
      items = [...items.slice(0, at), structuredClone(change.item), ...items.slice(at)];
    }
  }
  return items === workout.exercises ? workout : { ...workout, exercises: items };
}
