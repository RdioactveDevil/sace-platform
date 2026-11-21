# Call report (Present view) and signing a prospect up

Project 4 of the prospect-consultation work. Flow: diagnostic (1–2) → booked
call (3a) → pre-call questionnaire (3b) → **the call and sign-up (this)**.

## Why

On the consultation call the tutor screen-shares the prospect's diagnostic
results with the student (and often a parent) and talks through strengths and
weaknesses; next steps are the tutor's own conversation (no plan section). The
existing report is built for the tutor alone and sits next to things a
prospect must not see (questionnaire red flags and answers, the AI's notes for
the tutor). After the call, if the prospect signs up, the tutor wants one click
to invite them, and the consultation diagnostic should carry into their account
instead of a second test.

## Goals

1. **Present view** for a completed link diagnostic: full screen, site style,
   readable when screen-shared. Shows, top to bottom:
   - student name · subject; "Diagnostic results"
   - score % and band (kept, per the user)
   - "Strong at" and "To work on" topics (from the report's topic breakdown:
     ≥ 75% strong, < 60% to work on — the same thresholds as studentSummary)
   - a bar per topic with its %, tap to expand its subtopics with their %
   - score by difficulty: Easy / Core / Exam-style as "n/m"
   - question by question, collapsed: each opens on click to show the
     question, the student's answer and the correct answer (rendered with the
     existing MathText), marked right/wrong.
   Never shown: questionnaire answers, red flags, pain points / patterns /
   recommendations, the tutor's controls. An "Exit" button returns to the
   tutor's report.
2. **Sign them up**: a "Sign them up" button on a prospect's row (finished
   link diagnostics) and on the tutor's report view (not inside Present). It
   opens the existing student invite form (Students tab's add form, or the
   same form component in a modal) prefilled: email = the diagnostic's
   prospect email; subject = the diagnostic's curriculum, included (only if
   the tutor can include subjects and the diagnostic has a curriculum); parent
   email shown as a hint for the existing "send to a parent" option. The tutor
   reviews and sends.
3. **Carry the diagnostic across.** The invite records the diagnostic
   (`tutor_invites.source_diagnostic_id`). On accept, for that diagnostic's
   curriculum, the consultation diagnostic is adopted as the student's
   diagnostic for that subject (sets `student_id` on it) instead of creating a
   new one — so practice unlocks immediately. If the student already has a
   diagnostic for that subject (existing account), it's left as is and no new
   one is created for that subject.
4. **Status on the prospect's row**: "Invited" once an invite references the
   diagnostic and is pending; "Signed up" once accepted (the row then shows the
   student's name).
5. Built-in (non-curriculum) diagnostics: the invite goes out with no subject;
   nothing is adopted.

## Non-goals

- A next-steps / plan section; payments; contracts.
- Changing how normal invites work for anyone else.

## Anti-goals

- Anything a prospect could see on the Present view that's meant for the tutor.
- A signed-up student having to sit a second diagnostic for the same subject.
- Breaking existing invite, roster and diagnostic flows.

## Approaches

Reuse the existing invite (chosen): one sign-up path, existing reminders,
parent handling and included subjects. A separate conversion flow would
duplicate the invite system; making them sit a fresh diagnostic throws away the
one used on the call.

## Design notes

- Migration `20261121000005_invite_source_diagnostic.sql`: `tutor_invites.
  source_diagnostic_id uuid references diagnostic_assessments(id) on delete set
  null`.
- `POST /tutor/invites` accepts optional `sourceDiagnosticId` (must be the
  caller's own completed link diagnostic; else 400); stored on the invite.
- Accept (`routes/invites.ts` ~574): for each included curriculum, if it equals
  the source diagnostic's `curriculum_id`, adopt it: update the diagnostic set
  `student_id`, `student_name` (if empty) where `id` = source and `student_id
  is null`; if a diagnostic for (student, curriculum) already exists, skip
  (unique index); otherwise `createStudentDiagnostic` as today. A pure helper
  decides per curriculum: "adopt" | "keep-existing" | "create".
- Adopted diagnostics keep their 30-mark link-diagnostic questions and report;
  `studentSummary` already works on them. After adoption the row is a roster
  diagnostic (`student_id` set): the prospect-only behaviour (questionnaire,
  reminders, booking) stops, as roster rules already exclude it.
- The diagnostics list adds `signup: null | { status: 'invited' | 'signed_up',
  studentName? }` per link diagnostic (from tutor_invites by
  source_diagnostic_id).
- Present view is a client component reading the existing report response
  (`GET /tutor/diagnostic/:id/report`), using only report fields (score,
  band, topic/subtopic breakdown, difficulty totals, question_results joined
  with questions). Styles: existing tokens; large type for screen sharing.

## Left to the builder

- Exact Present view layout within the site's style.
- Whether the invite form opens in a modal or switches to the Students tab
  with the form prefilled (prefer a modal reusing the same form logic).

## Builder-check answers (controller's calls)

1. **Adoption is tied to the subject being unlocked.** It happens inside the
   existing accept loop, for the source diagnostic's curriculum when that id is
   among the unlocked/covered ids. If the tutor can't include subjects, or
   unticks it, or it fails to unlock, nothing is adopted: the diagnostic stays
   in the tutor's Diagnostics tab (its report still there) and the row still
   reports the sign-up. The invite form warns when the source subject isn't
   ticked: "Their consultation diagnostic won't carry across without this
   subject."
2. **Reused pending invite**: when `sourceDiagnosticId` is sent, it is set (or
   overwritten) on the invite, whether new or reused. Validation: the caller's
   own completed link diagnostic. The link is kept even if the subject differs;
   adoption simply won't happen then.
3. **Rows**: a finished link diagnostic (student_id null) shows "Sign them up"
   unless a pending or accepted invite references it; with a pending invite it
   shows an "Invited" chip; with an accepted invite, "Signed up · <student
   name>" (whether or not it was adopted). An adopted diagnostic has
   student_id set and appears like a roster diagnostic, with the same "Signed
   up" chip. Declined/expired/cancelled invites bring the button back. Server
   errors (e.g. already on the roster, 409) show in the form.
4. **Parent**: the form opens in student mode with the prospect's email; if the
   tutor switches to "send to a parent", the email field is prefilled with the
   diagnostic's parent email (if any) and the child name with the first word of
   the diagnostic's student name. No automatic switching.
