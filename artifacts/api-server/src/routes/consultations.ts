/**
 * Consultation calls with prospective students (a tutoring_sessions row with
 * session_type 'consultation'; see the 2026-11-21 consultation booking spec).
 *
 * Tutor (signed in, owner):
 *   GET/PUT /tutor/booking-settings          hours, call length, reminders, calendar
 *   GET  /tutor/consultations/slots          open times (for the booking picker)
 *   POST /tutor/consultations                book for a prospect
 *   PATCH /tutor/consultations/:id           move it and/or change its reminders
 *   POST /tutor/consultations/:id/cancel
 * Prospect (no account):
 *   GET  /consultation/:token/slots          by the finished diagnostic's token
 *   POST /consultation/:token/book
 *   GET/POST /consultation/join/:guestToken  the call link: details, then a room token
 *
 * The tutor's calendar address and a call's guest token never go back to a
 * client; the guest token travels only inside the join link (emailed, and
 * shown to the person who just booked).
 */
import { Router, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AccessToken } from "livekit-server-sdk";
import {
  bookingError, bookingParentEmail, checkReminders, consultationRoomName, checkSettingsInput, guestIdentity, guestJoinAllowed, guestTimeZone, hasHours, newGuestToken,
  parseStart, publicSettings, removedReminders, settingsFromRow, startIsOffered, GUEST_JOIN_EARLY_MS, GUEST_JOIN_LATE_MS,
  type SettingsRow,
} from "../lib/consultation-access";
import {
  CALL_COLUMNS, guestJoinUrl, liveBooking, loadSettings, notifyAfterWrite, openTimes, questionnaireUrl, readCalendar,
  tutorContact, type CallRow,
} from "../lib/consultation-service";
import { logger } from "../lib/logger";
import { normaliseProspectEmail } from "../lib/prospect-status";
import { prospectSenderName } from "../lib/prospect-emails";
import { requireTutorPlan } from "../lib/tutor-plan";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

type AdminClient = SupabaseClient & {
  auth: {
    getUser(jwt: string): Promise<{ data: { user: { id: string; email?: string } | null }; error: { message: string } | null }>;
    admin: { getUserById(id: string): Promise<{ data: { user: { email?: string } | null } }> };
  };
};

function getAdminClient(): AdminClient {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("No SUPABASE_SERVICE_KEY configured");
  return createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } }) as AdminClient;
}

function getLiveKitConfig() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL || "wss://your-livekit-server.livekit.cloud";
  return { apiKey, apiSecret, wsUrl };
}

type TutorCtx = { admin: AdminClient; tutorId: string; email: string | null };

async function requireTutor(req: Request, res: Response): Promise<TutorCtx | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const admin = getAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(authHeader.slice(7));
  if (userError || !userData?.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }
  const { data: profile, error: profError } = await admin
    .from("profiles")
    .select("is_tutor, is_admin, deactivated_at")
    .eq("id", userData.user.id)
    .single<{ is_tutor: boolean; is_admin: boolean | null; deactivated_at: string | null }>();
  if (profError || !profile?.is_tutor || profile.deactivated_at) {
    res.status(403).json({ error: "Forbidden: caller is not a tutor" });
    return null;
  }
  if (!(await requireTutorPlan(admin, res, userData.user.id, !!profile.is_admin))) return null;
  return { admin, tutorId: userData.user.id, email: userData.user.email ?? null };
}

const fail = (res: Response, err: unknown) => {
  logger.error({ err }, "consultations: request failed");
  return res.status(500).json({ error: "Something went wrong. Please try again." });
};

const MAX_NAME = 100;

/** Book via book_consultation (atomic, gap-aware). Returns the new session's id or why not. */
async function book(
  admin: AdminClient,
  o: {
    tutorId: string; start: number; settings: SettingsRow; diagnosticId: string; email: string; name: string | null;
    parentEmail: string | null; timeZone: string; reminders: number[];
  },
): Promise<{ id: string; token: string } | { taken: "slot_taken" | "duplicate" }> {
  const s = settingsFromRow(o.settings);
  const token = newGuestToken();
  const { data, error } = await admin.rpc("book_consultation", {
    p_tutor_id: o.tutorId,
    p_start: new Date(o.start).toISOString(),
    p_minutes: s.callMinutes,
    // Never null: a null gap would switch the overlap check off.
    p_gap: s.gapMinutes,
    p_room: consultationRoomName(o.tutorId),
    p_title: `Consultation call: ${o.name || o.email}`,
    p_diagnostic_id: o.diagnosticId,
    p_guest_email: o.email,
    p_guest_name: o.name,
    p_guest_parent_email: o.parentEmail,
    p_guest_time_zone: o.timeZone,
    p_guest_token: token,
    p_reminders: o.reminders,
  });
  const taken = bookingError(error);
  if (taken) return { taken };
  if (error || typeof data !== "string") throw new Error(error?.message ?? "book_consultation returned no id");
  return { id: data, token };
}

