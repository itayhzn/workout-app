import { WEEKDAYS, type Weekday, type WeeklySchedule, type Workout, type WorkoutSession } from "./types";

export function emptySchedule(): WeeklySchedule {
  return Object.fromEntries(WEEKDAYS.map((d) => [d, []])) as unknown as WeeklySchedule;
}

/** JS getDay() is 0 for Sunday, matching WEEKDAYS. */
export function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[date.getDay()];
}

export function weekdayLabel(day: Weekday, short = false): string {
  const label = day[0].toUpperCase() + day.slice(1);
  return short ? label.slice(0, 3) : label;
}

export function workoutsForDay(schedule: WeeklySchedule, day: Weekday): string[] {
  return schedule[day] ?? [];
}

export function daysForWorkout(schedule: WeeklySchedule, workoutId: string): Weekday[] {
  return WEEKDAYS.filter((d) => schedule[d].includes(workoutId));
}

export function removeWorkoutFromSchedule(
  schedule: WeeklySchedule,
  workoutId: string,
): WeeklySchedule {
  const next = emptySchedule();
  for (const d of WEEKDAYS) next[d] = schedule[d].filter((id) => id !== workoutId);
  return next;
}

export interface TodaySlot {
  /** The workout scheduled in this slot. */
  workout: Workout;
  /** The finished session that took care of it (the same workout, or another one of the same type in its place). */
  doneBy?: WorkoutSession;
  /** The workout in progress fills this slot. */
  active?: boolean;
}

function sameDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/**
 * Today's scheduled workouts and which are done. Each workout finished today (and the one in progress)
 * fills its own slot, or else the first open slot of the same type, so swapping in another lift or
 * another cardio still counts: Pull B on a Legs A day takes the lifting slot and the day's cardio is next.
 */
export function todaysPlan(
  schedule: WeeklySchedule,
  workouts: Workout[],
  sessions: WorkoutSession[],
  active: WorkoutSession | undefined,
  now: Date = new Date(),
): TodaySlot[] {
  const slots: TodaySlot[] = workoutsForDay(schedule, weekdayOf(now))
    .map((id) => workouts.find((w) => w.id === id))
    .filter((w): w is Workout => !!w)
    .map((workout) => ({ workout }));
  const fill = (s: WorkoutSession, mark: (slot: TodaySlot) => void) => {
    const open = slots.filter((slot) => !slot.doneBy && !slot.active);
    const slot = open.find((x) => x.workout.id === s.workoutId) ?? open.find((x) => s.workoutType !== undefined && x.workout.type === s.workoutType);
    if (slot) mark(slot);
  };
  sessions
    .filter((s) => s.status === "completed" && s.completedAt && sameDay(s.completedAt, now) && s.id !== active?.id)
    .sort((a, b) => a.completedAt!.localeCompare(b.completedAt!))
    .forEach((s) => fill(s, (slot) => (slot.doneBy = s)));
  if (active) fill(active, (slot) => (slot.active = true));
  return slots;
}

/** The first scheduled workout today that's neither done nor in progress. */
export function nextToday(slots: TodaySlot[]): Workout | undefined {
  return slots.find((s) => !s.doneBy && !s.active)?.workout;
}
