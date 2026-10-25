import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, getServiceClient } from "../lib/auth";
import { logger } from "../lib/logger";

// Student access and billing.
//
// Every student may pick one free subject (limited questions per day, counted
// by the use_free_question() database function). Paid subjects live on ONE
// Stripe subscription per student whose quantity is the number of paid
// subjects, on a graduated weekly AUD price: $7 for the first subject, $6 for
// the second, $5 for each one after (platform_settings.pricing.student_tiers).
// A plan keeps the price it started on when the prices change; what the app
// shows a student with a plan comes from their own Stripe price.
// The first paid subject goes through Stripe Checkout; later ones are added to
// (or removed from) the existing subscription in-app, prorated.
//
// Which subjects are paid for is recorded in user_subscriptions (source =
// 'stripe', linked by stripe_subscription_id); the subscription's state comes
// from Stripe — the webhook and post-checkout sync re-read it before writing.
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.

const router = Router();

const DEFAULT_TIERS_AUD = [7, 6, 5];
/** Statuses that keep paid subjects unlocked (past_due: Stripe is still retrying the card). */
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

const fail = (res: Response, status: number, error: string) => void res.status(status).json({ error });

/** $/week for the 1st, 2nd, … subject; the last tier applies to every further subject. */
async function readTiers(admin: SupabaseClient): Promise<number[]> {
  const { data } = await admin.from("platform_settings").select("value").eq("key", "pricing").maybeSingle();
  const raw = (data?.value as { student_tiers?: unknown } | null)?.student_tiers;
  const tiers = Array.isArray(raw) ? raw.filter((n): n is number => typeof n === "number" && n > 0) : [];
  return tiers.length ? tiers : DEFAULT_TIERS_AUD;
}

/** Price of the nth paid subject (1-based). */
export const tierPrice = (tiers: number[], n: number) => tiers[Math.min(n, tiers.length) - 1];
/** Weekly total for `count` paid subjects. */
export const planTotal = (tiers: number[], count: number) =>
  Array.from({ length: count }, (_, i) => tierPrice(tiers, i + 1)).reduce((a, b) => a + b, 0);

/** The graduated weekly price for these tiers. Found by lookup key, created on first use. */
async function planPriceId(stripe: Stripe, tiers: number[]): Promise<string> {
  const cents = tiers.map((d) => Math.round(d * 100));
  const lookupKey = `gradefarm_subjects_weekly_aud_${cents.join("_")}`;
  const find = async () => (await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })).data[0]?.id;
  const existing = await find();
  if (existing) return existing;
  try {
    const price = await stripe.prices.create({
      currency: "aud",
      recurring: { interval: "week" },
      billing_scheme: "tiered",
      tiers_mode: "graduated",
      tiers: cents.map((unit_amount, i) => ({ up_to: i === cents.length - 1 ? "inf" : i + 1, unit_amount })),
      lookup_key: lookupKey,
      nickname: `Subjects: ${tiers.map((d) => `$${d}`).join(" / ")} per week`,
      product_data: { name: "GradeFarm subjects" },
    });
    return price.id;
  } catch (err) {
    const raced = await find(); // another request created it first
    if (raced) return raced;
    throw err;
  }
}

/** $ per subject on the plan's own Stripe price (needs `items.data.price.tiers` expanded). */
function subscriptionTiers(sub: Stripe.Subscription): number[] | null {
  const tiers = sub.items.data[0]?.price.tiers;
  if (!tiers?.length) return null;
  return tiers.map((t) => (t.unit_amount ?? 0) / 100);
}

type CustomerRow = { stripe_customer_id: string; stripe_subscription_id: string | null };

async function customerRow(admin: SupabaseClient, userId: string): Promise<CustomerRow | null> {
  const { data } = await admin
    .from("billing_customers").select("stripe_customer_id, stripe_subscription_id").eq("user_id", userId).maybeSingle<CustomerRow>();
  return data ?? null;
}

/** Stripe has no such object in this account and mode, e.g. a sandbox ID after switching to live keys. */
const isMissing = (err: unknown) => err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing";

