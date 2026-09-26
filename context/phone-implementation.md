# Workout App — Phone Implementation Design

## 1. Scope

The phone app is the workout-execution experience.

Its responsibilities are:

- Determine the scheduled workout(s) for the current day
- Allow selection of any workout
- Start and resume workout sessions
- Track exercise/set completion
- Allow per-set edits
- Run a persistent rest timer
- Persist the active workout locally
- Store completed workout sessions
- Expose recent workout history

The phone app should remain usable when offline.

---

# 2. Hosting and Runtime

- Static site hosted on GitHub Pages
- Client-side application only
- Recommended stack:
  - React
  - TypeScript
  - Vite
  - React Router or equivalent lightweight client routing
- Persistent browser storage:
  - IndexedDB preferred
  - Small UI preferences may use localStorage

The app must not depend on a live backend for completing a workout.

---

# 3. Core Data Model

## 3.1 Exercise

Represents a reusable exercise definition.

```ts
type ExerciseType =
  | "strength"
  | "cardio"
  | "swimming"
  | "other";

interface Exercise {
  id: string;
  name: string;
  type: ExerciseType;
  imagePath?: string;
  tips?: string[];
}
```

No historical performance should be stored directly inside the exercise.

---

## 3.2 Workout

Represents a reusable workout template.

```ts
interface Workout {
  id: string;
  name: string;
  type: "strength" | "aerobic" | "mixed" | "other";
  exercises: WorkoutExercise[];
}
```

### Strength prescription

```ts
interface StrengthTarget {
  kind: "strength";
  sets: number;
  reps: number;
  weightKg?: number;
  restSeconds: number;
}
```

### Cardio prescription

```ts
interface CardioTarget {
  kind: "cardio";
  durationMinutes?: number;
  distanceKm?: number;
  targetPace?: string;
}
```

### Swimming prescription

```ts
interface SwimmingTarget {
  kind: "swimming";
  durationMinutes?: number;
  distanceMeters?: number;
}
```

### Workout exercise

```ts
interface WorkoutExercise {
  id: string;
  exerciseId: string;
  target: StrengthTarget | CardioTarget | SwimmingTarget;
}
```

`id` should identify the item inside the workout template, independently of the shared `exerciseId`.

---

## 3.3 Schedule

```ts
type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

interface Schedule {
  [day: string]: string[]; // workout IDs
}
```

Example:

```json
{
  "monday": ["push"],
  "tuesday": ["running"],
  "wednesday": ["pull"],
  "thursday": [],
  "friday": ["legs"],
  "saturday": ["swimming"],
  "sunday": []
}
```

Completed-workout history must not be stored in the schedule.

---

# 4. Workout Session Model

A workout session is an immutable historical instance of a workout, except while it is actively being recorded.

```ts
interface WorkoutSession {
  id: string;
  workoutId: string;
  workoutName: string;

  startedAt: string;
  completedAt?: string;

  status: "active" | "completed" | "abandoned";

  exercises: SessionExercise[];

  notes?: string;
}
```

The workout name is copied into the session so historical records remain readable even if a workout is renamed later.

---

## 4.1 Strength session exercise

```ts
interface StrengthSetResult {
  setNumber: number;
  targetReps?: number;
  reps?: number;
  weightKg?: number;
  completedAt?: string;
  status: "pending" | "completed" | "skipped";
}

interface StrengthSessionExercise {
  kind: "strength";
  id: string;
  exerciseId: string;
  exerciseName: string;

  prescribed: StrengthTarget;
  sets: StrengthSetResult[];

  status: "pending" | "in_progress" | "completed" | "skipped";
  notes?: string;
}
```

Actual values are stored per set.

---

## 4.2 Cardio session exercise

```ts
interface CardioSessionExercise {
  kind: "cardio";
  id: string;
  exerciseId: string;
  exerciseName: string;

  prescribed: CardioTarget;

  actualDurationSeconds?: number;
  actualDistanceKm?: number;

  status: "pending" | "in_progress" | "completed" | "skipped";
  notes?: string;
}
```

Equivalent specialized objects may be created for swimming if useful.

---

# 5. Configuration Files

Repository structure:

```text
/data
  exercises.json
  workouts.json
  schedule.json

/images
  pull-ups.webp
  bench-press.webp
  ...

src/
...
```

The phone app loads configuration from these JSON files at startup.

Recommended behavior:

1. Attempt to fetch latest config files.
2. Cache successfully loaded config in IndexedDB.
3. If fetch fails, use cached config.
4. Do not block an active workout because configuration refresh failed.

---

# 6. IndexedDB Stores

Recommended stores:

```text
configCache
workoutSessions
activeWorkout
appState
syncQueue
```

## configCache

Cached latest versions of:

- Exercises
- Workouts
- Schedule

## workoutSessions

Completed sessions.

## activeWorkout

At most one active workout session in v1.

## appState

Small persistent settings, e.g.:

- Last selected workout
- Timer sound preference
- Dark mode preference

## syncQueue

Optional future GitHub synchronization queue.

---

# 7. Starting a Workout

When user starts a workout:

