import { Check, Minus, StickyNote } from "lucide-react";
import {
  formatClock,
  formatLongDate,
  formatMinutes,
  formatNumber,
  formatPace,
  formatTarget,
  formatTime,
  formatSeconds,
  formatWeight,
  formatWeightValue,
  sessionDurationMs,
} from "../domain/format";
import { sessionStats } from "../domain/session";
import { isSetBased, type SessionExercise, type SetBasedSessionExercise, type WorkoutSession } from "../domain/types";
import type { WeightUnit } from "../domain/units";
import { useConfig } from "../state/ConfigContext";
import { useWeightUnit } from "../state/units";
import { ExerciseImage } from "./ExerciseImage";
import { Label } from "./ui";

export function SessionHeader({ session }: { session: WorkoutSession }) {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight">{session.workoutName}</h1>
      <p className="mt-1 text-sm text-ink-2 tnum">
        {formatLongDate(session.startedAt)} · {formatTime(session.startedAt)}
        {session.completedAt && <> – {formatTime(session.completedAt)}</>}
      </p>
    </div>
  );
}

export function SessionStatTiles({ session }: { session: WorkoutSession }) {
  const stats = sessionStats(session);
  const unit = useWeightUnit();
  const tiles: { label: string; value: string; unit?: string; sub?: string }[] = [
    { label: "Duration", value: String(Math.round(sessionDurationMs(session) / 60000)), unit: "min" },
    {
      label: "Exercises",
      value: `${stats.exercisesCompleted}/${stats.exercisesTotal}`,
      sub: stats.exercisesSkipped ? `${stats.exercisesSkipped} skipped` : undefined,
    },
  ];
  if (stats.setsTotal) tiles.push({ label: "Sets", value: String(stats.setsCompleted), unit: "sets" });
  if (stats.volumeKg) tiles.push({ label: "Volume", value: Number(formatWeightValue(stats.volumeKg, unit)).toLocaleString(undefined, { maximumFractionDigits: 0 }), unit });
  if (stats.timedSeconds) tiles.push({ label: "Timed work", value: formatClock(stats.timedSeconds) });
  if (stats.distanceKm) tiles.push({ label: "Distance", value: formatNumber(stats.distanceKm), unit: "km" });
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="card p-4">
          <Label>{t.label}</Label>
          <div className="mt-2 font-display text-3xl font-bold tnum">
            {t.value}
            {t.unit && <span className="ml-1 text-sm font-semibold text-ink-2">{t.unit}</span>}
          </div>
          {t.sub && <div className="mt-1 text-xs text-ink-2">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function exerciseResultLine(ex: SessionExercise): string {
  if (ex.status === "skipped" && !(isSetBased(ex) && ex.sets.some((s) => s.status === "completed"))) return "Skipped";
  if (isSetBased(ex)) {
    const done = ex.sets.filter((s) => s.status === "completed").length;
    return `${done}/${ex.sets.length} sets`;
  }
  const parts: string[] = [];
  if (ex.actualDurationSeconds) parts.push(formatClock(ex.actualDurationSeconds));
  if (ex.kind === "cardio" && ex.actualDistanceKm) {
    parts.push(`${formatNumber(ex.actualDistanceKm)} km`);
    const pace = formatPace(ex.actualDurationSeconds ?? 0, ex.actualDistanceKm);
    if (pace) parts.push(`${pace} /km`);
  }
  if (ex.kind === "swimming" && ex.actualDistanceMeters) parts.push(`${formatNumber(ex.actualDistanceMeters, 0)} m`);
  return parts.join(" · ") || "Completed";
}

function setLabel(ex: SetBasedSessionExercise, setNumber: number, unit: WeightUnit): string {
  if (ex.kind === "strength") {
    const s = ex.sets.find((x) => x.setNumber === setNumber)!;
    return `${formatWeight(s.weightKg, unit)} × ${s.reps ?? "–"}`;
  }
  const s = ex.sets.find((x) => x.setNumber === setNumber)!;
  return formatSeconds(s.durationSeconds ?? ex.prescribed.workSeconds);
}

export function SessionExerciseResult({ ex, index }: { ex: SessionExercise; index: number }) {
  const { exerciseById } = useConfig();
  const unit = useWeightUnit();
  const def = exerciseById(ex.exerciseId);
  const skipped = ex.status === "skipped";
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <ExerciseImage path={def?.imagePath} type={def?.type} alt={ex.exerciseName} className="h-12 w-12" iconSize={20} muted={skipped} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className={`font-semibold ${skipped ? "text-ink-2" : ""}`}>
              <span className="mr-2 font-display text-xs text-ink-3 tnum">{String(index + 1).padStart(2, "0")}</span>
              {ex.exerciseName}
            </div>
            <div className={`shrink-0 font-display text-sm font-bold tnum ${skipped ? "text-ink-3" : "text-emerald"}`}>{exerciseResultLine(ex)}</div>
          </div>
          <div className="mt-0.5 text-xs text-ink-3">Target {formatTarget(ex.prescribed, unit)}</div>
        </div>
      </div>
      {isSetBased(ex) && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ex.sets.map((s) => (
            <div
              key={s.setNumber}
              className={`flex items-center justify-between rounded border px-2.5 py-1.5 text-sm tnum ${
                s.status === "completed" ? "border-line bg-elevated" : "border-dashed border-line text-ink-3"
              }`}
            >
              <span className="font-display text-xs text-ink-3">S{s.setNumber}</span>
              {s.status === "completed" ? (
                <>
                  <span className="font-semibold">
                    {setLabel(ex, s.setNumber, unit)}
                  </span>
                  <Check size={14} className="text-emerald" />
                </>
              ) : (
                <>
                  <span className="text-xs uppercase">{s.status}</span>
                  <Minus size={14} />
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {ex.notes && <p className="mt-3 border-l-2 border-line-strong pl-3 text-sm italic text-ink-2">{ex.notes}</p>}
    </div>
  );
}

export function SessionNote({ notes }: { notes?: string }) {
  if (!notes) return null;
  return (
    <div className="card p-4">
      <Label className="flex items-center gap-1.5">
        <StickyNote size={12} /> Workout note
      </Label>
      <p className="mt-2 whitespace-pre-wrap italic text-ink">“{notes}”</p>
    </div>
  );
}

/** Read-only rendering of a session, built entirely from the session snapshot. */
export function SessionDetail({ session }: { session: WorkoutSession }) {
  const stats = sessionStats(session);
  return (
    <div className="flex flex-col gap-4">
      <SessionHeader session={session} />
      <SessionStatTiles session={session} />
      <SessionNote notes={session.notes} />
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold">Exercises</h2>
        <span className="text-xs text-ink-2">
          {stats.exercisesCompleted} completed{stats.exercisesSkipped ? ` · ${stats.exercisesSkipped} skipped` : ""} ·{" "}
          {formatMinutes(sessionDurationMs(session))}
        </span>
      </div>
      {session.exercises.map((ex, i) => (
        <SessionExerciseResult key={ex.id} ex={ex} index={i} />
      ))}
    </div>
  );
}
