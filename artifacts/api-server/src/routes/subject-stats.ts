import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

function getAdmin(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("No SUPABASE_SERVICE_KEY configured");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

/**
 * Alternate `questions.subject` / `draft_questions.subject` spellings for the same bank
 * (rename migrations, SACE ordering, "Year N Title" vs "Title Year N").
 */
export function subjectCountCandidates(primary: string): string[] {
  const s = primary.trim();
  if (!s) return [];
  const out = new Set<string>([s]);

  const sace = s.match(/^SACE\s+Stage\s*([12])\s+(.+)$/i);
  if (sace) {
    const n = sace[1];
    const title = sace[2].trim();
    const st = `Stage ${n}`;
    out.add(`${title} ${st}`);
    out.add(`${st} ${title}`);
  }

  const stageAtEnd = s.match(/^(.+?)\s+Stage\s*([12])\s*$/i);
  if (stageAtEnd) {
    const title = stageAtEnd[1].trim();
    const n = stageAtEnd[2];
    const st = `Stage ${n}`;
    out.add(`${st} ${title}`);
    out.add(`SACE ${st} ${title}`);
    out.add(`SACE Stage ${n} ${title}`);
  }

  const stageAtStart = s.match(/^Stage\s*([12])\s+(.+)$/i);
  if (stageAtStart) {
    const n = stageAtStart[1];
    const title = stageAtStart[2].trim();
    const st = `Stage ${n}`;
    out.add(`${title} ${st}`);
    out.add(`SACE ${st} ${title}`);
  }

  const yearFirst = s.match(/^Year\s*(\d{1,2})\s+(.+)$/i);
  if (yearFirst) {
    const year = yearFirst[1];
    const rest = yearFirst[2].trim();
    out.add(`${rest} Year ${year}`);
  }

  const yearLast = s.match(/^(.+?)\s+Year\s*(\d{1,2})\s*$/i);
  if (yearLast) {
    const rest = yearLast[1].trim();
    const year = yearLast[2];
    out.add(`Year ${year} ${rest}`);
  }

  return [...out].filter((x) => x.length > 0);
}

async function countForAliases(
  admin: SupabaseClient,
  aliases: string[],
): Promise<{ live: number; pendingDrafts: number }> {
  const { count: live, error: qErr } = await admin
    .from("questions")
    .select("*", { count: "exact", head: true })
    .in("subject", aliases);
  if (qErr) throw new Error(qErr.message);

  const { count: pendingDrafts, error: dErr } = await admin
    .from("draft_questions")
    .select("*", { count: "exact", head: true })
    .in("subject", aliases)
    .eq("status", "pending");
  if (dErr) throw new Error(dErr.message);

  return { live: live ?? 0, pendingDrafts: pendingDrafts ?? 0 };
}

// POST /api/subject-question-counts
// Body: { subjects: string[] }
// Returns: { counts: Record<string, number> } — live `questions` + pending `draft_questions` per subject label (keyed by requested string).
router.post("/subject-question-counts", async (req, res) => {
  const { subjects } = req.body || {};
  if (!Array.isArray(subjects)) {
    res.status(400).json({ error: "subjects array required" });
    return;
  }

  const list = subjects.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);
  if (list.length === 0) {
    res.json({ counts: {} });
    return;
  }

  try {
    const admin = getAdmin();
    const counts: Record<string, number> = {};
    for (const key of list) {
      const aliases = subjectCountCandidates(key);
      const { live, pendingDrafts } = await countForAliases(admin, aliases);
      counts[key] = live + pendingDrafts;
    }
    res.json({ counts });
  } catch (err) {
    logger.error({ err }, "subject-question-counts failed");
    const message = err instanceof Error ? err.message : "Count failed";
    res.status(500).json({ error: message });
  }
});

export default router;
