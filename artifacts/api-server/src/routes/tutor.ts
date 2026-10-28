import { Router, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { EMAIL_FROM, appUrl } from "../lib/email";
import { IncludedSubjectError, canIncludeSubject, includeSubject, removeIncludedSubject } from "../lib/included-subject";
import { createStudentDiagnostic, waiveDiagnostic } from "../lib/student-diagnostic";
import { FEATURE_MISSING, claimTutorSubjects, requireTutorPlan, tutorHasFeature } from "../lib/tutor-plan";
import { liveCurriculum } from "./billing";
import { contactEmailForLogin, isFamilyLogin } from "../lib/family";
import { getServiceClient } from "../lib/auth";
import { localDate } from "../lib/automated-emails";
import {
  issueSchedule, issuesOn, missingScheduleTable, nextIssueOn, type ScheduleRow,
} from "../lib/recurring-assignments";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

interface AuthUser {
  id: string;
  email?: string;
}

interface AdminAuthClient {
  listUsers(opts: { perPage: number }): Promise<{ data: { users: AuthUser[] }; error: { message: string } | null }>;
}

interface SupabaseAdminAuth {
  getUser(jwt: string): Promise<{ data: { user: AuthUser | null }; error: { message: string } | null }>;
  admin: AdminAuthClient;
}

function getAdminClient(): SupabaseClient & { auth: SupabaseAdminAuth } {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("No SUPABASE_SERVICE_KEY configured");
  return createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } }) as SupabaseClient & { auth: SupabaseAdminAuth };
}

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface TutorContext {
  admin: SupabaseClient & { auth: SupabaseAdminAuth };
  callerUserId: string;
  tutorName: string;
  // Admins manage every tutor: they can open the portal, see any student and
  // work with any class.
  isAdmin: boolean;
}

async function requireTutor(req: Request, res: Response): Promise<TutorContext | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const callerJwt = authHeader.slice(7);
  const admin = getAdminClient();

  const { data: callerUser, error: callerError } = await admin.auth.getUser(callerJwt);
  if (callerError || !callerUser?.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }

  const { data: callerProfile, error: profErr } = await admin
    .from("profiles")
    .select("id, is_tutor, is_admin, display_name")
    .eq("id", callerUser.user.id)
    .single<{ id: string; is_tutor: boolean; is_admin: boolean | null; display_name: string | null }>();

  if (profErr || !(callerProfile?.is_tutor || callerProfile?.is_admin)) {
    res.status(403).json({ error: "Forbidden: caller is not a tutor" });
    return null;
  }
  if (!(await requireTutorPlan(admin, res, callerUser.user.id, !!callerProfile.is_admin))) return null;
  return {
    admin,
    callerUserId: callerUser.user.id,
    tutorName: callerProfile.display_name ?? "Your tutor",
    isAdmin: !!callerProfile.is_admin,
  };
}

async function getStudentEmail(
  admin: SupabaseClient & { auth: SupabaseAdminAuth },
  tutorId: string,
  studentId: string,
  isAdmin = false,
): Promise<string | null> {
  if (!isAdmin) {
    const { data: rosterRow, error: rosterErr } = await admin
      .from("tutor_students")
      .select("student_id")
      .eq("tutor_id", tutorId)
      .eq("student_id", studentId)
      .single<{ student_id: string }>();
    if (rosterErr || !rosterRow) return null;
  }

  const { data: listData, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) return null;
  const user = listData.users.find((u) => u.id === studentId);
  return user?.email ?? null;
}

async function getStudentName(
  admin: SupabaseClient & { auth: SupabaseAdminAuth },
  studentId: string,
): Promise<string> {
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", studentId)
    .single<{ display_name: string | null }>();
  return profile?.display_name ?? "Student";
}

router.post("/tutor/student-emails", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;

    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.json({ emails: {} });
    }

    let allowed: Set<string>;
    if (ctx.isAdmin) {
      allowed = new Set(ids);
    } else {
      const { data: rosterRows, error: rosterErr } = await admin
        .from("tutor_students")
        .select("student_id")
        .eq("tutor_id", callerUserId)
        .in("student_id", ids);
      if (rosterErr) return res.status(500).json({ error: rosterErr.message });
      allowed = new Set((rosterRows ?? []).map((r: { student_id: string }) => r.student_id));
    }

    const { data: listData, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) return res.status(500).json({ error: listError.message });

    const emails: Record<string, string> = {};
    for (const u of listData.users) {
      if (u.id && u.email && allowed.has(u.id)) {
        // A child added to a family signs in with a hidden address: show the parent's.
        emails[u.id] = isFamilyLogin(u.email) ? (await contactEmailForLogin(admin, u.email)) ?? "" : u.email;
      }
    }
    return res.json({ emails });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

