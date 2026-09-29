import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { weekdayOf } from "../domain/schedule";
import { createSession } from "../domain/session";
import { WEEKDAYS } from "../domain/types";
import { saveConnection, saveModePreference } from "../services/settings";
import { putActiveSession } from "../storage/indexedDb";
import { FakeGitHub } from "../test/fakeGitHub";
import { exercises, pull, run } from "../test/fixtures";
import { useFreshDb } from "../test/freshDb";
import { renderApp } from "../test/renderApp";

useFreshDb();
afterEach(() => vi.unstubAllGlobals());

const today = weekdayOf(new Date());
const scheduleWith = (id: string) => Object.fromEntries(WEEKDAYS.map((d) => [d, d === today ? [id] : []]));

beforeEach(() => {
  const gh = new FakeGitHub();
  gh.put("people.json", [
    { id: "itay", name: "Itay", createdAt: "x" },
    { id: "noa", name: "Noa", createdAt: "y" },
  ]);
  for (const [id, workout] of [["itay", pull], ["noa", run]] as const) {
    gh.put(`people/${id}/plan/exercises.json`, exercises);
    gh.put(`people/${id}/plan/workouts.json`, [workout]);
    gh.put(`people/${id}/plan/schedule.json`, scheduleWith(workout.id));
  }
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
    String(input).startsWith("https://api.github.com") ? gh.fetch(input, init) : Promise.resolve(new Response("", { status: 404 })),
  );
  saveModePreference("workout");
  saveConnection({ owner: "me", repo: "workout-data", branch: "main", token: "t" });
});

describe("multiple people", () => {
  it("each person has their own plan and their own workout in progress", async () => {
    const user = userEvent.setup();
    renderApp("/");

    await user.click(await screen.findByRole("button", { name: /itay/i }));
    expect(await screen.findByRole("heading", { name: "Pull" })).toBeInTheDocument();
    // Itay starts a workout (stored in Itay's database on this device).
    await putActiveSession(createSession(pull, exercises));

    // Switch to Noa: her plan, and no workout in progress.
    await user.click(screen.getByRole("button", { name: /switch person/i }));
    await user.click(await screen.findByRole("button", { name: /noa/i }));
    expect(await screen.findByRole("heading", { name: "Run" })).toBeInTheDocument();
    expect(screen.queryByText("Workout in progress")).not.toBeInTheDocument();

    // Back to Itay: his workout is still there.
    await user.click(screen.getByRole("button", { name: /switch person/i }));
    await user.click(await screen.findByRole("button", { name: /itay/i }));
    await waitFor(() => expect(screen.getByText("Workout in progress")).toBeInTheDocument());
    expect(screen.getAllByRole("heading", { name: "Pull" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Run" })).not.toBeInTheDocument();
  });
});
