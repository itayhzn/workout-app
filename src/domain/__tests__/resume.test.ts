import { describe, expect, it } from "vitest";
import { sessionDurationMs } from "../format";
import { applyIntervalProgress, buildIntervalPlan, intervalPosition, pauseIntervals, rewindIntervalStep, skipIntervalStep, startIntervals } from "../intervals";
import { completeNextSet, completeTimedSet, createSession, finishSession, hasUnfinishedWork, reopenSession, skipExercise, uncompleteSet, unfinishedCount } from "../session";
import type { Exercise, StrengthSessionExercise, TimedSessionExercise, Workout, WorkoutSession } from "../types";

const exercises: Exercise[] = ["a", "b", "c"].map((id) => ({ id, name: id.toUpperCase(), type: "mobility" }));
const flow: Workout = {
  id: "flow",
  name: "Flow",
  type: "mobility",
  exercises: [
    { id: "a", exerciseId: "a", target: { kind: "timed", sets: 1, workSeconds: 30, restSeconds: 10 } },
    { id: "b", exerciseId: "b", target: { kind: "timed", sets: 1, workSeconds: 30, restSeconds: 10 } },
    { id: "c", exerciseId: "c", target: { kind: "strength", sets: 2, reps: 10, restSeconds: 60 } },
  ],
};
const T0 = 1_000_000;
const timed = (s: WorkoutSession, id: string) => s.exercises.find((e) => e.id === id) as TimedSessionExercise;
// Plan: prep 0–5 s · A work 5–35 · rest 35–45 · B work 45–75
const timer = () => startIntervals(buildIntervalPlan(createSession(flow, exercises), "a"), T0);

describe("interval Back", () => {
  it("restarts the current work step after the first few seconds", () => {
    const { state, reopened } = rewindIntervalStep(timer(), T0 + 20_000); // 15 s into A
    expect(intervalPosition(state, T0 + 20_000)).toMatchObject({ index: 1, remainingMs: 30_000 });
    expect(reopened).toEqual([]);
  });

  it("goes to the previous work step from a rest or early in a step, reopening what was recorded", () => {
    // Toddler skipped A 2 s in; we're now in the rest before B.
    let t = skipIntervalStep(timer(), T0 + 7_000);
    const s1 = applyIntervalProgress(createSession(flow, exercises), t, T0 + 8_000);
    expect(timed(s1, "a").sets[0].status).toBe("skipped");
    const back = rewindIntervalStep(t, T0 + 8_000);
    t = back.state;
    expect(intervalPosition(t, T0 + 8_000)).toMatchObject({ index: 1, remainingMs: 30_000 }); // A again, full length
    expect(back.reopened.map((st) => st.exerciseId)).toEqual(["a"]);
    expect(t.skippedSteps).toEqual([]);
    // Once reopened and run to the end, A is recorded as completed this time.
    const s2 = applyIntervalProgress(uncompleteSet(s1, "a", 1), t, T0 + 40_000);
    expect(timed(s2, "a").sets[0]).toMatchObject({ status: "completed", durationSeconds: 30 });
    expect(timed(s2, "a").status).toBe("completed");
  });

  it("from early in a work step jumps back over the rest to the previous work step", () => {
    const { state, reopened } = rewindIntervalStep(timer(), T0 + 46_000); // 1 s into B
    expect(intervalPosition(state, T0 + 46_000).step).toMatchObject({ exerciseId: "a", phase: "work" });
    expect(reopened.map((st) => st.exerciseId)).toEqual(["a"]);
  });

  it("works while paused and stays paused", () => {
    const paused = pauseIntervals(timer(), T0 + 20_000);
    const { state } = rewindIntervalStep(paused, T0 + 99_000);
    expect(state.pausedAt).toBe(T0 + 20_000);
    expect(intervalPosition(state, T0 + 99_000)).toMatchObject({ index: 1, remainingMs: 30_000 });
  });
});

describe("resuming a finished workout", () => {
  it("reopens skipped work, keeps what was done, and doesn't count the break", () => {
    let s = createSession(flow, exercises, new Date("2026-09-30T05:00:00Z"));
    s = completeTimedSet(s, "a", { at: new Date("2026-09-30T05:01:00Z") });
    s = completeNextSet(s, "c").session;
    s = skipExercise(s, "b");
    const done = finishSession(s, new Date("2026-09-30T05:10:00Z")); // cut short after 10 min
    expect(hasUnfinishedWork(done)).toBe(true);
    expect(unfinishedCount(done)).toBe(2); // B skipped, C half done

    const resumed = reopenSession(done, new Date("2026-09-30T18:00:00Z"));
    expect(resumed.status).toBe("active");
    expect(resumed.completedAt).toBeUndefined();
    expect(timed(resumed, "a").status).toBe("completed");
    expect(timed(resumed, "b")).toMatchObject({ status: "pending", sets: [{ status: "pending" }] });
    expect((resumed.exercises[2] as StrengthSessionExercise).sets.map((x) => x.status)).toEqual(["completed", "pending"]);
    expect(resumed.pausedMs).toBe((18 * 60 - 5 * 60 - 10) * 60_000);

    // Finish again after 5 more minutes: 15 minutes of workout, not 13 hours.
    const again = finishSession(resumed, new Date("2026-09-30T18:05:00Z"));
    expect(sessionDurationMs(again)).toBe(15 * 60_000);
    expect(again.completedAt! > done.completedAt!).toBe(true);
  });

  it("un-skipping a set also un-skips its exercise", () => {
    const s = skipExercise(createSession(flow, exercises), "a");
    expect(timed(uncompleteSet(s, "a", 1), "a")).toMatchObject({ status: "pending", sets: [{ status: "pending" }] });
  });
});
