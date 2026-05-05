# Curriculum Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Curriculum Builder to the admin dashboard that lets an admin describe a subject, receive an AI-generated topic/subtopic tree, edit it visually, then auto-seed 25 draft questions per subtopic.

**Architecture:** Three new Supabase tables store the curriculum tree and per-subtopic generation state. Two new API endpoints handle AI calls (plan generation and question generation). The frontend has two new React components (list + detail) wired into the existing admin tab system. Existing patterns are followed throughout — `adminApiPost` for Claude calls, direct Supabase client for CRUD.

**Tech Stack:** React (JSX), Supabase JS client, Express/TypeScript API, Node built-in test runner (`node --test`), Claude API (via existing `adminApiPost` fetch pattern).

---

## File Map

**Create:**
- `artifacts/api-server/src/routes/curriculum.ts` — two API endpoints (plan + generate)
- `artifacts/gradefarm/src/lib/curriculaDb.js` — all Supabase CRUD for curriculum tables
- `artifacts/gradefarm/src/components/AdminCurriculaTab.jsx` — list page + new curriculum modal
- `artifacts/gradefarm/src/components/AdminCurriculumDetail.jsx` — tree editor + generation progress
- `artifacts/gradefarm/src/lib/curriculaDb.test.js` — unit tests for curriculaDb helpers

**Modify:**
- `artifacts/api-server/src/routes/index.ts` — register curriculum router
- `artifacts/gradefarm/src/lib/adminTopics.js` — add managed topics cache + `loadManagedCurriculaTopics()`
- `artifacts/gradefarm/src/lib/adminTopics.test.js` — add tests for new cache behaviour
- `artifacts/gradefarm/src/components/AdminScreen.jsx` — add Curricula tab + route
- `artifacts/gradefarm/src/components/AdminGenerateScreen.jsx` — add Managed Curricula section

---

## Task 1: Supabase DB Migration

**Files:**
- Run in Supabase dashboard → SQL Editor

- [ ] **Step 1: Run migration SQL**

Open Supabase dashboard → SQL Editor → New query. Paste and run:

```sql
-- Curricula (one row per managed subject)
create table if not exists public.curricula (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  subject_description text not null default '',
  status      text not null default 'draft' check (status in ('draft','generating','live')),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Topics within a curriculum
create table if not exists public.curriculum_topics (
  id             uuid primary key default gen_random_uuid(),
  curriculum_id  uuid not null references public.curricula(id) on delete cascade,
  name           text not null,
  order_index    int  not null default 0
);

-- Subtopics within a topic
create table if not exists public.curriculum_subtopics (
  id                   uuid primary key default gen_random_uuid(),
  topic_id             uuid not null references public.curriculum_topics(id) on delete cascade,
  curriculum_id        uuid not null references public.curricula(id) on delete cascade,
  name                 text not null,
  order_index          int  not null default 0,
  gen_status           text not null default 'pending'
                          check (gen_status in ('pending','generating','done','failed')),
  questions_generated  int  not null default 0
);

-- Enable RLS (service key bypasses; anon client uses policies below)
alter table public.curricula          enable row level security;
alter table public.curriculum_topics  enable row level security;
alter table public.curriculum_subtopics enable row level security;

-- Policy: allow read/write for authenticated users marked is_admin
create policy "admin full access curricula"
  on public.curricula for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

create policy "admin full access curriculum_topics"
  on public.curriculum_topics for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

create policy "admin full access curriculum_subtopics"
  on public.curriculum_subtopics for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );
```

- [ ] **Step 2: Verify tables exist**

In Supabase → Table Editor, confirm `curricula`, `curriculum_topics`, `curriculum_subtopics` all appear with their columns.

---

## Task 2: API — `/api/admin/curriculum-plan`

**Files:**
- Create: `artifacts/api-server/src/routes/curriculum.ts`

- [ ] **Step 1: Create the route file**

```typescript
// artifacts/api-server/src/routes/curriculum.ts
import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

function getAdmin() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("No SUPABASE_SERVICE_KEY configured");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

function extractJson(text: string): unknown {
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

// POST /api/admin/curriculum-plan
// Body: { subjectDescription: string }
// Returns: { topics: [{ name: string, subtopics: [{ name: string }] }] }
router.post("/admin/curriculum-plan", async (req, res) => {
  const { subjectDescription } = req.body || {};
  if (!subjectDescription?.trim()) {
    res.status(400).json({ error: "subjectDescription required" });
    return;
  }

  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const apiKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

  const system = [
    "You are a curriculum designer. Return ONLY a valid JSON object — no markdown, no commentary.",
    "The object must have a single key 'topics' whose value is an array.",
    "Each topic object has: name (string), subtopics (array of objects with a single key: name (string)).",
    "Produce a realistic, well-structured curriculum tree: 5–10 topics, each with 3–6 subtopics.",
    "Subtopic names should be specific and teachable (e.g. 'Mitosis and cell division', not 'Cell processes').",
  ].join("\n");

  const user = `Generate a complete topic and subtopic breakdown for: ${subjectDescription.trim()}`;

  let claudeRes: Response;
  try {
    claudeRes = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
  } catch (err) {
    logger.error({ err }, "Failed to reach Claude API");
    res.status(500).json({ error: "Failed to reach Claude API" });
    return;
  }

  if (!claudeRes.ok) {
    const text = await claudeRes.text();
    res.status(500).json({ error: "Claude API error", detail: text });
    return;
  }

  const claudeData = await claudeRes.json() as { content?: { text: string }[] };
  const rawText = claudeData?.content?.[0]?.text || "";
  const parsed = extractJson(rawText) as { topics?: unknown[] } | null;

  if (!parsed?.topics?.length) {
    res.status(500).json({ error: "Could not parse curriculum plan from AI response", raw: rawText.slice(0, 500) });
    return;
  }

  res.json({ topics: parsed.topics });
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/api-server/src/routes/curriculum.ts
git commit -m "feat(api): add curriculum-plan endpoint — AI generates topic/subtopic tree"
```

---

## Task 3: API — `/api/admin/curriculum-generate`

**Files:**
- Modify: `artifacts/api-server/src/routes/curriculum.ts`

- [ ] **Step 1: Add the generate endpoint to the curriculum router**

Append before the `export default router;` line in `artifacts/api-server/src/routes/curriculum.ts`:

