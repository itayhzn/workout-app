import { ArrowRight, Check, ChevronDown, CircleCheck, History, Lightbulb, Pause, Play, StickyNote, Timer, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ExerciseImage } from "../../components/ExerciseImage";
import { NumberStepper } from "../../components/NumberStepper";
import { Banner, EmptyState, Label, TypeBadge } from "../../components/ui";
import {
  formatClock,
  formatNumber,
  formatPace,
  formatRest,
  formatSeconds,
  formatShortDate,
  formatTarget,
  formatWeight,
  formatWeightValue,
} from "../../domain/format";
import {
  completeActivity,
  completeTimedSet,
  updateTimedPrescription,
  lastPerformance,
  nextPendingSet,
  setExerciseNotes,
  skipExercise,
  uncompleteSet,
  unskipExercise,
  updateActivity,
  updatePrescription,
  updateSet,
  type PreviousPerformance,
} from "../../domain/session";
import type {
  CardioSessionExercise,
  SessionExercise,
  StrengthSessionExercise,
  StrengthSetResult,
  SwimmingSessionExercise,
  TimedSessionExercise,
  TimedSetResult,
  WorkoutSession,
} from "../../domain/types";
import { WeightStepper } from "../../components/WeightStepper";
import { useWeightUnit } from "../../state/units";
import { timedBlockSize } from "../../domain/intervals";
import { useNow } from "../../hooks/useNow";
import { primeAudio } from "../../services/feedback";
import { useActiveWorkout } from "../../state/ActiveWorkoutContext";
import { useConfig } from "../../state/ConfigContext";
import { useSessions } from "../../state/history";
import { PhoneHeader, PhoneScreen } from "./PhoneLayout";
import { TimerDock } from "./TimerDock";
import { SessionGuard } from "./SessionGuard";

export function ExercisePage() {
  return <SessionGuard>{(session) => <ExerciseScreen session={session} />}</SessionGuard>;
}

function ExerciseScreen({ session }: { session: WorkoutSession }) {
  const { sessionExerciseId } = useParams();
  const ex = session.exercises.find((e) => e.id === sessionExerciseId);
  const { sessions: history } = useSessions();
  const previous = useMemo(() => (ex ? lastPerformance(history, ex.exerciseId, session.id) : undefined), [history, ex, session.id]);

  if (!ex) {
    return (
      <PhoneScreen>
        <PhoneHeader title="Exercise" back={`/workout/${session.id}`} />
        <EmptyState
          title="Exercise not found"
          body="This exercise isn't part of the current workout."
          action={
            <Link to={`/workout/${session.id}`} className="btn-primary h-12 px-5">
              Back to workout
            </Link>
          }
        />
      </PhoneScreen>
    );
  }
  if (ex.kind === "strength") return <StrengthExercise session={session} ex={ex} previous={previous} />;
  if (ex.kind === "timed") return <TimedExercise session={session} ex={ex} previous={previous} />;
  return <ActivityExercise session={session} ex={ex} previous={previous} />;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function ExerciseHero({ ex }: { ex: SessionExercise }) {
  const { exerciseById } = useConfig();
  const def = exerciseById(ex.exerciseId);
  return (
    <div className="card flex items-center gap-4 p-3">
      <ExerciseImage path={def?.imagePath} type={def?.type} alt={ex.exerciseName} className="h-28 w-28" iconSize={40} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {def && <TypeBadge type={def.type} />}
          {ex.status === "completed" && (
            <span className="flex items-center gap-1 font-display text-xs font-bold uppercase tracking-wider text-emerald">
              <CircleCheck size={14} /> Complete
            </span>
          )}
          {ex.status === "skipped" && <span className="font-display text-xs font-bold uppercase tracking-wider text-ink-3">Skipped</span>}
        </div>
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight">{ex.exerciseName}</h1>
      </div>
    </div>
  );
}

function Tips({ exerciseId }: { exerciseId: string }) {
  const { exerciseById } = useConfig();
  const tips = exerciseById(exerciseId)?.tips ?? [];
  const [open, setOpen] = useState(false);
  if (!tips.length) return null;
  return (
    <section className="card">
      <button className="flex h-14 w-full items-center gap-3 px-4 text-left font-semibold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Lightbulb size={18} className="text-cyan" />
        <span className="flex-1">Tips</span>
        <ChevronDown size={18} className={`text-ink-2 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="flex flex-col gap-2 px-4 pb-4">
          {tips.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink-2">
              <Check size={16} className="mt-0.5 shrink-0 text-emerald" /> {t}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ExerciseNote({ ex }: { ex: SessionExercise }) {
  const { update } = useActiveWorkout();
  const [open, setOpen] = useState(!!ex.notes);
  const [text, setText] = useState(ex.notes ?? "");
  useEffect(() => setText(ex.notes ?? ""), [ex.notes]);
  return (
    <section className="card">
      <button className="flex h-14 w-full items-center gap-3 px-4 text-left font-semibold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <StickyNote size={18} className="text-ink-2" />
        <span className="flex-1">{ex.notes ? "Note" : "Add note"}</span>
        <ChevronDown size={18} className={`text-ink-2 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <textarea
            className="input min-h-20"
            placeholder="How did it feel?"
            aria-label="Exercise note"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => text !== (ex.notes ?? "") && update((s) => setExerciseNotes(s, ex.id, text))}
          />
        </div>
      )}
    </section>
  );
}

