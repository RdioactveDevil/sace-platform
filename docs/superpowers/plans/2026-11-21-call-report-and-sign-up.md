# Call Report and Sign-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A clean Present view of a prospect's diagnostic for screen-sharing on the call, and a "Sign them up" button that invites the prospect with their subject and carries the consultation diagnostic into their account.

**Architecture:** Server: one migration (`tutor_invites.source_diagnostic_id`), invite create stores it, invite accept adopts the source diagnostic for its curriculum via a pure planner, and the diagnostics list reports each link diagnostic's sign-up state. Client: a Present component built only from report fields, and a sign-up modal reusing the Students tab's invite form logic.

**Tech Stack:** Express + TypeScript (`tsx --test`), Supabase Postgres, React/Vite (`node --test` for `src/lib`).

**Spec:** `docs/superpowers/specs/2026-11-21-call-report-and-sign-up-design.md` (its "Builder-check answers" are binding).

## Global Constraints

- The Present view never shows questionnaire answers, red flags, pain points / patterns / recommendations, or tutor controls other than "Exit".
- Strong ≥ 75%, to work on < 60% (same thresholds as `studentSummary`).
- Adoption only for the source diagnostic's curriculum when it's among the ids unlocked or covered on accept; never create a second diagnostic for that subject; never touch a diagnostic whose `student_id` is already set.
- Existing invite, roster and diagnostic behaviour unchanged when `sourceDiagnosticId` is absent.
- UI: existing tokens/patterns only (tutor portal: `THEMES`, `FONT_B`, card/sectionHdr/inputStyle/labelStyle, `confirmDialog`, `MathText`); no new colours or fonts.
- No personal details of the user in the repository (fixtures use fictional names).

## Review Focus

- Two diagnostics for one email, or an invite reused for a different diagnostic: only the referenced diagnostic is adopted (Task 1 tests on `adoptionPlan`).
- The student already has a diagnostic for the subject: nothing adopted, nothing created for it (Task 1 tests).
- Another tutor's or a roster diagnostic as `sourceDiagnosticId`: 400 (Task 1 route step).
- A report with a question that has no matching result, or a topic with no subtopics: the Present view still renders (Task 2 tests on the view-model helper).
- Sign-up after a declined invite: the button comes back (Task 1 `signupState` tests).

---

### Task 1: Server — source diagnostic, adoption, sign-up state

**Files:**
- Create: `supabase/migrations/20261121000005_invite_source_diagnostic.sql`
- Create: `artifacts/api-server/src/lib/prospect-signup.ts`
- Test: `artifacts/api-server/test/prospect-signup.test.ts`
- Modify: `artifacts/api-server/src/routes/invites.ts` (create ~220: `sourceDiagnosticId`; accept ~574: adoption)
- Modify: `artifacts/api-server/src/routes/diagnostic.ts` (list: `signup` per row)

**Interfaces:**
- Produces:
  - Column `tutor_invites.source_diagnostic_id uuid references diagnostic_assessments(id) on delete set null` (idempotent; `set local lock_timeout = '10s'`).
  - `adoptionPlan(o: { unlockedIds: string[]; source: { id: string; curriculum_id: string | null; student_id: string | null } | null; existing: string[] /* curriculum ids the student already has a diagnostic for */ }): Map<string, "adopt" | "keep-existing" | "create">` — for each unlocked id: existing → "keep-existing"; equals source.curriculum_id and source.student_id null → "adopt"; else "create".
  - `signupState(invites: Array<{ status: string; student_name?: string | null }>): null | { status: "invited" | "signed_up"; studentName?: string }` — accepted wins over pending; declined/expired/cancelled → null.
  - `POST /tutor/invites` accepts `sourceDiagnosticId?: string` → 400 "That diagnostic can't be used for this invite." unless it's the caller's own completed diagnostic with `student_id` null; stored on new and reused invites.
  - Accept: uses `adoptionPlan`; "adopt" = `update diagnostic_assessments set student_id, student_name = coalesce(student_name, <name>) where id = source and student_id is null` (if 0 rows → fall back to "create"); "keep-existing" = do nothing; "create" = today's `createStudentDiagnostic`.
  - List rows (link diagnostics and adopted ones): `signup: null | { status: "invited" | "signed_up"; studentName?: string }`.

