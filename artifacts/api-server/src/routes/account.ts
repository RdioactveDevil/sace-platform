import { Router, type Request, type Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, verifyPassword } from "../lib/auth";
import { cancelAllSubscriptions, getStripe, syncCustomerEmail } from "./billing";
import { getResend, parentConsentUrl, sendEmail } from "../lib/email";
import { parentConsentEmail } from "../lib/parent-consent";
import { r2DeleteObject } from "../lib/r2";
import { contactEmailForLogin, familyIdOf, familyMembers, isFamilyLogin } from "../lib/family";
import { logger } from "../lib/logger";

// The signed-in user's own account: self-serve deletion, keeping Stripe's copy
// of their email in step after they change it, and their parent or guardian.

const router = Router();

const fail = (res: Response, status: number, error: string) => void res.status(status).json({ error });

/** Bucket for recordings kept on Supabase Storage (see routes/resources.ts). */
const RESOURCES_BUCKET = "tutor-resources";

type StoredFile = { path: string; backend: "r2" | "supabase" };

/**
 * Recording files of the student's one-on-one lessons. Their rows cascade away
 * with the account, so nobody could reach the files afterwards, and they're the
 * student's own face and voice. Class and group recordings have no student_id
 * and are untouched: the rest of the class keeps them.
 */
export async function oneOnOneRecordingFiles(admin: SupabaseClient, userId: string): Promise<StoredFile[]> {
  const [{ data: resources, error: rErr }, { data: sessions, error: sErr }] = await Promise.all([
    admin.from("tutor_resources").select("storage_path, storage_backend")
      .eq("student_id", userId).eq("type", "recording").eq("kind", "file").not("storage_path", "is", null),
    admin.from("tutoring_sessions").select("recording_storage_path, recording_storage_backend")
      .eq("student_id", userId).not("recording_storage_path", "is", null),
  ]);
  if (rErr || sErr) throw new Error((rErr ?? sErr)!.message);
  const files = new Map<string, StoredFile>();
  const add = (path: string | null, backend: string | null) => {
    if (!path) return;
    const b = backend === "r2" ? "r2" : "supabase";
    files.set(`${b}:${path}`, { path, backend: b });
  };
  for (const r of (resources ?? []) as { storage_path: string | null; storage_backend: string | null }[]) add(r.storage_path, r.storage_backend);
  for (const s of (sessions ?? []) as { recording_storage_path: string | null; recording_storage_backend: string | null }[]) {
    add(s.recording_storage_path, s.recording_storage_backend);
  }
  return [...files.values()];
}

export async function deleteStoredFiles(admin: SupabaseClient, files: StoredFile[], userId: string): Promise<void> {
  for (const f of files.filter((x) => x.backend === "r2")) await r2DeleteObject(f.path);
  const onSupabase = files.filter((x) => x.backend === "supabase").map((x) => x.path);
  if (onSupabase.length) {
    const { error } = await admin.storage.from(RESOURCES_BUCKET).remove(onSupabase);
    if (error) logger.warn({ userId, error: error.message }, "account: couldn't remove recording files");
  }
}

