import { useSyncExternalStore } from "react";
import type { WeightUnit } from "../domain/units";

// Per-device display preference. Stored data always stays in kilograms.

const KEY = "kinetic.weightUnit";
const listeners = new Set<() => void>();

export function getWeightUnit(): WeightUnit {
  try {
    return localStorage.getItem(KEY) === "lbs" ? "lbs" : "kg";
  } catch {
    return "kg";
  }
}

export function setWeightUnit(unit: WeightUnit): void {
  try {
    localStorage.setItem(KEY, unit);
  } catch {
    /* best effort */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useWeightUnit(): WeightUnit {
  return useSyncExternalStore(subscribe, getWeightUnit, () => "kg");
}