async function loadCall(admin: AdminClient, id: string): Promise<CallRow | null> {
  const { data, error } = await admin.from("tutoring_sessions").select(CALL_COLUMNS).eq("id", id).maybeSingle<CallRow>();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Email everyone about a call that has just been written. Never throws:
 * reloading the call, finding the tutor's details or sending can fail without
 * undoing the booking or failing the request (notifyAfterWrite logs it).
 */
function notify(
  admin: AdminClient,
  kind: "booked" | "changed" | "cancelled",
  sessionId: string,
  tutor: { tutorId: string; settings?: SettingsRow; signInEmail?: string | null },
  o: { call?: CallRow; previousStart?: string } = {},
): Promise<boolean> {
  return notifyAfterWrite({
    kind,
    sessionId,
    previousStart: o.previousStart,
    loadCall: async () => o.call ?? (await loadCall(admin, sessionId)),
    loadTutor: async () =>
      tutorContact(admin, tutor.tutorId, tutor.settings ?? (await loadSettings(admin, tutor.tutorId)), tutor.signInEmail),
    loadQuestionnaire: (diagnosticId) => questionnaireUrl(admin, diagnosticId),
  });
}

// ── Tutor: settings ─────────────────────────────────────────────────────────

router.get("/tutor/booking-settings", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const row = await loadSettings(ctx.admin, ctx.tutorId);
    return res.json({ settings: publicSettings(row, ctx.email ?? "") });
  } catch (err) {
    return fail(res, err);
  }
});

router.put("/tutor/booking-settings", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const current = await loadSettings(ctx.admin, ctx.tutorId);
    const checked = checkSettingsInput(req.body, current);
    if ("error" in checked) return res.status(400).json({ error: checked.error });
    const next: SettingsRow = { ...current, ...checked.update, tutor_id: ctx.tutorId };
    const { error } = await ctx.admin
      .from("tutor_booking_settings")
      .upsert({ ...checked.update, tutor_id: ctx.tutorId, updated_at: new Date().toISOString() }, { onConflict: "tutor_id" });
    if (error) throw new Error(error.message);
    // Read the calendar once now, so the tutor sees straight away whether it works.
    const { row } = await readCalendar(ctx.admin, next, Date.now());
    return res.json({ settings: publicSettings(row, ctx.email ?? "") });
  } catch (err) {
    return fail(res, err);
  }
});

// ── Tutor: booking ──────────────────────────────────────────────────────────

type ProspectDiagnostic = {
  id: string; tutor_id: string; student_id: string | null; status: string; cancelled_at: string | null;
  prospect_email: string | null; parent_email: string | null; submitted_by_name: string | null; student_name: string | null;
};
const DIAGNOSTIC_COLUMNS = "id, tutor_id, student_id, status, cancelled_at, prospect_email, parent_email, submitted_by_name, student_name";

/** A prospect's (link) diagnostic this tutor sent; null if not theirs. */
async function ownProspectDiagnostic(admin: AdminClient, tutorId: string, id: unknown): Promise<ProspectDiagnostic | null> {
  if (typeof id !== "string" || !id) return null;
  const { data, error } = await admin.from("diagnostic_assessments").select(DIAGNOSTIC_COLUMNS).eq("id", id).maybeSingle<ProspectDiagnostic>();
  if (error) return null; // e.g. not a uuid
  return data && data.tutor_id === tutorId && !data.student_id ? data : null;
}

const prospectName = (d: ProspectDiagnostic) => (d.submitted_by_name || d.student_name || "").trim().slice(0, MAX_NAME) || null;

router.get("/tutor/consultations/slots", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const d = await ownProspectDiagnostic(ctx.admin, ctx.tutorId, req.query.diagnosticId);
    if (!d) return res.status(404).json({ error: "Diagnostic not found" });
    const row = await loadSettings(ctx.admin, ctx.tutorId);
    const s = settingsFromRow(row);
    const slots = await openTimes(ctx.admin, row);
    return res.json({ slots, timeZone: s.timeZone, callMinutes: s.callMinutes, noHours: !hasHours(s.weeklyHours) });
  } catch (err) {
    return fail(res, err);
  }
});

