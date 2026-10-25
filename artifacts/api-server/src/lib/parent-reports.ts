import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailContent } from "./email";
import { currentStreak } from "./streak";

// Weekly parent progress reports: every Sunday evening the automated email
// job (automated-emails.ts) sends a parent what the student did that week: how
// much they practised and how well, and what they're strong at and should work
// on. Two ways in:
//   • a tutor on a plan with parent reports adds a parent's email to a student
//     on their roster (tutor_students.parent_email, runParentReports). Their
//     report adds the tutor's assignments and the next lesson, and its
//     unsubscribe link stops it for that tutor–student pair.
//   • the student's own account has a confirmed parent (profiles.parent_email,
//     runAccountParentReports; lib/parent-consent.ts), with no tutor needed.
//     Its unsubscribe link stops it on the profile.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** A topic needs this many answers in the week before it counts as strong or to work on. */
const MIN_TOPIC_ANSWERS = 4;

export type WeekAnswer = { correct: boolean; day: string; subject: string | null; area: string | null };
export type WeekAssignment = { completed_at: string | null; due_date: string | null; passed: boolean | null };

export type WeekReport = {
  answered: number;
  /** Whole % right, or null with no answers. */
  accuracy: number | null;
  activeDays: number;
  /** Subjects practised, most answered first. */
  subjects: string[];
  strongAt: string | null;
  workOn: string | null;
  assignmentsDone: number;
  assignmentsOpen: number;
  assignmentsOverdue: number;
};

/** Summarise a student's week from their answers and the tutor's assignments. `today` is YYYY-MM-DD. */
export function summarizeWeek(answers: WeekAnswer[], assignments: WeekAssignment[], today: string, sinceIso: string): WeekReport {
  const correct = answers.filter((a) => a.correct).length;
  const bySubject = new Map<string, number>();
  const byArea = new Map<string, { right: number; total: number }>();
  for (const a of answers) {
    if (a.subject) bySubject.set(a.subject, (bySubject.get(a.subject) ?? 0) + 1);
    if (!a.area) continue;
    const s = byArea.get(a.area) ?? { right: 0, total: 0 };
    s.total++;
    if (a.correct) s.right++;
    byArea.set(a.area, s);
  }
  const areas = [...byArea.entries()]
    .filter(([, s]) => s.total >= MIN_TOPIC_ANSWERS)
    .map(([area, s]) => ({ area, pct: s.right / s.total }));
  const weakest = areas.slice().sort((a, b) => a.pct - b.pct)[0];
  const strongest = areas.slice().sort((a, b) => b.pct - a.pct)[0];
  const workOn = weakest && weakest.pct < 0.7 ? weakest.area : null;
  const strongAt = strongest && strongest.pct >= 0.8 && strongest.area !== workOn ? strongest.area : null;

  const since = new Date(sinceIso).getTime();
  const open = assignments.filter((a) => !a.completed_at);
  return {
    answered: answers.length,
    accuracy: answers.length ? Math.round((correct / answers.length) * 100) : null,
    activeDays: new Set(answers.map((a) => a.day)).size,
    subjects: [...bySubject.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s),
    strongAt,
    workOn,
    assignmentsDone: assignments.filter((a) => a.completed_at && new Date(a.completed_at).getTime() >= since).length,
    assignmentsOpen: open.filter((a) => !a.due_date || a.due_date >= today).length,
    assignmentsOverdue: open.filter((a) => a.due_date && a.due_date < today).length,
  };
}

export type ParentReportData = {
  report: WeekReport;
  streak: number;
  /** ISO time of the next lesson booked with this tutor, if any. */
  nextLesson: string | null;
};

const NONE = Promise.resolve({ data: [] as unknown[], error: null });

/**
 * Load a student's last 7 days for their parent's report. `dayOf` gives a
 * time's YYYY-MM-DD in Adelaide. Without a tutor there are no assignments or
 * lessons to report.
 */
