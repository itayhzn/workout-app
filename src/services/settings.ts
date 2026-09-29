import { notifyPersonChanged, notifySettingsChanged } from "./syncEvents";

// Small per-device settings live in localStorage; everything else is IndexedDB.

const CONNECTION_KEY = "kinetic.connection";
const LEGACY_GITHUB_KEY = "kinetic.github";
const PERSON_KEY = "kinetic.person";
const DB_NAMES_KEY = "kinetic.dbNames";
const MODE_KEY = "kinetic.mode";

function read<T>(key: string): T | undefined {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T; // older versions stored some values as plain strings
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); preferences are best-effort.
  }
}

// ---------------------------------------------------------------------------
// Connection: the shared private data repo (plans, history, preferences for everyone).
// ---------------------------------------------------------------------------

export interface Connection {
  owner: string;
  /** Private data repository, e.g. "workout-data". */
  repo: string;
  branch: string;
  /** Fine-grained token with Contents read/write on the data repo. Stored only in this browser. */
  token: string;
}

export const DEFAULT_CONNECTION: Omit<Connection, "token"> = { owner: "itayhzn", repo: "workout-data", branch: "main" };

export function loadConnection(): Connection | undefined {
  const c = read<Connection>(CONNECTION_KEY);
  if (c?.token) return c;
  // Settings saved by the single-user version: the sync repo becomes the data repo.
  const legacy = read<{ owner: string; branch?: string; syncRepo?: string; token: string }>(LEGACY_GITHUB_KEY);
  if (legacy?.token) return { owner: legacy.owner, repo: legacy.syncRepo || DEFAULT_CONNECTION.repo, branch: legacy.branch || "main", token: legacy.token };
  return undefined;
}

export function saveConnection(connection: Connection | undefined): void {
  write(CONNECTION_KEY, connection);
  write(LEGACY_GITHUB_KEY, undefined);
  if (!connection) setActivePersonId(undefined);
  notifySettingsChanged();
}

/** Owner inferred from a *.github.io URL, falling back to this project's owner. */
export function suggestedConnection(): Omit<Connection, "token"> {
  const m = window.location.hostname.match(/^([^.]+)\.github\.io$/);
  return m ? { ...DEFAULT_CONNECTION, owner: m[1] } : DEFAULT_CONNECTION;
}

// ---------------------------------------------------------------------------
// Active person on this device, and where each person's local data lives.
// ---------------------------------------------------------------------------

export function getActivePersonId(): string | undefined {
  return read<string>(PERSON_KEY);
}

export function setActivePersonId(id: string | undefined): void {
  write(PERSON_KEY, id);
  notifyPersonChanged();
}

const BASE_DB = "kinetic-workout";

/**
 * IndexedDB database for a person on this device. The first person chosen on a device inherits the
 * database that already exists (history logged before connecting); later people get their own.
 */
export function dbNameForPerson(personId: string | undefined): string {
  if (!personId) return BASE_DB;
  const names = read<Record<string, string>>(DB_NAMES_KEY) ?? {};
  if (!names[personId]) {
    const baseTaken = Object.values(names).includes(BASE_DB);
    names[personId] = baseTaken ? `${BASE_DB}--${personId}` : BASE_DB;
    write(DB_NAMES_KEY, names);
  }
  return names[personId];
}

/** Key for a per-person preference; reads fall back to the device-wide key used before people existed. */
function personKey(name: string): string {
  const person = getActivePersonId();
  return person ? `kinetic.p.${person}.${name}` : `kinetic.${name}`;
}

export function readPersonPref<T>(name: string): T | undefined {
  return read<T>(personKey(name)) ?? read<T>(`kinetic.${name}`);
}

export function writePersonPref(name: string, value: unknown): void {
  write(personKey(name), value);
}

// Preferences shared across a person's devices use last-writer-wins, so every local change is timestamped.

export function markPrefsChanged(at: string = new Date().toISOString()): void {
  writePersonPref("prefsUpdatedAt", at);
}

export function prefsUpdatedAt(): string | undefined {
  return read<string>(personKey("prefsUpdatedAt"));
}

export type AppMode = "workout" | "manage";

export function loadModePreference(): AppMode | undefined {
  return read<AppMode>(MODE_KEY);
}

export function saveModePreference(mode: AppMode): void {
  write(MODE_KEY, mode);
}

/** Heuristic only (no UA sniffing): touch-first or narrow screens default to workout mode. */
export function detectMode(): AppMode {
  const mq = (q: string) => typeof window.matchMedia === "function" && window.matchMedia(q).matches;
  const coarse = mq("(pointer: coarse)") || mq("(hover: none)");
  return coarse || window.innerWidth < 768 ? "workout" : "manage";
}

export function preferredMode(): AppMode {
  return loadModePreference() ?? detectMode();
}

export function loadTimerSound(): boolean {
  return readPersonPref<boolean>("timerSound") ?? true;
}

export function saveTimerSound(on: boolean, opts: { fromSync?: boolean } = {}): void {
  writePersonPref("timerSound", on);
  if (!opts.fromSync) markPrefsChanged();
}

export function clearModePreference(): void {
  write(MODE_KEY, undefined);
}
