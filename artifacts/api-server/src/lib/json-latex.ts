/**
 * Parse JSON arrays emitted by the model that contain raw LaTeX.
 *
 * Models frequently write single-backslash LaTeX (e.g. "\frac{1}{2}",
 * "\times") instead of the JSON-legal "\\frac". Plain JSON.parse then silently
 * turns "\f" into a form-feed and "\t" into a tab — so "\frac{1}{2}" renders as
 * "↰rac{1}{2}". Inside string literals we re-escape any backslash that isn't a
 * JSON escape we want to keep verbatim (\" \\ \/ \uXXXX), converting LaTeX
 * commands back into literal "\\frac" etc. before parsing.
 */
export function repairLatexJson(s: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { out += c; inStr = !inStr; continue; }
    if (c === "\\" && inStr) {
      const n = s[i + 1];
      if (n === '"' || n === "\\" || n === "/") { out += c + n; i++; continue; }
      if (n === "u" && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) { out += c + n; continue; }
      // Anything else after the backslash is a LaTeX command (or an unwanted
      // control escape): double the backslash so it survives JSON.parse.
      out += "\\\\";
      continue;
    }
    out += c;
  }
  return out;
}

function tryParseArray(text: string): unknown[] | null {
  // Prefer the LaTeX-repaired parse; fall back to the raw text if repair fails.
  for (const candidate of [repairLatexJson(text), text]) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}

/** Extract a JSON array from arbitrary model output, repairing LaTeX escapes. */
export function extractJsonArray(text = ""): unknown[] {
  const whole = tryParseArray(text);
  if (whole) return whole;
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  return tryParseArray(text.slice(start, end + 1)) ?? [];
}
