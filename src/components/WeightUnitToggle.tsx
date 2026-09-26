import type { WeightUnit } from "../domain/units";
import { setWeightUnit, useWeightUnit } from "../state/units";

/** Segmented kg/lbs switch. */
export function WeightUnitToggle({ className = "" }: { className?: string }) {
  const unit = useWeightUnit();
  return (
    <div className={`inline-flex overflow-hidden rounded border border-line-strong ${className}`} role="radiogroup" aria-label="Weight unit">
      {(["kg", "lbs"] as WeightUnit[]).map((u) => (
        <button
          key={u}
          role="radio"
          aria-checked={unit === u}
          className={`h-9 min-w-12 px-3 font-display text-sm font-bold ${unit === u ? "bg-volt text-black" : "text-ink-2 hover:bg-elevated"}`}
          onClick={() => setWeightUnit(u)}
        >
          {u}
        </button>
      ))}
    </div>
  );
}
