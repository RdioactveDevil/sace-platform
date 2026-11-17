# Exam Paper Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page per loaded exam paper where an admin checks each question against its exact printed form and the original PDF, edits it with a live preview, crops figures from the paper, and approves it; Loaded papers shows each paper as checked, part way or not checked.

**Architecture:** `ExamPaper` gains a `meta.preview` setting that draws only question pages with original numbers, through the same block builders, CSS and page packing as a built exam. A new `AdminPaperPage` (routed at `/admin/subjects/<id>/papers/<label>`) hosts the list, the preview, the original PDF and the editors. Crops are drawn in the browser with pdf.js at 3 px/pt (the ingest's scale). Review timestamps live in two new columns.

**Tech Stack:** React (JSX, inline styles, `--t-*` tokens), Express API, Supabase (Postgres + storage), pdfjs-dist 4.10.38, node:test, Playwright (pre-installed) for browser checks.

**Spec:** `docs/superpowers/specs/2026-11-17-exam-paper-page-design.md`

## Global Constraints

- Built exams must not change: `ExamPaper` output with `meta.preview` unset is identical before and after.
- Preview = print: question blocks come from `vceBlocks` / `saceBlocks`, unchanged except numbering.
- Crops are 3 pixels per PDF point and stored under a path containing `/exam-papers/` (so `Figure` sizes them as printed).
- Saving never approves; approve/reject only through `POST /api/admin/questions/review`.
- pdfjs-dist version 4.10.38 (the ingest's).
- Light and dark themes; usable at 390px width.

## Review Focus

- A question whose draft has unsaved changes when the admin switches question or leaves: must ask first.
- A paper whose PDF isn't available (no batch, or loaded from a link): page still works, crop says why.
- A question with no lettered parts, and a part that only introduces sub-parts: preview prints them as a built exam does.
- A crop dragged outside the page or zero-sized: clamped, and "Use this crop" disabled until it has area.
- The migration not yet applied: Loaded papers and the page still load (fallback select), status shows "Not checked".

---

### Task 1: Preview setting on the printed paper

**Files:** Modify `artifacts/gradefarm/src/components/ExamPaper.jsx`, `artifacts/gradefarm/src/lib/adminDb.js` (PAPER_FIELDS gains `graph, table_data, diagram`). Create `scripts/browser/exam-preview-check.mjs`.

**Interfaces — Produces:** `ExamPaper({ exam: {A, B}, meta })` where `meta.preview === true` draws only question pages; `meta.numberOf(q, section, index) -> string` (default `index + 1`, or `startNumber + index` for SACE).

- [ ] In `vceBlocks`/`saceBlocks`, take the number from `meta.numberOf` when given; with `meta.preview`, skip section-instruction and end blocks (`secA`, `endA`, `secB`, `endB`, `end`).
- [ ] `VceExam`/`SaceExam` with `meta.preview`: render only the packed question pages (VcePage / SacePage with `cont`), no cover, blank pages, back cover, answer sheet, solutions or extra-space page; SACE does not split booklets.
- [ ] Browser check script: renders a built exam from fixture questions (VCE and SACE, with a figure, multi-part, single unlabelled part, an intro part) before/after the change and compares page screenshots (identical); renders the same questions in preview and compares each question's `.xp-blk` screenshots with the built exam's (identical apart from the heading number region).
- [ ] Run app tests; run the check; commit.

### Task 2: Review status columns, figure-flag clearing, paper status

**Files:** Create `supabase/migrations/20261118000001_question_reviewed.sql`, `artifacts/api-server/test/question-review.test.ts` (extend). Modify `artifacts/api-server/src/lib/question-review.ts`, `artifacts/api-server/src/routes/admin.ts`, `artifacts/gradefarm/src/lib/questionChecks.js` (+ test), `artifacts/gradefarm/src/lib/adminDb.js`.

**Interfaces — Produces:**
- columns `questions.reviewed_at timestamptz`, `questions.reviewed_by uuid`.
- `POST /api/admin/questions/review` sets `reviewed_at = now()`, `reviewed_by = caller` for approved/rejected, nulls for pending.
- `dropFigureFlags(review, where) -> review` (api lib) and `POST /api/admin/questions/:id/figure-changed { where }`.
- `paperStatus(questions) -> { state: 'checked'|'partway'|'unchecked', checked, total, lastAt, lastBy }` (questionChecks.js).
- adminDb: `figureChanged(id, where)`, `fetchReviewerNames(ids) -> Map<id, display_name>`; fallback select drops the new columns on 42703.

- [ ] Tests: paperStatus for all/none/some reviewed and legacy null; dropFigureFlags keeps text flags and other parts' figure flags.
- [ ] Implement; run api + app tests; commit.

### Task 3: Crop tool

**Files:** Create `artifacts/gradefarm/src/lib/cropTools.js` (+ test), `artifacts/gradefarm/src/components/CropTool.jsx`. Modify `artifacts/gradefarm/package.json` (pdfjs-dist 4.10.38).

**Interfaces — Produces:**
- `tightenBox(grey: Uint8Array, W, H, box: {left, top, width, height}, scale = 3) -> box` — ink bbox inside the box (pixels < 200, rows/cols need 2), plus up to `3 * scale` px of white margin, never past the original box; returns the box unchanged if no ink.
- `clampBox(box, W, H) -> box`.
- `renderPdfPage(url, pageNo, scale = 3) -> { canvas, width, height, pages }` (pdf.js, cached document per url).
- `<CropTool pdfUrl startPage onUse(blob, info) onCancel />` — page nav, zoom, drag box with edge handles, Tighten, crop preview, "Use this crop" (PNG blob at full resolution).

- [ ] Tests for tightenBox/clampBox (synthetic arrays: margin added only into white, ink never cut, empty box unchanged, clamp).
- [ ] Implement; commit.

### Task 4: Editors report drafts; figure slots

**Files:** Modify `artifacts/gradefarm/src/components/ExtendedQuestionEditor.jsx`, `artifacts/gradefarm/src/components/AdminQuestionPanel.jsx` (`QuestionEditor`).

**Interfaces — Produces:** both editors take `onChange(draft)` (draft = the save body: extended `{ question, parts }`, MCQ `{ question, options, answerIndex, solution, difficulty }`), called on every edit; extended takes `renderFigure(where, url, setUrl)` used in place of each part's `<img>`; part drafts carry `image_url` (may be a `blob:` URL until saved).

- [ ] Implement; existing tests still pass; commit.

### Task 5: Paper page, routing, Loaded papers as a list with status

**Files:** Create `artifacts/gradefarm/src/components/AdminPaperPage.jsx`, `artifacts/gradefarm/src/lib/paperPage.js` (+ test). Modify `AdminScreen.jsx` (route segment), `AdminCurriculumDetail.jsx` (papers/<label>), `AdminLoadedPapers.jsx` (list only: status, counts, filter, unfinished first, Open → page).

**Interfaces — Consumes:** Tasks 1–4. **Produces:** `paperPath(curriculumId, label)`, `draftQuestion(q, draft) -> q` (merges an editor draft into the row for preview and checks), `orderPapers(papers, filter)`.

- [ ] Tests for paperPath (encoding), draftQuestion (MCQ and extended; blob URLs kept), orderPapers (unfinished first; filter).
- [ ] Page: header (label, kind, status, counts, Whole paper, Approve N without problems, Delete paper), list (filter, keyboard up/down), preview (single / whole, zoom), right column (PDF iframe at `#page=`, editor while editing, peek, collapse), flags + Approve/Reject/Edit; unsaved-changes guard (switch, whole paper, leave page via `beforeunload` and route change); save uploads blob images to `question-images/exam-papers/edits/<id>/<where|q>-<sha1 8>.png`, then `/extended` or `/content`, question image via `/visuals` (passing existing graph/table_data), then `figure-changed` for each changed figure.
- [ ] Run tests, typecheck, build; commit.

### Task 6: Verify in the browser

- [ ] Harness with mocked data: page renders in light/dark/phone; editing changes the preview; switching with unsaved changes asks; crop of a known box on a real page (from the user's uploaded practice PDFs) has the ingest's pixel size and matches a PDFium crop of the same box closely; screenshots reviewed.
- [ ] Run Task 1's check again; all suites; push; open PR.
