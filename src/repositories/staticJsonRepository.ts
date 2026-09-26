import { parseExercises, parseSchedule, parseWorkouts } from "../domain/config";
import { ReadOnlyError, type ConfigRepository, type ConfigFile } from "./configRepository";

/** Reads the JSON files deployed alongside the site (public/data → <base>/data). */
export class StaticJsonRepository implements ConfigRepository {
  readonly kind = "static";
  readonly writable = false;

  constructor(private readonly baseUrl: string = `${import.meta.env.BASE_URL}data/`) {}

  private async fetchJson(file: ConfigFile): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${file}`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${file}: HTTP ${res.status}`);
    return res.json();
  }

  async loadExercises() {
    return parseExercises(await this.fetchJson("exercises.json"));
  }
  async loadWorkouts() {
    return parseWorkouts(await this.fetchJson("workouts.json"));
  }
  async loadSchedule() {
    return parseSchedule(await this.fetchJson("schedule.json"));
  }

  async saveExercises(): Promise<void> {
    throw new ReadOnlyError();
  }
  async saveWorkouts(): Promise<void> {
    throw new ReadOnlyError();
  }
  async saveSchedule(): Promise<void> {
    throw new ReadOnlyError();
  }
}