// DELETE /account — { password }: permanently delete the caller's account.
// Students only. Cancels any Stripe plan first, then deletes the auth user,
// which cascades to profiles and every row that references it (same as the
// admin delete), then removes their one-on-one lesson recordings.
router.delete("/account", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const { admin, userId } = ctx;
  if (userId === "service") return fail(res, 400, "Not a user account");
  if (ctx.isAdmin) return fail(res, 403, "Admin accounts can't be deleted here. Ask another admin to remove your admin access first.");
  // A tutor's classes, sessions and recordings are what their students learn
  // from, and deleting the tutor cascades all of it away. An admin hands those
  // over first.
  if (ctx.isTutor) return fail(res, 403, "Tutor accounts can't be deleted here. Contact support@titaniumtutoring.com.au and we'll move your classes over first.");

  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password) return fail(res, 400, "Enter your password to confirm.");

  try {
    const { data: authUser, error: userErr } = await admin.auth.admin.getUserById(userId);
    const loginEmail = authUser?.user?.email;
    if (userErr || !loginEmail) return fail(res, 404, "Account not found");
    // An added child (lib/family.ts) has no password of their own: the parent's confirms it.
    const email = isFamilyLogin(loginEmail) ? await contactEmailForLogin(admin, loginEmail) : loginEmail;
    if (!email || !(await verifyPassword(email, password))) return fail(res, 403, "That password isn't right.");

    // Deleting the account the parent signs in to deletes the children added
    // to it too: nobody could reach them afterwards.
    const familyId = await familyIdOf(admin, userId);
    const addedChildren = familyId === userId
      ? (await familyMembers(admin, userId)).filter((m) => !m.primary).map((m) => m.id)
      : [];

    const stripe = getStripe();
    for (const id of [...addedChildren, userId]) {
      const { data: billing } = await admin.from("billing_customers").select("user_id").eq("user_id", id).maybeSingle();
      if (!billing) continue;
      // Deleting without cancelling would leave Stripe billing a deleted account.
      if (!stripe) return fail(res, 503, "We can't cancel your plan right now. Please try again later or contact support.");
      await cancelAllSubscriptions(admin, stripe, id);
    }
    for (const id of addedChildren) {
      await admin.from("draft_questions").update({ reviewed_by: null }).eq("reviewed_by", id);
      const childRecordings = await oneOnOneRecordingFiles(admin, id);
      const { error: childErr } = await admin.auth.admin.deleteUser(id);
      if (childErr) throw new Error(childErr.message);
      await deleteStoredFiles(admin, childRecordings, id);
    }
    const billing = (await admin.from("billing_customers").select("user_id").eq("user_id", userId).maybeSingle()).data;

    // The one reference to profiles that doesn't cascade or null itself out.
    await admin.from("draft_questions").update({ reviewed_by: null }).eq("reviewed_by", userId);

    const { data: profile } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle<{ display_name: string | null }>();
    const recordings = await oneOnOneRecordingFiles(admin, userId);
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) throw new Error(delErr.message);
    logger.info({ userId, recordings: recordings.length }, "account: user deleted their account");
    // Only once the account is gone, so a failed delete never loses recordings.
    await deleteStoredFiles(admin, recordings, userId);

    const resend = getResend();
    if (resend) {
      const name = profile?.display_name?.trim();
      const { error } = await sendEmail(resend, {
        to: email,
        subject: "Your gradefarm. account has been deleted",
        content: {
          heading: "Your account has been deleted",
          paragraphs: [
            `${name ? `Hi ${name}, your` : "Your"} gradefarm. account and the data tied to it have been deleted.`,
            billing ? "Your subject plan was cancelled at the same time, so you won't be charged again." : "",
            "If you didn't do this, contact support@titaniumtutoring.com.au straight away.",
          ].filter(Boolean),
          footer: "You're receiving this because the gradefarm. account for this email address was deleted.",
        },
        idempotencyKey: `account-deleted:${userId}`,
      });
      if (error) logger.warn({ userId, error }, "account: deletion email failed");
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, userId }, "account: delete failed");
    fail(res, 502, "Couldn't delete your account. Please try again.");
  }
});

// POST /account/sync-email — copy the caller's current sign-in email onto their
// Stripe customer, so receipts follow an email change. A no-op without billing.
router.post("/account/sync-email", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const stripe = getStripe();
  if (!stripe || ctx.userId === "service") return void res.json({ updated: false });
  try {
    res.json({ updated: await syncCustomerEmail(ctx.admin, stripe, ctx.userId) });
  } catch (err) {
    logger.error({ err }, "account: email sync failed");
    fail(res, 502, "Couldn't update your billing email.");
  }
});

// ── Parent or guardian ──────────────────────────────────────────────────────
// lib/parent-consent.ts. The browser can't write these columns (migration
// 20261025000012_parent_consent.sql), so onboarding and My Account come here.

