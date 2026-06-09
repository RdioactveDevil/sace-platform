/**
 * Repairs unescaped LaTeX backslashes in JSON produced by an LLM, so the JSON
 * can be parsed without corrupting the maths.
 *
 * Models routinely emit LaTeX commands with a SINGLE backslash inside JSON
 * strings — e.g. `"common difference \frac{1}{2}"` — even though valid JSON
 * requires `\\frac`. The damage is silent and surprising:
 *
 *   - `\f` is a *valid* JSON escape (form feed, U+000C), so `JSON.parse`
 *     happily turns `\frac{1}{2}` into FORM-FEED + "rac{1}{2}". The control
 *     char is invisible, so the UI shows "rac{1}{2}". The same trap hits
 *     `\b` (\beta, \binom), `\n` (\neq, \nu, \nabla), `\r` (\rho), and
 *     `\t` (\theta, \times, \tan).
 *   - Other commands (`\sqrt`, `\times`, `\,`) are *invalid* JSON escapes, so
 *     `JSON.parse` throws and the whole batch is discarded.
 *
 * This pass walks the text and, inside string literals only, doubles any
 * backslash that isn't a genuine JSON escape so the LaTeX command survives:
 *
 *   - `\"` `\\` `\/`            → kept (real JSON escapes)
 *   - `\uXXXX` (4 hex digits)   → kept (real unicode escape)
 *   - `\n` `\t` `\r` `\b` `\f`  → kept ONLY when the maximal following letter
 *                                 run is not a known LaTeX command, so genuine
 *                                 whitespace escapes (e.g. "line one\nline two")
 *                                 are preserved while `\frac`, `\theta`, `\neq`
 *                                 etc. are repaired.
 *   - everything else, incl.    → backslash doubled (e.g. `\sqrt`, `\sum`,
 *     `\frac`, `\,`, `\{`          `\alpha`, `\Delta`, `\,`, `\;`).
 *
 * It is a no-op on already-valid JSON (where backslashes are already doubled),
 * so it is safe to run unconditionally before parsing.
 */

// LaTeX commands whose name begins with a letter that is ALSO a JSON escape
// character (b, f, n, r, t). For these we can't tell `\frac` (LaTeX) from `\f`
// (form feed) by the leading char alone, so we match the whole command name.
// Commands beginning with any other letter are unambiguous and handled
// generically. Extend this set if a new b/f/n/r/t-initial command appears.
const CONTROL_LATEX_COMMANDS = new Set<string>([
  // f…
  "frac", "forall", "frown", "flat", "fbox",
  // b…
  "beta", "binom", "bar", "boxed", "bmod", "bullet", "because", "big", "bigg",
  "bigcup", "bigcap", "bigoplus", "bigotimes", "bigvee", "bigwedge", "bot",
  "bowtie", "boldsymbol", "begin",
  // n…
  "neq", "ne", "nabla", "nu", "notin", "nmid", "ngtr", "nless", "nleq", "ngeq",
  "nparallel", "nsim", "nwarrow", "nearrow", "ni", "neg", "nexists", "nrightarrow",
  // r…
  "rho", "rightarrow", "rangle", "rceil", "rfloor", "rightleftharpoons", "rad",
  "rmoustache", "right",
  // t…
  "theta", "times", "tau", "to", "triangle", "triangleq", "tan", "tanh", "text",
  "tfrac", "top", "therefore", "tilde", "textbf", "textit", "textrm", "textstyle",
  "textcolor",
]);

const isLetter = (c: string | undefined): boolean =>
  c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));

const isHex = (c: string | undefined): boolean =>
  c !== undefined && /[0-9a-fA-F]/.test(c);

const CONTROL_ESCAPE_LETTERS = new Set(["b", "f", "n", "r", "t"]);

export function repairLatexJson(text: string): string {
  if (typeof text !== "string" || text.indexOf("\\") === -1) return text;

  let out = "";
  let inStr = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (!inStr) {
      out += ch;
      if (ch === '"') inStr = true;
      continue;
    }

    // Inside a string literal.
    if (ch === '"') {
      out += ch;
      inStr = false;
      continue;
    }
    if (ch !== "\\") {
      out += ch;
      continue;
    }

    // `ch` is a backslash inside a string — decide whether it is a genuine
    // JSON escape or an unescaped LaTeX backslash.
    const next = text[i + 1];

    if (next === undefined) {
      // Dangling backslash at EOF → escape it so the parse doesn't choke.
      out += "\\\\";
      continue;
    }

    // Genuine JSON escapes that must be preserved verbatim.
    if (next === '"' || next === "\\" || next === "/") {
      out += ch + next;
      i += 1;
      continue;
    }

    // Real unicode escape: \uXXXX.
    if (
      next === "u" &&
      isHex(text[i + 2]) && isHex(text[i + 3]) &&
      isHex(text[i + 4]) && isHex(text[i + 5])
    ) {
      out += text.slice(i, i + 6);
      i += 5;
      continue;
    }

    // Control-escape letters (\n \t \r \b \f) are ambiguous: they are valid
    // whitespace escapes AND the first letter of common LaTeX commands. Read
    // the maximal letter run and only treat it as LaTeX when it spells a known
    // command; otherwise keep the whitespace escape untouched.
    if (CONTROL_ESCAPE_LETTERS.has(next)) {
      const run = /^[a-zA-Z]+/.exec(text.slice(i + 1))?.[0] ?? next;
      if (CONTROL_LATEX_COMMANDS.has(run)) {
        out += "\\\\";
        continue; // re-process the command letters as normal string content
      }
      out += ch + next;
      i += 1;
      continue;
    }

    // Anything else after the backslash is not a valid JSON escape (e.g.
    // \sqrt, \sum, \alpha, \Delta, \,, \;, \{) → it is an unescaped LaTeX
    // backslash. Double it so the command survives the parse.
    out += "\\\\";
  }

  return out;
}

/**
 * `JSON.parse` with LaTeX-backslash repair.
 *
 * The repair runs BEFORE the parse, not as a fallback: the most damaging case
 * (`\f` → form feed) parses *successfully* into corrupted data, so a
 * raw-parse-first strategy would never trigger the repair. `repairLatexJson`
 * is a no-op on already-valid JSON, so this is safe. The raw text is only
 * tried as a last resort if the repaired text somehow fails to parse.
 */
export function parseLatexJson(text: string): unknown {
  try {
    return JSON.parse(repairLatexJson(text));
  } catch {
    /* fall through to raw parse */
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