function useNextExercise(session: WorkoutSession, currentId: string): SessionExercise | undefined {
  const idx = session.exercises.findIndex((e) => e.id === currentId);
  const open = (e: SessionExercise) => e.status === "pending" || e.status === "in_progress";
  return session.exercises.slice(idx + 1).find(open) ?? session.exercises.slice(0, idx).find(open);
}

function CompletionPanel({ session, ex, onUndo }: { session: WorkoutSession; ex: SessionExercise; onUndo?: () => void }) {
  const next = useNextExercise(session, ex.id);
  return (
    <div className="card border-emerald/50 bg-emerald/10 p-4 shadow-emerald">
      <div className="flex items-center gap-2 font-display text-xl font-bold text-emerald">
        <CircleCheck size={24} /> Exercise complete
      </div>
      <div className="mt-3 grid gap-2">
        {next ? (
          <Link to={`/workout/${session.id}/exercise/${next.id}`} className="btn-primary h-14 text-base normal-case">
            Next: {next.exerciseName} <ArrowRight size={18} />
          </Link>
        ) : (
          <Link to={`/workout/${session.id}/finish`} className="btn-primary h-14 text-base">
            Finish workout
          </Link>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Link to={`/workout/${session.id}`} className="btn-secondary h-12">
            Workout
          </Link>
          {onUndo && (
            <button className="btn-ghost h-12" onClick={onUndo}>
              <Undo2 size={16} /> Undo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SkippedPanel({ onResume, sessionId }: { onResume: () => void; sessionId: string }) {
  return (
    <div className="card p-4">
      <div className="font-display text-lg font-bold text-ink-2">Exercise skipped</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn-primary h-12" onClick={onResume}>
          Resume exercise
        </button>
        <Link to={`/workout/${sessionId}`} className="btn-secondary h-12">
          Workout
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

type TargetField = "weightKg" | "reps" | "sets" | "restSeconds";

function StrengthExercise({ session, ex, previous }: { session: WorkoutSession; ex: StrengthSessionExercise; previous?: PreviousPerformance }) {
  const { update, completeSet, clearRest } = useActiveWorkout();
  const unit = useWeightUnit();
  const [editingTarget, setEditingTarget] = useState<TargetField | null>(null);
  const [editingSet, setEditingSet] = useState<number | null>(null);
  const current = nextPendingSet(ex);
  const prevEx = previous?.exercise.kind === "strength" ? previous.exercise : undefined;
  const doneCount = ex.sets.filter((s) => s.status === "completed").length;

  const onComplete = () => {
    if (!current) return;
    primeAudio();
    setEditingSet(null);
    completeSet(ex.id, { weightKg: current.weightKg, reps: current.reps });
  };

  const undoLast = () => {
    const last = [...ex.sets].reverse().find((s) => s.status === "completed");
    if (!last) return;
    clearRest();
    update((s) => uncompleteSet(s, ex.id, last.setNumber));
  };

  return (
    <PhoneScreen
      footer={
        <>
          <TimerDock />
          {ex.status === "skipped" ? (
            <SkippedPanel sessionId={session.id} onResume={() => update((s) => unskipExercise(s, ex.id))} />
          ) : current ? (
            <>
              <button className="btn-primary h-14 w-full text-base shadow-volt" onClick={onComplete}>
                <Check size={20} /> Complete set ({current.setNumber} of {ex.sets.length})
              </button>
              <button className="label self-center py-1 hover:text-ink" onClick={() => update((s) => skipExercise(s, ex.id))}>
                Skip exercise
              </button>
            </>
          ) : (
            <CompletionPanel session={session} ex={ex} onUndo={undoLast} />
          )}
        </>
      }
    >
      <PhoneHeader title="Exercise" back={`/workout/${session.id}`} />
      {ex.missingDefinition && <Banner>This exercise no longer exists in the library. You can still log or skip it.</Banner>}
      <ExerciseHero ex={ex} />

      <section className="card p-4">
        <Label className="mb-3">Today's target</Label>
        {editingTarget ? (
          <TargetEditor
            field={editingTarget}
            ex={ex}
            onCancel={() => setEditingTarget(null)}
            onSave={(value) => {
              update((s) => updatePrescription(s, ex.id, { [editingTarget]: value }));
              setEditingTarget(null);
            }}
          />
        ) : (
          <div className="grid grid-cols-4 gap-2">
            <TargetTile label="Weight" value={formatWeightValue(ex.prescribed.weightKg, unit)} unit={ex.prescribed.weightKg ? unit : ""} onClick={() => setEditingTarget("weightKg")} />
            <TargetTile label="Reps" value={String(ex.prescribed.reps)} onClick={() => setEditingTarget("reps")} />
            <TargetTile label="Sets" value={String(ex.sets.length)} onClick={() => setEditingTarget("sets")} />
            <TargetTile label="Rest" value={formatRest(ex.prescribed.restSeconds)} onClick={() => setEditingTarget("restSeconds")} />
          </div>
        )}
      </section>

      {prevEx && previous && (
        <section className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-elevated text-ink-2">
            <History size={18} />
          </div>
          <div className="min-w-0">
            <Label>Last time · {formatShortDate(previous.date)}</Label>
            <div className="mt-0.5 font-display text-lg font-bold tnum">
              {formatWeight(prevEx.sets.find((s) => s.status === "completed")?.weightKg, unit)}
              <span className="ml-2 text-base font-semibold text-ink-2">
                {prevEx.sets.filter((s) => s.status === "completed").map((s) => s.reps ?? "–").join(" / ")}
              </span>
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="grid grid-cols-[2.5rem_4.5rem_1fr_4.5rem] gap-2 px-3 pb-2">
          <Label>Set</Label>
          <Label>Prev</Label>
          <Label>{unit} × reps</Label>
          <Label className="text-right">
            {doneCount}/{ex.sets.length}
          </Label>
        </div>
        <ul className="flex flex-col gap-2">
          {ex.sets.map((set) => (
            <li key={set.setNumber}>
              <SetRow
                set={set}
                isCurrent={set === current && ex.status !== "skipped"}
                previous={prevEx?.sets.find((p) => p.setNumber === set.setNumber && p.status === "completed")}
                editing={editingSet === set.setNumber}
                onEdit={() => setEditingSet(editingSet === set.setNumber ? null : set.setNumber)}
                onChange={(patch) => update((s) => updateSet(s, ex.id, set.setNumber, patch))}
                onUncomplete={() => {
                  update((s) => uncompleteSet(s, ex.id, set.setNumber));
                  setEditingSet(null);
                }}
                onClose={() => setEditingSet(null)}
              />
            </li>
          ))}
        </ul>
      </section>

      <Tips exerciseId={ex.exerciseId} />
      <ExerciseNote ex={ex} />
    </PhoneScreen>
  );
}

function TargetTile({ label, value, unit, onClick }: { label: string; value: string; unit?: string; onClick: () => void }) {
  return (
    <button className="rounded border border-line bg-elevated px-2 py-3 text-left transition hover:border-cyan/60 active:scale-[0.98]" onClick={onClick} aria-label={`Edit ${label}`}>
      <div className="label text-[10px]">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold leading-none text-cyan tnum">
        {value}
        {unit && <span className="ml-0.5 text-xs font-semibold text-ink-2">{unit}</span>}
      </div>
    </button>
  );
}

function TargetEditor({ field, ex, onSave, onCancel }: { field: TargetField; ex: StrengthSessionExercise; onSave: (v: number | undefined) => void; onCancel: () => void }) {
  const unit = useWeightUnit();
  const initial = field === "sets" ? ex.sets.length : ex.prescribed[field];
  const [value, setValue] = useState<number | undefined>(initial);
  const locked = ex.sets.filter((s) => s.status !== "pending").length;
  const cfg = {
    weightKg: { label: "Weight", step: 2.5, unit, min: 0, hint: "Applies to upcoming sets. Clear for bodyweight." },
    reps: { label: "Reps", step: 1, unit: "", min: 1, hint: "Applies to upcoming sets." },
    sets: { label: "Sets", step: 1, unit: "", min: Math.max(1, locked), hint: locked ? `At least ${locked} (already logged).` : undefined },
    restSeconds: { label: "Rest", step: 15, unit: "sec", min: 0, hint: value !== undefined ? `${formatRest(value)} between sets.` : undefined },
  }[field];
  return (
    <div className="flex flex-col gap-3">
      <Label className="text-cyan">{cfg.label}</Label>
      {field === "weightKg" ? (
        <WeightStepper valueKg={value} onChange={setValue} size="lg" />
      ) : (
        <NumberStepper label={cfg.label} value={value} onChange={setValue} step={cfg.step} min={cfg.min} unit={cfg.unit} size="lg" />
      )}
      {cfg.hint && <p className="text-xs text-ink-3">{cfg.hint}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-ghost h-12" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary h-12" onClick={() => onSave(value)} disabled={field !== "weightKg" && value === undefined}>
          Save
        </button>
      </div>
    </div>
  );
}

interface SetRowProps {
  set: StrengthSetResult;
  isCurrent: boolean;
  previous?: StrengthSetResult;
  editing: boolean;
  onEdit: () => void;
  onChange: (patch: { weightKg?: number | null; reps?: number | null }) => void;
  onUncomplete: () => void;
  onClose: () => void;
}

function SetRow({ set, isCurrent, previous, editing, onEdit, onChange, onUncomplete, onClose }: SetRowProps) {
  const unit = useWeightUnit();
  const completed = set.status === "completed";
  const skipped = set.status === "skipped";
  const prev = previous ? `${formatWeightValue(previous.weightKg, unit)}×${previous.reps ?? "–"}` : "—";

  if (isCurrent) {
    // The current set is edited in place: these are the values Complete Set will record.
    return (
      <div className="relative rounded-lg border-[1.5px] border-volt bg-elevated p-3">
        <div className="grid grid-cols-[2.5rem_4.5rem_1fr] items-center gap-2">
          <div>
            <div className="font-display text-2xl font-bold text-volt tnum">{String(set.setNumber).padStart(2, "0")}</div>
            <div className="font-display text-[10px] font-bold uppercase tracking-wider text-volt">Now</div>
          </div>
          <div className="text-sm text-ink-2 tnum">{prev}</div>
          <div className="text-right font-display text-sm text-ink-2">Log these values ↓</div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1">Weight {unit}</Label>
            <WeightStepper valueKg={set.weightKg} onChange={(v) => onChange({ weightKg: v ?? null })} accent="volt" />
          </div>
          <div>
            <Label className="mb-1">Reps</Label>
            <NumberStepper label="Reps" value={set.reps} onChange={(v) => onChange({ reps: v ?? null })} step={1} accent="volt" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${editing ? "border-cyan/60 bg-elevated" : completed ? "border-line bg-canvas" : "border-line bg-card"} ${skipped ? "opacity-50" : ""}`}>
      <button className="grid min-h-14 w-full grid-cols-[2.5rem_4.5rem_1fr_4.5rem] items-center gap-2 px-3 text-left" onClick={onEdit} aria-expanded={editing} aria-label={`Set ${set.setNumber}, ${set.status}. Tap to edit.`}>
        <span className={`font-display text-xl font-bold tnum ${completed ? "text-ink-2" : "text-ink-3"}`}>{String(set.setNumber).padStart(2, "0")}</span>
        <span className="text-sm text-ink-3 tnum">{prev}</span>
        <span className={`font-display text-lg font-bold tnum ${completed ? "text-ink-2" : "text-ink-3"}`}>
          {formatWeightValue(set.weightKg, unit)} <span className="text-sm">×</span> {set.reps ?? "–"}
        </span>
        <span className="flex justify-end">
          {completed ? (
            <span className="flex items-center gap-1 rounded bg-emerald px-2 py-1 font-display text-xs font-bold text-white">
              <Check size={14} /> DONE
            </span>
          ) : (
            <span className="label">{skipped ? "Skipped" : "Pending"}</span>
          )}
        </span>
      </button>
      {editing && <SetEditor set={set} onSave={(p) => { onChange(p); onClose(); }} onCancel={onClose} onUncomplete={completed ? onUncomplete : undefined} />}
    </div>
  );
}

function SetEditor({ set, onSave, onCancel, onUncomplete }: { set: StrengthSetResult; onSave: (p: { weightKg: number | null; reps: number | null }) => void; onCancel: () => void; onUncomplete?: () => void }) {
  const [weight, setWeight] = useState(set.weightKg);
  const [reps, setReps] = useState(set.reps);
  const unit = useWeightUnit();
  return (
    <div className="flex flex-col gap-3 border-t border-line p-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1">Weight {unit}</Label>
          <WeightStepper valueKg={weight} onChange={setWeight} />
        </div>
        <div>
          <Label className="mb-1">Reps</Label>
          <NumberStepper label="Reps" value={reps} onChange={setReps} step={1} />
        </div>
      </div>
      <div className="flex gap-2">
        {onUncomplete && (
          <button className="btn-ghost h-11 px-3 normal-case" onClick={onUncomplete}>
            <Undo2 size={16} /> Not done
          </button>
        )}
        <div className="flex-1" />
        <button className="btn-ghost h-11 px-4" onClick={onCancel}>
          <X size={16} /> Cancel
        </button>
        <button className="btn-primary h-11 px-5" onClick={() => onSave({ weightKg: weight ?? null, reps: reps ?? null })}>
          Save
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timed (intervals)
// ---------------------------------------------------------------------------

type TimedField = "workSeconds" | "restSeconds" | "sets";

function TimedExercise({ session, ex, previous }: { session: WorkoutSession; ex: TimedSessionExercise; previous?: PreviousPerformance }) {
  const { update, startIntervals, intervalTimer } = useActiveWorkout();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<TimedField | null>(null);
  const current = nextPendingSet(ex);
  const block = timedBlockSize(session, ex.id);
  const running = !!intervalTimer?.steps.some((s) => s.exerciseId === ex.id);
  const prevEx = previous?.exercise.kind === "timed" ? previous.exercise : undefined;
  const doneCount = ex.sets.filter((s) => s.status === "completed").length;

  const start = () => {
    primeAudio();
    if (running || startIntervals(ex.id)) navigate(`/workout/${session.id}/intervals`);
  };

  return (
    <PhoneScreen
      footer={
        <>
          <TimerDock />
          {ex.status === "skipped" ? (
            <SkippedPanel sessionId={session.id} onResume={() => update((s) => unskipExercise(s, ex.id))} />
          ) : current ? (
            <>
              <button className="btn-primary h-14 w-full text-base shadow-volt" onClick={start}>
                <Timer size={20} /> {running ? "Open interval timer" : block > 1 ? "Start intervals" : "Start timer"}
              </button>
              <div className="flex justify-center gap-6">
                {!running && (
                  <button className="label py-1 hover:text-ink" onClick={() => update((s) => completeTimedSet(s, ex.id))}>
                    Mark set done
                  </button>
                )}
                <button className="label py-1 hover:text-ink" onClick={() => update((s) => skipExercise(s, ex.id))}>
                  Skip exercise
                </button>
              </div>
            </>
          ) : (
            <CompletionPanel session={session} ex={ex} onUndo={() => {
              const last = [...ex.sets].reverse().find((s) => s.status === "completed");
              if (last) update((s) => uncompleteSet(s, ex.id, last.setNumber));
            }} />
          )}
        </>
      }
    >
      <PhoneHeader title="Timed exercise" back={`/workout/${session.id}`} />
      {ex.missingDefinition && <Banner>This exercise no longer exists in the library. You can still log or skip it.</Banner>}
      <ExerciseHero ex={ex} />

      <section className="card p-4">
        <Label className="mb-3">Today's target</Label>
        {editing ? (
          <TimedTargetEditor
            field={editing}
            ex={ex}
            onCancel={() => setEditing(null)}
            onSave={(v) => {
              update((s) => updateTimedPrescription(s, ex.id, { [editing]: v }));
              setEditing(null);
            }}
          />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <TargetTile label="Work" value={formatRest(ex.prescribed.workSeconds)} onClick={() => setEditing("workSeconds")} />
            <TargetTile label="Rest" value={formatRest(ex.prescribed.restSeconds)} onClick={() => setEditing("restSeconds")} />
            <TargetTile label="Sets" value={String(ex.sets.length)} onClick={() => setEditing("sets")} />
          </div>
        )}
        {block > 1 && !editing && (
          <p className="mt-3 text-sm text-ink-2">
            The timer runs this and the next {block - 1} timed exercise{block > 2 ? "s" : ""} back to back, moving on automatically after each rest.
          </p>
        )}
      </section>

      {prevEx && previous && (
        <section className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-elevated text-ink-2">
            <History size={18} />
          </div>
          <div>
            <Label>Last time · {formatShortDate(previous.date)}</Label>
            <div className="mt-0.5 font-display text-lg font-bold tnum">
              {prevEx.sets.filter((s) => s.status === "completed").map((s) => formatSeconds(s.durationSeconds ?? prevEx.prescribed.workSeconds)).join(" / ") || "—"}
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="flex justify-between px-3 pb-2">
          <Label>Sets</Label>
          <Label>
            {doneCount}/{ex.sets.length}
          </Label>
        </div>
        <ul className="flex flex-col gap-2">
          {ex.sets.map((set) => (
            <li key={set.setNumber}>
              <TimedSetRow set={set} ex={ex} isCurrent={set === current && ex.status !== "skipped"} onToggle={() =>
                update((s) => (set.status === "completed" ? uncompleteSet(s, ex.id, set.setNumber) : completeTimedSet(s, ex.id, { setNumber: set.setNumber })))
              } />
            </li>
          ))}
        </ul>
      </section>

      <Tips exerciseId={ex.exerciseId} />
      <ExerciseNote ex={ex} />
    </PhoneScreen>
  );
}

function TimedSetRow({ set, ex, isCurrent, onToggle }: { set: TimedSetResult; ex: TimedSessionExercise; isCurrent: boolean; onToggle: () => void }) {
  const completed = set.status === "completed";
  const skipped = set.status === "skipped";
  return (
    <button
      className={`grid min-h-14 w-full grid-cols-[2.5rem_1fr_5rem] items-center gap-2 rounded-lg border px-3 text-left ${
        isCurrent ? "border-[1.5px] border-volt bg-elevated" : completed ? "border-line bg-canvas" : "border-line bg-card"
      } ${skipped ? "opacity-50" : ""}`}
      onClick={onToggle}
      disabled={skipped}
      aria-label={`Set ${set.setNumber}, ${set.status}. Tap to ${completed ? "undo" : "mark done"}.`}
    >
      <span className={`font-display text-xl font-bold tnum ${isCurrent ? "text-volt" : "text-ink-3"}`}>{String(set.setNumber).padStart(2, "0")}</span>
      <span className={`font-display text-lg font-bold tnum ${completed ? "text-ink-2" : isCurrent ? "" : "text-ink-3"}`}>
        {formatRest(set.durationSeconds ?? ex.prescribed.workSeconds)}
      </span>
      <span className="flex justify-end">
        {completed ? (
          <span className="flex items-center gap-1 rounded bg-emerald px-2 py-1 font-display text-xs font-bold text-white">
            <Check size={14} /> DONE
          </span>
        ) : (
          <span className={`label ${isCurrent ? "text-volt" : ""}`}>{skipped ? "Skipped" : isCurrent ? "Next" : "Pending"}</span>
        )}
      </span>
    </button>
  );
}

function TimedTargetEditor({ field, ex, onSave, onCancel }: { field: TimedField; ex: TimedSessionExercise; onSave: (v: number) => void; onCancel: () => void }) {
  const [value, setValue] = useState<number | undefined>(field === "sets" ? ex.sets.length : ex.prescribed[field]);
  const locked = ex.sets.filter((s) => s.status !== "pending").length;
  const cfg = {
    workSeconds: { label: "Work", step: 5, min: 5, unit: "sec" },
    restSeconds: { label: "Rest", step: 5, min: 0, unit: "sec" },
    sets: { label: "Sets", step: 1, min: Math.max(1, locked), unit: "" },
  }[field];
  return (
    <div className="flex flex-col gap-3">
      <Label className="text-cyan">{cfg.label}</Label>
      <NumberStepper label={cfg.label} value={value} onChange={setValue} step={cfg.step} min={cfg.min} unit={cfg.unit} size="lg" />
      {field !== "sets" && value !== undefined && <p className="text-xs text-ink-3">{formatRest(value)}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-ghost h-12" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary h-12" onClick={() => value !== undefined && onSave(Math.round(value))} disabled={value === undefined}>
          Save
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cardio / swimming
// ---------------------------------------------------------------------------

function ActivityExercise({ session, ex, previous }: { session: WorkoutSession; ex: CardioSessionExercise | SwimmingSessionExercise; previous?: PreviousPerformance }) {
  const { update } = useActiveWorkout();
  const navigate = useNavigate();
  const running = !!ex.timerStartedAt;
  const now = useNow(500, running);
  const elapsed = (ex.actualDurationSeconds ?? 0) + (running ? Math.max(0, (now - ex.timerStartedAt!) / 1000) : 0);
  const isCardio = ex.kind === "cardio";
  const distance = isCardio ? ex.actualDistanceKm : ex.actualDistanceMeters;
  const pace = isCardio ? formatPace(elapsed, ex.actualDistanceKm ?? 0) : undefined;
  const complete = ex.status === "completed";

  const toggleTimer = () => {
    if (running) {
      update((s) =>
        updateActivity(s, ex.id, {
          actualDurationSeconds: Math.round(elapsed),
          timerStartedAt: undefined,
        }),
      );
    } else {
      update((s) => updateActivity(s, ex.id, { timerStartedAt: Date.now() }));
    }
  };

  const setDuration = (minutes: number | undefined, seconds: number | undefined) => {
    const total = (minutes ?? 0) * 60 + (seconds ?? 0);
    update((s) => updateActivity(s, ex.id, { actualDurationSeconds: total || undefined, timerStartedAt: undefined }));
  };

  const prev = previous?.exercise.kind === ex.kind ? (previous.exercise as CardioSessionExercise | SwimmingSessionExercise) : undefined;

  return (
    <PhoneScreen
      footer={
        <>
          <TimerDock />
          {ex.status === "skipped" ? (
            <SkippedPanel sessionId={session.id} onResume={() => update((s) => unskipExercise(s, ex.id))} />
          ) : complete ? (
            <CompletionPanel session={session} ex={ex} />
          ) : (
            <>
              <button className="btn-primary h-14 w-full text-base shadow-volt" onClick={() => update((s) => completeActivity(s, ex.id))}>
                <Check size={20} /> Complete activity
              </button>
              <button
                className="label self-center py-1 hover:text-ink"
                onClick={() => {
                  update((s) => skipExercise(s, ex.id));
                  navigate(`/workout/${session.id}`);
                }}
              >
                Skip exercise
              </button>
            </>
          )}
        </>
      }
    >
      <PhoneHeader title="Activity" back={`/workout/${session.id}`} />
      {ex.missingDefinition && <Banner>This exercise no longer exists in the library. You can still log or skip it.</Banner>}
      <ExerciseHero ex={ex} />

      <section className="card p-4">
        <Label>Target</Label>
        <div className="mt-1 font-display text-2xl font-bold text-cyan tnum">{formatTarget(ex.prescribed)}</div>
        {prev && previous && (
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm text-ink-2 tnum">
            <History size={14} /> Last time · {formatShortDate(previous.date)}:{" "}
            {[
              prev.actualDurationSeconds ? formatClock(prev.actualDurationSeconds) : undefined,
              prev.kind === "cardio" && prev.actualDistanceKm ? `${formatNumber(prev.actualDistanceKm)} km` : undefined,
              prev.kind === "swimming" && prev.actualDistanceMeters ? `${prev.actualDistanceMeters} m` : undefined,
            ]
              .filter(Boolean)
              .join(" · ") || "completed"}
          </div>
        )}
      </section>

      <section className={`card p-5 text-center ${running ? "border-volt/60" : ""}`}>
        <Label>Duration</Label>
        <div className={`mt-2 font-display text-6xl font-bold tnum ${running ? "text-volt" : ""}`}>{formatClock(elapsed)}</div>
        <button className={`${running ? "btn-secondary" : "btn-primary"} mt-4 h-12 w-full`} onClick={toggleTimer}>
          {running ? <Pause size={18} /> : <Play size={18} />} {running ? "Pause timer" : elapsed ? "Resume timer" : "Start timer"}
        </button>
        {!running && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-left">
            <div>
              <Label className="mb-1">Minutes</Label>
              <NumberStepper label="Minutes" value={Math.floor(elapsed / 60)} onChange={(m) => setDuration(m, Math.round(elapsed % 60))} />
            </div>
            <div>
              <Label className="mb-1">Seconds</Label>
              <NumberStepper label="Seconds" value={Math.round(elapsed % 60)} max={59} step={5} onChange={(sec) => setDuration(Math.floor(elapsed / 60), sec)} />
            </div>
          </div>
        )}
      </section>

      <section className="card p-4">
        <Label className="mb-2">Distance</Label>
        <NumberStepper
          label="Distance"
          value={distance}
          optional
          size="lg"
          step={isCardio ? 0.1 : 50}
          unit={isCardio ? "km" : "m"}
          onChange={(v) => update((s) => updateActivity(s, ex.id, isCardio ? { actualDistanceKm: v } : { actualDistanceMeters: v }))}
        />
        {pace && (
          <p className="mt-2 text-sm text-ink-2 tnum">
            Pace <span className="font-semibold text-cyan">{pace} /km</span>
            {ex.kind === "cardio" && ex.prescribed.targetPace && <> · target {ex.prescribed.targetPace} /km</>}
          </p>
        )}
      </section>

      <Tips exerciseId={ex.exerciseId} />
      <ExerciseNote ex={ex} />
    </PhoneScreen>
  );
}
