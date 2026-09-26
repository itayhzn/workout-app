# Workout App — Computer Implementation Design

## 1. Scope

The computer app is the management interface for the workout system.

Its responsibilities are:

- Manage the exercise library
- Create/edit/delete workout templates
- Configure workout-specific exercise targets
- Reorder workout exercises
- Edit the weekly schedule
- Review completed workout history
- Persist configuration changes back to repository-backed storage

The management UI should use the same core data model as the phone app.

---

# 2. Hosting and Runtime

- Static site hosted on GitHub Pages
- Recommended stack:
  - React
  - TypeScript
  - Vite
  - React Router
- No always-on backend is required

The desktop app may use the GitHub API for authenticated writes.

---

# 3. Shared Data Model

The desktop and phone applications should share TypeScript definitions for:

- `Exercise`
- `Workout`
- `WorkoutExercise`
- Target types
- `Schedule`
- `WorkoutSession`

Prefer a shared module:

```text
src/
  domain/
    exercise.ts
    workout.ts
    schedule.ts
    session.ts
```

or:

```text
src/domain/types.ts
```

Avoid separate incompatible models for phone and desktop.

---

# 4. Repository Data Layout

Recommended repository structure:

```text
/data
  exercises.json
  workouts.json
  schedule.json
  history/
    2026-09.json
    2026-10.json

/images
  pull-ups.webp
  bench-press.webp
  ...

src/
...
```

The exact history layout may be deferred if workout history remains local-only in v1.

---

# 5. Exercise Management

## 5.1 List exercises

Load `exercises.json`.

Support:

- View all exercises
- Sort by name
- Optional filter by type
- Add
- Edit
- Delete/archive

## 5.2 Add exercise

Create a stable ID.

Recommended ID format:

```text
pull-ups
bench-press
```

or generated UUIDs.

If slugs are used, IDs must not change simply because the exercise is renamed.

Safer approach:

- Generate UUID ID
- Store display name independently

Example:

```ts
interface Exercise {
  id: string;
  name: string;
  type: ExerciseType;
  imagePath?: string;
  tips?: string[];
}
```

## 5.3 Image handling

No upload UI is required.

The editor stores a repository-relative path:

```text
/images/pull-ups.webp
```

The UI should preview the path and handle missing images gracefully.

## 5.4 Deletion constraints

Before deleting an exercise:

- Detect workouts that reference it.
- Prevent destructive deletion unless references are removed or user explicitly resolves them.

Preferred v1 behavior:

> Exercise is used by 2 workouts and cannot be deleted.

An archive flag can be added later if needed.

---

# 6. Workout Management

## 6.1 Workout entity

```ts
interface Workout {
  id: string;
  name: string;
  type: "strength" | "aerobic" | "mixed" | "other";
  exercises: WorkoutExercise[];
}
```

## 6.2 Create workout

Required:

- Name
- Type

Then allow adding exercises.

## 6.3 Add exercise

Select from exercise library.

A workout-specific item is created:

```ts
interface WorkoutExercise {
  id: string;
  exerciseId: string;
  target: ExerciseTarget;
}
```

The `target` type should match the exercise category.

## 6.4 Reordering

Store order directly as array order.

Drag-and-drop should mutate the `exercises` array.

Provide accessible move-up/move-down controls as fallback.

## 6.5 Editing targets

Strength:

```ts
interface StrengthTarget {
  kind: "strength";
  sets: number;
  reps: number;
  weightKg?: number;
  restSeconds: number;
}
```

Cardio:

```ts
interface CardioTarget {
  kind: "cardio";
  durationMinutes?: number;
  distanceKm?: number;
  targetPace?: string;
}
```

Swimming:

```ts
interface SwimmingTarget {
  kind: "swimming";
  durationMinutes?: number;
  distanceMeters?: number;
}
```

Targets belong to the workout-exercise relationship, not to the global exercise entity.

This allows:

- Pull Ups in one workout: 4 × 8
- Pull Ups in another workout: 5 × 5

---

# 7. Weekly Schedule Management

## 7.1 Schedule model

```ts
interface WeeklySchedule {
  monday: string[];
  tuesday: string[];
  wednesday: string[];
  thursday: string[];
  friday: string[];
  saturday: string[];
  sunday: string[];
}
```

Each array contains workout IDs.

## 7.2 Editing rules

Support:

- Add workout to day
- Remove workout from day
- Multiple workouts per day
- Reorder workouts within the day

Do not store completion status inside the schedule.

---

# 8. History Viewer

The computer app reads workout-session history from:

- IndexedDB if running on the same browser/device, and/or
- Synced repository history files in a later version

History should remain conceptually separate from workout templates.

## Session list

Sort descending by completion date.

Fields:

- Date
- Workout name
- Duration
- Exercise completion count

## Session detail

Render snapshot data stored inside the session.

Historical display should not depend entirely on the current workout template.

For example, if a workout is renamed later, the session should still retain enough snapshot information to be intelligible.

---

# 9. Persistence Strategy

There are two distinct categories of data:

## Configuration

- exercises
- workouts
- schedule

These are repository-backed and suitable for GitHub persistence.

## Runtime/history

- active workout
- completed sessions

These should be local-first.

Do not force both categories through the exact same persistence mechanism.

---

# 10. GitHub Write Design

Because GitHub Pages is static hosting, editing repository JSON requires authenticated GitHub API calls.

Possible implementation:

1. User authenticates.
2. App fetches current file content and SHA.
3. User edits data locally in UI.
4. On save:
   - Serialize JSON
   - Send GitHub Contents API update
   - Include latest SHA
