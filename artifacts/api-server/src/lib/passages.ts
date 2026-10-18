import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
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
 * Model for passages and their questions. Passages are long-form writing where
 * quality is the point, so this defaults to a stronger model than the bank's
 * standalone-question model. Override with AI_PASSAGE_MODEL.
 */
export const CLAUDE_PASSAGE_MODEL = process.env.AI_PASSAGE_MODEL || "claude-opus-5-5";

/** Exam-realistic length for a passage, by cohort. */
export function passageLengthTarget(levelLabel?: string): { minWords: number; maxWords: number; poemLines: [number, number] } {
  const year = Number((levelLabel || "").match(/year\s*(\d+)/i)?.[1]);
  if (year && year <= 4) return { minWords: 300, maxWords: 450, poemLines: [14, 24] };
  if (year && year <= 6) return { minWords: 450, maxWords: 700, poemLines: [20, 36] };
  return { minWords: 550, maxWords: 850, poemLines: [24, 40] };
}

/** Words in a passage body (poems: counted the same way). */
export function countWords(text: string): number {
  return (text.match(/[A-Za-z0-9’'-]+/g) || []).length;
}

/** Non-empty lines in a poem body. */
export function countLines(text: string): number {
  return text.split("\n").filter((l) => l.trim()).length;
}

const GENRES = [
  "narrative fiction (a scene with characters, dialogue and a turning point)",
  "informative non-fiction (an article about a real-world topic, with subheadings)",
  "persuasive text (an opinion piece or speech arguing a position)",
  "poem (with imagery and figurative language)",
  "diary entry or letter",
  "biography or historical recount",
  "procedural or explanatory text (how something works)",
];

let anthropic: Anthropic | null = null;
function client(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined,
    });
  }
  return anthropic;
}

/** One Claude call; returns the text output. Server-side fallback covers safety declines. */
async function ask(system: string, user: string): Promise<string> {
  const message = await client().beta.messages
    .stream({
      model: CLAUDE_PASSAGE_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: user }],
    })
    .finalMessage();
  if (message.stop_reason === "refusal") throw new Error("The model declined to write this passage");
  if (message.stop_reason === "max_tokens") throw new Error("Passage generation ran out of output tokens");
  return message.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

/** Parse "TITLE: …\nKIND: prose|poem\n---\n<body>" output. */
export function parsePassage(raw: string): PassageSet["passage"] | null {
  const m = raw.match(/TITLE:\s*(.+)\n\s*KIND:\s*(prose|poem)\s*\n-{3,}\s*\n([\s\S]+)$/i);
  if (!m) return null;
  return { title: m[1].trim(), kind: m[2].toLowerCase() === "poem" ? "poem" : "prose", body: m[3].trim() };
}

async function writePassage(opts: {
  subjectName: string;
  levelLabel?: string;
  topicName: string;
  subtopicName: string;
  genre: string;
  examContext?: string;
  extraSystemLines?: string[];
}): Promise<PassageSet["passage"]> {
  const len = passageLengthTarget(opts.levelLabel);
  const audience = opts.levelLabel ? `${opts.levelLabel} students` : `students studying ${opts.subjectName}`;
  const system = [
    `You write reading-comprehension passages for ${audience} preparing for school reading assessments and selective-school entry exams (${opts.subjectName}).`,
    "The passage must read like one from a real exam paper: substantial, rich in detail, with enough depth to support inference, vocabulary-in-context, tone and structure questions — not a short paragraph.",
    `Length: prose ${len.minWords}–${len.maxWords} words in 4–8 paragraphs; a poem ${len.poemLines[0]}–${len.poemLines[1]} lines in stanzas.`,
    "Original writing only — never reproduce published or copyrighted text.",
    "Vocabulary should stretch a capable student at this level, with a few less-common words whose meaning can be worked out from context.",
    "Output format, exactly, with nothing before or after:",
    "TITLE: <title>",
    "KIND: prose   (or: KIND: poem)",
    "---",
    "<the passage, paragraphs or stanzas separated by blank lines>",
    ...(opts.examContext ? ["Notes from the curriculum admin about the real assessment (follow them):", opts.examContext] : []),
    ...(opts.extraSystemLines || []),
  ].join("\n");
  const user = `Write one ${opts.genre} suited to practising "${opts.subtopicName}" (topic: ${opts.topicName}).`;

  let raw = await ask(system, user);
  let passage = parsePassage(raw);
  const tooShort = (p: PassageSet["passage"] | null) =>
    !p || (p.kind === "poem" ? countLines(p.body) < len.poemLines[0] : countWords(p.body) < len.minWords);
  if (tooShort(passage)) {
    const got = passage
      ? passage.kind === "poem" ? `${countLines(passage.body)} lines` : `${countWords(passage.body)} words`
      : "not in the required format";
    raw = await ask(
      system,
      `${user}\n\nA previous attempt was ${got}. Write a new, complete passage that meets the length and format requirements.`,
    );
    passage = parsePassage(raw);
  }
  if (!passage) throw new Error("Passage was not in the expected TITLE/KIND/--- format");
  if (tooShort(passage)) {
    logger.warn(
      { subtopic: opts.subtopicName, words: countWords(passage.body), lines: countLines(passage.body) },
      "[passages] passage still below target length after retry",
    );
  }
  return passage;
}

