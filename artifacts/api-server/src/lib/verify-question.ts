import { CLAUDE_VERIFY_MODEL } from "./anthropic-model";
import { logger } from "./logger";

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
  explanation: string;
};

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

If a DIFFERENT option matches your computed answer (use the 0-based index of that option):
{"verdict":"wrong_answer","correct_index":2,"explanation":"one sentence showing the working that proves it"}

If your computed answer matches NO option, or the question is fundamentally flawed/ambiguous:
{"verdict":"wrong_question","correct_index":null,"explanation":"one sentence"}`;
}

/** Depth-count braces to find the JSON object, ignoring {} inside LaTeX like \sec^{2}. */
export function parseVerdict(text: string): Verdict {
  const start = text.indexOf("{");
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
}): Promise<Verdict> {
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

  let lastErr: Error = new Error("verification failed");
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
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
          max_tokens: 700,
          messages: [{ role: "user", content: buildPrompt(q) }],
        }),
      });
      if (resp.ok) {
        const body = await resp.json() as any;
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
    await new Promise((r) => setTimeout(r, wait + Math.random() * 500));
  }
  throw lastErr;
}

export type VerifiableQuestion = {
  question: string;
  options: string[];
  answer_index: number;
  solution?: string | null;
};

/**
 * Verify a freshly generated batch before insertion:
 *   - "correct"        → keep as-is
 *   - "wrong_answer"   → fix answer_index, and replace the solution with the
 *                        verifier's working so the explanation can't contradict
 *                        the corrected answer
 *   - "wrong_question" → drop it entirely (never enters the bank)
 *
 * Fails OPEN: if the verifier errors (network/parse/model unavailable) the
 * question is kept unverified rather than silently lost. Set
 * VERIFY_GENERATED_QUESTIONS=false to disable the gate entirely.
 */
export async function filterVerifiedQuestions<T extends VerifiableQuestion>(
  questions: T[],
  opts: { concurrency?: number; context?: Record<string, unknown> } = {},
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
        const verdict = await verifyQuestionPayload({
          question: q.question,
          options: q.options,
          answer_index: q.answer_index,
        });
        if (verdict.verdict === "wrong_question") {
          results[idx] = null;
        } else if (
          verdict.verdict === "wrong_answer" &&
          verdict.correct_index != null &&
          verdict.correct_index >= 0 &&
          verdict.correct_index < q.options.length &&
          verdict.correct_index !== q.answer_index
        ) {
          fixed++;
          results[idx] = {
            ...q,
            answer_index: verdict.correct_index,
            solution: verdict.explanation || q.solution || "",
          } as T;
        } else {
          results[idx] = q;
        }
      } catch (err) {
        errored++;
        logger.warn(
          { err: (err as Error).message, ...(opts.context || {}) },
          "[verify-question] verification failed; keeping question unverified",
        );
        results[idx] = q;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  const kept = results.filter((r): r is T => r !== null);
  return { kept, dropped: questions.length - kept.length, fixed, errored };
}
