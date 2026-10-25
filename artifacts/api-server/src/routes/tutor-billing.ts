import { Router, type Request, type Response } from "express";
import type Stripe from "stripe";
import { requireUser } from "../lib/auth";
import { logger } from "../lib/logger";
import { ACCESS_STATUSES, priceByLookupKey } from "../lib/stripe-plans";
import {
  TUTOR_PLAN_KIND, isTutorPlanInterval, planIsLive, studentsUsed, syncTutorSubscription, tutorBillingRow, tutorPlanOptions,
  type TutorPlanInterval, type TutorPlanOption,
} from "../lib/tutor-plan";
import { appUrl, currentCustomerRow, customerFor, getStripe, isMissing, notConfigured, readPricing } from "./billing";

// Tutor plans: the tutor portal's monthly or annual fee (lib/tutor-plan.ts has
// the rules). The first plan goes through Stripe Checkout; changing plan or
// billing period later updates the subscription in place, prorated. Checkout
// returns to /tutor, which confirms it with POST /billing/sync, and the
// webhook in routes/billing.ts keeps tutor_billing up to date.

const router = Router();

const fail = (res: Response, status: number, error: string) => void res.status(status).json({ error });

/** The Stripe price for a plan and billing period at today's prices. */
function tutorPriceId(stripe: Stripe, plan: TutorPlanOption, interval: TutorPlanInterval): Promise<string> {
  const dollars = interval === "year" ? plan.annual : plan.monthly;
  const cents = Math.round(dollars * 100);
  const slug = plan.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "plan";
  return priceByLookupKey(stripe, `gradefarm_tutor_${slug}_${interval}ly_aud_${cents}`, {
    currency: "aud",
    unit_amount: cents,
    recurring: { interval },
    nickname: `Tutor ${plan.name}: $${dollars} per ${interval}`,
    product_data: { name: `GradeFarm tutor plan: ${plan.name}` },
  });
}

async function requireTutorCaller(req: Request, res: Response) {
  const caller = await requireUser(req, res);
  if (!caller) return null;
  if (!caller.isTutor && !caller.isAdmin) {
    res.status(403).json({ error: "Forbidden: caller is not a tutor" });
    return null;
  }
  return caller;
}

// GET /tutor-billing/status — the plans on offer and the tutor's own plan.
router.get("/tutor-billing/status", async (req: Request, res: Response) => {
  const caller = await requireTutorCaller(req, res);
  if (!caller) return;
  const { admin, userId, isAdmin } = caller;
  try {
    const [row, pricing, used] = await Promise.all([
      tutorBillingRow(admin, userId), readPricing(admin), studentsUsed(admin, userId),
    ]);
    const { plans, annualDiscount } = tutorPlanOptions(pricing);
    const exempt = isAdmin || !!row?.exempt;
    const paying = !!row?.status && ACCESS_STATUSES.has(row.status as Stripe.Subscription.Status);
    res.json({
      enabled: !!getStripe(),
      currency: "AUD",
      plans,
      annualDiscount,
      active: isAdmin || planIsLive(row),
      exempt,
      // The tutor's subscription, if they have one running.
      plan: paying ? row?.plan ?? null : null,
      interval: paying ? row?.interval ?? null : null,
      status: row?.status ?? null,
      renewsAt: paying ? row?.current_period_end ?? null : null,
      endsAtPeriodEnd: paying && !!row?.cancel_at_period_end,
      studentLimit: exempt || !paying ? null : row?.student_limit ?? null,
      studentsUsed: used,
    });
  } catch (err) {
    logger.error({ err }, "tutor billing: status failed");
    fail(res, 500, "Couldn't load your tutor plan.");
  }
});

// POST /tutor-billing/plan — { plan, interval: 'month' | 'year' }: subscribe
// ({ url } for Stripe Checkout) or move a running plan to another plan or
// billing period ({ ok: true }).
router.post("/tutor-billing/plan", async (req: Request, res: Response) => {
  const caller = await requireTutorCaller(req, res);
  if (!caller) return;
  const stripe = getStripe();
  if (!stripe) return notConfigured(res);
  const { admin, userId, isAdmin } = caller;
  if (isAdmin) return fail(res, 400, "Admins don't need a tutor plan.");
  const interval = req.body?.interval;
  if (!isTutorPlanInterval(interval)) return fail(res, 400, "interval must be month or year");

  try {
    const { plans } = tutorPlanOptions(await readPricing(admin));
    const plan = plans.find((p) => p.name === req.body?.plan);
    if (!plan) return fail(res, 404, "That plan isn't available.");
    const metadata = { kind: TUTOR_PLAN_KIND, user_id: userId, plan: plan.name, students: plan.students == null ? "" : String(plan.students) };
    const priceId = await tutorPriceId(stripe, plan, interval);

    const row = await tutorBillingRow(admin, userId);
    const current = row?.stripe_subscription_id
      ? await stripe.subscriptions.retrieve(row.stripe_subscription_id).catch((err) => {
          if (isMissing(err)) return null;
          throw err;
        })
      : null;
    if (current && ACCESS_STATUSES.has(current.status)) {
      const item = current.items.data[0];
      if (item.price.id === priceId && !current.cancel_at_period_end) return fail(res, 409, "You're already on that plan.");
      const updated = await stripe.subscriptions.update(current.id, {
        items: [{ id: item.id, price: priceId }],
        metadata,
        proration_behavior: "create_prorations",
        // Choosing a plan again keeps one that was set to end.
        ...(current.cancel_at_period_end ? { cancel_at_period_end: false } : {}),
      });
      await syncTutorSubscription(admin, updated);
      return void res.json({ ok: true });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: await customerFor(admin, stripe, userId),
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { description: `GradeFarm tutor plan: ${plan.name}`, metadata },
      metadata,
      custom_text: {
        submit: { message: plan.students == null ? `${plan.name}: unlimited students.` : `${plan.name}: up to ${plan.students} students.` },
      },
      success_url: `${appUrl()}/tutor?plan_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/tutor?plan_checkout=cancelled`,
    });
    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "tutor billing: choose plan failed");
    fail(res, 502, "Couldn't update your tutor plan. Please try again.");
  }
});

// POST /tutor-billing/portal → { url } of the Stripe customer portal (card, receipts, cancel).
router.post("/tutor-billing/portal", async (req: Request, res: Response) => {
  const caller = await requireTutorCaller(req, res);
  if (!caller) return;
  const stripe = getStripe();
  if (!stripe) return notConfigured(res);
  try {
    const row = await currentCustomerRow(caller.admin, stripe, caller.userId);
    if (!row) return fail(res, 404, "No billing account yet.");
    const portal = await stripe.billingPortal.sessions.create({ customer: row.stripe_customer_id, return_url: `${appUrl()}/tutor` });
    res.json({ url: portal.url });
  } catch (err) {
    logger.error({ err }, "tutor billing: portal failed");
    fail(res, 502, "Couldn't open billing. Please try again.");
  }
});

export default router;
