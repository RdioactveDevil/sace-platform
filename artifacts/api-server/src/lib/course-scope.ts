import type { SupabaseClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL, CLAUDE_THINKING } from "./anthropic-model";
import { logger } from "./logger";

// Keeping questions on the course (supabase/migrations/20261102000001_course_scope.sql).
//
// Each subtopic can carry its official key ideas (curriculum_subtopics.scope)
// and each subject a list of what the course leaves out (curricula.out_of_scope).
// The generators add both to their prompts (scopePromptLines), and a course
// check (checkScope / filterInScope) asks the AI whether each question stays
// inside them: before a generated question enters the bank, and when an admin
// audits a subject's bank. With no scope written for a subject there is
// nothing to check against, so the check passes everything.
//
// A subtopic's scope also lists the topics that come after it in the course
// (`laterTopics`, from the topics' order): a question on "The graph of y² = x"
// mustn't rely on differentiation, which the course teaches later.

export type Scope = {
  subject: string;
  level: string;
  outOfScope: string;
  topic: string;
  subtopic: string;
  scope: string;
  /** Topics the course teaches after this subtopic's topic, in order. */
  laterTopics?: string[];
};

export const hasScope = (s: Pick<Scope, "outOfScope" | "scope" | "laterTopics"> | null | undefined): boolean =>
  !!s && !!(s.outOfScope.trim() || s.scope.trim() || s.laterTopics?.length);

/** Names of the topics after the one at `order` in a course, from its topics' order. */
export function topicsAfter(topics: { name: string; order_index: number | null }[], order: number | null | undefined): string[] {
  if (order == null) return [];
  return topics.filter((t) => (t.order_index ?? -1) > order)
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)).map((t) => t.name);
}

async function courseTopics(admin: SupabaseClient, curriculumId: string): Promise<{ id: string; name: string; order_index: number | null }[]> {
  const { data, error } = await admin.from("curriculum_topics").select("id, name, order_index").eq("curriculum_id", curriculumId);
  return error ? [] : ((data || []) as { id: string; name: string; order_index: number | null }[]);
}

/** A subtopic's id from its subject and name (questions store the name). Null if not found. */
export async function subtopicIdFor(admin: SupabaseClient, curriculumId: string | null | undefined, subtopic: string | null | undefined): Promise<string | null> {
  if (!curriculumId || !subtopic) return null;
  const { data, error } = await admin.from("curriculum_subtopics").select("id").eq("curriculum_id", curriculumId).eq("name", subtopic).limit(1);
  return error || !data?.length ? null : (data[0] as { id: string }).id;
}

const SCOPE_MODEL = process.env.AI_SCOPE_MODEL || CLAUDE_MODEL;
const BATCH = 8;

