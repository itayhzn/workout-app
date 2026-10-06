import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ExerciseImage } from "../../components/ExerciseImage";
import { Label, Modal } from "../../components/ui";
import { formatTarget } from "../../domain/format";
import { sourceForAddedExercise, type AddedExerciseSource } from "../../domain/planChanges";
import type { Exercise, WorkoutSession } from "../../domain/types";
import { useSessions } from "../../state/history";
import { useConfig } from "../../state/ConfigContext";
import { useWeightUnit } from "../../state/units";

const RECENT = 5;

/** Phone sheet for adding an existing library exercise to today's workout, up next. */
export function AddExerciseSheet({
  open,
  session,
  onClose,
  onPick,
}: {
  open: boolean;
  session: WorkoutSession;
  onClose: () => void;
  onPick: (exercise: Exercise, source: AddedExerciseSource) => void;
}) {
  const { exercises, workouts } = useConfig();
  const { sessions: history } = useSessions();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    if (!open) return [];
    const inSession = new Set(session.exercises.map((e) => e.exerciseId));
    return exercises.map((exercise) => ({ exercise, source: sourceForAddedExercise(exercise, workouts, history), inSession: inSession.has(exercise.id) }));
  }, [open, exercises, workouts, history, session.exercises]);

  // Recently done, newest first, leaving out what's already in this workout.
  const recent = useMemo(() => {
    const ids: string[] = [];
    for (const s of history) for (const ex of s.exercises) if (!ids.includes(ex.exerciseId)) ids.push(ex.exerciseId);
    return ids
      .map((id) => rows.find((r) => r.exercise.id === id))
      .filter((r): r is (typeof rows)[number] => !!r && !r.inSession)
      .slice(0, RECENT);
  }, [history, rows]);

  const q = query.trim().toLowerCase();
  const all = rows.filter((r) => r.exercise.name.toLowerCase().includes(q)).sort((a, b) => a.exercise.name.localeCompare(b.exercise.name));

  const close = () => {
    setQuery("");
    onClose();
  };
  const pick = (row: (typeof rows)[number]) => {
    setQuery("");
    onPick(row.exercise, row.source);
  };

  return (
    <Modal open={open} onClose={close} title="Add to today's workout">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-2">It's added up next, with the target from its own workout. Only today's workout changes.</p>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="input h-11 pl-9" placeholder="Search your exercises…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search exercises" />
        </div>
        {!q && recent.length > 0 && (
          <>
            <Label>Recent</Label>
            <ul className="flex flex-col gap-1">
              {recent.map((r) => (
                <PickRow key={r.exercise.id} {...r} onPick={() => pick(r)} />
              ))}
            </ul>
            <Label>All exercises</Label>
          </>
        )}
        <ul className="flex flex-col gap-1">
          {all.map((r) => (
            <PickRow key={r.exercise.id} {...r} onPick={() => pick(r)} />
          ))}
          {all.length === 0 && <li className="p-4 text-center text-sm text-ink-2">No exercises match “{query.trim()}”.</li>}
        </ul>
      </div>
    </Modal>
  );
}

function PickRow({ exercise, source, inSession, onPick }: { exercise: Exercise; source: AddedExerciseSource; inSession: boolean; onPick: () => void }) {
  const unit = useWeightUnit();
  return (
    <li>
      <button className="flex min-h-14 w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-elevated" onClick={onPick} aria-label={`Add ${exercise.name}`}>
        <ExerciseImage path={exercise.imagePath} type={exercise.type} alt="" className="h-10 w-10" iconSize={16} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{exercise.name}</span>
          <span className="block truncate text-xs text-ink-2 tnum">
            {formatTarget(source.target, unit)}
            {source.from ? ` · from ${source.from.workoutName}` : " · not in any workout"}
            {inSession && " · in this workout"}
          </span>
        </span>
        <Plus size={18} className="shrink-0 text-volt" />
      </button>
    </li>
  );
}
