import { supabase } from './supabase'
import { nextReviewTime } from './engine'

// ─── AUTH ─────────────────────────────────────────────────────────────────────
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

// ─── PROFILE ──────────────────────────────────────────────────────────────────
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

// ─── QUESTIONS ────────────────────────────────────────────────────────────────
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

// ─── STRUGGLE PROFILE ─────────────────────────────────────────────────────────
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

// ─── SESSION ──────────────────────────────────────────────────────────────────
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

// ─── XP & STREAK ──────────────────────────────────────────────────────────────
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

// ─── QUESTION FLAGS ───────────────────────────────────────────────────────────
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

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────
export async function getLeaderboard(limit = 20) {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .limit(limit)
  if (error) throw error
  return data
}

// ─── REMEDIATION VARIANTS ─────────────────────────────────────────────────────
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