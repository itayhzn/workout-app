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
  /** Target reps, or the bottom of the range when repsMax is set. */
  reps: number;
  /** Top of a rep range (e.g. 8–12). Reaching it on every set means it's time to add weight. */
  repsMax?: number;
  weightKg?: number;
  /** Rest after each set. In a superset, the rest after the last member ends the round. */
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
  /**
   * Consecutive items sharing a group id are done in rotation, one set of each per round:
   * a superset for strength items, a circuit for timed items (rounds = sets).
   */
  group?: string;
  target: ExerciseTarget;
}

export type WorkoutType = "strength" | "aerobic" | "mixed" | "mobility" | "other";

export const WORKOUT_TYPES: WorkoutType[] = ["strength", "aerobic", "mixed", "mobility", "other"];

export interface Workout {
  id: string;
  name: string;
  type: WorkoutType;
  /** Optional "HH:MM" time you must be done by (e.g. leave the gym). Shows a countdown during the session. */
  leaveBy?: string;
  exercises: WorkoutExercise[];
}

export type Weekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

/** Week order used everywhere (display and saved JSON). The week starts on Sunday. */
export const WEEKDAYS: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
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
  /** Copied from WorkoutExercise.group (superset / circuit). */
  group?: string;
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
  /** Absolute deadline derived from Workout.leaveBy on the day the session started. */
  leaveByAt?: string;
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
