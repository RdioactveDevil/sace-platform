# Pre-call Questionnaire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each tutor edits one pre-call questionnaire, tailors it per student when sending a diagnostic, and prospects fill it in after booking; answers and red flags reach the tutor.

**Architecture:** A pure, tested `lib/questionnaire.ts` owns the item/answer model, defaults, validation, red-flag counting and the open/closed rule. The master lives in `tutor_questionnaires`; each diagnostic stores a snapshot plus answers. The existing single choke point `questionnaireUrl(admin, diagnosticId)` in `consultation-service.ts` switches to the built-in page when a snapshot exists. The 15-minute email job sends the reminder and the tutor notice. UI reuses the tutor-portal and `publicUi.jsx` styles.

**Tech Stack:** Express + TypeScript (`tsx --test`), Supabase Postgres, Resend, React/Vite (`node --test` for `src/lib`).

**Spec:** `docs/superpowers/specs/2026-11-21-pre-call-questionnaire-design.md` (including its "Builder-check answers" section, which is binding).

## Global Constraints

- One questionnaire per tutor; item types `section | short | long | one | many`; `required`; option `flag`; `other` only on `one`/`many`.
- Limits: ≤ 60 items, label ≤ 300 chars, help ≤ 500, ≤ 20 options per item, option label ≤ 200, intro ≤ 2000, text answers ≤ 5000.
- Snapshot at create; never re-snapshot (not on resend, not on master edit).
- Snapshot wins over `pre_call_form_url` everywhere; legacy link used only without a snapshot. Roster diagnostics (`student_id` set) never get a questionnaire.
- Open = diagnostic not cancelled AND (no non-cancelled consultation OR now < end of the latest non-cancelled consultation, end = `scheduled_at + duration_minutes`).
- Never call the sender the prospect's tutor; name them in full (`prospectSenderName`). Prospect/parent emails: Reply-To = tutor's sign-in email; links via `appUrl()`.
- No personal details (names, emails) of the user in the repository. `OWNER_QUESTIONNAIRE` is a constant nothing uses automatically.
- UI: existing tokens/patterns only (tutor portal: `THEMES`, `FONT_B`, card/sectionHdr/inputStyle/labelStyle, `confirmDialog`; public: `publicUi.jsx`, `AuthLayout`, `af-btn`/`af-inp`).

## Review Focus

