import { ArrowDown, ArrowUp, ChevronLeft, Dumbbell, LayoutGrid, Lightbulb, List, Plus, Save, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ExerciseImage } from "../../components/ExerciseImage";
import { Banner, ConfirmDialog, EmptyState, Field, Label, TypeBadge } from "../../components/ui";
import { canonicalExercise } from "../../domain/config";
import { newId } from "../../domain/ids";
import { EXERCISE_TYPES, type Exercise, type ExerciseType } from "../../domain/types";
import { errorFor, workoutsUsingExercise, type ValidationError } from "../../domain/validation";
import { useConfig } from "../../state/ConfigContext";
import { PageHeader, SaveTargetHint, UnsavedChangesGuard, describeSaveError } from "./shared";

const VIEW_KEY = "kinetic.exerciseView";

export function ExercisesPage() {
  const { exercises, workouts } = useConfig();
  const { exerciseId } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ExerciseType | "all">("all");
  const [view, setView] = useState<"grid" | "table">(() => (localStorage.getItem(VIEW_KEY) as "grid" | "table") ?? "grid");
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of workouts) for (const e of new Set(w.exercises.map((x) => x.exerciseId))) m.set(e, (m.get(e) ?? 0) + 1);
    return m;
  }, [workouts]);

  const filtered = useMemo(
    () =>
      exercises
        .filter((e) => (type === "all" || e.type === type) && e.name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [exercises, type, query],
  );

  const editing = exerciseId === "new" ? "new" : exerciseId ? exercises.find((e) => e.id === exerciseId) : undefined;
  const panelOpen = !!editing || (exerciseId !== undefined && exerciseId !== "new");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Library"
        title="Exercises"
        description="Reusable exercise definitions: name, type, image and coaching tips. Targets are set per workout."
        actions={
          <button className="btn-primary h-11 px-4" onClick={() => navigate("/manage/exercises/new")}>
            <Plus size={18} /> Add exercise
          </button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className={`flex min-w-0 flex-col gap-4 ${panelOpen ? "hidden xl:flex" : ""}`}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input className="input h-10 pl-9" placeholder="Search exercises…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search exercises" />
            </div>
            <div className="flex overflow-hidden rounded border border-line">
              <button className={`flex h-10 items-center gap-1.5 px-3 text-sm ${view === "grid" ? "bg-volt text-black" : "text-ink-2 hover:bg-elevated"}`} onClick={() => setView("grid")} aria-pressed={view === "grid"}>
                <LayoutGrid size={16} /> Grid
              </button>
              <button className={`flex h-10 items-center gap-1.5 px-3 text-sm ${view === "table" ? "bg-volt text-black" : "text-ink-2 hover:bg-elevated"}`} onClick={() => setView("table")} aria-pressed={view === "table"}>
                <List size={16} /> Table
              </button>
            </div>
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {(["all", ...EXERCISE_TYPES] as const).map((t) => (
              <button key={t} className={`chip capitalize ${type === t ? "chip-active" : ""}`} onClick={() => setType(t)} aria-pressed={type === t}>
                {t} ({t === "all" ? exercises.length : exercises.filter((e) => e.type === t).length})
              </button>
            ))}
          </div>

          {exercises.length === 0 ? (
            <EmptyState
              icon={<Dumbbell size={32} />}
              title="No exercises yet"
              body="Add your first exercise to start building workouts."
              action={
                <button className="btn-primary h-11 px-4" onClick={() => navigate("/manage/exercises/new")}>
                  <Plus size={16} /> Add exercise
                </button>
              }
            />
          ) : filtered.length === 0 ? (
            <div className="card p-6 text-center text-ink-2">No exercises match your filters.</div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {filtered.map((e) => (
                <Link
                  key={e.id}
                  to={`/manage/exercises/${e.id}`}
                  className={`card flex gap-3 p-3 transition hover:border-line-strong ${e.id === exerciseId ? "border-volt bg-elevated" : ""}`}
                >
                  <ExerciseImage path={e.imagePath} type={e.type} alt={e.name} className="h-20 w-20" />
                  <div className="min-w-0 flex-1">
                    <TypeBadge type={e.type} />
                    <div className="mt-1 truncate font-display text-lg font-bold">{e.name}</div>
                    <div className="mt-1 flex gap-3 text-xs text-ink-2">
                      <span className="flex items-center gap-1">
                        <Lightbulb size={12} /> {e.tips?.length ?? 0} tips
                      </span>
                      <span>
                        {usage.get(e.id) ?? 0} workout{usage.get(e.id) === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <th className="label p-3">Exercise</th>
                    <th className="label p-3">Type</th>
                    <th className="label p-3">Tips</th>
                    <th className="label p-3">Used in</th>
                    <th className="label p-3">Image</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((e) => (
                    <tr key={e.id} className={`cursor-pointer hover:bg-elevated ${e.id === exerciseId ? "bg-elevated" : ""}`} onClick={() => navigate(`/manage/exercises/${e.id}`)}>
                      <td className="p-3">
                        <Link to={`/manage/exercises/${e.id}`} className="flex items-center gap-3 font-semibold">
                          <ExerciseImage path={e.imagePath} type={e.type} alt="" className="h-9 w-9" iconSize={16} />
                          {e.name}
                        </Link>
                      </td>
                      <td className="p-3">
                        <TypeBadge type={e.type} />
                      </td>
                      <td className="p-3 tnum text-ink-2">{e.tips?.length ?? 0}</td>
                      <td className="p-3 tnum text-ink-2">{usage.get(e.id) ?? 0}</td>
                      <td className="max-w-48 truncate p-3 font-mono text-xs text-ink-3">{e.imagePath ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {panelOpen &&
          (editing ? (
            <ExerciseEditor key={exerciseId} exercise={editing === "new" ? undefined : editing} />
          ) : (
            <div className="card p-6">
              <p className="text-ink-2">That exercise doesn't exist (it may have been deleted).</p>
              <Link to="/manage/exercises" className="btn-secondary mt-4 h-10 px-4">
                Back to library
              </Link>
            </div>
          ))}
      </div>
    </div>
  );
}

function blankExercise(): Exercise {
  return { id: newId(), name: "", type: "strength", tips: [] };
}

function ExerciseEditor({ exercise }: { exercise?: Exercise }) {
  const config = useConfig();
  const navigate = useNavigate();
  const isNew = !exercise;
  const [original, setOriginal] = useState<Exercise>(() => exercise ?? blankExercise());
  const [draft, setDraft] = useState<Exercise>(() => structuredClone({ ...original, tips: original.tips ?? [] }));
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify({ ...original, tips: original.tips ?? [] });
  const usedBy = workoutsUsingExercise(config.workouts, draft.id);
  const tips = draft.tips ?? [];
  const setTips = (next: string[]) => setDraft({ ...draft, tips: next });

  const save = async () => {
    setSaving(true);
    setMessage(undefined);
    setErrors([]);
    try {
      await config.saveExercise(draft);
      // The saved (canonical) entity becomes the new clean baseline.
      const saved = canonicalExercise(draft);
      setOriginal(saved);
      setDraft({ ...saved, tips: saved.tips ?? [] });
      setJustSaved(true);
      if (isNew) navigate(`/manage/exercises/${draft.id}`, { replace: true });
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
      await config.deleteExercise(draft.id);
      navigate("/manage/exercises", { replace: true });
    } catch (e) {
      setMessage(describeSaveError(e).message ?? String(e));
      setConfirmDelete(false);
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(t);
  }, [justSaved]);

  return (
    <aside className="card flex h-fit flex-col gap-5 p-5 xl:sticky xl:top-8">
      <UnsavedChangesGuard dirty={dirty && !saving} />
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link to="/manage/exercises" className="label mb-1 flex items-center gap-1 hover:text-ink xl:hidden">
            <ChevronLeft size={12} /> Library
          </Link>
          <Label className="text-volt">{isNew ? "New exercise" : "Edit exercise"}</Label>
          <h2 className="font-display text-2xl font-bold">{draft.name || "Untitled exercise"}</h2>
        </div>
        <Link to="/manage/exercises" className="btn-ghost h-9 w-9" aria-label="Close editor">
          <X size={18} />
        </Link>
      </div>

      {message && <Banner tone="error">{message}</Banner>}
      {justSaved && !dirty && <Banner tone="info">Saved.</Banner>}

      <Field label="Name" error={errorFor(errors, "name")}>
        {(id) => <input id={id} className={`input h-11 text-lg ${errorFor(errors, "name") ? "input-error" : ""}`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Pull Ups" autoFocus={isNew} />}
      </Field>

      <Field label="Type" error={errorFor(errors, "type")} hint="Sets the default target when added to a workout.">
        {(id) => (
          <select id={id} className="input h-11 capitalize" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ExerciseType })}>
            {EXERCISE_TYPES.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label="Image path" hint="Repository-relative, e.g. /images/pull-ups.webp (put files in public/images).">
        {(id) => (
          <div className="flex flex-col gap-2">
            <input id={id} className="input h-10 font-mono text-sm" value={draft.imagePath ?? ""} onChange={(e) => setDraft({ ...draft, imagePath: e.target.value })} placeholder="/images/pull-ups.webp" />
            <ExerciseImage path={draft.imagePath} type={draft.type} alt={`${draft.name} preview`} className="aspect-video w-full" iconSize={48} />
          </div>
        )}
      </Field>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label>Tips</Label>
          <button className="label flex items-center gap-1 text-volt hover:text-ink" onClick={() => setTips([...tips, ""])}>
            <Plus size={12} /> Add tip
          </button>
        </div>
        {tips.length === 0 && <p className="text-sm text-ink-3">No tips yet.</p>}
        <ul className="flex flex-col gap-2">
          {tips.map((tip, i) => (
            <li key={i} className="flex items-center gap-1">
              <input
                className={`input h-10 ${errorFor(errors, `tips.${i}`) ? "input-error" : ""}`}
                value={tip}
                aria-label={`Tip ${i + 1}`}
                onChange={(e) => setTips(tips.map((t, j) => (j === i ? e.target.value : t)))}
                autoFocus={tip === "" && i === tips.length - 1}
              />
              <button className="btn-ghost h-10 w-8" aria-label="Move tip up" disabled={i === 0} onClick={() => setTips(swap(tips, i, i - 1))}>
                <ArrowUp size={14} />
              </button>
              <button className="btn-ghost h-10 w-8" aria-label="Move tip down" disabled={i === tips.length - 1} onClick={() => setTips(swap(tips, i, i + 1))}>
                <ArrowDown size={14} />
              </button>
              <button className="btn-ghost h-10 w-8 hover:text-danger" aria-label="Remove tip" onClick={() => setTips(tips.filter((_, j) => j !== i))}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {!isNew && (
        <div className="rounded border border-line bg-canvas/50 p-3">
          <Label>Used in workouts</Label>
          {usedBy.length === 0 ? (
            <p className="mt-1 text-sm text-ink-3">Not used by any workout.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {usedBy.map((w) => (
                <Link key={w.id} to={`/manage/workouts/${w.id}`} className="chip hover:border-line-strong">
                  {w.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-line pt-4">
        {!isNew && (
          <button className="btn-ghost h-11 px-3 normal-case hover:text-danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
            <Trash2 size={16} /> Delete
          </button>
        )}
        <div className="flex-1 text-right">
          <SaveTargetHint target={config.saveTarget} />
        </div>
        <button className="btn-primary h-11 px-5" onClick={save} disabled={saving || (!dirty && !isNew)}>
          <Save size={16} /> {saving ? "Saving…" : "Save exercise"}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={usedBy.length ? "Exercise is in use" : `Delete ${draft.name}?`}
        body={
          usedBy.length ? (
            <>
              This exercise is used by {usedBy.length} workout{usedBy.length > 1 ? "s" : ""} ({usedBy.map((w) => w.name).join(", ")}) and cannot be deleted. Remove it from
              those workouts first.
            </>
          ) : (
            "This removes the exercise from the library. Past workout history keeps its own copy of the name."
          )
        }
        confirmLabel={usedBy.length ? "OK" : "Delete"}
        danger={!usedBy.length}
        busy={saving}
        onConfirm={usedBy.length ? () => setConfirmDelete(false) : remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </aside>
  );
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
