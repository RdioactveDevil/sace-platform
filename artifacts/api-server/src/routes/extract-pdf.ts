import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";

const router = Router();

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

function extractJsonArray(text = ""): unknown[] {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {}
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function topicsAsPromptList(stage: string): string {
  const S1 = [
    "1.1: Properties and uses of materials",
    "1.2: Atomic structure",
    "1.3: Quantities of atoms",
    "2.1: Types of materials",
    "2.2: Bonding between atoms",
    "2.3: Quantities of molecules and ions",
    "3.1: Molecule polarity",
    "3.2: Interactions between molecules",
    "3.3: Hydrocarbons",
    "3.4: Polymers",
    "4.1: Miscibility and solutions",
    "4.2: Solutions of ionic substances",
    "4.3: Quantities in reactions",
    "4.4: Energy in reactions",
    "5.1: Acid–base concepts",
    "5.2: Reactions of acids and bases",
    "5.3: The pH scale",
    "6.1: Concepts of oxidation and reduction",
    "6.2: Metal reactivity",
    "6.3: Electrochemistry",
  ];
  const S2 = [
    "1.1: Global warming and climate change",
    "1.2: Photochemical smog",
    "1.3: Volumetric analysis",
    "1.4: Chromatography",
    "1.5: Atomic spectroscopy",
    "2.1: Rates of reactions",
    "2.2: Equilibrium and yield",
    "2.3: Optimising production",
    "3.1: Introduction to organic chemistry",
    "3.2: Alcohols",
    "3.3: Aldehydes and ketones",
    "3.4: Carbohydrates",
    "3.5: Carboxylic acids",
    "3.6: Amines",
    "3.7: Esters",
    "3.8: Amides",
    "3.9: Triglycerides",
    "3.10: Proteins",
    "4.1: Energy resources",
    "4.2: Water",
    "4.3: Soil",
    "4.4: Materials resources",
  ];
  return (stage === "Chemistry Stage 1" ? S1 : S2).join("\n");
}

router.post("/extract-pdf", async (req, res) => {
  const { base64, filename, stage } = req.body;
  if (!base64 || !stage) {
    res.status(400).json({ error: "base64 and stage required" });
    return;
  }

  const topicList = topicsAsPromptList(stage);

  const system = [
    "You are extracting multiple-choice questions from a SACE Chemistry exam or textbook PDF.",
    "Return ONLY a valid JSON array. No markdown, no commentary outside the array.",
    "Each object must have these exact keys:",
    "  question (string)",
    "  options (array of exactly 4 strings)",
    "  answer_index (integer 0–3, index of the correct option)",
    "  solution (string explaining why the answer is correct)",
    "  subtopic (short free-text description of the specific concept tested)",
    "  topic_code (string from the allowed list below, or \"unknown\" if unsure)",
    "  topic (the full topic name matching the code)",
    "  difficulty (integer 1–5, where 1=easy, 5=hard)",
    "",
    "Allowed topic codes for " + stage + ":",
    topicList,
  ].join("\n");

  const user =
    "Extract all multiple-choice questions from this document. Return them as a JSON array.";

  let claudeResponse: Response;
  try {
    claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 8000,
        system,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: base64 },
              },
              { type: "text", text: user },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    logger.error({ err }, "Failed to reach Claude API");
    res.status(500).json({ error: "Failed to reach Claude API", detail: (err as Error).message });
    return;
  }

  if (!claudeResponse.ok) {
    const errText = await claudeResponse.text();
    res.status(500).json({ error: "Claude API error", detail: errText });
    return;
  }

  const claudeData = await claudeResponse.json() as { content?: { text: string }[] };
  const rawText = claudeData?.content?.[0]?.text || "";
  const questions = extractJsonArray(rawText) as Array<{
    topic_code?: string; topic?: string; subtopic?: string;
    question: string; options: string[]; answer_index: number;
    solution?: string; difficulty?: number;
  }>;

  if (!questions.length) {
    res.status(200).json({ inserted: 0, needs_review: 0, message: "No questions extracted" });
    return;
  }

  const rows = questions.map((q) => ({
    source: "pdf_extract",
    source_file: filename || null,
    subject: stage,
    topic_code: !q.topic_code || q.topic_code === "unknown" ? null : q.topic_code,
    topic: q.topic || null,
    subtopic: q.subtopic || null,
    question: q.question,
    options: q.options,
    answer_index: q.answer_index,
    solution: q.solution || null,
    difficulty: q.difficulty || null,
    status: !q.topic_code || q.topic_code === "unknown" ? "needs_review" : "pending",
  }));

  const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY!);
  const { error } = await supabaseAdmin.from("draft_questions").insert(rows);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const needsReview = rows.filter((r) => r.status === "needs_review").length;
  res.status(200).json({ inserted: rows.length, needs_review: needsReview });
});

export default router;
