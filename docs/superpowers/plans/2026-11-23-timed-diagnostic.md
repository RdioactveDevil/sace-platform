# Timed Consultation Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consultation diagnostics (except English) become a 50-mark, 50-minute paper: 20 one-mark multiple-choice questions on one page, then bank-format short answers worth exactly 30 marks on the next, with a countdown on both, marked in the background after an instant "Submitted" screen.

**Architecture:** A `time_limit_minutes` column marks the new format (null = old/untimed, so old, English and roster diagnostics are untouched). The tutor's client builds the test from one MCQ request plus parallel short-answer requests that reuse the bank's writer and checks (`lib/marked-questions.ts`, split into write+check and save). Submitting a timed test stores the answers, responds, and marks with `markAnswer()` under Vercel's `waitUntil`; the 15-minute cron re-marks anything left over.

**Tech Stack:** Express 5 + TypeScript (`artifacts/api-server`, tests: `node:test` via `tsx --test`), React + Vite (`artifacts/gradefarm`, tests: `node --test src/lib/**/*.test.js`), Supabase Postgres (migrations in `supabase/migrations`), `@vercel/functions` (new dependency).

**Spec:** `docs/superpowers/specs/2026-11-23-timed-diagnostic-design.md`

## Global Constraints

- Timed format: 50 marks, 50 minutes. Part 1: exactly 20 `multiple_choice` questions, `marks: 1` each. Part 2: `type: 'marked'` questions totalling exactly 30 marks (2–6 marks each). `score_max` = 50.
- English stays as it is: a diagnostic whose subjects all have "english" or "writing" in the name (case-insensitive) is generated, stored and taken exactly as today, with `time_limit_minutes` null.
- Old rows (`time_limit_minutes` null) and roster diagnostics (`student_id` set) behave exactly as today, including marking during the submit request.
- The student never receives `correct_answer`, `solution_notes`, `marking_scheme` or `solution`.
- Short-answer marks are always added up from mark points in our code, never taken from the model.
- Bank difficulty → diagnostic difficulty: 1–3 → `moderate`, 4–5 → `exam`.
- Warning at 5 minutes left; at 0 the answers are submitted automatically. Late submissions are accepted.
- Re-mark after 10 minutes with no report; give up after 3 attempts.
- Copy, student start page: "50 marks · 50 minutes", "Part 1: multiple choice (20 marks). Part 2: short answer (30 marks).", "The timer starts when you press Start and doesn't stop, even if you close the page. Answers save as you go."
- Copy, timed prospect emails (student and parent wordings, invitation and reminder): "It's 50 marks in 50 minutes, timed, in one sitting: start it when you have an uninterrupted hour." replaces the "about 30–45 minutes" / "no time limit" sentences.
- `localStorage` reads/writes are wrapped in try/catch; the page works without storage.

## Review Focus

1. **Reload after time ran out** (tab closed at 40 min, reopened at 70): the page must submit the saved answers straight away, not show a fresh test or a negative clock. → Task 6 test `timeLeft is 0 and timeUp true past the deadline`, Task 7 load path.
2. **Auto-submit racing a manual Submit** (or a double click): the second request must not fail the student. Server update is conditional on `status = 'pending'`; the client treats "already submitted" as success. → Task 4 test `claimSubmission only claims a pending row`, Task 7 step.
3. **Student's clock is wrong** (10 minutes fast): the countdown must follow the server's clock. → Task 6 test `deadline corrects for the client clock`.
4. **One short answer can't be marked** (marker throws): the whole diagnostic stays "Marking…" and is retried, never saved with a silently zeroed question. → Task 4 test `needsRemark`.
5. **Rejections leave no 30-mark subset** (e.g. only 4-mark questions survive): the builder asks for more and finally errors rather than sending a 48- or 52-mark test. → Task 5 test `pickShortAnswers returns null when 30 is unreachable`; server `checkTimedTest` rejects at create.

---

### Task 1: Format rules, columns and validation (server)

