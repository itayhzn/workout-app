import { Check, StickyNote } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SessionExerciseResult, SessionStatTiles } from "../../components/SessionDetail";
import { Banner, Label } from "../../components/ui";
import { finishSession, sessionStats, setSessionNotes } from "../../domain/session";
import type { WorkoutSession } from "../../domain/types";
import { useNow } from "../../hooks/useNow";
import { useActiveWorkout } from "../../state/ActiveWorkoutContext";
import { PhoneHeader, PhoneScreen } from "./PhoneLayout";
import { SessionGuard } from "./SessionGuard";

export function FinishPage() {
  return <SessionGuard>{(session) => <FinishSummary session={session} />}</SessionGuard>;
}

function FinishSummary({ session }: { session: WorkoutSession }) {
  const { finish, update } = useActiveWorkout();
  const navigate = useNavigate();
  const now = useNow(15000);
  const [notes, setNotes] = useState(session.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // Preview exactly what will be saved: unfinished exercises shown as skipped.
  const preview = useMemo(() => finishSession(setSessionNotes(session, notes), new Date(now)), [session, notes, now]);
  const stats = sessionStats(preview);
  const unfinished = session.exercises.filter((e) => e.status === "pending" || e.status === "in_progress").length;

  const onFinish = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const done = await finish(notes);
      if (done) navigate(`/history/${done.id}?done=1`, { replace: true });
    } catch (e) {
      setError(`Couldn't save the workout: ${e instanceof Error ? e.message : String(e)}. Your progress is still here — try again.`);
      setBusy(false);
    }
  };

  return (
    <PhoneScreen
      footer={
        <>
          <button className="btn-primary h-14 w-full text-base shadow-volt" onClick={onFinish} disabled={busy}>
            <Check size={20} /> Save & finish workout
          </button>
          <Link to={`/workout/${session.id}`} className="label self-center py-1 hover:text-ink">
            Back to workout
          </Link>
        </>
      }
    >
      <PhoneHeader title="Workout summary" back={`/workout/${session.id}`} />
      {error && <Banner tone="error">{error}</Banner>}
      <div className="text-center">
        <Label className="text-emerald">Finish workout</Label>
        <h1 className="mt-1 font-display text-4xl font-bold">{session.workoutName}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {stats.exercisesCompleted} completed{stats.exercisesSkipped ? ` · ${stats.exercisesSkipped} skipped` : ""}
        </p>
      </div>
      {unfinished > 0 && (
        <Banner tone="info">
          {unfinished} unfinished exercise{unfinished === 1 ? "" : "s"} will be saved as skipped. Partially done exercises keep their completed sets.
        </Banner>
      )}
      <SessionStatTiles session={preview} />

      <section className="card p-4">
        <Label className="mb-2 flex items-center gap-1.5">
          <StickyNote size={12} /> Workout note
        </Label>
        <textarea
          className="input min-h-24"
          placeholder="Optional — how did it go?"
          aria-label="Workout note"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => update((s) => setSessionNotes(s, notes))}
        />
      </section>

      <h2 className="font-display text-lg font-semibold">Exercise recap</h2>
      {preview.exercises.map((ex, i) => (
        <SessionExerciseResult key={ex.id} ex={ex} index={i} />
      ))}
    </PhoneScreen>
  );
}
