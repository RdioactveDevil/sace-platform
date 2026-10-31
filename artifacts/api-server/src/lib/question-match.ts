// Matching a student's rough copy of a question against the bank.

const STOP = new Set([
  "the", "and", "for", "are", "was", "what", "which", "that", "this", "with", "from", "into", "than", "then",
  "have", "has", "had", "its", "their", "there", "these", "those", "will", "would", "can", "could", "does",
  "how", "who", "why", "when", "where", "your", "you", "they", "them", "find", "work", "out", "value",
  "following", "correct", "answer", "question", "frac", "times", "cdot", "text", "left", "right",
]);

/** Lower-case words and numbers, with LaTeX markup ($, \, braces) taken out. */
export function normalize(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/\\[a-z]+/g, " ")
    .replace(/[$\\{}^_]/g, " ")
    .replace(/[^a-z0-9.%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The most distinctive words in a query: longest first, at most 8. */
export function keywordsFor(q: string): string[] {
  const words = normalize(q).split(" ").filter(w => (w.length >= 4 || /\d/.test(w) && w.length >= 2) && !STOP.has(w));
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 8);
}

type Row = { question?: string | null; options?: unknown; subtopic?: string | null; topic?: string | null };

/** How well a bank question matches: shared words, plus a bonus for a run of the query's words in order. */
export function scoreQuestion(row: Row, q: string, words: string[]): number {
  const opts = Array.isArray(row.options) ? row.options.join(" ") : typeof row.options === "string" ? row.options : "";
  const hay = ` ${normalize(`${row.question || ""} ${opts} ${row.subtopic || ""} ${row.topic || ""}`)} `;
  let score = 0;
  for (const w of words) if (hay.includes(w)) score += w.length >= 6 ? 2 : 1;
  const nq = normalize(q).split(" ").filter(Boolean);
  for (let i = 0; i + 4 <= nq.length; i++) {
    if (hay.includes(` ${nq.slice(i, i + 4).join(" ")} `)) { score += 4; break; }
  }
  return score;
}
