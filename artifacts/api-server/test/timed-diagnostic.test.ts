import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeSupabase, type FakeDb } from "./fake-supabase";
import { saveMarkedQuestions, type MarkedTarget } from "../src/lib/marked-questions";
import {
  TIME_LIMIT_MINUTES,
  MCQ_COUNT,
  SHORT_ANSWER_MARKS,
  REMARK_AFTER_MS,
  MAX_MARKING_ATTEMPTS,
  isEnglishOnly,
  checkTimedTest,
  timeLimitFor,
  diagnosticDifficulty,
  sanitiseQuestionsForStudent,
  toDiagnosticShortAnswer,
} from "../src/lib/timed-diagnostic";

const mcq = (n: number, marks = 1) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, type: "multiple_choice", marks }));
const marked = (list: number[]) => list.map((marks, i) => ({ id: 100 + i, type: "marked", marks }));

test("constants", () => {
  assert.equal(TIME_LIMIT_MINUTES, 50);
  assert.equal(MCQ_COUNT, 20);
  assert.equal(SHORT_ANSWER_MARKS, 30);
  assert.equal(REMARK_AFTER_MS, 600_000);
  assert.equal(MAX_MARKING_ATTEMPTS, 3);
});

test("isEnglishOnly", () => {
  assert.equal(isEnglishOnly([{ name: "English" }]), true);
  assert.equal(isEnglishOnly([{ name: "Year 7 Writing" }]), true);
  assert.equal(isEnglishOnly([{ name: "SACE Chemistry Stage 1" }]), false);
  assert.equal(isEnglishOnly([{ name: "English" }, { name: "Physics" }]), false);
});

test("checkTimedTest", () => {
  assert.equal(checkTimedTest([...mcq(20), ...marked([5, 5, 4, 4, 4, 4, 4])]), null);
  assert.match(checkTimedTest([...mcq(19), ...marked([5, 5, 4, 4, 4, 4, 4])])!, /20/);
  assert.match(checkTimedTest([...mcq(20), ...marked([5, 5, 4, 4, 4, 4, 3])])!, /30/);
  const bad = mcq(20);
  bad[0].marks = 2;
  assert.ok(checkTimedTest([...bad, ...marked([30])]));
});

test("timeLimitFor", () => {
  assert.equal(timeLimitFor([...mcq(2), ...marked([5])]), 50);
  assert.equal(timeLimitFor(mcq(2)), null);
});

test("diagnosticDifficulty", () => {
  for (const d of [1, 2, 3]) assert.equal(diagnosticDifficulty(d), "moderate");
  for (const d of [4, 5]) assert.equal(diagnosticDifficulty(d), "exam");
});

test("sanitiseQuestionsForStudent strips answers and keeps display fields", () => {
  const [q] = sanitiseQuestionsForStudent([
    {
      id: 1, question: "Q", type: "marked", marks: 4, difficulty: "exam", topic: "T",
      correct_answer: "x", solution_notes: "n", marking_scheme: [{ marks: 4, point: "p" }], solution: "s",
      table_data: { a: 1 }, diagram: { b: 2 },
    },
  ]) as Record<string, unknown>[];
  for (const k of ["correct_answer", "solution_notes", "marking_scheme", "solution"]) assert.ok(!(k in q), k);
  assert.equal(q.marks, 4);
  assert.equal(q.type, "marked");
  assert.deepEqual(q.table_data, { a: 1 });
  assert.deepEqual(q.diagram, { b: 2 });
});

const bankRow = (difficulty: number) => ({
  id: "q1", question: "Q?", total_marks: 3,
  marking_scheme: [{ marks: 1, point: "a" }, { marks: 2, point: "b" }],
  solution: "model", difficulty,
});

test("toDiagnosticShortAnswer maps a bank row", () => {
  const a = toDiagnosticShortAnswer(bankRow(2), "Topic", "Sub");
  assert.equal(a.type, "marked");
  assert.equal(a.marks, 3);
  assert.equal(a.difficulty, "moderate");
  assert.equal(a.correct_answer, "model");
  assert.equal(a.solution, "model");
  assert.equal(a.bank_question_id, "q1");
  assert.equal(a.topic, "Topic");
  assert.equal(a.subtopic, "Sub");
  assert.equal(a.marking_scheme?.length, 2);
  assert.equal(toDiagnosticShortAnswer(bankRow(5), "T", "S").difficulty, "exam");
  const { id: _id, ...noId } = bankRow(3);
  assert.equal("bank_question_id" in toDiagnosticShortAnswer(noId, "T", "S"), false);
});

test("saveMarkedQuestions does nothing without a curriculum", async () => {
  const db: FakeDb = { tables: {} };
  const t: MarkedTarget = { curriculumId: null, subtopicId: null, subject: "Maths", levelLabel: "Year 11", examContext: "", topic: "T", subtopic: "T" };
  const draft = { question: "Q", total_marks: 1, marking_scheme: [{ marks: 1, point: "p" }], solution: "s", difficulty: 3 };
  const out = await saveMarkedQuestions(fakeSupabase(db), t, [draft]);
  assert.deepEqual(out, []);
  assert.equal((db.tables.questions ?? []).length, 0);
});
