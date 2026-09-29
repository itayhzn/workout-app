import { toJson } from "../domain/config";
import type { WorkoutSession } from "../domain/types";
import { enqueueSessions, importSessions, listSessions } from "../storage/indexedDb";
import { notifyHistoryChanged } from "../state/history";
import { downloadFile } from "./configService";
import { requestSync } from "./syncEvents";

export async function exportHistory(): Promise<number> {
  const sessions = await listSessions();
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`workout-history-${date}.json`, toJson(sessions));
  return sessions.length;
}

export function looksLikeSession(v: unknown): v is WorkoutSession {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.workoutName === "string" &&
    typeof s.startedAt === "string" &&
    typeof s.completedAt === "string" &&
    s.status === "completed" &&
    Array.isArray(s.exercises)
  );
}

/** Imports an exported history file. Idempotent: sessions already present (by ID) are skipped. */
export async function importHistoryFile(file: File): Promise<{ added: number; skipped: number; invalid: number }> {
  const data: unknown = JSON.parse(await file.text());
  if (!Array.isArray(data)) throw new Error("Expected a JSON array of workout sessions.");
  const valid = data.filter(looksLikeSession);
  const result = await importSessions(valid);
  // Imported sessions should reach other devices too (duplicates are harmless: sync merges by id).
  await enqueueSessions(valid.map((s) => s.id));
  notifyHistoryChanged();
  requestSync();
  return { ...result, invalid: data.length - valid.length };
}
