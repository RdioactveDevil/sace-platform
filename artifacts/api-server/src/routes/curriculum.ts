import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";

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

// POST /api/admin/curriculum-plan
// Body: { subjectDescription: string }
// Returns: { topics: [{ name: string, subtopics: [{ name: string }] }] }
router.post("/admin/curriculum-plan", async (req, res) => {
  const { subjectDescription } = req.body || {};
  if (!subjectDescription?.trim()) {
    res.status(400).json({ error: "subjectDescription required" });
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
  ].join("\n");

  const user = `Generate a complete topic and subtopic breakdown for: ${subjectDescription.trim()}`;

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
        model: "claude-opus-4-6",
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: user }],
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
        model: "claude-opus-4-6",
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

export default router;
