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

/** Check if a user has access to a session (tutor, direct student, or participant). */
async function userCanAccessSession(
  admin: SupabaseClient & { auth: SupabaseAdminAuth },
  sessionRow: { tutor_id: string; student_id: string | null },
  userId: string
): Promise<boolean> {
  if (sessionRow.tutor_id === userId) return true;
  if (sessionRow.student_id === userId) return true;
  // Check participants table (covers group sessions)
  const { data } = await admin
    .from("session_participants")
    .select("student_id")
    .eq("session_id", (sessionRow as Record<string, unknown>)["id"] as string)
    .eq("student_id", userId)
    .maybeSingle();
  return !!data;
}

/** Send a session invite email to a single student. */
async function sendSessionInvite(
  resend: Resend,
  opts: {
    studentId: string;
    studentName: string;
    studentEmail: string;
    tutorName: string;
    sessionId: string;
    title: string | null;
    scheduledAt: string;
    durationMinutes: number;
    isGroup: boolean;
    participantCount?: number;
  }
) {
  const sessionLink = `${process.env.APP_URL ?? "https://gradefarm.com.au"}/session/${opts.sessionId}`;
  const sessionDate = new Date(opts.scheduledAt).toLocaleString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Australia/Adelaide",
  });

  const safeTitle = escapeHtml(opts.title ?? (opts.isGroup ? "Group Tutoring Session" : "Tutoring Session"));
  const safeTutor = escapeHtml(opts.tutorName);
  const safeStudent = escapeHtml(opts.studentName);
  const safeDate = escapeHtml(sessionDate);
  const groupLine = opts.isGroup && opts.participantCount
    ? `<p style="margin:0 0 6px"><strong>👥 Participants:</strong> ${opts.participantCount} students</p>`
    : "";

  await resend.emails.send({
    from: "GradeFarm <sessions@gradefarm.com.au>",
    to: [opts.studentEmail],
    subject: `${opts.isGroup ? "Group session" : "Session"} booked: ${safeTitle} on ${safeDate}`,
    html: `
      <div style="font-family:'Plus Jakarta Sans',sans-serif;max-width:560px;margin:auto;color:#1a1a2e">
        <div style="background:#0d0d1a;padding:24px 32px;border-radius:12px 12px 0 0">
          <span style="font-size:22px;font-weight:700;color:#f1be43;letter-spacing:-0.5px">gradefarm.</span>
        </div>
        <div style="background:#f9f9fb;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e5ea">
          <h2 style="margin:0 0 8px;font-size:20px">Hi ${safeStudent},</h2>
          <p style="margin:0 0 20px;color:#555">
            ${safeTutor} has booked a ${opts.isGroup ? "group " : ""}tutoring session${opts.isGroup ? " that you're invited to" : " with you"}.
          </p>
          <div style="background:#fff;border:1px solid #e5e5ea;border-radius:8px;padding:20px;margin-bottom:24px">
            <p style="margin:0 0 6px"><strong>📅 When:</strong> ${safeDate} (ACST)</p>
            <p style="margin:0 0 6px"><strong>⏱ Duration:</strong> ${opts.durationMinutes} minutes</p>
            ${groupLine}
            ${opts.title ? `<p style="margin:0"><strong>📝 Topic:</strong> ${safeTitle}</p>` : ""}
          </div>
          <a href="${sessionLink}" style="display:inline-block;background:#f1be43;color:#1a1a2e;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:15px">
            Join Session
          </a>
          <p style="margin:20px 0 0;font-size:13px;color:#888">Opens in your browser — no downloads needed.</p>
        </div>
      </div>
    `,
  });
}

