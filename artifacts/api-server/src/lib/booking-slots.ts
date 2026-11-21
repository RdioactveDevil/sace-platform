// Open consultation times from a tutor's weekly hours. Pure: no I/O.

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type WeeklyHours = Partial<Record<DayKey, Array<[string, string]>>>;
export type BookingSettings = {
  timeZone: string;
  weeklyHours: WeeklyHours;
  callMinutes: number;
  gapMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
};
export type Interval = { start: number; end: number };

export const DEFAULT_BOOKING: BookingSettings = {
  timeZone: "Australia/Adelaide",
  weeklyHours: {},
  callMinutes: 45,
  gapMinutes: 15,
  minNoticeHours: 12,
  maxDaysAhead: 14,
};

const MIN = 60_000;
const DAY = 86_400_000;
const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]; // Date.getUTCDay order
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

/** Wall-clock fields of an instant in a zone. */
function zonedParts(ms: number, timeZone: string) {
  const p: Record<string, number> = {};
  for (const part of fmt(timeZone).formatToParts(new Date(ms))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return { y: p.year, mo: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/** Offset (zone minus UTC) in ms at an instant. */
function offsetAt(ms: number, timeZone: string): number {
  const t = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(t.y, t.mo - 1, t.d, t.h, t.mi, t.s);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Wall-clock time in a zone to epoch ms. Non-existent local times (spring-forward gap) resolve to a nearby valid instant. */
export function zonedToUtc(ymd: string, hhmm: string, timeZone: string): number {
  const [y, mo, d] = ymd.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const first = wall - offsetAt(wall - offsetAt(wall, timeZone), timeZone);
  return first;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function openSlots(o: {
  settings: BookingSettings;
  now: number;
  busy: Interval[];
  existing: Interval[];
}): string[] {
  const { settings: s, now } = o;
  const call = s.callMinutes * MIN;
  const gap = s.gapMinutes * MIN;
  const earliest = now + s.minNoticeHours * 3_600_000;
  const latest = now + s.maxDaysAhead * DAY;

  const blocked: Interval[] = [
    ...o.busy,
    ...o.existing.map((e) => ({ start: e.start - gap, end: e.end + gap })),
  ];

  const t = zonedParts(now, s.timeZone);
  const out = new Set<number>();
  for (let i = 0; i <= s.maxDaysAhead + 1; i++) {
    const day = new Date(Date.UTC(t.y, t.mo - 1, t.d + i));
    const ymd = day.toISOString().slice(0, 10);
    const blocks = s.weeklyHours[DAY_KEYS[day.getUTCDay()]] ?? [];
    for (const [bs, be] of blocks) {
      const start = zonedToUtc(ymd, bs, s.timeZone);
      const end = zonedToUtc(ymd, be, s.timeZone);
      for (let st = start; st + call <= end; st += call + gap) {
        if (st < earliest || st > latest) continue;
        const en = st + call;
        if (blocked.some((b) => st < b.end && en > b.start)) continue;
        out.add(st);
      }
    }
  }
  return [...out].sort((a, b) => a - b).map((ms) => new Date(ms).toISOString());
}

export function validateWeeklyHours(
  h: unknown,
  callMinutes: number,
): { hours: WeeklyHours } | { error: string } {
  if (!h || typeof h !== "object" || Array.isArray(h)) return { error: "Weekly hours must be an object." };
  const hours: WeeklyHours = {};
  for (const [day, blocks] of Object.entries(h as Record<string, unknown>)) {
    if (!(DAY_KEYS as string[]).includes(day)) return { error: `Unknown day: ${day}.` };
    if (!Array.isArray(blocks)) return { error: `Hours for ${day} must be a list.` };
    const parsed: Array<[string, string]> = [];
    for (const b of blocks) {
      if (!Array.isArray(b) || b.length !== 2 || typeof b[0] !== "string" || typeof b[1] !== "string"
        || !HHMM.test(b[0]) || !HHMM.test(b[1])) {
        return { error: `Times for ${day} must be HH:MM (24-hour).` };
      }
      const a = toMinutes(b[0]);
      const z = toMinutes(b[1]);
      if (a >= z) return { error: `On ${day}, a block must start before it ends.` };
      if (z - a < callMinutes) return { error: `On ${day}, each block must be at least ${callMinutes} minutes.` };
      parsed.push([b[0], b[1]]);
    }
    parsed.sort((x, y) => toMinutes(x[0]) - toMinutes(y[0]));
    for (let i = 1; i < parsed.length; i++) {
      if (toMinutes(parsed[i][0]) < toMinutes(parsed[i - 1][1])) {
        return { error: `On ${day}, blocks must not overlap.` };
      }
    }
    if (parsed.length) hours[day as DayKey] = parsed;
  }
  return { hours };
}
