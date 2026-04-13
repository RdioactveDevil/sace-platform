import { supabase } from './supabase'

// ─── DRAFT QUESTIONS ──────────────────────────────────────────────────────────

/**
 * Fetch draft questions, optionally filtered by status and/or subject.
 * @param {{ status?: string, subject?: string }} filters
 */
export async function getDraftQuestions({ status, subject } = {}) {
  let query = supabase
    .from('draft_questions')
    .select('*')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (subject) query = query.eq('subject', subject)

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(d => ({
    ...d,
    options: typeof d.options === 'string' ? JSON.parse(d.options) : d.options,
  }))
}

/**
 * Insert or update a draft question.
 * Pass id to update an existing draft; omit id to insert a new one.
 */
export async function upsertDraftQuestion(draft) {
  const { error } = await supabase
    .from('draft_questions')
    .upsert(draft, { onConflict: 'id' })
  if (error) throw error
}

/**
 * Approve a draft: insert into live questions table, mark draft approved.
 * @param {string} draftId  UUID of the draft_questions row
 * @param {string} adminId  UUID of the admin profile
 */
export async function approveDraftQuestion(draftId, adminId) {
  const { data: draft, error: fetchError } = await supabase
    .from('draft_questions')
    .select('*')
    .eq('id', draftId)
    .single()
  if (fetchError) throw fetchError

  if (!draft.topic || !String(draft.topic).trim()) {
    throw new Error('Set a topic (use the topic dropdown) before approving.')
  }
  if (!draft.question || !String(draft.question).trim()) {
    throw new Error('Question text is empty; fix the draft before approving.')
  }

  const questionId = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const conceptTag = `${draft.subject}|${draft.topic}|${draft.subtopic || draft.topic}`.toLowerCase()

  const { error: insertError } = await supabase.from('questions').insert({
    id: questionId,
    subject: draft.subject,
    topic: draft.topic,
    subtopic: draft.subtopic || draft.topic,
    concept_tag: conceptTag,
    difficulty: draft.difficulty ?? 3,
    question: draft.question,
    options: draft.options,
    answer_index: draft.answer_index,
    solution: draft.solution ?? '',
    tip: null,
  })
  if (insertError) {
    const hint =
      insertError.code === '42501' || insertError.message?.includes('policy')
        ? ' Database rejected insert (RLS). In Supabase SQL Editor, run the questions_insert_admin policy from supabase_schema.sql, and confirm profiles.is_admin is true for your user.'
        : ''
    throw new Error((insertError.message || 'Insert into questions failed') + hint)
  }

  const { error: updateError } = await supabase
    .from('draft_questions')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminId,
    })
    .eq('id', draftId)
  if (updateError) throw updateError
}

/**
 * Reject a draft (keeps it as an audit trail).
 * @param {string} draftId
 * @param {string} adminId
 */
export async function rejectDraftQuestion(draftId, adminId) {
  const { error } = await supabase
    .from('draft_questions')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminId,
    })
    .eq('id', draftId)
  if (error) throw error
}