/** The student's billing row, dropped (→ null) if Stripe doesn't have its customer, so a new one gets made. */
async function currentCustomerRow(admin: SupabaseClient, stripe: Stripe, userId: string): Promise<CustomerRow | null> {
  const row = await customerRow(admin, userId);
  if (!row) return null;
  const customer = await stripe.customers.retrieve(row.stripe_customer_id).catch((err) => {
    if (isMissing(err)) return null;
    throw err;
  });
  if (customer && !customer.deleted) return row;
  logger.warn({ userId }, "billing: dropping a Stripe customer this account doesn't have");
  const { error } = await admin.from("billing_customers").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
  return null;
}

async function customerFor(admin: SupabaseClient, stripe: Stripe, userId: string): Promise<string> {
  const row = await currentCustomerRow(admin, stripe, userId);
  if (row) return row.stripe_customer_id;
  const [{ data: authUser }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("profiles").select("display_name").eq("id", userId).maybeSingle<{ display_name: string | null }>(),
  ]);
  const customer = await stripe.customers.create(
    { email: authUser?.user?.email ?? undefined, name: profile?.display_name ?? undefined, metadata: { user_id: userId } },
    { idempotencyKey: `gradefarm-customer-${userId}` },
  );
  const { error } = await admin.from("billing_customers").insert({ user_id: userId, stripe_customer_id: customer.id });
  if (error) {
    const again = await customerRow(admin, userId); // lost a race with a concurrent request
    if (again) return again.stripe_customer_id;
    throw new Error(error.message);
  }
  return customer.id;
}

/** The student's subscription if it can still carry subjects (not cancelled / expired), with its price's tiers. */
async function liveSubscription(admin: SupabaseClient, stripe: Stripe, userId: string): Promise<Stripe.Subscription | null> {
  const row = await customerRow(admin, userId);
  if (!row?.stripe_subscription_id) return null;
  const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, { expand: ["items.data.price.tiers"] }).catch((err) => {
    if (isMissing(err)) return null;
    throw err;
  });
  return sub && ACCESS_STATUSES.has(sub.status) ? sub : null;
}

export type Curriculum = { id: string; name: string; stage: string; label: string };

export async function liveCurriculum(admin: SupabaseClient, id: unknown): Promise<Curriculum | null> {
  if (typeof id !== "string" || !id) return null;
  const { data: cur } = await admin
    .from("curricula").select("id, name, level_label, status, archived_at").eq("id", id)
    .maybeSingle<{ id: string; name: string; level_label: string | null; status: string; archived_at: string | null }>();
  if (!cur || cur.archived_at || !["live", "generating"].includes(cur.status)) return null;
  const stage = (cur.level_label || "").trim();
  return { id: cur.id, name: cur.name, stage, label: stage && !cur.name.includes(stage) ? `${cur.name} ${stage}` : cur.name };
}

type AccessRow = { id: string; active: boolean; source: string; stripe_subscription_id: string | null };

async function accessRow(admin: SupabaseClient, userId: string, cur: Curriculum): Promise<AccessRow | null> {
  const { data } = await admin
    .from("user_subscriptions").select("id, active, source, stripe_subscription_id")
    .eq("user_id", userId).eq("subject_name", cur.name).eq("stage", cur.stage).maybeSingle<AccessRow>();
  return data ?? null;
}

const subFields = (sub: Stripe.Subscription) => {
  const periodEnd = sub.items.data[0]?.current_period_end;
  return {
    status: sub.status,
    active: ACCESS_STATUSES.has(sub.status),
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end || !!sub.cancel_at,
    updated_at: new Date().toISOString(),
  };
};

/** Make `cur` a paid subject on `sub` (creating, converting or relinking the student's row). */
async function attachPaidSubject(admin: SupabaseClient, userId: string, cur: Curriculum, sub: Stripe.Subscription) {
  const fields = { source: "stripe", sponsor_tutor_id: null, ...subFields(sub) };
  const existing = await accessRow(admin, userId, cur);
  if (existing) {
    const { error } = await admin.from("user_subscriptions").update(fields).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("user_subscriptions").insert({ user_id: userId, subject_name: cur.name, stage: cur.stage, ...fields });
    if (error) throw new Error(error.message);
  }
}

