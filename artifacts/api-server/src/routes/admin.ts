import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

function getAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("No SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY configured");
  return createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
}

async function requireAdmin(req: any, res: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const callerJwt = authHeader.slice(7);
  const admin = getAdmin();

  const { data: callerUser, error: callerError } = await admin.auth.getUser(callerJwt);
  if (callerError || !callerUser?.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }

  const { data: callerProfile, error: profErr } = await admin
    .from("profiles")
    .select("id, is_admin")
    .eq("id", callerUser.user.id)
    .single();

  if (profErr || !callerProfile?.is_admin) {
    res.status(403).json({ error: "Forbidden: admin only" });
    return null;
  }
  return { admin, callerUserId: callerUser.user.id };
}

// Paginate through every auth user so callers can build a complete email map.
async function listAllAuthUsers(admin: ReturnType<typeof getAdmin>) {
  const all: { id: string; email: string; created_at: string }[] = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    for (const u of data.users) {
      all.push({ id: u.id, email: u.email || "", created_at: u.created_at });
    }
    if (data.users.length < perPage) break;
    page++;
  }
  return all;
}

// List all users with profile flags. Paginates through every auth user.
router.get("/admin/users", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin } = ctx;

    let allAuthUsers: { id: string; email: string; created_at: string }[];
    try {
      allAuthUsers = await listAllAuthUsers(admin);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list users";
      return res.status(500).json({ error: message });
    }

    if (allAuthUsers.length === 0) return res.json({ users: [] });

    const ids = allAuthUsers.map(u => u.id).filter(Boolean);

    type ProfRow = {
      id: string; display_name: string | null; school: string | null;
      is_admin: boolean; is_tutor: boolean;
      tutor_application_status: string; tutor_application_at: string | null;
      created_at: string;
    };

    // Batch the profile join so we stay well under PostgREST's default
    // 1000-row cap and avoid hitting URL length limits on `.in()`.
    const PROFILE_BATCH = 200;
    const profById = new Map<string, ProfRow>();
    for (let i = 0; i < ids.length; i += PROFILE_BATCH) {
      const chunk = ids.slice(i, i + PROFILE_BATCH);
      const { data: profiles, error: profErr } = await admin
        .from("profiles")
        .select("id, display_name, school, is_admin, is_tutor, tutor_application_status, tutor_application_at, created_at")
        .in("id", chunk);
      if (profErr) {
        return res.status(500).json({
          error: `Failed to load profiles (batch ${i}-${i + chunk.length}): ${profErr.message}`,
        });
      }
      for (const p of (profiles || []) as ProfRow[]) profById.set(p.id, p);
    }
    const users = allAuthUsers.map(u => {
      const p = profById.get(u.id) || ({} as Partial<ProfRow>);
      return {
        id: u.id,
        email: u.email,
        display_name: p.display_name || null,
        school: p.school || null,
        is_admin: !!p.is_admin,
        is_tutor: !!p.is_tutor,
        tutor_application_status: p.tutor_application_status || "none",
        tutor_application_at: p.tutor_application_at || null,
        created_at: u.created_at,
      };
    });

    return res.json({ users });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// List pending tutor applications (with email).
router.get("/admin/tutor-applications", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin } = ctx;

    const { data: pending, error: pendErr } = await admin
      .from("profiles")
      .select("id, display_name, school, tutor_application_at")
      .eq("tutor_application_status", "pending")
      .order("tutor_application_at", { ascending: true });

    if (pendErr) return res.status(500).json({ error: pendErr.message });
    const ids = new Set((pending || []).map(p => p.id));
    if (ids.size === 0) return res.json({ applications: [] });

    let allAuthUsers: { id: string; email: string; created_at: string }[];
    try {
      allAuthUsers = await listAllAuthUsers(admin);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list users";
      return res.status(500).json({ error: message });
    }

    const emailById = new Map<string, string>();
    for (const u of allAuthUsers) {
      if (u.id && u.email && ids.has(u.id)) emailById.set(u.id, u.email);
    }

    const applications = (pending || []).map(p => ({
      id: p.id,
      display_name: p.display_name,
      school: p.school,
      email: emailById.get(p.id) || null,
      applied_at: p.tutor_application_at,
    }));

    return res.json({ applications });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// ── Row types for admin/students routes ──────────────────────────────────────
