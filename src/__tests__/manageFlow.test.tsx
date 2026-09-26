import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveModePreference } from "../services/settings";
import { getCachedConfig } from "../storage/indexedDb";
import { exercises, pull, run, schedule } from "../test/fixtures";
import { useFreshDb } from "../test/freshDb";
import { renderApp, stubConfigFetch } from "../test/renderApp";

useFreshDb();
beforeEach(() => {
  saveModePreference("manage");
  stubConfigFetch({ "exercises.json": exercises, "workouts.json": [pull, run], "schedule.json": schedule });
});
afterEach(() => vi.unstubAllGlobals());

describe("management mode", () => {
  it("adds an exercise (saved locally when GitHub isn't connected)", async () => {
    const user = userEvent.setup();
    renderApp("/manage/exercises/new");
    const name = await screen.findByLabelText("Name");
    await user.type(name, "Face Pulls");
    await user.click(screen.getByRole("button", { name: /save exercise/i }));
    await waitFor(async () => {
      const cached = await getCachedConfig();
      expect(cached?.localEdits).toBe(true);
      expect(cached?.exercises.map((e) => e.name)).toContain("Face Pulls");
    });
    expect(await screen.findByText(/changes saved only in this browser/i)).toBeInTheDocument();
  });

  it("shows validation errors next to fields", async () => {
    const user = userEvent.setup();
    renderApp("/manage/exercises/new");
    await screen.findByLabelText("Name");
    await user.click(screen.getByRole("button", { name: /save exercise/i }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
  });

  it("blocks deleting an exercise that workouts use", async () => {
    const user = userEvent.setup();
    renderApp("/manage/exercises/pull-ups");
    await user.click(await screen.findByRole("button", { name: /delete/i }));
    expect(await screen.findByText(/used by 1 workout \(Pull\) and cannot be deleted/i)).toBeInTheDocument();
  });

  it("reorders workout exercises with the accessible controls and saves", async () => {
    const user = userEvent.setup();
    renderApp("/manage/workouts/pull");
    await screen.findByDisplayValue("Pull");
    await user.click(screen.getAllByRole("button", { name: "Move down" })[0]);
    await user.click(screen.getByRole("button", { name: /save workout/i }));
    await waitFor(async () => {
      const cached = await getCachedConfig();
      expect(cached?.workouts.find((w) => w.id === "pull")?.exercises.map((e) => e.id)).toEqual(["pull-2", "pull-1"]);
    });
  });

  it("assigns a workout to a day in the schedule", async () => {
    const user = userEvent.setup();
    renderApp("/manage/schedule");
    await screen.findByRole("heading", { name: "Schedule" });
    const selects = screen.getAllByRole("combobox", { name: "Assign workout" });
    await user.selectOptions(selects[2], "run"); // Wednesday
    await user.click(screen.getByRole("button", { name: /save schedule/i }));
    await waitFor(async () => expect((await getCachedConfig())?.schedule.wednesday).toEqual(["run"]));
  });
});
