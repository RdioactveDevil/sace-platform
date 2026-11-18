// Reading and saving a student's year setup and tests (migration
// 20261118000007_year_setup.sql). Row-level security keeps each student to
// their own rows; the subject's topics are readable for live subjects.
import { supabase } from './supabase'

/** The curriculum id behind a subject tile ('curriculum_<uuid>'), or null. */
export const curriculumIdOf = (subject) => (String(subject?.id || '').startsWith('curriculum_') ? subject.id.slice('curriculum_'.length) : null)

/** The subject's topics with their subtopics (ids, names, order) and its exam date (features.exam_date). */
export async function loadCourse(curriculumId) {
  const [{ data: topics, error: tErr }, { data: subs, error: sErr }, { data: cur }] = await Promise.all([
    supabase.from('curriculum_topics').select('id, name, order_index').eq('curriculum_id', curriculumId).order('order_index'),
    supabase.from('curriculum_subtopics').select('id, topic_id, name, order_index').eq('curriculum_id', curriculumId).order('order_index'),
    supabase.from('curricula').select('name, features').eq('id', curriculumId).maybeSingle(),
  ])
  if (tErr) throw tErr
  if (sErr) throw sErr
  return {
    name: cur?.name || '',
    // Set in Admin → subject → Student features (also Home's countdown).
    examDate: cur?.features?.exam_date || null,
    topics: (topics || []).map(t => ({ ...t, subtopics: (subs || []).filter(s => s.topic_id === t.id) })),
  }
}

/** { setup, tests } for one student and subject; setup is null before they set up. */
export async function loadYearSetup(userId, curriculumId) {
  const [{ data: setup, error: e1 }, { data: tests, error: e2 }] = await Promise.all([
    supabase.from('year_setups').select('*').eq('user_id', userId).eq('curriculum_id', curriculumId).maybeSingle(),
    supabase.from('student_tests').select('*').eq('user_id', userId).eq('curriculum_id', curriculumId).order('test_date'),
  ])
  if (e1) throw e1
  if (e2) throw e2
  return { setup: setup || null, tests: tests || [] }
}

/** Save where their class is up to (and the check-in time, when given). */
export async function saveYearSetup(userId, curriculumId, fields) {
  const { data, error } = await supabase.from('year_setups')
    .upsert({ user_id: userId, curriculum_id: curriculumId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'user_id,curriculum_id' })
    .select('*').single()
  if (error) throw error
  return data
}

/** Add a test: { name, kind, test_date: 'YYYY-MM-DD', subtopic_ids }. */
export async function addStudentTest(userId, curriculumId, test) {
  const { data, error } = await supabase.from('student_tests')
    .insert({ user_id: userId, curriculum_id: curriculumId, name: test.name.trim(), kind: test.kind || 'test', test_date: test.test_date, subtopic_ids: test.subtopic_ids || [] })
    .select('*').single()
  if (error) throw error
  return data
}

export async function deleteStudentTest(id) {
  const { error } = await supabase.from('student_tests').delete().eq('id', id)
  if (error) throw error
}