type StudentProfileRow = {
  id: string;
  display_name: string | null;
  school: string | null;
  xp: number;
  streak: number;
  best_streak: number;
  last_active: string | null;
  onboarding_completed: boolean;
  is_admin: boolean;
  is_tutor: boolean;
  tutor_application_status: string;
  created_at: string;
};

type SubRow = {
  user_id: string;
  subject_name: string;
  stage: string;
};

type TutorStudentRow = {
  student_id: string;
  tutor_id: string;
};

type TutorNameRow = {
  id: string;
  display_name: string | null;
};

type QuestionRow = {
  id: string;
  topic: string;
  subject: string;
};

type StruggleRow = {
  question_id: string;
  attempts: number;
  wrong: number;
};

// GET /admin/students — student-role users with profile + subscriptions + tutor, newest first
router.get("/admin/students", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin } = ctx;

    // Paginate through all auth users so the list stays complete past 1000 accounts
    const allAuthUsers: { id: string; email: string; created_at: string }[] = [];
    let page = 1;
    const pageSize = 200;
    while (true) {
      const { data: pageData, error: pageError } = await admin.auth.admin.listUsers({
        page,
        perPage: pageSize,
      });
      if (pageError) return res.status(500).json({ error: pageError.message });
      for (const u of pageData.users) {
        allAuthUsers.push({ id: u.id, email: u.email || "", created_at: u.created_at });
      }
      if (pageData.users.length < pageSize) break;
      page++;
    }

    if (allAuthUsers.length === 0) return res.json({ students: [], warnings: [] });

    const allIds = allAuthUsers.map((u) => u.id);
    const warnings: string[] = [];

    const { data: tutorStudentsData, error: tutorResError } = await admin
      .from("tutor_students")
      .select("student_id, tutor_id");

    if (tutorResError) warnings.push(`tutor assignments unavailable: ${tutorResError.message}`);

    const IN_BATCH = 200;
    const profiles: StudentProfileRow[] = [];
    for (let i = 0; i < allIds.length; i += IN_BATCH) {
      const chunk = allIds.slice(i, i + IN_BATCH);
      const { data: profChunk, error: profErr } = await admin
        .from("profiles")
        .select(
          "id, display_name, school, xp, streak, best_streak, last_active, onboarding_completed, is_admin, is_tutor, tutor_application_status, created_at",
        )
        .in("id", chunk);
      if (profErr) {
        return res.status(500).json({ error: `Failed to load profiles (batch ${i}-${i + chunk.length}): ${profErr.message}` });
      }
      profiles.push(...((profChunk || []) as StudentProfileRow[]));
    }

    const subsRows: SubRow[] = [];
    for (let i = 0; i < allIds.length; i += IN_BATCH) {
      const chunk = allIds.slice(i, i + IN_BATCH);
      const { data: subChunk, error: subErr } = await admin
        .from("user_subscriptions")
        .select("user_id, subject_name, stage")
        .eq("active", true)
        .in("user_id", chunk);
      if (subErr) {
        warnings.push(`subscriptions unavailable (batch ${i}-${i + chunk.length}): ${subErr.message}`);
        continue;
      }
      subsRows.push(...((subChunk || []) as SubRow[]));
    }

    // Deactivation state (soft-deleted accounts). Guarded so a DB that hasn't run the
    // deactivated_at migration yet still returns the student list.
    const deactivatedByUser: Record<string, string | null> = {};
    for (let i = 0; i < allIds.length; i += IN_BATCH) {
      const chunk = allIds.slice(i, i + IN_BATCH);
      const { data: deChunk, error: deErr } = await admin
        .from("profiles")
        .select("id, deactivated_at")
        .in("id", chunk);
      if (deErr) {
        warnings.push(`deactivation state unavailable: ${deErr.message}`);
        break;
      }
      (deChunk || []).forEach((r: { id: string; deactivated_at: string | null }) => {
        deactivatedByUser[r.id] = r.deactivated_at ?? null;
      });
    }

    const tutorRows = (tutorStudentsData || []) as TutorStudentRow[];

    // Resolve tutor display names
    const uniqueTutorIds = [...new Set(tutorRows.map((r) => r.tutor_id))];
    const tutorNames: Record<string, string> = {};
    if (uniqueTutorIds.length > 0) {
      for (let i = 0; i < uniqueTutorIds.length; i += IN_BATCH) {
        const chunkT = uniqueTutorIds.slice(i, i + IN_BATCH);
        const { data: tutorProfiles, error: tnError } = await admin
          .from("profiles")
          .select("id, display_name")
          .in("id", chunkT);
        if (tnError) {
          warnings.push(`tutor names unavailable (batch ${i}-${i + chunkT.length}): ${tnError.message}`);
        } else {
          (tutorProfiles as TutorNameRow[]).forEach((p) => {
            tutorNames[p.id] = p.display_name || "Unknown";
          });
        }
      }
    }

    // Group subscriptions by user_id
    const subsByUser: Record<string, { subject_name: string; stage: string }[]> = {};
    subsRows.forEach((s) => {
      if (!subsByUser[s.user_id]) subsByUser[s.user_id] = [];
      subsByUser[s.user_id].push({ subject_name: s.subject_name, stage: s.stage });
    });

    // Map tutor assignment by student_id
    const tutorByStudent: Record<string, { name: string; id: string }> = {};
    tutorRows.forEach((r) => {
      tutorByStudent[r.student_id] = { name: tutorNames[r.tutor_id] || "Unknown", id: r.tutor_id };
    });

    const profById = new Map<string, StudentProfileRow>(profiles.map((p) => [p.id, p]));

    const students = allAuthUsers
      .map((u) => {
        const p = profById.get(u.id);
        const tut = tutorByStudent[u.id] || null;
        return {
          id: u.id,
          email: u.email,
          display_name: p?.display_name ?? null,
          school: p?.school ?? null,
          xp: p?.xp ?? 0,
          streak: p?.streak ?? 0,
          best_streak: p?.best_streak ?? 0,
          last_active: p?.last_active ?? null,
          onboarding_completed: !!(p?.onboarding_completed),
          is_admin: !!(p?.is_admin),
          is_tutor: !!(p?.is_tutor),
          tutor_application_status: p?.tutor_application_status ?? "none",
          created_at: u.created_at,
          deactivated_at: deactivatedByUser[u.id] ?? null,
          subjects: subsByUser[u.id] || [],
          tutor_name: tut?.name ?? null,
          tutor_id: tut?.id ?? null,
        };
      })
      // Filter to student-role users only (not admins or tutors)
      .filter((u) => !u.is_admin && !u.is_tutor)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.json({ students, warnings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// POST /admin/students/:id/deactivate — soft-delete (deactivate) or reactivate an account.
// Body: { active: boolean } — active:false deactivates, active:true reactivates.
// Deactivating blocks sign-in (auth ban) and stamps deactivated_at, but keeps all data.
router.post("/admin/students/:id/deactivate", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;
    const { id } = req.params;
    const deactivate = req.body?.active === false;

    if (id === callerUserId) {
      return res.status(400).json({ error: "You can't deactivate your own account" });
    }

    const { data: target, error: tErr } = await admin
      .from("profiles")
      .select("id, is_admin")
      .eq("id", id)
      .single();
    if (tErr || !target) return res.status(404).json({ error: "Student not found" });
    if (target.is_admin) return res.status(400).json({ error: "Cannot deactivate an admin account" });

    // Block / restore sign-in at the auth layer (ban ~100 years, or lift the ban).
    const { error: banErr } = await admin.auth.admin.updateUserById(id, {
      ban_duration: deactivate ? "876000h" : "none",
    } as { ban_duration: string });
    if (banErr) return res.status(500).json({ error: banErr.message });

    // Stamp the profile so the state is visible in the admin list. Tolerate a DB that
    // hasn't run the deactivated_at migration yet (the auth ban already took effect).
    const { error: updErr } = await admin
      .from("profiles")
      .update({ deactivated_at: deactivate ? new Date().toISOString() : null })
      .eq("id", id);
    if (updErr && !/deactivated_at/i.test(updErr.message)) {
      return res.status(500).json({ error: updErr.message });
    }

    return res.json({ ok: true, active: !deactivate });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// DELETE /admin/students/:id — permanently delete an account and all data tied to it.
// Deleting the auth user cascades to profiles and every row that references profiles(id).
router.delete("/admin/students/:id", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;
    const { id } = req.params;

    if (id === callerUserId) {
      return res.status(400).json({ error: "You can't delete your own account" });
    }

    const { data: target, error: tErr } = await admin
      .from("profiles")
      .select("id, is_admin")
      .eq("id", id)
      .single();
    if (tErr || !target) return res.status(404).json({ error: "Student not found" });
    if (target.is_admin) return res.status(400).json({ error: "Cannot delete an admin account" });

    const { error: delErr } = await admin.auth.admin.deleteUser(id);
    if (delErr) return res.status(500).json({ error: delErr.message });

    return res.json({ ok: true, deleted: id });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// GET /admin/students/:id/stats — activity stats for one student (totals, accuracy, sessions this week, top 3 weak topics)
router.get("/admin/students/:id/stats", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin } = ctx;
    const { id } = req.params;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [totalRes, correctRes, sessionsRes, strugglesRes, questionsRes] = await Promise.all([
      admin.from("answer_log").select("*", { count: "exact", head: true }).eq("user_id", id),
      admin.from("answer_log").select("*", { count: "exact", head: true }).eq("user_id", id).eq("correct", true),
      admin.from("sessions").select("*", { count: "exact", head: true }).eq("user_id", id).gte("created_at", weekAgo),
      admin.from("struggle_profiles").select("question_id, attempts, wrong").eq("user_id", id),
      admin.from("questions").select("id, topic, subject"),
    ]);

    const statsWarnings: string[] = [];
    if (totalRes.error)     statsWarnings.push(`answer_log total unavailable: ${totalRes.error.message}`);
    if (correctRes.error)   statsWarnings.push(`answer_log correct unavailable: ${correctRes.error.message}`);
    if (sessionsRes.error)  statsWarnings.push(`sessions unavailable: ${sessionsRes.error.message}`);
    if (strugglesRes.error) statsWarnings.push(`struggle_profiles unavailable: ${strugglesRes.error.message}`);
    if (questionsRes.error) statsWarnings.push(`questions unavailable: ${questionsRes.error.message}`);

    const totalAnswers = totalRes.count ?? 0;
    const correctAnswers = correctRes.count ?? 0;
    const sessionsWeek = sessionsRes.count ?? 0;

    const qMap: Record<string, { topic: string; subject: string }> = {};
    (questionsRes.data as QuestionRow[] | null || []).forEach((q) => {
      qMap[q.id] = { topic: q.topic, subject: q.subject };
    });

    const topicMap: Record<string, { topic: string; subject: string; attempts: number; wrong: number }> = {};
    (strugglesRes.data as StruggleRow[] | null || []).forEach((r) => {
      const q = qMap[r.question_id];
      if (!q) return;
      if (!topicMap[q.topic]) topicMap[q.topic] = { topic: q.topic, subject: q.subject, attempts: 0, wrong: 0 };
      topicMap[q.topic].attempts += r.attempts || 0;
      topicMap[q.topic].wrong += r.wrong || 0;
    });

    const weakTopics = Object.values(topicMap)
      .filter((t) => t.attempts > 0)
      .map((t) => ({
        topic: t.topic,
        subject: t.subject,
        accuracy: Math.round(((t.attempts - t.wrong) / t.attempts) * 100),
        attempts: t.attempts,
      }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3);

    return res.json({
      totalAnswers,
      correctAnswers,
      accuracy: totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0,
      sessionsWeek,
      weakTopics,
      warnings: statsWarnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// ── TUTORS OVERSIGHT ─────────────────────────────────────────────────────────

type AssignmentRow = {
  id: string;
  tutor_id: string;
  student_id: string;
  type: string;
  subject: string;
  topics: string[] | null;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  class_id: string | null;
  batch_id: string | null;
};

function bucketAssignment(a: { completed_at: string | null; due_date: string | null }): "completed" | "overdue" | "pending" {
  if (a.completed_at) return "completed";
  if (a.due_date) {
    const due = new Date(a.due_date);
    due.setHours(23, 59, 59, 999);
    if (due.getTime() < Date.now()) return "overdue";
  }
  return "pending";
}

// Today's date as YYYY-MM-DD (server local) for SQL-side overdue/pending filtering.
// `due_date` is stored as a `date` column, so a string compare is safe.
function todayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// GET /admin/tutors — list tutors with aggregate stats
router.get("/admin/tutors", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin } = ctx;

    const { data: tutors, error: tutorErr } = await admin
      .from("profiles")
      .select("id, display_name, school, last_active, created_at")
      .eq("is_tutor", true);
    if (tutorErr) return res.status(500).json({ error: tutorErr.message });

    const tutorList = (tutors || []) as {
      id: string; display_name: string | null; school: string | null;
      last_active: string | null; created_at: string;
    }[];
    if (tutorList.length === 0) return res.json({ tutors: [] });

    const tutorIds = tutorList.map(t => t.id);

    // Fetch all roster rows + assignments for these tutors in parallel
    const [rosterRes, asgnRes, authUsers] = await Promise.all([
      admin.from("tutor_students").select("tutor_id, student_id").in("tutor_id", tutorIds),
      admin.from("assignments").select("id, tutor_id, student_id, due_date, completed_at, created_at").in("tutor_id", tutorIds),
      listAllAuthUsers(admin).catch(() => [] as { id: string; email: string; created_at: string }[]),
    ]);

    if (rosterRes.error) return res.status(500).json({ error: rosterRes.error.message });
    if (asgnRes.error)   return res.status(500).json({ error: asgnRes.error.message });

    const emailById = new Map<string, string>();
    for (const u of authUsers) if (u.id && u.email) emailById.set(u.id, u.email);

    const rosterCount: Record<string, number> = {};
    (rosterRes.data as { tutor_id: string }[] | null || []).forEach((r) => {
      rosterCount[r.tutor_id] = (rosterCount[r.tutor_id] || 0) + 1;
    });

    type AsgnAggRow = Pick<AssignmentRow, "id" | "tutor_id" | "student_id" | "due_date" | "completed_at" | "created_at">;
    const stats: Record<string, { total: number; completed: number; pending: number; overdue: number; lastCreated: string | null }> = {};
    for (const id of tutorIds) stats[id] = { total: 0, completed: 0, pending: 0, overdue: 0, lastCreated: null };
    (asgnRes.data as AsgnAggRow[] | null || []).forEach((a) => {
      const s = stats[a.tutor_id];
      if (!s) return;
      s.total++;
      s[bucketAssignment(a)]++;
      if (!s.lastCreated || (a.created_at && a.created_at > s.lastCreated)) s.lastCreated = a.created_at;
    });

    const out = tutorList
      .map(t => ({
        id: t.id,
        display_name: t.display_name,
        email: emailById.get(t.id) || null,
        school: t.school,
        last_active: t.last_active,
        created_at: t.created_at,
        roster_size: rosterCount[t.id] || 0,
        assignments_total:     stats[t.id].total,
        assignments_completed: stats[t.id].completed,
        assignments_pending:   stats[t.id].pending,
        assignments_overdue:   stats[t.id].overdue,
        last_assignment_at:    stats[t.id].lastCreated,
      }))
      .sort((a, b) => (a.display_name || "").localeCompare(b.display_name || ""));

    return res.json({ tutors: out });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// GET /admin/tutors/:id — tutor detail (roster + assignment history)
router.get("/admin/tutors/:id", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin } = ctx;
    const { id } = req.params;

    const { data: tutor, error: tutorErr } = await admin
      .from("profiles")
      .select("id, display_name, school, is_tutor, last_active, created_at")
      .eq("id", id)
      .single();
    if (tutorErr || !tutor) return res.status(404).json({ error: "Tutor not found" });

    type RosterJoinRow = {
      student_id: string;
      invited_at: string | null;
      profiles: { display_name: string | null; xp: number | null; streak: number | null; last_active: string | null } | null;
    };
    type AsgnJoinRow = AssignmentRow & {
      profiles: { display_name: string | null } | null;
    };

    const [rosterRes, asgnRes, authUsers] = await Promise.all([
      admin
        .from("tutor_students")
        .select("student_id, invited_at, profiles!tutor_students_student_id_fkey(display_name, xp, streak, last_active)")
        .eq("tutor_id", id),
      admin
        .from("assignments")
        .select("id, tutor_id, student_id, type, subject, topics, due_date, created_at, completed_at, class_id, batch_id, profiles!assignments_student_id_fkey(display_name)")
        .eq("tutor_id", id)
        .order("created_at", { ascending: false }),
      listAllAuthUsers(admin).catch(() => [] as { id: string; email: string; created_at: string }[]),
    ]);

    if (rosterRes.error) return res.status(500).json({ error: rosterRes.error.message });
    if (asgnRes.error)   return res.status(500).json({ error: asgnRes.error.message });

    const emailById = new Map<string, string>();
    for (const u of authUsers) if (u.id && u.email) emailById.set(u.id, u.email);

    const rosterRows = (rosterRes.data || []) as unknown as RosterJoinRow[];

    // Per-student accuracy: batch one count-only query per rostered student in parallel.
    // Roster sizes are small (typical << 100), so this stays a constant number of cheap counts.
    const accuracyByStudent = new Map<string, { total: number; correct: number }>();
    await Promise.all(rosterRows.map(async (r) => {
      const [tot, cor] = await Promise.all([
        admin.from("answer_log").select("*", { count: "exact", head: true }).eq("user_id", r.student_id),
        admin.from("answer_log").select("*", { count: "exact", head: true }).eq("user_id", r.student_id).eq("correct", true),
      ]);
      accuracyByStudent.set(r.student_id, { total: tot.count ?? 0, correct: cor.count ?? 0 });
    }));

    const roster = rosterRows.map((r) => {
      const acc = accuracyByStudent.get(r.student_id) || { total: 0, correct: 0 };
      return {
        student_id: r.student_id,
        invited_at: r.invited_at,
        display_name: r.profiles?.display_name || null,
        email: emailById.get(r.student_id) || null,
        xp: r.profiles?.xp ?? 0,
        streak: r.profiles?.streak ?? 0,
        last_active: r.profiles?.last_active || null,
        total_answers: acc.total,
        accuracy: acc.total > 0 ? Math.round((acc.correct / acc.total) * 100) : null,
      };
    });

    const assignments = ((asgnRes.data || []) as unknown as AsgnJoinRow[]).map((a) => ({
      id: a.id,
      student_id: a.student_id,
      student_name: a.profiles?.display_name || null,
      type: a.type,
      subject: a.subject,
      topics: a.topics || [],
      due_date: a.due_date,
      created_at: a.created_at,
      completed_at: a.completed_at,
      class_id: a.class_id,
      batch_id: a.batch_id,
      status: bucketAssignment(a),
    }));

    return res.json({
      tutor: {
        id: tutor.id,
        display_name: tutor.display_name,
        email: emailById.get(tutor.id) || null,
        school: tutor.school,
        last_active: tutor.last_active,
        created_at: tutor.created_at,
      },
      roster,
      assignments,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// GET /admin/students/:id/subscriptions — list active subscriptions for a student (bypasses RLS)
router.get("/admin/students/:id/subscriptions", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin } = ctx;
    const { id } = req.params;

    const { data, error } = await admin
      .from("user_subscriptions")
      .select("id, user_id, subject_name, stage, active, beta, created_at")
      .eq("user_id", id)
      .eq("active", true);
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ subscriptions: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// POST /admin/students/:id/subscriptions — grant a subject subscription to a student.
// Body: { subject_name: string, stage?: string }
router.post("/admin/students/:id/subscriptions", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin } = ctx;
    const { id } = req.params;
    const { subject_name, stage } = req.body || {};

    if (!subject_name) return res.status(400).json({ error: "subject_name is required" });

    const { error } = await admin
      .from("user_subscriptions")
      .upsert(
        { user_id: id, subject_name, stage: stage || "", active: true, beta: true },
        { onConflict: "user_id,subject_name,stage" },
      );
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// DELETE /admin/students/:id/subscriptions/:subId — revoke a subject subscription.
router.delete("/admin/students/:id/subscriptions/:subId", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin } = ctx;
    const { subId } = req.params;

    const { error } = await admin
      .from("user_subscriptions")
      .delete()
      .eq("id", subId);
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// GET /admin/students/:id/assignments — full assignment history for one student
router.get("/admin/students/:id/assignments", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin } = ctx;
    const { id } = req.params;

    const { data: asgns, error: asgnErr } = await admin
      .from("assignments")
      .select("id, tutor_id, student_id, type, subject, topics, due_date, created_at, completed_at, class_id, batch_id")
      .eq("student_id", id)
      .order("created_at", { ascending: false });
    if (asgnErr) return res.status(500).json({ error: asgnErr.message });

    const list = (asgns || []) as AssignmentRow[];
    const tutorIds = [...new Set(list.map(a => a.tutor_id))];
    const tutorNames: Record<string, string> = {};
    if (tutorIds.length > 0) {
      const { data: tutors } = await admin
        .from("profiles")
        .select("id, display_name")
        .in("id", tutorIds);
      (tutors as TutorNameRow[] | null || []).forEach((t) => { tutorNames[t.id] = t.display_name || "Unknown"; });
    }

    const out = list.map(a => ({
      id: a.id,
      tutor_id: a.tutor_id,
      tutor_name: tutorNames[a.tutor_id] || "Unknown",
      type: a.type,
      subject: a.subject,
      topics: a.topics || [],
      due_date: a.due_date,
      created_at: a.created_at,
      completed_at: a.completed_at,
      class_id: a.class_id,
      batch_id: a.batch_id,
      status: bucketAssignment(a),
    }));

    return res.json({ assignments: out });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// GET /admin/students/:id/writing-attempts — writing practice history (admin only)
router.get("/admin/students/:id/writing-attempts", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin } = ctx;
    const { id } = req.params;

    const { data, error } = await admin
      .from("writing_attempts")
      .select(
        "id, user_id, subject, essay_type, mode, prompt, image_url, timed, duration_seconds, actual_seconds, created_at, feedback, content",
      )
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ attempts: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// GET /admin/assignments — list every assignment, with filters & pagination
router.get("/admin/assignments", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin } = ctx;

    const tutorId   = (req.query.tutor_id   as string) || "";
    const studentId = (req.query.student_id as string) || "";
    const status    = (req.query.status     as string) || ""; // pending|overdue|completed|""
    const subject   = (req.query.subject    as string) || "";
    const sort      = (req.query.sort       as string) || "created"; // created|due
    const limit     = Math.min(500, parseInt((req.query.limit as string) || "200", 10));
    const offset    = Math.max(0, parseInt((req.query.offset as string) || "0", 10));

    let q = admin
      .from("assignments")
      .select("id, tutor_id, student_id, type, subject, topics, due_date, created_at, completed_at, class_id, batch_id", { count: "exact" });

    if (tutorId)   q = q.eq("tutor_id", tutorId);
    if (studentId) q = q.eq("student_id", studentId);
    if (subject)   q = q.eq("subject", subject);

    // DB-side status filtering so pagination + total count are correct.
    // bucketAssignment treats due_date as end-of-day local; for date-typed
    // columns this is equivalent to "due_date < today's date".
    const today = todayDateString();
    if (status === "completed") {
      q = q.not("completed_at", "is", null);
    } else if (status === "overdue") {
      q = q.is("completed_at", null).not("due_date", "is", null).lt("due_date", today);
    } else if (status === "pending") {
      q = q.is("completed_at", null).or(`due_date.is.null,due_date.gte.${today}`);
    }

    q = sort === "due"
      ? q.order("due_date", { ascending: true, nullsFirst: false })
      : q.order("created_at", { ascending: false });

    q = q.range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) return res.status(500).json({ error: error.message });

    const list = (data || []) as AssignmentRow[];

    // Resolve tutor + student display names in batch
    const tutorIds   = [...new Set(list.map(a => a.tutor_id))];
    const studentIds = [...new Set(list.map(a => a.student_id))];
    const allIds = [...new Set([...tutorIds, ...studentIds])];

    const nameById: Record<string, string> = {};
    if (allIds.length > 0) {
      const BATCH = 200;
      for (let i = 0; i < allIds.length; i += BATCH) {
        const chunk = allIds.slice(i, i + BATCH);
        const { data: profs } = await admin
          .from("profiles")
          .select("id, display_name")
          .in("id", chunk);
        (profs as TutorNameRow[] | null || []).forEach((p) => { nameById[p.id] = p.display_name || "Unknown"; });
      }
    }

    const out = list.map(a => ({
      id: a.id,
      tutor_id: a.tutor_id,
      tutor_name: nameById[a.tutor_id] || "Unknown",
      student_id: a.student_id,
      student_name: nameById[a.student_id] || "Unknown",
      type: a.type,
      subject: a.subject,
      topics: a.topics || [],
      due_date: a.due_date,
      created_at: a.created_at,
      completed_at: a.completed_at,
      class_id: a.class_id,
      batch_id: a.batch_id,
      status: bucketAssignment(a),
    }));

    return res.json({ assignments: out, total: count ?? out.length, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// GET /admin/assignments/subjects — distinct list of all subjects across every assignment
router.get("/admin/assignment-subjects", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin } = ctx;

    // Pull just the subject column; PostgREST caps responses, so paginate to be safe.
    const subjects = new Set<string>();
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await admin
        .from("assignments")
        .select("subject")
        .range(from, from + PAGE - 1);
      if (error) return res.status(500).json({ error: error.message });
      const rows = (data || []) as { subject: string | null }[];
      for (const r of rows) if (r.subject) subjects.add(r.subject);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return res.json({ subjects: [...subjects].sort() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// GET /admin/cohort-stats — server-side aggregation of answer_log joined with questions
// Returns per-topic attempt/wrong counts without sending raw rows to the client.
router.get("/admin/cohort-stats", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin } = ctx;

    const PAGE = 5000;
    // Build a question map from the questions table (small, fits in memory)
    const qMap: Record<string, { topic: string; subject: string }> = {};
    let qFrom = 0;
    while (true) {
      const { data, error } = await admin
        .from("questions")
        .select("id, topic, subject")
        .range(qFrom, qFrom + PAGE - 1);
      if (error) return res.status(500).json({ error: error.message });
      for (const q of (data || []) as { id: string; topic: string; subject: string }[]) {
        qMap[q.id] = { topic: q.topic, subject: q.subject };
      }
      if ((data || []).length < PAGE) break;
      qFrom += PAGE;
    }

    // Stream through answer_log in pages and aggregate server-side
    type TopicStat = { subject: string; topic: string; attempts: number; wrong: number };
    const topicMap: Record<string, TopicStat> = {};
    let aFrom = 0;
    while (true) {
      const { data, error } = await admin
        .from("answer_log")
        .select("question_id, correct")
        .range(aFrom, aFrom + PAGE - 1);
      if (error) return res.status(500).json({ error: error.message });
      for (const entry of (data || []) as { question_id: string; correct: boolean }[]) {
        const q = qMap[entry.question_id];
        if (!q) continue;
        const key = `${q.subject}|||${q.topic}`;
        if (!topicMap[key]) topicMap[key] = { subject: q.subject, topic: q.topic, attempts: 0, wrong: 0 };
        topicMap[key].attempts++;
        if (!entry.correct) topicMap[key].wrong++;
      }
      if ((data || []).length < PAGE) break;
      aFrom += PAGE;
    }

    const rows = Object.values(topicMap).map(r => ({
      subject: r.subject,
      topic: r.topic,
      attempts: r.attempts,
      wrong: r.wrong,
      errorRate: r.attempts > 0 ? r.wrong / r.attempts : 0,
    }));

    return res.json({ rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

export default router;
