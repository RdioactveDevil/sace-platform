import { test } from "node:test";
import assert from "node:assert/strict";
import { solutionAllowed } from "../src/lib/solution-access.ts";

const base = { staff: false, answered: false, paid: false, pastPaper: false, inOwnAttempt: false };

test("staff always get solutions", () => {
  assert.equal(solutionAllowed({ ...base, staff: true }), true);
});

test("a question answered in practice gets its solution, paid or free", () => {
  assert.equal(solutionAllowed({ ...base, answered: true }), true);
  assert.equal(solutionAllowed({ ...base, answered: true, paid: true }), true);
});

test("past and trial paper solutions need a paid plan for the subject", () => {
  assert.equal(solutionAllowed({ ...base, pastPaper: true }), false);
  assert.equal(solutionAllowed({ ...base, pastPaper: true, paid: true }), true);
});

test("questions in an exam attempt need a paid plan too", () => {
  assert.equal(solutionAllowed({ ...base, inOwnAttempt: true }), false);
  assert.equal(solutionAllowed({ ...base, inOwnAttempt: true, paid: true }), true);
});

test("a paid student doesn't get solutions to other questions they haven't answered", () => {
  assert.equal(solutionAllowed({ ...base, paid: true }), false);
});
