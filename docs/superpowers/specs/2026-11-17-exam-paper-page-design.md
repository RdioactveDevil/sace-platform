# Exam paper page: check and fix a loaded paper against its printed form

## Why

Checking and fixing a loaded exam paper happens inside Admin → a subject →
Exam papers → Loaded papers: a long list where each paper expands in place and
a question is edited in a small box inside the list. It is too cramped to work
in, and it never shows what the admin actually needs to judge: **how the
question will print** in a built exam, next to **the original paper**. The
problems found in built exams (figures with question text or footers in them,
a footer in place of a figure, text printed twice, answer lines missing) are
all visible only on the printed page.

Each loaded paper gets its own page where an admin goes through it question by
question, sees each one exactly as it prints, compares it with the original
PDF, fixes it with the preview updating as they type, and approves or rejects
it.

## Goals

- One page per loaded paper, with its own address, reached from Loaded papers.
- A printed preview that is **exactly** what the exam builder prints: the same
  component, fonts, figure sizes, answer space, marks and page breaks. Not a
  look-alike.
- The original PDF beside it, open at the question's page.
- Editing on the same page, with the preview showing the unsaved edit live.
- Fixing figures: crop a figure straight from the original paper, remove a
  wrong one, or replace it with an uploaded image.
- Loaded papers shows, for every paper, whether it has been checked, is part
  way through, or hasn't been started, so it's clear what is done and what's
  left.
- Review (flags, approve, reject, approve all without problems) moves here.

## Non-goals

- The online exam-sitting view (the admin chose the printed view).
- Changing how built exams look or paginate.
- Editing papers that aren't loaded from exam papers (bank questions keep their
  current screens).

## Anti-goals (a failure even if it works)

- The preview differs from the printed exam in any way, however small. An
  admin who approves what they saw must get exactly that in the PDF.
- Built exams change as a side effect of the preview work.
- An unsaved edit is lost without warning (moving to another question or
  leaving the page with changes asks first).

## Approaches considered

1. **A preview setting on the existing printed paper (chosen).** `ExamPaper`
   gets a setting that draws only the question pages for the questions it is
   given (no cover, contents, blank pages, back cover, answer sheet or
   solutions), numbering each question by its number on the original paper.
   Single question = one question; "whole paper" = all of them; live editing =
   the draft question passed in. Same code path as printing, so the preview
   can't drift. Cost: a careful change to the component that prints every
   exam; the full-exam output must stay identical.
2. **A shared one-question component** used by both the printed exam and the
   page. Tidier, but it takes apart the page-packing code that is most likely
   to break printed exams, for nothing the admin sees. Not chosen.
3. **A separate simple preview styled to look similar.** Cheapest, but it would
   drift from print, which defeats the point. Dropped.

The admin asked for whichever is most accurate; 1 is.

## The page

Address: `/admin/subjects/<subject id>/papers/<paper label>` (label URL-encoded,
e.g. `NEAP%202023%20Trial%20Exam`). The back button and links work. Loaded
papers' "Open" goes here instead of expanding in place.

```
← Loaded papers   NEAP 2023 Trial Exam · 12 to review · 3 problems   [Whole paper] [Approve 9 without problems]
┌ Questions ─┐┌ Printed preview ─────────────┐┌ Original paper / Editor ─┐
│ A1 ✓       ││  Question 4 (9 marks)        ││  [PDF at page 18]        │
│ A2 ⚑       ││  …exactly as printed…        ││                          │
│ B4 ⚑  ◀    ││                              ││                          │
└────────────┘└──────────────────────────────┘└──────────────────────────┘
  ⚑ flags for B4                                 [Approve] [Reject] [Edit]
```

- **Header:** paper label, past/trial, counts (to review, possible problems,
  rejected), "Whole paper" toggle, "Approve N without problems", Delete paper.
- **Questions list (left):** Section A then B in exam order; each row shows the
  original number, a short start of the text, status (to review, approved,
  rejected, or none for questions loaded before reviews) and a flag marker.
  "Only what needs checking" on by default when anything does (as now).
  Keyboard: up/down moves between questions.
- **Printed preview (middle):** the selected question's printed page(s) at
  their real A4 size, scaled to fit the column, with a zoom control. VCE or
  SACE style by the subject's board, exactly as the exam builder decides it.
  Rejected questions still preview (marked as rejected).
- **Right column:** the original PDF (signed link, opened at the question's
  page) by default; while editing, the editor takes its place, with a button to
  peek at the original. Collapsible to give the preview more room. If the
  paper's PDF isn't available (loaded from a link or an old batch), the column
  says so and editing still works.
- **Under the preview:** the question's flags (stored crop checks and live text
  checks), then Approve / Reject / Edit, as on Loaded papers today.
- **Whole paper:** the middle shows every question in the list (respecting the
  filter) as consecutive printed pages, each question's page marked so clicking
  it selects that question.

## Editing

