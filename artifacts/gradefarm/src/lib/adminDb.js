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

  // Reject if the exact question text already exists in the live bank for this subject
  const { data: existing } = await supabase
    .from('questions')
    .select('id')
    .eq('subject', draft.subject)
    .eq('question', draft.question.trim())
    .limit(1)
  if (existing && existing.length > 0) {
    // Mark draft approved (so it doesn't clog the queue) without inserting a duplicate
    await supabase
      .from('draft_questions')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: adminId })
      .eq('id', draftId)
    return
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

// ─── QUESTION REPORTS ─────────────────────────────────────────────────────────

async function adminAuthFetch(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not signed in')
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
  return json
}

export async function fetchQuestionReports(status = 'all') {
  const json = await adminAuthFetch(`/api/question-reports?status=${status}`)
  return json.reports || []
}

/** The AI check on a subject's questions (`limit` of them), or on up to 10 picked `ids`. */
export async function bulkScanQuestions({ subject, limit = 50, ids } = {}) {
  return adminAuthFetch('/api/bulk-scan-questions', {
    method: 'POST',
    body: JSON.stringify(ids ? { ids } : { subject, limit }),
  })
}

// ─── A SUBJECT'S QUESTIONS (Admin → Subjects → a subject → Questions) ─────────

const SUBJECT_QUESTION_FIELDS = 'id, topic, subtopic, subtopic_id, question, question_type, difficulty, source, source_kind, created_at'

/** Every question that belongs to a subject (curriculum_id), a page of 1,000 at a time. */
export async function fetchSubjectQuestions(curriculumId) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('questions').select(SUBJECT_QUESTION_FIELDS)
      .eq('curriculum_id', curriculumId).order('id').range(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}

/** How many questions belong to a subject. */
export async function countSubjectQuestions(curriculumId) {
  const { count, error } = await supabase.from('questions').select('id', { count: 'exact', head: true }).eq('curriculum_id', curriculumId)
  if (error) throw error
  return count || 0
}

/** Ids of the questions an admin has hidden from a subject. */
export async function fetchHiddenQuestionIds(curriculumId) {
  const { data, error } = await supabase.from('curriculum_hidden_questions').select('question_id').eq('curriculum_id', curriculumId)
  if (error) throw error
  return new Set((data || []).map(r => r.question_id))
}

