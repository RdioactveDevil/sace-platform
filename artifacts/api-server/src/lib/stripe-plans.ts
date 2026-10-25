import type Stripe from "stripe";

// Stripe pieces shared by student plans (routes/billing.ts) and tutor plans
// (lib/tutor-plan.ts, routes/tutor-billing.ts).

/** Statuses that keep a plan's access open (past_due: Stripe is still retrying the card). */
export const ACCESS_STATUSES = new Set<Stripe.Subscription.Status>(["trialing", "active", "past_due"]);

/** The active price with this lookup key, created from `params` on first use. */
export async function priceByLookupKey(
  stripe: Stripe, lookupKey: string, params: Omit<Stripe.PriceCreateParams, "lookup_key">,
): Promise<string> {
  const find = async () => (await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })).data[0]?.id;
  const existing = await find();
  if (existing) return existing;
  try {
    return (await stripe.prices.create({ ...params, lookup_key: lookupKey })).id;
  } catch (err) {
    const raced = await find(); // another request created it first
    if (raced) return raced;
    throw err;
  }
}

/** When the subscription's current period ends, as an ISO string. */
export function periodEnd(sub: Stripe.Subscription): string | null {
  const end = sub.items.data[0]?.current_period_end;
  return end ? new Date(end * 1000).toISOString() : null;
}
