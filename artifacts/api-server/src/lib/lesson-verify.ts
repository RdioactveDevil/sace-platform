import { askVerifier, looksLikeCheckerNote } from "./verify-question";
import { repairLatexJson } from "./json-latex";
import { logger } from "./logger";

/**
 * Fact-checks a guided lesson before the student sees it.
 *
 * Titan writes a lesson in one go (key ideas, a quick question on each, a
 * worked example and two final challenges) with the everyday model, and a
 * slip there is shown as fact: a final challenge once marked 22 g "correct"
 * while its own explanation worked out 44 g. So, like bank questions
 * (verify-question.ts), every question is solved again from scratch by the
 * stronger checking model, and so is the worked example:
 *
 *   question right, explanation right  → kept
 *   another option is right            → answer key moved to it, explanation rewritten
 *   explanation wrong or contradictory → explanation rewritten
 *   no option right / ambiguous        → the question is dropped
 *   worked example has a wrong line    → the working is replaced by the corrected lines
 *
 * Fails open: a check that errors leaves that part as written (and is logged),
 * so a slow checker never costs the student their lesson.
 */

export type LessonCheck = { question: string; options: string[]; answer_index: number; explanation?: string };
type Step = { work: string; note?: string };

export type CheckVerdict = {
  verdict: "correct" | "wrong_answer" | "wrong_question";
  correct_index?: number | null;
  explanation_ok?: boolean;
  explanation?: string;
};
export type ExampleVerdict = { verdict: "correct" | "fixed" | "wrong_problem"; steps?: Step[] };

type Ask = (prompt: string) => Promise<string>;

const LABELS = ["A", "B", "C", "D", "E", "F"];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Parse a JSON object out of model text, keeping single-backslash LaTeX intact. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const s = String(text || "");
  const start = s.indexOf("{"), end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  const body = s.slice(start, end + 1);
  for (const candidate of [repairLatexJson(body), body]) {
    try {
      const v = JSON.parse(candidate);
      if (isObj(v)) return v;
    } catch { /* try the next */ }
  }
  return null;
}

function isCheck(c: unknown): c is LessonCheck {
  return isObj(c) && typeof c.question === "string" && Array.isArray(c.options) && c.options.length >= 2 &&
    Number.isInteger(c.answer_index) && (c.answer_index as number) >= 0 && (c.answer_index as number) < c.options.length;
}

// Student-facing text from the checker: not empty and not about the checking.
function usable(text: unknown): string | null {
  const t = typeof text === "string" ? text.trim() : "";
  return t && !looksLikeCheckerNote(t) ? t : null;
}

export function checkPrompt(c: LessonCheck, subject: string): string {
  const opts = c.options.map((o, i) => `${LABELS[i] ?? i}: ${o}`).join("\n");
  return `You are checking one multiple-choice question from a short ${subject || "school"} lesson before a student sees it.

Question: ${c.question}
Options:
${opts}
Marked correct: ${LABELS[c.answer_index] ?? c.answer_index}: ${c.options[c.answer_index]}
Explanation the student sees after answering: ${c.explanation || "(none)"}

Solve the question yourself from scratch, step by step, WITHOUT assuming the marked answer is right. Work out the actual answer, then see which option matches it. Then check the explanation: is it correct, and does it reach the same answer as the correct option?

Reply with ONLY one JSON object, no other text:
{"verdict": "correct" | "wrong_answer" | "wrong_question", "correct_index": <0-based index of the option that is right, or null>, "explanation_ok": true | false, "explanation": "<see below>"}
- "correct": the marked option is right. "wrong_answer": a different option is right (give its index). "wrong_question": no option is right, more than one is, or the question can't be answered as written.
- "explanation_ok" is false when the explanation has a mistake, reaches a different answer, or contradicts the correct option.
- When verdict is "wrong_answer" or explanation_ok is false, "explanation" is a corrected explanation for the student: one to three sentences showing why the right answer is right and the likely slip behind a wrong one, maths in LaTeX inside $...$. It must not mention option letters, which answer was marked, or that anything was checked. Otherwise leave it "".`;
}

export function examplePrompt(problem: string, steps: Step[], subject: string): string {
  const lines = steps.map((s, i) => `${i + 1}. ${s.work}${s.note ? `   (why: ${s.note})` : ""}`).join("\n");
  return `You are checking the worked example in a short ${subject || "school"} lesson before a student sees it.

Problem: ${problem}
Working, one line at a time:
${lines}

Work the problem yourself from scratch. Then check every line above: each must be correct, follow from the line before, and the last line must reach the right answer.

Reply with ONLY one JSON object, no other text:
- Every line is correct: {"verdict": "correct"}
- Any line is wrong: {"verdict": "fixed", "steps": [{"work": "the line of working", "note": "why, in a few words"}]} giving the whole corrected working in the same style, 3 to 5 lines, maths in LaTeX inside $...$.
- The problem itself can't be solved as written: {"verdict": "wrong_problem"}`;
}

