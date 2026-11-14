/**
 * Emails a tutor's actions send straight away: a session or weekly series
 * booked, an assignment set, a message, a resource shared (to students), and
 * an assignment finished (to the tutor). Each returns a subject and content
 * for the shared layout (renderEmail in email.ts), sent with sendEmail, which
 * also redirects a family child's mail to their parent.
 */
import type { EmailContent } from "./email";

const TIME_ZONE = "Australia/Adelaide";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Email = { subject: string; content: EmailContent };

const first = (name: string) => name.trim().split(/\s+/)[0] || name;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Tuesday 18 November, 4:30 pm ACDT" */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "long", day: "numeric", month: "long",
    hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE, timeZoneName: "short",
  });
}

/** "Tue 18 Nov" */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: TIME_ZONE }).replace(",", "");
}

/** A YYYY-MM-DD due date as "Friday 21 November". */
export function formatDue(ymd: string): string {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** "16:30" or "16:30:00" as "4:30 pm". */
export function formatClock(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "am" : "pm"}`;
}

// ── To students ─────────────────────────────────────────────────────────────

const SESSION_NOTE = "Sessions open in your browser, so there's nothing to install.";

export function sessionBookedEmail(o: {
  studentName: string;
  tutorName: string;
  title: string | null;
  scheduledAt: string;
  durationMinutes: number;
  isGroup: boolean;
  participantCount?: number;
  link: string;
}): Email {
  const label = o.title?.trim() || (o.isGroup ? "Group tutoring session" : "Tutoring session");
  const details: Array<[string, string]> = [
    ["When", formatWhen(o.scheduledAt)],
    ["Length", plural(o.durationMinutes, "minute")],
    ["Tutor", o.tutorName],
  ];
  if (o.title?.trim()) details.push(["Topic", o.title.trim()]);
  if (o.isGroup && o.participantCount) details.push(["Group", plural(o.participantCount, "student")]);
  return {
    subject: `${o.isGroup ? "Group session" : "Session"} booked: ${label}, ${shortDate(o.scheduledAt)}`,
    content: {
      heading: o.isGroup ? "You're in a group session" : "Your session is booked",
      paragraphs: [
        `Hi ${first(o.studentName)}, ${o.tutorName} has booked a ${o.isGroup ? "group session you're in" : "session with you"}. ${SESSION_NOTE}`,
      ],
      details,
      cta: { label: "Join session", url: o.link },
      footer: `You're receiving this because ${o.tutorName} booked a session with you on gradefarm.`,
    },
  };
}

export function seriesBookedEmail(o: {
  studentName: string;
  tutorName: string;
  title: string | null;
  recurrence: "weekly" | "fortnightly" | "monthly";
  dayOfWeek: number;
  timeOfDay: string;
  durationMinutes: number;
  isGroup: boolean;
  link: string;
}): Email {
  const label = o.title?.trim() || (o.isGroup ? "Group tutoring" : "Tutoring");
  const day = DAYS[o.dayOfWeek] ?? "";
  const when = { weekly: `Every ${day}`, fortnightly: `Every second ${day}`, monthly: `One ${day} a month` }[o.recurrence];
  const details: Array<[string, string]> = [
    ["When", `${when} at ${formatClock(o.timeOfDay)} (Adelaide time)`],
    ["Length", plural(o.durationMinutes, "minute")],
    ["Tutor", o.tutorName],
  ];
  if (o.title?.trim()) details.push(["Topic", o.title.trim()]);
  return {
    subject: `Regular ${o.isGroup ? "group " : ""}sessions booked: ${label}`,
    content: {
      heading: "Your regular sessions are booked",
      paragraphs: [
        `Hi ${first(o.studentName)}, ${o.tutorName} has set up regular ${o.isGroup ? "group " : ""}sessions with you.`,
        `Every session uses the same link, so bookmark it. ${SESSION_NOTE}`,
      ],
      details,
      cta: { label: "Open your session link", url: o.link },
      footer: `You're receiving this because ${o.tutorName} booked sessions with you on gradefarm.`,
    },
  };
}

