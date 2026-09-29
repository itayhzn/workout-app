import { describe, expect, it } from "vitest";
import { GitHubContents } from "../../repositories/githubContents";
import { FakeGitHub } from "../../test/fakeGitHub";
import { exercises, pull, schedule } from "../../test/fixtures";
import { addPerson, listPeople, renamePerson, slugify, uniqueId } from "../people";

const client = (gh: FakeGitHub) => new GitHubContents({ owner: "me", repo: "workout-data", branch: "main", token: "t" }, gh.fetch);
const plan = { exercises, workouts: [pull], schedule };

describe("people", () => {
  it("makes readable, unique ids", () => {
    expect(slugify("Noa Levi")).toBe("noa-levi");
    expect(slugify("אבא")).toBe("person");
    expect(uniqueId("Noa", ["noa", "noa-2"])).toBe("noa-3");
  });

  it("adds a person with their own copy of the plan, then lists them", async () => {
    const gh = new FakeGitHub();
    const person = await addPerson(client(gh), "  Noa ", plan, new Date("2026-09-29T00:00:00Z"));
    expect(person).toEqual({ id: "noa", name: "Noa", createdAt: "2026-09-29T00:00:00.000Z" });
    expect(gh.json<unknown[]>("people/noa/plan/workouts.json")).toHaveLength(1);
    expect(gh.json("people/noa/plan/schedule.json")).toMatchObject({ monday: ["pull"] });
    const second = await addPerson(client(gh), "noa", plan);
    expect(second.id).toBe("noa-2");
    expect((await listPeople(client(gh))).map((p) => p.id)).toEqual(["noa", "noa-2"]);
  });

  it("keeps both people when two devices add someone at the same time", async () => {
    const gh = new FakeGitHub();
    gh.put("people.json", [{ id: "itay", name: "Itay", createdAt: "x" }]);
    // Another device adds Dana right before our roster write lands.
    let rosterWrites = 0;
    const origFetch = gh.fetch;
    gh.fetch = async (input, init) => {
      if (init?.method === "PUT" && String(input).endsWith("/people.json") && rosterWrites++ === 0) {
        gh.put("people.json", [{ id: "itay", name: "Itay", createdAt: "x" }, { id: "dana", name: "Dana", createdAt: "y" }]);
      }
      return origFetch(input, init);
    };
    await addPerson(client(gh), "Noa", plan);
    expect((await listPeople(client(gh))).map((p) => p.id)).toEqual(["itay", "dana", "noa"]);
  });

  it("renames without changing the id", async () => {
    const gh = new FakeGitHub();
    await addPerson(client(gh), "Noa", plan);
    await renamePerson(client(gh), "noa", "Noa L.");
    expect(await listPeople(client(gh))).toMatchObject([{ id: "noa", name: "Noa L." }]);
  });
});
