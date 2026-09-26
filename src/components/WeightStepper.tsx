import { fromDisplayWeight, toDisplayWeight, weightStep } from "../domain/units";
import { useWeightUnit } from "../state/units";
import { NumberStepper } from "./NumberStepper";

/** NumberStepper for a kg value, shown and edited in the user's preferred unit. */
export function WeightStepper({
  valueKg,
  onChange,
  label = "Weight",
  size,
  accent,
  optional = true,
}: {
  valueKg: number | undefined;
  onChange: (kg: number | undefined) => void;
  label?: string;
  size?: "md" | "lg";
  accent?: "volt" | "cyan";
  optional?: boolean;
}) {
  const unit = useWeightUnit();
  return (
    <NumberStepper
      label={label}
      value={valueKg === undefined ? undefined : toDisplayWeight(valueKg, unit)}
      onChange={(v) => onChange(v === undefined ? undefined : fromDisplayWeight(v, unit))}
      step={weightStep(unit)}
      unit={unit}
      optional={optional}
      size={size}
      accent={accent}
    />
  );
}
