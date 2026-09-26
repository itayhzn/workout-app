import { DEFAULT_GITHUB_SETTINGS, type GitHubSettings } from "../repositories/githubRepository";

// Small per-device UI preferences live in localStorage; everything else is IndexedDB.

const GITHUB_KEY = "kinetic.github";
const MODE_KEY = "kinetic.mode";
const SOUND_KEY = "kinetic.timerSound";

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
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

export function loadGitHubSettings(): GitHubSettings | undefined {
  const s = read<GitHubSettings>(GITHUB_KEY);
  return s?.token ? s : undefined;
}

export function saveGitHubSettings(settings: GitHubSettings | undefined): void {
  write(GITHUB_KEY, settings);
}

/** Owner/repo inferred from a *.github.io URL, falling back to this project's repository. */
export function suggestedGitHubSettings(): Omit<GitHubSettings, "token"> {
  const { hostname, pathname } = window.location;
  const m = hostname.match(/^([^.]+)\.github\.io$/);
  const repo = pathname.split("/").filter(Boolean)[0];
  if (m && repo) return { ...DEFAULT_GITHUB_SETTINGS, owner: m[1], repo };
  return DEFAULT_GITHUB_SETTINGS;
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
  return read<boolean>(SOUND_KEY) ?? true;
}

export function saveTimerSound(on: boolean): void {
  write(SOUND_KEY, on);
}

export function clearModePreference(): void {
  write(MODE_KEY, undefined);
}
