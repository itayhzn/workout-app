import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../services/configService";
import { getCachedConfig, putCachedConfig } from "../../storage/indexedDb";
import { exercises, pull, schedule } from "../../test/fixtures";
import { useFreshDb } from "../../test/freshDb";
import { ConflictError } from "../configRepository";
import { GitHubRepository } from "../githubRepository";
import { LocalConfigRepository } from "../localConfigRepository";
import { StaticJsonRepository } from "../staticJsonRepository";

useFreshDb();
afterEach(() => vi.unstubAllGlobals());

function stubStaticFetch(files: Record<string, unknown> | "offline") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (files === "offline") throw new TypeError("Failed to fetch");
      const name = url.split("/").pop()!;
      return name in files ? new Response(JSON.stringify(files[name])) : new Response("nope", { status: 404 });
    }),
  );
}

const files = { "exercises.json": exercises, "workouts.json": [pull], "schedule.json": schedule };

describe("loadConfig", () => {
  it("loads static JSON and caches it", async () => {
    stubStaticFetch(files);
    const cfg = await loadConfig(new StaticJsonRepository("/data/"));
    expect(cfg.source).toBe("static");
    expect(cfg.workouts[0].id).toBe("pull");
    await vi.waitFor(async () => expect((await getCachedConfig())?.workouts).toHaveLength(1));
  });

  it("falls back to the cached copy when offline", async () => {
    await putCachedConfig({ exercises, workouts: [pull], schedule, savedAt: "x", source: "static", localEdits: false });
    stubStaticFetch("offline");
    const cfg = await loadConfig(new StaticJsonRepository("/data/"));
    expect(cfg.workouts[0].id).toBe("pull");
    expect(cfg.offlineError).toMatch(/Failed to fetch/);
  });

  it("throws when offline with no cache", async () => {
    stubStaticFetch("offline");
    await expect(loadConfig(new StaticJsonRepository("/data/"))).rejects.toThrow();
  });

  it("falls back to cache when the deployed JSON is corrupted", async () => {
    await putCachedConfig({ exercises, workouts: [pull], schedule, savedAt: "x", source: "static", localEdits: false });
    stubStaticFetch({ ...files, "workouts.json": { not: "an array" } });
    const cfg = await loadConfig(new StaticJsonRepository("/data/"));
    expect(cfg.offlineError).toMatch(/must contain an array/);
    expect(cfg.workouts).toHaveLength(1);
  });

  it("falls back to the deployed plan when GitHub rejects the token and nothing is cached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).startsWith("https://api.github.com")) return new Response("bad credentials", { status: 401 });
        const name = String(url).split("/").pop()!;
        return name in files ? new Response(JSON.stringify(files[name as keyof typeof files])) : new Response("nope", { status: 404 });
      }),
    );
    const gh = new GitHubRepository({ owner: "me", repo: "r", branch: "main", token: "expired" }, "itay");
    const cfg = await loadConfig(gh);
    expect(cfg).toMatchObject({ source: "static", offlineError: expect.stringMatching(/401/) });
    expect(cfg.workouts[0].id).toBe("pull");
  });

  it("prefers unpublished local edits over the deployed files", async () => {
    await new LocalConfigRepository().saveWorkouts([{ ...pull, name: "Pull (edited)" }]);
    stubStaticFetch(files);
    const cfg = await loadConfig(new StaticJsonRepository("/data/"));
    expect(cfg.localEdits).toBe(true);
    expect(cfg.workouts[0].name).toBe("Pull (edited)");
  });
});

describe("GitHubRepository", () => {
  const connection = { owner: "me", repo: "workout-data", branch: "main", token: "t" };
  const b64 = (v: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(v))));

  it("reads with the file SHA and writes it back", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (!init?.method) return new Response(JSON.stringify({ content: b64(exercises), sha: "sha-1" }));
      return new Response(JSON.stringify({ content: { sha: "sha-2" } }));
    });
    const repo = new GitHubRepository(connection, "itay", fetchImpl as unknown as typeof fetch);
    expect(await repo.loadExercises()).toHaveLength(exercises.length);
    expect(calls[0].url).toBe("https://api.github.com/repos/me/workout-data/contents/people/itay/plan/exercises.json?ref=main");
    await repo.saveExercises([{ id: "é", name: "Élan", type: "other" }], "msg");
    const body = JSON.parse(String(calls[1].init!.body));
    expect(body).toMatchObject({ sha: "sha-1", branch: "main", message: "msg [itay]" });
    expect(decodeURIComponent(escape(atob(body.content)))).toBe('[\n  {\n    "id": "é",\n    "name": "Élan",\n    "type": "other"\n  }\n]\n');
  });

  it("surfaces a conflict instead of overwriting newer data", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return new Response(JSON.stringify({ content: b64(schedule), sha: "old" }));
      return new Response("conflict", { status: 409 });
    });
    const repo = new GitHubRepository(connection, "itay", fetchImpl as unknown as typeof fetch);
    await repo.loadSchedule();
    await expect(repo.saveSchedule(schedule)).rejects.toBeInstanceOf(ConflictError);
  });
});
