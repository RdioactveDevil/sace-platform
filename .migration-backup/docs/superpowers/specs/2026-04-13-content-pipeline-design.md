# GradeFarm Content Pipeline — Design Spec
**Date:** 2026-04-13
**Status:** Approved

## Problem

Content volume is the single biggest gap between GradeFarm today and a platform students can use
throughout a full SACE term. Students run out of questions too quickly. The existing
`bulk-import-questions.mjs` script is hard to understand and run.

## Goal

Give the admin an in-app UI to:
1. Extract MCQs from uploaded PDFs (textbooks, past exams)
2. Generate MCQs by topic using AI
3. Review, edit, and approve questions before they go live

Scope: MCQ only, Chemistry Stage 1 and Stage 2 only.

---

## Access Control

- Add `is_admin boolean default false` to the `profiles` table.
- Set manually in Supabase for admin users.
- New `AdminRoute` wrapper component: checks `profile.is_admin`; redirects non-admins to `/home`.
- Routes: `/admin`, `/admin/upload`, `/admin/generate`, `/admin/review`
- No separate auth — same session and `getProfile` call as the rest of the app.

---

## Pipeline 1: PDF Extraction

### Flow
1. Admin uploads a PDF on the `/admin/upload` screen and selects the stage (S1 or S2).
2. The app calls a new Vercel serverless function `POST /api/extract-pdf`.
3. The function sends the PDF text to Claude with:
   - The full topic/subtopic list for the selected stage (see below)
   - Instructions to extract MCQs and map each to the correct topic code
   - A required JSON output schema
4. Claude returns a JSON array of draft questions.
5. Questions are inserted into `draft_questions` with `source = 'pdf_extract'` and `status = 'pending'`.
   - If a question cannot be confidently mapped to a topic, it is inserted with `status = 'needs_review'`.
6. The UI shows a completion summary: "X questions extracted, Y need topic review."

### Topic/Subtopic Lists (used in extraction prompt)

**Stage 1**
| Code | Topic |
|------|-------|
| 1.1 | Properties and uses of materials |
| 1.2 | Atomic structure |
| 1.3 | Quantities of atoms |
| 2.1 | Types of materials |
| 2.2 | Bonding between atoms |
| 2.3 | Quantities of molecules and ions |
| 3.1 | Molecule polarity |
| 3.2 | Interactions between molecules |
| 3.3 | Hydrocarbons |
| 3.4 | Polymers |
| 4.1 | Miscibility and solutions |
| 4.2 | Solutions of ionic substances |
| 4.3 | Quantities in reactions |
| 4.4 | Energy in reactions |
| 5.1 | Acid–base concepts |
| 5.2 | Reactions of acids and bases |
| 5.3 | The pH scale |
| 6.1 | Concepts of oxidation and reduction |
| 6.2 | Metal reactivity |
| 6.3 | Electrochemistry |

**Stage 2**
| Code | Topic |
|------|-------|
| 1.1 | Global warming and climate change |
| 1.2 | Photochemical smog |
| 1.3 | Volumetric analysis |
| 1.4 | Chromatography |
| 1.5 | Atomic spectroscopy |
| 2.1 | Rates of reactions |
| 2.2 | Equilibrium and yield |
| 2.3 | Optimising production |
| 3.1 | Introduction to organic chemistry |
| 3.2 | Alcohols |
| 3.3 | Aldehydes and ketones |
| 3.4 | Carbohydrates |
| 3.5 | Carboxylic acids |
| 3.6 | Amines |
| 3.7 | Esters |
| 3.8 | Amides |
| 3.9 | Triglycerides |
| 3.10 | Proteins |
| 4.1 | Energy resources |
| 4.2 | Water |
| 4.3 | Soil |
| 4.4 | Materials resources |

---

## Pipeline 2: AI Generation

### Flow
1. Admin goes to `/admin/generate` and selects:
   - Stage (S1 or S2)
   - Topic/subtopic (dropdown from the list above)
   - Count (5, 10, 20)
   - Difficulty (1–5 or "mixed")
2. The app calls `POST /api/generate-questions`.
3. The function sends a prompt to Claude with the topic, subtopic code, difficulty target, and
   required JSON schema.
4. Questions are inserted into `draft_questions` with `source = 'ai_generated'` and `status = 'pending'`.
5. The UI shows: "X questions generated." with a link to the review queue.

---

## Review Queue

Route: `/admin/review`

### Table view
- Columns: question preview (truncated), topic code, difficulty, source, status
- Filter by: status (pending / needs_review), stage, topic
- Bulk-approve: checkbox selection + "Approve selected" button for questions that look clean

### Inline edit panel
Opens when a row is clicked. Editable fields:
- Question text
- Options A–D (with correct answer selector)
- Topic/subtopic dropdown (populated from the stage's topic list)
- Difficulty (1–5)
- Solution/explanation text
- KaTeX preview — renders math in real time so the admin can verify rendering before approving

### Actions
- **Approve** — inserts into live `questions` table, marks draft `status = 'approved'`
- **Reject** — marks draft `status = 'rejected'` (kept as audit trail, not deleted)

---

## Data Model

### New table: `draft_questions`

```sql
create table public.draft_questions (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,      -- 'pdf_extract' | 'ai_generated'
  source_file   text,               -- original PDF filename if from extraction
  subject       text not null,      -- 'Chemistry Stage 1' | 'Chemistry Stage 2'
  topic_code    text,               -- e.g. '2.2'
  topic         text,               -- e.g. 'Equilibrium and yield'
  subtopic      text,
  question      text not null,
  options       jsonb not null,     -- array of 4 strings
  answer_index  integer not null,   -- 0-indexed
  solution      text,
  difficulty    integer,            -- 1–5
  status        text not null default 'pending',
                                    -- 'pending' | 'needs_review' | 'approved' | 'rejected'
  created_at    timestamptz default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid references public.profiles(id)
);

create index on public.draft_questions(status);
create index on public.draft_questions(subject);
```

RLS: only `is_admin = true` profiles can read/write.

### `profiles` table change
```sql
alter table public.profiles add column if not exists is_admin boolean default false;
```

### `saceTopics.js` change
Add topic codes (e.g. `'1.1'`, `'2.2'`) to the Stage 1 and Stage 2 topic exports so the
dropdown and prompt-building logic share a single source of truth.

### Live `questions` table
Unchanged. On approve, a row is inserted using the draft's fields mapped to the existing schema.

---

## New Files

| File | Purpose |
|------|---------|
| `src/components/AdminRoute.jsx` | Auth wrapper — redirects non-admins |
| `src/components/AdminScreen.jsx` | Top-level admin layout + sub-routes |
| `src/components/AdminUploadScreen.jsx` | PDF upload UI |
| `src/components/AdminGenerateScreen.jsx` | Topic-based generation UI |
| `src/components/AdminReviewScreen.jsx` | Draft queue table + inline edit panel |
| `api/extract-pdf.js` | Vercel function — PDF text → Claude → draft_questions |
| `api/generate-questions.js` | Vercel function — topic params → Claude → draft_questions |

---

## Out of Scope (this spec)

- Other question types (short answer, worked calculations)
- Subjects beyond Chemistry S1/S2
- Multi-user admin roles
- Automated quality scoring
- Duplicate detection
