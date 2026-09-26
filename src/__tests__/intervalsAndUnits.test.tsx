import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildIntervalPlan, startIntervals } from "../domain/intervals";
import { createSession } from "../domain/session";
import type { Exercise, TimedSessionExercise, Workout } from "../domain/types";
import { saveModePreference } from "../services/settings";
import { getActiveSession, getIntervalTimer, putActiveSession, putIntervalTimer } from "../storage/indexedDb";
import { setWeightUnit } from "../state/units";
import { exercises as baseExercises, pull } from "../test/fixtures";
import { useFreshDb } from "../test/freshDb";
import { renderApp, stubConfigFetch } from "../test/renderApp";

const exercises: Exercise[] = [...baseExercises, { id: "crunch", name: "Crunches", type: "strength" }, { id: "plank", name: "Plank", type: "strength" }];
const abs: Workout = {
  id: "abs",
  name: "Abs",
  type: "strength",
  exercises: [
    { id: "a1", exerciseId: "crunch", target: { kind: "timed", sets: 1, workSeconds: 30, restSeconds: 10 } },
    { id: "a2", exerciseId: "plank", target: { kind: "timed", sets: 1, workSeconds: 30, restSeconds: 0 } },
  ],
};

useFreshDb();
beforeEach(() => {
  saveModePreference("workout");
  stubConfigFetch({ "exercises.json": exercises, "workouts.json": [pull, abs], "schedule.json": {} });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setWeightUnit("kg");
});

describe("timed exercises", () => {
  it("starts an auto-advancing interval sequence from the exercise screen", async () => {
    const user = userEvent.setup();
    const s = createSession(abs, exercises);
    await putActiveSession(s);
    const { router } = renderApp(`/workout/${s.id}/exercise/a1`);
    await user.click(await screen.findByRole("button", { name: /start intervals/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/workout/${s.id}/intervals`));
    expect(await screen.findByText("Get ready")).toBeInTheDocument();
    expect(screen.getByText("Interval 1 of 2")).toBeInTheDocument();
    expect((await getIntervalTimer())?.steps.map((x) => x.phase)).toEqual(["prep", "work", "rest", "work"]);
  });

  it("records sets that finished while the app was closed and shows the current step", async () => {
    const s = createSession(abs, exercises);
    await putActiveSession(s);
    // Started 38 s ago: prep (5) + crunches (30) done, now 3 s into the 10 s rest before planks.
    await putIntervalTimer(startIntervals(buildIntervalPlan(s, "a1"), Date.now() - 38_000));
    renderApp(`/workout/${s.id}/intervals`);
    expect(await screen.findByText("Rest")).toBeInTheDocument();
    expect(screen.getByText("Up next")).toBeInTheDocument();
    await waitFor(async () => {
      const saved = await getActiveSession();
      expect((saved!.exercises[0] as TimedSessionExercise).sets[0]).toMatchObject({ status: "completed", durationSeconds: 30 });
    });
  });
});

describe("weight units", () => {
  it("shows weights in lbs while storing kg", async () => {
    const user = userEvent.setup();
    setWeightUnit("lbs");
    const s = createSession(pull, exercises);
    await putActiveSession(s);
    renderApp(`/workout/${s.id}/exercise/pull-1`);
    expect(await screen.findByRole("button", { name: "Edit Weight" })).toHaveTextContent("22lbs");
    // Raise the current set by one step (5 lbs) and log it.
    await user.click(screen.getByRole("button", { name: "Increase Weight" }));
    await user.click(screen.getByRole("button", { name: /complete set/i }));
    await waitFor(async () => {
      const saved = await getActiveSession();
      // 10 kg = 22 lbs; +5 lbs = 27 lbs ≈ 12.247 kg
      expect((saved!.exercises[0] as { sets: object[] }).sets[0]).toMatchObject({ status: "completed", weightKg: 12.247 });
    });
  });
});