/** The tutor may book any future time that doesn't overlap a session (their calendar's busy times are shown, not enforced). */
router.post("/tutor/consultations", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const d = await ownProspectDiagnostic(ctx.admin, ctx.tutorId, body.diagnosticId);
    if (!d) return res.status(404).json({ error: "Diagnostic not found" });

    const start = parseStart(body.start);
    if (start === null) return res.status(400).json({ error: "Choose a date and time." });
    if (start <= Date.now()) return res.status(400).json({ error: "Choose a time in the future." });
    const email = normaliseProspectEmail(body.email === undefined ? d.prospect_email : body.email);
    if ("error" in email) return res.status(400).json({ error: email.error });
    if (!email.email) return res.status(400).json({ error: "Enter the prospect's email address." });
    const parent = bookingParentEmail(body.parentEmail, d.parent_email);
    if ("error" in parent) return res.status(400).json({ error: "Enter a valid email address for the parent." });

    const settings = await loadSettings(ctx.admin, ctx.tutorId);
    const s = settingsFromRow(settings);
    let reminders = s.reminderMinutes;
    if (body.reminderMinutes !== undefined) {
      const r = checkReminders(body.reminderMinutes);
      if ("error" in r) return res.status(400).json({ error: r.error });
      reminders = r.reminders;
    }

    const existing = await liveBooking(ctx.admin, ctx.tutorId, d.id, { trusted: [email.email] });
    if (existing) {
      return res.status(409).json({
        error: "This prospect already has a call booked.",
        booking: { sessionId: existing.call.id, start: existing.call.scheduled_at },
      });
    }

    const booked = await book(ctx.admin, {
      tutorId: ctx.tutorId, start, settings, diagnosticId: d.id, email: email.email, name: prospectName(d),
      parentEmail: parent.email, timeZone: s.timeZone, reminders,
    });
    if ("taken" in booked) {
      return res.status(409).json({
        error: booked.taken === "slot_taken" ? "That time overlaps another session." : "This prospect already has a call booked.",
      });
    }
    await notify(ctx.admin, "booked", booked.id, { tutorId: ctx.tutorId, settings, signInEmail: ctx.email });
    return res.json({ sessionId: booked.id });
  } catch (err) {
    return fail(res, err);
  }
});

/** The tutor's own consultation that can still be changed, or the response already sent. */
async function changeableCall(ctx: TutorCtx, id: string, res: Response): Promise<CallRow | null> {
  const call = /^[0-9a-f-]{36}$/i.test(id) ? await loadCall(ctx.admin, id) : null;
  if (!call || call.tutor_id !== ctx.tutorId || call.session_type !== "consultation") {
    res.status(404).json({ error: "Consultation not found" });
    return null;
  }
  if (call.status !== "scheduled") {
    res.status(409).json({ error: "Only a call that hasn't started can be changed." });
    return null;
  }
  return call;
}

router.patch("/tutor/consultations/:id", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const call = await changeableCall(ctx, String(req.params.id), res);
    if (!call) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (body.start === undefined && body.reminderMinutes === undefined) {
      return res.status(400).json({ error: "Nothing to change." });
    }

    let reminders = call.reminder_minutes ?? [];
    if (body.reminderMinutes !== undefined) {
      const r = checkReminders(body.reminderMinutes);
      if ("error" in r) return res.status(400).json({ error: r.error });
      reminders = r.reminders;
    }

    const start = body.start === undefined ? null : parseStart(body.start);
    if (body.start !== undefined && start === null) return res.status(400).json({ error: "Choose a date and time." });

    if (start !== null && start !== Date.parse(call.scheduled_at)) {
      if (start <= Date.now()) return res.status(400).json({ error: "Choose a time in the future." });
      const settings = await loadSettings(ctx.admin, ctx.tutorId);
      const s = settingsFromRow(settings);
      const { error } = await ctx.admin.rpc("reschedule_consultation", {
        p_session: call.id,
        p_start: new Date(start).toISOString(),
        p_minutes: s.callMinutes,
        p_gap: s.gapMinutes,
        p_reminders: reminders,
      });
      if (bookingError(error) === "slot_taken") return res.status(409).json({ error: "That time overlaps another session." });
      if (error) throw new Error(error.message);
      await notify(ctx.admin, "changed", call.id, { tutorId: ctx.tutorId, settings, signInEmail: ctx.email }, { previousStart: call.scheduled_at });
      return res.json({ ok: true });
    }

    // Reminders only: no new invite. Offsets taken off stop counting as sent.
    const { data: updated, error } = await ctx.admin
      .from("tutoring_sessions").update({ reminder_minutes: reminders })
      .eq("id", call.id).eq("status", "scheduled").select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) return res.status(409).json({ error: "Only a call that hasn't started can be changed." });
    const removed = removedReminders(call.reminder_minutes, reminders);
    if (removed.length) {
      const { error: delErr } = await ctx.admin
        .from("consultation_reminders_sent").delete().eq("session_id", call.id).in("minutes", removed);
      if (delErr) logger.warn({ err: delErr, sessionId: call.id }, "consultations: couldn't clear removed reminders");
    }
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/tutor/consultations/:id/cancel", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const call = await changeableCall(ctx, String(req.params.id), res);
    if (!call) return;
    const { data: cancelled, error } = await ctx.admin
      .from("tutoring_sessions")
      .update({ status: "cancelled", ics_sequence: call.ics_sequence + 1 })
      .eq("id", call.id).eq("status", "scheduled").eq("ics_sequence", call.ics_sequence)
      .select(CALL_COLUMNS);
    if (error) throw new Error(error.message);
    const row = (cancelled as CallRow[] | null)?.[0];
    if (!row) return res.status(409).json({ error: "Only a call that hasn't started can be cancelled." });
    await notify(ctx.admin, "cancelled", row.id, { tutorId: ctx.tutorId, signInEmail: ctx.email }, { call: row });
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

