# Implementation Log — Kinetic Workout

A record of what was built, the decisions made along the way, and the bugs found and fixed, newest first. For how the app works today, see [`dev-onboarding.md`](dev-onboarding.md).

**Current state (2026-09-28)**
- The code is on the `feature/workout-app` branch and pushed. Commit `0ad4a3b` contains entries 1–3; `d51488a` contains entries 4–5 and the `context/` docs.
- It hasn't been merged to `main`, and GitHub Pages isn't enabled on the repo yet. Once it's merged and Pages is set to "GitHub Actions", the site will be at `https://itayhzn.github.io/workout-app/`.
- Tests: 72 passing (unit + integration). Typecheck and production build are clean.

---

## 5. Supersets, circuit rounds, rep ranges, leave-by countdown, two-a-day plan — 2026-09-28

The plan is described in [`workout-plan.md`](workout-plan.md). It needed four features the app didn't have. Supersets and circuit rounds are one concept: a group of items done in rotation.

### Features
- **Groups: supersets (strength) and circuits (timed).**
  - **Model:** `WorkoutExercise.group?: string`. Consecutive items that share a group id are done in rotation, one set of each per round. The session copies the group onto `SessionExercise.group`, and rounds = sets.
  - **Logic** (`domain/groups.ts`):
    - `groupRuns` (contiguous runs) and `normalizeGroups`, which keeps groups contiguous with at least two members. It runs after every edit, move or removal, and on parse and save.
    - `linkWithNext` / `unlinkFromNext`.
    - `supersetNext`: after a set, move to the next member with no rest, or rest at the end of a round.
    - `groupTurn`: whose turn it is. `currentExercise` uses it, so the overview highlights the right member.
  - **Validation:** a group can't mix target kinds, and only strength or timed items can be grouped.
  - **Supersets on the phone:**
    - After Complete Set, the app goes straight to the next member without starting the rest timer.
    - The rest timer starts only after the last member of the round, using that member's rest time. The first member's rest is 0 in the data, since it's never used.
    - A group strip on the exercise screen shows each member's sets done and lets you switch.
    - The overview puts the group in a dashed volt bracket labelled "Superset · N rounds".
  - **Circuits:**
    - `buildIntervalPlan` builds timed groups round-robin (A1, B1, C1, A2, B2, C2). Each station's rest follows it, so the last station's rest becomes the rest between rounds.
    - Starting from any member starts the whole circuit.
    - Wording changes to "Round n of N" on the timed screen and in the interval runner.
  - **Desktop editor:**
    - Link/Unlink buttons appear between compatible rows.
    - Grouped rows get a volt left border, and the first row of a group has a header with a **Rounds** input that sets `sets` for every member.
  - **Estimates:** a superset counts one rest per round, plus 60s setup per station. A circuit counts each station's work plus rest.
- **Rep ranges.**
  - **Model:** `StrengthTarget.repsMax?`, where `reps` is the bottom of the range. Shown as `3 × 8–12`.
  - **Editing:** a min/max editor on the phone; min–max inputs on desktop. Validation requires max ≥ min.
  - **Pre-filled reps** on each set use the bottom of the range.
  - **Progression hint:** if every completed set last time reached the top of today's range, the "Last time" card shows *"Top of the range on every set — try +2.5 kg"* (or +5 lbs).
- **Leave-by countdown.**
  - **Model:** `Workout.leaveBy?: "HH:MM"`. `createSession` turns it into `WorkoutSession.leaveByAt` for the day the session starts. If that time has already passed when you start, there's no countdown.
  - **Phone:** `LeaveByChip` in the headers of the overview and exercise screens. It shows "Leave 7:25 · 32m", turns amber in the last 10 minutes and red once you're late ("Leave now · 3m late").
  - **Desktop:** a "Leave by" time field in the workout editor.
- **Preview cards collapse interval runs.** On the home screen, 3 or more consecutive timed moves show as one row ("Intervals · 7 moves · 05:00"). Without this, cards for warm-ups and stretch flows ran to 16 rows.
- **New plan in `public/data/`** (it replaces the entry 3 plan):
  - **10 workouts:** 6 morning sessions (5-min home warm-up → lifting with supersets → 30-min cardio, all with leave-by 07:25), 2 floor sessions (desk-reset mobility + a 2-round core circuit, or + flexibility), Saturday stretch, and Family Walk.
  - **64 exercises,** all of them used.
  - **Schedule:** a morning session plus a floor session Sunday–Friday; stretch plus walk on Saturday.
  - **Tests:** `plan.test.ts` was rewritten to check the plan's requirements: the push/pull/legs order and a floor session every training day, the morning time budget (warm-up ≤ 5 min, lifting ≤ 40 min, cardio 25–32 min), no running on or right after a leg day, supersets in every lifting session, floor ≤ 30 min, Saturday stretch ≤ 10 min, and the 45-min walk.

