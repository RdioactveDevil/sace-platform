# Prospect Diagnostic Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tutor can email a diagnostic to a prospect, the prospect gets one reminder, the tutor is told when they finish, and the Diagnostic tab shows each diagnostic's status with Resend / Cancel.

**Architecture:** New columns on `diagnostic_assessments` hold the prospect's email and lifecycle timestamps; a pure status helper derives the status from them. Email copy lives in a pure module (`lib/prospect-emails.ts`). Routes in `routes/diagnostic.ts` send, resend, cancel and record opened/started; the 15-minute email job (`lib/automated-emails.ts`) adds the prospect reminder and extends "diagnostic done" to link diagnostics. The client adds the fields, statuses and buttons, and rewords the test page.

**Tech Stack:** Express + TypeScript (api-server, `tsx --test`), Supabase Postgres, Resend (via `sendEmail`), React/Vite (gradefarm, `node --test`).

**Spec:** `docs/superpowers/specs/2026-11-21-prospect-diagnostic-emails-design.md`

## Global Constraints

- Never call the sender the prospect's tutor in anything a link-diagnostic prospect sees; use the sender's full name (`profiles.display_name`, trimmed).
- Prospect email copy: "<Full name> has sent you a diagnostic test for <subject>. It takes about 30–45 minutes, and the results will be gone through with you on your consultation call."
- Finish screen (link diagnostics): "<Full name> will go through your answers with you on your call." With no name: "Your answers will be gone through with you on your call."
- Roster students' diagnostics (`student_id` set) keep all current wording and behaviour.
- Reminder: once, 2 days after `sent_at`, not started, daytime Adelaide only (`daytime(job)`).
- Expiry: 30 days after `sent_at` (or `created_at` without one), unless finished.
- Email is optional; copy-link diagnostics keep working.
- Email validation: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, max 254 chars, stored lower-cased and trimmed.

## Review Focus

- A send failure on create (Resend down, blocked address): the diagnostic is still saved and the tutor sees it wasn't sent, with Resend (Task 3 route step; Task 5 UI step).
- Resend on a cancelled, finished or expired diagnostic is refused; resend restarts the 30 days and allows one more reminder (Task 1 tests on `canResend`).
- A prospect opening an old, cancelled or expired link sees a clear message, not a blank page or a stack trace, and can't submit (Task 1 `unavailableReason` tests; Task 3 route step).
- Two cron runs at once don't send two reminders (claim with `reminded_at` as invite reminders do; Task 4 step).
- The tutor of a roster student never gets two "done" emails for one diagnostic, and other roster tutors aren't emailed about a prospect (Task 4 test on `doneRecipients`).

---

### Task 1: Columns and status rules

**Files:**
- Create: `supabase/migrations/20261121000002_prospect_diagnostics.sql`
- Create: `artifacts/api-server/src/lib/prospect-status.ts`
- Test: `artifacts/api-server/test/prospect-status.test.ts`

**Interfaces:**
- Produces:
  - Columns on `diagnostic_assessments`: `prospect_email text`, `sent_at`, `opened_at`, `started_at`, `reminded_at`, `cancelled_at` (all `timestamptz`, nullable). Partial index on `(sent_at) where prospect_email is not null and status = 'pending'` for the reminder job.
  - `type ProspectRow = { status: "pending" | "completed"; student_id: string | null; prospect_email: string | null; created_at: string; sent_at: string | null; opened_at: string | null; started_at: string | null; reminded_at: string | null; cancelled_at: string | null }`
  - `const PROSPECT_TTL_MS = 30 days`, `const PROSPECT_REMINDER_AFTER_MS = 2 days`
  - `diagnosticStatus(row: ProspectRow, now: Date): "finished" | "cancelled" | "expired" | "in_progress" | "opened" | "sent" | "link"`
  - `unavailableReason(row: ProspectRow, now: Date): string | null` — message for the test page, null when it can be taken. Roster diagnostics (`student_id` set) never expire here.
  - `canResend(row: ProspectRow, now: Date): boolean` — has an email and status is sent, opened or in progress, or expired. (Resend revives an expired one.)
  - `dueForProspectReminder(row: ProspectRow, now: Date): boolean`