async function paidRows(admin: SupabaseClient, subscriptionId: string): Promise<{ id: string }[]> {
  const { data } = await admin
    .from("user_subscriptions").select("id").eq("stripe_subscription_id", subscriptionId).eq("source", "stripe");
  return data ?? [];
}

/** Set the plan's quantity to `quantity` paid subjects, prorating the change. */
async function setQuantity(stripe: Stripe, sub: Stripe.Subscription, quantity: number) {
  const item = sub.items.data[0];
  return stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, quantity }],
    proration_behavior: "create_prorations",
    // Adding a subject to a plan that was set to end keeps it going.
    ...(sub.cancel_at_period_end ? { cancel_at_period_end: false } : {}),
  });
}

/**
 * Write a Stripe subscription's current state onto the student's rows. Re-reads
 * it from Stripe so out-of-order webhooks can't roll access back. A
 * subscription fresh from Checkout carries the first subject in its metadata.
 */
export async function syncSubscription(admin: SupabaseClient, stripe: Stripe, subscriptionId: string): Promise<void> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = sub.metadata?.user_id;
  if (!userId) {
    logger.warn({ subscriptionId }, "billing: subscription without GradeFarm metadata");
    return;
  }

  const live = ACCESS_STATUSES.has(sub.status);
  if (live) {
    await admin.from("billing_customers").update({ stripe_subscription_id: sub.id }).eq("user_id", userId);
    if ((await paidRows(admin, sub.id)).length === 0) {
      const cur = await liveCurriculum(admin, sub.metadata?.curriculum_id);
      if (cur) await attachPaidSubject(admin, userId, cur, sub);
    }
  }
  const { error } = await admin.from("user_subscriptions").update(subFields(sub)).eq("stripe_subscription_id", sub.id).eq("source", "stripe");
  if (error) throw new Error(error.message);
}

// GET /billing/config — prices and the student's plan, for the app.
router.get("/billing/config", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const tiers = await readTiers(ctx.admin);
  const { data: rows } = await ctx.admin
    .from("user_subscriptions").select("source, active, cancel_at_period_end, current_period_end")
    .eq("user_id", ctx.userId).eq("source", "stripe").eq("active", true);
  const paid = rows ?? [];
  const stripe = getStripe();
  // A plan started before a price change is still charged its old prices.
  let planTiers = tiers;
  if (stripe && paid.length > 0) {
    const sub = await liveSubscription(ctx.admin, stripe, ctx.userId).catch((err) => {
      logger.warn({ err }, "billing: couldn't read the student's plan prices");
      return null;
    });
    planTiers = (sub && subscriptionTiers(sub)) ?? tiers;
  }
  const { data: freeLimit } = await ctx.admin.rpc("free_question_limit");
  res.json({
    enabled: !!stripe,
    currency: "AUD",
    tiers,
    planTiers,
    paidCount: paid.length,
    weeklyTotal: planTotal(planTiers, paid.length),
    nextPrice: tierPrice(planTiers, paid.length + 1),
    hasPlan: paid.length > 0,
    renewsAt: paid[0]?.current_period_end ?? null,
    endsAtPeriodEnd: paid.length > 0 && paid.every((r) => r.cancel_at_period_end),
    freeDailyQuestions: typeof freeLimit === "number" ? freeLimit : 20,
  });
});

// POST /billing/free-subject — { curriculumId }: make it the student's one free subject.
router.post("/billing/free-subject", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const { admin, userId } = ctx;
  const cur = await liveCurriculum(admin, req.body?.curriculumId);
  if (!cur) return fail(res, 404, "Subject not found");
  const existing = await accessRow(admin, userId, cur);
  if (existing?.active && existing.source !== "free") return fail(res, 409, "You already have full access to this subject.");

  // Swap: drop the current free subject, then take this one.
  const { error: delErr } = await admin.from("user_subscriptions").delete().eq("user_id", userId).eq("source", "free");
  if (delErr) return fail(res, 500, delErr.message);
  const free = {
    source: "free", active: true, status: null, stripe_subscription_id: null, stripe_customer_id: null, sponsor_tutor_id: null,
    current_period_end: null, cancel_at_period_end: false, updated_at: new Date().toISOString(),
  };
  const { error } = existing && existing.source !== "free"
    ? await admin.from("user_subscriptions").update(free).eq("id", existing.id) // e.g. a lapsed paid row
    : await admin.from("user_subscriptions").insert({ user_id: userId, subject_name: cur.name, stage: cur.stage, ...free });
  if (error) return fail(res, 500, error.message);
  res.json({ ok: true });
});

