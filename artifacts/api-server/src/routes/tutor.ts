import { Router, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

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
    .select("id, is_tutor, display_name")
    .eq("id", callerUser.user.id)
    .single<{ id: string; is_tutor: boolean; display_name: string | null }>();

  if (profErr || !callerProfile?.is_tutor) {
    res.status(403).json({ error: "Forbidden: caller is not a tutor" });
    return null;
  }
  return {
    admin,
    callerUserId: callerUser.user.id,
    tutorName: callerProfile.display_name ?? "Your tutor",
  };
}

async function getStudentEmail(
  admin: SupabaseClient & { auth: SupabaseAdminAuth },
  tutorId: string,
  studentId: string,
): Promise<string | null> {
  const { data: rosterRow, error: rosterErr } = await admin
    .from("tutor_students")
    .select("student_id")
    .eq("tutor_id", tutorId)
    .eq("student_id", studentId)
    .single<{ student_id: string }>();
  if (rosterErr || !rosterRow) return null;

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

router.post("/tutor/find-student", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;

    const { email } = req.body as { email: string };
    if (!email) return res.status(400).json({ error: "email is required" });

    const normalizedEmail = email.toLowerCase().trim();
    const { data: listData, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) return res.status(500).json({ error: listError.message });

    const found = listData.users.find((u) => u.email?.toLowerCase() === normalizedEmail);
    if (!found) {
      return res.status(404).json({ error: "No user found with that email address." });
    }
    if (found.id === callerUserId) {
      return res.status(400).json({ error: "You cannot add yourself as a student." });
    }

    const { data: studentProfile, error: studentProfError } = await admin
      .from("profiles")
      .select("id, display_name")
      .eq("id", found.id)
      .single<{ id: string; display_name: string | null }>();

    if (studentProfError || !studentProfile) {
      return res.status(404).json({ error: "User has not completed setup." });
    }

    return res.json({ id: studentProfile.id, display_name: studentProfile.display_name, email: found.email });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

router.post("/tutor/student-emails", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;

    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.json({ emails: {} });
    }

    const { data: rosterRows, error: rosterErr } = await admin
      .from("tutor_students")
      .select("student_id")
      .eq("tutor_id", callerUserId)
      .in("student_id", ids);

    if (rosterErr) return res.status(500).json({ error: rosterErr.message });
    const allowed = new Set((rosterRows ?? []).map((r: { student_id: string }) => r.student_id));

    const { data: listData, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) return res.status(500).json({ error: listError.message });

    const emails: Record<string, string> = {};
    for (const u of listData.users) {
      if (u.id && u.email && allowed.has(u.id)) emails[u.id] = u.email;
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

    const studentEmail = await getStudentEmail(admin, callerUserId, student_id);
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

    const { error: sendErr } = await resend.emails.send({
      from: "gradefarm. <notifications@gradefarm.au>",
      to: studentEmail,
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
            <a href="https://gradefarm.au" style="display: inline-block; background: linear-gradient(135deg, #f1be43, #f9d87a); color: #0c1037; font-weight: 800; font-size: 14px; padding: 13px 26px; border-radius: 9px; text-decoration: none;">Open gradefarm.</a>
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

    const studentEmail = await getStudentEmail(admin, callerUserId, student_id);
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

    const { error: sendErr } = await resend.emails.send({
      from: "gradefarm. <notifications@gradefarm.au>",
      to: studentEmail,
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
            <a href="https://gradefarm.au" style="display: inline-block; background: linear-gradient(135deg, #f1be43, #f9d87a); color: #0c1037; font-weight: 800; font-size: 14px; padding: 13px 26px; border-radius: 9px; text-decoration: none;">Open gradefarm.</a>
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

router.get("/tutor/classes", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;

    const { data: classes, error: cErr } = await admin
      .from("tutor_classes")
      .select("id, tutor_id, name, subject, color, description, created_at")
      .eq("tutor_id", callerUserId)
      .order("created_at", { ascending: false });
    if (cErr) return res.status(500).json({ error: cErr.message });

    const ids = (classes ?? []).map((c: ClassRow) => c.id);
    let members: MemberRow[] = [];
    if (ids.length > 0) {
      const { data: memberRows, error: mErr } = await admin
        .from("tutor_class_members")
        .select("class_id, student_id, added_at")
        .in("class_id", ids);
      if (mErr) return res.status(500).json({ error: mErr.message });
      members = (memberRows ?? []) as MemberRow[];
    }

    const byClass: Record<string, MemberRow[]> = {};
    for (const m of members) {
      if (!byClass[m.class_id]) byClass[m.class_id] = [];
      byClass[m.class_id].push(m);
    }

    const result = (classes ?? []).map((c: ClassRow) => ({
      ...c,
      members: byClass[c.id] ?? [],
    }));
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
    return res.json({ class: { ...data, members: [] } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

router.patch("/tutor/classes/:id", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;
    const classId = req.params.id;

    const { data: existing, error: exErr } = await admin
      .from("tutor_classes")
      .select("id, tutor_id")
      .eq("id", classId)
      .single<{ id: string; tutor_id: string }>();
    if (exErr || !existing || existing.tutor_id !== callerUserId) {
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
    const { admin, callerUserId } = ctx;
    const classId = req.params.id;

    const { data: existing, error: exErr } = await admin
      .from("tutor_classes")
      .select("id, tutor_id")
      .eq("id", classId)
      .single<{ id: string; tutor_id: string }>();
    if (exErr || !existing || existing.tutor_id !== callerUserId) {
      return res.status(404).json({ error: "Class not found." });
    }

    const { error } = await admin.from("tutor_classes").delete().eq("id", classId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

async function assertOwnedClass(
  admin: SupabaseClient & { auth: SupabaseAdminAuth },
  callerUserId: string,
  classId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("tutor_classes")
    .select("id, tutor_id")
    .eq("id", classId)
    .single<{ id: string; tutor_id: string }>();
  return !error && !!data && data.tutor_id === callerUserId;
}

router.post("/tutor/classes/:id/members", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;
    const classId = String(req.params.id);

    if (!(await assertOwnedClass(admin, callerUserId, classId))) {
      return res.status(404).json({ error: "Class not found." });
    }

    const { studentIds } = req.body as { studentIds?: string[] };
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: "studentIds is required." });
    }

    // Validate all students are on the tutor's roster
    const { data: rosterRows, error: rErr } = await admin
      .from("tutor_students")
      .select("student_id")
      .eq("tutor_id", callerUserId)
      .in("student_id", studentIds);
    if (rErr) return res.status(500).json({ error: rErr.message });
    const allowed = new Set((rosterRows ?? []).map((r: { student_id: string }) => r.student_id));
    const filtered = studentIds.filter((id) => allowed.has(id));
    if (filtered.length === 0) {
      return res.status(400).json({ error: "None of the supplied students are on your roster." });
    }

    const rows = filtered.map((sid) => ({ class_id: classId, student_id: sid }));
    const { error } = await admin
      .from("tutor_class_members")
      .upsert(rows, { onConflict: "class_id,student_id" });
    if (error) return res.status(500).json({ error: error.message });
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
    const { admin, callerUserId } = ctx;
    const classId = String(req.params.id);
    const studentId = String(req.params.studentId);

    if (!(await assertOwnedClass(admin, callerUserId, classId))) {
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
}

router.post("/tutor/assignments/batch", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId, tutorName } = ctx;

    const body = req.body as BatchAssignmentBody;
    const { type, subject, topics, due_date, studentIds, classIds, allRoster, notify } = body;

    if (!type || !subject || !Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ error: "type, subject and at least one topic are required." });
    }
    if (!due_date) return res.status(400).json({ error: "due_date is required." });

    // Resolve target student IDs.
    const resolved = new Set<string>();

    // Always intersect against the tutor's roster — never assign to non-roster students.
    const { data: rosterRows, error: rErr } = await admin
      .from("tutor_students")
      .select("student_id")
      .eq("tutor_id", callerUserId);
    if (rErr) return res.status(500).json({ error: rErr.message });
    const rosterSet = new Set((rosterRows ?? []).map((r: { student_id: string }) => r.student_id));

    if (allRoster) {
      for (const id of rosterSet) resolved.add(id);
    }

    if (Array.isArray(studentIds)) {
      for (const id of studentIds) {
        if (rosterSet.has(id)) resolved.add(id);
      }
    }

    let usedClassIds: string[] = [];
    if (Array.isArray(classIds) && classIds.length > 0) {
      // Verify all classes belong to this tutor
      const { data: ownedClasses, error: ocErr } = await admin
        .from("tutor_classes")
        .select("id")
        .eq("tutor_id", callerUserId)
        .in("id", classIds);
      if (ocErr) return res.status(500).json({ error: ocErr.message });
      usedClassIds = (ownedClasses ?? []).map((c: { id: string }) => c.id);
      if (usedClassIds.length !== classIds.length) {
        return res.status(403).json({ error: "One or more classes do not belong to you." });
      }

      const { data: memberRows, error: memErr } = await admin
        .from("tutor_class_members")
        .select("student_id")
        .in("class_id", usedClassIds);
      if (memErr) return res.status(500).json({ error: memErr.message });
      for (const m of (memberRows ?? []) as { student_id: string }[]) {
        if (rosterSet.has(m.student_id)) resolved.add(m.student_id);
      }
    }

    if (resolved.size === 0) {
      return res.status(400).json({ error: "No target students resolved. Add students to your roster or selected classes." });
    }

    // Generate batch_id (UUID v4) — Postgres can also generate one but we need it to return.
    const batchId = (globalThis.crypto as Crypto).randomUUID();
    const singleClassId = usedClassIds.length === 1 ? usedClassIds[0] : null;

    const targets = Array.from(resolved);
    const rows = targets.map((sid) => ({
      tutor_id: callerUserId,
      student_id: sid,
      type,
      subject,
      topics,
      due_date,
      batch_id: batchId,
      class_id: singleClassId,
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

        await Promise.all(targets.map(async (sid) => {
          const studentEmail = emailMap.get(sid);
          if (!studentEmail) return;
          const studentName = await getStudentName(admin, sid);
          const safeStudentName = escapeHtml(studentName);
          const { error: sendErr } = await resend.emails.send({
            from: "gradefarm. <notifications@gradefarm.au>",
            to: studentEmail,
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
                      <tr><td style="padding: 6px 0; color: #a3aec2; font-size: 13px;">Due</td><td style="padding: 6px 0; color: #f1be43; font-size: 13px; font-weight: 700;">${safeDueDate}</td></tr>
                    </table>
                  </div>
                  <a href="https://gradefarm.au" style="display: inline-block; background: linear-gradient(135deg, #f1be43, #f9d87a); color: #0c1037; font-weight: 800; font-size: 14px; padding: 13px 26px; border-radius: 9px; text-decoration: none;">Open gradefarm.</a>
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

export default router;