async function writeQuestions(opts: {
  passage: PassageSet["passage"];
  levelLabel?: string;
  subtopicName: string;
  difficultyInstruction?: string;
}): Promise<PassageQuestion[]> {
  const system = [
    `You write multiple-choice reading-comprehension questions in the style of selective-school entry and ${opts.levelLabel || "school"} reading exams.`,
    "Return ONLY a valid JSON array. No markdown, no commentary outside the array.",
    `Exactly ${QUESTIONS_PER_PASSAGE} objects, each with: question (string), options (array of exactly 4 strings), answer_index (integer 0–3), solution (string, 1–3 sentences pointing to the evidence in the passage), difficulty (integer 1–5).`,
    "Every question must be answerable only from the passage, with exactly one defensible answer and plausible distractors.",
    `Weight the set towards "${opts.subtopicName}", but mix in other skills: literal retrieval, inference, vocabulary in context, author's purpose / tone, main idea, text structure.`,
    "Refer to paragraphs or lines where helpful (e.g. \"In paragraph 3, …\").",
    opts.difficultyInstruction || "Vary difficulty from 1 (literal) to 5 (subtle inference).",
  ].join("\n");
  const user = `PASSAGE${opts.passage.title ? ` — "${opts.passage.title}"` : ""}:\n\n${opts.passage.body}\n\nWrite the ${QUESTIONS_PER_PASSAGE} questions.`;
  return extractJsonArray(await ask(system, user)) as PassageQuestion[];
}

/**
 * Generate `sets` passage sets: write each passage on its own (with an
 * enforced minimum length), then its questions, then verify every answer key
 * against the passage. Sets left with fewer than two questions are dropped.
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
  const start = Math.floor(Math.random() * GENRES.length);
  const results = await Promise.all(
    Array.from({ length: opts.sets }, async (_, i): Promise<PassageSet | null> => {
      const passage = await writePassage({ ...opts, genre: GENRES[(start + i) % GENRES.length] });
      const questions = await writeQuestions({
        passage,
        levelLabel: opts.levelLabel,
        subtopicName: opts.subtopicName,
        difficultyInstruction: opts.difficultyInstruction,
      });
      if (!questions.length) return null;
      const verify = await filterVerifiedQuestions(questions, { stimulus: passage.body });
      if (verify.dropped || verify.fixed || verify.errored) {
        logger.info(
          { subtopic: opts.subtopicName, generated: questions.length, kept: verify.kept.length,
            dropped: verify.dropped, fixed: verify.fixed, errored: verify.errored },
          "[passages] answer-key verification adjusted a set",
        );
      }
      return verify.kept.length >= 2 ? { passage, questions: verify.kept } : null;
    }),
  );
  return results.filter((r): r is PassageSet => r !== null);
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
