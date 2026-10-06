import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { canonicalExercise, canonicalSchedule, canonicalWorkout } from "../domain/config";
import { emptySchedule, removeWorkoutFromSchedule } from "../domain/schedule";
import type { Config, Exercise, WeeklySchedule, Workout } from "../domain/types";
import {
  validateExercise,
  validateSchedule,
  validateWorkout,
  workoutsUsingExercise,
  type ValidationError,
} from "../domain/validation";
import { ConflictError, type ConfigRepository } from "../repositories/configRepository";
import { LocalConfigRepository } from "../repositories/localConfigRepository";
import {
  discardLocalEdits,
  loadConfig,
  publishLocalEdits,
  remoteRepository,
  updateCache,
  type LoadedConfig,
} from "../services/configService";
import type { ConfigSource } from "../storage/indexedDb";

export class ValidationFailed extends Error {
  constructor(public readonly errors: ValidationError[]) {
    super(errors.map((e) => e.message).join("; "));
    this.name = "ValidationFailed";
  }
}

type Status = "loading" | "ready" | "error";

interface ConfigContextValue extends Config {
  status: Status;
  error?: string;
  offlineError?: string;
  source?: ConfigSource;
  localEdits: boolean;
  /** Where saves go right now. */
  saveTarget: "github" | "local";
  githubConnected: boolean;
  exerciseById: (id: string) => Exercise | undefined;
  workoutById: (id: string) => Workout | undefined;
  reload: () => Promise<void>;
  /** Call after GitHub settings change. */
  reconnect: () => Promise<void>;
  saveExercise: (e: Exercise) => Promise<void>;
  deleteExercise: (id: string) => Promise<void>;
  saveWorkout: (w: Workout) => Promise<void>;
  /** Changes a workout starting from the latest copy of the plan. Resolves false when there was nothing to save. */
  updateWorkout: (id: string, fn: (w: Workout) => Workout) => Promise<boolean>;
  deleteWorkout: (id: string) => Promise<void>;
  saveSchedule: (s: WeeklySchedule) => Promise<void>;
  publishLocal: () => Promise<void>;
  discardLocal: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  const i = items.findIndex((x) => x.id === item.id);
  if (i === -1) return [...items, item];
  const next = [...items];
  next[i] = item;
  return next;
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [remote, setRemote] = useState<ConfigRepository>(() => remoteRepository());
  const [state, setState] = useState<LoadedConfig | undefined>();
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string>();
  // Saves read the latest state through a ref so rapid consecutive saves never use stale data.
  const stateRef = useRef<LoadedConfig | undefined>(undefined);
  stateRef.current = state;

  const load = useCallback(async (repo: ConfigRepository) => {
    try {
      const loaded = await loadConfig(repo);
      setState(loaded);
      setStatus("ready");
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus((s) => (s === "ready" ? s : "error"));
    }
  }, []);

  useEffect(() => {
    load(remote);
  }, [load, remote]);

  const reload = useCallback(() => load(remote), [load, remote]);
  const reconnect = useCallback(async () => setRemote(remoteRepository()), []);

  const writable = useCallback((): ConfigRepository => {
    // Unpublished local edits keep accumulating locally until published or discarded.
    if (stateRef.current?.localEdits || !remote.writable) return new LocalConfigRepository();
    return remote;
  }, [remote]);

  const commit = useCallback(
    async (next: Config, file: keyof Config, message: string) => {
      const repo = writable();
      try {
        if (file === "exercises") await repo.saveExercises(next.exercises, message);
        else if (file === "workouts") await repo.saveWorkouts(next.workouts, message);
        else await repo.saveSchedule(next.schedule, message);
      } catch (e) {
        if (e instanceof ConflictError) await reload();
        throw e;
      }
      const local = repo.kind === "local";
      const source: ConfigSource = local ? "local" : "github";
      await updateCache(next, source, local).catch(() => {});
      setState({ ...next, source, localEdits: local });
    },
    [writable, reload],
  );

  const current = (): Config => {
    const s = stateRef.current;
    return s ?? { exercises: [], workouts: [], schedule: emptySchedule() };
  };

