/**
 * Emails about a diagnostic a tutor sends to a prospective student before a
 * consultation call. The sender isn't the student's tutor yet, so nothing the
 * prospect receives says so: it names the sender in full. Prospects have no
 * account, so there's no unsubscribe link; they get the email, at most one
 * reminder, and nothing more unless the tutor resends it.
 */
import { appUrl, type EmailContent } from "./email";

type Email = { subject: string; content: EmailContent };

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * The test link in a prospect's email. Always the app's own address (never
 * taken from the request), so an email from us can't point anywhere else.
 */
export function prospectLink(token: string): string {
  return `${appUrl()}/diagnostic/${encodeURIComponent(token)}`;
}

/** How a prospect's emails name the sender: their display name, else the app. */
export function prospectSenderName(displayName: string | null | undefined): string {
  return displayName?.trim() || "gradefarm.";
}

/** Sent when the tutor creates (or resends) the diagnostic. */
export function prospectDiagnosticEmail(o: { senderName: string; subject: string; link: string }): Email {
  return {
    subject: `${o.senderName} has sent you a diagnostic test: ${o.subject}`,
    content: {
      heading: "Your diagnostic test",
      paragraphs: [
        `${o.senderName} has sent you a diagnostic test for ${o.subject}. It takes about 30–45 minutes, and the results will be gone through with you on your consultation call.`,
        "Do it on your own, in one sitting, and answer what you can: it's fine to be unsure. There's no time limit.",
      ],
      cta: { label: "Start the diagnostic", url: o.link },
      footer: `You're receiving this because ${o.senderName} entered your email address on gradefarm. If you don't know them, you can ignore this email.`,
    },
  };
}

/** The one reminder, if they haven't started a couple of days later. */
export function prospectReminderEmail(o: { senderName: string; subject: string; link: string }): Email {
  return {
    subject: `Reminder: your ${o.subject} diagnostic from ${o.senderName}`,
    content: {
      heading: "Your diagnostic is waiting",
      paragraphs: [
        `${o.senderName} sent you a diagnostic test for ${o.subject} a couple of days ago and it hasn't been started yet.`,
        "It takes about 30–45 minutes, and the results will be gone through with you on your consultation call.",
      ],
      cta: { label: "Start the diagnostic", url: o.link },
      footer: `You're receiving this because ${o.senderName} entered your email address on gradefarm. This is the only reminder we'll send. If you don't know them, you can ignore this email.`,
    },
  };
}

/** To the tutor who sent it, when the prospect finishes. */
export function prospectFinishedEmail(o: {
  tutorName: string;
  prospectName: string;
  subject: string;
  summary: { percentage: number; band: string; strong: string[]; work_on: string[] };
  link: string;
}): Email {
  const s = o.summary;
  return {
    subject: `${o.prospectName} finished their ${o.subject} diagnostic: ${s.percentage}%`,
    content: {
      heading: `${o.prospectName}'s diagnostic is in`,
      paragraphs: [`Hi ${first(o.tutorName)}, ${o.prospectName} has finished the ${o.subject} diagnostic you sent them.`],
      details: [
        ["Score", `${s.percentage}% (${s.band})`],
        ...(s.work_on.length ? ([["Work on", s.work_on.join(", ")]] as Array<[string, string]>) : []),
        ...(s.strong.length ? ([["Strong at", s.strong.join(", ")]] as Array<[string, string]>) : []),
      ],
      cta: { label: "See the full report", url: o.link },
      footer: "You're receiving this because you sent this diagnostic on gradefarm.",
    },
  };
}
