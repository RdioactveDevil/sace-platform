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

export default router;