type SubRow = {
  name: string;
  scope: string | null;
  curriculum_id: string;
  topic: { name: string; order_index: number | null } | { name: string; order_index: number | null }[] | null;
  curricula: { name: string; level_label: string | null; out_of_scope: string | null } | { name: string; level_label: string | null; out_of_scope: string | null }[] | null;
};
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** The scope of one subtopic, with its subject's out-of-scope list. Null if it can't be read (e.g. before the migration). */
export async function scopeForSubtopic(admin: SupabaseClient, subtopicId: string | null | undefined): Promise<Scope | null> {
  if (!subtopicId) return null;
  const { data, error } = await admin
    .from("curriculum_subtopics")
    .select("name, scope, curriculum_id, topic:curriculum_topics(name, order_index), curricula(name, level_label, out_of_scope)")
    .eq("id", subtopicId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as SubRow;
  const c = one(r.curricula), t = one(r.topic);
  return {
    subject: c?.name || "",
    level: (c?.level_label || "").trim(),
    outOfScope: (c?.out_of_scope || "").trim(),
    topic: t?.name || "",
    subtopic: r.name,
    scope: (r.scope || "").trim(),
    laterTopics: topicsAfter(await courseTopics(admin, r.curriculum_id), t?.order_index),
  };
}

/** Every subtopic's scope in a subject, by subtopic id. */
export async function scopesForCurriculum(admin: SupabaseClient, curriculumId: string): Promise<{ subject: string; level: string; outOfScope: string; bySubtopic: Map<string, Scope> } | null> {
  const { data: cur, error: cErr } = await admin.from("curricula").select("name, level_label, out_of_scope").eq("id", curriculumId).maybeSingle();
  if (cErr || !cur) return null;
  const { data: subs, error: sErr } = await admin
    .from("curriculum_subtopics").select("id, name, scope, topic:curriculum_topics(name, order_index)").eq("curriculum_id", curriculumId);
  if (sErr) return null;
  const subject = cur.name as string, level = ((cur.level_label as string) || "").trim(), outOfScope = ((cur.out_of_scope as string) || "").trim();
  const topics = await courseTopics(admin, curriculumId);
  const bySubtopic = new Map<string, Scope>();
  for (const s of (subs || []) as unknown as { id: string; name: string; scope: string | null; topic: { name: string; order_index: number | null } | { name: string; order_index: number | null }[] | null }[]) {
    const t = one(s.topic);
    bySubtopic.set(s.id, { subject, level, outOfScope, topic: t?.name || "", subtopic: s.name, scope: (s.scope || "").trim(), laterTopics: topicsAfter(topics, t?.order_index) });
  }
  return { subject, level, outOfScope, bySubtopic };
}

/** Lines for a generator's system prompt. Empty when there's no scope. */
export function scopePromptLines(s: Scope | null): string[] {
  if (!hasScope(s)) return [];
  const course = [s!.subject, s!.level].filter(Boolean).join(", ");
  return [
    `COURSE SCOPE — from the official course document for ${course}. Every question must stay inside it; a question that needs anything outside it will be rejected.`,
    ...(s!.scope ? [`What "${s!.subtopic}" covers in this course:`, s!.scope] : []),
    ...(s!.outOfScope ? ["NOT in this course — never test, use or rely on any of these:", s!.outOfScope] : []),
    ...(s!.laterTopics?.length ? [
      `The student is at "${s!.topic} > ${s!.subtopic}". These topics come LATER in the course and haven't been taught yet, so never use or rely on their methods or notation (in the question, the options, a hint or the solution): ${s!.laterTopics.join("; ")}.`,
      "Use only this subtopic's ideas and what comes before it in the course. Don't bring in a more advanced method to explain or answer it.",
    ] : []),
  ];
}

export type ScopeItem = { question: string; options?: string[] | null; solution?: string | null; scope: Scope };
export type ScopeVerdict = { inScope: boolean; reason: string; errored?: boolean };

function describeItem(item: ScopeItem, i: number): string {
  const s = item.scope;
  const opts = Array.isArray(item.options) && item.options.length ? `\nOptions: ${item.options.join(" | ")}` : "";
  const sol = item.solution ? `\nWorked solution: ${String(item.solution).slice(0, 900)}` : "";
  return [
    `### Q${i}`,
    `Subtopic: ${s.topic} > ${s.subtopic}`,
    s.scope ? `Subtopic scope:\n${s.scope}` : "Subtopic scope: (not written; judge by the subject-wide exclusions only)",
    s.laterTopics?.length ? `Not yet taught at this point (later topics): ${s.laterTopics.join("; ")}` : "",
    `Question: ${item.question}${opts}${sol}`,
  ].filter(Boolean).join("\n");
}

async function callClaude(system: string, user: string, maxTokens: number): Promise<string> {
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
  const r = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: SCOPE_MODEL, thinking: CLAUDE_THINKING, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const body = (await r.json()) as { content?: { type: string; text?: string }[] };
  return (body.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("");
}

/** Pulls the JSON array out of a reply, or null. */
export function parseVerdicts(text: string, count: number): ScopeVerdict[] | null {
  const start = text.indexOf("["), end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  let arr: unknown;
  try { arr = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  if (!Array.isArray(arr)) return null;
  const out: (ScopeVerdict | null)[] = new Array(count).fill(null);
  for (const v of arr as { q?: unknown; in?: unknown; reason?: unknown }[]) {
    const i = typeof v?.q === "number" ? v.q : Number(String(v?.q ?? "").replace(/\D/g, ""));
    if (!Number.isInteger(i) || i < 0 || i >= count) continue;
    out[i] = { inScope: v.in !== false, reason: typeof v.reason === "string" ? v.reason.slice(0, 400) : "" };
  }
  return out.every(Boolean) ? (out as ScopeVerdict[]) : null;
}

const CHECK_SYSTEM = [
  "You check whether practice questions stay inside a school course, using the course scope you are given (taken from the official course document).",
  "A question is OUT only when answering it needs a concept, method, rule or notation that the course leaves out, or that clearly belongs to a different subject or level. Name that concept in the reason.",
  "It is also OUT when answering it, or the method its stem or solution teaches, needs a topic listed as not yet taught at that point (e.g. differentiation in a question on sketching a parabola). Name that topic in the reason.",
  "It is IN when it practises the subtopic's key ideas, or uses ordinary earlier knowledge a student of this course is expected to have (arithmetic, algebra, earlier-year content), even if the scope doesn't list that knowledge.",
  "Do not judge correctness, difficulty or style here. Only whether it is on the course.",
  'Reply with ONLY a JSON array, one entry per question: [{"q": 0, "in": true, "reason": ""}, {"q": 1, "in": false, "reason": "Needs inverse functions, which this course leaves out."}]. Keep reasons to one plain sentence.',
].join("\n");

/** Checks items against their scope, a batch at a time. On an AI error the batch counts as in scope (errored: true), so a hiccup never deletes or blocks questions. */
export async function checkScope(items: ScopeItem[], { concurrency = 3 }: { concurrency?: number } = {}): Promise<ScopeVerdict[]> {
  const results: ScopeVerdict[] = new Array(items.length);
  const todo: number[] = [];
  items.forEach((it, i) => { if (hasScope(it.scope)) todo.push(i); else results[i] = { inScope: true, reason: "" }; });
  const batches: number[][] = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const idx = batches[next++];
      const first = items[idx[0]].scope;
      const course = [first.subject, first.level].filter(Boolean).join(", ");
      const user = [
        `Course: ${course}`,
        first.outOfScope ? `Not in this course:\n${first.outOfScope}` : "Not in this course: (no list given)",
        "",
        ...idx.map((qi, k) => describeItem(items[qi], k)),
      ].join("\n\n");
      try {
        const verdicts = parseVerdicts(await callClaude(CHECK_SYSTEM, user, 1500), idx.length);
        if (!verdicts) throw new Error("unreadable reply");
        idx.forEach((qi, k) => { results[qi] = verdicts[k]; });
      } catch (err) {
        logger.warn({ err, course }, "[course-scope] check failed; letting the batch through");
        idx.forEach((qi) => { results[qi] = { inScope: true, reason: "", errored: true }; });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, batches.length)) }, worker));
  return results;
}

