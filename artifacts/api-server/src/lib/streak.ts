import { addDays, localDate } from "./automated-emails";

/**
 * The day streak to show. award_xp_for() counts days in Adelaide time and only
 * updates the stored streak when the user next answers. A missed day is
 * covered by a streak freeze when they next answer, so a streak whose last
 * active day is before yesterday is still alive while the days missed so far
 * (not counting today, which can still be saved) are no more than the freezes
 * held; otherwise it has lapsed: 0. Mirrors the web app's src/lib/streak.js.
 */
export function currentStreak(
  streak: number | null | undefined,
  lastActive: string | null | undefined,
  now = new Date(),
  freezes: number | null | undefined = 0,
): number {
  if (!streak || !lastActive) return 0;
  const last = new Date(lastActive);
  if (Number.isNaN(last.getTime())) return 0;
  const lastDay = localDate(last);
  const oldestAlive = addDays(localDate(now), -1 - Math.max(0, Number(freezes) || 0));
  return lastDay >= oldestAlive ? streak : 0;
}
