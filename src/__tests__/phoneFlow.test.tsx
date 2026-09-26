import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { weekdayOf } from "../domain/schedule";
import { createSession } from "../domain/session";
import type { StrengthSessionExercise } from "../domain/types";
import { saveModePreference } from "../services/settings";
import { getActiveSession, getRestTimer, putActiveSession } from "../storage/indexedDb";
import { exercises, pull, run } from "../test/fixtures";
import { useFreshDb } from "../test/freshDb";
import { renderApp, stubConfigFetch } from "../test/renderApp";

useFreshDb();
beforeEach(() => {
  saveModePreference("workout");
  const today = weekdayOf(new Date());
  stubConfigFetch({
    "exercises.json": exercises,
    "workouts.json": [pull, run],
    "schedule.json": { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [], [today]: ["pull"] },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("phone workout flow", () => {
  it("shows today's scheduled workout", async () => {
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Pull" })).toBeInTheDocument();
    expect(screen.getByText("Scheduled today", { selector: "span" })).toBeInTheDocument();
  });

  it("offers to resume an active workout after reload", async () => {
    await putActiveSession(createSession(run, exercises));
    renderApp("/");
    expect(await screen.findByText("Workout in progress")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /resume workout/i })).toHaveAttribute("href", expect.stringContaining("/workout/"));
  });

  it("starts a workout, completes a set, persists it and starts the rest timer", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/");
    await user.click(await screen.findByRole("button", { name: /start workout/i }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/workout\/[^/]+$/));

    await user.click(await screen.findByRole("link", { name: /start exercise/i }));
    expect(await screen.findByRole("heading", { name: "Pull Ups" })).toBeInTheDocument();

    // Adjust today's reps on the current set, then complete it.
    const current = screen.getByRole("group", { name: "Reps" });
    await user.click(within(current).getByRole("button", { name: "Decrease Reps" }));
    await user.click(screen.getByRole("button", { name: /complete set \(1 of 4\)/i }));

    expect(await screen.findByRole("timer")).toBeInTheDocument();
    await waitFor(async () => {
      const saved = await getActiveSession();
      const ex = saved!.exercises[0] as StrengthSessionExercise;
      expect(ex.sets[0]).toMatchObject({ status: "completed", reps: 7, weightKg: 10 });
      expect(ex.status).toBe("in_progress");
    });
    expect(await getRestTimer()).toMatchObject({ exerciseId: "pull-1", setNumber: 1, originalDurationSeconds: 120 });
    expect(screen.getByRole("button", { name: /complete set \(2 of 4\)/i })).toBeInTheDocument();
  });

  it("finishes early and stores the session in history", async () => {
    const user = userEvent.setup();
    const s = createSession(pull, exercises);
    await putActiveSession(s);
    const { router } = renderApp(`/workout/${s.id}/finish`);
    expect(await screen.findByText(/2 unfinished exercises will be saved as skipped/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save & finish workout/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/history/${s.id}`));
    expect(await screen.findByText("Workout complete", { selector: "div" })).toBeInTheDocument();
    expect(await getActiveSession()).toBeUndefined();
  });

  it("guards stale session ids", async () => {
    renderApp("/workout/does-not-exist");
    expect(await screen.findByText("Workout not found")).toBeInTheDocument();
  });
});
