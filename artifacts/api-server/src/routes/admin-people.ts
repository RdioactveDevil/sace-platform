import { Router, type Request, type Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "../lib/auth";
import {
  getStripe, syncCustomerEmail, cancelAllSubscriptions, liveSubscription, subscriptionInterval,
  subscriptionTiers, readTiers, planTotal, syncSubscription,
} from "./billing";
import { appUrl, getResend, parentConsentUrl, sendEmail } from "../lib/email";
import { parentConsentEmail, needsParentConsent } from "../lib/parent-consent";
import { contactEmailForLogin, isFamilyLogin } from "../lib/family";
import { EMAIL_RE, parseDetails, parseSettings } from "../lib/admin-people";
import { emailBlocks } from "../lib/email-blocks";
import { logger } from "../lib/logger";

// Admin → People: everything about one person, changed by an admin. Their
// details, parent or guardian, sign-in help, their own settings and their
// plan. (Subjects, roles, tutors and deactivating are in routes/admin.ts.)

const router = Router();
const fail = (res: Response, status: number, error: string) => void res.status(status).json({ error });
const pid = (req: Request): string => String(req.params.id);

const PROFILE = "id, display_name, year_level, state, school, dob, is_admin, is_tutor, deactivated_at, account_holder, parent_name, parent_email, parent_consent_at, parent_consent_requested_at, parent_reports_stopped_at, emails_unsubscribed_at, sounds_enabled, hide_from_leaderboard";
type Profile = {
  id: string; display_name: string | null; year_level: number | null; state: string | null; school: string | null; dob: string | null;
  is_admin: boolean | null; is_tutor: boolean | null; deactivated_at: string | null;
  account_holder: "student" | "parent" | null; parent_name: string | null; parent_email: string | null;
  parent_consent_at: string | null; parent_consent_requested_at: string | null; parent_reports_stopped_at: string | null;
  emails_unsubscribed_at: string | null; sounds_enabled: boolean | null; hide_from_leaderboard: boolean | null;
};
/** The parent email goes at most this often. */
const CONSENT_RESEND_MS = 60_000;

async function loadPerson(admin: SupabaseClient, id: string) {
  const [{ data: profile, error }, { data: authUser }] = await Promise.all([
    admin.from("profiles").select(PROFILE).eq("id", id).maybeSingle<Profile>(),
    admin.auth.admin.getUserById(id),
  ]);
  if (error) throw new Error(error.message);
  return { profile, user: authUser?.user ?? null };
}

/**
 * Addresses we email about this person: theirs (their parent's, for an added
 * child), and the parent emails on their account and their tutors' rosters.
 */
async function personEmails(admin: SupabaseClient, profile: Profile, loginEmail: string | null): Promise<string[]> {
  const [contact, { data: roster }] = await Promise.all([
    loginEmail && isFamilyLogin(loginEmail) ? contactEmailForLogin(admin, loginEmail) : Promise.resolve(loginEmail),
    admin.from("tutor_students").select("parent_email").eq("student_id", profile.id).not("parent_email", "is", null),
  ]);
  const rosterEmails = ((roster ?? []) as { parent_email: string }[]).map((r) => r.parent_email);
  return [contact, profile.parent_email, ...rosterEmails].filter((e): e is string => !!e).map((e) => e.toLowerCase());
}

/** Their plan, from our rows and Stripe: null when they have none. */
async function billingSummary(admin: Parameters<typeof liveSubscription>[0], userId: string) {
  const { data: rows } = await admin
    .from("user_subscriptions").select("id, subject_name, stage, status, current_period_end, cancel_at_period_end, stripe_subscription_id")
    .eq("user_id", userId).eq("source", "stripe").eq("active", true);
  const paid = (rows ?? []) as { id: string; subject_name: string; stage: string | null; status: string | null; current_period_end: string | null; cancel_at_period_end: boolean | null; stripe_subscription_id: string | null }[];
  const stripe = getStripe();
  if (!paid.length) return { enabled: !!stripe, plan: null };
  let interval: "week" | "month" = "week";
  let total: number | null = null;
  let subscriptionId: string | null = paid[0].stripe_subscription_id;
  if (stripe) {
    const sub = await liveSubscription(admin, stripe, userId).catch((err) => {
      logger.warn({ err, userId }, "admin-people: couldn't read the plan from Stripe");
      return null;
    });
    if (sub) {
      interval = subscriptionInterval(sub);
      subscriptionId = sub.id;
      total = planTotal(subscriptionTiers(sub) ?? (await readTiers(admin))[interval], paid.length);
    }
  }
  return {
    enabled: !!stripe,
    plan: {
      subscriptionId,
      interval,
      total,
      subjects: paid.map((r) => [r.subject_name, r.stage].filter(Boolean).join(" ")),
      trialing: paid.every((r) => r.status === "trialing"),
      renewsAt: paid[0].current_period_end,
      endsAtPeriodEnd: paid.every((r) => r.cancel_at_period_end),
    },
  };
}

// GET /admin/people/:id — their details, parent, sign-in, settings and plan.
router.get("/admin/people/:id", async (req: Request, res: Response) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  try {
    const { profile, user } = await loadPerson(ctx.admin, pid(req));
    if (!profile) return fail(res, 404, "No account with that ID.");
    const loginEmail = user?.email ?? null;
    const family = isFamilyLogin(loginEmail);
    const blocks = await emailBlocks(ctx.admin, await personEmails(ctx.admin, profile, loginEmail));
    res.json({
      profile,
      signIn: {
        email: loginEmail,
        // An added child signs in with a hidden address; their parent's email is the one that reaches them.
        family,
        contactEmail: family && loginEmail ? await contactEmailForLogin(ctx.admin, loginEmail) : loginEmail,
        lastSignInAt: user?.last_sign_in_at ?? null,
        emailConfirmedAt: user?.email_confirmed_at ?? null,
        createdAt: user?.created_at ?? null,
      },
      parentConsentNeeded: needsParentConsent(profile.dob, profile.year_level),
      // Addresses that bounced or reported us as spam, so nothing is sent to them.
      emailBlocks: blocks,
      billing: await billingSummary(ctx.admin, profile.id),
    });
  } catch (err) {
    logger.error({ err }, "admin-people: load failed");
    fail(res, 500, "Couldn't load this person.");
  }
});

