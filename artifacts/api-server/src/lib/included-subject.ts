/**
 * Tutor-included subjects: a tutor's student doesn't pay for the subjects the
 * tutor teaches them. The tutor picks them on the invite (unlocked when the
 * student accepts) or later from their roster. Each is a user_subscriptions
 * row with source 'tutor' and sponsor_tutor_id = the tutor: unlimited,
 * separate from the student's own free subject, and deleted by a database
 * trigger when the student leaves that tutor's roster.
 *
 * Only tutors with profiles.can_include_subject (set by an admin) and admins
 * can include a subject.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe, liveCurriculum, removePaidSubject } from "../routes/billing";
import { logger } from "./logger";

export class IncludedSubjectError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type IncludeResult = {
  label: string;
  /** included: unlocked by this tutor; covered: the student already has free full access (granted, beta, another tutor). */
  outcome: "included" | "covered";
};

/** Whether this user may include a subject for their students. */
export async function canIncludeSubject(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin
    .from("profiles").select("is_admin, can_include_subject").eq("id", userId)
    .maybeSingle<{ is_admin: boolean | null; can_include_subject: boolean | null }>();
  return !!(data?.is_admin || data?.can_include_subject);
}

/** "Chemistry Stage 2" for a curriculum id, or null if it isn't a live subject. */
export async function subjectLabel(admin: SupabaseClient, curriculumId: string | null): Promise<string | null> {
  if (!curriculumId) return null;
  return (await liveCurriculum(admin, curriculumId))?.label ?? null;
}

type AccessRow = {
  id: string;
  active: boolean;
  source: string;
  sponsor_tutor_id: string | null;
  stripe_subscription_id: string | null;
};

/**
 * Include `curriculumId` for `studentId` on `tutorId`'s behalf. A free-subject
 * or lapsed row for it becomes the tutor's; a paid one comes off the student's
 * plan first, so they stop paying for it. The caller checks the roster and
 * canIncludeSubject.
 */
export async function includeSubject(
  admin: SupabaseClient, tutorId: string, studentId: string, curriculumId: unknown,
): Promise<IncludeResult> {
  const cur = await liveCurriculum(admin, curriculumId);
  if (!cur) throw new IncludedSubjectError(404, "That subject isn't available.");

  const { data: existing, error: readErr } = await admin
    .from("user_subscriptions").select("id, active, source, sponsor_tutor_id, stripe_subscription_id")
    .eq("user_id", studentId).eq("subject_name", cur.name).eq("stage", cur.stage)
    .maybeSingle<AccessRow>();
  if (readErr) throw new Error(readErr.message);

  const mine = existing?.source === "tutor" && existing.sponsor_tutor_id === tutorId;
  if (existing?.active && !mine && ["admin", "beta", "tutor"].includes(existing.source)) {
    return { label: cur.label, outcome: "covered" };
  }

  if (!mine) {
    if (existing?.active && existing.source === "stripe" && existing.stripe_subscription_id) {
      const stripe = getStripe();
      if (!stripe) throw new IncludedSubjectError(503, "The student pays for this subject and payments aren't set up here, so it can't be switched over.");
      await removePaidSubject(admin, stripe, { id: existing.id, stripe_subscription_id: existing.stripe_subscription_id }, { endNow: true });
    }

    const { error } = await admin.from("user_subscriptions").upsert(
      {
        user_id: studentId, subject_name: cur.name, stage: cur.stage, active: true, beta: false,
        source: "tutor", sponsor_tutor_id: tutorId, status: null, stripe_subscription_id: null,
        stripe_customer_id: null, current_period_end: null, cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,subject_name,stage" },
    );
    if (error) throw new Error(error.message);
  }

  // It's the subject they tutor this student in. (Checked first: a null stage
  // never conflicts in the unique index.)
  const stage = cur.stage || null;
  let tutored = admin.from("tutor_student_subjects").select("id")
    .eq("tutor_id", tutorId).eq("student_id", studentId).eq("subject_name", cur.name);
  tutored = stage ? tutored.eq("stage", stage) : tutored.is("stage", null);
  const { data: tutoredRows } = await tutored.limit(1);
  if (!tutoredRows?.length) {
    const { error: tutoredErr } = await admin.from("tutor_student_subjects")
      .insert({ tutor_id: tutorId, student_id: studentId, subject_name: cur.name, stage });
    if (tutoredErr && tutoredErr.code !== "23505") throw new Error(tutoredErr.message);
  }

  return { label: cur.label, outcome: "included" };
}

/**
 * Include each of `curriculumIds` (an invite's subjects). One at a time, since
 * each can change the student's Stripe plan. Returns the labels unlocked and
 * how many couldn't be.
 */
export async function includeSubjects(
  admin: SupabaseClient, tutorId: string, studentId: string, curriculumIds: string[],
): Promise<{ labels: string[]; failed: number }> {
  const labels: string[] = [];
  let failed = 0;
  for (const id of curriculumIds) {
    try {
      labels.push((await includeSubject(admin, tutorId, studentId, id)).label);
    } catch (err) {
      if (err instanceof IncludedSubjectError && err.status === 404) continue; // retired since the invite went out
      logger.error({ err, tutorId, studentId, curriculumId: id }, "included-subject: could not include a subject");
      failed++;
    }
  }
  return { labels, failed };
}

/** Stop including one subject for this student (it locks again unless they pay or pick it as their free subject). */
export async function removeIncludedSubject(
  admin: SupabaseClient, tutorId: string, studentId: string, curriculumId: string,
): Promise<void> {
  // Any curriculum, live or not: a subject archived since still comes off.
  const { data: cur } = await admin
    .from("curricula").select("name, level_label").eq("id", curriculumId)
    .maybeSingle<{ name: string; level_label: string | null }>();
  if (!cur) throw new IncludedSubjectError(404, "Subject not found.");
  const { error } = await admin
    .from("user_subscriptions").delete()
    .eq("user_id", studentId).eq("source", "tutor").eq("sponsor_tutor_id", tutorId)
    .eq("subject_name", cur.name).eq("stage", (cur.level_label || "").trim());
  if (error) throw new Error(error.message);
}
