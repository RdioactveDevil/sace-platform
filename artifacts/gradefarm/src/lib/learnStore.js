// Learn's saved chats (learn_sessions) and guided lessons (learn_lessons), per
// student and subject, so both follow the student across devices. Every call
// resolves to null on failure; the screen keeps working from what it has.
import { supabase } from './supabase'

export const lessonKey = (topic) => String(topic || '').trim().toLowerCase()

/** A learn_lessons row as the screen uses it. */
function fromLessonRow(row) {
  return {
    topic: row.topic,
    data: row.content,
    step: row.step,
    revealed: row.revealed,
    checkIndex: row.check_index,
    picked: row.picked,
    answers: Array.isArray(row.answers) ? row.answers : [],
    finishedAt: row.finished_at ? Date.parse(row.finished_at) : null,
    updatedAt: Date.parse(row.updated_at),
  }
}

/** The student's lessons for a subject, keyed by lessonKey(topic). */
export async function fetchLessons(userId, subject) {
  if (!userId || !subject) return null
  const { data, error } = await supabase
    .from('learn_lessons')
    .select('*')
    .eq('user_id', userId)
    .eq('subject', subject)
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error) return null
  return Object.fromEntries((data || []).map(row => [row.topic_key, fromLessonRow(row)]))
}

/** Save a lesson's content and progress (one row per student, subject and topic). */
export async function saveLesson(userId, subject, lesson) {
  if (!userId || !subject || !lesson?.data) return null
  const { error } = await supabase.from('learn_lessons').upsert({
    user_id: userId,
    subject,
    topic: lesson.topic,
    topic_key: lessonKey(lesson.topic),
    content: lesson.data,
    step: lesson.step ?? 0,
    revealed: lesson.revealed ?? 1,
    check_index: lesson.checkIndex ?? 0,
    picked: lesson.picked ?? null,
    answers: lesson.answers || [],
    finished_at: lesson.finishedAt ? new Date(lesson.finishedAt).toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,subject,topic_key' })
  return error ? null : true
}

/** The subject's most recent chats, newest first. */
export async function fetchRecentChats(userId, subject, limit = 5) {
  if (!userId || !subject) return null
  const { data, error } = await supabase
    .from('learn_sessions')
    .select('id, topic, title, interests, messages, updated_at')
    .eq('user_id', userId)
    .eq('subject', subject)
    .order('updated_at', { ascending: false })
    .limit(limit)
  return error ? null : (data || [])
}

/** One saved chat by id. */
export async function fetchChat(id) {
  if (!id) return null
  const { data, error } = await supabase
    .from('learn_sessions')
    .select('id, topic, title, interests, messages, updated_at')
    .eq('id', id)
    .single()
  return error ? null : data
}

/** Start a saved chat; resolves to its id. */
export async function createChat(userId, { subject, topic, title, interests, messages }) {
  if (!userId) return null
  const { data, error } = await supabase
    .from('learn_sessions')
    .insert({ user_id: userId, subject: subject || null, topic: topic || '', title: title || null, interests: interests ?? null, messages })
    .select('id')
    .single()
  return error ? null : data?.id ?? null
}

/** Save a chat's messages (and its title, which can change once a topic is set). */
export async function updateChat(id, { messages, title, topic }) {
  if (!id) return null
  const { error } = await supabase
    .from('learn_sessions')
    .update({ messages, title: title || null, topic: topic || '', updated_at: new Date().toISOString() })
    .eq('id', id)
  return error ? null : true
}