const PARENT_COLUMNS = "account_holder, parent_name, parent_email, parent_consent_at, parent_consent_requested_at, parent_reports_stopped_at";
type ParentFields = {
  account_holder: "student" | "parent" | null;
  parent_name: string | null;
  parent_email: string | null;
  parent_consent_at: string | null;
  parent_consent_requested_at: string | null;
  parent_reports_stopped_at: string | null;
  parent_report_week?: string | null;
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The consent email goes at most this often, so the form can't be used to spam an address. */
const CONSENT_RESEND_MS = 60_000;

// PUT /account/parent — any of:
//   { accountHolder: 'parent', parentName }  a parent set the account up for
//       their child (onboarding): their sign-in email is the parent email, and
//       they agreed on the child's behalf when they finished onboarding.
//   { parentEmail, parentName }  the student's parent or guardian; a new email
//       is sent a link to confirm (POST /api/parent/consent).
//   { resend: true }  send that link again.
//   { reports: boolean }  a parent account holder turns the weekly report on or off.
router.put("/account/parent", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const { admin, userId } = ctx;
  if (userId === "service" || ctx.isTutor || ctx.isAdmin) return fail(res, 400, "Only student accounts have a parent or guardian.");
  const body = (req.body ?? {}) as Record<string, unknown>;

  try {
    const [{ data: authUser }, { data: profile, error }] = await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin.from("profiles").select(`display_name, ${PARENT_COLUMNS}`).eq("id", userId)
        .maybeSingle<ParentFields & { display_name: string | null }>(),
    ]);
    if (error) throw new Error(error.message);
    if (!profile) return fail(res, 404, "Account not found");
    const loginEmail = authUser?.user?.email?.trim().toLowerCase() ?? "";
    // An added child signs in with a hidden address; the parent's is the one that counts.
    const accountEmail = loginEmail ? ((await contactEmailForLogin(admin, loginEmail)) ?? "").toLowerCase() : "";
    const name = typeof body.parentName === "string" ? body.parentName.trim().slice(0, 80) || null : undefined;
    const now = new Date().toISOString();
    const updates: Partial<ParentFields> = {};
    let sendConsent = false;

    if (body.accountHolder === "parent") {
      // Decided once, by whoever set the account up.
      if (profile.account_holder === "student") return fail(res, 409, "This account was set up by the student. Add a parent's email instead.");
      if (!accountEmail) return fail(res, 400, "Your account has no email address.");
      Object.assign(updates, { account_holder: "parent", parent_email: accountEmail, parent_consent_at: profile.parent_consent_at ?? now });
      if (name !== undefined) updates.parent_name = name;
    } else {
      if (!profile.account_holder) updates.account_holder = "student";
      if (typeof body.parentEmail === "string") {
        if (profile.account_holder === "parent") return fail(res, 400, "You're the parent on this account, so your sign-in email gets the reports.");
        const email = body.parentEmail.trim().toLowerCase();
        if (!EMAIL_RE.test(email) || email.length > 254) return fail(res, 400, "Enter a valid email address.");
        if (email === accountEmail) return fail(res, 400, "That's the email you sign in with. Enter your parent or guardian's email.");
        if (email !== (profile.parent_email ?? "").toLowerCase()) {
          // A new address starts again: that person hasn't confirmed anything.
          Object.assign(updates, {
            parent_email: email, parent_consent_at: null, parent_report_week: null, parent_reports_stopped_at: null,
          });
          sendConsent = true;
        }
        if (name !== undefined) updates.parent_name = name;
      } else if (name !== undefined && profile.parent_email) {
        updates.parent_name = name;
      }
      if (body.resend === true) {
        if (!profile.parent_email) return fail(res, 400, "Add your parent or guardian's email first.");
        if (profile.parent_consent_at) return fail(res, 409, "Your parent or guardian has already confirmed.");
        sendConsent = true;
      }
    }

    if (typeof body.reports === "boolean") {
      if ((updates.account_holder ?? profile.account_holder) !== "parent") {
        return fail(res, 403, "Your parent or guardian can stop the weekly report from the link in the email.");
      }
      updates.parent_reports_stopped_at = body.reports ? null : now;
    }

    const resend = sendConsent ? getResend() : null;
    if (sendConsent) {
      const last = profile.parent_consent_requested_at ? Date.parse(profile.parent_consent_requested_at) : 0;
      if (Date.now() - last < CONSENT_RESEND_MS) return fail(res, 429, "We've just sent one. Give it a minute, and check the spam folder too.");
      if (!resend) return fail(res, 503, "We can't send email right now. Please try again later.");
      updates.parent_consent_requested_at = now;
    }

    if (Object.keys(updates).length) {
      const { error: upErr } = await admin.from("profiles").update(updates).eq("id", userId);
      if (upErr) throw new Error(upErr.message);
    }
    const next = { ...profile, ...updates };
    const parent = {
      account_holder: next.account_holder, parent_name: next.parent_name, parent_email: next.parent_email,
      parent_consent_at: next.parent_consent_at, parent_consent_requested_at: next.parent_consent_requested_at,
      parent_reports_stopped_at: next.parent_reports_stopped_at,
    };

    if (sendConsent && resend && next.parent_email) {
      const { subject, content } = parentConsentEmail({
        parentName: next.parent_name,
        studentName: next.display_name?.trim() || "Your child",
        url: parentConsentUrl(userId, next.parent_email),
      });
      const { error: sendErr } = await sendEmail(resend, {
        to: next.parent_email, subject, content, idempotencyKey: `parent-consent:${userId}:${next.parent_email}:${now}`,
      });
      if (sendErr) {
        logger.warn({ userId, error: sendErr }, "account: parent consent email failed");
        return void res.status(502).json({ error: "We saved the email but couldn't send it. Try Send again in a minute.", parent });
      }
    }
    res.json({ parent, sent: sendConsent });
  } catch (err) {
    logger.error({ err, userId }, "account: parent update failed");
    fail(res, 502, "Couldn't save your parent or guardian's details. Please try again.");
  }
});

export default router;
