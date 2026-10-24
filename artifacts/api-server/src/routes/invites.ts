/**
 * Tutor → student invites. "Add student" in the Tutor portal emails the
 * student an invite link; the student accepts it, signed in with the invited
 * address, and only then joins the tutor's roster (tutor_students). The roster
 * row is what lets the tutor see the student's progress and opens the Lessons
 * section of the Student Portal.
 *
 * An invite can come with the subjects the tutor teaches the student
 * (curriculum_ids); they unlock, free, when they accept (see
 * lib/included-subject.ts), each with a diagnostic to do first covering the
 * subtopics the tutor picked (diagnostic_subtopics; see
 * lib/student-diagnostic.ts).
 *
 *   POST   /tutor/invites           invite (or re-send to) an email address
 *   GET    /tutor/invites           the caller's pending invites
 *   DELETE /tutor/invites/:id       cancel a pending invite
 *   GET    /invites/mine            pending invites for the signed-in user
 *   GET    /invites/:token          public summary for the invite page
 *   POST   /invites/:token/accept   join the tutor's roster
 *   POST   /invites/:token/decline
 */
import { Router, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, getServiceClient, type Caller } from "../lib/auth";
import { appUrl, getResend, sendEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { canIncludeSubject, includeSubjects, subjectLabel } from "../lib/included-subject";
import { createStudentDiagnostic } from "../lib/student-diagnostic";
import { liveCurriculum } from "./billing";

const router = Router();

/** An invite link stops working this long after it was last sent. */
const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A tutor can re-send the same invite at most this often. */
const RESEND_INTERVAL_MS = 2 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface InviteRow {
  id: string;
  tutor_id: string;
  email: string;
  token: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  student_id: string | null;
  curriculum_ids: string[];
  /** Subtopics each subject's diagnostic covers, by curriculum id (none: the whole subject). */
  diagnostic_subtopics: Record<string, string[]>;
  created_at: string;
  sent_at: string | null;
  responded_at: string | null;
  reminded_at: string | null;
}

function fail(res: Response, err: unknown) {
  return res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
}

function isExpired(invite: InviteRow): boolean {
  return Date.now() - new Date(invite.sent_at ?? invite.created_at).getTime() > INVITE_TTL_MS;
}

async function displayName(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle<{ display_name: string | null }>();
  return data?.display_name?.trim() || null;
}

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(error.message);
  return data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
}

/** The caller's email address, or null until they have confirmed it. */
async function confirmedEmail(caller: Caller): Promise<string | null> {
  const { data } = await caller.admin.auth.admin.getUserById(caller.userId);
  const user = data?.user;
  if (!user?.email || !(user.email_confirmed_at ?? user.confirmed_at)) return null;
  return user.email.toLowerCase();
}

