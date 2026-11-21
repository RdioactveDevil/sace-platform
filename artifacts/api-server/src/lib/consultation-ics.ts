/** RFC 5545 calendar invite (or cancellation) for a consultation call. */

export interface ConsultationIcsOptions {
  uid: string;
  sequence: number;
  method: "REQUEST" | "CANCEL";
  /** Start, epoch ms. */
  start: number;
  minutes: number;
  summary: string;
  description: string;
  url: string;
  organizerName: string;
  organizerEmail: string;
  attendees: Array<{ name?: string; email: string }>;
  /** DTSTAMP, epoch ms (default now). */
  now?: number;
}

const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

/** TEXT values: escape backslash, semicolon, comma and newlines. */
const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");

/** Parameter values can't hold quotes, semicolons, colons or commas unquoted: quote when needed. */
const param = (s: string) => {
  const clean = s.replace(/[\r\n]+/g, " ").replace(/"/g, "'");
  return /[;:,]/.test(clean) ? `"${clean}"` : clean;
};

/** Fold to at most 75 octets per line (continuations start with a space), never splitting a character. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > limit) {
      out.push(cur);
      cur = " ";
      bytes = 1;
      limit = 75;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

export function consultationIcs(o: ConsultationIcsOptions): string {
  const cancel = o.method === "CANCEL";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//gradefarm//Consultations//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${o.method}`,
    "BEGIN:VEVENT",
    `UID:${o.uid}`,
    `SEQUENCE:${o.sequence}`,
    `DTSTAMP:${utc(o.now ?? Date.now())}`,
    `DTSTART:${utc(o.start)}`,
    `DTEND:${utc(o.start + o.minutes * 60_000)}`,
    `SUMMARY:${text(o.summary)}`,
    `DESCRIPTION:${text(o.description)}`,
    `URL:${o.url}`,
    `LOCATION:${o.url}`,
    `STATUS:${cancel ? "CANCELLED" : "CONFIRMED"}`,
    `ORGANIZER;CN=${param(o.organizerName)}:mailto:${o.organizerEmail}`,
    ...o.attendees.map(
      (a) => `ATTENDEE;${a.name ? `CN=${param(a.name)};` : ""}ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`,
    ),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
