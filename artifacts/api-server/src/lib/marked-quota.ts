import type { Caller } from "./auth";
import { TIME_ZONE } from "./automated-emails";
import { logger } from "./logger";

/** Written answers a student with no paid subject can have marked in a day, unless the settings say otherwise. */
export const DEFAULT_FREE_DAILY_MARKED = 5;

/** The free allowance from platform_settings.pricing.free_daily_marked_answers (0 turns free marking off). */
export function freeMarkedLimit(pricing: Record<string, unknown> | null | undefined): number {
  const n = pricing?.free_daily_marked_answers;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_FREE_DAILY_MARKED;
}

/** Midnight just gone in Adelaide. An hour out on the two days a year the clocks change. */
export function startOfLocalDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const sinceMidnight = part("hour") * 3600 + part("minute") * 60 + part("second");
  return new Date(Math.floor(now.getTime() / 1000) * 1000 - sinceMidnight * 1000);
}

/**
 * Whether this student can have another written answer marked today. Marking
 * runs on the stronger model, so students with no paid, granted or beta
 * subject get a few a day (answer_markings rows since midnight; a failed
 * marking saves no row and so costs nothing). Paid students, tutors and
 * admins aren't limited here. Fails open if the check itself errors.
 */
export async function checkMarkedAllowance(caller: Caller): Promise<{ blocked: false } | { blocked: true; limit: number }> {
  if (caller.isAdmin || caller.isTutor || caller.userId === "service") return { blocked: false };
  try {
    const { count: paid, error: paidErr } = await caller.admin
      .from("user_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", caller.userId).eq("active", true).neq("source", "free");
    if (paidErr) throw paidErr;
    if (paid) return { blocked: false };

    const { data: setting, error: settingErr } = await caller.admin
      .from("platform_settings").select("value").eq("key", "pricing").maybeSingle();
    if (settingErr) throw settingErr;
    const limit = freeMarkedLimit((setting as { value?: Record<string, unknown> } | null)?.value);

    const { count: used, error: usedErr } = await caller.admin
      .from("answer_markings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", caller.userId).gte("created_at", startOfLocalDay(new Date()).toISOString());
    if (usedErr) throw usedErr;
    return (used ?? 0) >= limit ? { blocked: true, limit } : { blocked: false };
  } catch (err) {
    logger.warn({ err }, "Marked-answer allowance check failed — allowing the marking");
    return { blocked: false };
  }
}
