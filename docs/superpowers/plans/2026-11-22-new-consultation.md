# New Consultation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tutor books a consultation first, chooses student and/or parent as recipients, ticks questionnaire and/or diagnostic, and each recipient gets one combined email; the prospect then behaves like any other.

**Architecture:** Every consultation gets a prospect record (a link `diagnostic_assessments` row, possibly with no test). A "primary recipient" (student if ticked, else parent) is stored in the existing single-address fields, with `prospect_is_parent` / `guest_is_parent` flags switching every email to parent wording. One new server route creates record + booking + emails; one adds a test later. UI: a New consultation modal and a "No test" row state.

**Tech Stack:** Express + TypeScript (`tsx --test`), Supabase Postgres, Resend, React/Vite (`node --test` for `src/lib`).

**Spec:** `docs/superpowers/specs/2026-11-22-new-consultation-design.md` (its "Primary recipient" section is binding).

## Global Constraints

- Primary recipient = student if "Send to student" ticked, else parent; parent copy only when both are ticked. A typed but unticked student email is not stored.
- Parent wording whenever the addressee is a parent (primary with the flag, or the copy): names the student, asks them to pass the test and questionnaire on; never asks the parent to fill them in.
- Never "your tutor"; tutor named in full; Reply-To the tutor's sign-in email; links via `appUrl()`; times in the recipient's zone (tutor's zone for tutor-made bookings).
- Email failures never undo the record or booking.
- Existing flows (Diagnostic-tab create, post-test booking, questionnaire, Present, sign-up) unchanged for records without the new flags and with a test.
- No personal details of the user in the repository (fixtures fictional).
- UI: existing tokens/patterns only (ConsultationModal, DiagnosticTab create form, QuestionnaireBlocks, ReminderEditor, `confirmDialog`).

## Review Focus

- Parent-only booking: the combined email, call reminders, reschedule/cancel, questionnaire reminder, diagnostic not-started reminder and Resend all reach the parent in parent wording (Task 1 tests per template; Task 2 job/route steps).
- Neither questionnaire nor test ticked: a record still exists and shows in the list; no questionnaire/test links anywhere (Task 2 tests on the link helpers).
- Duplicate family (same primary address with a live call): 409 with the booking time (Task 2 route step).
- A record without a test: public diagnostic routes 404, prospect reminders and "diagnostic done" skip it, list shows "No test" (Task 2 tests on status helpers).
- "Send a test" later reaches the right recipients in the right wording and can't be used on another tutor's or an already-tested record (Task 2 route step).

---

### Task 1: Data and email copy

**Files:**
- Create: `supabase/migrations/20261122000001_new_consultation.sql`
- Modify: `artifacts/api-server/src/lib/consultation-emails.ts` (add `consultationInviteEmail`)
- Modify: `artifacts/api-server/src/lib/prospect-emails.ts` (parent variants)
- Test: `artifacts/api-server/test/consultation-emails.test.ts`, `artifacts/api-server/test/prospect-emails.test.ts`

**Interfaces:**
- Produces:
  - Columns: `diagnostic_assessments.has_test boolean not null default true`, `diagnostic_assessments.prospect_is_parent boolean not null default false`, `tutoring_sessions.guest_is_parent boolean not null default false` (idempotent; `set local lock_timeout = '10s'`).
  - `consultationInviteEmail(o: { audience: "student" | "parent"; tutorName: string; studentName: string; start: string; timeZone: string; minutes: number; joinUrl: string; questionnaireUrl?: string | null; testUrl?: string | null }): { subject; content }` — one email with date/time (`formatCallTime`), join CTA, and a "Before the call" list of the questionnaire and/or test links when given (student: "please fill in / do"; parent: "<Student> has … — please pass these links on to them"; fallback "your child").
  - `prospectDiagnosticEmail` and `prospectReminderEmail` gain optional `audience?: "student" | "parent"` and `studentName?: string`; parent wording names the student and asks them to pass the link on.

- [ ] **Step 1: Failing tests:** invite email student vs parent wording (parent never "fill in this"/"you filled in", names the student, fallback "your child"); links present only when given; no links section when neither; never `/your tutor/i`; diagnostic and reminder parent variants; student variants unchanged (existing tests still pass).
- [ ] **Step 2: Run** `cd artifacts/api-server && npx tsx --test test/consultation-emails.test.ts test/prospect-emails.test.ts` → FAIL.
- [ ] **Step 3: Implement**; migration applies twice on a scratch Postgres 16 with stubs.
- [ ] **Step 4: Run** → PASS; full suite + typecheck clean.
- [ ] **Step 5: Commit** — `"New consultation: flags and combined email copy"`

### Task 2: Server routes and flag threading

**Files:**
- Modify: `artifacts/api-server/src/routes/consultations.ts` (new `POST /tutor/consultations/new`)
- Modify: `artifacts/api-server/src/routes/diagnostic.ts` (`POST /tutor/diagnostic/:id/add-test`; public GET/submit/start 404 when `has_test` false; list fields `has_test`, `prospect_is_parent`; resend wording)
- Modify: `artifacts/api-server/src/lib/consultation-service.ts` (`sendConsultationEmails` + `book` handle `guest_is_parent`), `src/lib/automated-emails.ts` (call reminders, questionnaire reminder, prospect reminder, diagnostic done honour the flags / `has_test`), `src/lib/prospect-status.ts` (status "no_test")
- Create/Modify tests: `test/new-consultation.test.ts` (pure helpers), existing job tests

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - Pure `newConsultationInput(body): { ok: { studentName, primary: { email, isParent }, parentCopy: string | null, start, reminderMinutes?, questionnaire: Questionnaire | null | "default", test: { yearLevel, subjects, questions } | null } } | { error: string }` — enforces the Global Constraints rules (≥1 ticked recipient, valid emails for ticked ones, start in the future, test shape via existing validators, questionnaire via `validateQuestionnaire`).
  - `POST /tutor/consultations/new` → `{ diagnosticId, sessionId, start, emailed: { student?: boolean, parent?: boolean } }`; 400 with the helper's error; 409 `{ error: "This family already has a call booked.", booking: { start } }` (unique index / `liveBooking` on the primary address); 409 slot taken. Creates the record (`has_test`, `prospect_is_parent`, questionnaire snapshot unless null, `sent_at` when a test is included), books with `guest_is_parent`, sends `consultationInviteEmail` (+ .ics, Reply-To) to the primary and the parent copy.
  - `POST /tutor/diagnostic/:id/add-test { yearLevel, subjects, questions }` → `{ emailed }`; only the caller's own link record with `has_test = false` (else 404/409); stores the test, sets `has_test` and `sent_at`, emails the diagnostic link (audience from the flag; parent copy if any).
  - `diagnosticStatus` returns `"no_test"` for `has_test = false` rows (before other states except finished/cancelled); prospect reminders, Resend and "diagnostic done" skip no-test rows; public diagnostic routes 404 for them.
  - Every guest-addressed email (booked/changed/cancelled/reminders/questionnaire reminder/diagnostic reminder/resend) uses the parent wording when `guest_is_parent` / `prospect_is_parent`.

- [ ] **Step 1: Failing tests** for `newConsultationInput` (no recipient ticked; ticked without email; parent-only → primary parent, no copy; both → primary student + copy; unticked student email dropped; past start; invalid test shape; questionnaire null vs default vs tailored) and for status/skip helpers (`no_test`).
- [ ] **Step 2–4:** FAIL → implement (routes + threading) → PASS; a job-level test with the fake client: parent-only call gets its reminder and questionnaire reminder addressed to the parent in parent wording; typecheck + full suite.
- [ ] **Step 5: Commit** — `"New consultation: book first, send what's ticked; parent-primary flows"`

### Task 3: Tutor screens

**Files:**
- Create: `artifacts/gradefarm/src/components/NewConsultationModal.jsx`
- Create: `artifacts/gradefarm/src/lib/newConsultation.js` + `newConsultation.test.js`
- Modify: `artifacts/gradefarm/src/components/SessionsTab.jsx` (button next to Consultation settings; refresh after create)
- Modify: `artifacts/gradefarm/src/components/TutorScreen.jsx` (DiagnosticTab: extract the generate → preview test builder into a reusable piece if needed, behaviour unchanged; rows: "No test" chip + "Send a test" using that builder; "Parent contact" hint when `prospect_is_parent`)
- Modify: `artifacts/gradefarm/src/components/SignUpModal.jsx` / `src/lib/signUp.js` (parent-primary record → opens in parent mode with the parent's email and the student's first name)
- Modify: `artifacts/gradefarm/src/lib/db.js`

**Interfaces:**
- Consumes: Task 2 routes and list fields (`has_test`, `prospect_is_parent`, `status_label: "no_test"`).
- Produces (tested): `recipientsError(form): string | null`, `newConsultationBody(form): object` (exactly the route's body), `statusChip('no_test')` → `{ label: 'No test', tone: 'muted' }`, `signUpDefaults` parent-primary case.

- [ ] **Step 1: Failing tests** for the helpers. FAIL → implement → PASS.
- [ ] **Step 2: Modal** — Who (name; student email + "Send to student"; parent email + "Send to parent"); When (open times / Pick any time, tutor's zone label, reminders editor); What (meeting details shown as always included; "Pre-call questionnaire" tick + Edit for this student; "Diagnostic test" tick → year level, subject, topics, Generate → preview, as the Diagnostic tab); Send; inline errors (incl. 409 family already booked with its time); success summary of who was emailed.
- [ ] **Step 3: Rows** — "No test" chip and "Send a test" (generate → preview → send) for `has_test` false; sign-up parent-primary prefill.
- [ ] **Step 4: Build and test** — `cd artifacts/gradefarm && pnpm run build && pnpm test`; existing Diagnostic-tab create flow unchanged.
- [ ] **Step 5: Commit** — `"Lessons: New consultation — book first, send what's ticked"`
