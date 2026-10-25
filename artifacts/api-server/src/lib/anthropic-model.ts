/** Default Claude model for all Anthropic API calls in this service. */
export const CLAUDE_MODEL = "claude-haiku-5-5";

/**
 * Thinking setting sent with every CLAUDE_MODEL request. Claude Haiku 5.5
 * thinks by default, which would put `thinking` blocks ahead of the text that
 * callers read from `content[0]`, eat into small `max_tokens` caps, and add
 * cost. These routes ran without thinking on Haiku 4.5, so keep it off.
 */
export const CLAUDE_THINKING = { type: "disabled" } as const;

/**
 * Model used to fact-check generated questions before they enter the bank.
 * Verification accuracy matters more than speed/cost here, so this defaults to
 * a stronger reasoning model than the base CLAUDE_MODEL. Override via
 * AI_VERIFY_MODEL (e.g. set it to claude-haiku-5-5 to cut cost).
 */
export const CLAUDE_VERIFY_MODEL = process.env.AI_VERIFY_MODEL || "claude-sonnet-5-5";

/**
 * Model for "exam-grade" generation: the hardest bank questions, requested by
 * admins and the seed script (never by students' live top-ups). Writing a
 * genuinely hard maths question means solving it while writing it, so this is
 * the most capable model with adaptive thinking. Override via AI_EXAM_MODEL.
 */
export const CLAUDE_EXAM_MODEL = process.env.AI_EXAM_MODEL || "claude-opus-5-5";

/**
 * Reasoning effort for exam-grade generation. "high" keeps a 2–3 question
 * batch, plus its verification, inside the 300 s serverless limit; lower it
 * (AI_EXAM_EFFORT=medium) if requests start timing out.
 */
export const CLAUDE_EXAM_EFFORT = process.env.AI_EXAM_EFFORT || "high";
