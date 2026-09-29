# Developer Onboarding — Kinetic Workout

This guide gives you what you need to work on the app: what it does, how it's put together, where data lives, and the rules that aren't obvious from reading the code. For the history of what was built and why, see [`implementation-log.md`](implementation-log.md).

---

## 1. What the app is

A personal workout app that runs entirely as a static site on **GitHub Pages**. There is no backend. One build contains two experiences that share a single data model:

| Mode | Device | Purpose | Routes |
|---|---|---|---|
| **Workout mode** | Phone | Run today's workout: log sets, rest timer, interval timer, cardio/swim logging, finish summary, recent history | `/`, `/workout/*`, `/history/*` |
| **Management mode** | Desktop | Edit the exercise library, workout templates, weekly schedule; review history; settings | `/manage/*` |

The mode is chosen per device. Phones and touch screens get workout mode; desktops get management mode. A saved preference overrides that default (see `services/settings.ts`).

**Several people (family and friends) share the app.** Each person has their own plan, history and preferences in one shared private data repo, and everyone can see and edit everyone. Each device picks who it belongs to ("Who's working out?") and can switch person at any time. Without a connection, the app runs as a single local user on the starter plan that ships with the site.

The original product specs and mockups are in this folder (`phone-*.md`, `computer-*.md`, `*_screen_design.zip`). The visual design system ("Kinetic Obsidian") is described in `DESIGN.md` inside the zips.

---

## 2. Quick start

```sh
npm install
npm run dev          # http://localhost:5173 — add #/manage/workouts for desktop mode
npm test             # Vitest: unit + integration (jsdom + fake-indexeddb)
npm run typecheck    # tsc -b
npm run build        # typecheck + production build into dist/
npm run preview      # serve dist/ at http://localhost:4173 (includes the service worker)
```

Node 24+ is expected (CI uses 24). To try the phone UI on a desktop browser, narrow the window below 768px or switch the mode in Settings.

**Toolchain versions.** These are recent majors, so some docs you find online won't match:

- **TypeScript 7** (native compiler). The flags are the usual ones.
- **Vite 8**, **Vitest 4**, **React 19**, **React Router 7** (imported from `react-router-dom`).
- **Tailwind CSS v4**, configured in CSS rather than a `tailwind.config.js`. See §9.
- **lucide-react 1.x.** Some icon names changed, and brand icons such as `Github` were removed. Check that a name exists before using it: `node -e 'console.log(!!require("lucide-react").IconName)'`.

---

## 3. Hosting constraints (read this first)

GitHub Pages serves static files only. These constraints drive the design:

- **Hash routing** (`createHashRouter`). URLs look like `/workout-app/#/workout/<id>`, so deep links and reloads never hit a missing server path.
- **Relative base** (`base: "./"` in `vite.config.ts`). The build works under any Pages sub-path. Image and data URLs are resolved with `import.meta.env.BASE_URL`.
- **No server writes.** Plans, history and preferences are read and written in a **private data repo** (`workout-data`) through the **GitHub Contents API**, with one shared token entered on each device (§6.3–6.5). Runtime data such as the active workout and history stays on the device in **IndexedDB**.
- **Offline.** `vite-plugin-pwa` precaches the app shell. Config JSON uses network-first caching and images use cache-first. Fonts come from `@fontsource`, not a CDN, so they work offline too.
- **Deploy.** `.github/workflows/deploy.yml` runs tests, builds and deploys `dist/` on every push to `main`. In the repo settings, Pages → Source must be set to **GitHub Actions**.

---

## 4. Code layout and layering

