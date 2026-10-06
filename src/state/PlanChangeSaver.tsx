import { useCallback, useEffect, useRef } from "react";
import { applyPlanChanges, type PlanChange } from "../domain/planChanges";
import { onPlanChangesQueued } from "../services/syncEvents";
import { getPendingPlanChanges, removePendingPlanChanges } from "../storage/indexedDb";
import { useConfig, ValidationFailed } from "./ConfigContext";

/**
 * Saves plan changes queued by finished workouts (target edits on added exercises, "keep it in this
 * workout"). Runs when the plan loads or reloads, right after a workout is finished, and when the device
 * comes back online, so a workout finished offline at the gym still updates the plan later.
 */
export function PlanChangeSaver() {
  // `workouts` re-runs it after the plan reloads (e.g. after a save conflict).
  const { status, workouts, updateWorkout } = useConfig();
  const running = useRef(false);
  const again = useRef(false);

  const flush = useCallback(async (): Promise<void> => {
    if (status !== "ready") return;
    if (running.current) {
      again.current = true; // queued while saving: go round once more
      return;
    }
    running.current = true;
    again.current = false;
    try {
      const queued = await getPendingPlanChanges();
      const byWorkout = new Map<string, PlanChange[]>();
      for (const c of queued) byWorkout.set(c.workoutId, [...(byWorkout.get(c.workoutId) ?? []), c]);
      for (const [workoutId, changes] of byWorkout) {
        try {
          // Nothing to save (the workout was deleted, or the changes are already in it) also clears them.
          await updateWorkout(workoutId, (w) => applyPlanChanges(w, changes));
          await removePendingPlanChanges(changes);
        } catch (e) {
          // Invalid now (e.g. the exercise was deleted): it can never be saved. Otherwise (offline, or a
          // conflict, which reloads the plan and so runs this again) keep it for the next try.
          if (e instanceof ValidationFailed) await removePendingPlanChanges(changes);
        }
      }
    } catch {
      /* storage unavailable: try again next time */
    } finally {
      running.current = false;
    }
    if (again.current) return flush();
  }, [status, workouts, updateWorkout]);

  useEffect(() => {
    void flush();
  }, [flush]);

  useEffect(() => {
    const run = () => void flush();
    const off = onPlanChangesQueued(run);
    window.addEventListener("online", run);
    return () => {
      off();
      window.removeEventListener("online", run);
    };
  }, [flush]);

  return null;
}