- [ ] **Step 1: Write the failing tests** (`prospect-status.test.ts`), with a `row(overrides)` helper defaulting to a pending link diagnostic created and sent `2026-11-01T00:00:00Z`:
  - finished beats everything: `status: "completed"` + `cancelled_at` → `"finished"`.
  - cancelled → `"cancelled"`; 31 days after `sent_at` → `"expired"`; 29 days → not expired.
  - expiry runs from `sent_at` when set, else `created_at`; a row with `student_id` never shows `"expired"`.
  - `started_at` → `"in_progress"`; `opened_at` only → `"opened"`; email only → `"sent"`; no email → `"link"`.
  - `unavailableReason`: cancelled → `"This diagnostic was cancelled."`; expired → `"This link has expired. Ask the person who sent it for a new one."`; pending and in time → `null`.
  - `canResend`: true for sent/opened/in_progress/expired with an email; false for finished, cancelled, or no email.
  - `dueForProspectReminder`: true at 2 days + 1 minute after `sent_at`, not started, not reminded, not cancelled, not expired, has email; false at 47 hours; false once `reminded_at`, `started_at` or `cancelled_at` is set; false without email; false for a roster row.

- [ ] **Step 2: Run to verify it fails**

Run: `cd artifacts/api-server && npx tsx --test test/prospect-status.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `prospect-status.ts`** (pure; no imports beyond types).

- [ ] **Step 4: Run to verify it passes**

Run: `cd artifacts/api-server && npx tsx --test test/prospect-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the migration** (additive `add column if not exists`, the partial index, `set local lock_timeout = '10s'`, header comment in the style of `20261025000001_student_diagnostics.sql`). Check it applies to a scratch Postgres with a stub `diagnostic_assessments (id uuid, status text, prospect_email …)` table twice in a row (idempotent).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261121000002_prospect_diagnostics.sql artifacts/api-server/src/lib/prospect-status.ts artifacts/api-server/test/prospect-status.test.ts
git commit -m "Prospect diagnostics: email and lifecycle columns, status rules"
```

### Task 2: Email copy

**Files:**
- Create: `artifacts/api-server/src/lib/prospect-emails.ts`
- Test: `artifacts/api-server/test/prospect-emails.test.ts`

**Interfaces:**
- Consumes: `type EmailContent` from `lib/email.ts`; `studentSummary()` return shape from `lib/student-diagnostic.ts` (`{ percentage, band, strong, work_on, practise }`).
- Produces (each returns `{ subject: string; content: EmailContent }`):
  - `prospectDiagnosticEmail(o: { senderName: string; subject: string; link: string })`
  - `prospectReminderEmail(o: { senderName: string; subject: string; link: string })`
  - `prospectFinishedEmail(o: { tutorName: string; prospectName: string; subject: string; summary: { percentage: number; band: string; strong: string[]; work_on: string[] }; link: string })`

- [ ] **Step 1: Write the failing tests**
  - `prospectDiagnosticEmail({ senderName: "Sam Tutor", subject: "VCE Mathematical Methods Units 1/2", link: "https://x/d/t" })`: first paragraph equals the Global Constraints copy exactly with those values; `cta.url` is the link; subject contains `"Sam Tutor"` and the subject name.
  - Neither prospect email (subject, paragraphs, footer, heading) matches `/your tutor|tutoring with/i`.
  - Reminder: one reminder wording; footer contains `"This is the only reminder"`.
  - `prospectFinishedEmail`: subject `"<prospectName> finished their <subject> diagnostic: <pct>%"`; details include Score; footer explains they're getting it because they sent the diagnostic.
  - Rendering with `renderEmail` escapes a name containing `<b>`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd artifacts/api-server && npx tsx --test test/prospect-emails.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `prospect-emails.ts`.** No unsubscribe link on prospect emails (they have no account; same as invite reminders); footer says who sent it and that they can ignore it if they don't know the sender.

- [ ] **Step 4: Run to verify it passes**

Run: `cd artifacts/api-server && npx tsx --test test/prospect-emails.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/prospect-emails.ts artifacts/api-server/test/prospect-emails.test.ts
git commit -m "Prospect diagnostic emails: send, reminder, finished"
```

### Task 3: Routes

**Files:**
- Modify: `artifacts/api-server/src/routes/diagnostic.ts`
- Test: `artifacts/api-server/test/prospect-status.test.ts` (add `normaliseProspectEmail` tests)
- Modify: `artifacts/api-server/src/lib/prospect-status.ts` (add `normaliseProspectEmail`)

**Interfaces:**
- Consumes: Task 1 (`diagnosticStatus`, `unavailableReason`, `canResend`), Task 2 (`prospectDiagnosticEmail`), `sendEmail`, `getResend`, `appUrl` from `lib/email.ts`.
- Produces:
  - `normaliseProspectEmail(raw: unknown): { email: string | null } | { error: string }` — empty/undefined → `{ email: null }`; invalid → `{ error: "Enter a valid email address." }`; else trimmed lower-case.
  - `POST /tutor/diagnostic/create` accepts `prospectEmail?: string`; response adds `emailed: boolean` and `emailError?: string`.
  - `POST /tutor/diagnostic/:id/resend` → `{ ok: true }` | 4xx `{ error }`. `POST /tutor/diagnostic/:id/cancel` → `{ ok: true }` | 4xx.
  - `GET /tutor/diagnostic/list` rows add `prospect_email`, `sent_at`, `status_label` (= `diagnosticStatus`), `can_resend`.
  - `GET /diagnostic/:token` → 410 `{ error: unavailableReason }` when unavailable; response adds `sender_name` (full display name) for link diagnostics.
  - `POST /diagnostic/:token/start` → `{ ok: true }`.

- [ ] **Step 1: Write the failing `normaliseProspectEmail` tests** (`""`, `"  "`, `undefined` → null; `"Sam@Example.COM "` → `"sam@example.com"`; `"not-an-email"` and a 255-char address → error).

- [ ] **Step 2: Run to verify they fail**, then implement, then run to verify they pass.

Run: `cd artifacts/api-server && npx tsx --test test/prospect-status.test.ts`
Expected: FAIL, then PASS.

- [ ] **Step 3: Wire the routes.**
  - Create: validate the email first (400 on error). Insert with `prospect_email` and, when there is one, send `prospectDiagnosticEmail` (sender = the tutor's trimmed `display_name` from `requireTutor` ctx's `tutorName`; subject = `subjects[0].name`; link = the existing `${origin}/diagnostic/${token}`). On success set `sent_at = now`. On failure keep the row, leave `sent_at` null, return `emailed: false, emailError`.
  - Resend: tutor must be the setter (`tutor_id = tutorId`), `canResend` true; send, then set `sent_at = now, reminded_at = null`. 404 if not theirs, 409 `{ error: "This diagnostic can't be resent." }` otherwise.
  - Cancel: setter only, `status = 'pending'` and not cancelled → set `cancelled_at`. 409 otherwise.
  - List: add the fields (select the new columns too).
  - `GET /diagnostic/:token`: for pending link rows (`student_id` null), 410 when `unavailableReason` is set; set `opened_at = now` where `opened_at is null` (fire-and-forget, errors logged). Add `sender_name`.
  - `POST /diagnostic/:token/start`: link rows only; sets `started_at` where null; 410 when unavailable.
  - Submit: 410 when `unavailableReason` is set (link rows).

- [ ] **Step 4: Typecheck and run the suite**

Run: `cd artifacts/api-server && npx tsc -p tsconfig.json --noEmit 2>&1 | grep -v "health.ts" ; pnpm test`
Expected: no errors besides the known `health.ts` TS6305; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/diagnostic.ts artifacts/api-server/src/lib/prospect-status.ts artifacts/api-server/test/prospect-status.test.ts
git commit -m "Diagnostics: email prospects, resend, cancel, opened and started"
```

