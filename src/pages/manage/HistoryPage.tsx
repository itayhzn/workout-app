import { ChevronLeft, Download, History as HistoryIcon, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SessionDetail } from "../../components/SessionDetail";
import { Banner, EmptyState, Spinner, TypeBadge } from "../../components/ui";
import { formatMinutes, formatNumber, sessionDurationMs } from "../../domain/format";
import { sessionStats } from "../../domain/session";
import { WORKOUT_TYPES, type WorkoutSession, type WorkoutType } from "../../domain/types";
import { exportHistory, importHistoryFile } from "../../services/historyService";
import { useConfig } from "../../state/ConfigContext";
import { useSessions } from "../../state/history";
import { PageHeader } from "./shared";

function summary(s: WorkoutSession): string {
  const st = sessionStats(s);
  const parts = [`${st.exercisesCompleted} completed`];
  if (st.exercisesSkipped) parts.push(`${st.exercisesSkipped} skipped`);
  if (st.distanceKm) parts.push(`${formatNumber(st.distanceKm)} km`);
  else if (st.setsCompleted) parts.push(`${st.setsCompleted} sets`);
  return parts.join(" · ");
}

export function ManageHistoryPage() {
  const { sessions, loading } = useSessions();
  const { workoutById } = useConfig();
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [workoutFilter, setWorkoutFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<WorkoutType | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string }>();

  const typeOf = (s: WorkoutSession): WorkoutType => s.workoutType ?? workoutById(s.workoutId)?.type ?? "other";
  const workoutOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions) if (!m.has(s.workoutId)) m.set(s.workoutId, s.workoutName);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [sessions]);

  const filtered = sessions.filter((s) => {
    const day = (s.completedAt ?? s.startedAt).slice(0, 10);
    return (
      (workoutFilter === "all" || s.workoutId === workoutFilter) &&
      (typeFilter === "all" || typeOf(s) === typeFilter) &&
      (!from || day >= from) &&
      (!to || day <= to)
    );
  });
  const selected = sessionId ? sessions.find((s) => s.id === sessionId) : undefined;
  const filtersActive = workoutFilter !== "all" || typeFilter !== "all" || from || to;

  const onImport = async (file: File) => {
    try {
      const r = await importHistoryFile(file);
      setNotice({ tone: "info", text: `Imported ${r.added} session${r.added === 1 ? "" : "s"}${r.skipped ? `, ${r.skipped} already present` : ""}${r.invalid ? `, ${r.invalid} invalid skipped` : ""}.` });
    } catch (e) {
      setNotice({ tone: "error", text: `Import failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Review"
        title="History"
        description="Completed workout sessions stored in this browser. Import exports from your phone to review them here."
        actions={
          <>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0]).finally(() => (e.target.value = ""))} />
            <button className="btn-secondary h-10 px-3 normal-case" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Import
            </button>
            <button className="btn-secondary h-10 px-3 normal-case" onClick={() => exportHistory()} disabled={!sessions.length}>
              <Download size={16} /> Export
            </button>
          </>
        }
      />
      {notice && (
        <Banner tone={notice.tone} action={<button className="btn-ghost h-7 w-7" aria-label="Dismiss" onClick={() => setNotice(undefined)}><X size={14} /></button>}>
          {notice.text}
        </Banner>
      )}

      {loading ? (
        <Spinner />
      ) : sessions.length === 0 ? (
        <EmptyState icon={<HistoryIcon size={32} />} title="No completed workouts yet" body="Completed sessions will appear here." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_460px]">
          <div className={`flex min-w-0 flex-col gap-3 ${selected ? "hidden xl:flex" : ""}`}>
            <div className="card flex flex-wrap items-end gap-3 p-3">
              <label className="flex flex-col gap-1">
                <span className="label">Workout</span>
                <select className="input h-10 w-44" value={workoutFilter} onChange={(e) => setWorkoutFilter(e.target.value)}>
                  <option value="all">All workouts</option>
                  {workoutOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="label">Type</span>
                <select className="input h-10 w-36 capitalize" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as WorkoutType | "all")}>
                  <option value="all">All types</option>
                  {WORKOUT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="label">From</span>
                <input type="date" className="input h-10" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="label">To</span>
                <input type="date" className="input h-10" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
              {filtersActive && (
                <button
                  className="btn-ghost h-10 px-3 normal-case"
                  onClick={() => {
                    setWorkoutFilter("all");
                    setTypeFilter("all");
                    setFrom("");
                    setTo("");
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Table on wide screens, stacked cards on narrow ones. */}
            <div className="card hidden overflow-hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <th className="label p-3">Date</th>
                    <th className="label p-3">Workout</th>
                    <th className="label p-3 text-right">Duration</th>
                    <th className="label p-3">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((s) => (
                    <tr
                      key={s.id}
                      className={`cursor-pointer hover:bg-elevated ${s.id === sessionId ? "bg-elevated shadow-[inset_3px_0_0_var(--color-volt)]" : ""}`}
                      onClick={() => navigate(`/manage/history/${s.id}`)}
                    >
                      <td className="p-3 tnum">
                        <Link to={`/manage/history/${s.id}`} className="font-semibold">
                          {new Date(s.completedAt!).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </Link>
                        <div className="text-xs text-ink-3">{new Date(s.completedAt!).toLocaleDateString(undefined, { weekday: "long" })}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold">{s.workoutName}</div>
                        <TypeBadge type={typeOf(s)} />
                      </td>
                      <td className="p-3 text-right tnum">{formatMinutes(sessionDurationMs(s))}</td>
                      <td className="p-3 text-ink-2">{summary(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="flex flex-col gap-2 md:hidden">
              {filtered.map((s) => (
                <li key={s.id}>
                  <Link to={`/manage/history/${s.id}`} className="card block p-3">
                    <div className="flex justify-between">
                      <span className="font-semibold">{s.workoutName}</span>
                      <span className="text-sm text-ink-2 tnum">{formatMinutes(sessionDurationMs(s))}</span>
                    </div>
                    <div className="text-sm text-ink-2">
                      {new Date(s.completedAt!).toLocaleDateString()} · {summary(s)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {filtered.length === 0 && <div className="card p-6 text-center text-ink-2">No sessions match these filters.</div>}
          </div>

          {sessionId && (
            <aside className="card h-fit p-5 xl:sticky xl:top-8">
              <Link to="/manage/history" className="label mb-3 flex items-center gap-1 hover:text-ink">
                <ChevronLeft size={12} /> All sessions
              </Link>
              {selected ? <SessionDetail session={selected} /> : <p className="text-ink-2">Session not found in this browser.</p>}
            </aside>
          )}
          {!sessionId && <div className="card hidden h-fit items-center justify-center p-10 text-ink-2 xl:flex">Select a session to see set-by-set details.</div>}
        </div>
      )}
    </div>
  );
}