```typescript
// POST /api/admin/curriculum-generate
// Body: { subtopicId, curriculumId, subjectName, topicName, subtopicName, count? }
// Generates `count` draft questions for one subtopic, then marks it done/failed.
router.post("/admin/curriculum-generate", async (req, res) => {
  const {
    subtopicId,
    curriculumId,
    subjectName,
    topicName,
    subtopicName,
    count = 25,
  } = req.body || {};

  if (!subtopicId || !subjectName || !topicName || !subtopicName) {
    res.status(400).json({ error: "subtopicId, subjectName, topicName, subtopicName required" });
    return;
  }

  const admin = getAdmin();

  // Mark generating
  await admin.from("curriculum_subtopics").update({ gen_status: "generating" }).eq("id", subtopicId);

  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const apiKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

  const system = [
    `You are generating multiple-choice questions for students studying ${subjectName}.`,
    "Return ONLY a valid JSON array. No markdown, no commentary outside the array.",
    `Generate exactly ${count} questions.`,
    "Each object must have these exact keys:",
    "  question (string)",
    "  options (array of exactly 4 strings)",
    "  answer_index (integer 0–3)",
    "  solution (string — explain why the answer is correct, 2–4 sentences)",
    "  difficulty (integer 1–5)",
    "Questions must be accurate, unambiguous, and test conceptual understanding.",
    "Vary difficulty: include easy (1–2), medium (3), and hard (4–5) questions.",
    "Do not repeat the same scenario across questions.",
  ].join("\n");

  const user = [
    `Generate ${count} multiple-choice questions for the following:`,
    `Subject: ${subjectName}`,
    `Topic: ${topicName}`,
    `Subtopic: ${subtopicName}`,
    "",
    "All questions must directly assess concepts from this specific subtopic.",
    "Use appropriate terminology and scope for this level of study.",
  ].join("\n");

  // Pre-fetch existing questions to avoid duplicates
  const { data: existing } = await admin
    .from("draft_questions")
    .select("question")
    .eq("subject", subjectName)
    .eq("topic", topicName)
    .eq("subtopic", subtopicName)
    .limit(200);

  const existingSet = new Set(
    (existing || []).map((r) => (r.question || "").trim().toLowerCase())
  );

  let claudeRes: Response;
  try {
    claudeRes = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 8000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
  } catch (err) {
    await admin.from("curriculum_subtopics").update({ gen_status: "failed" }).eq("id", subtopicId);
    res.status(500).json({ error: "Failed to reach Claude API" });
    return;
  }

  if (!claudeRes.ok) {
    await admin.from("curriculum_subtopics").update({ gen_status: "failed" }).eq("id", subtopicId);
    const text = await claudeRes.text();
    res.status(500).json({ error: "Claude API error", detail: text });
    return;
  }

  const claudeData = await claudeRes.json() as { content?: { text: string }[] };
  const rawText = claudeData?.content?.[0]?.text || "";

  // Extract JSON array from response
  let questions: Array<{ question: string; options: string[]; answer_index: number; solution?: string; difficulty?: number }> = [];
  try {
    const parsed = JSON.parse(rawText);
    questions = Array.isArray(parsed) ? parsed : [];
  } catch {
    const start = rawText.indexOf("[");
    const end = rawText.lastIndexOf("]");
    if (start !== -1 && end > start) {
      try { questions = JSON.parse(rawText.slice(start, end + 1)); } catch {}
    }
  }

  if (!questions.length) {
    await admin.from("curriculum_subtopics").update({ gen_status: "failed" }).eq("id", subtopicId);
    res.status(200).json({ inserted: 0, message: "No questions parsed" });
    return;
  }

  const rows = questions
    .filter((q) => q.question && !existingSet.has(q.question.trim().toLowerCase()))
    .map((q) => ({
      source: "ai_generated",
      subject: subjectName,
      topic: topicName,
      topic_code: null,
      subtopic: subtopicName,
      question: q.question,
      options: q.options,
      answer_index: q.answer_index,
      solution: q.solution || null,
      difficulty: q.difficulty || null,
      status: "pending",
    }));

  if (rows.length === 0) {
    await admin.from("curriculum_subtopics").update({ gen_status: "done", questions_generated: 0 }).eq("id", subtopicId);
    res.status(200).json({ inserted: 0, message: "All questions were duplicates" });
    return;
  }

  const { error } = await admin.from("draft_questions").insert(rows);
  if (error) {
    await admin.from("curriculum_subtopics").update({ gen_status: "failed" }).eq("id", subtopicId);
    res.status(500).json({ error: error.message });
    return;
  }

  await admin
    .from("curriculum_subtopics")
    .update({ gen_status: "done", questions_generated: rows.length })
    .eq("id", subtopicId);

  res.json({ inserted: rows.length });
});
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/api-server/src/routes/curriculum.ts
git commit -m "feat(api): add curriculum-generate endpoint — seeds draft questions per subtopic"
```

---

## Task 4: Register Curriculum Routes

**Files:**
- Modify: `artifacts/api-server/src/routes/index.ts`

- [ ] **Step 1: Import and mount curriculum router**

In `artifacts/api-server/src/routes/index.ts`, add the import and `router.use()` call:

```typescript
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import generateQuestionsRouter from "./generate-questions";
import extractPdfRouter from "./extract-pdf";
import tutorRouter from "./tutor";
import adminRouter from "./admin";
import curriculumRouter from "./curriculum";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(generateQuestionsRouter);
router.use(extractPdfRouter);
router.use(tutorRouter);
router.use(adminRouter);
router.use(curriculumRouter);

export default router;
```

- [ ] **Step 2: Verify the API server builds**

```bash
cd artifacts/api-server && pnpm run build
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/index.ts
git commit -m "feat(api): register curriculum router"
```

---

## Task 5: Frontend Lib — `curriculaDb.js`

**Files:**
- Create: `artifacts/gradefarm/src/lib/curriculaDb.js`

- [ ] **Step 1: Create the file with all CRUD helpers**

