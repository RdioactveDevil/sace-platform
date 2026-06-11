import { supabase, SUPABASE_URL } from './supabase'
import { nextReviewTime } from './engine'
import { questionsBankSubjectKeys } from './subjects'

// â”€â”€â”€ AUTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function signUp(email, password, displayName, school, applyForTutor = false) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName, signup_path: 'student' } }
  })
  if (error) throw error

  if (data.user) {
    const updates = {}
    if (school) updates.school = school
    if (Object.keys(updates).length > 0) {
      await supabase.from('profiles').update(updates).eq('id', data.user.id)
    }
    if (applyForTutor) {
      // Best-effort: works once the user has a session. If signUp requires
      // email confirmation, the RPC will no-op; the user can re-apply later.
      try { await supabase.rpc('apply_for_tutor') } catch {}
    }
  }
  return data
}

/** Tutor signup entry: tags auth metadata so the post-auth tutorial can tailor copy. */
export async function signUpAsTutorAccount(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName, signup_path: 'tutor' } }
  })
  if (error) throw error
  return data
}

export async function applyForTutor() {
  const { error } = await supabase.rpc('apply_for_tutor')
  if (error) throw error
}

export async function withdrawTutorApplication() {
  const { error } = await supabase.rpc('withdraw_tutor_application')
  if (error) throw error
}

// ─── ADMIN ───────────────────────────────────────────────────────────────────
async function adminFetch(path, opts = {}) {
  const session = await getSession()
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

export async function adminListUsers() {
  return adminFetch('/api/admin/users')
}

export async function adminListTutorApplications() {
  const json = await adminFetch('/api/admin/tutor-applications')
  return json.applications || []
}

export async function adminApproveTutor(userId) {
  const { error } = await supabase.rpc('admin_approve_tutor', { p_user_id: userId })
  if (error) throw error
}

export async function adminRejectTutor(userId) {
  const { error } = await supabase.rpc('admin_reject_tutor', { p_user_id: userId })
  if (error) throw error
}

export async function adminSetTutor(userId, value) {
  const { error } = await supabase.rpc('admin_set_tutor', { p_user_id: userId, p_value: !!value })
  if (error) throw error
}

export async function adminSetAdmin(userId, value) {
  const { error } = await supabase.rpc('admin_set_admin', { p_user_id: userId, p_value: !!value })
  if (error) throw error
}

export async function adminListStudents() {
  return adminFetch('/api/admin/students')
}

export async function adminGetStudentStats(studentId) {
  return adminFetch(`/api/admin/students/${encodeURIComponent(studentId)}/stats`)
}

// Soft-delete: active:false deactivates (blocks sign-in, keeps data), active:true reactivates.
export async function adminSetStudentActive(studentId, active) {
  return adminFetch(`/api/admin/students/${encodeURIComponent(studentId)}/deactivate`, {
    method: 'POST',
    body: JSON.stringify({ active: !!active }),
  })
}

// Hard-delete: permanently removes the account and all data tied to it.
export async function adminDeleteStudent(studentId) {
  return adminFetch(`/api/admin/students/${encodeURIComponent(studentId)}`, {
    method: 'DELETE',
  })
}

export async function adminGetStudentAssignments(studentId) {
  const json = await adminFetch(`/api/admin/students/${encodeURIComponent(studentId)}/assignments`)
  return json.assignments || []
}

export async function adminGetStudentWritingAttempts(studentId) {
  const json = await adminFetch(`/api/admin/students/${encodeURIComponent(studentId)}/writing-attempts`)
  return json.attempts || []
}

export async function adminListTutors() {
  const json = await adminFetch('/api/admin/tutors')
  return json.tutors || []
}

export async function adminGetTutor(tutorId) {
  return adminFetch(`/api/admin/tutors/${encodeURIComponent(tutorId)}`)
}

export async function adminListAssignmentSubjects() {
  const json = await adminFetch('/api/admin/assignment-subjects')
  return json.subjects || []
}

export async function adminListAssignments(filters = {}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  return adminFetch(`/api/admin/assignments${qs ? `?${qs}` : ''}`)
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

/** Streamed PDF of writing submission + report (no storage). */
export async function downloadWritingReportPdf(attemptId, studentDisplayName) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not signed in')

  const res = await fetch('/api/writing/report-pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ attemptId, studentDisplayName: studentDisplayName || undefined }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `PDF failed (${res.status})`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `gradefarm-writing-${String(attemptId).slice(0, 8)}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// â”€â”€â”€ PROFILE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export async function updateProfile(userId, updates) {
  const { error } = await supabase.from('profiles').update(updates).eq('id', userId)
  if (error) throw error
}

function mapAndDedupeQuestions(data, subjectFallback) {
  const mapped = (data || []).map(q => ({
    ...q,
    options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
    concept_tag:
      q.concept_tag ||
      `${q.subject || subjectFallback}|${q.topic}|${q.subtopic}`.toLowerCase(),
  }))
  const seen = new Set()
  return mapped.filter(q => {
    const key = (q.question || '').trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// â”€â”€â”€ QUESTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getQuestions(subject = 'Chemistry') {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('subject', subject)

  if (error) throw error
  return mapAndDedupeQuestions(data, subject)
}

/**
 * Load the bank for a subject tile (curriculum_* tiles query all spelling variants, e.g. SACE Stage 2 …).
 */
export async function getQuestionsForSubjectTile(subjectTile) {
  const keys = questionsBankSubjectKeys(subjectTile)
  if (keys.length === 0) return []
  if (keys.length === 1) return getQuestions(keys[0])
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .in('subject', keys)
  if (error) throw error
  return mapAndDedupeQuestions(data, keys[0])
}

// â”€â”€â”€ STRUGGLE PROFILE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** Exact row count for `questions.subject` (head-only request). */
export async function countQuestionsForSubject(subject) {
  const { count, error } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true })
    .eq('subject', subject)

  if (error) throw error
  return count ?? 0
}

/**
 * Live `questions` + pending `draft_questions` for subjects. Pass `{ subject, levelLabel }` for
 * managed curricula so counts include spellings like `SACE Stage 2 Mathematical Methods`.
 * @param {Array<string|{subject: string, levelLabel?: string}>} entries
 * @returns {Promise<Record<string, number>>} keyed by `subject` string
 */
export async function fetchSubjectBankCounts(entries) {
  const items = []
  for (const e of entries || []) {
    if (e && typeof e === 'object' && 'subject' in e) {
      const subject = String(e.subject || '').trim()
      if (!subject) continue
      items.push({ name: subject, levelLabel: String(e.levelLabel || '').trim() })
    } else {
      const s = String(e || '').trim()
      if (s) items.push({ name: s, levelLabel: '' })
    }
  }

  const keysForFallback = [...new Set(items.map((i) => i.name))]
  if (keysForFallback.length === 0) return {}

  try {
    const res = await fetch('/api/subject-question-counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjects: items }),
    })
    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error('Invalid JSON from subject-question-counts')
    }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    return data.counts && typeof data.counts === 'object' ? data.counts : {}
  } catch {
    const out = {}
    for (const s of keysForFallback) {
      try {
        out[s] = await countQuestionsForSubject(s)
      } catch {
        out[s] = 0
      }
    }
    return out
  }
}

