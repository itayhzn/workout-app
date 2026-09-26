import { describe, expect, it } from "vitest";
import {
  completeActivity,
  completeNextSet,
  createSession,
  currentExercise,
  finishSession,
  lastPerformance,
  sessionStats,
  skipExercise,
  uncompleteSet,
  updateActivity,
  updatePrescription,
  updateSet,
} from "../session";
import type { StrengthSessionExercise, WorkoutSession } from "../types";
import { exercises, pull, run } from "../../test/fixtures";

const strength = (s: WorkoutSession, i = 0) => s.exercises[i] as StrengthSessionExercise;

describe("createSession", () => {
  it("copies template values into an independent snapshot", () => {
    const template = structuredClone(pull);
    const s = createSession(template, exercises, new Date("2026-09-26T10:00:00Z"));
    expect(s.status).toBe("active");
    expect(s.workoutName).toBe("Pull");
    expect(s.workoutType).toBe("strength");
    expect(s.startedAt).toBe("2026-09-26T10:00:00.000Z");
    expect(s.exercises[0]).toMatchObject({ id: "pull-1", exerciseId: "pull-ups", exerciseName: "Pull Ups", status: "pending" });

    // Mutating the template afterwards must not affect the session.
    (template.exercises[0].target as { reps: number }).reps = 99;
    template.name = "Renamed";
    expect(strength(s).prescribed.reps).toBe(8);
    expect(s.workoutName).toBe("Pull");
  });

  it("initializes pending strength sets from the target", () => {
    const s = createSession(pull, exercises);
    expect(strength(s).sets).toEqual([1, 2, 3, 4].map((n) => ({ setNumber: n, targetReps: 8, reps: 8, weightKg: 10, status: "pending" })));
  });

  it("generates unique ids", () => {
    expect(createSession(pull, exercises).id).not.toBe(createSession(pull, exercises).id);
  });

  it("keeps workouts that reference missing exercises usable", () => {
    const broken = { ...pull, exercises: [...pull.exercises, { id: "x", exerciseId: "gone", target: { kind: "strength" as const, sets: 1, reps: 1, restSeconds: 0 } }] };
    const s = createSession(broken, exercises);
    expect(s.exercises[2]).toMatchObject({ missingDefinition: true, exerciseName: "Unknown exercise (gone)" });
  });
});

describe("completing sets", () => {
  it("completes the next pending set with displayed values and tracks status", () => {
    let s = createSession(pull, exercises);
    const r1 = completeNextSet(s, "pull-1", { weightKg: 12.5, reps: 7 }, new Date("2026-09-26T10:05:00Z"));
    expect(r1.completedSet).toMatchObject({ setNumber: 1, weightKg: 12.5, reps: 7, status: "completed", completedAt: "2026-09-26T10:05:00.000Z" });
    expect(strength(r1.session).status).toBe("in_progress");
    expect(r1.exerciseComplete).toBe(false);
    s = r1.session;
    for (let i = 0; i < 3; i++) s = completeNextSet(s, "pull-1").session;
    expect(strength(s).status).toBe("completed");
    expect(() => completeNextSet(s, "pull-1")).toThrow();
  });

  it("does not mutate the input session", () => {
    const s = createSession(pull, exercises);
    const frozen = JSON.stringify(s);
    completeNextSet(s, "pull-1");
    expect(JSON.stringify(s)).toBe(frozen);
  });

  it("can revert a completed set", () => {
    let s = completeNextSet(createSession(pull, exercises), "pull-1").session;
    s = uncompleteSet(s, "pull-1", 1);
    expect(strength(s).sets[0].status).toBe("pending");
    expect(strength(s).sets[0].completedAt).toBeUndefined();
    expect(strength(s).status).toBe("pending");
  });

  it("edits a completed set explicitly", () => {
    let s = completeNextSet(createSession(pull, exercises), "pull-1").session;
    s = updateSet(s, "pull-1", 1, { reps: 6, weightKg: null });
    expect(strength(s).sets[0]).toMatchObject({ reps: 6, status: "completed" });
    expect(strength(s).sets[0].weightKg).toBeUndefined();
  });
});

