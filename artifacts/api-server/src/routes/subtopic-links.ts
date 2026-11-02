import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL, CLAUDE_THINKING } from "../lib/anthropic-model";
import { logger } from "../lib/logger";
import { requireAdmin } from "../lib/auth";

// Sharing questions between subjects, a subtopic at a time
// (supabase/migrations/20261102000000_subtopic_links.sql). From a subject's
// editor an admin picks another subject to borrow from, matches each of this
// subject's subtopics to one of its subtopics (AI can suggest the matches),
// and saves. Students of this subject then also get those questions, filed
// under this subject's subtopics (gradefarm lib/db.js).
//
//   POST /admin/subtopic-links/state    { curriculumId }                       -> this subject's subtopics, its links, other subjects
//   POST /admin/subtopic-links/source   { curriculumId }                       -> a subject's subtopics with question counts
//   POST /admin/subtopic-links/suggest  { curriculumId, sourceCurriculumId }   -> AI's matches
//   POST /admin/subtopic-links/save     { curriculumId, sourceCurriculumId, links: [{ subtopicId, sourceSubtopicId | null }] }

const router = Router();
const PAGE = 1000;

type Sub = { id: string; name: string; topic: string };

async function subtopicsOf(admin: SupabaseClient, curriculumId: string): Promise<Sub[]> {
  const { data, error } = await admin
    .from("curriculum_subtopics")
    .select("id, name, order_index, topic:curriculum_topics(name, order_index)")
    .eq("curriculum_id", curriculumId);
  if (error) throw new Error(error.message);
  type Row = { id: string; name: string; order_index: number | null; topic: { name: string; order_index: number | null } | { name: string; order_index: number | null }[] | null };
  return ((data || []) as Row[])
    .map((r) => {
      const t = Array.isArray(r.topic) ? r.topic[0] : r.topic;
      return { id: r.id, name: r.name, topic: t?.name || "", o: [t?.order_index ?? 0, r.order_index ?? 0] as const };
    })
    .sort((a, b) => a.o[0] - b.o[0] || a.o[1] - b.o[1])
    .map(({ id, name, topic }) => ({ id, name, topic }));
}

/** Questions per subtopic for a curriculum's subtopics. */
async function questionCounts(admin: SupabaseClient, subtopicIds: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (let i = 0; i < subtopicIds.length; i += 100) {
    const part = subtopicIds.slice(i, i + 100);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin.from("questions").select("subtopic_id").in("subtopic_id", part).order("id").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const r of data || []) {
        const k = (r as { subtopic_id: string }).subtopic_id;
        counts[k] = (counts[k] || 0) + 1;
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return counts;
}

async function curriculumExists(admin: SupabaseClient, id: unknown): Promise<{ id: string; name: string; level_label: string } | null> {
  if (typeof id !== "string" || !id) return null;
  const { data, error } = await admin.from("curricula").select("id, name, level_label").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; name: string; level_label: string } | null;
}

const fail = (res: any, code: number, error: string) => res.status(code).json({ error });

router.post("/admin/subtopic-links/state", async (req, res) => {
  const caller = await requireAdmin(req, res);
  if (!caller) return;
  try {
    const admin = caller.admin;
    const cur = await curriculumExists(admin, req.body?.curriculumId);
    if (!cur) return fail(res, 404, "That subject doesn't exist any more.");
    const subtopics = await subtopicsOf(admin, cur.id);
    const { data: links, error: lErr } = subtopics.length
      ? await admin.from("subtopic_links").select("subtopic_id, source_subtopic_id").in("subtopic_id", subtopics.map((s) => s.id))
      : { data: [], error: null };
    if (lErr) throw new Error(lErr.message);
    const sourceIds = [...new Set((links || []).map((l) => l.source_subtopic_id as string))];
    const { data: srcRows, error: sErr } = sourceIds.length
      ? await admin.from("curriculum_subtopics").select("id, curriculum_id").in("id", sourceIds)
      : { data: [], error: null };
    if (sErr) throw new Error(sErr.message);
    const srcCurriculum = Object.fromEntries((srcRows || []).map((r) => [r.id as string, r.curriculum_id as string]));
    const { data: others, error: oErr } = await admin
      .from("curricula").select("id, name, level_label, archived_at").neq("id", cur.id).order("name");
    if (oErr) throw new Error(oErr.message);
    return res.json({
      subtopics,
      links: (links || []).map((l) => ({ subtopicId: l.subtopic_id, sourceSubtopicId: l.source_subtopic_id, sourceCurriculumId: srcCurriculum[l.source_subtopic_id as string] || null })),
      subjects: (others || []).map((o) => ({ id: o.id, name: o.name, level: (o.level_label || "").trim(), archived: !!o.archived_at })),
    });
  } catch (err) {
    logger.error({ err }, "subtopic-links state failed");
    return fail(res, 500, err instanceof Error ? err.message : "Failed");
  }
});

router.post("/admin/subtopic-links/source", async (req, res) => {
  const caller = await requireAdmin(req, res);
  if (!caller) return;
  try {
    const cur = await curriculumExists(caller.admin, req.body?.curriculumId);
    if (!cur) return fail(res, 404, "That subject doesn't exist any more.");
    const subtopics = await subtopicsOf(caller.admin, cur.id);
    const counts = await questionCounts(caller.admin, subtopics.map((s) => s.id));
    return res.json({ subtopics: subtopics.map((s) => ({ ...s, questions: counts[s.id] || 0 })) });
  } catch (err) {
    logger.error({ err }, "subtopic-links source failed");
    return fail(res, 500, err instanceof Error ? err.message : "Failed");
  }
});

