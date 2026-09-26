import { describe, expect, it } from "vitest";
import { formatStrengthTarget, formatWeight, formatWeightValue } from "../format";
import { fromDisplayWeight, toDisplayWeight } from "../units";

describe("weight units", () => {
  it("converts kg to lbs for display and back for storage", () => {
    expect(toDisplayWeight(20, "kg")).toBe(20);
    expect(toDisplayWeight(20, "lbs")).toBe(44.1);
    expect(fromDisplayWeight(45, "lbs")).toBe(20.412);
    // Values entered in lbs round-trip to the same display value.
    for (const lbs of [5, 12.5, 45, 135, 225, 315]) expect(toDisplayWeight(fromDisplayWeight(lbs, "lbs"), "lbs")).toBe(lbs);
  });

  it("formats weights and targets in the chosen unit", () => {
    expect(formatWeight(10, "lbs")).toBe("22 lbs");
    expect(formatWeight(22.5, "kg")).toBe("22.5 kg");
    expect(formatWeight(undefined, "lbs")).toBe("BW");
    expect(formatWeightValue(100, "lbs")).toBe("220.5");
    expect(formatStrengthTarget({ kind: "strength", sets: 4, reps: 8, weightKg: 60, restSeconds: 90 }, "lbs")).toBe("4 × 8 · 132.3 lbs");
  });
});
