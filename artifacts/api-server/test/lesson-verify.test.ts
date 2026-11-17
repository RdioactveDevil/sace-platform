import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCheckVerdict, applyExampleVerdict, parseJsonObject, verifyLesson, verifyLessonText, type LessonCheck } from "../src/lib/lesson-verify.ts";

// The final challenge a student met: key on 22 g, explanation working out 44 g.
const FUEL: LessonCheck = {
  question: "A fuel releases 2.5 mol of $CO_2$ for every 1.0 mol of fuel burned. How many grams of $CO_2$ are released when 0.40 mol of fuel is burned? ($M(CO_2) = 44.0$ g mol$^{-1}$)",
  options: ["44 g", "22 g", "110 g", "4.4 g"],
  answer_index: 1,
  explanation: "0.40 mol × 2.5 = 1.0 mol CO2; 1.0 × 44.0 = 44 g. Hmm, check: this gives 44 g, so the correct option is the first one.",
};

test("a wrong answer key is moved to the right option with a matching explanation", () => {
  const out = applyCheckVerdict(FUEL, {
    verdict: "wrong_answer", correct_index: 0, explanation_ok: false,
    explanation: "$n(CO_2) = 0.40 \\times 2.5 = 1.0$ mol, so $m = 1.0 \\times 44.0 = 44$ g. Multiplying 2.5 by 44.0 without the 0.40 gives 110 g.",
  });
  assert.equal(out?.answer_index, 0);
  assert.match(out!.explanation!, /44 = 44|= 44\$? g/);
});

test("a moved key without a usable explanation drops the question", () => {
  assert.equal(applyCheckVerdict(FUEL, { verdict: "wrong_answer", correct_index: 0, explanation: "" }), null);
  // Checker talk must never reach a student.
  assert.equal(applyCheckVerdict(FUEL, { verdict: "wrong_answer", correct_index: 0, explanation: "Option A matches, not the marked option B." }), null);
  assert.equal(applyCheckVerdict(FUEL, { verdict: "wrong_answer", correct_index: 9, explanation: "44 g." }), null);
});

test("a question with no right option is dropped; a right one is kept as it is", () => {
  assert.equal(applyCheckVerdict(FUEL, { verdict: "wrong_question" }), null);
  const ok = { ...FUEL, answer_index: 0, explanation: "0.40 × 2.5 = 1.0 mol; × 44.0 = 44 g." };
  assert.equal(applyCheckVerdict(ok, { verdict: "correct", explanation_ok: true, explanation: "" }), ok);
  assert.equal(applyCheckVerdict(ok, null), ok); // the checker failed: kept as written
});

test("a right key with a wrong explanation gets the corrected explanation, or none", () => {
  const c = { ...FUEL, answer_index: 0 };
  assert.equal(applyCheckVerdict(c, { verdict: "correct", explanation_ok: false, explanation: "1.0 mol × 44.0 g/mol = 44 g." })?.explanation, "1.0 mol × 44.0 g/mol = 44 g.");
  assert.equal(applyCheckVerdict(c, { verdict: "correct", explanation_ok: false, explanation: "" })?.explanation, "");
});

test("worked example lines are replaced only by a usable corrected working", () => {
  const steps = [{ work: "$n = 2.0$" }, { work: "$m = 2.0 \\times 44 = 80$ g" }];
  const fixed = [{ work: "$n = 2.0$ mol", note: "1:1 ratio" }, { work: "$m = 2.0 \\times 44.0 = 88$ g" }];
  assert.deepEqual(applyExampleVerdict(steps, { verdict: "fixed", steps: fixed }), fixed);
  assert.equal(applyExampleVerdict(steps, { verdict: "correct" }), steps);
  assert.equal(applyExampleVerdict(steps, { verdict: "fixed", steps: [{ work: "" }] }), steps);
  assert.equal(applyExampleVerdict(steps, null), steps);
});

test("model JSON with single-backslash LaTeX parses without mangling it", () => {
  const v = parseJsonObject('Here: {"verdict": "wrong_answer", "correct_index": 0, "explanation": "$\\frac{44}{44} = 1$ and $2.5 \\times 0.40$"}');
  assert.equal(v?.explanation, "$\\frac{44}{44} = 1$ and $2.5 \\times 0.40$");
});

test("verifyLesson checks every question and the example, fixing and dropping", async () => {
  const lesson = {
    title: "Mole ratios",
    ideas: [
      { title: "Ratio", text: "Use the equation.", check: { ...FUEL, question: "idea check" } },
      { title: "Mass", text: "m = nM", check: { question: "bad one", options: ["1", "2"], answer_index: 0 } },
    ],
    example: { problem: "Mass of CO2 from 2.0 mol CH4?", steps: [{ work: "$n = 2.0$" }, { work: "$m = 80$ g" }] },
    checks: [FUEL],
    summary: ["a"],
  };
  const seen: string[] = [];
  const ask = async (prompt: string) => {
    seen.push(prompt);
    if (prompt.includes("worked example")) return '{"verdict": "fixed", "steps": [{"work": "$n = 2.0$ mol"}, {"work": "$m = 88$ g"}]}';
    if (prompt.includes("bad one")) return '{"verdict": "wrong_question", "correct_index": null}';
    return '{"verdict": "wrong_answer", "correct_index": 0, "explanation_ok": false, "explanation": "0.40 × 2.5 = 1.0 mol, × 44.0 = 44 g."}';
  };
  const out = await verifyLesson(lesson, "Chemistry Stage 2", ask);
  assert.equal(seen.length, 4); // two idea checks, one final, the example
  const ideas = out.lesson.ideas as Record<string, any>[];
  assert.equal(ideas[0].check.answer_index, 0);
  assert.equal("check" in ideas[1], false); // dropped, the idea stays
  assert.equal((out.lesson.checks as LessonCheck[])[0].answer_index, 0);
  assert.equal((out.lesson.example as any).steps[1].work, "$m = 88$ g");
  assert.deepEqual({ fixed: out.fixed, dropped: out.dropped, exampleFixed: out.exampleFixed }, { fixed: 2, dropped: 1, exampleFixed: true });
});

test("a checker that errors leaves the lesson as written", async () => {
  const lesson = { ideas: [{ title: "a", text: "b", check: FUEL }], example: { problem: "p", steps: [{ work: "w" }] }, checks: [FUEL] };
  const out = await verifyLesson(lesson, "", async () => { throw new Error("overloaded"); });
  assert.equal(out.fixed + out.dropped, 0);
  assert.equal((out.lesson.checks as LessonCheck[])[0].answer_index, 1);
});

test("verifyLessonText returns non-lesson text untouched and lessons as clean JSON", async () => {
  assert.equal(await verifyLessonText("sorry, no lesson", "", async () => "{}"), "sorry, no lesson");
  const raw = '{"title": "t", "ideas": [{"title": "a", "text": "$\\frac{1}{2}$"}], "example": {"problem": "p", "steps": [{"work": "w"}]}, "checks": []}';
  const text = await verifyLessonText(raw, "", async () => '{"verdict": "correct"}');
  assert.equal(JSON.parse(text).ideas[0].text, "$\\frac{1}{2}$");
});
