# Pre-call questionnaire

Project 3b of the prospect-consultation work. Flow: diagnostic (1–2) → booked
consultation call (3a) → **pre-call questionnaire (this)** → call → report
and sign-up (4).

## Why

After a prospect books a consultation call, the tutor wants them to fill in a
short questionnaire (their situation, goals, how committed they are) so the
call starts from what the tutor needs to know. Today that's a Google Form link
pasted per diagnostic (`diagnostic_assessments.pre_call_form_url`): answers
never reach the app, and every tutor would share one form's wording. The user
wants each tutor to own their questionnaire, edit it, and tailor it per
student before sending.

## Goals

1. **One questionnaire per tutor**, edited in a Questionnaire editor:
   add, reword, reorder, delete items; item types: short answer, long answer,
   pick one (optional "Other: ___"), pick several, section heading. Each
   question can be required. Each choice can be marked as a **red flag**.
2. **Starting questionnaires.** New tutors start from a basic neutral set
   (school; current results; why they're looking for a tutor; their goal for
   the subject; anything else the tutor should know). The platform owner's
   account (the user's) is seeded with their current Google Form rebuilt in
   the app (below); nobody else gets it.
3. **Tailor per student.** On the Diagnostic tab's create form, a
   "Pre-call questionnaire" section shows the tutor's questionnaire with "Edit
   for this student". Edits apply only to that diagnostic; the master is
   unchanged. It replaces the "Pre-lesson questionnaire link" field.
4. **Snapshot.** Each diagnostic stores its own copy of the questions at send
   time. Later master edits never change a student's copy; answers always
   match the questions shown.
5. **Delivery.** The booking confirmation (prospect and parent emails) links
   the questionnaire; the "Booked" screen shows it too. One reminder a day
   before the call if not submitted (daytime rule doesn't apply; it rides the
   consultation reminder timing). It can't be submitted after the call's end.
   Name, email, year level and subject are known — the questionnaire never
   asks for name or email; the user's own form keeps its year-level and
   subject questions because they chose them.
6. **Answers.** Shown on the prospect's row in the Diagnostic tab (expand to
   read; red-flag answers highlighted, and a "Red flag" chip on the row) and
   in the diagnostic report view. The tutor is emailed when answers come in.
