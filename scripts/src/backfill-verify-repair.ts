/**
 * One-time backfill: repair LaTeX corruption and re-verify answer keys on
 * questions already in the live bank.
 *
 * Two independent repairs per row:
 *
 *   1. Control-character LaTeX. Older generation parsed model JSON with a plain
 *      JSON.parse, so single-backslash LaTeX commands whose escape was a valid
 *      JSON control escape were silently mangled: "\frac" -> FORM-FEED + "rac"
 *      (renders as "↰rac"), "\times" -> TAB + "imes", etc. We map those stray
 *      control characters back to their backslash form. (Newline U+000A is left
 *      alone — it is too often a legitimate line break to reverse safely.)
 *
 *   2. Answer-key verification. An AI fact-checker independently solves each
 *      question; a mislabelled answer_index is corrected (and the solution
 *      replaced with the verifier's working). Questions the checker finds
 *      fundamentally flawed are reported, and only deleted with --delete-flawed.
 *
 * Dry-run by default — prints what WOULD change. Pass --apply to write.
 * Verification needs AI_INTEGRATIONS_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY);
 * without it the script still performs the text repair and skips verification.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<k> ANTHROPIC_API_KEY=<a> \
 *     pnpm --filter @workspace/scripts exec tsx ./src/backfill-verify-repair.ts            # dry run
 *   ... ./src/backfill-verify-repair.ts --apply                                            # write fixes
 *   ... ./src/backfill-verify-repair.ts --apply --delete-flawed                            # also delete flawed
 *   ... ./src/backfill-verify-repair.ts --subject "Year 10 Mathematics" --limit 200        # scope it
 *
 * NOTE: the verification call mirrors artifacts/api-server/src/lib/verify-question.ts
 * (separate workspace package, no clean cross-package import). Keep them in sync.
 */

import { createClient } from "@supabase/supabase-js";

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
const APPLY = args.includes("--apply");
const DELETE_FLAWED = args.includes("--delete-flawed");
const SUBJECT = argValue("--subject");
const LIMIT = Number(argValue("--limit") || "0") || 0; // 0 = no limit
const CONCURRENCY = Math.max(1, Number(argValue("--concurrency") || "4") || 4);

if (!SERVICE_KEY) {
  console.error("ERROR: set SUPABASE_SERVICE_KEY env var or pass --key <value>");
  process.exit(1);
}

const ANTHROPIC_KEY =
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_BASE =
  process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const VERIFY_MODEL = process.env.AI_VERIFY_MODEL || "claude-sonnet-4-6";
const VERIFY = !!ANTHROPIC_KEY;

// Retry transient Anthropic failures (rate limits / overload / timeouts) so a
// full-bank run doesn't shed thousands of questions to 429s.
const MAX_RETRIES = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── 1. control-character LaTeX repair ────────────────────────────────────────
// Maps the control char a bad JSON escape produced back to its "\x" command
// form. Excludes U+000A (newline) — legitimate line breaks must survive.
const CONTROL_TO_ESCAPE: Array<[string, string]> = [
  ["\u000C", "\\f"], // \frac, \forall, \flat
  ["\u0009", "\\t"], // \times, \theta, \tan, \text, \to
  ["\u0008", "\\b"], // \beta, \bar, \binom
  ["\u000D", "\\r"], // \rho, \rightarrow
  ["\u000B", "\\v"], // \vec, \varphi
];

function repairControlLatex(input: unknown): unknown {
  if (typeof input !== "string" || !input) return input;
  let out = input;
  for (const [ch, esc] of CONTROL_TO_ESCAPE) {
    if (out.includes(ch)) out = out.split(ch).join(esc);
  }
  return out;
}

// ─── 2. answer verification (mirror of api-server/src/lib/verify-question.ts) ──
type Verdict = {
  verdict: "correct" | "wrong_answer" | "wrong_question";
  correct_index: number | null;
  explanation: string;
};
const LABELS = ["A", "B", "C", "D", "E", "F"];

