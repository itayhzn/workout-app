# Workout App — Phone Screens

## Purpose

The phone experience is optimized for use **during a workout**. It should be quick, glanceable, touch-friendly, and require as little typing as possible.

The visual hierarchy should prioritize:
1. What workout should I do today?
2. What exercise am I doing now?
3. What set am I on?
4. How long until my rest ends?
5. What did I do last time?

The app should feel lightweight and focused rather than like a complex fitness platform.

---

# 1. Home / Workout Selection

## Goal

Let the user quickly start today's scheduled workout, while still allowing them to choose a different workout.

## Main content

### Today's workout card

A prominent card near the top of the screen.

Example:

> **Pull**  
> 5 exercises · approximately 50 min  
> **Start Workout**

If more than one workout is scheduled that day, show multiple workout cards.

If nothing is scheduled, show a neutral empty state such as:

> **No workout scheduled today**  
> Choose a workout below.

### Choose another workout

A compact selector below the scheduled workout card.

Example:

> Choose another workout ▾

It should contain all available workouts.

### Recent workouts

A small recent-history section beneath the workout selection.

Example:

| Date | Workout | Duration |
|---|---|---|
| Sep 23 | Push | 51 min |
| Sep 21 | Pull | 47 min |
| Sep 20 | Running | 31 min |

On phone, this can be horizontally scrollable, vertically scrollable, or shown as a compact list.

The user should be able to tap a recent workout to view its summary.

### Active workout state

If a workout is already in progress, the active session should take priority over the normal home screen.

Example:

> **Workout in progress**  
> Pull · started 34 min ago  
> **Resume Workout**

---

# 2. Workout Screen

## Goal

Show all exercises in the current workout and make it obvious what is complete, what remains, and what the user should do next.

## Header

Show:

- Workout name
- Elapsed workout time
- Progress through the workout

Example:

> **Pull**  
> 42 min  
> 3 / 5 exercises complete

A simple progress bar may be used.

## Exercise gallery

Exercises should appear as touch-friendly tiles/cards.

Each tile should contain:

- Exercise image
- Exercise name
- Target sets × reps
- Target weight, where relevant
- Completion state

Example:

> [Exercise image]  
> **Pull Ups**  
> 4 × 8 · +10 kg

Completed exercise:

> ✓  
> **Pull Ups**  
> 4 sets complete

Completed exercises may be visually muted or greyed out, with a clear green checkmark.

The image should remain recognizable even when the exercise is complete.

## Rest timer

If a rest timer is active, it should remain visible from the workout screen.

Suggested placement: sticky component near the bottom.

Example:

> **Rest** 01:23  
> Skip · +30 sec

The timer should be visually noticeable without dominating the entire screen.

## Workout actions

Include:

- Finish Workout
- Optional overflow menu for less common actions

The user may finish a workout even if not every exercise was completed.

---

# 3. Exercise Screen — Strength Exercise

## Goal

Make recording sets extremely fast while still showing the most useful context from the previous workout.

## Header

Show:

- Exercise name
- Back button to workout
- Completion state if already complete

## Exercise image

A reasonably large image near the top.

The image is informational rather than decorative and should make the exercise easy to identify.

## Target summary

Show today's prescribed target prominently.

Example:

> **Target**  
> +10 kg · 4 × 8 · Rest 2:00

Individual values should look tappable/editable.

Typical editable values:

- Weight
- Repetitions
- Number of sets
- Rest time

Editing should feel lightweight rather than opening a full settings page.

## Previous performance

Show a compact reference to the most recent performance.

Example:

> **Last time · Sep 21**  
> +10 kg · 8 / 8 / 7 / 7

Optionally show a simple personal-best reference if useful later.

## Set list

The core interaction.

Example:

| Set | Weight | Reps | State |
|---|---:|---:|---|
| 1 | 10 kg | 8 | ✓ |
| 2 | 10 kg | 8 | ✓ |
| 3 | 10 kg | 8 | Complete |
| 4 | 10 kg | 8 | — |

Rows should be large enough to edit with one hand.

Tapping weight or reps should allow quick inline editing.

The current/next set should be visually emphasized.

## Complete Set button

A large primary action near the lower portion of the screen.

> **Complete Set**

After tapping it:

- The set becomes completed.
- The rest timer begins.
- The interface advances naturally toward the next set.

For the final set, show a brief exercise-complete state before returning to the workout.

## Skip exercise

A secondary action should allow the user to skip the exercise.

It should be visually subordinate to the primary set-completion action.

## Tips

Exercise tips can appear in a collapsible section.

Example:

> **Tips**  
> Keep shoulders depressed  
> Use full range of motion

They should not clutter the main workout interaction.

---

# 4. Exercise Screen — Cardio / Duration-Based Activity

## Goal

Support workouts such as running and swimming without forcing them into a sets-and-weight interface.

The exact fields may differ by activity type.

Possible information includes:

- Duration
- Distance
- Target pace
- Completed distance
- Notes

Example:

> **Running**  
> Target: 30 min · 5 km  
>  
> Duration: 31:42  
> Distance: 5.2 km  
>  
> **Complete Activity**

The visual language should remain consistent with strength exercises.

---

# 5. Rest Timer State

## Goal

Make rest easy to track from anywhere inside the active workout.

The timer should persist while navigating between exercises.

Suggested compact state:

> **Rest**  
> 01:23  
> Skip · +30 sec

When expanded, it may also show:

- Which exercise/set triggered the timer
- Pause/reset if desired
- Default rest duration

When the timer reaches zero, use a clear visual change and optional vibration/sound if supported.

---

# 6. Edit Value Interaction

Values such as weight, reps, sets, and rest time should be editable directly from the exercise screen.

Default state:

> Weight  
> **10 kg**

After tapping:

> Weight  
> [ 10 ] kg  
> **Save** · Cancel

Editing should avoid large modal forms whenever possible.

Numeric keyboards should be used where appropriate.

---

# 7. Exercise Complete State

After the final set:

> ✓ **Exercise complete**

Possible actions:

- Back to workout
- Review sets
- Add/edit note

The completion state should feel satisfying but brief.

---

# 8. Finish Workout

When the user taps **Finish Workout**, show a concise summary before returning home.

Example:

> **Workout complete**  
> Pull  
> 48 min  
> 5 exercises  
> 17 sets  
>  
> **Done**

If some exercises were skipped, show them clearly but neutrally.

Example:

> 4 completed · 1 skipped

The summary may optionally contain a workout note field.

---

# 9. Workout History Detail

Accessible by tapping a recent workout.

Show:

- Date
- Workout name
- Duration
- Completed/skipped exercises
- Actual set-by-set performance
- Workout note, if present

Example:

> **Pull · Sep 21**  
> 47 min  
>  
> **Pull Ups**  
> 10 kg × 8  
> 10 kg × 8  
> 10 kg × 7  
> 10 kg × 7  
>  
> **Lat Pulldown**  
> 60 kg × 10  
> 60 kg × 10  
> 60 kg × 9

This screen is primarily for review, not editing.

---

# 10. General Phone Design Guidelines

- Optimize for one-handed use.
- Use large tap targets.
- Keep important workout actions near the bottom half of the screen where practical.
- Minimize typing.
- Prefer inline editing and numeric controls.
- Maintain very clear visual states: upcoming, current, completed, skipped.
- Keep the active rest timer visible across the workout flow.
- Exercise images should support recognition, not dominate the interface.
- Avoid unnecessary fitness-dashboard clutter during an active workout.
- Dark mode would be useful, especially for evening gym use.
- The design should feel personal and utilitarian rather than social or gamified.
