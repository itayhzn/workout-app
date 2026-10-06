import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planChangesFromSession } from "../domain/planChanges";
import { addExerciseToSession, completeTimedSet, createSession, finishSession, setKeepAddedExercise, updateTimedPrescription } from "../domain/session";
import type { Exercise, Workout } from "../domain/types";
import { saveModePreference } from "../services/settings";
import { commitCompletedSession, getActiveSession, getCachedConfig, getPendingPlanChanges, listSessions, putActiveSession } from "../storage/indexedDb";
import { useFreshDb } from "../test/freshDb";
import { renderApp, stubConfigFetch } from "../test/renderApp";

const exercises: Exercise[] = [
  { id: "cat-cow", name: "Cat-Cow", type: "mobility" },
  { id: "pullup", name: "Assisted Pull-Ups", type: "strength" },
  { id: "childs-pose", name: "Child's Pose", type: "mobility" },
];
const pull: Workout = {
  id: "pull-b",
  name: "Pull B",
  type: "strength",
  exercises: [
    { id: "p1", exerciseId: "cat-cow", target: { kind: "timed", sets: 1, workSeconds: 30, restSeconds: 10 } },
    { id: "p2", exerciseId: "pullup", target: { kind: "strength", sets: 3, reps: 8, restSeconds: 90 } },
  ],
};
const floor: Workout = {
  id: "floor",
  name: "Floor: Mobility + Core",
  type: "mobility",
  exercises: [
    { id: "f1", exerciseId: "cat-cow", target: { kind: "timed", sets: 1, workSeconds: 60, restSeconds: 10 } },
    { id: "f2", exerciseId: "childs-pose", target: { kind: "timed", sets: 1, workSeconds: 60, restSeconds: 10 } },
  ],
};
/** Matches an element by its whole text, even when React splits it into several text nodes. */
const textIs = (text: string) => (_: string, el: Element | null) => el?.textContent === text && ![...(el?.children ?? [])].some((c) => c.textContent === text);
const workout = (cfg: Awaited<ReturnType<typeof getCachedConfig>>, id: string) => cfg?.workouts.find((w) => w.id === id);

useFreshDb();
beforeEach(() => {
  saveModePreference("workout");
  stubConfigFetch({ "exercises.json": exercises, "workouts.json": [pull, floor], "schedule.json": {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("adding an exercise during a workout", () => {
  it("adds it up next with its own workout's target, writes target changes back, and can keep it", async () => {
    const user = userEvent.setup();
    await commitCompletedSession(finishSession(createSession(floor, exercises), new Date(Date.now() - 86400_000)));
    const s = createSession(pull, exercises);
    await putActiveSession(completeTimedSet(s, "p1")); // warm-up done, pull-ups next
    const { router } = renderApp(`/workout/${s.id}`);

    await user.click(await screen.findByRole("button", { name: /^add exercise$/i }));
    const sheet = await screen.findByRole("dialog", { name: "Add to today's workout" });
    // Recent excludes what's already in this workout; the row shows the target and where it comes from.
    expect(within(sheet).getAllByText(textIs("1:00 · rest 10s · from Floor: Mobility + Core")).length).toBeGreaterThan(0);
    await user.click(within(sheet).getAllByRole("button", { name: "Add Child's Pose" })[0]);

    await waitFor(async () => expect((await getActiveSession())!.exercises.map((e) => e.exerciseId)).toEqual(["cat-cow", "childs-pose", "pullup"]));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("NOW")).toBeInTheDocument();
    const added = (await getActiveSession())!.exercises[1];
    expect(added.added?.from).toEqual({ workoutId: "floor", workoutName: "Floor: Mobility + Core", itemId: "f2" });

    // Hold it longer today: 1:00 → 1:30.
    await router.navigate(`/workout/${s.id}/exercise/${added.id}`);
    expect(await screen.findByText(/target changes also update floor: mobility \+ core when you finish/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit Work" }));
    for (let i = 0; i < 6; i++) await user.click(screen.getByRole("button", { name: "Increase Work" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Mark set done" }));

    await router.navigate(`/workout/${s.id}/finish`);
    expect(await screen.findByText(textIs("Updates Floor: Mobility + Core: 1:00 · rest 10s → 1:30 · rest 10s"))).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /keep it in pull b/i }));
    await waitFor(async () => expect((await getActiveSession())!.exercises[1].added?.keep).toBe(true));
    await user.click(screen.getByRole("button", { name: /save & finish/i }));

    await waitFor(async () => {
      const cfg = await getCachedConfig();
      expect(workout(cfg, "floor")!.exercises[1].target).toEqual({ kind: "timed", sets: 1, workSeconds: 90, restSeconds: 10 });
      expect(workout(cfg, "pull-b")!.exercises.map((x) => x.exerciseId)).toEqual(["cat-cow", "childs-pose", "pullup"]);
    });
    expect(await getPendingPlanChanges()).toEqual([]);
    // History keeps it, tagged.
    expect(await screen.findByText("Added")).toBeInTheDocument();
    expect((await listSessions())[0].exercises[1]).toMatchObject({ exerciseId: "childs-pose", status: "completed" });
  });

  it("can take an exercise added by mistake back out", async () => {
    const user = userEvent.setup();
    const s = addExerciseToSession(createSession(pull, exercises), exercises[2], floor.exercises[1].target, { id: "oops" });
    await putActiveSession(s);
    const { router } = renderApp(`/workout/${s.id}/exercise/oops`);
    expect(await screen.findByText("Added to today's workout only.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove from today" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/workout/${s.id}`));
    await waitFor(async () => expect((await getActiveSession())!.exercises.map((e) => e.id)).toEqual(["p1", "p2"]));
  });

  it("saves plan changes from a workout finished offline when the app next opens", async () => {
    let s = addExerciseToSession(createSession(pull, exercises), exercises[2], floor.exercises[1].target, {
      id: "x",
      from: { workoutId: "floor", workoutName: "Floor: Mobility + Core", itemId: "f2" },
    });
    s = setKeepAddedExercise(updateTimedPrescription(s, "x", { sets: 2 }), "x", true);
    const finished = finishSession(s);
    await commitCompletedSession(finished, planChangesFromSession(finished));
    expect(await getPendingPlanChanges()).toHaveLength(2);

    renderApp("/");
    await waitFor(async () => {
      const cfg = await getCachedConfig();
      expect(workout(cfg, "floor")!.exercises[1].target).toMatchObject({ sets: 2, workSeconds: 60 });
      expect(workout(cfg, "pull-b")!.exercises.map((x) => x.id)).toEqual(["x", "p1", "p2"]);
    });
    await waitFor(async () => expect(await getPendingPlanChanges()).toEqual([]));
  });
});
