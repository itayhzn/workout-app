import { emptySchedule } from "./schedule";
import {
  EXERCISE_TYPES,
  WEEKDAYS,
  WORKOUT_TYPES,
  type Exercise,
  type ExerciseTarget,
  type ExerciseType,
  type TargetKind,
  type WeeklySchedule,
  type Workout,
  type WorkoutExercise,
} from "./types";

// Parsing is defensive: config comes from hand-edited JSON and must never crash the app.
// Items that are unusable are dropped; fields that are malformed are ignored.

export class ConfigFormatError extends Error {}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

export function parseExercises(data: unknown): Exercise[] {
  if (!Array.isArray(data)) throw new ConfigFormatError("exercises.json must contain an array");
  return data.filter(isObj).flatMap((raw): Exercise[] => {
    const id = str(raw.id);
    const name = str(raw.name);
    if (!id || !name) return [];
    const type = EXERCISE_TYPES.includes(raw.type as ExerciseType) ? (raw.type as ExerciseType) : "other";
    return [
      canonicalExercise({
        id,
        name,
        type,
        imagePath: str(raw.imagePath),
        tips: Array.isArray(raw.tips) ? raw.tips.filter((t): t is string => typeof t === "string") : undefined,
      }),
    ];
  });
}

function parseTarget(raw: unknown): ExerciseTarget | undefined {
  if (!isObj(raw)) return undefined;
  switch (raw.kind) {
    case "strength":
      return canonicalTarget({
        kind: "strength",
        sets: num(raw.sets) ?? 3,
        reps: num(raw.reps) ?? 10,
        weightKg: num(raw.weightKg),
        restSeconds: num(raw.restSeconds) ?? 90,
      });
    case "timed":
      return canonicalTarget({
        kind: "timed",
        sets: num(raw.sets) ?? 1,
        workSeconds: num(raw.workSeconds) ?? 30,
        restSeconds: num(raw.restSeconds) ?? 10,
      });
    case "cardio":
      return canonicalTarget({
        kind: "cardio",
        durationMinutes: num(raw.durationMinutes),
        distanceKm: num(raw.distanceKm),
        targetPace: str(raw.targetPace),
      });
    case "swimming":
      return canonicalTarget({
        kind: "swimming",
        durationMinutes: num(raw.durationMinutes),
        distanceMeters: num(raw.distanceMeters),
      });
    default:
      return undefined;
  }
}

export function parseWorkouts(data: unknown): Workout[] {
  if (!Array.isArray(data)) throw new ConfigFormatError("workouts.json must contain an array");
  return data.filter(isObj).flatMap((raw): Workout[] => {
    const id = str(raw.id);
    const name = str(raw.name);
    if (!id || !name) return [];
    const type = WORKOUT_TYPES.includes(raw.type as Workout["type"]) ? (raw.type as Workout["type"]) : "other";
    const items = Array.isArray(raw.exercises) ? raw.exercises.filter(isObj) : [];
    const exercises = items.flatMap((item, i): WorkoutExercise[] => {
      const exerciseId = str(item.exerciseId);
      const target = parseTarget(item.target);
      if (!exerciseId || !target) return [];
      return [{ id: str(item.id) ?? `${id}-${i + 1}`, exerciseId, target }];
    });
    return [{ id, name, type, exercises }];
  });
}

export function parseSchedule(data: unknown): WeeklySchedule {
  if (!isObj(data)) throw new ConfigFormatError("schedule.json must contain an object");
  const schedule = emptySchedule();
  for (const day of WEEKDAYS) {
    const v = data[day];
    if (Array.isArray(v)) schedule[day] = v.filter((id): id is string => typeof id === "string");
  }
  return schedule;
}

// ---------------------------------------------------------------------------
// Canonical forms: stable key order and no undefined keys, so saved JSON diffs stay quiet.
// ---------------------------------------------------------------------------

function compact<T extends object>(obj: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0 && k === "tips") continue;
    (out as Json)[k] = v;
  }
  return out;
}

export function canonicalExercise(e: Exercise): Exercise {
  return compact({
    id: e.id,
    name: e.name.trim(),
    type: e.type,
    imagePath: e.imagePath?.trim() || undefined,
    tips: e.tips?.map((t) => t.trim()).filter(Boolean),
  });
}

export function canonicalTarget(t: ExerciseTarget): ExerciseTarget {
  switch (t.kind) {
    case "strength":
      return compact({ kind: t.kind, sets: t.sets, reps: t.reps, weightKg: t.weightKg || undefined, restSeconds: t.restSeconds });
    case "timed":
      return { kind: t.kind, sets: t.sets, workSeconds: t.workSeconds, restSeconds: t.restSeconds };
    case "cardio":
      return compact({
        kind: t.kind,
        durationMinutes: t.durationMinutes,
        distanceKm: t.distanceKm,
        targetPace: t.targetPace?.trim() || undefined,
      });
    case "swimming":
      return compact({ kind: t.kind, durationMinutes: t.durationMinutes, distanceMeters: t.distanceMeters });
  }
}

export function canonicalWorkout(w: Workout): Workout {
  return {
    id: w.id,
    name: w.name.trim(),
    type: w.type,
    exercises: w.exercises.map((e) => ({ id: e.id, exerciseId: e.exerciseId, target: canonicalTarget(e.target) })),
  };
}

export function canonicalSchedule(s: WeeklySchedule): WeeklySchedule {
  const out = emptySchedule();
  for (const d of WEEKDAYS) out[d] = [...(s[d] ?? [])];
  return out;
}

export function toJson(data: unknown): string {
  return JSON.stringify(data, null, 2) + "\n";
}

export function defaultTargetKind(type: ExerciseType): TargetKind {
  if (type === "cardio" || type === "swimming") return type;
  return type === "mobility" ? "timed" : "strength";
}

export function defaultTarget(kind: TargetKind): ExerciseTarget {
  switch (kind) {
    case "strength":
      return { kind, sets: 3, reps: 10, restSeconds: 90 };
    case "timed":
      return { kind, sets: 1, workSeconds: 30, restSeconds: 10 };
    case "cardio":
      return { kind, durationMinutes: 30 };
    case "swimming":
      return { kind, durationMinutes: 30, distanceMeters: 1000 };
  }
}
