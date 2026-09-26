import { Home } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { EmptyState, Spinner } from "../../components/ui";
import type { WorkoutSession } from "../../domain/types";
import { useActiveWorkout } from "../../state/ActiveWorkoutContext";
import { useSession } from "../../state/history";
import { PhoneScreen } from "./PhoneLayout";

/** Guards active-workout routes against stale or missing session IDs. */
export function SessionGuard({ children }: { children: (session: WorkoutSession) => ReactNode }) {
  const { sessionId } = useParams();
  const { ready, session } = useActiveWorkout();
  const stored = useSession(ready && session?.id !== sessionId ? sessionId : undefined);

  if (!ready) return <Spinner />;
  if (session && session.id === sessionId) return <>{children(session)}</>;
  if (stored.loading) return <Spinner />;
  // The session was finished (e.g. in another tab): show it in history instead.
  if (stored.session) return <Navigate to={`/history/${stored.session.id}`} replace />;
  return (
    <PhoneScreen>
      <div className="pt-16">
        <EmptyState
          title="Workout not found"
          body={session ? "This workout is no longer active. You have a different workout in progress." : "This workout is no longer active."}
          action={
            <div className="flex flex-col gap-2">
              {session && (
                <Link to={`/workout/${session.id}`} className="btn-primary h-12 px-5">
                  Resume {session.workoutName}
                </Link>
              )}
              <Link to="/" className="btn-secondary h-12 px-5">
                <Home size={16} /> Home
              </Link>
            </div>
          }
        />
      </div>
    </PhoneScreen>
  );
}
