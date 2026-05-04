# Design: Quiz Navigation Guard, Session Summary & Study Plan To-Do List

**Date:** 2026-05-04  
**Status:** Approved

---

## 1. Navigation Guard

### Goal
Prevent students from accidentally losing quiz progress by navigating away mid-session.

### Trigger condition
A session is considered active when `sessionAnswered.length > 0 && !finished`.

### Implementation
- A single `useBlocker` call in `App.jsx` watches the active condition.
- When triggered, a modal renders with two actions:
  - **"Stay in Quiz"** — calls `blocker.reset()`
  - **"Leave Anyway"** — calls `blocker.proceed()`
- Intercepts: sidebar navigation, browser back button, all `navigate()` calls.
- Does not intercept: page refresh or tab close (browser-level, not reachable by React Router).

### Scope
All navigation paths are guarded — sidebar links, browser back, and programmatic route changes.

---

## 2. Session Summary

### Goal
When a quiz session ends, give the student a coaching insight and a clear next step.

### Trigger
Session is finished (`finished === true`) — either all questions answered or bank exhausted.

### AI Coaching Tip
- Call `/api/chat` with a structured prompt containing: `{ subject, totalAnswered, correct, wrongByTopic }`.
- All of these values are available in QuizScreen's existing state.
- Claude returns a single coaching sentence tailored to the session performance.
- While loading: a small inline spinner replaces the tip area.
- On failure: tip area is silently omitted — no error shown to the student.

### CTA
- A **"Go to Study Plan →"** button navigates to `/study-plan`.
- The quiz blocker is already cleared at this point (`finished === true`), so no conflict.

---

## 3. Study Plan To-Do List

### Goal
Give students a structured, actionable task list based on their mastery gaps, refreshed automatically after each quiz.

### Data Shape
Stored in `localStorage` under key `gradefarm_todo_${userId}`:

```json
[
  {
    "id": "uuid",
    "topic": "Linear Functions",
    "subject": "Mathematics",
    "action": "practice" | "revise",
    "estimatedMinutes": 15,
    "done": false
  }
]
```

### Generation
- "Generate To-Do List" button in StudyPlanScreen calls `/api/chat`.
- Prompt contains the student's topic mastery data (from Supabase `user_progress`).
- Claude returns a JSON array of 5–8 tasks mixing `practice` and `revise` actions, weighted toward weak topics.
- Response is parsed, each task given a UUID, saved to localStorage, and rendered immediately.

### Auto-Refresh After Quiz
- After every quiz session ends, if a to-do list already exists for the user, it regenerates silently in the background using the same `/api/chat` call.
- No user action required — the list stays current automatically.

### UI Per Task
| Element | Detail |
|---|---|
| Checkbox | Toggles `done`; persisted to localStorage immediately |
| Label | Topic name + estimated time (e.g. "Linear Functions · 15 min") |
| Badge | "Practice Quiz" or "Study & Revise" |
| Start button | Routes based on action type (see below) |

### Start Button Routing
- `practice` → `/quiz` with that topic pre-selected
- `revise` → `/learn` with the topic pre-filled (existing AI tutor screen)

### Persistence
- localStorage key: `gradefarm_todo_${userId}`
- Checkboxes write immediately on toggle.
- Full list is replaced (not merged) on regeneration — `done` state is lost on refresh (intentional: each regeneration reflects new session data).

---

## Out of Scope
- Persisting to-do list to Supabase (localStorage is sufficient for now)
- Per-task progress tracking beyond the checkbox
- Blocking quiz exit if to-do list regeneration is in-flight
