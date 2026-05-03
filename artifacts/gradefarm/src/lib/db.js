import { supabase } from './supabase'
import { nextReviewTime } from './engine'

// â”€â”€â”€ AUTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function signUp(email, password, displayName, school, applyForTutor = false) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } }
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

export async function adminGetStudentAssignments(studentId) {
  const json = await adminFetch(`/api/admin/students/${encodeURIComponent(studentId)}/assignments`)
  return json.assignments || []
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

// â”€â”€â”€ QUESTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getQuestions(subject = 'Chemistry') {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('subject', subject)

  if (error) throw error

  return data.map(q => ({
    ...q,
    options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
    concept_tag:
      q.concept_tag ||
      `${q.subject || subject}|${q.topic}|${q.subtopic}`.toLowerCase(),
  }))
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
    topic: v.topic || parentQuestion.topic,
    subtopic: v.subtopic || parentQuestion.subtopic,
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

  const payload = variants.map(v => ({
    subject: v.subject || parentQuestion.subject || 'Chemistry',
    topic: v.topic || parentQuestion.topic,
    subtopic: v.subtopic || parentQuestion.subtopic,
    concept_tag:
      v.concept_tag ||
      parentQuestion.concept_tag ||
      `${(v.subject || parentQuestion.subject || 'Chemistry')}|${v.topic || parentQuestion.topic}|${v.subtopic || parentQuestion.subtopic}`.toLowerCase(),
    difficulty: Math.max(1, Math.min(5, Number(v.difficulty || parentQuestion.difficulty || 1))),
    question: v.question,
    options: v.options,
    answer_index: v.answer_index,
    solution: v.solution || parentQuestion.solution || '',
  }))

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