# Content Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-app admin UI that lets the developer extract MCQs from uploaded PDFs and generate them by topic using Claude, with a draft review queue before questions go live.

**Architecture:** A password-protected `/admin` section in the existing React app backed by two new Vercel API functions (`extract-pdf`, `generate-questions`). All AI-produced questions land in a new `draft_questions` Supabase table; the admin reviews and approves them into the live `questions` table. Admin DB helpers live in a new `src/lib/adminDb.js` to keep `db.js` focused.

**Tech Stack:** React CRA, Supabase (postgres + RLS), Vercel serverless functions, Anthropic Claude API (PDF document blocks + text generation), KaTeX (reuses existing `MathText` component).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/adminTopics.js` | S1/S2 topic code arrays — single source of truth for dropdowns and API prompts |
| Create | `src/lib/adminDb.js` | Supabase helpers: get/upsert/approve/reject draft questions |
| Create | `api/extract-pdf.js` | Vercel function — receives base64 PDF + stage → Claude → inserts drafts |
| Create | `api/generate-questions.js` | Vercel function — receives topic params → Claude → inserts drafts |
| Create | `src/components/AdminRoute.jsx` | Auth wrapper — redirects non-admins to /question-bank |
| Create | `src/components/AdminScreen.jsx` | Admin shell with sub-navigation tabs |
| Create | `src/components/AdminUploadScreen.jsx` | PDF upload form + progress feedback |
| Create | `src/components/AdminGenerateScreen.jsx` | Topic/count/difficulty form + feedback |
| Create | `src/components/AdminReviewScreen.jsx` | Draft queue table + inline edit/approve panel |
| Modify | `supabase_schema.sql` | Add is_admin column + draft_questions table |
| Modify | `src/App.jsx` | Register /admin/* routes |

---

## Task 1: Database Schema

**Files:**
- Modify: `supabase_schema.sql`

- [ ] **Step 1: Add is_admin column and draft_questions table to supabase_schema.sql**

Open `supabase_schema.sql` and append the following at the end of the file (after the last existing block):

```sql
-- =========================
-- ADMIN
-- =========================
alter table public.profiles add column if not exists is_admin boolean default false;

-- =========================
-- DRAFT QUESTIONS
-- =========================
create table if not exists public.draft_questions (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,
  source_file   text,
  subject       text not null,
  topic_code    text,
  topic         text,
  subtopic      text,
  question      text not null,
  options       jsonb not null,
  answer_index  integer not null,
  solution      text,
  difficulty    integer,
  status        text not null default 'pending',
  created_at    timestamptz default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid references public.profiles(id)
);

create index if not exists idx_draft_questions_status  on public.draft_questions(status);
create index if not exists idx_draft_questions_subject on public.draft_questions(subject);

alter table public.draft_questions enable row level security;

drop policy if exists "draft_questions_admin" on public.draft_questions;
create policy "draft_questions_admin"
  on public.draft_questions for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );
```

- [ ] **Step 2: Run the SQL in Supabase**

Go to the Supabase dashboard → SQL Editor → paste the block above → Run.

- [ ] **Step 3: Verify**

In Supabase Table Editor, confirm:
- `profiles` has an `is_admin` column (boolean, default false)
- `draft_questions` table exists with the columns above

- [ ] **Step 4: Set yourself as admin**

In Supabase SQL Editor, run (replace the email):

```sql
update public.profiles
set is_admin = true
where id = (select id from auth.users where email = 'your-email@example.com');
```

---

## Task 2: adminTopics.js

**Files:**
- Create: `src/lib/adminTopics.js`
- Test: `src/lib/adminTopics.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/adminTopics.test.js`:

```javascript
import { S1_TOPICS, S2_TOPICS, getTopicByCode } from './adminTopics'

test('S1_TOPICS has 20 entries', () => {
  expect(S1_TOPICS).toHaveLength(20)
})

test('S2_TOPICS has 22 entries', () => {
  expect(S2_TOPICS).toHaveLength(22)
})

test('every topic has a code and name', () => {
  ;[...S1_TOPICS, ...S2_TOPICS].forEach(t => {
    expect(typeof t.code).toBe('string')
    expect(typeof t.name).toBe('string')
    expect(t.code.length).toBeGreaterThan(0)
    expect(t.name.length).toBeGreaterThan(0)
  })
})

test('getTopicByCode returns correct S1 topic', () => {
  expect(getTopicByCode('s1', '2.2')).toEqual({ code: '2.2', name: 'Bonding between atoms' })
})

test('getTopicByCode returns correct S2 topic', () => {
  expect(getTopicByCode('s2', '2.2')).toEqual({ code: '2.2', name: 'Equilibrium and yield' })
})