describe("updatePrescription", () => {
  it("applies weight/reps only to upcoming sets", () => {
    let s = completeNextSet(createSession(pull, exercises), "pull-1").session;
    s = updatePrescription(s, "pull-1", { weightKg: 15, reps: 6 });
    const ex = strength(s);
    expect(ex.sets[0]).toMatchObject({ weightKg: 10, reps: 8 });
    expect(ex.sets.slice(1).every((x) => x.weightKg === 15 && x.reps === 6)).toBe(true);
    expect(ex.prescribed).toMatchObject({ weightKg: 15, reps: 6 });
  });

  it("adds and removes pending sets but never removes logged ones", () => {
    let s = createSession(pull, exercises);
    s = completeNextSet(s, "pull-1").session;
    s = completeNextSet(s, "pull-1").session;
    s = updatePrescription(s, "pull-1", { sets: 6 });
    expect(strength(s).sets).toHaveLength(6);
    s = updatePrescription(s, "pull-1", { sets: 1 });
    expect(strength(s).sets).toHaveLength(2);
    expect(strength(s).status).toBe("completed");
  });

  it("clearing weight makes sets bodyweight", () => {
    const s = updatePrescription(createSession(pull, exercises), "pull-1", { weightKg: undefined });
    expect(strength(s).prescribed.weightKg).toBeUndefined();
    expect(strength(s).sets[0].weightKg).toBeUndefined();
  });
});

describe("activities", () => {
  it("records duration and distance and folds a running stopwatch in on completion", () => {
    let s = createSession(run, exercises);
    s = updateActivity(s, "run-1", { actualDistanceKm: 5.2, timerStartedAt: 1_000_000 });
    expect(s.exercises[0].status).toBe("in_progress");
    s = completeActivity(s, "run-1", 1_000_000 + 1800_000);
    expect(s.exercises[0]).toMatchObject({ status: "completed", actualDurationSeconds: 1800, actualDistanceKm: 5.2 });
    expect("timerStartedAt" in s.exercises[0]).toBe(false);
  });
});

describe("finishSession", () => {
  it("allows finishing early and marks unfinished work skipped", () => {
    let s = createSession(pull, exercises, new Date("2026-09-26T10:00:00Z"));
    s = completeNextSet(s, "pull-1").session;
    const done = finishSession(s, new Date("2026-09-26T10:48:00Z"));
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBe("2026-09-26T10:48:00.000Z");
    expect(strength(done, 0).status).toBe("completed"); // partial: keeps its one logged set
    expect(strength(done, 0).sets.map((x) => x.status)).toEqual(["completed", "skipped", "skipped", "skipped"]);
    expect(strength(done, 1).status).toBe("skipped");
    expect(sessionStats(done)).toMatchObject({ exercisesCompleted: 1, exercisesSkipped: 1, setsCompleted: 1, volumeKg: 80 });
  });

  it("respects explicit skips", () => {
    const s = skipExercise(createSession(pull, exercises), "pull-1");
    expect(currentExercise(s)?.id).toBe("pull-2");
    expect(finishSession(s).exercises[0].status).toBe("skipped");
  });
});

describe("lastPerformance", () => {
  it("finds the most recent completed session with work for that exercise", () => {
    const mk = (date: string, reps: number) => {
      let s = createSession(pull, exercises, new Date(date));
      s = completeNextSet(s, "pull-1", { reps }).session;
      return finishSession(s, new Date(date));
    };
    const older = mk("2026-09-20T10:00:00Z", 5);
    const newer = mk("2026-09-24T10:00:00Z", 7);
    const skipped = finishSession(skipExercise(createSession(pull, exercises), "pull-1"), new Date("2026-09-25T10:00:00Z"));
    const prev = lastPerformance([older, skipped, newer], "pull-ups");
    expect(prev?.sessionId).toBe(newer.id);
    expect((prev?.exercise as StrengthSessionExercise).sets[0].reps).toBe(7);
    expect(lastPerformance([older, newer], "pull-ups", newer.id)?.sessionId).toBe(older.id);
  });
});
