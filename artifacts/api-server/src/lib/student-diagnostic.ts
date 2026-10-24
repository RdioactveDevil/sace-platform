/**
 * Diagnostics for tutor-included subjects. Each subject a tutor includes for a
 * student (lib/included-subject.ts) comes with a 20-question diagnostic the
 * student does before practising it: a diagnostic_assessments row with
 * student_id and curriculum_id (one per student and subject), covering the
 * subtopics the tutor picked, or the whole curriculum. Its questions are
 * written on first use (routes/diagnostic.ts, POST /diagnostic/:token/prepare).
 * A tutor can waive it; leaving their roster drops it if it wasn't done.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { liveCurriculum } from "../routes/billing";

export type ScopeTopic = { topic: string; subtopics: string[] };

/**
 * The curriculum's topics and subtopics a diagnostic covers, in curriculum
 * order: those of `subtopicIds`, or every one when it's empty (or names none
 * of this curriculum's). `subtopicIds` comes back as the ones that matched
 * ([] for the whole curriculum).
 */
export async function diagnosticScope(
  admin: SupabaseClient, curriculumId: string, subtopicIds: string[],
): Promise<{ topics: ScopeTopic[]; subtopicIds: string[] }> {
  const { data: topics, error } = await admin
    .from("curriculum_topics").select("id, name").eq("curriculum_id", curriculumId).order("order_index");
  if (error) throw new Error(error.message);
  const topicRows = (topics ?? []) as { id: string; name: string }[];
  if (!topicRows.length) return { topics: [], subtopicIds: [] };
  const { data: subs, error: subErr } = await admin
    .from("curriculum_subtopics").select("id, topic_id, name").in("topic_id", topicRows.map((t) => t.id)).order("order_index");
  if (subErr) throw new Error(subErr.message);
  const subRows = (subs ?? []) as { id: string; topic_id: string; name: string }[];
  const wanted = new Set(subtopicIds);
  const chosen = subRows.filter((s) => wanted.has(s.id));
  const picked = chosen.length ? chosen : subRows;
  return {
    topics: topicRows
      .map((t) => ({ topic: t.name, subtopics: picked.filter((s) => s.topic_id === t.id).map((s) => s.name) }))
      .filter((t) => t.subtopics.length > 0 || !picked.length),
    subtopicIds: chosen.map((s) => s.id),
  };
}

/**
 * Set `studentId` a diagnostic on `curriculumId` from `tutorId`, covering
 * `subtopicIds` (empty: the whole curriculum). Does nothing if they already
 * have one on that subject.
 */
export async function createStudentDiagnostic(
  admin: SupabaseClient, tutorId: string, studentId: string, curriculumId: string, subtopicIds: string[] = [],
): Promise<void> {
  const { data: existing } = await admin
    .from("diagnostic_assessments").select("id")
    .eq("student_id", studentId).eq("curriculum_id", curriculumId).maybeSingle();
  if (existing) return;

  const cur = await liveCurriculum(admin, curriculumId);
  if (!cur) return;
  const [scope, { data: student }] = await Promise.all([
    diagnosticScope(admin, curriculumId, subtopicIds),
    admin.from("profiles").select("display_name").eq("id", studentId).maybeSingle<{ display_name: string | null }>(),
  ]);
  const { error } = await admin.from("diagnostic_assessments").insert({
    tutor_id: tutorId,
    student_id: studentId,
    curriculum_id: curriculumId,
    subtopic_ids: scope.subtopicIds,
    student_name: student?.display_name?.trim() || null,
    year_level: cur.stage || cur.label,
    subjects: [{ name: cur.label, topics: scope.topics.map((t) => t.topic) }],
    questions: [],
    status: "pending",
    score_max: 0,
  });
  if (error && error.code !== "23505") throw new Error(error.message); // 23505: set by another tutor meanwhile
}

/** Drop the diagnostic `tutorId` set `studentId` on a subject, if it hasn't been done. */
export async function deletePendingDiagnostic(admin: SupabaseClient, tutorId: string, studentId: string, curriculumId: string): Promise<void> {
  const { error } = await admin
    .from("diagnostic_assessments").delete()
    .eq("student_id", studentId).eq("curriculum_id", curriculumId).eq("tutor_id", tutorId).eq("status", "pending");
  if (error) throw new Error(error.message);
}

/** Let `studentId` practise a subject without doing its diagnostic. */
export async function waiveDiagnostic(admin: SupabaseClient, studentId: string, curriculumId: string): Promise<void> {
  const { error } = await admin
    .from("diagnostic_assessments").update({ waived_at: new Date().toISOString() })
    .eq("student_id", studentId).eq("curriculum_id", curriculumId).eq("status", "pending");
  if (error) throw new Error(error.message);
}

type ReportLike = {
  percentage: number;
  performance_band: string;
  topic_breakdown: { topic: string; percentage: number }[];
  subtopic_breakdown?: { topic: string; subtopic: string; percentage: number }[];
};

/**
 * What the student sees of their marked diagnostic: the overall result, the
 * topics they did well in and the ones to work on, and the subtopics to
 * practise first (weakest first). The tutor gets the full report.
 */
export function studentSummary(report: ReportLike) {
  const topics = [...(report.topic_breakdown ?? [])].sort((a, b) => a.percentage - b.percentage);
  const subtopics = [...(report.subtopic_breakdown ?? [])].sort((a, b) => a.percentage - b.percentage);
  const workOn = topics.filter((t) => t.percentage < 60).map((t) => t.topic);
  return {
    percentage: report.percentage,
    band: report.performance_band,
    strong: topics.filter((t) => t.percentage >= 75).reverse().map((t) => t.topic),
    work_on: workOn,
    // Weak subtopics, else the weakest topics, else the weakest topic.
    practise: subtopics.filter((s) => s.percentage < 60).map((s) => s.subtopic).slice(0, 6).concat(
      subtopics.some((s) => s.percentage < 60) ? [] : workOn.length ? workOn : topics.slice(0, 1).map((t) => t.topic),
    ),
  };
}
