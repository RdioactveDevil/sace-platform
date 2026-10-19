import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, getServiceClient } from "../lib/auth";
import { logger } from "../lib/logger";

// Student billing: $5/week per subject (platform_settings.pricing.student_weekly)
// through Stripe Checkout, one Stripe subscription per subject, with a free
// trial (pricing.trial_days) on a student's first subscription. Access lives
// in user_subscriptions (source = 'stripe'); `active` follows the Stripe
// status. Stripe is the source of truth: the webhook and the post-checkout
// sync both re-read the subscription from Stripe before writing.
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, optional STRIPE_PRICE_ID
// (otherwise a weekly AUD price is looked up / created by lookup key).

const router = Router();

const DEFAULT_WEEKLY_AUD = 5;
const DEFAULT_TRIAL_DAYS = 7;
/** Statuses that keep the subject unlocked (past_due: Stripe is still retrying the card). */
const ACCESS_STATUSES = new Set<Stripe.Subscription.Status>(["trialing", "active", "past_due"]);

const appUrl = () => (process.env.APP_URL ?? "https://gradefarm.com.au").replace(/\/$/, "");

let stripeClient: Stripe | null = null;
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripeClient ??= new Stripe(key);
  return stripeClient;
}

function notConfigured(res: Response) {
  res.status(503).json({ error: "Payments aren't set up yet. Please contact Titanium Tutoring." });
}

type Pricing = { weekly: number; trialDays: number };

async function readPricing(admin: SupabaseClient): Promise<Pricing> {
  const { data } = await admin.from("platform_settings").select("value").eq("key", "pricing").maybeSingle();
  const v = (data?.value ?? {}) as { student_weekly?: unknown; trial_days?: unknown };
  const weekly = typeof v.student_weekly === "number" && v.student_weekly > 0 ? v.student_weekly : DEFAULT_WEEKLY_AUD;
  const trialDays = typeof v.trial_days === "number" && v.trial_days >= 0 ? Math.floor(v.trial_days) : DEFAULT_TRIAL_DAYS;
  return { weekly, trialDays };
}

/** The weekly AUD price to charge. Found by lookup key, created on first use. */
async function weeklyPriceId(stripe: Stripe, dollars: number): Promise<string> {
  if (process.env.STRIPE_PRICE_ID) return process.env.STRIPE_PRICE_ID;
  const cents = Math.round(dollars * 100);
  const lookupKey = `gradefarm_subject_weekly_aud_${cents}`;
  const find = async () => (await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })).data[0]?.id;
  const existing = await find();
  if (existing) return existing;
  try {
    const price = await stripe.prices.create({
      currency: "aud",
      unit_amount: cents,
      recurring: { interval: "week" },
      lookup_key: lookupKey,
      nickname: `$${dollars}/week per subject`,
      product_data: { name: "GradeFarm subject access" },
    });
    return price.id;
  } catch (err) {
    // Another request created it first.
    const raced = await find();
    if (raced) return raced;
    throw err;
  }
}

async function customerFor(admin: SupabaseClient, stripe: Stripe, userId: string): Promise<string> {
  const { data: row } = await admin
    .from("billing_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle<{ stripe_customer_id: string }>();
  if (row?.stripe_customer_id) return row.stripe_customer_id;

  const [{ data: authUser }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("profiles").select("display_name").eq("id", userId).maybeSingle<{ display_name: string | null }>(),
  ]);
  const customer = await stripe.customers.create(
    {
      email: authUser?.user?.email ?? undefined,
      name: profile?.display_name ?? undefined,
      metadata: { user_id: userId },
    },
    { idempotencyKey: `gradefarm-customer-${userId}` },
  );
  const { error } = await admin.from("billing_customers").insert({ user_id: userId, stripe_customer_id: customer.id });
  if (error) {
    // Lost a race with a concurrent request: use the stored one.
    const { data: again } = await admin
      .from("billing_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle<{ stripe_customer_id: string }>();
    if (again?.stripe_customer_id) return again.stripe_customer_id;
    throw new Error(error.message);
  }
  return customer.id;
}

type AccessRow = {
  id: string;
  active: boolean;
  source: string;
  stripe_subscription_id: string | null;
};

/**
 * Write a Stripe subscription's current state onto the student's access row.
 * Re-reads the subscription from Stripe, so out-of-order webhooks can't roll
 * a row back to an older state.
 */
export async function syncSubscription(admin: SupabaseClient, stripe: Stripe, subscriptionId: string): Promise<void> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const { user_id: userId, subject_name: subjectName, stage = "" } = sub.metadata ?? {};
  if (!userId || !subjectName) {
    logger.warn({ subscriptionId }, "billing: subscription without GradeFarm metadata");
    return;
  }

  const active = ACCESS_STATUSES.has(sub.status);
  const periodEnd = sub.items.data[0]?.current_period_end;
  const fields = {
    source: "stripe",
    status: sub.status,
    active,
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end || !!sub.cancel_at,
    updated_at: new Date().toISOString(),
  };

  // The row already linked to this subscription (its subject may have been renamed since).
  const { data: linked } = await admin
    .from("user_subscriptions").select("id").eq("stripe_subscription_id", sub.id).maybeSingle<{ id: string }>();
  if (linked) {
    const { error } = await admin.from("user_subscriptions").update(fields).eq("id", linked.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { data: existing } = await admin
    .from("user_subscriptions")
    .select("id, active, source, stripe_subscription_id")
    .eq("user_id", userId).eq("subject_name", subjectName).eq("stage", stage)
    .maybeSingle<AccessRow>();

  if (!existing) {
    const { error } = await admin.from("user_subscriptions").insert({ user_id: userId, subject_name: subjectName, stage, ...fields });
    if (error) throw new Error(error.message);
    return;
  }
  // Never let a dead subscription overwrite access that's live from elsewhere
  // (free beta/admin access, or a newer subscription for the same subject).
  if (existing.active && !active) return;
  if (existing.active && existing.source !== "stripe") {
    logger.warn({ subscriptionId, userId, subjectName }, "billing: paid subscription for a subject the student already has free");
    return;
  }
  const { error } = await admin.from("user_subscriptions").update(fields).eq("id", existing.id);
  if (error) throw new Error(error.message);
}

// GET /billing/config — what the app shows before checkout.
router.get("/billing/config", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const pricing = await readPricing(ctx.admin);
  const { count } = await ctx.admin
    .from("user_subscriptions").select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId).eq("source", "stripe");
  res.json({
    enabled: !!getStripe(),
    weekly: pricing.weekly,
    currency: "AUD",
    trialDays: (count ?? 0) === 0 ? pricing.trialDays : 0,
  });
});

