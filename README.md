# Kinetic Workout

A personal workout app with two modes in one static site, hosted on GitHub Pages:

- **Workout mode (phone)** — today's scheduled workout, set-by-set logging, a persistent rest timer, cardio/swim logging, finish summary and recent history. Works offline.
- **Management mode (desktop)** — exercise library, workout templates (drag-and-drop ordering, per-workout targets), weekly schedule, and history review.

### Exercise kinds

- **Sets × reps** (strength): per-set weight/reps logging with a rest timer.
- **Timed intervals**: e.g. 30 s work / 10 s rest. Consecutive timed exercises in a workout run as one hands-free sequence: get ready → work → rest → next set/exercise, with countdown beeps and vibration. The screen stays awake while it runs, and it keeps the correct position through screen lock or a reload because it's based on timestamps. You can pause, skip, or add 10 s at any point.
- **Run/cardio** and **swim**: duration/distance with a stopwatch.

Any exercise can use any target kind; it's chosen per workout in the desktop editor.

### People and sync

Family and friends share one **private** data repo (e.g. `workout-data`). Each person has their own plan, history and preferences in `people/<id>/`, and everyone can see and edit everyone.
1. Create a fine-grained token with **Contents: Read and write** on the data repo only.
2. On your computer, go to **Settings → Shared data repository**, enter the token and click **Connect & test**, then pick who you are.
3. Add people on the **People** page. Each starts from the starter plan, a copy of someone's plan, or an empty plan.
4. To set up someone's phone, go to **People → Pair phone** next to their name and scan the QR code. For an iPhone home-screen app, use **Copy setup code** and paste it in the app's ⚙ settings.

Each device keeps working offline and catches up when it's next online. History is merged by session and never overwritten.

### Units

Weights can be shown and entered in **kg or lbs** (phone ⚙ or desktop Settings). They're always stored in kg (`weightKg`), so switching units never rewrites data.

### Training plan

`public/data/` ships the **starter plan**, a two-a-day plan (details in `context/workout-plan.md`). New people can start from it:
- **Sun–Fri mornings:** push/pull/legs twice (A and B versions) with supersets, plus 30 min of cardio (run, run + rope, swims, stair climber), with a 7:25 leave-by countdown.
- **Sun–Fri floor sessions:** mobility plus a core circuit or flexibility.
- **Saturday:** a stretch and a 45-minute family walk.

### Supersets, circuits and rep ranges

Link consecutive exercises in the desktop editor to make a **superset** (strength: A → B, then rest) or a **circuit** (timed: stations run round-robin for N rounds). Strength targets can use a rep range such as 8–12; the app suggests adding weight once you reach the top of the range on every set.

Phones and narrow screens open in workout mode, desktops in management mode. You can switch in Settings (phone: ⚙ on the home screen, desktop: Settings page).

## Stack

React 19 + TypeScript + Vite, Tailwind CSS v4, React Router (hash routing), IndexedDB via `idb`, and a PWA service worker (`vite-plugin-pwa`) for offline use.

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit + integration tests (Vitest, jsdom, fake-indexeddb)
npm run build      # type-check + production build into dist/
```

## Data

| What | Where | Notes |
|---|---|---|
| Each person's exercises, workouts, schedule | `people/<id>/plan/*.json` in the private data repo | `public/data/*.json` here is the starter plan (template, and what the site shows when not connected). |
| Exercise images | `public/images/` | Reference as `/images/name.webp`. Missing images show a placeholder. |
| Active workout, rest timer | IndexedDB (this device) | Saved on every change; survives reloads and closing the tab. |
| Completed workout history | IndexedDB (one database per person per device), synced to `people/<id>/history/YYYY-MM.json` | Export/import JSON still works as a manual backup. |

The shared data model lives in `src/domain/` and is used by both modes.

### Editing configuration

GitHub Pages only serves static files, so the app saves configuration in one of two ways:

1. **Connected** (Settings → Shared data repository): each save commits the active person's changed plan file in the data repo through the GitHub Contents API. Other devices see it the next time they load. No redeploy is involved. Use a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) limited to the data repo, with **Contents: Read and write**. The token is kept only in each browser's localStorage and is never committed.
   Every write includes the file's SHA. If the file changed on GitHub since it was loaded, the save is rejected, the latest version is reloaded, and your unsaved edits stay in the editor so you can review and save again.
2. **Not connected**: saves are kept in this browser as *unpublished local edits*. They're used in place of the starter plan until you publish them to your plan in the data repo, export the JSON files, or discard them.

## Deployment

`.github/workflows/deploy.yml` runs the tests, builds and deploys `dist/` on every push to `main`.
One-time setup: **Repository → Settings → Pages → Build and deployment → Source: GitHub Actions**.

The build uses a relative base path and hash URLs (`/#/workout/…`), so it works under any Pages path (e.g. `https://<user>.github.io/workout-app/`) with no server rewrites.

## Project layout

```
src/
  domain/         types, session rules, validation, parsing/serialization (pure, tested)
  repositories/   ConfigRepository: StaticJson / GitHub / LocalConfig
  services/       config loading & fallback, history import/export, settings, audio/vibration
  storage/        IndexedDB stores: configCache, workoutSessions, activeWorkout, appState, syncQueue
  state/          React contexts: config, active workout, history hooks
  pages/phone/    workout mode screens
  pages/manage/   management mode screens
  components/     shared UI
```

Sync of workout history to the repository (planned for v2) is kept separate: finished sessions are queued in the `syncQueue` store so a future Sync action can push them.
