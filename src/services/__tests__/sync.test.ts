import { describe, expect, it } from "vitest";
import { GitHubContents } from "../../repositories/githubContents";
import { createSession, finishSession } from "../../domain/session";
import type { WorkoutSession } from "../../domain/types";
import { commitCompletedSession, getAppState, importSessions, listSessions, listSyncQueue, reopenCompletedSession, setAppState } from "../../storage/indexedDb";
import { getWeightUnit, setWeightUnit } from "../../state/units";
import { FakeGitHub } from "../../test/fakeGitHub";
import { exercises, pull, run } from "../../test/fixtures";
import { useFreshDb } from "../../test/freshDb";
import { decodeSetupCode, encodeSetupCode } from "../pairing";
import { loadTimerSound, markPrefsChanged } from "../settings";
import { SYNC_STATE_VERSION, mergeSessions, monthOf, runSync } from "../syncService";

useFreshDb();

const session = (iso: string, w = pull): WorkoutSession => finishSession(createSession(w, exercises, new Date(iso)), new Date(iso));
const clientFor = (gh: FakeGitHub) => new GitHubContents({ owner: "me", repo: "workout-data", branch: "main", token: "t" }, gh.fetch);
const ids = (list: WorkoutSession[] | undefined) => (list ?? []).map((s) => s.id).sort();

describe("helpers", () => {
  it("buckets by UTC month and merges by id without duplicates", () => {
    const a = session("2026-09-30T23:30:00Z");
    const b = session("2026-10-01T06:00:00Z");
    expect([monthOf(a), monthOf(b)]).toEqual(["2026-09", "2026-10"]);
    const { merged, added } = mergeSessions([b], [a, b]);
    expect(added).toBe(1);
    expect(merged.map((s) => s.id)).toEqual([a.id, b.id]);
  });

  it("round-trips setup codes and rejects junk", () => {
    const connection = { owner: "me", repo: "workout-data", branch: "main", token: "github_pat_x" };
    expect(decodeSetupCode(encodeSetupCode({ connection }))).toEqual({ connection });
    expect(decodeSetupCode(encodeSetupCode({ connection, personId: "noa" }))).toEqual({ connection, personId: "noa" });
    expect(() => decodeSetupCode("hello")).toThrow(/setup code/);
    expect(() => decodeSetupCode("KW1.!!!")).toThrow();
  });
});

