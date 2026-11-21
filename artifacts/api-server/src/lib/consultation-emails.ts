/**
 * Emails about a consultation call. Guests and parents have no account and
 * the tutor isn't theirs yet, so nothing they receive says "your tutor": it
 * names the tutor in full. No unsubscribe links for them. Callers pass the
 * tutor's name already resolved (see prospectSenderName).
 */
import type { EmailContent } from "./email";

type Email = { subject: string; content: EmailContent };
type Who = "guest" | "parent" | "tutor";

/** "Tuesday 3 November, 4:30 pm (Adelaide time)", in the given IANA zone. */
export function formatCallTime(startIso: string, timeZone: string): string {
  const d = new Date(startIso);
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => (parts.find((p) => p.type === t)?.value ?? "").replace(/[  ]/g, " ");
  const ampm = get("dayPeriod").toLowerCase();
  const city = (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ");
  return `${get("weekday")} ${get("day")} ${get("month")}, ${get("hour")}:${get("minute")} ${ampm} (${city} time)`;
}

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

/** "Sam's consultation call with X" / "Your child's consultation call with X". */
const callWith = (studentName: string, tutorName: string) =>
  `${studentName.trim() ? `${studentName.trim()}'s` : "Your child's"} consultation call with ${tutorName}`;

type Common = { tutorName: string; studentName: string; start: string; timeZone: string };
type Booked = Common & {
  to: Who;
  minutes: number;
  joinUrl: string;
  questionnaireUrl?: string | null;
  reportUrl?: string;
};

const links = (url: string) => `<a href="${url.replace(/"/g, "%22")}">${url.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</a>`;

const reportHtml = (url?: string) =>
  url ? `<p style="margin:14px 0 0;font-size:15.5px;line-height:1.65">Diagnostic report: ${links(url)}</p>` : undefined;

const footerFor = (to: Who, o: Common): string =>
  to === "tutor"
    ? "You're receiving this because a consultation call was booked with you on gradefarm."
    : `You're receiving this because a consultation call with ${o.tutorName} was booked using your email address on gradefarm. If you don't know them, you can ignore this email.`;

function detailsFor(o: Booked): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["When", formatCallTime(o.start, o.timeZone)],
    ["Length", `${o.minutes} minutes`],
  ];
  rows.unshift(o.to === "tutor" ? ["Student", o.studentName.trim() || "Not given"] : ["With", o.tutorName]);
  return rows;
}

export function consultationBookedEmail(o: Booked): Email {
  const when = formatCallTime(o.start, o.timeZone);
  if (o.to === "tutor") {
    const student = o.studentName.trim() || "a prospective student";
    return {
      subject: `Consultation call booked: ${student}, ${when}`,
      content: {
        heading: "A consultation call is booked",
        paragraphs: [`Your consultation call with ${student} is booked for ${when}.`],
        details: detailsFor(o),
        extraHtml: reportHtml(o.reportUrl),
        cta: { label: "Join the call", url: o.joinUrl },
        footer: footerFor("tutor", o),
      },
    };
  }
  const what = o.to === "parent" ? callWith(o.studentName, o.tutorName) : `Your consultation call with ${o.tutorName}`;
  const paragraphs = [
    `${what} is booked for ${when}. It runs for about ${o.minutes} minutes.`,
    "When it's time, use the button below to join. You can do it from a phone or a computer, and you don't need an account.",
  ];
  if (o.questionnaireUrl) {
    paragraphs.push(`If you have a few minutes beforehand, ${o.tutorName} would appreciate it if you filled in this short questionnaire: ${o.questionnaireUrl}`);
  }
  return {
    subject: `Your consultation call with ${o.tutorName}: ${when}`,
    content: {
      heading: o.to === "parent" ? "The consultation call is booked" : "Your consultation call is booked",
      paragraphs: [...(o.to === "parent" ? ["Hi,"] : []), ...paragraphs],
      details: detailsFor(o),
      cta: { label: "Join the call", url: o.joinUrl },
      footer: footerFor(o.to, o),
    },
  };
}