- [ ] **Step 1: Failing tests** for `adoptionPlan` (adopt; existing wins; source with student_id → create; source for another curriculum → create for unlocked, nothing for source; no source → all create) and `signupState` (pending → invited; accepted → signed_up with name; accepted + pending → signed_up; declined/expired/cancelled → null; empty → null).
- [ ] **Step 2: Run** `cd artifacts/api-server && npx tsx --test test/prospect-signup.test.ts` → FAIL.
- [ ] **Step 3: Implement** the module, the migration (check it applies twice on a scratch Postgres 16 with a stub `tutor_invites` and `diagnostic_assessments`), then the routes.
- [ ] **Step 4: Run** the test → PASS; `npx tsc -p tsconfig.json --noEmit 2>&1 | grep -v health.ts; pnpm test` → clean, all pass.
- [ ] **Step 5: Commit** — `"Sign-up: invites remember the consultation diagnostic and carry it across"`

### Task 2: Present view

**Files:**
- Create: `artifacts/gradefarm/src/components/PresentReport.jsx`
- Create: `artifacts/gradefarm/src/lib/presentReport.js` + `presentReport.test.js`
- Modify: `artifacts/gradefarm/src/components/TutorScreen.jsx` (report step: "Present" button for completed link diagnostics; render PresentReport full screen; Exit returns)

**Interfaces:**
- Consumes: `GET /tutor/diagnostic/:id/report` response (`assessment` with `questions`, `report` with `percentage`, `performance_band`, `total_score`, `max_score`, `easy_score/max`, `moderate_score/max`, `exam_score/max`, `topic_breakdown`, `subtopic_breakdown`, `question_results`).
- Produces: `presentModel(assessment, report): { name, subject, percentage, band, strong: string[], workOn: string[], topics: Array<{ topic, percentage, subtopics: Array<{ subtopic, percentage }> }>, difficulty: Array<{ label: "Easy" | "Core" | "Exam-style", score, max }>, questions: Array<{ id, question, type, options?, studentAnswer, correctAnswer, correct, marks, marksPossible }> }` — topics sorted by curriculum order as given; difficulty entries with max 0 dropped; questions joined by id, missing results → `studentAnswer: ""`, `correct: false`.

- [ ] **Step 1: Failing tests** for `presentModel` (thresholds 75/60 at the boundaries; subtopics grouped under their topic; a topic without subtopics → []; difficulty labels and dropping max 0; a question with no result; MC answers shown as the option text, e.g. "B. x = 2").
- [ ] **Step 2: Run** `cd artifacts/gradefarm && node --test src/lib/presentReport.test.js` → FAIL; implement; → PASS.
- [ ] **Step 3: PresentReport** — full-screen overlay in the site's style, large readable type; header (name · subject, "Diagnostic results"); score + band; strong/to-work-on lists; topic bars (expand to subtopics); difficulty row; "Question by question" list, each collapsed, opening to question (MathText), their answer, correct answer, right/wrong mark; "Exit" (also Escape). Nothing else from the report.
- [ ] **Step 4: Build and test** — `cd artifacts/gradefarm && pnpm run build && pnpm test`.
- [ ] **Step 5: Commit** — `"Diagnostic report: Present view for the consultation call"`

### Task 3: Sign them up

**Files:**
- Create: `artifacts/gradefarm/src/components/SignUpModal.jsx`
- Modify: `artifacts/gradefarm/src/components/StudentsTab.jsx` (extract the invite form's submit logic into a reusable piece if needed; behaviour unchanged)
- Modify: `artifacts/gradefarm/src/components/TutorScreen.jsx` (row button/chips; report view button)
- Modify: `artifacts/gradefarm/src/lib/db.js` (`inviteStudent` gains an optional `sourceDiagnosticId`)
- Create: `artifacts/gradefarm/src/lib/signUp.js` + `signUp.test.js`

**Interfaces:**
- Consumes: Task 1 (`sourceDiagnosticId`, list `signup`).
- Produces (tested): `signUpDefaults(row, { canInclude }): { email, curriculumIds: string[], parentEmail: string | null, childName: string }` (childName = first word of the student name) and `signUpChip(signup): null | { label, tone }` ("Invited" gold, "Signed up · <name>" success).

- [ ] **Step 1: Failing tests** for both helpers. FAIL → implement → PASS.
- [ ] **Step 2: Modal** — same fields and validation as the Students tab invite form (email, include subject, "send to a parent" with child name), prefilled from `signUpDefaults`; when switching to parent mode, prefill parent email and child name; warning when the source subject is unticked: "Their consultation diagnostic won't carry across without this subject."; Send → `inviteStudent(…, sourceDiagnosticId)`; server errors inline; success closes and refreshes the list.
- [ ] **Step 3: Rows and report** — "Sign them up" on finished link diagnostics with `signup` null; chips from `signUpChip`; same button on the report view (not inside Present).
- [ ] **Step 4: Build and test** — `cd artifacts/gradefarm && pnpm run build && pnpm test`; confirm the Students tab invite still works unchanged (existing tests pass).
- [ ] **Step 5: Commit** — `"Diagnostics: sign a prospect up after the call"`
