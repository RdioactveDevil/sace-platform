import { Router, type Request, type Response } from "express";
import PDFDocument from "pdfkit";
import { CLAUDE_MODEL } from "../lib/anthropic-model";
import { logger } from "../lib/logger";
import { getSupabaseService, loadWritingAttemptForViewer } from "../lib/writing-auth";

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
  const data = (await res.json()) as { content?: { text: string }[] };
  return data?.content?.[0]?.text || "";
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    /* continue */
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function contentToPlainText(content: unknown, mode?: string): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return Object.entries(content as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join("\n\n");
  }
  return String(content ?? "");
}

/** True if there is no substantive student writing (whitespace / empty planner fields only). */
function isSubstantiallyEmpty(content: unknown, mode: string): boolean {
  if (content == null) return true;
  if (typeof content === "string") return content.trim().length === 0;
  if (typeof content === "object" && !Array.isArray(content)) {
    const vals = Object.values(content as Record<string, unknown>);
    if (vals.length === 0) return true;
    const anyText = vals.some((v) => typeof v === "string" && v.trim().length > 0);
    return !anyText;
  }
  return false;
}

export const EMPTY_SUBMISSION_RESPONSE = {
  emptySubmission: true as const,
  overallImpression:
    "No writing was submitted. Add your response in the text box or planner fields, then submit again so we can assess your work.",
  overallScore: 0,
  criteriaScores: [] as { name: string; score: number; comment: string }[],
  annotations: [] as { aspect: string; comment: string; quote?: string }[],
  improvements: [
    "Write a complete response that addresses the prompt before submitting.",
    "For a full essay, aim for several paragraphs with a clear beginning, middle, and end.",
    "For the planner, fill each section with specific ideas — avoid leaving boxes blank.",
  ],
};

const NARRATIVE_CRITERIA = [
  "Orientation / engage reader",
  "Complication / tension",
  "Character / voice",
  "Control of language (grammar, spelling, punctuation)",
  "Structure / cohesion (paragraphing, flow)",
];

const PERSUASIVE_CRITERIA = [
  "Position / thesis clarity",
  "Argument & supporting evidence",
  "Use of persuasive devices / reasoning",
  "Acknowledgement of counter-arguments where appropriate",
  "Control of language (grammar, spelling, punctuation)",
];

// GAMSAT Section 2, Task A — argumentative/expository response to a theme.
const GAMSAT_A_CRITERIA = [
  "Response to theme & clarity of thesis",
  "Quality and development of ideas (depth of thought)",
  "Structure & coherence",
  "Use of evidence, examples & reasoning",
  "Control and sophistication of language",
];

// GAMSAT Section 2, Task B — reflective/creative response to a theme.
const GAMSAT_B_CRITERIA = [
  "Engagement with the theme",
  "Depth, insight & originality of ideas",
  "Structure & development",
  "Voice, tone & emotional resonance",
  "Control and sophistication of language",
];

type EssayConfig = {
  criteria: string[];
  who: (yearRange: string) => string;
  standards: string;
  scaleNote?: string;
};

const ESSAY_CONFIG: Record<string, EssayConfig> = {
  narrative: {
    criteria: NARRATIVE_CRITERIA,
    who: (yr) => `narrative writing from a ${yr} student`,
    standards: "Australian national writing assessments (NAPLAN-style) and selective/scholarship writing tasks (ACER / Edutest style)",
  },
  persuasive: {
    criteria: PERSUASIVE_CRITERIA,
    who: (yr) => `persuasive writing from a ${yr} student`,
    standards: "Australian national writing assessments (NAPLAN-style) and selective/scholarship writing tasks (ACER / Edutest style)",
  },
  gamsat_argument: {
    criteria: GAMSAT_A_CRITERIA,
    who: () => "a GAMSAT Section 2 Task A essay (argumentative/expository response to a theme) written by an adult sitting the graduate medical admissions test",
    standards: "ACER GAMSAT Section 2 expectations — assessors reward quality of thought, command of language, and effective structure over factual recall",
    scaleNote: "In overallImpression, also give an indicative GAMSAT Section 2 band out of 100 (≈56 is average, 62 is solid, 70+ is strong) and frame the writer as an adult candidate.",
  },
  gamsat_reflective: {
    criteria: GAMSAT_B_CRITERIA,
    who: () => "a GAMSAT Section 2 Task B essay (reflective/creative response to a theme) written by an adult sitting the graduate medical admissions test",
    standards: "ACER GAMSAT Section 2 expectations — assessors reward depth of reflection, originality, emotional resonance and command of language",
    scaleNote: "In overallImpression, also give an indicative GAMSAT Section 2 band out of 100 (≈56 is average, 62 is solid, 70+ is strong) and frame the writer as an adult candidate.",
  },
};

