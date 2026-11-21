# Diagnostic Tab Topic Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Database curricula (e.g. VCE Mathematical Methods Units 1/2) show their real topics and subtopics in the tutor Diagnostic tab, and the chosen subtopics drive question generation and are saved on the assessment.

**Architecture:** Move the invite screen's `DiagnosticScopePicker` into a shared component and use it in `DiagnosticTab` for database subjects. The client sends `curriculumId` + `subtopicIds`; the server resolves them with the existing `diagnosticScope()` and feeds a "topic: subtopic; …" outline to the generator, then saves `curriculum_id` / `subtopic_ids` on create. Level-label → year-group mapping moves to a tested pure helper.

**Tech Stack:** React (Vite, JSX), Express + TypeScript api-server, Supabase, `node --test` (client libs), `tsx --test` (server).

**Spec:** `docs/superpowers/specs/2026-11-21-diagnostic-topic-picker-design.md`

## Global Constraints

- Built-in (hard-coded) subjects keep their flat topic chips and current behaviour.
- Database subjects: an empty subtopic selection means "whole subject"; Generate is allowed with nothing ticked.
- "Units 1/2" → `stage1`; "Units 3/4" → `stage2`; any other unrecognised level label → every group (`['primary', 'junior', 'stage1', 'stage2']`).
- `/tutor/diagnostic/create` never sets `student_id` (the one-per-student-and-subject unique index must stay unaffected).
- `topics` (topic names) is still sent in `SubjectConfig` for database subjects.
- Only one picker component exists afterwards; `StudentsTab.jsx` no longer defines its own.

## Review Focus

- A database curriculum with no topics yet: Generate still works and writes a whole-subject test instead of erroring (Task 2 test: `scopeOutline([])` → `""`; route falls back to "the whole course").
- `subtopicIds` that don't belong to the curriculum (stale or tampered): ignored, whole subject used, saved `subtopic_ids` is `[]` (handled by `diagnosticScope`; Task 2 route step pins it).
- Level-label spelling variants ("Units 1 & 2", "Unit 1/2", "VCE Units 3 and 4", "Stage 2", "Year 11"): mapped correctly (Task 1 tests).
- Switching subject or year level after ticking subtopics: selection resets, so another subject's ids are never sent (Task 4 step).
- Creating a built-in-subject diagnostic (no `curriculumId`): still saves with `curriculum_id` null and old reports load unchanged (Task 4 manual check).

---

### Task 1: Level labels and database subjects (client helper)

**Files:**
- Create: `artifacts/gradefarm/src/lib/diagnosticSubjects.js`
- Test: `artifacts/gradefarm/src/lib/diagnosticSubjects.test.js`
- Modify: `artifacts/gradefarm/src/components/TutorScreen.jsx` (delete local `curriculumToYearGroups` ~line 1641; import from the new file)

**Interfaces:**
- Produces:
  - `curriculumToYearGroups(levelLabel: string): string[]` — subset of `'primary' | 'junior' | 'stage1' | 'stage2'`.
  - `dbDiagnosticSubject(c: { id, name, level_label, topicNames }): { id: 'db_' + c.id, curriculumId: c.id, name: c.name, yearGroups, topics: c.topicNames ?? [], isWriting: false, fromDb: true }`.

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { curriculumToYearGroups, dbDiagnosticSubject } from './diagnosticSubjects.js'

const ALL = ['primary', 'junior', 'stage1', 'stage2']

test('VCE unit pairs map to Year 11 and Year 12', () => {
  for (const l of ['Units 1/2', 'Units 1 & 2', 'Unit 1/2', 'units 1 and 2', 'VCE Units 1-2']) assert.deepEqual(curriculumToYearGroups(l), ['stage1'], l)
  for (const l of ['Units 3/4', 'VCE Units 3 and 4', 'Units 3&4']) assert.deepEqual(curriculumToYearGroups(l), ['stage2'], l)
})

test('stage and year labels keep their mapping', () => {
  assert.deepEqual(curriculumToYearGroups('Stage 2'), ['stage2'])
  assert.deepEqual(curriculumToYearGroups('Year 11'), ['stage1'])
  assert.deepEqual(curriculumToYearGroups('Year 9'), ['junior'])
  assert.deepEqual(curriculumToYearGroups('Year 10'), ['junior'])
})

test('unrecognised or empty labels show under every year level', () => {
  assert.deepEqual(curriculumToYearGroups('IB HL'), ALL)
  assert.deepEqual(curriculumToYearGroups(''), ALL)
  assert.deepEqual(curriculumToYearGroups(undefined), ALL)
})

