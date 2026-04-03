import { supabase } from './supabase'
import { nextReviewTime } from './engine'

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export async function signUp(email, password, displayName, school) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { display_name: displayName } }
  })
  if (error) throw error

  // Update profile with school
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
    .from('profiles').select('*').eq('id', userId).single()
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
    .from('questions').select('*').eq('subject', subject)
  if (error) throw error
  // Normalise: parse options JSON string if needed
  return data.map(q => ({
    ...q,
    options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
  }))
}

// ─── STRUGGLE PROFILE ─────────────────────────────────────────────────────────
export async function getStruggleMap(userId) {
  const { data, error } = await supabase
    .from('struggle_profiles')
    .select('question_id, attempts, wrong, last_seen, next_review')
    .eq('user_id', userId)
  if (error) throw error

  // Return as a map: { questionId: { attempts, wrong, last_seen, next_review } }
  return Object.fromEntries(data.map(r => [r.question_id, r]))
}

export async function recordAnswer(userId, questionId, correct) {
  const { data: existing } = await supabase
    .from('struggle_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('question_id', questionId)
    .single()

  const attempts   = (existing?.attempts ?? 0) + 1
  const wrong      = (existing?.wrong ?? 0) + (correct ? 0 : 1)
  const next_review = nextReviewTime(attempts, wrong).toISOString()
  const last_seen  = new Date().toISOString()

  if (existing) {
    await supabase.from('struggle_profiles').update({
      attempts, wrong, last_seen, next_review
    }).eq('user_id', userId).eq('question_id', questionId)
  } else {
    await supabase.from('struggle_profiles').insert({
      user_id: userId, question_id: questionId,
      attempts, wrong, last_seen, next_review
    })
  }
}

// ─── SESSION ──────────────────────────────────────────────────────────────────
export async function createSession(userId, subject) {
  const { data, error } = await supabase
    .from('sessions').insert({ user_id: userId, subject }).select().single()
  if (error) throw error
  return data
}

export async function updateSession(sessionId, updates) {
  await supabase.from('sessions').update(updates).eq('id', sessionId)
}

// ─── XP & STREAK ──────────────────────────────────────────────────────────────
export async function addXP(userId, xpEarned, newStreak, currentProfile) {
  const newXP = currentProfile.xp + xpEarned
  const today = new Date().toDateString()
  const lastActive = currentProfile.last_active
    ? new Date(currentProfile.last_active).toDateString()
    : null

  // Only count streak if last active was yesterday or today
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

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────
export async function getLeaderboard(limit = 20) {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .limit(limit)
  if (error) throw error
  return data
}
