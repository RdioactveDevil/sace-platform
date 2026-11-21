import ical from "node-ical";
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
  try {
    for (const e of Object.values(data)) {
      if (!e || e.type !== "VEVENT" || !(e.start instanceof Date)) continue;
      if (String(e.transparency ?? "").toUpperCase() === "TRANSPARENT") continue;
      if (String(e.status ?? "").toUpperCase() === "CANCELLED") continue;
      const allDay = e.datetype === "date";
      const startMs = e.start.getTime();
      const endMs = e.end instanceof Date ? e.end.getTime() : NaN;
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
        if (b > from && a < to) out.push({ start: a, end: b });
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
    }
  } catch {
    return [];
  }
  return out.sort((x, y) => x.start - y.start || x.end - y.end);
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
  return { url: s };
}

const cache = new Map<string, { at: number; busy: Interval[] }>();

export function clearBusyCache(): void {
  cache.clear();
}

export async function fetchBusy(
  url: string,
  from: number,
  to: number,
  timeZone: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<{ busy: Interval[] } | { error: string }> {
  const key = `${url}|${from}|${to}|${timeZone}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { busy: hit.busy };

  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error("timeout"));
    }, timeoutMs);
  });
  try {
    const work = (async () => {
      const res = await fetchImpl(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const len = Number(res.headers.get("content-length"));
      if (Number.isFinite(len) && len > MAX_BYTES) throw new Error("too large");
      let text: string;
      if (res.body) {
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
        text = Buffer.concat(chunks).toString("utf8");
      } else {
        text = await res.text();
        if (Buffer.byteLength(text) > MAX_BYTES) throw new Error("too large");
      }
      return text;
    })();
    work.catch(() => {});
    const text = await Promise.race([work, timeout]);
    const busy = parseBusy(text, from, to, timeZone);
    cache.set(key, { at: Date.now(), busy });
    return { busy };
  } catch {
    return { error: "Couldn't read the calendar." };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
