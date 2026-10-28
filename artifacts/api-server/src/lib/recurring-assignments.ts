/**
 * Recurring assignments (table assignment_schedules, migration
 * 20261028000000_recurring_assignments.sql). A schedule is a template the
 * tutor sets once; on each of its days this creates an ordinary assignment for
 * every student it targets, from ISSUE_FROM_HOUR Adelaide time. Run by the
 * /api/cron/emails job (every 15 min) and straight away when a schedule is
 * created to start today. The students are emailed by the automated email job
 * ("assignment_set").
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";
import { addDays, localDate, localHour } from "./automated-emails";
import { planIsLive, tutorBillingRow } from "./tutor-plan";

/** Work is set from this hour on its day, Adelaide time. */
export const ISSUE_FROM_HOUR = 6;

export interface ScheduleRow {
  id: string;
  tutor_id: string;
  type: string;
  subject: string;
  topics: string[];
  question_count: number;
  difficulty: string;
  min_accuracy: number | null;
  pass_mode: string;
  remediation: boolean;
  student_ids: string[];
  class_ids: string[];
  all_roster: boolean;
  days_of_week: number[];
  every_weeks: number;
  due_days: number;
  start_date: string;
  end_date: string | null;
  notify: boolean;
  paused_at: string | null;
  last_issued_on: string | null;
  created_at: string;
}

type Timing = Pick<ScheduleRow, "days_of_week" | "every_weeks" | "start_date" | "end_date">;

const weekday = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
/** The Monday of `ymd`'s week. */
const weekStart = (ymd: string) => addDays(ymd, -((weekday(ymd) + 6) % 7));

/** The first day on or after start_date that falls on one of the schedule's weekdays. */
function firstDay(s: Timing): string {
  let day = s.start_date;
  for (let i = 0; i < 6 && !s.days_of_week.includes(weekday(day)); i++) day = addDays(day, 1);
  return day;
}

/**
 * Whether the schedule sets work on `ymd` (a YYYY-MM-DD day in Adelaide).
 * Every other week counts from the week of its first day, so it starts on the
 * first chosen weekday after start_date.
 */
export function issuesOn(s: Timing, ymd: string): boolean {
  if (ymd < s.start_date || (s.end_date && ymd > s.end_date)) return false;
  if (!s.days_of_week.includes(weekday(ymd))) return false;
  const weeks = Math.floor(daysBetween(weekStart(firstDay(s)), ymd) / 7);
  return weeks % Math.max(1, s.every_weeks) === 0;
}

/** The next day work will be set, on or after `from`; null when paused or finished. */
export function nextIssueOn(s: Timing & Pick<ScheduleRow, "paused_at" | "last_issued_on">, from: string): string | null {
  if (s.paused_at) return null;
  let day = s.start_date > from ? s.start_date : from;
  if (s.last_issued_on && s.last_issued_on >= day) day = addDays(s.last_issued_on, 1);
  for (let i = 0; i < 14; i++, day = addDays(day, 1)) {
    if (s.end_date && day > s.end_date) return null;
    if (issuesOn(s, day)) return day;
  }
  return null;
}

/** Whether the error says the migration hasn't been applied yet. */
export function missingScheduleTable(err: { message?: string } | null): boolean {
  return !!err && /assignment_schedules|schedule_id|issued_on/.test(err.message || "");
}

/**
 * The students the schedule reaches today: the tutor's roster for all_roster,
 * the named students still on it (any student for an admin), and the members
 * of its classes the tutor still owns or co-teaches.
 */
