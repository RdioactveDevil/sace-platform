import { test } from "node:test";
import assert from "node:assert/strict";
import { topicsAfter, topicsBefore, scopePromptLines, hasScope } from "../src/lib/course-scope";

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

test("earlier topics are fair game: a later topic may build on them", () => {
  assert.deepEqual(topicsBefore(topics, 13), ["Quadratics", "A gallery of graphs", "Rates of change"]);
  assert.deepEqual(topicsBefore(topics, 2), []);
  const scope = { subject: "Methods 1&2", level: "Year 11", outOfScope: "", topic: "Differentiation", subtopic: "Rules for differentiation", scope: "", laterTopics: [], earlierTopics: ["Quadratics", "A gallery of graphs"] };
  const text = scopePromptLines({ ...scope, scope: "- Derivatives of polynomials" }).join("\n");
  assert.match(text, /HAS already learnt these earlier topics.*Quadratics; A gallery of graphs/);
  assert.doesNotMatch(text, /LATER in the course/);
});
