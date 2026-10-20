import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

export type Caller = {
  userId: string;
  isAdmin: boolean;
  isTutor: boolean;
  admin: SupabaseClient;
};

export function getServiceClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("No SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY configured");
  return createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
}

/**
 * Resolve the caller from the `Authorization: Bearer <supabase jwt>` header.
 * Sends 401 and returns null when the token is missing or invalid.
 * Role flags are read server-side from `profiles` — never trusted from the body.
 */
export async function requireUser(req: Request, res: Response): Promise<Caller | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Sign in required" });
    return null;
  }
  let admin: SupabaseClient;
  try {
    admin = getServiceClient();
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Server misconfigured" });
    return null;
  }
  const token = authHeader.slice(7);
  // Trusted server-side callers (scripts/, report-question's regeneration)
  // authenticate with the service key itself and act as admin.
  if (isServiceKey(token)) {
    return { userId: "service", isAdmin: true, isTutor: false, admin };
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return null;
  }
  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin, is_tutor, deactivated_at")
    .eq("id", data.user.id)
    .maybeSingle<{ is_admin: boolean | null; is_tutor: boolean | null; deactivated_at: string | null }>();
  if (profile?.deactivated_at) {
    res.status(403).json({ error: "Account deactivated" });
    return null;
  }
  return {
    userId: data.user.id,
    isAdmin: !!profile?.is_admin,
    isTutor: !!profile?.is_tutor,
    admin,
  };
}

/** Like requireUser, but also requires `profiles.is_admin`. Sends 403 otherwise. */
export async function requireAdmin(req: Request, res: Response): Promise<Caller | null> {
  const caller = await requireUser(req, res);
  if (!caller) return null;
  if (!caller.isAdmin) {
    res.status(403).json({ error: "Forbidden: admin only" });
    return null;
  }
  return caller;
}

function isServiceKey(token: string): boolean {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key || token.length !== key.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(key));
}
