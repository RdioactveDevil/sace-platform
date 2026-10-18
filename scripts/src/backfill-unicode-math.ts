/**
 * One-time backfill: rewrite questions that write maths with Unicode symbols
 * ("ME = z(σ/√n)", "z ≈ 2.576", "±1") into KaTeX LaTeX ($ME = z\left(\frac{\sigma}{\sqrt{n}}\right)$).
 *
 * Text like that has nothing for KaTeX to typeset, so it shows as plain text.
 * The regex backfill (backfill-math-latex.ts) only handles carets and
 * superscripts; this one asks Claude to reformat the whole row (question,
 * options, solution, tip) and then accepts a rewrite only if:
 *   - the numbers in every field are unchanged,
 *   - the words in every field are unchanged (LaTeX command names aside),
 *   - every $...$ segment renders in KaTeX, and
 *   - no Unicode maths or bare LaTeX is left outside $...$.
 * Anything else is reported as rejected and left untouched.
 *
 * Dry-run by default — prints what WOULD change and writes every before/after
 * pair to latex-backfill-report.json for review. Pass --apply to write.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<k> ANTHROPIC_API_KEY=<a> \
 *     pnpm --filter @workspace/scripts run backfill:unicode-math                       # dry run
 *   ... run backfill:unicode-math -- --apply                                          # write
 *   ... run backfill:unicode-math -- --subject "Mathematical Methods" --limit 50      # scope it
 *   ... run backfill:unicode-math -- --table draft_questions                         # pending drafts
 *   ... run backfill:unicode-math -- --scan-only    # count/list candidates, no model calls or writes
 */

import { writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { checkRewrite, hasUnicodeMath, repairControlChars } from "./lib/unicode-math";

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

// ─── args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argValue(name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}
const SERVICE_KEY =
  argValue("--key") ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCAN_ONLY = args.includes("--scan-only");
const APPLY = args.includes("--apply") && !SCAN_ONLY;
const TABLE = argValue("--table") || "questions";
const SUBJECT = argValue("--subject");
const LIMIT = Number(argValue("--limit") || "0") || 0; // 0 = no limit (counts candidates)
const CONCURRENCY = Math.max(1, Number(argValue("--concurrency") || "4") || 4);
const REPORT_PATH = argValue("--report") || "latex-backfill-report.json";
const MODEL = process.env.AI_LATEX_MODEL || "claude-opus-5-5";

// Maths-bearing text columns per table.
const FIELDS: Record<string, string[]> = {
  questions: ["question", "options", "solution", "tip"],
  draft_questions: ["question", "options", "solution"],
};

if (!SERVICE_KEY) {
  console.error("ERROR: set SUPABASE_SERVICE_KEY env var or pass --key <value>");
  process.exit(1);
}
const ANTHROPIC_KEY = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY && !SCAN_ONLY) {
  console.error("ERROR: set ANTHROPIC_API_KEY");
  process.exit(1);
}
if (!FIELDS[TABLE]) {
  console.error(`ERROR: --table must be one of ${Object.keys(FIELDS).join(", ")}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined,
  maxRetries: 6,
});

// ─── the rewrite ─────────────────────────────────────────────────────────────
type Fields = { question?: string; options?: string[]; solution?: string; tip?: string };

const SYSTEM = `You reformat exam questions so their maths renders with KaTeX. You change formatting only — never the wording, numbers, answer, or meaning.

Rules:
- Put every mathematical expression, variable, and equation in LaTeX inside $...$ (inline), including short ones like $n = 664$. Use $$...$$ only for an equation that already stands on its own line.
- Replace Unicode maths with LaTeX commands inside $...$: √ → \\sqrt{}, σ → \\sigma, μ → \\mu, π → \\pi, θ → \\theta, Δ → \\Delta, ≈ → \\approx, ≠ → \\neq, ≤ → \\leq, ≥ → \\geq, ± → \\pm, × → \\times, ÷ → \\div, − → -, · → \\cdot, ∞ → \\infty, x² → x^2, x₁ → x_1, ½ → \\frac{1}{2}.
- Write slash fractions of expressions as \\frac{}{} (e.g. σ/√n → \\frac{\\sigma}{\\sqrt{n}}).
- Write chemical formulas and ions with mhchem: CH₃CH₂OH → $\\ce{CH3CH2OH}$, O₂ → $\\ce{O2}$, NAD⁺ → $\\ce{NAD+}$, SO₄²⁻ → $\\ce{SO4^2-}$.
- Keep every word, number, and punctuation mark. Do not add, remove, round, or reorder anything, and do not fix the maths even if it looks wrong.
- Write each number exactly as given, with two exceptions: e-notation becomes scientific notation (2.46e-4 → $2.46 \\times 10^{-4}$), and an "x" used as a multiplication sign becomes \\times (0.0150 x 0.0164 → $0.0150 \\times 0.0164$; 0.100 mol x 180 g/mol → $0.100 \\text{ mol} \\times 180 \\text{ g/mol}$). Never write e-notation inside $...$.
- Every Unicode maths symbol must end up inside $...$, including ones between words and in units: "Mean = sum ÷ count" → "Mean $= \\text{sum} \\div \\text{count}$", "base area × height" → "$\\text{base area} \\times \\text{height}$", "12 cm²" → "12 $\\text{cm}^2$".
- Leave a number that stands alone in prose, or is a whole option by itself, as plain text ("Carbon has 6 protons", option "14") — only wrap numbers that are part of an expression, equation, or formula.
- Leave prose outside $...$. Leave Greek letters that are part of a name in prose as they are (e.g. "α-helix", "β-decay").
- Keep option text in the same order. Do not add "A." style labels that were not there.
- A literal dollar sign for money is written \\$.
- If a field needs no change, return it exactly as given.`;

function outputSchema(fields: Fields) {
  const properties: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    properties[key] = key === "options" ? { type: "array", items: { type: "string" } } : { type: "string" };
  }
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

async function rewrite(fields: Fields): Promise<Fields> {
  const message = await anthropic.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: outputSchema(fields) } },
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(fields, null, 2) }],
    })
    .finalMessage();
  if (message.stop_reason === "refusal") throw new Error("model declined");
  if (message.stop_reason === "max_tokens") throw new Error("ran out of output tokens");
  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return JSON.parse(text) as Fields;
}

// ─── row processing ──────────────────────────────────────────────────────────
type Row = { id: string; subject?: string | null } & Record<string, unknown>;
type ReportEntry = {
  id: string;
  subject: string | null;
  status: "candidate" | "changed" | "rejected" | "error";
  reason?: string;
  before: Fields;
  after?: Fields;
};

const report: ReportEntry[] = [];
const stats = { scanned: 0, candidates: 0, changed: 0, rejected: 0, errors: 0, written: 0 };

function pickFields(row: Row): Fields {
  const f: Record<string, unknown> = {};
  for (const key of FIELDS[TABLE]) {
    const v = row[key];
    if (key === "options" ? Array.isArray(v) && v.every((o) => typeof o === "string") : typeof v === "string" && v) {
      f[key] = v;
    }
  }
  return f as Fields;
}

function isCandidate(f: Fields): boolean {
  return [f.question, f.solution, f.tip, ...(f.options ?? [])].some(hasUnicodeMath);
}

/** Compare field by field; returns the patch, or a rejection reason. */
function validate(before: Fields, after: Fields): { patch: Fields } | { reason: string } {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(before) as (keyof Fields)[]) {
    const b = before[key];
    const a = after[key];
    if (key === "options") {
      const bo = b as string[];
      const raw = a as string[] | undefined;
      if (!Array.isArray(raw) || raw.length !== bo.length) return { reason: "option count changed" };
      const ao = raw.map((o, i) => repairControlChars(o, bo[i]));
      for (let i = 0; i < bo.length; i++) {
        const why = checkRewrite(bo[i], ao[i]);
        if (why) return { reason: `option ${i + 1}: ${why}` };
      }
      if (ao.some((o, i) => o !== bo[i])) patch.options = ao;
      continue;
    }
    if (typeof a !== "string") return { reason: `${key} missing from rewrite` };
    const fixed = repairControlChars(a, b as string);
    const why = checkRewrite(b as string, fixed);
    if (why) return { reason: `${key}: ${why}` };
    if (fixed !== b) patch[key] = fixed;
  }
  return { patch: patch as Fields };
}

async function processRow(row: Row): Promise<void> {
  const before = pickFields(row);
  const subject = row.subject ?? null;
  if (SCAN_ONLY) {
    report.push({ id: row.id, subject, status: "candidate", before });
    return;
  }
  let after: Fields;
  try {
    after = await rewrite(before);
  } catch (err) {
    stats.errors++;
    report.push({ id: row.id, subject, status: "error", reason: (err as Error).message, before });
    console.error(`  [${row.id}] error: ${(err as Error).message}`);
    return;
  }

  const result = validate(before, after);
  if ("reason" in result) {
    stats.rejected++;
    report.push({ id: row.id, subject, status: "rejected", reason: result.reason, before, after });
    console.log(`  [${row.id}] rejected — ${result.reason}`);
    return;
  }
  if (Object.keys(result.patch).length === 0) return;

  stats.changed++;
  report.push({ id: row.id, subject, status: "changed", before, after });
  if (stats.changed <= 15) {
    console.log(`  [${row.id}]`);
    for (const [key, value] of Object.entries(result.patch)) {
      console.log(`    ${key}: ${JSON.stringify(before[key as keyof Fields])}\n      → ${JSON.stringify(value)}`);
    }
  }

  if (APPLY) {
    const { error } = await supabase.from(TABLE).update(result.patch).eq("id", row.id);
    if (error) console.error(`    ✗ update ${row.id}: ${error.message}`);
    else stats.written++;
  }
}

async function runPool(rows: Row[]): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) await processRow(rows[cursor++]);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length || 1) }, worker));
}

const PAGE = 1000;

async function main() {
  console.log(
    `Connecting to ${SUPABASE_URL} — ${SCAN_ONLY ? "SCAN ONLY" : APPLY ? "APPLY (writing)" : "DRY RUN"}; table=${TABLE}; model=${MODEL}` +
      (SUBJECT ? `; subject="${SUBJECT}"` : "") + (LIMIT ? `; limit=${LIMIT}` : ""),
  );

  let from = 0;
  for (;;) {
    if (LIMIT && stats.candidates >= LIMIT) break;
    let query = supabase
      .from(TABLE)
      .select(["id", "subject", ...FIELDS[TABLE]].join(", "))
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (SUBJECT) query = query.eq("subject", SUBJECT);

    const { data, error } = await query;
    if (error) {
      console.error(`error reading ${TABLE}: ${error.message}`);
      process.exitCode = 1;
      break;
    }
    const page = (data ?? []) as unknown as Row[];
    if (!page.length) break;
    stats.scanned += page.length;

    let candidates = page.filter((r) => isCandidate(pickFields(r)));
    if (LIMIT) candidates = candidates.slice(0, Math.max(0, LIMIT - stats.candidates));
    stats.candidates += candidates.length;
    await runPool(candidates);

    if (page.length < PAGE) break;
    from += PAGE;
  }

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  if (SUBJECT && stats.scanned === 0) {
    console.error(`\nERROR: no ${TABLE} rows have subject "${SUBJECT}". Check the exact subject name (or leave it blank).`);
    process.exitCode = 1;
  }

  console.log("\n── Summary ──");
  console.log(`  scanned:     ${stats.scanned}`);
  console.log(`  candidates:  ${stats.candidates} (Unicode maths outside $...$)`);
  if (SCAN_ONLY) {
    const bySubject = new Map<string, number>();
    for (const r of report) bySubject.set(r.subject ?? "(none)", (bySubject.get(r.subject ?? "(none)") ?? 0) + 1);
    for (const [subject, n] of [...bySubject].sort((a, b) => b[1] - a[1])) console.log(`    ${n}\t${subject}`);
  }
  console.log(`  rewritten:   ${stats.changed}`);
  console.log(`  rejected:    ${stats.rejected} (rewrite changed content or didn't render — left as is)`);
  console.log(`  errors:      ${stats.errors}`);
  console.log(`  rows written: ${APPLY ? stats.written : 0}${APPLY ? "" : " (dry run — re-run with --apply to write)"}`);
  console.log(`  report:      ${REPORT_PATH}`);
  console.log("Done.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
