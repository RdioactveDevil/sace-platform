/**
 * Emails about the pre-call questionnaire. The reminder goes to a prospect (and
 * their parent) who have no account and no tutor yet, so it names the sender
 * in full and never says "your tutor". The notice goes to the sender.
 */
import type { EmailContent } from "./email";
import { formatCallTime } from "./consultation-emails";

type Email = { subject: string; content: EmailContent };

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

export function questionnaireReminderEmail(o: {
  to: "guest" | "parent";
  tutorName: string;
  studentName: string;
  start: string;
  timeZone: string;
  url: string;
}): Email {
  const when = formatCallTime(o.start, o.timeZone);
  const student = o.studentName.trim();
  const parent = o.to === "parent";
  const call = parent
    ? `${student ? `${student}'s` : "Your child's"} consultation call with ${o.tutorName}`
    : `Your consultation call with ${o.tutorName}`;
  return {
    subject: parent
      ? `Before ${student ? `${student}'s` : "your child's"} call with ${o.tutorName}: a short questionnaire`
      : `Before your call with ${o.tutorName}: a short questionnaire`,
    content: {
      heading: "A short questionnaire before the call",
      paragraphs: [
        ...(parent ? ["Hi,"] : []),
        `${call} is on ${when}.`,
        parent
          ? `${o.tutorName} would like ${student || "your child"} to fill in a short questionnaire before then, so the call can be spent on what matters most. It takes a few minutes.`
          : `${o.tutorName} would like you to fill in a short questionnaire before then, so the call can be spent on what matters most. It takes a few minutes.`,
      ],
      cta: { label: "Fill in the questionnaire", url: o.url },
      footer: `You're receiving this because a consultation call with ${o.tutorName} was booked using your email address on gradefarm. This is the only reminder we'll send. If you don't know them, you can ignore this email.`,
    },
  };
}

export function questionnaireDoneEmail(o: {
  tutorName: string;
  studentName: string;
  flagged: Array<{ question: string; answer: string }>;
  reportUrl: string;
}): Email {
  const student = o.studentName.trim() || "Your prospect";
  return {
    subject: `${student} filled in the pre-call questionnaire`,
    content: {
      heading: `${student}'s answers are in`,
      paragraphs: [
        `Hi ${first(o.tutorName)}, ${student} has filled in the pre-call questionnaire.`,
        o.flagged.length
          ? `${o.flagged.length === 1 ? "One answer was" : `${o.flagged.length} answers were`} flagged:`
          : "No red flags: nothing they chose was flagged.",
      ],
      details: o.flagged.map((f) => [f.question, f.answer] as [string, string]),
      cta: { label: "See their answers", url: o.reportUrl },
      footer: "You're receiving this because you sent this diagnostic on gradefarm.",
    },
  };
}
