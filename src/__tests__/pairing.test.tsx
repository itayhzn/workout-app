import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeSetupCode } from "../services/pairing";
import { getActivePersonId, loadConnection, saveModePreference } from "../services/settings";
import { FakeGitHub } from "../test/fakeGitHub";
import { exercises, pull, schedule } from "../test/fixtures";
import { useFreshDb } from "../test/freshDb";
import { renderApp } from "../test/renderApp";

useFreshDb();
afterEach(() => vi.unstubAllGlobals());

function fakeRepo() {
  const gh = new FakeGitHub();
  gh.put("people.json", [{ id: "noa", name: "Noa", createdAt: "2026-09-29T00:00:00Z" }]);
  gh.put("people/noa/plan/exercises.json", exercises);
  gh.put("people/noa/plan/workouts.json", [pull]);
  gh.put("people/noa/plan/schedule.json", schedule);
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
    String(input).startsWith("https://api.github.com") ? gh.fetch(input, init) : Promise.resolve(new Response("", { status: 404 })),
  );
  return gh;
}

const connection = { owner: "me", repo: "workout-data", branch: "main", token: "github_pat_x" };

describe("pairing a phone", () => {
  it("connects from a pairing link as the given person and syncs", async () => {
    const user = userEvent.setup();
    saveModePreference("workout");
    const gh = fakeRepo();
    const { router } = renderApp(`/pair/${encodeSetupCode({ connection, personId: "noa" })}`);

    expect(await screen.findByText("Connect this device?")).toBeInTheDocument();
    expect(screen.getByText("me/workout-data")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /connect & sync/i }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(loadConnection()).toEqual(connection);
    expect(getActivePersonId()).toBe("noa");
    await waitFor(() => expect(gh.requests.some((r) => r.path === "people/noa/history")).toBe(true));
  });

  it("asks who you are when the code doesn't name a person", async () => {
    const user = userEvent.setup();
    fakeRepo();
    renderApp(`/pair/${encodeSetupCode({ connection })}`);
    await user.click(await screen.findByRole("button", { name: /connect & sync/i }));
    expect(await screen.findByText("Who's working out?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /noa/i })).toBeInTheDocument();
  });

  it("rejects a damaged link", async () => {
    renderApp("/pair/KW2.nope");
    expect(await screen.findByText("Invalid pairing link")).toBeInTheDocument();
  });
});
