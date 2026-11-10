import { test } from "node:test";
import assert from "node:assert/strict";
import { topicsAfter, scopePromptLines, hasScope } from "../src/lib/course-scope";

const topics = [
  { name: "Quadratics", order_index: 2 },
  { name: "A gallery of graphs", order_index: 3 },
  { name: "Differentiation", order_index: 13 },
  { name: "Rates of change", order_index: 12 },
];

test("later topics come after the subtopic's topic, in course order", () => {
  assert.deepEqual(topicsAfter(topics, 3), ["Rates of change", "Differentiation"]);
  assert.deepEqual(topicsAfter(topics, 13), []);
  assert.deepEqual(topicsAfter(topics, null), []);
});

test("the prompt names the later topics; a scope with only those still counts", () => {
  const scope = { subject: "Methods 1&2", level: "Year 11", outOfScope: "", topic: "A gallery of graphs", subtopic: "The graph of y² = x", scope: "", laterTopics: ["Rates of change", "Differentiation"] };
  assert.equal(hasScope(scope), true);
  const text = scopePromptLines(scope).join("\n");
  assert.match(text, /A gallery of graphs > The graph of y² = x/);
  assert.match(text, /Rates of change; Differentiation/);
  assert.equal(hasScope({ ...scope, laterTopics: [] }), false);
  assert.deepEqual(scopePromptLines({ ...scope, laterTopics: [] }), []);
});