/** Apply the checker's verdict to one question: the question to keep, or null to drop it. */
export function applyCheckVerdict(c: LessonCheck, v: CheckVerdict | null): LessonCheck | null {
  if (!v) return c;
  if (v.verdict === "wrong_question") return null;
  if (v.verdict === "wrong_answer" && v.correct_index !== c.answer_index) {
    const idx = v.correct_index;
    const explanation = usable(v.explanation);
    // A moved key needs a matching explanation, or the card would contradict itself.
    if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= c.options.length || !explanation) return null;
    return { ...c, answer_index: idx, explanation };
  }
  if (v.explanation_ok === false) {
    // The key is right but the explanation isn't: better none than a wrong one.
    return { ...c, explanation: usable(v.explanation) ?? "" };
  }
  return c;
}

/** Apply the checker's verdict to the worked example's steps. */
export function applyExampleVerdict(steps: Step[], v: ExampleVerdict | null): Step[] {
  if (!v || v.verdict !== "fixed" || !Array.isArray(v.steps)) return steps;
  const fixed = v.steps
    .filter((s): s is Step => isObj(s) && typeof s.work === "string" && !!s.work.trim() && !looksLikeCheckerNote(s.work))
    .map((s) => ({ work: s.work, ...(typeof s.note === "string" && s.note.trim() ? { note: s.note } : {}) }));
  return fixed.length >= 2 ? fixed : steps;
}

async function judge<T>(ask: Ask, prompt: string, what: string): Promise<T | null> {
  try {
    const v = parseJsonObject(await ask(prompt));
    if (!v || typeof v.verdict !== "string") throw new Error("no verdict in reply");
    return v as unknown as T;
  } catch (err) {
    logger.warn({ err: (err as Error).message, what }, "[lesson-verify] check failed; keeping it as written");
    return null;
  }
}

/**
 * Check a lesson (as parsed from Titan's JSON) and return it corrected, plus
 * what changed. Every check runs at once, so this takes about as long as the
 * slowest one.
 */
export async function verifyLesson(
  lesson: Record<string, unknown>,
  subject = "",
  ask: Ask = (p) => askVerifier(p, { maxTokens: 3000, timeoutMs: 60_000 }),
): Promise<{ lesson: Record<string, unknown>; fixed: number; dropped: number; exampleFixed: boolean }> {
  const ideas = Array.isArray(lesson.ideas) ? lesson.ideas : [];
  const finals = Array.isArray(lesson.checks) ? lesson.checks : [];
  const example = isObj(lesson.example) ? lesson.example : null;
  const steps = example && Array.isArray(example.steps)
    ? example.steps.filter((s): s is Step => isObj(s) && typeof s.work === "string")
    : [];

  const runCheck = (c: unknown) => (isCheck(c) ? judge<CheckVerdict>(ask, checkPrompt(c, subject), "check") : Promise.resolve(null));
  const [ideaVerdicts, finalVerdicts, exampleVerdict] = await Promise.all([
    Promise.all(ideas.map((i) => runCheck(isObj(i) ? i.check : null))),
    Promise.all(finals.map(runCheck)),
    example && steps.length
      ? judge<ExampleVerdict>(ask, examplePrompt(String(example.problem || ""), steps, subject), "example")
      : Promise.resolve(null),
  ]);

  let fixed = 0, dropped = 0;
  const settle = (c: LessonCheck, v: CheckVerdict | null) => {
    const out = applyCheckVerdict(c, v);
    if (!out) dropped++;
    else if (out !== c) fixed++;
    return out;
  };

  const newIdeas = ideas.map((idea, i) => {
    if (!isObj(idea) || !isCheck(idea.check)) return idea;
    const check = settle(idea.check, ideaVerdicts[i]);
    const { check: _old, ...rest } = idea;
    return check ? { ...rest, check } : rest;
  });
  const newFinals = finals
    .map((c, i) => (isCheck(c) ? settle(c, finalVerdicts[i]) : c))
    .filter((c) => c !== null);
  const newSteps = applyExampleVerdict(steps, exampleVerdict);
  const exampleFixed = newSteps !== steps;

  return {
    lesson: {
      ...lesson,
      ideas: newIdeas,
      checks: newFinals,
      ...(example && { example: { ...example, steps: newSteps } }),
    },
    fixed,
    dropped,
    exampleFixed,
  };
}

/**
 * The lesson text from a chat reply, checked and corrected, as JSON text for
 * the app's lesson parser. Text that isn't a lesson comes back unchanged.
 */
export async function verifyLessonText(text: string, subject = "", ask?: Ask): Promise<string> {
  if (process.env.VERIFY_LESSONS === "false") return text;
  const lesson = parseJsonObject(text);
  if (!lesson || !Array.isArray(lesson.ideas)) return text;
  const out = await verifyLesson(lesson, subject, ask);
  if (out.fixed || out.dropped || out.exampleFixed) {
    logger.info({ subject, fixed: out.fixed, dropped: out.dropped, exampleFixed: out.exampleFixed }, "[lesson-verify] corrected a lesson before showing it");
  }
  return JSON.stringify(out.lesson);
}
