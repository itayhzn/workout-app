import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, finishSession } from "../domain/session";
import { WEEKDAYS, type Exercise, type Workout } from "../domain/types";
import { saveModePreference } from "../services/settings";
import { commitCompletedSession, getActiveSession, putActiveSession } from "../storage/indexedDb";
import { useFreshDb } from "../test/freshDb";
import { renderApp, stubConfigFetch } from "../test/renderApp";

const exercises: Exercise[] = [
  { id: "squat", name: "Goblet Squat", type: "strength" },
  { id: "pullup", name: "Assisted Pull-Ups", type: "strength" },
  { id: "swim", name: "Freestyle — Steady", type: "swimming" },
  { id: "stairs", name: "Stair Climber", type: "cardio" },
];
const lift = (id: string, name: string, exerciseId: string): Workout => ({
  id, name, type: "strength", leaveBy: "07:25",
  exercises: [{ id: `${id}-1`, exerciseId, target: { kind: "strength", sets: 1, reps: 8, restSeconds: 60 } }],
});
const legsA = lift("legs-a", "Legs A", "squat");
const pullB = lift("pull-b", "Pull B", "pullup");
const steadySwim: Workout = { id: "steady-swim", name: "Steady Swim", type: "aerobic", exercises: [{ id: "s1", exerciseId: "swim", target: { kind: "swimming", durationMinutes: 30 } }] };
const stairClimber: Workout = { id: "stair-climber", name: "Stair Climber", type: "aerobic", exercises: [{ id: "c1", exerciseId: "stairs", target: { kind: "cardio", durationMinutes: 30 } }] };
// The same plan every day, so the test doesn't depend on today's date.
const schedule = Object.fromEntries(WEEKDAYS.map((d) => [d, ["legs-a", "steady-swim"]]));

useFreshDb();
beforeEach(() => {
  saveModePreference("workout");
  stubConfigFetch({ "exercises.json": exercises, "workouts.json": [legsA, pullB, steadySwim, stairClimber], "schedule.json": schedule });
});
afterEach(() => vi.unstubAllGlobals());

describe("lift and cardio as separate workouts", () => {
  it("offers today's cardio after finishing the lift, even a swapped-in lift", async () => {
    const user = userEvent.setup();
    const s = createSession(pullB, exercises); // Pull B instead of today's Legs A
    await putActiveSession(s);
    const { router } = renderApp(`/workout/${s.id}/finish`);
    await user.click(await screen.findByRole("button", { name: /save & finish/i }));

    const card = (await screen.findByText("Up next today")).closest("section")!;
    expect(within(card).getByRole("heading", { name: "Steady Swim" })).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /or choose another workout/i })).toHaveAttribute("href", "/?choose=1");
    await user.click(within(card).getByRole("button", { name: "Start Steady Swim" }));

    await waitFor(async () => expect((await getActiveSession())?.workoutId).toBe("steady-swim"));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/workout\/[^/]+$/));
    expect(await screen.findByText("Steady Swim")).toBeInTheDocument();
  });

  it("shows what's done today on the home screen, with the cardio up next", async () => {
    await commitCompletedSession(finishSession(createSession(pullB, exercises, new Date(Date.now() - 60_000))));
    renderApp("/?choose=1");

    const doneRow = (await screen.findByText("Done today")).closest("section")!;
    expect(within(doneRow).getByText("Pull B")).toBeInTheDocument();
    expect(within(doneRow).getByText(/in place of Legs A/)).toBeInTheDocument();
    expect(screen.getByText("Up next")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Steady Swim" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Legs A" })).not.toBeInTheDocument();
    // Opened from "Or choose another workout": the picker is already open.
    expect(screen.getByRole("button", { name: /choose another workout/i })).toHaveAttribute("aria-expanded", "true");
  });
});