function isGamsat(essayType: string): boolean {
  return essayType === "gamsat_argument" || essayType === "gamsat_reflective";
}

function buildFeedbackSystem(essayType: string, yearRange: string): string {
  const cfg = ESSAY_CONFIG[essayType] ?? ESSAY_CONFIG.narrative;
  const criteriaList = cfg.criteria.map((c) => `    - ${c}`).join("\n");

  return [
    `You assess ${cfg.who(yearRange)}.`,
    "",
    `Score using the same broad expectations as ${cfg.standards}:`,
    "- overallScore: integer from 1 (minimal) to 10 (strong control; sophisticated for the level).",
    "- For each criterion below, assign score 1–10 and a one-sentence justification tied to the writer's actual writing.",
    ...(cfg.scaleNote ? ["", cfg.scaleNote] : []),
    "",
    "Criteria (use these exact names in criteriaScores[].name):",
    criteriaList,
    "",
    "Return ONLY valid JSON with these exact keys:",
    "  overallImpression: string (2–4 sentences, assessor tone)",
    "  overallScore: number (integer 1–10)",
    "  criteriaScores: array of objects — each { name: string (must match one of the criterion names above exactly), score: number (1–10 integer), comment: string (one sentence) }",
    "  annotations: array of objects — each { aspect: string, comment: string, quote?: string }",
    "  improvements: array of strings (3–5 actionable items)",
    "",
    "The criteriaScores array must include every criterion listed above, in that order.",
    "Be honest and specific. Reference the writer's actual wording in annotations when possible.",
    "No markdown, no commentary outside the JSON.",
  ].join("\n");
}