export async function getStruggleMap(userId) {
  const { data, error } = await supabase
    .from('struggle_profiles')
    .select('question_id, attempts, wrong, last_seen, next_review')
    .eq('user_id', userId)

  if (error) throw error
  return Object.fromEntries(data.map(r => [r.question_id, r]))
}

export async function recordAnswer(userId, questionId, correct, selected = 0, sessionId = null, timeTakenMs = null) {
  const { data: existing } = await supabase
    .from('struggle_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('question_id', questionId)
    .single()

  const attempts = (existing?.attempts ?? 0) + 1
  const wrong = (existing?.wrong ?? 0) + (correct ? 0 : 1)
  const next_review = nextReviewTime(attempts, wrong).toISOString()
  const last_seen = new Date().toISOString()

  if (existing) {
    await supabase
      .from('struggle_profiles')
      .update({ attempts, wrong, last_seen, next_review })
      .eq('user_id', userId)
      .eq('question_id', questionId)
  } else {
    await supabase.from('struggle_profiles').insert({
      user_id: userId,
      question_id: questionId,
      attempts,
      wrong,
      last_seen,
      next_review,
    })
  }

  await supabase.from('answer_log').insert({
    user_id: userId,
    session_id: sessionId,
    question_id: questionId,
    selected,
    correct,
    time_taken_ms: timeTakenMs,
  })
}

// â”€â”€â”€ SESSION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function createSession(userId, subject = 'Chemistry') {
  const { data, error } = await supabase
    .from('sessions')
    .insert({ user_id: userId, subject })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSession(sessionId, updates) {
  const { error } = await supabase.from('sessions').update(updates).eq('id', sessionId)
  if (error) throw error
}

// â”€â”€â”€ XP & STREAK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function addXP(userId, xpEarned, newStreak, currentProfile) {
  const newXP = Math.max(0, currentProfile.xp + xpEarned)
  const today = new Date().toDateString()
  const lastActive = currentProfile.last_active
    ? new Date(currentProfile.last_active).toDateString()
    : null

  const yesterday = new Date(Date.now() - 86400000).toDateString()
  const validStreak = lastActive === today || lastActive === yesterday

  await updateProfile(userId, {
    xp: newXP,
    streak: validStreak ? newStreak : newStreak === 0 ? 0 : 1,
    best_streak: Math.max(currentProfile.best_streak ?? 0, newStreak),
    last_active: new Date().toISOString(),
  })

  return newXP
}

// â”€â”€â”€ QUESTION FLAGS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function flagQuestion(userId, questionId, flagType) {
  const { error } = await supabase
    .from('question_flags')
    .upsert({ user_id: userId, question_id: questionId, flag_type: flagType }, { onConflict: 'user_id,question_id,flag_type' })
  if (error) throw error
}

export async function reportQuestion(questionId) {
  const res = await fetch('/api/report-question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId }),
  })
  if (!res.ok) throw new Error(`Report failed (${res.status})`)
  return res.json()
}

export async function getUserFlags(userId, questionIds) {
  if (!questionIds.length) return {}
  const { data, error } = await supabase
    .from('question_flags')
    .select('question_id, flag_type')
    .eq('user_id', userId)
    .in('question_id', questionIds)
  if (error) throw error
  const map = {}
  ;(data || []).forEach(r => {
    if (!map[r.question_id]) map[r.question_id] = []
    map[r.question_id].push(r.flag_type)
  })
  return map
}

