import { ArrowDown, ArrowUp, ChevronLeft, Copy, GripVertical, Link2, ListChecks, Plus, Save, Search, Trash2, TriangleAlert, Unlink2 } from "lucide-react";
import { Fragment, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ExerciseImage } from "../../components/ExerciseImage";
import { GroupLabel } from "../../components/GroupLabel";
import { Banner, ConfirmDialog, EmptyState, Field, Label, Modal, TypeBadge } from "../../components/ui";
import { canonicalWorkout, defaultTarget, defaultTargetKind } from "../../domain/config";
import { estimateWorkoutMinutes, totalSets } from "../../domain/format";
import { linkWithNext, normalizeGroups, unlinkFromNext } from "../../domain/groups";
import { newId } from "../../domain/ids";
import { daysForWorkout, weekdayLabel } from "../../domain/schedule";
import {
  EXERCISE_TYPES,
  TARGET_KINDS,
  WORKOUT_TYPES,
  type Exercise,
  type ExerciseTarget,
  type ExerciseType,
  type TargetKind,
  type Workout,
  type WorkoutExercise,
  type WorkoutType,
} from "../../domain/types";
import { errorFor, type ValidationError } from "../../domain/validation";
import { fromDisplayWeight, toDisplayWeight, weightStep } from "../../domain/units";
import { useConfig } from "../../state/ConfigContext";
import { useWeightUnit } from "../../state/units";
import { NumInput, PageHeader, RestInput, SaveTargetHint, UnsavedChangesGuard, describeSaveError } from "./shared";

