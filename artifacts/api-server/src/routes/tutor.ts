import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

function getAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) throw new Error("No SUPABASE_SERVICE_KEY configured");
  return createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
}

async function requireTutor(req: any, res: any) {
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
    .select("id, is_tutor")
    .eq("id", callerUser.user.id)
    .single();

  if (profErr || !callerProfile?.is_tutor) {
    res.status(403).json({ error: "Forbidden: caller is not a tutor" });
    return null;
  }
  return { admin, callerUserId: callerUser.user.id };
}

router.post("/tutor/find-student", async (req, res) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, callerUserId } = ctx;

    const { email } = req.body as { email: string };
    if (!email) return res.status(400).json({ error: "email is required" });

    const normalizedEmail = email.toLowerCase().trim();
    const { data: listData, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) return res.status(500).json({ error: listError.message });

    const found = listData.users.find(u => u.email?.toLowerCase() === normalizedEmail);
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
      .single();

    if (studentProfError || !studentProfile) {
      return res.status(404).json({ error: "User has not completed setup." });
    }

    return res.json({ id: studentProfile.id, display_name: studentProfile.display_name, email: found.email });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

router.post("/tutor/student-emails", async (req, res) => {
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
    const allowed = new Set((rosterRows || []).map(r => r.student_id));

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

export default router;
