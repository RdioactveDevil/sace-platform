import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";
import { requireAdmin } from "../lib/auth";

// Deleting a subject (curriculum) with everything in it.
//
// The plain Delete in Admin removes the curriculum row only: its topics,
// subtopics and resources go (cascade) but its questions stay, detached
// (questions.curriculum_id is ON DELETE SET NULL). Detached questions are
// still picked up by any subject with the same name (lib/db.js
// getQuestionsForSubjectTile), so a remade subject would get them back.
//
// This deletes the lot: its questions and drafts, their passages, students'
// answers and review history for those questions, reports on them, its
// uploaded files, and the non-paying access rows (free, beta, admin and tutor
// grants) for it. It refuses while anyone has an active paid subscription to
// it. Stripe's own billing records are left as they are.
//
//   POST /admin/curriculum-delete-preview { curriculumId }  -> what would go
//   POST /admin/curriculum-delete { curriculumId, confirmName } -> deletes it

const router = Router();
const RESOURCES_BUCKET = "curriculum-resources";
const CHUNK = 200;
const PAGE = 1000;

type Curriculum = { id: string; name: string };

const chunks = <T,>(list: T[], size = CHUNK) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

async function loadCurriculum(admin: SupabaseClient, id: unknown): Promise<Curriculum | null> {
  if (typeof id !== "string" || !id) return null;
  const { data, error } = await admin.from("curricula").select("id, name").eq("id", id).maybeSingle<Curriculum>();
  if (error) throw new Error(error.message);
  return data;
}

/** Whether another subject has the same name, in which case loose questions and access rows by name are theirs too. */
async function nameShared(admin: SupabaseClient, cur: Curriculum): Promise<boolean> {
  const { count, error } = await admin.from("curricula").select("id", { count: "exact", head: true }).eq("name", cur.name).neq("id", cur.id);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/** Every page of ids a query returns. */
async function allIds(build: () => any): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of data || []) ids.push(String(r.id));
    if (!data || data.length < PAGE) break;
  }
  return ids;
}

/** The subject's questions: linked to it, plus loose ones under its name (unless another subject shares the name). */
async function questionIds(admin: SupabaseClient, cur: Curriculum, shared: boolean): Promise<string[]> {
  const linked = await allIds(() => admin.from("questions").select("id").eq("curriculum_id", cur.id).order("id"));
  const loose = shared ? [] : await allIds(() => admin.from("questions").select("id").is("curriculum_id", null).eq("subject", cur.name).order("id"));
  return [...new Set([...linked, ...loose])];
}

async function countIn(admin: SupabaseClient, table: string, column: string, ids: string[]): Promise<number> {
  let total = 0;
  for (const part of chunks(ids)) {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).in(column, part);
    if (error) throw new Error(`${table}: ${error.message}`);
    total += count ?? 0;
  }
  return total;
}

async function studentsWithHistory(admin: SupabaseClient, ids: string[]): Promise<number> {
  const users = new Set<string>();
  for (const part of chunks(ids)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin.from("struggle_profiles").select("user_id").in("question_id", part).range(from, from + PAGE - 1);
      if (error) throw new Error(`struggle_profiles: ${error.message}`);
      for (const r of data || []) users.add(String((r as { user_id: string }).user_id));
      if (!data || data.length < PAGE) break;
    }
  }
  return users.size;
}

