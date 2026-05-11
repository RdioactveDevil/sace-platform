import { Router, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AccessToken } from "livekit-server-sdk";
import { Resend } from "resend";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

interface AuthUser { id: string; email?: string }
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
  return {
    apiKey: process.env.LIVEKIT_API_KEY,
    apiSecret: process.env.LIVEKIT_API_SECRET,
    wsUrl: process.env.LIVEKIT_URL || "wss://your-livekit-server.livekit.cloud",
  };
}

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

interface CallerContext {
  admin: SupabaseClient & { auth: SupabaseAdminAuth };
  userId: string;
  isTutor: boolean;
  displayName: string;
}

async function requireAuth(req: Request, res: Response): Promise<CallerContext | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const jwt = authHeader.slice(7);
  const admin = getAdminClient();
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) { res.status(401).json({ error: "Invalid or expired token" }); return null; }
  const { data: profile, error: profErr } = await admin
    .from("profiles").select("id, is_tutor, display_name")
    .eq("id", userData.user.id).single<{ id: string; is_tutor: boolean; display_name: string | null }>();
  if (profErr || !profile) { res.status(403).json({ error: "Profile not found" }); return null; }
  return { admin, userId: userData.user.id, isTutor: profile.is_tutor, displayName: profile.display_name ?? "User" };
}

/** Generate the next N occurrence dates for a series starting from a base date. */
function generateOccurrences(opts: {
  startDate: Date;
  dayOfWeek: number;
  timeOfDay: string;
  recurrenceType: "weekly" | "fortnightly" | "monthly";
  count: number;
  endsAt?: Date | null;
}): Date[] {
  const { startDate, dayOfWeek, timeOfDay, recurrenceType, count, endsAt } = opts;
  const [hh, mm] = timeOfDay.split(":").map(Number);
  const dates: Date[] = [];

  // Find the first occurrence on or after startDate that falls on dayOfWeek
  const cursor = new Date(startDate);
  cursor.setHours(hh, mm, 0, 0);
  while (cursor.getDay() !== dayOfWeek) {
    cursor.setDate(cursor.getDate() + 1);
  }
  // If that day already passed today, skip to next interval
  if (cursor < new Date()) {
    advanceCursor(cursor, recurrenceType);
  }

  while (dates.length < count) {
    if (endsAt && cursor > endsAt) break;
    dates.push(new Date(cursor));
    advanceCursor(cursor, recurrenceType);
  }

  return dates;
}

function advanceCursor(cursor: Date, recurrenceType: string) {
  if (recurrenceType === "weekly") {
    cursor.setDate(cursor.getDate() + 7);
  } else if (recurrenceType === "fortnightly") {
    cursor.setDate(cursor.getDate() + 14);
  } else {
    // monthly: same weekday next month
    cursor.setMonth(cursor.getMonth() + 1);
  }
}