5. GitHub creates commit.

Avoid committing on every field keystroke.

Use explicit save boundaries, for example:

- Save Exercise
- Save Workout
- Save Schedule

Potential optimization later:

- Stage multiple changes and commit once

---

# 11. Authentication

Do not embed a long-lived GitHub personal access token directly into the source repository.

Possible approaches:

- Manual token entered at runtime and stored only locally
- GitHub OAuth with an external auth helper/backend
- GitHub fine-grained token for a private personal workflow

For the simplest personal-only implementation, runtime token entry may be acceptable if the user understands the tradeoff.

Keep GitHub authentication code isolated behind a repository service abstraction.

Example:

```ts
interface ConfigRepository {
  loadExercises(): Promise<Exercise[]>;
  saveExercises(items: Exercise[]): Promise<void>;

  loadWorkouts(): Promise<Workout[]>;
  saveWorkouts(items: Workout[]): Promise<void>;

  loadSchedule(): Promise<WeeklySchedule>;
  saveSchedule(schedule: WeeklySchedule): Promise<void>;
}
```

Then provide:

```text
StaticJsonRepository
GitHubRepository
```

This prevents the UI from depending directly on GitHub-specific API details.

---

# 12. Conflict Handling

GitHub file writes may fail if the repository changed after loading.

Use file SHA/version checks.

On conflict:

1. Do not overwrite blindly.
2. Fetch latest version.
3. Inform user that the source changed.
4. Offer a safe reload/merge path.

Because this is a personal app, conflicts should be rare, but the implementation should not silently destroy newer repository data.

---

# 13. Local Draft State

While editing:

- Keep form state locally in React state.
- Optionally autosave unsaved drafts in IndexedDB/localStorage.

Do not commit each edit instantly to GitHub.

A page reload with unsaved changes may restore the draft if easy to support.

---

# 14. Validation

Validate before save.

## Exercise

- Name required
- Type required
- Image path optional
- Tips optional

## Workout

- Name required
- Type required
- Exercise IDs must exist
- Strength sets > 0
- Strength reps > 0
- Rest seconds >= 0
- Weight may be absent for bodyweight exercises

## Schedule

- Every referenced workout ID must exist

Show validation errors close to the relevant field.

---

# 15. Referential Integrity

Before saving configuration:

- Every workout exercise must reference an existing exercise.
- Every scheduled workout must reference an existing workout.
- IDs must be unique.
- Workout-exercise IDs must be unique within their workout.

Create a reusable validation layer.

Example:

```ts
validateConfiguration({
  exercises,
  workouts,
  schedule
})
```

---

# 16. Desktop Routes

Suggested routes:

```text
/manage/exercises
/manage/exercises/:exerciseId

/manage/workouts
/manage/workouts/:workoutId

/manage/schedule

/manage/history
/manage/history/:sessionId
```

If phone and desktop share one React app, `/manage/*` clearly separates management pages from workout execution pages.

---

# 17. State Management

The app is small enough that heavy global state infrastructure is optional.

Reasonable options:

- React Context + reducer
- Zustand
- TanStack Query for repository reads/writes plus local form state

Recommended separation:

```text
domain state
repository/network state
form/UI state
```

Avoid one giant global object containing everything.

---

# 18. Recommended Service Layer

```text
src/
  domain/
  repositories/
    configRepository.ts
    githubRepository.ts
    staticJsonRepository.ts
  services/
    workoutService.ts
    scheduleService.ts
    historyService.ts
  storage/
    indexedDb.ts
  pages/
    phone/
    manage/
  components/
```

This allows the coding agent to keep business rules independent of UI components.

---

# 19. JSON Formatting

Repository JSON files should remain human-readable.

Recommended:

```ts
JSON.stringify(data, null, 2)
```

Stable ordering is useful where practical to avoid noisy commits.

Avoid rewriting unrelated files when saving one entity type.

---

# 20. History Synchronization — Future Extension

Potential future flow:

1. Phone stores completed sessions locally.
2. User presses Sync.
3. Unsynced sessions are grouped by month.
4. App fetches current monthly history file.
5. Merge by session ID.
6. Commit updated file.
7. Mark local sessions as synced.

Sync must be idempotent.

Duplicate session IDs must not create duplicate history entries.

This functionality can be omitted from initial desktop implementation if history remains local-only.

---

# 21. Device / Mode Selection

The app may share one codebase.

Default behavior:

- Desktop/coarse heuristic → `/manage/workouts` or last management page
- Mobile/coarse-pointer heuristic → phone home

Provide a mode switch so the user is not locked into automatic detection.

---

# 22. Testing Priorities

Highest-value tests:

## Domain

- Workout session creation copies template values
- Referential-integrity validation
- Schedule validation
- Strength set initialization
- Session completion rules

## Persistence

- IndexedDB active-session recovery
- Static JSON loading fallback
- GitHub write conflict handling
- JSON serialization

## UI

- Add/edit/delete exercise
- Add/reorder workout exercise
- Edit target values
- Edit schedule
- Resume active workout
- Complete set and persist

---

# 23. Non-Goals for v1

Avoid adding unless specifically requested:

- Social profiles
- Friends/following
- Leaderboards
- Calorie estimation
- AI coaching
- Complex dashboards
- Training-readiness scoring
- Automatic progression algorithms
- Wearable integration
- Image uploading
- Cloud backend

The initial product should remain a reliable personal workout manager.
