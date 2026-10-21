/**
 * Student Portal and tutor ↔ student messages.
 *
 *   GET  /portal/tutors              the signed-in student's tutors, with their profiles
 *   GET  /portal/classes             the classes the signed-in student is in
 *   GET  /tutor/profile              the signed-in tutor's own profile
 *   PUT  /tutor/profile
 *   GET  /messages/threads           everyone the caller can message, latest message + unread
 *   GET  /messages/unread            total unread messages for the caller
 *   GET  /messages/:otherId          a conversation (latest 200 messages)
 *   POST /messages/:otherId          send a message
 *   POST /messages/:otherId/read     mark the conversation read
 *
 * A conversation is between a tutor and a student on their roster
 * (tutor_students). Messages are kept if the pair is later unlinked, but
 * can't be read or sent until they're linked again.
 */
import { Router, type Request, type Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, type Caller } from "../lib/auth";
import { appUrl, getResend, sendEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router = Router();

const MAX_MESSAGE = 4000;
const PROFILE_LIMITS = { headline: 120, bio: 2000, subjects: 300, qualifications: 1000 } as const;

interface MessageRow {
  id: string;
  tutor_id: string;
  student_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

interface TutorProfileRow {
  tutor_id: string;
  headline: string | null;
  bio: string | null;
  subjects: string | null;
  qualifications: string | null;
}

function fail(res: Response, err: unknown) {
  return res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
}

async function names(admin: SupabaseClient, ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!ids.length) return out;
  const { data } = await admin.from("profiles").select("id, display_name").in("id", [...new Set(ids)]);
  for (const p of (data ?? []) as { id: string; display_name: string | null }[]) out[p.id] = p.display_name?.trim() || "Unnamed";
  return out;
}

// ── Student Portal ──────────────────────────────────────────────────────────

router.get("/portal/tutors", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req, res);
    if (!caller) return;
    const { admin, userId } = caller;

    const { data: links, error } = await admin
      .from("tutor_students")
      .select("tutor_id, invited_at")
      .eq("student_id", userId)
      .order("invited_at", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    const tutorIds = ((links ?? []) as { tutor_id: string; invited_at: string }[]).map((l) => l.tutor_id);
    if (!tutorIds.length) return res.json({ tutors: [] });

    const [nameMap, profilesRes, subjectsRes, membersRes] = await Promise.all([
      names(admin, tutorIds),
      admin.from("tutor_profiles").select("*").in("tutor_id", tutorIds),
      admin.from("tutor_student_subjects").select("tutor_id, subject_name, stage").eq("student_id", userId).in("tutor_id", tutorIds),
      admin.from("tutor_class_members").select("class_id").eq("student_id", userId),
    ]);
    const profileBy = new Map(((profilesRes.data ?? []) as TutorProfileRow[]).map((p) => [p.tutor_id, p]));

    // Classes this student shares with each tutor (as owner or co-tutor).
    const classIds = ((membersRes.data ?? []) as { class_id: string }[]).map((m) => m.class_id);
    const classesByTutor: Record<string, string[]> = {};
    if (classIds.length) {
      const [{ data: owned }, { data: co }] = await Promise.all([
        admin.from("tutor_classes").select("id, tutor_id, name").in("id", classIds),
        admin.from("tutor_class_tutors").select("class_id, tutor_id").in("class_id", classIds),
      ]);
      const classNames = new Map(((owned ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
      const pairs = [
        ...((owned ?? []) as { id: string; tutor_id: string }[]).map((c) => ({ class_id: c.id, tutor_id: c.tutor_id })),
        ...((co ?? []) as { class_id: string; tutor_id: string }[]),
      ];
      for (const p of pairs) {
        const name = classNames.get(p.class_id);
        if (!name) continue;
        const list = (classesByTutor[p.tutor_id] ??= []);
        if (!list.includes(name)) list.push(name);
      }
    }

    const tutors = ((links ?? []) as { tutor_id: string; invited_at: string }[]).map((l) => {
      const p = profileBy.get(l.tutor_id);
      return {
        id: l.tutor_id,
        name: nameMap[l.tutor_id] ?? "Your tutor",
        since: l.invited_at,
        headline: p?.headline ?? null,
        bio: p?.bio ?? null,
        subjects: p?.subjects ?? null,
        qualifications: p?.qualifications ?? null,
        tutored_subjects: ((subjectsRes.data ?? []) as { tutor_id: string; subject_name: string; stage: string | null }[])
          .filter((s) => s.tutor_id === l.tutor_id)
          .map((s) => (s.stage ? `${s.subject_name} · ${s.stage}` : s.subject_name)),
        classes: classesByTutor[l.tutor_id] ?? [],
      };
    });
    return res.json({ tutors });
  } catch (err) {
    return fail(res, err);
  }
});

router.get("/portal/classes", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req, res);
    if (!caller) return;
    const { admin, userId } = caller;

    const { data: mine, error } = await admin.from("tutor_class_members").select("class_id").eq("student_id", userId);
    if (error) return res.status(500).json({ error: error.message });
    const classIds = ((mine ?? []) as { class_id: string }[]).map((m) => m.class_id);
    if (!classIds.length) return res.json({ classes: [] });

    const [classesRes, membersRes, coRes] = await Promise.all([
      admin.from("tutor_classes").select("id, tutor_id, name, subject, color, description").in("id", classIds),
      admin.from("tutor_class_members").select("class_id, student_id").in("class_id", classIds),
      admin.from("tutor_class_tutors").select("class_id, tutor_id").in("class_id", classIds),
    ]);
    const classes = (classesRes.data ?? []) as { id: string; tutor_id: string; name: string; subject: string | null; color: string | null; description: string | null }[];
    const members = (membersRes.data ?? []) as { class_id: string; student_id: string }[];
    const co = (coRes.data ?? []) as { class_id: string; tutor_id: string }[];
    const nameMap = await names(admin, [...classes.map((c) => c.tutor_id), ...members.map((m) => m.student_id), ...co.map((c) => c.tutor_id)]);

    return res.json({
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        subject: c.subject,
        color: c.color,
        description: c.description,
        tutors: [c.tutor_id, ...co.filter((x) => x.class_id === c.id && x.tutor_id !== c.tutor_id).map((x) => x.tutor_id)]
          .map((id) => ({ id, name: nameMap[id] ?? "Tutor" })),
        // Classmates by first name only.
        members: members
          .filter((m) => m.class_id === c.id)
          .map((m) => ({ id: m.student_id, name: (nameMap[m.student_id] ?? "Student").split(/\s+/)[0], is_me: m.student_id === userId })),
      })),
    });
  } catch (err) {
    return fail(res, err);
  }
});

