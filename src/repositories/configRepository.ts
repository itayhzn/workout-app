import type { Exercise, WeeklySchedule, Workout } from "../domain/types";

/** Storage-agnostic access to repository-backed configuration. UI code never talks to GitHub directly. */
export interface ConfigRepository {
  readonly kind: "static" | "github" | "local";
  readonly writable: boolean;

  loadExercises(): Promise<Exercise[]>;
  saveExercises(items: Exercise[], message?: string): Promise<void>;

  loadWorkouts(): Promise<Workout[]>;
  saveWorkouts(items: Workout[], message?: string): Promise<void>;

  loadSchedule(): Promise<WeeklySchedule>;
  saveSchedule(schedule: WeeklySchedule, message?: string): Promise<void>;
}

/** The file changed in the repository after it was loaded; saving would overwrite newer data. */
export class ConflictError extends Error {
  constructor(public readonly file: string) {
    super(`${file} changed in the repository since it was loaded.`);
    this.name = "ConflictError";
  }
}

export class ReadOnlyError extends Error {
  constructor() {
    super("This configuration source is read-only.");
    this.name = "ReadOnlyError";
  }
}

export type ConfigFile = "exercises.json" | "workouts.json" | "schedule.json";
