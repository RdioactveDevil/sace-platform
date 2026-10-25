import { Router, type Request, type Response } from "express";
import { getServiceClient } from "../lib/auth";
import { logger } from "../lib/logger";
import { GUEST_CHECKOUT, claimGuestCheckout, instantSignInLink } from "../lib/guest-checkout";
import { appUrl, getStripe, isInterval, liveCurriculum, notConfigured, planPriceId, readTiers, tierPrice } from "./billing";

// Pay first, sign up after: the /start and /welcome pages. No sign-in needed
// for either; lib/guest-checkout.ts has the rules.

const router = Router();

const fail = (res: Response, status: number, error: string) => void res.status(status).json({ error });

// Each Checkout session is a Stripe API call: cap them per address.
const RECENT_LIMIT = 20;
const RECENT_WINDOW_MS = 10 * 60 * 1000;
const recent = new Map<string, number[]>();

/** The visitor's address: behind Vercel's proxy, the first X-Forwarded-For entry. */
function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.ip || "unknown";
}

function tooMany(ip: string): boolean {
  const now = Date.now();
  const times = (recent.get(ip) ?? []).filter((t) => now - t < RECENT_WINDOW_MS);
  times.push(now);
  recent.set(ip, times);
  if (recent.size > 5000) recent.clear();
  return times.length > RECENT_LIMIT;
}

// POST /billing/guest-checkout — { curriculumId, interval? }: Stripe Checkout
// for one subject, billed weekly or monthly, for someone without an account.
// Returns { url }.
router.post("/billing/guest-checkout", async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) return notConfigured(res);
  if (tooMany(clientIp(req))) return fail(res, 429, "Too many tries. Please wait a few minutes.");
  const interval = req.body?.interval ?? "week";
  if (!isInterval(interval)) return fail(res, 400, "interval must be week or month");

  try {
    const admin = getServiceClient();
    const cur = await liveCurriculum(admin, req.body?.curriculumId);
    if (!cur) return fail(res, 404, "Subject not found");
    const tiers = (await readTiers(admin))[interval];
    const metadata = { checkout: GUEST_CHECKOUT, curriculum_id: cur.id };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: await planPriceId(stripe, tiers, interval), quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { description: "GradeFarm subjects", metadata },
      metadata,
      custom_text: {
        submit: {
          message: `${cur.label}, $${tierPrice(tiers, 1)}/${interval}. We'll make your gradefarm. account with this email, so use the student's own address. Cancel any time.`,
        },
      },
      success_url: `${appUrl()}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/start?subject=${encodeURIComponent(cur.id)}`,
    });
    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "guest checkout: create failed");
    fail(res, 502, "Couldn't start checkout. Please try again.");
  }
});

// POST /billing/guest-claim — { sessionId } from /welcome: set the account up
// if the webhook hasn't yet. Returns { status: 'pending' } while Stripe is
// still finishing, else { status: 'ready', email, signInUrl } where signInUrl
// (null for an existing account) signs a brand-new buyer straight in.
router.post("/billing/guest-claim", async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) return notConfigured(res);
  const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
  if (!sessionId.startsWith("cs_")) return fail(res, 400, "sessionId required");
  try {
    const admin = getServiceClient();
    const claim = await claimGuestCheckout(admin, stripe, sessionId);
    if (claim.status === "pending") return void res.json({ status: "pending" });
    const signInUrl = await instantSignInLink(admin, stripe, sessionId, claim);
    res.json({ status: "ready", email: claim.email, newAccount: claim.createdHere, signInUrl });
  } catch (err) {
    logger.error({ err }, "guest checkout: claim failed");
    fail(res, 502, "We couldn't finish setting up your account yet.");
  }
});

export default router;