test('getTopicByCode returns null for unknown code', () => {
  expect(getTopicByCode('s1', '9.9')).toBeNull()
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npm test -- --testPathPattern=adminTopics --watchAll=false
```

Expected: FAIL — `Cannot find module './adminTopics'`

- [ ] **Step 3: Create src/lib/adminTopics.js**

```javascript
export const S1_TOPICS = [
  { code: '1.1', name: 'Properties and uses of materials' },
  { code: '1.2', name: 'Atomic structure' },
  { code: '1.3', name: 'Quantities of atoms' },
  { code: '2.1', name: 'Types of materials' },
  { code: '2.2', name: 'Bonding between atoms' },
  { code: '2.3', name: 'Quantities of molecules and ions' },
  { code: '3.1', name: 'Molecule polarity' },
  { code: '3.2', name: 'Interactions between molecules' },
  { code: '3.3', name: 'Hydrocarbons' },
  { code: '3.4', name: 'Polymers' },
  { code: '4.1', name: 'Miscibility and solutions' },
  { code: '4.2', name: 'Solutions of ionic substances' },
  { code: '4.3', name: 'Quantities in reactions' },
  { code: '4.4', name: 'Energy in reactions' },
  { code: '5.1', name: 'Acid–base concepts' },
  { code: '5.2', name: 'Reactions of acids and bases' },
  { code: '5.3', name: 'The pH scale' },
  { code: '6.1', name: 'Concepts of oxidation and reduction' },
  { code: '6.2', name: 'Metal reactivity' },
  { code: '6.3', name: 'Electrochemistry' },
]

export const S2_TOPICS = [
  { code: '1.1', name: 'Global warming and climate change' },
  { code: '1.2', name: 'Photochemical smog' },
  { code: '1.3', name: 'Volumetric analysis' },
  { code: '1.4', name: 'Chromatography' },
  { code: '1.5', name: 'Atomic spectroscopy' },
  { code: '2.1', name: 'Rates of reactions' },
  { code: '2.2', name: 'Equilibrium and yield' },
  { code: '2.3', name: 'Optimising production' },
  { code: '3.1', name: 'Introduction to organic chemistry' },
  { code: '3.2', name: 'Alcohols' },
  { code: '3.3', name: 'Aldehydes and ketones' },
  { code: '3.4', name: 'Carbohydrates' },
  { code: '3.5', name: 'Carboxylic acids' },
  { code: '3.6', name: 'Amines' },
  { code: '3.7', name: 'Esters' },
  { code: '3.8', name: 'Amides' },
  { code: '3.9', name: 'Triglycerides' },
  { code: '3.10', name: 'Proteins' },
  { code: '4.1', name: 'Energy resources' },
  { code: '4.2', name: 'Water' },
  { code: '4.3', name: 'Soil' },
  { code: '4.4', name: 'Materials resources' },
]

/**
 * @param {'s1'|'s2'} stage
 * @param {string} code  e.g. '2.2'
 * @returns {{ code: string, name: string } | null}
 */
export function getTopicByCode(stage, code) {
  const list = stage === 's1' ? S1_TOPICS : S2_TOPICS
  return list.find(t => t.code === code) ?? null
}

/**
 * Returns the topic list for a given stage as a numbered string for use in AI prompts.
 * @param {'s1'|'s2'} stage
 * @returns {string}
 */
export function topicsAsPromptList(stage) {
  const list = stage === 's1' ? S1_TOPICS : S2_TOPICS
  return list.map(t => `${t.code}: ${t.name}`).join('\n')
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --testPathPattern=adminTopics --watchAll=false
```

Expected: PASS — 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/adminTopics.js src/lib/adminTopics.test.js
git commit -m "feat: add adminTopics with S1/S2 topic code maps"
```

---

## Task 3: adminDb.js

**Files:**
- Create: `src/lib/adminDb.js`

- [ ] **Step 1: Create src/lib/adminDb.js**

```javascript
import { supabase } from './supabase'

// ─── DRAFT QUESTIONS ──────────────────────────────────────────────────────────

/**
 * Fetch draft questions. Optionally filter by status and/or subject.
 * @param {{ status?: string, subject?: string }} filters
 */
export async function getDraftQuestions({ status, subject } = {}) {
  let query = supabase
    .from('draft_questions')
    .select('*')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (subject) query = query.eq('subject', subject)

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(d => ({
    ...d,
    options: typeof d.options === 'string' ? JSON.parse(d.options) : d.options,
  }))
}

/**
 * Insert or update a draft question.
 * Pass id to update an existing draft; omit id to insert a new one.
 */
export async function upsertDraftQuestion(draft) {
  const { error } = await supabase
    .from('draft_questions')
    .upsert(draft, { onConflict: 'id' })
  if (error) throw error
}

/**
 * Approve a draft: insert into live questions table, mark draft approved.
 * @param {string} draftId  UUID of the draft_questions row
 * @param {string} adminId  UUID of the admin profile
 */
export async function approveDraftQuestion(draftId, adminId) {
  const { data: draft, error: fetchError } = await supabase
    .from('draft_questions')
    .select('*')
    .eq('id', draftId)
    .single()
  if (fetchError) throw fetchError

  const questionId = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const conceptTag = `${draft.subject}|${draft.topic}|${draft.subtopic || draft.topic}`.toLowerCase()

  const { error: insertError } = await supabase.from('questions').insert({
    id: questionId,
    subject: draft.subject,
    topic: draft.topic,
    subtopic: draft.subtopic || draft.topic,
    concept_tag: conceptTag,
    difficulty: draft.difficulty ?? 3,
    question: draft.question,
    options: draft.options,
    answer_index: draft.answer_index,
    solution: draft.solution ?? '',
    tip: null,
  })
  if (insertError) throw insertError

  const { error: updateError } = await supabase
    .from('draft_questions')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminId,
    })
    .eq('id', draftId)
  if (updateError) throw updateError
}

/**
 * Reject a draft (keeps it as an audit trail).
 * @param {string} draftId
 * @param {string} adminId
 */
export async function rejectDraftQuestion(draftId, adminId) {
  const { error } = await supabase
    .from('draft_questions')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminId,
    })
    .eq('id', draftId)
  if (error) throw error
}
```

- [ ] **Step 2: Verify the file has no syntax errors**

```bash
node --input-type=module < src/lib/adminDb.js 2>&1 | head -5
```

Expected output: empty (no errors). If you see `Cannot use import statement`, that's fine — it means the module syntax is valid but Node can't resolve `./supabase` without the full CRA environment. No action needed.

- [ ] **Step 3: Commit**

```bash
git add src/lib/adminDb.js
git commit -m "feat: add adminDb helpers for draft question CRUD"
```

---

## Task 4: api/extract-pdf.js

**Files:**
- Create: `api/extract-pdf.js`

- [ ] **Step 1: Create api/extract-pdf.js**

```javascript
import { topicsAsPromptList } from '../src/lib/adminTopics.js'
import { createClient } from '@supabase/supabase-js'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
}

const supabaseAdmin = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

function extractJsonArray(text = '') {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {}
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end <= start) return []
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { base64, filename, stage } = req.body
  if (!base64 || !stage) return res.status(400).json({ error: 'base64 and stage required' })

  const stageKey = stage === 'Chemistry Stage 1' ? 's1' : 's2'
  const topicList = topicsAsPromptList(stageKey)

  const system = [
    'You are extracting multiple-choice questions from a SACE Chemistry exam or textbook PDF.',
    'Return ONLY a valid JSON array. No markdown, no commentary outside the array.',
    'Each object must have these exact keys:',
    '  question (string)',
    '  options (array of exactly 4 strings)',
    '  answer_index (integer 0–3, index of the correct option)',
    '  solution (string explaining why the answer is correct)',
    '  subtopic (short free-text description of the specific concept tested)',
    '  topic_code (string from the allowed list below, or "unknown" if unsure)',
    '  topic (the full topic name matching the code)',
    '  difficulty (integer 1–5, where 1=easy, 5=hard)',
    '',
    'Allowed topic codes for ' + stage + ':',
    topicList,
  ].join('\n')

  const user = 'Extract all multiple-choice questions from this document. Return them as a JSON array.'

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 8000,
      system,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          { type: 'text', text: user },
        ],
      }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return res.status(500).json({ error: 'Claude API error', detail: err })
  }

  const claudeData = await response.json()
  const rawText = claudeData?.content?.[0]?.text || ''
  const questions = extractJsonArray(rawText)

  if (!questions.length) {
    return res.status(200).json({ inserted: 0, needs_review: 0, message: 'No questions extracted' })
  }

  const rows = questions.map(q => ({
    source: 'pdf_extract',
    source_file: filename || null,
    subject: stage,
    topic_code: q.topic_code === 'unknown' ? null : (q.topic_code || null),
    topic: q.topic || null,
    subtopic: q.subtopic || null,
    question: q.question,
    options: q.options,
    answer_index: q.answer_index,
    solution: q.solution || null,
    difficulty: q.difficulty || null,
    status: q.topic_code === 'unknown' ? 'needs_review' : 'pending',
  }))

  const { error } = await supabaseAdmin.from('draft_questions').insert(rows)
  if (error) return res.status(500).json({ error: error.message })

  const needsReview = rows.filter(r => r.status === 'needs_review').length
  return res.status(200).json({ inserted: rows.length, needs_review: needsReview })
}
```

- [ ] **Step 2: Verify SUPABASE_SERVICE_KEY is in your Vercel environment**

In Vercel Dashboard → Project → Settings → Environment Variables, confirm `SUPABASE_SERVICE_KEY` exists. If not, add it (use the service_role key from Supabase → Project Settings → API).

- [ ] **Step 3: Commit**

```bash
git add api/extract-pdf.js
git commit -m "feat: add extract-pdf Vercel function for PDF → draft questions"
```

---

## Task 5: api/generate-questions.js

**Files:**
- Create: `api/generate-questions.js`

- [ ] **Step 1: Create api/generate-questions.js**

```javascript
import { topicsAsPromptList, getTopicByCode } from '../src/lib/adminTopics.js'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

function extractJsonArray(text = '') {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {}
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end <= start) return []
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { stage, topicCode, count = 10, difficulty = 'mixed' } = req.body
  if (!stage || !topicCode) return res.status(400).json({ error: 'stage and topicCode required' })

  const stageKey = stage === 'Chemistry Stage 1' ? 's1' : 's2'
  const topic = getTopicByCode(stageKey, topicCode)
  if (!topic) return res.status(400).json({ error: `Unknown topic code: ${topicCode}` })

  const difficultyInstruction = difficulty === 'mixed'
    ? 'Vary difficulty across questions: include easy (1-2), medium (3), and hard (4-5) questions.'
    : `All questions should have difficulty ${difficulty} out of 5.`

  const system = [
    'You are generating multiple-choice questions for SACE Chemistry students.',
    'Return ONLY a valid JSON array. No markdown, no commentary outside the array.',
    `Generate exactly ${count} questions.`,
    'Each object must have these exact keys:',
    '  question (string)',
    '  options (array of exactly 4 strings)',
    '  answer_index (integer 0–3)',
    '  solution (string — explain why the answer is correct, 2-4 sentences)',
    '  subtopic (short free-text label for the specific concept, e.g. "Le Chatelier\'s principle")',
    '  difficulty (integer 1–5)',
    'Questions must be accurate, unambiguous, and test conceptual understanding.',
    'Do not repeat the same scenario across questions.',
    difficultyInstruction,
  ].join('\n')

  const user = `Generate ${count} MCQs for the SACE ${stage} topic: ${topic.name} (${topicCode}).`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 6000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return res.status(500).json({ error: 'Claude API error', detail: err })
  }

  const claudeData = await response.json()
  const rawText = claudeData?.content?.[0]?.text || ''
  const questions = extractJsonArray(rawText)

  if (!questions.length) {
    return res.status(200).json({ inserted: 0, message: 'No questions generated' })
  }

  const rows = questions.map(q => ({
    source: 'ai_generated',
    subject: stage,
    topic_code: topicCode,
    topic: topic.name,
    subtopic: q.subtopic || null,
    question: q.question,
    options: q.options,
    answer_index: q.answer_index,
    solution: q.solution || null,
    difficulty: q.difficulty || null,
    status: 'pending',
  }))

  const { error } = await supabaseAdmin.from('draft_questions').insert(rows)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ inserted: rows.length })
}
```

- [ ] **Step 2: Commit**

```bash
git add api/generate-questions.js
git commit -m "feat: add generate-questions Vercel function"
```

---

## Task 6: AdminRoute + App.jsx Routes

**Files:**
- Create: `src/components/AdminRoute.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Create src/components/AdminRoute.jsx**

```jsx
import { Navigate } from 'react-router-dom'

export default function AdminRoute({ profile, children }) {
  if (!profile) return <Navigate to="/home" replace />
  if (!profile.is_admin) return <Navigate to="/question-bank" replace />
  return children
}
```

- [ ] **Step 2: Add admin imports and routes to src/App.jsx**

Find the existing import block at the top of `src/App.jsx` (around line 15–22 where the screen imports are). Add these two lines after the existing imports:

```jsx
import AdminRoute    from './components/AdminRoute'
import AdminScreen   from './components/AdminScreen'
```

Then find the `<Routes>` block in the return statement. After the `/quiz` route (around line 553), add:

```jsx
      {/* Admin — is_admin only */}
      <Route path="/admin/*" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : <AdminRoute profile={profile}>
              <AdminScreen profile={profile} />
            </AdminRoute>
      } />
```

- [ ] **Step 3: Verify the app still compiles**

```bash
npm start
```

Open `http://localhost:3000`. The app should load normally. Navigate to `/admin` — if you are not the admin user, you should be redirected to `/question-bank`. No visual change for regular users.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminRoute.jsx src/App.jsx
git commit -m "feat: add AdminRoute guard and /admin/* route"
```

---

## Task 7: AdminScreen.jsx (Admin Shell)

**Files:**
- Create: `src/components/AdminScreen.jsx`

- [ ] **Step 1: Create src/components/AdminScreen.jsx**

```jsx
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import AdminUploadScreen   from './AdminUploadScreen'
import AdminGenerateScreen from './AdminGenerateScreen'
import AdminReviewScreen   from './AdminReviewScreen'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

export default function AdminScreen({ profile }) {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: '#080d28', fontFamily: FONT_B, color: '#fff' }}>
      {/* Header */}
      <div style={{
        padding: '14px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <button
          onClick={() => navigate('/question-bank')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, fontFamily: FONT_B }}
        >
          ← Back to app
        </button>
        <span style={{ color: GOLD, fontWeight: 800, fontSize: 16 }}>Content Admin</span>
      </div>

      {/* Tab nav */}
      <div style={{
        display: 'flex',
        gap: 4,
        padding: '12px 24px 0',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        {[
          { label: 'Upload PDF', path: 'upload' },
          { label: 'Generate', path: 'generate' },
          { label: 'Review Queue', path: 'review' },
        ].map(tab => (
          <NavLink
            key={tab.path}
            to={tab.path}
            style={({ isActive }) => ({
              padding: '8px 16px',
              borderRadius: '8px 8px 0 0',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
              color: isActive ? GOLD : 'rgba(255,255,255,0.5)',
              background: isActive ? 'rgba(241,190,67,0.08)' : 'transparent',
              borderBottom: isActive ? `2px solid ${GOLD}` : '2px solid transparent',
              fontFamily: FONT_B,
            })}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* Sub-route content */}
      <div style={{ padding: 24, maxWidth: 860, margin: '0 auto' }}>
        <Routes>
          <Route index element={<Navigate to="upload" replace />} />
          <Route path="upload"   element={<AdminUploadScreen />} />
          <Route path="generate" element={<AdminGenerateScreen />} />
          <Route path="review"   element={<AdminReviewScreen profile={profile} />} />
        </Routes>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify visually**

With `npm start` running, navigate to `/admin`. You should see the admin header with tabs and a redirect to the Upload tab. Tabs should be clickable (Generate and Review will render empty until their components exist — create placeholder files for them now to prevent a crash):

Create `src/components/AdminUploadScreen.jsx` with just:
```jsx
export default function AdminUploadScreen() { return <div style={{color:'#fff'}}>Upload coming soon</div> }
```

Create `src/components/AdminGenerateScreen.jsx` with:
```jsx
export default function AdminGenerateScreen() { return <div style={{color:'#fff'}}>Generate coming soon</div> }
```

Create `src/components/AdminReviewScreen.jsx` with:
```jsx
export default function AdminReviewScreen() { return <div style={{color:'#fff'}}>Review coming soon</div> }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/AdminScreen.jsx src/components/AdminUploadScreen.jsx src/components/AdminGenerateScreen.jsx src/components/AdminReviewScreen.jsx
git commit -m "feat: add AdminScreen shell with tab navigation"
```

---

## Task 8: AdminUploadScreen.jsx

**Files:**
- Modify: `src/components/AdminUploadScreen.jsx`

- [ ] **Step 1: Replace the placeholder with the full AdminUploadScreen**

Overwrite `src/components/AdminUploadScreen.jsx`:

```jsx
import { useState, useRef } from 'react'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

const STAGES = ['Chemistry Stage 1', 'Chemistry Stage 2']

export default function AdminUploadScreen() {
  const [stage, setStage]       = useState('Chemistry Stage 1')
  const [file, setFile]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)
  const fileRef = useRef()

  const handleFile = (f) => {
    if (f && f.type === 'application/pdf') { setFile(f); setResult(null); setError(null) }
    else setError('Please select a PDF file.')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    handleFile(e.dataTransfer.files[0])
  }

  const handleSubmit = async () => {
    if (!file) return
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/extract-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, filename: file.name, stage }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Extraction failed')
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 style={{ color: '#fff', marginTop: 0 }}>Upload PDF</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
        Upload a SACE Chemistry exam or textbook. Claude will extract all MCQs into the draft queue.
      </p>

      {/* Stage selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stage</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {STAGES.map(s => (
            <button
              key={s}
              onClick={() => setStage(s)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: `1px solid ${stage === s ? GOLD : 'rgba(255,255,255,0.12)'}`,
                background: stage === s ? 'rgba(241,190,67,0.1)' : 'transparent',
                color: stage === s ? GOLD : 'rgba(255,255,255,0.5)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: FONT_B,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${file ? GOLD : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 12,
          padding: '36px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: file ? 'rgba(241,190,67,0.04)' : 'rgba(255,255,255,0.02)',
          marginBottom: 20,
          transition: 'all 0.15s',
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])}
        />
        {file
          ? <span style={{ color: GOLD, fontWeight: 700, fontSize: 14 }}>📄 {file.name}</span>
          : <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>Drop a PDF here or click to browse</span>
        }
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!file || loading}
        style={{
          padding: '12px 28px',
          borderRadius: 10,
          border: 'none',
          background: (!file || loading) ? 'rgba(255,255,255,0.08)' : GOLD,
          color: (!file || loading) ? 'rgba(255,255,255,0.3)' : '#0c1037',
          fontSize: 14,
          fontWeight: 800,
          cursor: (!file || loading) ? 'not-allowed' : 'pointer',
          fontFamily: FONT_B,
        }}
      >
        {loading ? 'Extracting…' : 'Extract Questions'}
      </button>

      {/* Result */}
      {result && (
        <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <div style={{ color: '#4ade80', fontWeight: 700 }}>
            ✓ {result.inserted} questions extracted
            {result.needs_review > 0 && ` (${result.needs_review} need topic review)`}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>
            Go to the Review Queue tab to approve them.
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Test manually**

With `npm start` running, navigate to `/admin/upload`. Verify:
- Stage buttons toggle correctly
- Drop zone accepts a PDF file (shows filename in gold)
- Non-PDF file shows an error
- The "Extract Questions" button is disabled until a file is selected

(You don't need to hit the API yet — the API test comes after deployment.)

- [ ] **Step 3: Commit**

```bash
git add src/components/AdminUploadScreen.jsx
git commit -m "feat: AdminUploadScreen with PDF drag-and-drop and stage selector"
```

---

## Task 9: AdminGenerateScreen.jsx

**Files:**
- Modify: `src/components/AdminGenerateScreen.jsx`

- [ ] **Step 1: Replace the placeholder with the full AdminGenerateScreen**

Overwrite `src/components/AdminGenerateScreen.jsx`:

```jsx
import { useState } from 'react'
import { S1_TOPICS, S2_TOPICS } from '../lib/adminTopics'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

const STAGES = ['Chemistry Stage 1', 'Chemistry Stage 2']
const COUNTS = [5, 10, 20]
const DIFFICULTIES = [
  { value: 'mixed', label: 'Mixed (1–5)' },
  { value: '1', label: '1 — Easy' },
  { value: '2', label: '2' },
  { value: '3', label: '3 — Medium' },
  { value: '4', label: '4' },
  { value: '5', label: '5 — Hard' },
]

export default function AdminGenerateScreen() {
  const [stage,      setStage]      = useState('Chemistry Stage 1')
  const [topicCode,  setTopicCode]  = useState('')
  const [count,      setCount]      = useState(10)
  const [difficulty, setDifficulty] = useState('mixed')
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState(null)
  const [error,      setError]      = useState(null)

  const topics = stage === 'Chemistry Stage 1' ? S1_TOPICS : S2_TOPICS

  const handleStageChange = (s) => {
    setStage(s)
    setTopicCode('')
    setResult(null)
    setError(null)
  }

  const handleSubmit = async () => {
    if (!topicCode) return
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, topicCode, count, difficulty }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const selectStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff',
    fontSize: 13,
    fontFamily: FONT_B,
    outline: 'none',
  }

  return (
    <div>
      <h2 style={{ color: '#fff', marginTop: 0 }}>Generate Questions</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
        Pick a topic and let Claude generate MCQs. They land in the draft queue for your review.
      </p>

      {/* Stage */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stage</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {STAGES.map(s => (
            <button
              key={s}
              onClick={() => handleStageChange(s)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: `1px solid ${stage === s ? GOLD : 'rgba(255,255,255,0.12)'}`,
                background: stage === s ? 'rgba(241,190,67,0.1)' : 'transparent',
                color: stage === s ? GOLD : 'rgba(255,255,255,0.5)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: FONT_B,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Topic */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Topic</label>
        <select value={topicCode} onChange={e => setTopicCode(e.target.value)} style={selectStyle}>
          <option value="">Select a topic…</option>
          {topics.map(t => (
            <option key={t.code} value={t.code}>{t.code} — {t.name}</option>
          ))}
        </select>
      </div>

      {/* Count */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Number of Questions</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {COUNTS.map(c => (
            <button
              key={c}
              onClick={() => setCount(c)}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: `1px solid ${count === c ? GOLD : 'rgba(255,255,255,0.12)'}`,
                background: count === c ? 'rgba(241,190,67,0.1)' : 'transparent',
                color: count === c ? GOLD : 'rgba(255,255,255,0.5)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: FONT_B,
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Difficulty</label>
        <select value={difficulty} onChange={e => setDifficulty(e.target.value)} style={selectStyle}>
          {DIFFICULTIES.map(d => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!topicCode || loading}
        style={{
          padding: '12px 28px',
          borderRadius: 10,
          border: 'none',
          background: (!topicCode || loading) ? 'rgba(255,255,255,0.08)' : GOLD,
          color: (!topicCode || loading) ? 'rgba(255,255,255,0.3)' : '#0c1037',
          fontSize: 14,
          fontWeight: 800,
          cursor: (!topicCode || loading) ? 'not-allowed' : 'pointer',
          fontFamily: FONT_B,
        }}
      >
        {loading ? `Generating ${count} questions…` : `Generate ${count} Questions`}
      </button>

      {result && (
        <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <div style={{ color: '#4ade80', fontWeight: 700 }}>✓ {result.inserted} questions added to the draft queue</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>Go to the Review Queue tab to approve them.</div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Test manually**

Navigate to `/admin/generate`. Verify:
- Stage toggle updates the topic dropdown
- Dropdown lists all topics with their codes
- Count and difficulty selectors work
- Submit is disabled until a topic is selected

- [ ] **Step 3: Commit**

```bash
git add src/components/AdminGenerateScreen.jsx
git commit -m "feat: AdminGenerateScreen with topic/count/difficulty controls"
```

---

## Task 10: AdminReviewScreen.jsx

**Files:**
- Modify: `src/components/AdminReviewScreen.jsx`

- [ ] **Step 1: Replace the placeholder with the full AdminReviewScreen**

Overwrite `src/components/AdminReviewScreen.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react'
import { getDraftQuestions, upsertDraftQuestion, approveDraftQuestion, rejectDraftQuestion } from '../lib/adminDb'
import { S1_TOPICS, S2_TOPICS } from '../lib/adminTopics'
import MathText from './MathText'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'
const OPTION_LABELS = ['A', 'B', 'C', 'D']

function statusBadge(status) {
  const colors = {
    pending:      { bg: 'rgba(241,190,67,0.1)',   border: 'rgba(241,190,67,0.3)',   color: GOLD },
    needs_review: { bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)',    color: '#f87171' },
    approved:     { bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.3)',   color: '#4ade80' },
    rejected:     { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)',  color: 'rgba(255,255,255,0.3)' },
  }
  const c = colors[status] || colors.pending
  return (
    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      {status}
    </span>
  )
}

export default function AdminReviewScreen({ profile }) {
  const [drafts,      setDrafts]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [filterStatus, setFilterStatus] = useState('pending')
  const [selected,    setSelected]    = useState(null)   // draft being edited
  const [editState,   setEditState]   = useState(null)   // copy of draft for editing
  const [saving,      setSaving]      = useState(false)
  const [checked,     setChecked]     = useState(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getDraftQuestions({
        status: filterStatus === 'all' ? undefined : filterStatus,
      })
      setDrafts(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  const openDraft = (draft) => {
    setSelected(draft)
    setEditState({ ...draft, options: [...(draft.options || ['', '', '', ''])] })
  }

  const closePanel = () => { setSelected(null); setEditState(null) }

  const handleSave = async () => {
    if (!editState) return
    setSaving(true)
    try {
      await upsertDraftQuestion(editState)
      setDrafts(prev => prev.map(d => d.id === editState.id ? { ...editState } : d))
      setSelected({ ...editState })
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const handleApprove = async (draftId) => {
    setSaving(true)
    try {
      await approveDraftQuestion(draftId, profile.id)
      setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, status: 'approved' } : d))
      closePanel()
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const handleReject = async (draftId) => {
    setSaving(true)
    try {
      await rejectDraftQuestion(draftId, profile.id)
      setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, status: 'rejected' } : d))
      closePanel()
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const handleBulkApprove = async () => {
    setSaving(true)
    for (const id of checked) {
      try { await approveDraftQuestion(id, profile.id) } catch {}
    }
    setChecked(new Set())
    setSaving(false)
    load()
  }

  const toggleCheck = (id) => {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const topicsForSubject = (subject) =>
    subject === 'Chemistry Stage 1' ? S1_TOPICS : S2_TOPICS

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff',
    fontSize: 13,
    fontFamily: FONT_B,
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', gap: 24 }}>
      {/* Left: table */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ color: '#fff', margin: 0 }}>
            Review Queue
            {!loading && <span style={{ marginLeft: 8, fontSize: 13, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>({drafts.length})</span>}
          </h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {checked.size > 0 && (
              <button
                onClick={handleBulkApprove}
                disabled={saving}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#4ade80', color: '#0c1037', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}
              >
                Approve {checked.size} selected
              </button>
            )}
            {['pending', 'needs_review', 'all'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 8,
                  border: `1px solid ${filterStatus === s ? GOLD : 'rgba(255,255,255,0.12)'}`,
                  background: filterStatus === s ? 'rgba(241,190,67,0.08)' : 'transparent',
                  color: filterStatus === s ? GOLD : 'rgba(255,255,255,0.4)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: FONT_B,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</div>
        ) : drafts.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>
            No drafts with status "{filterStatus}".
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {drafts.map(draft => (
              <div
                key={draft.id}
                onClick={() => openDraft(draft)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: selected?.id === draft.id ? 'rgba(241,190,67,0.06)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selected?.id === draft.id ? 'rgba(241,190,67,0.2)' : 'rgba(255,255,255,0.07)'}`,
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked.has(draft.id)}
                  onChange={() => toggleCheck(draft.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                />
                <span style={{ fontSize: 11, color: GOLD, fontWeight: 700, width: 36, flexShrink: 0 }}>
                  {draft.topic_code || '?'}
                </span>
                <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {draft.question}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                  D{draft.difficulty ?? '?'}
                </span>
                <span style={{ flexShrink: 0 }}>{statusBadge(draft.status)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: edit panel */}
      {editState && (
        <div style={{
          width: 380,
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          padding: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>Edit Draft</span>
            <button onClick={closePanel} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>

          {/* Topic */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>Topic</label>
            <select
              value={editState.topic_code || ''}
              onChange={e => {
                const topics = topicsForSubject(editState.subject)
                const t = topics.find(x => x.code === e.target.value)
                setEditState(prev => ({ ...prev, topic_code: e.target.value, topic: t?.name || prev.topic }))
              }}
              style={{ ...inputStyle }}
            >
              <option value="">Unknown / needs review</option>
              {topicsForSubject(editState.subject).map(t => (
                <option key={t.code} value={t.code}>{t.code} — {t.name}</option>
              ))}
            </select>
          </div>

          {/* Subtopic */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>Subtopic</label>
            <input
              style={inputStyle}
              value={editState.subtopic || ''}
              onChange={e => setEditState(prev => ({ ...prev, subtopic: e.target.value }))}
              placeholder="e.g. Le Chatelier's principle"
            />
          </div>

          {/* Difficulty */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>Difficulty (1–5)</label>
            <input
              type="number"
              min={1} max={5}
              style={{ ...inputStyle, width: 80 }}
              value={editState.difficulty ?? ''}
              onChange={e => setEditState(prev => ({ ...prev, difficulty: parseInt(e.target.value, 10) || null }))}
            />
          </div>

          {/* Question */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>Question</label>
            <textarea
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={editState.question || ''}
              onChange={e => setEditState(prev => ({ ...prev, question: e.target.value }))}
            />
            <div style={{ marginTop: 4, padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }}>
              <MathText text={editState.question || ''} />
            </div>
          </div>

          {/* Options */}
          {(editState.options || []).map((opt, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 11, color: editState.answer_index === i ? '#4ade80' : 'rgba(255,255,255,0.4)', marginBottom: 3, textTransform: 'uppercase' }}>
                Option {OPTION_LABELS[i]} {editState.answer_index === i ? '✓ correct' : ''}
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  style={{ ...inputStyle }}
                  value={opt}
                  onChange={e => setEditState(prev => {
                    const opts = [...prev.options]
                    opts[i] = e.target.value
                    return { ...prev, options: opts }
                  })}
                />
                <button
                  onClick={() => setEditState(prev => ({ ...prev, answer_index: i }))}
                  title="Mark as correct"
                  style={{
                    flexShrink: 0,
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: `1px solid ${editState.answer_index === i ? '#4ade80' : 'rgba(255,255,255,0.12)'}`,
                    background: editState.answer_index === i ? 'rgba(74,222,128,0.12)' : 'transparent',
                    color: editState.answer_index === i ? '#4ade80' : 'rgba(255,255,255,0.3)',
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  ✓
                </button>
              </div>
            </div>
          ))}

          {/* Solution */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>Solution / Explanation</label>
            <textarea
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={editState.solution || ''}
              onChange={e => setEditState(prev => ({ ...prev, solution: e.target.value }))}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '9px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}
            >
              {saving ? 'Saving…' : 'Save Edits'}
            </button>
            <button
              onClick={() => handleApprove(editState.id)}
              disabled={saving}
              style={{ padding: '9px', borderRadius: 8, border: 'none', background: '#4ade80', color: '#0c1037', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}
            >
              ✓ Approve → Go Live
            </button>
            <button
              onClick={() => handleReject(editState.id)}
              disabled={saving}
              style={{ padding: '9px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#f87171', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Test manually**

Navigate to `/admin/review`. Verify:
- Page loads (shows empty state if no drafts yet)
- Filter buttons (pending / needs_review / all) are visible and clickable
- Panel closes on × button
- No console errors

After generating some questions via the Generate tab (requires deployed API), return here and verify:
- Questions appear in the table with topic code, truncated text, difficulty, and status badge
- Clicking a row opens the edit panel on the right
- KaTeX preview updates as you type in the question field
- ✓ buttons mark the correct answer (turns green)
- "Approve → Go Live" moves the question to the `questions` table and updates the row status to `approved`
- "Reject" marks the row as `rejected`
- Checkboxes + "Approve N selected" bulk-approves multiple rows

- [ ] **Step 3: Commit**

```bash
git add src/components/AdminReviewScreen.jsx
git commit -m "feat: AdminReviewScreen with draft queue, inline editor, approve/reject"
```

---

## Task 11: End-to-End Smoke Test (post-deploy)

After pushing to Vercel and confirming the deployment:

- [ ] **Step 1: Test PDF extraction end-to-end**

1. Navigate to `<your-vercel-url>/admin/upload`
2. Select "Chemistry Stage 2"
3. Upload any SACE Chemistry past exam PDF
4. Click "Extract Questions"
5. Expected: green result banner showing "X questions extracted"
6. Navigate to `/admin/review` and confirm the drafts appear

- [ ] **Step 2: Test AI generation end-to-end**

1. Navigate to `<your-vercel-url>/admin/generate`
2. Select Stage 1, topic "2.2 — Bonding between atoms", count 5, difficulty Mixed
3. Click "Generate 5 Questions"
4. Expected: green result banner showing "5 questions added to the draft queue"
5. Navigate to `/admin/review` and confirm 5 drafts appear with topic code 2.2

- [ ] **Step 3: Test approve flow**

1. In the review queue, click a draft
2. Edit a field (e.g., improve the solution text)
3. Click "Save Edits" — row should update in the table
4. Click "Approve → Go Live"
5. In Supabase Table Editor, confirm the question appears in the `questions` table with the correct subject, topic, and options
6. In the app (as a student), start a quiz on the same subject — the approved question should eventually appear

- [ ] **Step 4: Commit final state**

```bash
git add -A
git status  # confirm only intended files staged
git commit -m "feat: content pipeline complete — PDF extract, AI generate, review queue"
```
