# Diagnostic tab: topic and subtopic picker for every subject

Project 1 of 5 in the prospect-consultation work (diagnostic → questionnaire →
booked call → sign-up). Later projects: one prospect link with a built-in
questionnaire and prospect tracker; booking (weekly hours minus Google Calendar
busy times via the secret iCal address, self-book or tutor-book by email,
calendar-invite emails, guest video room, tutor-set reminders); a call-ready
report and one-click conversion to a student; a Google Calendar OAuth button
once Google verifies the app.

## Why

Tutors send prospects a diagnostic from the Diagnostic tab ("New diagnostic").
Subjects that come from the curriculum database, such as VCE Mathematical
Methods Units 1/2, show no topics there: `DiagnosticTab` in
`artifacts/gradefarm/src/components/TutorScreen.jsx` maps database curricula to
`topics: []`, discarding the topic names `fetchLiveCurricula` loads and never
loading subtopics. With nothing to tick, "Generate test" refuses ("Please
select at least one topic"). Separately, `curriculumToYearGroups` files any
level label it doesn't recognise (e.g. "Units 1/2") under Years 7–10.

## Goals

- Database subjects show their real topics and subtopics in the Diagnostic tab.
- The tutor can tick whole topics or single subtopics, or tick nothing to cover
  the whole subject.
- The chosen subtopics reach the question generator, and each generated
  question carries the exact subtopic name, so the report's subtopic breakdown
  lines up with the curriculum.
- The saved assessment records `curriculum_id` and `subtopic_ids` (columns that
  already exist on `diagnostic_assessments`), so project 4 can carry it into
  the student's account.
- "Units 1/2" maps to Year 11 / Stage 1 and "Units 3/4" to Year 12 / Stage 2;
  any other unrecognised level label shows under every year level.

## Non-goals

- Editing or regenerating single questions, templates, test length or mix
  (project 2).
- Changing the built-in (hard-coded) subjects' topic lists; they keep their flat
  topic chips.
- Changing the invite/roster diagnostic flow beyond sharing the picker.

## Anti-goals

- Two diverging copies of the topic picker.
- Breaking existing link diagnostics or their reports.

## Approaches

1. **Share the invite screen's picker (chosen).** Move `DiagnosticScopePicker`
   out of `StudentsTab.jsx` into its own component and use it in both places.
   One picker, same behaviour everywhere.
2. Build a second picker inside `TutorScreen.jsx`. Faster to write, but the two
   would drift apart.
3. Resolve the topic tree on the server and send only ids. Cleaner data flow,
   but a bigger change to the `/tutor/diagnostic/generate` contract than this
   fix needs.

## Design

- **Client.** For database subjects (`id` starting `db_`), the topic area
  renders the shared picker, loading the tree with `fetchSubjectTopics`.
  Built-in subjects keep the existing chips. For database subjects an empty
  selection means "whole subject" and Generate is allowed.
- **Request.** `SubjectConfig` gains optional `curriculumId` and
  `subtopicIds`. The client sends them for database subjects; `topics` is still
  sent (topic names) so older code paths keep working.
- **Server.** When `curriculumId` is present, `/tutor/diagnostic/generate`
  resolves the scope with the existing `diagnosticScope()` and gives the
  generator a "topic: subtopic; subtopic" outline, telling it to copy subtopic
  names exactly. `/tutor/diagnostic/create` saves `curriculum_id` and the
  matched `subtopic_ids`. It does not set `student_id`, so the
  one-per-student-and-subject index is unaffected.
- **Year levels.** `curriculumToYearGroups` recognises "units 1/2" / "units 1
  and 2" → stage1 and "units 3/4" → stage2; an unrecognised label returns every
  group.

## Left to the builder

- Exact prop shape of the shared picker (it already takes `subject`,
  `selected`, `onChange`, `theme`; `subject` needs `id` and `label`).
- Whether the picker opens expanded in the Diagnostic tab.
- Unit tests for the level-label mapping and the scope outline; a manual check
  in the running app with a database subject.
