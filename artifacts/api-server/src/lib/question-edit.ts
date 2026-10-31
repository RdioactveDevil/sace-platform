// Validates an admin's edit to a live question (from Reports or Student
// flags) and turns it into a row update. Any of question, options,
// answerIndex, solution and difficulty may be given.

const OPTION_MAX = 8;
const TEXT_MAX = 4000;

export type QuestionEdit = {
  question?: unknown; options?: unknown; answerIndex?: unknown; solution?: unknown; difficulty?: unknown;
};

export function buildQuestionUpdate(
  currentOptions: unknown[],
  body: QuestionEdit,
): { update: Record<string, unknown> } | { error: string } {
  const update: Record<string, unknown> = {};
  let options = currentOptions;
  if (body.question !== undefined) {
    if (typeof body.question !== "string" || !body.question.trim() || body.question.length > TEXT_MAX) {
      return { error: "The question needs some text" };
    }
    update.question = body.question.trim();
  }
  if (body.options !== undefined) {
    const opts = body.options;
    if (!Array.isArray(opts) || opts.length < 2 || opts.length > OPTION_MAX
      || opts.some(o => typeof o !== "string" || !o.trim() || o.length > TEXT_MAX)) {
      return { error: `Give 2 to ${OPTION_MAX} options, none of them empty` };
    }
    options = opts.map(o => (o as string).trim());
    update.options = options;
  }
  if (body.solution !== undefined) {
    if (typeof body.solution !== "string" || body.solution.length > TEXT_MAX) {
      return { error: "The worked solution is too long" };
    }
    update.solution = body.solution.trim();
  }
  if (body.difficulty !== undefined) {
    const d = Number(body.difficulty);
    if (!Number.isInteger(d) || d < 1 || d > 5) return { error: "Level must be 1 to 5" };
    update.difficulty = d;
  }
  if (body.answerIndex !== undefined) {
    const idx = Number(body.answerIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
      return { error: "The answer must be one of the question's options" };
    }
    update.answer_index = idx;
  } else if (update.options && Array.isArray(options)) {
    // Fewer options than before can leave the key pointing past the end.
    return { error: "Say which option is right" };
  }
  if (!Object.keys(update).length) return { error: "Nothing to change" };
  return { update };
}

export function parseOptions(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; } }
  return [];
}
