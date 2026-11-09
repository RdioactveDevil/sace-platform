// Saved exams from the exam builder (built_exams, migration
// 20261109000004_built_exams.sql). Row-level security decides what comes
// back: the caller's own exams, exams shared with their classes, and (for
// admins) everything. Calls resolve to null or false on failure so the
// builder keeps working without saving.
import { supabase } from './supabase'

const COLS = 'id, owner_id, subject, title, questions, settings, class_id, created_at, updated_at'

/** Exams for a subject the caller can see, newest first. */
export async function listBuiltExams(subject) {
  if (!subject) return null
  const { data, error } = await supabase.from('built_exams').select(COLS).eq('subject', subject).order('updated_at', { ascending: false }).limit(60)
  return error ? null : data || []
}

/** One exam by id (for links to a saved or shared exam). */
export async function getBuiltExam(id) {
  if (!id) return null
  const { data, error } = await supabase.from('built_exams').select(COLS).eq('id', id).maybeSingle()
  return error ? null : data
}

/** Save a new exam, or update one the caller owns when `id` is given. Returns the row, or null. */
export async function saveBuiltExam({ id, ownerId, subject, title, questions, settings, classId = null }) {
  const row = { subject, title, questions, settings, class_id: classId || null, updated_at: new Date().toISOString() }
  const query = id
    ? supabase.from('built_exams').update(row).eq('id', id)
    : supabase.from('built_exams').insert({ ...row, owner_id: ownerId })
  const { data, error } = await query.select(COLS).maybeSingle()
  return error ? null : data
}

export async function deleteBuiltExam(id) {
  const { error } = await supabase.from('built_exams').delete().eq('id', id)
  return !error
}
