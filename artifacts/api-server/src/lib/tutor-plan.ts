import type Stripe from "stripe";
import type { Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCESS_STATUSES, periodEnd } from "./stripe-plans";
import { logger } from "./logger";

// Tutor plans: what a tutor pays for the tutor portal.
//
// The plans are platform_settings.pricing.tutor_plans ({ name, price: $/month,
// students, subjects, recordings, parent_reports }) plus annual_discount for
// paying yearly; Admin → Settings edits them. A tutor subscribes through
// Stripe (routes/tutor-billing.ts) and the plan is recorded in tutor_billing,
// keeping the limits and features it was bought with. A tutor needs a live
// plan to use the tutor portal, and the plan decides:
//   • students       – roster + pending invites (studentLimitError)
//   • subjects       – how many subjects they tutor in; a subject joins their
//                      list (tutor_billing.subjects) the first time they use it
//                      (claimTutorSubject) and they can drop one in Plan & billing
//   • recordings     – recording live lessons
//   • parent_reports – the weekly progress email to a student's parent
// Admins don't need a plan, and an admin can mark a tutor exempt (no plan,
// every feature, no limits) in Admin → Tutors.

/** Marks a Stripe subscription as a tutor plan (metadata.kind), not a student's subjects. */
export const TUTOR_PLAN_KIND = "tutor_plan";

export type TutorPlanInterval = "month" | "year";
export const isTutorPlanInterval = (v: unknown): v is TutorPlanInterval => v === "month" || v === "year";

export type TutorPlanOption = {
  name: string;
  /** $/month on monthly billing. */
  monthly: number;
  /** $/year on annual billing, after the annual discount. */
  annual: number;
  /** Most students the plan allows; null = unlimited. */
  students: number | null;
  /** Most subjects the tutor can tutor in; null = unlimited. */
  subjects: number | null;
  recordings: boolean;
  parentReports: boolean;
};

export type TutorFeature = "recordings" | "parentReports";

const DEFAULT_PLANS = [
  { name: "Starter", price: 29, students: 10, subjects: 1, recordings: false, parent_reports: false },
  { name: "Pro", price: 59, students: 25, subjects: 3, recordings: true, parent_reports: true },
  { name: "Agency", price: 99, students: null, subjects: null, recordings: true, parent_reports: true },
];
const DEFAULT_ANNUAL_DISCOUNT = 0.15;
/** A limit this high (the settings use 999) means unlimited. */
const UNLIMITED_FROM = 999;

/** A positive whole number below UNLIMITED_FROM, else null (unlimited). */
const limitOf = (n: unknown): number | null =>
  typeof n === "number" && n > 0 && n < UNLIMITED_FROM ? Math.floor(n) : null;

/** The plans on offer, from platform_settings.pricing. */
export function tutorPlanOptions(pricing: Record<string, unknown>): { plans: TutorPlanOption[]; annualDiscount: number } {
  const d = pricing.annual_discount;
  const annualDiscount = typeof d === "number" && d >= 0 && d < 1 ? d : DEFAULT_ANNUAL_DISCOUNT;
  const raw = Array.isArray(pricing.tutor_plans) ? pricing.tutor_plans : DEFAULT_PLANS;
  const plans = raw.flatMap((p): TutorPlanOption[] => {
    const { name, price, students, subjects, recordings, parent_reports } = (p ?? {}) as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim() || typeof price !== "number" || !(price > 0)) return [];
    return [{
      name: name.trim(),
      monthly: price,
      annual: Math.round(price * 12 * (1 - annualDiscount)),
      students: limitOf(students),
      subjects: limitOf(subjects),
      // A plan from before these switches existed keeps every feature.
      recordings: recordings !== false,
      parentReports: parent_reports !== false,
    }];
  });
  return { plans, annualDiscount };
}

