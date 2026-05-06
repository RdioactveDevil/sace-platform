# Writing Feature Design Spec

## Goal

Add English Writing as a subject for Year 5–6, Year 7–8, and Year 9–10. Students receive an AI-generated prompt, write a full essay or fill in a structured planner, then receive scholarship-assessor-style annotated feedback. Attempts are stored in Supabase.

---

## Section 1 — Architecture & Data Model

### New Subjects

Three entries added to `artifacts/gradefarm/src/lib/subjects.js` with `type: 'writing'`:

| id | name |
|---|---|
| `writing_y56` | Writing (Year 5–6) |
| `writing_y78` | Writing (Year 7–8) |
| `writing_y910` | Writing (Year 9–10) |

### App Routing

`App.jsx` adds one branch before the existing `<HomeScreen>` render:

```js
if (selectedSubject?.type === 'writing') {
  return <WritingScreen subject={selectedSubject} profile={profile} />
}
```

### Supabase Table: `writing_attempts`

| column | type | notes |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | FK → profiles.id |
| subject | text | e.g. `writing_y78` |
| essay_type | text | `narrative` \| `persuasive` |
| mode | text | `full_essay` \| `prompt_planner` |
| prompt | text | prompt text shown to student |
| image_url | text | Unsplash image URL (nullable) |
| content | jsonb | essay string OR planner fields object |
| feedback | jsonb | structured feedback from Claude |
| timed | boolean | |
| duration_seconds | integer | allotted time in seconds (null = untimed) |
| actual_seconds | integer | how long student actually took |
| created_at | timestamptz | default now() |

### New Files

| file | purpose |
|---|---|
| `artifacts/gradefarm/src/components/WritingScreen.jsx` | Full UI — all four stages |
| `artifacts/gradefarm/src/lib/writingDb.js` | Save attempt, load past attempts |
| `artifacts/api-server/src/routes/writing.ts` | `/api/writing/prompt` and `/api/writing/feedback` |

---

## Section 2 — UI Flow (WritingScreen)

The screen has four sequential stages. The back button returns to SubjectPicker.

### Stage 1 — Setup

Controls:
- **Essay type**: Narrative | Persuasive (button toggle)
- **Mode**: Full Essay | Prompt Planner (button toggle)
- **Timer** (Full Essay mode): Untimed toggle + free number input (minutes) when timed
- **Past Attempts** link at bottom — lists previous submissions for this subject

"Generate Prompt" button calls `/api/writing/prompt` and advances to Stage 2.

### Stage 2 — Prompt Display

- If Narrative and `imageUrl` is returned: image shown above prompt text
- Prompt text displayed in a readable card
- "Start Writing" button advances to Stage 3 and starts timer (if timed)

### Stage 3 — Writing

The prompt (and image if present) remains visible in a panel above the writing area throughout this stage.

**Full Essay mode**
- Single large textarea
- Timer shown in corner if timed (countdown from user's chosen duration)
- "Submit" button available at any time

**Prompt Planner mode**
- Own timed/untimed toggle, defaulting to timed with 2-minute recommended duration
- Timer shown in corner if timed
- **Narrative fields** (6 short textareas):
  1. Context / Scene
  2. Rising Action
  3. Climax
  4. Falling Action
  5. Resolution
  6. Character Development
- **Persuasive fields** (4 short textareas):
  1. Contention
  2. Argument 1
  3. Argument 2
  4. Important Points to Include
- "Submit" button available at any time

### Stage 4 — Feedback

- Loading state while `/api/writing/feedback` runs
- Structured feedback displayed inline:
  - **Overall impression** — scholarship/select-entry assessor tone
  - **Annotations** — specific strengths and weaknesses, with quoted excerpts where possible
  - **What to improve next time** — bullet list
- Attempt (content + feedback) saved to `writing_attempts` via `writingDb.js`
- "Try Again" and "Change Subject" buttons

---

## Section 3 — API Design

Both routes live in `artifacts/api-server/src/routes/writing.ts` and are registered in the main Express router.

### `POST /api/writing/prompt`

**Body:** `{ subject: string, essayType: 'narrative' | 'persuasive', mode: string }`

**Behaviour:**
- Claude generates a writing prompt appropriate for the year level and essay type
- For Narrative prompts: Claude is instructed to include an `imageQuery` string (evocative scene description) approximately 60% of the time
- If `imageQuery` is present, the server fetches the top result from Unsplash API using `UNSPLASH_ACCESS_KEY` env var and returns the image URL
- Persuasive prompts are text-only

**Response:** `{ prompt: string, imageUrl?: string }`

**Claude system prompt (Narrative):**
> You are generating creative writing prompts for students aged [year range]. Return a JSON object with keys: `prompt` (string, 2–4 sentences setting a scenario) and optionally `imageQuery` (string, a short evocative phrase suitable for an Unsplash image search, include ~60% of the time). No markdown, no commentary outside the JSON.

**Claude system prompt (Persuasive):**
> You are generating persuasive writing prompts for students aged [year range]. Return a JSON object with a single key: `prompt` (string, 1–2 sentences stating a position to argue for or against). No markdown, no commentary outside the JSON.

### `POST /api/writing/feedback`

**Body:** `{ subject, essayType, mode, prompt, imageUrl?, content }`

- `content` is a plain string for Full Essay mode, or a keyed object for Prompt Planner mode (keys match field names)

**Behaviour:**
- Claude receives the original prompt, image context (if any), and the student's response
- Instructed to assess as a scholarship/select-entry assessor: specific, constructive, encouraging but honest

**Response:**
```json
{
  "overallImpression": "string",
  "annotations": [
    { "aspect": "string", "comment": "string", "quote": "string?" }
  ],
  "improvements": ["string"]
}
```

**Stored directly in `writing_attempts.feedback` as jsonb.**

---

## Section 4 — Integration Points

### SubjectPicker

Writing subjects appear in the existing SubjectPicker via `ALL_SUBJECTS`. They use a distinct icon (pencil/✏️) and colour (e.g. teal) to visually differentiate from MCQ subjects. No structural changes to SubjectPicker.

### App.jsx

One new routing branch added before `<HomeScreen>`:

```js
if (selectedSubject?.type === 'writing') {
  return <WritingScreen subject={selectedSubject} profile={profile} onBack={() => setSelectedSubject(null)} />
}
```

### History / My Progress

Writing attempts are not mixed into the existing MCQ History or Progress screens. Past attempts are accessible via the "Past Attempts" link on WritingScreen Stage 1 only.

### Admin

No admin panel changes. Writing prompts are generated on-demand; no pre-seeding required.

---

## Out of Scope

- Spell-check or grammar highlighting during writing
- Sharing or exporting essays
- Teacher/parent visibility into attempts
- Writing subjects appearing in the Leaderboard or Study Plan tabs