export function WorkoutsPage() {
  const { workouts, schedule } = useConfig();
  const { workoutId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const filtered = workouts.filter((w) => w.name.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = workoutId && workoutId !== "new" ? workouts.find((w) => w.id === workoutId) : undefined;
  const draftFromState = (location.state as { draft?: Workout } | null)?.draft;
  const editorOpen = workoutId !== undefined;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Templates"
        title="Workouts"
        description="Build workout templates, order their exercises and set workout-specific targets."
        actions={
          <button className="btn-primary h-11 px-4" onClick={() => navigate("/manage/workouts/new")}>
            <Plus size={18} /> New workout
          </button>
        }
      />
      {workouts.length === 0 && workoutId === undefined ? (
        <EmptyState
          icon={<ListChecks size={32} />}
          title="No workouts yet"
          body="Create a workout and add exercises from your library."
          action={
            <button className="btn-primary h-11 px-4" onClick={() => navigate("/manage/workouts/new")}>
              <Plus size={16} /> Create workout
            </button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <div className={`flex flex-col gap-3 ${editorOpen ? "hidden lg:flex" : ""}`}>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input className="input h-10 pl-9" placeholder="Filter workouts…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter workouts" />
            </div>
            <Label>
              {workouts.length} workout{workouts.length === 1 ? "" : "s"}
            </Label>
            <ul className="flex flex-col gap-2">
              {filtered.map((w) => {
                const days = daysForWorkout(schedule, w.id);
                return (
                  <li key={w.id}>
                    <Link
                      to={`/manage/workouts/${w.id}`}
                      className={`card block p-4 transition hover:border-line-strong ${w.id === workoutId ? "border-l-4 border-l-volt bg-elevated" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-display text-lg font-bold">{w.name}</div>
                        <TypeBadge type={w.type} />
                      </div>
                      <div className="mt-1 text-sm text-ink-2 tnum">
                        {w.exercises.length} exercises · ~{estimateWorkoutMinutes(w)} min{totalSets(w) ? ` · ${totalSets(w)} sets` : ""}
                      </div>
                      {days.length > 0 && <div className="mt-2 text-xs text-cyan">{days.map((d) => weekdayLabel(d, true)).join(" · ")}</div>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {workoutId === undefined ? (
            <div className="card hidden items-center justify-center p-10 text-ink-2 lg:flex">Select a workout to edit it.</div>
          ) : workoutId === "new" ? (
            <WorkoutEditor key={`new-${location.key}`} initial={draftFromState} />
          ) : selected ? (
            <WorkoutEditor key={selected.id} workout={selected} />
          ) : (
            <div className="card p-6">
              <p className="text-ink-2">That workout doesn't exist (it may have been deleted).</p>
              <Link to="/manage/workouts" className="btn-secondary mt-4 h-10 px-4">
                Back to workouts
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkoutEditor({ workout, initial }: { workout?: Workout; initial?: Workout }) {
  const config = useConfig();
  const navigate = useNavigate();
  const isNew = !workout;
  const [original, setOriginal] = useState<Workout>(() => workout ?? { id: newId(), name: "", type: "strength", exercises: [] });
  const [draft, setDraft] = useState<Workout>(() => structuredClone(initial ?? original));
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [message, setMessage] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  // Only the grip handle arms dragging, so text inputs inside rows stay selectable.
  const [armed, setArmed] = useState<number | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const days = isNew ? [] : daysForWorkout(config.schedule, draft.id);

  // Grouping is re-normalized after every edit so supersets/circuits stay contiguous after moves and removals.
  const setItems = (exercises: WorkoutExercise[]) => {
    setDraft({ ...draft, exercises: normalizeGroups(exercises) });
    setSaved(false);
  };
  const setRounds = (group: string, rounds: number) =>
    setItems(
      draft.exercises.map((e) =>
        e.group === group && (e.target.kind === "strength" || e.target.kind === "timed") ? { ...e, target: { ...e.target, sets: rounds } } : e,
      ),
    );
  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.exercises.length || from === to) return;
    const next = [...draft.exercises];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setItems(next);
  };
  const updateTarget = (i: number, target: ExerciseTarget) => setItems(draft.exercises.map((e, j) => (j === i ? { ...e, target } : e)));

  const addExercise = (ex: Exercise) => {
    const kind = defaultTargetKind(ex.type);
    const last = draft.exercises.at(-1)?.target;
    // Building a circuit: a new non-cardio exercise after a timed one inherits its work/rest.
    const target = last?.kind === "timed" && kind !== "cardio" && kind !== "swimming" ? { ...last } : defaultTarget(kind);
    setItems([...draft.exercises, { id: newId(), exerciseId: ex.id, target }]);
    setPickerOpen(false);
  };

  const save = async () => {
    setSaving(true);
    setMessage(undefined);
    setErrors([]);
    try {
      await config.saveWorkout(draft);
      const clean = canonicalWorkout(draft);
      setOriginal(clean);
      setDraft(clean);
      setSaved(true);
      if (isNew) navigate(`/manage/workouts/${draft.id}`, { replace: true });
    } catch (e) {
      const out = describeSaveError(e);
      setErrors(out.fieldErrors);
      setMessage(out.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await config.deleteWorkout(draft.id);
      navigate("/manage/workouts", { replace: true });
    } catch (e) {
      setMessage(describeSaveError(e).message);
      setConfirmDelete(false);
      setSaving(false);
    }
  };

  const duplicate = () => {
    const copy: Workout = {
      id: newId(),
      name: `${draft.name} (copy)`,
      type: draft.type,
      exercises: draft.exercises.map((e) => ({ ...structuredClone(e), id: newId() })),
    };
    navigate("/manage/workouts/new", { state: { draft: copy } });
  };

  const onDragStart = (i: number) => (e: DragEvent) => {
    setDragIndex(i);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i));
  };
  const onDragOver = (i: number) => (e: DragEvent) => {
    if (dragIndex === null) return;
    e.preventDefault();
    setDropIndex(i);
  };
  const onDrop = (i: number) => (e: DragEvent) => {
    e.preventDefault();
    if (dragIndex !== null) move(dragIndex, i);
    setDragIndex(null);
    setDropIndex(null);
  };

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <UnsavedChangesGuard dirty={dirty && !saving} />
      <div className="card flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Link to="/manage/workouts" className="label flex items-center gap-1 hover:text-ink lg:hidden">
            <ChevronLeft size={12} /> Workouts
          </Link>
          <div className="flex flex-wrap gap-2">
            <Stat label="Est." value={`~${estimateWorkoutMinutes(draft)} min`} />
            <Stat label="Exercises" value={String(draft.exercises.length)} />
            <Stat label="Sets" value={String(totalSets(draft))} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isNew && (
              <button className="btn-secondary h-10 px-3 normal-case" onClick={duplicate} disabled={dirty} title={dirty ? "Save first" : "Duplicate as new workout"}>
                <Copy size={16} /> Duplicate
              </button>
            )}
            <button className="btn-primary h-10 px-4" onClick={save} disabled={saving || (!dirty && !isNew)}>
              <Save size={16} /> {saving ? "Saving…" : "Save workout"}
            </button>
          </div>
        </div>
        {message && <Banner tone="error">{message}</Banner>}
        {saved && !dirty && <Banner tone="info">Saved.</Banner>}
        <div className="grid gap-4 md:grid-cols-[1fr_180px_150px]">
          <Field label="Workout name" error={errorFor(errors, "name")}>
            {(id) => (
              <input
                id={id}
                className={`input h-12 font-display text-2xl font-bold ${errorFor(errors, "name") ? "input-error" : ""}`}
                value={draft.name}
                placeholder="e.g. Pull"
                autoFocus={isNew && !initial}
                onChange={(e) => {
                  setDraft({ ...draft, name: e.target.value });
                  setSaved(false);
                }}
              />
            )}
          </Field>
          <Field label="Type" error={errorFor(errors, "type")}>
            {(id) => (
              <select id={id} className="input h-12 capitalize" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as WorkoutType })}>
                {WORKOUT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Leave by" error={errorFor(errors, "leaveBy")} hint="Optional countdown">
            {(id) => (
              <input
                id={id}
                type="time"
                className={`input h-12 tnum ${errorFor(errors, "leaveBy") ? "input-error" : ""}`}
                value={draft.leaveBy ?? ""}
                onChange={(e) => setDraft({ ...draft, leaveBy: e.target.value || undefined })}
              />
            )}
          </Field>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-3">{days.length ? `Scheduled on ${days.map((d) => weekdayLabel(d)).join(", ")}.` : "Not on the weekly schedule."}</p>
          <SaveTargetHint target={config.saveTarget} />
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between px-1">
          <Label>Exercise order · drag to reorder</Label>
          <Label>{draft.exercises.length} exercises</Label>
        </div>
        {draft.exercises.length === 0 && <p className="px-1 pb-3 text-sm text-ink-3">No exercises yet. Add some from your library.</p>}
        <ol className="flex flex-col">
          {draft.exercises.map((item, i) => {
            const prev = draft.exercises[i - 1];
            const next = draft.exercises[i + 1];
            const firstOfGroup = !!item.group && prev?.group !== item.group;
            const inGroup = !!item.group;
            const linkedToNext = inGroup && next?.group === item.group;
            const groupable = (k: string) => k === "strength" || k === "timed";
            const canLink = !!next && groupable(item.target.kind) && item.target.kind === next.target.kind;
            const rounds = inGroup ? Math.max(...draft.exercises.filter((e) => e.group === item.group).map((e) => ("sets" in e.target ? e.target.sets : 1))) : 0;
            return (
              <Fragment key={item.id}>
                <li
                  draggable={armed === i}
                  onDragStart={onDragStart(i)}
                  onDragOver={onDragOver(i)}
                  onDrop={onDrop(i)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDropIndex(null);
                    setArmed(null);
                  }}
                  className={`rounded-lg border bg-elevated/60 transition ${dropIndex === i && dragIndex !== i ? "border-volt" : "border-line"} ${dragIndex === i ? "opacity-40" : ""} ${
                    inGroup ? "border-l-4 border-l-volt/70" : ""
                  }`}
                >
                  {firstOfGroup && (
                    <div className="flex items-center gap-3 border-b border-line px-3 py-2">
                      <GroupLabel kind={item.target.kind} />
                      <label className="ml-auto flex items-center gap-2 text-xs text-ink-2">
                        Rounds
                        <NumInput label="Rounds" value={rounds} step={1} onChange={(v) => v && v > 0 && setRounds(item.group!, Math.round(v))} className="w-14" />
                      </label>
                    </div>
                  )}
                  <WorkoutExerciseRow
                    item={item}
                    index={i}
                    count={draft.exercises.length}
                    errors={errors}
                    onArm={(on) => setArmed(on ? i : null)}
                    onMove={(to) => move(i, to)}
                    onRemove={() => setItems(draft.exercises.filter((_, j) => j !== i))}
                    onTarget={(t) => updateTarget(i, t)}
                  />
                </li>
                {next && (
                  <li className={`flex justify-center ${linkedToNext ? "h-6" : "h-5"}`} aria-hidden={!canLink && !linkedToNext}>
                    {(canLink || linkedToNext) && (
                      <button
                        className={`flex items-center gap-1 rounded px-2 text-[11px] font-semibold uppercase tracking-wider ${linkedToNext ? "text-volt hover:text-ink" : "text-ink-3 hover:text-volt"}`}
                        onClick={() => setItems(linkedToNext ? unlinkFromNext(draft.exercises, i) : linkWithNext(draft.exercises, i))}
                        title={linkedToNext ? "Split here" : item.target.kind === "timed" ? "Join into a circuit" : "Join into a superset"}
                      >
                        {linkedToNext ? <Unlink2 size={12} /> : <Link2 size={12} />}
                        {linkedToNext ? "Unlink" : item.target.kind === "timed" ? "Circuit" : "Superset"}
                      </button>
                    )}
                  </li>
                )}
              </Fragment>
            );
          })}
        </ol>
        <button className="btn-secondary mt-3 h-12 w-full border-dashed" onClick={() => setPickerOpen(true)}>
          <Plus size={18} /> Add exercise
        </button>
      </div>

      {!isNew && (
        <div className="flex justify-end">
          <button className="btn-ghost h-10 px-3 normal-case hover:text-danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} /> Delete workout
          </button>
        </div>
      )}

      <ExercisePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={addExercise} />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${original.name}?`}
        body={
          <>
            This deletes the workout template. Past workout history is kept.
            {days.length > 0 && <> It will also be removed from the schedule ({days.map((d) => weekdayLabel(d)).join(", ")}).</>}
          </>
        }
        confirmLabel="Delete"
        danger
        busy={saving}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-canvas/50 px-3 py-1.5">
      <div className="label text-[10px]">{label}</div>
      <div className="font-display font-bold tnum">{value}</div>
    </div>
  );
}

interface RowProps {
  item: WorkoutExercise;
  index: number;
  count: number;
  errors: ValidationError[];
  onArm: (on: boolean) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  onTarget: (t: ExerciseTarget) => void;
}

const TARGET_KIND_LABEL: Record<TargetKind, string> = {
  strength: "Sets × reps",
  timed: "Timed intervals",
  cardio: "Run / cardio",
  swimming: "Swim",
};

function WorkoutExerciseRow({ item, index, count, errors, onArm, onMove, onRemove, onTarget }: RowProps) {
  const { exerciseById } = useConfig();
  const unit = useWeightUnit();
  const def = exerciseById(item.exerciseId);
  const t = item.target;
  const err = (field: string) => errorFor(errors, `exercises.${index}.target.${field}`);
  const set = (patch: Partial<ExerciseTarget>) => onTarget({ ...t, ...patch } as ExerciseTarget);

  return (
    <div className="flex flex-wrap items-center gap-3 p-3">
      <div className="flex items-center gap-2">
        <span className="cursor-grab p-1 text-ink-3 hover:text-ink" onMouseDown={() => onArm(true)} onMouseUp={() => onArm(false)} aria-hidden>
          <GripVertical size={18} />
        </span>
        <span className="w-5 font-display font-bold text-volt tnum">{index + 1}</span>
        <ExerciseImage path={def?.imagePath} type={def?.type} alt="" className="h-11 w-11" iconSize={18} />
      </div>
      <div className="min-w-40 flex-1">
        <div className="font-semibold">{def?.name ?? <span className="flex items-center gap-1 text-danger"><TriangleAlert size={14} /> Missing: {item.exerciseId}</span>}</div>
        <div className="flex items-center gap-2">
          {def && <TypeBadge type={def.type} />}
          <select
            className="rounded border border-line bg-canvas px-1 py-0.5 text-xs text-ink-2"
            aria-label="Target type"
            value={t.kind}
            onChange={(e) => onTarget(defaultTarget(e.target.value as TargetKind))}
          >
            {TARGET_KINDS.map((k) => (
              <option key={k} value={k}>
                {TARGET_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {t.kind === "strength" && (
          <>
            <TargetField label="Sets">
              <NumInput label="Sets" value={t.sets} step={1} onChange={(v) => set({ sets: v ?? 0 })} error={err("sets")} className="w-14" />
            </TargetField>
            <TargetField label="Reps">
              <div className="flex items-center gap-1">
                <NumInput label="Reps (min)" value={t.reps} step={1} onChange={(v) => set({ reps: v ?? 0 })} error={err("reps")} className="w-12" />
                <span className="text-ink-3">–</span>
                <NumInput label="Reps (max, optional)" value={t.repsMax} step={1} placeholder="—" onChange={(v) => set({ repsMax: v })} error={err("repsMax")} className="w-12" />
              </div>
            </TargetField>
            <TargetField label={unit}>
              <NumInput
                label={`Weight ${unit}`}
                value={t.weightKg === undefined ? undefined : toDisplayWeight(t.weightKg, unit)}
                step={weightStep(unit)}
                placeholder="BW"
                onChange={(v) => set({ weightKg: v === undefined ? undefined : fromDisplayWeight(v, unit) })}
                error={err("weightKg")}
                className="w-16 text-volt"
              />
            </TargetField>
            <TargetField label="Rest">
              <div className="w-16">
                <RestInput value={t.restSeconds} onChange={(v) => set({ restSeconds: v })} error={err("restSeconds")} />
              </div>
            </TargetField>
          </>
        )}
        {t.kind === "timed" && (
          <>
            <TargetField label="Sets">
              <NumInput label="Sets" value={t.sets} step={1} onChange={(v) => set({ sets: v ?? 0 })} error={err("sets")} className="w-14" />
            </TargetField>
            <TargetField label="Work">
              <div className="w-16">
                <RestInput label="Work time (m:ss)" value={t.workSeconds} onChange={(v) => set({ workSeconds: v })} error={err("workSeconds")} />
              </div>
            </TargetField>
            <TargetField label="Rest">
              <div className="w-16">
                <RestInput value={t.restSeconds} onChange={(v) => set({ restSeconds: v })} error={err("restSeconds")} />
              </div>
            </TargetField>
          </>
        )}
        {t.kind === "cardio" && (
          <>
            <TargetField label="Min">
              <NumInput label="Duration minutes" value={t.durationMinutes} step={5} onChange={(v) => set({ durationMinutes: v })} error={err("durationMinutes")} className="w-16" />
            </TargetField>
            <TargetField label="km">
              <NumInput label="Distance km" value={t.distanceKm} step={0.5} onChange={(v) => set({ distanceKm: v })} error={err("distanceKm")} className="w-16" />
            </TargetField>
            <TargetField label="Pace /km">
              <input
                className={`input h-9 w-20 px-2 text-center font-display font-bold tnum ${err("targetPace") ? "input-error" : ""}`}
                aria-label="Target pace per km"
                title={err("targetPace") ?? "Target pace, e.g. 5:30"}
                placeholder="5:30"
                value={t.targetPace ?? ""}
                onChange={(e) => set({ targetPace: e.target.value || undefined })}
              />
            </TargetField>
          </>
        )}
        {t.kind === "swimming" && (
          <>
            <TargetField label="Min">
              <NumInput label="Duration minutes" value={t.durationMinutes} step={5} onChange={(v) => set({ durationMinutes: v })} error={err("durationMinutes")} className="w-16" />
            </TargetField>
            <TargetField label="Meters">
              <NumInput label="Distance meters" value={t.distanceMeters} step={50} onChange={(v) => set({ distanceMeters: v })} error={err("distanceMeters")} className="w-20" />
            </TargetField>
          </>
        )}
      </div>

      <div className="flex items-center">
        <button className="btn-ghost h-9 w-8" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index - 1)}>
          <ArrowUp size={16} />
        </button>
        <button className="btn-ghost h-9 w-8" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(index + 1)}>
          <ArrowDown size={16} />
        </button>
        <button className="btn-ghost h-9 w-8 hover:text-danger" aria-label={`Remove ${def?.name ?? "exercise"}`} onClick={onRemove}>
          <Trash2 size={16} />
        </button>
      </div>
      {errors
        .filter((e) => e.path.startsWith(`exercises.${index}.`))
        .map((e) => (
          <p key={e.path} className="w-full text-xs text-danger">
            {e.message}
          </p>
        ))}
    </div>
  );
}

function TargetField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="label text-[10px]">{label}</span>
      {children}
    </div>
  );
}

function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (e: Exercise) => void }) {
  const { exercises } = useConfig();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ExerciseType | "all">("all");
  const list = useMemo(
    () =>
      exercises
        .filter((e) => (type === "all" || e.type === type) && e.name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [exercises, query, type],
  );
  return (
    <Modal open={open} onClose={onClose} title="Add exercise" wide>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="input h-11 pl-9" placeholder="Search the library…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus aria-label="Search exercises" />
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {(["all", ...EXERCISE_TYPES] as const).map((t) => (
            <button key={t} className={`chip capitalize ${type === t ? "chip-active" : ""}`} onClick={() => setType(t)}>
              {t}
            </button>
          ))}
        </div>
        <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
          {list.map((e) => (
            <li key={e.id}>
              <button
                className="flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-elevated"
                onClick={() => {
                  onPick(e);
                  setQuery("");
                }}
              >
                <ExerciseImage path={e.imagePath} type={e.type} alt="" className="h-10 w-10" iconSize={16} />
                <span className="flex-1 font-semibold">{e.name}</span>
                <TypeBadge type={e.type} />
                <Plus size={16} className="text-volt" />
              </button>
            </li>
          ))}
          {list.length === 0 && (
            <li className="p-4 text-center text-sm text-ink-2">
              No matches.{" "}
              <Link to="/manage/exercises/new" className="text-volt underline">
                Create an exercise
              </Link>
            </li>
          )}
        </ul>
      </div>
    </Modal>
  );
}
