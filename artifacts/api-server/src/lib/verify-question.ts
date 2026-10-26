import { CLAUDE_VERIFY_MODEL } from "./anthropic-model";
import { logger } from "./logger";
import { describeGraph } from "./graph-spec";

/**
 * AI fact-checking for multiple-choice questions.
 *
 * Single source of truth used both by the post-hoc report flow
 * (report-question.ts) and by the pre-insertion gate that runs during
 * question generation, so a question's answer key is verified BEFORE it can
 * enter the bank rather than only after a student reports it.
 */

export type Verdict = {
  verdict: "correct" | "wrong_answer" | "wrong_question";
  correct_index: number | null;
  /** For whoever runs the check (admins, logs). Never shown to students. */
  explanation: string;
  /** wrong_answer only: a worked solution written for the student. */
  solution?: string;
};

// The explanation is written about the options ("matching option B, not the
// marked option A"), and once went into students' worked solutions. Text like
// that must never reach a student.
const CHECKER_NOTE = /\b(marked (option|answer)|not the marked|matching options?|options? \(?[A-F]\)?(?![a-z])|index [0-9]|re-?check|let me|wait[,.!])/i;

export function looksLikeCheckerNote(text: string): boolean {
  return CHECKER_NOTE.test(text);
}

/**
 * The student-facing solution to store with a corrected answer key, or null
 * when the verifier didn't give a usable one (then the question can't be
 * fixed in place and should be dropped or regenerated).
 */
export function studentSolution(verdict: Verdict): string | null {
  const text = typeof verdict.solution === "string" ? verdict.solution.trim() : "";
  return text && !looksLikeCheckerNote(text) ? text : null;
}

const LABELS = ["A", "B", "C", "D", "E", "F"];

// Retry transient Anthropic failures (rate limits / overload / timeouts).
const MAX_RETRIES = 5;
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

function buildPrompt(q: { question: string; options: string[]; answer_index: number }): string {
  const optText = q.options.map((o, i) => `${LABELS[i] ?? i}: ${o}`).join("\n");
  const markedLabel = LABELS[q.answer_index] ?? String(q.answer_index);
  return `You are a strict mathematical fact-checker reviewing a multiple-choice exam question.

Question: ${q.question}
Options:
${optText}
Currently marked correct: Option ${markedLabel} — ${q.options[q.answer_index]}

Solve the question yourself from scratch, step by step, WITHOUT assuming the marked answer is right. Compute the actual answer first, then check which option (if any) matches it. Watch for classic traps: off-by-one errors (e.g. using n instead of n-1 in a_n = a_1 + (n-1)d), sign errors, fraction/decimal slips, and unit mistakes.

Then respond with ONLY a single JSON object (no other text, no markdown, no LaTeX — plain ASCII only in the explanation):

If the marked option genuinely matches your computed answer:
{"verdict":"correct","correct_index":null,"explanation":"one sentence with the key working"}

If a DIFFERENT option matches your computed answer (use the 0-based index of that option), also write "solution": a worked solution for the student, one to three sentences that show the working and state the answer itself. The solution must not mention options, letters, indexes, or that any answer was marked or checked:
{"verdict":"wrong_answer","correct_index":2,"explanation":"one sentence showing the working that proves it","solution":"Brackets first: 8 - 3 = 5. Then 5 x 5 = 25, and 25 + 8 = 33."}

If your computed answer matches NO option, or the question is fundamentally flawed/ambiguous:
{"verdict":"wrong_question","correct_index":null,"explanation":"one sentence"}`;
}

/** Depth-count braces to find the JSON object, ignoring {} inside LaTeX like \sec^{2}. */
export function parseVerdict(text: string): Verdict {
  // Anchor on the verdict object's opening brace rather than the first "{" —
  // the model's reasoning often contains stray braces (LaTeX, set notation)
  // that would otherwise be parsed instead of the verdict object.
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

/** Call the AI fact-checker for a single question payload. Throws on API/parse failure. */
export async function verifyQuestionPayload(q: {
  question: string;
  options: string[];
  answer_index: number;
}, limits: { maxTokens?: number; timeoutMs?: number } = {}): Promise<Verdict> {
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

  let lastErr: Error = new Error("verification failed");
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), limits.timeoutMs ?? 30_000);
    let resp: Response | null = null;
    try {
      resp = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_VERIFY_MODEL,
          max_tokens: limits.maxTokens ?? 2000,
          messages: [{ role: "user", content: buildPrompt(q) }],
        }),
      });
      if (resp.ok) {
        const body = await resp.json() as { content?: { type: string; text?: string }[] };
        const text = body.content?.find((b) => b.type === "text")?.text ?? "";
        return parseVerdict(text.trim());
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
    await new Promise((r) => setTimeout(r, wait + Math.random() * 500));
  }
  throw lastErr;
}