```
src/
  domain/        Pure TypeScript: types, rules, formatting. No React, no I/O. Most heavily tested.
    types.ts       The shared data model (§5)
    session.ts     Session creation and every mutation (complete set, finish, skip, …)
    intervals.ts   Interval-timer engine for timed exercises
    groups.ts      Supersets/circuits: grouping, normalizing, rotation order
    validation.ts  Field + referential-integrity validation
    config.ts      Defensive JSON parsing, canonical serialization, default targets
    format.ts      Display formatting (weights, targets, durations, estimates)
    units.ts       kg ⇄ lbs conversion
    schedule.ts    Weekday helpers (week starts Sunday)
  storage/       indexedDb.ts — the only module that touches IndexedDB
  repositories/  ConfigRepository interface + Static / GitHub / Local implementations
  services/      Orchestration and side effects: config loading/fallback, history import/export,
                 device settings, audio/vibration/wake lock
  state/         React contexts and hooks: ConfigContext, ActiveWorkoutContext, history, units
  hooks/         useNow (clock tick)
  components/    Shared UI (ui.tsx primitives, SessionDetail, ExerciseImage, steppers, …)
  pages/phone/   Workout-mode screens
  pages/manage/  Management-mode screens
  test/          Test setup, fixtures, render helper
  App.tsx        Routes + providers
  main.tsx       Entry: fonts, CSS, service worker registration
public/
  data/          exercises.json, workouts.json, schedule.json — the shipped config
  images/        Exercise images (none yet; placeholders are rendered)
```

**Dependency direction:** `pages → components/state → services/repositories/storage → domain`. Domain code never imports from outer layers. Put business rules in `domain/`, where they're pure and easy to test, and keep components thin.

---

## 5. Data model (`src/domain/types.ts`)

There are two kinds of data, and they are stored and saved in completely different ways:

| Kind | Entities | Source of truth | Persistence |
|---|---|---|---|
| **Configuration** (per person) | `Exercise`, `Workout` (+ `WorkoutExercise` targets), `WeeklySchedule` | `people/<id>/plan/*.json` in the data repo. `public/data/` in the app repo is only the **starter plan**: a template for new people and what the site shows when not connected | Committed via GitHub API, or kept as browser-local edits |
| **Runtime / history** | `WorkoutSession`, `RestTimerState`, `IntervalTimerState` | The device | IndexedDB only (history can be exported and imported as JSON) |

### Key entities
- **`Exercise`**: a reusable definition (`id`, `name`, `type`, `imagePath?`, `tips?`). `type` is `strength | cardio | swimming | mobility | other`. It sets the default target kind and the icon; it doesn't limit which target kind can be used.
- **`Workout`**: a template with an ordered list of `WorkoutExercise` items. Array order *is* the exercise order. Each item has its own `id` (unique within the workout) plus an `exerciseId`, so the same exercise can appear twice with different targets. The optional `leaveBy: "HH:MM"` turns into a countdown during the session (`WorkoutSession.leaveByAt`, set only if that time is still ahead when the session starts).
- **Groups**: consecutive items with the same `WorkoutExercise.group` id are done **in rotation**, one set of each per round. For strength targets that's a **superset**; for timed targets it's a **circuit**, and rounds = `sets`. Rest comes from the **last member** of the group, at the end of each round. `normalizeGroups` keeps groups contiguous with at least two members, and must run after anything that reorders or removes items (the editor and `canonicalWorkout` already call it).
- **Targets** (`ExerciseTarget`), discriminated by `kind`:
  - `strength`: `sets`, `reps` (the bottom of the range), `repsMax?` (the top of the range, e.g. 8–12), `weightKg?` (absent means bodyweight, shown as "BW"), `restSeconds`
  - `timed`: `sets`, `workSeconds`, `restSeconds` (planks, abs circuits, mobility holds)
  - `cardio`: `durationMinutes?`, `distanceKm?`, `targetPace?` (`"m:ss"`)
  - `swimming`: `durationMinutes?`, `distanceMeters?`
- **`WeeklySchedule`**: `Record<Weekday, workoutId[]>`, with several workouts allowed per day. It never stores whether a workout was done.
- **`WorkoutSession`**: a *snapshot* made when a workout starts. It copies `workoutName`, `workoutType`, each exercise's name and a deep copy of each target (`prescribed`). History must stay readable even if the template is renamed or deleted later. `status` is `active | completed | abandoned`.
- **Session exercises**: `StrengthSessionExercise` and `TimedSessionExercise` are *set-based* (they have a `sets[]` array). `CardioSessionExercise` and `SwimmingSessionExercise` are *activities* (actual duration/distance, plus an optional running stopwatch `timerStartedAt`). Use `isSetBased(ex)` rather than checking `kind === "strength"`.