// POST /series — create a recurring series and generate first 12 occurrences
router.post("/series", async (req: Request, res: Response) => {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;
  if (!ctx.isTutor) { res.status(403).json({ error: "Only tutors can create series" }); return; }

  const {
    session_type = "individual",
    student_id,
    student_ids,
    class_id,
    recurrence_type,
    day_of_week,
    time_of_day,
    timezone = "Australia/Adelaide",
    duration_minutes = 60,
    title,
    notes,
    starts_at,
    ends_at,
  } = req.body as {
    session_type?: "individual" | "group";
    student_id?: string;
    student_ids?: string[];
    class_id?: string;
    recurrence_type: "weekly" | "fortnightly" | "monthly";
    day_of_week: number;
    time_of_day: string;
    timezone?: string;
    duration_minutes?: number;
    title?: string;
    notes?: string;
    starts_at: string;
    ends_at?: string;
  };

  if (!recurrence_type || day_of_week === undefined || !time_of_day || !starts_at) {
    res.status(400).json({ error: "recurrence_type, day_of_week, time_of_day, and starts_at are required" });
    return;
  }

  const isGroup = session_type === "group";

  // Resolve participant IDs
  let participantIds: string[] = [];
  if (isGroup) {
    if (class_id) {
      const { data: members } = await ctx.admin.from("tutor_class_members")
        .select("student_id").eq("class_id", class_id);
      if (members) participantIds.push(...members.map((m: { student_id: string }) => m.student_id));
    }
    if (student_ids?.length) participantIds.push(...student_ids);
    participantIds = [...new Set(participantIds)];
    if (participantIds.length === 0) {
      res.status(400).json({ error: "Group series requires at least one student" });
      return;
    }
  } else {
    if (!student_id) { res.status(400).json({ error: "student_id required for individual series" }); return; }
    participantIds = [student_id];
  }

  // Verify all on roster
  const { data: roster } = await ctx.admin.from("tutor_students")
    .select("student_id").eq("tutor_id", ctx.userId).in("student_id", participantIds);
  const rosteredIds = new Set((roster ?? []).map((r: { student_id: string }) => r.student_id));
  const notRostered = participantIds.filter(id => !rosteredIds.has(id));
  if (notRostered.length > 0) {
    res.status(403).json({ error: "Some students are not on your roster", not_rostered: notRostered });
    return;
  }

  const roomName = `series-${ctx.userId.slice(0, 8)}-${Date.now()}`;

  // Create the series record
  const { data: series, error: seriesErr } = await ctx.admin.from("session_series").insert({
    tutor_id: ctx.userId,
    session_type,
    student_id: isGroup ? null : (student_id ?? null),
    class_id: class_id ?? null,
    recurrence_type,
    day_of_week,
    time_of_day,
    timezone,
    duration_minutes,
    livekit_room_name: roomName,
    title: title ?? null,
    notes: notes ?? null,
    starts_at,
    ends_at: ends_at ?? null,
    status: "active",
  }).select().single();

  if (seriesErr || !series) {
    res.status(500).json({ error: seriesErr?.message ?? "Failed to create series" });
    return;
  }

  // Insert series participants
  if (participantIds.length > 0) {
    await ctx.admin.from("series_participants").insert(
      participantIds.map(sid => ({ series_id: series.id, student_id: sid }))
    );
  }

  // Generate first 12 occurrences (≈ 3 months for weekly)
  const occurrences = generateOccurrences({
    startDate: new Date(starts_at),
    dayOfWeek: day_of_week,
    timeOfDay: time_of_day,
    recurrenceType: recurrence_type,
    count: 12,
    endsAt: ends_at ? new Date(ends_at) : null,
  });

  if (occurrences.length > 0) {
    const sessionRows = occurrences.map(date => ({
      tutor_id: ctx.userId,
      student_id: isGroup ? null : (student_id ?? null),
      class_id: class_id ?? null,
      session_type,
      scheduled_at: date.toISOString(),
      duration_minutes,
      livekit_room_name: roomName, // same room for every occurrence
      title: title ?? null,
      notes: notes ?? null,
      status: "scheduled",
      series_id: series.id,
    }));

    const { data: insertedSessions } = await ctx.admin
      .from("tutoring_sessions").insert(sessionRows).select("id");

    // Insert participants for each generated session
    if (insertedSessions?.length) {
      const participantRows = insertedSessions.flatMap((s: { id: string }) =>
        participantIds.map(pid => ({ session_id: s.id, student_id: pid }))
      );
      await ctx.admin.from("session_participants").insert(participantRows);
    }
  }

  // Email all participants with the permanent link
  const resend = getResend();
  if (resend && participantIds.length > 0) {
    const { data: profiles } = await ctx.admin.from("profiles")
      .select("id, display_name").in("id", participantIds);
    const nameMap = Object.fromEntries(
      (profiles ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name ?? "Student"])
    );

    const permanentLink = `${process.env.APP_URL ?? "https://gradefarm.com.au"}/room/${roomName}`;
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const recurrenceLabel = { weekly: "Every", fortnightly: "Every second", monthly: "Monthly on" }[recurrence_type];
    const scheduleDesc = `${recurrenceLabel} ${dayNames[day_of_week]} at ${time_of_day}`;
    const safeTitle = escapeHtml(title ?? (isGroup ? "Group Tutoring Series" : "Tutoring Series"));
    const safeTutor = escapeHtml(ctx.displayName);
    const safeSchedule = escapeHtml(scheduleDesc);

    await Promise.allSettled(participantIds.map(async (sid) => {
      const { data: authUser } = await ctx.admin.auth.admin.getUserById(sid);
      const email = authUser?.user?.email;
      if (!email) return;
      const safeStudent = escapeHtml(nameMap[sid] ?? "Student");
      await resend.emails.send({
        from: "GradeFarm <sessions@gradefarm.com.au>",
        to: [email],
        subject: `Recurring ${isGroup ? "group " : ""}sessions booked: ${safeTitle}`,
        html: `
          <div style="font-family:'Plus Jakarta Sans',sans-serif;max-width:560px;margin:auto;color:#1a1a2e">
            <div style="background:#0d0d1a;padding:24px 32px;border-radius:12px 12px 0 0">
              <span style="font-size:22px;font-weight:700;color:#f1be43;letter-spacing:-0.5px">gradefarm.</span>
            </div>
            <div style="background:#f9f9fb;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e5ea">
              <h2 style="margin:0 0 8px;font-size:20px">Hi ${safeStudent},</h2>
              <p style="margin:0 0 20px;color:#555">${safeTutor} has set up a recurring ${isGroup ? "group " : ""}tutoring series with you.</p>
              <div style="background:#fff;border:1px solid #e5e5ea;border-radius:8px;padding:20px;margin-bottom:24px">
                <p style="margin:0 0 6px"><strong>📅 Schedule:</strong> ${safeSchedule}</p>
                <p style="margin:0 0 6px"><strong>⏱ Duration:</strong> ${duration_minutes} minutes</p>
                ${title ? `<p style="margin:0"><strong>📝 Topic:</strong> ${safeTitle}</p>` : ""}
              </div>
              <p style="margin:0 0 16px;font-weight:600;color:#1a1a2e">Your permanent session link — bookmark this:</p>
              <a href="${permanentLink}" style="display:inline-block;background:#f1be43;color:#1a1a2e;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:15px">
                Join Every Session →
              </a>
              <p style="margin:20px 0 0;font-size:13px;color:#888">This link works for every session in the series. No new links each week.</p>
            </div>
          </div>
        `,
      });
    }));
  }

  res.status(201).json({ series, occurrence_count: occurrences.length });
});

