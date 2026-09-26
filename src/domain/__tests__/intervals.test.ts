import { describe, expect, it } from "vitest";
import {
  applyIntervalProgress,
  buildIntervalPlan,
  extendIntervalStep,
  intervalPosition,
  pauseIntervals,
  resumeIntervals,
  skipIntervalStep,
  startIntervals,
  timedBlockSize,
} from "../intervals";
import { completeNextSet, completeTimedSet, createSession, finishSession, sessionStats } from "../session";
import type { Exercise, TimedSessionExercise, Workout, WorkoutSession } from "../types";

const exercises: Exercise[] = [
  { id: "crunch", name: "Crunches", type: "strength" },
  { id: "plank", name: "Plank", type: "strength" },
  { id: "side", name: "Side Plank", type: "strength" },
  { id: "squat", name: "Squat", type: "strength" },
];

const abs: Workout = {
  id: "abs",
  name: "Abs",
  type: "strength",
  exercises: [
    { id: "a1", exerciseId: "crunch", target: { kind: "timed", sets: 1, workSeconds: 30, restSeconds: 10 } },
    { id: "a2", exerciseId: "side", target: { kind: "timed", sets: 2, workSeconds: 20, restSeconds: 5 } },
    { id: "a3", exerciseId: "plank", target: { kind: "timed", sets: 1, workSeconds: 45, restSeconds: 0 } },
    { id: "a4", exerciseId: "squat", target: { kind: "strength", sets: 3, reps: 5, restSeconds: 60 } },
  ],
};

const timed = (s: WorkoutSession, id: string) => s.exercises.find((e) => e.id === id) as TimedSessionExercise;
const T0 = 1_000_000;

describe("buildIntervalPlan", () => {
  it("chains consecutive timed exercises with rests, stopping at the first non-timed exercise", () => {
    const s = createSession(abs, exercises);
    const plan = buildIntervalPlan(s, "a1");
    expect(plan.map((p) => `${p.phase}:${p.exerciseId}.${p.setNumber}:${p.durationSeconds}`)).toEqual([
      "prep:a1.1:5",
      "work:a1.1:30",
      "rest:a2.1:10", // rest belongs to the finished exercise, labelled with what's next
      "work:a2.1:20",
      "rest:a2.2:5",
      "work:a2.2:20",
      "rest:a3.1:5",
      "work:a3.1:45", // no trailing rest
    ]);
    expect(timedBlockSize(s, "a1")).toBe(3);
  });

  it("skips sets that are already done and returns nothing for non-timed starts", () => {
    let s = createSession(abs, exercises);
    s = completeTimedSet(s, "a1");
    s = completeTimedSet(s, "a2");
    expect(buildIntervalPlan(s, "a1").filter((p) => p.phase === "work").map((p) => `${p.exerciseId}.${p.setNumber}`)).toEqual(["a2.2", "a3.1"]);
    expect(buildIntervalPlan(s, "a4")).toEqual([]);
  });
});

describe("interval timer", () => {
  const session = () => createSession(abs, exercises);

  it("derives the current step from the clock", () => {
    const t = startIntervals(buildIntervalPlan(session(), "a1"), T0);
    expect(intervalPosition(t, T0 + 1000)).toMatchObject({ index: 0, remainingMs: 4000 });
    expect(intervalPosition(t, T0 + 6000).step).toMatchObject({ phase: "work", exerciseId: "a1" });
    expect(intervalPosition(t, T0 + 36_000).step).toMatchObject({ phase: "rest" });
    expect(intervalPosition(t, T0 + 1_000_000).finished).toBe(true);
  });

  it("pauses and resumes without losing time", () => {
    let t = startIntervals(buildIntervalPlan(session(), "a1"), T0);
    t = pauseIntervals(t, T0 + 10_000);
    expect(intervalPosition(t, T0 + 500_000)).toMatchObject({ index: 1, remainingMs: 25_000 });
    t = resumeIntervals(t, T0 + 500_000);
    expect(intervalPosition(t, T0 + 505_000)).toMatchObject({ index: 1, remainingMs: 20_000 });
  });

  it("records finished work steps as completed sets, idempotently", () => {
    const t = startIntervals(buildIntervalPlan(session(), "a1"), T0);
    const s0 = session();
    expect(applyIntervalProgress(s0, t, T0 + 20_000)).toBe(s0); // nothing finished yet
    const s1 = applyIntervalProgress(s0, t, T0 + 36_000);
    expect(timed(s1, "a1")).toMatchObject({ status: "completed", sets: [{ status: "completed", durationSeconds: 30, completedAt: new Date(T0 + 35_000).toISOString() }] });
    expect(applyIntervalProgress(s1, t, T0 + 36_000)).toBe(s1);
    // Catching up after the screen was off: everything that ended is recorded.
    const s2 = applyIntervalProgress(s1, t, T0 + 10 * 60_000);
    expect(["a1", "a2", "a3"].map((id) => timed(s2, id).status)).toEqual(["completed", "completed", "completed"]);
  });

  it("skipping a work step records that set as skipped; skipping rest just moves on", () => {
    let t = startIntervals(buildIntervalPlan(session(), "a1"), T0);
    t = skipIntervalStep(t, T0 + 1000); // skip prep
    expect(intervalPosition(t, T0 + 1000).step?.phase).toBe("work");
    t = skipIntervalStep(t, T0 + 2000); // skip crunches work
    const s = applyIntervalProgress(session(), t, T0 + 2000);
    expect(timed(s, "a1")).toMatchObject({ status: "skipped", sets: [{ status: "skipped" }] });
  });

  it("can extend the current step", () => {
    let t = startIntervals(buildIntervalPlan(session(), "a1"), T0);
    t = extendIntervalStep(t, 10, T0);
    expect(intervalPosition(t, T0).remainingMs).toBe(15_000);
    t = extendIntervalStep(t, -60, T0);
    expect(intervalPosition(t, T0).index).toBe(1);
  });
});

describe("timed sessions", () => {
  it("finishing marks unfinished timed sets skipped and counts timed work", () => {
    let s = completeTimedSet(createSession(abs, exercises), "a2", { durationSeconds: 18 });
    s = completeNextSet(s, "a4").session;
    const done = finishSession(s);
    expect(timed(done, "a2").sets.map((x) => x.status)).toEqual(["completed", "skipped"]);
    expect(timed(done, "a1").status).toBe("skipped");
    expect(sessionStats(done)).toMatchObject({ setsCompleted: 2, timedSeconds: 18 });
  });
});
