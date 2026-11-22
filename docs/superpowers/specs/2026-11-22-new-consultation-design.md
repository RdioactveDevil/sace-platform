# New consultation: book first, send what's ticked

Follow-on to projects 1–4. Today a tutor-booked call must hang off an existing
diagnostic (`POST /tutor/consultations` needs `diagnosticId`), the diagnostic
email goes out first, and every email speaks to the student. The user books
consultations with parents directly and wants one step: pick the time, choose
who gets it, tick what to send.

## Goals

1. **"New consultation"** button in the Lessons tab (next to Consultation
   settings) opening one form:
   - **Who:** student's name (required); student's email + "Send to student"
     tick; parent's email + "Send to parent" tick. At least one recipient
     ticked; a ticked recipient needs a valid email.
   - **When:** the tutor's open times, or "Pick any time" (as the existing
     consultation modal). Reminders: the tutor's defaults, editable for this
     call (existing ReminderEditor).
   - **What to send:** meeting details (always); "Pre-call questionnaire"
     (ticked by default, with "Edit for this student"); "Diagnostic test"
     (ticked by default — when ticked, year level, subject and topics are
     chosen and the test generated and previewed exactly as on the Diagnostic
     tab before sending).
   - **Send:** creates everything and emails each ticked recipient once.
2. **One email per recipient** containing: date and time in the recipient's
   zone (tutor's zone for tutor-made bookings, as today), the guest join link,
   the questionnaire link (if ticked), the diagnostic link (if ticked), with
   the calendar invite attached. Student version speaks to the student; parent
   version names the student and asks them to pass the test and questionnaire
   on (one-submission forms meant for the student). Reply-To the tutor. Never
   "your tutor". No separate diagnostic-invite or booking-confirmation email
   for this flow (the combined email replaces both).
3. **Afterwards it behaves like any other prospect:** the prospect record
   appears in Sent diagnostics with booking, questionnaire status and red
   flags; reminders (call reminders, the questionnaire reminder) go to the
   ticked recipients; Present works once the test is finished; "Sign them up"
   works as usual.
4. **No test:** if the diagnostic wasn't ticked, the row shows a "No test" chip
   and a "Send a test" action that runs the usual generate → preview → send
   for that same record (it emails the diagnostic link to the ticked
   recipients, parent version wording as above).

## Approach (decided)

Every consultation gets a **prospect record** — a `diagnostic_assessments`
link row (student_id null) — even without a test, so the questionnaire,
booking, reminders, list, Present and sign-up keep working unchanged. A
separate record type for test-less calls was rejected: it would duplicate
questionnaire storage, routes and list logic.

## Design

- Migration: `diagnostic_assessments.has_test boolean not null default true`
  (false = prospect record without a test yet). Public diagnostic routes
  return 404 for `has_test = false` (no test to take). Status rules: a row
  with no test shows "No test" in the list instead of sent/opened/…;
  prospect reminders and "diagnostic done" skip rows without a test.
- **Primary recipient** (builder-check call). Every existing prospect flow is
  keyed on one address (`prospect_email` / `guest_email`: reminders, resend,
  status, duplicate check, emails). So each consultation has a primary
  recipient: the student if "Send to student" is ticked, else the parent.
  - Student ticked: `prospect_email` = `guest_email` = student; if "Send to
    parent" is also ticked, `parent_email` = `guest_parent_email` = parent
    (today's copy-to-parent behaviour).
  - Parent only: `prospect_email` = `guest_email` = parent, with new flags
    `diagnostic_assessments.prospect_is_parent` and
    `tutoring_sessions.guest_is_parent` = true; `parent_email` /
    `guest_parent_email` null.
  - A typed but unticked student email is not stored.
  - Wherever an email goes to the primary recipient and the flag is set, the
    parent wording is used (names the student, "please pass this on"): the
    combined email, call reminders, reschedule/cancel emails, the
    questionnaire reminder, the diagnostic's 2-day not-started reminder,
    Resend, and "Send a test" later. New parent variants are added for the
    diagnostic email and its reminder; the consultation and questionnaire
    emails already have parent versions.
  - Duplicates: the existing unique index (tutor + lower(guest_email), live
    calls) applies to the primary address; the route returns 409 "This family
    already has a call booked." with the booking's time.
  - Reschedule / cancel emails keep today's content (no diagnostic link) and
    follow the flags above.
  - Sign-up from a parent-primary record opens the form in "send to a parent"
    mode with the parent's email and the student's first name.
- `POST /tutor/consultations/new { studentName, studentEmail?, sendToStudent,
  parentEmail?, sendToParent, start, reminderMinutes?, questionnaire?:
  Questionnaire | null /* null = don't send */, test?: { yearLevel, subjects,
  questions } | null }`:
  validate → insert the prospect record (snapshot questionnaire unless null;
  `has_test` from `test`) → `book_consultation` (existing) → send the combined
  email to each ticked recipient → `sent_at` set when a test was sent. Email
  failures never undo the booking (as today); the response reports which
  emails went.
- `POST /tutor/diagnostic/:id/add-test { yearLevel, subjects, questions }` for
  the tutor's own `has_test = false` record: stores the test, sets
  `has_test`, `sent_at`, emails the diagnostic link to the ticked recipients
  (student wording / parent wording).
- Questionnaire with no test: the questionnaire link and page work as today
  (keyed on the record's token); "Questionnaire" ticked off → snapshot null →
  no link anywhere.
- A record with neither a test nor a questionnaire is still created (it holds
  the booking and shows in the list).

## Non-goals

- Changing the existing Diagnostic-tab create flow or the post-test booking
  flow.
- Group consultations; several students per call.

## Anti-goals

- A parent receiving a "please fill this in" for the student's one-submission
  forms worded as if the parent should do it.
- Anything prospect-facing calling the sender their tutor.
- Breaking the existing prospect flows (diagnostic → book → questionnaire →
  Present → sign-up).

## Left to the builder

- Exact modal layout within the existing styles (ConsultationModal,
  DiagnosticTab create form, QuestionnaireBlocks); whether the test step is
  inline or a second step in the same modal.
