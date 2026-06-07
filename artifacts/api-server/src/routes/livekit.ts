import express, { Router, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { WebhookReceiver, EgressStatus } from "livekit-server-sdk";
import { startSessionRecording, RECORDING_BUCKET } from "./sessions";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

function getAdminClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("No SUPABASE_SERVICE_KEY configured");
  return createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
}

interface SessionRow {
  id: string;
  tutor_id: string;
  student_id: string | null;
  class_id: string | null;
  session_type: string | null;
  title: string | null;
  livekit_room_name: string | null;
  record_session: boolean;
  recording_egress_id: string | null;
  recording_status: string | null;
  recording_storage_path: string | null;
}

/**
 * LiveKit webhook. Drives session auto-recording:
 *  • room_started  → start a Room Composite Egress (if the session opted in)
 *  • egress_ended  → publish the recording as a tutor_resources row
 *
 * Mounted with a raw body parser because the signature is verified against the
 * exact bytes LiveKit posted (content-type: application/webhook+json, which the
 * global express.json() parser leaves untouched).
 */
router.post(
  "/livekit/webhook",
  express.raw({ type: "*/*" }),
  async (req: Request, res: Response) => {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) {
      res.status(503).json({ error: "LiveKit not configured" });
      return;
    }

    let event;
    try {
      const receiver = new WebhookReceiver(apiKey, apiSecret);
      const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
      event = await receiver.receive(body, req.get("Authorization"));
    } catch {
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    // Always ack quickly; processing errors must not trigger LiveKit retries
    // that could duplicate recordings.
    try {
      const admin = getAdminClient();

      if (event.event === "room_started" && event.room?.name) {
        await handleRoomStarted(admin, event.room.name);
      } else if (event.event === "egress_ended" && event.egressInfo) {
        await handleEgressEnded(admin, event.egressInfo);
      }
    } catch (err) {
      // Log only — still return 200 so LiveKit does not retry.
      console.warn("[livekit webhook] processing error:", err instanceof Error ? err.message : err);
    }

    res.json({ ok: true });
  },
);

interface OccurrenceRow {
  id: string;
  tutor_id: string;
  status: string | null;
  scheduled_at: string | null;
  recording_status: string | null;
}

async function handleRoomStarted(admin: SupabaseClient, roomName: string): Promise<void> {
  // A one-off session has a unique room; a recurring series reuses one room
  // across all of its occurrences. Select the occurrences that still want
  // recording and pick the one actually happening now.
  const { data: candidates } = await admin
    .from("tutoring_sessions")
    .select("id, tutor_id, status, scheduled_at, recording_status")
    .eq("livekit_room_name", roomName)
    .eq("record_session", true)
    .is("recording_status", null)
    .returns<OccurrenceRow[]>();

  if (!candidates || candidates.length === 0) return;

  // Prefer the occurrence the token endpoint marked active; else the one whose
  // scheduled time is nearest to now.
  const now = Date.now();
  const target =
    candidates.find((s) => s.status === "active") ??
    candidates
      .slice()
      .sort(
        (a, b) =>
          Math.abs(new Date(a.scheduled_at ?? 0).getTime() - now) -
          Math.abs(new Date(b.scheduled_at ?? 0).getTime() - now),
      )[0];
  if (!target) return;

  const started = await startSessionRecording(roomName, target.tutor_id, target.id);
  if (!started) {
    await admin.from("tutoring_sessions").update({ recording_status: "failed" }).eq("id", target.id);
    return;
  }
  await admin
    .from("tutoring_sessions")
    .update({
      recording_egress_id: started.egressId,
      recording_storage_path: started.storagePath,
      recording_status: "recording",
    })
    .eq("id", target.id);
}

interface EgressInfoLike {
  egressId: string;
  status: EgressStatus;
  fileResults?: Array<{ filename?: string; size?: bigint | number; duration?: bigint | number }>;
}

async function handleEgressEnded(admin: SupabaseClient, info: EgressInfoLike): Promise<void> {
  const { data: session } = await admin
    .from("tutoring_sessions")
    .select(
      "id, tutor_id, student_id, class_id, session_type, title, record_session, recording_egress_id, recording_status, recording_storage_path",
    )
    .eq("recording_egress_id", info.egressId)
    .maybeSingle<SessionRow>();

  if (!session) return;
  // Idempotency: only publish once.
  if (session.recording_status === "ready") return;

  if (info.status !== EgressStatus.EGRESS_COMPLETE) {
    await admin.from("tutoring_sessions").update({ recording_status: "failed" }).eq("id", session.id);
    return;
  }

  const file = info.fileResults?.[0];
  const storagePath = session.recording_storage_path || file?.filename || null;
  if (!storagePath) {
    await admin.from("tutoring_sessions").update({ recording_status: "failed" }).eq("id", session.id);
    return;
  }
  const fileSize = file?.size != null ? Number(file.size) : null;

  // Confirm the object actually landed in storage before publishing.
  const lastSlash = storagePath.lastIndexOf("/");
  const dir = lastSlash >= 0 ? storagePath.slice(0, lastSlash) : "";
  const base = lastSlash >= 0 ? storagePath.slice(lastSlash + 1) : storagePath;
  const { data: listed } = await admin.storage.from(RECORDING_BUCKET).list(dir, { search: base });
  if (!listed || !listed.find((o: { name: string }) => o.name === base)) {
    await admin.from("tutoring_sessions").update({ recording_status: "failed" }).eq("id", session.id);
    return;
  }

  const dateLabel = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  const title = `${session.title || "Class"} — recording (${dateLabel})`;

  // Share with the same audience the session targeted.
  //   class session   → that class
  //   1:1 session      → that student
  //   group, no class  → whole roster
  const classId = session.class_id ?? null;
  const studentId = !classId && session.session_type !== "group" ? session.student_id ?? null : null;

  await admin.from("tutor_resources").insert({
    tutor_id: session.tutor_id,
    title,
    description: "Automatically recorded class session.",
    type: "recording",
    kind: "file",
    storage_path: storagePath,
    file_name: base,
    file_size: fileSize,
    mime_type: "video/mp4",
    class_id: classId,
    student_id: studentId,
    session_id: session.id,
    visible_to_students: true,
  });

  await admin.from("tutoring_sessions").update({ recording_status: "ready" }).eq("id", session.id);
}

export default router;
