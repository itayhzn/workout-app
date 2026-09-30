# Implementation Log — Kinetic Workout

A record of what was built, the decisions made along the way, and the bugs found and fixed, newest first. For how the app works today, see [`dev-onboarding.md`](dev-onboarding.md).

**Current state (2026-09-30)**
- **Live** at `https://itayhzn.github.io/workout-app/`: the feature branch was merged to `main` (PR #3) and GitHub Pages deploys via GitHub Actions.
- The private data repo `itayhzn/workout-data` is in use. People: Itay (the starter two-a-day plan plus a daily Posture Reset, with workouts syncing) and Gal (her own plan, see entry 8).
- Tests: 101 passing (unit + integration). Typecheck and production build are clean.

---

## 10. Back in the interval timer, and resuming a finished workout — 2026-09-30

Both came from a real floor session. Itay's son pressed **Skip** on the phone and there was no way back. Later the 20-minute mobility session had to be cut short, with no way to finish the rest later.

### Features
- **Back button in the interval runner** (phone `IntervalPage`; controls are now Back · +10s · Pause · Skip).
  - Works like a music player: more than 3s into a work step, it restarts that step; early in a step or during a rest or get-ready, it goes to the previous work step.
  - Anything already recorded from that point on is reopened, so an accidentally skipped set runs again and is recorded properly. The skip marker is cleared too.
  - Works while paused, and stays paused.
  - Domain: `rewindIntervalStep` in `domain/intervals.ts`. Provider: `backInterval`.
- **Un-skip on the exercise screens.** On the timed-exercise screen, skipped set rows were disabled; now tapping one reopens it. On the strength screen, a skipped set's editor offers **Un-skip**. `uncompleteSet` now also un-skips the exercise.
- **Resume a finished workout.**
  - The phone history detail (including the just-finished summary) shows **Resume workout · N unfinished** when a finished session has skipped work. The session becomes the active workout again: done work stays done, and skipped sets and exercises reopen.
  - **The break isn't counted:** `WorkoutSession.pausedMs` accumulates the time between finishing and resuming, and `sessionDurationMs` subtracts it (the history duration, the live workout clock, and the home card, which reads "Resumed · N min of training so far").
  - Refused while another workout is in progress; a banner links to that workout instead.
  - Recent-workout rows show "N unfinished".
  - Domain: `reopenSession`, `hasUnfinishedWork`, `unfinishedCount`. Storage: `reopenCompletedSession` (one transaction).
- **Sync handles changed sessions.** Sessions used to be treated as immutable (the existing copy always won). Now, for the same id, the copy with the later `completedAt` wins (`isNewerSession`), both when merging a month file and when importing locally. So a resumed-and-finished session replaces the old copy on GitHub and on other devices. While a session is resumed, sync skips it so the old finished copy doesn't reappear in history. `importSessions` now reports `{ added, updated, skipped }`.
- **Update safeguard, no data migration needed.** Existing data needs no conversion: `pausedMs` is optional, and the database schema and plan files are unchanged. One rollout edge case remained: a device still on the old version could sync a month containing a resumed-and-refinished session, skip the newer copy (old rule), and still mark the month as seen, so after updating it would never re-download it. Fix: `SyncState.version` (`SYNC_STATE_VERSION = 2`). On a device's first sync after updating, it forgets which months it has seen and re-downloads all history once. That's safe, because imports never duplicate and only a newer copy replaces an older one.

### Tests added (101 total)
- `domain/__tests__/resume.test.ts`:
  - **Back:** restarts after the grace period; goes to the previous work step from a rest; jumps back over a rest from early in a step; reopens what was recorded; works while paused.
  - **Resume:** reopens only skipped work and counts only workout time (5 + 10 minutes around a 13-hour break is 15 minutes); un-skipping a set un-skips its exercise.
- Storage: a newer copy replaces an older one (never the other way round); resuming moves a session from history to the active slot.
- Sync: a resumed workout isn't pulled back into history while active, and the re-finished version replaces the old one on GitHub. After updating from an older version, history is re-read once and a previously skipped newer copy is picked up; the next sync doesn't re-download.
- `__tests__/backAndResume.test.tsx` (UI):
  - Skip, then Back, reopens the set and restarts the full minute.
  - Resume from a finished workout's page makes it active without the 3-hour break.
  - Resume is refused while another workout is in progress.

### Checked in a browser
The real flow: start the floor session → start intervals → Skip Cat-Cow → **Back** (Cat-Cow at 1:00 again, "Interval 1 of 25") → Stop → Finish → the summary shows **Resume workout · 16 unfinished** → Resume → active again with the clock showing only workout time.

### Bugs found and fixed
| Bug | Cause | Fix |
|---|---|---|
| (Test) The "blocked resume" test found no banner | The setup saved the finished session *after* starting the other workout, and finishing correctly clears the active slot | Setup order swapped |
| (Test) "01:00" matched twice | The countdown and the "Coming up" list both showed it | Assertion scoped to the timer |

### Ideas not built
- **A controls lock:** a long-press to unlock the runner's buttons, so a curious toddler can't skip, stop or pause. Back makes accidental skips recoverable, but not accidental Stops.

---

## 9. Home Push/Pull/Legs alternatives for Itay — 2026-09-30

Data only; no app code changed. Data-repo commit `ff7bbee`.

- **What:** three ~30-minute home workouts (`home-push`, `home-pull`, `home-legs`) for days a gym morning is missed. They're done **in addition to** the floor session and are **not on the schedule**; you start one from "Choose another workout". Documented in [`workout-plan.md`](workout-plan.md#home-alternatives-for-a-missed-gym-morning-added-2026-09-30).
- **Equipment:** bodyweight, mat, a knee-high box, a sturdy table (for inverted rows) and one adjustable dumbbell of up to 11.25 kg. Intensity comes from harder positions (decline, one-arm, one-leg), slow lowering and higher rep ranges.
- **Exercises:** 12 new ones were added to Itay's library. Existing exercises were reused where the movement is the same (the one-arm dumbbell row, Bulgarian split squat, and the warm-up moves), so "last time" and progression hints carry over between gym and home.
- **Checked:** the app's parser and validator (no errors); the files are byte-identical to the app's canonical output; timing ≈ 2.8-min warm-up + 20–25 min of strength. The estimator counts one-arm and one-leg exercises once, so the real times (both sides) are about 27 / 29 / 30 minutes.

**Noticed:** the duration estimate undercounts exercises done per arm or per leg. Marking them as unilateral (e.g. a `perSide` flag on the target) would make estimates and the set list clearer ("set 2 — left/right").

---

## 8. Plans for Gal, and a daily Posture Reset for both — 2026-09-30

Data only; no app code changed. Written directly to the data repo (`itayhzn/workout-data`, commits `66f4f07` and `02a499f`).

- **Gal** (`people/gal/plan/`, previously the empty plan): 2 full-body gym sessions, Mon "Gym A — Glutes & Back" and Thu "Gym B — Posterior Chain & Upper Back". Each is a 5-min warm-up + ~35 min of strength with supersets + an 8-min, 2-round core circuit, so ≈50 min. Plus Wed yoga class (50-min activity), Sat family walk (45 min), and a daily Posture Reset. Aimed at postural kyphosis: about 2 pulls per push, lower-trap work, stability-based core. Weights are conservative starting points. Full description in [`workout-plan-gal.md`](workout-plan-gal.md).
- **Itay:** the same daily **Posture Reset** (5 min, 6 no-equipment moves) was appended to his plan and added to every day of his schedule. Nothing existing was changed. Documented in [`workout-plan.md`](workout-plan.md).
- **How it was checked:** a temporary test (deleted afterwards) ran both plans through the app's own parser and `validateConfiguration` (no errors). It confirmed the files are byte-identical to what the app writes, so a later in-app edit produces a clean diff, and measured the durations: gym ≈ 4.9 + 35.5 + 8.2 min, posture 5.0 min.
- **Starter plan unchanged:** `public/data/` and its `plan.test.ts` rules (two sessions per training day) are untouched. The posture routine exists only in the two people's plans.
- **Noticed:** a yoga class is logged as a cardio activity, so its screen shows a distance field that doesn't apply. It works (tap Complete activity), but hiding distance for non-running activities would be a small improvement.

---

## 7. Multiple people — 2026-09-29

Family and friends each get their own plan, history and preferences. Decisions from the discussion: **one shared private repo**, where everyone can see and edit everyone; people use their own devices, several at the same time; and anyone can edit any plan.

### Design
- **Data repo layout** (documented in `workout-data/README.md`):
  - `people.json`: the list of everyone, `[{ id, name, createdAt }]`.
  - Per person: `people/<id>/plan/{exercises,workouts,schedule}.json`, `people/<id>/history/YYYY-MM.json`, and `people/<id>/preferences.json`.
- **Plans left the public app repo.** `public/data/` is now the **starter plan**: the template for new people and what the site shows when not connected. Saving a plan edits the person's file in the data repo, so there's no site redeploy per edit, and the token only needs access to the data repo.
- **Connection** (`services/settings.ts`): the device-wide `{ owner, repo, branch, token }` for the data repo, stored as `kinetic.connection`. Settings saved by the single-user version (`kinetic.github` with `syncRepo`) are migrated automatically.
- **Choosing a person:**
  - `kinetic.person` holds the active person on the device.
  - A connected device with no active person shows **"Who's working out?"** (`WhoAreYou`): pick someone, or add a person with a starting plan (starter plan, a copy of someone's plan, or empty).
  - A person switcher (avatar) sits in the phone header and desktop sidebar.
- **Per-person data on a device:**
  - `PersonScope` wraps the config, active-workout and sync providers and is keyed on the active person, so switching remounts all of them.
  - `selectDatabase(dbNameForPerson(id))` points IndexedDB at that person's own database. The **first** person picked on a device inherits the existing database (history logged before connecting), and later people get `kinetic-workout--<id>`.
  - Preferences (kg/lbs, sound, their timestamp) use per-person localStorage keys, with a fallback to the old device-wide keys.
- **Plan and sync paths:** `GitHubRepository` now reads and writes `people/<id>/plan/*`. `runSync(client, personId)` uses `people/<id>/history` and `people/<id>/preferences.json`.
- **People page** (`/manage/people`): add a person, rename (the id stays the same), switch to, and **Pair phone**.
- **Pairing** is per person: setup codes are `KW2.` + base64url of `{ connection, personId? }`.
- **The list of people** is read, changed and written back with the SHA, and retried on a conflict (`services/people.ts`). Adding someone writes their plan **before** adding them to the list, so a person never exists without a plan.
- **Settings:** "GitHub connection" became **Shared data repository** (owner, repo, branch, token). The Sync section shows the active person and links to People for pairing.

### Tests added (88 total)
- `services/__tests__/people.test.ts`: readable, unique ids; adding a person seeds their plan and the list; two devices adding people at once both survive; renaming keeps the id.
- `__tests__/multiUser.test.tsx`: pick a person, see their plan; switch to another person, see their plan and not the first person's workout in progress; switch back and it's still there.
- `__tests__/pairing.test.tsx`: a code naming a person connects straight to them and syncs `people/<id>/history`; a code without a person leads to "Who's working out?"; a damaged link shows an error.
- Updated `repositories.test.ts` (plan paths under `people/<id>/plan`, commit messages tagged with the person) and `sync.test.ts` (paths under `people/<id>/`).

### Checked in a browser
The GitHub API was faked **inside the page** with an in-memory repo, so nothing touched the real repository. Checked: "Who's working out?", picking a person (their plan loads and sync shows green), adding a person from the People page, and the per-person pairing QR code.

### Fixes found in that check
| Issue | Fix |
|---|---|
| The "Starter plan (the plan that ships with the app)" option was cut off in the select | Shortened to "Starter plan" |
| People rows wrapped their actions onto a second line except for the active person | Icon-only Rename and "Pair phone", so every row fits on one line |

### Decisions
- **Folders in one repo instead of a repo per person.** Chosen by the user: family and friends, everyone may see everything. GitHub can't limit a token to one folder, so privacy between people isn't possible with this layout (a repo per person would be needed).
- **A separate database per person instead of tagging records with a person id.** Isolation needs no query changes anywhere, and switching is a clean remount.
- **Exercises are per person, not a shared library.** Everyone can customize freely, and deleting an exercise can never break someone else's workout. The cost is some duplication.

---

## 6. Cross-device sync through a private GitHub repo — 2026-09-29

Workout history used to exist only on the device where it was logged. Now it follows you between devices, and so do the "last time" numbers and progression hints, which are built from history.

### Design
- **Storage:** a separate **private** repo, `itayhzn/workout-data`, rather than the public app repo. That keeps history private and stops sync commits from redeploying the site.
  - `history/YYYY-MM.json`: completed sessions, one file per UTC month of completion, sorted by `completedAt`.
  - `preferences.json`: `{ weightUnit, timerSound, updatedAt }`.
- **Local-first.** IndexedDB stays each device's copy of the data. Logging never waits on the network, and sync only ever *adds*: history is immutable and merged by session `id`.
- **Sync pass** (`services/syncService.ts`, `runSync`):
  1. **First sync on a device:** queue all existing local history for upload (`enqueueAllSessions`).
  2. **Push:** group queued sessions by month. For each month: read the file and its SHA, import the remote sessions locally, merge, and write back with the SHA. If GitHub rejects the write because another device saved in between, re-read, re-merge and retry (up to 3 times). Queue entries are removed only after a successful write.
  3. **Pull:** list `history/`, and download only month files whose SHA differs from the last one seen (`syncState.monthShas` in `appState`).
  4. **Preferences:** the newest `updatedAt` wins. Local changes are timestamped by `setWeightUnit` / `saveTimerSound` through `markPrefsChanged`.
- **When it runs** (`state/SyncContext.tsx`): on app start, after each finished workout and after a history import (`requestSync()`), when the device comes back online, and when the app returns to the foreground (at most every 2 minutes). Also from the **Sync now** button. Only one sync runs at a time.
- **Configuration:** `GitHubSettings.syncRepo` (default `workout-data`, same owner and token as the app repo). "Connect & test" now checks push access on both repos.
- **Pairing another device** (`services/pairing.ts`):
  - A **setup code** (`KW1.` + base64url of the settings, including the token) and a QR code for `#/pair/<code>`.
  - The pairing page asks for confirmation, tests the connection, saves the settings and syncs. It removes the code from the address bar as soon as it reads it.
  - The QR is hidden until you ask for it, with a warning that it contains the token.
  - The phone settings sheet also accepts a **pasted** code. That's needed for iPhone home-screen apps, which don't share storage with Safari: a QR scan opens Safari, not the installed app.
- **UI:**
  - A sync badge in the phone home header (synced / syncing / offline / failed, tap for settings).
  - A sync line in the desktop sidebar.
  - A "Cross-device sync" section in Settings: status, pending count, Sync now, and pairing.
- **Refactor:** `repositories/githubContents.ts` is a shared Contents API client (read/write JSON with SHA, list folders, test write access). `GitHubRepository` (the plan) now uses it.

### Bugs found and fixed
| Bug | Cause | Fix |
|---|---|---|
| With an invalid or expired token and no cached plan, all of management mode showed only an error, **including Settings, where the token gets fixed** (found while checking the new Settings screen in a browser) | `ManageLayout` replaced every page with the error banner; `loadConfig` threw when GitHub failed and nothing was cached | `loadConfig` falls back to the plan deployed with the site, with a warning banner that links to Settings. Settings always renders. Regression test added |
| Raw "HTTP 401" errors gave no hint what to do | Generic error text | 401 and 403 now say to update the token, or to give it Contents: Read and write |
| Sidebar said "Offline · cached copy" when the real cause was a rejected token | Every load failure was labelled "offline" | Now "Plan not refreshed · saved copy", with the details in the banner |

### Tests added (82 total)
- `test/fakeGitHub.ts`: an in-memory Contents API that enforces SHA checks (409 for a stale SHA, 422 for a missing one), with a hook to simulate another device writing just before a save.
- `services/__tests__/sync.test.ts`:
  - month bucketing and merging
  - setup-code round-trip and rejection of damaged codes
  - first sync uploads existing history, and a second sync makes no writes and downloads nothing
  - downloading sessions written by another device
  - two devices saving the same month at once end up merged, not overwritten
  - offline: finished workouts stay queued, then upload when back online
  - preferences: newest change wins, in both directions
- `__tests__/pairing.test.tsx`: a pairing link connects the device and syncs; a damaged link shows an error.

### Decisions
- **GitHub instead of a hosted database** (Supabase/Firebase). There's no new account or service, the data stays yours as plain JSON with history, and it matches the spec's "no cloud backend" rule. The trade-off is that sync happens when the app opens or a workout finishes, not in real time.
- **Monthly files instead of one file per session.** This follows the spec: few files, cheap listing, and one commit per sync.
- **The in-progress workout isn't synced.** You run a workout on one device, and syncing it would bring edit conflicts in exchange for very little benefit.

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

- **Sync isn't real-time.** It runs on app open, after a finished workout, when coming back online or to the foreground, and from Sync now.
- **People can't be deleted from the app.** You can rename someone, but removing them means editing `people.json` and their folder by hand.
- **A pairing code can't be revoked.** Everyone shares one token, so removing someone's access means creating a new token and re-pairing every device.
- **Exercise libraries aren't shared.** Each person's plan has its own exercise library.
- **History can't be deleted.** There's no delete feature, and sync never removes sessions. Removing one would mean editing the month file and each device's local copy.
- **No pyramids.** Rep ranges are supported (entry 5), but per-set targets like 10/8/8/6 aren't.
- **Superset rest is set on the last member only.** The first member's `restSeconds` is ignored inside a superset. The desktop editor doesn't point this out yet.
- **No exercise images.** Everything shows type-icon placeholders until files are added to `public/images/`.
- **No beep when the phone is locked.** Rest-timer sounds need the page to be in the foreground; the interval runner keeps the screen awake to avoid this.
- **Fixed week start.** The week always starts on Sunday; there's no setting for it.
- **Uncertain starting weights.** Several weights in the plan are estimates (entry 3).
- **Large precache.** All font subsets are precached (~780 KB). This could be limited to the Latin subset.
- **Harmless console warning.** Editing the URL hash by hand while an editor is dirty logs a router "blocker on POP navigation" warning.
