import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL } from "../lib/anthropic-model";
import { logger } from "../lib/logger";
import { expandCurriculumRenameSources } from "../lib/subject-aliases";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

function getAdmin() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("No SUPABASE_SERVICE_KEY configured");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

function extractJson(text: string): unknown {
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

function conceptTag(subject: string, topic: string, subtopic: string): string {
  return `${subject}|${topic}|${subtopic || topic}`.toLowerCase();
}

async function cascadeSingleSubjectRename(
  admin: SupabaseClient,
  oldSubject: string,
  newSubject: string,
): Promise<void> {
  if (!oldSubject || !newSubject || oldSubject === newSubject) return;

  const batch = 400;

  for (;;) {
    const { data: rows, error } = await admin
      .from("questions")
      .select("id, topic, subtopic")
      .eq("subject", oldSubject)
      .limit(batch);
    if (error) throw new Error(error.message);
    if (!rows?.length) break;
    for (const r of rows as { id: string; topic: string; subtopic: string }[]) {
      const ct = conceptTag(newSubject, r.topic, r.subtopic);
      const { error: uErr } = await admin.from("questions").update({ subject: newSubject, concept_tag: ct }).eq("id", r.id);
      if (uErr) throw new Error(uErr.message);
    }
  }

  for (;;) {
    const { data: rows, error } = await admin
      .from("question_variants")
      .select("id, topic, subtopic")
      .eq("subject", oldSubject)
      .limit(batch);
    if (error) throw new Error(error.message);
    if (!rows?.length) break;
    for (const r of rows as { id: string; topic: string; subtopic: string }[]) {
      const ct = conceptTag(newSubject, r.topic, r.subtopic);
      const { error: uErr } = await admin.from("question_variants").update({ subject: newSubject, concept_tag: ct }).eq("id", r.id);
      if (uErr) throw new Error(uErr.message);
    }
  }

  const { error: dErr } = await admin.from("draft_questions").update({ subject: newSubject }).eq("subject", oldSubject);
  if (dErr) throw new Error(dErr.message);

  const { error: sErr } = await admin.from("sessions").update({ subject: newSubject }).eq("subject", oldSubject);
  if (sErr) throw new Error(sErr.message);

  const { error: spErr } = await admin.from("study_plan_items").update({ subject: newSubject }).eq("subject", oldSubject);
  if (spErr) throw new Error(spErr.message);

  const { error: usErr } = await admin
    .from("user_subscriptions")
    .update({ subject_name: newSubject })
    .eq("subject_name", oldSubject);
  if (usErr) throw new Error(usErr.message);

  const { error: asErr } = await admin.from("assignments").update({ subject: newSubject }).eq("subject", oldSubject);
  if (asErr) throw new Error(asErr.message);

  const { error: tcErr } = await admin.from("tutor_classes").update({ subject: newSubject }).eq("subject", oldSubject);
  if (tcErr) throw new Error(tcErr.message);
}

async function cascadeCurriculumSubjectRename(
  admin: SupabaseClient,
  oldName: string,
  newName: string,
  oldLevelLabel = "",
): Promise<void> {
  if (!oldName || !newName) return;

  const sources = expandCurriculumRenameSources(oldName, oldLevelLabel);
  for (const src of sources) {
    await cascadeSingleSubjectRename(admin, src, newName);
  }
}

// POST /api/admin/curriculum-plan
// Body: { subjectDescription: string, base64Doc?: string, mediaType?: string }
// Returns: { topics: [{ name: string, subtopics: [{ name: string }] }] }
router.post("/admin/curriculum-plan", async (req, res) => {
  const { subjectDescription, base64Doc, mediaType, cohortLevel } = req.body || {};
  if (!subjectDescription?.trim() && !base64Doc) {
    res.status(400).json({ error: "subjectDescription or a document is required" });
    return;
  }

  const cohort = typeof cohortLevel === "string" ? cohortLevel.trim() : "";

  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const apiKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

  const system = [
    "You are a curriculum designer. Return ONLY a valid JSON object — no markdown, no commentary.",
    "The object must have a single key 'topics' whose value is an array.",
    "Each topic object has: name (string), subtopics (array of objects with a single key: name (string)).",
    "Produce a realistic, well-structured curriculum tree: 5–10 topics, each with 3–6 subtopics.",
    "Subtopic names should be specific and teachable (e.g. 'Mitosis and cell division', not 'Cell processes').",
    "If a curriculum document is provided, extract the topic and subtopic structure from it directly.",
    cohort
      ? `Every topic and subtopic must be appropriate for this cohort only: ${cohort}. Do not mix levels (e.g. no Stage 2 content under Stage 1).`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const cohortNote = cohort ? `Target cohort: ${cohort}\n\n` : "";
  const descText = subjectDescription?.trim()
    ? `${cohortNote}Subject description: ${subjectDescription.trim()}\n\n`
    : cohort
      ? `${cohortNote}`
      : "";
  const userText = base64Doc
    ? `${descText}Generate a complete topic and subtopic breakdown based on the attached curriculum document.`
    : `Generate a complete topic and subtopic breakdown for:\n${descText.trimEnd()}`;

  const userContent = base64Doc
    ? [
        { type: "document", source: { type: "base64", media_type: mediaType || "application/pdf", data: base64Doc } },
        { type: "text", text: userText },
      ]
    : userText;

  const extraHeaders: Record<string, string> = base64Doc
    ? { "anthropic-beta": "pdfs-2024-09-25" }
    : {};

  let claudeRes: Response;
  try {
    claudeRes = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        ...extraHeaders,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    });
  } catch (err) {
    logger.error({ err }, "Failed to reach Claude API");
    res.status(500).json({ error: "Failed to reach Claude API" });
    return;
  }

  if (!claudeRes.ok) {
    const text = await claudeRes.text();
    res.status(500).json({ error: "Claude API error", detail: text });
    return;
  }

  const claudeData = await claudeRes.json() as { content?: { text: string }[] };
  const rawText = claudeData?.content?.[0]?.text || "";
  const parsed = extractJson(rawText) as { topics?: unknown[] } | null;

  if (!parsed?.topics?.length) {
    res.status(500).json({ error: "Could not parse curriculum plan from AI response", raw: rawText.slice(0, 500) });
    return;
  }

  res.json({ topics: parsed.topics });
});

