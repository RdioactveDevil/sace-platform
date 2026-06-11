/**
 * One-time backfill: normalise existing question maths into KaTeX-renderable LaTeX.
 *
 * The bank stored maths inconsistently — proper "$x^2$", bare "e^x"/"f''(x)", and
 * Unicode superscripts "x³". This rewrites the maths-bearing columns of `questions`
 * and `draft_questions` into consistent $...$ LaTeX so the frontend renders reliably.
 *
 * Dry-run by default — prints what WOULD change. Pass --apply to write.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> pnpm tsx scripts/src/backfill-math-latex.ts          # dry run
 *   SUPABASE_SERVICE_KEY=<key> pnpm tsx scripts/src/backfill-math-latex.ts --apply  # write
 *   pnpm tsx scripts/src/backfill-math-latex.ts --key eyJ... --apply
 *
 * NOTE: the normalisation logic below is a byte-identical copy of
 * artifacts/api-server/src/lib/normalize-math.ts (separate workspace package,
 * no clean cross-package import). Keep them in sync.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

// ─── normalisation (mirror of api-server/src/lib/normalize-math.ts) ───────────
const SUPERSCRIPT_MAP: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-", "ⁿ": "n", "ⁱ": "i",
};
const SUPERSCRIPT_RE = /([0-9A-Za-z)\]])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱ]+)/g;

function convertUnicodeSuperscripts(text: string): string {
  return text.replace(SUPERSCRIPT_RE, (whole, base: string, sup: string) => {
    const mapped = Array.from(sup).map((c) => SUPERSCRIPT_MAP[c] ?? "").join("");
    if (!mapped) return whole;
    return `${base}^${mapped.length > 1 ? `{${mapped}}` : mapped}`;
  });
}

function applyOutsideMath(s: string, fn: (seg: string) => string): string {
  const re = /\$\$[\s\S]+?\$\$|\$(?!\d+\s)[^$\n]+?\$/g;
  const parts: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) parts.push(fn(s.slice(last, m.index)));
    parts.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push(fn(s.slice(last)));
  return parts.join("");
}

function autoWrapMath(text: string): string {
  const t = text.replace(/[–—]/g, "-");
  const hasCaret = /[a-zA-Z0-9]\^[a-zA-Z0-9({]/.test(t);
  const hasDerivative = /[a-z]'{1,3}\([a-z]\)/.test(t);
  const hasFraction = /\([^()]+\)\/\([^()]+\)/.test(t);
  // e.g. "log(3x + 2y)", "sin(θ)", "sqrt(n)" — negative lookbehind avoids "catalog"
  const hasMathFunc = /(?<![a-zA-Z])(?:log|ln|sin|cos|tan|cot|sec|csc|exp|sqrt)\s*\([^)]*[a-zA-Z][^)]*\)/.test(t);
  if (!hasCaret && !hasDerivative && !hasFraction && !hasMathFunc) return text;

  const isMathOnly =
    !/[?!]/.test(t) &&
    !/\.\s/.test(t) &&
    !/^[A-Z][a-z]/.test(t) &&
    /^[a-zA-Z0-9\s^+\-*/()'=,.]+$/.test(t);

  if (isMathOnly) {
    const withFrac = t.replace(
      /\(([^()]+)\)\/\(([^()]+)\)/g,
      (m, num: string, den: string) =>
        /[\d^+\-]/.test(num) || /[\d^+\-]/.test(den) ? `\\frac{${num}}{${den}}` : m,
    );
    return `$${withFrac.trim()}$`;
  }

  let result = t;
  result = result.replace(
    /\(([^()]+)\)\/\(([^()]+)\)/g,
    (m, num: string, den: string) =>
      /[\d^+\-]/.test(num) || /[\d^+\-]/.test(den) ? `$\\frac{${num}}{${den}}$` : m,
  );
  result = applyOutsideMath(result, (seg) => {
    seg = seg.replace(
      /(?:\([^()]*\)|[a-zA-Z0-9])+\^(?:\{[^}]*\}|[a-zA-Z0-9]+)/g,
      (m) => `$${m}$`,
    );
    seg = seg.replace(
      /([a-zA-Z]'{1,3}\([a-zA-Z0-9]\))/g,
      (m) => `$${m}$`,
    );
    seg = seg.replace(
      /(?<![a-zA-Z])(?:log|ln|sin|cos|tan|cot|sec|csc|exp|sqrt)\s*\([^)]*[a-zA-Z][^)]*\)/g,
      (m) => `$${m}$`,
    );
    return seg;
  });
  return result;
}