### Tests added
`groups.test.ts` covers: normalizing, link/unlink, mixed-kind validation, JSON round-trip of group, rep range and leave-by, superset rotation and `currentExercise`, superset estimates, circuit round-robin (including starting mid-circuit), and leave-by on the same day vs. already passed. `supersets.test.tsx` covers the phone flow: A → B with no rest, then rest after B and return to A, plus the 8–12 display and the leave-by chip. The total is 72 tests.

### Bugs found and fixed
| Bug | Fix |
|---|---|
| Home preview cards were 15–16 rows long with the new warm-up and mobility flows | Consecutive timed moves collapse into one "Intervals" row |
| `groups.test` round-trip failed ("workouts.json must contain an array") | Test bug: it passed a single workout; now it passes an array |

### Decisions
- **One grouping concept instead of two features.** Supersets and circuits are the same thing (rotation by set). This keeps the model small and shares the normalize/link/validate code.
- **Rest belongs to the last member of a superset.** No new "round rest" field is needed. The same rule gives circuits their rest between rounds.
- **Leave-by is per workout, not a global setting,** so only the morning sessions count down. Floor sessions and Saturday don't.
- **A deadline that has already passed is ignored,** so starting a morning workout late (for example at 14:00 on a day off) doesn't show a nonsense countdown.

---

## 4. Week starts on Sunday — 2026-09-28

