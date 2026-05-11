import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL } from "../lib/anthropic-model";
import { logger } from "../lib/logger";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

function getAdmin() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("No SUPABASE_SERVICE_KEY configured");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

const CHUNK = 80;

/**
 * When a live curriculum display name changes, every row that stores that string as
 * `questions.subject` (or equivalent) must be updated or the app shows 0 questions.
 */
async function cascadeCurriculumSubjectRename(admin: SupabaseClient, oldName: string, newName: string) {
  if (oldName === newName) return { questions: 0, questionVariants: 0 };

  async function updateWithConceptTag(
    table: "questions" | "question_variants",
    rows: { id: string; topic: string; subtopic: string | null }[],
  ) {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = rows.slice(i, i + CHUNK);
      const results = await Promise.all(
        part.map((q) => {
          const sub = (q.subtopic && String(q.subtopic).trim()) || q.topic;
          const concept_tag = `${newName}|${q.topic}|${sub}`.toLowerCase();
          return admin.from(table).update({ subject: newName, concept_tag }).eq("id", q.id);
        }),
      );
      for (const r of results) {
        if (r.error) throw r.error;
      }
    }
    return rows.length;
  }

  const { data: qRows, error: qErr } = await admin
    .from("questions")
    .select("id, topic, subtopic")
    .eq("subject", oldName);
  if (qErr) throw qErr;
  const nQ = qRows?.length ? await updateWithConceptTag("questions", qRows as { id: string; topic: string; subtopic: string | null }[]) : 0;

  const { data: vRows, error: vErr } = await admin
    .from("question_variants")
    .select("id, topic, subtopic")
    .eq("subject", oldName);
  if (vErr) throw vErr;
  const nV = vRows?.length ? await updateWithConceptTag("question_variants", vRows as { id: string; topic: string; subtopic: string | null }[]) : 0;

  const simpleTables: [string, string][] = [
    ["draft_questions", "subject"],
    ["sessions", "subject"],
    ["study_plan_items", "subject"],
    ["user_subscriptions", "subject_name"],
    ["assignments", "subject"],
    ["tutor_classes", "subject"],
  ];

  for (const [table, col] of simpleTables) {
    const { error } = await admin.from(table).update({ [col]: newName }).eq(col, oldName);
    if (error) throw new Error(`${table}.${col} cascade failed: ${error.message}`);
  }

  return { questions: nQ, questionVariants: nV };
}

// POST /api/admin/curriculum-rename-cascade
// Body: { curriculumId: uuid, newName: string } — renames all question/subscription rows
// from the curriculum's current DB name to newName (curricula row is updated by the client).
router.post("/admin/curriculum-rename-cascade", async (req, res) => {
  const { curriculumId, newName } = req.body || {};
  if (!curriculumId || typeof newName !== "string" || !newName.trim()) {
    res.status(400).json({ error: "curriculumId and newName are required" });
    return;
  }

  const next = newName.trim();
  let admin: ReturnType<typeof getAdmin>;
  try {
    admin = getAdmin();
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Server misconfiguration" });
    return;
  }

  const { data: row, error: cErr } = await admin.from("curricula").select("name").eq("id", curriculumId).maybeSingle();
  if (cErr || !row?.name) {
    res.status(404).json({ error: "Curriculum not found" });
    return;
  }

  const oldName = row.name;
  if (oldName === next) {
    res.json({ ok: true, skipped: true });
    return;
  }

  try {
    const counts = await cascadeCurriculumSubjectRename(admin, oldName, next);
    logger.info({ curriculumId, oldName, newName: next, counts }, "curriculum subject string cascaded");
    res.json({ ok: true, oldName, newName: next, ...counts });
  } catch (err) {
    logger.error({ err, curriculumId, oldName, newName: next }, "curriculum-rename-cascade failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Cascade failed" });
  }
});

// POST /api/admin/curriculum-repair-subject-string
// Body: { fromSubject: string, toSubject: string } — same row updates as rename cascade,
// for recovery when the curricula row was already renamed but questions were not migrated.
router.post("/admin/curriculum-repair-subject-string", async (req, res) => {
  const { fromSubject, toSubject } = req.body || {};
  if (typeof fromSubject !== "string" || typeof toSubject !== "string" || !fromSubject.trim() || !toSubject.trim()) {
    res.status(400).json({ error: "fromSubject and toSubject are required" });
    return;
  }
  const fromS = fromSubject.trim();
  const toS = toSubject.trim();
  if (fromS === toS) {
    res.json({ ok: true, skipped: true });
    return;
  }

  let admin: ReturnType<typeof getAdmin>;
  try {
    admin = getAdmin();
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Server misconfiguration" });
    return;
  }

  try {
    const counts = await cascadeCurriculumSubjectRename(admin, fromS, toS);
    await admin.from("curricula").update({ name: toS }).eq("name", fromS);
    logger.info({ fromS, toS, counts }, "curriculum subject string repair");
    res.json({ ok: true, fromSubject: fromS, toSubject: toS, ...counts });
  } catch (err) {
    logger.error({ err, fromS, toS }, "curriculum-repair-subject-string failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Repair failed" });
  }
});

function extractJson(text: string): unknown {
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

// POST /api/admin/curriculum-plan
// Body: { subjectDescription: string, base64Doc?: string, mediaType?: string }
// Returns: { topics: [{ name: string, subtopics: [{ name: string }] }] }
router.post("/admin/curriculum-plan", async (req, res) => {
  const { subjectDescription, base64Doc, mediaType } = req.body || {};
  if (!subjectDescription?.trim() && !base64Doc) {
    res.status(400).json({ error: "subjectDescription or a document is required" });
    return;
  }

  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const apiKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

  const system = [
    "You are a curriculum designer. Return ONLY a valid JSON object — no markdown, no commentary.",
    "The object must have a single key 'topics' whose value is an array.",
    "Each topic object has: name (string), subtopics (array of objects with a single key: name (string)).",
    "Produce a realistic, well-structured curriculum tree: 5–10 topics, each with 3–6 subtopics.",
    "Subtopic names should be specific and teachable (e.g. 'Mitosis and cell division', not 'Cell processes').",
    "If a curriculum document is provided, extract the topic and subtopic structure from it directly.",
  ].join("\n");

  const descText = subjectDescription?.trim()
    ? `Subject description: ${subjectDescription.trim()}\n\n`
    : "";
  const userText = base64Doc
    ? `${descText}Generate a complete topic and subtopic breakdown based on the attached curriculum document.`
    : `Generate a complete topic and subtopic breakdown for: ${subjectDescription.trim()}`;

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