export type VerifiableQuestion = {
  question: string;
  // Optional because non-MCQ types (numeric, short_text, order) carry no
  // options/answer_index. The worker's guard skips verification for those.
  options?: string[];
  answer_index?: number;
  solution?: string | null;
  // A function graph shown with the question; described to the verifier.
  graph?: unknown;
};

/**
 * Verify a freshly generated batch before insertion:
 *   - "correct"        → keep as-is
 *   - "wrong_answer"   → fix answer_index, and replace the solution with the
 *                        verifier's student-facing solution so the working can't
 *                        contradict the corrected answer; without a usable one
 *                        (studentSolution), drop the question
 *   - "wrong_question" → drop it entirely (never enters the bank)
 *
 * Fails OPEN: if the verifier errors (network/parse/model unavailable) the
 * question is kept unverified rather than silently lost. Set
 * VERIFY_GENERATED_QUESTIONS=false to disable the gate entirely.
 *
 * `strict` (exam-grade questions) gives the verifier room to work a hard
 * question through, and fails CLOSED: an unverifiable hard question is dropped,
 * and so is one whose key the verifier disputes (it isn't rewritten), because
 * a wrong answer key on a difficulty-5 question is worse than one fewer
 * question.
 */
export async function filterVerifiedQuestions<T extends VerifiableQuestion>(
  questions: T[],
  opts: { concurrency?: number; context?: Record<string, unknown>; stimulus?: string; strict?: boolean } = {},
): Promise<{ kept: T[]; dropped: number; fixed: number; errored: number }> {
  if (process.env.VERIFY_GENERATED_QUESTIONS === "false" || questions.length === 0) {
    return { kept: questions, dropped: 0, fixed: 0, errored: 0 };
  }

  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, questions.length));
  const results: (T | null)[] = new Array(questions.length).fill(null);
  let fixed = 0;
  let errored = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < questions.length) {
      const idx = cursor++;
      const q = questions[idx];
      if (!q?.question || !Array.isArray(q.options) || q.options.length < 2 ||
          typeof q.answer_index !== "number" || q.answer_index < 0 || q.answer_index >= q.options.length) {
        // Malformed — leave for the caller's own validation/filtering.
        results[idx] = q;
        continue;
      }
      try {
        const graphText = q.graph ? describeGraph(q.graph) : "";
        const verdict = await verifyQuestionPayload({
          question: withStimulus(graphText ? `${q.question}\n\n${graphText}` : q.question, opts.stimulus),
          options: q.options,
          answer_index: q.answer_index,
        }, opts.strict ? { maxTokens: 6000, timeoutMs: 120_000 } : {});
        if (verdict.verdict === "wrong_question" || (opts.strict && verdict.verdict === "wrong_answer")) {
          // Strict: the checker may be a weaker model than the writer, so on a
          // hard question its disagreement drops the question rather than
          // rewriting a key that may have been right.
          results[idx] = null;
        } else if (
          verdict.verdict === "wrong_answer" &&
          verdict.correct_index != null &&
          verdict.correct_index >= 0 &&
          verdict.correct_index < q.options.length &&
          verdict.correct_index !== q.answer_index
        ) {
          const solution = studentSolution(verdict);
          if (solution) {
            fixed++;
            results[idx] = { ...q, answer_index: verdict.correct_index, solution } as T;
          } else {
            results[idx] = null;
          }
        } else {
          results[idx] = q;
        }
      } catch (err) {
        errored++;
        logger.warn(
          { err: (err as Error).message, ...(opts.context || {}) },
          opts.strict
            ? "[verify-question] verification failed; dropping exam-grade question"
            : "[verify-question] verification failed; keeping question unverified",
        );
        results[idx] = opts.strict ? null : q;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  const kept = results.filter((r): r is T => r !== null);
  return { kept, dropped: questions.length - kept.length, fixed, errored };
}

/**
 * Prefix a question with the passage it refers to, so the verifier judges
 * reading-comprehension answers against the text the student actually sees.
 */
export function withStimulus(question: string, stimulus?: string | null): string {
  const body = (stimulus || "").trim();
  return body ? `Read the passage, then answer the question.\n\nPASSAGE:\n${body}\n\nQUESTION: ${question}` : question;
}