```javascript
// artifacts/gradefarm/src/lib/curriculaDb.js
import { supabase } from './supabase'

/**
 * List all curricula with topic + subtopic counts and generation progress.
 * @returns {Promise<Array>}
 */
export async function listCurricula() {
  const { data, error } = await supabase
    .from('curricula')
    .select(`
      id, name, subject_description, status, created_at,
      curriculum_topics (
        id,
        curriculum_subtopics ( id, gen_status, questions_generated )
      )
    `)
    .order('created_at', { ascending: false })
  if (error) throw error

  return (data || []).map(c => {
    const topics = c.curriculum_topics || []
    const subtopics = topics.flatMap(t => t.curriculum_subtopics || [])
    return {
      id: c.id,
      name: c.name,
      subject_description: c.subject_description,
      status: c.status,
      created_at: c.created_at,
      topic_count: topics.length,
      subtopic_count: subtopics.length,
      questions_generated: subtopics.reduce((sum, s) => sum + (s.questions_generated || 0), 0),
      questions_total: subtopics.length * 25,
    }
  })
}

/**
 * Fetch one curriculum with its full topic/subtopic tree.
 * @param {string} id
 */
export async function getCurriculumDetail(id) {
  const { data: curriculum, error: cErr } = await supabase
    .from('curricula')
    .select('id, name, subject_description, status, created_at')
    .eq('id', id)
    .single()
  if (cErr) throw cErr

  const { data: topics, error: tErr } = await supabase
    .from('curriculum_topics')
    .select('id, name, order_index')
    .eq('curriculum_id', id)
    .order('order_index')
  if (tErr) throw tErr

  const topicIds = (topics || []).map(t => t.id)
  let subtopics = []
  if (topicIds.length > 0) {
    const { data: subs, error: sErr } = await supabase
      .from('curriculum_subtopics')
      .select('id, topic_id, name, order_index, gen_status, questions_generated')
      .in('topic_id', topicIds)
      .order('order_index')
    if (sErr) throw sErr
    subtopics = subs || []
  }

  return {
    ...curriculum,
    topics: (topics || []).map(t => ({
      ...t,
      subtopics: subtopics.filter(s => s.topic_id === t.id),
    })),
  }
}

/**
 * Create a new curriculum with its full topic/subtopic tree.
 * @param {{ name: string, subject_description: string, topics: Array }} data
 * @returns {Promise<string>} curriculum id
 */
export async function createCurriculum({ name, subject_description, topics }) {
  const { data: curriculum, error: cErr } = await supabase
    .from('curricula')
    .insert({ name, subject_description, status: 'draft' })
    .select('id')
    .single()
  if (cErr) throw cErr

  const curriculumId = curriculum.id
  await _replaceTopicsAndSubtopics(curriculumId, topics)
  return curriculumId
}

/**
 * Update an existing curriculum's name, description, and full topic/subtopic tree.
 * Replaces all existing topics/subtopics (full replace, not patch).
 * @param {string} id
 * @param {{ name?: string, subject_description?: string, topics?: Array }} updates
 */
export async function updateCurriculum(id, { name, subject_description, topics } = {}) {
  const patch = {}
  if (name !== undefined) patch.name = name
  if (subject_description !== undefined) patch.subject_description = subject_description

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('curricula').update(patch).eq('id', id)
    if (error) throw error
  }

  if (topics !== undefined) {
    await _replaceTopicsAndSubtopics(id, topics)
  }
}

/**
 * Update a curriculum's status field only.
 * @param {string} id
 * @param {'draft'|'generating'|'live'} status
 */
export async function updateCurriculumStatus(id, status) {
  const { error } = await supabase.from('curricula').update({ status }).eq('id', id)
  if (error) throw error
}

/**
 * Update one subtopic's gen_status and questions_generated count.
 * @param {string} subtopicId
 * @param {'pending'|'generating'|'done'|'failed'} genStatus
 * @param {number} [questionsGenerated]
 */
export async function updateSubtopicGenStatus(subtopicId, genStatus, questionsGenerated) {
  const patch = { gen_status: genStatus }
  if (questionsGenerated !== undefined) patch.questions_generated = questionsGenerated
  const { error } = await supabase.from('curriculum_subtopics').update(patch).eq('id', subtopicId)
  if (error) throw error
}

/**
 * Fetch all subtopics for a curriculum (for polling progress).
 * @param {string} curriculumId
 */
export async function getSubtopicStatuses(curriculumId) {
  const { data, error } = await supabase
    .from('curriculum_subtopics')
    .select('id, name, gen_status, questions_generated, topic_id')
    .eq('curriculum_id', curriculumId)
    .order('order_index')
  if (error) throw error
  return data || []
}

/**
 * Load all live/generating curricula topics into a cache-friendly format.
 * Returns: { [subjectName]: [{ code: string, name: string }] }
 */
export async function loadManagedCurriculaTopics() {
  const { data: curricula, error: cErr } = await supabase
    .from('curricula')
    .select('id, name')
    .in('status', ['live', 'generating'])
  if (cErr) throw cErr
  if (!curricula?.length) return {}

  const ids = curricula.map(c => c.id)
  const { data: topics, error: tErr } = await supabase
    .from('curriculum_topics')
    .select('id, curriculum_id, name, order_index')
    .in('curriculum_id', ids)
    .order('order_index')
  if (tErr) throw tErr

  const { data: subtopics, error: sErr } = await supabase
    .from('curriculum_subtopics')
    .select('id, topic_id, curriculum_id, name, order_index')
    .in('curriculum_id', ids)
    .order('order_index')
  if (sErr) throw sErr

  const result = {}
  for (const c of curricula) {
    const cTopics = (topics || []).filter(t => t.curriculum_id === c.id)
    const cSubtopics = []
    cTopics.forEach((t, ti) => {
      const subs = (subtopics || []).filter(s => s.topic_id === t.id)
      subs.forEach((s, si) => {
        cSubtopics.push({
          code: `T${ti + 1}.${si + 1}`,
          name: s.name,
          topicName: t.name,
        })
      })
    })
    result[c.name] = cSubtopics
  }
  return result
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function _replaceTopicsAndSubtopics(curriculumId, topics) {
  // Delete existing topics (cascade deletes subtopics)
  const { error: delErr } = await supabase
    .from('curriculum_topics')
    .delete()
    .eq('curriculum_id', curriculumId)
  if (delErr) throw delErr

  for (let ti = 0; ti < topics.length; ti++) {
    const topic = topics[ti]
    const { data: topicRow, error: tErr } = await supabase
      .from('curriculum_topics')
      .insert({ curriculum_id: curriculumId, name: topic.name, order_index: ti })
      .select('id')
      .single()
    if (tErr) throw tErr

    const subtopics = topic.subtopics || []
    if (subtopics.length > 0) {
      const subRows = subtopics.map((s, si) => ({
        topic_id: topicRow.id,
        curriculum_id: curriculumId,
        name: s.name,
        order_index: si,
        gen_status: 'pending',
        questions_generated: 0,
      }))
      const { error: sErr } = await supabase.from('curriculum_subtopics').insert(subRows)
      if (sErr) throw sErr
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/gradefarm/src/lib/curriculaDb.js
git commit -m "feat(lib): add curriculaDb — CRUD helpers for curriculum tables"
```

---

## Task 6: Update `adminTopics.js` — Managed Topics Cache

**Files:**
- Modify: `artifacts/gradefarm/src/lib/adminTopics.js`
- Modify: `artifacts/gradefarm/src/lib/adminTopics.test.js`

- [ ] **Step 1: Add cache and `loadManagedCurriculaTopics` to adminTopics.js**

