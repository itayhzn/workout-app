import { Clock, Play, Timer, X } from "lucide-react";
import { ExerciseImage } from "../../components/ExerciseImage";
import { GroupLabel } from "../../components/GroupLabel";
import { Label, TypeBadge } from "../../components/ui";
import { estimateItemsSeconds, estimateWorkoutMinutes, formatClock, formatTarget } from "../../domain/format";
import { groupRuns } from "../../domain/groups";
import type { Workout, WorkoutExercise } from "../../domain/types";
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
        {previewBlocks(workout.exercises).map((block) => {
          if (block.kind === "intervals") {
            return (
              <li key={block.items[0].id} className="flex items-center gap-3 rounded bg-canvas/40 px-3 py-2">
                <span className="font-display text-xs text-ink-3 tnum">{String(workout.exercises.indexOf(block.items[0]) + 1).padStart(2, "0")}</span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line bg-elevated text-ink-3">
                  <Timer size={14} />
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  Intervals <span className="font-normal text-ink-2">· {block.items.length} moves</span>
                </span>
                <span className="shrink-0 text-sm text-ink-2 tnum">{formatClock(estimateItemsSeconds(block.items))}</span>
              </li>
            );
          }
          const rows = block.items.map((item) => {
            const i = workout.exercises.indexOf(item);
            const def = exerciseById(item.exerciseId);
            return (
              <li key={item.id} className="flex items-center gap-3 rounded bg-canvas/40 px-3 py-2">
                <span className="font-display text-xs text-ink-3 tnum">{String(i + 1).padStart(2, "0")}</span>
                <ExerciseImage path={def?.imagePath} type={def?.type} alt="" className="h-8 w-8" iconSize={14} />
                <span className="min-w-0 flex-1 truncate font-semibold">{def?.name ?? <span className="text-warn">Missing exercise</span>}</span>
                <span className="shrink-0 text-sm text-ink-2 tnum">{formatTarget(item.target, unit)}</span>
              </li>
            );
          });
          if (block.kind === "single") return rows;
          return (
            <li key={block.items[0].id} className="border-l-2 border-volt/60 pl-2">
              <GroupLabel kind={block.items[0].target.kind} className="mb-1" />
              <ol className="flex flex-col gap-1.5">{rows}</ol>
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

type PreviewBlock = { kind: "single" | "group" | "intervals"; items: WorkoutExercise[] };

/** Collapses runs of 3+ timed moves (warm-ups, stretch flows, circuits) into one "Intervals" row. */
function previewBlocks(items: WorkoutExercise[]): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];
  let timed: WorkoutExercise[] = [];
  const flush = () => {
    if (timed.length >= 3) blocks.push({ kind: "intervals", items: timed });
    else for (const run of groupRuns(timed)) blocks.push({ kind: run.length > 1 ? "group" : "single", items: run });
    timed = [];
  };
  for (const run of groupRuns(items)) {
    if (run[0].target.kind === "timed") {
      timed.push(...run);
      continue;
    }
    flush();
    blocks.push({ kind: run.length > 1 ? "group" : "single", items: run });
  }
  flush();
  return blocks;
}
