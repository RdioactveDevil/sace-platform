import { Router, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";
const BUCKET = "tutor-resources";
const SIGNED_URL_TTL = 60 * 60; // 1 hour

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

type AdminClient = SupabaseClient & { auth: SupabaseAdminAuth };

function getAdminClient(): AdminClient {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("No SUPABASE_SERVICE_KEY configured");
  return createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } }) as AdminClient;
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

interface UserContext {
  admin: AdminClient;
  userId: string;
  email?: string;
  isTutor: boolean;
  displayName: string;
}

/** Authenticate any user; reports tutor status and display name. */
async function requireUser(req: Request, res: Response): Promise<UserContext | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const admin = getAdminClient();
  const { data: caller, error } = await admin.auth.getUser(authHeader.slice(7));
  if (error || !caller?.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }
  const { data: profile } = await admin
    .from("profiles")
    .select("id, is_tutor, display_name")
    .eq("id", caller.user.id)
    .single<{ id: string; is_tutor: boolean; display_name: string | null }>();

  return {
    admin,
    userId: caller.user.id,
    email: caller.user.email,
    isTutor: !!profile?.is_tutor,
    displayName: profile?.display_name ?? "Your tutor",
  };
}

async function requireTutor(req: Request, res: Response): Promise<UserContext | null> {
  const ctx = await requireUser(req, res);
  if (!ctx) return null;
  if (!ctx.isTutor) {
    res.status(403).json({ error: "Forbidden: caller is not a tutor" });
    return null;
  }
  return ctx;
}

const RESOURCE_TYPES = new Set(["notes", "worksheet", "recording", "slides", "resource", "link"]);

interface ResourceRow {
  id: string;
  tutor_id: string;
  title: string;
  description: string | null;
  type: string;
  kind: "file" | "link";
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  external_url: string | null;
  class_id: string | null;
  student_id: string | null;
  session_id: string | null;
  visible_to_students: boolean;
  created_at: string;
}

/** Resolve which roster students a resource reaches (for email + counts). */
async function resolveRecipients(
  admin: AdminClient,
  tutorId: string,
  row: Pick<ResourceRow, "class_id" | "student_id">,
): Promise<string[]> {
  const { data: rosterRows } = await admin
    .from("tutor_students")
    .select("student_id")
    .eq("tutor_id", tutorId);
  const roster = new Set((rosterRows ?? []).map((r: { student_id: string }) => r.student_id));

  if (row.student_id) {
    return roster.has(row.student_id) ? [row.student_id] : [];
  }
  if (row.class_id) {
    const { data: members } = await admin
      .from("tutor_class_members")
      .select("student_id")
      .eq("class_id", row.class_id);
    return (members ?? [])
      .map((m: { student_id: string }) => m.student_id)
      .filter((id: string) => roster.has(id));
  }
  return Array.from(roster);
}