1. Load the selected workout template.
2. Resolve each referenced exercise.
3. Deep-copy relevant template values into a new `WorkoutSession`.
4. Create pending set rows for strength exercises.
5. Generate a unique session ID.
6. Set `startedAt`.
7. Save immediately to IndexedDB as the active workout.
8. Navigate to the workout screen.

Historical sessions must never point to mutable template objects as their only source of truth.

---

# 8. Active Workout Persistence

Every meaningful mutation should persist immediately or near-immediately.

Examples:

- Completing a set
- Editing reps
- Editing weight
- Skipping an exercise
- Starting a rest timer
- Editing notes

Avoid requiring an explicit global Save action.

If the tab reloads or the browser is killed, reopening the app should detect the active workout and offer:

> Resume Workout

---

# 9. Rest Timer

The timer should be represented using an absolute end timestamp.

```ts
interface RestTimerState {
  exerciseId: string;
  setNumber: number;
  endsAt: number; // Unix ms
  originalDurationSeconds: number;
}
```

Do not persist an integer counter that decrements every second.

Remaining time:

```ts
Math.max(0, endsAt - Date.now())
```

This keeps the timer correct through:

- Browser throttling
- Screen lock
- Page navigation
- App resume

The timer state should persist in IndexedDB or app state.

---

# 10. Completing a Strength Set

When user taps **Complete Set**:

1. Determine the next pending set.
2. Apply the currently displayed weight/reps values.
3. Mark set as completed.
4. Store `completedAt`.
5. Persist session.
6. Start rest timer unless this was the final set.
7. If all sets are complete, mark exercise completed.

The UI may allow edits after completion.

---

# 11. Editing Target Values During a Session

Values such as:

- Weight
- Reps
- Sets
- Rest duration

may be changed during a session.

Rules:

- The workout template is not automatically modified.
- The active session may diverge from the template.
- Edits should affect upcoming sets unless the user explicitly edits completed sets.

Potential future feature:

> Use today's values as new defaults

This should be a separate explicit action.

---

# 12. Exercise Completion

A strength exercise is complete when:

- All non-skipped sets are completed, or
- User explicitly marks/skips the exercise

The app may automatically return to the workout screen after a short completion state, but should preserve the ability to review/edit the exercise.

---

# 13. Finishing a Workout

When user selects **Finish Workout**:

1. Permit completion even if some exercises are unfinished.
2. Prompt or automatically mark unfinished exercises as skipped.
3. Set `completedAt`.
4. Set session status to `completed`.
5. Move the session from active storage to workout history.
6. Clear active-workout state.
7. Show workout summary.

Session duration is:

```ts
completedAt - startedAt
```

---

# 14. Recent Workout History

The home screen should query the latest completed sessions sorted descending by `completedAt`.

Suggested default:

- Last 5 sessions shown inline
- Dedicated history detail available by tapping a session

No large analytics layer is required in v1.

---

# 15. Navigation

Suggested routes:

```text
/
  Home / workout selection

/workout/:sessionId
  Active workout overview

/workout/:sessionId/exercise/:sessionExerciseId
  Active exercise

/history/:sessionId
  Completed session detail
```

Guard active-workout routes against stale or missing session IDs.

---

# 16. Device Mode

The same deployed site may contain both phone and desktop experiences.

Recommended routing behavior:

- Small/coarse-pointer devices default to workout mode.
- Desktop devices default to management mode.
- Always provide a manual way to switch modes if needed.

Do not rely exclusively on user-agent sniffing.

Useful signals:

- viewport width
- `pointer: coarse`
- `hover: none`

---

# 17. GitHub Sync Strategy

GitHub Pages cannot directly mutate repository files without using the GitHub API.

Recommended v1:

- Read configuration from repository JSON.
- Store workout history locally in IndexedDB.
- Keep sync abstraction isolated for later extension.

Recommended future v2:

- Explicit user-triggered **Sync** action.
- Authenticate with GitHub.
- Push local workout-session history to repository files.

Do not make GitHub sync part of the critical path for set completion.

---

# 18. Possible History File Layout for Sync

Avoid one permanently growing `history.json`.

Preferred options:

```text
/data/history/2026-09.json
/data/history/2026-10.json
```

or:

```text
/data/sessions/2026-09-26-pull-<id>.json
```

Monthly files are a reasonable balance for a personal app.

---

# 19. Offline Behavior

The app should support:

- Opening cached workout configuration
- Resuming active workout
- Recording sets
- Finishing a workout
- Viewing locally stored history

without network connectivity.

Configuration refresh and future GitHub sync may fail independently without losing workout data.

---

# 20. Error Handling

Critical rule:

**Never lose recorded workout progress because of a failed fetch or sync.**

Handle:

- Missing exercise referenced by workout
- Corrupted config
- Failed JSON fetch
- IndexedDB error
- Stale active session
- Missing images

Missing images should use a neutral placeholder.

If a workout references a missing exercise, render a recoverable error instead of crashing the workout.

---

# 21. Future-Compatible Features

The model should leave room for:

- Personal records
- Workout analytics
- Progression recommendations
- RPE/RIR
- Supersets
- Timed intervals
- Multiple active timers
- Workout cloning
- Program/training-block entities
- Cloud synchronization
- Import/export

These should not complicate v1 unless needed.
