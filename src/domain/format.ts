import { groupRuns } from "./groups";
import type { ExerciseTarget, StrengthTarget, TimedTarget, Workout, WorkoutExercise, WorkoutSession } from "./types";
import { toDisplayWeight, type WeightUnit } from "./units";

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const base = `${mm}:${String(sec).padStart(2, "0")}`;
  return h > 0 ? `${h}:${base}` : base;
}

/** Rest style: 90 -> "1:30". */
export function formatRest(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatMinutes(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${String(min % 60).padStart(2, "0")}m`;
}

export function formatNumber(n: number, maxDecimals = 2): string {
  return Number(n.toFixed(maxDecimals)).toString();
}

/** Number only, in the display unit ("BW" when there is no weight). */
export function formatWeightValue(kg: number | undefined, unit: WeightUnit = "kg"): string {
  return kg === undefined || kg === 0 ? "BW" : formatNumber(toDisplayWeight(kg, unit), 1);
}

export function formatWeight(kg: number | undefined, unit: WeightUnit = "kg"): string {
  return kg === undefined || kg === 0 ? "BW" : `${formatWeightValue(kg, unit)} ${unit}`;
}

/** "10" or "8–12". */
export function formatReps(t: Pick<StrengthTarget, "reps" | "repsMax">): string {
  return t.repsMax && t.repsMax > t.reps ? `${t.reps}–${t.repsMax}` : String(t.reps);
}

export function formatStrengthTarget(t: StrengthTarget, unit: WeightUnit = "kg"): string {
  const weight = t.weightKg ? ` · ${formatWeight(t.weightKg, unit)}` : "";
  return `${t.sets} × ${formatReps(t)}${weight}`;
}

/** 30 -> "30s", 90 -> "1:30". */
export function formatSeconds(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : formatRest(seconds);
}

export function formatTimedTarget(t: TimedTarget): string {
  const work = t.sets > 1 ? `${t.sets} × ${formatSeconds(t.workSeconds)}` : formatSeconds(t.workSeconds);
  return t.restSeconds ? `${work} · rest ${formatSeconds(t.restSeconds)}` : work;
}

export function formatTarget(t: ExerciseTarget, unit: WeightUnit = "kg"): string {
  switch (t.kind) {
    case "strength":
      return formatStrengthTarget(t, unit);
    case "timed":
      return formatTimedTarget(t);
    case "cardio": {
      const parts: string[] = [];
      if (t.durationMinutes) parts.push(`${formatNumber(t.durationMinutes)} min`);
      if (t.distanceKm) parts.push(`${formatNumber(t.distanceKm)} km`);
      if (t.targetPace) parts.push(`${t.targetPace} /km`);
      return parts.join(" · ") || "Open activity";
    }
    case "swimming": {
      const parts: string[] = [];
      if (t.durationMinutes) parts.push(`${formatNumber(t.durationMinutes)} min`);
      if (t.distanceMeters) parts.push(`${formatNumber(t.distanceMeters, 0)} m`);
      return parts.join(" · ") || "Open swim";
    }
  }
}

/** Rough duration estimate used for "~50 min" labels. */
export function estimateTargetSeconds(t: ExerciseTarget): number {
  switch (t.kind) {
    case "strength":
      // ~45 s of work per set, rest after each set (the last one covers moving on), plus ~1 min of setup.
      return t.sets * (45 + t.restSeconds) + 60;
    case "timed":
      return t.sets * (t.workSeconds + t.restSeconds);
    case "cardio":
      if (t.durationMinutes) return t.durationMinutes * 60;
      return (t.distanceKm ?? 0) * 6 * 60;
    case "swimming":
      if (t.durationMinutes) return t.durationMinutes * 60;
      return ((t.distanceMeters ?? 0) / 100) * 2.5 * 60;
  }
}

/** Estimated seconds for a list of workout items, accounting for supersets and circuits. */
export function estimateItemsSeconds(items: WorkoutExercise[]): number {
  return groupRuns(items).reduce((sum, run) => {
    if (run.length < 2) return sum + estimateTargetSeconds(run[0].target);
    const rounds = Math.max(...run.map((i) => ("sets" in i.target ? i.target.sets : 1)));
    const last = run[run.length - 1].target;
    const rest = "restSeconds" in last ? last.restSeconds : 0;
    if (run[0].target.kind === "timed") {
      // Circuit: every station's work + its rest, each round.
      return sum + run.reduce((s, i) => s + (i.target.kind === "timed" ? i.target.sets * (i.target.workSeconds + i.target.restSeconds) : 0), 0);
    }
    // Superset: back-to-back sets with a single rest per round, plus setup per station.
    return sum + rounds * (run.length * 45 + rest) + run.length * 60;
  }, 0);
}

export function estimateWorkoutMinutes(w: Workout): number {
  const minutes = estimateItemsSeconds(w.exercises) / 60;
  // Short sessions (mobility, abs) get minute precision; longer ones round to 5.
  if (minutes < 20) return Math.max(1, Math.round(minutes));
  return Math.round(minutes / 5) * 5;
}

export function totalSets(w: Workout): number {
  return w.exercises.reduce((n, e) => n + (e.target.kind === "strength" || e.target.kind === "timed" ? e.target.sets : 0), 0);
}

/** Workout time, excluding any time spent finished before a resume. Live for active sessions. */
export function sessionDurationMs(s: WorkoutSession, now: number = Date.now()): number {
  const end = s.completedAt ? Date.parse(s.completedAt) : now;
  return Math.max(0, end - Date.parse(s.startedAt) - (s.pausedMs ?? 0));
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** "mm:ss" per km from seconds + km. */
export function formatPace(seconds: number, km: number): string | undefined {
  if (!seconds || !km) return undefined;
  return formatRest(Math.round(seconds / km));
}
