/**
 * The welcome email, sent once by the automated email job (automated-emails.ts)
 * after a new account confirms its email. It has its own layout, richer than
 * the shared one in email.ts, and is built here as table-based HTML with
 * inline styles so it holds together in Gmail, Outlook and Apple Mail.
 *
 *   • studentWelcomeEmail – "How it works": why we forget, how a question
 *     turns gold, what the account includes, a Titan example picked for the
 *     student's subject, and a note from the founder. Worded for a parent
 *     when a parent will read it (a parent-held account, or a child added to
 *     a family, whose mail goes to the parent).
 *   • tutorWelcomeEmail – where the application is up to, what the Tutor
 *     portal does, and the tutor plans.
 *
 * The free allowance and the tutor plans come from platform_settings.pricing,
 * so the email always matches the pricing page. Images (wordmark, icons) are
 * served from the web app's public/email folder.
 */
import { appUrl, escapeHtml, type PrebuiltEmail } from "./email";
import type { TutorPlanOption } from "./tutor-plan";

const FONT = "'Plus Jakarta Sans',Arial,Helvetica,sans-serif";
const NAVY = "#0c1037";
const GOLD = "#f1be43";
const GOLD_TEXT = "#a16207";
const BODY = "#475069";
const MUTED = "#5a6178";
const LINE = "#e2e6f0";
const CARD = "#f6f7fb";
const PAGE = "#eef0f6";

/** Who signs the student email. */
const SIGN_OFF = { name: "Adhyayan", role: "Founder, gradefarm." };
const SUPPORT_EMAIL = "support@titaniumtutoring.com.au";

const img = (file: string) => `${appUrl()}/email/${file}`;
const url = (path: string) => `${appUrl()}${path}`;

// ── Pricing ─────────────────────────────────────────────────────────────────

export const DEFAULT_FREE_DAILY_QUESTIONS = 20;
export const DEFAULT_FREE_DAILY_TITAN = 10;

const wholeOr = (n: unknown, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;

/** The free plan's daily allowance, from platform_settings.pricing (same defaults as the pricing page). */
export function freeAllowance(pricing: Record<string, unknown> | null | undefined): { questions: number; titan: number } {
  return {
    questions: wholeOr(pricing?.free_daily_questions, DEFAULT_FREE_DAILY_QUESTIONS),
    titan: wholeOr(pricing?.free_daily_ai_messages, DEFAULT_FREE_DAILY_TITAN),
  };
}

/** "Free: one subject, 20 questions and 10 Titan messages a day." */
export function freePlanLine(free: { questions: number; titan: number }): string {
  const daily = [
    free.questions > 0 ? `${free.questions} questions` : null,
    free.titan > 0 ? `${free.titan} Titan messages` : null,
  ].filter(Boolean);
  return daily.length ? `Free: one subject, ${daily.join(" and ")} a day.` : "Free: one subject.";
}

// ── Names ───────────────────────────────────────────────────────────────────

/** First name from a display name, or null for blanks and the sign-up defaults. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || /^(student|there|tutor)$/i.test(first)) return null;
  return first.slice(0, 40);
}

// ── Titan example ───────────────────────────────────────────────────────────

export type TitanExample = {
  key: "methods" | "chemistry" | "english" | "maths6";
  style: string;
  question: string;
  /** The reply, before its last (bold) part. */
  answer: string;
  bold: string;
};

const EXAMPLES: Record<TitanExample["key"], TitanExample> = {
  methods: {
    key: "methods",
    style: "sport",
    question: "Why is it 6 and not 3?",
    answer: "Think relay. The outside function runs its leg, 3(2x − 5)², then hands the baton to the inside one, which runs 2. You multiply the legs: ",
    bold: "6(2x − 5)².",
  },
  chemistry: {
    key: "chemistry",
    style: "gaming",
    question: "Why doesn't a catalyst give me more product?",
    answer: "Think of a shortcut on the map. You reach the finish sooner, but the finish line hasn't moved. A catalyst speeds up the forward and reverse reactions equally, so equilibrium arrives faster, ",
    bold: "but the yield stays the same.",
  },
  english: {
    key: "english",
    style: "gaming",
    question: "When do I use its and it's?",
    answer: "Think of it's as a combo move: it + is, joined by the apostrophe. If \"it is\" fits, use it's. If it doesn't, use its: ",
    bold: "\"The team lost its last game.\"",
  },
  maths6: {
    key: "maths6",
    style: "sport",
    question: "Why is 3/4 bigger than 2/3?",
    answer: "Cut a footy oval into 4 slices and take 3, or into 3 slices and take 2. Line them up as twelfths and it's 9/12 against 8/12, so ",
    bold: "3/4 covers more of the oval.",
  },
};