// â”€â”€â”€ ANSWER LOG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getAnswerLogLast30Days(userId) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('answer_log')
    .select('answered_at, correct, question_id')
    .eq('user_id', userId)
    .gte('answered_at', since)
    .order('answered_at', { ascending: true })
  if (error) throw error
  return data || []
}

// â”€â”€â”€ ASSESSMENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getAssessments(userId) {
  const { data, error } = await supabase
    .from('assessments')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true })
  if (error) throw error
  return data || []
}

export async function addAssessment(userId, type, label, date) {
  const { data, error } = await supabase
    .from('assessments')
    .insert({ user_id: userId, type, label, date })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteAssessment(id) {
  const { error } = await supabase.from('assessments').delete().eq('id', id)
  if (error) throw error
}

// â”€â”€â”€ SUBSCRIPTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getSubscriptions(userId) {
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
  if (error) throw error
  return data || []
}

export async function saveSubscriptions(userId, subjects) {
  // subjects = [{ subject_name, stage }]
  // Delete all existing subscriptions first so de-selected subjects don't persist
  const { error: delError } = await supabase
    .from('user_subscriptions')
    .delete()
    .eq('user_id', userId)
  if (delError) throw delError
  if (subjects.length === 0) return
  const rows = subjects.map(s => ({
    user_id: userId,
    subject_name: s.subject_name,
    stage: s.stage,
    active: true,
    beta: true,
  }))
  const { error } = await supabase
    .from('user_subscriptions')
    .insert(rows)
  if (error) throw error
}

export async function addSubscription(userId, subjectName, stage) {
  const { error } = await supabase
    .from('user_subscriptions')
    .upsert({ user_id: userId, subject_name: subjectName, stage, active: true, beta: true }, { onConflict: 'user_id,subject_name,stage' })
  if (error) throw error
}

export async function completeOnboarding(userId, profileUpdates) {
  const updates = { ...profileUpdates, onboarding_completed: true, terms_accepted_at: new Date().toISOString() }
  const { error } = await supabase.from('profiles').update(updates).eq('id', userId)
  if (error) throw error
}

export async function markTutorialComplete(userId) {
  const { error } = await supabase
    .from('profiles')
    .update({ app_tutorial_completed_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}

// â”€â”€â”€ LEADERBOARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getLeaderboard(limit = 20) {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .limit(limit)
  if (error) throw error
  return data
}

// â”€â”€â”€ REMEDIATION VARIANTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function normalizeVariant(v, parentQuestionId = null, conceptTag = null) {
  return {
    ...v,
    variant_record_id: v.variant_record_id || v.id,
    options: typeof v.options === 'string' ? JSON.parse(v.options) : v.options,
    concept_tag: v.concept_tag || conceptTag || null,
    parent_question_id: v.parent_question_id || parentQuestionId || null,
  }
}

export async function getRemediationVariants(parentQuestionId, conceptTag, excludeIds = []) {
  const exclude = new Set(excludeIds)

  const { data: direct, error: directError } = await supabase
    .from('question_variants')
    .select('*')
    .eq('parent_question_id', parentQuestionId)
    .order('usage_count', { ascending: true })

  if (directError) throw directError

  const directVariants = (direct || [])
    .map(v => normalizeVariant(v, parentQuestionId, conceptTag))
    .filter(v => !exclude.has(v.id) && !exclude.has(v.variant_record_id))

  const { data: concept, error: conceptError } = await supabase
    .from('question_variants')
    .select('*')
    .eq('concept_tag', conceptTag)
    .order('usage_count', { ascending: true })

  if (conceptError) throw conceptError

  const conceptVariants = (concept || [])
    .map(v => normalizeVariant(v, parentQuestionId, conceptTag))
    .filter(v =>
      !exclude.has(v.id) &&
      !exclude.has(v.variant_record_id) &&
      v.parent_question_id !== parentQuestionId
    )

  return { directVariants, conceptVariants }
}

export async function insertGeneratedQuestionVariants(parentQuestion, variants = []) {
  if (!variants.length) return []

  const payload = variants.map(v => ({
    parent_question_id: v.parent_question_id || parentQuestion.id,
    variant_type: v.variant_type || 'generated',
    subject: v.subject || parentQuestion.subject || 'Chemistry',
    topic: parentQuestion.topic,
    subtopic: parentQuestion.subtopic,
    concept_tag: v.concept_tag || parentQuestion.concept_tag,
    difficulty: v.difficulty || parentQuestion.difficulty || 1,
    question: v.question,
    options: v.options,
    answer_index: v.answer_index,
    solution: v.solution || parentQuestion.solution,
    tip: v.tip || null,
    source: 'ai_generated',
  }))

  const { data, error } = await supabase
    .from('question_variants')
    .insert(payload)
    .select('*')

  if (error) throw error
  return (data || []).map(v => normalizeVariant(v, parentQuestion.id, parentQuestion.concept_tag))
}

/**
 * Persist AI-generated remediation questions into the main `questions` bank so they
 * become reusable across sessions and users (rather than being one-time remediation
 * variants). Returns the inserted rows with their real DB-assigned ids so callers can
 * use those ids when recording answers (which keeps the no-repeat rule intact via
 * struggle_profiles).
 *
 * Each row is given an explicit difficulty (clamped 1..5, falling back to the parent
 * question's difficulty) so the adaptive engine can identify which topics/subtopics
 * the student is struggling with.
 */