// PATCH /admin/people/:id/details — { displayName, email, yearLevel, state, school, dob } (any).
router.patch("/admin/people/:id/details", async (req: Request, res: Response) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const parsed = parseDetails(req.body);
  if ("error" in parsed) return fail(res, 400, parsed.error);
  try {
    const { profile, user } = await loadPerson(ctx.admin, pid(req));
    if (!profile || !user) return fail(res, 404, "No account with that ID.");
    if (parsed.email && parsed.email !== (user.email ?? "").toLowerCase()) {
      if (isFamilyLogin(user.email)) return fail(res, 400, "This account signs in through its parent's account, so it has no email of its own to change.");
      const { error } = await ctx.admin.auth.admin.updateUserById(user.id, { email: parsed.email, email_confirm: true });
      if (error) return fail(res, /already|registered|exists/i.test(error.message) ? 409 : 500, /already|registered|exists/i.test(error.message) ? "Another account already uses that email." : error.message);
      const stripe = getStripe();
      if (stripe) await syncCustomerEmail(ctx.admin, stripe, user.id).catch((err) => logger.warn({ err }, "admin-people: billing email sync failed"));
    }
    if (Object.keys(parsed.updates).length) {
      const { error } = await ctx.admin.from("profiles").update(parsed.updates).eq("id", profile.id);
      if (error) throw new Error(error.message);
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin-people: details update failed");
    fail(res, 500, "Couldn't save their details.");
  }
});