- Section B: the existing part editor (stem; each part's label, level, text,
  marks, worked solution), extended to report every change to the page so the
  preview redraws from the draft. Debounced so typing stays smooth.
- Section A: the existing multiple-choice editor, extended the same way.
- Figures, on the question and on each part: **Crop from the paper**,
  **Remove**, and **Upload** a PNG/JPEG. New images are stored in
  `question-images` under the paper's folder, like ingest crops. Any change to
  a figure clears that figure's stored crop flags; the text checks re-run on
  the draft as usual. A question or part with no figure can be given one the
  same ways.

## Crop tool

Opened from a figure's "Crop from the paper" while editing.

- Shows the original PDF page, drawn in the browser by pdf.js (the same
  library and version the ingest uses) at the ingest's resolution, 3 pixels
  per point, so a crop made here prints at the same size as an ingest crop
  (the exam paper sizes figures from that resolution).
- Opens on the question's page, with previous / next page, and zoom.
- The admin drags a box over the figure. Handles adjust each edge; the box can
  be moved. "Tighten" trims white margins to the drawing (with the same small
  white margin the ingest leaves), never cutting into ink.
- The selected area is shown beside the page as it will be saved, and the
  printed preview shows the question with it before saving.
- "Use this crop" puts it into the draft; it is uploaded when the question is
  saved, so cancelling leaves nothing behind.
- If the paper's PDF isn't available, the button says why and Upload is
  offered instead.

## Checked, part way, not started

Each paper on Loaded papers, and the paper page's header, shows where it is:

- **Checked**: every question approved or rejected. Shows when and by whom
  it was last reviewed ("Checked 18 Nov by Adhyayan").
- **Part way**: some questions reviewed, with "12 of 40 checked".
- **Not checked**: none reviewed yet, including papers loaded before reviews
  existed.

A filter on Loaded papers shows all, not checked, part way or checked, and
papers are ordered so unfinished ones come first. Recording who and when
needs two new columns on `questions`, `reviewed_at` and `reviewed_by`, set by
`POST /api/admin/questions/review` (migration). Editing a question after it
was approved doesn't reset it; the date shows the last review.
- Save writes through the existing endpoints (`/extended`, `/content`; figures
  through the extended body for parts and `/visuals` for the question image).
  Saving does not approve: the question keeps its review status.
- Unsaved changes: switching question, toggling "Whole paper" or leaving the
  page asks to keep editing or discard.

## Accuracy

- The preview setting only removes pages around the questions and sets each
  question's number; the question blocks, page frame, CSS, figure sizing and
  page packing are the same code as a built exam.
- Full exams must be unchanged: the existing exam builder tests pass, and a
  browser check renders the same built exams before and after the change and
  compares their pages pixel for pixel (VCE and SACE, with figures, multi-part
  questions and a question without lettered parts).
- Preview matches print: the same browser check renders a paper's questions in
  the preview setting and inside a full built exam and compares each question's
  pages pixel for pixel, apart from the page number and the question number in
  the heading.
- Live edits: a unit test that the draft (not the saved question) is what the
  preview receives, and a browser check that editing a part's text and marks
  changes the preview.
- Crops: a check that a crop made in the tool of a known box on a real paper
  page matches the same box cut from the ingest's own render of that page, in
  size and pixels.
- Paper status: unit tests for checked / part way / not checked from a
  paper's questions.

## Constraints

- React app in `artifacts/gradefarm` (plain JSX, inline styles with the
  `--t-*` theme tokens, light and dark, usable at phone width with the three
  columns stacking).
- Data and endpoints already exist (questions with `review_status` and `review`,
  `POST /api/admin/questions/review`, `/extended`, `/content`, `/visuals`,
  signed links to the uploaded PDFs). The figure upload uses the existing
  admin storage access.
- Questions are grouped into papers by their `source` label
  (`groupLoadedPapers`).

## Left to the builder

- Exact component split, zoom steps, debounce time, and how the preview setting
  is passed to `ExamPaper`.
- How the browser checks are run (a committed script under `scripts/` or the
  app, run by hand before merging; no CI exists for browsers today).

## Calls made without asking (check these)

- **Loaded papers becomes a list only.** Each paper keeps its summary,
  counts, "Approve N without problems" and Delete; "Open" goes to the paper
  page. Editing and per-question review inside the list go, so there is one
  place to do it.
- **One question at a time** in the preview by default; "Whole paper" for a
  read-through.
- **The original PDF in the right column by default**, swapped for the editor
  while editing, with a peek button.
- **A crop is uploaded only when the question is saved**, so cancelling leaves
  nothing in storage.
- **"Checked" means every question approved or rejected.** A question saved
  after approval stays approved; the paper stays checked.
- **Unfinished papers are listed first** on Loaded papers.
- **Saving never approves.** Approve is always its own click.
- **The preview's settings come from the subject**: board (VCE/SACE) and
  maths or not, as the exam builder works them out; sources and solutions off.
