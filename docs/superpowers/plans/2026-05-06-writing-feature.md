# Writing Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add English Writing as a subject for Year 5–6, 7–8, and 9–10 — students get an AI-generated prompt, write a full essay or fill a structured planner, then receive scholarship-assessor-style annotated feedback stored in Supabase.

**Architecture:** Three writing subjects with `type: 'writing'` are added to `subjects.js`; `App.jsx` routes them to a new `WritingScreen` component instead of `HomeScreen`. Two Express API routes generate prompts (with optional Unsplash images for narratives) and feedback via Claude. A `writing_attempts` Supabase table stores every attempt with its feedback.

**Tech Stack:** React 18, Supabase JS v2, Express/TypeScript, Claude API (`claude-opus-4-6`), Unsplash API

---

## File Map

| Action | File |
|---|---|
| Create | `artifacts/gradefarm/src/components/WritingScreen.jsx` |
| Create | `artifacts/gradefarm/src/lib/writingDb.js` |
| Create | `artifacts/api-server/src/routes/writing.ts` |
| Modify | `artifacts/gradefarm/src/lib/subjects.js` |
| Modify | `artifacts/gradefarm/src/App.jsx` |
| Modify | `artifacts/api-server/src/routes/index.ts` |

---

## Task 1: Create the `writing_attempts` Supabase Table

**Files:**
- No code files — SQL run directly in Supabase SQL editor

- [ ] **Step 1: Open the Supabase SQL editor for the project**

  Navigate to your Supabase project → SQL Editor → New query.

- [ ] **Step 2: Run the following SQL**

```sql
create table if not exists writing_attempts (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        references profiles(id) on delete cascade not null,
  subject          text        not null,
  essay_type       text        not null,
  mode             text        not null,
  prompt           text        not null,
  image_url        text,
  content          jsonb       not null,
  feedback         jsonb,
  timed            boolean     not null default false,
  duration_seconds integer,
  actual_seconds   integer,
  created_at       timestamptz not null default now()
);

alter table writing_attempts enable row level security;

create policy "Users can read own writing attempts"
  on writing_attempts for select
  using (auth.uid() = user_id);

create policy "Users can insert own writing attempts"
  on writing_attempts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own writing attempts"
  on writing_attempts for update
  using (auth.uid() = user_id);
```

- [ ] **Step 3: Verify the table was created**

  In Supabase Table Editor, confirm `writing_attempts` appears with all columns.

---

## Task 2: Add Writing Subjects to `subjects.js`

**Files:**
- Modify: `artifacts/gradefarm/src/lib/subjects.js`

- [ ] **Step 1: Open `artifacts/gradefarm/src/lib/subjects.js`**

- [ ] **Step 2: Append three writing subject entries to the end of the `ALL_SUBJECTS` array (before the closing `]`)**

  Current last entry ends at line 130 with the `maths_y10` object and `]`. Add the following entries before the `]`:

```js
  {
    id: 'writing_y56',
    name: 'Writing',
    stage: 'Year 5–6',
    icon: '✏️',
    color: '#14b8a6',
    type: 'writing',
    topics: ['Narrative', 'Persuasive'],
    questionCount: 0,
    available: true,
  },
  {
    id: 'writing_y78',
    name: 'Writing',
    stage: 'Year 7–8',
    icon: '✏️',
    color: '#14b8a6',
    type: 'writing',
    topics: ['Narrative', 'Persuasive'],
    questionCount: 0,
    available: true,
  },
  {
    id: 'writing_y910',
    name: 'Writing',
    stage: 'Year 9–10',
    icon: '✏️',
    color: '#14b8a6',
    type: 'writing',
    topics: ['Narrative', 'Persuasive'],
    questionCount: 0,
    available: true,
  },
```

- [ ] **Step 3: Verify the file still parses correctly**

  Run: `cd artifacts/gradefarm && pnpm exec node -e "import('./src/lib/subjects.js').then(m => console.log(m.ALL_SUBJECTS.length))"`

  Expected: prints a number (the total subject count, should be 14 or similar).

