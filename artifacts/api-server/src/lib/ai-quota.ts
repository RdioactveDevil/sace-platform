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