/** j••••@example.com — enough for the recipient to recognise, not to harvest. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}${"•".repeat(Math.max(1, Math.min(local.length - 1, 6)))}@${domain}`;
}

function inviteUrl(token: string): string {
  return `${appUrl()}/invite/${encodeURIComponent(token)}`;
}

/** "Chemistry", "Chemistry and Physics", "Chemistry, Physics and Biology". */
function listSubjects(labels: string[]): string {
  return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

async function sendInviteEmail(invite: InviteRow, tutorName: string, subjects: string[], sentAt: string): Promise<string | null> {
  const subject = subjects.length ? listSubjects(subjects) : null;
  const resend = getResend();
  if (!resend) return "Email service not configured. Please add RESEND_API_KEY.";
  const { error } = await sendEmail(resend, {
    to: invite.email,
    subject: subject ? `${tutorName} has set you up with ${subject} on gradefarm.` : `${tutorName} invited you to gradefarm.`,
    content: {
      heading: `${tutorName} wants to be your tutor`,
      paragraphs: [
        subject
          ? `${tutorName} has invited you to join them on gradefarm. ${subject} ${subjects.length > 1 ? "are" : "is"} included with your tutoring, so there's nothing to pay for ${subjects.length > 1 ? "them" : "it"}.`
          : `${tutorName} has invited you to join them on gradefarm.`,
        `Accept the invite to open the Student Portal: your lessons, class resources and recordings, and the work ${tutorName} sets you. Once you accept, ${tutorName} will also be able to see your practice progress.`,
        `New to gradefarm.? The button takes you to create your account with this email address (${invite.email}). The invite is accepted as soon as you confirm it.`,
      ],
      cta: { label: "Accept invite", url: inviteUrl(invite.token) },
      footer: `You're receiving this because ${tutorName} entered your email address on gradefarm. If you don't know them, you can ignore this email. The invite expires in 30 days.`,
    },
    idempotencyKey: `tutor-invite:${invite.id}:${sentAt}`,
  });
  return error;
}

function tutorView(invite: InviteRow, subjects: string[]) {
  return {
    id: invite.id, email: invite.email, subjects, created_at: invite.created_at, sent_at: invite.sent_at,
    reminded_at: invite.reminded_at, expired: isExpired(invite),
  };
}

/** Labels of these invites' subjects, by curriculum id (subjects no longer live are left out). */
async function subjectLabels(admin: SupabaseClient, invites: InviteRow[]): Promise<Record<string, string>> {
  const ids = [...new Set(invites.flatMap((i) => i.curriculum_ids ?? []))];
  const labels: Record<string, string> = {};
  await Promise.all(ids.map(async (id) => {
    const label = await subjectLabel(admin, id);
    if (label) labels[id] = label;
  }));
  return labels;
}

const labelsOf = (invite: InviteRow, labels: Record<string, string>) =>
  (invite.curriculum_ids ?? []).map((id) => labels[id]).filter((l): l is string => !!l);

/** { curriculumId: [subtopicId, …] } from the request, for this invite's subjects only. */
function pickDiagnosticSubtopics(raw: unknown, curriculumIds: string[]): Record<string, string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const id of curriculumIds) {
    const list = (raw as Record<string, unknown>)[id];
    if (!Array.isArray(list)) continue;
    const ids = [...new Set(list.filter((s): s is string => typeof s === "string" && !!s))].slice(0, 500);
    if (ids.length) out[id] = ids;
  }
  return out;
}

// ── Tutor side ──────────────────────────────────────────────────────────────

async function requireTutorCaller(req: Request, res: Response): Promise<Caller | null> {
  const caller = await requireUser(req, res);
  if (!caller) return null;
  if (!caller.isTutor && !caller.isAdmin) {
    res.status(403).json({ error: "Forbidden: caller is not a tutor" });
    return null;
  }
  return caller;
}

router.post("/tutor/invites", async (req: Request, res: Response) => {
  try {
    const caller = await requireTutorCaller(req, res);
    if (!caller) return;
    const { admin, userId } = caller;

    const body = (req.body ?? {}) as { email?: string; curriculumIds?: unknown; diagnosticSubtopics?: unknown };
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });

    // The subjects the invite comes with. Left out (a plain re-send) keeps the
    // invite's current ones; [] takes them off.
    const setsSubjects = "curriculumIds" in body;
    const curriculumIds = Array.isArray(body.curriculumIds)
      ? [...new Set(body.curriculumIds.filter((id): id is string => typeof id === "string" && !!id))]
      : [];
    if (curriculumIds.length > 20) return res.status(400).json({ error: "That's too many subjects for one invite." });
    const diagnosticSubtopics = pickDiagnosticSubtopics(body.diagnosticSubtopics, curriculumIds);
    if (curriculumIds.length) {
      if (!(await canIncludeSubject(admin, userId))) {
        return res.status(403).json({ error: "Your account can't include subjects yet. Ask an admin to turn it on." });
      }
      const live = await Promise.all(curriculumIds.map((id) => liveCurriculum(admin, id)));
      if (live.some((c) => !c)) return res.status(400).json({ error: "One of those subjects isn't available." });
    }

    const existingUserId = await findUserIdByEmail(admin, email);
    if (existingUserId === userId) return res.status(400).json({ error: "You cannot add yourself as a student." });
    if (existingUserId) {
      const { data: rostered } = await admin
        .from("tutor_students")
        .select("student_id")
        .eq("tutor_id", userId)
        .eq("student_id", existingUserId)
        .maybeSingle();
      if (rostered) {
        return res.status(409).json({
          error: curriculumIds.length
            ? "That student is already on your roster. Use Edit on their row to include subjects."
            : "That student is already on your roster.",
        });
      }
    }

    const { data: pending, error: pendingErr } = await admin
      .from("tutor_invites")
      .select("*")
      .eq("tutor_id", userId)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle<InviteRow>();
    if (pendingErr) return res.status(500).json({ error: pendingErr.message });

    let invite = pending;
    if (invite?.sent_at && Date.now() - new Date(invite.sent_at).getTime() < RESEND_INTERVAL_MS) {
      return res.status(429).json({ error: "Invite already sent. Wait a couple of minutes before re-sending it." });
    }
    if (!invite) {
      const { data: created, error: insertErr } = await admin
        .from("tutor_invites")
        .insert({
          tutor_id: userId, email, token: randomBytes(24).toString("base64url"),
          curriculum_ids: curriculumIds, diagnostic_subtopics: diagnosticSubtopics,
        })
        .select("*")
        .single<InviteRow>();
      if (insertErr || !created) return res.status(500).json({ error: insertErr?.message ?? "Could not create the invite." });
      invite = created;
    } else if (setsSubjects) {
      const { error: subjErr } = await admin
        .from("tutor_invites").update({ curriculum_ids: curriculumIds, diagnostic_subtopics: diagnosticSubtopics }).eq("id", invite.id);
      if (subjErr) return res.status(500).json({ error: subjErr.message });
      invite = { ...invite, curriculum_ids: curriculumIds, diagnostic_subtopics: diagnosticSubtopics };
    }

    const sentAt = new Date().toISOString();
    const [tutorName, labels] = await Promise.all([
      displayName(admin, userId).then((n) => n ?? "Your tutor"),
      subjectLabels(admin, [invite]),
    ]);
    const subjects = labelsOf(invite, labels);
    const emailError = await sendInviteEmail(invite, tutorName, subjects, sentAt);
    if (!emailError) {
      // A fresh send gets its own reminder later (lib/automated-emails.ts).
      await admin.from("tutor_invites").update({ sent_at: sentAt, reminded_at: null }).eq("id", invite.id);
      invite = { ...invite, sent_at: sentAt, reminded_at: null };
    }
    return res.json({ invite: tutorView(invite, subjects), emailSent: !emailError, emailError });
  } catch (err) {
    return fail(res, err);
  }
});

