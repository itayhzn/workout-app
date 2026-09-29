import { Cloud, CloudAlert, CloudCheck, CloudOff, RefreshCw } from "lucide-react";
import { useNow } from "../hooks/useNow";
import { useSync, type SyncStatus } from "../state/SyncContext";

export function timeAgo(iso: string | undefined, now: number): string {
  if (!iso) return "never";
  const min = Math.round((now - Date.parse(iso)) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString();
}

const ICON: Record<SyncStatus, typeof Cloud> = { off: CloudOff, idle: CloudCheck, syncing: RefreshCw, offline: CloudOff, error: CloudAlert };

/** One-line summary, e.g. "Synced 2 min ago" / "Syncing…" / "Offline · 2 waiting". */
export function useSyncSummary(): { text: string; tone: string; Icon: typeof Cloud; spinning: boolean } {
  const { status, lastSyncAt, pending } = useSync();
  const now = useNow(30000);
  const waiting = pending ? ` · ${pending} waiting` : "";
  switch (status) {
    case "off":
      return { text: "Sync off", tone: "text-ink-3", Icon: ICON.off, spinning: false };
    case "syncing":
      return { text: "Syncing…", tone: "text-cyan", Icon: ICON.syncing, spinning: true };
    case "offline":
      return { text: `Offline${waiting}`, tone: "text-warn", Icon: ICON.offline, spinning: false };
    case "error":
      return { text: `Sync failed${waiting}`, tone: "text-danger", Icon: ICON.error, spinning: false };
    default:
      return { text: `Synced ${timeAgo(lastSyncAt, now)}${waiting}`, tone: pending ? "text-warn" : "text-emerald", Icon: ICON.idle, spinning: false };
  }
}

/** Compact icon button for headers. */
export function SyncBadge({ onClick }: { onClick?: () => void }) {
  const { configured } = useSync();
  const s = useSyncSummary();
  if (!configured) return null;
  return (
    <button className={`btn-ghost h-11 w-11 ${s.tone}`} onClick={onClick} aria-label={s.text} title={s.text}>
      <s.Icon size={20} className={s.spinning ? "animate-spin" : ""} />
    </button>
  );
}

/** Status line plus a Sync now button. */
export function SyncRow({ compact }: { compact?: boolean }) {
  const { syncNow, status, error } = useSync();
  const s = useSyncSummary();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <s.Icon size={18} className={`${s.tone} ${s.spinning ? "animate-spin" : ""}`} />
        <span className={`flex-1 text-sm ${s.tone}`}>{s.text}</span>
        <button className={`btn-secondary ${compact ? "h-9" : "h-10"} px-3 normal-case`} onClick={() => void syncNow()} disabled={status === "syncing"}>
          <RefreshCw size={14} /> Sync now
        </button>
      </div>
      {status === "error" && error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
