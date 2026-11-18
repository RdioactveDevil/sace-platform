import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMathScale } from "../src/lib/math-scale.ts";

test("a listed maths size is saved as it is", () => {
  assert.deepEqual(parseMathScale({ math_scale: 1.3 }), { math_scale: 1.3 });
  assert.deepEqual(parseMathScale({ math_scale: 1.5 }), { math_scale: 1.5 });
});

test("the normal size is saved as null", () => {
  assert.deepEqual(parseMathScale({ math_scale: 1 }), { math_scale: null });
  assert.deepEqual(parseMathScale({ math_scale: null }), { math_scale: null });
});

test("anything else is refused", () => {
  for (const body of [{}, { math_scale: 3 }, { math_scale: "1.3" }, { math_scale: 1.2 }, null]) {
    assert.ok("error" in parseMathScale(body), JSON.stringify(body));
  }
});
