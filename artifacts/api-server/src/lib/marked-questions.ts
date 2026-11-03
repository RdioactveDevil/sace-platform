import type { SupabaseClient } from "@supabase/supabase-js";
import { CLAUDE_MARK_MODEL, CLAUDE_MARKED_GEN_MODEL } from "./anthropic-model";
import { askForJson, markAnswer, sanitizeScheme, schemeTotal, type MarkPoint } from "./marking";
import { fetchExemplarContext, exemplarSystemLines } from "./curriculum-exemplars";
import { scopeForSubtopic, scopePromptLines } from "./course-scope";
import { normalizeMathText } from "./normalize-math";
import { logger } from "./logger";
import { LEARNING_OBJECTIVES } from "../routes/generate-questions";
import { buildStructures, chemDiagramColumn, chemPromptLines, describeChemDiagram, isChemSubject, sanitizeChemFigure } from "./chem-figures";

/**
 * Writing 'marked' questions: SACE-style short-answer questions worth several
 * marks, each with a marking scheme and a model answer. Every question is
 * checked twice before it's saved: an independent check of the chemistry and
 * the scheme, and the real marker marking the model answer, which must earn
 * full marks (otherwise the scheme and the answer disagree).
 */

/** Most questions one request writes: the stronger model plus two checks each must fit in 300 s. */
export const MARKED_MAX_COUNT = 3;

type RawStructure = { smiles: string; label: string; formula: string; style: string };
type Draft = {
  question: string; total_marks: number; marking_scheme: MarkPoint[]; solution: string; difficulty: number;
  structures?: RawStructure[]; figure_json?: string; table_json?: string;
  diagram?: Record<string, unknown> | null; table_data?: Record<string, unknown> | null;
};

/** A data table from the model's table_json, or null. */
function parseTable(raw: unknown): Record<string, unknown> | null {
  let t: unknown = raw;
  if (typeof raw === "string") { if (!raw.trim()) return null; try { t = JSON.parse(raw); } catch { return null; } }
  if (!t || typeof t !== "object") return null;
  const o = t as { headers?: unknown; rows?: unknown; caption?: unknown };
  if (!Array.isArray(o.headers) || !Array.isArray(o.rows) || !o.headers.length) return null;
  const cell = (v: unknown) => normalizeMathText(String(v ?? "").slice(0, 80)) as string;
  return {
    headers: o.headers.slice(0, 8).map(cell),
    rows: o.rows.slice(0, 20).filter(Array.isArray).map((r) => (r as unknown[]).slice(0, 8).map(cell)),
    ...(o.caption ? { caption: String(o.caption).slice(0, 80) } : {}),
  };
}

/** What the question shows besides its text (table, structures, graph), for the checker and the marker. */
function shownWith(d: Pick<Draft, "diagram" | "table_data">): string {
  const parts: string[] = [];
  if (d.table_data) {
    const t = d.table_data as { headers: string[]; rows: string[][]; caption?: string };
    parts.push(`${t.caption || "Table"}:\n${[t.headers.join(" | "), ...t.rows.map((r) => r.join(" | "))].join("\n")}`);
  }
  const fig = describeChemDiagram(d.diagram);
  if (fig) parts.push(fig);
  return parts.join("\n\n");
}

const GENERATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "total_marks", "marking_scheme", "solution", "difficulty", "structures", "figure_json", "table_json"],
        properties: {
          question: { type: "string" },
          structures: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["smiles", "label", "formula", "style"],
              properties: {
                smiles: { type: "string" },
                label: { type: "string" },
                formula: { type: "string" },
                style: { type: "string", enum: ["skeletal", "full"] },
              },
            },
          },
          figure_json: { type: "string", description: "A graph or TLC plate as a JSON string, or \"\" for none" },
          table_json: { type: "string", description: "A data table as a JSON string, or \"\" for none" },
          total_marks: { type: "integer" },
          marking_scheme: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["marks", "point", "guidance"],
              properties: {
                marks: { type: "integer" },
                point: { type: "string" },
                guidance: { type: "string" },
              },
            },
          },
          solution: { type: "string" },
          difficulty: { type: "integer" },
        },
      },
    },
  },
} as const;

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "problems"],
  properties: {
    ok: { type: "boolean" },
    problems: { type: "string", description: "Empty when ok; otherwise what is wrong, briefly" },
  },
} as const;

