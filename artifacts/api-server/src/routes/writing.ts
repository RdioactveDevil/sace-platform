import { Router } from "express";
import { CLAUDE_MODEL } from "../lib/anthropic-model";
import { logger } from "../lib/logger";

const router = Router();

const YEAR_RANGES: Record<string, string> = {
  writing_y56: "Year 5–6 (ages 10–12)",
  writing_y78: "Year 7–8 (ages 12–14)",
  writing_y910: "Year 9–10 (ages 14–16)",
};

function getBaseUrl(): string {
  return process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
}

function getApiKey(): string {
  return process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
}

async function callClaude(system: string, user: string, maxTokens = 1000): Promise<string> {
  const res = await fetch(`${getBaseUrl()}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error: ${text.slice(0, 200)}`);
  }
  const data = await res.json() as { content?: { text: string }[] };
  return data?.content?.[0]?.text || "";
}

function extractJson(text: string): unknown {
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

// POST /api/writing/prompt
router.post("/writing/prompt", async (req, res) => {
  const { subject, essayType } = req.body || {};
  if (!subject || !essayType) {
    res.status(400).json({ error: "subject and essayType required" });
    return;
  }

  const yearRange = YEAR_RANGES[subject] || "secondary school";
  let rawText: string;

  try {
    if (essayType === "narrative") {
      const system = [
        `You are generating creative writing prompts for ${yearRange} students.`,
        "Return ONLY a valid JSON object with these keys:",
        "  prompt: string (2–4 sentences setting a compelling scenario for a narrative essay)",
        "  imageQuery: string (optional — a short evocative phrase suitable for Unsplash, e.g. 'misty forest path at dawn'; include this key roughly 60% of the time, omit entirely the other 40%)",
        "No markdown, no commentary outside the JSON.",
      ].join("\n");
      rawText = await callClaude(system, "Generate a narrative writing prompt.");
    } else {
      const system = [
        `You are generating persuasive writing prompts for ${yearRange} students.`,
        "Return ONLY a valid JSON object with a single key:",
        "  prompt: string (1–2 sentences stating a clear, debatable position for the student to argue for or against)",
        "No markdown, no commentary outside the JSON.",
      ].join("\n");
      rawText = await callClaude(system, "Generate a persuasive writing prompt.");
    }
  } catch (err) {
    logger.error({ err }, "Failed to generate writing prompt");
    res.status(500).json({ error: "Failed to reach Claude API" });
    return;
  }

  const parsed = extractJson(rawText) as { prompt?: string; imageQuery?: string } | null;
  if (!parsed?.prompt) {
    res.status(500).json({ error: "Could not parse prompt from AI response" });
    return;
  }

  let imageUrl: string | undefined;
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  if (essayType === "narrative" && parsed.imageQuery && unsplashKey) {
    try {
      const query = encodeURIComponent(parsed.imageQuery);
      const imgRes = await fetch(
        `https://api.unsplash.com/photos/random?query=${query}&orientation=landscape`,
        { headers: { Authorization: `Client-ID ${unsplashKey}` } }
      );
      if (imgRes.ok) {
        const imgData = await imgRes.json() as { urls?: { regular?: string } };
        imageUrl = imgData?.urls?.regular;
      }
    } catch {
      // image is optional — proceed without it
    }
  }

  res.json({ prompt: parsed.prompt, imageUrl });
});

// POST /api/writing/feedback
router.post("/writing/feedback", async (req, res) => {
  const { subject, essayType, mode, prompt, imageUrl, content } = req.body || {};
  if (!subject || !essayType || !prompt || content == null) {
    res.status(400).json({ error: "subject, essayType, prompt, content required" });
    return;
  }

  const yearRange = YEAR_RANGES[subject] || "secondary school";
  const contentText =
    typeof content === "string"
      ? content
      : Object.entries(content as Record<string, string>)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n\n");

  const system = [
    `You are a scholarship and select-entry assessor marking a ${essayType} essay from a ${yearRange} student.`,
    "Return ONLY a valid JSON object with these exact keys:",
    "  overallImpression: string (2–4 sentences on overall quality, written in the tone of a real assessor)",
    "  annotations: array of objects — each must have: aspect (string), comment (string), and optionally quote (string — a short verbatim excerpt from the student's writing that the comment refers to)",
    "  improvements: array of strings (3–5 specific, actionable suggestions for the student)",
    "Be honest, specific, and constructive. Reference the student's actual writing when possible.",
    "No markdown, no commentary outside the JSON.",
  ].join("\n");

  const imageNote = imageUrl ? `\n\nThe student was also shown a visual image prompt.` : "";
  const userMsg = [
    `Essay type: ${essayType}`,
    `Writing prompt given to the student: ${prompt}${imageNote}`,
    "",
    mode === "prompt_planner" ? "Student's planning notes:" : "Student's essay:",
    contentText,
  ].join("\n");

  let rawText: string;
  try {
    rawText = await callClaude(system, userMsg, 2000);
  } catch (err) {
    logger.error({ err }, "Failed to generate writing feedback");
    res.status(500).json({ error: "Failed to reach Claude API" });
    return;
  }

  const parsed = extractJson(rawText) as {
    overallImpression?: string;
    annotations?: unknown[];
    improvements?: unknown[];
  } | null;

  if (!parsed?.overallImpression) {
    res.status(500).json({ error: "Could not parse feedback from AI response" });
    return;
  }

  res.json(parsed);
});

export default router;