function escapePdfText(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\t/g, "  ");
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
    if (isGamsat(essayType)) {
      const taskB = essayType === "gamsat_reflective";
      const system = [
        `You are generating a GAMSAT Section 2 ${taskB ? "Task B (reflective/creative)" : "Task A (argumentative/socio-cultural)"} stimulus for an adult sitting the graduate medical admissions test.`,
        "The stimulus is a set of FOUR short quotations that all explore a single common theme, exactly like the real GAMSAT.",
        taskB
          ? "Choose a personal, emotional or social theme (e.g. memory, fear, belonging, change)."
          : "Choose a socio-cultural or ideas-based theme (e.g. power, progress, freedom, truth).",
        "Return ONLY a valid JSON object with a single key:",
        "  prompt: string — a one-line theme label, then the four quotations each on its own line prefixed with a dash and followed by an attribution. Finish with a one-line instruction to write a considered piece in response to the theme.",
        "No markdown, no commentary outside the JSON.",
      ].join("\n");
      rawText = await callClaude(system, `Generate a GAMSAT Section 2 ${taskB ? "Task B" : "Task A"} quotation stimulus.`);
    } else if (essayType === "narrative") {
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
    const detail = err instanceof Error ? err.message : "unknown error";
    res.status(502).json({ error: "Failed to reach Claude API", detail: detail.slice(0, 400) });
    return;
  }

  const parsed = extractJson(rawText) as { prompt?: string; imageQuery?: string } | null;
  if (!parsed?.prompt) {
    res.status(500).json({
      error: "Could not parse prompt from AI response",
      detail: rawText ? rawText.slice(0, 200) : "(empty)",
    });
    return;
  }

  let imageUrl: string | undefined;
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  if (essayType === "narrative" && parsed.imageQuery && unsplashKey) {
    try {
      const query = encodeURIComponent(parsed.imageQuery);
      const imgRes = await fetch(`https://api.unsplash.com/photos/random?query=${query}&orientation=landscape`, {
        headers: { Authorization: `Client-ID ${unsplashKey}` },
      });
      if (imgRes.ok) {
        const imgData = (await imgRes.json()) as { urls?: { regular?: string } };
        imageUrl = imgData?.urls?.regular;
      }
    } catch {
      /* image optional */
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

  const modeStr = typeof mode === "string" ? mode : "full_essay";
  if (isSubstantiallyEmpty(content, modeStr)) {
    res.json(EMPTY_SUBMISSION_RESPONSE);
    return;
  }

  const yearRange = YEAR_RANGES[subject] || "secondary school";
  const contentText = contentToPlainText(content, modeStr);

  const system = buildFeedbackSystem(essayType, yearRange);

  const imageNote = imageUrl ? `\n\nThe student was also shown a visual image prompt.` : "";
  const userMsg = [
    `Essay type: ${essayType}`,
    `Writing prompt given to the student: ${prompt}${imageNote}`,
    "",
    modeStr === "prompt_planner" ? "Student's planning notes:" : "Student's essay:",
    contentText,
  ].join("\n");

  let rawText: string;
  try {
    rawText = await callClaude(system, userMsg, 2800);
  } catch (err) {
    logger.error({ err }, "Failed to generate writing feedback");
    res.status(500).json({ error: "Failed to reach Claude API" });
    return;
  }

  type FeedbackShape = {
    overallImpression?: string;
    overallScore?: number;
    criteriaScores?: { name?: string; score?: number; comment?: string }[];
    annotations?: unknown[];
    improvements?: unknown[];
  };

  const parsed = extractJson(rawText) as FeedbackShape | null;
  if (!parsed?.overallImpression) {
    res.status(500).json({ error: "Could not parse feedback from AI response" });
    return;
  }

  const overallScore =
    typeof parsed.overallScore === "number" && Number.isFinite(parsed.overallScore)
      ? Math.min(10, Math.max(1, Math.round(parsed.overallScore)))
      : undefined;

  const criteriaScores = Array.isArray(parsed.criteriaScores)
    ? parsed.criteriaScores
        .filter(
          (c): c is { name: string; score: number; comment: string } =>
            typeof c?.name === "string" &&
            typeof c?.comment === "string" &&
            typeof c?.score === "number" &&
            Number.isFinite(c.score),
        )
        .map((c) => ({
          name: c.name,
          score: Math.min(10, Math.max(1, Math.round(c.score))),
          comment: c.comment,
        }))
    : [];

  res.json({
    overallImpression: parsed.overallImpression,
    ...(overallScore != null ? { overallScore } : {}),
    ...(criteriaScores.length > 0 ? { criteriaScores } : {}),
    annotations: parsed.annotations,
    improvements: parsed.improvements,
  });
});

async function requireBearer(req: Request, res: Response): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return authHeader.slice(7);
}

