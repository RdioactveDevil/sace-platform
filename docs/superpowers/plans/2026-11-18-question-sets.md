# Question Sets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Questions that share information are kept together in built exams (picked whole, in order, renumbered lead sentence), show the shared information in practice, and are recorded as sets by the ingest and linked for the 50 existing sets.

**Architecture:** `set_key` + `set_position` on every member; `shared_info` + `shared_image_url` on the first only; `questions_student` fills the shared fields for every member from the first. A pure module `lib/questionSets.js` holds the parsing, splitting, wording, grouping and backfill logic, used by the app and (copied in logic) by the ingest.

**Tech Stack:** React JSX, Express, Postgres view, node:test, Playwright check:print.

**Spec:** `docs/superpowers/specs/2026-11-18-question-sets-design.md`

## Global Constraints

- Built exams without sets unchanged (`pnpm --filter @workspace/gradefarm check:print` identical against the saved baseline).
- Lead sentence wording: 2 → "Use the following information to answer Questions 7 and 8."; 3+ → "Questions 7 to 9"; 1 → "Question 7".
- Shared information never stored on follow-on questions.
- Existing sets are linked only after the app is deployed.

## Review Focus

- A follow-on whose first question is hidden (pending/rejected): students still get the shared information (view).
- A set larger than the multiple-choice count left: not picked; singles fill.
- A set split across sections or papers in the backfill (numbers not found in the same paper and section): not linked, reported.
- A lead with only one line after the sentence: shared information empty, flagged.
- An exam saved before sets with a follow-on but not its lead: shared block printed above it.

---

### Task 1: `lib/questionSets.js` (pure) + tests

Produces: `parseSetLead(text) -> { numbers: number[], sentence } | null`, `splitLead(text) -> { shared, own }`, `setSentence(numbers: string[]) -> string`, `fillShared(questions) -> questions` (followers take the first member's shared fields), `setUnits(questions) -> Array<q[]>` (sets in position order, singles alone), `planSetLinks(rows) -> { updates: [{ id, set_key, set_position, question?, shared_info?, shared_image_url?, image_url?, flag? }], problems: string[] }`.

- [ ] Tests with the real lead shapes (STAV 19–20, Kilbaha 11–12 with a figure, NEAP 15–16 one line, lowercase "questions", "3 to 5", "3–5", "3, 4 and 5"), then implement.

### Task 2: Migration + view

`supabase/migrations/20261118000002_question_sets.sql`: columns, index on `set_key`, `questions_student` recreated with `set_key`, `set_position` and `shared_info`, `shared_image_url` taken from the set's first question.

### Task 3: Exam builder and printed paper

- `examPool` keeps members; `pickExam` picks units for Section A (whole sets that fit, singles fill), course-sorts units by first member; `swapCandidate(pool, current, used, …)` returns `{ out: ids[], in: ids[] }` when `current` is in a set (callers updated).
- `ExamPaper`: before a set's first present member, a shared block (sentence with exam numbers via `meta.numberOf` or position, `shared_info`, shared figure); a follow-on alone gets the block with its own number.
- check:print fixtures: a pair and a three-question set; baseline identical for the no-set cases.

### Task 4: Practice and other student views

`components/SharedInfo.jsx` shown above the question in QuizScreen, ExamSimulator, DiagnosticScreen when `shared_info || shared_image_url`.

### Task 5: Admin

- API `PATCH /api/admin/questions/:id/set { set_key, set_position, shared_info, shared_image_url }` (lib/question-sets.ts validation + tests).
- Paper page: list badge "Set A29–30", preview the whole set, "Shared information" box and figure slot (on the first question), "Break up this set", "Link with the next question". PAPER_FIELDS gain the four columns; `fillShared` before previewing.
- Text checks: set without shared information; a lead still containing the "Use the following information" sentence.

### Task 6: Ingest

Schema `set_numbers: integer[]`, `shared_info: string`; prompt replaces the copy rule; rows get `set_key` (first member's id), `set_position`, and `shared_info` on the first only; incomplete sets flagged.

### Task 7: Verify, PR, then link the existing sets after deploy

- All suites, typecheck, build, check:print; PR.
- After merge and deploy: run `planSetLinks` on the real rows, report, apply.
