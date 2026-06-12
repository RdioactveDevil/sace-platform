import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Distilled exemplar packs (from admin-uploaded reference resources — textbooks,
 * past exams, practice tests) act like permanent "project files": every
 * question-generation path fetches the packs for the subject + subtopic it is
 * generating for and injects them so new questions match the real material.
 *
 * Topic-scoped packs are preferred; subject-wide packs (subtopic IS NULL) act as
 * a fallback. The result is bounded by a character budget to protect token
 * usage. Returns "" when there are none (or the table hasn't been migrated yet).
 */
export async function fetchExemplarContext(
  admin: SupabaseClient,
  subject: string,
  subtopic: string,
  charBudget = 6000,
): Promise<string> {
  try {
    const { data } = await admin
      .from("curriculum_resource_exemplars")
      .select("content, subtopic")
      .eq("subject", subject)
      .eq("enabled", true)
      .limit(50);
    if (!data || !data.length) return "";
    const rows = data as { content: string; subtopic: string | null }[];
    const target = subtopic.trim().toLowerCase();
    const scoped = rows.filter((r) => (r.subtopic || "").trim().toLowerCase() === target);
    const subjectWide = rows.filter((r) => !r.subtopic);
    // Prefer topic-scoped exemplars; fall back to subject-wide ones.
    const picked: string[] = [];
    let used = 0;
    for (const r of [...scoped, ...subjectWide]) {
      const c = (r.content || "").trim();
      if (!c) continue;
      if (used + c.length > charBudget) break;
      picked.push(c);
      used += c.length;
    }
    return picked.join("\n\n---\n\n");
  } catch {
    return "";
  }
}

/**
 * The standard system-prompt lines that introduce an exemplar block. Returns []
 * when there is no exemplar context so callers can spread it unconditionally.
 */
export function exemplarSystemLines(curriculumLabel: string, exemplarContext: string): string[] {
  if (!exemplarContext) return [];
  return [
    `EXEMPLARS — sample questions and style notes distilled from official ${curriculumLabel} reference resources (textbooks, past exams, practice tests) for this topic. Match their depth, difficulty calibration, terminology, command words and formatting. Treat them as style/standard references only — do NOT copy any exemplar verbatim or reuse its exact numbers or scenario, and they must NEVER override the JSON output format rules above:`,
    exemplarContext,
  ];
}
