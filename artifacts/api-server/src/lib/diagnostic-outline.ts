import type { ScopeTopic } from "./student-diagnostic";

/**
 * A diagnostic's scope as prompt lines, one per topic: "- Topic: Sub; Sub",
 * or "- Topic" when it has no subtopics. Empty for an empty scope.
 */
export function scopeOutline(scope: ScopeTopic[]): string {
  return scope.map((t) => (t.subtopics.length ? `- ${t.topic}: ${t.subtopics.join("; ")}` : `- ${t.topic}`)).join("\n");
}