export async function loadParentReport(
  admin: SupabaseClient, tutorId: string | null, studentId: string, now: Date, dayOf: (d: Date) => string,
): Promise<ParentReportData> {
  const since = new Date(now.getTime() - WEEK_MS).toISOString();
  const [answersRes, assignmentsRes, lessonRes, profileRes] = await Promise.all([
    admin.from("answer_log").select("question_id, correct, answered_at").eq("user_id", studentId).gte("answered_at", since).limit(5000),
    tutorId
      ? admin.from("assignments").select("completed_at, due_date, passed")
        .eq("tutor_id", tutorId).eq("student_id", studentId).or(`completed_at.is.null,completed_at.gte.${since}`)
      : NONE,
    tutorId
      ? admin.from("tutoring_sessions").select("scheduled_at")
        .eq("tutor_id", tutorId).eq("student_id", studentId).neq("status", "cancelled")
        .gt("scheduled_at", now.toISOString()).order("scheduled_at", { ascending: true }).limit(1)
      : NONE,
    admin.from("profiles").select("streak, last_active").eq("id", studentId).maybeSingle<{ streak: number | null; last_active: string | null }>(),
  ]);
  for (const r of [answersRes, assignmentsRes, lessonRes]) if (r.error) throw new Error(r.error.message);

  const rows = (answersRes.data ?? []) as { question_id: string; correct: boolean; answered_at: string }[];
  const ids = [...new Set(rows.map((r) => r.question_id))];
  const questions = new Map<string, { subject: string | null; topic: string | null; subtopic: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from("questions").select("id, subject, topic, subtopic").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const q of (data ?? []) as { id: string; subject: string | null; topic: string | null; subtopic: string | null }[]) questions.set(q.id, q);
  }
  const answers: WeekAnswer[] = rows.map((r) => {
    const q = questions.get(r.question_id);
    return { correct: !!r.correct, day: dayOf(new Date(r.answered_at)), subject: q?.subject ?? null, area: q?.subtopic || q?.topic || null };
  });

  return {
    report: summarizeWeek(answers, (assignmentsRes.data ?? []) as WeekAssignment[], dayOf(now), since),
    streak: currentStreak(profileRes.data?.streak, profileRes.data?.last_active, now),
    nextLesson: ((lessonRes.data ?? []) as { scheduled_at: string }[])[0]?.scheduled_at ?? null,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The parent's email. `tutorName` is null for the report from the student's
 * own account. `formatWhen` renders the next lesson's time in Adelaide.
 */
export function parentReportEmail(opts: {
  parentName: string | null;
  studentName: string;
  tutorName: string | null;
  data: ParentReportData;
  unsubscribe: string;
  formatWhen: (iso: string) => string;
}): { subject: string; content: EmailContent } {
  const { parentName, studentName, tutorName, data, unsubscribe, formatWhen } = opts;
  const r = data.report;
  const first = studentName.split(" ")[0] || studentName;

  const summary = r.answered === 0
    ? tutorName
      ? `${first} didn't practise on gradefarm this week. A few short sessions before their next lesson would help them keep up.`
      : `${first} didn't practise on gradefarm this week. Fifteen minutes on a few days a week is enough to keep improving.`
    : `${first} answered ${plural(r.answered, "question")} on ${plural(r.activeDays, "day")} this week and got ${r.accuracy}% right.`;
  const assignments = [
    r.assignmentsDone ? `${r.assignmentsDone} done this week` : null,
    r.assignmentsOpen ? `${r.assignmentsOpen} to do` : null,
    r.assignmentsOverdue ? `${r.assignmentsOverdue} overdue` : null,
  ].filter(Boolean).join(", ");

  const details: Array<[string, string]> = [
    ["Questions", r.answered ? `${r.answered} (${r.accuracy}% right)` : "None this week"],
    ["Days active", `${r.activeDays} of 7`],
    ["Day streak", plural(data.streak, "day")],
    ...(r.subjects.length ? ([["Subjects", r.subjects.slice(0, 3).join(", ")]] as Array<[string, string]>) : []),
    ...(r.strongAt ? ([["Strong at", r.strongAt]] as Array<[string, string]>) : []),
    ...(r.workOn ? ([["Work on", r.workOn]] as Array<[string, string]>) : []),
    ...(assignments ? ([["Assignments", assignments]] as Array<[string, string]>) : []),
    ...(data.nextLesson ? ([["Next lesson", formatWhen(data.nextLesson)]] as Array<[string, string]>) : []),
  ];

  return {
    subject: `${first}'s week on gradefarm`,
    content: {
      heading: `${first}'s week on gradefarm`,
      paragraphs: [
        tutorName
          ? `Hi ${parentName || "there"}, here's ${first}'s weekly progress report from ${tutorName}, their tutor.`
          : `Hi ${parentName || "there"}, here's ${first}'s weekly progress report.`,
        summary,
        ...(!tutorName && r.workOn ? [`Next week, a few rounds on ${r.workOn} would help most. gradefarm puts it first in ${first}'s practice automatically.`] : []),
      ],
      details,
      footer: tutorName
        ? `You're receiving this because ${tutorName} added your email to ${studentName}'s tutoring on gradefarm. With any questions, contact ${tutorName} directly.`
        : `You're receiving this because you're the parent or guardian on ${studentName}'s gradefarm account. Questions? support@titaniumtutoring.com.au`,
      unsubscribe,
      unsubscribeLabel: "Stop these weekly reports",
    },
  };
}