At the top of `artifacts/gradefarm/src/lib/adminTopics.js`, after the existing topic arrays and before `getTopicsBySubject`, add:

```javascript
// ── Managed curricula cache ───────────────────────────────────────────────────
// Populated by loadManagedCurriculaTopics() called on admin dashboard mount.
// Keys are curriculum names (e.g. "Year 9 Biology").
// Values are arrays of { code, name, topicName }.
let _managedTopicsCache = {}

/**
 * Populate the managed topics cache from the DB.
 * Call once on admin dashboard mount and after a curriculum goes live.
 * @param {() => Promise<Object>} fetcher - typically loadManagedCurriculaTopics from curriculaDb.js
 */
export async function refreshManagedTopicsCache(fetcher) {
  try {
    _managedTopicsCache = await fetcher()
  } catch (e) {
    console.warn('[adminTopics] Could not load managed curricula topics:', e)
  }
}

/**
 * Returns all managed curriculum subject names currently in cache.
 * @returns {string[]}
 */
export function getManagedSubjectNames() {
  return Object.keys(_managedTopicsCache)
}
```

Then update `getTopicsBySubject` to fall back to the cache. Replace the existing function:

```javascript
export function getTopicsBySubject(subjectId) {
  switch (subjectId) {
    case 'chemistry_s1':
    case 'Chemistry Stage 1': return S1_TOPICS
    case 'chemistry_s2':
    case 'Chemistry Stage 2': return S2_TOPICS
    case 'maths_y7':
    case 'Year 7 Mathematics': return Y7_MATHS_TOPICS
    case 'english_y7':
    case 'Year 7 English': return Y7_ENGLISH_TOPICS
    case 'maths_y10':
    case 'Year 10 Mathematics':
    case 'Victorian Year 10 Mathematics':
    case 'Victorian Year 10A Mathematics': return Y10_MATHS_TOPICS
    default:
      // Fall back to managed curricula cache
      return _managedTopicsCache[subjectId] || S1_TOPICS
  }
}
```

- [ ] **Step 2: Write tests**

In `artifacts/gradefarm/src/lib/adminTopics.test.js`, add after the existing tests:

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  S1_TOPICS, S2_TOPICS, getTopicByCode, getTopicsBySubject,
  refreshManagedTopicsCache, getManagedSubjectNames,
} from './adminTopics.js'

// ... existing tests unchanged ...

test('getTopicsBySubject returns S1_TOPICS for unknown subject when cache is empty', () => {
  const result = getTopicsBySubject('Unknown Subject')
  assert.strictEqual(result, S1_TOPICS)
})

test('refreshManagedTopicsCache + getTopicsBySubject returns cached topics', async () => {
  const fakeFetcher = async () => ({
    'Year 9 Biology': [
      { code: 'T1.1', name: 'Cell membrane structure', topicName: 'Cell Biology' },
      { code: 'T1.2', name: 'Mitosis',                 topicName: 'Cell Biology' },
    ],
  })
  await refreshManagedTopicsCache(fakeFetcher)
  const result = getTopicsBySubject('Year 9 Biology')
  assert.equal(result.length, 2)
  assert.equal(result[0].code, 'T1.1')
  assert.equal(result[0].name, 'Cell membrane structure')
})

test('getManagedSubjectNames returns cached subject names', async () => {
  // relies on the cache populated by the previous test
  const names = getManagedSubjectNames()
  assert.ok(names.includes('Year 9 Biology'))
})
```

- [ ] **Step 3: Run tests**

```bash
cd artifacts/gradefarm && pnpm test
```

Expected: all tests pass including the 3 new ones.

- [ ] **Step 4: Commit**

```bash
git add artifacts/gradefarm/src/lib/adminTopics.js artifacts/gradefarm/src/lib/adminTopics.test.js
git commit -m "feat(lib): add managed topics cache to adminTopics — falls back to DB-driven curricula"
```

---

## Task 7: `AdminCurriculaTab.jsx` — List Page + Modal

**Files:**
- Create: `artifacts/gradefarm/src/components/AdminCurriculaTab.jsx`

- [ ] **Step 1: Create the component**

```jsx
// artifacts/gradefarm/src/components/AdminCurriculaTab.jsx
import { useState, useEffect, useCallback } from 'react'
import { listCurricula, createCurriculum } from '../lib/curriculaDb'
import { adminApiPost } from '../lib/adminApi'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

function statusStyle(status) {
  if (status === 'live')       return { bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.3)',   color: '#4ade80' }
  if (status === 'generating') return { bg: 'rgba(56,189,248,0.1)',  border: 'rgba(56,189,248,0.3)',  color: '#38bdf8' }
  return { bg: 'rgba(241,190,67,0.1)', border: 'rgba(241,190,67,0.3)', color: GOLD }
}

function StatusBadge({ status }) {
  const s = statusStyle(status)
  return (
    <span style={{
      padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      textTransform: 'capitalize',
      animation: status === 'generating' ? 'pulse 1.5s ease-in-out infinite' : 'none',
    }}>
      {status}
    </span>
  )
}