### Invariants you must keep
1. **Weights are always stored in kg** (`weightKg`). The kg/lbs setting only affects display and input. Convert at the UI edge with `domain/units.ts`, `WeightStepper`, and the `unit` argument to the `format*` functions. Never store lbs.
2. **Sessions never point at mutable templates.** `createSession` uses `structuredClone` on targets. Code that renders a session reads the snapshot and only looks up the live `Exercise` for optional extras (image, tips).
3. **Domain functions are pure** and return new objects (`session.ts`, `intervals.ts`). There is a test that checks inputs aren't mutated.
4. **Timers use absolute timestamps, never counters.** Rest: `endsAt`. Intervals: `startedAt`, `pausedAt`, `skippedSteps`. Remaining time is always computed from `Date.now()`, which keeps timers correct through throttled tabs, screen lock and reloads.
5. **The week starts on Sunday.** `WEEKDAYS` in `types.ts` is the one source of day order (schedule UI, labels, JSON key order). `weekdayOf(date)` maps `Date.getDay()` straight onto it.
6. **New entity IDs are UUIDs** (`domain/ids.ts`). The seed data uses readable slugs. Either way, IDs never change when something is renamed.

---

## 6. Persistence

### 6.1 IndexedDB (`storage/indexedDb.ts`, database `kinetic-workout`, version 1)
| Store | Keys | Contents |
|---|---|---|
| `configCache` | `"config"` | Last good config + `source` (`static`/`github`/`local`) + `localEdits` flag |
| `workoutSessions` | `id` (index `completedAt`) | Completed sessions (history), including ones downloaded from other devices |
| `activeWorkout` | `"session"`, `"restTimer"`, `"intervalTimer"` | The one in-progress session and its timers |
| `appState` | free-form | `lastSelectedWorkout`; `syncState` (last seen SHA per month file, last sync time, whether the first upload has been done) |
| `syncQueue` | `sessionId` | Sessions waiting to be uploaded by sync (finished workouts, imports, first-sync backfill) |

`commitCompletedSession` moves a finished session into history, clears the active state and adds the session to `syncQueue` in **one transaction**. If it fails, the active workout is left untouched.

When you change the schema, increase `DB_VERSION` and handle the migration in `upgrade()`.

### 6.2 localStorage (small per-device preferences only)
| Key | Meaning |
|---|---|
| `kinetic.mode` | `"workout"` / `"manage"` (absent means auto-detect) |
| `kinetic.connection` | The shared data repo `{ owner, repo, branch, token }` (never committed). Replaces the single-user `kinetic.github`, which is migrated automatically |
| `kinetic.person` | The active person's id on this device |
| `kinetic.people` | Cached list of people (from `people.json`), for offline use |
| `kinetic.dbNames` | Which IndexedDB database belongs to which person on this device |
| `kinetic.p.<person>.weightUnit` / `.timerSound` / `.prefsUpdatedAt` | Per-person preferences. Reads fall back to the old device-wide `kinetic.<name>` keys |
| `kinetic.exerciseView` | `"grid"` / `"table"` on the Exercises page |
| `kinetic.activeSessionBackup` | Mirror of the active session, in case IndexedDB fails |

### 6.3 Configuration load and save (`services/configService.ts`, `state/ConfigContext.tsx`)
**Load order:**
1. If the cache holds unpublished **local edits**, use them (never discard them silently).
2. Otherwise load from the **remote**: the active person's `people/<id>/plan/` in the data repo when connected, else the starter plan deployed with the site. Then refresh the cache.
3. If that fails (offline or corrupt JSON), use the **cached copy** and show a banner. Only if there's no cache does the app show an error. A failed config refresh never blocks an active workout.