function parseVerdict(text: string): Verdict {
  // Anchor on the verdict object's opening brace rather than the first "{" in
  // the text — the model's step-by-step reasoning often contains stray braces
  // (LaTeX like \frac{a}{b}, set notation) that otherwise get parsed instead.
  const keyIdx = text.lastIndexOf('"verdict"');
  const anchored = keyIdx === -1 ? -1 : text.lastIndexOf("{", keyIdx);
  const start = anchored !== -1 ? anchored : text.indexOf("{");
  if (start === -1) throw new Error(`No JSON in AI response: ${text.slice(0, 200)}`);
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") { if (--depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error(`Unclosed JSON in AI response: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1)) as Verdict;
}

async function verify(q: { question: string; options: string[]; answer_index: number }): Promise<Verdict> {
  const optText = q.options.map((o, i) => `${LABELS[i] ?? i}: ${o}`).join("\n");
  const markedLabel = LABELS[q.answer_index] ?? String(q.answer_index);
  const prompt = `You are a strict mathematical fact-checker reviewing a multiple-choice exam question.

Question: ${q.question}
Options:
${optText}
Currently marked correct: Option ${markedLabel} — ${q.options[q.answer_index]}

Solve the question yourself from scratch, step by step, WITHOUT assuming the marked answer is right. Compute the actual answer first, then check which option (if any) matches it. Watch for classic traps: off-by-one errors (e.g. using n instead of n-1 in a_n = a_1 + (n-1)d), sign errors, fraction/decimal slips, and unit mistakes.

Then respond with ONLY a single JSON object (no other text, no markdown, no LaTeX — plain ASCII only in the explanation):

If the marked option genuinely matches your computed answer:
{"verdict":"correct","correct_index":null,"explanation":"one sentence with the key working"}

If a DIFFERENT option matches your computed answer (use the 0-based index of that option):
{"verdict":"wrong_answer","correct_index":2,"explanation":"one sentence showing the working that proves it"}

If your computed answer matches NO option, or the question is fundamentally flawed/ambiguous:
{"verdict":"wrong_question","correct_index":null,"explanation":"one sentence"}`;

  let lastErr: Error = new Error("verification failed");
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40_000);
    let resp: Response | null = null;
    try {
      resp = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: VERIFY_MODEL,
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (resp.ok) {
        const body = (await resp.json()) as any;
        return parseVerdict((body.content?.[0]?.text ?? "").trim());
      }
    } catch (err) {
      lastErr = err as Error; // network error / timeout abort — retryable
    } finally {
      clearTimeout(timeout);
    }

    if (resp?.ok) throw lastErr; // 2xx but body/JSON parse failed — not transient
    const status = resp?.status;
    if (status !== undefined) {
      if (!RETRYABLE_STATUS.has(status)) throw new Error(`Anthropic API ${status}`);
      lastErr = new Error(`Anthropic API ${status}`);
    }
    if (attempt === MAX_RETRIES) break;

    const retryAfter = resp ? Number(resp.headers.get("retry-after")) : NaN;
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(1000 * 2 ** attempt, 30_000);
    await sleep(wait + Math.random() * 500);
  }
  throw lastErr;
}

// ─── row processing ───────────────────────────────────────────────────────────
type Row = {
  id: string;
  question?: string | null;
  options?: unknown;
  solution?: string | null;
  tip?: string | null;
  answer_index?: number | null;
};

const PAGE = 1000;

const stats = { scanned: 0, textRepaired: 0, indexFixed: 0, flawed: 0, deleted: 0, verifyErrors: 0, updated: 0 };

