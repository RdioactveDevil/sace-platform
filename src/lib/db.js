import { supabase } from './supabase'

// ================= AUTH =================
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
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

// ================= PROFILE =================
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

// ================= QUESTIONS =================
export async function getQuestions() {
  const { data, error } = await supabase.from('questions').select('*')
  if (error) throw error
  return data
}

// ================= STRUGGLE =================
export async function getStruggleMap(userId) {
  const { data } = await supabase
    .from('struggle_profiles')
    .select('*')
    .eq('user_id', userId)

  return Object.fromEntries(data.map(r => [r.question_id, r]))
}

export async function recordAnswer(userId, questionId, correct) {
  await supabase.from('answer_log').insert({
    user_id: userId,
    question_id: questionId,
    selected: 0,
    correct,
  })
}

// ================= SESSION =================
export async function createSession(userId) {
  const { data } = await supabase
    .from('sessions')
    .insert({ user_id: userId })
    .select()
    .single()
  return data
}

export async function updateSession(sessionId, updates) {
  await supabase.from('sessions').update(updates).eq('id', sessionId)
}

// ================= XP =================
export async function addXP(userId, xp) {
  await supabase.rpc('increment_xp', {
    uid: userId,
    amount: xp,
  })
}

// ================= LEADERBOARD =================
export async function getLeaderboard() {
  const { data } = await supabase.from('leaderboard').select('*')
  return data
}

// ================= REMEDIATION (STUBS) =================
export async function getRemediationVariants() {
  return { directVariants: [], conceptVariants: [] }
}

export async function insertGeneratedQuestionVariants() {
  return []
}

export async function incrementQuestionVariantUsage() {}