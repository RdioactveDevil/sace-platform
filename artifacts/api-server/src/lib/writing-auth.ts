import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

type AdminAuth = {
  getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
};

export function getSupabaseService(): SupabaseClient & { auth: AdminAuth } {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("No SUPABASE_SERVICE_KEY configured");
  return createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } }) as SupabaseClient & { auth: AdminAuth };
}

export type WritingAttemptRow = {
  id: string;
  user_id: string;
  subject: string;
  essay_type: string;
  mode: string;
  prompt: string;
  image_url: string | null;
  content: unknown;
  feedback: unknown;
  timed: boolean;
  duration_seconds: number | null;
  actual_seconds: number | null;
  created_at: string;
};

export async function getUserIdFromJwt(admin: ReturnType<typeof getSupabaseService>, jwt: string): Promise<string | null> {
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

export type WritingViewerRole = "owner" | "tutor" | "admin";

/** Returns the attempt row if the JWT bearer may read it. */
export async function loadWritingAttemptForViewer(
  admin: ReturnType<typeof getSupabaseService>,
  jwt: string,
  attemptId: string,
): Promise<{ row: WritingAttemptRow; role: WritingViewerRole; viewerId: string } | null> {
  const viewerId = await getUserIdFromJwt(admin, jwt);
  if (!viewerId) return null;

  const { data: row, error } = await admin
    .from("writing_attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle<WritingAttemptRow>();
  if (error || !row) return null;

  if (row.user_id === viewerId) return { row, role: "owner", viewerId };

  const { data: prof } = await admin.from("profiles").select("is_admin, is_tutor").eq("id", viewerId).maybeSingle<{
    is_admin: boolean;
    is_tutor: boolean;
  }>();
  if (prof?.is_admin) return { row, role: "admin", viewerId };

  if (prof?.is_tutor) {
    const { data: link } = await admin
      .from("tutor_students")
      .select("student_id")
      .eq("tutor_id", viewerId)
      .eq("student_id", row.user_id)
      .maybeSingle();
    if (link) return { row, role: "tutor", viewerId };
  }

  return null;
}