/** The generators' gate: drops questions the course check says are off the course. */
export async function filterInScope<T extends { question: string; options?: string[] | null; solution?: string | null }>(
  questions: T[],
  scope: Scope | null,
  context: Record<string, unknown> = {},
): Promise<{ kept: T[]; dropped: number; errored: number }> {
  if (!hasScope(scope) || process.env.CHECK_COURSE_SCOPE === "false" || !questions.length) return { kept: questions, dropped: 0, errored: 0 };
  const verdicts = await checkScope(questions.map((q) => ({ question: q.question, options: q.options, solution: q.solution, scope: scope! })));
  const kept = questions.filter((_, i) => verdicts[i].inScope);
  const dropped = questions.length - kept.length;
  const errored = verdicts.filter((v) => v.errored).length;
  if (dropped) {
    logger.info({ ...context, dropped, reasons: verdicts.filter((v) => !v.inScope).map((v) => v.reason) }, "[course-scope] dropped off-course questions");
  }
  return { kept, dropped, errored };
}

/**
 * Reads a course document (PDF as base64, or pasted text) and writes the scope
 * for each subtopic in the tree, plus what the course leaves out.
 */
export async function extractScope(opts: {
  subject: string; level: string;
  subtopics: { id: string; topic: string; name: string }[];
  docBase64?: string; sourceText?: string;
}): Promise<{ outOfScope: string; subtopics: { id: string; scope: string }[] }> {
  const key = new Map(opts.subtopics.map((s, i) => [`s${i}`, s.id]));
  const tree = opts.subtopics.map((s, i) => `s${i}: ${s.topic} > ${s.name}`).join("\n");
  const system = [
    "You read an official school course document (a subject outline or study design) and write down what each subtopic of a question bank covers in that course.",
    "For each subtopic: 2 to 6 short dot points, each starting with \"- \", in the document's own terms: the key ideas, skills and methods students learn there. Only what the document says for this course and level; don't add content from other courses.",
    "Also list, subject-wide, what this course leaves out that a question writer might wrongly include: topics that belong to a different level or to a neighbouring course (e.g. another state's version), methods or notation the course doesn't use, and any calculator rules. Only list exclusions the document supports or clearly implies. One \"- \" line each.",
    "If a subtopic isn't covered by the document at all, give it an empty scope and mention it in outOfScope as \"- Not in the course document: <subtopic name>\".",
    'Reply with ONLY a JSON object: {"outOfScope": "- ...\\n- ...", "subtopics": [{"k": "s0", "scope": "- ...\\n- ..."}, ...]} with one entry per subtopic.',
  ].join("\n");
  const userText = `Course: ${opts.subject}${opts.level ? `, ${opts.level}` : ""}\n\nThe question bank's subtopics:\n${tree}${opts.sourceText ? `\n\nCourse document:\n---\n${opts.sourceText.slice(0, 120_000)}\n---` : ""}`;
  const content = opts.docBase64
    ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: opts.docBase64 } }, { type: "text", text: userText }]
    : userText;

  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
  const r = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01",
      ...(opts.docBase64 ? { "anthropic-beta": "pdfs-2024-09-25" } : {}),
    },
    body: JSON.stringify({ model: CLAUDE_MODEL, thinking: CLAUDE_THINKING, max_tokens: 16000, system, messages: [{ role: "user", content }] }),
  });
  if (!r.ok) throw new Error(`The AI couldn't read the document (${r.status}).`);
  const body = (await r.json()) as { content?: { type: string; text?: string }[] };
  const text = (body.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("");
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  let parsed: { outOfScope?: unknown; subtopics?: { k?: unknown; scope?: unknown }[] } = {};
  try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { throw new Error("The AI's answer couldn't be read. Try again."); }
  const subtopics = (Array.isArray(parsed.subtopics) ? parsed.subtopics : [])
    .map((s) => ({ id: key.get(String(s?.k)), scope: typeof s?.scope === "string" ? s.scope.trim() : "" }))
    .filter((s): s is { id: string; scope: string } => !!s.id);
  return { outOfScope: typeof parsed.outOfScope === "string" ? parsed.outOfScope.trim() : "", subtopics };
}