export type MarkedTarget = {
  curriculumId: string;
  subject: string;
  levelLabel: string;
  examContext: string;
  topic: string;
  subtopic: string;
  subtopicId: string;
};

/** The curriculum, topic and subtopic a subtopic id belongs to, or null. */
export async function loadMarkedTarget(admin: SupabaseClient, subtopicId: string): Promise<MarkedTarget | null> {
  const { data: sub } = await admin
    .from("curriculum_subtopics").select("id, name, topic_id").eq("id", subtopicId).maybeSingle();
  if (!sub) return null;
  const { data: topic } = await admin
    .from("curriculum_topics").select("id, name, curriculum_id").eq("id", (sub as { topic_id: string }).topic_id).maybeSingle();
  if (!topic) return null;
  const { data: curr } = await admin
    .from("curricula").select("*").eq("id", (topic as { curriculum_id: string }).curriculum_id).maybeSingle();
  if (!curr) return null;
  const c = curr as { id: string; name: string; level_label?: string | null; exam_context?: string | null };
  return {
    curriculumId: c.id,
    subject: c.name,
    levelLabel: (c.level_label || "").trim(),
    examContext: typeof c.exam_context === "string" ? c.exam_context.trim().slice(0, 3000) : "",
    topic: (topic as { name: string }).name,
    subtopic: (sub as { name: string }).name,
    subtopicId: (sub as { id: string }).id,
  };
}

function difficultyLine(difficulty: number | "mixed"): string {
  if (difficulty === "mixed") return "Vary difficulty across the questions (2 to 5).";
  return `Pitch every question at difficulty ${difficulty} out of 5.`;
}

