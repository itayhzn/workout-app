import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Config, IntervalTimerState, RestTimerState, WorkoutSession } from "../domain/types";

export type ConfigSource = "static" | "github" | "local";

export interface CachedConfig extends Config {
  savedAt: string;
  source: ConfigSource;
  /** True when edits were saved in this browser only and have not been published to the repository. */
  localEdits: boolean;
}

export interface SyncQueueItem {
  sessionId: string;
  queuedAt: string;
}

interface WorkoutDB extends DBSchema {
  configCache: { key: "config"; value: CachedConfig };
  workoutSessions: { key: string; value: WorkoutSession; indexes: { completedAt: string } };
  activeWorkout: { key: "session" | "restTimer" | "intervalTimer"; value: WorkoutSession | RestTimerState | IntervalTimerState };
  appState: { key: string; value: unknown };
  syncQueue: { key: string; value: SyncQueueItem };
}

const DB_VERSION = 1;

// Each person on a device has their own database (see dbNameForPerson), so histories never mix.
let dbName = "kinetic-workout";
let dbPromise: Promise<IDBPDatabase<WorkoutDB>> | undefined;

/** Points all storage calls at another database (switching person). */
export function selectDatabase(name: string): void {
  if (name === dbName) return;
  const old = dbPromise;
  dbPromise = undefined;
  dbName = name;
  old?.then((d) => d.close()).catch(() => {});
}

export function currentDatabaseName(): string {
  return dbName;
}

export function db(): Promise<IDBPDatabase<WorkoutDB>> {
  dbPromise ??= openDB<WorkoutDB>(dbName, DB_VERSION, {
    upgrade(database) {
      database.createObjectStore("configCache");
      const sessions = database.createObjectStore("workoutSessions", { keyPath: "id" });
      sessions.createIndex("completedAt", "completedAt");
      database.createObjectStore("activeWorkout");
      database.createObjectStore("appState");
      database.createObjectStore("syncQueue", { keyPath: "sessionId" });
    },
  });
  return dbPromise;
}

/** Test hook: close and forget the connection so a fresh database can be opened. */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = undefined;
  dbName = "kinetic-workout";
}

// --- config cache -----------------------------------------------------------

export async function getCachedConfig(): Promise<CachedConfig | undefined> {
  return (await db()).get("configCache", "config");
}

export async function putCachedConfig(config: CachedConfig): Promise<void> {
  await (await db()).put("configCache", config, "config");
}

// --- active workout ---------------------------------------------------------

export async function getActiveSession(): Promise<WorkoutSession | undefined> {
  return (await (await db()).get("activeWorkout", "session")) as WorkoutSession | undefined;
}

export async function putActiveSession(session: WorkoutSession): Promise<void> {
  await (await db()).put("activeWorkout", session, "session");
}

export async function getRestTimer(): Promise<RestTimerState | undefined> {
  return (await (await db()).get("activeWorkout", "restTimer")) as RestTimerState | undefined;
}

export async function putRestTimer(timer: RestTimerState | undefined): Promise<void> {
  const database = await db();
  if (timer) await database.put("activeWorkout", timer, "restTimer");
  else await database.delete("activeWorkout", "restTimer");
}

export async function getIntervalTimer(): Promise<IntervalTimerState | undefined> {
  return (await (await db()).get("activeWorkout", "intervalTimer")) as IntervalTimerState | undefined;
}

export async function putIntervalTimer(timer: IntervalTimerState | undefined): Promise<void> {
  const database = await db();
  if (timer) await database.put("activeWorkout", timer, "intervalTimer");
  else await database.delete("activeWorkout", "intervalTimer");
}

export async function clearActiveWorkout(): Promise<void> {
  await (await db()).clear("activeWorkout");
}

/**
 * Atomically moves a finished session into history, clears active state and queues it for future sync.
 * If anything fails, the active workout is left untouched.
 */
export async function commitCompletedSession(session: WorkoutSession): Promise<void> {
  const database = await db();
  const tx = database.transaction(["workoutSessions", "activeWorkout", "syncQueue"], "readwrite");
  await Promise.all([
    tx.objectStore("workoutSessions").put(session),
    tx.objectStore("activeWorkout").clear(),
    tx.objectStore("syncQueue").put({ sessionId: session.id, queuedAt: new Date().toISOString() }),
    tx.done,
  ]);
}

// --- history ----------------------------------------------------------------

/** Completed sessions, newest first. */
export async function listSessions(limit?: number): Promise<WorkoutSession[]> {
  const database = await db();
  const out: WorkoutSession[] = [];
  let cursor = await database.transaction("workoutSessions").store.index("completedAt").openCursor(null, "prev");
  while (cursor && (limit === undefined || out.length < limit)) {
    if (cursor.value.status === "completed") out.push(cursor.value);
    cursor = await cursor.continue();
  }
  return out;
}

export async function getSession(id: string): Promise<WorkoutSession | undefined> {
  return (await db()).get("workoutSessions", id);
}

/** Idempotent merge by session ID: existing sessions are never duplicated or overwritten. */
export async function importSessions(sessions: WorkoutSession[]): Promise<{ added: number; skipped: number }> {
  const database = await db();
  const tx = database.transaction("workoutSessions", "readwrite");
  let added = 0;
  let skipped = 0;
  for (const s of sessions) {
    if (await tx.store.get(s.id)) {
      skipped++;
      continue;
    }
    await tx.store.put(s);
    added++;
  }
  await tx.done;
  return { added, skipped };
}

// --- app state --------------------------------------------------------------

export async function getAppState<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get("appState", key)) as T | undefined;
}

export async function setAppState<T>(key: string, value: T): Promise<void> {
  await (await db()).put("appState", value, key);
}

// --- sync queue -------------------------------------------------------------

export async function listSyncQueue(): Promise<SyncQueueItem[]> {
  return (await db()).getAll("syncQueue");
}

export async function removeFromSyncQueue(sessionIds: string[]): Promise<void> {
  const tx = (await db()).transaction("syncQueue", "readwrite");
  await Promise.all([...sessionIds.map((id) => tx.store.delete(id)), tx.done]);
}

export async function enqueueSessions(sessionIds: string[]): Promise<void> {
  const tx = (await db()).transaction("syncQueue", "readwrite");
  const queuedAt = new Date().toISOString();
  await Promise.all([...sessionIds.map((sessionId) => tx.store.put({ sessionId, queuedAt })), tx.done]);
}

/** Queues every completed session for upload (first sync on a device). */
export async function enqueueAllSessions(): Promise<number> {
  const database = await db();
  const ids = (await database.getAll("workoutSessions")).filter((s) => s.status === "completed").map((s) => s.id);
  const tx = database.transaction("syncQueue", "readwrite");
  const queuedAt = new Date().toISOString();
  await Promise.all([...ids.map((sessionId) => tx.store.put({ sessionId, queuedAt })), tx.done]);
  return ids.length;
}