function normalizeMathText(input: unknown): unknown {
  if (typeof input !== "string" || !input) return input;
  if (input.includes("$")) return input;
  return autoWrapMath(convertUnicodeSuperscripts(input));
}
// ──────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const keyArg = args.indexOf("--key");
const SERVICE_KEY =
  keyArg !== -1
    ? args[keyArg + 1]
    : process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = args.includes("--apply");

if (!SERVICE_KEY) {
  console.error("ERROR: set SUPABASE_SERVICE_KEY env var or pass --key <value>");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

type Row = {
  id: string;
  question?: string | null;
  options?: unknown;
  solution?: string | null;
  tip?: string | null;
};

const PAGE = 1000;

function normalizeRow(row: Row): { changed: boolean; patch: Record<string, unknown> } {
  const patch: Record<string, unknown> = {};
  let changed = false;

  const q = normalizeMathText(row.question);
  if (typeof row.question === "string" && q !== row.question) {
    patch.question = q;
    changed = true;
  }
  if (Array.isArray(row.options)) {
    const opts = row.options.map((o) => normalizeMathText(o));
    if (opts.some((o, i) => o !== (row.options as unknown[])[i])) {
      patch.options = opts;
      changed = true;
    }
  }
  if ("solution" in row) {
    const s = normalizeMathText(row.solution);
    if (typeof row.solution === "string" && s !== row.solution) {
      patch.solution = s;
      changed = true;
    }
  }
  if ("tip" in row) {
    const t = normalizeMathText(row.tip);
    if (typeof row.tip === "string" && t !== row.tip) {
      patch.tip = t;
      changed = true;
    }
  }
  return { changed, patch };
}

async function backfillTable(table: string, columns: string): Promise<void> {
  console.log(`\n=== ${table} ===`);
  let from = 0;
  let scanned = 0;
  let changedCount = 0;
  let updatedCount = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`  error reading ${table}: ${error.message}`);
      return;
    }
    const rows = (data ?? []) as unknown as Row[];
    if (!rows.length) break;

    for (const row of rows) {
      scanned++;
      const { changed, patch } = normalizeRow(row);
      if (!changed) continue;
      changedCount++;

      if (changedCount <= 10) {
        const before = row.question ?? (Array.isArray(row.options) ? JSON.stringify(row.options) : "");
        const after = patch.question ?? (patch.options ? JSON.stringify(patch.options) : "");
        console.log(`  [${row.id}]`);
        if (patch.question) console.log(`    q:  ${before}\n     →  ${after}`);
        if (patch.options) console.log(`    opts → ${JSON.stringify(patch.options)}`);
        if (patch.solution) console.log(`    sol changed`);
      }

      if (APPLY) {
        const { error: upErr } = await supabase.from(table).update(patch).eq("id", row.id);
        if (upErr) console.error(`    ✗ update ${row.id}: ${upErr.message}`);
        else updatedCount++;
      }
    }

    if (rows.length < PAGE) break;
    from += PAGE;
  }

  console.log(
    `  scanned ${scanned}, would change ${changedCount}` +
      (APPLY ? `, updated ${updatedCount}` : " (dry run — re-run with --apply to write)"),
  );
}

async function main() {
  console.log(`Connecting to ${SUPABASE_URL} — ${APPLY ? "APPLY (writing)" : "DRY RUN"}`);
  await backfillTable("questions", "id, question, options, solution, tip");
  await backfillTable("draft_questions", "id, question, options, solution");
  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
