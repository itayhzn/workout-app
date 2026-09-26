import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { formatNumber } from "../domain/format";

interface Props {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  label: string;
  /** Allows clearing the value (e.g. bodyweight → no weight). */
  optional?: boolean;
  size?: "md" | "lg";
  accent?: "volt" | "cyan";
}

/** One-touch increment/decrement with a directly editable numeric field (numeric keyboard on phones). */
export function NumberStepper({ value, onChange, step = 1, min = 0, max = 9999, unit, label, optional, size = "md", accent = "cyan" }: Props) {
  const [text, setText] = useState(value === undefined ? "" : formatNumber(value));
  useEffect(() => setText(value === undefined ? "" : formatNumber(value)), [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, Number(n.toFixed(2))));
  const commit = (raw: string) => {
    const trimmed = raw.trim().replace(",", ".");
    if (trimmed === "") {
      if (optional) onChange(undefined);
      else setText(value === undefined ? "" : formatNumber(value));
      return;
    }
    const n = Number(trimmed);
    if (Number.isFinite(n)) onChange(clamp(n));
    else setText(value === undefined ? "" : formatNumber(value));
  };
  const btn = size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const color = accent === "volt" ? "text-volt" : "text-ink";
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className={`btn-secondary ${btn} shrink-0`} aria-label={`Decrease ${label}`} onClick={() => onChange(clamp((value ?? 0) - step))} disabled={(value ?? 0) <= min}>
        <Minus size={18} />
      </button>
      <div className="relative min-w-0 flex-1">
        <input
          className={`input tnum text-center font-display font-bold ${size === "lg" ? "h-12 text-2xl" : "h-10 text-lg"} ${color} ${unit ? "pr-8" : ""}`}
          inputMode="decimal"
          aria-label={label}
          value={text}
          placeholder={optional ? "—" : "0"}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          onFocus={(e) => e.target.select()}
        />
        {unit && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-3">{unit}</span>}
      </div>
      <button type="button" className={`btn-secondary ${btn} shrink-0`} aria-label={`Increase ${label}`} onClick={() => onChange(clamp((value ?? 0) + step))}>
        <Plus size={18} />
      </button>
    </div>
  );
}
