import type { Caller } from "./auth";
import { logger } from "./logger";

export type Quota = { chat_used: number; chat_limit: number | null };

/**
 * Count this AI call against the student's daily limits (ai_usage). Students
 * with no paid/granted/beta subject get a few Titan AI messages a day
 * (`purpose: "titan_chat"`); every AI call also counts toward a hidden safety
 * cap. Tutors, admins and server scripts aren't limited. Fails open if the
 * quota check itself errors, so a database hiccup never takes chat down.
 */
export async function checkAiQuota(
  caller: Caller,
  isChat: boolean,
): Promise<{ blocked: { scope: string; quota: Quota } } | { quota: Quota | null }> {
  if (caller.isAdmin || caller.isTutor) return { quota: null };
  const { data, error } = await caller.admin.rpc("use_ai_quota", { p_user: caller.userId, p_chat: isChat });
  if (error || !data) {
    logger.warn({ err: error }, "AI quota check failed — allowing the call");
    return { quota: null };
  }
  const r = data as { allowed: boolean; chat_used: number; chat_limit: number | null; limit_hit?: string };
  const quota = { chat_used: r.chat_used ?? 0, chat_limit: r.chat_limit ?? null };
  return r.allowed ? { quota } : { blocked: { scope: r.limit_hit || "calls", quota } };
}

/**
 * The student's last free Titan message today (this call used it): a line for
 * Titan's system prompt so the reply wraps up the chat. The app then shows
 * where the chat paused (LearnScreen, TitanLimitNote). '' otherwise.
 */
export function lastFreeMessageNote(quota: Quota | null): string {
  if (!quota || quota.chat_limit == null || quota.chat_used < quota.chat_limit) return "";
  return [
    "This is the student's last free Titan message for today; more arrive at midnight (Adelaide time).",
    "Answer their message as usual, then end the reply in one or two short sentences:",
    "if they just got something right, say so; say you'll stop here for today;",
    "end with the one next question or step to try next time, phrased as a question;",
    "and say you're back at midnight, or they can carry on now.",
    "Don't mention prices or plans, and don't offer suggested replies.",
  ].join(" ");
}
