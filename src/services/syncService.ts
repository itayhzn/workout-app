import type { WorkoutSession } from "../domain/types";
import type { WeightUnit } from "../domain/units";
import { ConflictError } from "../repositories/configRepository";
import { GitHubContents } from "../repositories/githubContents";
import { personDir } from "../repositories/githubRepository";
import { getWeightUnit, setWeightUnit } from "../state/units";
import { notifyHistoryChanged } from "../state/history";
import {
  enqueueAllSessions,
  getAppState,
  getSession,
  importSessions,
  listSyncQueue,
  removeFromSyncQueue,
  setAppState,
} from "../storage/indexedDb";
import { looksLikeSession } from "./historyService";
import { loadTimerSound, markPrefsChanged, prefsUpdatedAt, saveTimerSound, type Connection } from "./settings";

// Cross-device sync through the private data repo (see workout-data/README.md), per person:
//   people/<id>/history/YYYY-MM.json  completed sessions per month, merged by id (sessions are immutable)
//   people/<id>/preferences.json      that person's preferences, last writer wins
// IndexedDB stays the device's source of truth; sync only ever adds, never deletes or overwrites.

const historyDir = (personId: string) => `${personDir(personId)}/history`;
const prefsFile = (personId: string) => `${personDir(personId)}/preferences.json`;
const STATE_KEY = "syncState";
const MAX_ATTEMPTS = 3;

export interface SyncState {
  /** Last seen SHA per month file, so unchanged months aren't downloaded again. */
  monthShas: Record<string, string>;
  lastSyncAt?: string;
  /** Set once this device has queued its pre-existing history for upload. */
  initialUploadDone?: boolean;
}

export interface SyncedPrefs {
  weightUnit: WeightUnit;
  timerSound: boolean;
  updatedAt: string;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  prefs: "pushed" | "pulled" | "unchanged";
  at: string;
}

/** Month bucket for a session: UTC year-month of completion, identical on every device. */
export function monthOf(s: WorkoutSession): string {
  return (s.completedAt ?? s.startedAt).slice(0, 7);
}

/** Union by id (existing copies win — sessions never change), sorted by completion time. */
export function mergeSessions(base: WorkoutSession[], extra: WorkoutSession[]): { merged: WorkoutSession[]; added: number } {
  const byId = new Map(base.map((s) => [s.id, s]));
  let added = 0;
  for (const s of extra) {
    if (byId.has(s.id)) continue;
    byId.set(s.id, s);
    added++;
  }
  const merged = [...byId.values()].sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
  return { merged, added };
}

export function syncClient(connection: Connection, fetchImpl?: typeof fetch): GitHubContents {
  return new GitHubContents(connection, fetchImpl);
}

export async function loadSyncState(): Promise<SyncState> {
  return (await getAppState<SyncState>(STATE_KEY)) ?? { monthShas: {} };
}

async function readMonth(client: GitHubContents, personId: string, month: string) {
  const file = await client.readJson<unknown>(`${historyDir(personId)}/${month}.json`);
  const sessions = Array.isArray(file?.data) ? file.data.filter(looksLikeSession) : [];
  return { sessions, sha: file?.sha };
}

/** Uploads local sessions for one month, merging with whatever other devices already wrote. */
async function pushMonth(client: GitHubContents, personId: string, month: string, local: WorkoutSession[], state: SyncState): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    const remote = await readMonth(client, personId, month);
    // Remote sessions from other devices come along for free.
    const imported = await importSessions(remote.sessions);
    const { merged, added } = mergeSessions(remote.sessions, local);
    if (added === 0) {
      if (remote.sha) state.monthShas[month] = remote.sha;
      return imported.added;
    }
    try {
      const sha = await client.writeJson(
        `${historyDir(personId)}/${month}.json`,
        merged,
        remote.sha,
        `Sync ${added} workout${added === 1 ? "" : "s"} (${personId}, ${month})`,
      );
      if (sha) state.monthShas[month] = sha;
      return imported.added;
    } catch (e) {
      // Another device wrote this month in between: re-read, re-merge, retry.
      if (!(e instanceof ConflictError) || attempt >= MAX_ATTEMPTS) throw e;
    }
  }
}

async function syncPrefs(client: GitHubContents, personId: string): Promise<SyncResult["prefs"]> {
  const remote = await client.readJson<SyncedPrefs>(prefsFile(personId));
  const localAt = prefsUpdatedAt();
  const local: SyncedPrefs = { weightUnit: getWeightUnit(), timerSound: loadTimerSound(), updatedAt: localAt ?? "" };
  const remoteAt = remote?.data.updatedAt ?? "";
  if (remote && remoteAt > (localAt ?? "")) {
    const p = remote.data;
    if (p.weightUnit === "kg" || p.weightUnit === "lbs") setWeightUnit(p.weightUnit, { fromSync: true });
    if (typeof p.timerSound === "boolean") saveTimerSound(p.timerSound, { fromSync: true });
    markPrefsChanged(remoteAt);
    return "pulled";
  }
  if (localAt && localAt > remoteAt) {
    try {
      await client.writeJson(prefsFile(personId), local, remote?.sha, `Sync preferences (${personId})`);
      return "pushed";
    } catch (e) {
      if (e instanceof ConflictError) return "unchanged"; // retried on the next sync
      throw e;
    }
  }
  return "unchanged";
}

/**
 * One full sync: upload queued sessions, download months changed by other devices, reconcile preferences.
 * Safe to interrupt at any point: the queue is only cleared after a successful upload, and imports are idempotent.
 */
export async function runSync(client: GitHubContents, personId: string): Promise<SyncResult> {
  const state = await loadSyncState();
  if (!state.initialUploadDone) {
    await enqueueAllSessions();
    state.initialUploadDone = true;
    await setAppState(STATE_KEY, state);
  }

  // 1. Push
  let pushed = 0;
  let pulled = 0;
  const queue = await listSyncQueue();
  const byMonth = new Map<string, WorkoutSession[]>();
  const missing: string[] = [];
  for (const item of queue) {
    const s = await getSession(item.sessionId);
    if (!s) {
      missing.push(item.sessionId);
      continue;
    }
    byMonth.set(monthOf(s), [...(byMonth.get(monthOf(s)) ?? []), s]);
  }
  if (missing.length) await removeFromSyncQueue(missing);
  for (const [month, sessions] of byMonth) {
    pulled += await pushMonth(client, personId, month, sessions, state);
    await removeFromSyncQueue(sessions.map((s) => s.id));
    pushed += sessions.length;
    await setAppState(STATE_KEY, state);
  }

  // 2. Pull months that changed since we last saw them
  for (const entry of await client.list(historyDir(personId))) {
    const m = entry.name.match(/^(\d{4}-\d{2})\.json$/);
    if (!m || state.monthShas[m[1]] === entry.sha) continue;
    const remote = await readMonth(client, personId, m[1]);
    pulled += (await importSessions(remote.sessions)).added;
    if (remote.sha) state.monthShas[m[1]] = remote.sha;
  }

  // 3. Preferences
  const prefs = await syncPrefs(client, personId);

  const at = new Date().toISOString();
  state.lastSyncAt = at;
  await setAppState(STATE_KEY, state);
  if (pulled) notifyHistoryChanged();
  return { pushed, pulled, prefs, at };
}