### Task 4: Reminder and "finished" emails in the email job

**Files:**
- Modify: `artifacts/api-server/src/lib/automated-emails.ts` (`EmailKind`, `runDiagnosticDone` ~line 833, steps list ~line 1083, header comment)
- Modify: `artifacts/api-server/src/lib/prospect-status.ts` (add `doneRecipients`)
- Test: `artifacts/api-server/test/prospect-status.test.ts`

**Interfaces:**
- Consumes: Task 1 `dueForProspectReminder`, Task 2 `prospectReminderEmail`, `prospectFinishedEmail`.
- Produces:
  - `doneRecipients(setterId: string, studentId: string | null, rosterTutorIds: string[] | undefined): string[]` — link diagnostic (no student) → `[setterId]`; roster diagnostic → setter plus roster tutors, de-duplicated.
  - `EmailKind` gains `"prospect_reminder"`.

- [ ] **Step 1: Write the failing `doneRecipients` tests** (link → setter only even if a roster list is passed; roster → setter + others, setter once).

- [ ] **Step 2: Run to verify they fail**, implement, run to verify they pass.

Run: `cd artifacts/api-server && npx tsx --test test/prospect-status.test.ts`
Expected: FAIL, then PASS.

- [ ] **Step 3: `runProspectReminders(job)`**, modelled on `runInviteReminders`: daytime only; select pending rows with `prospect_email` not null, `student_id` null, `reminded_at` null, `started_at` null, `cancelled_at` null, `sent_at` between now − 30 days and now − 2 days; filter with `dueForProspectReminder`; claim by setting `reminded_at` where still null; send `prospectReminderEmail` with sender = the setting tutor's name from `loadRecipients`; on failure clear `reminded_at`. Add it to `steps` after "diagnostic reminders".

