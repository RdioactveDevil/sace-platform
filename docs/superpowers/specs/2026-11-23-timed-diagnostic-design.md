# Consultation diagnostic: timed, two parts, bank-standard short answers

Part 1 of 2. Part 2 (separate spec, later): saved, editable diagnostics per
subject and year level, with single questions swapped for harder/easier ones
(the tutor's own or AI-written), so every prospect gets the same test.

## Why

The diagnostic a tutor sends a prospect before a consultation call
("New diagnostic", "New consultation", "Send a test") should feel like the
real thing: a timed paper, multiple choice first, then short answers that
look, are answered and are marked like the question bank's written
questions. Today it is one long untimed page, its short answers are loose
(a model answer, no marking scheme), and the student waits on a "Marking
your answers" screen for 20–40 seconds after submitting.

## Goals

- **50 marks in 50 minutes.** Part 1: 20 multiple-choice questions, 1 mark
  each (20 marks). Part 2: short-answer questions worth exactly 30 marks in
  total (about 7 questions of 2–6 marks).
- **Start page** says so: 50 marks, 50 minutes, two parts (multiple choice,
  then short answer), the timer starts on Start and doesn't pause.
- **One page per part.** Part 1 is all the multiple choice, then Next.
  Part 2 is all the short answers. The student can go back to part 1 until
  they submit.
- **Time left on every page** of the test (both parts), always visible. A
  warning at 5 minutes left. At 0 the answers are submitted automatically.
- **Short answers in the bank's format** (`question_type: 'marked'`): a
  question with its mark total, a marking scheme (one entry per mark point)
  and a model answer, written and checked by the bank's own writer
  (`lib/marked-questions.ts`): an independent check, and the real marker
  must give the model answer full marks.
- **Answered like the bank**: maths subjects use the working box
  (`MathWorkingInput`: one step per line, Enter or "+ line" adds a line);
  other subjects the written-answer box (`WrittenAnswerInput`).
- **Marked like the bank**: each short answer marked point by point by
  `markAnswer()` (`lib/marking.ts`); multiple choice by key, as now.
- **Saved to the bank**: for a curriculum (database) subject, every short
  answer that passes the checks is saved to `questions` under its subtopic,
  like any other bank question. They are **not** held back from practice.
- **No marking wait for the student.** Submit goes straight to the
  "Submitted" screen (booking times / questionnaire as today). Marking runs
  in the background; the tutor sees "Marking…" until the report is ready.

## Non-goals

- Saved/editable diagnostics and question swapping (part 2).
- Roster students' diagnostics for tutor-included subjects
  (`student-diagnostic.ts`, `POST /diagnostic/:token/prepare`): unchanged —
  20 questions, untimed, marked while they wait, summary at the end.
- Diagnostics already sent: they keep working exactly as now (30 marks,
  one page, untimed).
- Taking short answers from the existing bank instead of writing new ones.
- Holding the new bank questions back from practice.

## Anti-goals

- A student losing their answers or their time to a refresh or a closed tab.
- A second short-answer system that drifts from the bank's (own prompt, own
  marker, unchecked questions in the bank).
- A report the tutor can't trust: totals that aren't 20 + 30, or marks taken
  from the model rather than added up from mark points.
- Breaking old diagnostics, roster diagnostics, the call report
  (`PresentReport`), the sign-up carry-over or the "diagnostic done" email.

## Approaches

1. **Reuse the bank's machinery (chosen).** Short answers come from the
   bank's writer and checks, are answered in the bank's input boxes and
   marked by the bank's marker. Multiple choice comes from the current
   diagnostic writer, cut to 20 × 1 mark. Generating takes about 2–3
   minutes (short answers are written in parallel batches, each its own
   request, to stay under the 300 s function limit); part 2 removes that
   wait for repeat sends. Bank-quality questions; one marker to maintain.
2. Extend the current diagnostic prompt to also write marking schemes, and
   keep the diagnostic's own marker. About a minute to generate, but
   unchecked questions would go into the bank and there would be two
   short-answer systems. Rejected.
3. Take short answers from the bank. Rejected by the tutor (new questions
   wanted) and Year 11 coverage is thin (e.g. VCE Methods 1/2 has no written
   questions; there is no Year 11 Chemistry curriculum).

## Design

### The test, as stored

`diagnostic_assessments` gains **`time_limit_minutes int null`** (migration).
New consultation diagnostics are created with 50; null means the old,
untimed format, so old rows and roster rows are untouched. The client and
server pick the flow from this column, not from the questions.

Questions keep the existing `DiagnosticQuestion` shape, with short answers
extended:

- Multiple choice: as now (`type: 'multiple_choice'`, 4 options, letter
  key), `marks: 1`, `difficulty` easy/moderate/exam, ordered easy → hard.