**Files:**
- Create: `supabase/migrations/20261123000001_timed_diagnostics.sql`
- Create: `artifacts/api-server/src/lib/timed-diagnostic.ts`
- Modify: `artifacts/api-server/src/lib/new-consultation.ts` (`testInput`)
- Modify: `artifacts/api-server/src/routes/diagnostic.ts` (`DiagnosticQuestion` type, `sanitiseQuestionsForStudent`)
- Test: `artifacts/api-server/test/timed-diagnostic.test.ts`, `artifacts/api-server/test/new-consultation.test.ts`

**Interfaces:**
- Produces (`lib/timed-diagnostic.ts`):
  - `export const TIME_LIMIT_MINUTES = 50; MCQ_COUNT = 20; SHORT_ANSWER_MARKS = 30; REMARK_AFTER_MS = 10 * 60_000; MAX_MARKING_ATTEMPTS = 3`
  - `isEnglishOnly(subjects: { name: string }[]): boolean`
  - `checkTimedTest(questions: { type?: unknown; marks: number }[]): string | null` — null when it's 20 MC × 1 mark + `marked` totalling 30, else the problem.
  - `timeLimitFor(questions: { type?: unknown }[]): number | null` — `TIME_LIMIT_MINUTES` when any question has `type === 'marked'`, else null.
  - `diagnosticDifficulty(bankDifficulty: number): 'moderate' | 'exam'`
- `DiagnosticQuestion.type` gains `'marked'`, plus optional `marking_scheme?: MarkPoint[]`, `solution?: string`, `table_data?: unknown`, `diagram?: unknown`, `bank_question_id?: string`.

- [ ] **Step 1: Write the migration**

```sql
alter table public.diagnostic_assessments
  add column if not exists time_limit_minutes int,
  add column if not exists marking_started_at timestamptz,
  add column if not exists marking_attempts int not null default 0;
```

- [ ] **Step 2: Write failing tests** in `test/timed-diagnostic.test.ts`:
  - `isEnglishOnly`: `[{name:'English'}]` → true; `[{name:'Year 7 Writing'}]` → true; `[{name:'SACE Chemistry Stage 1'}]` → false; `[{name:'English'},{name:'Physics'}]` → false.
  - `checkTimedTest`: 20 MC×1 + marked [5,5,4,4,4,4,4] → null; 19 MC → error mentioning "20"; marked totalling 29 → error mentioning "30"; an MC with marks 2 → error.
  - `timeLimitFor`: any marked → 50; none → null.
  - `diagnosticDifficulty`: 1,2,3 → 'moderate'; 4,5 → 'exam'.
  - in `test/new-consultation.test.ts`: `testInput` with a marked question and only 18 MCQs → `{ error }`; a valid timed test → ok with `scoreMax: 50`; an old-format test (no marked) still passes unchanged.
  - `sanitiseQuestionsForStudent` (export it) drops `correct_answer`, `solution_notes`, `marking_scheme`, `solution` and keeps `marks`, `type`, `table_data`, `diagram`.

- [ ] **Step 3: Run** `pnpm --filter @workspace/api-server test` — expect the new tests to FAIL (module not found).
- [ ] **Step 4: Implement** `lib/timed-diagnostic.ts`; call `checkTimedTest` from `testInput` only when `timeLimitFor(questions)` is non-null; widen the type and sanitiser.
- [ ] **Step 5: Run** `pnpm --filter @workspace/api-server test && pnpm --filter @workspace/api-server typecheck` — PASS.
- [ ] **Step 6: Apply the migration** to the Supabase project (`apply_migration`, name `timed_diagnostics`) and commit: `git commit -m "Timed diagnostic: format rules, columns, validation"`.

### Task 2: Short answers from the bank's writer (server)

**Files:**
- Modify: `artifacts/api-server/src/lib/marked-questions.ts`
- Modify: `artifacts/api-server/src/routes/diagnostic.ts` (new route; MCQ-only mode of `generateQuestions`)
- Test: `artifacts/api-server/test/timed-diagnostic.test.ts`

