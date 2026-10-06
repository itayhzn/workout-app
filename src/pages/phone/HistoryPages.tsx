import { CircleCheck, Clock, Play, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { SessionDetail } from "../../components/SessionDetail";
import { Banner, EmptyState, Label, Spinner } from "../../components/ui";
import { estimateWorkoutMinutes } from "../../domain/format";
import { nextToday, todaysPlan } from "../../domain/schedule";
import type { Workout } from "../../domain/types";
import { useConfig } from "../../state/ConfigContext";
import { hasUnfinishedWork, unfinishedCount } from "../../domain/session";
import { useActiveWorkout } from "../../state/ActiveWorkoutContext";
import { useSession, useSessions } from "../../state/history";
import { PhoneHeader, PhoneScreen } from "./PhoneLayout";
import { SessionRow } from "./PhoneHome";

export function PhoneHistoryList() {
  const { sessions, loading } = useSessions();
  return (
    <PhoneScreen>
      <PhoneHeader title="History" back="/" />
      {loading ? (
        <Spinner />
      ) : sessions.length === 0 ? (
        <EmptyState title="No completed workouts yet" body="Completed sessions will appear here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <SessionRow session={s} />
            </li>
          ))}
        </ul>
      )}
    </PhoneScreen>
  );
}

/** Picks a cut-short workout back up: it becomes the active workout with its skipped work reopened. */
function ResumeButton({ sessionId, unfinished, primary }: { sessionId: string; unfinished: number; primary: boolean }) {
  const { session: active, resumeSession } = useActiveWorkout();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (active) {
    return (
      <Banner action={<Link to={`/workout/${active.id}`} className="btn-ghost h-8 px-2 text-xs">Open</Link>}>
        To resume this workout, finish or discard {active.workoutName} first.
      </Banner>
    );
  }
  return (
    <>
      {error && <Banner tone="error">{error}</Banner>}
      <button
        className={`${primary ? "btn-primary" : "btn-secondary"} h-14 w-full text-base`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            await resumeSession(sessionId);
            navigate(`/workout/${sessionId}`, { replace: true });
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setBusy(false);
          }
        }}
      >
        <RotateCcw size={18} /> Resume workout · {unfinished} unfinished
      </button>
    </>
  );
}

/** After finishing, the next workout scheduled today (e.g. the cardio after the lift), if nothing is in progress. */
function useUpNext(enabled: boolean): Workout | undefined {
  const config = useConfig();
  const { session: active } = useActiveWorkout();
  const { sessions, loading } = useSessions(12);
  if (!enabled || loading || active || config.status !== "ready") return undefined;
  return nextToday(todaysPlan(config.schedule, config.workouts, sessions, undefined));
}

function UpNextCard({ workout }: { workout: Workout }) {
  const { exercises } = useConfig();
  const { start } = useActiveWorkout();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <section className="card flex flex-col gap-3 border-line-strong bg-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label className="text-volt">Up next today</Label>
          <h2 className="mt-1 truncate font-display text-2xl font-bold">{workout.name}</h2>
        </div>
        <span className="flex shrink-0 items-center gap-1 pt-1 text-sm text-ink-2 tnum">
          <Clock size={14} /> ~{estimateWorkoutMinutes(workout)} min
        </span>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      <button
        className="btn-primary h-14 w-full text-base shadow-volt"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            const s = await start(workout, exercises);
            navigate(`/workout/${s.id}`, { replace: true });
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setBusy(false);
          }
        }}
      >
        <Play size={18} /> Start {workout.name}
      </button>
      <Link to="/?choose=1" replace className="label self-center py-1 hover:text-ink">
        Or choose another workout
      </Link>
    </section>
  );
}

export function PhoneHistoryDetail() {
  const { sessionId } = useParams();
  const [params] = useSearchParams();
  const justFinished = params.get("done") === "1";
  const { session, loading } = useSession(sessionId);
  const upNext = useUpNext(justFinished);
  const resumable = !!session && session.status === "completed" && hasUnfinishedWork(session);
  const footer =
    session && (justFinished || resumable) ? (
      <>
        {resumable && <ResumeButton sessionId={session.id} unfinished={unfinishedCount(session)} primary={!justFinished} />}
        {justFinished && (
          <Link to="/" replace className={`${upNext ? "btn-secondary" : "btn-primary"} h-14 w-full text-base`}>
            Done
          </Link>
        )}
      </>
    ) : undefined;
  return (
    <PhoneScreen footer={footer}>
      <PhoneHeader title={justFinished ? "Summary" : "Workout"} back={justFinished ? "/" : "/history"} />
      {loading ? (
        <Spinner />
      ) : !session ? (
        <EmptyState title="Workout not found" body="This session isn't stored on this device." action={<Link to="/" className="btn-secondary h-11 px-4">Home</Link>} />
      ) : (
        <>
          {justFinished && (
            <div className="card flex items-center gap-3 border-emerald/50 bg-emerald/10 p-4 text-emerald shadow-emerald">
              <CircleCheck size={28} />
              <div className="font-display text-xl font-bold">Workout complete</div>
            </div>
          )}
          {upNext && <UpNextCard workout={upNext} />}
          <SessionDetail session={session} />
        </>
      )}
    </PhoneScreen>
  );
}
