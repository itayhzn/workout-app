import { Repeat } from "lucide-react";

/** "Superset" for strength groups, "Circuit · N rounds" for timed groups. */
export function GroupLabel({ kind, rounds, className = "" }: { kind: "strength" | "timed" | string; rounds?: number; className?: string }) {
  const text = kind === "timed" ? `Circuit${rounds ? ` · ${rounds} round${rounds === 1 ? "" : "s"}` : ""}` : `Superset${rounds ? ` · ${rounds} rounds` : ""}`;
  return (
    <span className={`inline-flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-widest text-volt ${className}`}>
      <Repeat size={12} /> {text}
    </span>
  );
}
