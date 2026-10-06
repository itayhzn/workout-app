import { describe, expect, it } from "vitest";
import { applyPlanChanges, planChangesFromSession, sourceForAddedExercise, targetDiff } from "../planChanges";
import {
  addExerciseToSession,
  completeNextSet,
  completeTimedSet,
  createSession,
  finishSession,
  removeAddedExercise,
  reopenSession,
  setKeepAddedExercise,
  updatePrescription,
  updateTimedPrescription,
  upNextIndex,
} from "../session";
import type { Exercise, StrengthTarget, TimedTarget, Workout, WorkoutSession } from "../types";

const exercises: Exercise[] = [
  { id: "pullup", name: "Pull-Up", type: "strength" },
  { id: "row", name: "Row", type: "strength" },
  { id: "curl", name: "Curl", type: "strength" },
  { id: "cat-cow", name: "Cat-Cow", type: "mobility" },
  { id: "childs-pose", name: "Child's Pose", type: "mobility" },
  { id: "pigeon", name: "Pigeon Stretch", type: "mobility" },
  { id: "plank", name: "Plank", type: "mobility" },
];
const ex = (id: string) => exercises.find((e) => e.id === id)!;
const strength = (sets: number, reps: number, weightKg?: number, restSeconds = 90): StrengthTarget => ({ kind: "strength", sets, reps, restSeconds, ...(weightKg ? { weightKg } : {}) });
const timed = (sets: number, workSeconds: number, restSeconds = 10): TimedTarget => ({ kind: "timed", sets, workSeconds, restSeconds });

const pull: Workout = {
  id: "pull",
  name: "Pull B",
  type: "strength",
  exercises: [
    { id: "p1", exerciseId: "cat-cow", target: timed(1, 30) },
    { id: "p2", exerciseId: "pullup", target: strength(3, 8, undefined, 120) },
    { id: "p3", exerciseId: "row", group: "ss", target: strength(3, 10, 20, 0) },
    { id: "p4", exerciseId: "curl", group: "ss", target: strength(3, 12, 10, 75) },
  ],
};
const floor: Workout = {
  id: "floor",
  name: "Floor: Mobility + Core",
  type: "mobility",
  exercises: [
    { id: "f1", exerciseId: "cat-cow", target: timed(1, 60) },
    { id: "f2", exerciseId: "childs-pose", target: timed(1, 60) },
    { id: "f3", exerciseId: "pigeon", target: timed(2, 45) },
  ],
};
const stretch: Workout = {
  id: "stretch",
  name: "Saturday Stretch",
  type: "mobility",
  exercises: [{ id: "s1", exerciseId: "childs-pose", target: timed(1, 45) }],
};
const plan = [pull, floor, stretch];

const done = (workout: Workout, completedAt: string): WorkoutSession => ({ ...finishSession(createSession(workout, exercises), new Date(completedAt)) });
const ids = (s: WorkoutSession) => s.exercises.map((e) => e.id);
const childsPose = { target: timed(1, 60), from: { workoutId: "floor", workoutName: "Floor: Mobility + Core", itemId: "f2" } };

