import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";
import { expandCurriculumRenameSources } from "../lib/subject-aliases";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

function getAdmin(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("No SUPABASE_SERVICE_KEY configured");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

async function countForAliases(
  admin: SupabaseClient,
  aliases: string[],
): Promise<{ live: number; pendingDrafts: number }> {
  const [
    { count: live, error: qErr },
    { count: pendingDrafts, error: dErr },
  ] = await Promise.all([
    admin.from("questions").select("*", { count: "exact", head: true }).in("subject", aliases),
    admin.from("draft_questions").select("*", { count: "exact", head: true }).in("subject", aliases).eq("status", "pending"),
  ]);
  if (qErr) throw new Error(qErr.message);
  if (dErr) throw new Error(dErr.message);
  return { live: live ?? 0, pendingDrafts: pendingDrafts ?? 0 };
}

type InItem = string | { name?: string; subject?: string; levelLabel?: string };

function normItem(raw: InItem): { key: string; level: string } {
  if (typeof raw === "string") return { key: raw.trim(), level: "" };
  const key = String(raw.name ?? raw.subject ?? "").trim();
  const level = String(raw.levelLabel ?? "").trim();
  return { key, level };
}

// POST /api/subject-question-counts
// Body: { subjects: Array<string | { name?: string, subject?: string, levelLabel?: string }> }
// Returns: { counts: Record<string, number> } keyed by each requested `name`/`subject` string.
router.post("/subject-question-counts", async (req, res) => {
  const { subjects } = req.body || {};
  if (!Array.isArray(subjects)) {
    res.status(400).json({ error: "subjects array required" });
    return;
  }

  const normalized = (subjects as InItem[]).map(normItem).filter((x) => x.key);
  if (normalized.length === 0) {
    res.json({ counts: {} });
    return;
  }

  try {
    const admin = getAdmin();
    const results = await Promise.all(
      normalized.map(async ({ key, level }) => {
        const aliases = expandCurriculumRenameSources(key, level);
        const { live, pendingDrafts } = await countForAliases(admin, aliases);
        return [key, live + pendingDrafts] as const;
      }),
    );
    const counts = Object.fromEntries(results);
    res.json({ counts });
  } catch (err) {
    logger.error({ err }, "subject-question-counts failed");
    const message = err instanceof Error ? err.message : "Count failed";
    res.status(500).json({ error: message });
  }
});

export default router;
