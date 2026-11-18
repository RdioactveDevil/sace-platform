# Question sets: questions that share information

## Why

Exam papers often share one block of information between questions: "Use the
following information to answer Questions 29 and 30", then a titration
method, then Question 29; Question 30 relies on the same information. The bank
stores each question on its own, so a built exam can print Question 30 without
Question 29, out of order, or with the wrong numbers, and practice shows
Question 30 with nothing to answer it from. 50 such sets are in the bank today
(all VCE Chemistry multiple choice).

## Goals

- A set's questions appear together, in their original order, with the
  shared information printed once before them, in every built exam.
- The lead sentence is renumbered to the exam's numbers ("Use the following
  information to answer Questions 7 and 8.").
- In practice, each question of a set shows the shared information above it.
- The 50 existing sets are found and linked without AI and without reloading,
  and flagged for the admin to confirm on the paper page.
- New loads record sets this way.
- Admins can see sets on the paper page, edit the shared information, and
  link or unlink questions.

## Non-goals

- Sets in Section B (multi-part questions already carry their shared stem).
- Practice serving a set's questions one after another (each stands alone
  with the shared information above it).

## Anti-goals

- A follow-on question ever appearing anywhere without the information it
  needs.
- Built exams without sets changing at all.

## Approaches

1. **Mark the set on the questions (chosen).** Columns on `questions`: a set
   key and a position on every member; the shared information (and its
   figure) stored once, on the first question.
2. A separate `question_sets` table. Tidier, but every student load path
   (practice, exams, the answer-free view) would need to join it. Not chosen.

## Data (migration)

`questions` gains:
- `set_key text`: the same for every question in a set (e.g. the lead's id).
- `set_position smallint`: 1, 2, 3… in paper order.
- `shared_info text`: on the first question only: the shared information,
  without the "Use the following information…" sentence (that is generated,
  with the right numbers).
- `shared_image_url text`: on the first question only: the shared figure.

Stored once, so there is nothing to keep in step. `questions_student` gives
every member of a set the set's shared information and figure (read from the
first question, even when that question is hidden from students), so a
follow-on question always arrives with what it needs. Admin screens and the
exam builder, which load whole papers, take it from the first question.

## Built exams (exam builder, ExamPaper)

- Picking: a set is one unit worth as many multiple-choice slots as it has
  questions; it is picked whole or not at all, and the count still lands on
  the number asked for (singles fill the rest).
- Ordering: a set stays together, in position order, placed by its first
  question's topic.
- Swapping a question of a set swaps the whole set, for another set of the
  same size if there is one, else for that many single questions.
- Printing (VCE and SACE): before the set's first question, a block
  "Use the following information to answer Questions N and M." (three or more:
  "Questions N to M") with the shared information and figure.
- A follow-on question printed without the rest of its set (e.g. in an exam
  saved before this change) gets the shared block above it on its own
  ("…to answer Question N.").
- The paper page's preview shows the whole set, as it prints.

## Practice and other student views

Wherever a student sees one question (practice quiz, exam simulator,
diagnostic), a question with `shared_info` shows it, and the shared figure,
in a box above the question.

## Existing sets (one-off, no AI)

A lead question is one whose text says "Use the following information to
answer Questions X and Y" (or "X to Y", "X–Y", "X, Y and Z"). Its members are
the questions numbered X…Y in the same paper and section. The lead's text is
split: everything after that sentence up to the last paragraph is the shared
information; the last paragraph is the lead's own question. Its figure becomes
the shared figure. Each lead gets a review flag "Set linked automatically:
check the shared information and the question are split correctly". Run once
against the database; the same logic (a pure, tested function) is used by the
ingest's fallback.

## New loads (ingest)

The extraction returns, per question, `set_numbers` (the question numbers
sharing information, or empty) and `shared_info` (on every member). The rule
that copied shared information into each question is replaced. A set whose
questions aren't all found is flagged.

## Paper page

- The list marks set members ("Set A29–30").
- Selecting any member previews the whole set as it prints.
- The editor has a "Shared information" box and shared figure slot (saving
  updates every member), and "Unlink from set" / "Link with the next
  question".
- Text checks: a lead whose text still contains "Use the following
  information…" is flagged; so is a set with a missing member.

## Accuracy

- `check:print` stays identical for exams without sets (built pages and
  preview blocks).
- New fixtures with a pair and a three-question set: preview blocks identical
  to built-exam blocks; renumbering checked.
- Unit tests: picking/ordering/swapping with sets, the split, the lead-sentence
  wording, the backfill's matching on the real 50 leads.
- Order: the migration, then the app, then the existing sets are linked and
  split (so live questions are never shown split before the app can show the
  shared information).

## Calls made without asking

- Shared information stored once, on the first question; the students' view
  fills it in for the others (the admin's call: one place to edit).
- Swapping swaps the whole set.
- The lead's existing figure becomes the shared figure.
- Three or more questions: "Questions N to M".