// POST /api/admin/curriculum-rename-cascade
// Body: { oldSubject: string, newSubject: string, oldLevelLabel?: string }
router.post("/admin/curriculum-rename-cascade", async (req, res) => {
  const { oldSubject, newSubject, oldLevelLabel } = req.body || {};
  const a = typeof oldSubject === "string" ? oldSubject.trim() : "";
  const b = typeof newSubject === "string" ? newSubject.trim() : "";
  const lvl = typeof oldLevelLabel === "string" ? oldLevelLabel.trim() : "";
  if (!a || !b) {
    res.status(400).json({ error: "oldSubject and newSubject are required" });
    return;
  }
  try {
    const admin = getAdmin();
    await cascadeCurriculumSubjectRename(admin, a, b, lvl);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "curriculum-rename-cascade failed");
    const message = err instanceof Error ? err.message : "Rename cascade failed";
    res.status(500).json({ error: message });
  }
});

// POST /api/admin/curriculum-repair-subject-strings
// Body: { newSubject: string, sourceSubjects: string[] } — merges every source string (plus alias expansion) into newSubject.
router.post("/admin/curriculum-repair-subject-strings", async (req, res) => {
  const { newSubject, sourceSubjects } = req.body || {};
  const b = typeof newSubject === "string" ? newSubject.trim() : "";
  const rawList = Array.isArray(sourceSubjects) ? sourceSubjects : [];
  if (!b || rawList.length === 0) {
    res.status(400).json({ error: "newSubject and non-empty sourceSubjects[] are required" });
    return;
  }
  try {
    const admin = getAdmin();
    for (const raw of rawList) {
      const s = typeof raw === "string" ? raw.trim() : "";
      if (!s || s === b) continue;
      for (const src of expandCurriculumRenameSources(s, "")) {
        await cascadeSingleSubjectRename(admin, src, b);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "curriculum-repair-subject-strings failed");
    const message = err instanceof Error ? err.message : "Repair failed";
    res.status(500).json({ error: message });
  }
});

// POST /api/admin/curriculum-subscription-stage
// Body: { subjectName: string, oldStage: string, newStage: string }
router.post("/admin/curriculum-subscription-stage", async (req, res) => {
  const { subjectName, oldStage, newStage } = req.body || {};
  const sub = typeof subjectName === "string" ? subjectName.trim() : "";
  if (!sub) {
    res.status(400).json({ error: "subjectName is required" });
    return;
  }
  const o = oldStage === undefined || oldStage === null ? "" : String(oldStage).trim();
  const n = newStage === undefined || newStage === null ? "" : String(newStage).trim();
  if (o === n) {
    res.json({ ok: true, updated: 0 });
    return;
  }
  try {
    const admin = getAdmin();
    const { data, error } = await admin
      .from("user_subscriptions")
      .update({ stage: n })
      .eq("subject_name", sub)
      .eq("stage", o)
      .select("id");
    if (error) throw error;
    res.json({ ok: true, updated: (data ?? []).length });
  } catch (err) {
    logger.error({ err }, "curriculum-subscription-stage failed");
    const message = err instanceof Error ? err.message : "Stage update failed";
    res.status(500).json({ error: message });
  }
});

// POST /api/admin/curriculum-generate
// Body: { subtopicId, curriculumId, subjectName, topicName, subtopicName, count? }
// Generates `count` draft questions for one subtopic, then marks it done/failed.
router.post("/admin/curriculum-generate", async (req, res) => {
  const {
    subtopicId,
    curriculumId,
    subjectName,
    topicName,
    subtopicName,
    count = 25,
  } = req.body || {};

  if (!subtopicId || !subjectName || !topicName || !subtopicName) {
    res.status(400).json({ error: "subtopicId, subjectName, topicName, subtopicName required" });
    return;
  }

  const admin = getAdmin();

  // Mark generating
  await admin.from("curriculum_subtopics").update({ gen_status: "generating" }).eq("id", subtopicId);

  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const apiKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

  const system = [
    `You are generating multiple-choice questions for students studying ${subjectName}.`,
    "Return ONLY a valid JSON array. No markdown, no commentary outside the array.",
    `Generate exactly ${count} questions.`,
    "Each object must have these exact keys:",
    "  question (string)",
    "  options (array of exactly 4 strings)",
    "  answer_index (integer 0–3)",
    "  solution (string — explain why the answer is correct, 2–4 sentences)",
    "  difficulty (integer 1–5)",
    "Questions must be accurate, unambiguous, and test conceptual understanding.",
    "Vary difficulty: include easy (1–2), medium (3), and hard (4–5) questions.",
    "Do not repeat the same scenario across questions.",
  ].join("\n");

  const user = [
    `Generate ${count} multiple-choice questions for the following:`,
    `Subject: ${subjectName}`,
    `Topic: ${topicName}`,
    `Subtopic: ${subtopicName}`,
    "",
    "All questions must directly assess concepts from this specific subtopic.",
    "Use appropriate terminology and scope for this level of study.",
  ].join("\n");

  // Pre-fetch existing questions to avoid duplicates
  const { data: existing } = await admin
    .from("draft_questions")
    .select("question")
    .eq("subject", subjectName)
    .eq("topic", topicName)
    .eq("subtopic", subtopicName)
    .limit(200);

  const existingSet = new Set(
    (existing || []).map((r) => (r.question || "").trim().toLowerCase())
  );

  let claudeRes: Response;
  try {
    claudeRes = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
  } catch (err) {
    await admin.from("curriculum_subtopics").update({ gen_status: "failed" }).eq("id", subtopicId);
    res.status(500).json({ error: "Failed to reach Claude API" });
    return;
  }

  if (!claudeRes.ok) {
    await admin.from("curriculum_subtopics").update({ gen_status: "failed" }).eq("id", subtopicId);
    const text = await claudeRes.text();
    res.status(500).json({ error: "Claude API error", detail: text });
    return;
  }

  const claudeData = await claudeRes.json() as { content?: { text: string }[] };
  const rawText = claudeData?.content?.[0]?.text || "";

  let questions: Array<{ question: string; options: string[]; answer_index: number; solution?: string; difficulty?: number }> = [];
  try {
    const parsed = JSON.parse(rawText);
    questions = Array.isArray(parsed) ? parsed : [];
  } catch {
    const start = rawText.indexOf("[");
    const end = rawText.lastIndexOf("]");
    if (start !== -1 && end > start) {
      try { questions = JSON.parse(rawText.slice(start, end + 1)); } catch {}
    }
  }

  if (!questions.length) {
    await admin.from("curriculum_subtopics").update({ gen_status: "failed" }).eq("id", subtopicId);
    res.status(200).json({ inserted: 0, message: "No questions parsed" });
    return;
  }

  const rows = questions
    .filter((q) => q.question && !existingSet.has(q.question.trim().toLowerCase()))
    .map((q) => ({
      source: "ai_generated",
      subject: subjectName,
      topic: topicName,
      topic_code: null,
      subtopic: subtopicName,
      question: q.question,
      options: q.options,
      answer_index: q.answer_index,
      solution: q.solution || null,
      difficulty: q.difficulty || null,
      status: "pending",
    }));

  if (rows.length === 0) {
    await admin.from("curriculum_subtopics").update({ gen_status: "done", questions_generated: 0 }).eq("id", subtopicId);
    res.status(200).json({ inserted: 0, message: "All questions were duplicates" });
    return;
  }

  const { error } = await admin.from("draft_questions").insert(rows);
  if (error) {
    await admin.from("curriculum_subtopics").update({ gen_status: "failed" }).eq("id", subtopicId);
    res.status(500).json({ error: error.message });
    return;
  }

  await admin
    .from("curriculum_subtopics")
    .update({ gen_status: "done", questions_generated: rows.length })
    .eq("id", subtopicId);

  res.json({ inserted: rows.length });
});

// POST /api/admin/curriculum-revise
// Body: { currentTopics, instruction, subjectName, base64Doc?, mediaType? }
// Returns: { topics: [{ name, subtopics: [{ name }] }] }
router.post("/admin/curriculum-revise", async (req, res) => {
  const { currentTopics, instruction, subjectName, base64Doc, mediaType } = req.body || {};
  if (!currentTopics || (!instruction?.trim() && !base64Doc)) {
    res.status(400).json({ error: "currentTopics and either instruction or a document are required" });
    return;
  }

  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const apiKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

  const currentTree = JSON.stringify(currentTopics, null, 2);

  const system = [
    "You are a curriculum designer. Return ONLY a valid JSON object — no markdown, no commentary.",
    "The object must have a single key 'topics' whose value is an array.",
    "Each topic object has: name (string), subtopics (array of objects with a single key: name (string)).",
    "You will be given the current curriculum tree and either a revision instruction, an uploaded document, or both.",
    "Apply the requested changes while preserving the rest of the tree structure.",
    "If a document is provided, use it to inform or replace the curriculum structure as appropriate.",
  ].join("\n");

  const instructionText = instruction?.trim()
    ? `Revision instruction: ${instruction.trim()}\n\n`
    : "";
  const userText = base64Doc
    ? `${instructionText}Current curriculum tree for "${subjectName}":\n${currentTree}\n\nRevise the curriculum tree based on the attached document${instruction?.trim() ? " and the instruction above" : ""}.`
    : `Current curriculum tree for "${subjectName}":\n${currentTree}\n\nRevision instruction: ${instruction.trim()}`;

  const userContent = base64Doc
    ? [
        { type: "document", source: { type: "base64", media_type: mediaType || "application/pdf", data: base64Doc } },
        { type: "text", text: userText },
      ]
    : userText;

  const extraHeaders: Record<string, string> = base64Doc ? { "anthropic-beta": "pdfs-2024-09-25" } : {};

  let claudeRes: Response;
  try {
    claudeRes = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        ...extraHeaders,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    });
  } catch (err) {
    logger.error({ err }, "Failed to reach Claude API");
    res.status(500).json({ error: "Failed to reach Claude API" });
    return;
  }

  if (!claudeRes.ok) {
    const text = await claudeRes.text();
    res.status(500).json({ error: "Claude API error", detail: text });
    return;
  }

  const claudeData = await claudeRes.json() as { content?: { text: string }[] };
  const rawText = claudeData?.content?.[0]?.text || "";
  const parsed = extractJson(rawText) as { topics?: unknown[] } | null;

  if (!parsed?.topics?.length) {
    res.status(500).json({ error: "Could not parse revised curriculum from AI response", raw: rawText.slice(0, 500) });
    return;
  }

  res.json({ topics: parsed.topics });
});

export default router;