test('a database curriculum keeps its topic names and id', () => {
  const s = dbDiagnosticSubject({ id: 'c1', name: 'VCE Mathematical Methods', level_label: 'Units 1/2', topicNames: ['Functions', 'Calculus'] })
  assert.deepEqual(s, { id: 'db_c1', curriculumId: 'c1', name: 'VCE Mathematical Methods', yearGroups: ['stage1'], topics: ['Functions', 'Calculus'], isWriting: false, fromDb: true })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd artifacts/gradefarm && node --test src/lib/diagnosticSubjects.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement both functions in `diagnosticSubjects.js`**

Check unit pairs first (`/units?\s*1\s*(\/|&|and|-)\s*2/i` → stage1, same for 3/4 → stage2), then the existing stage/year rules (`stage 2`/`year 12` → stage2, `stage 1`/`year 11` → stage1, years 7–10 → junior; match "year 1" … "year 6" → primary with a word boundary so "year 10" isn't primary), else `ALL`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd artifacts/gradefarm && node --test src/lib/diagnosticSubjects.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Use it in `TutorScreen.jsx`**

Delete the local `curriculumToYearGroups`; in `DiagnosticTab`'s `fetchLiveCurricula().then(...)`, replace the inline `.map(c => ({ … topics: [] … }))` with `.map(dbDiagnosticSubject)`.

- [ ] **Step 6: Commit**

```bash
git add artifacts/gradefarm/src/lib/diagnosticSubjects.js artifacts/gradefarm/src/lib/diagnosticSubjects.test.js artifacts/gradefarm/src/components/TutorScreen.jsx
git commit -m "Diagnostic tab: database subjects keep their topics; VCE unit levels map to Year 11/12"
```

### Task 2: Server accepts a curriculum scope for link diagnostics

**Files:**
- Create: `artifacts/api-server/src/lib/diagnostic-outline.ts`
- Test: `artifacts/api-server/test/diagnostic-outline.test.ts`
- Modify: `artifacts/api-server/src/routes/diagnostic.ts` (`SubjectConfig` ~line 38, `generateQuestions` ~line 236, `generateCurriculumDiagnostic` ~line 351, routes `/tutor/diagnostic/generate` ~590 and `/tutor/diagnostic/create` ~612)

**Interfaces:**
- Consumes: `diagnosticScope(admin, curriculumId, subtopicIds): Promise<{ topics: ScopeTopic[]; subtopicIds: string[] }>` and `type ScopeTopic` from `lib/student-diagnostic.ts` (existing).
- Produces:
  - `scopeOutline(scope: ScopeTopic[]): string` — one line per topic, `- Topic: Sub; Sub` or `- Topic` when it has no subtopics; `""` for `[]`.
  - `SubjectConfig` gains `curriculumId?: string; subtopicIds?: string[]` (request body for both routes).

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeOutline } from "../src/lib/diagnostic-outline";

test("outline lists each topic with its subtopics", () => {
  assert.equal(
    scopeOutline([{ topic: "Functions", subtopics: ["Domain and range", "Inverse functions"] }, { topic: "Probability", subtopics: [] }]),
    "- Functions: Domain and range; Inverse functions\n- Probability",
  );
});

test("an empty scope gives an empty outline", () => {
  assert.equal(scopeOutline([]), "");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd artifacts/api-server && npx tsx --test test/diagnostic-outline.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `scopeOutline` in `diagnostic-outline.ts`**

Use `import type { ScopeTopic } from "./student-diagnostic"` (type-only, so the test doesn't load Supabase). Replace the inline `outline` in `generateCurriculumDiagnostic` with `scopeOutline(scope)`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd artifacts/api-server && npx tsx --test test/diagnostic-outline.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Wire the routes**

- `generateQuestions(yearLevel, subjects, outline?: string)`: when `outline` is a non-empty string, `subjectDesc` becomes `${name} — topics and subtopics (topic: subtopic; subtopic; …):\n${outline}` and rule 6 adds "Copy topic and subtopic names exactly as written in the list." When `outline === ""` (curriculum with no topics), `subjectDesc` is `${name} — the whole course`. When `outline` is undefined, behaviour is unchanged.
- `/tutor/diagnostic/generate`: if `subjects[0]?.curriculumId`, call `diagnosticScope(admin, curriculumId, subtopicIds ?? [])` and pass `scopeOutline(scope.topics)`. Take `admin` from `requireTutor`'s ctx. Drop the "at least one topic" requirement only for this case (none exists server-side today; keep it that way).
- `/tutor/diagnostic/create`: if `subjects[0]?.curriculumId`, call `diagnosticScope` again and insert `curriculum_id: curriculumId, subtopic_ids: scope.subtopicIds` (the matched ids only, so stale/foreign ids become `[]`). Do not set `student_id`.

- [ ] **Step 6: Typecheck and run the whole suite**

Run: `cd artifacts/api-server && pnpm run typecheck && pnpm test`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/lib/diagnostic-outline.ts artifacts/api-server/test/diagnostic-outline.test.ts artifacts/api-server/src/routes/diagnostic.ts
git commit -m "Link diagnostics: generate from a curriculum's chosen subtopics and save the scope"
```

### Task 3: Shared topic picker component

**Files:**
- Create: `artifacts/gradefarm/src/components/DiagnosticScopePicker.jsx`
- Modify: `artifacts/gradefarm/src/components/StudentsTab.jsx` (remove the local `DiagnosticScopePicker` at ~line 988–1060 and its now-unused `fetchSubjectTopics` import; import the new default export)

**Interfaces:**
- Produces: `export default function DiagnosticScopePicker({ subject: { id, label }, selected: string[], onChange: (ids: string[]) => void, theme, defaultOpen = false })` — `subject.id` is the curriculum id; behaviour identical to today's when `defaultOpen` is false.

- [ ] **Step 1: Move the component verbatim**, bringing its imports (`useState`, `useEffect`, `THEMES`, `fetchSubjectTopics`) and a local `FONT_B` constant (same value as `StudentsTab.jsx:31`). Add `defaultOpen` as the initial value of `open`.

- [ ] **Step 2: Import it in `StudentsTab.jsx`** and delete the old definition.

- [ ] **Step 3: Build**

Run: `cd artifacts/gradefarm && pnpm run build && pnpm test`
Expected: build succeeds; existing client tests pass.

- [ ] **Step 4: Commit**

```bash
git add artifacts/gradefarm/src/components/DiagnosticScopePicker.jsx artifacts/gradefarm/src/components/StudentsTab.jsx
git commit -m "Move the diagnostic topic picker into a shared component"
```

### Task 4: Use the picker in the Diagnostic tab

**Files:**
- Modify: `artifacts/gradefarm/src/components/TutorScreen.jsx` (`DiagnosticTab`, ~lines 1651–1880)

**Interfaces:**
- Consumes: `dbDiagnosticSubject` subjects (Task 1: `fromDb`, `curriculumId`, `topics`); `DiagnosticScopePicker` (Task 3); `SubjectConfig.curriculumId` / `subtopicIds` (Task 2).

- [ ] **Step 1: State and reset.** Add `const [selectedSubtopicIds, setSelectedSubtopicIds] = useState([])`. Clear it wherever `setSelectedTopics([])` is called today (year-level change, subject change, `resetForm`).

- [ ] **Step 2: Render.** In the Topics block, when `selectedSubject.fromDb`, render `<DiagnosticScopePicker subject={{ id: selectedSubject.curriculumId, label: selectedSubject.name }} selected={selectedSubtopicIds} onChange={setSelectedSubtopicIds} theme={theme} defaultOpen />` instead of the chips. Built-in subjects keep the chips.

- [ ] **Step 3: Request.** Build `subjectConfig` once (shared by `handleGenerate` and `handleCreate`): for `fromDb` subjects `{ name, topics: selectedSubject.topics, curriculumId: selectedSubject.curriculumId, subtopicIds: selectedSubtopicIds }`; otherwise today's shape. In `handleGenerate`, apply "Please select at least one topic." only when `!selectedSubject.fromDb`.

- [ ] **Step 4: Build and test**

Run: `cd artifacts/gradefarm && pnpm run build && pnpm test`
Expected: build succeeds; tests pass.

- [ ] **Step 5: Manual check in the running app** (use the `run` skill): as a tutor, Diagnostic tab → Year 11 → a database subject such as VCE Mathematical Methods Units 1/2 shows its topic tree; tick two subtopics → Generate → preview questions carry those subtopic names → Create → the row in `diagnostic_assessments` has `curriculum_id` and the two `subtopic_ids`. Repeat with a built-in subject (e.g. Stage 1 Mathematical Methods chips) and confirm it still creates with `curriculum_id` null. Switch subject after ticking and confirm the selection clears.

- [ ] **Step 6: Commit**

```bash
git add artifacts/gradefarm/src/components/TutorScreen.jsx
git commit -m "Diagnostic tab: choose topics and subtopics for database subjects"
```