describe("adding an exercise up next", () => {
  it("goes before the current exercise when it hasn't been started", () => {
    const s = createSession(pull, exercises);
    expect(upNextIndex(s)).toBe(0);
    const next = addExerciseToSession(s, ex("childs-pose"), childsPose.target, { from: childsPose.from, id: "x" });
    expect(ids(next)).toEqual(["x", "p1", "p2", "p3", "p4"]);
    expect(next.exercises[0]).toMatchObject({ exerciseName: "Child's Pose", kind: "timed", status: "pending", added: { from: childsPose.from, startTarget: timed(1, 60) } });
  });

  it("goes after the current exercise once it's under way", () => {
    let s = createSession(pull, exercises);
    s = completeTimedSet(s, "p1");
    s = completeNextSet(s, "p2").session; // pull-ups in progress
    expect(ids(addExerciseToSession(s, ex("childs-pose"), childsPose.target, { id: "x" }))).toEqual(["p1", "p2", "x", "p3", "p4"]);
  });

  it("never splits a superset", () => {
    let s = createSession(pull, exercises);
    s = completeTimedSet(s, "p1");
    for (let i = 0; i < 3; i++) s = completeNextSet(s, "p2").session;
    s = completeNextSet(s, "p3").session; // the superset is under way: curl's turn
    expect(ids(addExerciseToSession(s, ex("childs-pose"), childsPose.target, { id: "x" }))).toEqual(["p1", "p2", "p3", "p4", "x"]);
  });

  it("goes after the exercises a running interval sequence is working through", () => {
    const s = createSession(floor, exercises);
    expect(upNextIndex(s, new Set(["f1", "f2", "f3"]))).toBe(3);
  });

  it("goes at the end when everything is done", () => {
    let s = createSession(stretch, exercises);
    s = completeTimedSet(s, "s1");
    expect(upNextIndex(s)).toBe(1);
  });

  it("doesn't change its input and can add the same exercise twice", () => {
    const s = createSession(pull, exercises);
    const before = structuredClone(s);
    const target = timed(1, 60);
    let next = addExerciseToSession(s, ex("childs-pose"), target);
    next = addExerciseToSession(next, ex("childs-pose"), target);
    expect(s).toEqual(before);
    expect(new Set(ids(next)).size).toBe(6);
    // The session never aliases the target it was given.
    next = updateTimedPrescription(next, next.exercises[0].id, { workSeconds: 90 });
    expect(target.workSeconds).toBe(60);
    expect(next.exercises[0].added!.startTarget).toEqual(timed(1, 60));
  });

  it("can be removed until work is recorded on it, and only if it was added", () => {
    const s = addExerciseToSession(createSession(pull, exercises), ex("childs-pose"), timed(1, 60), { id: "x" });
    expect(ids(removeAddedExercise(s, "x"))).toEqual(["p1", "p2", "p3", "p4"]);
    expect(() => removeAddedExercise(completeTimedSet(s, "x"), "x")).toThrow(/recorded/);
    expect(() => removeAddedExercise(s, "p1")).toThrow(/skip/);
  });

  it("is kept through finishing and resuming", () => {
    const s = addExerciseToSession(createSession(pull, exercises), ex("childs-pose"), timed(1, 60), { from: childsPose.from, id: "x" });
    const finished = finishSession(setKeepAddedExercise(s, "x", true));
    const resumed = reopenSession(finished);
    expect(resumed.exercises[0]).toMatchObject({ id: "x", status: "pending", added: { keep: true, from: childsPose.from } });
  });
});

describe("the target of an added exercise", () => {
  it("comes from the workout it was last done in", () => {
    const history = [done(floor, "2026-10-01T18:00:00Z"), done(stretch, "2026-10-03T08:00:00Z")];
    expect(sourceForAddedExercise(ex("childs-pose"), plan, history)).toEqual({
      target: timed(1, 45),
      from: { workoutId: "stretch", workoutName: "Saturday Stretch", itemId: "s1" },
    });
  });

  it("follows an earlier addition back to its own workout", () => {
    const today = finishSession(addExerciseToSession(createSession(pull, exercises), ex("childs-pose"), timed(1, 60), { from: childsPose.from }), new Date("2026-10-06T06:00:00Z"));
    const history = [done(stretch, "2026-10-03T08:00:00Z"), today];
    expect(sourceForAddedExercise(ex("childs-pose"), plan, history).from).toEqual(childsPose.from);
  });

  it("falls back to the first workout that has it when its last workout is gone", () => {
    const history = [done({ ...stretch, id: "deleted" }, "2026-10-03T08:00:00Z")];
    expect(sourceForAddedExercise(ex("childs-pose"), plan, history).from?.workoutId).toBe("floor");
  });

  it("uses the default target when no workout has it, and isn't linked to anything", () => {
    expect(sourceForAddedExercise(ex("plank"), plan, [])).toEqual({ target: { kind: "timed", sets: 1, workSeconds: 30, restSeconds: 10 } });
  });

  it("rests like the end of a round when it comes from a superset", () => {
    expect(sourceForAddedExercise(ex("row"), plan, []).target).toEqual(strength(3, 10, 20, 75));
  });
});