async function writeDrafts(t: MarkedTarget, count: number, difficulty: number | "mixed", admin: SupabaseClient): Promise<Draft[]> {
  const exemplars = await fetchExemplarContext(admin, t.subject, t.subtopic);
  const scope = await scopeForSubtopic(admin, t.subtopicId);
  const { data: existing } = await admin
    .from("questions").select("question")
    .eq("subject", t.subject).eq("subtopic", t.subtopic).eq("question_type", "marked").limit(40);
  const existingList = ((existing ?? []) as { question: string }[])
    .slice(0, 15).map((r, i) => `${i + 1}. ${(r.question || "").slice(0, 160)}`).join("\n");
  const objective = LEARNING_OBJECTIVES[t.subtopic] || t.subtopic;

  const system = [
    `You write short-answer exam questions for ${t.subject}${t.levelLabel ? ` (${t.levelLabel})` : ""}, in the style of the SACE end-of-year exam, with a marking scheme of the kind SACE assessors mark to.`,
    "Each question is answered in writing (sentences, working, equations), not multiple choice.",
    "Questions:",
    "  - Worth 2 to 6 marks. Use SACE command words (State, Identify, Describe, Explain, Calculate, Deduce, Justify, Write an equation for) and make the marks fit the command word: State/Identify is 1 mark per item; Explain needs a cause and an effect; Calculate needs working.",
    "  - Usually a short scenario (an experiment, an industrial process, data) followed by the task. Give every number and fact the student needs. Put the mark total at the end in brackets, e.g. \"(3 marks)\".",
    "  - One task per question (no parts a, b, c).",
    "Marking scheme (marking_scheme):",
    "  - One entry per mark point, in the order a good answer would reach them, and the marks add up exactly to total_marks.",
    "  - Each point is one thing an assessor can check on its own: a correct substance named, a correct equation, a correct mole ratio used, a correct link between a cause and an effect, a final answer with correct units and significant figures.",
    "  - point says what earns the mark. guidance says what else to accept, what not to accept, and, for calculations, that later method marks follow through from an earlier error.",
    "Model answer (solution): a full-marks answer, written as a strong Year 12 student would write it in the exam, with working for calculations. Every mark point must be visibly earned by it.",
    "Write chemical formulae and equations as $\\ce{...}$ (e.g. $\\ce{CaCO3(s) + 2HCl(aq) -> CaCl2(aq) + H2O(l) + CO2(g)}$), quantities and units in $...$ where they contain maths (e.g. $0.0250\\ \\text{mol L}^{-1}$), and never use Unicode subscripts or arrows.",
    "Check every number yourself: solve each question completely before writing its scheme.",
    "difficulty is 1 to 5, calibrated to the real exam: 3 is a mid-paper question, 5 the hardest questions on the paper.",
    ...(isChemSubject(t.subject)
      ? chemPromptLines({
          figureAsJsonString: true,
          writtenAnswers: true,
          tableKey: "table_json (a JSON string: { \"caption\": \"Table 1\", \"headers\": [\"Trial 1\", \"Trial 2\"], \"rows\": [[\"17.46\", \"16.93\"]] }, or \"\")",
        })
      : ["structures is always [], figure_json is always \"\". Use table_json (a JSON string { \"caption\", \"headers\", \"rows\" }, or \"\") only for a data table the question needs."]),
    ...(t.examContext ? ["Notes from the curriculum admin about the real exam (follow them):", t.examContext] : []),
    ...exemplarSystemLines(t.subject, exemplars),
    ...scopePromptLines(scope),
  ].join("\n");

  const user = [
    `Write ${count} question${count === 1 ? "" : "s"} for the topic "${t.topic}", subtopic "${t.subtopic}".`,
    `What this subtopic covers: ${objective}`,
    difficultyLine(difficulty),
    "Use a different scenario and skill for each question.",
    ...(existingList ? ["", "These already exist; write questions that are clearly different from them:", existingList] : []),
  ].join("\n");

  const out = await askForJson<{ questions?: Draft[] }>({
    model: CLAUDE_MARKED_GEN_MODEL,
    system,
    user,
    schema: GENERATE_SCHEMA as unknown as Record<string, unknown>,
    effort: "high",
    maxTokens: 32000,
    timeoutMs: 200_000,
  });
  return Array.isArray(out.questions) ? out.questions.slice(0, count) : [];
}

/** An independent check of the chemistry and the marking scheme. */
async function checkDraft(t: MarkedTarget, d: Draft, scheme: MarkPoint[]): Promise<{ ok: boolean; problems: string }> {
  const system = [
    `You are a senior SACE ${t.subject} assessor checking a new exam question and its marking scheme before students see it.`,
    "Solve the question yourself first, from scratch. Then check:",
    "  1. The question is correct, complete and unambiguous, and gives everything needed to answer it.",
    "  2. The model answer is scientifically correct, and every number in it is right.",
    "  3. The marking scheme credits what the question asks for, each point can be checked on its own, and the marks suit the command word.",
    `  4. It stays within ${t.subject}${t.levelLabel ? ` (${t.levelLabel})` : ""}.`,
    "Set ok to false for any real error, not for matters of style.",
  ].join("\n");
  const shown = shownWith(d);
  const user = [
    `QUESTION (${schemeTotal(scheme)} marks):`, d.question, "",
    ...(shown ? [shown, "Check that what is shown agrees with the question text and that any structure is the substance the question says it is.", ""] : []),
    "MARKING SCHEME:", ...scheme.map((p, i) => `${i + 1}. [${p.marks}] ${p.point}${p.guidance ? ` (Guidance: ${p.guidance})` : ""}`), "",
    "MODEL ANSWER:", d.solution,
  ].join("\n");
  return askForJson<{ ok: boolean; problems: string }>({
    model: CLAUDE_MARK_MODEL, system, user,
    schema: CHECK_SCHEMA as unknown as Record<string, unknown>,
    effort: "medium", maxTokens: 12000,
  });
}

