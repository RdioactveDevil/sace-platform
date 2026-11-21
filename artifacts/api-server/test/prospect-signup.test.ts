import { test } from "node:test";
import assert from "node:assert/strict";
import { adoptionPlan, signupState, INVITE_TTL_MS } from "../src/lib/prospect-signup";

const source = (over: Partial<{ id: string; curriculum_id: string | null; student_id: string | null }> = {}) =>
  ({ id: "d1", curriculum_id: "c-maths", student_id: null, ...over });

test("adoptionPlan adopts the source diagnostic for its own subject", () => {
  const plan = adoptionPlan({ unlockedIds: ["c-maths", "c-physics"], source: source(), existing: [] });
  assert.equal(plan.get("c-maths"), "adopt");
  assert.equal(plan.get("c-physics"), "create");
});

test("adoptionPlan keeps a diagnostic the student already has", () => {
  const plan = adoptionPlan({ unlockedIds: ["c-maths"], source: source(), existing: ["c-maths"] });
  assert.equal(plan.get("c-maths"), "keep-existing");
});

test("adoptionPlan never adopts a diagnostic that already belongs to a student", () => {
  const plan = adoptionPlan({ unlockedIds: ["c-maths"], source: source({ student_id: "s1" }), existing: [] });
  assert.equal(plan.get("c-maths"), "create");
});

test("adoptionPlan: a source for another subject adopts nothing", () => {
  const plan = adoptionPlan({ unlockedIds: ["c-physics"], source: source(), existing: [] });
  assert.deepEqual([...plan.entries()], [["c-physics", "create"]]);
});

test("adoptionPlan: no source means every subject is created", () => {
  const plan = adoptionPlan({ unlockedIds: ["a", "b"], source: null, existing: ["b"] });
  assert.equal(plan.get("a"), "create");
  assert.equal(plan.get("b"), "keep-existing");
});

const DAY = 24 * 3_600_000;
const NOW = Date.parse("2026-11-21T00:00:00.000Z");
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

test("signupState: a pending invite expires after the invite TTL", () => {
  assert.equal(INVITE_TTL_MS, 30 * DAY);
  assert.deepEqual(signupState([{ status: "pending", sent_at: ago(29), created_at: ago(35) }], NOW), { status: "invited" });
  assert.equal(signupState([{ status: "pending", sent_at: ago(31), created_at: ago(31) }], NOW), null);
  assert.equal(signupState([{ status: "pending", sent_at: null, created_at: ago(31) }], NOW), null);
  assert.deepEqual(signupState([{ status: "accepted", sent_at: ago(40), created_at: ago(40) }], NOW), { status: "signed_up" });
});

test("signupState", () => {
  assert.deepEqual(signupState([{ status: "pending", created_at: ago(1) }], NOW), { status: "invited" });
  assert.deepEqual(signupState([{ status: "accepted", student_name: "Ada" }], NOW), { status: "signed_up", studentName: "Ada" });
  assert.deepEqual(signupState([{ status: "pending", created_at: ago(1) }, { status: "accepted", student_name: "Ada" }], NOW), { status: "signed_up", studentName: "Ada" });
  assert.deepEqual(signupState([{ status: "accepted" }], NOW), { status: "signed_up" });
  for (const s of ["declined", "expired", "cancelled"]) assert.equal(signupState([{ status: s, created_at: ago(1) }], NOW), null);
  assert.equal(signupState([], NOW), null);
});
