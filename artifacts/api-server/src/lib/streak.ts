import { addDays, localDate } from "./automated-emails";

/**
 * The day streak to show. award_xp() counts days in Adelaide time and only
 * updates the stored streak when the user next answers, so one whose last
 * active day is before yesterday has lapsed: 0. Mirrors the web app's
 * src/lib/streak.js.
 */
export function currentStreak(streak: number | null | undefined, lastActive: string | null | undefined, now = new Date()): number {
  if (!streak || !lastActive) return 0;
  const last = new Date(lastActive);
  if (Number.isNaN(last.getTime())) return 0;
  const today = localDate(now);
  const lastDay = localDate(last);
  return lastDay === today || lastDay === addDays(today, -1) ? streak : 0;
}
