import { describe, expect, it } from "vitest";
import { parseExercises, parseSchedule, parseWorkouts } from "../config";
import { buildIntervalPlan, PREP_SECONDS } from "../intervals";
import { createSession } from "../session";
import { WEEKDAYS } from "../types";
import { validateConfiguration } from "../validation";

import exercisesJson from "../../../public/data/exercises.json";
import scheduleJson from "../../../public/data/schedule.json";
import workoutsJson from "../../../public/data/workouts.json";

// Guards the shipped training plan in public/data.
const exercises = parseExercises(exercisesJson);
const workouts = parseWorkouts(workoutsJson);
const schedule = parseSchedule(scheduleJson);
const byId = (id: string) => workouts.find((w) => w.id === id)!;

describe("shipped training plan", () => {
  it("is internally consistent", () => {
    expect(validateConfiguration({ exercises, workouts, schedule })).toEqual([]);
  });

  it("has a daily mobility session of at most 8 minutes, run hands-free by the interval timer", () => {
    for (const day of WEEKDAYS) expect(schedule[day]).toContain("daily-mobility");
    const mobility = byId("daily-mobility");
    const session = createSession(mobility, exercises);
    const plan = buildIntervalPlan(session, session.exercises[0].id);
    // One continuous sequence covers every set of every mobility exercise.
    expect(plan.filter((s) => s.phase === "work")).toHaveLength(mobility.exercises.reduce((n, e) => n + (e.target.kind === "timed" ? e.target.sets : 0), 0));
    const totalSeconds = plan.reduce((sum, s) => sum + s.durationSeconds, 0);
    expect(totalSeconds - PREP_SECONDS).toBeLessThanOrEqual(8 * 60);
  });

  it("follows the requested weekly split", () => {
    const main = Object.fromEntries(WEEKDAYS.map((d) => [d, byId(schedule[d][0])]));
    expect(main.sunday.id).toBe("push");
    expect(main.wednesday.id).toBe("legs");
    expect(main.thursday.id).toBe("pull");
    expect(main.monday.exercises[0].target).toMatchObject({ kind: "cardio", distanceKm: 5 });
    expect(main.monday.exercises.slice(1).every((e) => e.target.kind === "timed" && e.target.workSeconds === 30)).toBe(true);
    expect(main.tuesday.exercises.every((e) => e.target.kind === "swimming")).toBe(true);
    expect(main.tuesday.exercises.reduce((m, e) => m + (e.target.kind === "swimming" ? e.target.durationMinutes ?? 0 : 0), 0)).toBe(30);
    expect(main.friday.exercises[0].target).toMatchObject({ kind: "cardio", distanceKm: 10 });
    expect(main.saturday.exercises[0].target).toMatchObject({ kind: "cardio", durationMinutes: 30 });
  });
});
