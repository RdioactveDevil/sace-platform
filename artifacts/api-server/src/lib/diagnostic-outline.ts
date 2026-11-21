import type { ScopeTopic } from "./student-diagnostic";

/**
 * A diagnostic's scope as prompt lines, one per topic: "- Topic: Sub; Sub",
 * or "- Topic" when it has no subtopics. Empty for an empty scope.
 */
export function scopeOutline(scope: ScopeTopic[]): string {
  return scope.map((t) => (t.subtopics.length ? `- ${t.topic}: ${t.subtopics.join("; ")}` : `- ${t.topic}`)).join("\n");
}

/** The "subtopic" field's description in the question format: exact names when there's a list to copy from. */
export function subtopicFieldHint(outline?: string): string {
  return outline ? "<subtopic name, copied exactly from the list>" : "<specific subtopic or concept>";
}
