import { ArrowDown, ArrowUp, Clock, GripVertical, Moon, Plus, RotateCcw, Save, TriangleAlert, X } from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { Banner, Label, TypeBadge } from "../../components/ui";
import { canonicalSchedule } from "../../domain/config";
import { estimateWorkoutMinutes, formatMinutes } from "../../domain/format";
import { weekdayLabel, weekdayOf } from "../../domain/schedule";
import { WEEKDAYS, type Weekday, type WeeklySchedule } from "../../domain/types";
import { validateSchedule } from "../../domain/validation";
import { useConfig } from "../../state/ConfigContext";
import { PageHeader, SaveTargetHint, UnsavedChangesGuard, describeSaveError } from "./shared";

type DragPayload = { workoutId: string; from?: { day: Weekday; index: number } };

export function SchedulePage() {
  const config = useConfig();
  const [draft, setDraft] = useState<WeeklySchedule>(() => canonicalSchedule(config.schedule));
  const [baseline, setBaseline] = useState<WeeklySchedule>(() => canonicalSchedule(config.schedule));
  const [message, setMessage] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<DragPayload>();
  const [dropDay, setDropDay] = useState<Weekday>();

  // Pick up external reloads (e.g. after a conflict) when there are no local edits.
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => {
    const incoming = canonicalSchedule(config.schedule);
    setBaseline(incoming);
    setDraft((cur) => (JSON.stringify(cur) === JSON.stringify(baseline) ? incoming : cur));
  }, [config.schedule]);

  const today = weekdayOf(new Date());
  const errors = validateSchedule(draft, config.workouts);
  const scheduledDays = WEEKDAYS.filter((d) => draft[d].length > 0).length;
  const weeklyMinutes = WEEKDAYS.reduce(
    (sum, d) => sum + draft[d].reduce((s, id) => s + (config.workoutById(id) ? estimateWorkoutMinutes(config.workoutById(id)!) : 0), 0),
    0,
  );

  const update = (day: Weekday, ids: string[]) => {
    setDraft({ ...draft, [day]: ids });
    setSaved(false);
  };

  const onDrop = (day: Weekday) => (e: DragEvent) => {
    e.preventDefault();
    setDropDay(undefined);
    if (!drag) return;
    const next = { ...draft };
    if (drag.from) next[drag.from.day] = next[drag.from.day].filter((_, i) => i !== drag.from!.index);
    next[day] = [...next[day], drag.workoutId];
    setDraft(next);
    setSaved(false);
    setDrag(undefined);
  };

  const save = async () => {
    setSaving(true);
    setMessage(undefined);
    try {
      await config.saveSchedule(draft);
      setBaseline(draft);
      setSaved(true);
    } catch (e) {
      setMessage(describeSaveError(e).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <UnsavedChangesGuard dirty={dirty && !saving} />
      <PageHeader
        eyebrow="Weekly plan"
        title="Schedule"
        description="Which workouts are normally planned on each day. Drag workouts between days or use Assign."
        actions={
          <>
            <SaveTargetHint target={config.saveTarget} />
            <button className="btn-ghost h-11 px-3" onClick={() => setDraft(baseline)} disabled={!dirty || saving}>
              <RotateCcw size={16} /> Revert
            </button>
            <button className="btn-primary h-11 px-4" onClick={save} disabled={!dirty || saving || errors.length > 0}>
              <Save size={16} /> {saving ? "Saving…" : "Save schedule"}
            </button>
          </>
        }
      />
      {message && <Banner tone="error">{message}</Banner>}
      {errors.length > 0 && <Banner tone="error">The schedule references workouts that don't exist. Remove them before saving.</Banner>}
      {saved && !dirty && <Banner tone="info">Schedule saved.</Banner>}

      <div className="flex flex-wrap gap-3">
        <Summary label="Training days" value={String(scheduledDays)} />
        <Summary label="Rest days" value={String(7 - scheduledDays)} />
        <Summary label="Planned time" value={formatMinutes(weeklyMinutes * 60000)} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              setDropDay(day);
            }}
            onDragLeave={() => setDropDay((d) => (d === day ? undefined : d))}
            onDrop={onDrop(day)}
            className={`card flex min-h-56 flex-col gap-2 p-3 transition ${dropDay === day ? "border-volt bg-volt/5" : ""} ${day === today ? "border-line-strong" : ""}`}
          >
            <div className="flex items-center justify-between px-1">
              <div>
                <Label className={day === today ? "text-volt" : ""}>{day === today ? "Today" : weekdayLabel(day, true)}</Label>
                <div className="font-display text-xl font-bold">{weekdayLabel(day)}</div>
              </div>
              {draft[day].length === 0 && <Moon size={18} className="text-ink-3" />}
            </div>
            <ul className="flex flex-1 flex-col gap-2">
              {draft[day].map((id, i) => {
                const w = config.workoutById(id);
                return (
                  <li
                    key={`${id}-${i}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", id);
                      setDrag({ workoutId: id, from: { day, index: i } });
                    }}
                    onDragEnd={() => setDrag(undefined)}
                    className={`group rounded border bg-elevated p-2.5 ${w ? "border-line" : "border-danger/60"}`}
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical size={16} className="mt-0.5 shrink-0 cursor-grab text-ink-3" aria-hidden />
                      <div className="min-w-0 flex-1">
                        {w ? (
                          <>
                            <TypeBadge type={w.type} />
                            <Link to={`/manage/workouts/${w.id}`} className="mt-1 block truncate font-semibold hover:text-volt">
                              {w.name}
                            </Link>
                            <div className="flex items-center gap-1 text-xs text-ink-2 tnum">
                              <Clock size={11} /> ~{estimateWorkoutMinutes(w)} min · {w.exercises.length} ex
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-1 text-sm text-danger">
                            <TriangleAlert size={14} /> Missing workout “{id}”
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <button className="btn-ghost h-6 w-6" aria-label="Move up" disabled={i === 0} onClick={() => update(day, swap(draft[day], i, i - 1))}>
                          <ArrowUp size={12} />
                        </button>
                        <button className="btn-ghost h-6 w-6" aria-label="Move down" disabled={i === draft[day].length - 1} onClick={() => update(day, swap(draft[day], i, i + 1))}>
                          <ArrowDown size={12} />
                        </button>
                      </div>
                      <button className="btn-ghost h-6 w-6 hover:text-danger" aria-label={`Remove from ${weekdayLabel(day)}`} onClick={() => update(day, draft[day].filter((_, j) => j !== i))}>
                        <X size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
              {draft[day].length === 0 && <li className="flex flex-1 items-center justify-center rounded border border-dashed border-line py-6 text-sm text-ink-3">Rest day</li>}
            </ul>
            <AssignSelect onAssign={(id) => update(day, [...draft[day], id])} />
          </div>
        ))}
      </div>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Workouts</h2>
            <p className="text-sm text-ink-2">Drag onto any day above.</p>
          </div>
          <Link to="/manage/workouts/new" className="btn-secondary h-10 px-3 normal-case">
            <Plus size={16} /> New workout
          </Link>
        </div>
        {config.workouts.length === 0 ? (
          <p className="text-sm text-ink-3">No workouts yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {config.workouts.map((w) => {
              const count = WEEKDAYS.filter((d) => draft[d].includes(w.id)).length;
              return (
                <div
                  key={w.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData("text/plain", w.id);
                    setDrag({ workoutId: w.id });
                  }}
                  onDragEnd={() => setDrag(undefined)}
                  className="chip cursor-grab py-2 hover:border-line-strong"
                >
                  <GripVertical size={14} className="text-ink-3" />
                  <span className="font-semibold">{w.name}</span>
                  <TypeBadge type={w.type} />
                  <span className="text-xs text-ink-3">{count ? `${count}×/wk` : "unscheduled"}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function AssignSelect({ onAssign }: { onAssign: (id: string) => void }) {
  const { workouts } = useConfig();
  return (
    <label className="relative block">
      <span className="sr-only">Assign workout</span>
      <select
        className="input h-10 cursor-pointer appearance-none pl-9 text-sm text-ink-2"
        value=""
        onChange={(e) => e.target.value && onAssign(e.target.value)}
        disabled={workouts.length === 0}
      >
        <option value="">Assign workout…</option>
        {workouts.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <Plus size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-2">
      <div className="label text-[10px]">{label}</div>
      <div className="font-display text-xl font-bold tnum">{value}</div>
    </div>
  );
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