- [ ] **Step 4: Commit**

```bash
git add artifacts/gradefarm/src/lib/subjects.js
git commit -m "feat: add writing_y56, writing_y78, writing_y910 subjects"
```

---

## Task 3: Create `writingDb.js`

**Files:**
- Create: `artifacts/gradefarm/src/lib/writingDb.js`

- [ ] **Step 1: Create the file with the following content**

```js
import { supabase } from './supabase'

export async function saveWritingAttempt(userId, {
  subject, essayType, mode, prompt, imageUrl,
  content, feedback, timed, durationSeconds, actualSeconds,
}) {
  const { data, error } = await supabase
    .from('writing_attempts')
    .insert({
      user_id: userId,
      subject,
      essay_type: essayType,
      mode,
      prompt,
      image_url: imageUrl || null,
      content,
      feedback: feedback || null,
      timed,
      duration_seconds: durationSeconds || null,
      actual_seconds: actualSeconds || null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateWritingAttemptFeedback(attemptId, feedback) {
  const { error } = await supabase
    .from('writing_attempts')
    .update({ feedback })
    .eq('id', attemptId)
  if (error) throw error
}

export async function getWritingAttempts(userId, subject) {
  const { data, error } = await supabase
    .from('writing_attempts')
    .select('id, essay_type, mode, prompt, image_url, created_at, feedback')
    .eq('user_id', userId)
    .eq('subject', subject)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data || []
}
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/gradefarm/src/lib/writingDb.js
git commit -m "feat: add writingDb.js for saving and loading writing attempts"
```

---

## Task 4: Create the Writing API Route

**Files:**
- Create: `artifacts/api-server/src/routes/writing.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

- [ ] **Step 1: Create `artifacts/api-server/src/routes/writing.ts`**

```typescript
import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

const YEAR_RANGES: Record<string, string> = {
  writing_y56: "Year 5–6 (ages 10–12)",
  writing_y78: "Year 7–8 (ages 12–14)",
  writing_y910: "Year 9–10 (ages 14–16)",
};

function getBaseUrl(): string {
  return process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
}

function getApiKey(): string {
  return process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
}

async function callClaude(system: string, user: string, maxTokens = 1000): Promise<string> {
  const res = await fetch(`${getBaseUrl()}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error: ${text.slice(0, 200)}`);
  }
  const data = await res.json() as { content?: { text: string }[] };
  return data?.content?.[0]?.text || "";
}