// ── Prospect: book from the finished diagnostic ─────────────────────────────

/** A finished, uncancelled link diagnostic by its token; null otherwise. */
async function bookableDiagnostic(admin: AdminClient, token: string) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return null;
  const { data, error } = await admin
    .from("diagnostic_assessments")
    .select(`${DIAGNOSTIC_COLUMNS}, pre_call_form_url`)
    .eq("token", token)
    .maybeSingle<ProspectDiagnostic & { pre_call_form_url: string | null }>();
  if (error) throw new Error(error.message);
  if (!data || data.student_id || data.status !== "completed" || data.cancelled_at) return null;
  return data;
}

router.get("/consultation/:token/slots", async (req: Request, res: Response) => {
  try {
    const admin = getAdminClient();
    const d = await bookableDiagnostic(admin, String(req.params.token));
    if (!d) return res.status(404).json({ error: "Not found" });

    const [row, profile] = await Promise.all([
      loadSettings(admin, d.tutor_id),
      admin.from("profiles").select("display_name").eq("id", d.tutor_id).maybeSingle<{ display_name: string | null }>(),
    ]);
    const s = settingsFromRow(row);
    const base = {
      timeZone: s.timeZone,
      callMinutes: s.callMinutes,
      senderName: prospectSenderName(profile.data?.display_name),
      email: d.prospect_email,
      parentEmail: d.parent_email,
      questionnaireUrl: d.pre_call_form_url?.trim() || null,
    };
    const existing = await liveBooking(admin, d.tutor_id, d.id, { trusted: d.prospect_email ? [d.prospect_email] : [] });
    if (existing?.call.guest_token) {
      return res.json({
        ...base, slots: [],
        booking: { start: existing.call.scheduled_at, joinUrl: guestJoinUrl(existing.call.guest_token) },
      });
    }
    if (!hasHours(s.weeklyHours)) return res.json({ ...base, slots: [], noHours: true, booking: null });
    return res.json({ ...base, slots: await openTimes(admin, row), booking: null });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/consultation/:token/book", async (req: Request, res: Response) => {
  try {
    const admin = getAdminClient();
    const d = await bookableDiagnostic(admin, String(req.params.token));
    if (!d) return res.status(404).json({ error: "Not found" });
    const body = (req.body ?? {}) as Record<string, unknown>;

    const start = parseStart(body.start);
    if (start === null) return res.status(400).json({ error: "Choose a time." });
    const email = normaliseProspectEmail(body.email);
    if ("error" in email) return res.status(400).json({ error: email.error });
    if (!email.email) return res.status(400).json({ error: "Enter your email address." });
    const parent = bookingParentEmail(body.parentEmail, d.parent_email);
    if ("error" in parent) return res.status(400).json({ error: "Enter a valid email address for your parent, or leave it blank." });
    const name = (typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME) : "") || prospectName(d);

    // One live call per prospect: this diagnostic's, or one for the email the tutor sent it to,
    // is shown in full; one found only by the email typed here is just mentioned.
    const existing = await liveBooking(admin, d.tutor_id, d.id, {
      trusted: d.prospect_email ? [d.prospect_email] : [],
      typed: email.email,
    });
    if (existing) {
      return res.status(409).json({
        error: existing.trusted
          ? "You already have a call booked."
          : "That email address already has a call booked. Check its inbox for the details.",
        ...(existing.trusted && existing.call.guest_token
          ? { booking: { start: existing.call.scheduled_at, joinUrl: guestJoinUrl(existing.call.guest_token) } }
          : {}),
      });
    }

    const settings = await loadSettings(admin, d.tutor_id);
    const s = settingsFromRow(settings);
    const slots = await openTimes(admin, settings);
    if (!startIsOffered(start, slots)) {
      return res.status(409).json({ error: "That time is no longer available. Please pick another.", slots });
    }

    const booked = await book(admin, {
      tutorId: d.tutor_id, start, settings, diagnosticId: d.id, email: email.email, name, parentEmail: parent.email,
      timeZone: guestTimeZone(body.timeZone, s.timeZone), reminders: s.reminderMinutes,
    });
    if ("taken" in booked) {
      if (booked.taken === "duplicate") {
        return res.status(409).json({ error: "That email address already has a call booked. Check its inbox for the details." });
      }
      return res.status(409).json({ error: "That time was just taken. Please pick another.", slots: await openTimes(admin, settings) });
    }

    // The reply is built from what was sent and the token generated here, not from a reload.
    await notify(admin, "booked", booked.id, { tutorId: d.tutor_id, settings });
    return res.json({
      start: new Date(start).toISOString(),
      joinUrl: guestJoinUrl(booked.token),
      questionnaireUrl: d.pre_call_form_url?.trim() || null,
    });
  } catch (err) {
    return fail(res, err);
  }
});

