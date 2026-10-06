import { describe, expect, it } from "vitest";
import exercisesJson from "../../../public/data/exercises.json";
import scheduleJson from "../../../public/data/schedule.json";
import workoutsJson from "../../../public/data/workouts.json";
import { parseExercises, parseSchedule, parseWorkouts } from "../config";
import { estimateItemsSeconds } from "../format";
import { groupRuns } from "../groups";
import { buildIntervalPlan, PREP_SECONDS } from "../intervals";
import { createSession } from "../session";
import { WEEKDAYS, type Workout } from "../types";
import { validateConfiguration } from "../validation";

// Guards the shipped training plan in public/data against the requirements in context/workout-plan.md.
const exercises = parseExercises(exercisesJson);
const workouts = parseWorkouts(workoutsJson);
const schedule = parseSchedule(scheduleJson);
const byId = (id: string) => workouts.find((w) => w.id === id)!;
const minutes = (items: Workout["exercises"]) => estimateItemsSeconds(items) / 60;
const intervalSeconds = (w: Workout, startIndex = 0) => {
  const s = createSession(w, exercises);
  return buildIntervalPlan(s, s.exercises[startIndex].id).reduce((sum, st) => sum + st.durationSeconds, 0) - PREP_SECONDS;
};
const TRAINING_DAYS = WEEKDAYS.filter((d) => d !== "saturday");
const LIFT_ORDER = ["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"];

describe("shipped training plan", () => {
  it("is internally consistent (references, targets, groups)", () => {
    expect(validateConfiguration({ exercises, workouts, schedule })).toEqual([]);
  });

  it("has a lift, a cardio and a floor session Sunday–Friday, lifts in push/pull/legs order", () => {
    TRAINING_DAYS.forEach((day, i) => {
      const [lift, cardio, floor] = schedule[day].map(byId);
      expect(schedule[day]).toHaveLength(3);
      expect(lift).toMatchObject({ name: LIFT_ORDER[i], type: "strength", leaveBy: "07:25" });
      expect(cardio).toMatchObject({ type: "aerobic", leaveBy: "07:25" });
      expect(floor.id).toMatch(/^floor-/);
    });
  });

  it("keeps lifting and cardio in separate workouts, so any cardio can follow any lift", () => {
    const isCardio = (e: Workout["exercises"][number]) => e.target.kind === "cardio" || e.target.kind === "swimming";
    for (const day of TRAINING_DAYS) {
      const [lift, cardio] = schedule[day].map(byId);
      expect(lift.exercises.some(isCardio)).toBe(false);
      expect(cardio.exercises.some((e) => e.target.kind === "strength")).toBe(false);
      expect(cardio.exercises.some(isCardio)).toBe(true);
    }
    // Every cardio workout is used once a week.
    const cardioIds = workouts.filter((w) => w.type === "aerobic" && w.leaveBy).map((w) => w.id);
    expect(TRAINING_DAYS.map((d) => schedule[d][1]).sort()).toEqual([...cardioIds].sort());
  });

  it("fits each morning into the time budget: 5-min warm-up, ≤40-min lift, ~30-min cardio", () => {
    for (const day of TRAINING_DAYS) {
      const [lift, cardio] = schedule[day].map(byId);
      const warmup = lift.exercises.slice(0, lift.exercises.findIndex((e) => e.target.kind !== "timed"));
      expect(intervalSeconds({ ...lift, exercises: warmup })).toBeLessThanOrEqual(5 * 60);
      expect(minutes(lift.exercises.filter((e) => e.target.kind === "strength"))).toBeLessThanOrEqual(40);
      expect(minutes(cardio.exercises)).toBeGreaterThanOrEqual(25);
      expect(minutes(cardio.exercises)).toBeLessThanOrEqual(32);
    }
  });

  it("never schedules running/rope on a leg day or the day after one", () => {
    const isRun = (w: Workout) => w.exercises.some((e) => ["running", "rope-skipping"].includes(e.exerciseId));
    TRAINING_DAYS.forEach((day, i) => {
      const [lift, cardio] = schedule[day].map(byId);
      const prevLift = i > 0 ? byId(schedule[TRAINING_DAYS[i - 1]][0]) : undefined;
      if (lift.name.startsWith("Legs")) expect(cardio.exercises.some((e) => e.target.kind === "swimming")).toBe(true);
      if (isRun(cardio)) expect(prevLift?.name.startsWith("Legs") ?? false).toBe(false);
    });
  });

  it("uses supersets in every lifting session and a 2-round core circuit on the floor", () => {
    for (const day of TRAINING_DAYS) {
      const runs = groupRuns(byId(schedule[day][0]).exercises);
      expect(runs.some((r) => r.length > 1 && r[0].target.kind === "strength")).toBe(true);
    }
    const core = groupRuns(byId("floor-mobility-core").exercises).find((r) => r.length > 1)!;
    expect(core[0].target).toMatchObject({ kind: "timed", sets: 2 });
  });

  it("keeps floor sessions ≤ 30 min and Saturday stretch ≤ 10 min, plus a 45-min walk", () => {
    for (const id of ["floor-mobility-core", "floor-mobility-flex"]) expect(intervalSeconds(byId(id))).toBeLessThanOrEqual(30 * 60);
    expect(intervalSeconds(byId("saturday-stretch"))).toBeLessThanOrEqual(10 * 60);
    const [stretch, walk] = schedule.saturday.map(byId);
    expect(stretch.id).toBe("saturday-stretch");
    expect(walk.exercises[0].target).toMatchObject({ kind: "cardio", durationMinutes: 45 });
  });
});