// GET /series — list all series for the authenticated tutor
router.get("/series", async (req: Request, res: Response) => {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;
  if (!ctx.isTutor) { res.status(403).json({ error: "Tutors only" }); return; }

  const { data: seriesList, error } = await ctx.admin
    .from("session_series").select("*")
    .eq("tutor_id", ctx.userId).order("created_at", { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Enrich with participant names
  const seriesIds = (seriesList ?? []).map((s: { id: string }) => s.id);
  let participantMap: Record<string, string[]> = {};

  if (seriesIds.length > 0) {
    const { data: participants } = await ctx.admin
      .from("series_participants")
      .select("series_id, student_id, profiles(display_name)")
      .in("series_id", seriesIds);

    for (const p of (participants ?? []) as Array<{ series_id: string; student_id: string; profiles: { display_name: string | null } | null }>) {
      if (!participantMap[p.series_id]) participantMap[p.series_id] = [];
      participantMap[p.series_id].push(p.profiles?.display_name ?? "Student");
    }
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const enriched = (seriesList ?? []).map((s: Record<string, unknown>) => ({
    ...s,
    participant_names: participantMap[s.id as string] ?? [],
    participant_count: (participantMap[s.id as string] ?? []).length,
    permanent_link: `${process.env.APP_URL ?? "https://gradefarm.com.au"}/room/${s.livekit_room_name}`,
    schedule_label: `${s.recurrence_type === "weekly" ? "Every" : s.recurrence_type === "fortnightly" ? "Every 2nd" : "Monthly"} ${dayNames[s.day_of_week as number]} at ${s.time_of_day}`,
  }));

  res.json({ series: enriched });
});

// PATCH /series/:id — update title, notes, ends_at, or cancel
router.patch("/series/:id", async (req: Request, res: Response) => {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const { id } = req.params;
  const { data: series, error: fetchErr } = await ctx.admin
    .from("session_series").select("tutor_id").eq("id", id).single();
  if (fetchErr || !series) { res.status(404).json({ error: "Series not found" }); return; }
  if (series.tutor_id !== ctx.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const allowed = ["title", "notes", "ends_at", "status"];
  const updates: Record<string, unknown> = {};
  for (const field of allowed) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (updates.status === "cancelled") {
    // Also cancel all future scheduled sessions in this series
    await ctx.admin.from("tutoring_sessions")
      .update({ status: "cancelled" })
      .eq("series_id", id)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString());
  }

  const { data: updated, error } = await ctx.admin
    .from("session_series").update(updates).eq("id", id).select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json({ series: updated });
});

// POST /series/:id/extend — generate more occurrences (next 12 weeks)
router.post("/series/:id/extend", async (req: Request, res: Response) => {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const { id } = req.params;
  const { data: series, error: fetchErr } = await ctx.admin
    .from("session_series").select("*").eq("id", id).single();
  if (fetchErr || !series) { res.status(404).json({ error: "Series not found" }); return; }
  if (series.tutor_id !== ctx.userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (series.status === "cancelled") { res.status(400).json({ error: "Series is cancelled" }); return; }

  // Find the last scheduled occurrence
  const { data: lastSession } = await ctx.admin
    .from("tutoring_sessions").select("scheduled_at")
    .eq("series_id", id).order("scheduled_at", { ascending: false }).limit(1).single();

  const startFrom = lastSession
    ? new Date(new Date(lastSession.scheduled_at).getTime() + 1000)
    : new Date();

  const occurrences = generateOccurrences({
    startDate: startFrom,
    dayOfWeek: series.day_of_week,
    timeOfDay: series.time_of_day,
    recurrenceType: series.recurrence_type,
    count: 12,
    endsAt: series.ends_at ? new Date(series.ends_at) : null,
  });

  if (occurrences.length === 0) {
    res.json({ added: 0, message: "No future occurrences to generate (series may have ended)" });
    return;
  }

  // Get series participants
  const { data: seriesParticipants } = await ctx.admin
    .from("series_participants").select("student_id").eq("series_id", id);
  const participantIds = (seriesParticipants ?? []).map((p: { student_id: string }) => p.student_id);

  const sessionRows = occurrences.map(date => ({
    tutor_id: ctx.userId,
    student_id: series.student_id ?? null,
    class_id: series.class_id ?? null,
    session_type: series.session_type,
    scheduled_at: date.toISOString(),
    duration_minutes: series.duration_minutes,
    livekit_room_name: series.livekit_room_name,
    title: series.title ?? null,
    notes: series.notes ?? null,
    status: "scheduled",
    series_id: id,
  }));

  const { data: inserted } = await ctx.admin
    .from("tutoring_sessions").insert(sessionRows).select("id");

  if (inserted?.length && participantIds.length > 0) {
    const participantRows = inserted.flatMap((s: { id: string }) =>
      participantIds.map(pid => ({ session_id: s.id, student_id: pid }))
    );
    await ctx.admin.from("session_participants").insert(participantRows);
  }

  res.json({ added: occurrences.length });
});

// POST /rooms/:roomName/token — generate a LiveKit token by room name (permanent link)
router.post("/rooms/:roomName/token", async (req: Request, res: Response) => {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const { roomName } = req.params;

  // Look up series by room name
  const { data: series, error: seriesErr } = await ctx.admin
    .from("session_series").select("*").eq("livekit_room_name", roomName).single();

  // Also check one-off sessions (non-series sessions also have a room name)
  let sessionRow: Record<string, unknown> | null = null;
  if (seriesErr || !series) {
    const { data: session } = await ctx.admin
      .from("tutoring_sessions").select("*").eq("livekit_room_name", roomName).single();
    sessionRow = session;
  }

  if (!series && !sessionRow) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  // Access check
  const tutorId = series ? series.tutor_id : sessionRow!.tutor_id as string;
  const isTutor = tutorId === ctx.userId;

  if (!isTutor) {
    // Check student access: participants table or direct student_id
    if (series) {
      const { data: participation } = await ctx.admin
        .from("series_participants")
        .select("student_id").eq("series_id", series.id).eq("student_id", ctx.userId).maybeSingle();
      const directStudent = series.student_id === ctx.userId;
      if (!participation && !directStudent) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    } else {
      const { data: participation } = await ctx.admin
        .from("session_participants")
        .select("student_id").eq("session_id", sessionRow!.id as string).eq("student_id", ctx.userId).maybeSingle();
      const directStudent = sessionRow!.student_id === ctx.userId;
      if (!participation && !directStudent) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
  }

  const { apiKey, apiSecret, wsUrl } = getLiveKitConfig();
  if (!apiKey || !apiSecret) {
    res.status(503).json({ error: "Video calling is not configured. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET." });
    return;
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: ctx.userId,
    name: ctx.displayName,
    ttl: "4h",
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: isTutor,
    roomCreate: isTutor,
  });

  // For series: mark the matching upcoming session as active
  if (series) {
    const { data: upcoming } = await ctx.admin
      .from("tutoring_sessions")
      .select("id, status")
      .eq("series_id", series.id)
      .in("status", ["scheduled", "active"])
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (upcoming?.status === "scheduled") {
      await ctx.admin.from("tutoring_sessions")
        .update({ status: "active" }).eq("id", upcoming.id);
    }
  }

  const token = await at.toJwt();
  res.json({
    token,
    wsUrl,
    roomName,
    title: series?.title ?? sessionRow?.title ?? null,
    is_series: !!series,
  });
});

// GET /rooms/:roomName — get info about a room (for the join page)
router.get("/rooms/:roomName", async (req: Request, res: Response) => {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const { roomName } = req.params;

  const { data: series } = await ctx.admin
    .from("session_series").select("id, title, session_type, tutor_id, recurrence_type, day_of_week, time_of_day, duration_minutes, status")
    .eq("livekit_room_name", roomName).maybeSingle();

  if (series) {
    const { data: tutorProfile } = await ctx.admin
      .from("profiles").select("display_name").eq("id", series.tutor_id).single<{ display_name: string | null }>();
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const recurrenceLabel = { weekly: "Every", fortnightly: "Every second", monthly: "Monthly on" }[series.recurrence_type as string] ?? "";
    res.json({
      room: {
        title: series.title ?? "Tutoring Session",
        tutor_name: tutorProfile?.display_name ?? "Your tutor",
        session_type: series.session_type,
        schedule: `${recurrenceLabel} ${dayNames[series.day_of_week]} at ${series.time_of_day}`,
        duration_minutes: series.duration_minutes,
        is_series: true,
        status: series.status,
      }
    });
    return;
  }

  // Fall back to one-off session
  const { data: session } = await ctx.admin
    .from("tutoring_sessions").select("id, title, session_type, tutor_id, scheduled_at, duration_minutes, status")
    .eq("livekit_room_name", roomName).maybeSingle();

  if (!session) { res.status(404).json({ error: "Room not found" }); return; }

  const { data: tutorProfile } = await ctx.admin
    .from("profiles").select("display_name").eq("id", session.tutor_id).single<{ display_name: string | null }>();

  res.json({
    room: {
      title: session.title ?? "Tutoring Session",
      tutor_name: tutorProfile?.display_name ?? "Your tutor",
      session_type: session.session_type,
      scheduled_at: session.scheduled_at,
      duration_minutes: session.duration_minutes,
      is_series: false,
      status: session.status,
    }
  });
});

export default router;
