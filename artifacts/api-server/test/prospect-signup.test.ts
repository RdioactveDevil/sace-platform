import { test } from "node:test";
import assert from "node:assert/strict";
import { adoptionPlan, signupState } from "../src/lib/prospect-signup";

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

test("signupState", () => {
  assert.deepEqual(signupState([{ status: "pending" }]), { status: "invited" });
  assert.deepEqual(signupState([{ status: "accepted", student_name: "Ada" }]), { status: "signed_up", studentName: "Ada" });
  assert.deepEqual(signupState([{ status: "pending" }, { status: "accepted", student_name: "Ada" }]), { status: "signed_up", studentName: "Ada" });
  assert.deepEqual(signupState([{ status: "accepted" }]), { status: "signed_up" });
  for (const s of ["declined", "expired", "cancelled"]) assert.equal(signupState([{ status: s }]), null);
  assert.equal(signupState([]), null);
});