async function processRow(row: Row): Promise<void> {
  const patch: Record<string, unknown> = {};

  // 1. Text repair (cheap, deterministic).
  const repairedQuestion = repairControlLatex(row.question);
  if (typeof row.question === "string" && repairedQuestion !== row.question) patch.question = repairedQuestion;

  let repairedOptions: string[] | null = null;
  if (Array.isArray(row.options)) {
    repairedOptions = row.options.map((o) => repairControlLatex(o) as string);
    if (repairedOptions.some((o, i) => o !== (row.options as unknown[])[i])) patch.options = repairedOptions;
  }
  const repairedSolution = repairControlLatex(row.solution);
  if (typeof row.solution === "string" && repairedSolution !== row.solution) patch.solution = repairedSolution;
  const repairedTip = repairControlLatex(row.tip);
  if (typeof row.tip === "string" && repairedTip !== row.tip) patch.tip = repairedTip;

  const textChanged = "question" in patch || "options" in patch || "solution" in patch || "tip" in patch;
  if (textChanged) stats.textRepaired++;

  // 2. Verification (uses repaired text so the checker sees clean LaTeX).
  const qText = (patch.question as string) ?? row.question ?? "";
  const opts = (patch.options as string[]) ?? (Array.isArray(row.options) ? (row.options as string[]) : []);
  const ai = typeof row.answer_index === "number" ? row.answer_index : -1;

  if (VERIFY && qText && opts.length >= 2 && ai >= 0 && ai < opts.length) {
    try {
      const verdict = await verify({ question: qText, options: opts, answer_index: ai });
      if (verdict.verdict === "wrong_answer" &&
          verdict.correct_index != null &&
          verdict.correct_index >= 0 &&
          verdict.correct_index < opts.length &&
          verdict.correct_index !== ai) {
        stats.indexFixed++;
        patch.answer_index = verdict.correct_index;
        if (verdict.explanation) patch.solution = verdict.explanation;
        console.log(`  [${row.id}] answer_index ${ai} → ${verdict.correct_index}: ${verdict.explanation}`);
      } else if (verdict.verdict === "wrong_question") {
        stats.flawed++;
        console.log(`  [${row.id}] FLAWED: ${verdict.explanation}${DELETE_FLAWED ? " (deleting)" : " (left in place)"}`);
        if (APPLY && DELETE_FLAWED) {
          const { error } = await supabase.from("questions").delete().eq("id", row.id);
          if (error) console.error(`    ✗ delete ${row.id}: ${error.message}`);
          else stats.deleted++;
        }
        return; // don't also patch a row we may have deleted
      }
    } catch (err) {
      stats.verifyErrors++;
      console.error(`  [${row.id}] verify failed: ${(err as Error).message}`);
    }
  }

  if (Object.keys(patch).length === 0) return;
  if (textChanged && stats.textRepaired <= 10) {
    console.log(`  [${row.id}] text repaired: ${JSON.stringify(patch.question ?? patch.options ?? patch.solution ?? patch.tip).slice(0, 160)}`);
  }
  if (APPLY) {
    const { error } = await supabase.from("questions").update(patch).eq("id", row.id);
    if (error) console.error(`    ✗ update ${row.id}: ${error.message}`);
    else stats.updated++;
  }
}

async function runPool(rows: Row[]): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      await processRow(row);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length || 1) }, worker));
}

async function main() {
  console.log(
    `Connecting to ${SUPABASE_URL} — ${APPLY ? "APPLY (writing)" : "DRY RUN"}; ` +
      `verification ${VERIFY ? `ON (${VERIFY_MODEL})` : "OFF (no API key — text repair only)"}` +
      (SUBJECT ? `; subject="${SUBJECT}"` : "") + (LIMIT ? `; limit=${LIMIT}` : ""),
  );

  let from = 0;
  for (;;) {
    if (LIMIT && stats.scanned >= LIMIT) break;
    let query = supabase
      .from("questions")
      .select("id, question, options, solution, tip, answer_index")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (SUBJECT) query = (query as any).eq("subject", SUBJECT);

    const { data, error } = await query;
    if (error) { console.error(`error reading questions: ${error.message}`); break; }
    let rows = (data ?? []) as unknown as Row[];
    if (!rows.length) break;
    if (LIMIT) rows = rows.slice(0, Math.max(0, LIMIT - stats.scanned));

    stats.scanned += rows.length;
    await runPool(rows);

    if ((data ?? []).length < PAGE) break;
    from += PAGE;
  }

  console.log("\n── Summary ──");
  console.log(`  scanned:        ${stats.scanned}`);
  console.log(`  text repaired:  ${stats.textRepaired}`);
  console.log(`  answer fixed:   ${stats.indexFixed}`);
  console.log(`  flawed found:   ${stats.flawed}${DELETE_FLAWED ? `` : " (not deleted — re-run with --delete-flawed)"}`);
  console.log(`  deleted:        ${stats.deleted}`);
  console.log(`  verify errors:  ${stats.verifyErrors}`);
  console.log(`  rows written:   ${APPLY ? stats.updated : 0}${APPLY ? "" : " (dry run — re-run with --apply to write)"}`);
  console.log("Done.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
