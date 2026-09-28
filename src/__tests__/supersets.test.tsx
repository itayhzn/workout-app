import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../domain/session";
import type { Exercise, Workout } from "../domain/types";
import { saveModePreference } from "../services/settings";
import { getActiveSession, getRestTimer, putActiveSession } from "../storage/indexedDb";
import { useFreshDb } from "../test/freshDb";
import { renderApp, stubConfigFetch } from "../test/renderApp";

const exercises: Exercise[] = [
  { id: "fly", name: "Cable Fly", type: "strength" },
  { id: "raise", name: "Lateral Raise", type: "strength" },
];
const workout: Workout = {
  id: "push",
  name: "Push",
  type: "strength",
  leaveBy: "23:59",
  exercises: [
    { id: "p1", exerciseId: "fly", group: "ss", target: { kind: "strength", sets: 2, reps: 10, repsMax: 12, weightKg: 30, restSeconds: 0 } },
    { id: "p2", exerciseId: "raise", group: "ss", target: { kind: "strength", sets: 2, reps: 12, repsMax: 15, weightKg: 6, restSeconds: 60 } },
  ],
};

useFreshDb();
beforeEach(() => {
  saveModePreference("workout");
  stubConfigFetch({ "exercises.json": exercises, "workouts.json": [workout], "schedule.json": {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("supersets on the phone", () => {
  it("moves to the partner without resting, then rests at the end of the round", async () => {
    const user = userEvent.setup();
    const s = createSession(workout, exercises, new Date(new Date().setHours(0, 0, 1, 0)));
    await putActiveSession(s);
    const { router } = renderApp(`/workout/${s.id}/exercise/p1`);

    expect(await screen.findByText(/Superset · 2 rounds/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Reps" })).toHaveTextContent("10–12");
    expect(screen.getByRole("status", { name: /leave by/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /complete set \(1 of 2\)/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/workout/${s.id}/exercise/p2`));
    expect(await getRestTimer()).toBeUndefined();

    await user.click(await screen.findByRole("button", { name: /complete set \(1 of 2\)/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/workout/${s.id}/exercise/p1`));
    await waitFor(async () => expect(await getRestTimer()).toMatchObject({ exerciseId: "p2", originalDurationSeconds: 60 }));
    const saved = await getActiveSession();
    expect(saved!.exercises.map((e) => e.status)).toEqual(["in_progress", "in_progress"]);
  });
});