**Saves are per entity.** Examples: `saveExercise`, `deleteExercise`, `saveWorkout`, `deleteWorkout` (removes the workout from the schedule first), `saveSchedule`. Each one validates, applies the change to the latest in-memory config, and writes **one file**.
- **Connected to GitHub:** `GitHubRepository` PUTs the file with the SHA from the last read. HTTP 409 (or 422 without a SHA) becomes a `ConflictError`. The context then reloads the latest data and rethrows. Editors keep their draft, so the user reviews and saves again, and the change lands on the latest file. Nothing is overwritten blindly.
- **Not connected:** `LocalConfigRepository` writes to `configCache` with `localEdits: true`. Settings offers **Publish to GitHub**, **Export JSON files**, or **Discard**.
- Saved JSON is canonical (`config.ts`): stable key order, no `undefined`/empty fields, 2-space indent and a trailing newline, so commits stay small.

### 6.4 Cross-device sync (`services/syncService.ts`, `state/SyncContext.tsx`)
The active person's history and preferences sync through the data repo. The layout is described in that repo's README:

- `people/<id>/history/YYYY-MM.json`: completed sessions, one file per UTC month of `completedAt`. Sessions are immutable, so files are merged by `id`; nothing is ever overwritten or deleted.
- `people/<id>/preferences.json`: `weightUnit`, `timerSound`, `updatedAt`. The newest write wins.

`runSync` does four things in order:
1. On a device's first sync, queue all existing local history for upload.
2. **Push** the queue month by month: read, import remote sessions, merge, write with the SHA, and on a conflict re-read and retry.
3. **Pull** only month files whose SHA changed since last time.
4. Reconcile preferences.

`SyncProvider` runs it on start, on `requestSync()` (called after a finished workout and after a history import), when the device comes back online, and when the app returns to the foreground (throttled to every 2 minutes). Only one sync runs at a time.

**Pairing:** `services/pairing.ts` encodes the connection (including the token) and, optionally, a person id into a `KW2.…` setup code. The desktop **People** page shows it per person as a QR code for `#/pair/<code>` or as copyable text. The phone either opens that link (`PairPage`) or pastes the code in its ⚙ sheet. Pasting is required for iPhone home-screen apps, because their storage is separate from Safari's. A code without a person leads to "Who's working out?".

**Testing:** `test/fakeGitHub.ts` is an in-memory Contents API that enforces SHA checks like GitHub, with `beforeNextPut` to simulate another device saving just before you. Use it for anything that talks to GitHub.

