import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Every tutor with each student on their roster (tutor_students), by student.
 * A student can have several tutors; they all hear about the student's results.
 */
export async function rosterTutorIds(admin: SupabaseClient, studentIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const unique = [...new Set(studentIds)];
  if (unique.length === 0) return out;
  const { data, error } = await admin
    .from("tutor_students")
    .select("tutor_id, student_id")
    .in("student_id", unique);
  if (error) throw new Error(`tutor_students: ${error.message}`);
  for (const r of (data ?? []) as Array<{ tutor_id: string; student_id: string }>) {
    const l = out.get(r.student_id) ?? [];
    l.push(r.tutor_id);
    out.set(r.student_id, l);
  }
  return out;
}

/** The tutor who set the work first, then the student's other roster tutors. */
export function tutorsToNotify(setterId: string, roster: string[] | undefined): string[] {
  return [...new Set([setterId, ...(roster ?? [])])];
}