export default function AdminCurriculaTab({ onSelectCurriculum }) {
  const [curricula, setCurricula]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [description, setDescription] = useState('')
  const [creating, setCreating]     = useState(false)
  const [createError, setCreateError] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      setCurricula(await listCurricula())
    } catch (e) {
      if (!silent) setError(e.message)
    }
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleGeneratePlan = async () => {
    if (!description.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      const { topics } = await adminApiPost('/api/admin/curriculum-plan', { subjectDescription: description.trim() })
      // Use the first line of the description as the curriculum name
      const name = description.trim().split('\n')[0].slice(0, 120)
      const id = await createCurriculum({ name, subject_description: description.trim(), topics })
      setShowModal(false)
      setDescription('')
      onSelectCurriculum(id)
    } catch (e) {
      setCreateError(e.message)
    }
    setCreating(false)
  }

  return (
    <div style={{ fontFamily: FONT_B, color: '#e2e8f0' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: GOLD }}>Curricula</h2>
        <button
          onClick={() => { setShowModal(true); setCreateError('') }}
          style={{
            padding: '9px 18px', borderRadius: 9, border: 'none',
            background: GOLD, color: '#0c1037', fontSize: 13, fontWeight: 800,
            cursor: 'pointer', fontFamily: FONT_B,
          }}
        >
          + New Curriculum
        </button>
      </div>

      {error && (
        <div style={errorBox}>{error}</div>
      )}

      {loading ? (
        <div style={{ color: '#64748b', fontSize: 13 }}>Loading curricula…</div>
      ) : curricula.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '64px 24px',
          border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 14,
          color: '#64748b', fontSize: 14,
        }}>
          <div style={{ marginBottom: 16 }}>No curricula yet.</div>
          <button
            onClick={() => { setShowModal(true); setCreateError('') }}
            style={{
              padding: '10px 22px', borderRadius: 9, border: `1px solid ${GOLD}55`,
              background: `${GOLD}15`, color: GOLD, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: FONT_B,
            }}
          >
            Add your first subject
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {curricula.map(c => (
            <div
              key={c.id}
              onClick={() => onSelectCurriculum(c.id)}
              style={{
                padding: 18, borderRadius: 12,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.3 }}>{c.name}</div>
                <StatusBadge status={c.status} />
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                <span>{c.topic_count} topics</span>
                <span>{c.subtopic_count} subtopics</span>
              </div>
              {c.status !== 'draft' && c.questions_total > 0 && (
                <div>
                  <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      background: '#4ade80',
                      width: `${Math.min(100, Math.round((c.questions_generated / c.questions_total) * 100))}%`,
                      transition: 'width 0.4s',
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {c.questions_generated} / {c.questions_total} questions generated
                  </div>
                </div>
              )}
              <div style={{ fontSize: 11, color: '#475569', marginTop: 8 }}>
                {new Date(c.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Curriculum Modal */}
      {showModal && (
        <>
          <div
            onClick={() => { if (!creating) setShowModal(false) }}
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.6)' }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 51, width: 480, maxWidth: '95vw',
            background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16, padding: 28, fontFamily: FONT_B,
          }}>
            <h3 style={{ margin: '0 0 6px', color: '#f1f5f9', fontSize: 16 }}>New Curriculum</h3>
            <p style={{ margin: '0 0 18px', color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
              Describe the subject and level. Claude will generate a full topic and subtopic plan.
            </p>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Year 11 SACE Biology — Australian curriculum, covering cells, genetics, ecosystems, and evolution"
              rows={4}
              disabled={creating}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 9,
                border: '1px solid rgba(255,255,255,0.12)',
                background: '#0c1037', color: '#f1f5f9',
                fontSize: 13, fontFamily: FONT_B, outline: 'none',
                resize: 'vertical', boxSizing: 'border-box',
                opacity: creating ? 0.6 : 1,
              }}
            />
            {createError && (
              <div style={{ ...errorBox, marginTop: 10 }}>{createError}</div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowModal(false)}
                disabled={creating}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}
              >
                Cancel
              </button>
              <button
                onClick={handleGeneratePlan}
                disabled={!description.trim() || creating}
                style={{
                  padding: '9px 20px', borderRadius: 8, border: 'none',
                  background: (!description.trim() || creating) ? 'rgba(241,190,67,0.4)' : GOLD,
                  color: '#0c1037', fontSize: 13, fontWeight: 800,
                  cursor: (!description.trim() || creating) ? 'not-allowed' : 'pointer',
                  fontFamily: FONT_B,
                }}
              >
                {creating ? 'Generating plan…' : 'Generate Plan'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const errorBox = {
  padding: '10px 14px', background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
  fontSize: 13, color: '#f87171', marginBottom: 12,
}
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/gradefarm/src/components/AdminCurriculaTab.jsx
git commit -m "feat(ui): add AdminCurriculaTab — curriculum list, cards and new curriculum modal"
```

---

## Task 8: `AdminCurriculumDetail.jsx` — Tree Editor

**Files:**
- Create: `artifacts/gradefarm/src/components/AdminCurriculumDetail.jsx`

- [ ] **Step 1: Create the component (tree editor + save)**

```jsx
// artifacts/gradefarm/src/components/AdminCurriculumDetail.jsx
import { useState, useEffect, useRef } from 'react'
import {
  getCurriculumDetail,
  updateCurriculum,
  updateCurriculumStatus,
  updateSubtopicGenStatus,
  getSubtopicStatuses,
} from '../lib/curriculaDb'
import { adminApiPost } from '../lib/adminApi'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

// ── Inline editable text node ─────────────────────────────────────────────────
function EditableText({ value, onSave, style }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commit = () => {
    setEditing(false)
    if (draft.trim() && draft !== value) onSave(draft.trim())
    else setDraft(value)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        style={{
          ...style,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(241,190,67,0.4)',
          borderRadius: 5, padding: '2px 6px', outline: 'none', color: '#f1f5f9',
          fontFamily: FONT_B, fontSize: 'inherit', width: '100%',
        }}
      />
    )
  }
  return (
    <span
      onClick={() => { setDraft(value); setEditing(true) }}
      title="Click to rename"
      style={{ ...style, cursor: 'text', borderRadius: 4, padding: '2px 4px', transition: 'background 0.1s' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {value}
    </span>
  )
}

export default function AdminCurriculumDetail({ curriculumId, onBack, onGoLive }) {
  const [curriculum, setCurriculum]   = useState(null)
  const [topics, setTopics]           = useState([])   // [{ id?, name, subtopics: [{ id?, name }] }]
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saveOk, setSaveOk]           = useState(false)
  const [error, setError]             = useState('')
  const [generating, setGenerating]   = useState(false)
  const [progress, setProgress]       = useState(null) // [{ id, name, gen_status, questions_generated }]
  const [genError, setGenError]       = useState('')
  const pollRef = useRef(null)

  useEffect(() => {
    loadDetail()
    return () => clearInterval(pollRef.current)
  }, [curriculumId])

  async function loadDetail() {
    setLoading(true)
    try {
      const detail = await getCurriculumDetail(curriculumId)
      setCurriculum(detail)
      setTopics(detail.topics.map(t => ({
        ...t,
        subtopics: t.subtopics.map(s => ({ ...s })),
      })))
      if (detail.status === 'generating') {
        setGenerating(true)
        startPolling()
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  function startPolling() {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const statuses = await getSubtopicStatuses(curriculumId)
        setProgress(statuses)
        const allDone = statuses.every(s => s.gen_status === 'done' || s.gen_status === 'failed')
        if (allDone) {
          clearInterval(pollRef.current)
          await updateCurriculumStatus(curriculumId, 'live')
          setCurriculum(prev => ({ ...prev, status: 'live' }))
          setGenerating(false)
          onGoLive?.()
        }
      } catch {}
    }, 5000)
  }

  // ── Tree mutation helpers ─────────────────────────────────────────────────

  const renameTopic = (ti, name) => setTopics(prev => prev.map((t, i) => i === ti ? { ...t, name } : t))
  const renameSubtopic = (ti, si, name) => setTopics(prev => prev.map((t, i) =>
    i !== ti ? t : { ...t, subtopics: t.subtopics.map((s, j) => j === si ? { ...s, name } : s) }
  ))
  const addTopic = () => setTopics(prev => [...prev, { name: 'New Topic', subtopics: [] }])
  const deleteTopic = (ti) => {
    const t = topics[ti]
    const msg = t.subtopics.length > 0
      ? `Delete "${t.name}" and its ${t.subtopics.length} subtopic(s)?`
      : `Delete "${t.name}"?`
    if (!window.confirm(msg)) return
    setTopics(prev => prev.filter((_, i) => i !== ti))
  }
  const moveTopicUp = (ti) => {
    if (ti === 0) return
    setTopics(prev => { const a = [...prev]; [a[ti - 1], a[ti]] = [a[ti], a[ti - 1]]; return a })
  }
  const moveTopicDown = (ti) => {
    if (ti === topics.length - 1) return
    setTopics(prev => { const a = [...prev]; [a[ti], a[ti + 1]] = [a[ti + 1], a[ti]]; return a })
  }
  const addSubtopic = (ti) => setTopics(prev => prev.map((t, i) =>
    i !== ti ? t : { ...t, subtopics: [...t.subtopics, { name: 'New Subtopic' }] }
  ))
  const deleteSubtopic = (ti, si) => setTopics(prev => prev.map((t, i) =>
    i !== ti ? t : { ...t, subtopics: t.subtopics.filter((_, j) => j !== si) }
  ))
  const moveSubtopicUp = (ti, si) => {
    if (si === 0) return
    setTopics(prev => prev.map((t, i) => {
      if (i !== ti) return t
      const a = [...t.subtopics]; [a[si - 1], a[si]] = [a[si], a[si - 1]]; return { ...t, subtopics: a }
    }))
  }
  const moveSubtopicDown = (ti, si) => setTopics(prev => prev.map((t, i) => {
    if (i !== ti) return t
    if (si === t.subtopics.length - 1) return t
    const a = [...t.subtopics]; [a[si], a[si + 1]] = [a[si + 1], a[si]]; return { ...t, subtopics: a }
  }))

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true); setError(''); setSaveOk(false)
    try {
      await updateCurriculum(curriculumId, { name: curriculum.name, topics })
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2500)
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  // ── Generation pipeline (Task 9 adds this) ────────────────────────────────
  const handleApproveAndGenerate = async () => {
    if (!window.confirm(`Generate 25 questions for each of the ${topics.flatMap(t => t.subtopics).length} subtopics? This may take several minutes.`)) return
    setSaving(true); setError(''); setGenError('')
    try {
      await updateCurriculum(curriculumId, { name: curriculum.name, topics })
      await updateCurriculumStatus(curriculumId, 'generating')
      setCurriculum(prev => ({ ...prev, status: 'generating' }))
      setGenerating(true)

      const freshDetail = await getCurriculumDetail(curriculumId)
      const allSubtopics = freshDetail.topics.flatMap((t, ti) =>
        t.subtopics.map((s, si) => ({ ...s, topicName: t.name, topicIndex: ti, subtopicIndex: si }))
      )

      const initialProgress = allSubtopics.map(s => ({
        id: s.id, name: s.name, topicName: s.topicName,
        gen_status: 'pending', questions_generated: 0,
      }))
      setProgress(initialProgress)
      startPolling()

      for (const sub of allSubtopics) {
        setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'generating' } : p))
        try {
          await adminApiPost('/api/admin/curriculum-generate', {
            subtopicId: sub.id,
            curriculumId,
            subjectName: freshDetail.name,
            topicName: sub.topicName,
            subtopicName: sub.name,
            count: 25,
          })
          setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'done', questions_generated: 25 } : p))
        } catch {
          setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'failed' } : p))
        }
      }
    } catch (e) {
      setError(e.message)
      setGenerating(false)
    }
    setSaving(false)
  }

  const handleRetry = async (sub) => {
    const freshDetail = curriculum
    setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'generating' } : p))
    try {
      await adminApiPost('/api/admin/curriculum-generate', {
        subtopicId: sub.id,
        curriculumId,
        subjectName: freshDetail.name,
        topicName: sub.topicName,
        subtopicName: sub.name,
        count: 25,
      })
      setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'done', questions_generated: 25 } : p))
    } catch {
      setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'failed' } : p))
    }
  }

  if (loading) return <div style={{ color: '#64748b', fontSize: 13, fontFamily: FONT_B }}>Loading curriculum…</div>
  if (!curriculum) return <div style={{ color: '#f87171', fontSize: 13, fontFamily: FONT_B }}>{error || 'Curriculum not found.'}</div>

  const totalSubtopics = topics.reduce((n, t) => n + t.subtopics.length, 0)
  const doneCount    = (progress || []).filter(p => p.gen_status === 'done').length
  const failedCount  = (progress || []).filter(p => p.gen_status === 'failed').length
  const totalQs      = (progress || []).reduce((n, p) => n + (p.questions_generated || 0), 0)
  const isDraft      = curriculum.status === 'draft'

  return (
    <div style={{ fontFamily: FONT_B, color: '#e2e8f0' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, fontFamily: FONT_B, padding: 0 }}
        >
          ← Curricula
        </button>
        <EditableText
          value={curriculum.name}
          onSave={name => setCurriculum(prev => ({ ...prev, name }))}
          style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}
        />
        <span style={{
          padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: curriculum.status === 'live' ? 'rgba(74,222,128,0.1)' : curriculum.status === 'generating' ? 'rgba(56,189,248,0.1)' : 'rgba(241,190,67,0.1)',
          border: `1px solid ${curriculum.status === 'live' ? 'rgba(74,222,128,0.3)' : curriculum.status === 'generating' ? 'rgba(56,189,248,0.3)' : 'rgba(241,190,67,0.3)'}`,
          color: curriculum.status === 'live' ? '#4ade80' : curriculum.status === 'generating' ? '#38bdf8' : GOLD,
          textTransform: 'capitalize',
        }}>{curriculum.status}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {saveOk && <span style={{ fontSize: 12, color: '#4ade80', alignSelf: 'center' }}>✓ Saved</span>}
          <button
            onClick={handleSave}
            disabled={saving || generating}
            style={secondaryBtn(saving || generating)}
          >
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          {isDraft && (
            <button
              onClick={handleApproveAndGenerate}
              disabled={saving || totalSubtopics === 0}
              style={{
                padding: '9px 18px', borderRadius: 9, border: 'none',
                background: (saving || totalSubtopics === 0) ? 'rgba(241,190,67,0.4)' : GOLD,
                color: '#0c1037', fontSize: 13, fontWeight: 800,
                cursor: (saving || totalSubtopics === 0) ? 'not-allowed' : 'pointer',
                fontFamily: FONT_B,
              }}
            >
              Approve & Generate →
            </button>
          )}
        </div>
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {genError && <div style={errorBox}>{genError}</div>}

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* Left: tree editor */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {topics.map((topic, ti) => (
            <div key={ti} style={{ marginBottom: 14 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, width: 22, flexShrink: 0 }}>T{ti + 1}</span>
                <EditableText
                  value={topic.name}
                  onSave={name => renameTopic(ti, name)}
                  style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}
                />
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <IconBtn title="Move up"   onClick={() => moveTopicUp(ti)}   disabled={ti === 0}>↑</IconBtn>
                  <IconBtn title="Move down" onClick={() => moveTopicDown(ti)} disabled={ti === topics.length - 1}>↓</IconBtn>
                  <IconBtn title="Delete topic" onClick={() => deleteTopic(ti)} danger>×</IconBtn>
                </div>
              </div>

              {/* Subtopics */}
              <div style={{ paddingLeft: 28, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {topic.subtopics.map((sub, si) => (
                  <div key={si} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <span style={{ fontSize: 10, color: '#475569', width: 30, flexShrink: 0 }}>{ti + 1}.{si + 1}</span>
                    <EditableText
                      value={sub.name}
                      onSave={name => renameSubtopic(ti, si, name)}
                      style={{ flex: 1, fontSize: 13, color: '#cbd5e1' }}
                    />
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                      <IconBtn onClick={() => moveSubtopicUp(ti, si)}   disabled={si === 0}   small>↑</IconBtn>
                      <IconBtn onClick={() => moveSubtopicDown(ti, si)} disabled={si === topic.subtopics.length - 1} small>↓</IconBtn>
                      <IconBtn onClick={() => deleteSubtopic(ti, si)} danger small>×</IconBtn>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => addSubtopic(ti)}
                  style={{ ...addBtn, marginTop: 2 }}
                >
                  + Add Subtopic
                </button>
              </div>
            </div>
          ))}

          <button onClick={addTopic} style={{ ...addBtn, marginTop: 8, padding: '10px 16px', fontSize: 13 }}>
            + Add Topic
          </button>
        </div>

        {/* Right: generation progress panel */}
        {progress && (
          <div style={{
            width: 320, flexShrink: 0,
            position: 'sticky', top: 24,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14, padding: 18,
            maxHeight: 'calc(100vh - 160px)', overflowY: 'auto',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>
              Generation Progress
            </div>

            {/* Overall progress bar */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3, background: '#4ade80',
                  width: `${totalSubtopics > 0 ? Math.round(((doneCount + failedCount) / totalSubtopics) * 100) : 0}%`,
                  transition: 'width 0.4s',
                }} />
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 5 }}>
                {totalQs} questions · {doneCount}/{totalSubtopics} subtopics done
                {failedCount > 0 && <span style={{ color: '#f87171' }}> · {failedCount} failed</span>}
              </div>
            </div>

            {/* Per-subtopic list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {progress.map(p => {
                const chipColor = p.gen_status === 'done' ? '#4ade80' : p.gen_status === 'failed' ? '#f87171' : p.gen_status === 'generating' ? '#38bdf8' : '#64748b'
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid rgba(255,255,255,0.04)`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                      color: chipColor,
                      padding: '1px 7px', borderRadius: 999,
                      border: `1px solid ${chipColor}44`,
                      background: `${chipColor}14`,
                    }}>
                      {p.gen_status === 'done' ? `✓ ${p.questions_generated}q` : p.gen_status === 'generating' ? '…' : p.gen_status === 'failed' ? '✗' : 'pending'}
                    </span>
                    {p.gen_status === 'failed' && (
                      <button
                        onClick={() => handleRetry(p)}
                        style={{ background: 'none', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 5, color: '#f87171', fontSize: 10, cursor: 'pointer', padding: '2px 7px', fontFamily: FONT_B }}
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function IconBtn({ children, onClick, disabled, danger, small, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: small ? 22 : 26, height: small ? 22 : 26,
        borderRadius: 5, border: `1px solid ${danger ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.08)'}`,
        background: 'transparent',
        color: disabled ? '#374151' : danger ? '#f87171' : '#94a3b8',
        fontSize: small ? 11 : 13, cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

const errorBox = {
  padding: '10px 14px', background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
  fontSize: 13, color: '#f87171', marginBottom: 14,
}

const addBtn = {
  background: 'none', border: '1px dashed rgba(255,255,255,0.1)',
  borderRadius: 7, color: 'rgba(255,255,255,0.3)',
  fontSize: 12, cursor: 'pointer', padding: '6px 12px',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  width: '100%', textAlign: 'left',
}

const secondaryBtn = (disabled) => ({
  padding: '9px 16px', borderRadius: 9,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'transparent', color: disabled ? '#64748b' : '#e2e8f0',
  fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
})
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/gradefarm/src/components/AdminCurriculumDetail.jsx
git commit -m "feat(ui): add AdminCurriculumDetail — editable tree, save draft, approve & generate pipeline"
```

---

## Task 9: Wire `AdminScreen.jsx`

**Files:**
- Modify: `artifacts/gradefarm/src/components/AdminScreen.jsx`

- [ ] **Step 1: Import new components and add Curricula tab**

Replace the contents of `artifacts/gradefarm/src/components/AdminScreen.jsx` with:

```jsx
import { useState } from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import AdminUploadScreen         from './AdminUploadScreen'
import AdminGenerateScreen       from './AdminGenerateScreen'
import AdminReviewScreen         from './AdminReviewScreen'
import AdminUsersTab             from './AdminUsersTab'
import AdminStudentsTab          from './AdminStudentsTab'
import AdminTutorsTab            from './AdminTutorsTab'
import AdminAssignmentsTab       from './AdminAssignmentsTab'
import AdminTutorApplicationsTab from './AdminTutorApplicationsTab'
import AdminCurriculaTab         from './AdminCurriculaTab'
import AdminCurriculumDetail     from './AdminCurriculumDetail'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

function CurriculaRouter() {
  const [selectedId, setSelectedId] = useState(null)

  if (selectedId) {
    return (
      <AdminCurriculumDetail
        curriculumId={selectedId}
        onBack={() => setSelectedId(null)}
        onGoLive={() => {}}
      />
    )
  }
  return <AdminCurriculaTab onSelectCurriculum={setSelectedId} />
}

export default function AdminScreen({ profile }) {
  const navigate = useNavigate()
  const [studentCount, setStudentCount] = useState(null)

  const tabs = [
    { label: 'Students',           badge: studentCount, path: '/admin/students' },
    { label: 'Tutors',             path: '/admin/tutors' },
    { label: 'Assignments',        path: '/admin/assignments' },
    { label: 'Curricula',          path: '/admin/curricula' },
    { label: 'All Users',          path: '/admin/users' },
    { label: 'Tutor Applications', path: '/admin/applications' },
    { label: 'Upload PDF',         path: '/admin/upload' },
    { label: 'Generate',           path: '/admin/generate' },
    { label: 'Review Queue',       path: '/admin/review' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#080d28', fontFamily: FONT_B, color: '#fff' }}>
      <div style={{
        padding: '14px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <button
          onClick={() => navigate('/question-bank')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, fontFamily: FONT_B }}
        >
          ← Back to app
        </button>
        <span style={{ color: GOLD, fontWeight: 800, fontSize: 16 }}>Content Admin</span>
      </div>

      <div style={{
        display: 'flex', gap: 4, padding: '12px 24px 0',
        borderBottom: '1px solid rgba(255,255,255,0.08)', overflowX: 'auto',
      }}>
        {tabs.map(tab => (
          <NavLink
            key={tab.path}
            to={tab.path}
            style={({ isActive }) => ({
              padding: '8px 14px', borderRadius: '8px 8px 0 0',
              fontSize: 13, fontWeight: 700, textDecoration: 'none',
              color: isActive ? GOLD : 'rgba(255,255,255,0.5)',
              background: isActive ? 'rgba(241,190,67,0.08)' : 'transparent',
              borderBottom: isActive ? `2px solid ${GOLD}` : '2px solid transparent',
              fontFamily: FONT_B, display: 'flex', alignItems: 'center', gap: 6,
              whiteSpace: 'nowrap', flexShrink: 0,
            })}
          >
            {tab.label}
            {tab.badge != null && (
              <span style={{
                fontSize: 10, fontWeight: 800,
                background: `${GOLD}22`, color: GOLD,
                border: `1px solid ${GOLD}44`,
                borderRadius: 5, padding: '1px 5px', lineHeight: 1.4,
              }}>
                {tab.badge}
              </span>
            )}
          </NavLink>
        ))}
      </div>

      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <Routes>
          <Route index element={<Navigate to="students" replace />} />
          <Route path="students"     element={<AdminStudentsTab profile={profile} onCountLoad={setStudentCount} />} />
          <Route path="tutors"       element={<AdminTutorsTab />} />
          <Route path="assignments"  element={<AdminAssignmentsTab />} />
          <Route path="curricula"    element={<CurriculaRouter />} />
          <Route path="users"        element={<AdminUsersTab profile={profile} />} />
          <Route path="applications" element={<AdminTutorApplicationsTab />} />
          <Route path="upload"       element={<AdminUploadScreen />} />
          <Route path="generate"     element={<AdminGenerateScreen />} />
          <Route path="review"       element={<AdminReviewScreen profile={profile} />} />
        </Routes>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/gradefarm/src/components/AdminScreen.jsx
git commit -m "feat(ui): add Curricula tab to AdminScreen"
```

---

## Task 10: Update `AdminGenerateScreen.jsx` — Managed Curricula Section

**Files:**
- Modify: `artifacts/gradefarm/src/components/AdminGenerateScreen.jsx`

- [ ] **Step 1: Add managed curricula fetch and section**

At the top of `AdminGenerateScreen.jsx`, add these imports after the existing ones:

```jsx
import { loadManagedCurriculaTopics } from '../lib/curriculaDb'
import { refreshManagedTopicsCache, getManagedSubjectNames } from '../lib/adminTopics'
```

Inside the `AdminGenerateScreen` component, add a state and useEffect to load managed curricula:

```jsx
const [managedSubjects, setManagedSubjects] = useState([])

useEffect(() => {
  refreshManagedTopicsCache(loadManagedCurriculaTopics)
    .then(() => setManagedSubjects(getManagedSubjectNames()))
    .catch(() => {})
}, [])
```

Then in the JSX, after the existing SUBJECTS pill buttons section, add a "Managed Curricula" section. Find the closing `</div>` of the Subject section and add below it:

```jsx
{managedSubjects.length > 0 && (
  <div style={{ marginTop: 10 }}>
    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      Managed Curricula
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {managedSubjects.map(s => (
        <button
          key={s}
          onClick={() => handleSubjectChange(s)}
          style={{
            padding: '8px 16px', borderRadius: 8,
            border: `1px solid ${subject === s ? GOLD : 'rgba(255,255,255,0.12)'}`,
            background: subject === s ? 'rgba(241,190,67,0.1)' : 'transparent',
            color: subject === s ? GOLD : 'rgba(255,255,255,0.5)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
          }}
        >
          {s}
        </button>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/gradefarm/src/components/AdminGenerateScreen.jsx
git commit -m "feat(ui): show managed curricula in Generate tab subject picker"
```

---

## Task 11: End-to-End Smoke Test

- [ ] **Step 1: Run the frontend dev server**

```bash
cd artifacts/gradefarm && pnpm dev
```

- [ ] **Step 2: Open admin dashboard → Curricula tab**

Navigate to `/admin/curricula`. Verify:
- Empty state shows with "Add your first subject" button
- Clicking "New Curriculum" opens the modal

- [ ] **Step 3: Create a curriculum**

In the modal, type: `Year 8 Science — Australian Curriculum, covering physics, chemistry, biology and earth science`

Click "Generate Plan". Verify:
- Modal shows "Generating plan…"
- On success, navigates to the detail page with a pre-populated topic tree
- Topics and subtopics are visible and editable

- [ ] **Step 4: Edit the tree**

- Click a topic name → renames inline
- Click "× " on a subtopic → deletes it
- Click "+ Add Subtopic" → adds a new row
- Click "↑ / ↓" on a topic → reorders it

- [ ] **Step 5: Save Draft**

Click "Save Draft". Verify "✓ Saved" flash appears.

- [ ] **Step 6: Navigate back**

Click "← Curricula". Verify the curriculum appears in the list as a card with status "draft".

- [ ] **Step 7: Approve & Generate (small tree)**

Create a second curriculum with just 1 topic and 2 subtopics to test generation quickly. Click "Approve & Generate". Verify:
- Status badge changes to "generating"
- Right panel appears with per-subtopic progress chips
- Each subtopic transitions: pending → generating → done ✓
- When all done, status → "live"
- Draft questions appear in the Review Queue tab

- [ ] **Step 8: Run all lib tests**

```bash
cd artifacts/gradefarm && pnpm test
```

Expected: all tests pass.

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "feat: Curriculum Builder — AI plan generation, editable tree, batch question seeding"
```