function extractJson(text: string): unknown {
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

// POST /api/writing/prompt
router.post("/writing/prompt", async (req, res) => {
  const { subject, essayType } = req.body || {};
  if (!subject || !essayType) {
    res.status(400).json({ error: "subject and essayType required" });
    return;
  }

  const yearRange = YEAR_RANGES[subject] || "secondary school";
  let rawText: string;

  try {
    if (essayType === "narrative") {
      const system = [
        `You are generating creative writing prompts for ${yearRange} students.`,
        "Return ONLY a valid JSON object with these keys:",
        "  prompt: string (2–4 sentences setting a compelling scenario for a narrative essay)",
        "  imageQuery: string (optional — a short evocative phrase suitable for Unsplash, e.g. 'misty forest path at dawn'; include this key roughly 60% of the time, omit entirely the other 40%)",
        "No markdown, no commentary outside the JSON.",
      ].join("\n");
      rawText = await callClaude(system, "Generate a narrative writing prompt.");
    } else {
      const system = [
        `You are generating persuasive writing prompts for ${yearRange} students.`,
        "Return ONLY a valid JSON object with a single key:",
        "  prompt: string (1–2 sentences stating a clear, debatable position for the student to argue for or against)",
        "No markdown, no commentary outside the JSON.",
      ].join("\n");
      rawText = await callClaude(system, "Generate a persuasive writing prompt.");
    }
  } catch (err) {
    logger.error({ err }, "Failed to generate writing prompt");
    res.status(500).json({ error: "Failed to reach Claude API" });
    return;
  }

  const parsed = extractJson(rawText) as { prompt?: string; imageQuery?: string } | null;
  if (!parsed?.prompt) {
    res.status(500).json({ error: "Could not parse prompt from AI response" });
    return;
  }

  let imageUrl: string | undefined;
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  if (essayType === "narrative" && parsed.imageQuery && unsplashKey) {
    try {
      const query = encodeURIComponent(parsed.imageQuery);
      const imgRes = await fetch(
        `https://api.unsplash.com/photos/random?query=${query}&orientation=landscape`,
        { headers: { Authorization: `Client-ID ${unsplashKey}` } }
      );
      if (imgRes.ok) {
        const imgData = await imgRes.json() as { urls?: { regular?: string } };
        imageUrl = imgData?.urls?.regular;
      }
    } catch {
      // image is optional — proceed without it
    }
  }

  res.json({ prompt: parsed.prompt, imageUrl });
});

// POST /api/writing/feedback
router.post("/writing/feedback", async (req, res) => {
  const { subject, essayType, mode, prompt, imageUrl, content } = req.body || {};
  if (!subject || !essayType || !prompt || content == null) {
    res.status(400).json({ error: "subject, essayType, prompt, content required" });
    return;
  }

  const yearRange = YEAR_RANGES[subject] || "secondary school";
  const contentText =
    typeof content === "string"
      ? content
      : Object.entries(content as Record<string, string>)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n\n");

  const system = [
    `You are a scholarship and select-entry assessor marking a ${essayType} essay from a ${yearRange} student.`,
    "Return ONLY a valid JSON object with these exact keys:",
    "  overallImpression: string (2–4 sentences on overall quality, written in the tone of a real assessor)",
    "  annotations: array of objects — each must have: aspect (string), comment (string), and optionally quote (string — a short verbatim excerpt from the student's writing that the comment refers to)",
    "  improvements: array of strings (3–5 specific, actionable suggestions for the student)",
    "Be honest, specific, and constructive. Reference the student's actual writing when possible.",
    "No markdown, no commentary outside the JSON.",
  ].join("\n");

  const imageNote = imageUrl ? `\n\nThe student was also shown a visual image prompt.` : "";
  const userMsg = [
    `Essay type: ${essayType}`,
    `Writing prompt given to the student: ${prompt}${imageNote}`,
    "",
    mode === "prompt_planner" ? "Student's planning notes:" : "Student's essay:",
    contentText,
  ].join("\n");

  let rawText: string;
  try {
    rawText = await callClaude(system, userMsg, 2000);
  } catch (err) {
    logger.error({ err }, "Failed to generate writing feedback");
    res.status(500).json({ error: "Failed to reach Claude API" });
    return;
  }

  const parsed = extractJson(rawText) as {
    overallImpression?: string;
    annotations?: unknown[];
    improvements?: unknown[];
  } | null;

  if (!parsed?.overallImpression) {
    res.status(500).json({ error: "Could not parse feedback from AI response" });
    return;
  }

  res.json(parsed);
});

export default router;
```

- [ ] **Step 2: Register the route in `artifacts/api-server/src/routes/index.ts`**

  Add import and `router.use` call. The full updated file:

```typescript
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import generateQuestionsRouter from "./generate-questions";
import extractPdfRouter from "./extract-pdf";
import tutorRouter from "./tutor";
import adminRouter from "./admin";
import curriculumRouter from "./curriculum";
import writingRouter from "./writing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(generateQuestionsRouter);
router.use(extractPdfRouter);
router.use(tutorRouter);
router.use(adminRouter);
router.use(curriculumRouter);
router.use(writingRouter);

export default router;
```

- [ ] **Step 3: Typecheck the API server**

  Run: `cd artifacts/api-server && pnpm exec tsc --noEmit`

  Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/writing.ts artifacts/api-server/src/routes/index.ts
git commit -m "feat: add /api/writing/prompt and /api/writing/feedback routes"
```

---

## Task 5: Create `WritingScreen.jsx`

**Files:**
- Create: `artifacts/gradefarm/src/components/WritingScreen.jsx`

- [ ] **Step 1: Create the file with the following content**

```jsx
import { useState, useEffect, useRef } from 'react'
import { saveWritingAttempt, updateWritingAttemptFeedback, getWritingAttempts } from '../lib/writingDb'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const TEAL   = '#14b8a6'

const NARRATIVE_FIELDS = [
  { key: 'context',        label: 'Context / Scene' },
  { key: 'rising_action',  label: 'Rising Action' },
  { key: 'climax',         label: 'Climax' },
  { key: 'falling_action', label: 'Falling Action' },
  { key: 'resolution',     label: 'Resolution' },
  { key: 'character',      label: 'Character Development' },
]

const PERSUASIVE_FIELDS = [
  { key: 'contention',        label: 'Contention' },
  { key: 'argument1',         label: 'Argument 1' },
  { key: 'argument2',         label: 'Argument 2' },
  { key: 'important_points',  label: 'Important Points to Include' },
]

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function WritingScreen({ subject, profile, onBack }) {
  const [stage,           setStage]           = useState('setup')
  const [essayType,       setEssayType]       = useState('narrative')
  const [mode,            setMode]            = useState('full_essay')

  // Full essay timer
  const [essayTimed,      setEssayTimed]      = useState(false)
  const [essayMinutes,    setEssayMinutes]    = useState(40)

  // Planner timer (default: timed, 2 min)
  const [plannerTimed,    setPlannerTimed]    = useState(true)
  const [plannerMinutes,  setPlannerMinutes]  = useState(2)

  const [prompt,          setPrompt]          = useState('')
  const [imageUrl,        setImageUrl]        = useState(null)
  const [loadingPrompt,   setLoadingPrompt]   = useState(false)
  const [promptError,     setPromptError]     = useState(null)

  const [essayText,       setEssayText]       = useState('')
  const [plannerFields,   setPlannerFields]   = useState({})

  const [secondsLeft,     setSecondsLeft]     = useState(null)
  const [startTime,       setStartTime]       = useState(null)
  const timerRef = useRef(null)

  const [loadingFeedback, setLoadingFeedback] = useState(false)
  const [feedback,        setFeedback]        = useState(null)
  const [feedbackError,   setFeedbackError]   = useState(null)
  const [attemptId,       setAttemptId]       = useState(null)

  const [showPast,        setShowPast]        = useState(false)
  const [pastAttempts,    setPastAttempts]    = useState([])
  const [loadingPast,     setLoadingPast]     = useState(false)
  const [selectedPast,    setSelectedPast]    = useState(null)

  const timed   = mode === 'full_essay' ? essayTimed   : plannerTimed
  const minutes = mode === 'full_essay' ? essayMinutes : plannerMinutes

  // Start timer when entering writing stage
  useEffect(() => {
    if (stage !== 'writing') return
    if (!timed) return
    const secs = minutes * 60
    setSecondsLeft(secs)
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { clearInterval(timerRef.current); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [stage])

  const handleGeneratePrompt = async () => {
    setLoadingPrompt(true)
    setPromptError(null)
    try {
      const res = await fetch('/api/writing/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.id, essayType }),
      })
      if (!res.ok) throw new Error('Failed to generate prompt')
      const data = await res.json()
      setPrompt(data.prompt)
      setImageUrl(data.imageUrl || null)
      setStage('prompt')
    } catch (err) {
      setPromptError(err.message)
    } finally {
      setLoadingPrompt(false)
    }
  }

  const handleStartWriting = () => {
    setEssayText('')
    setPlannerFields({})
    setStartTime(Date.now())
    setStage('writing')
  }

  const handleSubmit = async () => {
    clearInterval(timerRef.current)
    const actualSeconds = startTime ? Math.floor((Date.now() - startTime) / 1000) : null
    const content = mode === 'full_essay' ? essayText : plannerFields

    setLoadingFeedback(true)
    setFeedback(null)
    setFeedbackError(null)
    setAttemptId(null)
    setStage('feedback')

    // Save attempt without feedback first
    let savedId = null
    try {
      savedId = await saveWritingAttempt(profile.id, {
        subject: subject.id,
        essayType,
        mode,
        prompt,
        imageUrl,
        content,
        feedback: null,
        timed,
        durationSeconds: timed ? minutes * 60 : null,
        actualSeconds,
      })
      setAttemptId(savedId)
    } catch {}

    // Fetch feedback
    try {
      const res = await fetch('/api/writing/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.id, essayType, mode, prompt, imageUrl, content }),
      })
      if (!res.ok) throw new Error('Failed to get feedback')
      const fb = await res.json()
      setFeedback(fb)
      if (savedId) {
        try { await updateWritingAttemptFeedback(savedId, fb) } catch {}
      }
    } catch (err) {
      setFeedbackError(err.message)
    } finally {
      setLoadingFeedback(false)
    }
  }

  const handleTryAgain = () => {
    clearInterval(timerRef.current)
    setStage('setup')
    setPrompt('')
    setImageUrl(null)
    setFeedback(null)
    setFeedbackError(null)
    setEssayText('')
    setPlannerFields({})
    setSecondsLeft(null)
    setStartTime(null)
    setAttemptId(null)
  }

  const handleShowPast = async () => {
    setLoadingPast(true)
    setShowPast(true)
    setSelectedPast(null)
    try {
      const attempts = await getWritingAttempts(profile.id, subject.id)
      setPastAttempts(attempts)
    } catch {}
    setLoadingPast(false)
  }

  // ── Shared styles ────────────────────────────────────────────────────────────
  const container = {
    maxWidth: 780, margin: '0 auto', padding: '32px 24px',
    fontFamily: FONT_B, color: '#f1f5f9',
  }
  const label = {
    display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8,
  }
  const toggleBtn = (active) => ({
    padding: '9px 20px', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${active ? TEAL : 'rgba(255,255,255,0.12)'}`,
    background: active ? 'rgba(20,184,166,0.12)' : 'transparent',
    color: active ? TEAL : 'rgba(255,255,255,0.5)',
    fontSize: 13, fontWeight: 700, fontFamily: FONT_B,
  })
  const primaryBtn = (disabled = false) => ({
    padding: '12px 28px', borderRadius: 10, border: 'none',
    background: disabled ? 'rgba(255,255,255,0.08)' : TEAL,
    color: disabled ? 'rgba(255,255,255,0.3)' : '#fff',
    fontSize: 14, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: FONT_B,
  })
  const ghostBtn = {
    padding: '10px 20px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'transparent', color: 'rgba(255,255,255,0.5)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B,
  }
  const textarea = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: '#0c1037', color: '#f1f5f9',
    fontSize: 14, fontFamily: FONT_B, resize: 'vertical',
    outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
  }
  const promptPanel = {
    marginBottom: 24, borderRadius: 12,
    border: '1px solid rgba(20,184,166,0.25)',
    background: 'rgba(20,184,166,0.06)', overflow: 'hidden',
  }

  // ── Stage: Setup ─────────────────────────────────────────────────────────────
  if (stage === 'setup') return (
    <div style={container}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{ ...ghostBtn, padding: '6px 12px', fontSize: 12 }}>← Back</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{subject.icon} {subject.name} · {subject.stage}</h2>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>English Writing Practice</div>
        </div>
      </div>

      {/* Essay type */}
      <div style={{ marginBottom: 20 }}>
        <span style={label}>Essay Type</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={toggleBtn(essayType === 'narrative')} onClick={() => setEssayType('narrative')}>Narrative</button>
          <button style={toggleBtn(essayType === 'persuasive')} onClick={() => setEssayType('persuasive')}>Persuasive</button>
        </div>
      </div>

      {/* Mode */}
      <div style={{ marginBottom: 20 }}>
        <span style={label}>Mode</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={toggleBtn(mode === 'full_essay')} onClick={() => setMode('full_essay')}>Full Essay</button>
          <button style={toggleBtn(mode === 'prompt_planner')} onClick={() => setMode('prompt_planner')}>Prompt Planner</button>
        </div>
      </div>

      {/* Timer — Full Essay */}
      {mode === 'full_essay' && (
        <div style={{ marginBottom: 20 }}>
          <span style={label}>Timer</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={toggleBtn(essayTimed)} onClick={() => setEssayTimed(t => !t)}>
              {essayTimed ? '⏱ Timed' : 'Untimed'}
            </button>
            {essayTimed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={essayMinutes}
                  onChange={e => setEssayMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ width: 64, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: '#0c1037', color: '#fff', fontSize: 14, fontFamily: FONT_B, outline: 'none', textAlign: 'center' }}
                />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>minutes</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timer — Planner */}
      {mode === 'prompt_planner' && (
        <div style={{ marginBottom: 20 }}>
          <span style={label}>Planning Timer</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={toggleBtn(plannerTimed)} onClick={() => setPlannerTimed(t => !t)}>
              {plannerTimed ? '⏱ Timed' : 'Untimed'}
            </button>
            {plannerTimed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={plannerMinutes}
                  onChange={e => setPlannerMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ width: 64, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: '#0c1037', color: '#fff', fontSize: 14, fontFamily: FONT_B, outline: 'none', textAlign: 'center' }}
                />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>min <span style={{ color: 'rgba(255,255,255,0.3)' }}>(recommended: 2)</span></span>
              </div>
            )}
          </div>
        </div>
      )}

      {promptError && (
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13 }}>
          {promptError}
        </div>
      )}

      <button
        onClick={handleGeneratePrompt}
        disabled={loadingPrompt}
        style={primaryBtn(loadingPrompt)}
      >
        {loadingPrompt ? 'Generating prompt…' : 'Generate Prompt'}
      </button>

      {/* Past attempts */}
      <div style={{ marginTop: 32, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 20 }}>
        {!showPast ? (
          <button onClick={handleShowPast} style={{ ...ghostBtn, fontSize: 12 }}>View Past Attempts</button>
        ) : loadingPast ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
        ) : pastAttempts.length === 0 ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No past attempts yet.</div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Past Attempts</div>
            {pastAttempts.map(a => (
              <div
                key={a.id}
                onClick={() => setSelectedPast(selectedPast?.id === a.id ? null : a)}
                style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', marginBottom: 8, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', textTransform: 'capitalize' }}>{a.essay_type} · {a.mode.replace('_', ' ')}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{new Date(a.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.prompt}</div>
                {selectedPast?.id === a.id && a.feedback && (
                  <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.18)' }}>
                    <div style={{ fontSize: 12, color: TEAL, fontWeight: 700, marginBottom: 6 }}>Overall Impression</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{a.feedback.overallImpression}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // ── Stage: Prompt ─────────────────────────────────────────────────────────────
  if (stage === 'prompt') return (
    <div style={container}>
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setStage('setup')} style={{ ...ghostBtn, padding: '6px 12px', fontSize: 12 }}>← Back to Setup</button>
      </div>

      <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800 }}>Your Writing Prompt</h2>

      <div style={promptPanel}>
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Writing prompt"
            style={{ width: '100%', maxHeight: 280, objectFit: 'cover', display: 'block' }}
          />
        )}
        <div style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 11, color: TEAL, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            {essayType === 'narrative' ? 'Narrative Prompt' : 'Persuasive Prompt'}
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.7, color: '#f1f5f9' }}>{prompt}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={handleStartWriting} style={primaryBtn()}>Start Writing</button>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
          {mode === 'full_essay'
            ? (essayTimed ? `Timer: ${essayMinutes} min` : 'Untimed')
            : (plannerTimed ? `Planning timer: ${plannerMinutes} min` : 'Untimed')}
        </div>
      </div>
    </div>
  )

  // ── Stage: Writing ────────────────────────────────────────────────────────────
  if (stage === 'writing') {
    const fields = essayType === 'narrative' ? NARRATIVE_FIELDS : PERSUASIVE_FIELDS
    const timerColor = secondsLeft !== null && secondsLeft < 60 ? '#ef4444' : TEAL

    return (
      <div style={container}>
        {/* Header bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEAL, textTransform: 'capitalize' }}>
            {essayType} · {mode.replace('_', ' ')}
          </div>
          {timed && secondsLeft !== null && (
            <div style={{ fontSize: 16, fontWeight: 800, color: timerColor, fontVariantNumeric: 'tabular-nums' }}>
              ⏱ {formatTime(secondsLeft)}
            </div>
          )}
        </div>

        {/* Prompt panel — always visible during writing */}
        <div style={{ ...promptPanel, marginBottom: 20 }}>
          {imageUrl && (
            <img src={imageUrl} alt="" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }} />
          )}
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: TEAL, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Prompt</div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.8)' }}>{prompt}</div>
          </div>
        </div>

        {/* Writing area */}
        {mode === 'full_essay' ? (
          <div style={{ marginBottom: 20 }}>
            <span style={label}>Your Essay</span>
            <textarea
              value={essayText}
              onChange={e => setEssayText(e.target.value)}
              rows={18}
              placeholder="Start writing here…"
              style={textarea}
              autoFocus
            />
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            {fields.map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <span style={label}>{f.label}</span>
                <textarea
                  value={plannerFields[f.key] || ''}
                  onChange={e => setPlannerFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                  rows={3}
                  placeholder={`${f.label}…`}
                  style={textarea}
                />
              </div>
            ))}
          </div>
        )}

        <button onClick={handleSubmit} style={primaryBtn()}>Submit & Get Feedback</button>
      </div>
    )
  }

  // ── Stage: Feedback ───────────────────────────────────────────────────────────
  if (stage === 'feedback') return (
    <div style={container}>
      <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 800 }}>Feedback</h2>

      {loadingFeedback && (
        <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
          Assessing your writing…
        </div>
      )}

      {feedbackError && (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13, marginBottom: 20 }}>
          Could not load feedback: {feedbackError}
        </div>
      )}

      {feedback && (
        <div>
          {/* Overall impression */}
          <div style={{ padding: '18px 20px', borderRadius: 12, background: 'rgba(20,184,166,0.07)', border: '1px solid rgba(20,184,166,0.25)', marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: TEAL, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Overall Impression</div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: '#f1f5f9' }}>{feedback.overallImpression}</div>
          </div>

          {/* Annotations */}
          {Array.isArray(feedback.annotations) && feedback.annotations.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Specific Feedback</div>
              {feedback.annotations.map((a, i) => (
                <div key={i} style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: TEAL, marginBottom: 4 }}>{a.aspect}</div>
                  {a.quote && (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', borderLeft: `2px solid rgba(20,184,166,0.4)`, paddingLeft: 10, marginBottom: 8 }}>
                      "{a.quote}"
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>{a.comment}</div>
                </div>
              ))}
            </div>
          )}

          {/* Improvements */}
          {Array.isArray(feedback.improvements) && feedback.improvements.length > 0 && (
            <div style={{ padding: '16px 18px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>What to Improve Next Time</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {feedback.improvements.map((imp, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>{imp}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button onClick={handleTryAgain} style={primaryBtn()}>Try Again</button>
        <button onClick={onBack} style={ghostBtn}>Change Subject</button>
      </div>
    </div>
  )

  return null
}
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/gradefarm/src/components/WritingScreen.jsx
git commit -m "feat: add WritingScreen component (4-stage writing flow)"
```

---

## Task 6: Wire `App.jsx`

**Files:**
- Modify: `artifacts/gradefarm/src/App.jsx`

- [ ] **Step 1: Add the WritingScreen import at the top of `App.jsx` (after line 28, alongside the other screen imports)**

  Add this line after the `TutorScreen` import (currently line 28):

```js
import WritingScreen from './components/WritingScreen'
```

- [ ] **Step 2: Bypass the subscription lock check for writing subjects**

  In `App.jsx`, find the `/*` catch-all route element (around line 848). The current subscription lock condition is:

```js
(subscriptionsLoaded && subscriptions.length > 0 && !subscriptions.some(s => s.subject_name === selectedSubject?.name && s.stage === selectedSubject?.stage)) ? <LockedSubjectScreen subject={selectedSubject} onChangeSubject={shellProps.onChangeSubject} theme={theme} /> :
```

  Replace it with (adds `&& selectedSubject?.type !== 'writing'` before the `.some()` check):

```js
(subscriptionsLoaded && subscriptions.length > 0 && selectedSubject?.type !== 'writing' && !subscriptions.some(s => s.subject_name === selectedSubject?.name && s.stage === selectedSubject?.stage)) ? <LockedSubjectScreen subject={selectedSubject} onChangeSubject={shellProps.onChangeSubject} theme={theme} /> :
```

- [ ] **Step 3: Add WritingScreen routing before the `<AppShellScreens />` render**

  In the same `/*` catch-all, find the final line that renders `<AppShellScreens ...>`. Add the writing branch immediately before it:

  Current (last line of the ternary):
```jsx
<AppShellScreens {...shellProps} {...learnState}
```

  Replace with:
```jsx
selectedSubject?.type === 'writing' ?
  <AppShell {...shellProps}>
    <WritingScreen subject={selectedSubject} profile={profile} theme={theme} onBack={handleChangeSubject} />
  </AppShell> :
<AppShellScreens {...shellProps} {...learnState}
```

- [ ] **Step 4: Verify the file still builds**

  Run: `cd artifacts/gradefarm && pnpm exec tsc --noEmit`

  Expected: no type errors (the project is JSX, so TSC may be configured for `allowJs` — if the command isn't valid, run `pnpm run build` instead and check for errors).

  Alternative: `cd artifacts/gradefarm && pnpm run build 2>&1 | tail -20`

  Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add artifacts/gradefarm/src/App.jsx
git commit -m "feat: route writing subjects to WritingScreen in App.jsx"
```

---

## Task 7: Add `UNSPLASH_ACCESS_KEY` to Vercel Environment

**Files:**
- No code files — environment variable configuration in Vercel dashboard

- [ ] **Step 1: Sign up or log in to Unsplash Developers and create an app**

  Go to https://unsplash.com/developers → "Your apps" → "New Application". Copy the **Access Key**.

- [ ] **Step 2: Add the environment variable to Vercel**

  In the Vercel dashboard → your project → Settings → Environment Variables:
  - Name: `UNSPLASH_ACCESS_KEY`
  - Value: your Unsplash Access Key
  - Environment: Production (and Preview)

- [ ] **Step 3: Redeploy**

  Trigger a new deployment (push any commit or click "Redeploy" in Vercel). Narrative prompts will now fetch real images. If the key is absent, prompts still work — images are silently skipped.

---

## Verification Checklist

After all tasks are complete:

- [ ] Writing subjects appear in SubjectPicker (Year 5–6, Year 7–8, Year 9–10)
- [ ] Selecting a writing subject opens WritingScreen (not HomeScreen)
- [ ] Setup stage: essay type, mode, and timer controls all work
- [ ] "Generate Prompt" returns a prompt; narrative prompts occasionally show an Unsplash image
- [ ] Prompt (and image) remain visible during writing stage
- [ ] Full Essay mode: single textarea, timer counts down if timed
- [ ] Prompt Planner mode: correct fields for Narrative (6) and Persuasive (4)
- [ ] Submit → feedback loads with overallImpression, annotations, improvements
- [ ] Attempt is saved to `writing_attempts` table in Supabase
- [ ] Past Attempts list loads on Setup stage
- [ ] "Try Again" resets to Setup; "Change Subject" goes back to SubjectPicker
- [ ] Existing MCQ subjects are unaffected
