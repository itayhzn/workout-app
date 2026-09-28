import { describe, expect, it } from "vitest";
import { canonicalWorkout, parseWorkouts } from "../config";
import { estimateItemsSeconds, formatStrengthTarget } from "../format";
import { groupRuns, linkWithNext, normalizeGroups, supersetNext, unlinkFromNext } from "../groups";
import { buildIntervalPlan } from "../intervals";
import { completeNextSet, createSession, currentExercise } from "../session";
import type { Exercise, Workout, WorkoutExercise } from "../types";
import { validateWorkout } from "../validation";

const exercises: Exercise[] = ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase(), type: "strength" }));
const s = (sets = 3, rest = 60) => ({ kind: "strength" as const, sets, reps: 10, restSeconds: rest });
const t = (sets = 2) => ({ kind: "timed" as const, sets, workSeconds: 30, restSeconds: 10 });
const item = (id: string, target: WorkoutExercise["target"], group?: string): WorkoutExercise => ({ id, exerciseId: id, target, ...(group ? { group } : {}) });

describe("group structure", () => {
  it("normalizes: drops single-member groups and splits non-contiguous runs", () => {
    const items = normalizeGroups([item("a", s(), "g"), item("b", s()), item("c", s(), "g"), item("d", s(), "g")]);
    expect(items.map((i) => i.group)).toEqual([undefined, undefined, "g", "g"]);
    const split = normalizeGroups([item("a", s(), "g"), item("b", s(), "g"), item("c", s()), item("d", s(), "g")]);
    expect(split.map((i) => i.group)).toEqual(["g", "g", undefined, undefined]);
  });

  it("links and unlinks neighbours", () => {
    let items = [item("a", s()), item("b", s()), item("c", s())];
    items = linkWithNext(items, 0);
    items = linkWithNext(items, 1);
    expect(groupRuns(items).map((r) => r.length)).toEqual([3]);
    items = unlinkFromNext(items, 0);
    expect(groupRuns(items).map((r) => r.map((i) => i.id))).toEqual([["a"], ["b", "c"]]);
  });

  it("validates that groups don't mix target kinds", () => {
    const w: Workout = { id: "w", name: "W", type: "strength", exercises: [item("a", s(), "g"), item("b", t(), "g")] };
    expect(validateWorkout(w, exercises).map((e) => e.path)).toContain("exercises.0.group");
  });

  it("round-trips group, rep range and leave-by through JSON", () => {
    const w: Workout = {
      id: "w",
      name: "W",
      type: "strength",
      leaveBy: "07:25",
      exercises: [item("a", { ...s(), repsMax: 12 }, "g"), item("b", s(), "g")],
    };
    expect(parseWorkouts(JSON.parse(JSON.stringify([canonicalWorkout(w)])))).toEqual([canonicalWorkout(w)]);
    expect(formatStrengthTarget({ ...s(), repsMax: 12 })).toBe("3 × 10–12");
  });
});

describe("supersets", () => {
  const w: Workout = { id: "w", name: "W", type: "strength", exercises: [item("a", s(3, 0), "g"), item("b", s(3, 90), "g"), item("c", s())] };

  it("rotates A → B → rest → A …, and currentExercise follows the rotation", () => {
    let session = createSession(w, exercises);
    expect(supersetNext(session, "a")).toEqual({ nextExerciseId: "b", rest: false });
    session = completeNextSet(session, "a").session;
    expect(currentExercise(session)?.id).toBe("b");
    session = completeNextSet(session, "b").session;
    expect(supersetNext(session, "b")).toEqual({ nextExerciseId: "a", rest: true });
    expect(currentExercise(session)?.id).toBe("a");
    for (let i = 0; i < 2; i++) session = completeNextSet(completeNextSet(session, "a").session, "b").session;
    expect(supersetNext(session, "b")).toEqual({ rest: true });
    expect(currentExercise(session)?.id).toBe("c");
  });

  it("estimates one rest per round", () => {
    expect(estimateItemsSeconds(w.exercises.slice(0, 2))).toBe(3 * (2 * 45 + 90) + 2 * 60);
  });
});

describe("circuits", () => {
  it("runs timed groups round-robin with each station's rest", () => {
    const w: Workout = { id: "w", name: "W", type: "strength", exercises: [item("a", t(2), "c"), item("b", t(2), "c"), item("d", t(1))] };
    const session = createSession(w, exercises);
    const plan = buildIntervalPlan(session, "b"); // starting mid-circuit starts the whole circuit
    expect(plan.filter((p) => p.phase === "work").map((p) => `${p.exerciseId}${p.setNumber}`)).toEqual(["a1", "b1", "a2", "b2", "d1"]);
  });
});

describe("leave-by", () => {
  it("sets a deadline on the session's day, or none if it already passed", () => {
    const w: Workout = { id: "w", name: "W", type: "strength", leaveBy: "07:25", exercises: [] };
    const early = createSession(w, exercises, new Date(2026, 8, 27, 5, 0));
    expect(new Date(early.leaveByAt!).getHours()).toBe(7);
    expect(new Date(early.leaveByAt!).getMinutes()).toBe(25);
    expect(createSession(w, exercises, new Date(2026, 8, 27, 8, 0)).leaveByAt).toBeUndefined();
  });
});