export type TutorBillingRow = {
  tutor_id: string;
  exempt: boolean;
  plan: string | null;
  student_limit: number | null;
  subject_limit: number | null;
  recordings: boolean;
  parent_reports: boolean;
  /** Subject names the tutor tutors in, filled as they use them (claimTutorSubject). */
  subjects: string[];
  interval: TutorPlanInterval | null;
  status: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export async function tutorBillingRow(admin: SupabaseClient, tutorId: string): Promise<TutorBillingRow | null> {
  const { data, error } = await admin.from("tutor_billing").select("*").eq("tutor_id", tutorId).maybeSingle<TutorBillingRow>();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Whether the row's plan lets the tutor use the portal (or they're exempt). */
export const planIsLive = (row: TutorBillingRow | null): boolean =>
  !!row && (row.exempt || (!!row.status && ACCESS_STATUSES.has(row.status as Stripe.Subscription.Status)));

/**
 * Guard for tutor-only endpoints: true if the caller may go on. Otherwise
 * answers 402 with code "tutor_plan_required", which the app turns into the
 * plan picker. Pass `isAdmin` when the caller's profile is already loaded;
 * left out, it's looked up only if the tutor has no plan.
 */
export async function requireTutorPlan(admin: SupabaseClient, res: Response, tutorId: string, isAdmin?: boolean): Promise<boolean> {
  if (isAdmin) return true;
  try {
    if (planIsLive(await tutorBillingRow(admin, tutorId))) return true;
    if (isAdmin === undefined) {
      const { data } = await admin.from("profiles").select("is_admin").eq("id", tutorId).maybeSingle<{ is_admin: boolean | null }>();
      if (data?.is_admin) return true;
    }
  } catch (err) {
    logger.error({ err }, "tutor plan: couldn't read the plan");
    res.status(500).json({ error: "Couldn't check your tutor plan. Please try again." });
    return false;
  }
  res.status(402).json({ error: "Choose a tutor plan to use the tutor portal.", code: "tutor_plan_required" });
  return false;
}

/** Whether the tutor's plan includes `feature`; admins and exempt tutors have every feature. */
export async function tutorHasFeature(admin: SupabaseClient, tutorId: string, feature: TutorFeature, isAdmin?: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const row = await tutorBillingRow(admin, tutorId);
  if (row?.exempt) return true;
  if (planIsLive(row) && (feature === "recordings" ? row!.recordings : row!.parent_reports)) return true;
  if (isAdmin === undefined) {
    const { data } = await admin.from("profiles").select("is_admin").eq("id", tutorId).maybeSingle<{ is_admin: boolean | null }>();
    return !!data?.is_admin;
  }
  return false;
}

export const FEATURE_MISSING: Record<TutorFeature, string> = {
  recordings: "Your tutor plan doesn't include recording lessons. Upgrade in Plan & billing to record.",
  parentReports: "Your tutor plan doesn't include parent progress reports. Upgrade in Plan & billing to send them.",
};

const sameSubject = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Make sure the tutor's plan covers these subjects (curricula names),
 * adding any new ones to their list while there's room. Returns the message
 * to show if one doesn't fit.
 */
export async function claimTutorSubjects(admin: SupabaseClient, tutorId: string, isAdmin: boolean, names: string[]): Promise<string | null> {
  if (isAdmin) return null;
  const row = await tutorBillingRow(admin, tutorId);
  if (!row || row.exempt || row.subject_limit == null) return null;
  const current = row.subjects ?? [];
  const added: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name || [...current, ...added].some((s) => sameSubject(s, name))) continue;
    added.push(name);
  }
  if (!added.length) return null;
  if (current.length + added.length > row.subject_limit) {
    const covered = current.length ? ` (${current.join(", ")})` : "";
    const plural = row.subject_limit === 1 ? "subject" : "subjects";
    return `Your ${row.plan ?? "tutor"} plan covers ${row.subject_limit} ${plural}${covered}. To tutor ${added.join(", ")}, swap a subject or upgrade in Plan & billing.`;
  }
  const { error } = await admin
    .from("tutor_billing").update({ subjects: [...current, ...added], updated_at: new Date().toISOString() })
    .eq("tutor_id", tutorId);
  if (error) throw new Error(error.message);
  return null;
}