// ── Tutor profile ───────────────────────────────────────────────────────────

async function requireTutorCaller(req: Request, res: Response): Promise<Caller | null> {
  const caller = await requireUser(req, res);
  if (!caller) return null;
  if (!caller.isTutor && !caller.isAdmin) {
    res.status(403).json({ error: "Forbidden: caller is not a tutor" });
    return null;
  }
  return caller;
}

router.get("/tutor/profile", async (req: Request, res: Response) => {
  try {
    const caller = await requireTutorCaller(req, res);
    if (!caller) return;
    const { data, error } = await caller.admin.from("tutor_profiles").select("*").eq("tutor_id", caller.userId).maybeSingle<TutorProfileRow>();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ profile: data ?? { tutor_id: caller.userId, headline: null, bio: null, subjects: null, qualifications: null } });
  } catch (err) {
    return fail(res, err);
  }
});

router.put("/tutor/profile", async (req: Request, res: Response) => {
  try {
    const caller = await requireTutorCaller(req, res);
    if (!caller) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const row: Record<string, string | null> = {};
    for (const [field, max] of Object.entries(PROFILE_LIMITS)) {
      const value = typeof body[field] === "string" ? (body[field] as string).trim() : "";
      if (value.length > max) return res.status(400).json({ error: `${field} is too long (max ${max} characters).` });
      row[field] = value || null;
    }
    const { data, error } = await caller.admin
      .from("tutor_profiles")
      .upsert({ tutor_id: caller.userId, ...row, updated_at: new Date().toISOString() })
      .select("*")
      .single<TutorProfileRow>();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ profile: data });
  } catch (err) {
    return fail(res, err);
  }
});

// ── Messages ────────────────────────────────────────────────────────────────

/**
 * The roster link between the caller and someone else, as { tutor_id,
 * student_id }, or null if they aren't linked. The caller's own roster
 * (caller as tutor) wins if both directions exist.
 */
