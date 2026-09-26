import { useEffect, useState } from "react";
import type { WorkoutSession } from "../domain/types";
import { getSession, listSessions } from "../storage/indexedDb";

const EVENT = "kinetic:history-changed";

export function notifyHistoryChanged(): void {
  window.dispatchEvent(new Event(EVENT));
}

function useHistoryVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const on = () => setV((x) => x + 1);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return v;
}

/** Completed sessions, newest first. */
export function useSessions(limit?: number): { sessions: WorkoutSession[]; loading: boolean; error?: string } {
  const version = useHistoryVersion();
  const [state, setState] = useState<{ sessions: WorkoutSession[]; loading: boolean; error?: string }>({
    sessions: [],
    loading: true,
  });
  useEffect(() => {
    let alive = true;
    listSessions(limit)
      .then((sessions) => alive && setState({ sessions, loading: false }))
      .catch((e: unknown) => alive && setState({ sessions: [], loading: false, error: String(e) }));
    return () => {
      alive = false;
    };
  }, [limit, version]);
  return state;
}

export function useSession(id: string | undefined): { session?: WorkoutSession; loading: boolean } {
  const version = useHistoryVersion();
  const [state, setState] = useState<{ session?: WorkoutSession; loading: boolean }>({ loading: true });
  useEffect(() => {
    let alive = true;
    if (!id) return setState({ loading: false });
    getSession(id)
      .then((session) => alive && setState({ session, loading: false }))
      .catch(() => alive && setState({ loading: false }));
    return () => {
      alive = false;
    };
  }, [id, version]);
  return state;
}
