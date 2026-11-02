import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";
import { requireAdmin, requireUser } from "../lib/auth";
import { loadCurriculumDoc } from "./curriculum";
import { checkScope, extractScope, scopesForCurriculum, type Scope, type ScopeItem } from "../lib/course-scope";

// Keeping a subject's questions on its course (lib/course-scope.ts).
//
// Admin, from a subject's editor:
//   POST /admin/course-scope/state    { curriculumId }                                  -> out-of-scope list and each subtopic's scope
//   POST /admin/course-scope/extract  { curriculumId, docStoragePath? | sourceText? }  -> AI's draft scope from the course document (not saved)
//   POST /admin/course-scope/save     { curriculumId, outOfScope, subtopics: [{ id, scope }] }
//   POST /admin/course-scope/audit    { curriculumId, restart? }                        -> checks the next batch of the bank; call until remaining is 0
//   POST /admin/course-scope/review   { curriculumId }                                  -> questions found off the course, or reported
//   POST /admin/course-scope/resolve  { curriculumId, questionId, action: keep | hide | delete }
// Students:
//   POST /report-off-course           { questionId, curriculumId }                      -> "Not in my course"
//
// The audit covers the subject's own questions and the ones it borrows
// (subtopic_links), each checked against the subtopic it's filed under here.
// A borrowed question found off the course is hidden from this subject at
// once (it stays in the subject it belongs to); the subject's own questions
// wait for an admin to delete, hide or keep them.

const router = Router();
const PAGE = 1000;
const AUDIT_BATCH = 24;

const fail = (res: any, code: number, error: string) => res.status(code).json({ error });
const chunks = <T,>(list: T[], size = 200) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

async function curriculum(admin: SupabaseClient, id: unknown) {
  if (typeof id !== "string" || !id) return null;
  const { data, error } = await admin.from("curricula").select("id, name, level_label, out_of_scope").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; name: string; level_label: string | null; out_of_scope: string | null } | null;
}