export async function insertGeneratedQuestionsToBank(parentQuestion, variants = []) {
  if (!Array.isArray(variants) || variants.length === 0) return []

  // Fetch existing question texts for this subject+topic to avoid content duplicates.
  const subject = parentQuestion.subject || 'Chemistry'
  const topic   = parentQuestion.topic   || ''
  const { data: existing } = await supabase
    .from('questions')
    .select('question')
    .eq('subject', subject)
    .eq('topic', topic)
    .limit(1000)
  const existingTexts = new Set((existing || []).map(q => (q.question || '').trim().toLowerCase()))

  const now = new Date().toISOString()
  const payload = variants
    .filter(v => v.question && !existingTexts.has(v.question.trim().toLowerCase()))
    .map(v => {
      const sub = parentQuestion.subject || subject
      const top = parentQuestion.topic
      const stp = parentQuestion.subtopic || top
      return {
        id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        subject: sub,
        topic: top,
        subtopic: stp,
        concept_tag:
          parentQuestion.concept_tag ||
          `${sub}|${top}|${stp}`.toLowerCase(),
        difficulty: Math.max(1, Math.min(5, Number(v.difficulty || parentQuestion.difficulty || 1))),
        question: v.question,
        options: v.options,
        answer_index: v.answer_index,
        solution: v.solution || parentQuestion.solution || '',
        tip: null,
        created_at: now,
      }
    })

  if (!payload.length) return []

  const { data, error } = await supabase
    .from('questions')
    .insert(payload)
    .select('*')

  if (error) throw error

  return (data || []).map(q => ({
    ...q,
    options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
    concept_tag:
      q.concept_tag ||
      `${q.subject}|${q.topic}|${q.subtopic}`.toLowerCase(),
  }))
}

/**
 * Ask the AI to generate `count` new questions for the given subject + topic
 * and persist them directly to the live questions table (autoApprove=true).
 * Returns the newly inserted question rows, normalized for the engine.
 *
 * @param {string} subject   e.g. 'Chemistry Stage 1'
 * @param {string} topicCode e.g. '2.2'
 * @param {number} count
 * @returns {Promise<object[]>}
 */
export async function fetchAndPersistMoreQuestions(subject, topicCode, count = 10, targetDifficulty = null) {
  // targetDifficulty: 1–5 numeric or null (→ 'mixed').  The API uses it to
  // bias the AI's difficulty distribution towards the student's current level.
  const difficulty = targetDifficulty != null ? targetDifficulty : 'mixed'
  const res = await fetch('/api/generate-questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, topicCode, count, difficulty, autoApprove: true }),
  })
  if (!res.ok) throw new Error(`generate-questions API error: ${res.status}`)
  const data = await res.json()
  const rows = data.questions || []
  return rows.map(q => ({
    ...q,
    options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
    concept_tag:
      q.concept_tag ||
      `${q.subject}|${q.topic}|${q.subtopic}`.toLowerCase(),
  }))
}

export async function flagTopicForStudyPlan(userId, { subject, topic, subtopic, concept_tag, reason = 'remediation' }) {
  const { error } = await supabase
    .from('study_plan_items')
    .insert({ user_id: userId, subject, topic, subtopic, concept_tag, reason })
  if (error) throw error
}

/**
 * Returns a map of { [conceptTag]: count } for all provided concept tags.
 * Concept tags not present in question_variants will not appear (treat as 0).
 *
 * Draft questions reference variants through a shared concept_tag
 * (built as `${subject}|${topic}|${subtopic || topic}`.toLowerCase()).
 * Variants are keyed on live questions.id (text), NOT draft_questions.id (uuid),
 * so we group by concept_tag instead of parent_question_id.
 */
export async function getVariantCountsByConceptTags(conceptTags) {
  const tags = [...new Set((conceptTags || []).filter(Boolean))]
  if (tags.length === 0) return {}

  // Use a high limit to avoid PostgREST's default 1 000-row truncation.
  // Typical variant volumes for an admin review queue are well under this ceiling.
  const { data, error } = await supabase
    .from('question_variants')
    .select('concept_tag')
    .in('concept_tag', tags)
    .limit(10000)

  if (error) throw error

  const counts = {}
  for (const row of data || []) {
    const ct = row.concept_tag
    if (ct) counts[ct] = (counts[ct] || 0) + 1
  }
  return counts
}

