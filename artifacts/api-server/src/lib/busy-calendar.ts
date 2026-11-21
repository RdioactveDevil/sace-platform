import ical from "node-ical";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { zonedToUtc, type Interval } from "./booking-slots";

const DAY = 24 * 60 * 60 * 1000;
const MAX_BYTES = 5 * 1024 * 1024;
const CACHE_MS = 5 * 60 * 1000;

function ymdOf(d: Date): string {
  // All-day dates from node-ical are floating: read the calendar day in UTC-agnostic local fields.
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function nextDay(ymd: string): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
}

function timeOf(v: unknown): number {
  return v instanceof Date ? v.getTime() : NaN;
}

export function parseBusy(ics: string, from: number, to: number, timeZone: string): Interval[] {
  let data: Record<string, any>;
  try {
    data = ical.sync.parseICS(ics) as Record<string, any>;
  } catch {
    return [];
  }
  const out: Interval[] = [];
  for (const e of Object.values(data)) {
    // One event that can't be read (e.g. a series too dense to expand) is skipped, not the calendar.
    try {
      if (!e || e.type !== "VEVENT" || !(e.start instanceof Date)) continue;
      if (String(e.transparency ?? "").toUpperCase() === "TRANSPARENT") continue;
      if (String(e.status ?? "").toUpperCase() === "CANCELLED") continue;
      const allDay = e.datetype === "date";
      const startMs = e.start.getTime();
      const endMs = e.end instanceof Date ? e.end.getTime() : NaN;
      const mine: Interval[] = []; // kept only if the whole event reads
      let dur: number;
      if (allDay) {
        dur = 0;
      } else {
        dur = Number.isFinite(endMs) ? endMs - startMs : 0;
      }

      const place = (s: Date, ovEnd?: Date): void => {
        let a: number;
        let b: number;
        if (allDay) {
          const startYmd = ymdOf(s);
          a = zonedToUtc(startYmd, "00:00", timeZone);
          let endYmd = nextDay(startYmd);
          const endDate = ovEnd ?? (e.end instanceof Date ? new Date(s.getTime() + (endMs - startMs)) : null);
          if (endDate) {
            const cand = ymdOf(endDate);
            if (cand > startYmd) endYmd = cand;
          }
          b = zonedToUtc(endYmd, "00:00", timeZone);
        } else {
          a = s.getTime();
          b = ovEnd ? ovEnd.getTime() : a + dur;
        }
        if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return;
        if (b > from && a < to) mine.push({ start: a, end: b });
      };

      if (e.rrule) {
        const exKeys = new Set<number>();
        for (const x of Object.values(e.exdate ?? {})) {
          const t = timeOf(x);
          if (Number.isFinite(t)) exKeys.add(allDay ? Date.parse(ymdOf(x as Date) + "T00:00:00Z") : t);
        }
        // node-ical indexes each override twice (by date and by ISO time); dedupe by object.
        const overrides: any[] = [...new Set<any>(Object.values(e.recurrences ?? {}))];
        const overrideKeys = new Set<number>();
        for (const o of overrides) {
          const t = timeOf(o?.recurrenceid);
          if (Number.isFinite(t)) {
            overrideKeys.add(allDay ? Date.parse(ymdOf(o.recurrenceid) + "T00:00:00Z") : t);
          }
        }
        // Widen the search so occurrences that start before `from` but overlap it are found.
        const span = allDay ? 7 * DAY : Math.max(dur, 0) + DAY;
        const occ: Date[] = e.rrule.between(new Date(from - span), new Date(to), true);
        for (const s of occ) {
          const key = allDay ? Date.parse(ymdOf(s) + "T00:00:00Z") : s.getTime();
          if (exKeys.has(key) || overrideKeys.has(key)) continue;
          place(s);
        }
        for (const o of overrides) {
          if (!o || !(o.start instanceof Date)) continue;
          if (String(o.transparency ?? "").toUpperCase() === "TRANSPARENT") continue;
          if (String(o.status ?? "").toUpperCase() === "CANCELLED") continue;
          place(o.start, o.end instanceof Date ? o.end : undefined);
        }
      } else {
        place(e.start);
      }
      out.push(...mine);
    } catch {
      continue;
    }
  }
  return out.sort((x, y) => x.start - y.start || x.end - y.end);
}

