import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";
import { appUrl, getResend, sendEmail } from "./email";
import { syncSubscription } from "../routes/billing";

// Pay first, sign up after (routes/guest-checkout.ts). Someone who isn't
// signed in picks a subject on /start and pays through Stripe Checkout, which
// collects their email. claimGuestCheckout then turns that payment into a
// normal student plan: it finds the account with that email or creates one
// (no password yet), points the subscription and Stripe customer at it and
// unlocks the subject. It runs from the webhook and again from /welcome, so
// whichever comes first does the work.
//
// A new account is marked with the checkout that made it
// (app_metadata.checkout_session). Only that checkout's buyer, back on
// /welcome soon after paying, gets a one-time link that signs them straight in
// to choose a password. An email that already had an account never gets one:
// otherwise paying with someone else's address would open their account.

/** metadata.checkout on a pay-first Checkout session and its subscription. */
export const GUEST_CHECKOUT = "guest";
/** How long after paying /welcome can still sign the buyer straight in. */
const INSTANT_SIGN_IN_FOR_MS = 2 * 60 * 60 * 1000;

export type GuestClaim =
  | { status: "pending" }
  | { status: "ready"; userId: string; email: string; createdHere: boolean };

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

async function findUserByEmail(admin: SupabaseClient, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(error.message);
  return data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
}

/** The account for this checkout's email, made if there isn't one. */
async function accountFor(admin: SupabaseClient, email: string, name: string | null, sessionId: string) {
  const existing = await findUserByEmail(admin, email);
  if (existing) return existing;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true, // Stripe has the address and it's paid for; the password email goes there
    user_metadata: name ? { display_name: name } : {},
    app_metadata: { checkout_session: sessionId },
  });
  if (data?.user) return data.user;
  const raced = await findUserByEmail(admin, email); // the webhook and /welcome made it at once
  if (raced) return raced;
  throw new Error(error?.message ?? "Could not create the account");
}

/** Turn a completed pay-first checkout into the buyer's account and plan. Safe to run more than once. */
export async function claimGuestCheckout(admin: SupabaseClient, stripe: Stripe, sessionId: string): Promise<GuestClaim> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.checkout !== GUEST_CHECKOUT) throw new Error("Not a pay-first checkout");
  const subId = idOf(session.subscription);
  const customerId = idOf(session.customer);
  const email = session.customer_details?.email?.trim().toLowerCase();
  if (session.status !== "complete" || !subId || !customerId || !email) return { status: "pending" };

  const user = await accountFor(admin, email, session.customer_details?.name ?? null, session.id);
  const createdHere = user.app_metadata?.checkout_session === session.id;

  const sub = await stripe.subscriptions.retrieve(subId);
  if (sub.metadata?.user_id !== user.id) {
    await Promise.all([
      stripe.subscriptions.update(subId, { metadata: { ...sub.metadata, user_id: user.id } }),
      stripe.customers.update(customerId, { metadata: { user_id: user.id } }),
    ]);
  }
  // Their Stripe customer, unless they already had one (an existing account
  // keeps it; this subscription still works, it's just billed separately).
  const { data: row } = await admin
    .from("billing_customers").select("stripe_customer_id").eq("user_id", user.id).maybeSingle<{ stripe_customer_id: string }>();
  if (!row) {
    const { error } = await admin.from("billing_customers").insert({ user_id: user.id, stripe_customer_id: customerId });
    if (error && !(await admin.from("billing_customers").select("user_id").eq("user_id", user.id).maybeSingle()).data) {
      throw new Error(error.message);
    }
  } else if (row.stripe_customer_id !== customerId) {
    logger.info({ userId: user.id }, "guest checkout: paid with the email of an account that already pays");
  }
  await syncSubscription(admin, stripe, subId);

  if (createdHere) await sendPasswordEmail(admin, user.id, email).catch((err) => logger.error({ err }, "guest checkout: password email failed"));
  return { status: "ready", userId: user.id, email, createdHere };
}

/** A recovery link: signs the user in on /reset-password to choose a password. */
async function passwordLink(admin: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${appUrl()}/reset-password` },
  });
  if (error || !data?.properties?.action_link) throw new Error(error?.message ?? "Could not make a sign-in link");
  return data.properties.action_link;
}

/**
 * For /welcome: a one-time link that signs the buyer straight in, if this
 * checkout made their account, it was paid for recently and no link has
 * been handed out for it yet. Null otherwise (they sign in normally).
 */
export async function instantSignInLink(admin: SupabaseClient, stripe: Stripe, sessionId: string, claim: GuestClaim): Promise<string | null> {
  if (claim.status !== "ready" || !claim.createdHere) return null;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (Date.now() - session.created * 1000 > INSTANT_SIGN_IN_FOR_MS) return null;
  const subId = idOf(session.subscription);
  if (!subId) return null;
  const sub = await stripe.subscriptions.retrieve(subId);
  if (sub.metadata?.welcome_sign_in_at) return null;
  await stripe.subscriptions.update(subId, { metadata: { ...sub.metadata, welcome_sign_in_at: new Date().toISOString() } });
  return passwordLink(admin, claim.email);
}

/**
 * The new account's welcome email: their subject is unlocked and here's how
 * to set a password. Claimed as the "welcome" email so the usual welcome
 * (lib/automated-emails.ts) doesn't follow it.
 */
async function sendPasswordEmail(admin: SupabaseClient, userId: string, email: string): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const { data: claimed, error } = await admin.rpc("claim_email", { p_kind: "welcome", p_ref_id: userId, p_recipient_id: userId });
  if (error) throw new Error(error.message);
  if (claimed !== true) return;
  const result = await sendEmail(resend, {
    to: email,
    subject: "Your gradefarm. account is ready",
    idempotencyKey: `welcome:${userId}:${userId}`,
    content: {
      heading: "You're in. Set your password",
      paragraphs: [
        "Thanks for subscribing. Your subject is unlocked with unlimited questions and Titan AI help.",
        "Choose a password to finish setting up your account. The button works once and only for a short time; after that, use \"Forgot password\" on the sign-in page with this email address.",
      ],
      cta: { label: "Set my password", url: await passwordLink(admin, email) },
      footer: "You're receiving this because you paid for a gradefarm. subscription with this email address.",
    },
  });
  await admin
    .from("email_log")
    .update(result.error
      ? { status: "failed", error: result.error.slice(0, 500), updated_at: new Date().toISOString() }
      : { status: "sent", provider_id: result.id, updated_at: new Date().toISOString() })
    .eq("kind", "welcome").eq("ref_id", userId).eq("recipient_id", userId);
}
