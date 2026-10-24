import { Router, type Request, type Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, verifyPassword } from "../lib/auth";
import { cancelAllSubscriptions, getStripe, syncCustomerEmail } from "./billing";
import { getResend, sendEmail } from "../lib/email";
import { r2DeleteObject } from "../lib/r2";
import { logger } from "../lib/logger";

// The signed-in user's own account: self-serve deletion, and keeping Stripe's
// copy of their email in step after they change it.

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
async function oneOnOneRecordingFiles(admin: SupabaseClient, userId: string): Promise<StoredFile[]> {
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

async function deleteStoredFiles(admin: SupabaseClient, files: StoredFile[], userId: string): Promise<void> {
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
    const email = authUser?.user?.email;
    if (userErr || !email) return fail(res, 404, "Account not found");
    if (!(await verifyPassword(email, password))) return fail(res, 403, "That password isn't right.");

    const { data: billing } = await admin.from("billing_customers").select("user_id").eq("user_id", userId).maybeSingle();
    if (billing) {
      const stripe = getStripe();
      // Deleting without cancelling would leave Stripe billing a deleted account.
      if (!stripe) return fail(res, 503, "We can't cancel your plan right now. Please try again later or contact support.");
      await cancelAllSubscriptions(admin, stripe, userId);
    }

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

export default router;