async function pairWith(admin: SupabaseClient, me: string, other: string): Promise<{ tutor_id: string; student_id: string } | null> {
  if (!other || other === me) return null;
  const { data } = await admin
    .from("tutor_students")
    .select("tutor_id, student_id")
    .or(`and(tutor_id.eq.${me},student_id.eq.${other}),and(tutor_id.eq.${other},student_id.eq.${me})`);
  const rows = (data ?? []) as { tutor_id: string; student_id: string }[];
  return rows.find((r) => r.tutor_id === me) ?? rows[0] ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/messages/threads", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req, res);
    if (!caller) return;
    const { admin, userId } = caller;

    const { data: links, error } = await admin
      .from("tutor_students")
      .select("tutor_id, student_id")
      .or(`tutor_id.eq.${userId},student_id.eq.${userId}`);
    if (error) return res.status(500).json({ error: error.message });
    const pairs = (links ?? []) as { tutor_id: string; student_id: string }[];
    if (!pairs.length) return res.json({ threads: [] });

    const { data: msgs, error: msgErr } = await admin
      .from("tutor_messages")
      .select("*")
      .or(`tutor_id.eq.${userId},student_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (msgErr) return res.status(500).json({ error: msgErr.message });

    const key = (t: string, s: string) => `${t}:${s}`;
    const latest = new Map<string, MessageRow>();
    const unread = new Map<string, number>();
    for (const m of (msgs ?? []) as MessageRow[]) {
      const k = key(m.tutor_id, m.student_id);
      if (!latest.has(k)) latest.set(k, m);
      if (m.sender_id !== userId && !m.read_at) unread.set(k, (unread.get(k) ?? 0) + 1);
    }

    const otherIds = pairs.map((p) => (p.tutor_id === userId ? p.student_id : p.tutor_id));
    const nameMap = await names(admin, otherIds);
    const threads = pairs
      .map((p) => {
        const iAmTutor = p.tutor_id === userId;
        const otherId = iAmTutor ? p.student_id : p.tutor_id;
        const last = latest.get(key(p.tutor_id, p.student_id));
        return {
          other_id: otherId,
          other_name: nameMap[otherId] ?? "Unnamed",
          other_role: iAmTutor ? "student" : "tutor",
          last_message: last ? { body: last.body, created_at: last.created_at, from_me: last.sender_id === userId } : null,
          unread: unread.get(key(p.tutor_id, p.student_id)) ?? 0,
        };
      })
      // Conversations with messages first (newest first), then everyone else by name.
      .sort((a, b) => {
        if (a.last_message && b.last_message) return b.last_message.created_at.localeCompare(a.last_message.created_at);
        if (a.last_message || b.last_message) return a.last_message ? -1 : 1;
        return a.other_name.localeCompare(b.other_name);
      });
    return res.json({ threads });
  } catch (err) {
    return fail(res, err);
  }
});

router.get("/messages/unread", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req, res);
    if (!caller) return;
    const { admin, userId } = caller;
    const { data: links } = await admin
      .from("tutor_students")
      .select("tutor_id, student_id")
      .or(`tutor_id.eq.${userId},student_id.eq.${userId}`);
    const linked = new Set(((links ?? []) as { tutor_id: string; student_id: string }[]).map((p) => `${p.tutor_id}:${p.student_id}`));
    if (!linked.size) return res.json({ unread: 0 });
    const { data, error } = await admin
      .from("tutor_messages")
      .select("tutor_id, student_id")
      .or(`tutor_id.eq.${userId},student_id.eq.${userId}`)
      .neq("sender_id", userId)
      .is("read_at", null)
      .limit(1000);
    if (error) return res.status(500).json({ error: error.message });
    const unread = ((data ?? []) as { tutor_id: string; student_id: string }[]).filter((m) => linked.has(`${m.tutor_id}:${m.student_id}`)).length;
    return res.json({ unread });
  } catch (err) {
    return fail(res, err);
  }
});

router.get("/messages/:otherId", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req, res);
    if (!caller) return;
    const otherId = String(req.params.otherId);
    if (!UUID_RE.test(otherId)) return res.status(404).json({ error: "Conversation not found." });
    const pair = await pairWith(caller.admin, caller.userId, otherId);
    if (!pair) return res.status(403).json({ error: "You can only message your own tutor or students." });

    const { data, error } = await caller.admin
      .from("tutor_messages")
      .select("*")
      .eq("tutor_id", pair.tutor_id)
      .eq("student_id", pair.student_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ error: error.message });
    const nameMap = await names(caller.admin, [otherId]);
    return res.json({
      other: { id: otherId, name: nameMap[otherId] ?? "Unnamed", role: pair.tutor_id === caller.userId ? "student" : "tutor" },
      messages: ((data ?? []) as MessageRow[]).reverse().map((m) => ({
        id: m.id,
        body: m.body,
        created_at: m.created_at,
        from_me: m.sender_id === caller.userId,
        read_at: m.read_at,
      })),
    });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/messages/:otherId/read", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req, res);
    if (!caller) return;
    const otherId = String(req.params.otherId);
    if (!UUID_RE.test(otherId)) return res.status(404).json({ error: "Conversation not found." });
    const pair = await pairWith(caller.admin, caller.userId, otherId);
    if (!pair) return res.status(403).json({ error: "You can only message your own tutor or students." });
    const { error } = await caller.admin
      .from("tutor_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("tutor_id", pair.tutor_id)
      .eq("student_id", pair.student_id)
      .eq("sender_id", otherId)
      .is("read_at", null);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/messages/:otherId", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req, res);
    if (!caller) return;
    const { admin, userId } = caller;
    const otherId = String(req.params.otherId);
    if (!UUID_RE.test(otherId)) return res.status(404).json({ error: "Conversation not found." });
    const body = String((req.body as { body?: string })?.body ?? "").trim();
    if (!body) return res.status(400).json({ error: "Write a message first." });
    if (body.length > MAX_MESSAGE) return res.status(400).json({ error: `Messages can be up to ${MAX_MESSAGE} characters.` });

    const pair = await pairWith(admin, userId, otherId);
    if (!pair) return res.status(403).json({ error: "You can only message your own tutor or students." });

    // Whether the recipient already had unread messages from the caller here:
    // if so they've been emailed about them, so this one doesn't email again.
    const { count: alreadyUnread } = await admin
      .from("tutor_messages")
      .select("id", { count: "exact", head: true })
      .eq("tutor_id", pair.tutor_id)
      .eq("student_id", pair.student_id)
      .eq("sender_id", userId)
      .is("read_at", null);

    const { data: inserted, error } = await admin
      .from("tutor_messages")
      .insert({ ...pair, sender_id: userId, body })
      .select("*")
      .single<MessageRow>();
    if (error || !inserted) return res.status(500).json({ error: error?.message ?? "Could not send the message." });

    if (!alreadyUnread) {
      void notifyRecipient(admin, { senderId: userId, recipientId: otherId, recipientIsTutor: pair.tutor_id === otherId, messageId: inserted.id, body });
    }

    return res.json({
      message: { id: inserted.id, body: inserted.body, created_at: inserted.created_at, from_me: true, read_at: null },
    });
  } catch (err) {
    return fail(res, err);
  }
});

/** Email the recipient that they have a new message. Best-effort. */
async function notifyRecipient(
  admin: SupabaseClient,
  opts: { senderId: string; recipientId: string; recipientIsTutor: boolean; messageId: string; body: string },
) {
  try {
    const resend = getResend();
    if (!resend) return;
    const { data } = await admin.auth.admin.getUserById(opts.recipientId);
    const to = data?.user?.email;
    if (!to) return;
    const nameMap = await names(admin, [opts.senderId, opts.recipientId]);
    const sender = nameMap[opts.senderId] ?? "Someone";
    const recipient = (nameMap[opts.recipientId] ?? "there").split(/\s+/)[0];
    const preview = opts.body.length > 600 ? `${opts.body.slice(0, 600)}…` : opts.body;
    const url = opts.recipientIsTutor ? `${appUrl()}/tutor?tab=messages` : `${appUrl()}/portal/messages`;
    const { error } = await sendEmail(resend, {
      to,
      subject: `New message from ${sender}`,
      content: {
        heading: `New message from ${sender}`,
        paragraphs: [`Hi ${recipient},`, preview],
        cta: { label: "Reply on gradefarm.", url },
        footer: opts.recipientIsTutor
          ? `You're receiving this because a student on your roster messaged you on gradefarm. You won't get another email until you've read it.`
          : `You're receiving this because your tutor messaged you on gradefarm. You won't get another email until you've read it.`,
      },
      idempotencyKey: `tutor-message:${opts.messageId}`,
    });
    if (error) logger.warn({ error }, "message notification email failed");
  } catch (err) {
    logger.warn({ err }, "message notification email failed");
  }
}

export default router;
