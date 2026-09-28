import { Car } from "lucide-react";
import { formatTime } from "../domain/format";
import type { WorkoutSession } from "../domain/types";
import { useNow } from "../hooks/useNow";

/** Countdown to the session's leave-by time: calm, then amber in the last 10 minutes, red once late. */
export function LeaveByChip({ session, className = "" }: { session: WorkoutSession; className?: string }) {
  const now = useNow(5000, !!session.leaveByAt);
  if (!session.leaveByAt) return null;
  const minutes = Math.ceil((Date.parse(session.leaveByAt) - now) / 60000);
  const late = minutes <= 0;
  const tone = late ? "border-danger/60 bg-danger/15 text-danger" : minutes <= 10 ? "border-warn/60 bg-warn/10 text-warn" : "border-line text-ink-2";
  return (
    <div className={`flex items-center gap-1.5 rounded border px-2 py-1 font-display text-xs font-bold tnum ${tone} ${className}`} role="status" aria-label={`Leave by ${formatTime(session.leaveByAt)}`}>
      <Car size={14} />
      {late ? `Leave now · ${-minutes}m late` : `Leave ${formatTime(session.leaveByAt)} · ${minutes}m`}
    </div>
  );
}
