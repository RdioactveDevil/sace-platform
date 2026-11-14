import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { getServiceClient } from "./auth";
import { contactEmailForLogin, isFamilyLogin } from "./family";
import { BODY, button, CARD, FONT, footer, footerText, LINE, MUTED, NAVY, page, wordmarkRow } from "./email-layout";

/** Sender for every email the API sends. Must be on a domain verified in Resend. */
export const EMAIL_FROM = process.env.EMAIL_FROM ?? "gradefarm. <notifications@gradefarm.com.au>";

/**
 * The site's canonical address. The bare domain redirects here, and a redirect
 * would break one-click unsubscribe (mail clients don't follow it for a POST).
 */
export function appUrl(): string {
  return (process.env.APP_URL ?? "https://www.gradefarm.com.au").replace(/\/+$/, "");
}

export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Unsubscribe links ───────────────────────────────────────────────────────
// A link carries the user id and an HMAC of it, so it works without signing
// in and can't be forged for someone else's account.

function unsubscribeSecret(): string {
  const secret =
    process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("No EMAIL_UNSUBSCRIBE_SECRET or SUPABASE_SERVICE_KEY configured");
  return secret;
}

function signUserId(userId: string): string {
  return createHmac("sha256", unsubscribeSecret()).update(`unsubscribe:${userId}`).digest("base64url");
}

export function unsubscribeUrl(userId: string): string {
  const params = new URLSearchParams({ u: userId, t: signUserId(userId) });
  return `${appUrl()}/api/email/unsubscribe?${params}`;
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  return sameToken(signUserId(userId), token);
}

const sameToken = (expected: string, given: string) => {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
};

// A parent getting a student's weekly report has no account: their link
// names the tutor–student pair instead.
function signParentReport(tutorId: string, studentId: string): string {
  return createHmac("sha256", unsubscribeSecret()).update(`parent-report:${tutorId}:${studentId}`).digest("base64url");
}

export function parentUnsubscribeUrl(tutorId: string, studentId: string): string {
  const params = new URLSearchParams({ tu: tutorId, st: studentId, t: signParentReport(tutorId, studentId) });
  return `${appUrl()}/api/email/parent-unsubscribe?${params}`;
}

export function verifyParentUnsubscribeToken(tutorId: string, studentId: string, token: string): boolean {
  return sameToken(signParentReport(tutorId, studentId), token);
}

// The report a parent gets from the student's own account (no tutor) is
// stopped on the profile, so its link names just the student.
function signAccountParentReport(studentId: string): string {
  return createHmac("sha256", unsubscribeSecret()).update(`account-parent-report:${studentId}`).digest("base64url");
}

export function accountParentUnsubscribeUrl(studentId: string): string {
  const params = new URLSearchParams({ st: studentId, t: signAccountParentReport(studentId) });
  return `${appUrl()}/api/email/parent-unsubscribe?${params}`;
}

export function verifyAccountParentUnsubscribeToken(studentId: string, token: string): boolean {
  return sameToken(signAccountParentReport(studentId), token);
}

// A parent confirming a young student's account. The link is tied to the
// parent email it was sent to, so it stops working if the student changes it.
function signParentConsent(studentId: string, parentEmail: string): string {
  return createHmac("sha256", unsubscribeSecret())
    .update(`parent-consent:${studentId}:${parentEmail.trim().toLowerCase()}`)
    .digest("base64url");
}

export function parentConsentUrl(studentId: string, parentEmail: string): string {
  const params = new URLSearchParams({ s: studentId, t: signParentConsent(studentId, parentEmail) });
  return `${appUrl()}/api/parent/consent?${params}`;
}

export function verifyParentConsentToken(studentId: string, parentEmail: string, token: string): boolean {
  return sameToken(signParentConsent(studentId, parentEmail), token);
}

// ── Layout ──────────────────────────────────────────────────────────────────

export interface EmailContent {
  /** Large heading at the top of the card. */
  heading: string;
  /** Paragraphs of plain text (escaped here). */
  paragraphs: string[];
  /** Label/value rows shown in a panel, e.g. When / Duration. Plain text. */
  details?: Array<[string, string]>;
  /** Extra pre-built, already-escaped HTML shown after the details panel. */
  extraHtml?: string;
  cta?: { label: string; url: string };
  /** Why the recipient is getting this email. Plain text; the footer adds who we are and the support address. */
  footer: string;
  /** Inbox preview text shown after the subject. Defaults to the start of the email. */
  preview?: string;
  /** Adds an unsubscribe link for automated emails. */
  unsubscribe?: string;
  /** The unsubscribe link's text (default "Unsubscribe from reminder emails"). */
  unsubscribeLabel?: string;
}

/**
 * An email with its own layout, already rendered (the welcome email,
 * lib/welcome-email.ts). Its HTML and text must carry the unsubscribe link
 * themselves; `unsubscribe` only adds the one-click headers.
 */
export interface PrebuiltEmail {
  html: string;
  text: string;
  unsubscribe?: string;
}

