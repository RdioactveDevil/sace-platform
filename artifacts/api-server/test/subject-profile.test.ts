import { test } from "node:test";
import assert from "node:assert/strict";
import { subjectProfile } from "../src/lib/subject-profile.ts";
import { markingSystem } from "../src/lib/marking.ts";
import { draftRules, checkRules } from "../src/lib/marked-questions.ts";

test("profiles of the live curricula", () => {
  const pick = (s: string, l = "") => {
    const p = subjectProfile(s, l);
    return [p.kind, p.board, p.year, p.marker];
  };
  assert.deepEqual(pick("SACE Chemistry Stage 2", "Year 12"), ["chem", "SACE", 12, "SACE Chemistry Stage 2 assessor"]);
  assert.deepEqual(pick("SACE Specialist Mathematics Stage 1", "Year 11"), ["maths", "SACE", 11, "SACE Specialist Mathematics Stage 1 assessor"]);
  assert.deepEqual(pick("VCE Mathematical Methods Units 1 and 2", "Year 11"), ["maths", "VCE", 11, "VCE Mathematical Methods Units 1 and 2 assessor"]);
  assert.deepEqual(pick("Year 6 Mathematics", "Year 6"), ["maths", null, 6, "Year 6 Mathematics teacher"]);
  assert.deepEqual(pick("Year 6 English"), ["other", null, 6, "Year 6 English teacher"]);
});

test("the year comes from the name when there's no level label", () => {
  assert.equal(subjectProfile("SACE Chemistry Stage 1").year, 11);
  assert.equal(subjectProfile("VCE Mathematical Methods Units 3 & 4").year, 12);
  assert.equal(subjectProfile("Chemistry").yearText, "senior secondary");
  assert.equal(subjectProfile("Physics", "Year 10").year, 10);
});

test("exam style follows the board and year", () => {
  assert.equal(subjectProfile("SACE Chemistry Stage 2").examStyle, "in the style of the SACE end-of-year exam");
  assert.match(subjectProfile("VCE Mathematical Methods Units 1 and 2").examStyle, /Year 11 school tests.*VCAA/);
  assert.equal(subjectProfile("Year 6 Mathematics").examStyle, "pitched at Year 6 class tests");
});

test("the marker speaks to the subject", () => {
  const chem = markingSystem("SACE Chemistry Stage 2");
  assert.match(chem, /SACE Chemistry Stage 2 assessor marking .* Year 12 student/);
  assert.match(chem, /changes the chemistry/);
  assert.match(chem, /\$\\ce\{\.\.\.\}\$/);
  assert.doesNotMatch(chem, /equation editor/);

  const methods = markingSystem("VCE Mathematical Methods Units 1 and 2");
  assert.match(methods, /Year 11 student/);
  assert.match(methods, /Follow VCE conventions/);
  assert.match(methods, /equation editor, one step per line/);
  assert.match(methods, /Show that/);
  assert.match(methods, /mark only the mathematics/);
  assert.doesNotMatch(methods, /chemistry|\\ce/);

  const y6 = markingSystem("Year 6 Mathematics");
  assert.match(y6, /Year 6 Mathematics teacher marking .* Year 6 student/);
  assert.match(y6, /Use words a Year 6 student understands/);
  assert.doesNotMatch(y6, /SACE|VCE/);
});

test("maths questions are set out as typed working", () => {
  const rules = draftRules({ subject: "VCE Mathematical Methods Units 1 and 2", levelLabel: "Year 11" }).join("\n");
  assert.match(rules, /VCAA/);
  assert.match(rules, /Never ask them to draw, sketch/);
  assert.match(rules, /Show that/);
  assert.match(rules, /one step per line/);
  assert.match(rules, /Use LaTeX notation/);
  assert.match(rules, /structures is always \[\]/);
  assert.doesNotMatch(rules, /\\ce|SACE command words/);

  const y6 = draftRules({ subject: "Year 6 Mathematics", levelLabel: "Year 6" }).join("\n");
  assert.match(y6, /Worth 1 to 3 marks/);
  assert.match(y6, /a strong Year 6 student/);

  const check = checkRules({ subject: "Year 6 Mathematics", levelLabel: "Year 6" }).join("\n");
  assert.match(check, /mathematically correct/);
  assert.match(check, /entirely by typing/);
});

test("chemistry keeps its SACE short-answer rules", () => {
  const rules = draftRules({ subject: "SACE Chemistry Stage 2", levelLabel: "Year 12" }).join("\n");
  assert.match(rules, /in the style of the SACE end-of-year exam/);
  assert.match(rules, /SACE command words \(State, Identify/);
  assert.match(rules, /a strong Year 12 student/);
  assert.match(rules, /\$\\ce\{\.\.\.\}\$/);
  assert.doesNotMatch(rules, /equation editor|structures is always \[\]/);

  const check = checkRules({ subject: "SACE Chemistry Stage 2", levelLabel: "Year 12" }).join("\n");
  assert.match(check, /scientifically correct/);
  assert.doesNotMatch(check, /entirely by typing/);
});