export async function incrementQuestionVariantUsage(variantId) {
  if (!variantId) return

  const { data: existing, error: fetchError } = await supabase
    .from('question_variants')
    .select('id, usage_count')
    .eq('id', variantId)
    .single()

  if (fetchError) throw fetchError

  const { error } = await supabase
    .from('question_variants')
    .update({
      usage_count: (existing?.usage_count ?? 0) + 1,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', variantId)

  if (error) throw error
}

// ── TUTOR DASHBOARD ───────────────────────────────────────────────────────────

/** Fetch the roster of students for a tutor. Returns joined profile data. */
export async function fetchRoster(tutorId) {
  const { data, error } = await supabase
    .from('tutor_students')
    .select('student_id, invited_at, profiles!tutor_students_student_id_fkey(display_name, xp, streak)')
    .eq('tutor_id', tutorId)
    .order('invited_at', { ascending: false })
  if (error) throw error
  return (data || []).map(r => ({ ...r, profiles: r.profiles || null }))
}

/** Add a student to a tutor's roster by email.
 *  Email lookup is done server-side via the api-server (service role required to query auth.users).
 *  The caller's Supabase JWT is forwarded so the server can verify tutor identity.
 */
export async function addStudentToRoster(tutorId, studentEmail) {
  const { data: sessionData } = await supabase.auth.getSession()
  const jwt = sessionData?.session?.access_token
  if (!jwt) throw new Error('Not authenticated.')

  const res = await fetch('/api/tutor/find-student', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({ email: studentEmail }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to add student' }))
    throw new Error(err.error || 'No user found with that email address.')
  }
  const studentData = await res.json()

  const { error } = await supabase
    .from('tutor_students')
    .upsert({ tutor_id: tutorId, student_id: studentData.id }, { onConflict: 'tutor_id,student_id' })
  if (error) throw error
  return studentData
}

/** Fetch email map { studentId → email } for the given roster student IDs. */
export async function fetchStudentEmails(studentIds) {
  if (!Array.isArray(studentIds) || studentIds.length === 0) return {}
  const { data: sessionData } = await supabase.auth.getSession()
  const jwt = sessionData?.session?.access_token
  if (!jwt) throw new Error('Not authenticated.')

  const res = await fetch('/api/tutor/student-emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({ ids: studentIds }),
  })
  if (!res.ok) return {}
  const json = await res.json().catch(() => ({ emails: {} }))
  return json.emails || {}
}

/** Remove a student from a tutor's roster. */
export async function removeStudentFromRoster(tutorId, studentId) {
  const { error } = await supabase
    .from('tutor_students')
    .delete()
    .eq('tutor_id', tutorId)
    .eq('student_id', studentId)
  if (error) throw error
}

/** Send an assignment notification email to a student. Returns { ok, error }. */
export async function sendAssignmentNotification(studentId, assignment) {
  const { data: sessionData } = await supabase.auth.getSession()
  const jwt = sessionData?.session?.access_token
  if (!jwt) return { ok: false, error: 'Not authenticated.' }
  const res = await fetch('/api/tutor/notify-assignment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ student_id: studentId, assignment }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: json.error || 'Failed to send notification.' }
  return { ok: true }
}

/** Send a custom notification email to a student. Returns { ok, error }. */
export async function notifyStudent(studentId, message) {
  const { data: sessionData } = await supabase.auth.getSession()
  const jwt = sessionData?.session?.access_token
  if (!jwt) return { ok: false, error: 'Not authenticated.' }
  const res = await fetch('/api/tutor/notify-student', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ student_id: studentId, message }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: json.error || 'Failed to send notification.' }
  return { ok: true }
}

/** Create an assignment for a single student. */
export async function createAssignment(tutorId, studentId, { type, subject, topics, due_date }) {
  const { data, error } = await supabase
    .from('assignments')
    .insert({ tutor_id: tutorId, student_id: studentId, type, subject, topics, due_date })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Fetch all assignments created by a tutor, with student profile data. */
export async function fetchAssignmentsForTutor(tutorId) {
  const { data, error } = await supabase
    .from('assignments')
    .select('*, profiles!assignments_student_id_fkey(display_name)')
    .eq('tutor_id', tutorId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(r => ({ ...r, profiles: r.profiles || null }))
}

// ── TUTOR CLASSES ─────────────────────────────────────────────────────────────

async function tutorFetch(path, opts = {}) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
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

/** Fetch tutor classes with their members. */
export async function fetchTutorClasses() {
  const json = await tutorFetch('/api/tutor/classes')
  return json.classes || []
}

export async function createTutorClass({ name, subject, color, description } = {}) {
  const json = await tutorFetch('/api/tutor/classes', {
    method: 'POST',
    body: JSON.stringify({ name, subject, color, description }),
  })
  return json.class
}

export async function updateTutorClass(classId, updates) {
  const json = await tutorFetch(`/api/tutor/classes/${encodeURIComponent(classId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  return json.class
}

export async function deleteTutorClass(classId) {
  await tutorFetch(`/api/tutor/classes/${encodeURIComponent(classId)}`, { method: 'DELETE' })
}

export async function addStudentsToClass(classId, studentIds) {
  return tutorFetch(`/api/tutor/classes/${encodeURIComponent(classId)}/members`, {
    method: 'POST',
    body: JSON.stringify({ studentIds }),
  })
}

export async function removeStudentFromClass(classId, studentId) {
  await tutorFetch(`/api/tutor/classes/${encodeURIComponent(classId)}/members/${encodeURIComponent(studentId)}`, {
    method: 'DELETE',
  })
}

/** Create a batch of assignments. Server resolves the union of studentIds + classIds + allRoster. */
export async function createBatchAssignment({ type, subject, topics, due_date, studentIds = [], classIds = [], allRoster = false, notify = true } = {}) {
  return tutorFetch('/api/tutor/assignments/batch', {
    method: 'POST',
    body: JSON.stringify({ type, subject, topics, due_date, studentIds, classIds, allRoster, notify }),
  })
}

/** Fetch pending (not completed) assignments for a student. */
export async function fetchAssignmentsForStudent(studentId) {
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('student_id', studentId)
    .is('completed_at', null)
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data || []
}

/** Mark an assignment as completed.
 *  Uses the complete_assignment() security-definer RPC so students can only
 *  update completed_at — all other columns are frozen inside the function.
 */
export async function completeAssignment(assignmentId) {
  const { error } = await supabase.rpc('complete_assignment', { p_assignment_id: assignmentId })
  if (error) throw error
}

/** Delete an assignment (tutor only). */
export async function deleteAssignment(assignmentId) {
  const { error } = await supabase
    .from('assignments')
    .delete()
    .eq('id', assignmentId)
  if (error) throw error
}

/** Writing attempts for a roster student (tutor API; raw essay text not included). */
export async function fetchTutorStudentWritingAttempts(studentId) {
  const json = await tutorFetch(`/api/tutor/students/${encodeURIComponent(studentId)}/writing-attempts`)
  return json.attempts || []
}

// ── Roster details: year level + tutor-scoped tutored subjects ────────────────

/** { byStudent: { [id]: { year_level, subjects:[{id,subject_name,stage}] } } } */
export async function fetchRosterDetails() {
  const json = await tutorFetch('/api/tutor/roster-details')
  return json.byStudent || {}
}

/** Set a roster student's Year level. */
export async function setStudentYearLevel(studentId, yearLevel) {
  return tutorFetch(`/api/tutor/students/${encodeURIComponent(studentId)}/details`, {
    method: 'PATCH',
    body: JSON.stringify({ year_level: yearLevel }),
  })
}

/** Add a subject + stage the tutor tutors this student in. */
export async function addStudentSubject(studentId, subjectName, stage) {
  const json = await tutorFetch(`/api/tutor/students/${encodeURIComponent(studentId)}/subjects`, {
    method: 'POST',
    body: JSON.stringify({ subject_name: subjectName, stage }),
  })
  return json.subject
}

/** Remove a tutored subject by its id. */
export async function removeStudentSubject(studentId, subjectId) {
  await tutorFetch(`/api/tutor/students/${encodeURIComponent(studentId)}/subjects/${encodeURIComponent(subjectId)}`, {
    method: 'DELETE',
  })
}

// ── TUTOR RESOURCES (notes / files / recordings / links) ──────────────────────

const MAX_RESOURCE_BYTES = 5 * 1024 * 1024 * 1024  // 5 GB (resumable uploads)
const RESUMABLE_THRESHOLD = 6 * 1024 * 1024        // switch to TUS above ~6 MB
const RESOURCE_BUCKET = 'tutor-resources'

/** Resumable (TUS) upload to Supabase Storage — survives flaky connections and
 *  large files. Reports progress 0–100 via onProgress.
 */
async function uploadResumable(bucket, objectName, file, contentType, onProgress) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const { Upload } = await import('tus-js-client')

  await new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: { authorization: `Bearer ${token}`, 'x-upsert': 'false' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024, // Supabase requires exactly 6 MB chunks
      metadata: { bucketName: bucket, objectName, contentType, cacheControl: '3600' },
      onError: (err) => reject(new Error(`Upload failed: ${err.message || err}`)),
      onProgress: (sent, total) => { if (onProgress && total) onProgress(Math.round((sent / total) * 100)) },
      onSuccess: () => resolve(),
    })
    upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0])
      upload.start()
    }).catch(() => upload.start())
  })
}

/** Upload a class file to the tutor-resources bucket and return its storage path.
 *  Files live under <tutorId>/<timestamp>_<name> to satisfy the storage policy.
 *  Large files use resumable uploads; onProgress(0–100) reports upload progress.
 */
export async function uploadTutorResourceFile(tutorId, file, onProgress) {
  if (file.size > MAX_RESOURCE_BYTES) {
    throw new Error(`File too large (${Math.round((file.size / (1024 * 1024 * 1024)) * 10) / 10} GB). Max 5 GB.`)
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${tutorId}/${Date.now()}_${safeName}`
  const contentType = file.type || 'application/octet-stream'

  if (file.size > RESUMABLE_THRESHOLD) {
    await uploadResumable(RESOURCE_BUCKET, storagePath, file, contentType, onProgress)
  } else {
    const { error } = await supabase.storage
      .from(RESOURCE_BUCKET)
      .upload(storagePath, file, { contentType, upsert: false })
    if (error) throw new Error(`Upload failed: ${error.message}`)
    if (onProgress) onProgress(100)
  }
  return { storagePath, fileName: file.name, fileSize: file.size, mimeType: file.type || null }
}

/** Create a tutor resource (file or link). Server validates targets + emails. */
export async function createTutorResource(payload) {
  const json = await tutorFetch('/api/tutor/resources', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return json
}

/** List the calling tutor's resources, enriched with class/student names. */
export async function fetchTutorResources() {
  const json = await tutorFetch('/api/tutor/resources')
  return json.resources || []
}

/** Delete a tutor resource (also removes the stored file). */
export async function deleteTutorResource(resourceId) {
  await tutorFetch(`/api/tutor/resources/${encodeURIComponent(resourceId)}`, { method: 'DELETE' })
}

/** Resolve a fresh signed download URL (or external link) for a resource. */
export async function getTutorResourceDownloadUrl(resourceId) {
  const json = await tutorFetch(`/api/resources/${encodeURIComponent(resourceId)}/download`)
  return json.url
}

/** List resources shared with the calling student (includes signed URLs). */
export async function fetchStudentResources() {
  const json = await tutorFetch('/api/resources/student')
  return json.resources || []
}

/**
 * Fetch a student's full progress summary for a tutor's view.
 * Returns: xp, streak, accuracy, totalAttempts, topicBreakdown[], assignments[], recentActivity[]
 */
export async function fetchStudentProgressForTutor(tutorId, studentId) {
  // Verify this student is on the tutor's roster
  const { data: rosterRow, error: rosterError } = await supabase
    .from('tutor_students')
    .select('student_id')
    .eq('tutor_id', tutorId)
    .eq('student_id', studentId)
    .single()
  if (rosterError || !rosterRow) throw new Error('Student not on your roster.')

  // Fetch profile stats (xp, streak)
  const { data: prof, error: profError } = await supabase
    .from('profiles')
    .select('xp, streak, best_streak')
    .eq('id', studentId)
    .single()
  if (profError) throw profError

  // Fetch struggle profile for accuracy/topic breakdown
  const { data: struggles, error: sError } = await supabase
    .from('struggle_profiles')
    .select('question_id, attempts, wrong')
    .eq('user_id', studentId)
  if (sError) throw sError

  // Fetch questions to map question_id → topic
  const { data: questions, error: qError } = await supabase
    .from('questions')
    .select('id, topic, subject')
  if (qError) throw qError

  const qMap = {}
  ;(questions || []).forEach(q => { qMap[q.id] = q })

  const totalAttempts = (struggles || []).reduce((s, r) => s + (r.attempts || 0), 0)
  const totalWrong    = (struggles || []).reduce((s, r) => s + (r.wrong || 0), 0)
  const accuracy      = totalAttempts > 0 ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100) : 0

  // Topic breakdown
  const topicMap = {}
  ;(struggles || []).forEach(r => {
    const q = qMap[r.question_id]
    if (!q) return
    const t = q.topic || 'Unknown'
    if (!topicMap[t]) topicMap[t] = { topic: t, attempts: 0, wrong: 0 }
    topicMap[t].attempts += r.attempts || 0
    topicMap[t].wrong    += r.wrong || 0
  })
  const topicBreakdown = Object.values(topicMap).sort((a, b) => b.attempts - a.attempts)

  // Fetch assignments for this student (from this tutor)
  const { data: assignments, error: aError } = await supabase
    .from('assignments')
    .select('*')
    .eq('tutor_id', tutorId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (aError) throw aError

  // Fetch recent activity (last 10 answers)
  const { data: recentActivity, error: raError } = await supabase
    .from('answer_log')
    .select('answered_at, correct, question_id')
    .eq('user_id', studentId)
    .order('answered_at', { ascending: false })
    .limit(10)
  if (raError) throw raError

  // Fetch off-topic attempt counts (grouped by subject+topic)
  let offTopicAttempts = []
  try {
    const { data: otRows, error: otError } = await supabase
      .from('off_topic_attempts')
      .select('subject, topic, attempted_at')
      .eq('student_id', studentId)
      .order('attempted_at', { ascending: false })
    if (otError) {
      console.warn('[db] fetchStudentProgressForTutor: could not fetch off_topic_attempts —', otError.message, '(migration may not be applied yet)')
    } else if (otRows && otRows.length > 0) {
      const countMap = {}
      otRows.forEach(r => {
        const key = `${r.subject}||${r.topic}`
        if (!countMap[key]) countMap[key] = { subject: r.subject, topic: r.topic, count: 0, last_attempt: r.attempted_at }
        countMap[key].count++
      })
      offTopicAttempts = Object.values(countMap).sort((a, b) => b.count - a.count)
    }
  } catch (err) {
    console.warn('[db] fetchStudentProgressForTutor: unexpected error fetching off_topic_attempts —', err)
  }

  return {
    xp:              prof?.xp ?? 0,
    streak:          prof?.streak ?? 0,
    best_streak:     prof?.best_streak ?? 0,
    accuracy,
    totalAttempts,
    topicBreakdown,
    assignments:     assignments || [],
    recentActivity:  recentActivity || [],
    offTopicAttempts,
  }
}

// ── DIAGNOSTIC ASSESSMENTS ────────────────────────────────────────────────────

/** Generate questions from Claude AI (preview, no save). */
export async function generateDiagnosticQuestions({ yearLevel, subjects }) {
  return tutorFetch('/api/tutor/diagnostic/generate', {
    method: 'POST',
    body: JSON.stringify({ yearLevel, subjects }),
  })
}

/** Save a diagnostic assessment and get the unique student link. */
export async function createDiagnosticAssessment({ yearLevel, subjects, questions, studentName, preCallFormUrl }) {
  return tutorFetch('/api/tutor/diagnostic/create', {
    method: 'POST',
    body: JSON.stringify({ yearLevel, subjects, questions, studentName, preCallFormUrl }),
  })
}

/** List all diagnostics created by this tutor. */
export async function fetchDiagnosticAssessments() {
  return tutorFetch('/api/tutor/diagnostic/list')
}

/** Get the full report for a completed diagnostic (tutor auth). */
export async function fetchDiagnosticReport(assessmentId) {
  return tutorFetch(`/api/tutor/diagnostic/${encodeURIComponent(assessmentId)}/report`)
}

/** Load an assessment for a student (public — no auth). */
export async function loadDiagnosticByToken(token) {
  const res = await fetch(`/api/diagnostic/${encodeURIComponent(token)}`)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Assessment not found.')
  return json
}

/** Submit student answers (public — no auth). */
export async function submitDiagnosticAnswers(token, { studentName, answers }) {
  const res = await fetch(`/api/diagnostic/${encodeURIComponent(token)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentName, answers }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Submission failed.')
  return json
}

/** Download a diagnostic assessment PDF report (tutor). */
export async function downloadDiagnosticReportPdf(assessmentId, studentName) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const res = await fetch(`/api/tutor/diagnostic/${encodeURIComponent(assessmentId)}/report/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to download PDF.')
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `diagnostic-report-${(studentName || 'student').replace(/\s+/g, '-').toLowerCase()}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
// ── Tutoring Sessions ─────────────────────────────────────────────────────────

/** Create a new tutoring session (tutor only). */
export async function createTutoringSession({ session_type = 'individual', student_id, student_ids, scheduled_at, duration_minutes = 60, title, notes, class_id, record_session = false }) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ session_type, student_id, student_ids, scheduled_at, duration_minutes, title, notes, class_id, record_session }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Failed to create session.')
  return json.session
}

/** List tutoring sessions for the current user (tutor or student). */
export async function fetchTutoringSessions({ status, limit = 20, offset = 0 } = {}) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (status) params.set('status', status)
  const res = await fetch(`/api/sessions?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Failed to fetch sessions.')
  return json.sessions
}

/** Get a single tutoring session by ID. */
export async function fetchTutoringSession(id) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Session not found.')
  return json.session
}

/** Generate a LiveKit access token for joining a session room. */
export async function getTutoringSessionToken(sessionId) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Failed to get session token.')
  return json // { token, wsUrl, roomName }
}

/** Update a tutoring session (tutor only). */
export async function updateTutoringSession(id, updates) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(updates),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Failed to update session.')
  return json.session
}

/** Cancel a tutoring session (tutor only). */
export async function cancelTutoringSession(id) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Failed to cancel session.')
  return json
}

// ── Recurring Series ──────────────────────────────────────────────────────────

/** Create a recurring session series. */
export async function createSessionSeries({
  session_type = 'individual', student_id, student_ids, class_id,
  recurrence_type, day_of_week, time_of_day, timezone = 'Australia/Adelaide',
  duration_minutes = 60, title, notes, starts_at, ends_at, record_session = false,
}) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const res = await fetch('/api/series', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      session_type, student_id, student_ids, class_id,
      recurrence_type, day_of_week, time_of_day, timezone,
      duration_minutes, title, notes, starts_at, ends_at, record_session,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Failed to create series.')
  return json
}

/** List all recurring series for the current tutor. */
export async function fetchSessionSeries() {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const res = await fetch('/api/series', { headers: { Authorization: `Bearer ${token}` } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Failed to fetch series.')
  return json.series
}

/** Cancel a series (and all future sessions in it). */
export async function cancelSessionSeries(id) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const res = await fetch(`/api/series/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'cancelled' }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Failed to cancel series.')
  return json
}

/** Generate more occurrences for an existing series. */
export async function extendSessionSeries(id) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const res = await fetch(`/api/series/${encodeURIComponent(id)}/extend`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Failed to extend series.')
  return json
}

/** Get info about a room by its room name (for the permanent join page). */
export async function getRoomInfo(roomName) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const res = await fetch(`/api/rooms/${encodeURIComponent(roomName)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Room not found.')
  return json.room
}

/** End a tutoring session for all participants (tutor only). Closes the LiveKit room. */
export async function endTutoringSession(sessionId) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Failed to end session.')
  return json
}

// ── PLATFORM SETTINGS ─────────────────────────────────────────────────────────

export async function getPlatformSettings(key) {
  const { data, error } = await supabase.from('platform_settings').select('value').eq('key', key).single()
  if (error) return null
  return data?.value ?? null
}

export async function setPlatformSetting(key, value) {
  const { error } = await supabase.from('platform_settings').upsert({ key, value, updated_at: new Date().toISOString() })
  if (error) throw error
}

/** Generate a LiveKit token by room name (for permanent links). */
export async function getRoomToken(roomName) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const res = await fetch(`/api/rooms/${encodeURIComponent(roomName)}/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Failed to get room token.')
  return json // { token, wsUrl, roomName, title, is_series }
}

// ── Exam simulator attempts + percentile analytics ──────────────────────────
export async function saveExamAttempt(userId, attempt) {
  if (!userId) return null
  const row = {
    user_id: userId,
    track_id: attempt.trackId,
    title: attempt.title || null,
    total_correct: attempt.totalCorrect ?? 0,
    total_questions: attempt.totalQuestions ?? 0,
    percent: attempt.percent ?? 0,
    per_section: attempt.perSection ?? null,
  }
  const { data, error } = await supabase.from('exam_attempts').insert(row).select('id').maybeSingle()
  if (error) throw error
  return data
}

// Aggregate percentile for a track via the SECURITY DEFINER RPC (no other
// users' rows are exposed — only the aggregate comparison).
export async function fetchExamPercentile(trackId, percent) {
  const { data, error } = await supabase.rpc('exam_track_percentile', { p_track_id: trackId, p_percent: percent })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row ? { attempts: Number(row.attempts) || 0, average: Number(row.average) || 0, percentile: row.percentile == null ? null : Number(row.percentile) } : null
}

export async function fetchMyExamAttempts(userId, limit = 10) {
  if (!userId) return []
  const { data, error } = await supabase
    .from('exam_attempts')
    .select('id, track_id, title, percent, total_correct, total_questions, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}
