import type { SupabaseClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL } from "./anthropic-model";
import { extractJsonArray } from "./json-latex";
import { logger } from "./logger";
import { filterVerifiedQuestions } from "./verify-question";

// Reading-comprehension generation: one passage (or poem) shared by a handful
// of questions. Used for curriculum topics whose question_style is 'passage'.

export const QUESTIONS_PER_PASSAGE = 5;

export type PassageQuestion = {
  question: string;
  options: string[];
  answer_index: number;
  solution?: string;
  difficulty?: number;
};

export type PassageSet = {
  passage: { title: string; kind: "prose" | "poem"; body: string };
  questions: PassageQuestion[];
};

/** Look up a topic's question style; 'standard' if unknown or not migrated yet. */
export async function topicQuestionStyle(admin: SupabaseClient, topicId: string | null | undefined): Promise<"standard" | "passage"> {
  if (!topicId) return "standard";
  const { data } = await admin.from("curriculum_topics").select("*").eq("id", topicId).maybeSingle();
  return (data as { question_style?: string } | null)?.question_style === "passage" ? "passage" : "standard";
}

/**
 * Ask Claude for `sets` passages, each with `QUESTIONS_PER_PASSAGE` MCQs, then
 * verify every answer key against its own passage. Sets left with fewer than
 * two questions are dropped.
 */
export async function generatePassageSets(opts: {
  subjectName: string;
  levelLabel?: string;
  topicName: string;
  subtopicName: string;
  sets: number;
  examContext?: string;
  extraSystemLines?: string[];
  difficultyInstruction?: string;
}): Promise<PassageSet[]> {
  const level = (opts.levelLabel || "").trim();
  const audience = level ? `${level} students` : `students studying ${opts.subjectName}`;
  const system = [
    `You write reading-comprehension material for ${audience} (${opts.subjectName}).`,
    "Return ONLY a valid JSON array. No markdown, no commentary outside the array.",
    `The array must contain exactly ${opts.sets} object(s). Each object has:`,
    '  passage: { title (string), kind ("prose" or "poem"), body (string) }',
    `  questions: array of exactly ${QUESTIONS_PER_PASSAGE} objects, each with`,
    "    question (string), options (array of exactly 4 strings), answer_index (integer 0–3),",
    "    solution (string, 1–3 sentences quoting or pointing to the evidence in the passage), difficulty (integer 1–5)",
    "Passage rules:",
    "  - Original writing only — never reproduce published or copyrighted text.",
    `  - Pitched at ${audience}: vocabulary, themes and length to suit them (prose about 200–350 words; poems 12–24 lines).`,
    "  - Vary genre across sets: narrative, informative, persuasive, diary/letter, poem.",
    "  - Use blank lines between paragraphs (or stanzas). Do not number lines.",
    "Question rules:",
    "  - Every question must be answerable ONLY from the passage, with exactly one defensible answer.",
    "  - Mix skills: literal retrieval, inference, vocabulary in context, author's purpose / tone, main idea, text structure.",
    "  - Distractors must be plausible but clearly wrong on a careful reading.",
    opts.difficultyInstruction || "Vary difficulty from 1 (literal) to 5 (subtle inference).",
    ...(opts.examContext ? [
      `EXAM CONTEXT — notes from the curriculum admin about the real assessment. Follow them, but never break the JSON format above:`,
      opts.examContext,
    ] : []),
    ...(opts.extraSystemLines || []),
  ].join("\n");

  const user = [
    `Write ${opts.sets} reading passage set(s) for:`,
    `Subject: ${opts.subjectName}`,
    `Topic: ${opts.topicName}`,
    `Focus: ${opts.subtopicName}`,
  ].join("\n");

  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { content?: { text: string }[] };
  const raw = extractJsonArray(data?.content?.[0]?.text || "") as Partial<PassageSet>[];

  const out: PassageSet[] = [];
  for (const set of raw) {
    const body = typeof set?.passage?.body === "string" ? set.passage.body.trim() : "";
    const questions = Array.isArray(set?.questions) ? set.questions : [];
    if (!body || questions.length === 0) continue;
    const verify = await filterVerifiedQuestions(questions as PassageQuestion[], { stimulus: body });
    if (verify.dropped || verify.fixed || verify.errored) {
      logger.info(
        { subtopic: opts.subtopicName, generated: questions.length, kept: verify.kept.length,
          dropped: verify.dropped, fixed: verify.fixed, errored: verify.errored },
        "[passages] answer-key verification adjusted a set",
      );
    }
    if (verify.kept.length < 2) continue;
    out.push({
      passage: {
        title: String(set.passage?.title || "").trim(),
        kind: set.passage?.kind === "poem" ? "poem" : "prose",
        body,
      },
      questions: verify.kept,
    });
  }
  return out;
}

/**
 * Insert passage sets: each passage row, then its questions pointing at it.
 * Returns the inserted question rows with a `passage` object attached (for
 * callers that hand new questions straight back to the client).
 */
export async function insertPassageSets(
  admin: SupabaseClient,
  sets: PassageSet[],
  target: {
    table: "questions" | "draft_questions";
    subject: string;
    topic: string;
    subtopic: string;
    curriculumId?: string | null;
    subtopicId?: string | null;
    topicCode?: string;
  },
): Promise<Record<string, unknown>[]> {
  const inserted: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  for (const set of sets) {
    const { data: passageRow, error: pErr } = await admin
      .from("passages")
      .insert({
        curriculum_id: target.curriculumId ?? null,
        subtopic_id: target.subtopicId ?? null,
        title: set.passage.title,
        kind: set.passage.kind,
        body: set.passage.body,
      })
      .select("id, title, kind, body")
      .single();
    if (pErr || !passageRow) throw new Error(`Saving passage failed: ${pErr?.message || "no row"}`);

    const rows = set.questions.map((q) => {
      const common = {
        subject: target.subject,
        topic: target.topic,
        subtopic: target.subtopic,
        question: q.question,
        options: q.options,
        answer_index: q.answer_index,
        difficulty: q.difficulty || 3,
        passage_id: passageRow.id,
      };
      return target.table === "questions"
        ? {
            ...common,
            id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            concept_tag: `${target.subject}|${target.topic}|${target.subtopic}`.toLowerCase(),
            solution: q.solution || "",
            tip: null,
            created_at: now,
          }
        : {
            ...common,
            source: "ai_generated",
            topic_code: target.topicCode ?? null,
            solution: q.solution || null,
            status: "pending",
          };
    });
    const { error: qErr } = await admin.from(target.table).insert(rows);
    if (qErr) throw new Error(`Saving passage questions failed: ${qErr.message}`);
    for (const r of rows) inserted.push({ ...r, passage: passageRow });
  }
  return inserted;
}