/**
 * A Titan reply from the student's subject, so a Year 6 English student
 * doesn't get calculus. Falls back on year level when no subject is picked yet.
 */
export function titanExample(subjects: string[], yearLevel: number | null | undefined): TitanExample {
  for (const s of subjects) {
    if (/chem/i.test(s)) return EXAMPLES.chemistry;
    if (/english|literacy|reading|writing/i.test(s)) return EXAMPLES.english;
    if (/\byear\s*[3-8]\b/i.test(s) && /math|numeracy/i.test(s)) return EXAMPLES.maths6;
    if (/math|method/i.test(s)) return EXAMPLES.methods;
  }
  return typeof yearLevel === "number" && yearLevel <= 8 ? EXAMPLES.maths6 : EXAMPLES.methods;
}

// ── Building blocks ─────────────────────────────────────────────────────────

const esc = escapeHtml;

/** Hidden inbox preview text, padded so the client doesn't pull body text in after it. */
const preheader = (text: string) =>
  `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE}">${esc(text)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>`;

function page(opts: { title: string; preheader: string; body: string; footer: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(opts.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&amp;display=swap" rel="stylesheet">
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%}
  img{border:0;outline:none;text-decoration:none}
  a{color:${GOLD_TEXT}}
  @media (max-width:620px){
    .gf-pad{padding-left:24px!important;padding-right:24px!important}
    .gf-card{padding:18px 14px!important}
    .gf-h1{font-size:28px!important}
    .gf-sq{width:40px!important;height:40px!important}
    .gf-col{display:block!important;width:100%!important;padding:0 0 10px!important}
    .gf-line{padding:0 4px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE}">
${preheader(opts.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;border-collapse:separate;font-family:${FONT};color:${NAVY}">
${opts.body}
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
<tr><td style="padding:16px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED}">${opts.footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** A gold button that still looks like one where padding on links is ignored. */
function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="border-radius:10px;background:${GOLD}"><a href="${esc(href)}" style="display:inline-block;padding:15px 28px;font-family:${FONT};font-size:15px;font-weight:800;line-height:1;color:${NAVY};text-decoration:none;border-radius:10px">${esc(label)}</a></td>
</tr></table>`;
}

const label = (text: string) =>
  `<div style="font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:1.4px;color:${GOLD_TEXT}">${esc(text)}</div>`;

/** An icon beside a heading and a line or two of text. */
function featureRow(icon: string, title: string, text: string, gap = 22): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:${gap}px"><tr>
<td width="56" valign="top" style="width:56px"><img src="${img(icon)}" width="40" height="40" alt="" style="display:block;width:40px;height:40px"></td>
<td valign="top" style="font-family:${FONT}">
<div style="font-size:16px;font-weight:800;line-height:1.35;color:${NAVY}">${esc(title)}</div>
<div style="padding-top:4px;font-size:14.5px;line-height:1.55;color:${BODY}">${esc(text)}</div>
</td></tr></table>`;
}

/** One square of the "turns gold" row. */
function square(kind: "miss" | "back" | "gold", top: string, under: string): string {
  const fill = kind === "gold" ? "#e0a91f" : kind === "back" ? "#f7dc93" : "#ffffff";
  const ring = kind === "miss" ? `border:2px solid ${NAVY};` : "";
  const dot = kind === "miss"
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td width="10" height="10" style="width:10px;height:10px;background:${NAVY};border-radius:5px;font-size:0;line-height:0">&nbsp;</td></tr></table>`
    : "&nbsp;";
  return `<td width="20%" align="center" valign="top" style="width:20%;font-family:${FONT}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
<td class="gf-sq" width="48" height="48" align="center" valign="middle" style="width:48px;height:48px;background:${fill};${ring}border-radius:10px;font-size:0;line-height:0;box-sizing:border-box">${dot}</td>
</tr></table>
<div style="padding-top:8px;font-size:13px;font-weight:800;color:${NAVY}">${esc(top)}</div>
<div style="font-size:12px;color:${MUTED}">${esc(under)}</div>
</td>`;
}

// ── Student (or their parent) ───────────────────────────────────────────────

export type StudentWelcome = {
  /** The student's display name. */
  name: string | null;
  /** Who reads it: the student, or a parent (parent-held account or family child). */
  reader: "student" | "parent";
  /** The parent's name, when a parent reads it and we have one. */
  parentName?: string | null;
  /** Subject names the student has (user_subscriptions.subject_name), if any yet. */
  subjects: string[];
  yearLevel: number | null;
  /** Has a paid, tutor-included or beta subject: skip the free-plan line. */
  hasPlan: boolean;
  /** Under 15 and waiting on a parent to confirm the account, so Titan is locked. */
  awaitingParent: boolean;
  free: { questions: number; titan: number };
  unsubscribeUrl: string;
};

export function studentWelcomeEmail(w: StudentWelcome): { subject: string; content: PrebuiltEmail } {
  const name = firstNameOf(w.name);
  const parent = w.reader === "parent";
  const child = name ?? "your child";
  const Child = name ?? "Your child";
  const example = titanExample(w.subjects, w.yearLevel);
  const freeLine = w.hasPlan ? null : freePlanLine(w.free);

  const subject = parent
    ? `${name ? `${name}'s` : "Your child's"} gradefarm. account is ready`
    : name ? `Welcome to gradefarm., ${name}` : "Welcome to gradefarm.";
  const preview = parent
    ? "Why students forget most of what they study, and what we do about it."
    : "Why you forget most of what you study, and what we do about it.";
  const greeting = parent ? `Hi${firstNameOf(w.parentName) ? ` ${firstNameOf(w.parentName)}` : ""},` : `Hi ${name ?? "there"},`;
  const heading = parent
    ? `${Child} will forget most of what they study this week.`
    : "You'll forget most of what you study this week.";
  const intro = parent
    ? "That's not them. It's how memory works, and psychologists have studied it since the 1880s. What makes something stick is recalling it again, right as it starts to fade. That's what gradefarm. is built around."
    : "That's not you. It's how memory works, and psychologists have studied it since the 1880s. What makes something stick is pulling it out of your head again, right as you start to forget it. That's what gradefarm. is built around.";
  const caption = parent
    ? "Each time they get it right, the gap gets longer. Right every time, and it turns gold."
    : "Each time you get it right, the gap gets longer. Right every time, and it turns gold.";
  const featuresTitle = parent ? `What ${child} gets` : "What you just signed up for";
  const features: Array<[string, string, string]> = parent
    ? [
        ["icon-practice.png", "Questions on what they're doing this term", "They tick their topics, then practise new questions, the ones they got wrong, or a mix. Every question is mapped to their course and shows the full working."],
        ["icon-review.png", "Wrong answers come back", "An hour after a miss, then a few days later, then weeks later, until they get it right every time. When a topic runs out, new questions are written for it."],
        ["icon-titan.png", "Titan, when they're stuck", "Our AI tutor explains any question as many times as they need, plainly or with sport, gaming or music."],
      ]
    : [
        ["icon-practice.png", "Questions on what you're doing this term", "Tick your topics, then practise new questions, the ones you got wrong, or a mix. Every question is mapped to your course and shows the full working."],
        ["icon-review.png", "Wrong answers come back", "An hour after a miss, then a few days later, then weeks later, until you get it right every time. When a topic runs out, new questions are written for it."],
        ["icon-titan.png", "Titan, when you're stuck", `Our AI tutor explains any question as many times as you need, plainly or with sport, gaming or music.${w.awaitingParent ? " Titan switches on once a parent or guardian confirms your account." : ""}`],
      ];
  const cta = parent ? "Open gradefarm." : "Answer your first question";
  const closing = parent ? `Here's to a good term for ${child},` : "Good luck this term,";
  const why = parent
    ? `You're receiving this because you set up a gradefarm. account for ${child}.`
    : "You're receiving this because you created a gradefarm. account.";

  const body = `
<tr><td class="gf-pad" style="padding:28px 40px 0"><img src="${img("wordmark-light.png")}" width="144" height="24" alt="gradefarm." style="display:block;width:144px;height:24px"></td></tr>

<tr><td class="gf-pad" style="padding:32px 40px 28px;font-family:${FONT}">
<div style="font-size:15px;font-weight:700;color:${BODY}">${esc(greeting)}</div>
<h1 class="gf-h1" style="margin:16px 0 0;font-family:${FONT};font-size:34px;font-weight:800;line-height:1.12;letter-spacing:-0.8px;color:${NAVY}">${esc(heading)}</h1>
<p style="margin:16px 0 0;font-size:16px;line-height:1.65;color:${BODY}">${esc(intro)}</p>
</td></tr>

<tr><td class="gf-pad" style="padding:0 40px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CARD};border:1px solid ${LINE};border-radius:14px;border-collapse:separate">
<tr><td class="gf-card" style="padding:24px;font-family:${FONT}">
${label("HOW ONE QUESTION TURNS GOLD")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px"><tr>
${square("miss", "Miss", "today")}${square("back", "1 hour", "later")}${square("back", "4 days", "later")}${square("back", "3 weeks", "later")}${square("gold", "Gold", "in the bag")}
</tr></table>
<p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:${BODY}">${esc(caption)}</p>
</td></tr></table>
</td></tr>

<tr><td class="gf-pad" style="padding:0 40px 32px;font-family:${FONT}">
<div style="font-size:20px;font-weight:800;letter-spacing:-0.2px;color:${NAVY}">${esc(featuresTitle)}</div>
${features.map(([icon, title, text]) => featureRow(icon, title, text)).join("\n")}
</td></tr>

<tr><td class="gf-pad" style="padding:0 40px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:14px;border-collapse:separate">
<tr><td style="padding:11px 16px;background:${CARD};border-bottom:1px solid ${LINE};border-radius:14px 14px 0 0;font-family:${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="32" style="width:32px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="22" height="22" align="center" valign="middle" style="width:22px;height:22px;background:${NAVY};border-radius:6px;font-size:0;line-height:0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td width="8" height="8" style="width:8px;height:8px;background:${GOLD};border-radius:2px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr></table></td>
<td style="font-size:13px;font-weight:800;color:${NAVY}">Titan</td>
<td align="right"><span style="display:inline-block;font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:999px;background:#fdf6e1;color:${GOLD_TEXT};border:1px solid #f0dfae">Explained with ${esc(example.style)}</span></td>
</tr></table>
</td></tr>
<tr><td style="padding:16px;font-family:${FONT}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr><td style="background:${PAGE};border-radius:12px 12px 4px 12px;padding:9px 13px;font-size:14px;color:${NAVY}">${esc(example.question)}</td></tr></table>
<div style="clear:both;height:12px;line-height:12px;font-size:0">&nbsp;</div>
<p style="margin:0;font-size:14px;line-height:1.6;color:#1e2a5e">${esc(example.answer)}<b>${esc(example.bold)}</b></p>
</td></tr>
</table>
</td></tr>

<tr><td class="gf-pad" style="padding:0 40px 36px;font-family:${FONT}">
${button(cta, url("/home"))}
${freeLine ? `<div style="padding-top:12px;font-size:13.5px;line-height:1.5;color:${MUTED}">${esc(freeLine)} <a href="${esc(url("/pricing"))}" style="color:${GOLD_TEXT};font-weight:700">See plans</a></div>` : ""}
</td></tr>

<tr><td class="gf-pad" style="padding:28px 40px 34px;border-top:1px solid ${LINE};font-family:${FONT}">
<div style="font-size:15px;line-height:1.6;color:${BODY}">${esc(closing)}</div>
<div style="font-size:15px;font-weight:800;color:${NAVY}">${esc(SIGN_OFF.name)}</div>
<div style="font-size:13px;color:${MUTED}">${esc(SIGN_OFF.role)}</div>
</td></tr>`;

  const html = page({ title: subject, preheader: preview, body, footer: footer(why, w.unsubscribeUrl) });

  const text = [
    greeting,
    "",
    heading,
    "",
    intro,
    "",
    "HOW ONE QUESTION TURNS GOLD",
    "Miss today → 1 hour later → 4 days later → 3 weeks later → Gold, in the bag.",
    caption,
    "",
    featuresTitle.toUpperCase(),
    ...features.flatMap(([, title, t]) => [`• ${title}: ${t}`]),
    "",
    `Titan, explained with ${example.style}:`,
    `"${example.question}"`,
    `${example.answer}${example.bold}`,
    "",
    `${cta}: ${url("/home")}`,
    ...(freeLine ? [`${freeLine} See plans: ${url("/pricing")}`] : []),
    "",
    closing,
    SIGN_OFF.name,
    SIGN_OFF.role,
    "",
    "---",
    footerText(why, w.unsubscribeUrl),
  ].join("\n");

  return { subject, content: { html, text, unsubscribe: w.unsubscribeUrl } };
}

// ── Tutor ───────────────────────────────────────────────────────────────────

export type TutorWelcome = {
  name: string | null;
  /** Application approved (or made a tutor directly). Otherwise it's in review. */
  approved: boolean;
  /** Approved and has a live plan (or is exempt): the portal is already open. */
  portalOpen: boolean;
  plans: TutorPlanOption[];
  annualDiscount: number;
  unsubscribeUrl: string;
};

/** "10 students, 3 subjects, recordings, parent reports" */
export function planSummary(p: TutorPlanOption): string {
  return [
    p.students === null ? "Unlimited students" : `${p.students} student${p.students === 1 ? "" : "s"}`,
    p.subjects === null ? "every subject" : `${p.subjects} subject${p.subjects === 1 ? "" : "s"}`,
    ...(p.recordings ? ["recordings"] : []),
    ...(p.parentReports ? ["parent reports"] : []),
  ].join(", ");
}

const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function statusStep(state: "done" | "current" | "todo", text: string): string {
  const box = "width:24px;min-width:24px;height:24px;border-radius:12px;box-sizing:border-box;font-size:0;line-height:0";
  const inner = state === "done"
    ? `<td width="24" height="24" align="center" valign="middle" style="${box};background:${GOLD};font-family:${FONT};font-size:13px;font-weight:800;line-height:24px;color:${NAVY}">&#10003;</td>`
    : state === "current"
      ? `<td width="24" height="24" align="center" valign="middle" style="${box};border:2px solid ${GOLD}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td width="8" height="8" style="width:8px;height:8px;background:${GOLD};border-radius:4px;font-size:0;line-height:0">&nbsp;</td></tr></table></td>`
      : `<td width="24" height="24" style="${box};border:2px solid #5d6185">&nbsp;</td>`;
  const colour = state === "todo" ? "#b8bbd0" : "#ffffff";
  return `<td width="1" valign="middle" style="white-space:nowrap"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="24" style="width:24px;min-width:24px"><table role="presentation" width="24" cellpadding="0" cellspacing="0" border="0" style="width:24px"><tr>${inner}</tr></table></td>
<td style="padding-left:8px;font-family:${FONT};font-size:13.5px;font-weight:700;color:${colour};white-space:nowrap">${esc(text)}</td>
</tr></table></td>`;
}

const statusLine = (lit: boolean) =>
  `<td class="gf-line" valign="middle" style="padding:0 10px"><div style="height:2px;line-height:2px;font-size:0;background:${lit ? GOLD : "#3a3f6b"}">&nbsp;</div></td>`;

export function tutorWelcomeEmail(w: TutorWelcome): { subject: string; content: PrebuiltEmail } {
  const name = firstNameOf(w.name);
  const subject = "Welcome to gradefarm. for tutors";
  const preview = w.portalOpen
    ? "Your Tutor portal is ready. Here's what it does."
    : w.approved
      ? "Your tutor account is approved. Here's what the Tutor portal does."
      : "We're reviewing your application. Here's what the Tutor portal does.";
  const heading = w.approved
    ? (name ? `Welcome to gradefarm., ${name}.` : "Welcome to gradefarm.")
    : (name ? `Thanks for applying, ${name}.` : "Thanks for applying.");
  const intro = w.portalOpen
    ? "Your tutor account is set up and your Tutor portal is ready. Add your first students whenever you like."
    : w.approved
      ? "Your tutor account is approved. Pick a plan and your Tutor portal opens straight away."
      : "We're reviewing your application now. Once it's approved, pick a plan and your Tutor portal opens.";
  const steps: Array<["done" | "current" | "todo", string]> = w.portalOpen
    ? [["done", "Applied"], ["done", "Approved"], ["done", "Portal open"]]
    : w.approved
      ? [["done", "Applied"], ["done", "Approved"], ["current", "Pick a plan"]]
      : [["done", "Applied"], ["current", "In review"], ["todo", "Portal open"]];
  const features: Array<[string, string, string]> = [
    ["icon-roster.png", "Your roster", "Add students and classes, or invite them by email."],
    ["icon-assignments.png", "Assignments", "Set quizzes and homework with due dates, one-off or recurring."],
    ["icon-sessions.png", "Video sessions", "Book one-off or weekly sessions. Students get reminders a day and an hour before."],
    ["icon-progress.png", "Progress and diagnostics", "Each student's accuracy and weak topics, and an email when they finish a diagnostic."],
    ["icon-parents.png", "Parent reports", "Each student's week, emailed to their parent on Sunday evening."],
  ];
  const plans = w.plans.slice(0, 3);
  const annualPct = Math.round(w.annualDiscount * 100);
  const why = "You're receiving this because you created a gradefarm. tutor account.";

  const planCells = plans.map((p, i) => {
    const pick = p.name.toLowerCase() === "pro";
    const pad = `0 ${i === plans.length - 1 ? 0 : 5}px 0 ${i === 0 ? 0 : 5}px`;
    return `<td class="gf-col" width="${Math.floor(100 / plans.length)}%" valign="top" style="padding:${pad}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:${pick ? `2px solid ${GOLD}` : `1px solid ${LINE}`};background:${pick ? "#fdf6e1" : "#ffffff"};border-radius:12px;border-collapse:separate">
<tr><td style="padding:${pick ? 15 : 16}px;font-family:${FONT}">
<div style="font-size:13px;font-weight:700;color:${pick ? GOLD_TEXT : MUTED}">${esc(p.name)}</div>
<div style="padding-top:4px;font-size:24px;font-weight:800;letter-spacing:-0.4px;color:${NAVY}">$${esc(money(p.monthly))}<span style="font-size:13px;font-weight:600;color:${MUTED}"> /mo</span></div>
<div style="padding-top:4px;font-size:13px;line-height:1.5;color:${BODY}">${esc(planSummary(p))}</div>
</td></tr></table>
</td>`;
  }).join("");

  const body = `
<tr><td class="gf-pad" style="padding:26px 40px 40px;background:${NAVY};border-radius:13px 13px 0 0;font-family:${FONT}">
<img src="${img("wordmark-dark.png")}" width="144" height="24" alt="gradefarm." style="display:block;width:144px;height:24px">
<div style="padding-top:26px;font-size:12px;font-weight:800;letter-spacing:1.4px;color:${GOLD}">TUTOR ACCOUNT</div>
<h1 class="gf-h1" style="margin:14px 0 0;font-family:${FONT};font-size:34px;font-weight:800;line-height:1.12;letter-spacing:-0.8px;color:#ffffff">${esc(heading)}</h1>
<p style="margin:14px 0 0;font-size:16px;line-height:1.6;color:#cdd0e0">${esc(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px"><tr>
${statusStep(...steps[0])}${statusLine(steps[1][0] !== "todo")}${statusStep(...steps[1])}${statusLine(steps[2][0] !== "todo")}${statusStep(...steps[2])}
</tr></table>
</td></tr>

<tr><td class="gf-pad" style="padding:36px 40px;font-family:${FONT}">
${label(w.portalOpen ? "WHAT YOU CAN DO" : "WHAT YOU'LL BE ABLE TO DO")}
${features.map(([icon, title, text]) => featureRow(icon, title, text, 20)).join("\n")}
</td></tr>

<tr><td class="gf-pad" style="padding:0 40px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${NAVY};border-radius:12px;border-collapse:separate">
<tr><td style="padding:20px 24px;font-family:${FONT}">
<div style="font-size:16px;font-weight:800;color:${GOLD}">Your students practise free</div>
<div style="padding-top:6px;font-size:14px;line-height:1.6;color:#d4d6e4">Students on your roster get the subjects you teach at no cost to them.</div>
</td></tr></table>
</td></tr>

${plans.length && !w.portalOpen ? `<tr><td class="gf-pad" style="padding:0 40px 36px;font-family:${FONT}">
${label("TUTOR PLANS")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px"><tr>${planCells}</tr></table>
${annualPct > 0 ? `<div style="padding-top:12px;font-size:13px;color:${MUTED}">Pay yearly and save ${annualPct}%.</div>` : ""}
</td></tr>` : ""}

<tr><td class="gf-pad" style="padding:30px 40px 34px;background:${CARD};border-top:1px solid ${LINE};border-radius:0 0 13px 13px;font-family:${FONT}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td>${button("Open gradefarm.", url("/tutor"))}</td>
${w.portalOpen ? "" : `<td style="padding-left:18px"><a href="${esc(url("/pricing"))}" style="font-family:${FONT};font-size:14px;font-weight:700;color:${GOLD_TEXT}">Compare tutor plans</a></td>`}
</tr></table>
</td></tr>`;

  const html = page({ title: subject, preheader: preview, body, footer: footer(why, w.unsubscribeUrl) });

  const text = [
    heading,
    "",
    intro,
    "",
    steps.map(([s, t]) => `${s === "done" ? "✓" : s === "current" ? "→" : "○"} ${t}`).join("   "),
    "",
    w.portalOpen ? "WHAT YOU CAN DO" : "WHAT YOU'LL BE ABLE TO DO",
    ...features.map(([, title, t]) => `• ${title}: ${t}`),
    "",
    "Your students practise free: students on your roster get the subjects you teach at no cost to them.",
    ...(plans.length && !w.portalOpen
      ? ["", "TUTOR PLANS", ...plans.map((p) => `• ${p.name}: $${money(p.monthly)} a month. ${planSummary(p)}`), ...(annualPct > 0 ? [`Pay yearly and save ${annualPct}%.`] : [])]
      : []),
    "",
    `Open gradefarm.: ${url("/tutor")}`,
    ...(w.portalOpen ? [] : [`Compare tutor plans: ${url("/pricing")}`]),
    "",
    "---",
    footerText(why, w.unsubscribeUrl),
  ].join("\n");

  return { subject, content: { html, text, unsubscribe: w.unsubscribeUrl } };
}

// ── Footer ──────────────────────────────────────────────────────────────────

function footer(why: string, unsubscribe: string): string {
  return `${esc(why)} gradefarm. is run by Titanium Tutoring, Adelaide, SA. Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${MUTED}">${SUPPORT_EMAIL}</a><br><a href="${esc(unsubscribe)}" style="color:${MUTED};text-decoration:underline">Unsubscribe from gradefarm. emails</a>`;
}

function footerText(why: string, unsubscribe: string): string {
  return `${why} gradefarm. is run by Titanium Tutoring, Adelaide, SA. Questions? ${SUPPORT_EMAIL}\nUnsubscribe from gradefarm. emails: ${unsubscribe}`;
}
