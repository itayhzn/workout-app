// Weights are always stored in kilograms (weightKg). Pounds exist only at the display/input edge.

export type WeightUnit = "kg" | "lbs";

export const KG_PER_LB = 0.45359237;

/** kg → display value in the chosen unit (lbs rounded to 0.1). */
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  return unit === "kg" ? kg : Math.round((kg / KG_PER_LB) * 10) / 10;
}

/** Display value → kg. Rounded to grams so values typed in lbs round-trip cleanly. */
export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  return unit === "kg" ? value : Math.round(value * KG_PER_LB * 1000) / 1000;
}

/** Stepper increment in the chosen unit. */
export function weightStep(unit: WeightUnit): number {
  return unit === "kg" ? 2.5 : 5;
}