**Interfaces:**
- Consumes: `diagnosticDifficulty`, `isEnglishOnly` (Task 1).
- Produces:
  - `MarkedTarget.curriculumId` and `.subtopicId` become `string | null`. `writeDrafts` skips `scopeForSubtopic` when `subtopicId` is null.
  - `export async function writeCheckedMarkedQuestions(admin, t: MarkedTarget, opts: { count: number; difficulty: number | 'mixed' }): Promise<{ drafts: CheckedDraft[]; rejected: { question: string; reason: string }[] }>` — the existing write + both checks, no saving. `CheckedDraft` = the existing `Draft` after checks (export the type).
  - `export async function saveMarkedQuestions(admin, t: MarkedTarget, drafts: CheckedDraft[]): Promise<Record<string, unknown>[]>` — the existing insert; returns `[]` without touching the DB when `t.curriculumId` is null.
  - `generateMarkedQuestions` = the two composed (existing callers unchanged).
  - `export function toDiagnosticShortAnswer(row: { id?: string; question; total_marks; marking_scheme; solution; difficulty; table_data?; diagram? }, topic: string, subtopic: string): DiagnosticQuestion` (in `timed-diagnostic.ts`): `type: 'marked'`, `marks: total_marks`, `correct_answer: solution` (so the old report code still has a model answer), `difficulty: diagnosticDifficulty(difficulty)`, `bank_question_id: row.id` when present.
  - Route `POST /tutor/diagnostic/short-answers` (tutor auth via `requireTutor`) body `{ yearLevel: string, subject: SubjectConfig, subtopicId?: string, topic?: string, count: number }` → `{ questions: DiagnosticQuestion[], rejected: number }`. Curriculum subject: target from `loadMarkedTarget(admin, subtopicId)` (404 if it isn't in `subject.curriculumId`); built-in subject: `{ curriculumId: null, subtopicId: null, subject: subject.name, levelLabel: yearLevel, examContext: '', topic, subtopic: topic }`. `count` clamped to `MARKED_MAX_COUNT`; difficulty `'mixed'`.
  - `POST /tutor/diagnostic/generate` accepts `format?: 'timed'`; with it (and not `isEnglishOnly`), the prompt asks for exactly `MCQ_COUNT` multiple-choice questions, 1 mark each, about 7 easy, 7 moderate, 6 exam, easy → hard, spread across the scope; the response is filtered to valid MCQs with `marks` forced to 1 and returns 502 "Not enough questions came back. Try again." if fewer than 20.

- [ ] **Step 1: Write failing tests**: `toDiagnosticShortAnswer` maps difficulty 2 → moderate, 5 → exam, marks = total_marks, keeps the scheme, sets `bank_question_id`; `saveMarkedQuestions` with `curriculumId: null` returns `[]` and makes no insert (use `test/fake-supabase.ts`, assert no `questions` insert).
- [ ] **Step 2: Run** the api-server tests — FAIL.
- [ ] **Step 3: Implement** the split, the converter, the route and the `format: 'timed'` MCQ prompt.
- [ ] **Step 4: Run** tests + typecheck — PASS. Existing `marked-*.test.ts` still pass.
- [ ] **Step 5: Commit** `"Timed diagnostic: bank-format short answers and the 20-question MCQ part"`.

### Task 3: Storing, starting and emailing a timed test (server)

**Files:**
- Modify: `artifacts/api-server/src/routes/diagnostic.ts` (`/tutor/diagnostic/create`, `/:id/add-test`, `GET /diagnostic/:token`, `POST /diagnostic/:token/start`, `emailProspect`)
- Modify: `artifacts/api-server/src/routes/consultations.ts:319` (the insert)
- Modify: `artifacts/api-server/src/lib/prospect-emails.ts`, `artifacts/api-server/src/lib/automated-emails.ts:979` (reminder call)
- Test: `artifacts/api-server/test/prospect-emails.test.ts`

**Interfaces:**
- Consumes: `timeLimitFor` (Task 1).
- Produces:
  - Every insert/update that stores a test sets `time_limit_minutes: timeLimitFor(test.questions)`.
  - `GET /diagnostic/:token` adds `time_limit_minutes`, `started_at` (ISO or null) and `server_now` (ISO) to `assessment`.
  - `POST /diagnostic/:token/start` responds `{ ok: true, startedAt: string | null, timeLimitMinutes: number | null, serverNow: string }`; `startedAt` is the stored value (set once, as now).
  - `DiagOpts` gains `timed?: boolean`; `prospectDiagnosticEmail` / `prospectReminderEmail` use the timed sentence from Global Constraints in place of the time sentences when it's true. `emailProspect` and the reminder job pass `timed: !!row.time_limit_minutes` (add the column to their selects).

- [ ] **Step 1: Write failing tests** in `prospect-emails.test.ts`: with `timed: true`, the student and parent invitation and reminder paragraphs contain "It's 50 marks in 50 minutes, timed, in one sitting: start it when you have an uninterrupted hour." and none contain "no time limit" or "30–45"; without it, the existing assertions still hold.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** the email option and the route/column changes. **Step 4: Run** tests + typecheck — PASS.
- [ ] **Step 5: Commit** `"Timed diagnostic: store the time limit, start clock, timed email wording"`.

### Task 4: Submit now, mark in the background (server)

**Files:**
- Create: `artifacts/api-server/src/lib/diagnostic-marking.ts`
- Modify: `artifacts/api-server/src/routes/diagnostic.ts` (move `markAssessment` + `callClaude`/`extractJson` it needs into the lib, or import them; submit route; new `POST /tutor/diagnostic/:id/mark`)
- Modify: `artifacts/api-server/src/routes/email.ts` (`handleCron`)
- Modify: `artifacts/api-server/package.json` (add `@vercel/functions`)
- Test: `artifacts/api-server/test/diagnostic-marking.test.ts`

**Interfaces:**
- Consumes: `REMARK_AFTER_MS`, `MAX_MARKING_ATTEMPTS` (Task 1); `markAnswer` (`lib/marking.ts`).
- Produces:
  - `markAssessment` handles `type: 'marked'`: `markAnswer({ subject, question, marking_scheme, solution, table_data, diagram }, answer)` per question in parallel (an empty answer is 0 marks without calling the model); its `QuestionResult` gets `marks_awarded = result.awarded`, `marks_possible = q.marks`, `feedback = result.summary`, plus `points: PointResult[]`. Any `markAnswer` failure rejects the whole call.
  - `needsRemark(row: { time_limit_minutes: number | null; status: string; report: unknown; marking_started_at: string | null; marking_attempts: number }, now: Date): boolean` — timed, completed, no report, attempts < 3, started more than 10 min ago (or never).
  - `markAndStore(admin, id: string): Promise<void>` — claims (`update marking_started_at = now, marking_attempts = attempts + 1 where id and report is null and marking_attempts = <read value>`; no row → return), marks, writes `report` + `score_total`. Errors are logged, not thrown.
  - `remarkStaleDiagnostics(admin, now: Date): Promise<{ marked: number }>` — up to 5 rows where `needsRemark`, one at a time; called at the start of `handleCron` (not on dry runs), wrapped in try/catch like recurring assignments.
  - `claimSubmission` (pure helper for the update filter): the submit update is `.eq('token', token).eq('status', 'pending')`; zero rows updated → 409 `{ error: 'already_submitted' }`.
  - Submit route, timed row: store `student_answers`, `submitted_by_name`, `status: 'completed'`, `completed_at`, then respond `{ submitted: true, preCallFormUrl, questionnaireUrl }`, then `waitUntil(markAndStore(admin, id))` (import from `@vercel/functions`; outside Vercel it just runs). Untimed rows: unchanged.
  - `POST /tutor/diagnostic/:id/mark` (sender only, via `ownLinkDiagnostic` rules but allowing completed rows): resets `marking_attempts` to 0 and awaits `markAndStore`; 409 if it already has a report.

- [ ] **Step 1: Write failing tests**: `needsRemark` — untimed → false; timed + report → false; timed, no report, started 11 min ago, attempts 1 → true; started 5 min ago → false; attempts 3 → false; never started → true. `markAssessment` with a stubbed marker (inject `markAnswer` as a parameter defaulting to the real one) — a 4-mark question awarded 3 gives `marks_awarded: 3`, `marks_possible: 4`, `points` kept; a thrown marker error rejects; an empty answer gives 0 without calling the stub; totals are 50 max for a timed set.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** tests + typecheck — PASS; `pnpm --filter @workspace/api-server build` succeeds with `@vercel/functions`.
- [ ] **Step 5: Commit** `"Timed diagnostic: instant submit, background marking with cron safety net"`.

### Task 5: The tutor builds a timed test (client)

**Files:**
- Create: `artifacts/gradefarm/src/lib/timedDiagnostic.js`
- Modify: `artifacts/gradefarm/src/lib/db.js` (`generateDiagnosticQuestions` passes `format`; new `generateShortAnswers`)
- Modify: `artifacts/gradefarm/src/components/TestBuilder.jsx` (`TestBuilder`, `TestQuestionList`), `artifacts/gradefarm/src/components/TutorScreen.jsx` (`DiagnosticTab` generate + "How it works" copy)
- Test: `artifacts/gradefarm/src/lib/timedDiagnostic.test.js`

**Interfaces:**
- Consumes: the Task 2 routes.
- Produces (`timedDiagnostic.js`):
  - `isEnglishOnly(subjects)` — same rule as the server.
  - `shortAnswerRequests(scope: { curriculumId?: string, topics: { topic: string, subtopicIds?: string[] }[] }, n = 5): { subtopicId?: string, topic: string, count: number }[]` — up to `n` requests spread across topics (round-robin by topic, then subtopic), count 3 each.
  - `pickShortAnswers(candidates: DiagnosticQuestion[], target = 30): DiagnosticQuestion[] | null` — a subset totalling exactly `target`, preferring one per topic first and both difficulties, ordered moderate → exam; null if impossible (subset-sum over marks; candidates are ≤ 15).
  - `buildTimedTest({ yearLevel, subject, scopeTopics }, { generateMcq, generateShortAnswers, onProgress }): Promise<DiagnosticQuestion[]>` — runs the MCQ request and the short-answer requests in parallel, picks 30 marks; if short, one more round of requests; still short → throws "Couldn't put together 30 marks of short answers. Try again."; returns the 20 MCQs then the short answers, ids renumbered from 1. `onProgress({ mcq: 'writing' | 'done', shortDone: number, shortTotal: number })`.
- `TestBuilder` and `DiagnosticTab` call `buildTimedTest` unless `isEnglishOnly`, showing "Writing multiple choice… · Short answers N of M… (2–3 minutes)". For database subjects, `scopeTopics` comes from the `DiagnosticScopePicker` tree already loaded (`fetchSubjectTopics`); built-in subjects pass their selected topic names.
- `TestQuestionList` shows "Part 1 — Multiple choice" and "Part 2 — Short answer" headings for a timed set, and under each short answer its mark points (`marks` + `point`) and the model answer (`MathText`).
- "How it works" and the form subtitle say: "A 50-mark, 50-minute test: 20 multiple-choice questions, then short answers like the question bank's" (English keeps today's copy).

- [ ] **Step 1: Write failing tests**: `pickShortAnswers` over marks [6,5,5,4,4,4,3,3,2] returns a subset summing to 30 that includes each topic present; over [4,4,4,4,4,4,4,4] returns null; `shortAnswerRequests` with 3 topics × 4 subtopics and n=5 covers all 3 topics; `buildTimedTest` with stub fetchers (one short-answer request rejects) still returns 20 MC + 30 marks and calls `onProgress`; with stubs that never reach 30 it throws the exact message; `isEnglishOnly` same cases as Task 1.
- [ ] **Step 2: Run** `pnpm --filter @workspace/gradefarm test` — FAIL. **Step 3: Implement** the lib, then wire the components. **Step 4: Run** — PASS; `pnpm --filter @workspace/gradefarm build` succeeds.
- [ ] **Step 5: Commit** `"Timed diagnostic: build 20 MCQ + 30 marks of short answers in the tutor portal"`.

### Task 6: Clock and saved answers (client, pure)

**Files:**
- Modify: `artifacts/gradefarm/src/lib/timedDiagnostic.js`
- Test: `artifacts/gradefarm/src/lib/timedDiagnostic.test.js`

**Interfaces:**
- Produces:
  - `clockFrom({ startedAt: string, limitMinutes: number, serverNow: string }, clientNow = Date.now()): { deadline: number }` — deadline in client time: `Date.parse(startedAt) + limit·60000 − (Date.parse(serverNow) − clientNow)`.
  - `timeLeft(clock, now = Date.now()): number` — ms, never below 0. `timeUp(clock, now)`; `inWarning(clock, now)` — ≤ 5 minutes left and not up.
  - `loadAnswers(token): Record<string,string>`, `saveAnswers(token, answers)`, `clearAnswers(token)` — key `gf-diagnostic-answers:<token>`, all try/catch.
  - Reuse `formatClock(ms)` from `lib/examSitting.js` for mm:ss.

- [ ] **Step 1: Write failing tests**: `deadline corrects for the client clock` (server now 10:00, client now 10:10, started 09:55, 50 min → 50-minute deadline lands at client 10:55); `timeLeft is 0 and timeUp true past the deadline`; `inWarning` true at 4:59 left, false at 5:01 and at 0; answers round-trip through a stubbed `localStorage`, and `loadAnswers` returns `{}` when storage throws.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `"Timed diagnostic: clock and saved answers"`.

### Task 7: The student's timed test (client)

**Files:**
- Modify: `artifacts/gradefarm/src/components/DiagnosticScreen.jsx`
- Modify: `artifacts/gradefarm/src/lib/db.js` (`startDiagnostic` returns the JSON; `submitDiagnosticAnswers` resolves `{ submitted: true }` on a 409 `already_submitted`)

**Interfaces:**
- Consumes: Task 3 token/start fields, Task 4 submit response, Task 6 helpers, `MathWorkingInput` (lazy, `key={q.id}`, `question={{ ...q, total_marks: q.marks }}`), `WrittenAnswerInput`, `usesMathInput(subjectName)` from `lib/subjects.js` (maths box vs written box).
- Behaviour, only when `assessment.time_limit_minutes`:
  - Start page: the copy in Global Constraints plus the name field; Start awaits `startDiagnostic`, builds the clock, goes to part 1. A load with `started_at` already set skips the start page into part 1 with saved answers; if `timeUp` on load, submit the saved answers at once.
  - Phases `part1` (20 MCQs via the existing `McqQuestion`, "Next: short answer") and `part2` (short answers, "Back to multiple choice", Submit with the existing unanswered check). Scroll to top on each change.
  - Timer: sticky bar at the top of both parts, `formatClock(timeLeft)` with `role="timer"`, `aria-label="Time left"`; in warning, danger colour and a one-time polite live-region message "5 minutes left". A 1-second interval; at 0, submit automatically (once — guard with a ref).
  - Every answer change calls `saveAnswers`; a successful submit calls `clearAnswers` and goes straight to `SubmittedScreen`. The `submitting` "Marking your answers" panel is never shown in this flow (a plain disabled "Submitting…" button instead). A failed submit keeps the student on part 2 with the error and the clock running.
- Untimed rows: the existing render path, unchanged.

- [ ] **Step 1: Implement** the timed flow beside the existing one (branch on `time_limit_minutes`).
- [ ] **Step 2: Verify in the browser** (Playwright, `pnpm --filter @workspace/gradefarm dev` with the API): a seeded timed diagnostic shows the start copy; part 1 → part 2 → back keeps answers; reload mid-test keeps answers and time; with the clock forced past the deadline (stub `Date.now` via `page.addInitScript`) it submits on load; Submit lands on the "Submitted" screen with no marking screen; an old untimed link and a roster link render as before. Screenshot part 1, part 2 and the 5-minute warning at 390 px and desktop width.
- [ ] **Step 3: Run** `pnpm --filter @workspace/gradefarm test && pnpm --filter @workspace/gradefarm build` — PASS.
- [ ] **Step 4: Commit** `"Timed diagnostic: two-part timed test page with instant submit"`.

### Task 8: Tutor list and report for the new format

**Files:**
- Modify: `artifacts/api-server/src/lib/prospect-status.ts` (`ProspectRow`, `diagnosticStatus`, `DIAGNOSTIC_LIST_COLUMNS`)
- Modify: `artifacts/api-server/src/routes/diagnostic.ts` (`GET /tutor/diagnostic/:id/report`)
- Modify: `artifacts/gradefarm/src/lib/diagnosticStatus.js`, `artifacts/gradefarm/src/lib/db.js` (new `markDiagnosticAgain(id)`), `artifacts/gradefarm/src/components/TutorScreen.jsx` (list row + report view), `artifacts/gradefarm/src/lib/presentReport.js` if it needs the marked fields
- Test: `artifacts/api-server/test/prospect-status.test.ts`, `artifacts/gradefarm/src/lib/diagnosticStatus.test.js`

**Interfaces:**
- Consumes: Task 4 `points` on `question_results`, `POST /tutor/diagnostic/:id/mark` (`markDiagnosticAgain(id)` in `db.js`).
- Produces:
  - `diagnosticStatus`: completed with `score_total === null` → `'marking'`, or `'marking_failed'` when `marking_attempts >= 3`; otherwise `'finished'` as before. List columns add `score_total` (already there), `marking_attempts`, `time_limit_minutes`, `started_at`.
  - Chips: `marking: { label: 'Marking…', tone: 'gold' }`, `marking_failed: { label: 'Marking failed', tone: 'danger' }`. The report button is disabled while marking; a failed row shows "Mark again".
  - Report route: completed without a report → 409 `{ error: 'Still marking. Try again in a minute.' }`.
  - Report view: short answers show the student's answer (maths working rendered as in the bank), score out of marks, and each mark point awarded or not with its comment (`MarkPoints` / `MarkedAnswer` from `components/questions/WrittenAnswer.jsx`, with the question given `marking_scheme` from the stored question). Adds a "Part 1: x/20 · Part 2: y/30" line and "Time taken: N min" (`completed_at − started_at`) for timed rows. Difficulty breakdown stays.
  - Call report (`PresentReport`): renders timed reports without errors and still leaves out marking detail.

- [ ] **Step 1: Write failing tests**: `diagnosticStatus` for completed+null score → 'marking'; with attempts 3 → 'marking_failed'; completed with a score → 'finished'; `statusChip('marking')` label 'Marking…'.
- [ ] **Step 2: Run** both suites — FAIL. **Step 3: Implement.** **Step 4: Run** both suites, typecheck, build — PASS.
- [ ] **Step 5: Verify in the browser**: a marking row, a failed row (Mark again works), and a finished timed report with point-by-point short answers; an old report unchanged.
- [ ] **Step 6: Commit** `"Timed diagnostic: marking status and point-by-point report"`.

### Task 9: Docs and end-to-end check

**Files:**
- Modify: `replit.md` (the Diagnostic tab / consultation section: the timed format, English exception, background marking and cron re-mark, new columns and routes)

- [ ] **Step 1: Update `replit.md`.**
- [ ] **Step 2: End to end** against the dev stack: generate a timed Year 11 / Stage 1 Specialist Mathematics test in the Diagnostic tab (20 MC + 30 marks, short answers saved to `questions` with `question_type = 'marked'`), create it, take it as a student, submit, see "Submitted", and see the report appear once marking finishes; generate an English test and confirm it's the old 30-mark untimed format.
- [ ] **Step 3: Run** `pnpm --filter @workspace/api-server test && pnpm --filter @workspace/api-server typecheck && pnpm --filter @workspace/gradefarm test && pnpm --filter @workspace/gradefarm build` — all PASS.
- [ ] **Step 4: Commit** `"Docs: timed consultation diagnostic"` and push.
