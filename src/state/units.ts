import { useSyncExternalStore } from "react";
import type { WeightUnit } from "../domain/units";
import { markPrefsChanged, readPersonPref, writePersonPref } from "../services/settings";
import { onPersonChanged } from "../services/syncEvents";

// Per-person display preference (synced across that person's devices). Stored data always stays in kilograms.

const listeners = new Set<() => void>();

export function getWeightUnit(): WeightUnit {
  return readPersonPref<string>("weightUnit") === "lbs" ? "lbs" : "kg";
}

export function setWeightUnit(unit: WeightUnit, opts: { fromSync?: boolean } = {}): void {
  writePersonPref("weightUnit", unit);
  if (!opts.fromSync) markPrefsChanged();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Other tabs, and switching person, can change the value underneath us.
  const onStorage = (e: StorageEvent) => e.key?.endsWith("weightUnit") && listener();
  window.addEventListener("storage", onStorage);
  const offPerson = onPersonChanged(listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    offPerson();
  };
}

export function useWeightUnit(): WeightUnit {
  return useSyncExternalStore(subscribe, getWeightUnit, () => "kg");
}
