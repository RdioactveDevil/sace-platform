import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

function getAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) throw new Error("No SUPABASE_SERVICE_KEY configured");
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

// List users (paginated). Joins auth.users emails with profile flags.
router.get("/admin/users", async (req, res) => {
  try {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    const { admin } = ctx;

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const perPage = Math.min(200, Math.max(1, parseInt(String(req.query.perPage || "100"), 10) || 100));

    const { data: listData, error: listError } = await admin.auth.admin.listUsers({ page, perPage });
    if (listError) return res.status(500).json({ error: listError.message });

    const ids = listData.users.map(u => u.id).filter(Boolean);
    if (ids.length === 0) return res.json({ users: [], page, perPage });

    const { data: profiles, error: profErr } = await admin
      .from("profiles")
      .select("id, display_name, school, is_admin, is_tutor, tutor_application_status, tutor_application_at, created_at")
      .in("id", ids);

    if (profErr) return res.status(500).json({ error: profErr.message });

    type ProfRow = {
      id: string; display_name: string | null; school: string | null;
      is_admin: boolean; is_tutor: boolean;
      tutor_application_status: string; tutor_application_at: string | null;
      created_at: string;
    };
    const profById = new Map<string, ProfRow>(
      ((profiles || []) as ProfRow[]).map(p => [p.id, p])
    );
    const users = listData.users.map(u => {
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

    return res.json({ users, page, perPage });
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

    const { data: listData, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) return res.status(500).json({ error: listError.message });

    const emailById = new Map<string, string>();
    for (const u of listData.users) {
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

    const [profilesRes, subsRes, tutorRes] = await Promise.all([
      admin
        .from("profiles")
        .select("id, display_name, school, xp, streak, best_streak, last_active, onboarding_completed, is_admin, is_tutor, tutor_application_status, created_at")
        .in("id", allIds),
      admin
        .from("user_subscriptions")
        .select("user_id, subject_name, stage")
        .eq("active", true)
        .in("user_id", allIds),
      admin
        .from("tutor_students")
        .select("student_id, tutor_id"),
    ]);

    if (profilesRes.error) return res.status(500).json({ error: profilesRes.error.message });
    if (subsRes.error)     warnings.push(`subscriptions unavailable: ${subsRes.error.message}`);
    if (tutorRes.error)    warnings.push(`tutor assignments unavailable: ${tutorRes.error.message}`);

    const profiles = (profilesRes.data || []) as StudentProfileRow[];

    // Resolve tutor display names
    const tutorRows = (tutorRes.data || []) as TutorStudentRow[];
    const uniqueTutorIds = [...new Set(tutorRows.map((r) => r.tutor_id))];
    const tutorNames: Record<string, string> = {};
    if (uniqueTutorIds.length > 0) {
      const { data: tutorProfiles, error: tnError } = await admin
        .from("profiles")
        .select("id, display_name")
        .in("id", uniqueTutorIds);
      if (tnError) {
        warnings.push(`tutor names unavailable: ${tnError.message}`);
      } else {
        (tutorProfiles as TutorNameRow[]).forEach((p) => {
          tutorNames[p.id] = p.display_name || "Unknown";
        });
      }
    }

    // Group subscriptions by user_id
    const subsByUser: Record<string, { subject_name: string; stage: string }[]> = {};
    (subsRes.data as SubRow[] | null || []).forEach((s) => {
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

export default router;
