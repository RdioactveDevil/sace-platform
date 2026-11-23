import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeSupabase, type FakeDb } from "./fake-supabase";
import { diagnosticShortAnswers, saveMarkedQuestions, type MarkedTarget } from "../src/lib/marked-questions";
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
  shuffleOptions,
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
      table_data: { a: 1 }, diagram: { b: 2 }, bank_question_id: "ai_marked_1",
    },
  ]) as Record<string, unknown>[];
  for (const k of ["correct_answer", "solution_notes", "marking_scheme", "solution", "bank_question_id"]) assert.ok(!(k in q), k);
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

test("diagnosticShortAnswers saves a curriculum subject's drafts to the bank and returns their bank ids", async () => {
  const db: FakeDb = { tables: {} };
  const t: MarkedTarget = { curriculumId: "cur1", subtopicId: "sub1", subject: "Chemistry", levelLabel: "Stage 1", examContext: "", topic: "Bonding", subtopic: "Ionic" };
  const draft = { question: "Q", total_marks: 2, marking_scheme: [{ marks: 2, point: "p" }], solution: "s", difficulty: 4 };
  const out = await diagnosticShortAnswers(fakeSupabase(db), t, [draft, { ...draft, question: "Q2" }]);
  const saved = db.tables.questions ?? [];
  assert.equal(saved.length, 2);
  assert.equal(saved[0].curriculum_id, "cur1");
  assert.equal(saved[0].question_type, "marked");
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((q) => q.bank_question_id), saved.map((r) => r.id));
  assert.ok(out.every((q) => typeof q.bank_question_id === "string" && q.bank_question_id.startsWith("ai_marked_")));
  assert.equal(out[0].type, "marked");
  assert.equal(out[0].difficulty, "exam");
  assert.equal(out[1].question, "Q2");
});

test("diagnosticShortAnswers keeps a subject outside a curriculum out of the bank", async () => {
  const db: FakeDb = { tables: {} };
  const t: MarkedTarget = { curriculumId: null, subtopicId: null, subject: "Maths", levelLabel: "Year 11", examContext: "", topic: "T", subtopic: "T" };
  const draft = { question: "Q", total_marks: 1, marking_scheme: [{ marks: 1, point: "p" }], solution: "s", difficulty: 3 };
  const out = await diagnosticShortAnswers(fakeSupabase(db), t, [draft]);
  assert.equal((db.tables.questions ?? []).length, 0);
  assert.equal(out.length, 1);
  assert.equal("bank_question_id" in out[0], false);
});

// ── Option shuffling (the writer puts the right answer first) ────────────────

/** A seeded generator, so the shuffle tests are repeatable. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const oneMcq = (o: Partial<{ options: string[]; correct_answer: string; solution_notes: string; type: string }> = {}) => ({
  id: 1, question: "Solve $3x + 7 = 22$.", type: "multiple_choice", marks: 1, difficulty: "easy", topic: "Algebra",
  options: ["A. $x = 5$", "B. $x = 3$", "C. $x = 15$", "D. $x = 29$"], correct_answer: "A",
  solution_notes: "Subtract 7 then divide by 3.", ...o,
});

test("shuffleOptions keeps the right answer with its text and relabels A–D in order", () => {
  for (let seed = 1; seed <= 25; seed++) {
    const out = shuffleOptions(oneMcq(), seeded(seed));
    assert.deepEqual(out.options.map((o: string) => o.slice(0, 3)), ["A. ", "B. ", "C. ", "D. "]);
    assert.deepEqual([...out.options.map((o: string) => o.slice(3))].sort(), ["$x = 15$", "$x = 29$", "$x = 3$", "$x = 5$"]);
    const i = "ABCD".indexOf(out.correct_answer);
    assert.equal(out.options[i].slice(3), "$x = 5$");
  }
});

test("shuffleOptions spreads answers that were all A across every letter", () => {
  const rand = seeded(42);
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (let k = 0; k < 400; k++) counts[shuffleOptions(oneMcq(), rand).correct_answer]++;
  for (const letter of "ABCD") assert.ok(counts[letter] > 60, `${letter} came up only ${counts[letter]} times`);
});

test("shuffleOptions follows the answer letter in the solution notes", () => {
  const rand = () => 0; // a fixed permutation; the expected letters are read off the result
  const out = shuffleOptions(oneMcq({ solution_notes: "Option A is right; answer (C) forgets to divide." }), rand);
  const where = (text: string) => "ABCD"[out.options.findIndex((o: string) => o.endsWith(text))];
  assert.equal(out.solution_notes, `Option ${where("$x = 5$")} is right; answer (${where("$x = 15$")}) forgets to divide.`);
});

test("shuffleOptions leaves options that refer to each other in place", () => {
  for (const options of [
    ["A. 2", "B. 3", "C. 4", "D. All of the above"],
    ["A. 2", "B. 3", "C. Both A and B", "D. 5"],
    ["A. 2", "B. 3", "C. 4", "D. None of these"],
  ]) {
    const q = oneMcq({ options, correct_answer: "D" });
    assert.deepEqual(shuffleOptions(q, seeded(7)), q);
  }
});

test("shuffleOptions leaves anything that isn't a well-formed four-option MCQ alone", () => {
  const sa = { ...oneMcq(), type: "short_answer", options: undefined, correct_answer: "x = 5" };
  assert.deepEqual(shuffleOptions(sa, seeded(3)), sa);
  const three = oneMcq({ options: ["A. 1", "B. 2", "C. 3"] });
  assert.deepEqual(shuffleOptions(three, seeded(3)), three);
  const badKey = oneMcq({ correct_answer: "E" });
  assert.deepEqual(shuffleOptions(badKey, seeded(3)), badKey);
});