// ── Guest: the call link ────────────────────────────────────────────────────

async function callByGuestToken(admin: AdminClient, token: string): Promise<CallRow | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { data, error } = await admin
    .from("tutoring_sessions").select(`${CALL_COLUMNS}, livekit_room_name`)
    .eq("guest_token", token).eq("session_type", "consultation")
    .maybeSingle<CallRow & { livekit_room_name: string }>();
  if (error) throw new Error(error.message);
  return data;
}

router.get("/consultation/join/:guestToken", async (req: Request, res: Response) => {
  try {
    const admin = getAdminClient();
    const call = await callByGuestToken(admin, String(req.params.guestToken));
    if (!call) return res.status(404).json({ error: "This call link isn't valid." });
    const { data: profile } = await admin.from("profiles").select("display_name").eq("id", call.tutor_id).maybeSingle<{ display_name: string | null }>();
    const tutorName = prospectSenderName(profile?.display_name);
    const start = Date.parse(call.scheduled_at);
    return res.json({
      title: `Consultation call with ${tutorName}`,
      start: call.scheduled_at,
      minutes: call.duration_minutes,
      tutorName,
      canJoinFrom: new Date(start - GUEST_JOIN_EARLY_MS).toISOString(),
      canJoinUntil: new Date(start + GUEST_JOIN_LATE_MS).toISOString(),
      status: call.status,
      timeZone: call.guest_time_zone,
    });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/consultation/join/:guestToken", async (req: Request, res: Response) => {
  try {
    const admin = getAdminClient();
    const call = (await callByGuestToken(admin, String(req.params.guestToken))) as (CallRow & { livekit_room_name: string }) | null;
    if (!call) return res.status(404).json({ error: "This call link isn't valid." });
    if (call.status === "cancelled") return res.status(410).json({ error: "This call was cancelled." });
    if (call.status === "completed") return res.status(410).json({ error: "This call has ended." });
    const now = Date.now();
    if (!guestJoinAllowed(call, now)) {
      const opensAt = Date.parse(call.scheduled_at) - GUEST_JOIN_EARLY_MS;
      return now < opensAt
        ? res.status(403).json({ error: "The call opens 10 minutes before it starts.", canJoinFrom: new Date(opensAt).toISOString() })
        : res.status(410).json({ error: "This call link has closed." });
    }

    const { apiKey, apiSecret, wsUrl } = getLiveKitConfig();
    if (!apiKey || !apiSecret) return res.status(503).json({ error: "Video calling isn't set up yet." });
    const at = new AccessToken(apiKey, apiSecret, {
      identity: guestIdentity(call.id),
      name: call.guest_name?.trim() || "Guest",
      ttl: "3h",
    });
    // This call's room only; no admin rights.
    at.addGrant({
      roomJoin: true,
      room: call.livekit_room_name,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: false,
      roomCreate: false,
    });
    return res.json({ token: await at.toJwt(), wsUrl });
  } catch (err) {
    return fail(res, err);
  }
});

export default router;
