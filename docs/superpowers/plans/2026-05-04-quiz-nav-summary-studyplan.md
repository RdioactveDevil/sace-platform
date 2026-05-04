# Quiz Nav Guard, Session Summary & Study Plan To-Do Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add navigation guard for active quiz sessions, AI coaching tip + Study Plan link in session summary, and a generated to-do task list in Study Plan.

**Architecture:** `finished` is lifted to App.jsx so the router-level `useBlocker` can see it; session tip and to-do list each make one `/api/chat` call; to-do list persists to `localStorage` and auto-regenerates after each completed session.

**Tech Stack:** React 18, React Router v7 (`useBlocker`), `/api/chat` Vercel serverless proxy to Claude, `localStorage`

---

### Task 1: Lift `finished` state from QuizScreen to App.jsx

**Files:**
- Modify: `artifacts/gradefarm/src/App.jsx`
- Modify: `artifacts/gradefarm/src/components/QuizScreen.jsx`

- [ ] **Step 1: Add `quizFinished` state and add to `quizState` in App.jsx**

In `App.jsx`, after `const [activeAssignmentId, setActiveAssignmentId] = useState(null)` (line ~442), add:
```jsx
const [quizFinished, setQuizFinished] = useState(false)
```

In the `quizState` object (line ~583), add after `remediationWrongCount`:
```jsx
finished: quizFinished, setFinished: setQuizFinished,
```

- [ ] **Step 2: Reset `quizFinished` in session-clearing code**

In `handleSignOut` (line ~521), add after `setQuizMode('new')`:
```jsx
setQuizFinished(false)
```

In `handleChangeSubject` (line ~552), add after `setQuizMode('new')`:
```jsx
setQuizFinished(false)
```

In `onStartSession` (line ~794), add after `setConsolidateSubtopic(null)`:
```jsx
setQuizFinished(false)
```

- [ ] **Step 3: Remove local `finished` state from QuizScreen and receive from props**

In `QuizScreen.jsx`, in the prop destructuring (line ~277), add after `onBankQuestionsAdded,`:
```jsx
finished: _finished, setFinished,
```

Remove line 313-314:
```jsx
const [finished, setFinished] = useState(false)
```

After the existing destructured state defaults (around line 364), add:
```jsx
const finished = _finished ?? false
```

- [ ] **Step 4: Verify no remaining local `finished` references**

Run:
```bash
grep -n "useState(false)" artifacts/gradefarm/src/components/QuizScreen.jsx
```
Expected: only `generatingMore` and `showExit` useState(false) remain (no `finished`).

- [ ] **Step 5: Commit**

```bash
git add artifacts/gradefarm/src/App.jsx artifacts/gradefarm/src/components/QuizScreen.jsx
git commit -m "feat: lift quiz finished state to App.jsx for router-level access"
```

---

### Task 2: Add navigation blocker for active quiz sessions

**Files:**
- Modify: `artifacts/gradefarm/src/App.jsx`

- [ ] **Step 1: Import `useBlocker` and `useLocation` in App.jsx**

Change line 2:
```jsx
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
```
to:
```jsx
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useBlocker } from 'react-router-dom'
```

- [ ] **Step 2: Add `NavBlockerModal` component above `AppInner`**

