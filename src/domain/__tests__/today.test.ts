import { describe, expect, it } from "vitest";
import { nextToday, todaysPlan } from "../schedule";
import { createSession, finishSession } from "../session";
import { emptySchedule } from "../schedule";
import type { Exercise, Workout, WorkoutSession } from "../types";

const exercises: Exercise[] = [{ id: "x", name: "X", type: "other" }];
const w = (id: string, type: Workout["type"]): Workout => ({ id, name: id, type, exercises: [] });
const workouts = [w("legs-a", "strength"), w("steady-swim", "aerobic"), w("floor", "mobility"), w("posture", "mobility"), w("pull-b", "strength"), w("stairs", "aerobic")];
const schedule = { ...emptySchedule(), tuesday: ["legs-a", "steady-swim", "floor", "posture"] };
const tuesday = (h: number, m = 0) => new Date(2026, 9, 6, h, m); // Tue 6 Oct 2026, local time
const done = (id: string, at: Date): WorkoutSession => finishSession(createSession(workouts.find((x) => x.id === id)!, exercises, at), at);
const state = (slots: ReturnType<typeof todaysPlan>) => slots.map((s) => `${s.workout.id}:${s.active ? "active" : (s.doneBy?.workoutId ?? "-")}`);

describe("today's plan", () => {
  it("lists today's scheduled workouts, none done yet", () => {
    const slots = todaysPlan(schedule, workouts, [], undefined, tuesday(5));
    expect(state(slots)).toEqual(["legs-a:-", "steady-swim:-", "floor:-", "posture:-"]);
    expect(nextToday(slots)?.id).toBe("legs-a");
  });

  it("marks finished workouts done and offers the next one", () => {
    const slots = todaysPlan(schedule, workouts, [done("legs-a", tuesday(6, 10))], undefined, tuesday(6, 11));
    expect(state(slots)).toEqual(["legs-a:legs-a", "steady-swim:-", "floor:-", "posture:-"]);
    expect(nextToday(slots)?.id).toBe("steady-swim");
  });

  it("counts a swapped-in workout of the same type: Pull B on a Legs A day, stairs instead of the swim", () => {
    let slots = todaysPlan(schedule, workouts, [done("pull-b", tuesday(6, 10))], undefined, tuesday(6, 11));
    expect(state(slots)).toEqual(["legs-a:pull-b", "steady-swim:-", "floor:-", "posture:-"]);
    slots = todaysPlan(schedule, workouts, [done("pull-b", tuesday(6, 10)), done("stairs", tuesday(6, 45))], undefined, tuesday(7));
    expect(nextToday(slots)?.id).toBe("floor");
  });

  it("fills a workout's own slot before another of the same type", () => {
    const slots = todaysPlan(schedule, workouts, [done("posture", tuesday(8))], undefined, tuesday(9));
    expect(state(slots)).toEqual(["legs-a:-", "steady-swim:-", "floor:-", "posture:posture"]);
  });

  it("treats the workout in progress as taken, and ignores other days", () => {
    const yesterday = done("legs-a", new Date(2026, 9, 5, 6));
    const active = createSession(workouts[0], exercises, tuesday(5, 30));
    const slots = todaysPlan(schedule, workouts, [yesterday], active, tuesday(5, 40));
    expect(state(slots)).toEqual(["legs-a:active", "steady-swim:-", "floor:-", "posture:-"]);
    expect(nextToday(slots)?.id).toBe("steady-swim");
  });

  it("has nothing next once everything is done", () => {
    const sessions = ["legs-a", "steady-swim", "floor", "posture"].map((id, i) => done(id, tuesday(6 + i)));
    expect(nextToday(todaysPlan(schedule, workouts, sessions, undefined, tuesday(20)))).toBeUndefined();
  });
});
