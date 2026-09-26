import { describe, expect, it } from "vitest";
import { canonicalWorkout, parseExercises, parseSchedule, parseWorkouts, toJson } from "../config";
import { validateConfiguration, validateSchedule, validateWorkout, workoutsUsingExercise } from "../validation";
import { exercises, pull, run, schedule } from "../../test/fixtures";

describe("validateConfiguration", () => {
  it("accepts a consistent configuration", () => {
    expect(validateConfiguration({ exercises, workouts: [pull, run], schedule })).toEqual([]);
  });

  it("reports broken references, duplicates and bad targets", () => {
    const bad = {
      ...pull,
      exercises: [
        pull.exercises[0],
        { ...pull.exercises[0] }, // duplicate item id
        { id: "z", exerciseId: "nope", target: { kind: "strength" as const, sets: 0, reps: 8, restSeconds: -1 } },
      ],
    };
    const errors = validateConfiguration({
      exercises: [...exercises, exercises[0]],
      workouts: [bad],
      schedule: { ...schedule, sunday: ["ghost"] },
    });
    const messages = errors.map((e) => e.message);
    expect(messages).toContain('Duplicate exercise ID "pull-ups"');
    expect(messages).toContain("Duplicate workout-exercise ID");
    expect(messages).toContain('Exercise "nope" does not exist');
    expect(messages).toContain("Sets must be greater than 0");
    expect(messages).toContain("Rest must be 0 or more seconds");
    expect(messages).toContain('Workout "ghost" does not exist');
  });

  it("allows bodyweight strength targets and requires names", () => {
    const w = { ...pull, name: " ", exercises: [{ id: "a", exerciseId: "pull-ups", target: { kind: "strength" as const, sets: 3, reps: 5, restSeconds: 0 } }] };
    expect(validateWorkout(w, exercises).map((e) => e.path)).toEqual(["name"]);
  });

  it("validates schedule references", () => {
    expect(validateSchedule(schedule, [pull])).toEqual([{ path: "tuesday.0", message: 'Workout "run" does not exist' }, { path: "friday.1", message: 'Workout "run" does not exist' }]);
  });

  it("finds workouts using an exercise", () => {
    expect(workoutsUsingExercise([pull, run], "pull-ups").map((w) => w.id)).toEqual(["pull"]);
  });
});

describe("config parsing", () => {
  it("drops unusable items instead of crashing", () => {
    expect(parseExercises([{ id: "a", name: "A", type: "strength" }, { name: "no id" }, 42, { id: "b", name: "B", type: "weird" }])).toEqual([
      { id: "a", name: "A", type: "strength" },
      { id: "b", name: "B", type: "other" },
    ]);
    expect(() => parseExercises({})).toThrow();
    const ws = parseWorkouts([{ id: "w", name: "W", type: "strength", exercises: [{ exerciseId: "a", target: { kind: "strength", sets: 3, reps: 5 } }, { exerciseId: "a", target: { kind: "yoga" } }] }]);
    expect(ws[0].exercises).toEqual([{ id: "w-1", exerciseId: "a", target: { kind: "strength", sets: 3, reps: 5, restSeconds: 90 } }]);
    expect(parseSchedule({ monday: ["a", 3], extra: ["x"] }).monday).toEqual(["a"]);
  });

  it("serializes human-readable JSON with stable key order", () => {
    const messy = { exercises: [{ target: { restSeconds: 60, reps: 5, kind: "strength", sets: 3, weightKg: undefined }, exerciseId: "a", id: "1" }], type: "strength", name: " Legs ", id: "legs" };
    const json = toJson(canonicalWorkout(messy as never));
    expect(json).toBe(
      `{\n  "id": "legs",\n  "name": "Legs",\n  "type": "strength",\n  "exercises": [\n    {\n      "id": "1",\n      "exerciseId": "a",\n      "target": {\n        "kind": "strength",\n        "sets": 3,\n        "reps": 5,\n        "restSeconds": 60\n      }\n    }\n  ]\n}\n`,
    );
  });
});