After `AppShellScreens` and before `AppInner` (around line 379), insert:
```jsx
function NavBlockerModal({ blocker, theme }) {
  const t = THEMES[theme]
  if (blocker.state !== 'blocked') return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(8px)' }}>
      <div style={{ background: t?.bgCard || '#0c1037', border: `1px solid rgba(241,190,67,0.3)`, borderRadius: 20, padding: '36px 32px', maxWidth: 360, width: '90%', textAlign: 'center', fontFamily: FONT_B }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>⚠️</div>
        <div style={{ fontFamily: FONT_D, fontSize: 20, color: t?.text || '#f1f5f9', marginBottom: 8, letterSpacing: 0.5 }}>LEAVE QUIZ?</div>
        <div style={{ fontSize: 14, color: t?.textMuted || '#94a3b8', marginBottom: 28, lineHeight: 1.65 }}>
          Your session progress will be lost if you navigate away now.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => blocker.reset()}
            style={{ flex: 1, padding: '13px', borderRadius: 11, border: `1px solid rgba(255,255,255,0.1)`, background: 'rgba(255,255,255,0.05)', color: t?.textMuted || '#94a3b8', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}
          >
            Stay in Quiz
          </button>
          <button
            onClick={() => blocker.proceed()}
            style={{ flex: 1, padding: '13px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}
          >
            Leave Anyway
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add `useLocation` and `useBlocker` calls in `AppInner`**

In `AppInner` (line ~380), after `const navigate = useNavigate()` add:
```jsx
const location = useLocation()
```

After the quizState object definition (around line 609), add:
```jsx
const quizIsActive = location.pathname === '/quiz' && quizAnswered.length > 0 && !quizFinished
const blocker = useBlocker(
  ({ currentLocation, nextLocation }) =>
    quizIsActive &&
    currentLocation.pathname === '/quiz' &&
    nextLocation.pathname !== '/quiz'
)
```

- [ ] **Step 4: Render `NavBlockerModal` in AppInner's return**

In `AppInner`'s return, wrap the existing `<>` block:
```jsx
return (
  <>
    <NavBlockerModal blocker={blocker} theme={theme} />
    <Routes>
      {/* ... existing routes unchanged ... */}
    </Routes>
  </>
)
```

- [ ] **Step 5: Start dev server and test**

```bash
cd artifacts/gradefarm && npm run dev
```

1. Start a quiz, answer one question.
2. Click "Study Plan" in sidebar — modal should appear with "Stay in Quiz" / "Leave Anyway".
3. Click "Stay in Quiz" — stays on quiz. Click another nav item, then "Leave Anyway" — navigates away.
4. Start quiz but answer zero questions — navigating away should NOT trigger the modal.
5. Finish the quiz — navigating away should NOT trigger the modal.

- [ ] **Step 6: Commit**

```bash
git add artifacts/gradefarm/src/App.jsx
git commit -m "feat: add useBlocker nav guard for active quiz sessions"
```

---

### Task 3: Add session coaching tip and "Go to Study Plan" button to session summary

**Files:**
- Modify: `artifacts/gradefarm/src/App.jsx`
- Modify: `artifacts/gradefarm/src/components/QuizScreen.jsx`

- [ ] **Step 1: Add session tip state to App.jsx**

After `const [quizFinished, setQuizFinished] = useState(false)`, add:
```jsx
const [quizSessionTip, setQuizSessionTip] = useState('')
const [quizSessionTipLoading, setQuizSessionTipLoading] = useState(false)
```

In the `quizState` object, add after `finished`/`setFinished`:
```jsx
sessionTip: quizSessionTip, setSessionTip: setQuizSessionTip,
sessionTipLoading: quizSessionTipLoading, setSessionTipLoading: setQuizSessionTipLoading,
```

- [ ] **Step 2: Reset session tip in session-clearing code**

In `handleSignOut`, `handleChangeSubject`, and `onStartSession`, add:
```jsx
setQuizSessionTip('')
setQuizSessionTipLoading(false)
```

- [ ] **Step 3: Pass `onGoToStudyPlan` to QuizScreen in App.jsx**

In the `/quiz` route's `<QuizScreen>` element (line ~735), add prop:
```jsx
onGoToStudyPlan={() => navigate('/study-plan')}
```

- [ ] **Step 4: Accept new props in QuizScreen**

In QuizScreen's prop destructuring (line ~277), add after `onBankQuestionsAdded,`:
```jsx
sessionTip: _sessionTip, setSessionTip,
sessionTipLoading: _sessionTipLoading, setSessionTipLoading,
onGoToStudyPlan,
```

After the `const finished = _finished ?? false` line, add:
```jsx
const sessionTip = _sessionTip ?? ''
const sessionTipLoading = _sessionTipLoading ?? false
```

- [ ] **Step 5: Add session coaching tip fetch in QuizScreen**

After the existing bank-exhaustion `useEffect` on `[finished]` (around line 548), add a NEW `useEffect`:
```jsx
useEffect(() => {
  if (!finished) return
  if (!sessionResults || sessionResults.length === 0) return
  if (sessionTipLoading || sessionTip) return

  const mainResults = sessionResults.filter(r => !r.remediation)
  if (mainResults.length === 0) return

  const sessCorrect = mainResults.filter(r => r.correct).length
  const sessTotal = mainResults.length
  const wrongByTopic = {}
  mainResults.filter(r => !r.correct).forEach(r => {
    if (r.topic) wrongByTopic[r.topic] = (wrongByTopic[r.topic] || 0) + 1
  })
  const subject = questions[0]?.subject || 'this subject'

  setSessionTipLoading(true)
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      max_tokens: 120,
      system: 'You are a supportive SACE tutor. Write exactly ONE sentence of coaching advice based on this student\'s quiz session. Be specific, actionable, and encouraging. No preamble, no markdown.',
      messages: [{
        role: 'user',
        content: `Subject: ${subject}. Questions answered: ${sessTotal}. Correct: ${sessCorrect}. Wrong by topic: ${JSON.stringify(wrongByTopic)}.`,
      }],
    }),
  })
    .then(r => r.json())
    .then(d => setSessionTip(d?.content?.[0]?.text || ''))
    .catch(() => {})
    .finally(() => setSessionTipLoading(false))
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [finished])
```

- [ ] **Step 6: Add coaching tip UI and "Go to Study Plan" button in summary**

In the summary return (inside the `if (finished || ...)` block), after the existing action buttons `<div>` (around line 1085), insert the coaching tip card and CTA button. Find this code in the summary section:
```jsx
{/* Action buttons */}
<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
```

And change it to:
```jsx
{/* AI Coaching Tip */}
{(sessionTipLoading || sessionTip) && (
  <div style={{ background: t.purpleBg, border: `1px solid ${t.purple}33`, borderRadius: 14, padding: '14px 18px', marginBottom: 16 }}>
    <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>AI Coach</div>
    {sessionTipLoading
      ? <div style={{ fontSize: 13, color: t.textFaint, fontStyle: 'italic' }}>Getting your coaching tip…</div>
      : <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.65 }}>🤖 {sessionTip}</div>
    }
  </div>
)}

