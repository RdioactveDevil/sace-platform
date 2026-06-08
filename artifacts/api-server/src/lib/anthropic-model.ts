/** Default Claude model for all Anthropic API calls in this service. */
export const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

/**
 * Model used to fact-check generated questions before they enter the bank.
 * Verification accuracy matters more than speed/cost here, so this can be
 * pointed at a stronger model via AI_VERIFY_MODEL (e.g. claude-sonnet-4-6).
 * Defaults to CLAUDE_MODEL so the pipeline keeps working without extra config.
 */
export const CLAUDE_VERIFY_MODEL = process.env.AI_VERIFY_MODEL || CLAUDE_MODEL;
