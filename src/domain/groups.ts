import { newId } from "./ids";
import { isSetBased, type SessionExercise, type WorkoutExercise, type WorkoutSession } from "./types";

// Supersets (strength) and circuits (timed) are consecutive items sharing a `group` id.
// Their sets are done in rotation: A1 → B1 → (rest) → A2 → B2 → (rest) …

type Groupable = { group?: string };

/** Splits items into contiguous runs: each ungrouped item is its own run; a group is one run. */
export function groupRuns<T extends Groupable>(items: T[]): T[][] {
  const runs: T[][] = [];
  for (const item of items) {
    const last = runs.at(-1);
    if (item.group && last && last[0].group === item.group) last.push(item);
    else runs.push([item]);
  }
  return runs;
}

/**
 * Makes grouping consistent after edits and reordering: a group must be contiguous and have at least
 * two members. Single leftovers lose their group; a group id that appears in two separate runs gets a
 * fresh id for the later run.
 */
export function normalizeGroups<T extends Groupable>(items: T[]): T[] {
  const seen = new Set<string>();
  return groupRuns(items).flatMap((run) => {
    const g = run[0].group;
    if (!g) return run;
    if (run.length < 2) return run.map(({ group: _g, ...rest }) => rest as T);
    const id = seen.has(g) ? newId() : g;
    seen.add(id);
    return run.map((item) => ({ ...item, group: id }));
  });
}

/** Joins item i and item i+1 into one group (merging existing groups). */
export function linkWithNext(items: WorkoutExercise[], i: number): WorkoutExercise[] {
  if (i < 0 || i >= items.length - 1) return items;
  const a = items[i].group;
  const b = items[i + 1].group;
  const id = a ?? b ?? newId();
  return normalizeGroups(items.map((item) => (item.group && (item.group === a || item.group === b)) || item === items[i] || item === items[i + 1] ? { ...item, group: id } : item));
}

/** Splits the group between item i and item i+1. */
export function unlinkFromNext(items: WorkoutExercise[], i: number): WorkoutExercise[] {
  const g = items[i]?.group;
  if (!g || items[i + 1]?.group !== g) return items;
  const fresh = newId();
  let after = false;
  return normalizeGroups(
    items.map((item, j) => {
      if (j === i + 1) after = true;
      if (after && item.group === g) return { ...item, group: fresh };
      return item;
    }),
  );
}

/** The contiguous group an exercise belongs to in a session ([ex] itself when ungrouped). */
export function groupMembers(session: WorkoutSession, exerciseId: string): SessionExercise[] {
  return groupRuns(session.exercises).find((run) => run.some((e) => e.id === exerciseId)) ?? [];
}

function hasPendingSet(ex: SessionExercise): boolean {
  return isSetBased(ex) && ex.status !== "skipped" && ex.sets.some((s) => s.status === "pending");
}

function completedCount(ex: SessionExercise): number {
  return isSetBased(ex) ? ex.sets.filter((s) => s.status === "completed").length : 0;
}

export interface SupersetStep {
  /** Where to go next within the superset (undefined when the superset is finished). */
  nextExerciseId?: string;
  /** Rest before the next set: false while moving on within a round, true at the end of a round. */
  rest: boolean;
}

/** After a set of `exerciseId`, decides the next superset member and whether to rest first. */
export function supersetNext(session: WorkoutSession, exerciseId: string): SupersetStep {
  const members = groupMembers(session, exerciseId);
  if (members.length < 2) return { rest: true };
  const i = members.findIndex((m) => m.id === exerciseId);
  const later = members.slice(i + 1).find(hasPendingSet);
  if (later) return { nextExerciseId: later.id, rest: false };
  const first = members.find(hasPendingSet);
  return first ? { nextExerciseId: first.id, rest: true } : { rest: true };
}

/** For a grouped exercise, the member whose turn it is (fewest completed sets, then list order). */
export function groupTurn(session: WorkoutSession, exerciseId: string): SessionExercise | undefined {
  const pending = groupMembers(session, exerciseId).filter(hasPendingSet);
  if (!pending.length) return undefined;
  return pending.reduce((best, m) => (completedCount(m) < completedCount(best) ? m : best));
}