// POST /billing/subjects — { curriculumId }: pay for a subject. The first one
// returns { url } for Stripe Checkout; later ones are added to the plan and
// return { added: true, weeklyTotal }.
router.post("/billing/subjects", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const stripe = getStripe();
  if (!stripe) return notConfigured(res);
  const { admin, userId } = ctx;
  const cur = await liveCurriculum(admin, req.body?.curriculumId);
  if (!cur) return fail(res, 404, "Subject not found");
  const existing = await accessRow(admin, userId, cur);
  if (existing?.active && existing.source !== "free") return fail(res, 409, "You already have full access to this subject.");

  try {
    const tiers = await readTiers(admin);
    const sub = await liveSubscription(admin, stripe, userId);
    if (sub) {
      const before = (await paidRows(admin, sub.id)).length;
      const updated = await setQuantity(stripe, sub, before + 1);
      try {
        await attachPaidSubject(admin, userId, cur, updated);
      } catch (err) {
        await setQuantity(stripe, updated, before).catch(() => {}); // don't bill for a subject we couldn't unlock
        throw err;
      }
      await admin.from("user_subscriptions").update(subFields(updated)).eq("stripe_subscription_id", updated.id).eq("source", "stripe");
      return void res.json({ added: true, weeklyTotal: planTotal(subscriptionTiers(sub) ?? tiers, before + 1) });
    }

    const [priceId, customer] = await Promise.all([planPriceId(stripe, tiers), customerFor(admin, stripe, userId)]);
    const metadata = { user_id: userId, curriculum_id: cur.id };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { description: "GradeFarm subjects", metadata },
      metadata,
      custom_text: { submit: { message: `Starts with ${cur.label}. Add more subjects later for $${tierPrice(tiers, 2)}/week, then $${tierPrice(tiers, 3)}/week each.` } },
      success_url: `${appUrl()}/subject-picker?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/subject-picker?checkout=cancelled`,
    });
    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "billing: add subject failed");
    fail(res, 502, "Couldn't update your plan. Please try again.");
  }
});

/**
 * Stop paying for one paid subject row. Other subjects drop off now with the
 * unused time credited to the next bill. The last one ends the plan: at the
 * end of the paid week (the student's choice) or now (`endNow`, admin revoke).
 */
export async function removePaidSubject(
  admin: SupabaseClient, stripe: Stripe, row: { id: string; stripe_subscription_id: string }, { endNow = false } = {},
): Promise<{ endsAt: string | null }> {
  const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
  const remaining = (await paidRows(admin, sub.id)).filter((r) => r.id !== row.id).length;
  if (remaining === 0 && !endNow) {
    const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    await admin.from("user_subscriptions").update(subFields(updated)).eq("stripe_subscription_id", sub.id).eq("source", "stripe");
    return { endsAt: subFields(updated).current_period_end };
  }
  if (remaining === 0) {
    if (ACCESS_STATUSES.has(sub.status)) await stripe.subscriptions.cancel(sub.id);
  } else {
    await setQuantity(stripe, sub, remaining);
  }
  const { error } = await admin.from("user_subscriptions").delete().eq("id", row.id);
  if (error) throw new Error(error.message);
  return { endsAt: null };
}

/**
 * End every subscription the student's Stripe customer still has, now, before
 * their account is deleted, so nothing bills an account that no longer
 * exists. The customer itself stays in Stripe for payment records.
 */
export async function cancelAllSubscriptions(admin: SupabaseClient, stripe: Stripe, userId: string): Promise<void> {
  const row = await customerRow(admin, userId);
  if (!row) return;
  const subs = await stripe.subscriptions
    .list({ customer: row.stripe_customer_id, status: "all", limit: 100 })
    .catch((err) => {
      if (isMissing(err)) return null;
      throw err;
    });
  for (const sub of subs?.data ?? []) {
    if (sub.status === "canceled" || sub.status === "incomplete_expired") continue;
    await stripe.subscriptions.cancel(sub.id);
  }
}