/** One question with everything, for the editor. */
export async function fetchQuestionRow(id) {
  const { data, error } = await supabase.from('questions').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/**
 * Fix many of a subject's questions at once: action 'move' ({ subtopicId }),
 * 'difficulty' ({ difficulty }), 'hide', 'unhide' or 'delete'.
 * Resolves to { changed, skipped } (skipped: borrowed from another subject).
 */
export async function bulkEditQuestions({ curriculumId, ids, action, subtopicId, difficulty }) {
  return adminAuthFetch('/api/admin/questions/bulk', {
    method: 'POST',
    body: JSON.stringify({ curriculumId, ids, action, subtopicId, difficulty }),
  })
}

export async function retryPendingReports({ limit = 20 } = {}) {
  return adminAuthFetch('/api/retry-pending-reports', {
    method: 'POST',
    body: JSON.stringify({ limit }),
  })
}

/**
 * Settle a question report by hand: 'dismiss', 'set_answer' ({ answerIndex }),
 * 'edit' ({ question, options, answerIndex, solution, difficulty }), 'delete'
 * or 'recheck'. Settles every open report on the same question.
 */
export async function resolveQuestionReport(reportId, action, fields = {}) {
  return adminAuthFetch(`/api/question-reports/${encodeURIComponent(reportId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ action, ...fields }),
  })
}

/** Students' flags, one row per question: { question_id, counts, total, last_at, questions }. */
export async function fetchQuestionFlags() {
  const json = await adminAuthFetch('/api/question-flags')
  return json.flags || []
}

/** Clear every flag on a question once it's been dealt with. */
export async function clearQuestionFlags(questionId) {
  return adminAuthFetch('/api/question-flags/clear', { method: 'POST', body: JSON.stringify({ questionId }) })
}

/** A report still waiting on someone: the AI hasn't finished, or it failed and needs a person. */
export const isOpenReport = (r) => !r.resolved_at || r.ai_status === 'error'

/** Save a question's graph, table and image from Preview (live questions need the server). */
export async function saveQuestionVisuals(id, { source, graph, table_data, image_url }) {
  const json = await adminAuthFetch(`/api/admin/questions/${encodeURIComponent(id)}/visuals`, {
    method: 'PATCH',
    body: JSON.stringify({ source, graph, table_data, image_url }),
  })
  return json.question
}

/** Rewrite a live question: any of { question, options, answerIndex, solution, difficulty }. */
/**
 * Approve or reject exam-paper questions after checking them against the paper
 * (POST /api/admin/questions/review). status: 'approved' | 'rejected' | 'pending'.
 */
export async function reviewQuestions(ids, status) {
  return adminAuthFetch('/api/admin/questions/review', { method: 'POST', body: JSON.stringify({ ids, status }) })
}

export async function editQuestion(id, fields) {
  return adminAuthFetch(`/api/admin/questions/${encodeURIComponent(id)}/content`, { method: 'PATCH', body: JSON.stringify(fields) })
}

/** Take a live question out of the bank (its variants, flags and review history go too). */
export async function deleteQuestion(id) {
  return adminAuthFetch(`/api/admin/questions/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Questions that best match a student's rough copy (text or ID), best first. */
export async function searchQuestions(q, { subject } = {}) {
  const params = new URLSearchParams({ q })
  if (subject) params.set('subject', subject)
  const json = await adminAuthFetch(`/api/admin/questions/search?${params}`)
  return json.questions || []
}

/** Read the question out of a photo or screenshot; resolves to its text. */
export async function transcribeQuestionImage(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error("Couldn't read that file."))
    r.readAsDataURL(file)
  })
  const [, mediaType, imageBase64] = /^data:([^;]+);base64,(.*)$/.exec(dataUrl) || []
  const json = await adminAuthFetch('/api/admin/questions/transcribe', {
    method: 'POST',
    body: JSON.stringify({ imageBase64, mediaType }),
  })
  return json.text || ''
}

/**
 * What a subject's Overview and menu badges need: its questions, how many of
 * them have an open report, drafts waiting for review, and exam paper batches.
 */
export async function loadSubjectHealth(curriculumId, subjectName) {
  const [rows, reports, pending, needsReview, papers] = await Promise.all([
    fetchSubjectQuestions(curriculumId),
    fetchQuestionReports('all').catch(() => []),
    getDraftQuestions({ status: 'pending', subject: subjectName }).catch(() => []),
    getDraftQuestions({ status: 'needs_review', subject: subjectName }).catch(() => []),
    (async () => {
      const { count } = await supabase.from('exam_paper_batches').select('id', { count: 'exact', head: true }).eq('subject', subjectName)
      return count || 0
    })().catch(() => 0),
  ])
  const ids = new Set(rows.map(q => q.id))
  const openReports = new Set(reports.filter(r => isOpenReport(r) && (ids.has(r.question_id) || r.questions?.subject === subjectName)).map(r => r.question_id)).size
  return { rows, openReports, drafts: pending.length + needsReview.length, papers }
}

// ─── ONE PERSON (Admin → People → a person) ──────────────────────────────────

/** { profile, signIn, parentConsentNeeded, billing } for one account. */
export async function getPerson(id) {
  return adminAuthFetch(`/api/admin/people/${encodeURIComponent(id)}`)
}

/** Any of { displayName, email, yearLevel, state, school, dob }. */
export async function savePersonDetails(id, fields) {
  return adminAuthFetch(`/api/admin/people/${encodeURIComponent(id)}/details`, { method: 'PATCH', body: JSON.stringify(fields) })
}

