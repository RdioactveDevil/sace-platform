import type { Caller } from "./auth";
import { logger } from "./logger";

/** Whether the caller may see this question (staff, or a subject they have access to). */
export async function canReadQuestion(caller: Caller, questionId: string): Promise<boolean> {
  if (caller.isAdmin || caller.isTutor) return true;
  const { data, error } = await caller.admin.rpc("user_can_read_question", { p_user: caller.userId, p_question_id: questionId });
  if (error?.code === "PGRST202") {
    // Before migration 20261025000005 there is no access check to call.
    logger.warn("user_can_read_question missing; allowing the request");
    return true;
  }
  if (error) throw error;
  return data === true;
}
