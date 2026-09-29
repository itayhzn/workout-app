import { canonicalExercise, canonicalSchedule, canonicalWorkout, toJson } from "../domain/config";
import type { Config } from "../domain/types";
import { ReadOnlyError, type ConfigRepository } from "../repositories/configRepository";
import { GitHubRepository } from "../repositories/githubRepository";
import { LocalConfigRepository } from "../repositories/localConfigRepository";
import { StaticJsonRepository } from "../repositories/staticJsonRepository";
import { getCachedConfig, putCachedConfig, type ConfigSource } from "../storage/indexedDb";
import { getActivePersonId, loadConnection } from "./settings";

export interface LoadedConfig extends Config {
  source: ConfigSource;
  localEdits: boolean;
  /** Set when the latest config could not be fetched and a cached copy is being used. */
  offlineError?: string;
}

export async function loadAll(repo: ConfigRepository): Promise<Config> {
  const [exercises, workouts, schedule] = await Promise.all([
    repo.loadExercises(),
    repo.loadWorkouts(),
    repo.loadSchedule(),
  ]);
  return { exercises, workouts, schedule };
}

export async function saveAll(repo: ConfigRepository, config: Config, message: string): Promise<void> {
  // Sequential: each GitHub write is its own commit and must not race on the branch head.
  await repo.saveExercises(config.exercises, `${message}: exercises`);
  await repo.saveWorkouts(config.workouts, `${message}: workouts`);
  await repo.saveSchedule(config.schedule, `${message}: schedule`);
}

/** The active person's plan in the data repo when connected; otherwise the starter plan deployed with the site. */
export function remoteRepository(): ConfigRepository {
  const connection = loadConnection();
  const person = getActivePersonId();
  return connection && person ? new GitHubRepository(connection, person) : new StaticJsonRepository();
}

/** Where saves go: GitHub if connected, otherwise this browser. */
export function writableRepository(remote: ConfigRepository): ConfigRepository {
  return remote.writable ? remote : new LocalConfigRepository();
}

async function safeCached() {
  try {
    return await getCachedConfig();
  } catch {
    return undefined;
  }
}

/**
 * Load order:
 * 1. Unpublished local edits (never silently discarded).
 * 2. The remote source (GitHub API if connected, else deployed JSON) — then cached.
 * 3. The cached copy, if the fetch fails (offline). A failure here never blocks an active workout.
 */
export async function loadConfig(remote: ConfigRepository): Promise<LoadedConfig> {
  const cached = await safeCached();
  if (cached?.localEdits) {
    return { exercises: cached.exercises, workouts: cached.workouts, schedule: cached.schedule, source: "local", localEdits: true };
  }
  try {
    const config = await loadAll(remote);
    const source: ConfigSource = remote.kind === "github" ? "github" : "static";
    putCachedConfig({ ...config, savedAt: new Date().toISOString(), source, localEdits: false }).catch(() => {});
    return { ...config, source, localEdits: false };
  } catch (e) {
    const offlineError = e instanceof Error ? e.message : String(e);
    if (cached) {
      return { exercises: cached.exercises, workouts: cached.workouts, schedule: cached.schedule, source: cached.source, localEdits: false, offlineError };
    }
    // A bad or expired GitHub token must never leave the app without a plan: use the deployed copy.
    if (remote.kind === "github") {
      const config = await loadAll(new StaticJsonRepository());
      return { ...config, source: "static", localEdits: false, offlineError };
    }
    throw e;
  }
}

export async function updateCache(config: Config, source: ConfigSource, localEdits: boolean): Promise<void> {
  await putCachedConfig({ ...config, savedAt: new Date().toISOString(), source, localEdits });
}

/** Pushes browser-only edits to GitHub. Loads first so every write carries the current SHA. */
export async function publishLocalEdits(config: Config): Promise<void> {
  const connection = loadConnection();
  const person = getActivePersonId();
  if (!connection || !person) throw new ReadOnlyError();
  const repo = new GitHubRepository(connection, person);
  // Read first so each write carries the current SHA (a missing plan is simply created).
  await loadAll(repo).catch(() => {});
  await saveAll(repo, config, "Publish local edits");
  await updateCache(config, "github", false);
}

export async function discardLocalEdits(): Promise<void> {
  const cached = await getCachedConfig();
  if (cached) await putCachedConfig({ ...cached, localEdits: false });
}

/** Downloads the three config files so they can be committed by hand. */
export function exportConfigFiles(config: Config): void {
  downloadFile("exercises.json", toJson(config.exercises.map(canonicalExercise)));
  downloadFile("workouts.json", toJson(config.workouts.map(canonicalWorkout)));
  downloadFile("schedule.json", toJson(canonicalSchedule(config.schedule)));
}

export function downloadFile(name: string, text: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
