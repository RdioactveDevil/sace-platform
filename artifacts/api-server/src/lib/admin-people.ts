/**
 * An admin changing someone's account from Admin → People (routes/admin-people.ts).
 * These check what was sent; the route saves it.
 */

export const STATES = ["VIC", "SA", "NSW", "QLD", "WA", "TAS", "ACT", "NT", "INTL"] as const;
export const YEAR_LEVELS = [6, 7, 8, 9, 10, 11, 12] as const;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DetailUpdates = {
  display_name?: string;
  year_level?: number | null;
  state?: string | null;
  school?: string | null;
  dob?: string | null;
};

/** A YYYY-MM-DD birthday between 4 and 100 years before `now`, or null. */
export function validDob(value: string, now = new Date()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return false;
  const years = (now.getTime() - d.getTime()) / (365.25 * 86400000);
  return years >= 4 && years <= 100;
}

/**
 * Changes to someone's details: { displayName, email, yearLevel, state, school, dob }.
 * Only what was sent changes; null (or "") clears year, state, school or birthday.
 */
export function parseDetails(body: unknown, now = new Date()): { updates: DetailUpdates; email?: string } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const updates: DetailUpdates = {};
  let email: string | undefined;
  const blank = (v: unknown) => v === null || v === "";

  if ("displayName" in b) {
    const name = typeof b.displayName === "string" ? b.displayName.trim().replace(/\s+/g, " ") : "";
    if (!name || name.length > 80) return { error: "Enter a name (up to 80 characters)." };
    updates.display_name = name;
  }
  if ("email" in b) {
    const e = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(e) || e.length > 254) return { error: "Enter a valid email address." };
    email = e;
  }
  if ("yearLevel" in b) {
    if (blank(b.yearLevel)) updates.year_level = null;
    else {
      const y = Number(b.yearLevel);
      if (!(YEAR_LEVELS as readonly number[]).includes(y)) return { error: "Year level must be 6 to 12." };
      updates.year_level = y;
    }
  }
  if ("state" in b) {
    if (blank(b.state)) updates.state = null;
    else if (typeof b.state === "string" && (STATES as readonly string[]).includes(b.state)) updates.state = b.state;
    else return { error: "Pick a state." };
  }
  if ("school" in b) {
    const s = typeof b.school === "string" ? b.school.trim() : "";
    if (s.length > 120) return { error: "School names are up to 120 characters." };
    updates.school = s || null;
  }
  if ("dob" in b) {
    if (blank(b.dob)) updates.dob = null;
    else if (typeof b.dob === "string" && validDob(b.dob, now)) updates.dob = b.dob;
    else return { error: "Enter a real date of birth." };
  }
  if (!Object.keys(updates).length && email === undefined) return { error: "Nothing to change." };
  return email === undefined ? { updates } : { updates, email };
}

/** Changes to someone's own settings: { reminders, sounds, leaderboard } (booleans). */
export function parseSettings(body: unknown, now = new Date()): Record<string, unknown> | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof b.reminders === "boolean") out.emails_unsubscribed_at = b.reminders ? null : now.toISOString();
  if (typeof b.sounds === "boolean") out.sounds_enabled = b.sounds;
  if (typeof b.leaderboard === "boolean") out.hide_from_leaderboard = !b.leaderboard;
  return Object.keys(out).length ? out : { error: "Nothing to change." };
}
