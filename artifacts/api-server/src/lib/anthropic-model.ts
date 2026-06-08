/** Default Claude model for all Anthropic API calls in this service. */
export const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

/**
 * Model used to fact-check generated questions before they enter the bank.
 * Verification accuracy matters more than speed/cost here, so this defaults to
 * a stronger reasoning model than the base CLAUDE_MODEL. Override via
 * AI_VERIFY_MODEL (e.g. set it back to claude-haiku-4-5-20251001 to cut cost).
 */
export const CLAUDE_VERIFY_MODEL = process.env.AI_VERIFY_MODEL || "claude-sonnet-4-6";
