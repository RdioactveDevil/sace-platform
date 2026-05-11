import { Router, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AccessToken } from "livekit-server-sdk";
import { Resend } from "resend";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

interface AuthUser {
  id: string;
  email?: string;
}

interface AdminAuthClient {
  getUserById(id: string): Promise<{ data: { user: AuthUser | null }; error: { message: string } | null }>;
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

function getLiveKitConfig() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL || "wss://your-livekit-server.livekit.cloud";
  return { apiKey, apiSecret, wsUrl };
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

interface CallerContext {
  admin: SupabaseClient & { auth: SupabaseAdminAuth };
  userId: string;
  isTutor: boolean;
  displayName: string;
  email: string;
}

async function requireAuth(req: Request, res: Response): Promise<CallerContext | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const jwt = authHeader.slice(7);
  const admin = getAdminClient();

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id, is_tutor, display_name")
    .eq("id", userData.user.id)
    .single<{ id: string; is_tutor: boolean; display_name: string | null }>();

  if (profErr || !profile) {
    res.status(403).json({ error: "Profile not found" });
    return null;
  }

  return {
    admin,
    userId: userData.user.id,
    isTutor: profile.is_tutor,
    displayName: profile.display_name ?? "User",
    email: userData.user.email ?? "",
  };
}

// POST /sessions — tutor creates a session
router.post("/sessions", async (req: Request, res: Response) => {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (!ctx.isTutor) {
    res.status(403).json({ error: "Only tutors can create sessions" });
    return;
  }

  const { student_id, scheduled_at, duration_minutes = 60, title, notes, class_id } = req.body as {
    student_id: string;
    scheduled_at: string;
    duration_minutes?: number;
    title?: string;
    notes?: string;
    class_id?: string;
  };

  if (!student_id || !scheduled_at) {
    res.status(400).json({ error: "student_id and scheduled_at are required" });
    return;
  }

  // Verify student is on tutor's roster
  const { data: roster } = await ctx.admin
    .from("tutor_students")
    .select("student_id")
    .eq("tutor_id", ctx.userId)
    .eq("student_id", student_id)
    .single();

  if (!roster) {
    res.status(403).json({ error: "Student is not on your roster" });
    return;
  }

  const roomName = `session-${ctx.userId.slice(0, 8)}-${student_id.slice(0, 8)}-${Date.now()}`;

  const { data: session, error } = await ctx.admin
    .from("tutoring_sessions")
    .insert({
      tutor_id: ctx.userId,
      student_id,
      class_id: class_id ?? null,
      scheduled_at,
      duration_minutes,
      livekit_room_name: roomName,
      title: title ?? null,
      notes: notes ?? null,
      status: "scheduled",
    })
    .select()
    .single();

  if (error || !session) {
    res.status(500).json({ error: error?.message ?? "Failed to create session" });
    return;
  }

  // Email student
  const resend = getResend();
  if (resend) {
    const { data: studentProfile } = await ctx.admin
      .from("profiles")
      .select("display_name")
      .eq("id", student_id)
      .single<{ display_name: string | null }>();

    const { data: authUser } = await ctx.admin.auth.admin.getUserById(student_id);
    const studentEmail = authUser?.user?.email;
    const studentName = studentProfile?.display_name ?? "Student";
    const sessionDate = new Date(scheduled_at).toLocaleString("en-AU", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Australia/Adelaide",
    });
    const sessionLink = `${process.env.APP_URL ?? "https://gradefarm.com.au"}/session/${roomName}`;
    const safeTitle = escapeHtml(title ?? "Tutoring Session");
    const safeTutor = escapeHtml(ctx.displayName);
    const safeStudent = escapeHtml(studentName);
    const safeDate = escapeHtml(sessionDate);

    if (studentEmail) {
      await resend.emails.send({
        from: "GradeFarm <sessions@gradefarm.com.au>",
        to: [studentEmail],
        subject: `Session booked: ${safeTitle} on ${safeDate}`,
        html: `
          <div style="font-family:'Plus Jakarta Sans',sans-serif;max-width:560px;margin:auto;color:#1a1a2e">
            <div style="background:#0d0d1a;padding:24px 32px;border-radius:12px 12px 0 0">
              <span style="font-size:22px;font-weight:700;color:#f1be43;letter-spacing:-0.5px">gradefarm.</span>
            </div>
            <div style="background:#f9f9fb;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e5ea">
              <h2 style="margin:0 0 8px;font-size:20px">Hi ${safeStudent},</h2>
              <p style="margin:0 0 20px;color:#555">${safeTutor} has scheduled a tutoring session with you.</p>
              <div style="background:#fff;border:1px solid #e5e5ea;border-radius:8px;padding:20px;margin-bottom:24px">
                <p style="margin:0 0 6px"><strong>📅 When:</strong> ${safeDate} (ACST)</p>
                <p style="margin:0 0 6px"><strong>⏱ Duration:</strong> ${duration_minutes} minutes</p>
                ${title ? `<p style="margin:0"><strong>📝 Topic:</strong> ${safeTitle}</p>` : ""}
              </div>
              <a href="${sessionLink}" style="display:inline-block;background:#f1be43;color:#1a1a2e;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:15px">
                Join Session
              </a>
              <p style="margin:20px 0 0;font-size:13px;color:#888">This link will open the video call and whiteboard. You can join from any browser — no downloads required.</p>
            </div>
          </div>
        `,
      });
    }
  }

  res.status(201).json({ session });
});

