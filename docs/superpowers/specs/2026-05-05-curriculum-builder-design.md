# Curriculum Builder — Design Spec
**Date:** 2026-05-05  
**Status:** Approved

## Overview

A new Admin feature that lets an admin describe a subject in plain text, receive an AI-generated topic/subtopic tree, edit it in a visual UI, then auto-generate 25 seed questions per subtopic. This makes adding new subjects to GradeFarm a structured, mostly-automated workflow instead of a manual topic-by-topic effort.

---

## Data Model

Three new Supabase tables:

### `curricula`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "Year 9 SACE Biology" |
| subject_description | text | admin's original prompt to AI |
| status | text | `draft` \| `generating` \| `live` |
| created_by | uuid FK → profiles | |
| created_at | timestamptz | |

### `curriculum_topics`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| curriculum_id | uuid FK → curricula | |
| name | text | |
| order_index | int | for display ordering |

### `curriculum_subtopics`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| topic_id | uuid FK → curriculum_topics | |
| curriculum_id | uuid FK → curricula | |
| name | text | |
| order_index | int | |
| gen_status | text | `pending` \| `generating` \| `done` \| `failed` |
| questions_generated | int | default 0 |

---

## API Endpoints

### `POST /api/admin/curriculum-plan`
**Input:** `{ subjectDescription: string }`  
**Output:** `{ topics: [{ name, subtopics: [{ name }] }] }`  
Calls Claude to generate a structured topic/subtopic tree for the given subject. Does not persist anything — caller saves after user edits.

### `POST /api/admin/curricula`
**Input:** `{ id?, name, subjectDescription, topics: [{ name, subtopics: [{ name }] }] }`  
**Output:** `{ curriculumId }`  
Creates or updates a curriculum and its full topic/subtopic tree. Replaces existing topics/subtopics on update (full replace, not patch).

### `POST /api/admin/curriculum-generate`
**Input:** `{ subtopicId, curriculumId, subjectName, topicName, subtopicName, count: 25 }`  
**Output:** `{ inserted: number }`  
Reuses the existing `generate-questions` logic. On success, sets `gen_status = 'done'` and `questions_generated = count` on the subtopic row. On failure, sets `gen_status = 'failed'`.

---

## Components

### `AdminCurriculaTab` (list page)
- New tab in `AdminScreen` nav, labelled **Curricula**, placed between Assignments and All Users
- Displays all curricula as cards showing: name, status badge, topic count, subtopic count, questions generated / total, created date
- **"+ New Curriculum"** button (top right) opens a modal
- Modal contains a single textarea ("Describe the subject…") and a **Generate Plan** button
- On success, navigates to `AdminCurriculumDetail` with the AI-proposed tree pre-populated
- Empty state shows centered prompt with inline button

**Status badge colours:**
- `draft` → yellow (`#f1be43`)
- `generating` → blue (`#38bdf8`), animated pulse
- `live` → green (`#4ade80`)

### `AdminCurriculumDetail` (tree editor + progress panel)
Accessible via `/admin/curricula/:id`.

**Top bar:**
- Subject name — inline editable (click → input, blur to save)
- Status badge
- **Save Draft** button
- **Approve & Generate** button (gold, only active when status is `draft`)
- **← Back** link

**Left panel (~60% width) — Editable Tree:**
- Topics rendered as collapsible rows
- Subtopics indented under each topic
- Every node supports:
  - Click-to-rename (click text → inline input, blur to save)
  - Up/Down arrow buttons to reorder
  - **×** delete (confirms before deleting a topic with subtopics)
- **+ Add Subtopic** button under each topic
- **+ Add Topic** button at the bottom of the list

**Right panel (~40% width) — Generation Progress (shown after Approve):**
- Overall progress bar: "X / Y questions generated"
- Per-subtopic status list with chips: `Pending` / `Generating` / `Done ✓` / `Failed ✗`
- Questions generated count per subtopic (e.g. "25 / 25")
- **Retry** button next to any `Failed` subtopic

---

## Generation Pipeline

When **Approve & Generate** is clicked:

1. Curriculum status → `generating`, persisted via `POST /api/admin/curricula`
2. Frontend iterates subtopics sequentially (one at a time, not parallel) to avoid overloading the Claude API
3. For each subtopic:
   - Set local state to `generating`
   - Call `POST /api/admin/curriculum-generate`
   - On resolve: subtopic → `done`, `questions_generated = 25`
   - On reject: subtopic → `failed`, pipeline continues to next subtopic
4. Frontend polls subtopic statuses from DB every 5 seconds to keep progress panel live
5. When all subtopics are `done` or `failed`, curriculum status → `live`

**Failure handling:** Failed subtopics do not block the pipeline. Admin sees which failed and can retry individually. Retry calls the same endpoint for that subtopic only.

**Draft queue integration:** Questions generated here land in `draft_questions` with `status = 'pending'`, identical to the existing Generate tab flow. Admin approves them via the existing Review Queue — no new approval path.

---

## Integration with Existing System

### `adminTopics.js` — dynamic subjects
`getTopicsBySubject(subject)` is currently synchronous (returns from hardcoded data). To avoid making all callers async, managed curricula topics are preloaded once at app init into a module-level cache (a plain object keyed by subject name). `getTopicsBySubject` checks the hardcoded SACE subjects first (no regression), then falls back to the cache for managed curricula.

A new `loadManagedCurriculaTopics()` async function fetches all `live` curricula with their topics/subtopics from DB and populates the cache. It is called once on admin dashboard mount and again after any curriculum goes live.

This makes new curricula immediately available in the Generate tab and quiz engine subject picker without changing the signature of `getTopicsBySubject`.

### `AdminGenerateScreen`
The static subject pill buttons gain a second section: **"Managed Curricula"** — a list of all `live` or `generating` curricula fetched from DB. Admin can generate additional questions for any topic in any managed curriculum using the existing flow.

### `AdminScreen`
`AdminCurriculaTab` added to the `tabs` array and `Routes` at `/admin/curricula`. The tab component manages list ↔ detail navigation internally via a `selectedId` state — no additional nested React Router routes. This matches how the existing detail panels (Students, Tutors) work.

### Review Queue
No changes. Curriculum-generated questions appear here exactly like manually-generated ones.

---

## Out of Scope
- Drag-and-drop reordering (up/down arrows only for now)
- Auto-approving curriculum questions (they go through the existing review queue)
- Student-facing subject picker updates (that's a separate onboarding/enrollment flow)
- Email notifications when generation completes