router.post("/admin/subtopic-links/suggest", async (req, res) => {
  const caller = await requireAdmin(req, res);
  if (!caller) return;
  try {
    const admin = caller.admin;
    const [cur, src] = await Promise.all([curriculumExists(admin, req.body?.curriculumId), curriculumExists(admin, req.body?.sourceCurriculumId)]);
    if (!cur || !src) return fail(res, 404, "Pick two subjects that still exist.");
    if (cur.id === src.id) return fail(res, 400, "Pick a different subject to borrow from.");
    const [mine, theirs] = await Promise.all([subtopicsOf(admin, cur.id), subtopicsOf(admin, src.id)]);
    if (!mine.length || !theirs.length) return res.json({ matches: [] });

    // Short keys keep the prompt small and the answer easy to check.
    const tKey = new Map(mine.map((s, i) => [`t${i}`, s.id]));
    const sKey = new Map(theirs.map((s, i) => [`s${i}`, s.id]));
    const list = (subs: Sub[], p: string) => subs.map((s, i) => `${p}${i}: ${s.topic} > ${s.name}`).join("\n");
    const system = [
      "You match subtopics between two school maths or science courses so one can reuse the other's practice questions.",
      "Return ONLY a JSON array, no commentary: [{\"t\": \"t0\", \"s\": \"s3\"}, ...] with one entry per target subtopic.",
      "Use \"s\": null when no source subtopic teaches the same skills at the same level. Only match when a student practising the source subtopic's questions would be practising the target subtopic.",
    ].join("\n");
    const user = `Target subject: ${cur.name} (${cur.level_label || "no level"})\n${list(mine, "t")}\n\nSource subject: ${src.name} (${src.level_label || "no level"})\n${list(theirs, "s")}`;

    const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
    const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
    const r = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: CLAUDE_MODEL, thinking: CLAUDE_THINKING, max_tokens: 8000, system, messages: [{ role: "user", content: user }] }),
    });
    if (!r.ok) return fail(res, 502, `The AI couldn't suggest matches just now (${r.status}). Try again, or match them by hand.`);
    const body = (await r.json()) as { content?: { type: string; text?: string }[] };
    const text = (body.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("");
    const start = text.indexOf("["), end = text.lastIndexOf("]");
    let parsed: { t?: string; s?: string | null }[] = [];
    try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { /* handled below */ }
    if (!Array.isArray(parsed)) parsed = [];
    const matches = parsed
      .map((m) => ({ subtopicId: tKey.get(String(m.t)), sourceSubtopicId: m.s ? sKey.get(String(m.s)) ?? null : null }))
      .filter((m): m is { subtopicId: string; sourceSubtopicId: string | null } => !!m.subtopicId);
    if (!matches.length) return fail(res, 502, "The AI's answer couldn't be read. Try again, or match them by hand.");
    return res.json({ matches });
  } catch (err) {
    logger.error({ err }, "subtopic-links suggest failed");
    return fail(res, 500, err instanceof Error ? err.message : "Failed");
  }
});

router.post("/admin/subtopic-links/save", async (req, res) => {
  const caller = await requireAdmin(req, res);
  if (!caller) return;
  try {
    const admin = caller.admin;
    const [cur, src] = await Promise.all([curriculumExists(admin, req.body?.curriculumId), curriculumExists(admin, req.body?.sourceCurriculumId)]);
    if (!cur || !src) return fail(res, 404, "Pick two subjects that still exist.");
    if (cur.id === src.id) return fail(res, 400, "A subject can't borrow from itself.");
    const input = Array.isArray(req.body?.links) ? req.body.links : null;
    if (!input) return fail(res, 400, "Send the matches as links: [{ subtopicId, sourceSubtopicId }].");

    const [mine, theirs] = await Promise.all([subtopicsOf(admin, cur.id), subtopicsOf(admin, src.id)]);
    const mineIds = new Set(mine.map((s) => s.id)), theirIds = new Set(theirs.map((s) => s.id));
    const rows: { subtopic_id: string; source_subtopic_id: string }[] = [];
    for (const l of input as { subtopicId?: unknown; sourceSubtopicId?: unknown }[]) {
      if (typeof l?.subtopicId !== "string" || !mineIds.has(l.subtopicId)) return fail(res, 400, "One of the subtopics isn't in this subject any more. Reload and try again.");
      if (l.sourceSubtopicId == null || l.sourceSubtopicId === "") continue;
      if (typeof l.sourceSubtopicId !== "string" || !theirIds.has(l.sourceSubtopicId)) return fail(res, 400, `One of the matches isn't in ${src.name} any more. Reload and try again.`);
      rows.push({ subtopic_id: l.subtopicId, source_subtopic_id: l.sourceSubtopicId });
    }

    // Replace this subject's links to the source subject; links to other subjects stay.
    if (mine.length && theirs.length) {
      const theirList = [...theirIds];
      for (let i = 0; i < theirList.length; i += 100) {
        const { error } = await admin.from("subtopic_links").delete()
          .in("subtopic_id", [...mineIds]).in("source_subtopic_id", theirList.slice(i, i + 100));
        if (error) throw new Error(error.message);
      }
    }
    if (rows.length) {
      const { error } = await admin.from("subtopic_links").insert(rows);
      if (error) throw new Error(error.message);
    }
    logger.info({ curriculumId: cur.id, sourceCurriculumId: src.id, links: rows.length, by: caller.userId }, "subtopic links saved");
    return res.json({ ok: true, links: rows.length });
  } catch (err) {
    logger.error({ err }, "subtopic-links save failed");
    return fail(res, 500, err instanceof Error ? err.message : "Failed");
  }
});

export default router;