- [ ] **Step 4: Extend `runDiagnosticDone`** to also select completed link diagnostics (drop the `student_id not null` filter; select `submitted_by_name, student_name, prospect_email`), recipients from `doneRecipients`; link rows use `prospectFinishedEmail` with `prospectName = submitted_by_name || student_name || prospect_email || "Your prospect"`; roster rows keep today's email.

- [ ] **Step 5: Typecheck and run the suite**

Run: `cd artifacts/api-server && npx tsc -p tsconfig.json --noEmit 2>&1 | grep -v "health.ts" ; pnpm test`
Expected: no new errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/automated-emails.ts artifacts/api-server/src/lib/prospect-status.ts artifacts/api-server/test/prospect-status.test.ts
git commit -m "Email job: remind prospects once; tell the tutor when a prospect finishes"
```

### Task 5: Tutor Diagnostic tab

**Files:**
- Modify: `artifacts/gradefarm/src/lib/db.js` (~line 2062: `createDiagnosticAssessment` takes `prospectEmail`; add `resendDiagnostic(id)`, `cancelDiagnostic(id)`)
- Modify: `artifacts/gradefarm/src/components/TutorScreen.jsx` (`DiagnosticTab`)
- Create: `artifacts/gradefarm/src/lib/diagnosticStatus.js` + `diagnosticStatus.test.js`

**Interfaces:**
- Consumes: Task 3 response fields (`emailed`, `emailError`, `status_label`, `can_resend`, `prospect_email`, `sent_at`).
- Produces: `statusChip(statusLabel: string): { label: string; tone: 'muted' | 'gold' | 'success' | 'danger' }` — sent → "Sent"/muted, link → "Link only"/muted, opened → "Opened"/gold, in_progress → "In progress"/gold, finished → "Finished"/success, expired → "Expired"/danger, cancelled → "Cancelled"/muted; unknown → its own text/muted.

- [ ] **Step 1: Failing tests for `statusChip`** (each mapping above; unknown passthrough). Run `cd artifacts/gradefarm && node --test src/lib/diagnosticStatus.test.js` → FAIL; implement; → PASS.

- [ ] **Step 2: Form.** Rename "Student name" to "Student's name"; add "Student's email (optional)" with helper text "We'll email them the link. Use the student's own email." Client-side check with the same regex before Generate.

- [ ] **Step 3: Created step.** If `emailed`: "Sent to <email>." plus the link to copy. If an email was given but `emailed` is false: show `emailError` and a Resend button. With no email: today's copy-link screen.

- [ ] **Step 4: List.** Each row shows name, email (if any), subject, a status chip from `statusChip`, score when finished, sent date; Resend when `can_resend`, Cancel when status is sent/opened/in_progress/link. Confirm Cancel with `confirmDialog`. Refresh the list after either.

- [ ] **Step 5: Build and test**

Run: `cd artifacts/gradefarm && pnpm run build && pnpm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add artifacts/gradefarm/src/lib/db.js artifacts/gradefarm/src/components/TutorScreen.jsx artifacts/gradefarm/src/lib/diagnosticStatus.js artifacts/gradefarm/src/lib/diagnosticStatus.test.js
git commit -m "Diagnostic tab: email the prospect, statuses, resend and cancel"
```

### Task 6: The test page a prospect sees

**Files:**
- Modify: `artifacts/gradefarm/src/components/DiagnosticScreen.jsx`
- Modify: `artifacts/gradefarm/src/lib/db.js` (add `startDiagnostic(token)`; `loadDiagnosticByToken` surfaces a 410's `error` text)

**Interfaces:**
- Consumes: Task 3 (`sender_name`, 410 messages, `POST /diagnostic/:token/start`).

- [ ] **Step 1: Wording (link diagnostics only, `!linked`), exact copy from Global Constraints:**
  - Intro: replace "`<tutorFirst || 'Your tutor'>` gets your answers to plan your lessons." with "`<sender_name>` will go through your answers with you on your call." (no-name variant from Global Constraints).
  - `SubmittedScreen`: "Sent to `<sender_name>`" (no name: "Sent"); body uses the finish-screen copy; the pre-call-form line says "to help `<sender_name>` prepare for your call".
  - Roster (`linked`) wording unchanged.

- [ ] **Step 2: Start.** When a link diagnostic moves from intro to test, call `startDiagnostic(token)` once (ignore errors).

- [ ] **Step 3: Unavailable.** A 410 shows the error phase with the server's message under the heading "This diagnostic isn't available" (no "Check the link with your tutor").

- [ ] **Step 4: Build and test**

Run: `cd artifacts/gradefarm && pnpm run build && pnpm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add artifacts/gradefarm/src/components/DiagnosticScreen.jsx artifacts/gradefarm/src/lib/db.js
git commit -m "Diagnostic page: no 'your tutor' for prospects; started, cancelled and expired"
```