/** Point the student's Stripe customer (receipts, portal) at their current sign-in email. */
export async function syncCustomerEmail(admin: SupabaseClient, stripe: Stripe, userId: string): Promise<boolean> {
  const row = await customerRow(admin, userId);
  if (!row) return false;
  const { data } = await admin.auth.admin.getUserById(userId);
  const email = data?.user?.email;
  if (!email) return false;
  const customer = await stripe.customers.retrieve(row.stripe_customer_id).catch((err) => {
    if (isMissing(err)) return null;
    throw err;
  });
  if (!customer || customer.deleted || customer.email === email) return false;
  await stripe.customers.update(customer.id, { email });
  return true;
}

// DELETE /billing/subjects/:rowId — the student stops paying for a subject.
router.delete("/billing/subjects/:rowId", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const stripe = getStripe();
  if (!stripe) return notConfigured(res);
  const { admin, userId } = ctx;
  const { data: row } = await admin
    .from("user_subscriptions").select("id, source, stripe_subscription_id")
    .eq("id", req.params.rowId).eq("user_id", userId)
    .maybeSingle<{ id: string; source: string; stripe_subscription_id: string | null }>();
  if (!row || row.source !== "stripe" || !row.stripe_subscription_id) return fail(res, 404, "Paid subject not found");

  try {
    const { endsAt } = await removePaidSubject(admin, stripe, { id: row.id, stripe_subscription_id: row.stripe_subscription_id });
    res.json({ ok: true, endsAt });
  } catch (err) {
    logger.error({ err }, "billing: remove subject failed");
    fail(res, 502, "Couldn't update your plan. Please try again.");
  }
});

// POST /billing/sync — { sessionId } after returning from Checkout, so the
// subject unlocks immediately even if the webhook is slow.
router.post("/billing/sync", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const stripe = getStripe();
  if (!stripe) return notConfigured(res);
  const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
  if (!sessionId.startsWith("cs_")) return fail(res, 400, "sessionId required");
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.client_reference_id !== ctx.userId) return fail(res, 403, "Forbidden");
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (subId) await syncSubscription(ctx.admin, stripe, subId);
    res.json({ ok: true, complete: session.status === "complete" });
  } catch (err) {
    logger.error({ err }, "billing: sync failed");
    fail(res, 502, "Couldn't confirm your payment yet.");
  }
});

// POST /billing/portal → { url } of the Stripe customer portal (card, receipts, cancel plan).
router.post("/billing/portal", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const stripe = getStripe();
  if (!stripe) return notConfigured(res);
  try {
    const row = await currentCustomerRow(ctx.admin, stripe, ctx.userId);
    if (!row) return fail(res, 404, "No billing account yet.");
    const portal = await stripe.billingPortal.sessions.create({ customer: row.stripe_customer_id, return_url: `${appUrl()}/my-account` });
    res.json({ url: portal.url });
  } catch (err) {
    logger.error({ err }, "billing: portal failed");
    fail(res, 502, "Couldn't open billing. Please try again.");
  }
});

// POST /billing/webhook — Stripe events. Needs the raw body (captured in app.ts).
router.post("/billing/webhook", async (req: Request, res: Response) => {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return notConfigured(res);
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  const signature = req.get("stripe-signature");
  if (!raw || !signature) return fail(res, 400, "Missing body or signature");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return fail(res, 400, "Invalid signature");
  }

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
      if (subId) await syncSubscription(getServiceClient(), stripe, subId);
    } else if (event.type.startsWith("customer.subscription.")) {
      await syncSubscription(getServiceClient(), stripe, (event.data.object as Stripe.Subscription).id);
    }
    res.json({ received: true });
  } catch (err) {
    // 500 → Stripe retries later.
    logger.error({ err, type: event.type }, "billing: webhook handling failed");
    fail(res, 500, "Webhook handling failed");
  }
});

export default router;