// POST /api/writing/report-pdf — stream PDF (no storage); owner, assigned tutor, or admin
router.post("/writing/report-pdf", async (req: Request, res: Response) => {
  try {
    const jwt = await requireBearer(req, res);
    if (!jwt) return;

    const { attemptId, studentDisplayName } = req.body as { attemptId?: string; studentDisplayName?: string };
    if (!attemptId || typeof attemptId !== "string") {
      res.status(400).json({ error: "attemptId required" });
      return;
    }

    const admin = getSupabaseService();
    const access = await loadWritingAttemptForViewer(admin, jwt, attemptId);
    if (!access) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { row } = access;
    const nameFromProfile =
      typeof studentDisplayName === "string" && studentDisplayName.trim()
        ? studentDisplayName.trim()
        : (await (async () => {
            const { data: p } = await admin
              .from("profiles")
              .select("display_name")
              .eq("id", row.user_id)
              .maybeSingle<{ display_name: string | null }>();
            return p?.display_name?.trim() || "Student";
          })());

    const feedback = row.feedback as Record<string, unknown> | null | undefined;
    const contentText = escapePdfText(contentToPlainText(row.content, row.mode));

    const generatedAt = new Date().toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="gradefarm-writing-report-${attemptId.slice(0, 8)}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    doc.pipe(res);

    doc.fontSize(18).text("GradeFarm — Writing report", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#444");
    doc.text(`Student: ${nameFromProfile}`);
    doc.text(`Report generated by: GradeFarm (Powered by Titanium Tutoring)`);
    doc.text(`Date: ${generatedAt}`);
    doc.text(`Subject band: ${row.subject} · ${row.essay_type} · ${row.mode.replace(/_/g, " ")}`);
    doc.fillColor("#000");
    doc.moveDown();

    doc.fontSize(12).text("Prompt", { underline: true });
    doc.fontSize(10).text(escapePdfText(row.prompt), { align: "left" });
    doc.moveDown();

    if (row.image_url) {
      doc.fontSize(10).fillColor("#666").text(`Image prompt URL: ${row.image_url}`);
      doc.fillColor("#000");
      doc.moveDown(0.5);
    }

    doc.fontSize(12).text("Student submission", { underline: true });
    doc.fontSize(10).text(contentText || "(empty)", { align: "left" });
    doc.moveDown();

    if (feedback && typeof feedback === "object") {
      doc.fontSize(12).text("Assessment & feedback", { underline: true });
      doc.moveDown(0.3);

      if (typeof feedback.overallScore === "number") {
        doc.fontSize(11).text(`Overall score (1–10): ${feedback.overallScore}`, { continued: false });
        doc.moveDown(0.3);
      }
      if (Array.isArray(feedback.criteriaScores) && feedback.criteriaScores.length > 0) {
        doc.fontSize(11).text("Criterion scores:");
        for (const c of feedback.criteriaScores as { name?: string; score?: number; comment?: string }[]) {
          if (typeof c?.name === "string") {
            doc.fontSize(10).text(` • ${c.name}${typeof c.score === "number" ? ` — ${c.score}/10` : ""}`);
            if (typeof c.comment === "string") doc.fontSize(9).fillColor("#333").text(`   ${c.comment}`);
            doc.fillColor("#000");
          }
        }
        doc.moveDown(0.5);
      }
      if (typeof feedback.overallImpression === "string") {
        doc.fontSize(11).text("Overall impression");
        doc.fontSize(10).text(escapePdfText(feedback.overallImpression));
        doc.moveDown(0.5);
      }
      if (Array.isArray(feedback.annotations) && feedback.annotations.length > 0) {
        doc.fontSize(11).text("Specific feedback");
        for (const a of feedback.annotations as { aspect?: string; comment?: string; quote?: string }[]) {
          if (typeof a?.aspect === "string") {
            doc.fontSize(10).text(a.aspect, { underline: false });
            if (typeof a.quote === "string") doc.fontSize(9).fillColor("#555").text(`  “${escapePdfText(a.quote)}”`);
            if (typeof a.comment === "string") doc.fontSize(10).fillColor("#000").text(escapePdfText(a.comment));
          }
        }
        doc.moveDown(0.5);
      }
      if (Array.isArray(feedback.improvements) && feedback.improvements.length > 0) {
        doc.fontSize(11).text("What to improve next time");
        for (const imp of feedback.improvements) {
          if (typeof imp === "string") doc.fontSize(10).text(` • ${escapePdfText(imp)}`);
        }
      }
      if (feedback.emptySubmission === true) {
        doc.moveDown(0.5);
        doc.fontSize(9).fillColor("#92400e").text("Note: No substantive text was submitted; scores reflect that.");
        doc.fillColor("#000");
      }
    } else {
      doc.fontSize(10).fillColor("#666").text("No feedback recorded for this attempt yet.");
      doc.fillColor("#000");
    }

    doc.end();
  } catch (err) {
    logger.error({ err }, "writing report-pdf failed");
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate PDF" });
  }
});

export default router;