7. **Old diagnostics** with a Google Form link keep working exactly as today
   (link in the booking email / redirect on the finish screen when booking
   isn't offered).

## The user's questionnaire (seeded into their account only)

No personal details go in the repository. The questionnaire ships as a
constant (`OWNER_QUESTIONNAIRE` in the server's questionnaire module) that
nothing uses automatically; after the migration is live, the controller
inserts it into the user's `tutor_questionnaires` row with the user's
go-ahead (a one-off production write). Intro text: "THIS FORM
IS MEANT TO BE COMPLETED BY THE STUDENT THEMSELVES — NOT PARENTS. Thank you
for booking a call with us! Before we get on call, we would like to know a few
things about you that would help in my understanding of what you're looking
for, and what problems you have been facing so far. Please answer as honestly
as possible, because this call is ONLY for your benefit, and we need to know
your situation accurately."

- Section: Personal details
  - What school do you attend? (short, required)
  - What year level are you in? (pick one, required): Year 9; Year 10;
    Year 11; Year 12
  - What subject(s) are you looking for? (short)
- Section: Current situation
  - What is your current test/SAC average? (pick one, required): 95%+;
    90-95%; 85-90%; 80-85%; 70-80%; 60-70%; 50-60%; <50%
  - Why are you currently looking for a tutor? (pick one, required): Facing
    problems with basic skills.; Understanding basics easily but facing
    trouble with application-style questions.; Declining marks.; Stagnant marks
    - no improvement.
  - What's the ONE thing I could do in the call that would SKYROCKET your
    progress? (long, required)
- Section: Goals and aspirations
  - What is your goal for this subject? (pick one, required): 50; 45-50;
    40-45; 35-40; 30-35; <35
  - What ATAR are you aiming to achieve? (pick one, required): 99+; 95-99;
    90-94; <90
  - What career pathway are you looking to enter? (Or have an inclination
    towards) (pick one with Other, required): Medicine; Engineering; Law;
    Computer Science/IT; Commerce
  - How dedicated are you to getting the results you want? (pick one,
    required): VERY dedicated - I am willing to put in the hard yards!;
    MAYBE dedicated - I guess I'll work hard? **(red flag)**; NOT dedicated -
    I don't care if I achieve my goal or not. **(red flag)**
- Section: Are you an action taker?
  - If you need to get support, are you willing to take action ASAP, or want
    to think about it and risk losing time? (pick one, required): GET ME
    RESULTS ASAP! (You're an action-taker and walk-the-walk to get results.);
    Uh... Maybe. Idk? I'll think about it... (You're unsure if you want to
    succeed). **(red flag)**; Nope - I don't need help! (No point getting on
    the call if you select this!) **(red flag)**

(One wording fix from the original form: "facing with application-style
questions" → "facing trouble with application-style questions".)

## Non-goals

- Several questionnaires per tutor; templates library; conditional logic;
  file uploads; scoring.
- Parents filling it in (the form is for the student).
- Editing answers after submitting.

## Anti-goals

- A student's questions changing after they were sent.
- Losing a student's half-filled answers on a refresh.
- Anything a prospect sees calling the sender their tutor.
- Looking different from the rest of the site.

## Approaches

Snapshot per diagnostic (chosen; the only sensible one): the diagnostic stores
the questions as sent. Linking diagnostics to a live master was rejected:
edits would change questions under a student and make old answers unreadable.

## Design

### Data (one migration)

- `tutor_questionnaires` (`tutor_id` PK → profiles on delete cascade,
  `intro text`, `items jsonb not null`, `updated_at`). RLS on; server-only.
- `diagnostic_assessments` gains `questionnaire jsonb` (snapshot: `{ intro,
  items }`, null = none / legacy link), `questionnaire_answers jsonb`,
  `questionnaire_submitted_at timestamptz`, `questionnaire_reminded_at
  timestamptz`.
- Item shape: `{ id: string (stable, random), type: "section" | "short" |
  "long" | "one" | "many", label: string, help?: string, required?: boolean,
  options?: Array<{ id: string, label: string, flag?: boolean }>, other?:
  boolean }` (options/other only for one/many; "section" has only label/help).
  Limits: ≤ 60 items, labels ≤ 300 chars, ≤ 20 options, option label ≤ 200.
- Answers shape: `{ [itemId]: string | string[] | { choice: string, other?:
  string } }` — validated server-side against the snapshot (required items,
  option ids exist, text ≤ 5000 chars).
- No seed rows: the basic set is the code default when a tutor has no row;
  the user's own questionnaire is inserted once, after deploy (above).

### Server

- `GET/PUT /tutor/questionnaire` — the master (default set when none).
- Diagnostic create accepts `questionnaire` (the tailored copy, validated with
  the same rules); omitted → snapshot of the master. The old `preCallFormUrl`
  is still accepted for compatibility but the UI no longer sends it.
- Public `GET /questionnaire/:diagnosticToken` → `{ intro, items, senderName,
  submitted, closed }`; `POST /questionnaire/:diagnosticToken { answers }` →
  validated, stored once. Closed when the diagnostic's consultation has ended
  (or, with no booking, never closed).
- Booking emails' `questionnaireUrl` becomes `${appUrl()}/questionnaire/<diagnostic
  token>` when the diagnostic has a snapshot, else the legacy link.
- Email job: one questionnaire reminder per booking, sent with the
  consultation's 1-day reminder timing (if not submitted); tutor email when
  answers arrive ("<Name> filled in your pre-call questionnaire", red flags
  listed).
- Tutor list/report: diagnostic list rows gain `questionnaire_status`
  ('none' | 'waiting' | 'submitted') and `red_flags: number`; the report
  route returns the snapshot and answers.

### Prospect page `/questionnaire/:token` (AuthLayout / Panel / Field /
af-inp / af-btn styles from publicUi.jsx)

Intro text, sections as headings, required marks, answers saved to the
browser as they type (restored on reload), Submit → "Thanks, that's sent to
<Full name>." Already submitted → a thank-you; closed → "This questionnaire
has closed."

### Tutor UI (existing tutor-portal styles)

- **Questionnaire editor** (new card in the Diagnostics tab, "Pre-call
  questionnaire" sub-tab next to "New diagnostic" / "Sent diagnostics"):
  item list with type select, label, help, required toggle, options with
  red-flag toggles and "Other" toggle, move up/down, delete, add item; Save.
- **Create form**: the section described above; "Edit for this student"
  opens the same editor on a copy.
- **Rows / report**: status chip ("Questionnaire: waiting / filled in"),
  "Red flag" chip, expandable answers with flagged answers highlighted.

## Left to the builder

- Exact editor layout within the existing styles.
- Answer storage format for "Other" (as long as it's validated).

## Builder-check answers (controller's calls)

1. **Open / closed.** The questionnaire is open while the diagnostic isn't
   cancelled and either (a) there is no non-cancelled consultation for it, or
   (b) now is before the end (`scheduled_at + duration_minutes`) of its latest
   non-cancelled consultation. So a reschedule reopens it automatically, a
   cancelled-only booking leaves it open, and status `active`/`completed`
   doesn't matter — the clock does.
2. **Reminder.** One per diagnostic (`questionnaire_reminded_at`), to the
   prospect and the parent (if any), sent by the email job 24 hours before the
   live call's start (independent of the tutor's reminder leads), claimed with
   a conditional update like the prospect reminders, skipped if the call was
   booked less than 24 hours ahead (the booking email already carried the
   link) or if answers are in. A rebook after it was sent doesn't send another.
   Reply-To is the tutor, as with all prospect emails.
3. **Before booking.** The link is delivered only by the booking emails and
   the Booked screen — except when booking isn't offered (tutor has no hours):
   then the finish screen shows "Before your call, please fill in this short
   questionnaire" with the link. The page itself works for anyone holding the
   diagnostic token while it's open. Row status: `none` (snapshot but no
   booking yet and not submitted), `waiting` (booked, not submitted),
   `submitted`; legacy-link diagnostics show nothing. Answers are readable in
   the row expansion (always) and in the report (once completed).
4. **Precedence.** A snapshot wins over a legacy link everywhere (emails,
   finish screen); the legacy link and its redirect are used only when there's
   no snapshot. The new UI never sends `preCallFormUrl`. Roster students'
   diagnostics (`student_id` set) never get a questionnaire.
5. **Resend** never re-snapshots.
6. **Tutor notice** goes through the email job (like "diagnostic done"),
   respects unsubscribe, lists flagged answers. `red_flags` = number of
   flagged options chosen (pick one or pick several); free-text "Other" is
   never flagged.
7. **Seeding the user's questionnaire** is a one-off production write done by
   the controller after the migration is live, with the user's go-ahead,
   matching their account by sign-in email at run time (nothing personal in
   the repo). Any create form in the Diagnostics tab that today has the
   pre-call link field gets the questionnaire section, sharing one editor
   component.
