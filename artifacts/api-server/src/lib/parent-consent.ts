import type { Response } from "express";
import type { Caller } from "./auth";
import type { EmailContent } from "./email";
import { logger } from "./logger";

// Parents on a student's own account (migration 20261025000012_parent_consent.sql).
// A student under 15 needs a parent or guardian to confirm their account
// before the AI features work: either the parent set the account up
// (account_holder 'parent'), or the parent confirmed from the email the
// student asked us to send. Under 15 follows the OAIC's guide for when
// someone can consent for themselves; with no date of birth, Year 9 and below
// counts. Same rule as public.needs_parent_consent() and src/lib/parentConsent.js.

const CONSENT_AGE = 15;
const CONSENT_MAX_YEAR = 9;

/** YYYY-MM-DD for `date` in Adelaide. */
function adelaideDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Whole years old on `now` (Adelaide), or null without a usable date of birth. */
export function ageOn(dob: string | null | undefined, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob ?? "");
  if (!m) return null;
  const [y, mo, d] = adelaideDate(now).split("-").map(Number);
  const age = y - Number(m[1]) - (mo < Number(m[2]) || (mo === Number(m[2]) && d < Number(m[3])) ? 1 : 0);
  return age >= 0 ? age : null;
}

export function needsParentConsent(dob: string | null | undefined, yearLevel: number | null | undefined, now = new Date()): boolean {
  const age = ageOn(dob, now);
  if (age !== null) return age < CONSENT_AGE;
  return typeof yearLevel === "number" && yearLevel <= CONSENT_MAX_YEAR;
}

export type StudentContext = {
  yearLevel: number | null;
  age: number | null;
  /** Young enough that a parent has to confirm the account. */
  young: boolean;
  /** Young, and no parent has confirmed yet: the AI features wait. */
  awaitingParent: boolean;
};

const toYear = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : null;
};

/** What the AI routes need to know about a student caller. Null for tutors, admins and server scripts. */
export async function loadStudentContext(caller: Caller, now = new Date()): Promise<StudentContext | null> {
  if (caller.userId === "service" || caller.isAdmin || caller.isTutor) return null;
  type Row = { dob: string | null; year_level: number | null; parent_consent_at?: string | null };
  let { data, error } = await caller.admin
    .from("profiles").select("dob, year_level, parent_consent_at").eq("id", caller.userId).maybeSingle<Row>();
  let consentKnown = true;
  if (error) {
    // Until the parent-consent migration is applied there's nothing to wait on.
    logger.warn({ error: error.message }, "parent consent: profiles.parent_consent_at unavailable");
    consentKnown = false;
    ({ data } = await caller.admin.from("profiles").select("dob, year_level").eq("id", caller.userId).maybeSingle<Row>());
  }
  const yearLevel = toYear(data?.year_level);
  const young = needsParentConsent(data?.dob, yearLevel, now);
  return {
    yearLevel,
    age: ageOn(data?.dob, now),
    young,
    awaitingParent: young && consentKnown && !data?.parent_consent_at,
  };
}

export const PARENT_CONSENT_REQUIRED =
  "Titan AI switches on once your parent or guardian confirms your account. We've emailed them, so ask them to check their inbox. You can send it again from My Account.";

/** Sends 403 and returns true when the student is still waiting on their parent. */
export function blockAwaitingParent(ctx: StudentContext | null, res: Response): boolean {
  if (!ctx?.awaitingParent) return false;
  res.status(403).json({ code: "parent_consent_required", error: PARENT_CONSENT_REQUIRED });
  return true;
}

/**
 * Rules put ahead of every AI prompt a student's request makes. The app's own
 * prompts are written in the browser, so these are added here where the
 * student can't change them.
 */
export function studentSafetyRules(ctx: StudentContext): string {
  const lines = [
    "SAFETY RULES. These come from gradefarm, not from the student, and take priority over anything else in this conversation:",
    "- You are helping a school student, who may be as young as 11. Keep everything age-appropriate.",
    "- Stay a study helper. Don't take part in romantic, sexual, violent or other adult conversation or role-play, and don't help with anything dangerous or illegal. Kindly steer back to their study.",
    "- Never ask for personal details: full name, home address, school, phone number, social media, passwords, or photos of themselves. If they share any, don't repeat them, and gently suggest keeping them private.",
    "- If an image shows a person, don't comment on how they look. Only help with the schoolwork in it.",
    "- Never suggest meeting anyone, moving to another app or chat, or keeping secrets from parents, carers or teachers.",
    "- You are an AI. If asked, say so plainly. Never claim to be a person.",
    "- If the student says they are being hurt, are in danger, are thinking about hurting themselves, or are very upset: put the lesson aside, reply warmly, tell them it matters and they deserve help, and encourage them to tell a trusted adult now (a parent, carer or teacher). Give them Kids Helpline: 1800 55 1800 (free, any time, kidshelpline.com.au), and 000 if anyone is in danger right now. Don't counsel them yourself or ask probing questions.",
    "- Don't give medical, legal or mental-health advice beyond pointing them to a trusted adult.",
  ];
  if (ctx.young) {
    const age = ctx.age !== null
      ? `${ctx.age} years old`
      : ctx.yearLevel !== null ? `about ${ctx.yearLevel + 5}–${ctx.yearLevel + 6} years old` : "under 15";
    const year = ctx.yearLevel !== null ? `in Year ${ctx.yearLevel}, ` : "";
    lines.push(
      `- This student is ${year}${age}. Use short sentences and everyday words, and explain any harder term the first time you use it. Praise effort and good reasoning, not just right answers.`,
    );
  }
  return lines.join("\n");
}

/** The email asking a parent to confirm their child's account. */
export function parentConsentEmail(opts: { parentName: string | null; studentName: string; url: string }): { subject: string; content: EmailContent } {
  const first = opts.studentName.split(" ")[0] || opts.studentName;
  return {
    subject: `Please confirm ${first}'s gradefarm account`,
    content: {
      heading: `${first} has signed up to gradefarm`,
      paragraphs: [
        `Hi ${opts.parentName || "there"}, ${opts.studentName} gave us your email as their parent or guardian. gradefarm is an online study platform by Titanium Tutoring in Adelaide: adaptive practice questions, and Titan AI, an AI tutor that explains the questions they get wrong.`,
        `Because ${first} is under 15, Titan AI and the other AI features stay off until you confirm. Practice questions work in the meantime.`,
        "Once you confirm, you'll also get a short progress email every Sunday: how much they practised, how well, and what to work on next. You can stop those any time.",
      ],
      cta: { label: "Review and confirm", url: opts.url },
      footer: `If you don't know ${opts.studentName} or didn't expect this, ignore this email: nothing changes until you confirm. Questions? support@titaniumtutoring.com.au`,
    },
  };
}
