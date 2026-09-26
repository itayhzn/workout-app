import { describe, expect, it } from "vitest";
import { completeNextSet, createSession, finishSession } from "../../domain/session";
import { exercises, pull } from "../../test/fixtures";
import { useFreshDb } from "../../test/freshDb";
import {
  commitCompletedSession,
  getActiveSession,
  getRestTimer,
  importSessions,
  listSessions,
  listSyncQueue,
  putActiveSession,
  putRestTimer,
  resetDbForTests,
} from "../indexedDb";

useFreshDb();

describe("active workout persistence", () => {
  it("recovers the active session and timer after a reload", async () => {
    const s = completeNextSet(createSession(pull, exercises), "pull-1").session;
    await putActiveSession(s);
    await putRestTimer({ exerciseId: "pull-1", setNumber: 1, endsAt: 123, originalDurationSeconds: 120 });

    await resetDbForTests(); // simulate the tab being killed and reopened
    expect(await getActiveSession()).toEqual(s);
    expect(await getRestTimer()).toMatchObject({ endsAt: 123 });
  });

  it("moves a finished session to history atomically and queues it for sync", async () => {
    const s = createSession(pull, exercises);
    await putActiveSession(s);
    await putRestTimer({ exerciseId: "pull-1", setNumber: 1, endsAt: 1, originalDurationSeconds: 1 });
    const done = finishSession(s);
    await commitCompletedSession(done);
    expect(await getActiveSession()).toBeUndefined();
    expect(await getRestTimer()).toBeUndefined();
    expect((await listSessions()).map((x) => x.id)).toEqual([done.id]);
    expect((await listSyncQueue()).map((x) => x.sessionId)).toEqual([done.id]);
  });
});

describe("history", () => {
  it("lists newest first with a limit", async () => {
    const mk = (iso: string) => finishSession(createSession(pull, exercises, new Date(iso)), new Date(iso));
    const a = mk("2026-09-20T10:00:00Z");
    const b = mk("2026-09-24T10:00:00Z");
    const c = mk("2026-09-22T10:00:00Z");
    for (const s of [a, b, c]) await commitCompletedSession(s);
    expect((await listSessions()).map((s) => s.id)).toEqual([b.id, c.id, a.id]);
    expect((await listSessions(2)).map((s) => s.id)).toEqual([b.id, c.id]);
  });

  it("imports idempotently by session id", async () => {
    const s = finishSession(createSession(pull, exercises));
    expect(await importSessions([s])).toEqual({ added: 1, skipped: 0 });
    expect(await importSessions([s, { ...s, workoutName: "tampered" }])).toEqual({ added: 0, skipped: 2 });
    const all = await listSessions();
    expect(all).toHaveLength(1);
    expect(all[0].workoutName).toBe("Pull");
  });
});
