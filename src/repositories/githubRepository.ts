import {
  canonicalExercise,
  canonicalSchedule,
  canonicalWorkout,
  parseExercises,
  parseSchedule,
  parseWorkouts,
} from "../domain/config";
import type { Exercise, WeeklySchedule, Workout } from "../domain/types";
import type { Connection } from "../services/settings";
import type { ConfigFile, ConfigRepository } from "./configRepository";
import { GitHubContents } from "./githubContents";

/** Folder of a person inside the data repo. */
export function personDir(personId: string): string {
  return `people/${personId}`;
}

export function contentsClient(connection: Connection, fetchImpl?: typeof fetch): GitHubContents {
  return new GitHubContents(connection, fetchImpl);
}

/**
 * One person's plan (people/<id>/plan/*.json in the data repo) via the Contents API, with SHA checks
 * so a stale write surfaces as ConflictError instead of overwriting someone else's edit.
 */
export class GitHubRepository implements ConfigRepository {
  readonly kind = "github";
  readonly writable = true;
  private readonly shas = new Map<ConfigFile, string>();
  private readonly client: GitHubContents;

  constructor(
    connection: Connection,
    private readonly personId: string,
    fetchImpl?: typeof fetch,
  ) {
    this.client = contentsClient(connection, fetchImpl);
  }

  private path(file: ConfigFile): string {
    return `${personDir(this.personId)}/plan/${file}`;
  }

  private async read(file: ConfigFile): Promise<unknown> {
    const got = await this.client.readJson<unknown>(this.path(file));
    if (!got) throw new Error(`No plan found at ${this.path(file)}`);
    this.shas.set(file, got.sha);
    return got.data;
  }

  private async write(file: ConfigFile, data: unknown, message: string): Promise<void> {
    const sha = await this.client.writeJson(this.path(file), data, this.shas.get(file), message);
    if (sha) this.shas.set(file, sha);
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
    await this.write("exercises.json", items.map(canonicalExercise), `${message} [${this.personId}]`);
  }
  async saveWorkouts(items: Workout[], message = "Update workouts") {
    await this.write("workouts.json", items.map(canonicalWorkout), `${message} [${this.personId}]`);
  }
  async saveSchedule(schedule: WeeklySchedule, message = "Update schedule") {
    await this.write("schedule.json", canonicalSchedule(schedule), `${message} [${this.personId}]`);
  }
}
