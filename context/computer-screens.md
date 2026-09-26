# Workout App — Computer Screens

## Purpose

The desktop/computer experience is the **management mode** of the workout app.

It is primarily used to:

- Create and edit exercises
- Create and organize workouts
- Configure the weekly schedule
- Review workout history

Unlike the phone app, the computer interface can use denser layouts, tables, drag-and-drop, side panels, and larger forms.

The visual language should remain consistent with the phone app, but the desktop version should prioritize efficient management.

---

# 1. Desktop App Shell

## Main navigation

Recommended primary navigation:

- Exercises
- Workouts
- Schedule
- History

This may appear as:

- Left sidebar
- Top navigation
- Combination of sidebar + page title

A persistent navigation structure is preferable because users will frequently move between these sections.

---

# 2. Exercises Screen

## Goal

Manage the reusable exercise library.

## Exercise list

Show exercises in either:

- Grid/gallery view
- Table/list view
- Toggle between both

Each exercise should show:

- Image
- Name
- Type/category if used

Example cards:

> [image]  
> **Pull Ups**

> [image]  
> **Bench Press**

> [image]  
> **Running**

Provide a clear **Add Exercise** button.

## Exercise editor

Selecting an exercise opens an editor, either:

- In a right-side panel
- In a modal
- On a dedicated page

Fields:

- Name
- Image path / image preview
- Tips
- Activity type, if applicable

Example:

> **Pull Ups**  
> Image: `/images/pull-ups.webp`  
>  
> **Tips**  
> - Keep shoulders depressed  
> - Use full range of motion

The image path may be text-based; image uploading is not required.

The editor should make it easy to preview the referenced image.

## Delete/archive action

A destructive action should exist but be visually secondary and require confirmation.

---

# 3. Workouts Screen

## Goal

Create workout templates and define which exercises they contain.

## Workout list

Show all workouts.

Example:

- Push
- Pull
- Legs
- Running
- Swimming

Include:

> **Add Workout**

## Workout editor

When a workout is selected, show:

- Workout name
- Workout type
- Ordered exercise list

Example:

> **Pull**  
> Strength  
>  
> 1. Pull Ups — 4 × 8 · +10 kg · 2:00 rest  
> 2. Lat Pulldown — 3 × 10 · 60 kg · 1:30 rest  
> 3. Seated Row — 3 × 10 · 55 kg · 1:30 rest

The exercise order should ideally support drag-and-drop.

## Add exercise to workout

Provide a visible action:

> **+ Add Exercise**

This should open a searchable selector from the exercise library.

Once selected, the user configures the exercise prescription for this workout.

For strength exercises, common fields include:

- Sets
- Reps
- Weight
- Rest time

For cardio activities, fields may differ, such as:

- Duration
- Distance
- Pace

## Edit exercise prescription

Selecting an exercise row should expose its workout-specific values without editing the underlying exercise definition.

This can be:

- Inline
- In a right-side inspector panel
- In a small modal

## Remove from workout

Each exercise should have a clear but secondary removal action.

---

# 4. Weekly Schedule Screen

## Goal

Configure which workouts are normally planned for each day.

## Main layout

Use a week-based layout.

Example:

| Day | Planned workout |
|---|---|
| Monday | Push |
| Tuesday | Running |
| Wednesday | Pull |
| Thursday | Rest |
| Friday | Legs |
| Saturday | Swimming |
| Sunday | Rest |

A more visual card/calendar layout is also appropriate.

## Interaction

The user should be able to:

- Assign a workout to a day
- Assign multiple workouts to a day
- Remove a workout from a day
- Reorder multiple workouts if needed

Possible interaction patterns:

- Dropdown per day
- Drag workouts onto days
- Add button inside each day card

Keep the weekly schedule visually simple.

---

# 5. History Screen

## Goal

Review completed workout sessions.

## Main history table

Recommended columns:

- Date
- Workout
- Duration
- Completion summary

Example:

| Date | Workout | Duration | Summary |
|---|---|---:|---|
| Sep 26 | Pull | 48 min | 5 completed |
| Sep 24 | Running | 31 min | 5.2 km |
| Sep 23 | Push | 54 min | 6 completed |

Provide simple filtering by:

- Workout
- Date range
- Activity type

Search is optional.

## Session detail

Selecting a history row opens a detailed session view.

Show:

- Workout name
- Date/time
- Duration
- Workout note
- Each exercise
- Actual performance per set

Example:

> **Pull · Sep 26**  
> 48 min  
>  
> **Pull Ups**  
> Set 1 — 10 kg × 8  
> Set 2 — 10 kg × 8  
> Set 3 — 10 kg × 7  
> Set 4 — 10 kg × 7

History is primarily read-only.

---

# 6. Empty States

Designer should provide thoughtful empty states for:

## No exercises

> **No exercises yet**  
> Add your first exercise to start building workouts.  
> **Add Exercise**

## No workouts

> **No workouts yet**  
> Create a workout and add exercises from your library.  
> **Create Workout**

## No workout history

> **No completed workouts yet**  
> Completed sessions will appear here.

---

# 7. Responsive Behavior

Although the desktop app is intended for computers, it should degrade gracefully on narrower browser windows.

Recommended behavior:

- Sidebar may collapse.
- Tables may become stacked cards.
- Editors may become full-width panels.
- Drag-and-drop should have an accessible alternative.

The phone workout flow is a separate experience and should not simply be a compressed desktop UI.

---

# 8. General Desktop Design Guidelines

- Favor efficient editing over oversized mobile-style controls.
- Use consistent exercise imagery across phone and desktop.
- Support drag-and-drop where it improves ordering.
- Make workout prescriptions easy to scan.
- Keep destructive actions secondary.
- Distinguish clearly between:
  - Exercise definitions
  - Workout-specific targets
  - Historical workout results
- Use inline or side-panel editing to minimize navigation.
- Avoid unnecessary analytics in the first version.
- Preserve a clean, personal, utility-focused visual style.
