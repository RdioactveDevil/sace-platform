// Self-marked exam attempts (built_exam_attempts, migration
// 20261111000000_built_exam_attempts.sql). Row-level security returns the
// caller's own attempts. Calls resolve to null or false on failure so the
// Exams screens can say so and keep working.
import { supabase } from './supabase'
import { tally } from './examMarking'

const COLS = 'id, user_id, exam_id, subject, title, snapshot, question_ids, marks, scored, available, skipped, status, created_at, updated_at, marked_at'

/** The caller's attempts for a subject, newest first. */
export async function listAttempts(subject, userId) {
  if (!subject || !userId) return null
  const { data, error } = await supabase.from('built_exam_attempts').select(COLS)
    .eq('user_id', userId).eq('subject', subject).order('created_at', { ascending: false }).limit(200)
  return error ? null : data || []
}

export async function getAttempt(id) {
  if (!id) return null
  const { data, error } = await supabase.from('built_exam_attempts').select(COLS).eq('id', id).maybeSingle()
  return error ? null : data
}

/** Start an attempt at an exam: its snapshot, nothing marked yet. */
export async function createAttempt({ userId, examId = null, subject, title, snapshot }) {
  const row = {
    user_id: userId, exam_id: examId || null, subject, title, snapshot,
    question_ids: (snapshot?.questions || []).map(q => q.id),
    marks: {}, scored: 0, skipped: 0, available: tally(snapshot, {}).available, status: 'not_marked',
  }
  const { data, error } = await supabase.from('built_exam_attempts').insert(row).select(COLS).maybeSingle()
  return error ? null : data
}

/** Save the marks so far; `finish` marks the attempt done. Returns the row, or null. */
export async function saveMarks(attempt, marks, { finish = false } = {}) {
  const t = tally(attempt.snapshot, marks)
  const now = new Date().toISOString()
  const row = {
    marks, scored: t.scored, skipped: t.skipped, available: t.available, updated_at: now,
    status: finish ? 'marked' : attempt.status === 'marked' ? 'marked' : t.entered ? 'marking' : 'not_marked',
    ...(finish && !attempt.marked_at ? { marked_at: now } : {}),
  }
  const { data, error } = await supabase.from('built_exam_attempts').update(row).eq('id', attempt.id).select(COLS).maybeSingle()
  return error ? null : data
}

export async function deleteAttempt(id) {
  const { error } = await supabase.from('built_exam_attempts').delete().eq('id', id)
  return !error
}

export const ATTEMPT_STORE = { list: listAttempts, get: getAttempt, create: createAttempt, save: saveMarks, remove: deleteAttempt }
