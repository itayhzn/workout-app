import { CircleCheck } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { SessionDetail } from "../../components/SessionDetail";
import { EmptyState, Spinner } from "../../components/ui";
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

export function PhoneHistoryDetail() {
  const { sessionId } = useParams();
  const [params] = useSearchParams();
  const justFinished = params.get("done") === "1";
  const { session, loading } = useSession(sessionId);
  return (
    <PhoneScreen
      footer={
        justFinished && session ? (
          <Link to="/" replace className="btn-primary h-14 w-full text-base">
            Done
          </Link>
        ) : undefined
      }
    >
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
          <SessionDetail session={session} />
        </>
      )}
    </PhoneScreen>
  );
}
