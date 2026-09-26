import { canonicalExercise, canonicalSchedule, canonicalWorkout } from "../domain/config";
import { emptySchedule } from "../domain/schedule";
import type { Config, Exercise, WeeklySchedule, Workout } from "../domain/types";
import { getCachedConfig, putCachedConfig } from "../storage/indexedDb";
import type { ConfigRepository } from "./configRepository";

/**
 * Browser-only configuration edits, used when no GitHub connection is configured.
 * Saved changes are flagged as unpublished so they take priority over the deployed JSON
 * until they are published to GitHub, exported, or discarded.
 */
export class LocalConfigRepository implements ConfigRepository {
  readonly kind = "local";
  readonly writable = true;

  private async current(): Promise<Config> {
    const cached = await getCachedConfig();
    return cached ?? { exercises: [], workouts: [], schedule: emptySchedule() };
  }

  private async patch(update: Partial<Config>): Promise<void> {
    const base = await this.current();
    await putCachedConfig({
      ...base,
      ...update,
      savedAt: new Date().toISOString(),
      source: "local",
      localEdits: true,
    });
  }

  async loadExercises() {
    return (await this.current()).exercises;
  }
  async loadWorkouts() {
    return (await this.current()).workouts;
  }
  async loadSchedule() {
    return (await this.current()).schedule;
  }

  async saveExercises(items: Exercise[]) {
    await this.patch({ exercises: items.map(canonicalExercise) });
  }
  async saveWorkouts(items: Workout[]) {
    await this.patch({ workouts: items.map(canonicalWorkout) });
  }
  async saveSchedule(schedule: WeeklySchedule) {
    await this.patch({ schedule: canonicalSchedule(schedule) });
  }
}
