import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL } from "../lib/anthropic-model";
import { logger } from "../lib/logger";
import { normalizeMathText } from "../lib/normalize-math";
import { extractJsonArray } from "../lib/json-latex";
import { filterVerifiedQuestions } from "../lib/verify-question";
import {
  ALLOWED_QUESTION_TYPES,
  typeColumns,
  mcqColumns,
  type GeneratedQuestion,
} from "./generate-questions";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

function getBaseUrl(): string {
  return process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
}
function getApiKey(): string {
  return process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
}

const TYPE_GUIDE: Record<string, string> = {
  mcq: `  mcq: options (exactly 4 strings) and answer_index (0–3).`,
  multi_select: `  multi_select: options (4–6 strings) and answer_indices (array of the correct 0-based indices).`,
  numeric: `  numeric: answer (number), tolerance (absolute error, 0 for exact), unit (string or ""). No options.`,
  short_text: `  short_text: accept (array of acceptable answer strings), case_sensitive (boolean). No options.`,
  order: `  order: items (3–6 strings in the CORRECT order). No options.`,
  hotspot: `  hotspot: hotspots (array of regions { x, y, w, h, label, correct } where x,y,w,h are PERCENTAGES 0–100 of the image, exactly one correct:true). The student clicks the correct region. No options.`,
  image_label: `  image_label: markers (array of { x, y, answer } where x,y are PERCENTAGES 0–100 marking a point on the image and answer is the correct label) and labels (the full pool of label strings, including the correct ones). No options.`,
};

// POST /api/generate-from-image
router.post("/generate-from-image", async (req, res) => {
  const {
    imageBase64,
    imageUrl,
    mediaType: mediaTypeRaw,
    subject,
    topic,
    subtopic,
    count = 5,
    questionTypes,
    autoApprove = true,
  } = req.body || {};

  if ((!imageBase64 && !imageUrl) || !subject || !subtopic) {
    res.status(400).json({ error: "An image (imageBase64 or imageUrl), subject and subtopic are required" });
    return;
  }

  const adminDb = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY!);

  // ── Resolve the image to base64 (for vision) + a public URL (to store) ────────
  let base64Data = "";
  let mediaType: string = mediaTypeRaw || "image/png";
  let publicUrl = "";

  try {
    if (imageBase64) {
      base64Data = String(imageBase64).replace(/^data:[^;]+;base64,/, "");
      const ext = (mediaType.split("/")[1] || "png").replace("+xml", "");
      const path = `vision/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const buffer = Buffer.from(base64Data, "base64");
      const { error: upErr } = await adminDb.storage
        .from("question-images")
        .upload(path, buffer, { contentType: mediaType, upsert: false });
      if (upErr) throw new Error(`Image upload failed: ${upErr.message}`);
      publicUrl = adminDb.storage.from("question-images").getPublicUrl(path).data.publicUrl;
    } else {
      const r = await fetch(imageUrl);
      if (!r.ok) throw new Error(`Could not fetch imageUrl (${r.status})`);
      const ab = await r.arrayBuffer();
      base64Data = Buffer.from(ab).toString("base64");
      mediaType = r.headers.get("content-type")?.split(";")[0] || mediaType;
      publicUrl = imageUrl;
    }
  } catch (err) {
    logger.error({ err }, "[generate-from-image] image handling failed");
    res.status(502).json({ error: (err as Error).message });
    return;
  }

  // ── Build the vision prompt ───────────────────────────────────────────────────
  const requestedTypes = (Array.isArray(questionTypes) ? questionTypes : ["mcq"]).filter((tp: string) =>
    ALLOWED_QUESTION_TYPES.includes(tp),
  );
  const types = requestedTypes.length ? requestedTypes : ["mcq"];

  const system = [
    `You are an expert ${subject} exam author creating questions FROM an image (a diagram, graph, figure, map or photo).`,
    `Generate exactly ${count} high-quality questions that genuinely require the student to read and interpret the image.`,
    `Topic: ${topic || subtopic}. Subtopic: ${subtopic}.`,
    "Return ONLY a valid JSON array. No markdown, no commentary.",
    `Add a "question_type" key to every object. Allowed types: ${types.join(", ")}.`,
    "Type-specific keys (every object also needs: question, solution (2–4 sentences), difficulty (1–5)):",
    ...types.map((tp) => TYPE_GUIDE[tp]).filter(Boolean),
    "For hotspot and image_label, coordinates are PERCENTAGES of the image (top-left is 0,0; bottom-right is 100,100).",
    "Use LaTeX ($...$) for any mathematical or chemical notation.",
    "Make questions unambiguous and answerable purely from the image plus standard curriculum knowledge.",
  ].join("\n");

  let rawText = "";
  try {
    const resp = await fetch(`${getBaseUrl()}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getApiKey(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 6000,
        system,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
              { type: "text", text: `Generate ${count} questions based on this image.` },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      res.status(502).json({ error: "Claude API error", detail: errText.slice(0, 300) });
      return;
    }
    const data = (await resp.json()) as { content?: { text: string }[] };
    rawText = data?.content?.[0]?.text || "";
  } catch (err) {
    logger.error({ err }, "[generate-from-image] vision call failed");
    res.status(502).json({ error: "Failed to reach Claude API" });
    return;
  }

  const questions = extractJsonArray(rawText) as GeneratedQuestion[];
  if (!questions.length) {
    res.status(200).json({ inserted: 0, message: "No questions generated", imageUrl: publicUrl });
    return;
  }

  // Answer-key verification (MCQ-shaped only; others pass through the guard).
  const { kept, dropped, fixed, errored } = await filterVerifiedQuestions(questions, {
    context: { source: "image", subtopic },
  });
  if (dropped || fixed || errored) {
    logger.info({ subtopic, generated: questions.length, kept: kept.length, dropped, fixed, errored }, "[generate-from-image] verification adjusted batch");
  }
  if (!kept.length) {
    res.status(200).json({ inserted: 0, message: "No questions passed verification", imageUrl: publicUrl });
    return;
  }

  const now = new Date().toISOString();
  const conceptTag = `${subject}|${topic || subtopic}|${subtopic}`.toLowerCase();
  const rows = kept
    .filter((q) => q.question)
    .map((q) => ({
      id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      subject,
      topic: topic || subtopic,
      subtopic,
      concept_tag: conceptTag,
      difficulty: q.difficulty || 3,
      question: normalizeMathText(q.question) as string,
      ...mcqColumns(q),
      ...typeColumns(q),
      solution: normalizeMathText(q.solution || "") as string,
      graph: null,
      table_data: null,
      image_url: publicUrl,
      tip: null,
      created_at: now,
    }));

  if (!autoApprove) {
    // Draft queue for review.
    const draftRows = rows.map((r) => ({ ...r, id: undefined, source: "image_generated", status: "pending" }));
    const { error } = await adminDb.from("draft_questions").insert(draftRows);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ inserted: draftRows.length, draft: true, imageUrl: publicUrl });
    return;
  }

  const { data: inserted, error } = await adminDb.from("questions").insert(rows).select("id");
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(200).json({ inserted: (inserted || []).length, questions: rows, imageUrl: publicUrl });
});

export default router;