describe("plan changes when the workout is finished", () => {
  const addChildsPose = (s: WorkoutSession) => addExerciseToSession(s, ex("childs-pose"), childsPose.target, { from: childsPose.from, id: "x" });

  it("writes back only the target fields changed today", () => {
    let s = addChildsPose(createSession(pull, exercises));
    s = updateTimedPrescription(s, "x", { workSeconds: 90 });
    const changes = planChangesFromSession(finishSession(s));
    expect(changes).toEqual([{ kind: "target", workoutId: "floor", itemId: "f2", exerciseId: "childs-pose", targetKind: "timed", set: { workSeconds: 90 }, unset: [] }]);
    // Someone changed the rest on the desktop meanwhile: that stays.
    const edited: Workout = { ...floor, exercises: floor.exercises.map((x) => (x.id === "f2" ? { ...x, target: timed(1, 60, 20) } : x)) };
    expect(applyPlanChanges(edited, changes).exercises[1].target).toEqual(timed(1, 90, 20));
    expect(applyPlanChanges(pull, changes)).toBe(pull);
  });

  it("asks for nothing when the target wasn't changed and it isn't kept", () => {
    expect(planChangesFromSession(finishSession(addChildsPose(createSession(pull, exercises))))).toEqual([]);
  });

  it("can clear a weight", () => {
    let s = addExerciseToSession(createSession(floor, exercises), ex("row"), strength(3, 10, 20), { from: { workoutId: "pull", workoutName: "Pull B", itemId: "p3" }, id: "r" });
    s = updatePrescription(s, "r", { weightKg: undefined });
    expect(planChangesFromSession(s)).toMatchObject([{ set: {}, unset: ["weightKg"] }]);
    expect(applyPlanChanges(pull, planChangesFromSession(s)).exercises[2].target).toEqual(strength(3, 10, undefined, 0));
    expect(targetDiff(strength(3, 10, 20), strength(3, 12))).toEqual({ set: { reps: 12 }, unset: ["weightKg"] });
  });

  it("keeps it in the workout after the exercise before it, after a whole superset", () => {
    let s = createSession(pull, exercises);
    s = completeTimedSet(s, "p1");
    for (let i = 0; i < 3; i++) s = completeNextSet(s, "p2").session;
    s = completeNextSet(s, "p3").session;
    s = setKeepAddedExercise(addChildsPose(s), "x", true);
    const changes = planChangesFromSession(finishSession(s));
    expect(changes).toEqual([{ kind: "add", workoutId: "pull", afterItemId: "p4", item: { id: "x", exerciseId: "childs-pose", target: timed(1, 60) } }]);
    const kept = applyPlanChanges(pull, changes);
    expect(kept.exercises.map((x) => x.id)).toEqual(["p1", "p2", "p3", "p4", "x"]);
    expect(applyPlanChanges(kept, changes)).toBe(kept); // applying twice adds it once
  });

  it("keeps it in place relative to the plan, at the start or next to another kept exercise", () => {
    let s = setKeepAddedExercise(addChildsPose(createSession(pull, exercises)), "x", true); // added before Cat-Cow
    s = setKeepAddedExercise(addExerciseToSession(completeTimedSet(s, "x"), ex("pigeon"), timed(1, 45), { id: "y" }), "y", true);
    expect(ids(s)).toEqual(["x", "y", "p1", "p2", "p3", "p4"]);
    const kept = applyPlanChanges(pull, planChangesFromSession(finishSession(s)));
    expect(kept.exercises.map((x) => x.id)).toEqual(["x", "y", "p1", "p2", "p3", "p4"]);
  });

  it("puts a kept exercise at the end when the item before it was removed from the plan", () => {
    const s = setKeepAddedExercise(addExerciseToSession(completeTimedSet(createSession(stretch, exercises), "s1"), ex("pigeon"), timed(1, 45), { id: "y" }), "y", true);
    const changes = planChangesFromSession(finishSession(s));
    const without: Workout = { ...stretch, exercises: [{ id: "other", exerciseId: "cat-cow", target: timed(1, 30) }] };
    expect(applyPlanChanges(without, changes).exercises.map((x) => x.id)).toEqual(["other", "y"]);
  });

  it("leaves the plan alone when the item it came from is gone", () => {
    let s = addChildsPose(createSession(pull, exercises));
    s = updateTimedPrescription(s, "x", { workSeconds: 90 });
    const without: Workout = { ...floor, exercises: floor.exercises.filter((x) => x.id !== "f2") };
    expect(applyPlanChanges(without, planChangesFromSession(finishSession(s)))).toBe(without);
  });
});