function isBlockedIp(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, "").toLowerCase();
  const fam = isIP(ip);
  if (fam === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (fam === 6) {
    if (ip === "::" || ip === "::1") return true;
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
      return isBlockedIp(`${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`);
    }
    const first = parseInt(ip.split(":")[0] || "0", 16);
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
  }
  return false;
}

export function checkIcalUrl(raw: unknown): { url: string | null } | { error: string } {
  if (raw === undefined || raw === null) return { url: null };
  if (typeof raw !== "string") return { error: "Calendar address must be text." };
  const s = raw.trim();
  if (!s) return { url: null };
  if (s.length > 2000) return { error: "Calendar address is too long." };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { error: "That doesn't look like a valid calendar address." };
  }
  if (u.protocol !== "https:") return { error: "Calendar address must start with https://." };
  if (u.username || u.password) return { error: "Calendar address can't contain a username or password." };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !host || host === "localhost" ||
    host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") ||
    isBlockedIp(host)
  ) {
    return { error: "That calendar address isn't allowed." };
  }
  return { url: s };
}

type Resolver = (host: string) => Promise<string[]>;
const defaultResolver: Resolver = async (host) =>
  (await lookup(host, { all: true })).map((a) => a.address);

const MAX_ENTRIES = 200;
const MAX_REDIRECTS = 3;
const cache = new Map<string, { at: number; text: string }>();

export function clearBusyCache(): void {
  cache.clear();
}

async function fetchText(
  start: string,
  fetchImpl: typeof fetch,
  resolve: Resolver,
  signal: AbortSignal,
  ctrl: AbortController,
): Promise<string> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const ok = checkIcalUrl(current);
    if ("error" in ok || !ok.url) throw new Error("blocked url");
    const host = new URL(current).hostname.replace(/^\[|\]$/g, "");
    if (!isIP(host)) {
      const addrs = await resolve(host);
      if (!addrs.length || addrs.some(isBlockedIp)) throw new Error("blocked address");
    }
    const res = await fetchImpl(current, { signal, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("redirect without location");
      await res.body?.cancel().catch(() => {});
      current = new URL(loc, current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`status ${res.status}`);
    const len = Number(res.headers.get("content-length"));
    if (Number.isFinite(len) && len > MAX_BYTES) throw new Error("too large");
    if (!res.body) {
      const text = await res.text();
      if (Buffer.byteLength(text) > MAX_BYTES) throw new Error("too large");
      return text;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        ctrl.abort();
        throw new Error("too large");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  throw new Error("too many redirects");
}

export async function fetchBusy(
  url: string,
  from: number,
  to: number,
  timeZone: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5000,
  deps: { resolve?: Resolver; now?: () => number } = {},
): Promise<{ busy: Interval[] } | { error: string }> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  for (const [k, v] of cache) if (t0 - v.at >= CACHE_MS) cache.delete(k);
  let text = cache.get(url)?.text;
  if (text === undefined) {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctrl.abort();
        reject(new Error("timeout"));
      }, timeoutMs);
    });
    try {
      const work = fetchText(url, fetchImpl, deps.resolve ?? defaultResolver, ctrl.signal, ctrl);
      work.catch(() => {});
      text = await Promise.race([work, timeout]);
    } catch {
      return { error: "Couldn't read the calendar." };
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!isCalendar(text)) return { error: NOT_A_CALENDAR };
    cache.set(url, { at: t0, text });
    while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  }
  return { busy: parseBusy(text, from, to, timeZone) };
}

const NOT_A_CALENDAR = "That address didn't return a calendar.";

/** An HTML sign-in page or the like isn't a calendar: say so rather than read it as "no busy times". */
function isCalendar(text: string): boolean {
  return /BEGIN:VCALENDAR/i.test(text.slice(0, 4096));
}