- A tampered POST (unknown item ids, unknown option ids, missing required, oversize text, an array for a pick-one) is rejected with 400 and nothing stored (Task 1 tests on `validateAnswers`).
- A second POST after submission returns 409 and doesn't overwrite answers (Task 2 route step: conditional update `questionnaire_submitted_at is null`).
- A master edit after sending never changes a sent snapshot (Task 2 step: create stores a copy; Task 1 test: `snapshotFrom` deep-copies).
- Rescheduling reopens a closed questionnaire; cancelling the only call leaves it open (Task 1 tests on `questionnaireOpen`).
- A half-filled form survives a page reload (Task 4 test on the draft storage helper; storage failures don't break the page).

---

### Task 1: Model, defaults and rules

**Files:**
- Create: `supabase/migrations/20261121000004_pre_call_questionnaire.sql`
- Create: `artifacts/api-server/src/lib/questionnaire.ts`
- Test: `artifacts/api-server/test/questionnaire.test.ts`

**Interfaces:**
- Produces:
  - Table `tutor_questionnaires (tutor_id uuid pk → profiles on delete cascade, intro text not null default '', items jsonb not null, updated_at timestamptz default now())`, RLS on, no policies. `diagnostic_assessments` adds `questionnaire jsonb`, `questionnaire_answers jsonb`, `questionnaire_submitted_at timestamptz`, `questionnaire_reminded_at timestamptz`. Idempotent; `set local lock_timeout = '10s'`.
  - Types `QItem`, `QOption`, `Questionnaire = { intro: string; items: QItem[] }`, `Answers = Record<string, string | string[] | { choice: string; other?: string }>`.
  - `DEFAULT_QUESTIONNAIRE: Questionnaire` (spec Goal 2's basic set, neutral wording, no "your tutor").
  - `OWNER_QUESTIONNAIRE: Questionnaire` (the spec's "The user's questionnaire" section verbatim, including the one wording fix and the four red flags; `Other` on the career question).
  - `validateQuestionnaire(raw: unknown): { questionnaire: Questionnaire } | { error: string }` — enforces types and limits; trims labels; generates missing ids; drops options/other on types that can't have them; rejects duplicate ids and a questionnaire with no questions (sections only).
  - `snapshotFrom(q: Questionnaire): Questionnaire` — deep copy.
  - `validateAnswers(q: Questionnaire, raw: unknown): { answers: Answers } | { error: string }` — keeps only known question ids; `short`/`long` strings ≤ 5000 trimmed; `one` = option id or `{ choice: "other", other }` when `other` allowed; `many` = array of distinct option ids (plus optional `{ other }` object if allowed — pick one shape and document it); required questions must be answered (non-empty).
  - `countRedFlags(q: Questionnaire, a: Answers): number` and `flaggedAnswers(q, a): Array<{ question: string; answer: string }>`.
  - `questionnaireOpen(o: { cancelledAt: string | null; calls: Array<{ status: string; scheduled_at: string; duration_minutes: number }>; now: number }): boolean` — the Global Constraints rule.
  - `questionnaireStatus(o: { hasSnapshot: boolean; submittedAt: string | null; hasLiveBooking: boolean }): "none" | "waiting" | "submitted" | null` (null = no snapshot).

- [ ] **Step 1: Failing tests:** `DEFAULT_QUESTIONNAIRE` and `OWNER_QUESTIONNAIRE` both pass `validateQuestionnaire` and contain no `/your tutor/i`; the owner set has exactly 4 flagged options and the career question has `other: true`; `validateQuestionnaire` rejects 61 items, a 301-char label, 21 options, an unknown type, duplicate ids, sections-only; strips `options` from a `short`; `snapshotFrom` result mutated doesn't change the source; `validateAnswers` rejects unknown option id, array for `one`, string for `many`, missing required, 5001-char text, and drops unknown item ids; accepts "Other" with text only when `other` is true; `countRedFlags` counts flagged choices across `one` and `many` and never "Other"; `questionnaireOpen`: no calls → true; cancelled diagnostic → false; one cancelled call → true; latest non-cancelled call ending in the future → true, ended → false; a reschedule to later reopens (two rows: old cancelled ended, new future → true); `questionnaireStatus` mapping.
- [ ] **Step 2: Run** `cd artifacts/api-server && npx tsx --test test/questionnaire.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `questionnaire.ts` and the migration. Check the migration applies twice on a scratch Postgres 16 (as in earlier migrations: `/usr/lib/postgresql/16/bin`, cluster under `/var/tmp`, run as `postgres`, stub `profiles(id)` and `diagnostic_assessments(id)`).
- [ ] **Step 4: Run** the test → PASS; full suite green.
- [ ] **Step 5: Commit** — `"Pre-call questionnaire: model, defaults, validation and rules"`

### Task 2: Server routes and the link switch

**Files:**
- Create: `artifacts/api-server/src/routes/questionnaire.ts` (register in `routes/index.ts`)
- Modify: `artifacts/api-server/src/routes/diagnostic.ts` (create: `questionnaire` body field → validated snapshot, else master snapshot; never for roster diagnostics; list rows add `questionnaire_status`, `red_flags`; report returns `questionnaire`, `questionnaire_answers`, `questionnaire_submitted_at`)
- Modify: `artifacts/api-server/src/lib/consultation-service.ts:190` (`questionnaireUrl`: snapshot → `${appUrl()}/questionnaire/<diagnostic token>`, else legacy link)
- Modify: `artifacts/api-server/src/routes/consultations.ts` (~370: slots response `questionnaireUrl` uses the same rule)
- Test: `artifacts/api-server/test/questionnaire.test.ts` (add `questionnaireLinkFor` tests)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `questionnaireLinkFor(d: { token: string; questionnaire: unknown | null; pre_call_form_url: string | null }): string | null` (pure, in `questionnaire.ts`).
  - `GET /tutor/questionnaire` → `{ questionnaire, isDefault }`; `PUT /tutor/questionnaire { intro, items }` → validated → `{ questionnaire }`; 400 `{ error }`.
  - `GET /questionnaire/:token` (public) → `{ intro, items, senderName, studentName, submitted: boolean, open: boolean }`; 404 if no snapshot or roster diagnostic.
  - `POST /questionnaire/:token { answers }` → `{ ok: true }`; 400 invalid; 409 already submitted (conditional update on `questionnaire_submitted_at is null`); 410 closed.

- [ ] **Step 1: Failing tests** for `questionnaireLinkFor` (snapshot → built-in URL with encoded token; no snapshot + legacy → legacy; neither → null).
- [ ] **Step 2: Run → FAIL; implement; run → PASS.**
- [ ] **Step 3: Routes and the switch**, using `requireTutor` / admin client patterns from `routes/diagnostic.ts`; `questionnaireOpen` fed by the diagnostic's `cancelled_at` and its consultations (`tutoring_sessions where diagnostic_id = …`).
- [ ] **Step 4: Typecheck and suite** — `cd artifacts/api-server && npx tsc -p tsconfig.json --noEmit 2>&1 | grep -v health.ts; pnpm test` → clean; all pass.
- [ ] **Step 5: Commit** — `"Pre-call questionnaire: tutor and public routes; booking emails link the built-in form"`

### Task 3: Reminder and tutor notice

**Files:**
- Create: `artifacts/api-server/src/lib/questionnaire-emails.ts`
- Modify: `artifacts/api-server/src/lib/automated-emails.ts` (`EmailKind` adds `"questionnaire_reminder" | "questionnaire_done"`; new steps; header comment)
- Modify: `artifacts/api-server/src/lib/questionnaire.ts` (`dueQuestionnaireReminder`)
- Test: `artifacts/api-server/test/questionnaire-emails.test.ts`, `artifacts/api-server/test/questionnaire.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `formatCallTime`, `prospectSenderName`; job patterns and fake Supabase in `test/fake-supabase.ts` / `test/consultation-email-job.test.ts`.
- Produces:
  - `questionnaireReminderEmail(o: { to: "guest" | "parent"; tutorName: string; studentName: string; start: string; timeZone: string; url: string })`, `questionnaireDoneEmail(o: { tutorName: string; studentName: string; flagged: Array<{ question: string; answer: string }>; reportUrl: string })`.
  - `dueQuestionnaireReminder(o: { call: { scheduled_at: string; created_at: string } | null; submittedAt: string | null; remindedAt: string | null; now: number }): boolean` — true from start−24h until start, not submitted, not reminded, and the call was created ≥ 24h before its start.

- [ ] **Step 1: Failing tests:** emails never `/your tutor/i`; parent version names the student; done email lists flagged answers and links the report; `dueQuestionnaireReminder` boundaries (start−24h−1min false, start−23h59 true, after start false, created 20h before start false, submitted false, reminded false); one job-level test with the fake client: one reminder sent to guest and parent with Reply-To the tutor, a second run sends nothing.
- [ ] **Step 2–4:** FAIL → implement (claim with conditional update on `questionnaire_reminded_at is null`, release on non-blocked failure; tutor notice via `deliver` + `email_log` kind `questionnaire_done`, respecting unsubscribe) → PASS; typecheck + suite.
- [ ] **Step 5: Commit** — `"Email job: questionnaire reminder a day before; tell the tutor when answers arrive"`

### Task 4: The prospect's questionnaire page

**Files:**
- Create: `artifacts/gradefarm/src/components/QuestionnaireScreen.jsx` (`/questionnaire/:token`)
- Create: `artifacts/gradefarm/src/lib/questionnaireForm.js` + `questionnaireForm.test.js`
- Modify: `artifacts/gradefarm/src/App.jsx` (public route like `/book/:token`)
- Modify: `artifacts/gradefarm/src/lib/db.js` (public helpers)
- Modify: `artifacts/gradefarm/src/components/DiagnosticScreen.jsx` (when booking isn't offered and the diagnostic has a snapshot, show "Before your call, please fill in this short questionnaire" with the link instead of the legacy redirect)
- Modify: `artifacts/api-server/src/routes/diagnostic.ts` only if the public diagnostic GET needs a `questionnaire_url` field for that (pure `questionnaireLinkFor`)

**Interfaces:**
- Produces (tested): `draftKey(token)`, `loadDraft(token, storage = localStorage)`, `saveDraft(token, answers, storage)` (try/catch; never throw), `missingRequired(questionnaire, answers): string[]` (item ids), `toPayload(questionnaire, formState): Answers`.

- [ ] **Step 1: Failing tests** for the helpers (storage that throws → loadDraft returns {} and saveDraft is a no-op; round-trip; `missingRequired` with "Other" chosen but empty text counts as missing; `toPayload` shapes match Task 1's `validateAnswers`).
- [ ] **Step 2–3:** FAIL → implement → PASS; then the page: intro, sections as headings, required marks, inputs per type (`af-inp`; radios/checkboxes styled like existing choice chips on DiagnosticScreen), "Other" text field, inline "Please answer this" on Submit, server 400/409/410 messages, success "Thanks, that's sent to <Full name>.", submitted/closed states; draft saved on change and cleared on success.
- [ ] **Step 4: Build and test** — `cd artifacts/gradefarm && pnpm run build && pnpm test` (+ api-server suite if touched).
- [ ] **Step 5: Commit** — `"Prospect: pre-call questionnaire page"`

### Task 5: Tutor screens

**Files:**
- Create: `artifacts/gradefarm/src/components/QuestionnaireEditor.jsx` (shared editor: used by the tab and by "Edit for this student")
- Create: `artifacts/gradefarm/src/lib/questionnaireEdit.js` + `questionnaireEdit.test.js`
- Modify: `artifacts/gradefarm/src/components/TutorScreen.jsx` (`DiagnosticTab`: third sub-tab "Pre-call questionnaire"; create form section replacing "Pre-lesson questionnaire link"; rows: status chip + "Red flag" chip + expandable answers; report: answers section)
- Modify: `artifacts/gradefarm/src/lib/db.js`

**Interfaces:**
- Consumes: Task 2 routes and list/report fields.
- Produces (tested): `newItem(type)`, `moveItem(items, index, delta)`, `changeType(item, type)` (keeps label; adds/drops options), `newOption()`, `answerText(item, answer)` (display string incl. "Other: …"), `isFlagged(item, answer)`.

- [ ] **Step 1: Failing tests** for the helpers. FAIL → implement → PASS.
- [ ] **Step 2: Editor** — intro textarea; item list with type select, label, help, required toggle, options with red-flag toggle and remove, "Allow Other" toggle, move up/down, delete (`confirmDialog`), "Add question" / "Add section"; Save → PUT with server errors inline; "Reset to the basic set" (confirm) only in the tab.
- [ ] **Step 3: Create form** — "Pre-call questionnaire" section: summary ("N questions · from your questionnaire" / "edited for this student"), "Edit for this student" opens the editor on a copy, "Use my questionnaire" reverts; sends `questionnaire` on create. Remove the old link field from the UI.
- [ ] **Step 4: Rows and report** — chip "Questionnaire: not booked yet / waiting / filled in"; "Red flag" chip when `red_flags > 0`; expandable answers (questions in order, flagged answers highlighted with existing danger tokens); same block in the report view.
- [ ] **Step 5: Build and test** — `cd artifacts/gradefarm && pnpm run build && pnpm test`.
- [ ] **Step 6: Commit** — `"Tutor: questionnaire editor, tailor per student, answers and red flags"`
