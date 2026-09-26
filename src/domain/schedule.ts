import { WEEKDAYS, type Weekday, type WeeklySchedule } from "./types";

export function emptySchedule(): WeeklySchedule {
  return {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
}

/** JS getDay(): 0 = Sunday. */
export function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[(date.getDay() + 6) % 7];
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
