// Shared data model for both the phone (workout) and desktop (management) experiences.

export type ExerciseType = "strength" | "cardio" | "swimming" | "mobility" | "other";

export const EXERCISE_TYPES: ExerciseType[] = ["strength", "cardio", "swimming", "mobility", "other"];

export interface Exercise {
  id: string;
  name: string;
  type: ExerciseType;
  imagePath?: string;
  tips?: string[];
}

export interface StrengthTarget {
  kind: "strength";
  sets: number;
  reps: number;
  weightKg?: number;
  restSeconds: number;
}

export interface CardioTarget {
  kind: "cardio";
  durationMinutes?: number;
  distanceKm?: number;
  targetPace?: string;
}

export interface SwimmingTarget {
  kind: "swimming";
  durationMinutes?: number;
  distanceMeters?: number;
}

/**
 * Time-based sets (planks, abs circuits, mobility holds). Consecutive timed exercises in a workout
 * run as one interval sequence that advances automatically: work → rest → next set/exercise.
 */
export interface TimedTarget {
  kind: "timed";
  sets: number;
  workSeconds: number;
  /** Rest after each set, including the transition to the next exercise. */
  restSeconds: number;
}

export type ExerciseTarget = StrengthTarget | CardioTarget | SwimmingTarget | TimedTarget;

export const TARGET_KINDS: ExerciseTarget["kind"][] = ["strength", "timed", "cardio", "swimming"];
export type TargetKind = ExerciseTarget["kind"];

export interface WorkoutExercise {
  /** Identifies this item inside the workout template, independent of the shared exerciseId. */
  id: string;
  exerciseId: string;
  target: ExerciseTarget;
}

export type WorkoutType = "strength" | "aerobic" | "mixed" | "mobility" | "other";

export const WORKOUT_TYPES: WorkoutType[] = ["strength", "aerobic", "mixed", "mobility", "other"];

export interface Workout {
  id: string;
  name: string;
  type: WorkoutType;
  exercises: WorkoutExercise[];
}

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const WEEKDAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** Workout IDs planned per weekday. Never contains completion state. */
export type WeeklySchedule = Record<Weekday, string[]>;

export interface Config {
  exercises: Exercise[];
  workouts: Workout[];
  schedule: WeeklySchedule;
}

// ---------------------------------------------------------------------------
// Sessions: immutable history, except while status === "active".
// ---------------------------------------------------------------------------

export type SetStatus = "pending" | "completed" | "skipped";
export type SessionExerciseStatus = "pending" | "in_progress" | "completed" | "skipped";

export interface StrengthSetResult {
  setNumber: number;
  targetReps?: number;
  reps?: number;
  weightKg?: number;
  completedAt?: string;
  status: SetStatus;
}

export interface TimedSetResult {
  setNumber: number;
  /** Seconds actually worked (the target duration when completed by the interval timer). */
  durationSeconds?: number;
  completedAt?: string;
  status: SetStatus;
}

interface SessionExerciseBase {
  /** Copied from WorkoutExercise.id. */
  id: string;
  exerciseId: string;
  exerciseName: string;
  status: SessionExerciseStatus;
  notes?: string;
  /** True when the workout referenced an exercise that no longer exists in the library. */
  missingDefinition?: boolean;
}

export interface StrengthSessionExercise extends SessionExerciseBase {
  kind: "strength";
  prescribed: StrengthTarget;
  sets: StrengthSetResult[];
}

export interface CardioSessionExercise extends SessionExerciseBase {
  kind: "cardio";
  prescribed: CardioTarget;
  actualDurationSeconds?: number;
  actualDistanceKm?: number;
  /** Unix ms when the in-app activity stopwatch was started; absent when not running. */
  timerStartedAt?: number;
}

export interface SwimmingSessionExercise extends SessionExerciseBase {
  kind: "swimming";
  prescribed: SwimmingTarget;
  actualDurationSeconds?: number;
  actualDistanceMeters?: number;
  timerStartedAt?: number;
}

export interface TimedSessionExercise extends SessionExerciseBase {
  kind: "timed";
  prescribed: TimedTarget;
  sets: TimedSetResult[];
}

export type SessionExercise =
  | StrengthSessionExercise
  | TimedSessionExercise
  | CardioSessionExercise
  | SwimmingSessionExercise;

/** Exercises recorded as a list of sets. */
export type SetBasedSessionExercise = StrengthSessionExercise | TimedSessionExercise;
export type ActivitySessionExercise = CardioSessionExercise | SwimmingSessionExercise;

export function isSetBased(ex: SessionExercise): ex is SetBasedSessionExercise {
  return ex.kind === "strength" || ex.kind === "timed";
}

export type SessionStatus = "active" | "completed" | "abandoned";

export interface WorkoutSession {
  id: string;
  workoutId: string;
  /** Snapshot so history stays readable after renames. */
  workoutName: string;
  workoutType?: WorkoutType;
  startedAt: string;
  completedAt?: string;
  status: SessionStatus;
  exercises: SessionExercise[];
  notes?: string;
}

export interface RestTimerState {
  /** Session exercise id that triggered the timer. */
  exerciseId: string;
  setNumber: number;
  /** Absolute Unix ms: remaining = max(0, endsAt - Date.now()). */
  endsAt: number;
  originalDurationSeconds: number;
}

export type IntervalPhase = "prep" | "work" | "rest";

export interface IntervalStep {
  /** Session exercise id. */
  exerciseId: string;
  setNumber: number;
  phase: IntervalPhase;
  durationSeconds: number;
}

/**
 * Auto-advancing interval timer for timed exercises. Like the rest timer it is anchored to absolute
 * timestamps, so the current step is derived from the clock and survives screen lock and reloads.
 */
export interface IntervalTimerState {
  steps: IntervalStep[];
  /** Unix ms when step 0 began, shifted forward by pauses and backward by skips. */
  startedAt: number;
  /** Set while paused. */
  pausedAt?: number;
  /** Indices of work steps the user skipped; their sets are recorded as skipped. */
  skippedSteps: number[];
}