  const saveExercise = useCallback(
    async (e: Exercise) => {
      const cfg = current();
      const exercise = canonicalExercise(e);
      const errors = validateExercise(exercise);
      if (errors.length) throw new ValidationFailed(errors);
      const isNew = !cfg.exercises.some((x) => x.id === exercise.id);
      await commit({ ...cfg, exercises: upsert(cfg.exercises, exercise) }, "exercises", `${isNew ? "Add" : "Update"} exercise: ${exercise.name}`);
    },
    [commit],
  );

  const deleteExercise = useCallback(
    async (id: string) => {
      const cfg = current();
      const users = workoutsUsingExercise(cfg.workouts, id);
      if (users.length) {
        throw new ValidationFailed([
          { path: "id", message: `Exercise is used by ${users.length} workout${users.length > 1 ? "s" : ""} and cannot be deleted.` },
        ]);
      }
      const name = cfg.exercises.find((e) => e.id === id)?.name ?? id;
      await commit({ ...cfg, exercises: cfg.exercises.filter((e) => e.id !== id) }, "exercises", `Delete exercise: ${name}`);
    },
    [commit],
  );

  const saveWorkout = useCallback(
    async (w: Workout) => {
      const cfg = current();
      const workout = canonicalWorkout(w);
      const errors = validateWorkout(workout, cfg.exercises);
      if (errors.length) throw new ValidationFailed(errors);
      const isNew = !cfg.workouts.some((x) => x.id === workout.id);
      await commit({ ...cfg, workouts: upsert(cfg.workouts, workout) }, "workouts", `${isNew ? "Add" : "Update"} workout: ${workout.name}`);
    },
    [commit],
  );

  const updateWorkout = useCallback(
    async (id: string, fn: (w: Workout) => Workout) => {
      const workout = current().workouts.find((w) => w.id === id);
      const next = workout && fn(workout);
      if (!workout || next === workout) return false;
      await saveWorkout(next!);
      return true;
    },
    [saveWorkout],
  );

  const deleteWorkout = useCallback(
    async (id: string) => {
      const cfg = current();
      const name = cfg.workouts.find((w) => w.id === id)?.name ?? id;
      const schedule = removeWorkoutFromSchedule(cfg.schedule, id);
      // Unschedule first so the schedule never references a missing workout.
      if (JSON.stringify(schedule) !== JSON.stringify(cfg.schedule)) {
        await commit({ ...cfg, schedule }, "schedule", `Unschedule workout: ${name}`);
      }
      const after = current();
      await commit({ ...after, workouts: after.workouts.filter((w) => w.id !== id) }, "workouts", `Delete workout: ${name}`);
    },
    [commit],
  );

  const saveSchedule = useCallback(
    async (s: WeeklySchedule) => {
      const cfg = current();
      const schedule = canonicalSchedule(s);
      const errors = validateSchedule(schedule, cfg.workouts);
      if (errors.length) throw new ValidationFailed(errors);
      await commit({ ...cfg, schedule }, "schedule", "Update weekly schedule");
    },
    [commit],
  );

  const publishLocal = useCallback(async () => {
    const cfg = current();
    await publishLocalEdits(cfg);
    const repo = remoteRepository();
    setRemote(repo);
  }, []);

  const discardLocal = useCallback(async () => {
    await discardLocalEdits();
    await load(remote);
  }, [load, remote]);

  const value = useMemo<ConfigContextValue>(() => {
    const cfg = state ?? { exercises: [], workouts: [], schedule: emptySchedule() };
    const exMap = new Map(cfg.exercises.map((e) => [e.id, e]));
    const wMap = new Map(cfg.workouts.map((w) => [w.id, w]));
    return {
      exercises: cfg.exercises,
      workouts: cfg.workouts,
      schedule: cfg.schedule,
      status,
      error,
      offlineError: state?.offlineError,
      source: state?.source,
      localEdits: state?.localEdits ?? false,
      saveTarget: state?.localEdits || !remote.writable ? "local" : "github",
      githubConnected: remote.kind === "github",
      exerciseById: (id) => exMap.get(id),
      workoutById: (id) => wMap.get(id),
      reload,
      reconnect,
      saveExercise,
      deleteExercise,
      saveWorkout,
      updateWorkout,
      deleteWorkout,
      saveSchedule,
      publishLocal,
      discardLocal,
    };
  }, [state, status, error, remote, reload, reconnect, saveExercise, deleteExercise, saveWorkout, updateWorkout, deleteWorkout, saveSchedule, publishLocal, discardLocal]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig must be used inside ConfigProvider");
  return ctx;
}