export type MarkedGenResult = {
  saved: Record<string, unknown>[];
  rejected: { question: string; reason: string }[];
};

/** Write, check and save up to MARKED_MAX_COUNT questions for one subtopic. */
export async function generateMarkedQuestions(
  admin: SupabaseClient,
  t: MarkedTarget,
  opts: { count: number; difficulty: number | "mixed" },
): Promise<MarkedGenResult> {
  const count = Math.max(1, Math.min(MARKED_MAX_COUNT, Math.round(opts.count) || 1));
  const drafts = await writeDrafts(t, count, opts.difficulty, admin);
  const rejected: MarkedGenResult["rejected"] = [];

  const checked = await Promise.all(drafts.map(async (raw) => {
    const question = normalizeMathText(String(raw.question || "")) as string;
    const solution = normalizeMathText(String(raw.solution || "")) as string;
    const scheme = sanitizeScheme((raw.marking_scheme || []).map((p) => ({
      ...p,
      point: normalizeMathText(p.point) as string,
      guidance: normalizeMathText(p.guidance || "") as string,
    })));
    if (!question.trim() || !solution.trim() || !scheme) {
      rejected.push({ question, reason: "Incomplete question, model answer or marking scheme" });
      return null;
    }
    const total = schemeTotal(scheme);
    if (Number(raw.total_marks) !== total) {
      rejected.push({ question, reason: `Mark points add up to ${total}, not the ${raw.total_marks} the question is worth` });
      return null;
    }
    // Structures are drawn from SMILES and checked against their formulas; a wrong one drops the question.
    const built = buildStructures(raw.structures);
    if (built.problems.length) {
      rejected.push({ question, reason: built.problems.join("; ") });
      return null;
    }
    const figure = sanitizeChemFigure(raw.figure_json);
    const d: Draft = {
      question, solution, marking_scheme: scheme, total_marks: total,
      difficulty: Math.min(5, Math.max(1, Math.round(Number(raw.difficulty)) || 3)),
      diagram: chemDiagramColumn(built.structures, figure),
      table_data: parseTable(raw.table_json),
    };
    try {
      const [check, selfMark] = await Promise.all([
        checkDraft(t, d, scheme),
        markAnswer({ subject: t.subject, question, marking_scheme: scheme, solution, diagram: d.diagram, table_data: d.table_data }, solution),
      ]);
      if (!check.ok) {
        rejected.push({ question, reason: `Check found a problem: ${check.problems || "not specified"}` });
        return null;
      }
      if (selfMark.awarded < selfMark.total) {
        rejected.push({ question, reason: `The model answer only earned ${selfMark.awarded} of ${selfMark.total} against its own scheme` });
        return null;
      }
      return d;
    } catch (err) {
      logger.warn({ err, subtopic: t.subtopic }, "[marked-questions] checking a question failed");
      rejected.push({ question, reason: "The checks couldn't run; not saved" });
      return null;
    }
  }));

  const now = new Date().toISOString();
  const rows = checked.filter((d): d is Draft => !!d).map((d) => ({
    id: `ai_marked_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    subject: t.subject,
    topic: t.topic,
    subtopic: t.subtopic,
    curriculum_id: t.curriculumId,
    subtopic_id: t.subtopicId,
    concept_tag: `${t.subject}|${t.topic}|${t.subtopic}`.toLowerCase(),
    difficulty: d.difficulty,
    question: d.question,
    options: null,
    answer_index: null,
    question_type: "marked",
    total_marks: d.total_marks,
    marking_scheme: d.marking_scheme,
    solution: d.solution,
    diagram: d.diagram ?? null,
    table_data: d.table_data ?? null,
    tip: null,
    created_at: now,
  }));
  if (!rows.length) return { saved: [], rejected };
  const { data, error } = await admin.from("questions").insert(rows).select("*");
  if (error) throw new Error(`Saving the questions failed: ${error.message}`);
  return { saved: data ?? [], rejected };
}