/** Stripe metadata for a plan: what syncTutorSubscription records on purchase. */
export function planMetadata(tutorId: string, plan: TutorPlanOption): Record<string, string> {
  return {
    kind: TUTOR_PLAN_KIND,
    user_id: tutorId,
    plan: plan.name,
    students: plan.students == null ? "" : String(plan.students),
    subjects: plan.subjects == null ? "" : String(plan.subjects),
    recordings: plan.recordings ? "1" : "0",
    parent_reports: plan.parentReports ? "1" : "0",
  };
}

/** An invite counts towards the student limit until it's accepted (it joins the roster) or expires. */
const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Students on the roster plus invites still waiting, optionally leaving out one invited address. */
export async function studentsUsed(admin: SupabaseClient, tutorId: string, exceptEmail?: string): Promise<number> {
  const [roster, invites] = await Promise.all([
    admin.from("tutor_students").select("student_id", { count: "exact", head: true }).eq("tutor_id", tutorId),
    admin.from("tutor_invites").select("email, sent_at, created_at").eq("tutor_id", tutorId).eq("status", "pending"),
  ]);
  if (roster.error) throw new Error(roster.error.message);
  if (invites.error) throw new Error(invites.error.message);
  const now = Date.now();
  const waiting = ((invites.data ?? []) as { email: string; sent_at: string | null; created_at: string }[])
    .filter((i) => i.email !== exceptEmail && now - new Date(i.sent_at ?? i.created_at).getTime() <= INVITE_TTL_MS);
  return (roster.count ?? 0) + waiting.length;
}

/**
 * Whether the tutor can invite `email` without going over their plan's
 * student limit. Returns the message to show if not. Re-sending an invite
 * that's already waiting doesn't count again.
 */
export async function studentLimitError(admin: SupabaseClient, tutorId: string, isAdmin: boolean, email: string): Promise<string | null> {
  if (isAdmin) return null;
  const row = await tutorBillingRow(admin, tutorId);
  if (!row || row.exempt || row.student_limit == null) return null;
  const used = await studentsUsed(admin, tutorId, email);
  if (used < row.student_limit) return null;
  return `Your ${row.plan ?? "tutor"} plan covers ${row.student_limit} students, counting invites still waiting. Upgrade your plan to add more.`;
}

/** Record a tutor plan subscription's current state (from the webhook or after Checkout). */
export async function syncTutorSubscription(admin: SupabaseClient, sub: Stripe.Subscription): Promise<void> {
  const tutorId = sub.metadata?.user_id;
  if (!tutorId) {
    logger.warn({ subscriptionId: sub.id }, "tutor plan: subscription without GradeFarm metadata");
    return;
  }
  const row = await tutorBillingRow(admin, tutorId);
  const live = ACCESS_STATUSES.has(sub.status);
  // A late event for an older, finished subscription mustn't replace the current plan.
  if (row?.stripe_subscription_id && row.stripe_subscription_id !== sub.id && !live) return;

  const meta = sub.metadata ?? {};
  const interval = sub.items.data[0]?.price.recurring?.interval;
  const fields = {
    plan: meta.plan || null,
    student_limit: limitOf(Number(meta.students)),
    subject_limit: limitOf(Number(meta.subjects)),
    recordings: meta.recordings !== "0",
    parent_reports: meta.parent_reports !== "0",
    interval: isTutorPlanInterval(interval) ? interval : null,
    status: sub.status,
    stripe_subscription_id: sub.id,
    current_period_end: periodEnd(sub),
    cancel_at_period_end: sub.cancel_at_period_end || !!sub.cancel_at,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("tutor_billing").upsert({ tutor_id: tutorId, ...fields }, { onConflict: "tutor_id" });
  if (error) throw new Error(error.message);
}