export function consultationChangedEmail(o: Booked & { previousStart: string }): Email {
  const when = formatCallTime(o.start, o.timeZone);
  const was = formatCallTime(o.previousStart, o.timeZone);
  const student = o.studentName.trim() || "a prospective student";
  const what =
    o.to === "tutor" ? `Your consultation call with ${student}` : o.to === "parent" ? callWith(o.studentName, o.tutorName) : `Your consultation call with ${o.tutorName}`;
  return {
    subject: o.to === "tutor" ? `Consultation call moved: ${student}, ${when}` : `Your consultation call with ${o.tutorName} has moved: ${when}`,
    content: {
      heading: "The consultation call has moved",
      paragraphs: [
        ...(o.to === "parent" ? ["Hi,"] : []),
        `${what} has moved to ${when}. It was ${was}.`,
        ...(o.to === "tutor" ? [] : ["The same button below still joins the call."]),
      ],
      details: detailsFor(o),
      extraHtml: o.to === "tutor" ? reportHtml(o.reportUrl) : undefined,
      cta: { label: "Join the call", url: o.joinUrl },
      footer: footerFor(o.to, o),
    },
  };
}

export function consultationCancelledEmail(o: Common & { to: Who }): Email {
  const when = formatCallTime(o.start, o.timeZone);
  const student = o.studentName.trim() || "a prospective student";
  const what =
    o.to === "tutor" ? `Your consultation call with ${student}` : o.to === "parent" ? callWith(o.studentName, o.tutorName) : `Your consultation call with ${o.tutorName}`;
  return {
    subject: o.to === "tutor" ? `Consultation call cancelled: ${student}, ${when}` : `Your consultation call with ${o.tutorName} is cancelled`,
    content: {
      heading: "The consultation call is cancelled",
      paragraphs: [
        ...(o.to === "parent" ? ["Hi,"] : []),
        `${what}, which was set for ${when}, has been cancelled.`,
        ...(o.to === "tutor" ? [] : [`If you'd still like to talk, just reply to this email and ${o.tutorName} will get back to you.`]),
      ],
      footer: footerFor(o.to, o),
    },
  };
}

/** "tomorrow", "in 1 hour", "in 3 hours", "in 2 days", else "in N minutes". */
function leadPhrase(lead: number): string {
  if (lead === 1440) return "tomorrow";
  const plural = (n: number, unit: string) => `in ${n} ${unit}${n === 1 ? "" : "s"}`;
  if (lead % 1440 === 0) return plural(lead / 1440, "day");
  if (lead % 60 === 0) return plural(lead / 60, "hour");
  return plural(lead, "minute");
}

export function consultationReminderEmail(
  o: Common & { to: Who; minutes: number; joinUrl: string; lead: number },
): Email {
  const when = formatCallTime(o.start, o.timeZone);
  const lead = leadPhrase(o.lead);
  const student = o.studentName.trim() || "a prospective student";
  const what =
    o.to === "tutor" ? `Your consultation call with ${student}` : o.to === "parent" ? callWith(o.studentName, o.tutorName) : `Your consultation call with ${o.tutorName}`;
  return {
    subject: o.to === "tutor" ? `Reminder: consultation call with ${student} ${lead}` : `Reminder: your consultation call with ${o.tutorName} is ${lead}`,
    content: {
      heading: "A consultation call is coming up",
      paragraphs: [...(o.to === "parent" ? ["Hi,"] : []), `${what} is ${lead}, at ${when}. It runs for about ${o.minutes} minutes.`],
      cta: { label: "Join the call", url: o.joinUrl },
      footer: footerFor(o.to, o),
    },
  };
}

/** Sent to a prospect who hasn't booked yet, with a link to pick a time. */
export function bookYourCallEmail(o: { tutorName: string; subject: string; bookUrl: string }): Email {
  return {
    subject: `Book your consultation call with ${o.tutorName}`,
    content: {
      heading: "Book your consultation call",
      paragraphs: [
        `${o.tutorName} would like to talk through your ${o.subject} diagnostic with you on a consultation call.`,
        "Pick a time that suits you. It only takes a minute.",
      ],
      cta: { label: "Choose a time", url: o.bookUrl },
      footer: `You're receiving this because ${o.tutorName} entered your email address on gradefarm. This is the only reminder we'll send. If you don't know them, you can ignore this email.`,
    },
  };
}