**Change**
- `WEEKDAYS` (the one source of day order) is now `sunday … saturday`, and the `Weekday` union was reordered to match.
- `weekdayOf(date)` now maps `Date.getDay()` straight onto `WEEKDAYS`. It used to use `(getDay() + 6) % 7` to fit a Monday-first list.
- `emptySchedule()` builds its keys from `WEEKDAYS`, so order can't drift.
- `public/data/schedule.json` was rewritten Sunday-first to match what the app now saves (so the next save doesn't produce a reordering diff).

**Effects:** the desktop Schedule grid and day labels ("Sun · Thu") are Sunday-first. Stored data and history are unchanged, because only the order is different.

**Tests:** a new "week order" test checks that `WEEKDAYS[0]` is Sunday, the `emptySchedule` key order, and `weekdayOf` on real dates. The schedule UI test's day index was updated.

---

## 3. kg/lbs, timed exercises, new training plan — 2026-09-26

### Features
- **Weight units (kg/lbs).** It's a per-device preference (`state/units.ts`, a `useSyncExternalStore` store, key `kinetic.weightUnit`), switched from the phone settings sheet or desktop Settings.
  - Data is **always stored in kg**. Conversion happens only at the UI edge (`domain/units.ts`).
  - Pounds are shown to 0.1 lb and converted back to kg rounded to grams, so values typed in pounds come back unchanged. Steppers move 2.5 kg or 5 lb.
  - The unit is used everywhere a weight appears: targets, set rows, "last time", history, session volume, and the desktop editor.
  - New components: `WeightStepper` and `WeightUnitToggle`.
- **Timed exercises.** A new target kind `timed { sets, workSeconds, restSeconds }` and session type `TimedSessionExercise` with timed sets. `isSetBased()` now covers both strength and timed exercises in the shared session logic.
  - **Interval engine** (`domain/intervals.ts`): consecutive timed exercises become one sequence: 5s get-ready, then work, then rest, then the next set or exercise, with no rest after the last one. The position is worked out from timestamps. It supports pause, resume, skip (skipping a work step records the set as skipped) and adding time.
  - A **global ticker** in `ActiveWorkoutContext` records sets as they finish (including ones that finished while the screen was off), plays 3-2-1 beeps and a sound plus vibration at each phase change, and keeps the screen awake while running.
  - **UI:** a full-screen `IntervalPage` (countdown ring, current and next exercise, "Coming up", +10s, Pause, Skip, Stop); `TimerDock` (a small bar that shows the interval timer, or else the rest timer); a timed-exercise screen (editable work/rest/sets, a set list where you tap to mark sets done or undone, and "Mark set done" for manual logging); and a "Start intervals" button on the workout overview.
  - **Desktop editor:** any exercise can use any target kind through a select in its row. Timed rows edit sets, work and rest. When you add an exercise right after a timed one, it copies that exercise's work and rest times.
- **Mobility.** A new `mobility` exercise type (default target is timed, icon `PersonStanding`) and workout type.
- **New training plan** (`public/data/`), in English, adapted from the user's Hebrew push/pull/legs spreadsheet (`תכנית אימונים.xlsx`):
  - Sun **Push**, Mon **Run 5K + Abs** (a 9-move abs circuit, 30s work / 10s rest), Tue **Swim 30** (5 min easy, 20 min main set of 10×100 m, 5 min easy), Wed **Legs**, Thu **Pull**, Fri **Long Run 10K**, Sat **Walk 30**.
  - **Daily Mobility** every day: 8 moves, 7:45 of hands-free intervals.
  - **Changes from the sheet:**
    - Removed: front raise, cable kickback, shrugs + upright row, rear-delt fly, wrist curls, goblet squat.
    - Added: incline DB press, face pulls, Romanian deadlift.
    - Leg curl and leg extension are now separate exercises, and lat pulldown rest went from 30s to 90s.
    - The sheet's technique notes were translated into tips.
  - **Reading the sheet:** Excel had turned rep ranges into dates (for example `2024-10-12` means 10–12 reps). Weights that were missing (`#REF!`) or impossible (lower than the empty bar) were replaced with estimates to adjust in the app: DB bench 22.5, OHP 30, barbell row 40, Smith squat 60, RDL 50, EZ curl 20, hammer curl 10, face pulls 20, leg curl/extension 35 kg.
- **Estimates:** workouts under 20 minutes now round to the nearest minute, so mobility shows "~8 min".

### Bugs found and fixed
| Bug | Cause | Fix |
|---|---|---|
| "+10s" in the first seconds of a sequence did nothing | Elapsed time was clamped at 0, which cancelled the negative offset | Removed the clamp. A negative elapsed time just means more time is left in step 0 |
| The counter read "Interval 0 of N" during get-ready | Counted work steps up to and including the current prep step | Count work steps before the current step, plus 1 |
| "Coming up" repeated the "Up next" exercise; two-sided stretches appeared twice with no label | The upcoming list included the next work step during prep/rest | Skip that step during prep/rest, and add "· set N" for multi-set exercises |
| The current-exercise card offered "Start intervals" while they were running, which would have restarted the sequence | No check for a running sequence | Detects a running sequence and shows "Open timer" (the same check was added on the exercise screen) |
| The "Start intervals (8 exercises)" button text wrapped; the hint read "a 8-exercise" | Copy was too long, and a grammar mistake | Shorter button label and reworded hint; "Set 1 of 1" is hidden |
| `plan.test.ts` failed the typecheck | Used Node `fs` and `__dirname` with browser-only types | Imports the JSON files directly |

---

## 2. Review and polish pass — 2026-09-26

Found by clicking through the production build at phone (400px) and desktop (1440px) sizes:

| Bug | Fix |
|---|---|
| "Workout complete" appeared twice (header and card) on the just-finished summary | Header now reads "Summary" |
| "Scheduled today" was shown both above the cards and on each card | Top label shows only "Rest day" when nothing is scheduled |
| The "Selected" workout card's clear (×) button overlapped the duration | Moved into the card header as an `onDismiss` button |
| The in-progress bar on the home screen only counted finished exercises | Uses completed/total sets when the workout has sets |
| Duration estimates were too low (Pull showed ~35 min) | Strength estimate now counts 45s of work plus rest for every set (the last rest covers moving to the next exercise), plus 60s setup |
| Two sidebar items looked active right after navigating | Removed the CSS transition on nav links |

---

## 1. Initial implementation — 2026-09-26

Built from the specs in this folder (`phone-*.md`, `computer-*.md`) and the Stitch mockups ("Kinetic Obsidian" design system).

### Features
- **Foundation:** React 19, TypeScript, Vite, Tailwind v4 tokens from the design system, bundled fonts (offline), PWA service worker, hash router, relative base path for GitHub Pages, and `404.html` fallback.
- **Shared domain layer:** types; session creation (a snapshot with deep-copied targets); set completion, editing and undo; prescription edits that apply only to upcoming sets; adding and removing sets without touching logged ones; skip and resume; finishing a workout early (unfinished work becomes skipped, and partly done exercises keep their completed sets); stats; "last time" lookup; validation (fields and cross-references); defensive parsing; canonical JSON.
- **Storage:** IndexedDB stores (`configCache`, `workoutSessions`, `activeWorkout`, `appState`, `syncQueue`). Finishing a workout is one atomic transaction, and the active session is also mirrored to localStorage.
- **Config repositories:** Static JSON (read-only), GitHub Contents API (SHA-checked writes, conflicts raised as `ConflictError`), and Local (browser-only edits, flagged as unpublished). Loading falls back from local edits to remote to cache.
- **Phone:**
  - Home: active-workout card, today's scheduled cards, a workout picker, and the last 5 workouts.
  - Workout overview: progress, current/done/skipped cards, Finish, Discard.
  - Strength exercise screen: tap-to-edit target tiles, "last time", set rows with previous values, inline steppers, set editing and undo, tips, notes.
  - Cardio/swim screen: stopwatch, duration, distance, pace.
  - Sticky rest timer: +30s, −15s, reset, skip; beeps and vibrates when it ends.
  - Finish summary with a note field, history list and detail, settings sheet (sound, history export, mode switch).
- **Desktop:**
  - Sidebar layout; exercise library (grid/table, type filters, search, side-panel editor with image preview and tips; delete is blocked while any workout uses the exercise).
  - Workout template editor (drag-and-drop by grip plus up/down buttons, inline targets, searchable exercise picker, duplicate; deleting a workout also removes it from the schedule).
  - Weekly schedule (drag between days, Assign dropdown, reorder, workout bank); history (filters, table or cards, detail panel, import/export).
  - Settings (config source, publish/export/discard local edits, GitHub connection with a connection test, device mode, sound).
  - An unsaved-changes guard on every editor.
- **Sample data** at first: Push, Pull, Legs, Running, Swimming (replaced in entry 3).
- **Deploy:** GitHub Actions workflow (test, build, deploy Pages) and a README.

### Decisions
- **Hash routing and relative base.** This is the only way to get working deep links on GitHub Pages without server rewrites. The data router is required for `useBlocker`.
- **Config and history are stored separately.** Config lives in the repo (committed through the API); history stays on each device, with export/import instead of sync for v1. `syncQueue` is filled ready for a future sync.
- **Saves are per entity, and conflicts reload the latest.** When the file changed remotely, the latest version is reloaded and the user's draft is kept, rather than overwriting or asking for a manual merge.
- **Unpublished local edits come first.** Without a GitHub token, edits are still possible and never silently lost.
- **The rest timer starts after every set except the last one in the whole workout.** The spec said "unless this was the final set". Reading that per workout rather than per exercise gives rest between exercises too.
- **New IDs are UUIDs.** The spec recommends them. The seed data uses readable slugs.
- **Mode detection** uses `pointer: coarse`, `hover: none` and viewport width (not the user-agent string), and can be overridden per device.

### Bugs found and fixed
| Bug | Fix |
|---|---|
| Tailwind v4 couldn't `@apply` custom component classes | Redefined them with `@utility` |
| The exercise editor stayed "dirty" after saving an existing exercise | The canonical saved entity becomes the new baseline (`setOriginal`) |
| Rows being draggable blocked text selection in their inputs | Only the grip handle enables dragging |
| Tests failed with `localStorage.clear is not a function` | Node 25's own `localStorage` global overrides jsdom's; setup now installs an in-memory Storage |
| Test output flooded with "Not implemented: scrollTo" | Stubbed `window.scrollTo` in the test setup |
| TypeScript error: `delete` on required `notes` | Annotated the object as `SessionExercise` / `WorkoutSession` |

---

## Known limitations and possible next steps

- **No history sync between devices** (export/import only). A v2 **Sync** action could push `syncQueue` sessions to monthly files such as `data/history/2026-09.json`, merging by session ID.
- **No pyramids.** Rep ranges are supported (entry 5), but per-set targets like 10/8/8/6 aren't.
- **Superset rest is set on the last member only.** The first member's `restSeconds` is ignored inside a superset. The desktop editor doesn't point this out yet.
- **No exercise images.** Everything shows type-icon placeholders until files are added to `public/images/`.
- **No beep when the phone is locked.** Rest-timer sounds need the page to be in the foreground; the interval runner keeps the screen awake to avoid this.
- **Fixed week start.** The week always starts on Sunday; there's no setting for it.
- **Uncertain starting weights.** Several weights in the plan are estimates (entry 3).
- **Large precache.** All font subsets are precached (~780 KB). This could be limited to the Latin subset.
- **Harmless console warning.** Editing the URL hash by hand while an editor is dirty logs a router "blocker on POP navigation" warning.
