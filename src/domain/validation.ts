import {
  EXERCISE_TYPES,
  WEEKDAYS,
  WORKOUT_TYPES,
  type Config,
  type Exercise,
  type ExerciseTarget,
  type WeeklySchedule,
  type Workout,
} from "./types";

export interface ValidationError {
  /** Dot path to the offending field, e.g. "exercises.2.target.sets" or "name". */
  path: string;
  message: string;
}

export type ValidationResult = ValidationError[];

function isNonNegative(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}

export function validateExercise(ex: Exercise): ValidationResult {
  const errors: ValidationResult = [];
  if (!ex.id?.trim()) errors.push({ path: "id", message: "ID is required" });
  if (!ex.name?.trim()) errors.push({ path: "name", message: "Name is required" });
  if (!EXERCISE_TYPES.includes(ex.type)) errors.push({ path: "type", message: "Type is required" });
  ex.tips?.forEach((tip, i) => {
    if (!tip.trim()) errors.push({ path: `tips.${i}`, message: "Tip cannot be empty" });
  });
  return errors;
}

export function validateTarget(t: ExerciseTarget, prefix = "target"): ValidationResult {
  const errors: ValidationResult = [];
  switch (t.kind) {
    case "strength":
      if (!isPositiveInt(t.sets)) errors.push({ path: `${prefix}.sets`, message: "Sets must be greater than 0" });
      if (!isPositiveInt(t.reps)) errors.push({ path: `${prefix}.reps`, message: "Reps must be greater than 0" });
      if (!isNonNegative(t.restSeconds))
        errors.push({ path: `${prefix}.restSeconds`, message: "Rest must be 0 or more seconds" });
      if (t.weightKg !== undefined && !isNonNegative(t.weightKg))
        errors.push({ path: `${prefix}.weightKg`, message: "Weight must be 0 or more" });
      break;
    case "timed":
      if (!isPositiveInt(t.sets)) errors.push({ path: `${prefix}.sets`, message: "Sets must be greater than 0" });
      if (!isPositiveInt(t.workSeconds))
        errors.push({ path: `${prefix}.workSeconds`, message: "Work time must be at least 1 second" });
      if (!isNonNegative(t.restSeconds))
        errors.push({ path: `${prefix}.restSeconds`, message: "Rest must be 0 or more seconds" });
      break;
    case "cardio":
      if (t.durationMinutes !== undefined && !isNonNegative(t.durationMinutes))
        errors.push({ path: `${prefix}.durationMinutes`, message: "Duration must be 0 or more" });
      if (t.distanceKm !== undefined && !isNonNegative(t.distanceKm))
        errors.push({ path: `${prefix}.distanceKm`, message: "Distance must be 0 or more" });
      if (t.targetPace !== undefined && t.targetPace !== "" && !/^\d{1,2}:\d{2}$/.test(t.targetPace))
        errors.push({ path: `${prefix}.targetPace`, message: "Pace must look like 5:30" });
      break;
    case "swimming":
      if (t.durationMinutes !== undefined && !isNonNegative(t.durationMinutes))
        errors.push({ path: `${prefix}.durationMinutes`, message: "Duration must be 0 or more" });
      if (t.distanceMeters !== undefined && !isNonNegative(t.distanceMeters))
        errors.push({ path: `${prefix}.distanceMeters`, message: "Distance must be 0 or more" });
      break;
    default:
      errors.push({ path: `${prefix}.kind`, message: "Unknown target type" });
  }
  return errors;
}

export function validateWorkout(w: Workout, exercises: Exercise[]): ValidationResult {
  const errors: ValidationResult = [];
  const known = new Set(exercises.map((e) => e.id));
  if (!w.id?.trim()) errors.push({ path: "id", message: "ID is required" });
  if (!w.name?.trim()) errors.push({ path: "name", message: "Name is required" });
  if (!WORKOUT_TYPES.includes(w.type)) errors.push({ path: "type", message: "Type is required" });
  const itemIds = new Set<string>();
  w.exercises.forEach((item, i) => {
    if (!known.has(item.exerciseId))
      errors.push({ path: `exercises.${i}.exerciseId`, message: `Exercise "${item.exerciseId}" does not exist` });
    if (itemIds.has(item.id))
      errors.push({ path: `exercises.${i}.id`, message: "Duplicate workout-exercise ID" });
    itemIds.add(item.id);
    errors.push(...validateTarget(item.target, `exercises.${i}.target`));
  });
  return errors;
}

export function validateSchedule(schedule: WeeklySchedule, workouts: Workout[]): ValidationResult {
  const errors: ValidationResult = [];
  const known = new Set(workouts.map((w) => w.id));
  for (const day of WEEKDAYS) {
    (schedule[day] ?? []).forEach((id, i) => {
      if (!known.has(id)) errors.push({ path: `${day}.${i}`, message: `Workout "${id}" does not exist` });
    });
  }
  return errors;
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) (seen.has(id) ? dupes : seen).add(id);
  return [...dupes];
}

/** Whole-configuration referential integrity check, run before any save. */
export function validateConfiguration({ exercises, workouts, schedule }: Config): ValidationResult {
  const errors: ValidationResult = [];
  for (const id of duplicates(exercises.map((e) => e.id)))
    errors.push({ path: "exercises", message: `Duplicate exercise ID "${id}"` });
  for (const id of duplicates(workouts.map((w) => w.id)))
    errors.push({ path: "workouts", message: `Duplicate workout ID "${id}"` });
  exercises.forEach((e, i) =>
    validateExercise(e).forEach((err) => errors.push({ ...err, path: `exercises.${i}.${err.path}` })),
  );
  workouts.forEach((w, i) =>
    validateWorkout(w, exercises).forEach((err) => errors.push({ ...err, path: `workouts.${i}.${err.path}` })),
  );
  validateSchedule(schedule, workouts).forEach((err) => errors.push({ ...err, path: `schedule.${err.path}` }));
  return errors;
}

export function errorFor(errors: ValidationResult, path: string): string | undefined {
  return errors.find((e) => e.path === path)?.message;
}

/** Workouts that reference an exercise; used to block destructive deletes. */
export function workoutsUsingExercise(workouts: Workout[], exerciseId: string): Workout[] {
  return workouts.filter((w) => w.exercises.some((e) => e.exerciseId === exerciseId));
}