{/* Action buttons */}
<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
```

Also add the "Go to Study Plan" button inside the action buttons `<div>`, after the existing buttons and before the closing tag:
```jsx
{onGoToStudyPlan && (
  <button onClick={onGoToStudyPlan}
    style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVY, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
    Go to Study Plan →
  </button>
)}
```

- [ ] **Step 7: Test coaching tip and navigation**

With dev server running:
1. Complete a quiz session (answer a few questions).
2. Summary screen should show the coaching tip loading then appearing.
3. Click "Go to Study Plan →" — should navigate to `/study-plan` without triggering the nav blocker (since `finished` is now true).

- [ ] **Step 8: Commit**

```bash
git add artifacts/gradefarm/src/App.jsx artifacts/gradefarm/src/components/QuizScreen.jsx
git commit -m "feat: add session coaching tip and Go to Study Plan button in quiz summary"
```

---

### Task 4: Add to-do list to Study Plan

**Files:**
- Modify: `artifacts/gradefarm/src/App.jsx`
- Modify: `artifacts/gradefarm/src/components/StudyPlanScreen.jsx`

- [ ] **Step 1: Add `lastSessionAt` state to App.jsx and track when quiz finishes**

After `const [quizSessionTipLoading, setQuizSessionTipLoading] = useState(false)`, add:
```jsx
const [lastSessionAt, setLastSessionAt] = useState(null)
```

After the `quizIsActive` and `blocker` lines, add:
```jsx
useEffect(() => {
  if (quizFinished && quizAnswered.length > 0) setLastSessionAt(Date.now())
}, [quizFinished, quizAnswered.length])
```

- [ ] **Step 2: Pass `lastSessionAt` and `onOpenLearn` to StudyPlanScreen**

In `AppShellScreens` props destructuring (line ~316), add:
```jsx
lastSessionAt, onOpenLearn,
```

In the `<StudyPlanScreen>` render inside `AppShellScreens` (line ~366):
```jsx
<StudyPlanScreen
  profile={profile} questions={questions} struggleMap={struggleMap}
  theme={theme} onStartSession={onStartSession} subject={subject}
  lastSessionAt={lastSessionAt} onOpenLearn={onOpenLearn} />
```

In `AppShellScreens` call site in the `/*` route (line ~790), pass new props:
```jsx
<AppShellScreens {...shellProps} {...learnState}
  profile={profile} questions={questions} struggleMap={struggleMap}
  setStruggleMap={setStruggleMap} subject={selectedSubject}
  assignmentsVersion={assignmentsVersion}
  lastSessionAt={lastSessionAt}
  onOpenLearn={(nextTopic) => {
    if (nextTopic) setLearnTopic(nextTopic)
    setLearnPhase('setup')
    navigate('/learn')
  }}
  onStartSession={async (opts) => { /* unchanged */ }}
  quizSubtopics={quizSubtopics} setQuizSubtopics={setQuizSubtopics} />
