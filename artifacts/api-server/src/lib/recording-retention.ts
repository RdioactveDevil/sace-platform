import type { SupabaseClient } from "@supabase/supabase-js";
import { r2DeleteObject } from "./r2";

/**
 * Automatic session recordings stay available (to watch and download) for
 * this long, then the daily cleanup job deletes the file and its resource row
 * to free up storage. Files tutors upload themselves are never touched.
 */
export const RECORDING_RETENTION_DAYS = 70;

const DAY_MS = 24 * 60 * 60 * 1000;
const RESOURCE_BUCKET = "tutor-resources";

interface RecordingLike {
  type: string;
  session_id: string | null;
  storage_path: string | null;
  created_at: string;
}

/** Recordings made by LiveKit Egress live under <tutorId>/recordings/. */
export function isSessionRecording(r: RecordingLike): boolean {
  return r.type === "recording" && !!r.session_id && !!r.storage_path?.includes("/recordings/");
}

/** When a session recording will be deleted, or null for anything else. */
export function recordingExpiresAt(r: RecordingLike): string | null {
  if (!isSessionRecording(r)) return null;
  return new Date(new Date(r.created_at).getTime() + RECORDING_RETENTION_DAYS * DAY_MS).toISOString();
}

interface ExpiredRow {
  id: string;
  session_id: string | null;
  storage_path: string | null;
  storage_backend: string | null;
  type: string;
  created_at: string;
}

export interface CleanupSummary {
  dryRun: boolean;
  cutoff: string;
  expired: number;
  deleted: number;
  failed: Array<{ id: string; reason: string }>;
}

/**
 * Delete session recordings older than RECORDING_RETENTION_DAYS: the stored
 * file first, then the resource row, then mark the session "expired". A file
 * that fails to delete keeps its row, so the next run retries it.
 */
export async function deleteExpiredRecordings(
  admin: SupabaseClient,
  opts: { dryRun?: boolean; max?: number } = {},
): Promise<CleanupSummary> {
  const dryRun = !!opts.dryRun;
  const cutoff = new Date(Date.now() - RECORDING_RETENTION_DAYS * DAY_MS).toISOString();
  const { data, error } = await admin
    .from("tutor_resources")
    .select("id, session_id, storage_path, storage_backend, type, created_at")
    .eq("type", "recording")
    .not("session_id", "is", null)
    .like("storage_path", "%/recordings/%")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(opts.max ?? 200)
    .returns<ExpiredRow[]>();
  if (error) throw new Error(error.message);

  const rows = (data ?? []).filter(isSessionRecording);
  const summary: CleanupSummary = { dryRun, cutoff, expired: rows.length, deleted: 0, failed: [] };
  if (dryRun) return summary;

  for (const r of rows) {
    const path = r.storage_path as string;
    let fileGone: boolean;
    if (r.storage_backend === "r2") {
      fileGone = await r2DeleteObject(path);
    } else {
      const { error: rmErr } = await admin.storage.from(RESOURCE_BUCKET).remove([path]);
      fileGone = !rmErr;
    }
    if (!fileGone) {
      summary.failed.push({ id: r.id, reason: "could not delete file" });
      continue;
    }

    const { error: delErr } = await admin.from("tutor_resources").delete().eq("id", r.id);
    if (delErr) {
      summary.failed.push({ id: r.id, reason: delErr.message });
      continue;
    }
    await admin
      .from("tutoring_sessions")
      .update({ recording_status: "expired" })
      .eq("id", r.session_id as string)
      .eq("recording_status", "ready");
    summary.deleted++;
  }
  return summary;
}