/** { parentName, parentEmail } and/or { resend: true } and/or { confirmed: boolean }. */
export async function savePersonParent(id, body) {
  return adminAuthFetch(`/api/admin/people/${encodeURIComponent(id)}/parent`, { method: 'PUT', body: JSON.stringify(body) })
}

/** Email them a link to choose a new password. */
export async function sendPersonPasswordReset(id) {
  return adminAuthFetch(`/api/admin/people/${encodeURIComponent(id)}/password-reset`, { method: 'POST' })
}

/** End every session they have. */
export async function signOutPerson(id) {
  return adminAuthFetch(`/api/admin/people/${encodeURIComponent(id)}/sign-out`, { method: 'POST' })
}

/** Any of { reminders, sounds, leaderboard } (booleans). */
export async function savePersonSettings(id, body) {
  return adminAuthFetch(`/api/admin/people/${encodeURIComponent(id)}/settings`, { method: 'PATCH', body: JSON.stringify(body) })
}

/** 'cancel_at_period_end', 'resume' or 'cancel_now'. */
export async function changePersonBilling(id, action) {
  return adminAuthFetch(`/api/admin/people/${encodeURIComponent(id)}/billing`, { method: 'POST', body: JSON.stringify({ action }) })
}

// ─── LOADED EXAM PAPERS (a subject → Exam papers) ────────────────────────────

const PAPER_FIELDS = 'id, question, question_type, options, answer_index, solution, parts, total_marks, image_url, difficulty, topic, subtopic, source, source_kind, source_publisher, source_year, source_paper, source_question, exam_section, review_status, review, created_at'

/** Every question loaded from an exam paper into a subject (they have an exam section). */
export async function fetchLoadedPaperQuestions(curriculumId) {
  const rows = []
  // Before migration 20261118000000_question_review the review columns don't exist yet.
  let fields = PAPER_FIELDS
  for (let from = 0; ; from += 1000) {
    let { data, error } = await supabase.from('questions').select(fields)
      .eq('curriculum_id', curriculumId).not('exam_section', 'is', null).order('id').range(from, from + 999)
    if (error && error.code === '42703' && fields === PAPER_FIELDS) {
      fields = PAPER_FIELDS.replace(', review_status, review', '')
      ;({ data, error } = await supabase.from('questions').select(fields)
        .eq('curriculum_id', curriculumId).not('exam_section', 'is', null).order('id').range(from, from + 999))
    }
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}

/**
 * Links to the uploaded PDFs of a subject's loaded papers, by source label
 * ("NEAP 2024 Trial Exam 2"), from the batches they came in (newest first).
 * Signed for an hour; papers loaded from a link or older batches aren't listed.
 */
export async function fetchPaperPdfLinks(subject) {
  const { data, error } = await supabase.from('exam_paper_batches').select('papers, created_at')
    .eq('subject', subject).order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  const paths = new Map()
  for (const b of data || []) {
    for (const p of b.papers || []) if (p?.source && p?.pdf && !paths.has(p.source) && !/^https?:/i.test(p.pdf)) paths.set(p.source, p.pdf)
  }
  const out = new Map()
  if (!paths.size) return out
  const list = [...paths]
  const { data: signed } = await supabase.storage.from('admin-uploads').createSignedUrls(list.map(([, path]) => path), 3600)
  ;(signed || []).forEach((s, i) => { if (s?.signedUrl) out.set(list[i][0], s.signedUrl) })
  return out
}

/** Rewrite a multi-part exam question: { question, parts: [{ label, level, text, marks, solution, image_url }] }. */
export async function editExtendedQuestion(id, body) {
  return adminAuthFetch(`/api/admin/questions/${encodeURIComponent(id)}/extended`, { method: 'PATCH', body: JSON.stringify(body) })
}