export function assignmentSetEmail(o: {
  studentName: string;
  tutorName: string;
  type: string;
  subject: string;
  topics: string[];
  dueDate: string | null;
  /** "10 questions · Medium · 70% pass mark", when the tutor set a goal. */
  goal?: string;
  link: string;
}): Email {
  const kind = o.type.trim() || "assignment";
  const details: Array<[string, string]> = [
    ["Subject", o.subject],
    ["Topics", o.topics.join(", ") || o.subject],
    ...(o.goal ? ([["Goal", o.goal]] as Array<[string, string]>) : []),
    ["Due", o.dueDate ? formatDue(o.dueDate) : "No due date"],
  ];
  return {
    subject: `New ${kind.toLowerCase()} from ${o.tutorName}: ${o.subject}`,
    content: {
      heading: `New ${kind.toLowerCase()}: ${o.subject}`,
      paragraphs: [`Hi ${first(o.studentName)}, ${o.tutorName} has set you a ${kind.toLowerCase()}.`],
      details,
      cta: { label: "Start it now", url: o.link },
      footer: `You're receiving this because ${o.tutorName} set you work on gradefarm.`,
    },
  };
}

export function tutorMessageEmail(o: { studentName: string; tutorName: string; message: string; link: string }): Email {
  // Keep the tutor's paragraphs; join wrapped lines inside one.
  const paragraphs = o.message.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  return {
    subject: `A message from ${o.tutorName}`,
    content: {
      heading: `A message from ${o.tutorName}`,
      paragraphs: [`Hi ${first(o.studentName)},`, ...paragraphs],
      cta: { label: "Open gradefarm.", url: o.link },
      footer: `You're receiving this because ${o.tutorName}, your tutor, sent you a message on gradefarm. To reply, contact them directly.`,
    },
  };
}

const RESOURCE_WORDS: Record<string, string> = {
  notes: "notes", worksheet: "a worksheet", recording: "a recording", slides: "slides", link: "a link", resource: "a resource",
};

export function resourceSharedEmail(o: { tutorName: string; title: string; type: string; link: string }): Email {
  const what = RESOURCE_WORDS[o.type] ?? "a resource";
  return {
    subject: `${o.tutorName} shared ${what}: ${o.title}`,
    content: {
      heading: o.title,
      paragraphs: [`${o.tutorName} shared ${what} with you. You'll find it under Lessons in your Student Portal.`],
      cta: { label: "Open it", url: o.link },
      footer: `You're receiving this because ${o.tutorName}, your tutor, shared it with you on gradefarm.`,
    },
  };
}

// ── To tutors ───────────────────────────────────────────────────────────────

export function assignmentFinishedEmail(o: {
  tutorName: string;
  studentName: string;
  /** The tutor reading it set the assignment; otherwise `setterName` did. */
  ownAssignment: boolean;
  setterName: string;
  type: string;
  subject: string;
  topics: string[];
  score: { correct: number; total: number; pct: number | null };
  minAccuracy: number | null;
  passed: boolean | null;
  reportUrl: string;
}): Email {
  const kind = o.type.trim().toLowerCase() || "assignment";
  const outcome = o.passed == null ? "finished" : o.passed ? "passed" : "didn't pass";
  const details: Array<[string, string]> = [
    ["Subject", o.subject],
    ["Topics", o.topics.join(", ") || o.subject],
    ["Score", o.score.pct != null ? `${o.score.correct}/${o.score.total} (${o.score.pct}%)` : "No answers marked"],
    ["Pass mark", o.minAccuracy != null ? `${o.minAccuracy}%` : "None"],
  ];
  if (o.passed != null) details.push(["Result", o.passed ? "Passed" : "Not passed"]);
  return {
    subject: `${o.studentName} ${outcome} their ${kind}: ${o.subject}`,
    content: {
      heading: `${o.studentName} ${outcome} their ${kind}`,
      paragraphs: [
        `Hi ${first(o.tutorName)}, ${o.studentName} has finished the ${kind} ${o.ownAssignment ? "you set" : `${o.setterName} set`}. The report shows every question they missed.`,
      ],
      details,
      cta: { label: "View the report", url: o.reportUrl },
      footer: o.ownAssignment
        ? "You're receiving this because you set this assignment on gradefarm."
        : `You're receiving this because ${o.studentName} is one of your students on gradefarm.`,
    },
  };
}