// GET /sessions — list sessions for the authenticated user
router.get("/sessions", async (req: Request, res: Response) => {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const { status, limit = "20", offset = "0" } = req.query as Record<string, string>;

  let query = ctx.admin
    .from("tutoring_sessions")
    .select("*")
    .order("scheduled_at", { ascending: true })
    .limit(parseInt(limit))
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  if (ctx.isTutor) {
    query = query.eq("tutor_id", ctx.userId);
  } else {
    query = query.eq("student_id", ctx.userId);
  }

  if (status) query = query.eq("status", status);

  const { data: sessions, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Fetch display names for the other party
  const otherIds = ctx.isTutor
    ? (sessions ?? []).map((s: { student_id: string }) => s.student_id)
    : (sessions ?? []).map((s: { tutor_id: string }) => s.tutor_id);

  const uniqueIds = [...new Set(otherIds)];
  let nameMap: Record<string, string> = {};

  if (uniqueIds.length > 0) {
    const { data: profiles } = await ctx.admin
      .from("profiles")
      .select("id, display_name")
      .in("id", uniqueIds);
    nameMap = Object.fromEntries(
      (profiles ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name ?? "Unknown"])
    );
  }

  const enriched = (sessions ?? []).map((s: Record<string, unknown>) => ({
    ...s,
    other_party_name: ctx.isTutor
      ? nameMap[s.student_id as string]
      : nameMap[s.tutor_id as string],
  }));

  res.json({ sessions: enriched });
});

// GET /sessions/:id — get a single session
router.get("/sessions/:id", async (req: Request, res: Response) => {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const { id } = req.params;
  const { data: session, error } = await ctx.admin
    .from("tutoring_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // Only allow access to own sessions
  if (session.tutor_id !== ctx.userId && session.student_id !== ctx.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json({ session });
});

// POST /sessions/:id/token — generate a LiveKit access token
router.post("/sessions/:id/token", async (req: Request, res: Response) => {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const { id } = req.params;
  const { data: session, error } = await ctx.admin
    .from("tutoring_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (session.tutor_id !== ctx.userId && session.student_id !== ctx.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (session.status === "cancelled") {
    res.status(400).json({ error: "Session is cancelled" });
    return;
  }

  const { apiKey, apiSecret, wsUrl } = getLiveKitConfig();
  if (!apiKey || !apiSecret) {
    res.status(503).json({ error: "Video calling is not configured yet. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET." });
    return;
  }

  const isTutor = session.tutor_id === ctx.userId;
  const at = new AccessToken(apiKey, apiSecret, {
    identity: ctx.userId,
    name: ctx.displayName,
    ttl: "4h",
  });

  at.addGrant({
    roomJoin: true,
    room: session.livekit_room_name,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    // Tutors can also manage the room
    roomAdmin: isTutor,
    roomCreate: isTutor,
  });

  // Mark session as active when someone joins
  if (session.status === "scheduled") {
    await ctx.admin
      .from("tutoring_sessions")
      .update({ status: "active" })
      .eq("id", id);
  }

  const token = await at.toJwt();
  res.json({ token, wsUrl, roomName: session.livekit_room_name });
});

// PATCH /sessions/:id — update a session (reschedule, cancel, add notes)
router.patch("/sessions/:id", async (req: Request, res: Response) => {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const { id } = req.params;
  const { data: session, error: fetchErr } = await ctx.admin
    .from("tutoring_sessions")
    .select("tutor_id, status")
    .eq("id", id)
    .single();

  if (fetchErr || !session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (session.tutor_id !== ctx.userId) {
    res.status(403).json({ error: "Only the tutor can modify a session" });
    return;
  }

  const allowedFields = ["scheduled_at", "duration_minutes", "title", "notes", "status"];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const { data: updated, error } = await ctx.admin
    .from("tutoring_sessions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ session: updated });
});

// DELETE /sessions/:id — cancel (soft-delete via status)
router.delete("/sessions/:id", async (req: Request, res: Response) => {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const { id } = req.params;
  const { data: session, error: fetchErr } = await ctx.admin
    .from("tutoring_sessions")
    .select("tutor_id")
    .eq("id", id)
    .single();

  if (fetchErr || !session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (session.tutor_id !== ctx.userId) {
    res.status(403).json({ error: "Only the tutor can cancel a session" });
    return;
  }

  const { error } = await ctx.admin
    .from("tutoring_sessions")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

export default router;