router.post("/tutor/notify-assignment", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId, tutorName } = ctx;

    const { student_id, assignment } = req.body as {
      student_id: string;
      assignment: { type: string; subject: string; topics: string[]; due_date: string };
    };
    if (!student_id || !assignment) {
      return res.status(400).json({ error: "student_id and assignment are required" });
    }

    const studentEmail = await getStudentEmail(admin, callerUserId, student_id, ctx.isAdmin);
    if (!studentEmail) {
      return res.status(404).json({ error: "Student not found on your roster or has no email." });
    }

    const resend = getResend();
    if (!resend) {
      return res.status(503).json({ error: "Email service not configured. Please add RESEND_API_KEY." });
    }

    const studentName = await getStudentName(admin, student_id);
    const topicsList = (assignment.topics ?? []).join(", ") || assignment.subject;
    const dueDate = assignment.due_date
      ? new Date(assignment.due_date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
      : "No due date set";

    const safeStudentName = escapeHtml(studentName);
    const safeTutorName = escapeHtml(tutorName);
    const safeType = escapeHtml(assignment.type);
    const safeSubject = escapeHtml(assignment.subject);
    const safeTopics = escapeHtml(topicsList);
    const safeDueDate = escapeHtml(dueDate);

    // A child added to a family signs in with a hidden address: their mail goes to the parent.
    const recipient = (await contactEmailForLogin(getServiceClient(), studentEmail)) ?? studentEmail;
    const { error: sendErr } = await resend.emails.send({
      from: EMAIL_FROM,
      to: recipient,
      subject: `New ${safeType} assigned — ${safeSubject}`,
      html: `
        <div style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0c1037; color: #f0f4ff; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #f1be43, #f9d87a); padding: 28px 32px;">
            <h1 style="margin: 0; font-size: 24px; color: #0c1037; font-weight: 900; letter-spacing: -0.5px;">gradefarm.</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 800; color: #f0f4ff;">New Assignment</h2>
            <p style="margin: 0 0 24px; color: #a3aec2; font-size: 15px;">Hi ${safeStudentName}, your tutor ${safeTutorName} has assigned you new work.</p>
            <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 6px 0; color: #a3aec2; font-size: 13px; width: 90px;">Type</td>
                  <td style="padding: 6px 0; color: #f0f4ff; font-size: 13px; font-weight: 700;">${safeType}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #a3aec2; font-size: 13px;">Subject</td>
                  <td style="padding: 6px 0; color: #f0f4ff; font-size: 13px; font-weight: 700;">${safeSubject}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #a3aec2; font-size: 13px;">Topics</td>
                  <td style="padding: 6px 0; color: #f0f4ff; font-size: 13px; font-weight: 700;">${safeTopics}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #a3aec2; font-size: 13px;">Due</td>
                  <td style="padding: 6px 0; color: #f1be43; font-size: 13px; font-weight: 700;">${safeDueDate}</td>
                </tr>
              </table>
            </div>
            <a href="${appUrl()}" style="display: inline-block; background: linear-gradient(135deg, #f1be43, #f9d87a); color: #0c1037; font-weight: 800; font-size: 14px; padding: 13px 26px; border-radius: 9px; text-decoration: none;">Open gradefarm.</a>
          </div>
          <div style="padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.08); color: #5a6480; font-size: 11px;">
            You're receiving this because your tutor ${safeTutorName} sent you an assignment via gradefarm.
          </div>
        </div>
      `,
    });

    if (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      return res.status(500).json({ error: msg || "Failed to send email" });
    }

    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

router.post("/tutor/notify-student", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId, tutorName } = ctx;

    const { student_id, message } = req.body as { student_id: string; message?: string };
    if (!student_id) {
      return res.status(400).json({ error: "student_id is required" });
    }

    const studentEmail = await getStudentEmail(admin, callerUserId, student_id, ctx.isAdmin);
    if (!studentEmail) {
      return res.status(404).json({ error: "Student not found on your roster or has no email." });
    }

    const resend = getResend();
    if (!resend) {
      return res.status(503).json({ error: "Email service not configured. Please add RESEND_API_KEY." });
    }

    const studentName = await getStudentName(admin, student_id);
    const customMessage = message?.trim() || "You have assignments waiting. Log in to gradefarm. to check your progress and complete your work.";

    const safeStudentName = escapeHtml(studentName);
    const safeTutorName = escapeHtml(tutorName);
    const safeMessage = escapeHtml(customMessage);

    // A child added to a family signs in with a hidden address: their mail goes to the parent.
    const recipient = (await contactEmailForLogin(getServiceClient(), studentEmail)) ?? studentEmail;
    const { error: sendErr } = await resend.emails.send({
      from: EMAIL_FROM,
      to: recipient,
      subject: `Message from your tutor — ${safeTutorName}`,
      html: `
        <div style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0c1037; color: #f0f4ff; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #f1be43, #f9d87a); padding: 28px 32px;">
            <h1 style="margin: 0; font-size: 24px; color: #0c1037; font-weight: 900; letter-spacing: -0.5px;">gradefarm.</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 800; color: #f0f4ff;">Message from ${safeTutorName}</h2>
            <p style="margin: 0 0 24px; color: #a3aec2; font-size: 15px;">Hi ${safeStudentName},</p>
            <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
              <p style="margin: 0; color: #f0f4ff; font-size: 15px; line-height: 1.6;">${safeMessage}</p>
            </div>
            <a href="${appUrl()}" style="display: inline-block; background: linear-gradient(135deg, #f1be43, #f9d87a); color: #0c1037; font-weight: 800; font-size: 14px; padding: 13px 26px; border-radius: 9px; text-decoration: none;">Open gradefarm.</a>
          </div>
          <div style="padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.08); color: #5a6480; font-size: 11px;">
            You're receiving this because your tutor ${safeTutorName} sent you a notification via gradefarm.
          </div>
        </div>
      `,
    });

    if (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      return res.status(500).json({ error: msg || "Failed to send email" });
    }

    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// ── Tutor Classes ─────────────────────────────────────────────────────────────

interface ClassRow {
  id: string;
  tutor_id: string;
  name: string;
  subject: string | null;
  color: string | null;
  description: string | null;
  created_at: string;
}

interface MemberRow {
  class_id: string;
  student_id: string;
  added_at: string;
}

type AdminClient = SupabaseClient & { auth: SupabaseAdminAuth };

interface ClassTutor {
  id: string;
  display_name: string | null;
  role: "owner" | "co";
}

// What the caller may do with a class: owners and admins manage everything;
// co-tutors teach it (edit details, members, assignments) but can't delete it
// or change who teaches it. Returns null when the caller has no access.
async function classAccess(
  ctx: TutorContext,
  classId: string,
): Promise<{ ownerId: string; canManageTutors: boolean } | null> {
  const { data: cls, error } = await ctx.admin
    .from("tutor_classes")
    .select("id, tutor_id")
    .eq("id", classId)
    .maybeSingle<{ id: string; tutor_id: string }>();
  if (error || !cls) return null;
  const isOwner = cls.tutor_id === ctx.callerUserId;
  if (isOwner || ctx.isAdmin) return { ownerId: cls.tutor_id, canManageTutors: true };
  const { data: co } = await ctx.admin
    .from("tutor_class_tutors")
    .select("tutor_id")
    .eq("class_id", classId)
    .eq("tutor_id", ctx.callerUserId)
    .maybeSingle<{ tutor_id: string }>();
  return co ? { ownerId: cls.tutor_id, canManageTutors: false } : null;
}

// Before the tutor_class_tutors migration is applied, reads of it fail; treat
// that as "no co-tutors" so classes keep working.
function missingCoTutorTable(err: { message?: string } | null): boolean {
  return !!err && /tutor_class_tutors/.test(err.message || "");
}

// Owner plus co-tutors of a class.
async function classTutorIds(admin: AdminClient, classId: string, ownerId: string): Promise<string[]> {
  const { data } = await admin.from("tutor_class_tutors").select("tutor_id").eq("class_id", classId);
  return [...new Set([ownerId, ...((data ?? []) as { tutor_id: string }[]).map((r) => r.tutor_id)])];
}

// Put every student on every tutor's roster. Tutors see a student's progress
// through the roster link, so this is what gives a class's tutors access to
// its members. Existing roster rows are left untouched.
async function linkStudentsToTutors(admin: AdminClient, tutorIds: string[], studentIds: string[]) {
  const rows = tutorIds.flatMap((tutor_id) => studentIds.map((student_id) => ({ tutor_id, student_id })));
  if (rows.length === 0) return null;
  const { error } = await admin
    .from("tutor_students")
    .upsert(rows, { onConflict: "tutor_id,student_id", ignoreDuplicates: true });
  return error;
}

// GET /tutor/classes — classes the caller owns or co-teaches. Admins can pass
// ?scope=all for every tutor's classes.
router.get("/tutor/classes", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;
    const scopeAll = ctx.isAdmin && req.query.scope === "all";

    let query = admin
      .from("tutor_classes")
      .select("id, tutor_id, name, subject, color, description, created_at")
      .order("created_at", { ascending: false });
    if (!scopeAll) {
      const { data: coRows, error: coErr } = await admin
        .from("tutor_class_tutors")
        .select("class_id")
        .eq("tutor_id", callerUserId);
      if (coErr && !missingCoTutorTable(coErr)) return res.status(500).json({ error: coErr.message });
      const coIds = ((coRows ?? []) as { class_id: string }[]).map((r) => r.class_id);
      query = coIds.length > 0
        ? query.or(`tutor_id.eq.${callerUserId},id.in.(${coIds.join(",")})`)
        : query.eq("tutor_id", callerUserId);
    }
    const { data: classes, error: cErr } = await query;
    if (cErr) return res.status(500).json({ error: cErr.message });

    const ids = (classes ?? []).map((c: ClassRow) => c.id);
    let members: MemberRow[] = [];
    let coTutors: { class_id: string; tutor_id: string }[] = [];
    if (ids.length > 0) {
      const [memberRes, coRes] = await Promise.all([
        admin.from("tutor_class_members").select("class_id, student_id, added_at").in("class_id", ids),
        admin.from("tutor_class_tutors").select("class_id, tutor_id").in("class_id", ids),
      ]);
      if (memberRes.error) return res.status(500).json({ error: memberRes.error.message });
      if (coRes.error && !missingCoTutorTable(coRes.error)) return res.status(500).json({ error: coRes.error.message });
      members = (memberRes.data ?? []) as MemberRow[];
      coTutors = (coRes.data ?? []) as { class_id: string; tutor_id: string }[];
    }

    const tutorIds = [...new Set([...(classes ?? []).map((c: ClassRow) => c.tutor_id), ...coTutors.map((c) => c.tutor_id)])];
    const names: Record<string, string | null> = {};
    if (tutorIds.length > 0) {
      const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", tutorIds);
      for (const p of (profs ?? []) as { id: string; display_name: string | null }[]) names[p.id] = p.display_name;
    }

    const byClass: Record<string, MemberRow[]> = {};
    for (const m of members) {
      if (!byClass[m.class_id]) byClass[m.class_id] = [];
      byClass[m.class_id].push(m);
    }

    const result = (classes ?? []).map((c: ClassRow) => {
      const tutors: ClassTutor[] = [
        { id: c.tutor_id, display_name: names[c.tutor_id] ?? null, role: "owner" },
        ...coTutors
          .filter((r) => r.class_id === c.id && r.tutor_id !== c.tutor_id)
          .map((r) => ({ id: r.tutor_id, display_name: names[r.tutor_id] ?? null, role: "co" as const })),
      ];
      return { ...c, members: byClass[c.id] ?? [], tutors };
    });
    return res.json({ classes: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

router.post("/tutor/classes", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;

    const { name, subject, color, description } = req.body as {
      name?: string;
      subject?: string | null;
      color?: string | null;
      description?: string | null;
    };
    const trimmed = (name ?? "").trim();
    if (!trimmed) return res.status(400).json({ error: "Class name is required." });

    const { data, error } = await admin
      .from("tutor_classes")
      .insert({
        tutor_id: callerUserId,
        name: trimmed,
        subject: subject?.trim() || null,
        color: color?.trim() || null,
        description: description?.trim() || null,
      })
      .select("id, tutor_id, name, subject, color, description, created_at")
      .single<ClassRow>();
    if (error) return res.status(500).json({ error: error.message });
    const tutors: ClassTutor[] = [{ id: callerUserId, display_name: ctx.tutorName, role: "owner" }];
    return res.json({ class: { ...data, members: [], tutors } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

router.patch("/tutor/classes/:id", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin } = ctx;
    const classId = String(req.params.id);

    if (!(await classAccess(ctx, classId))) {
      return res.status(404).json({ error: "Class not found." });
    }

    const { name, subject, color, description } = req.body as {
      name?: string;
      subject?: string | null;
      color?: string | null;
      description?: string | null;
    };
    const updates: Record<string, string | null> = {};
    if (typeof name === "string") {
      const trimmed = name.trim();
      if (!trimmed) return res.status(400).json({ error: "Class name cannot be empty." });
      updates.name = trimmed;
    }
    if (subject !== undefined) updates.subject = subject?.trim() || null;
    if (color !== undefined) updates.color = color?.trim() || null;
    if (description !== undefined) updates.description = description?.trim() || null;

    const { data, error } = await admin
      .from("tutor_classes")
      .update(updates)
      .eq("id", classId)
      .select("id, tutor_id, name, subject, color, description, created_at")
      .single<ClassRow>();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ class: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

router.delete("/tutor/classes/:id", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin } = ctx;
    const classId = String(req.params.id);

    const access = await classAccess(ctx, classId);
    if (!access) return res.status(404).json({ error: "Class not found." });
    if (!access.canManageTutors) {
      return res.status(403).json({ error: "Only the class owner or an admin can delete this class." });
    }

    const { error } = await admin.from("tutor_classes").delete().eq("id", classId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

router.post("/tutor/classes/:id/members", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;
    const classId = String(req.params.id);

    const access = await classAccess(ctx, classId);
    if (!access) return res.status(404).json({ error: "Class not found." });

    const { studentIds } = req.body as { studentIds?: string[] };
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: "studentIds is required." });
    }

    // Tutors add students from their own roster; admins can add anyone.
    let filtered = studentIds;
    if (!ctx.isAdmin) {
      const { data: rosterRows, error: rErr } = await admin
        .from("tutor_students")
        .select("student_id")
        .eq("tutor_id", callerUserId)
        .in("student_id", studentIds);
      if (rErr) return res.status(500).json({ error: rErr.message });
      const allowed = new Set((rosterRows ?? []).map((r: { student_id: string }) => r.student_id));
      filtered = studentIds.filter((id) => allowed.has(id));
      if (filtered.length === 0) {
        return res.status(400).json({ error: "None of the supplied students are on your roster." });
      }
    }

    const rows = filtered.map((sid) => ({ class_id: classId, student_id: sid }));
    const { error } = await admin
      .from("tutor_class_members")
      .upsert(rows, { onConflict: "class_id,student_id" });
    if (error) return res.status(500).json({ error: error.message });

    const linkErr = await linkStudentsToTutors(admin, await classTutorIds(admin, classId, access.ownerId), filtered);
    if (linkErr) return res.status(500).json({ error: linkErr.message });
    return res.json({ ok: true, added: filtered.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

router.delete("/tutor/classes/:id/members/:studentId", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin } = ctx;
    const classId = String(req.params.id);
    const studentId = String(req.params.studentId);

    if (!(await classAccess(ctx, classId))) {
      return res.status(404).json({ error: "Class not found." });
    }

    const { error } = await admin
      .from("tutor_class_members")
      .delete()
      .eq("class_id", classId)
      .eq("student_id", studentId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// GET /tutor/tutors — tutors and admins, for picking a class's co-tutors.
router.get("/tutor/tutors", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { data, error } = await ctx.admin
      .from("profiles")
      .select("id, display_name, is_tutor, is_admin")
      .or("is_tutor.eq.true,is_admin.eq.true")
      .order("display_name");
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ tutors: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// POST /tutor/classes/:id/tutors — add a co-tutor. Body: { tutorId }.
// The new tutor gets every current member on their roster.
router.post("/tutor/classes/:id/tutors", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin } = ctx;
    const classId = String(req.params.id);
    const tutorId = String((req.body as { tutorId?: string })?.tutorId || "");
    if (!tutorId) return res.status(400).json({ error: "tutorId is required." });

    const access = await classAccess(ctx, classId);
    if (!access) return res.status(404).json({ error: "Class not found." });
    if (!access.canManageTutors) {
      return res.status(403).json({ error: "Only the class owner or an admin can add tutors." });
    }
    if (tutorId === access.ownerId) return res.json({ ok: true });

    const { data: target } = await admin
      .from("profiles").select("id, is_tutor, is_admin").eq("id", tutorId)
      .maybeSingle<{ id: string; is_tutor: boolean | null; is_admin: boolean | null }>();
    if (!target || !(target.is_tutor || target.is_admin)) {
      return res.status(400).json({ error: "That person isn't a tutor." });
    }

    const { error } = await admin
      .from("tutor_class_tutors")
      .upsert({ class_id: classId, tutor_id: tutorId }, { onConflict: "class_id,tutor_id", ignoreDuplicates: true });
    if (error) return res.status(500).json({ error: error.message });

    const { data: memberRows, error: mErr } = await admin
      .from("tutor_class_members").select("student_id").eq("class_id", classId);
    if (mErr) return res.status(500).json({ error: mErr.message });
    const linkErr = await linkStudentsToTutors(
      admin, [tutorId], ((memberRows ?? []) as { student_id: string }[]).map((m) => m.student_id),
    );
    if (linkErr) return res.status(500).json({ error: linkErr.message });
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// DELETE /tutor/classes/:id/tutors/:tutorId — remove a co-tutor. Their roster
// is kept: who tutors which student is managed separately.
router.delete("/tutor/classes/:id/tutors/:tutorId", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const classId = String(req.params.id);
    const tutorId = String(req.params.tutorId);

    const access = await classAccess(ctx, classId);
    if (!access) return res.status(404).json({ error: "Class not found." });
    if (!access.canManageTutors) {
      return res.status(403).json({ error: "Only the class owner or an admin can remove tutors." });
    }
    if (tutorId === access.ownerId) {
      return res.status(400).json({ error: "The class owner can't be removed." });
    }

    const { error } = await ctx.admin
      .from("tutor_class_tutors").delete().eq("class_id", classId).eq("tutor_id", tutorId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// ── Batch assignment ──────────────────────────────────────────────────────────

interface BatchAssignmentBody {
  type: string;
  subject: string;
  topics: string[];
  due_date: string;
  studentIds?: string[];
  classIds?: string[];
  allRoster?: boolean;
  notify?: boolean;
  question_count?: number;
  difficulty?: string;
  min_accuracy?: number | null;
  pass_mode?: string;
  remediation?: boolean;
}

const ASSIGNMENT_DIFFICULTIES = ["adaptive", "easy", "medium", "hard"];
const DIFFICULTY_LABELS: Record<string, string> = {
  adaptive: "Adaptive", easy: "Easy", medium: "Medium", hard: "Hard",
};

interface AssignmentGoal {
  type: string;
  subject: string;
  topics: string[];
  questionCount: number;
  difficulty: string;
  minAccuracy: number | null;
  passMode: string;
  remediation: boolean;
}

type AssignmentGoalBody = Pick<BatchAssignmentBody,
  "type" | "subject" | "topics" | "question_count" | "difficulty" | "min_accuracy" | "pass_mode" | "remediation">;

/** Validate what a new assignment (one-off or recurring) asks of the student. */
function parseAssignmentGoal(body: AssignmentGoalBody): AssignmentGoal | { error: string } {
  const { type, subject, topics } = body;
  const questionCount = Number(body.question_count ?? 10);
  const difficulty = body.difficulty ?? "adaptive";
  // Optional pass mark (%): omitted or null means none.
  const minAccuracy = body.min_accuracy == null ? null : Number(body.min_accuracy);
  const passMode = body.pass_mode ?? "until_pass";

  if (!type || !subject || !Array.isArray(topics) || topics.length === 0) {
    return { error: "type, subject and at least one topic are required." };
  }
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100) {
    return { error: "question_count must be a whole number from 1 to 100." };
  }
  if (!ASSIGNMENT_DIFFICULTIES.includes(difficulty)) {
    return { error: "difficulty must be adaptive, easy, medium or hard." };
  }
  if (minAccuracy !== null && (!Number.isInteger(minAccuracy) || minAccuracy < 1 || minAccuracy > 100)) {
    return { error: "min_accuracy must be a whole number from 1 to 100." };
  }
  if (passMode !== "until_pass" && passMode !== "one_attempt") {
    return { error: "pass_mode must be until_pass or one_attempt." };
  }
  return { type, subject, topics, questionCount, difficulty, minAccuracy, passMode, remediation: body.remediation !== false };
}

/**
 * The students a new assignment goes to: the union of the named students (on
 * the caller's roster, or anyone for an admin), the members of the named
 * classes (which the caller must own or co-teach) and, with allRoster, the
 * whole roster.
 */
async function resolveAssignmentTargets(
  ctx: TutorContext,
  { studentIds, classIds, allRoster }: Pick<BatchAssignmentBody, "studentIds" | "classIds" | "allRoster">,
): Promise<{ targets: string[]; usedClassIds: string[] } | { status: number; error: string }> {
  const { admin, callerUserId } = ctx;
  const resolved = new Set<string>();

  // Always intersect against the tutor's roster — never assign to non-roster students.
  const { data: rosterRows, error: rErr } = await admin
    .from("tutor_students")
    .select("student_id")
    .eq("tutor_id", callerUserId);
  if (rErr) return { status: 500, error: rErr.message };
  const rosterSet = new Set((rosterRows ?? []).map((r: { student_id: string }) => r.student_id));

  if (allRoster) {
    for (const id of rosterSet) resolved.add(id);
  }

  // Admins (managers) can set work for any student; it's recorded as from them.
  if (Array.isArray(studentIds)) {
    for (const id of studentIds) {
      if (ctx.isAdmin || rosterSet.has(id)) resolved.add(id);
    }
  }

  let usedClassIds: string[] = [];
  if (Array.isArray(classIds) && classIds.length > 0) {
    // Every class must be one the caller owns or co-teaches (any class for admins).
    for (const classId of classIds) {
      if (!(await classAccess(ctx, String(classId)))) {
        return { status: 403, error: "One or more classes do not belong to you." };
      }
    }
    usedClassIds = classIds.map(String);

    const { data: memberRows, error: memErr } = await admin
      .from("tutor_class_members")
      .select("student_id")
      .in("class_id", usedClassIds);
    if (memErr) return { status: 500, error: memErr.message };
    for (const m of (memberRows ?? []) as { student_id: string }[]) resolved.add(m.student_id);
  }

  if (resolved.size === 0) {
    return { status: 400, error: "No target students resolved. Add students to your roster or selected classes." };
  }
  return { targets: Array.from(resolved), usedClassIds };
}

router.post("/tutor/assignments/batch", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId, tutorName, isAdmin } = ctx;

    const body = req.body as BatchAssignmentBody;
    const { due_date, notify } = body;
    const goal = parseAssignmentGoal(body);
    if ("error" in goal) return res.status(400).json({ error: goal.error });
    const { type, subject, topics, questionCount, difficulty, minAccuracy, passMode, remediation } = goal;
    if (!due_date) return res.status(400).json({ error: "due_date is required." });
    const subjectError = await claimTutorSubjects(admin, callerUserId, isAdmin, [String(subject)]);
    if (subjectError) return res.status(403).json({ error: subjectError, code: "tutor_subject_limit" });

    const resolvedTargets = await resolveAssignmentTargets(ctx, body);
    if ("error" in resolvedTargets) return res.status(resolvedTargets.status).json({ error: resolvedTargets.error });
    const { targets, usedClassIds } = resolvedTargets;

    // Generate batch_id (UUID v4) — Postgres can also generate one but we need it to return.
    const batchId = (globalThis.crypto as Crypto).randomUUID();
    const singleClassId = usedClassIds.length === 1 ? usedClassIds[0] : null;

    const rows = targets.map((sid) => ({
      tutor_id: callerUserId,
      student_id: sid,
      type,
      subject,
      topics,
      due_date,
      batch_id: batchId,
      class_id: singleClassId,
      question_count: questionCount,
      difficulty,
      min_accuracy: minAccuracy,
      pass_mode: passMode,
      remediation,
    }));

    const { data: inserted, error: insErr } = await admin
      .from("assignments")
      .insert(rows)
      .select("id, student_id");
    if (insErr) return res.status(500).json({ error: insErr.message });

    // Best-effort email notifications (do not block if email fails).
    let notified = 0;
    let notifyErrors = 0;
    if (notify !== false) {
      const resend = getResend();
      if (resend) {
        const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const emailMap = new Map<string, string>();
        for (const u of listData?.users ?? []) {
          if (u.id && u.email) emailMap.set(u.id, u.email);
        }
        const topicsList = topics.join(", ") || subject;
        const dueLabel = new Date(due_date).toLocaleDateString("en-AU", {
          day: "numeric", month: "long", year: "numeric",
        });
        const safeTutorName = escapeHtml(tutorName);
        const safeType = escapeHtml(type);
        const safeSubject = escapeHtml(subject);
        const safeTopics = escapeHtml(topicsList);
        const safeDueDate = escapeHtml(dueLabel);
        const safeGoal = escapeHtml(
          `${questionCount} question${questionCount === 1 ? "" : "s"} · ${DIFFICULTY_LABELS[difficulty]}` +
          (minAccuracy !== null ? ` · ${minAccuracy}% pass mark${passMode === "one_attempt" ? " (one attempt)" : ""}` : ""),
        );

        await Promise.all(targets.map(async (sid) => {
          const studentEmail = emailMap.get(sid);
          if (!studentEmail) return;
          const studentName = await getStudentName(admin, sid);
          const safeStudentName = escapeHtml(studentName);
          // A child added to a family signs in with a hidden address: their mail goes to the parent.
          const recipient = (await contactEmailForLogin(getServiceClient(), studentEmail)) ?? studentEmail;
          const { error: sendErr } = await resend.emails.send({
            from: EMAIL_FROM,
            to: recipient,
            subject: `New ${safeType} assigned — ${safeSubject}`,
            html: `
              <div style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0c1037; color: #f0f4ff; border-radius: 16px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #f1be43, #f9d87a); padding: 28px 32px;">
                  <h1 style="margin: 0; font-size: 24px; color: #0c1037; font-weight: 900; letter-spacing: -0.5px;">gradefarm.</h1>
                </div>
                <div style="padding: 32px;">
                  <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 800; color: #f0f4ff;">New Assignment</h2>
                  <p style="margin: 0 0 24px; color: #a3aec2; font-size: 15px;">Hi ${safeStudentName}, your tutor ${safeTutorName} has assigned you new work.</p>
                  <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr><td style="padding: 6px 0; color: #a3aec2; font-size: 13px; width: 90px;">Type</td><td style="padding: 6px 0; color: #f0f4ff; font-size: 13px; font-weight: 700;">${safeType}</td></tr>
                      <tr><td style="padding: 6px 0; color: #a3aec2; font-size: 13px;">Subject</td><td style="padding: 6px 0; color: #f0f4ff; font-size: 13px; font-weight: 700;">${safeSubject}</td></tr>
                      <tr><td style="padding: 6px 0; color: #a3aec2; font-size: 13px;">Topics</td><td style="padding: 6px 0; color: #f0f4ff; font-size: 13px; font-weight: 700;">${safeTopics}</td></tr>
                      <tr><td style="padding: 6px 0; color: #a3aec2; font-size: 13px;">Goal</td><td style="padding: 6px 0; color: #f0f4ff; font-size: 13px; font-weight: 700;">${safeGoal}</td></tr>
                      <tr><td style="padding: 6px 0; color: #a3aec2; font-size: 13px;">Due</td><td style="padding: 6px 0; color: #f1be43; font-size: 13px; font-weight: 700;">${safeDueDate}</td></tr>
                    </table>
                  </div>
                  <a href="${appUrl()}" style="display: inline-block; background: linear-gradient(135deg, #f1be43, #f9d87a); color: #0c1037; font-weight: 800; font-size: 14px; padding: 13px 26px; border-radius: 9px; text-decoration: none;">Open gradefarm.</a>
                </div>
                <div style="padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.08); color: #5a6480; font-size: 11px;">
                  You're receiving this because your tutor ${safeTutorName} sent you an assignment via gradefarm.
                </div>
              </div>
            `,
          });
          if (sendErr) notifyErrors++;
          else notified++;
        }));
      }
    }

    return res.json({
      ok: true,
      batch_id: batchId,
      class_id: singleClassId,
      created: inserted?.length ?? targets.length,
      notified,
      notify_errors: notifyErrors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// ── Recurring assignments ─────────────────────────────────────────────────────
// A schedule sets the same work again on chosen weekdays (lib/recurring-assignments.ts).

interface ScheduleBody extends Omit<BatchAssignmentBody, "due_date" | "notify"> {
  days_of_week?: number[];
  every_weeks?: number;
  due_days?: number;
  start_date?: string;
  end_date?: string | null;
  notify?: boolean;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: unknown): v is string => typeof v === "string" && YMD.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

const withNext = (s: ScheduleRow, today: string) => ({ ...s, next_on: nextIssueOn(s, today) });

// GET /tutor/assignment-schedules — the caller's schedules (?scope=all: every tutor's, admins only)
router.get("/tutor/assignment-schedules", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    let query = ctx.admin.from("assignment_schedules").select("*").order("created_at", { ascending: false });
    if (!(ctx.isAdmin && req.query.scope === "all")) query = query.eq("tutor_id", ctx.callerUserId);
    const { data, error } = await query;
    if (error) {
      if (missingScheduleTable(error)) return res.json({ schedules: [] });
      return res.status(500).json({ error: error.message });
    }
    const today = localDate(new Date());
    return res.json({ schedules: ((data ?? []) as ScheduleRow[]).map((s) => withNext(s, today)) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// POST /tutor/assignment-schedules — create a recurring assignment. If it runs
// today, today's work is set straight away.
router.post("/tutor/assignment-schedules", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId, isAdmin } = ctx;
    const body = req.body as ScheduleBody;

    const goal = parseAssignmentGoal(body);
    if ("error" in goal) return res.status(400).json({ error: goal.error });

    const days = Array.isArray(body.days_of_week) ? [...new Set(body.days_of_week.map(Number))].sort() : [];
    if (days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return res.status(400).json({ error: "Pick at least one day of the week." });
    }
    const everyWeeks = Number(body.every_weeks ?? 1);
    if (everyWeeks !== 1 && everyWeeks !== 2) return res.status(400).json({ error: "every_weeks must be 1 or 2." });
    const dueDays = Number(body.due_days ?? 0);
    if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 13) {
      return res.status(400).json({ error: "due_days must be a whole number from 0 to 13." });
    }
    const today = localDate(new Date());
    const startDate = body.start_date || today;
    if (!isDay(startDate)) return res.status(400).json({ error: "start_date must be a date (YYYY-MM-DD)." });
    if (startDate < today) return res.status(400).json({ error: "The start date can't be in the past." });
    const endDate = body.end_date || null;
    if (endDate !== null && (!isDay(endDate) || endDate < startDate)) {
      return res.status(400).json({ error: "The end date must be on or after the start date." });
    }

    const resolvedTargets = await resolveAssignmentTargets(ctx, body);
    if ("error" in resolvedTargets) return res.status(resolvedTargets.status).json({ error: resolvedTargets.error });
    const subjectError = await claimTutorSubjects(admin, callerUserId, isAdmin, [String(goal.subject)]);
    if (subjectError) return res.status(403).json({ error: subjectError, code: "tutor_subject_limit" });

    const { data, error } = await admin
      .from("assignment_schedules")
      .insert({
        tutor_id: callerUserId,
        type: goal.type,
        subject: goal.subject,
        topics: goal.topics,
        question_count: goal.questionCount,
        difficulty: goal.difficulty,
        min_accuracy: goal.minAccuracy,
        pass_mode: goal.passMode,
        remediation: goal.remediation,
        // Kept as chosen so each run picks up who's in the class (or roster) then.
        student_ids: body.allRoster ? [] : (Array.isArray(body.studentIds) ? body.studentIds.map(String) : []),
        class_ids: resolvedTargets.usedClassIds,
        all_roster: !!body.allRoster,
        days_of_week: days,
        every_weeks: everyWeeks,
        due_days: dueDays,
        start_date: startDate,
        end_date: endDate,
        notify: body.notify !== false,
      })
      .select("*")
      .single<ScheduleRow>();
    if (error) {
      if (missingScheduleTable(error)) {
        return res.status(503).json({ error: "Recurring assignments aren't set up yet (the database migration hasn't been applied)." });
      }
      return res.status(500).json({ error: error.message });
    }

    let schedule = data;
    let issued = 0;
    if (issuesOn(schedule, today)) {
      issued = (await issueSchedule(admin, schedule, today)) ?? 0;
      schedule = { ...schedule, last_issued_on: today };
    }
    return res.json({ ok: true, schedule: withNext(schedule, today), issued });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

/** The schedule, if the caller set it (or is an admin). */
async function ownSchedule(ctx: TutorContext, id: string): Promise<ScheduleRow | null> {
  const { data } = await ctx.admin.from("assignment_schedules").select("*").eq("id", id).maybeSingle<ScheduleRow>();
  return data && (data.tutor_id === ctx.callerUserId || ctx.isAdmin) ? data : null;
}

// PATCH /tutor/assignment-schedules/:id — { paused: boolean } pauses or resumes it
router.patch("/tutor/assignment-schedules/:id", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const schedule = await ownSchedule(ctx, String(req.params.id));
    if (!schedule) return res.status(404).json({ error: "Recurring assignment not found." });
    const { paused } = req.body as { paused?: boolean };
    if (typeof paused !== "boolean") return res.status(400).json({ error: "paused (true or false) is required." });

    const { data, error } = await ctx.admin
      .from("assignment_schedules")
      .update({ paused_at: paused ? (schedule.paused_at ?? new Date().toISOString()) : null })
      .eq("id", schedule.id)
      .select("*")
      .single<ScheduleRow>();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, schedule: withNext(data, localDate(new Date())) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// DELETE /tutor/assignment-schedules/:id — stops it; work already set stays
router.delete("/tutor/assignment-schedules/:id", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const schedule = await ownSchedule(ctx, String(req.params.id));
    if (!schedule) return res.status(404).json({ error: "Recurring assignment not found." });
    const { error } = await ctx.admin.from("assignment_schedules").delete().eq("id", schedule.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// GET /tutor/students/:studentId/writing-attempts — rostered students only
router.get("/tutor/students/:studentId/writing-attempts", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;
    const { studentId } = req.params;
    if (!studentId) return res.status(400).json({ error: "studentId required" });

    if (!ctx.isAdmin) {
      const { data: rosterRow, error: rosterErr } = await admin
        .from("tutor_students")
        .select("student_id")
        .eq("tutor_id", callerUserId)
        .eq("student_id", studentId)
        .maybeSingle<{ student_id: string }>();
      if (rosterErr || !rosterRow) return res.status(403).json({ error: "Student not on your roster." });
    }

    const { data, error } = await admin
      .from("writing_attempts")
      .select(
        "id, subject, essay_type, mode, prompt, image_url, timed, duration_seconds, actual_seconds, created_at, feedback",
      )
      .eq("user_id", studentId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ attempts: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// ── Student roster details: year level + tutor-scoped tutored subjects ────────

interface SubjectRow {
  id: string;
  student_id: string;
  subject_name: string;
  stage: string | null;
}

interface StudentDetail {
  override_year_level: string | null;     // tutor override (tutor_students.year_level)
  profile_year_level: number | null;      // set by the student at onboarding
  tutored: SubjectRow[];                   // subjects THIS tutor tutors (their selection)
  subscriptions: { subject_name: string; stage: string | null }[]; // student's onboarding subjects
  included: { subject_name: string; stage: string | null }[]; // subjects THIS tutor includes (free)
  // Diagnostics on tutor-included subjects (lib/student-diagnostic.ts), by any tutor.
  diagnostics: { curriculum_id: string; status: "pending" | "waived" | "completed"; percentage: number | null }[];
  // The parent THIS tutor sends weekly progress reports to (lib/parent-reports.ts).
  parent: { email: string; name: string | null; unsubscribed: boolean } | null;
}

type RosterRow = {
  tutor_id: string; student_id: string; year_level: string | null;
  parent_email: string | null; parent_name: string | null; parent_reports_stopped_at: string | null;
};

// GET /tutor/roster-details — per-student year level + subjects (onboarding + tutor selection)
router.get("/tutor/roster-details", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;

    const scopeAll = ctx.isAdmin && req.query.scope === "all";
    let rosterQuery = admin.from("tutor_students").select("tutor_id, student_id, year_level, parent_email, parent_name, parent_reports_stopped_at");
    if (!scopeAll) rosterQuery = rosterQuery.eq("tutor_id", callerUserId);
    const { data: roster, error: rErr } = await rosterQuery;
    if (rErr) return res.status(500).json({ error: rErr.message });

    const studentIds = (roster ?? []).map((r: { student_id: string }) => r.student_id);

    const byStudent: Record<string, StudentDetail> = {};
    for (const r of (roster ?? []) as RosterRow[]) {
      const parent = r.tutor_id === callerUserId && r.parent_email
        ? { email: r.parent_email, name: r.parent_name, unsubscribed: !!r.parent_reports_stopped_at }
        : null;
      if (byStudent[r.student_id]) { // a student with several tutors
        byStudent[r.student_id].parent ??= parent;
        continue;
      }
      byStudent[r.student_id] = {
        override_year_level: r.year_level ?? null, profile_year_level: null, tutored: [], subscriptions: [], included: [], diagnostics: [], parent,
      };
    }

    if (studentIds.length > 0) {
      // Profile year level (student-set at onboarding)
      const { data: profs } = await admin.from("profiles").select("id, year_level").in("id", studentIds);
      for (const p of (profs ?? []) as { id: string; year_level: number | null }[]) {
        if (byStudent[p.id]) byStudent[p.id].profile_year_level = p.year_level ?? null;
      }
      // Student's onboarding subjects (the pick list)
      const { data: subs } = await admin
        .from("user_subscriptions")
        .select("user_id, subject_name, stage, active, source, sponsor_tutor_id")
        .in("user_id", studentIds);
      type SubRow = { user_id: string; subject_name: string; stage: string | null; active: boolean | null; source: string; sponsor_tutor_id: string | null };
      for (const s of (subs ?? []) as SubRow[]) {
        if (s.active === false || !byStudent[s.user_id]) continue;
        byStudent[s.user_id].subscriptions.push({ subject_name: s.subject_name, stage: s.stage });
        if (s.source === "tutor" && s.sponsor_tutor_id === callerUserId) {
          byStudent[s.user_id].included.push({ subject_name: s.subject_name, stage: s.stage });
        }
      }
    }

    if (studentIds.length > 0) {
      const { data: diags } = await admin
        .from("diagnostic_assessments")
        .select("student_id, curriculum_id, status, waived_at, report")
        .in("student_id", studentIds);
      type DiagRow = { student_id: string; curriculum_id: string; status: string; waived_at: string | null; report: { percentage?: number } | null };
      for (const d of (diags ?? []) as DiagRow[]) {
        byStudent[d.student_id]?.diagnostics.push({
          curriculum_id: d.curriculum_id,
          status: d.status === "completed" ? "completed" : d.waived_at ? "waived" : "pending",
          percentage: d.report?.percentage ?? null,
        });
      }
    }

    // Tutor's selection of which subjects they tutor
    let tutoredQuery = admin.from("tutor_student_subjects").select("id, student_id, subject_name, stage");
    tutoredQuery = scopeAll ? tutoredQuery.in("student_id", studentIds) : tutoredQuery.eq("tutor_id", callerUserId);
    const { data: tutored, error: sErr } = scopeAll && studentIds.length === 0
      ? { data: [], error: null }
      : await tutoredQuery;
    if (sErr) return res.status(500).json({ error: sErr.message });
    for (const s of (tutored ?? []) as SubjectRow[]) {
      if (byStudent[s.student_id]) byStudent[s.student_id].tutored.push(s);
    }

    return res.json({ byStudent });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

async function assertRostered(
  admin: SupabaseClient & { auth: SupabaseAdminAuth },
  tutorId: string,
  studentId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("tutor_students")
    .select("student_id")
    .eq("tutor_id", tutorId)
    .eq("student_id", studentId)
    .maybeSingle<{ student_id: string }>();
  return !!data;
}

// PATCH /tutor/students/:studentId/details — set year level
router.patch("/tutor/students/:studentId/details", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;
    const studentId = String(req.params.studentId);
    if (!(await assertRostered(admin, callerUserId, studentId))) {
      return res.status(403).json({ error: "Student not on your roster." });
    }
    const { year_level } = req.body as { year_level?: string | null };
    const { error } = await admin
      .from("tutor_students")
      .update({ year_level: year_level?.trim() || null })
      .eq("tutor_id", callerUserId)
      .eq("student_id", studentId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// PUT /tutor/students/:studentId/parent — { email, name? }: who gets this
// student's weekly progress report (a plan feature). An empty email stops
// them. A parent who unsubscribed stays unsubscribed unless the address changes.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.put("/tutor/students/:studentId/parent", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;
    const studentId = String(req.params.studentId);
    const { data: row } = await admin
      .from("tutor_students").select("parent_email, parent_reports_stopped_at")
      .eq("tutor_id", callerUserId).eq("student_id", studentId)
      .maybeSingle<{ parent_email: string | null; parent_reports_stopped_at: string | null }>();
    if (!row) return res.status(403).json({ error: "Student not on your roster." });

    const body = (req.body ?? {}) as { email?: unknown; name?: unknown };
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim().slice(0, 80) || null;
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (email && !(await tutorHasFeature(admin, callerUserId, "parentReports", ctx.isAdmin))) {
      return res.status(403).json({ error: FEATURE_MISSING.parentReports, code: "tutor_plan_feature" });
    }
    const changed = email !== (row.parent_email ?? "");
    const { error } = await admin
      .from("tutor_students")
      .update({
        parent_email: email || null,
        parent_name: email ? name : null,
        ...(changed ? { parent_reports_stopped_at: null, parent_report_week: null } : {}),
      })
      .eq("tutor_id", callerUserId).eq("student_id", studentId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ parent: email ? { email, name, unsubscribed: !changed && !!row.parent_reports_stopped_at } : null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// POST /tutor/students/:studentId/subjects — add a tutored subject + stage
router.post("/tutor/students/:studentId/subjects", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;
    const studentId = String(req.params.studentId);
    if (!(await assertRostered(admin, callerUserId, studentId))) {
      return res.status(403).json({ error: "Student not on your roster." });
    }
    const { subject_name, stage } = req.body as { subject_name?: string; stage?: string | null };
    const subj = (subject_name ?? "").trim();
    if (!subj) return res.status(400).json({ error: "subject_name is required." });
    const subjectError = await claimTutorSubjects(admin, callerUserId, ctx.isAdmin, [subj]);
    if (subjectError) return res.status(403).json({ error: subjectError, code: "tutor_subject_limit" });

    const { data, error } = await admin
      .from("tutor_student_subjects")
      .upsert(
        { tutor_id: callerUserId, student_id: studentId, subject_name: subj, stage: stage?.trim() || null },
        { onConflict: "tutor_id,student_id,subject_name,stage" },
      )
      .select("id, student_id, subject_name, stage")
      .single<SubjectRow>();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ subject: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// DELETE /tutor/students/:studentId/subjects/:subjectId — remove a tutored subject
router.delete("/tutor/students/:studentId/subjects/:subjectId", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;
    const subjectId = String(req.params.subjectId);
    const { error } = await admin
      .from("tutor_student_subjects")
      .delete()
      .eq("id", subjectId)
      .eq("tutor_id", callerUserId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// ── Included subjects (free for the student; see lib/included-subject.ts) ───

// GET /tutor/included-subjects — whether the caller can include subjects, and the subjects to pick from.
router.get("/tutor/included-subjects", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;
    const canInclude = await canIncludeSubject(admin, callerUserId);
    if (!canInclude) return res.json({ canInclude, subjects: [] });
    const { data, error } = await admin
      .from("curricula")
      .select("id, name, level_label")
      .in("status", ["live", "generating"])
      .is("archived_at", null)
      .order("name");
    if (error) return res.status(500).json({ error: error.message });
    const subjects = ((data ?? []) as { id: string; name: string; level_label: string | null }[]).map((c) => {
      const stage = (c.level_label || "").trim();
      return { id: c.id, name: c.name, stage, label: stage && !c.name.includes(stage) ? `${c.name} ${stage}` : c.name };
    });
    return res.json({ canInclude, subjects });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// PUT /tutor/students/:studentId/included-subjects/:curriculumId — include a subject.
router.put("/tutor/students/:studentId/included-subjects/:curriculumId", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;
    const studentId = String(req.params.studentId);
    if (!(await assertRostered(admin, callerUserId, studentId))) {
      return res.status(403).json({ error: "Student not on your roster." });
    }
    if (!(await canIncludeSubject(admin, callerUserId))) {
      return res.status(403).json({ error: "Your account can't include subjects yet. Ask an admin to turn it on." });
    }
    const curriculumId = String(req.params.curriculumId);
    const cur = await liveCurriculum(admin, curriculumId);
    if (cur) {
      const subjectError = await claimTutorSubjects(admin, callerUserId, ctx.isAdmin, [cur.name]);
      if (subjectError) return res.status(403).json({ error: subjectError, code: "tutor_subject_limit" });
    }
    const result = await includeSubject(admin, callerUserId, studentId, curriculumId);
    // The student does a diagnostic on it before practising (unless they already have one).
    await createStudentDiagnostic(admin, callerUserId, studentId, curriculumId);
    return res.json(result);
  } catch (err) {
    if (err instanceof IncludedSubjectError) return res.status(err.status).json({ error: err.message });
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// DELETE /tutor/students/:studentId/included-subjects/:curriculumId — stop including a subject.
router.delete("/tutor/students/:studentId/included-subjects/:curriculumId", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    await removeIncludedSubject(ctx.admin, ctx.callerUserId, String(req.params.studentId), String(req.params.curriculumId));
    return res.json({ ok: true });
  } catch (err) {
    if (err instanceof IncludedSubjectError) return res.status(err.status).json({ error: err.message });
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// ── Diagnostics on included subjects (lib/student-diagnostic.ts) ────────────

// GET /tutor/subjects/:curriculumId/topics — topics and subtopics, for choosing what a diagnostic covers.
router.get("/tutor/subjects/:curriculumId/topics", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin } = ctx;
    const { data: topics, error } = await admin
      .from("curriculum_topics").select("id, name").eq("curriculum_id", String(req.params.curriculumId)).order("order_index");
    if (error) return res.status(500).json({ error: error.message });
    const topicRows = (topics ?? []) as { id: string; name: string }[];
    const { data: subs, error: subErr } = topicRows.length
      ? await admin.from("curriculum_subtopics").select("id, topic_id, name").in("topic_id", topicRows.map((t) => t.id)).order("order_index")
      : { data: [], error: null };
    if (subErr) return res.status(500).json({ error: subErr.message });
    const subRows = (subs ?? []) as { id: string; topic_id: string; name: string }[];
    return res.json({
      topics: topicRows.map((t) => ({
        id: t.id,
        name: t.name,
        subtopics: subRows.filter((st) => st.topic_id === t.id).map((st) => ({ id: st.id, name: st.name })),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// POST /tutor/students/:studentId/diagnostics/:curriculumId — set a diagnostic on an included subject.
router.post("/tutor/students/:studentId/diagnostics/:curriculumId", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;
    const studentId = String(req.params.studentId);
    if (!(await assertRostered(admin, callerUserId, studentId))) {
      return res.status(403).json({ error: "Student not on your roster." });
    }
    if (!(await canIncludeSubject(admin, callerUserId))) {
      return res.status(403).json({ error: "Your account can't include subjects yet. Ask an admin to turn it on." });
    }
    await createStudentDiagnostic(admin, callerUserId, studentId, String(req.params.curriculumId));
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// POST /tutor/students/:studentId/diagnostics/:curriculumId/waive — let them practise without it.
router.post("/tutor/students/:studentId/diagnostics/:curriculumId/waive", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;
    const studentId = String(req.params.studentId);
    if (!(await assertRostered(admin, callerUserId, studentId))) {
      return res.status(403).json({ error: "Student not on your roster." });
    }
    await waiveDiagnostic(admin, studentId, String(req.params.curriculumId));
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

export default router;