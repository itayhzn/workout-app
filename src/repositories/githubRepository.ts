import {
  canonicalExercise,
  canonicalSchedule,
  canonicalWorkout,
  parseExercises,
  parseSchedule,
  parseWorkouts,
  toJson,
} from "../domain/config";
import type { Exercise, WeeklySchedule, Workout } from "../domain/types";
import { ConflictError, type ConfigFile, type ConfigRepository } from "./configRepository";

export interface GitHubSettings {
  owner: string;
  repo: string;
  branch: string;
  /** Repository folder holding the config JSON (Vite serves public/ at the site root). */
  dataPath: string;
  /** Fine-grained token with Contents read/write on this repo. Stored only in this browser. */
  token: string;
}

export const DEFAULT_GITHUB_SETTINGS: Omit<GitHubSettings, "token"> = {
  owner: "itayhzn",
  repo: "workout-app",
  branch: "main",
  dataPath: "public/data",
};

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/**
 * Reads and writes config via the GitHub Contents API. Every write sends the SHA from the last read,
 * so GitHub rejects it if the file changed in the meantime (surfaced as ConflictError).
 */
export class GitHubRepository implements ConfigRepository {
  readonly kind = "github";
  readonly writable = true;
  private readonly shas = new Map<ConfigFile, string>();

  constructor(
    private readonly settings: GitHubSettings,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  private url(file: ConfigFile): string {
    const { owner, repo, dataPath } = this.settings;
    const path = [dataPath.replace(/^\/+|\/+$/g, ""), file].filter(Boolean).join("/");
    return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
  }

  private headers(): HeadersInit {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.settings.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  private async read(file: ConfigFile): Promise<unknown> {
    const res = await this.fetchImpl(`${this.url(file)}?ref=${encodeURIComponent(this.settings.branch)}`, {
      headers: this.headers(),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`GitHub: failed to read ${file} (HTTP ${res.status})`);
    const body = (await res.json()) as { content: string; sha: string };
    this.shas.set(file, body.sha);
    return JSON.parse(decodeBase64Utf8(body.content));
  }

  private async write(file: ConfigFile, data: unknown, message: string): Promise<void> {
    const sha = this.shas.get(file);
    const res = await this.fetchImpl(this.url(file), {
      method: "PUT",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: encodeBase64Utf8(toJson(data)),
        branch: this.settings.branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (res.status === 409 || (res.status === 422 && !sha)) throw new ConflictError(file);
    if (!res.ok) throw new Error(`GitHub: failed to save ${file} (HTTP ${res.status})`);
    const body = (await res.json()) as { content?: { sha?: string } };
    if (body.content?.sha) this.shas.set(file, body.content.sha);
  }

  /** Verifies the token can see the repository. */
  async testConnection(): Promise<void> {
    const { owner, repo } = this.settings;
    const res = await this.fetchImpl(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { headers: this.headers() },
    );
    if (res.status === 401) throw new Error("GitHub rejected the token (401).");
    if (res.status === 404) throw new Error("Repository not found, or the token cannot access it (404).");
    if (!res.ok) throw new Error(`GitHub error (HTTP ${res.status}).`);
    const body = (await res.json()) as { permissions?: { push?: boolean } };
    if (body.permissions && !body.permissions.push) throw new Error("Token has read-only access to this repository.");
  }

  async loadExercises() {
    return parseExercises(await this.read("exercises.json"));
  }
  async loadWorkouts() {
    return parseWorkouts(await this.read("workouts.json"));
  }
  async loadSchedule() {
    return parseSchedule(await this.read("schedule.json"));
  }

  async saveExercises(items: Exercise[], message = "Update exercises") {
    await this.write("exercises.json", items.map(canonicalExercise), message);
  }
  async saveWorkouts(items: Workout[], message = "Update workouts") {
    await this.write("workouts.json", items.map(canonicalWorkout), message);
  }
  async saveSchedule(schedule: WeeklySchedule, message = "Update schedule") {
    await this.write("schedule.json", canonicalSchedule(schedule), message);
  }
}
