import { supabase } from './supabase'
import { nextReviewTime } from './engine'

// â”€â”€â”€ AUTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function signUp(email, password, displayName, school) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } }
  })
  if (error) throw error

  if (data.user && school) {
    await supabase.from('profiles').update({ school }).eq('id', data.user.id)
  }
  return data
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