// POST /sessions — tutor creates an individual or group session
router.post("/sessions", async (req: Request, res: Response) => {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (!ctx.isTutor) {
    res.status(403).json({ error: "Only tutors can create sessions" });
    return;
  }

  const {
    session_type = "individual",
    student_id,
    student_ids,
    class_id,
    scheduled_at,
    duration_minutes = 60,
    title,
    notes,
  } = req.body as {
    session_type?: "individual" | "group";
    student_id?: string;
    student_ids?: string[];
    class_id?: string;
    scheduled_at: string;
    duration_minutes?: number;
    title?: string;
    notes?: string;
  };

  if (!scheduled_at) {
    res.status(400).json({ error: "scheduled_at is required" });
    return;
  }

  const isGroup = session_type === "group";

  // Resolve participant IDs
  let participantIds: string[] = [];

  if (isGroup) {
    // Group: accept explicit student_ids list, class_id, or both — all optional
    if (class_id) {
      const { data: members } = await ctx.admin
        .from("tutor_class_members")
        .select("student_id")
        .eq("class_id", class_id);
      if (members) participantIds.push(...members.map((m: { student_id: string }) => m.student_id));
    }
    if (student_ids?.length) {
      participantIds.push(...student_ids);
    }
    participantIds = [...new Set(participantIds)];

    // Verify any specified students are on roster
    if (participantIds.length > 0) {
      const { data: roster } = await ctx.admin
        .from("tutor_students")
        .select("student_id")
        .eq("tutor_id", ctx.userId)
        .in("student_id", participantIds);

      const rosteredIds = new Set((roster ?? []).map((r: { student_id: string }) => r.student_id));
      const notRostered = participantIds.filter(id => !rosteredIds.has(id));
      if (notRostered.length > 0) {
        res.status(403).json({ error: "Some students are not on your roster", not_rostered: notRostered });
        return;
      }
    }
  } else {
    // Individual: student optional — omitting creates an open meeting link
    if (student_id) {
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
      participantIds = [student_id];
    }
  }

  const roomName = `session-${ctx.userId.slice(0, 8)}-${Date.now()}`;

  // Create the session row
  const { data: session, error } = await ctx.admin
    .from("tutoring_sessions")
    .insert({
      tutor_id: ctx.userId,
      student_id: isGroup ? null : (student_id ?? null),
      class_id: class_id ?? null,
      session_type,
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

  // Insert all participants
  await ctx.admin.from("session_participants").insert(
    participantIds.map(sid => ({ session_id: session.id, student_id: sid }))
  );

  // Fetch participant profiles + emails and send invites
  const resend = getResend();
  if (resend) {
    const { data: profiles } = await ctx.admin
      .from("profiles")
      .select("id, display_name")
      .in("id", participantIds);

    const nameMap = Object.fromEntries(
      (profiles ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name ?? "Student"])
    );

    await Promise.allSettled(
      participantIds.map(async (sid) => {
        const { data: authUser } = await ctx.admin.auth.admin.getUserById(sid);
        const email = authUser?.user?.email;
        if (!email) return;
        await sendSessionInvite(resend, {
          studentId: sid,
          studentName: nameMap[sid] ?? "Student",
          studentEmail: email,
          tutorName: ctx.displayName,
          sessionId: session.id,
          title: title ?? null,
          scheduledAt: scheduled_at,
          durationMinutes: duration_minutes,
          isGroup,
          participantCount: participantIds.length,
        });
      })
    );
  }

  const appUrl = process.env.APP_URL ?? "https://gradefarm.com.au";
  res.status(201).json({
    session: {
      ...session,
      participant_count: participantIds.length,
      join_link: `${appUrl}/session/${session.id}`,
    },
  });
});

// GET /sessions — list sessions for the authenticated user
router.get("/sessions", async (req: Request, res: Response) => {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const { status, limit = "50", offset = "0" } = req.query as Record<string, string>;

  // For students, we need to find sessions they're participating in (handles group sessions)
  let sessionIds: string[] | null = null;
  if (!ctx.isTutor) {
    const { data: participations } = await ctx.admin
      .from("session_participants")
      .select("session_id")
      .eq("student_id", ctx.userId);
    sessionIds = (participations ?? []).map((p: { session_id: string }) => p.session_id);
    if (sessionIds.length === 0) {
      res.json({ sessions: [] });
      return;
    }
  }

  let query = ctx.admin
    .from("tutoring_sessions")
    .select("*")
    .order("scheduled_at", { ascending: true })
    .limit(parseInt(limit));

  if (ctx.isTutor) {
    query = query.eq("tutor_id", ctx.userId);
  } else {
    query = query.in("id", sessionIds!);
  }

  if (status) query = query.eq("status", status);

  const { data: sessions, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const sessionList = sessions ?? [];

  // Fetch participant counts and names for all sessions
  const sessionIdList = sessionList.map((s: { id: string }) => s.id);
  let participantMap: Record<string, Array<{ student_id: string; display_name: string }>> = {};

  if (sessionIdList.length > 0) {
    const { data: participants } = await ctx.admin
      .from("session_participants")
      .select("session_id, student_id, profiles(display_name)")
      .in("session_id", sessionIdList);

    for (const p of (participants ?? []) as unknown as Array<{ session_id: string; student_id: string; profiles: Array<{ display_name: string | null }> | null }>) {
      if (!participantMap[p.session_id]) participantMap[p.session_id] = [];
      participantMap[p.session_id].push({
        student_id: p.student_id,
        display_name: p.profiles?.[0]?.display_name ?? "Student",
      });
    }
  }

  // Fetch tutor names for student view
  let tutorMap: Record<string, string> = {};
  if (!ctx.isTutor) {
    const tutorIds = [...new Set(sessionList.map((s: { tutor_id: string }) => s.tutor_id))];
    if (tutorIds.length > 0) {
      const { data: tutorProfiles } = await ctx.admin
        .from("profiles")
        .select("id, display_name")
        .in("id", tutorIds);
      tutorMap = Object.fromEntries(
        (tutorProfiles ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name ?? "Tutor"])
      );
    }
  }

  const enriched = sessionList.map((s: Record<string, unknown>) => {
    const parts = participantMap[s.id as string] ?? [];
    return {
      ...s,
      participants: parts,
      participant_count: parts.length,
      // Convenience field: for individual sessions, the one student's name; for group, comma list
      other_party_name: ctx.isTutor
        ? (s.session_type === "group"
          ? parts.map(p => p.display_name).join(", ") || "Group"
          : (parts[0]?.display_name ?? "Student"))
        : tutorMap[s.tutor_id as string] ?? "Tutor",
    };
  });

  res.json({ sessions: enriched });
});

// GET /sessions/:id — get a single session with participants
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

  const canAccess = await userCanAccessSession(ctx.admin, { ...session, id }, ctx.userId);
  if (!canAccess) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { data: participants } = await ctx.admin
    .from("session_participants")
    .select("session_id, student_id, profiles(display_name)")
    .eq("session_id", id);

  res.json({
    session: {
      ...session,
      participants: (participants as unknown as Array<{ student_id: string; profiles: Array<{ display_name: string | null }> | null }> ?? []).map((p) => ({
        student_id: p.student_id,
        display_name: p.profiles?.[0]?.display_name ?? "Student",
      })),
      participant_count: (participants ?? []).length,
    },
  });
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

  // Open sessions (no pre-assigned participants) are joinable by any authenticated user
  const { count: participantCount } = await ctx.admin
    .from("session_participants")
    .select("*", { count: "exact", head: true })
    .eq("session_id", id);

  const isOpen = (participantCount ?? 0) === 0 && session.tutor_id !== ctx.userId;
  if (!isOpen) {
    const canAccess = await userCanAccessSession(ctx.admin, { ...session, id }, ctx.userId);
    if (!canAccess) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
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
    roomAdmin: isTutor,
    roomCreate: isTutor,
  });

  if (session.status === "scheduled") {
    await ctx.admin
      .from("tutoring_sessions")
      .update({ status: "active" })
      .eq("id", id);
  }

  const token = await at.toJwt();
  res.json({ token, wsUrl, roomName: session.livekit_room_name });
});

// PATCH /sessions/:id — update a session (reschedule, notes, status)
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

// DELETE /sessions/:id — cancel session
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
