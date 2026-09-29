import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getActivePersonId, loadConnection } from "../services/settings";
import { onSettingsChanged, onSyncRequested } from "../services/syncEvents";
import { loadSyncState, runSync, syncClient, type SyncResult } from "../services/syncService";
import { listSyncQueue } from "../storage/indexedDb";

export type SyncStatus = "off" | "idle" | "syncing" | "offline" | "error";

interface SyncValue {
  status: SyncStatus;
  configured: boolean;
  lastSyncAt?: string;
  lastResult?: SyncResult;
  error?: string;
  /** Finished workouts on this device that haven't been uploaded yet. */
  pending: number;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<SyncValue | null>(null);

/** Sync needs a connection and a chosen person. */
function syncTarget() {
  const connection = loadConnection();
  const personId = getActivePersonId();
  return connection && personId ? { connection, personId } : undefined;
}

const AUTO_SYNC_MIN_GAP_MS = 2 * 60 * 1000;
const HISTORY_EVENT = "kinetic:history-changed";

export function SyncProvider({ children }: { children: ReactNode }) {
  const [configured, setConfigured] = useState(() => !!syncTarget());
  const [status, setStatus] = useState<SyncStatus>(configured ? "idle" : "off");
  const [lastSyncAt, setLastSyncAt] = useState<string>();
  const [lastResult, setLastResult] = useState<SyncResult>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const lastAttempt = useRef(0);

  const refreshPending = useCallback(() => {
    listSyncQueue()
      .then((q) => setPending(q.length))
      .catch(() => {});
  }, []);

  const syncNow = useCallback(async () => {
    const target = syncTarget();
    if (!target) return;
    if (inFlight.current) return inFlight.current;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setStatus("offline");
      return;
    }
    lastAttempt.current = Date.now();
    setStatus("syncing");
    inFlight.current = (async () => {
      try {
        const result = await runSync(syncClient(target.connection), target.personId);
        setLastResult(result);
        setLastSyncAt(result.at);
        setError(undefined);
        setStatus("idle");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus(navigator.onLine === false ? "offline" : "error");
      } finally {
        inFlight.current = null;
        refreshPending();
      }
    })();
    return inFlight.current;
  }, [refreshPending]);

  // Load persisted state, then sync on start.
  useEffect(() => {
    loadSyncState()
      .then((s) => setLastSyncAt(s.lastSyncAt))
      .catch(() => {});
    refreshPending();
    syncNow();
  }, [syncNow, refreshPending]);

  // Triggers: explicit requests (finished workout), coming back online, returning to the app, settings changes.
  useEffect(() => {
    const maybe = () => Date.now() - lastAttempt.current > AUTO_SYNC_MIN_GAP_MS && syncNow();
    const onVisible = () => document.visibilityState === "visible" && maybe();
    const offRequest = onSyncRequested(() => void syncNow());
    const offSettings = onSettingsChanged(() => {
      const on = !!syncTarget();
      setConfigured(on);
      setStatus(on ? "idle" : "off");
      if (on) void syncNow();
    });
    window.addEventListener("online", maybe);
    window.addEventListener(HISTORY_EVENT, refreshPending);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      offRequest();
      offSettings();
      window.removeEventListener("online", maybe);
      window.removeEventListener(HISTORY_EVENT, refreshPending);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncNow, refreshPending]);

  const value = useMemo(() => ({ status, configured, lastSyncAt, lastResult, error, pending, syncNow }), [status, configured, lastSyncAt, lastResult, error, pending, syncNow]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync(): SyncValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSync must be used inside SyncProvider");
  return ctx;
}
