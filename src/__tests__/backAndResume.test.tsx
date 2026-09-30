import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildIntervalPlan, startIntervals } from "../domain/intervals";
import { completeTimedSet, createSession, finishSession } from "../domain/session";
import type { Exercise, TimedSessionExercise, Workout } from "../domain/types";
import { saveModePreference } from "../services/settings";
import { commitCompletedSession, getActiveSession, getIntervalTimer, listSessions, putActiveSession, putIntervalTimer } from "../storage/indexedDb";
import { useFreshDb } from "../test/freshDb";
import { renderApp, stubConfigFetch } from "../test/renderApp";

const exercises: Exercise[] = [
  { id: "cat-cow", name: "Cat-Cow", type: "mobility" },
  { id: "pigeon", name: "Pigeon Stretch", type: "mobility" },
];
const flow: Workout = {
  id: "flow",
  name: "Mobility Flow",
  type: "mobility",
  exercises: [
    { id: "f1", exerciseId: "cat-cow", target: { kind: "timed", sets: 1, workSeconds: 60, restSeconds: 10 } },
    { id: "f2", exerciseId: "pigeon", target: { kind: "timed", sets: 1, workSeconds: 60, restSeconds: 0 } },
  ],
};
const timedSet = async (id: string) => ((await getActiveSession())!.exercises.find((e) => e.id === id) as TimedSessionExercise).sets[0];

useFreshDb();
beforeEach(() => {
  saveModePreference("workout");
  stubConfigFetch({ "exercises.json": exercises, "workouts.json": [flow], "schedule.json": {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("interval Back button", () => {
  it("undoes an accidental skip: the set is reopened and the step runs again", async () => {
    const user = userEvent.setup();
    const s = createSession(flow, exercises);
    await putActiveSession(s);
    // 10 s into Cat-Cow (after the 5 s get-ready).
    await putIntervalTimer(startIntervals(buildIntervalPlan(s, "f1"), Date.now() - 15_000));
    renderApp(`/workout/${s.id}/intervals`);

    await user.click(await screen.findByRole("button", { name: "Skip this set" }));
    await waitFor(async () => expect((await timedSet("f1")).status).toBe("skipped"));
    expect(await screen.findByText("Rest")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^back/i }));
    await waitFor(async () => expect((await timedSet("f1")).status).toBe("pending"));
    expect(await screen.findByText("Work")).toBeInTheDocument();
    expect(within(screen.getByRole("timer")).getByText("01:00")).toBeInTheDocument(); // the full minute again
    expect((await getIntervalTimer())?.skippedSteps).toEqual([]);
  });
});

describe("resuming a finished workout", () => {
  it("picks up a cut-short workout from its summary", async () => {
    const user = userEvent.setup();
    let s = createSession(flow, exercises, new Date(Date.now() - 3 * 3600_000));
    s = completeTimedSet(s, "f1");
    const done = finishSession(s, new Date(Date.now() - 3 * 3600_000 + 5 * 60_000)); // cut short after 5 min
    await commitCompletedSession(done);

    const { router } = renderApp(`/history/${done.id}`);
    await user.click(await screen.findByRole("button", { name: /resume workout · 1 unfinished/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/workout/${done.id}`));

    const active = await getActiveSession();
    expect(active).toMatchObject({ id: done.id, status: "active" });
    expect((active!.exercises[1] as TimedSessionExercise).sets[0].status).toBe("pending");
    expect(await listSessions()).toEqual([]); // no longer in history while active
    // The 3-hour break isn't counted: the clock shows ~5 minutes.
    expect(await screen.findByText(/^0[45]:\d\d$/)).toBeInTheDocument();
  });

  it("won't replace a workout that's already in progress", async () => {
    const done = finishSession(createSession(flow, exercises));
    await commitCompletedSession(done); // (finishing clears the active slot, so start the other workout after)
    await putActiveSession(createSession(flow, exercises));
    renderApp(`/history/${done.id}`);
    expect(await screen.findByText(/finish or discard mobility flow first/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resume workout/i })).not.toBeInTheDocument();
  });
});
