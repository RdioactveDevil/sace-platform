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

/**
 * Count a curriculum's bank the way the Question Bank loads it: questions
 * linked by curriculum_id, plus any still-unlinked rows whose subject spelling
 * matches. Spelling alone would count a bare "Chemistry" bank towards every
 * stage of Chemistry.
 */
async function countForCurriculum(
  admin: SupabaseClient,
  curriculumId: string,
  aliases: string[],
): Promise<{ live: number; pendingDrafts: number }> {
  const head = { count: "exact" as const, head: true };
  const [linked, unlinked, linkedDrafts, unlinkedDrafts] = await Promise.all([
    admin.from("questions").select("*", head).eq("curriculum_id", curriculumId),
    admin.from("questions").select("*", head).is("curriculum_id", null).in("subject", aliases),
    admin.from("draft_questions").select("*", head).eq("curriculum_id", curriculumId).eq("status", "pending"),
    admin.from("draft_questions").select("*", head).is("curriculum_id", null).in("subject", aliases).eq("status", "pending"),
  ]);
  const err = linked.error || unlinked.error || linkedDrafts.error || unlinkedDrafts.error;
  if (err) throw new Error(err.message);
  return {
    live: (linked.count ?? 0) + (unlinked.count ?? 0),
    pendingDrafts: (linkedDrafts.count ?? 0) + (unlinkedDrafts.count ?? 0),
  };
}

type InItem = string | { name?: string; subject?: string; levelLabel?: string; curriculumId?: string };

function normItem(raw: InItem): { key: string; level: string; curriculumId: string } {
  if (typeof raw === "string") return { key: raw.trim(), level: "", curriculumId: "" };
  const key = String(raw.name ?? raw.subject ?? "").trim();
  const level = String(raw.levelLabel ?? "").trim();
  return { key, level, curriculumId: String(raw.curriculumId ?? "").trim() };
}

// POST /api/subject-question-counts
// Body: { subjects: Array<string | { name?: string, subject?: string, levelLabel?: string, curriculumId?: string }> }
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
      normalized.map(async ({ key, level, curriculumId }) => {
        const aliases = expandCurriculumRenameSources(key, level);
        const { live, pendingDrafts } = curriculumId
          ? await countForCurriculum(admin, curriculumId, aliases)
          : await countForAliases(admin, aliases);
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

// GET /api/public-subjects
// The live subject catalogue for signed-out pages (landing, pricing). The
// curricula table is only readable when signed in, so this reads it with the
// service key and returns names and levels only.
// Returns: { subjects: Array<{ id: string, name: string, level: string }> } (id: for /start checkout)
router.get("/public-subjects", async (_req, res) => {
  try {
    const admin = getAdmin();
    const { data, error } = await admin
      .from("curricula")
      .select("id, name, level_label")
      .eq("status", "live")
      .is("archived_at", null)
      .order("name");
    if (error) throw new Error(error.message);
    const subjects = (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string, level: (c.level_label as string) || "" }));
    res.set("Cache-Control", "public, max-age=300, s-maxage=300");
    res.json({ subjects });
  } catch (err) {
    logger.error({ err }, "public-subjects failed");
    res.status(500).json({ error: "Could not load subjects" });
  }
});

export default router;