async function countEq(admin: SupabaseClient, table: string, column: string, value: string): Promise<number> {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(column, value);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function accessRows(admin: SupabaseClient, cur: Curriculum, shared: boolean) {
  if (shared) return { paid: 0, other: 0 };
  const { data, error } = await admin.from("user_subscriptions").select("source, active").eq("subject_name", cur.name);
  if (error) throw new Error(`user_subscriptions: ${error.message}`);
  const rows = (data || []) as { source: string | null; active: boolean | null }[];
  return {
    paid: rows.filter(r => r.source === "stripe" && r.active).length,
    other: rows.filter(r => r.source !== "stripe").length,
  };
}

/** Other subjects whose subtopics borrow this one's questions (subtopic_links), with how many subtopics each. */
async function borrowedBy(admin: SupabaseClient, cur: Curriculum): Promise<{ name: string; subtopics: number }[]> {
  const { data: subs, error } = await admin.from("curriculum_subtopics").select("id").eq("curriculum_id", cur.id);
  if (error || !subs?.length) return [];
  const ids = subs.map(r => String(r.id));
  const targets: string[] = [];
  for (const part of chunks(ids)) {
    const { data, error: lErr } = await admin.from("subtopic_links").select("subtopic_id").in("source_subtopic_id", part);
    if (lErr) return [];
    for (const l of data || []) targets.push(String((l as { subtopic_id: string }).subtopic_id));
  }
  if (!targets.length) return [];
  const byName = new Map<string, number>();
  for (const part of chunks([...new Set(targets)])) {
    const { data } = await admin.from("curriculum_subtopics").select("id, curricula(name)").in("id", part);
    for (const r of (data || []) as { curricula: { name: string } | { name: string }[] | null }[]) {
      const c = Array.isArray(r.curricula) ? r.curricula[0] : r.curricula;
      if (c?.name && c.name !== cur.name) byName.set(c.name, (byName.get(c.name) || 0) + 1);
    }
  }
  return [...byName].map(([name, subtopics]) => ({ name, subtopics }));
}

async function preview(admin: SupabaseClient, cur: Curriculum) {
  const shared = await nameShared(admin, cur);
  const ids = await questionIds(admin, cur, shared);
  const [answers, students, drafts, passages, resources, access, sharedWith] = await Promise.all([
    countIn(admin, "struggle_profiles", "question_id", ids),
    studentsWithHistory(admin, ids),
    countEq(admin, "draft_questions", "curriculum_id", cur.id),
    countEq(admin, "passages", "curriculum_id", cur.id),
    countEq(admin, "curriculum_resources", "curriculum_id", cur.id),
    accessRows(admin, cur, shared),
    borrowedBy(admin, cur),
  ]);
  return { name: cur.name, questions: ids.length, drafts, passages, resources, students, answers, paidSubscriptions: access.paid, accessRows: access.other, sharedWith, ids };
}

router.post("/admin/curriculum-delete-preview", async (req, res) => {
  const caller = await requireAdmin(req, res);
  if (!caller) return;
  try {
    const cur = await loadCurriculum(caller.admin, req.body?.curriculumId);
    if (!cur) return res.status(404).json({ error: "That subject doesn't exist any more." });
    const { ids: _ids, ...counts } = await preview(caller.admin, cur);
    return res.json(counts);
  } catch (err) {
    logger.error({ err }, "curriculum-delete-preview failed");
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

router.post("/admin/curriculum-delete", async (req, res) => {
  const caller = await requireAdmin(req, res);
  if (!caller) return;
  const admin = caller.admin;
  try {
    const cur = await loadCurriculum(admin, req.body?.curriculumId);
    if (!cur) return res.status(404).json({ error: "That subject doesn't exist any more." });
    if (typeof req.body?.confirmName !== "string" || req.body.confirmName.trim() !== cur.name) {
      return res.status(400).json({ error: `Type the subject's name exactly ("${cur.name}") to delete it.` });
    }
    const shared = await nameShared(admin, cur);
    const plan = await preview(admin, cur);
    if (plan.paidSubscriptions > 0) {
      return res.status(409).json({ error: `${plan.paidSubscriptions} student${plan.paidSubscriptions === 1 ? " pays" : "s pay"} for this subject. Cancel their subscription${plan.paidSubscriptions === 1 ? "" : "s"} first (Admin → Students), then delete it.` });
    }

    const step = async (label: string, run: () => PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await run();
      if (error) throw new Error(`${label}: ${error.message}`);
    };

    // Students' answers and reports on these questions. (Review history,
    // flags and variants go with the questions themselves, by cascade.)
    for (const part of chunks(plan.ids)) {
      await step("answer_log", () => admin.from("answer_log").delete().in("question_id", part));
      await step("question_reports", () => admin.from("question_reports").delete().in("question_id", part));
    }
    await step("draft_questions", () => admin.from("draft_questions").delete().eq("curriculum_id", cur.id));
    for (const part of chunks(plan.ids)) {
      await step("questions", () => admin.from("questions").delete().in("id", part));
    }
    await step("passages", () => admin.from("passages").delete().eq("curriculum_id", cur.id));

    // Uploaded files (their rows go with the curriculum, by cascade).
    const { data: files, error: fErr } = await admin.from("curriculum_resources").select("storage_path").eq("curriculum_id", cur.id);
    if (fErr) throw new Error(`curriculum_resources: ${fErr.message}`);
    const paths = (files || []).map(f => (f as { storage_path: string | null }).storage_path).filter((p): p is string => !!p);
    for (const part of chunks(paths, 100)) await admin.storage.from(RESOURCES_BUCKET).remove(part).catch(() => {});

    if (!shared) {
      await step("user_subscriptions", () => admin.from("user_subscriptions").delete().eq("subject_name", cur.name).neq("source", "stripe"));
      await step("tutor_student_subjects", () => admin.from("tutor_student_subjects").delete().eq("subject_name", cur.name));
    }
    // Topics, subtopics, resources, exemplars and diagnostics go by cascade.
    await step("curricula", () => admin.from("curricula").delete().eq("id", cur.id));

    logger.info({ curriculumId: cur.id, name: cur.name, questions: plan.ids.length, by: caller.userId }, "curriculum deleted with all data");
    const { ids: _ids, ...counts } = plan;
    return res.json({ ok: true, deleted: counts });
  } catch (err) {
    logger.error({ err }, "curriculum-delete failed");
    return res.status(500).json({ error: `${err instanceof Error ? err.message : "Failed"}. Some of it may already be gone; run Delete again to finish.` });
  }
});

export default router;