```

- [ ] **Step 3: Rewrite StudyPlanScreen to add to-do list**

Add imports at the top of `StudyPlanScreen.jsx`:
```jsx
import { useMemo, useState, useEffect, useCallback } from 'react'
```

(replace existing `import { useMemo } from 'react'`)

Add prop signature changes — append to `StudyPlanScreen` function args:
```jsx
export default function StudyPlanScreen({ profile, questions, struggleMap, theme, onStartSession, subject, lastSessionAt, onOpenLearn }) {
```

- [ ] **Step 4: Add to-do list state and helper in StudyPlanScreen**

After `const t = THEMES[theme]` and `const y7Config = ...`, add:

```jsx
const todoKey = profile?.id ? `gradefarm_todo_${profile.id}` : null

const [todoList, setTodoList] = useState(() => {
  if (!todoKey) return []
  try { return JSON.parse(localStorage.getItem(todoKey)) || [] } catch { return [] }
})
const [todoGenerating, setTodoGenerating] = useState(false)

const saveTodo = useCallback((list) => {
  setTodoList(list)
  if (todoKey) localStorage.setItem(todoKey, JSON.stringify(list))
}, [todoKey])

const generateTodoList = useCallback(async () => {
  if (todoGenerating) return
  setTodoGenerating(true)
  try {
    const weakTopics = topicStats
      .filter(ts => ts.attempts > 0)
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 8)
      .map(ts => ({ topic: ts.topic, mastery: ts.mastery, attempts: ts.attempts }))
    const subjectName = subject?.name || 'this subject'

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        max_tokens: 600,
        system: [
          'You are a study coach. Generate a JSON array of 5-8 study tasks for a student.',
          'Each task: { "topic": string, "action": "practice"|"revise", "estimatedMinutes": number }.',
          '"practice" means quiz-based drill. "revise" means concept study with AI.',
          'Weight toward low-mastery topics. Mix practice and revise.',
          'Return ONLY the JSON array, no markdown, no explanation.',
        ].join(' '),
        messages: [{
          role: 'user',
          content: `Subject: ${subjectName}. Topic mastery: ${JSON.stringify(weakTopics)}`,
        }],
      }),
    })
    const d = await res.json()
    const raw = d?.content?.[0]?.text || '[]'
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    const parsed = JSON.parse(start !== -1 && end > start ? raw.slice(start, end + 1) : '[]')
    const list = parsed.map(item => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      topic: item.topic || '',
      subject: subjectName,
      action: item.action === 'revise' ? 'revise' : 'practice',
      estimatedMinutes: typeof item.estimatedMinutes === 'number' ? item.estimatedMinutes : 15,
      done: false,
    }))
    saveTodo(list)
  } catch {}
  setTodoGenerating(false)
}, [topicStats, subject, todoGenerating, saveTodo])
```

Note: `generateTodoList` references `topicStats` which is defined via `useMemo` above — make sure `topicStats` is defined before this code block.

- [ ] **Step 5: Auto-refresh to-do list when a session ends**

After the `generateTodoList` definition, add:
```jsx
const lastSessionAtRef = useRef(null)
useEffect(() => {
  if (!lastSessionAt) return
  if (lastSessionAt === lastSessionAtRef.current) return
  lastSessionAtRef.current = lastSessionAt
  if (todoList.length === 0) return
  generateTodoList()
}, [lastSessionAt])
```

Add `useRef` to the import (update the import line at the top):
```jsx
import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
```

- [ ] **Step 6: Add to-do list UI in StudyPlanScreen**

In the JSX, add a new section BEFORE `{/* Today's Focus */}` and AFTER the hasActivity check. Find this in the JSX:
```jsx
{!hasActivity ? (
```

After the closing `</>` of the `hasActivity` block (before the outer `</div>`), the structure is:
```jsx
{!hasActivity ? (...) : (<>...</>)}
```

Inside the `<>...</>` (the `hasActivity` truthy branch), add a new "To-Do List" section at the TOP, before the `{/* Today's Focus */}` section:
```jsx
{/* To-Do List */}
<section style={{ marginBottom: 28 }}>
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: t.textSub, letterSpacing: '0.1em', textTransform: 'uppercase' }}>To-Do List</div>
    <button
      onClick={generateTodoList}
      disabled={todoGenerating}
      style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid rgba(241,190,67,0.3)`, background: todoGenerating ? 'transparent' : 'rgba(241,190,67,0.08)', color: GOLD, fontSize: 12, fontWeight: 700, cursor: todoGenerating ? 'default' : 'pointer', fontFamily: FONT_B, opacity: todoGenerating ? 0.6 : 1 }}
    >
      {todoGenerating ? 'Generating…' : todoList.length > 0 ? '↺ Regenerate' : '✦ Generate To-Do List'}
    </button>
  </div>

  {todoList.length === 0 && !todoGenerating && (
    <div style={{ padding: '20px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: t.textMuted }}>Click "Generate To-Do List" to get personalised study tasks based on your performance.</div>
    </div>
  )}

  {todoGenerating && todoList.length === 0 && (
    <div style={{ padding: '20px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: t.textFaint, fontStyle: 'italic' }}>Analysing your performance…</div>
    </div>
  )}

  {todoList.length > 0 && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {todoList.map(task => (
        <div key={task.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', background: t.bgCard,
          border: `1px solid ${task.done ? t.border : t.border}`,
          borderRadius: 12, opacity: task.done ? 0.55 : 1,
        }}>
          <input
            type="checkbox"
            checked={task.done}
            onChange={() => {
              const updated = todoList.map(t2 => t2.id === task.id ? { ...t2, done: !t2.done } : t2)
              saveTodo(updated)
            }}
            style={{ width: 16, height: 16, accentColor: GOLD, cursor: 'pointer', flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text, textDecoration: task.done ? 'line-through' : 'none' }}>{task.topic}</div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
              <span style={{
                display: 'inline-block', padding: '1px 7px', borderRadius: 4, marginRight: 6,
                background: task.action === 'practice' ? 'rgba(241,190,67,0.12)' : 'rgba(139,92,246,0.12)',
                color: task.action === 'practice' ? GOLD : '#a78bfa',
                fontSize: 10, fontWeight: 700,
              }}>
                {task.action === 'practice' ? 'Practice Quiz' : 'Study & Revise'}
              </span>
              {task.estimatedMinutes} min
            </div>
          </div>
          <button
            onClick={() => {
              if (task.action === 'practice') {
                onStartSession?.({ mode: 'new', subtopics: [] })
              } else {
                onOpenLearn?.(task.topic)
              }
            }}
            style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid rgba(241,190,67,0.3)`, background: 'rgba(241,190,67,0.08)', color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            Start →
          </button>
        </div>
      ))}
    </div>
  )}