async function resolveTargets(admin: SupabaseClient, s: ScheduleRow): Promise<string[]> {
  const { data: tutor, error: tErr } = await admin
    .from("profiles").select("is_admin, deactivated_at").eq("id", s.tutor_id)
    .maybeSingle<{ is_admin: boolean | null; deactivated_at: string | null }>();
  if (tErr) throw new Error(`profiles: ${tErr.message}`);
  if (!tutor || tutor.deactivated_at) return [];
  const isAdmin = !!tutor.is_admin;

  const { data: rosterRows, error: rErr } = await admin
    .from("tutor_students").select("student_id").eq("tutor_id", s.tutor_id);
  if (rErr) throw new Error(`tutor_students: ${rErr.message}`);
  const roster = new Set((rosterRows ?? []).map((r: { student_id: string }) => r.student_id));

  const out = new Set<string>();
  if (s.all_roster) for (const id of roster) out.add(id);
  for (const id of s.student_ids ?? []) if (isAdmin || roster.has(id)) out.add(id);

  if (s.class_ids?.length) {
    let classIds = s.class_ids;
    if (!isAdmin) {
      const { data: owned } = await admin
        .from("tutor_classes").select("id").in("id", classIds).eq("tutor_id", s.tutor_id);
      const { data: co } = await admin
        .from("tutor_class_tutors").select("class_id").in("class_id", classIds).eq("tutor_id", s.tutor_id);
      const allowed = new Set([
        ...(owned ?? []).map((c: { id: string }) => c.id),
        ...(co ?? []).map((c: { class_id: string }) => c.class_id),
      ]);
      classIds = classIds.filter((id) => allowed.has(id));
    }
    if (classIds.length) {
      const { data: members, error: mErr } = await admin
        .from("tutor_class_members").select("student_id").in("class_id", classIds);
      if (mErr) throw new Error(`tutor_class_members: ${mErr.message}`);
      for (const m of (members ?? []) as { student_id: string }[]) out.add(m.student_id);
    }
  }
  return [...out];
}

/**
 * Set the schedule's work for `day` (it's up to the caller that the schedule
 * runs that day). Safe to repeat: a student never gets the same day twice.
 * Returns how many assignments were created, or null when the tutor's plan
 * has lapsed (nothing is set and the day stays open, so it's set if the plan
 * comes back that day).
 */
export async function issueSchedule(admin: SupabaseClient, s: ScheduleRow, day: string): Promise<number | null> {
  const { data: tutor } = await admin
    .from("profiles").select("is_admin").eq("id", s.tutor_id).maybeSingle<{ is_admin: boolean | null }>();
  if (!tutor?.is_admin && !planIsLive(await tutorBillingRow(admin, s.tutor_id))) return null;

  const targets = await resolveTargets(admin, s);
  let created = 0;
  if (targets.length > 0) {
    const batchId = randomUUID();
    const classId = s.class_ids?.length === 1 ? s.class_ids[0] : null;
    const rows = targets.map((studentId) => ({
      tutor_id: s.tutor_id,
      student_id: studentId,
      type: s.type,
      subject: s.subject,
      topics: s.topics,
      due_date: addDays(day, s.due_days),
      batch_id: batchId,
      class_id: classId,
      question_count: s.question_count,
      difficulty: s.difficulty,
      min_accuracy: s.min_accuracy,
      pass_mode: s.pass_mode,
      remediation: s.remediation,
      schedule_id: s.id,
      issued_on: day,
    }));
    const { data, error } = await admin
      .from("assignments")
      .upsert(rows, { onConflict: "schedule_id,student_id,issued_on", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`assignments: ${error.message}`);
    created = data?.length ?? 0;
  }

  const { error: upErr } = await admin
    .from("assignment_schedules").update({ last_issued_on: day }).eq("id", s.id);
  if (upErr) throw new Error(`assignment_schedules: ${upErr.message}`);
  return created;
}

export interface IssueSummary {
  schedules: number;
  created: number;
  failed: number;
}

/** Set today's work for every schedule due today that hasn't been set yet. */
export async function runRecurringAssignments(admin: SupabaseClient, now = new Date()): Promise<IssueSummary> {
  const summary: IssueSummary = { schedules: 0, created: 0, failed: 0 };
  if (localHour(now) < ISSUE_FROM_HOUR) return summary;
  const today = localDate(now);

  const { data, error } = await admin
    .from("assignment_schedules")
    .select("*")
    .is("paused_at", null)
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .limit(2000);
  if (error) {
    if (missingScheduleTable(error)) return summary;
    throw new Error(`assignment_schedules: ${error.message}`);
  }

  for (const s of (data ?? []) as ScheduleRow[]) {
    if ((s.last_issued_on && s.last_issued_on >= today) || !issuesOn(s, today)) continue;
    try {
      const created = await issueSchedule(admin, s, today);
      if (created === null) continue;
      summary.schedules++;
      summary.created += created;
    } catch (err) {
      // One bad schedule shouldn't hold up the rest.
      summary.failed++;
      logger.error({ err, schedule: s.id }, "recurring assignments: couldn't set work");
    }
  }
  return summary;
}