### 6.5 People (`services/people.ts`, `state/PeopleContext.tsx`, `App.tsx`)
- **The list of people** is `people.json` in the data repo: `[{ id, name, createdAt }]`. Ids are readable slugs (`noa`, `noa-2`) and never change when someone is renamed. Every change to the list reads it, changes it and writes it back with the SHA, retrying on a conflict, so two people adding someone at the same time both survive.
- **Adding a person** writes their plan first (the starter plan, a copy of someone's plan, or an empty plan) and then adds them to the list, so a person never exists without a plan.
- **Per-person scope:**
  - `PersonScope` in `App.tsx` wraps the config, active-workout and sync providers, and is **keyed on the active person**. Switching person remounts all of them.
  - Before anything mounts, `PersonData` calls `selectDatabase(dbNameForPerson(id))`, so every `storage/indexedDb.ts` call goes to that person's own database.
  - The first person picked on a device inherits the existing `kinetic-workout` database, which holds history logged before connecting. Later people get `kinetic-workout--<id>`.
- **Preferences** use per-person localStorage keys (`writePersonPref` / `readPersonPref`), and units re-render on `onPersonChanged`.
- **Gate:** on a connected device with no active person, `Root` renders `WhoAreYou` instead of any route, except `/pair/*`.

---

## 7. Workout runtime (`state/ActiveWorkoutContext.tsx`)

- **One active session at a time.** Starting another workout asks the user to discard the current one first.
- **Every change is saved straight away.** `update(fn)` applies a pure domain function, then writes to IndexedDB and the localStorage backup. Writes go through a serial promise chain so an older snapshot can't land after a newer one. Write errors show up as `storageError` (a banner); progress stays in memory.
- **Rest timer.** It starts after each completed strength set, unless nothing is left in the workout. It survives navigation and reloads, and when it ends it beeps (if sound is on) and vibrates.
- **Supersets.** `completeSet` asks `supersetNext`. Within a round it skips the rest and returns `nextExerciseId`, and the exercise screen navigates there. At the end of a round it rests using that exercise's `restSeconds`, then continues with the first member that still has sets.
- **Interval timer** (`domain/intervals.ts`):
  - `buildIntervalPlan` turns the run of consecutive `timed` exercises, starting from the chosen one, into steps. Only pending sets are included: `prep` (5s) → `work` → `rest` (the finished exercise's `restSeconds`) → … There's no rest after the final work step. Circuits (grouped timed items) are ordered round-robin, and starting from any member starts the whole circuit.
  - The position comes from `(pausedAt ?? now) - startedAt`. Pause moves `pausedAt`; resume shifts `startedAt` forward. Skip moves `startedAt` back by the time left in the current step, and skipping a *work* step records that set as `skipped`. Extend moves `startedAt` forward.
  - A **global ticker** in the provider (every 200ms) calls `applyIntervalProgress` to record finished work steps as completed sets, including steps that ended while the screen was off. It plays cues only when it sees a step change live, and clears the timer when the sequence ends. It also holds a **screen wake lock** while running.
- **Audio on iOS.** `primeAudio()` must be called from a user tap (Complete Set, Start intervals, Pause/Resume) or later beeps are blocked.
- **Route guard.** `SessionGuard` checks `/workout/:sessionId` routes. If the session was already finished it redirects to `/history/:id`; otherwise it shows "Workout not found".

---

## 8. Routes (`App.tsx`)

| Route | Screen |
|---|---|
| `/` | Phone home, or a redirect to `/manage/workouts` on management-mode devices |
| `/workout/:sessionId` | Active workout overview |
| `/workout/:sessionId/exercise/:sessionExerciseId` | Exercise screen (strength / timed / activity variants) |
| `/workout/:sessionId/intervals` | Full-screen interval runner |
| `/workout/:sessionId/finish` | Summary preview + note, then "Save & finish" |
| `/history`, `/history/:sessionId` | Phone history (`?done=1` shows the just-finished view) |
| `/manage/exercises[/:id\|/new]` | Library + side-panel editor |
| `/manage/workouts[/:id\|/new]` | Template list + editor (drag-and-drop with up/down fallback) |
| `/manage/schedule` | Week grid (Sunday first), drag between days, Assign dropdown |
| `/manage/history[/:sessionId]` | Filterable table + detail, import/export |
| `/manage/people` | Everyone in the data repo: add (with a starting plan), rename, switch to, pair a phone |
| `/manage/settings` | Config source, shared data repository connection, sync status, history transfer, device prefs |
| `/pair/:code` | Confirm and connect this device from a pairing QR code |

Editors use `UnsavedChangesGuard` (`useBlocker` + `beforeunload`). `useBlocker` needs the **data router**, which is why the app uses `createHashRouter` + `RouterProvider`.

---

## 9. Styling (`src/index.css`)

- The design tokens from Kinetic Obsidian are in `@theme`. Use the names, not hex values: `canvas`, `card`, `elevated`, `highlight`, `line`, `line-strong`, `ink`/`ink-2`/`ink-3` for text, `volt` (primary action and active state), `cyan` (editable values and secondary), `emerald` (done/success), `warn`, `danger`.
- Fonts: **Space Grotesk** (`font-display`) for headings and numbers, **Inter** for body text. Always use `tnum` on changing numbers such as timers and weights.
- Shared classes are defined with **`@utility`**, not `@layer components`, because Tailwind v4 can only `@apply` utilities: `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger`, `card`, `input`, `chip`, `label`, `hud`, `pb-safe`.
- The app is dark only, by design. Phone layouts keep the main action at the bottom (`PhoneScreen` `footer`, sticky, with safe-area padding) and tap targets of at least 44–56px.

---

## 10. Testing

- **Setup** (`src/test/setup.ts`): `fake-indexeddb/auto`, jest-dom matchers, an in-memory `localStorage`, and a no-op `window.scrollTo`. The `localStorage` replacement is needed because Node 25's own `localStorage` global overrides jsdom's and has no methods.
- **`useFreshDb()`** (`test/freshDb.ts`): call it at the top of any test file that touches storage. Each test gets a new IndexedDB and cleared localStorage.
- **UI tests**: `renderApp(path)` + `stubConfigFetch(files)` from `test/renderApp.tsx`. These render the real route table in a memory router with the real providers. Query by role or label: the UI uses `aria-label` on icon buttons and steppers (e.g. `"Increase Weight"`).
- **What's covered:** domain rules (session, intervals, validation, parsing, units), persistence (recovery after reload, atomic finish, idempotent import), config fallback (offline, corrupt JSON, local-edit precedence), GitHub SHA and conflict handling, **the shipped plan** (`plan.test.ts`: valid references, daily mobility ≤ 8 min, the weekly split), and the main UI flows on both phone and desktop.
- **Run a subset:** `npx vitest run src/domain`, or `npx vitest run -t "interval"`.

---

## 11. Common changes: where to edit

**Add a new target kind** (the most wide-reaching change). Work through these in order and let `tsc` show you what you missed:
1. `domain/types.ts`: the target interface, `ExerciseTarget`, `TARGET_KINDS`, and a session-exercise type if it records data differently.
2. `domain/config.ts`: `parseTarget`, `canonicalTarget`, `defaultTarget`, and possibly `defaultTargetKind`.
3. `domain/validation.ts`: `validateTarget`.
4. `domain/format.ts`: `formatTarget`, `estimateTargetSeconds`, and possibly `totalSets`.
5. `domain/session.ts`: `createSession`, `finishSession`, `sessionStats`, skip/unskip.
6. UI: the `ExercisePage` variant, `WorkoutPage` summaries, `SessionDetail`, and the row editor plus `TARGET_KIND_LABEL` in `WorkoutsPage`.

**Change a plan.** Each person's plan lives in the data repo, so edit it in the app (as that person) or in `people/<id>/plan/`. `public/data/*.json` is the **starter plan**: the template for new people and what the site shows when not connected. It's described in [`workout-plan.md`](workout-plan.md), and `plan.test.ts` protects its requirements (morning time budget, no running on or right after a leg day, floor ≤ 30 min, and so on). Update the test and `workout-plan.md` together when the starter plan changes.

**Add a device preference.** Put it in `services/settings.ts` (or a `useSyncExternalStore` store like `state/units.ts` if components must re-render when it changes), and add a control to the phone settings sheet (`PhoneHome.tsx`) and to `SettingsPage.tsx`.

**Add exercise images.** Put the files in `public/images/` and set `imagePath: "/images/name.webp"`. `resolveImagePath` adds the Pages base path. Missing or broken images show a type icon instead.

**Change the IndexedDB schema.** Increase `DB_VERSION`, migrate in `upgrade()`, and add a storage test.

---

## 12. Gotchas

- **The service worker caches the app shell.** After you deploy (or `npm run preview`), the first load may still show the old build, and the next load gets the new one. For UI work, use `npm run dev` (no service worker).
- **"blocker on a POP navigation" console warning.** It appears when you edit the URL hash by hand while an editor has unsaved changes. Navigating inside the app doesn't trigger it.
- **Changing the week order** changes the key order that `canonicalSchedule` writes into `schedule.json`. Expect a one-off reordering diff.
- **Estimates** (`estimateWorkoutMinutes`) are rough on purpose. Strength counts 45s of work plus rest per set, plus setup time. Under 20 minutes they round to the minute, above that to 5 minutes.
- **One token for everyone.** It's stored in each browser (never committed) and gives read/write access to everyone's data. That's intended, since everyone can see everything. Hand it out through pairing codes, not in chats.
- **Switching person is a remount.** Any state that must survive a switch belongs above `PersonScope` (like `PeopleProvider`). Anything per-person belongs below it, or in per-person storage.
- **Sync never deletes.** If you add a "delete session" feature, it needs tombstones (a list of deleted IDs) or other devices will bring the session back.
- **Browser testing:** `page.goto` to the same URL with only a different `#hash` doesn't reload the page, so you keep testing the old build. Force a reload with `location.reload()`.
- **A bad token must never lock you out.** `loadConfig` falls back to the deployed plan when GitHub fails and nothing is cached, and `ManageLayout` always renders Settings. Keep both when changing config loading.