router.get("/tutor/invites", async (req: Request, res: Response) => {
  try {
    const caller = await requireTutorCaller(req, res);
    if (!caller) return;
    const { data, error } = await caller.admin
      .from("tutor_invites")
      .select("*")
      .eq("tutor_id", caller.userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    const invites = (data ?? []) as InviteRow[];
    const labels = await subjectLabels(caller.admin, invites);
    return res.json({ invites: invites.map((i) => tutorView(i, labelsOf(i, labels))) });
  } catch (err) {
    return fail(res, err);
  }
});

router.delete("/tutor/invites/:id", async (req: Request, res: Response) => {
  try {
    const caller = await requireTutorCaller(req, res);
    if (!caller) return;
    const { data, error } = await caller.admin
      .from("tutor_invites")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("id", String(req.params.id))
      .eq("tutor_id", caller.userId)
      .eq("status", "pending")
      .select("id");
    if (error) return res.status(500).json({ error: error.message });
    if (!data?.length) return res.status(404).json({ error: "Invite not found." });
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

// ── Student side ────────────────────────────────────────────────────────────

router.get("/invites/mine", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req, res);
    if (!caller) return;
    const email = await confirmedEmail(caller);
    if (!email) return res.json({ invites: [] });

    const { data, error } = await caller.admin
      .from("tutor_invites")
      .select("*")
      .eq("email", email)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    const invites = ((data ?? []) as InviteRow[]).filter((i) => !isExpired(i) && i.tutor_id !== caller.userId);

    const names: Record<string, string | null> = {};
    const tutorIds = [...new Set(invites.map((i) => i.tutor_id))];
    if (tutorIds.length) {
      const { data: profs } = await caller.admin.from("profiles").select("id, display_name").in("id", tutorIds);
      for (const p of (profs ?? []) as { id: string; display_name: string | null }[]) names[p.id] = p.display_name;
    }
    const labels = await subjectLabels(caller.admin, invites);
    return res.json({
      invites: invites.map((i) => ({
        token: i.token,
        tutor_name: names[i.tutor_id] || "A tutor",
        subjects: labelsOf(i, labels),
        created_at: i.created_at,
      })),
    });
  } catch (err) {
    return fail(res, err);
  }
});

async function loadInvite(admin: SupabaseClient, token: string): Promise<InviteRow | null> {
  if (!token || token.length > 100) return null;
  const { data } = await admin.from("tutor_invites").select("*").eq("token", token).maybeSingle<InviteRow>();
  return data ?? null;
}

// Public: the invite page shows who it's from before the student signs in.
router.get("/invites/:token", async (req: Request, res: Response) => {
  try {
    const admin = getServiceClient();
    const invite = await loadInvite(admin, String(req.params.token));
    if (!invite) return res.status(404).json({ error: "This invite link isn't valid." });
    const status = invite.status === "pending" && isExpired(invite) ? "expired" : invite.status;
    return res.json({
      tutor_name: (await displayName(admin, invite.tutor_id)) ?? "A tutor",
      email: maskEmail(invite.email),
      // Pre-fills sign-up. Only while the invite is usable: whoever has the
      // link was sent it at this address.
      signup_email: status === "pending" ? invite.email : null,
      subjects: labelsOf(invite, await subjectLabels(admin, [invite])),
      status,
    });
  } catch (err) {
    return fail(res, err);
  }
});

/** Load a pending invite addressed to the signed-in caller, or send the reason it can't be used. */
async function inviteForCaller(req: Request, res: Response): Promise<{ caller: Caller; invite: InviteRow } | null> {
  const caller = await requireUser(req, res);
  if (!caller) return null;
  const invite = await loadInvite(caller.admin, String(req.params.token));
  if (!invite) {
    res.status(404).json({ error: "This invite link isn't valid." });
    return null;
  }
  if (invite.status !== "pending") {
    const what = { accepted: "already been accepted", declined: "been declined", cancelled: "been cancelled by your tutor" }[invite.status];
    res.status(409).json({ error: `This invite has ${what}.` });
    return null;
  }
  if (isExpired(invite)) {
    res.status(410).json({ error: "This invite has expired. Ask your tutor to send a new one." });
    return null;
  }
  if (invite.tutor_id === caller.userId) {
    res.status(400).json({ error: "You can't accept your own invite." });
    return null;
  }
  const email = await confirmedEmail(caller);
  if (email !== invite.email) {
    res.status(403).json({
      error: email
        ? `This invite was sent to ${maskEmail(invite.email)}. Sign in with that email address to accept it.`
        : "Confirm your email address first, then open the invite again.",
    });
    return null;
  }
  return { caller, invite };
}

router.post("/invites/:token/accept", async (req: Request, res: Response) => {
  try {
    const found = await inviteForCaller(req, res);
    if (!found) return;
    const { caller, invite } = found;

    const { error: rosterErr } = await caller.admin
      .from("tutor_students")
      .upsert({ tutor_id: invite.tutor_id, student_id: caller.userId }, { onConflict: "tutor_id,student_id", ignoreDuplicates: true });
    if (rosterErr) return res.status(500).json({ error: rosterErr.message });

    const { error } = await caller.admin
      .from("tutor_invites")
      .update({ status: "accepted", student_id: caller.userId, responded_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (error) return res.status(500).json({ error: error.message });

    // Unlock the subjects the invite came with, if the tutor can still include
    // them. The student is on the roster either way; the tutor can retry from there.
    let subjects: string[] = [];
    let subjectError: string | null = null;
    if (invite.curriculum_ids?.length) {
      try {
        if (await canIncludeSubject(caller.admin, invite.tutor_id)) {
          const result = await includeSubjects(caller.admin, invite.tutor_id, caller.userId, invite.curriculum_ids);
          subjects = result.labels;
          if (result.failed) subjectError = "Some of your tutor's subjects couldn't be unlocked just now. Ask them to include them again from their roster.";
          // Each comes with a diagnostic to do before practising it.
          for (const id of result.ids) {
            await createStudentDiagnostic(caller.admin, invite.tutor_id, caller.userId, id, invite.diagnostic_subtopics?.[id] ?? [])
              .catch((err) => logger.error({ err, inviteId: invite.id, curriculumId: id }, "invites: could not set a diagnostic"));
          }
        }
      } catch (err) {
        logger.error({ err, inviteId: invite.id }, "invites: could not include the invite's subjects");
        subjectError = "Your tutor's subjects couldn't be unlocked just now. Ask them to include them again from their roster.";
      }
    }
    return res.json({ ok: true, tutor_name: (await displayName(caller.admin, invite.tutor_id)) ?? "your tutor", subjects, subjectError });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/invites/:token/decline", async (req: Request, res: Response) => {
  try {
    const found = await inviteForCaller(req, res);
    if (!found) return;
    const { caller, invite } = found;
    const { error } = await caller.admin
      .from("tutor_invites")
      .update({ status: "declined", student_id: caller.userId, responded_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

export default router;
