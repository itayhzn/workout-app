import { Clock, Play, X } from "lucide-react";
import { ExerciseImage } from "../../components/ExerciseImage";
import { Label, TypeBadge } from "../../components/ui";
import { estimateWorkoutMinutes, formatTarget } from "../../domain/format";
import type { Workout } from "../../domain/types";
import { useConfig } from "../../state/ConfigContext";
import { useWeightUnit } from "../../state/units";

interface Props {
  workout: Workout;
  label: string;
  onStart: () => void;
  highlight?: boolean;
  busy?: boolean;
  onDismiss?: () => void;
}

export function WorkoutPreviewCard({ workout, label, onStart, highlight, busy, onDismiss }: Props) {
  const { exerciseById } = useConfig();
  const unit = useWeightUnit();
  return (
    <section className={`card p-5 ${highlight ? "border-line-strong bg-gradient-to-br from-elevated to-card" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-volt/10 px-2 py-1 font-display text-[11px] font-bold uppercase tracking-widest text-volt">{label}</span>
          <TypeBadge type={workout.type} />
        </div>
        <div className="text-right text-sm text-ink-2 tnum">
          <div className="flex items-center justify-end gap-1 text-ink">
            <Clock size={14} /> ~{estimateWorkoutMinutes(workout)} min
          </div>
          <div className="text-xs">
            {workout.exercises.length} exercise{workout.exercises.length === 1 ? "" : "s"}
          </div>
        </div>
        {onDismiss && (
          <button className="btn-ghost -mr-2 -mt-1 h-9 w-9 shrink-0" aria-label="Clear selection" onClick={onDismiss}>
            <X size={16} />
          </button>
        )}
      </div>
      <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">{workout.name}</h2>
      <ol className="mt-4 flex flex-col gap-1.5">
        {workout.exercises.map((item, i) => {
          const def = exerciseById(item.exerciseId);
          return (
            <li key={item.id} className="flex items-center gap-3 rounded bg-canvas/40 px-3 py-2">
              <span className="font-display text-xs text-ink-3 tnum">{String(i + 1).padStart(2, "0")}</span>
              <ExerciseImage path={def?.imagePath} type={def?.type} alt="" className="h-8 w-8" iconSize={14} />
              <span className="min-w-0 flex-1 truncate font-semibold">{def?.name ?? <span className="text-warn">Missing exercise</span>}</span>
              <span className="shrink-0 text-sm text-ink-2 tnum">{formatTarget(item.target, unit)}</span>
            </li>
          );
        })}
      </ol>
      {workout.exercises.length === 0 && <Label className="mt-4">This workout has no exercises yet</Label>}
      <button className={`${highlight ? "btn-primary shadow-volt" : "btn-secondary"} mt-5 h-14 w-full text-base`} onClick={onStart} disabled={busy || workout.exercises.length === 0}>
        <Play size={18} /> Start workout
      </button>
    </section>
  );
}