// POST /billing/checkout — { curriculumId } → { url } of a Stripe Checkout page.
router.post("/billing/checkout", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const stripe = getStripe();
  if (!stripe) return notConfigured(res);
  const { admin, userId } = ctx;

  const curriculumId = typeof req.body?.curriculumId === "string" ? req.body.curriculumId : "";
  if (!curriculumId) return void res.status(400).json({ error: "curriculumId required" });
  const { data: cur } = await admin
    .from("curricula").select("id, name, level_label, status, archived_at").eq("id", curriculumId)
    .maybeSingle<{ id: string; name: string; level_label: string | null; status: string; archived_at: string | null }>();
  if (!cur || cur.archived_at || !["live", "generating"].includes(cur.status)) {
    return void res.status(404).json({ error: "Subject not found" });
  }
  const subjectName = cur.name;
  const stage = (cur.level_label || "").trim();
  const label = stage && !subjectName.includes(stage) ? `${subjectName} ${stage}` : subjectName;

  const { data: current } = await admin
    .from("user_subscriptions").select("id, active")
    .eq("user_id", userId).eq("subject_name", subjectName).eq("stage", stage).maybeSingle<{ id: string; active: boolean }>();
  if (current?.active) return void res.status(409).json({ error: "You already have access to this subject." });

  try {
    const pricing = await readPricing(admin);
    const [priceId, customer, priorPaid] = await Promise.all([
      weeklyPriceId(stripe, pricing.weekly),
      customerFor(admin, stripe, userId),
      admin.from("user_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("source", "stripe"),
    ]);
    // One free trial per student: their first paid subject.
    const trialDays = (priorPaid.count ?? 0) === 0 ? pricing.trialDays : 0;
    const metadata = { user_id: userId, subject_name: subjectName, stage, curriculum_id: cur.id };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: "always",
      allow_promotion_codes: true,
      subscription_data: {
        description: `GradeFarm — ${label}`,
        metadata,
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      },
      metadata,
      success_url: `${appUrl()}/subject-picker?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/subject-picker?checkout=cancelled`,
    });
    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "billing: checkout failed");
    res.status(502).json({ error: "Couldn't start checkout. Please try again." });
  }
});

// POST /billing/sync — { sessionId } after returning from Checkout, so access
// unlocks immediately even if the webhook is slow.
router.post("/billing/sync", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const stripe = getStripe();
  if (!stripe) return notConfigured(res);
  const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
  if (!sessionId.startsWith("cs_")) return void res.status(400).json({ error: "sessionId required" });
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.client_reference_id !== ctx.userId) return void res.status(403).json({ error: "Forbidden" });
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (subId) await syncSubscription(ctx.admin, stripe, subId);
    res.json({ ok: true, complete: session.status === "complete" });
  } catch (err) {
    logger.error({ err }, "billing: sync failed");
    res.status(502).json({ error: "Couldn't confirm your payment yet." });
  }
});

// POST /billing/portal → { url } of the Stripe customer portal (cards, invoices, cancel).
router.post("/billing/portal", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const stripe = getStripe();
  if (!stripe) return notConfigured(res);
  const { data: row } = await ctx.admin
    .from("billing_customers").select("stripe_customer_id").eq("user_id", ctx.userId).maybeSingle<{ stripe_customer_id: string }>();
  if (!row) return void res.status(404).json({ error: "No billing account yet." });
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${appUrl()}/my-account`,
    });
    res.json({ url: portal.url });
  } catch (err) {
    logger.error({ err }, "billing: portal failed");
    res.status(502).json({ error: "Couldn't open billing. Please try again." });
  }
});

// POST /billing/webhook — Stripe events. Needs the raw body (captured in app.ts).
router.post("/billing/webhook", async (req: Request, res: Response) => {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return notConfigured(res);
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  const signature = req.get("stripe-signature");
  if (!raw || !signature) return void res.status(400).json({ error: "Missing body or signature" });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return void res.status(400).json({ error: "Invalid signature" });
  }

  try {
    const admin = getServiceClient();
    if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
      if (subId) await syncSubscription(admin, stripe, subId);
    } else if (event.type.startsWith("customer.subscription.")) {
      await syncSubscription(admin, stripe, (event.data.object as Stripe.Subscription).id);
    }
    res.json({ received: true });
  } catch (err) {
    // 500 → Stripe retries later.
    logger.error({ err, type: event.type }, "billing: webhook handling failed");
    res.status(500).json({ error: "Webhook handling failed" });
  }
});

export default router;
