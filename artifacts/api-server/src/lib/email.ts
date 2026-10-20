import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";

/** Sender for automated emails. Must be on a domain verified in Resend. */
export const EMAIL_FROM = process.env.EMAIL_FROM ?? "gradefarm. <notifications@gradefarm.au>";

export function appUrl(): string {
  return (process.env.APP_URL ?? "https://gradefarm.com.au").replace(/\/+$/, "");
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
  const expected = Buffer.from(signUserId(userId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
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
  /** Why the recipient is getting this email. Plain text. */
  footer: string;
  /** Adds an unsubscribe link for automated emails. */
  unsubscribe?: string;
}

/** Render the shared gradefarm. email layout as HTML plus a plain-text copy. */
export function renderEmail(c: EmailContent): { html: string; text: string } {
  const paragraphs = c.paragraphs
    .map((p) => `<p style="margin:0 0 16px;color:#4a5068;font-size:15px;line-height:1.6">${escapeHtml(p)}</p>`)
    .join("");
  const details = c.details?.length
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e5ea;border-radius:8px;margin:8px 0 24px">
        ${c.details
          .map(
            ([label, value]) => `<tr>
              <td style="padding:10px 16px;color:#6b7290;font-size:13px;width:110px;vertical-align:top">${escapeHtml(label)}</td>
              <td style="padding:10px 16px;color:#0c1037;font-size:14px;font-weight:700">${escapeHtml(value)}</td>
            </tr>`,
          )
          .join("")}
      </table>`
    : "";
  const cta = c.cta
    ? `<a href="${escapeHtml(c.cta.url)}" style="display:inline-block;background:#f1be43;color:#0c1037;font-weight:800;font-size:15px;padding:13px 26px;border-radius:9px;text-decoration:none">${escapeHtml(c.cta.label)}</a>`
    : "";
  const unsubscribe = c.unsubscribe
    ? ` <a href="${escapeHtml(c.unsubscribe)}" style="color:#8a90a8;text-decoration:underline">Unsubscribe from reminder emails</a>`
    : "";

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:#eef0f6">
  <div style="font-family:'Plus Jakarta Sans',Arial,sans-serif;max-width:560px;margin:0 auto">
    <div style="background:#0c1037;padding:22px 32px;border-radius:12px 12px 0 0">
      <span style="font-size:22px;font-weight:900;color:#f1be43;letter-spacing:-0.5px">gradefarm.</span>
    </div>
    <div style="background:#f9f9fb;padding:32px;border:1px solid #e5e5ea;border-top:0;border-radius:0 0 12px 12px">
      <h1 style="margin:0 0 16px;font-size:21px;font-weight:800;color:#0c1037">${escapeHtml(c.heading)}</h1>
      ${paragraphs}
      ${details}
      ${c.extraHtml ?? ""}
      ${cta}
    </div>
    <p style="margin:16px 8px 0;color:#8a90a8;font-size:12px;line-height:1.5">${escapeHtml(c.footer)}${unsubscribe}</p>
  </div>
</body></html>`;

  const text = [
    c.heading,
    "",
    ...c.paragraphs.flatMap((p) => [p, ""]),
    ...(c.details ?? []).map(([label, value]) => `${label}: ${value}`),
    ...(c.details?.length ? [""] : []),
    ...(c.cta ? [`${c.cta.label}: ${c.cta.url}`, ""] : []),
    c.footer,
    ...(c.unsubscribe ? [`Unsubscribe from reminder emails: ${c.unsubscribe}`] : []),
  ].join("\n");

  return { html, text };
}

// ── Sending ─────────────────────────────────────────────────────────────────

export interface OutgoingEmail {
  to: string;
  subject: string;
  content: EmailContent;
  /** Resend drops a repeat send with the same key within 24 hours. */
  idempotencyKey: string;
}

/** Resend's default limit is 2 requests per second per team. */
const MIN_SEND_INTERVAL_MS = 550;
let lastSendAt = 0;

/** Send one email, spacing calls to stay under Resend's rate limit. */
export async function sendEmail(resend: Resend, email: OutgoingEmail): Promise<{ id: string | null; error: string | null }> {
  const wait = lastSendAt + MIN_SEND_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSendAt = Date.now();

  const { html, text } = renderEmail(email.content);
  const headers: Record<string, string> = {};
  if (email.content.unsubscribe) {
    // One-click unsubscribe (RFC 8058): mail clients show their own
    // "Unsubscribe" button and POST to this URL.
    headers["List-Unsubscribe"] = `<${email.content.unsubscribe}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  try {
    const { data, error } = await resend.emails.send(
      { from: EMAIL_FROM, to: [email.to], subject: email.subject, html, text, headers },
      { idempotencyKey: email.idempotencyKey.slice(0, 256) },
    );
    if (error) return { id: null, error: error.message || String(error) };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: err instanceof Error ? err.message : String(err) };
  }
}