- Short answer: `type: 'marked'`, `marks` (= the scheme's total),
  `marking_scheme`, `solution`, `difficulty` moderate/exam (bank 1–3 →
  moderate, 4–5 → exam), `topic`, `subtopic`, optional `table_data` /
  `diagram` (only what the bank writer produces), and `bank_question_id`
  when it was saved to the bank. Ordered moderate → exam.
- `score_max` = 50. The student never receives `marking_scheme`,
  `solution` or `correct_answer` (`sanitiseQuestionsForStudent` strips all
  three).

### Writing a test (tutor side)

- The MCQ request: the current `/tutor/diagnostic/generate` path, with the
  prompt changed to exactly 20 multiple-choice questions, 1 mark each,
  roughly 7 easy, 7 moderate, 6 exam, spread across the chosen scope.
- The short-answer requests: a new tutor endpoint that writes and checks up
  to `MARKED_MAX_COUNT` (3) bank-format questions for one subtopic (or, for a
  built-in subject, one topic) and returns them. `generateMarkedQuestions`
  is split so writing + checking is separate from saving: curriculum
  subjects save to `questions` as today; built-in subjects (no curriculum,
  no subtopic ids) get the same questions but are not saved to the bank.
- The client (`TestBuilder` / the Diagnostic tab's form) sends the MCQ
  request and the short-answer requests in parallel, choosing subtopics
  spread across the scope and asking for enough surplus that rejections
  still leave choice. It then picks short answers totalling **exactly 30
  marks**, at least one per topic where possible, mixed difficulty; if
  rejections leave it short, it asks for more. If it still can't reach 30,
  it says so and offers Try again; it never sends a test that isn't 50.
- Progress shows while it runs ("Writing multiple choice… · Short answers
  4 of 7…"), with a note that it takes 2–3 minutes.
- The preview (`TestQuestionList`) shows the two parts, and for each short
  answer its mark points and model answer.
- Copy that says "30-mark test" / "10 easy + 10 moderate + 10 exam" changes
  to the new format (Diagnostic tab's form and "How it works").

### Taking the test (student side, `DiagnosticScreen.jsx`)

For a diagnostic with `time_limit_minutes`:

1. **Start page.** Title, "50 marks · 50 minutes", "Part 1: multiple choice
   (20 marks). Part 2: short answer (30 marks).", "The timer starts when you
   press Start and doesn't stop, even if you close the page. Answers save
   as you go." Name field and Start, as now.
2. **Start** calls `POST /diagnostic/:token/start`, which sets `started_at`
   once (as now) and now returns `startedAt`, `timeLimitMinutes` and the
   server's `now`. The deadline is `startedAt + limit`, corrected for clock
   difference with the server's `now`; reopening the link after starting
   skips the start page and goes straight back into the test with the time
   that's left.
3. **Part 1** page: the 20 multiple-choice questions, the timer, "Next:
   short answer".
4. **Part 2** page: the short answers, each in the bank's box (maths:
   `MathWorkingInput`; otherwise `WrittenAnswerInput`), the timer, "Back to
   multiple choice" and Submit (with today's "N unanswered, submit anyway?"
   check).
5. **Timer**: shown on both parts, sticky at the top (mm:ss). Under 5
   minutes it changes colour and announces once to screen readers. At 0 the
   answers are submitted automatically.
6. **Answers** are kept in `localStorage` under the token as they change
   (try/catch; the page still works without it), restored on reload and
   cleared once submitted.
7. **Submit** goes straight to the existing `SubmittedScreen` (booking
   picker / questionnaire / redirect). The "Marking your answers" screen is
   never shown for this format.

### Submitting and marking (server)

- `POST /diagnostic/:token/submit`, timed format: validate and store
  `student_answers`, `submitted_by_name`, `status: 'completed'`,
  `completed_at`, `report: null`, and claim marking
  (`marking_started_at = now`, new column), then respond at once. Marking
  is started after the response with Vercel's `waitUntil`
  (`@vercel/functions`; on the plain Express server it's a promise that
  just runs). A submission is accepted after the deadline (a lost
  connection mustn't lose the test); the report shows the time taken.
- **Marking**: multiple choice by key; each short answer with
  `markAnswer()` in parallel (point-by-point results kept on its
  `question_results` entry: `points`, `summary`); marks added up here, never
  taken from the model; then the narrative (pain points, patterns,
  recommendations, summary) as now. Writes `report` and `score_total`.
- **Safety net**: the email cron (`/api/cron/emails`, every 15 min) first
  re-marks timed diagnostics that are completed with no report and a
  `marking_started_at` older than 10 minutes, claiming each by updating
  `marking_started_at` conditionally so two runs don't mark it twice. After
  3 failed attempts it stops and the tutor's row says marking failed, with
  a "Mark again" button.
- Roster (untimed) diagnostics keep marking during the request.
- Things that already wait for `report` (the "diagnostic done" email,
  `runDiagnosticDone`) keep working; the Sent diagnostics list and the
  report route treat "completed, no report yet" as **Marking…** (report
  button disabled), not as finished.

### Tutor's report

- The question list shows short answers with the student's answer, its
  marks out of the total, and each mark point awarded or not with the
  marker's comment (reusing `MarkPoints` / `MarkedAnswer` from
  `WrittenAnswer.jsx`).
- The difficulty breakdown (Foundation / Core / Exam) stays; a Part 1 /
  Part 2 score line is added. Time taken is shown.
- The call report (`PresentReport`) shows the new format correctly; it
  already leaves out marking detail and keeps doing so.

### Emails

The prospect emails (`prospect-emails.ts`) say "about 30–45 minutes … no
time limit". For a timed diagnostic they say: "It's 50 marks in 50
minutes, timed, in one sitting: start it when you have an uninterrupted
hour." (Student and parent wordings.) Old wording stays for untimed ones.

## Left to the builder

- How the 30-mark short-answer set is chosen (subtopic choice, surplus
  size, the subset search) as long as it is exactly 30, spread across the
  scope and mixes difficulty.
- Exact endpoint names and payloads; whether the short-answer endpoint
  takes a subtopic id or a topic name for built-in subjects.
- The timer's exact look, and the restored-answers detail (e.g. the maths
  working box only reads its value on mount: give it `key`).
- Tests: question selection (exactly 30), the deadline/clock maths, the
  submit → background mark → cron re-mark claim, the report totals, the
  sanitiser, the email wording; a manual run in the app.