describe("runSync", () => {
  it("uploads existing history into monthly files on first sync, then has nothing to do", async () => {
    const gh = new FakeGitHub();
    const sep = session("2026-09-20T06:00:00Z");
    const oct = session("2026-10-02T06:00:00Z", run);
    await importSessions([sep, oct]); // pre-existing history that was never queued
    const r = await runSync(clientFor(gh), "me");
    expect(r.pushed).toBe(2);
    expect(ids(gh.json("people/me/history/2026-09.json"))).toEqual([sep.id]);
    expect(ids(gh.json("people/me/history/2026-10.json"))).toEqual([oct.id]);
    expect(await listSyncQueue()).toEqual([]);

    gh.requests = [];
    const again = await runSync(clientFor(gh), "me");
    expect(again).toMatchObject({ pushed: 0, pulled: 0 });
    expect(gh.requests.filter((q) => q.method === "PUT")).toEqual([]);
    expect(gh.requests.filter((q) => q.path.startsWith("people/me/history/"))).toEqual([]); // unchanged months aren't re-downloaded
  });

  it("downloads sessions other devices wrote", async () => {
    const gh = new FakeGitHub();
    const fromPhone = session("2026-09-21T06:00:00Z");
    gh.put("people/me/history/2026-09.json", [fromPhone]);
    const r = await runSync(clientFor(gh), "me");
    expect(r.pulled).toBe(1);
    expect(ids(await listSessions())).toEqual([fromPhone.id]);
  });

  it("merges instead of overwriting when another device writes the same month concurrently", async () => {
    const gh = new FakeGitHub();
    await runSync(clientFor(gh), "me"); // initial sync done, empty
    const mine = session("2026-09-22T06:00:00Z");
    const theirs = session("2026-09-22T07:00:00Z", run);
    await commitCompletedSession(mine); // queued for upload
    gh.beforeNextPut = () => gh.put("people/me/history/2026-09.json", [theirs]); // other device wins the race
    await runSync(clientFor(gh), "me");
    expect(ids(gh.json("people/me/history/2026-09.json"))).toEqual(ids([mine, theirs]));
    expect(ids(await listSessions())).toEqual(ids([mine, theirs]));
    expect(await listSyncQueue()).toEqual([]);
  });

  it("a resumed and re-finished workout replaces the older copy everywhere", async () => {
    const gh = new FakeGitHub();
    await runSync(clientFor(gh), "me");
    const first = session("2026-09-30T05:20:00Z");
    await commitCompletedSession(first);
    await runSync(clientFor(gh), "me");
    // Resumed later: while active, sync must not pull the old copy back into history.
    await reopenCompletedSession({ ...first, status: "active", completedAt: undefined });
    gh.put("people/me/history/2026-09.json", [first]); // month file changed (e.g. another device synced)
    await runSync(clientFor(gh), "me");
    expect(await listSessions()).toEqual([]);
    // Finished again, later: the newer version wins on GitHub.
    const second = { ...first, completedAt: "2026-09-30T18:05:00.000Z", notes: "rest done" };
    await commitCompletedSession(second);
    await runSync(clientFor(gh), "me");
    expect(gh.json<WorkoutSession[]>("people/me/history/2026-09.json")).toMatchObject([{ id: first.id, notes: "rest done" }]);
  });

  it("after updating from an older version, re-reads history once and picks up newer copies it had skipped", async () => {
    const gh = new FakeGitHub();
    const cutShort = session("2026-09-30T05:20:00Z");
    const finishedLater = { ...cutShort, completedAt: "2026-09-30T18:05:00.000Z", notes: "rest done" };
    await importSessions([cutShort]);
    const sha = gh.put("people/me/history/2026-09.json", [finishedLater]);
    // What an old-version device leaves behind: month marked as seen, but it kept its old copy.
    await setAppState("syncState", { monthShas: { "2026-09": sha }, initialUploadDone: true });
    const r = await runSync(clientFor(gh), "me");
    expect(r.pulled).toBe(1);
    expect((await listSessions())[0].notes).toBe("rest done");
    expect(await getAppState("syncState")).toMatchObject({ version: SYNC_STATE_VERSION });
    // Only once: the next sync doesn't download the month again.
    gh.requests = [];
    await runSync(clientFor(gh), "me");
    expect(gh.requests.filter((q) => q.path === "people/me/history/2026-09.json")).toEqual([]);
  });

  it("keeps finished workouts queued while offline", async () => {
    const gh = new FakeGitHub();
    gh.offline = true;
    await commitCompletedSession(session("2026-09-23T06:00:00Z"));
    await expect(runSync(clientFor(gh), "me")).rejects.toThrow();
    expect(await listSyncQueue()).toHaveLength(1);
    gh.offline = false;
    await runSync(clientFor(gh), "me");
    expect(await listSyncQueue()).toEqual([]);
    expect(await getAppState("syncState")).toMatchObject({ lastSyncAt: expect.any(String) });
  });

  it("syncs preferences with last-writer-wins", async () => {
    const gh = new FakeGitHub();
    gh.put("people/me/preferences.json", { weightUnit: "lbs", timerSound: false, updatedAt: "2026-09-20T00:00:00.000Z" });
    expect(await runSync(clientFor(gh), "me")).toMatchObject({ prefs: "pulled" });
    expect(getWeightUnit()).toBe("lbs");
    expect(loadTimerSound()).toBe(false);

    setWeightUnit("kg"); // newer local change
    expect(await runSync(clientFor(gh), "me")).toMatchObject({ prefs: "pushed" });
    expect(gh.json("people/me/preferences.json")).toMatchObject({ weightUnit: "kg", timerSound: false });

    markPrefsChanged("2026-01-01T00:00:00.000Z"); // local older than remote now
    expect(await runSync(clientFor(gh), "me")).toMatchObject({ prefs: "pulled" });
  });
});