</section>
```

- [ ] **Step 7: Test the to-do list**

With dev server running:
1. Go to Study Plan — "Generate To-Do List" button visible.
2. Click it — spinner shows, then tasks appear with checkboxes, badges, and Start buttons.
3. Check a checkbox — it persists after page refresh (localStorage).
4. Click "Start →" on a "Practice Quiz" task — navigates to quiz.
5. Click "Start →" on a "Study & Revise" task — navigates to Learn screen with topic pre-filled.
6. Complete a quiz session — navigate to Study Plan — existing to-do list should auto-regenerate.

- [ ] **Step 8: Commit**

```bash
git add artifacts/gradefarm/src/App.jsx artifacts/gradefarm/src/components/StudyPlanScreen.jsx
git commit -m "feat: add generated to-do list to Study Plan with localStorage persistence and post-quiz auto-refresh"
```

---

### Task 5: Final integration test

**Files:** None (testing only)

- [ ] **Step 1: Full flow test**

With dev server running, test the complete end-to-end flow:

1. Start quiz → answer 1+ questions → click sidebar nav → confirm modal appears → "Stay in Quiz" → still on quiz.
2. Click sidebar nav → "Leave Anyway" → navigates to Study Plan without hang.
3. Return to quiz (`/quiz` url) → continue session → finish all questions → summary shows with coaching tip loading.
4. Coaching tip renders (one sentence) in purple card.
5. "Go to Study Plan →" button appears → click → navigates to Study Plan with NO nav-block modal (since finished=true).
6. Study Plan has "Generate To-Do List" button → generates tasks.
7. Start a new quiz from the study plan → complete it → navigate back to Study Plan → to-do list auto-regenerates.

- [ ] **Step 2: Commit final state**

```bash
git add -A
git commit -m "chore: final integration verified — nav guard, session summary, study plan todo"
```

---

## Self-Review

**Spec coverage:**
- ✅ Navigation guard: `useBlocker` on all nav paths (sidebar, browser back, `navigate()`)
- ✅ Session summary: AI coaching tip + "Go to Study Plan →" button  
- ✅ To-do list: Generate button, 5–8 tasks, checkbox, badge, estimated time, Start button
- ✅ `practice` → quiz, `revise` → Learn screen
- ✅ `localStorage` persistence keyed by user ID
- ✅ Auto-refresh after each completed quiz session

**Placeholder scan:** No TBDs or vague steps — all code shown explicitly.

**Type consistency:**
- `todoList` items: `{ id, topic, subject, action, estimatedMinutes, done }` — consistent across init, generate, save, render
- `blocker.reset()` / `blocker.proceed()` — React Router v7 API
- `setSessionTip` / `sessionTip` — consistent naming in quizState and QuizScreen props
- `lastSessionAt` passed through: App.jsx → AppShellScreens → StudyPlanScreen
- `onOpenLearn(topic)` — same signature as ProfileScreen's usage