const isPrebuilt = (c: EmailContent | PrebuiltEmail): c is PrebuiltEmail =>
  typeof (c as PrebuiltEmail).html === "string";

/** Render the shared gradefarm. email layout (email-layout.ts) as HTML plus a plain-text copy. */
export function renderEmail(c: EmailContent): { html: string; text: string } {
  const unsub = c.unsubscribe ? { url: c.unsubscribe, label: c.unsubscribeLabel ?? "Unsubscribe from reminder emails" } : undefined;
  const cell = `font-family:${FONT};padding:12px 16px`;
  const paragraphs = c.paragraphs
    .map((p) => `<p style="margin:14px 0 0;font-size:15.5px;line-height:1.65;color:${BODY}">${escapeHtml(p)}</p>`)
    .join("");
  const details = c.details?.length
    ? `<tr><td class="gf-pad" style="padding:24px 40px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CARD};border:1px solid ${LINE};border-radius:12px;border-collapse:separate">
${c.details
  .map(([label, value], i) => {
    const rule = i ? `border-top:1px solid ${LINE};` : "";
    return `<tr>
<td class="gf-dl" width="128" valign="top" style="width:128px;${cell};${rule}font-size:13px;line-height:1.45;color:${MUTED}">${escapeHtml(label)}</td>
<td class="gf-dv" valign="top" style="${cell};${rule}font-size:14.5px;font-weight:700;line-height:1.45;color:${NAVY}">${escapeHtml(value)}</td>
</tr>`;
  })
  .join("\n")}
</table>
</td></tr>`
    : "";

  const body = `
${wordmarkRow()}
<tr><td class="gf-pad" style="padding:28px 40px 0;font-family:${FONT}">
<h1 class="gf-h1s" style="margin:0;font-family:${FONT};font-size:26px;font-weight:800;line-height:1.2;letter-spacing:-0.5px;color:${NAVY}">${escapeHtml(c.heading)}</h1>
${paragraphs}
</td></tr>
${details}
${c.extraHtml ? `<tr><td class="gf-pad" style="padding:20px 40px 0;font-family:${FONT}">${c.extraHtml}</td></tr>` : ""}
${c.cta ? `<tr><td class="gf-pad" style="padding:28px 40px 0">${button(c.cta.label, c.cta.url)}</td></tr>` : ""}
<tr><td style="height:36px;font-size:0;line-height:0">&nbsp;</td></tr>`;

  const html = page({ title: c.heading, preheader: c.preview, body, footer: footer(c.footer, unsub) });

  const text = [
    c.heading,
    "",
    ...c.paragraphs.flatMap((p) => [p, ""]),
    ...(c.details ?? []).map(([label, value]) => `${label}: ${value}`),
    ...(c.details?.length ? [""] : []),
    ...(c.cta ? [`${c.cta.label}: ${c.cta.url}`, ""] : []),
    "---",
    footerText(c.footer, unsub),
  ].join("\n");

  return { html, text };
}

// ── Sending ─────────────────────────────────────────────────────────────────

export interface OutgoingEmail {
  to: string;
  subject: string;
  content: EmailContent | PrebuiltEmail;
  /** Resend drops a repeat send with the same key within 24 hours. */
  idempotencyKey?: string;
}

/** Resend's default limit is 2 requests per second per team. */
const MIN_SEND_INTERVAL_MS = 550;
let nextSendAt = 0;

/**
 * Send one email, spacing calls to stay under Resend's rate limit. Each call
 * takes the next free slot before it waits, so emails sent together (a class
 * assignment, a series booking) queue up instead of all going at once.
 */
export async function sendEmail(resend: Resend, email: OutgoingEmail): Promise<{ id: string | null; error: string | null }> {
  const now = Date.now();
  const slot = Math.max(now, nextSendAt);
  nextSendAt = slot + MIN_SEND_INTERVAL_MS;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));

  // A child added to a family signs in with a hidden address: their mail goes to the parent.
  let to = email.to;
  if (isFamilyLogin(to)) {
    const parent = await contactEmailForLogin(getServiceClient(), to).catch(() => null);
    if (!parent) return { id: null, error: "No parent email for this family account" };
    to = parent;
  }

  const { html, text } = isPrebuilt(email.content) ? email.content : renderEmail(email.content);
  const headers: Record<string, string> = {};
  if (email.content.unsubscribe) {
    // One-click unsubscribe (RFC 8058): mail clients show their own
    // "Unsubscribe" button and POST to this URL.
    headers["List-Unsubscribe"] = `<${email.content.unsubscribe}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  try {
    const { data, error } = await resend.emails.send(
      { from: EMAIL_FROM, to: [to], subject: email.subject, html, text, headers },
      email.idempotencyKey ? { idempotencyKey: email.idempotencyKey.slice(0, 256) } : undefined,
    );
    if (error) return { id: null, error: error.message || String(error) };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: err instanceof Error ? err.message : String(err) };
  }
}
