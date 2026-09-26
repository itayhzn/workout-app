import type { Exercise, WeeklySchedule, Workout } from "../domain/types";

export const exercises: Exercise[] = [
  { id: "pull-ups", name: "Pull Ups", type: "strength", tips: ["Keep shoulders depressed"] },
  { id: "lat-pulldown", name: "Lat Pulldown", type: "strength" },
  { id: "running", name: "Running", type: "cardio" },
  { id: "swimming", name: "Swim", type: "swimming" },
];

export const pull: Workout = {
  id: "pull",
  name: "Pull",
  type: "strength",
  exercises: [
    { id: "pull-1", exerciseId: "pull-ups", target: { kind: "strength", sets: 4, reps: 8, weightKg: 10, restSeconds: 120 } },
    { id: "pull-2", exerciseId: "lat-pulldown", target: { kind: "strength", sets: 3, reps: 10, weightKg: 60, restSeconds: 90 } },
  ],
};

export const run: Workout = {
  id: "run",
  name: "Run",
  type: "aerobic",
  exercises: [{ id: "run-1", exerciseId: "running", target: { kind: "cardio", durationMinutes: 30, distanceKm: 5 } }],
};

export const schedule: WeeklySchedule = {
  monday: ["pull"],
  tuesday: ["run"],
  wednesday: [],
  thursday: [],
  friday: ["pull", "run"],
  saturday: [],
  sunday: [],
};