// ── Create a resource ────────────────────────────────────────────────────────
router.post("/tutor/resources", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, userId, displayName } = ctx;

    const body = req.body as {
      title?: string;
      description?: string | null;
      type?: string;
      kind?: "file" | "link";
      storage_path?: string | null;
      file_name?: string | null;
      file_size?: number | null;
      mime_type?: string | null;
      external_url?: string | null;
      class_id?: string | null;
      student_id?: string | null;
      session_id?: string | null;
      visible_to_students?: boolean;
      notify?: boolean;
    };

    const title = (body.title ?? "").trim();
    if (!title) return res.status(400).json({ error: "title is required." });

    const kind = body.kind === "link" ? "link" : "file";
    const type = body.type && RESOURCE_TYPES.has(body.type) ? body.type : "resource";

    if (kind === "file" && !body.storage_path) {
      return res.status(400).json({ error: "storage_path is required for file resources." });
    }
    if (kind === "link") {
      const url = (body.external_url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: "A valid http(s) link is required." });
      }
    }

    // A file must live in the caller's own folder of the bucket.
    if (kind === "file" && body.storage_path && !body.storage_path.startsWith(`${userId}/`)) {
      return res.status(400).json({ error: "Invalid storage path." });
    }

    // Validate that any targeted class belongs to the tutor.
    if (body.class_id) {
      const { data: cls } = await admin
        .from("tutor_classes")
        .select("id, tutor_id")
        .eq("id", body.class_id)
        .single<{ id: string; tutor_id: string }>();
      if (!cls || cls.tutor_id !== userId) {
        return res.status(403).json({ error: "Class does not belong to you." });
      }
    }
    // Validate that any targeted student is on the tutor's roster.
    if (body.student_id) {
      const { data: rosterRow } = await admin
        .from("tutor_students")
        .select("student_id")
        .eq("tutor_id", userId)
        .eq("student_id", body.student_id)
        .maybeSingle<{ student_id: string }>();
      if (!rosterRow) {
        return res.status(403).json({ error: "Student is not on your roster." });
      }
    }

    const insert = {
      tutor_id: userId,
      title,
      description: body.description?.trim() || null,
      type,
      kind,
      storage_path: kind === "file" ? body.storage_path : null,
      file_name: kind === "file" ? body.file_name ?? null : null,
      file_size: kind === "file" ? body.file_size ?? null : null,
      mime_type: kind === "file" ? body.mime_type ?? null : null,
      external_url: kind === "link" ? (body.external_url ?? "").trim() : null,
      class_id: body.class_id || null,
      student_id: body.student_id || null,
      session_id: body.session_id || null,
      visible_to_students: body.visible_to_students !== false,
    };

    const { data, error } = await admin
      .from("tutor_resources")
      .insert(insert)
      .select("*")
      .single<ResourceRow>();
    if (error) return res.status(500).json({ error: error.message });

    // Best-effort email notification to recipients.
    let notified = 0;
    let notifyErrors = 0;
    if (body.notify && data.visible_to_students) {
      const recipients = await resolveRecipients(admin, userId, data);
      const resend = getResend();
      if (resend && recipients.length > 0) {
        const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const emailMap = new Map<string, string>();
        for (const u of listData?.users ?? []) {
          if (u.id && u.email) emailMap.set(u.id, u.email);
        }
        const safeTutor = escapeHtml(displayName);
        const safeTitle = escapeHtml(title);
        const safeType = escapeHtml(type);
        await Promise.all(
          recipients.map(async (sid) => {
            const to = emailMap.get(sid);
            if (!to) return;
            const { error: sendErr } = await resend.emails.send({
              from: "gradefarm. <notifications@gradefarm.au>",
              to,
              subject: `New ${safeType} from your tutor — ${safeTitle}`,
              html: `
                <div style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0c1037; color: #f0f4ff; border-radius: 16px; overflow: hidden;">
                  <div style="background: linear-gradient(135deg, #f1be43, #f9d87a); padding: 28px 32px;">
                    <h1 style="margin: 0; font-size: 24px; color: #0c1037; font-weight: 900; letter-spacing: -0.5px;">gradefarm.</h1>
                  </div>
                  <div style="padding: 32px;">
                    <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 800; color: #f0f4ff;">New class resource</h2>
                    <p style="margin: 0 0 24px; color: #a3aec2; font-size: 15px;">Your tutor ${safeTutor} shared <strong style="color:#f0f4ff;">${safeTitle}</strong> with you.</p>
                    <a href="https://gradefarm.au" style="display: inline-block; background: linear-gradient(135deg, #f1be43, #f9d87a); color: #0c1037; font-weight: 800; font-size: 14px; padding: 13px 26px; border-radius: 9px; text-decoration: none;">Open gradefarm.</a>
                  </div>
                  <div style="padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.08); color: #5a6480; font-size: 11px;">
                    You're receiving this because your tutor ${safeTutor} shared a resource with you via gradefarm.
                  </div>
                </div>
              `,
            });
            if (sendErr) notifyErrors++;
            else notified++;
          }),
        );
      }
    }

    return res.json({ resource: data, recipients: (await resolveRecipients(admin, userId, data)).length, notified, notify_errors: notifyErrors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// ── List a tutor's own resources ─────────────────────────────────────────────
router.get("/tutor/resources", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, userId } = ctx;

    const { data: rows, error } = await admin
      .from("tutor_resources")
      .select("*")
      .eq("tutor_id", userId)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const resources = rows ?? [];

    // Enrich with class names + targeted student names for display.
    const classIds = [...new Set(resources.map((r: ResourceRow) => r.class_id).filter(Boolean))] as string[];
    const studentIds = [...new Set(resources.map((r: ResourceRow) => r.student_id).filter(Boolean))] as string[];

    const classNames: Record<string, string> = {};
    if (classIds.length > 0) {
      const { data: cls } = await admin.from("tutor_classes").select("id, name").in("id", classIds);
      for (const c of (cls ?? []) as { id: string; name: string }[]) classNames[c.id] = c.name;
    }
    const studentNames: Record<string, string> = {};
    if (studentIds.length > 0) {
      const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", studentIds);
      for (const p of (profs ?? []) as { id: string; display_name: string | null }[]) {
        studentNames[p.id] = p.display_name ?? "Student";
      }
    }

    const enriched = resources.map((r: ResourceRow) => ({
      ...r,
      class_name: r.class_id ? classNames[r.class_id] ?? null : null,
      student_name: r.student_id ? studentNames[r.student_id] ?? null : null,
    }));

    return res.json({ resources: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// ── List resources visible to the calling student ────────────────────────────
router.get("/resources/student", async (req: Request, res: Response) => {
  try {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { admin, userId } = ctx;

    // Tutors this student belongs to.
    const { data: rosterRows } = await admin
      .from("tutor_students")
      .select("tutor_id")
      .eq("student_id", userId);
    const tutorIds = (rosterRows ?? []).map((r: { tutor_id: string }) => r.tutor_id);

    // Classes this student belongs to.
    const { data: memberRows } = await admin
      .from("tutor_class_members")
      .select("class_id")
      .eq("student_id", userId);
    const classIds = new Set((memberRows ?? []).map((m: { class_id: string }) => m.class_id));

    let rows: ResourceRow[] = [];
    if (tutorIds.length > 0) {
      const { data, error } = await admin
        .from("tutor_resources")
        .select("*")
        .in("tutor_id", tutorIds)
        .eq("visible_to_students", true)
        .order("created_at", { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      rows = (data ?? []) as ResourceRow[];
    }
    // Direct-to-student resources from any tutor (covers edge cases).
    {
      const { data } = await admin
        .from("tutor_resources")
        .select("*")
        .eq("student_id", userId)
        .eq("visible_to_students", true);
      for (const r of (data ?? []) as ResourceRow[]) {
        if (!rows.find((x) => x.id === r.id)) rows.push(r);
      }
    }

    const visible = rows.filter((r) => {
      if (r.student_id) return r.student_id === userId;
      if (r.class_id) return classIds.has(r.class_id);
      return true; // roster-wide
    });

    // Resolve signed download URLs for files + tutor display names.
    const tutorNameIds = [...new Set(visible.map((r) => r.tutor_id))];
    const tutorNames: Record<string, string> = {};
    if (tutorNameIds.length > 0) {
      const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", tutorNameIds);
      for (const p of (profs ?? []) as { id: string; display_name: string | null }[]) {
        tutorNames[p.id] = p.display_name ?? "Tutor";
      }
    }

    const result = await Promise.all(
      visible.map(async (r) => {
        let download_url: string | null = r.external_url;
        if (r.kind === "file" && r.storage_path) {
          const { data: signed } = await admin.storage
            .from(BUCKET)
            .createSignedUrl(r.storage_path, SIGNED_URL_TTL);
          download_url = signed?.signedUrl ?? null;
        }
        return {
          id: r.id,
          title: r.title,
          description: r.description,
          type: r.type,
          kind: r.kind,
          file_name: r.file_name,
          file_size: r.file_size,
          mime_type: r.mime_type,
          created_at: r.created_at,
          tutor_name: tutorNames[r.tutor_id] ?? "Tutor",
          download_url,
        };
      }),
    );

    return res.json({ resources: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// ── Signed download URL for a single resource (tutor owner or eligible student)
router.get("/resources/:id/download", async (req: Request, res: Response) => {
  try {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { admin, userId } = ctx;
    const id = String(req.params.id);

    const { data: r, error } = await admin
      .from("tutor_resources")
      .select("*")
      .eq("id", id)
      .single<ResourceRow>();
    if (error || !r) return res.status(404).json({ error: "Resource not found." });

    // Access check: owner tutor, or a student the resource is shared with.
    let allowed = r.tutor_id === userId;
    if (!allowed && r.visible_to_students) {
      if (r.student_id) {
        allowed = r.student_id === userId;
      } else {
        const { data: rosterRow } = await admin
          .from("tutor_students")
          .select("student_id")
          .eq("tutor_id", r.tutor_id)
          .eq("student_id", userId)
          .maybeSingle<{ student_id: string }>();
        if (rosterRow) {
          if (r.class_id) {
            const { data: memberRow } = await admin
              .from("tutor_class_members")
              .select("student_id")
              .eq("class_id", r.class_id)
              .eq("student_id", userId)
              .maybeSingle<{ student_id: string }>();
            allowed = !!memberRow;
          } else {
            allowed = true; // roster-wide
          }
        }
      }
    }
    if (!allowed) return res.status(403).json({ error: "You don't have access to this resource." });

    if (r.kind === "link") return res.json({ url: r.external_url });
    if (!r.storage_path) return res.status(404).json({ error: "File missing." });

    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(r.storage_path, SIGNED_URL_TTL, { download: r.file_name || undefined });
    if (signErr || !signed) return res.status(500).json({ error: "Could not create download link." });
    return res.json({ url: signed.signedUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

// ── Delete a resource (tutor owner only) ─────────────────────────────────────
router.delete("/tutor/resources/:id", async (req: Request, res: Response) => {
  try {
    const ctx = await requireTutor(req, res);
    if (!ctx) return;
    const { admin, userId } = ctx;
    const id = String(req.params.id);

    const { data: r, error: exErr } = await admin
      .from("tutor_resources")
      .select("id, tutor_id, kind, storage_path")
      .eq("id", id)
      .single<Pick<ResourceRow, "id" | "tutor_id" | "kind" | "storage_path">>();
    if (exErr || !r || r.tutor_id !== userId) {
      return res.status(404).json({ error: "Resource not found." });
    }

    if (r.kind === "file" && r.storage_path) {
      await admin.storage.from(BUCKET).remove([r.storage_path]).catch(() => {});
    }
    const { error } = await admin.from("tutor_resources").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(500).json({ error: message });
  }
});

export default router;