async function pages<T>(build: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function subtopicTree(admin: SupabaseClient, curriculumId: string) {
  const { data, error } = await admin
    .from("curriculum_subtopics")
    .select("id, name, scope, order_index, topic:curriculum_topics(name, order_index)")
    .eq("curriculum_id", curriculumId);
  if (error) throw new Error(error.message);
  type Row = { id: string; name: string; scope: string | null; order_index: number | null; topic: { name: string; order_index: number | null } | { name: string; order_index: number | null }[] | null };
  return ((data || []) as Row[])
    .map((r) => { const t = Array.isArray(r.topic) ? r.topic[0] : r.topic; return { id: r.id, name: r.name, topic: t?.name || "", scope: r.scope || "", o: [t?.order_index ?? 0, r.order_index ?? 0] }; })
    .sort((a, b) => a.o[0] - b.o[0] || a.o[1] - b.o[1])
    .map(({ o: _o, ...rest }) => rest);
}

// ── scope: read, draft from the course document, save ─────────────────────────

router.post("/admin/course-scope/state", async (req, res) => {
  const caller = await requireAdmin(req, res);
  if (!caller) return;
  try {
    const cur = await curriculum(caller.admin, req.body?.curriculumId);
    if (!cur) return fail(res, 404, "That subject doesn't exist any more.");
    return res.json({ outOfScope: cur.out_of_scope || "", subtopics: await subtopicTree(caller.admin, cur.id) });
  } catch (err) {
    logger.error({ err }, "course-scope state failed");
    return fail(res, 500, err instanceof Error ? err.message : "Failed");
  }
});

router.post("/admin/course-scope/extract", async (req, res) => {
  const caller = await requireAdmin(req, res);
  if (!caller) return;
  try {
    const cur = await curriculum(caller.admin, req.body?.curriculumId);
    if (!cur) return fail(res, 404, "That subject doesn't exist any more.");
    const { docStoragePath, sourceText } = req.body || {};
    let docBase64: string | undefined;
    if (docStoragePath) {
      const doc = await loadCurriculumDoc(docStoragePath);
      if (!doc.base64) return fail(res, 400, doc.error || "Couldn't read that document.");
      docBase64 = doc.base64;
    } else if (typeof sourceText !== "string" || !sourceText.trim()) {
      return fail(res, 400, "Upload the course document (a PDF) or paste its text.");
    }
    const tree = await subtopicTree(caller.admin, cur.id);
    if (!tree.length) return fail(res, 400, "Add topics and subtopics to this subject first.");
    const draft = await extractScope({ subject: cur.name, level: (cur.level_label || "").trim(), subtopics: tree, docBase64, sourceText });
    return res.json(draft);
  } catch (err) {
    logger.error({ err }, "course-scope extract failed");
    return fail(res, 500, err instanceof Error ? err.message : "Failed");
  }
});

router.post("/admin/course-scope/save", async (req, res) => {
  const caller = await requireAdmin(req, res);
  if (!caller) return;
  try {
    const admin = caller.admin;
    const cur = await curriculum(admin, req.body?.curriculumId);
    if (!cur) return fail(res, 404, "That subject doesn't exist any more.");
    const outOfScope = typeof req.body?.outOfScope === "string" ? req.body.outOfScope.trim().slice(0, 6000) : "";
    const subs = Array.isArray(req.body?.subtopics) ? req.body.subtopics as { id?: unknown; scope?: unknown }[] : [];
    const tree = await subtopicTree(admin, cur.id);
    const ours = new Map(tree.map((s) => [s.id, s.scope]));
    const { error } = await admin.from("curricula").update({ out_of_scope: outOfScope }).eq("id", cur.id);
    if (error) throw new Error(error.message);
    let changed = 0;
    for (const s of subs) {
      if (typeof s?.id !== "string" || !ours.has(s.id)) continue;
      const scope = typeof s.scope === "string" ? s.scope.trim().slice(0, 3000) : "";
      if (scope === (ours.get(s.id) || "").trim()) continue;
      const { error: uErr } = await admin.from("curriculum_subtopics").update({ scope }).eq("id", s.id);
      if (uErr) throw new Error(uErr.message);
      changed++;
    }
    return res.json({ ok: true, changed });
  } catch (err) {
    logger.error({ err }, "course-scope save failed");
    return fail(res, 500, err instanceof Error ? err.message : "Failed");
  }
});

// ── audit the bank ────────────────────────────────────────────────────────────

type Item = { id: string; subtopicId: string | null; borrowed: boolean };

/** The subject's own questions plus the ones it borrows, each with the subtopic it's filed under here. */
async function bankItems(admin: SupabaseClient, curriculumId: string, subtopicIds: string[]): Promise<Item[]> {
  const own = await pages<{ id: string; subtopic_id: string | null }>(() =>
    admin.from("questions").select("id, subtopic_id").eq("curriculum_id", curriculumId).order("id"));
  const items: Item[] = own.map((q) => ({ id: q.id, subtopicId: q.subtopic_id, borrowed: false }));
  if (!subtopicIds.length) return items;
  const links: { subtopic_id: string; source_subtopic_id: string }[] = [];
  for (const part of chunks(subtopicIds)) {
    const { data, error } = await admin.from("subtopic_links").select("subtopic_id, source_subtopic_id").in("subtopic_id", part);
    if (error) throw new Error(error.message);
    links.push(...((data || []) as typeof links));
  }
  const order = new Map(subtopicIds.map((id, i) => [id, i]));
  const home = new Map<string, string>();
  for (const l of [...links].sort((a, b) => (order.get(a.subtopic_id) ?? 0) - (order.get(b.subtopic_id) ?? 0))) {
    if (!home.has(l.source_subtopic_id)) home.set(l.source_subtopic_id, l.subtopic_id);
  }
  const seen = new Set(items.map((i) => i.id));
  for (const part of chunks([...home.keys()], 100)) {
    const rows = await pages<{ id: string; subtopic_id: string }>(() =>
      admin.from("questions").select("id, subtopic_id").in("subtopic_id", part).order("id"));
    for (const q of rows) if (!seen.has(q.id)) { seen.add(q.id); items.push({ id: q.id, subtopicId: home.get(q.subtopic_id) || null, borrowed: true }); }
  }
  return items;
}

router.post("/admin/course-scope/audit", async (req, res) => {
  const caller = await requireAdmin(req, res);
  if (!caller) return;
  const admin = caller.admin;
  try {
    const cur = await curriculum(admin, req.body?.curriculumId);
    if (!cur) return fail(res, 404, "That subject doesn't exist any more.");
    const scopes = await scopesForCurriculum(admin, cur.id);
    if (!scopes || (!scopes.outOfScope && ![...scopes.bySubtopic.values()].some((s) => s.scope))) {
      return fail(res, 400, "Write the course scope first (above), so there's something to check the questions against.");
    }
    if (req.body?.restart) {
      const { error } = await admin.from("question_scope_checks").delete().eq("curriculum_id", cur.id).eq("source", "audit").is("resolution", null);
      if (error) throw new Error(error.message);
    }
    const items = await bankItems(admin, cur.id, [...scopes.bySubtopic.keys()]);
    const done = new Set((await pages<{ question_id: string }>(() =>
      admin.from("question_scope_checks").select("question_id").eq("curriculum_id", cur.id).order("question_id"))).map((r) => r.question_id));
    const todo = items.filter((i) => !done.has(i.id));
    const batch = todo.slice(0, AUDIT_BATCH);

    let saved = 0, offNow = 0, hiddenNow = 0;
    if (batch.length) {
      const { data: rows, error } = await admin.from("questions").select("id, question, options, solution, topic, subtopic").in("id", batch.map((b) => b.id));
      if (error) throw new Error(error.message);
      const byId = new Map((rows || []).map((r) => [r.id as string, r]));
      const general = (q: { topic?: string; subtopic?: string }): Scope => ({ subject: scopes.subject, level: scopes.level, outOfScope: scopes.outOfScope, topic: q.topic || "", subtopic: q.subtopic || "", scope: "" });
      const work = batch.filter((b) => byId.has(b.id));
      const checkItems: ScopeItem[] = work.map((b) => {
        const q = byId.get(b.id)!;
        const options = typeof q.options === "string" ? (() => { try { return JSON.parse(q.options); } catch { return null; } })() : q.options;
        return { question: q.question, options: Array.isArray(options) ? options.map(String) : null, solution: q.solution, scope: (b.subtopicId && scopes.bySubtopic.get(b.subtopicId)) || general(q) };
      });
      const verdicts = await checkScope(checkItems);
      const upserts: Record<string, unknown>[] = [];
      const hides: Record<string, unknown>[] = [];
      work.forEach((b, k) => {
        const v = verdicts[k];
        if (v.errored) return; // checked again on the next call
        const out = !v.inScope;
        const hide = out && b.borrowed;
        upserts.push({ curriculum_id: cur.id, question_id: b.id, verdict: out ? "out" : "in", reason: v.reason || "", source: "audit", resolution: hide ? "hidden" : null, checked_at: new Date().toISOString() });
        if (hide) hides.push({ curriculum_id: cur.id, question_id: b.id, reason: v.reason || "Not in this course." });
        if (out) offNow++;
        if (hide) hiddenNow++;
      });
      if (upserts.length) {
        const { error: uErr } = await admin.from("question_scope_checks").upsert(upserts, { onConflict: "curriculum_id,question_id" });
        if (uErr) throw new Error(uErr.message);
        saved = upserts.length;
      }
      if (hides.length) {
        const { error: hErr } = await admin.from("curriculum_hidden_questions").upsert(hides, { onConflict: "curriculum_id,question_id" });
        if (hErr) throw new Error(hErr.message);
      }
      // A whole batch that errored means the AI isn't answering: stop rather than loop.
      if (!saved && work.length) return fail(res, 502, "The course check isn't answering just now. Try again in a minute.");
    }
    const { count: open } = await admin.from("question_scope_checks").select("*", { count: "exact", head: true })
      .eq("curriculum_id", cur.id).neq("verdict", "in").is("resolution", null);
    return res.json({ total: items.length, checked: items.length - todo.length + saved, remaining: Math.max(0, todo.length - saved), offNow, hiddenNow, open: open ?? 0 });
  } catch (err) {
    logger.error({ err }, "course-scope audit failed");
    return fail(res, 500, err instanceof Error ? err.message : "Failed");
  }
});

// ── review what was found ─────────────────────────────────────────────────────

router.post("/admin/course-scope/review", async (req, res) => {
  const caller = await requireAdmin(req, res);
  if (!caller) return;
  const admin = caller.admin;
  try {
    const cur = await curriculum(admin, req.body?.curriculumId);
    if (!cur) return fail(res, 404, "That subject doesn't exist any more.");
    const { data: checks, error } = await admin.from("question_scope_checks")
      .select("question_id, verdict, reason, source, resolution, checked_at")
      .eq("curriculum_id", cur.id).neq("verdict", "in").order("checked_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    const ids = (checks || []).map((c) => c.question_id as string);
    const qs = new Map<string, Record<string, unknown>>();
    for (const part of chunks(ids)) {
      const { data, error: qErr } = await admin.from("questions")
        .select("id, question, options, answer_index, solution, topic, subtopic, curriculum_id, subject").in("id", part);
      if (qErr) throw new Error(qErr.message);
      for (const q of data || []) qs.set(q.id as string, q);
    }
    const items = (checks || []).filter((c) => qs.has(c.question_id as string)).map((c) => {
      const q = qs.get(c.question_id as string)!;
      return { ...c, question: q, borrowed: q.curriculum_id !== cur.id, from: q.curriculum_id !== cur.id ? q.subject : null };
    });
    return res.json({ items });
  } catch (err) {
    logger.error({ err }, "course-scope review failed");
    return fail(res, 500, err instanceof Error ? err.message : "Failed");
  }
});

router.post("/admin/course-scope/resolve", async (req, res) => {
  const caller = await requireAdmin(req, res);
  if (!caller) return;
  const admin = caller.admin;
  try {
    const cur = await curriculum(admin, req.body?.curriculumId);
    if (!cur) return fail(res, 404, "That subject doesn't exist any more.");
    const { questionId, action } = req.body || {};
    if (typeof questionId !== "string" || !["keep", "hide", "delete"].includes(action)) return fail(res, 400, "Say which question, and keep, hide or delete.");
    const { data: q, error } = await admin.from("questions").select("id, curriculum_id, subject").eq("id", questionId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!q) return fail(res, 404, "That question is already gone.");
    const step = async (label: string, run: () => PromiseLike<{ error: { message: string } | null }>) => {
      const { error: e } = await run();
      if (e) throw new Error(`${label}: ${e.message}`);
    };
    if (action === "delete") {
      if (q.curriculum_id !== cur.id) return fail(res, 400, `This question belongs to ${q.subject}. Hide it here instead, so ${q.subject} keeps it.`);
      await step("answer_log", () => admin.from("answer_log").delete().eq("question_id", questionId));
      await step("question_reports", () => admin.from("question_reports").delete().eq("question_id", questionId));
      await step("questions", () => admin.from("questions").delete().eq("id", questionId)); // its checks, hides and history go by cascade
    } else if (action === "hide") {
      await step("hide", () => admin.from("curriculum_hidden_questions").upsert({ curriculum_id: cur.id, question_id: questionId, reason: "Hidden by an admin: not in this course." }, { onConflict: "curriculum_id,question_id" }));
      await step("check", () => admin.from("question_scope_checks").update({ resolution: "hidden" }).eq("curriculum_id", cur.id).eq("question_id", questionId));
    } else {
      await step("unhide", () => admin.from("curriculum_hidden_questions").delete().eq("curriculum_id", cur.id).eq("question_id", questionId));
      await step("check", () => admin.from("question_scope_checks").update({ resolution: "kept" }).eq("curriculum_id", cur.id).eq("question_id", questionId));
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "course-scope resolve failed");
    return fail(res, 500, err instanceof Error ? err.message : "Failed");
  }
});

// ── students: "Not in my course" ──────────────────────────────────────────────

router.post("/report-off-course", async (req, res) => {
  const caller = await requireUser(req, res);
  if (!caller) return;
  const admin = caller.admin;
  try {
    const { questionId, curriculumId } = req.body || {};
    if (typeof questionId !== "string" || typeof curriculumId !== "string") return fail(res, 400, "questionId and curriculumId required");
    if (caller.userId !== "service") {
      const { data: ok, error } = await admin.rpc("user_can_read_question", { p_user: caller.userId, p_question_id: questionId });
      if (error) throw new Error(error.message);
      if (!ok) return fail(res, 403, "You can't report that question.");
    }
    const { data: existing } = await admin.from("question_scope_checks").select("resolution").eq("curriculum_id", curriculumId).eq("question_id", questionId).maybeSingle();
    // Already hidden from this subject: nothing more to do.
    if ((existing as { resolution?: string } | null)?.resolution === "hidden") return res.json({ ok: true });
    const { error } = await admin.from("question_scope_checks").upsert({
      curriculum_id: curriculumId, question_id: questionId, verdict: "reported", source: "student",
      reason: "A student said this isn't in their course.", reported_by: caller.userId === "service" ? null : caller.userId,
      resolution: null, checked_at: new Date().toISOString(),
    }, { onConflict: "curriculum_id,question_id" });
    if (error) throw new Error(error.message);
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "report-off-course failed");
    return fail(res, 500, err instanceof Error ? err.message : "Failed");
  }
});

export default router;