// PUT /admin/people/:id/parent — { parentName, parentEmail } and/or { resend: true }
// and/or { confirmed: boolean }. A new parent email starts again unconfirmed
// and is sent the link to confirm.
router.put("/admin/people/:id/parent", async (req: Request, res: Response) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const { profile, user } = await loadPerson(ctx.admin, pid(req));
    if (!profile) return fail(res, 404, "No account with that ID.");
    if (profile.is_tutor || profile.is_admin) return fail(res, 400, "Only student accounts have a parent or guardian.");
    const now = new Date().toISOString();
    const updates: Partial<Profile> & { parent_report_week?: string | null } = {};
    let send = false;

    if (typeof body.parentName === "string") updates.parent_name = body.parentName.trim().slice(0, 80) || null;
    if (typeof body.parentEmail === "string") {
      const email = body.parentEmail.trim().toLowerCase();
      if (!email) {
        Object.assign(updates, { parent_email: null, parent_consent_at: null, parent_report_week: null, parent_reports_stopped_at: null });
      } else {
        if (!EMAIL_RE.test(email) || email.length > 254) return fail(res, 400, "Enter a valid email address.");
        if (email === (user?.email ?? "").toLowerCase() && profile.account_holder !== "parent") return fail(res, 400, "That's the email the student signs in with.");
        if (email !== (profile.parent_email ?? "").toLowerCase()) {
          Object.assign(updates, { parent_email: email, parent_consent_at: null, parent_report_week: null, parent_reports_stopped_at: null });
          if (!profile.account_holder) updates.account_holder = "student";
          send = body.send !== false;
        }
      }
    }
    if (body.resend === true) {
      if (!(updates.parent_email ?? profile.parent_email)) return fail(res, 400, "Add the parent or guardian's email first.");
      send = true;
    }
    if (typeof body.confirmed === "boolean") {
      if (!(updates.parent_email ?? profile.parent_email) && body.confirmed) return fail(res, 400, "Add the parent or guardian's email first.");
      updates.parent_consent_at = body.confirmed ? now : null;
      if (body.confirmed) send = false;
    }

    const resend = send ? getResend() : null;
    if (send) {
      const last = profile.parent_consent_requested_at ? Date.parse(profile.parent_consent_requested_at) : 0;
      if (Date.now() - last < CONSENT_RESEND_MS) return fail(res, 429, "One was just sent. Give it a minute.");
      if (!resend) return fail(res, 503, "Email isn't set up, so nothing can be sent right now.");
      updates.parent_consent_requested_at = now;
    }
    if (Object.keys(updates).length) {
      const { error } = await ctx.admin.from("profiles").update(updates).eq("id", profile.id);
      if (error) throw new Error(error.message);
    }
    const next = { ...profile, ...updates };
    if (send && resend && next.parent_email) {
      const { subject, content } = parentConsentEmail({
        parentName: next.parent_name,
        studentName: next.display_name?.trim() || "Your child",
        url: parentConsentUrl(profile.id, next.parent_email),
        young: needsParentConsent(profile.dob, profile.year_level),
      });
      const { error } = await sendEmail(resend, {
        to: next.parent_email, subject, content, idempotencyKey: `parent-consent:${profile.id}:${next.parent_email}:${now}`,
      });
      if (error) return fail(res, 502, "Saved, but the email couldn't be sent. Try Send again in a minute.");
    }
    res.json({ ok: true, sent: send });
  } catch (err) {
    logger.error({ err }, "admin-people: parent update failed");
    fail(res, 500, "Couldn't save the parent or guardian.");
  }
});

