# Send diagnostics by email and track prospects

Project 2 of 5 in the prospect-consultation work. Flow: diagnostic → booked
consultation call → pre-call questionnaire → call → sign-up. Project 1 (topic
picker) is done. Project 3 adds booking and each tutor's own editable
questionnaire (sent with the booking confirmation; new tutors start from a
basic neutral set; the platform owner's own form is loaded into their account
only). Project 4: call report and conversion. Project 5: Google Calendar OAuth.

## Why

A tutor sends a prospect (a student who isn't theirs yet) a diagnostic from the
Diagnostic tab before a consultation call. Today the tutor copies a link and
sends it themselves: the app never learns who the prospect is (only a typed
name), never emails them, and never tells the tutor when they finish. The
"diagnostic done" email and reminders cover only roster students' diagnostics
(`student_id` set).

## Goals

- When creating a diagnostic, the tutor can enter the prospect's name and email
  (the student's own; students do the test, not parents). Email is optional:
  copy-link still works.
- With an email, the app emails the prospect the link straight away.
- One reminder if they haven't started 2 days after it was sent, during the
  day (Adelaide), as other reminders.
- The tutor can resend the email or cancel the test.
- The tutor is emailed when the prospect finishes: score and a link to the
  report.
- The Diagnostic tab's list shows each diagnostic's status — sent, opened, in
  progress, finished, expired, cancelled — with name, email, subject, score
  once finished, and when it was sent.

## Wording (decided)

- Never call the sender the prospect's tutor: they aren't until after the call.
  Use the sender's full name (`profiles.display_name`, which holds full names
  for the active tutors).
- Prospect email, e.g.: "<Full name> has sent you a diagnostic test for VCE
  Mathematical Methods Units 1/2. It takes about 30–45 minutes, and the results
  will be gone through with you on your consultation call."
- The test page's finish screen for link diagnostics: "<Full name> will go
  through your answers with you on your call." (no "Your tutor" fallback; with
  no name: "Your answers will be gone through with you on your call.").
  Roster students' diagnostics keep their wording.

## Non-goals

- Booking, the questionnaire (project 3); the call report and conversion
  (project 4).
- Editing/regenerating single questions, templates, test length.
- Saving progress mid-test (the test is still answered in one sitting).

## Anti-goals

- Emails that read as if the sender is already the prospect's tutor.
- Breaking copy-link diagnostics, roster students' diagnostics, or existing
  reports.
- Emailing an address that bounced or reported spam (sendEmail already
  refuses those).

## Approaches

1. **Columns on `diagnostic_assessments` (chosen).** A link diagnostic already
   is the prospect record; add the email and timestamps to it. Status is
   derived from the timestamps. Smallest change, and project 4 converts a
   prospect from this row.
2. A separate `prospects` table that diagnostics hang off. Better once one
   prospect has several diagnostics, bookings and questionnaires, but that's
   speculative before project 3; it can be introduced then by backfilling
   from these columns.
3. Keep it all client-side (mailto: links). No reminders, no "finished"
   notification; doesn't meet the goals.

## Design

- **Data** (migration): `diagnostic_assessments` gains `prospect_email text`,
  `sent_at`, `opened_at`, `started_at`, `reminded_at`, `cancelled_at`
  (timestamptz). A diagnostic expires 30 days after `sent_at` (or
  `created_at` for copy-link ones) if not finished.
- **Status** (pure function, tested): finished if completed; else cancelled;
  else expired; else in progress if started; else opened if opened; else
  sent (or "link" when there is no email).
- **Create** (`POST /tutor/diagnostic/create`): optional `prospectEmail`
  (validated). If present, saves it, sends the prospect email, sets `sent_at`.
  A send failure doesn't lose the diagnostic: it's saved and the tutor sees the
  error with a Resend button.
- **Resend / cancel**: `POST /tutor/diagnostic/:id/resend` (only the tutor who
  set it; pending, not cancelled; resets `sent_at` and `reminded_at`, so the
  30 days and the reminder start again) and `POST /tutor/diagnostic/:id/cancel`
  (pending only; sets `cancelled_at`).
- **Test page**: `GET /diagnostic/:token` sets `opened_at` once for link
  diagnostics and refuses cancelled or expired ones with a clear message;
  `POST /diagnostic/:token/start` sets `started_at` once when the student
  starts; submit refuses cancelled or expired ones.
- **Automated emails** (`/api/cron/emails`, every 15 minutes):
  - `prospect_reminder`: link diagnostics with an email, not started, not
    cancelled, sent 2+ days ago and not expired, not yet reminded; claimed with
    `reminded_at` (the prospect has no account, so no `email_log` row — as
    invite reminders do). Daytime only.
  - `diagnostic_done` also covers link diagnostics: the setting tutor only,
    via `email_log` as now.
- **Tutor UI**: name + email fields on the create form (email optional,
  student's own); after creating, the confirmation says whether the email was
  sent; the list gains status, email and Resend / Cancel.

## Left to the builder

- Exact copy of the reminder and the tutor's "finished" email, within the
  wording rules above.
- List layout details.
