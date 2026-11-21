import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";

// Addresses we must stop emailing (migration 20261121000000_email_blocks.sql).
// Resend tells us through its webhook (POST /api/email/resend-webhook) when an
// email hard-bounces or its recipient reports it as spam. Resend then refuses
// every later email to that address without saying so when we send, so we
// record the address here: sendEmail skips it, the send is logged as blocked
// rather than sent, and Admin → People shows why.

export type EmailBlockReason = "bounced" | "complained" | "suppressed";

export type DeliveryProblem = {
  reason: EmailBlockReason;
  emails: string[];
  /** Resend's id for the email that bounced or was reported. */
  providerId: string | null;
  subject: string | null;
  detail: string | null;
  occurredAt: string;
};

export type EmailBlock = {
  email: string;
  reason: EmailBlockReason;
  detail: string | null;
  subject: string | null;
  occurred_at: string;
};

/** Resend signs with Svix: reject anything older or newer than this. */
const TOLERANCE_S = 5 * 60;

/**
 * Check a webhook's Svix signature (svix-id, svix-timestamp, svix-signature
 * headers) against RESEND_WEBHOOK_SECRET ("whsec_…"), over the raw body.
 */
export function verifyResendWebhook(
  raw: Buffer | string,
  headers: { id?: string; timestamp?: string; signature?: string },
  secret: string,
  nowMs = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = Buffer.from(createHmac("sha256", key).update(`${id}.${timestamp}.`).update(raw).digest("base64"));
  return signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** What a Resend webhook event means for our sending, or null for events we don't act on. */
export function deliveryProblem(event: unknown): DeliveryProblem | null {
  if (!event || typeof event !== "object") return null;
  const { type, created_at, data } = event as { type?: unknown; created_at?: unknown; data?: Record<string, unknown> };
  if (!data || typeof data !== "object") return null;

  let reason: EmailBlockReason;
  let detail: string | null = null;
  if (type === "email.complained") {
    reason = "complained";
  } else if (type === "email.bounced") {
    const bounce = (data.bounce ?? {}) as { type?: unknown; message?: unknown };
    // A soft bounce (full mailbox, server down) can clear up: only hard ones block.
    if (str(bounce.type) && !/permanent|hard/i.test(String(bounce.type))) return null;
    reason = "bounced";
    detail = str(bounce.message);
  } else if (type === "email.suppressed") {
    reason = "suppressed";
    detail = str((data.suppressed as { message?: unknown } | undefined)?.message);
  } else {
    return null;
  }

  const to = Array.isArray(data.to) ? data.to : [data.to];
  const emails = [...new Set(to.map((e) => str(e)?.toLowerCase()).filter((e): e is string => !!e && e.includes("@")))];
  if (!emails.length) return null;
  return {
    reason,
    emails,
    providerId: str(data.email_id),
    subject: str(data.subject),
    detail,
    occurredAt: str(created_at) ?? str(data.created_at) ?? new Date().toISOString(),
  };
}

/** Why an email to `email` wasn't sent, for logs and the person who tried to send it. */
export function blockedMessage(email: string, reason: EmailBlockReason): string {
  if (reason === "complained") return `Not sent: ${email} reported an earlier gradefarm email as spam, so our email provider won't send to it.`;
  if (reason === "bounced") return `Not sent: an earlier email to ${email} bounced (the address doesn't accept mail).`;
  return `Not sent: our email provider is blocking ${email} after an earlier bounce or spam report.`;
}

/**
 * Record a bounce, spam report or suppression from the webhook: block the
 * address and mark the email in email_log. A suppression notice doesn't
 * replace the bounce or spam report that caused it.
 */
export async function recordDeliveryProblem(admin: SupabaseClient, p: DeliveryProblem): Promise<void> {
  const rows = p.emails.map((email) => ({
    email, reason: p.reason, detail: p.detail, subject: p.subject, provider_id: p.providerId, occurred_at: p.occurredAt,
  }));
  const { error } = await admin.from("email_blocks")
    .upsert(rows, { onConflict: "email", ignoreDuplicates: p.reason === "suppressed" });
  if (error) throw new Error(`email_blocks: ${error.message}`);

  if (p.providerId) {
    const { error: logErr } = await admin.from("email_log")
      .update({ status: p.reason, error: p.detail ?? p.reason, updated_at: new Date().toISOString() })
      .eq("provider_id", p.providerId);
    if (logErr) logger.warn({ err: logErr }, "email blocks: couldn't mark the email in email_log");
  }
}

/** The blocks on these addresses (lower-cased). An error reads as none, so sending never stops on it. */
export async function emailBlocks(admin: SupabaseClient, emails: string[]): Promise<EmailBlock[]> {
  const list = [...new Set(emails.filter(Boolean).map((e) => e.trim().toLowerCase()))];
  if (!list.length) return [];
  const { data, error } = await admin.from("email_blocks")
    .select("email, reason, detail, subject, occurred_at").in("email", list);
  if (error) {
    logger.warn({ err: error }, "email blocks: couldn't read them");
    return [];
  }
  return (data ?? []) as EmailBlock[];
}