// DELETE /admin/people/:id/email-block — { email }: send to this address again.
// Only for one of this person's addresses. Resend keeps its own list: the
// address has to come off that too (Resend → Suppressions) or it still won't arrive.
router.delete("/admin/people/:id/email-block", async (req: Request, res: Response) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const email = String((req.body ?? {}).email ?? "").trim().toLowerCase();
  if (!email) return fail(res, 400, "Which email?");
  try {
    const { profile, user } = await loadPerson(ctx.admin, pid(req));
    if (!profile) return fail(res, 404, "No account with that ID.");
    if (!(await personEmails(ctx.admin, profile, user?.email ?? null)).includes(email)) return fail(res, 400, "That isn't one of this person's emails.");
    const { error } = await ctx.admin.from("email_blocks").delete().eq("email", email);
    if (error) throw new Error(error.message);
    logger.info({ admin: ctx.userId, person: profile.id }, "admin-people: email block cleared");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin-people: clearing an email block failed");
    fail(res, 500, "Couldn't clear it.");
  }
});

// POST /admin/people/:id/password-reset — email them a link to choose a new password.
router.post("/admin/people/:id/password-reset", async (req: Request, res: Response) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  try {
    const { user } = await loadPerson(ctx.admin, pid(req));
    if (!user?.email) return fail(res, 404, "This account has no email to send to.");
    if (isFamilyLogin(user.email)) return fail(res, 400, "This account signs in through its parent's account. Their parent can change its password there.");
    const { error } = await ctx.admin.auth.resetPasswordForEmail(user.email, { redirectTo: `${appUrl()}/reset-password` });
    if (error) return fail(res, /rate|seconds/i.test(error.message) ? 429 : 500, /rate|seconds/i.test(error.message) ? "One was just sent. Try again in a minute." : error.message);
    res.json({ ok: true, sentTo: user.email });
  } catch (err) {
    logger.error({ err }, "admin-people: password reset failed");
    fail(res, 500, "Couldn't send the reset email.");
  }
});

// POST /admin/people/:id/sign-out — end every session they have (migration 20261116000000).
router.post("/admin/people/:id/sign-out", async (req: Request, res: Response) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { data, error } = await ctx.admin.rpc("admin_sign_out_user", { p_user: pid(req) });
  if (error?.code === "PGRST202") return fail(res, 503, "This needs the latest database update. Run the migrations, then try again.");
  if (error) return fail(res, 500, error.message);
  res.json({ ok: true, sessions: Number(data) || 0 });
});

// PATCH /admin/people/:id/settings — { reminders, sounds, leaderboard } (booleans, any).
router.patch("/admin/people/:id/settings", async (req: Request, res: Response) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const parsed = parseSettings(req.body);
  if ("error" in parsed) return fail(res, 400, parsed.error as string);
  const { error } = await ctx.admin.from("profiles").update(parsed).eq("id", pid(req));
  if (error) return fail(res, 500, error.message);
  res.json({ ok: true });
});

// POST /admin/people/:id/billing — { action: 'cancel_at_period_end' | 'resume' | 'cancel_now' }.
router.post("/admin/people/:id/billing", async (req: Request, res: Response) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const stripe = getStripe();
  if (!stripe) return fail(res, 503, "Payments aren't set up.");
  const action = (req.body ?? {}).action;
  try {
    if (action === "cancel_now") {
      const sub = await liveSubscription(ctx.admin, stripe, pid(req));
      await cancelAllSubscriptions(ctx.admin, stripe, pid(req));
      if (sub) await syncSubscription(ctx.admin, stripe, sub.id);
      return void res.json({ ok: true });
    }
    if (action !== "cancel_at_period_end" && action !== "resume") return fail(res, 400, "Unknown action.");
    const sub = await liveSubscription(ctx.admin, stripe, pid(req));
    if (!sub) return fail(res, 404, "They don't have a plan to change.");
    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: action === "cancel_at_period_end" });
    await syncSubscription(ctx.admin, stripe, sub.id);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin-people: billing change failed");
    fail(res, 502, "Stripe didn't accept the change. Try again, or use the Stripe dashboard.");
  }
});

export default router;
