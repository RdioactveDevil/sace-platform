import { supabase, SUPABASE_URL } from './supabase'
import { currentStreak } from './streak'
import { nextReviewTime } from './engine'
import { questionsBankSubjectKeys } from './subjects'

// â”€â”€â”€ AUTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * `redirectTo`: where the confirmation link lands (e.g. back on a tutor invite).
 * `parentName`: a parent setting the account up for their child; `displayName`
 * is then the child's name, and onboarding takes the parent's route.
 */
export async function signUp(email, password, displayName, school, applyForTutor = false, redirectTo = undefined, parentName = null) {
  const meta = parentName
    ? { display_name: displayName, signup_path: 'parent', parent_name: parentName }
    : { display_name: displayName, signup_path: 'student' }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: meta, ...(redirectTo ? { emailRedirectTo: redirectTo } : {}) }
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

// Subject access for another student goes through the API: user_subscriptions
// RLS only lets a user write their own rows.
export async function adminListSubscriptions(studentId) {
  const json = await adminFetch(`/api/admin/students/${encodeURIComponent(studentId)}/subscriptions`)
  return json.subscriptions || []
}

export async function adminGrantSubscription(studentId, curriculumId) {
  return adminFetch(`/api/admin/students/${encodeURIComponent(studentId)}/subscriptions`, {
    method: 'POST',
    body: JSON.stringify({ curriculumId }),
  })
}

export async function adminRevokeSubscription(studentId, subscriptionId) {
  return adminFetch(`/api/admin/students/${encodeURIComponent(studentId)}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'DELETE',
  })
}

// Tutor ↔ student links (tutor_students), managed by admins.
export async function adminListTutorLinks({ studentId, tutorId } = {}) {
  const qs = new URLSearchParams()
  if (studentId) qs.set('studentId', studentId)
  if (tutorId) qs.set('tutorId', tutorId)
  const json = await adminFetch(`/api/admin/tutor-links?${qs}`)
  return json.links || []
}

export async function adminLinkTutor(tutorId, studentId) {
  return adminFetch('/api/admin/tutor-links', { method: 'POST', body: JSON.stringify({ tutorId, studentId }) })
}

export async function adminUnlinkTutor(tutorId, studentId) {
  const qs = new URLSearchParams({ tutorId, studentId })
  return adminFetch(`/api/admin/tutor-links?${qs}`, { method: 'DELETE' })
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

/** Take a subject off a tutor's plan subjects; resolves to { plan_subjects }. */
export async function adminRemoveTutorPlanSubject(tutorId, name) {
  return adminFetch(`/api/admin/tutors/${encodeURIComponent(tutorId)}/plan-subjects/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

/** Let a tutor use the tutor portal without a plan (or make them need one). */
export async function adminSetTutorBillingExempt(tutorId, exempt) {
  return adminFetch(`/api/admin/tutors/${encodeURIComponent(tutorId)}/billing-exempt`, {
    method: 'PATCH',
    body: JSON.stringify({ exempt }),
  })
}

/** Let a tutor include subjects, free, for their students (or stop them). */
export async function adminSetTutorIncludeSubject(tutorId, enabled) {
  return adminFetch(`/api/admin/tutors/${encodeURIComponent(tutorId)}/include-subject`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })
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

/** Email a password-reset link that brings the user back to /reset-password. */
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) throw error
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

/**
 * Start changing the sign-in email. Supabase emails a confirmation link (to
 * the new address, and to the current one too when secure email change is
 * on); the email only changes once it's confirmed.
 */
export async function changeEmail(newEmail) {
  const { data, error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: `${window.location.origin}/my-account?tab=profile` },
  )
  if (error) throw error
  return data?.user || null
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
// PostgREST caps any single response at 1000 rows, so an unpaginated
// `.select()` over an unbounded result set (a large subject bank, a whole
// table, a per-user history that grows without limit) is silently truncated —
// e.g. newly added questions land in the dropped tail and never reach the UI.
// `fetchAllRows` pulls successive 1000-row windows until a short page.
// `buildQuery` must return a *fresh* filtered query each call (Supabase query
// builders are single-use). `orderColumn` should be a stable key so pages
// don't overlap or skip rows; it does not change display order, which is
// handled downstream (mapAndDedupeQuestions, the quiz shuffle, etc.).
const SUPABASE_PAGE_SIZE = 1000

async function fetchAllRows(buildQuery, orderColumn = 'id') {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery()
      .order(orderColumn, { ascending: true })
      .range(from, from + SUPABASE_PAGE_SIZE - 1)
    if (error) throw error
    const rows = data || []
    all.push(...rows)
    if (rows.length < SUPABASE_PAGE_SIZE) break
    from += SUPABASE_PAGE_SIZE
  }
  return all
}

export async function getQuestions(subject = 'Chemistry') {
  const data = await fetchAllRows(() =>
    supabase.from('questions').select('*').eq('subject', subject))
  return mapAndDedupeQuestions(data, subject)
}

/**
 * Load the bank for a subject tile.
 *
 * Curriculum tiles load by `questions.curriculum_id` (set by the DB on insert —
 * see migration 20261015000001), plus any still-unlinked rows whose subject
 * spelling matches. If the curriculum_id column doesn't exist yet the query
 * errors and we fall back to spelling-matching alone.
 */
export async function getQuestionsForSubjectTile(subjectTile) {
  const keys = questionsBankSubjectKeys(subjectTile)
  const curriculumId = curriculumIdFromTile(subjectTile)

  if (curriculumId) {
    try {
      // Reading-comprehension questions carry their passage (migration 20261015000003).
      const cols = '*, passage:passages(id, title, kind, body)'
      const linked = await fetchAllRows(() =>
        supabase.from('questions').select(cols).eq('curriculum_id', curriculumId))
      const unlinked = keys.length
        ? await fetchAllRows(() =>
            supabase.from('questions').select(cols).is('curriculum_id', null).in('subject', keys))
        : []
      return mapAndDedupeQuestions([...linked, ...unlinked], keys[0] || subjectTile.name)
    } catch {
      // curriculum_id not migrated yet — fall through to spelling match
    }
  }

  if (keys.length === 0) return []
  if (keys.length === 1) return getQuestions(keys[0])
  const data = await fetchAllRows(() =>
    supabase.from('questions').select('*').in('subject', keys))
  return mapAndDedupeQuestions(data, keys[0])
}

function curriculumIdFromTile(tile) {
  const id = tile?.id
  return typeof id === 'string' && id.startsWith('curriculum_') ? id.slice('curriculum_'.length) : null
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
      items.push({
        name: subject,
        levelLabel: String(e.levelLabel || '').trim(),
        ...(e.curriculumId ? { curriculumId: String(e.curriculumId) } : {}),
      })
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
  // A user accumulates one struggle row per question attempted, which grows
  // past the 1000-row cap for active students — page through so the adaptive
  // engine sees the full history (review scheduling, "new question" detection).
  const data = await fetchAllRows(() =>
    supabase
      .from('struggle_profiles')
      .select('question_id, attempts, wrong, last_seen, next_review')
      .eq('user_id', userId),
    'question_id')
  return Object.fromEntries(data.map(r => [r.question_id, r]))
}

// `selected` is the chosen option index for an MCQ, null for other types.
export async function recordAnswer(userId, questionId, correct, selected = null, sessionId = null, timeTakenMs = null) {
  // One call logs the answer and updates the struggle row (migration
  // 20261025000004_record_answer.sql).
  const { error } = await supabase.rpc('record_answer', {
    p_question_id: questionId,
    p_correct: !!correct,
    p_selected: Number.isInteger(selected) ? selected : null,
    p_session_id: sessionId,
    p_time_ms: Number.isFinite(timeTakenMs) ? Math.round(timeTakenMs) : null,
  })
  if (!error) return
  if (error.code !== 'PGRST202') throw error

  // Before that migration: three requests, and answer_log.selected is NOT NULL.
  // The answer log doesn't depend on the struggle row, so write it alongside
  // the read-then-write below instead of after it.
  const logInsert = supabase.from('answer_log').insert({
    user_id: userId,
    session_id: sessionId,
    question_id: questionId,
    selected: Number.isInteger(selected) ? selected : 0,
    correct,
    time_taken_ms: timeTakenMs,
  })

  const updateStruggle = async () => {
    // maybeSingle: a first attempt has no row yet, which .single() reports as an error.
    const { data: existing } = await supabase
      .from('struggle_profiles')
      .select('attempts, wrong')
      .eq('user_id', userId)
      .eq('question_id', questionId)
      .maybeSingle()

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
  }

  await Promise.all([updateStruggle(), logInsert])
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
// XP and streaks are awarded server-side (award_xp clamps the amount and derives
// the streak) — the profiles row itself is not writable for these columns.
// `correct` is true/false for a graded answer, which also updates the recent
// accuracy ranks need, and null for a bonus. Resolves to the profile fields
// award_xp changed: { xp, streak, best_streak, recent_correct?, recent_answers? }.
export async function addXP(userId, xpEarned, newStreak, currentProfile, correct = null) {
  let { data, error } = await supabase.rpc('award_xp', {
    p_xp_earned: Math.round(xpEarned),
    p_new_streak: newStreak,
    ...(correct == null ? {} : { p_correct: correct }),
  })
  // Before the rank-accuracy migration award_xp has no p_correct; still award the XP.
  if (error?.code === 'PGRST202' && correct != null) {
    ;({ data, error } = await supabase.rpc('award_xp', { p_xp_earned: Math.round(xpEarned), p_new_streak: newStreak }))
  }
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) || {}
  return {
    ...row,
    xp: row.xp ?? Math.max(0, (currentProfile?.xp ?? 0) + xpEarned),
  }
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
/** Every answer since `days` ago (paged, so heavy users don't lose the latest). */
export async function getAnswerLogSince(userId, days) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  return fetchAllRows(() =>
    supabase
      .from('answer_log')
      .select('answered_at, correct, question_id')
      .eq('user_id', userId)
      .gte('answered_at', since),
    'answered_at')
}

export async function getAnswerLogLast30Days(userId) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  // Heavy users can log >1000 answers in 30 days; an unpaginated ascending
  // query would keep the oldest 1000 and silently drop the most recent. Page
  // through the full window (ordered by answered_at, the value callers expect).
  return fetchAllRows(() =>
    supabase
      .from('answer_log')
      .select('answered_at, correct, question_id')
      .eq('user_id', userId)
      .gte('answered_at', since),
    'answered_at')
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

// ─── ACCESS & BILLING ────────────────────────────────────────────────────────
// Students can't write user_subscriptions; access comes from an admin grant,
// their one free subject, or their Stripe plan (one subscription, quantity =
// paid subjects, $7 / $6 / $5+ per week by default), all through these endpoints.

/**
 * { enabled, tiers (weekly), monthlyTiers, interval ('week' | 'month' | null: the plan's billing period),
 *   planTiers, paidCount, total (per period), nextPrice, hasPlan, renewsAt, endsAtPeriodEnd, freeDailyQuestions,
 *   trialDays (free days a first plan starts with; 0 if none), trialing (renewsAt is then when the trial ends) }
 */
export async function getBillingConfig() {
  return tutorFetch('/api/billing/config')
}

// Tutor plans: the tutor portal's monthly or annual fee (api-server lib/tutor-plan.ts).

/**
 * { enabled, plans: [{ name, monthly, annual, students, subjects, recordings, parentReports }], annualDiscount,
 *   active, exempt, plan, interval ('month' | 'year'), status, renewsAt, endsAtPeriodEnd, studentLimit, studentsUsed,
 *   subjectLimit, subjects, features: { recordings, parentReports } }
 */
export async function getTutorBilling() {
  return tutorFetch('/api/tutor-billing/status')
}

/** Subscribe ({ url } for Stripe Checkout) or move to another plan / billing period ({ ok }). */
export async function chooseTutorPlan(plan, interval) {
  return tutorFetch('/api/tutor-billing/plan', { method: 'POST', body: JSON.stringify({ plan, interval }) })
}

/** Drop a subject from the tutor plan's subjects, making room for another. */
export async function removeTutorPlanSubject(name) {
  return tutorFetch(`/api/tutor-billing/subjects/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

/** A student's parent for weekly progress reports ({ email, name }; empty email stops them). Resolves to { parent }. */
export async function setStudentParent(studentId, { email, name }) {
  return tutorFetch(`/api/tutor/students/${encodeURIComponent(studentId)}/parent`, { method: 'PUT', body: JSON.stringify({ email, name }) })
}

/**
 * The signed-in student's parent or guardian (lib/parentConsent.js): any of
 * { accountHolder: 'parent', parentName }, { parentEmail, parentName },
 * { resend: true } or { reports }. Resolves to { parent, sent }, where parent
 * holds the profile's parent columns.
 */
export async function saveParentDetails(body) {
  return tutorFetch('/api/account/parent', { method: 'PUT', body: JSON.stringify(body) })
}

/** Stripe customer portal for the tutor's card, receipts and cancelling; resolves to its URL. */
export async function openTutorBillingPortal() {
  const json = await tutorFetch('/api/tutor-billing/portal', { method: 'POST' })
  return json.url
}

/** Make a subject the student's one free subject (replaces any other). */
export async function chooseFreeSubject(curriculumId) {
  return tutorFetch('/api/billing/free-subject', { method: 'POST', body: JSON.stringify({ curriculumId }) })
}

/**
 * Pay for a subject: resolves to { url } (first subject → Stripe Checkout, billed
 * every `interval`: 'week' | 'month') or { added, total, interval } (onto the existing plan).
 * Adding to a plan on its free trial needs `endTrial`: it ends the trial and bills now.
 */
export async function addPaidSubject(curriculumId, interval = 'week', { endTrial = false } = {}) {
  return tutorFetch('/api/billing/subjects', { method: 'POST', body: JSON.stringify({ curriculumId, interval, endTrial }) })
}

/** Switch the plan to weekly or monthly billing: resolves to { interval, total }. */
export async function switchBillingInterval(interval) {
  return tutorFetch('/api/billing/interval', { method: 'POST', body: JSON.stringify({ interval }) })
}

/** Stop paying for a subject (by its user_subscriptions row id). */
export async function removePaidSubject(rowId) {
  return tutorFetch(`/api/billing/subjects/${encodeURIComponent(rowId)}`, { method: 'DELETE' })
}

/** After returning from Checkout: make sure the new plan is recorded. */
export async function syncCheckout(sessionId) {
  return tutorFetch('/api/billing/sync', { method: 'POST', body: JSON.stringify({ sessionId }) })
}

/** Stripe customer portal (card, receipts, cancel); resolves to its URL. */
export async function openBillingPortal() {
  const json = await tutorFetch('/api/billing/portal', { method: 'POST' })
  return json.url
}

/** Free-subject questions answered today: { used, limit }. */
export async function getFreeQuestionUsage() {
  const { data, error } = await supabase.rpc('free_questions_today')
  if (error) throw error
  return data
}

/** Count one free-subject question: { used, limit, allowed }. */
export async function countFreeQuestion() {
  const { data, error } = await supabase.rpc('use_free_question')
  if (error) throw error
  return data
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
/**
 * One leaderboard per class the user is in (tutors: also classes they teach;
 * admins: every class), each ranked by XP:
 * [{ id, name, subject, color, is_member, board: [{ id, display_name, xp, level, streak, position }] }]
 */
export async function fetchClassLeaderboards() {
  const json = await tutorFetch('/api/leaderboard/classes')
  return json.classes || []
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

/**
 * Hand a batch from generateRemediationVariantsViaAI back to the server, which
 * checks each answer key and saves the questions that pass to the bank and to
 * question_variants. Resolves to { stored: [{ variant_id, question }] } where
 * `question` is the new bank row. Takes tens of seconds, so don't make the
 * student wait on it.
 */
export async function storeRemediationVariants(batch, signature) {
  const res = await fetch('/api/remediation/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch, signature }),
  })
  if (!res.ok) throw new Error(`remediation/store ${res.status}`)
  const data = await res.json()
  return {
    stored: (data?.stored || []).map(s => ({
      ...s,
      question: s.question && {
        ...s.question,
        options: typeof s.question.options === 'string' ? JSON.parse(s.question.options) : s.question.options,
      },
    })),
  }
}

/**
 * Ask the AI to generate `count` new questions for the given subject + topic
 * and persist them directly to the live questions table (autoApprove=true).
 * Returns the newly inserted question rows, normalized for the engine.
 *
 * @param {string} subject   e.g. 'Chemistry Stage 1'
 * @param {string} topicCode e.g. '2.2'
 * @param {number} count
 * @param {number|null} targetDifficulty
 * @param {{ examGrade?: boolean }} [options] examGrade asks for the stronger
 *   exam-grade generator (slower, at most 3 questions). The server honours it
 *   only within the subject's exam-grade top-up allowance and otherwise
 *   generates normally, so it is safe to ask.
 * @returns {Promise<object[]>}
 */
export async function fetchAndPersistMoreQuestions(subject, topicCode, count = 10, targetDifficulty = null, { examGrade = false } = {}) {
  // targetDifficulty: 1–5 numeric or null (→ 'mixed').  The API uses it to
  // bias the AI's difficulty distribution towards the student's current level.
  const difficulty = targetDifficulty != null ? targetDifficulty : 'mixed'
  // Ask the generator to include visuals where the concept warrants them.
  // Graphs/diagrams only ever appear when the question genuinely needs one (the
  // server prompt enforces that), so this is safe across subjects — it just
  // unblocks visual questions that the live top-up previously never requested.
  const res = await fetch('/api/generate-questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject, topicCode, count, difficulty, autoApprove: true,
      includeGraphs: true, includeDiagrams: true,
      ...(examGrade ? { examGrade: true } : {}),
    }),
  })
  if (!res.ok) {
    // Surface the server's detail so the caller can show/log why generation
    // failed instead of silently ending the session.
    let detail = ''
    try {
      const body = await res.json()
      detail = body?.detail || body?.error || ''
    } catch { /* non-JSON error body */ }
    // The daily limit's message is written for the student; show it as is.
    if (res.status === 429 && detail) throw new Error(detail)
    throw new Error(`generate-questions API error ${res.status}${detail ? `: ${detail}` : ''}`)
  }
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
  // Only stored variants (uuid ids) have a usage count; bank questions served
  // as remediation and concept-builders don't.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(variantId || ''))) return

  const { error: rpcError } = await supabase.rpc('bump_variant_usage', { p_variant_id: variantId })
  if (!rpcError) return
  if (rpcError.code !== 'PGRST202') throw rpcError

  // Before migration 20261025000005 there is no RPC; update the row directly.
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

/**
 * Fetch the roster of students for a tutor. Returns joined profile data.
 * With `allTutors` (admins), every tutor's students, one row per student with
 * `tutors: [{ id, display_name }]`.
 */
export async function fetchRoster(tutorId, { allTutors = false } = {}) {
  let query = supabase
    .from('tutor_students')
    .select('tutor_id, student_id, invited_at, profiles!tutor_students_student_id_fkey(display_name, xp, streak, last_active)')
    .order('invited_at', { ascending: false })
  if (!allTutors) query = query.eq('tutor_id', tutorId)
  const { data, error } = await query
  if (error) throw error
  const rows = (data || []).map(r => ({
    ...r,
    profiles: r.profiles ? { ...r.profiles, streak: currentStreak(r.profiles.streak, r.profiles.last_active) } : null,
  }))
  if (!allTutors) return rows

  const tutorIds = [...new Set(rows.map(r => r.tutor_id))]
  const names = {}
  if (tutorIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', tutorIds)
    ;(profs || []).forEach(p => { names[p.id] = p.display_name })
  }
  const byStudent = new Map()
  for (const r of rows) {
    const tutor = { id: r.tutor_id, display_name: names[r.tutor_id] || null }
    const existing = byStudent.get(r.student_id)
    if (existing) existing.tutors.push(tutor)
    else byStudent.set(r.student_id, { ...r, tutors: [tutor] })
  }
  return [...byStudent.values()]
}

/** Invite a student by email (or re-send their pending invite). They join
 *  the roster once they accept. `curriculumIds`: the subjects the invite comes
 *  with, free ([] for none; left out, a re-send keeps the current ones).
 *  `diagnosticSubtopics`: { curriculumId: [subtopicId] } each subject's
 *  diagnostic covers (left out: the whole subject).
 *  `recipient`: { parent: false } for the student, or { parent: true, childName }
 *  to send it to a parent who sets the account up for their child (left out,
 *  a re-send keeps who it's for).
 *  Resolves to { invite, emailSent, emailError }. */
export async function inviteStudent(studentEmail, curriculumIds, diagnosticSubtopics, recipient) {
  const body = { email: studentEmail }
  if (curriculumIds !== undefined) body.curriculumIds = curriculumIds
  if (diagnosticSubtopics !== undefined) body.diagnosticSubtopics = diagnosticSubtopics
  if (recipient !== undefined) {
    body.recipient = recipient.parent ? 'parent' : 'student'
    if (recipient.parent) body.childName = recipient.childName
  }
  return tutorFetch('/api/tutor/invites', { method: 'POST', body: JSON.stringify(body) })
}

/** A subject's topics and subtopics: [{ id, name, subtopics: [{ id, name }] }]. */
export async function fetchSubjectTopics(curriculumId) {
  const json = await tutorFetch(`/api/tutor/subjects/${encodeURIComponent(curriculumId)}/topics`)
  return json.topics || []
}

/** Set a diagnostic on a roster student's included subject. */
export async function requireStudentDiagnostic(studentId, curriculumId) {
  return tutorFetch(`/api/tutor/students/${encodeURIComponent(studentId)}/diagnostics/${encodeURIComponent(curriculumId)}`, { method: 'POST' })
}

/** Let a roster student practise an included subject without its diagnostic. */
export async function waiveStudentDiagnostic(studentId, curriculumId) {
  return tutorFetch(`/api/tutor/students/${encodeURIComponent(studentId)}/diagnostics/${encodeURIComponent(curriculumId)}/waive`, { method: 'POST' })
}

/** The signed-in student's diagnostics on tutor-included subjects:
 *  [{ token, curriculum_id, subject, status: 'pending'|'waived'|'completed', ready, completed_at, summary }]. */
export async function fetchMyDiagnostics() {
  const json = await tutorFetch('/api/diagnostics/mine')
  return json.diagnostics || []
}

/** Write a tutor-included subject's diagnostic questions if they aren't yet.
 *  Resolves to true when they're ready, false while someone else is writing them. */
export async function prepareDiagnostic(token) {
  const res = await fetch(`/api/diagnostic/${encodeURIComponent(token)}/prepare`, { method: 'POST' })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Your diagnostic couldn\'t be prepared. Please try again.')
  return !!json.ready
}

/** Whether the tutor can include subjects for their students, and the subjects
 *  to pick from: { canInclude, subjects: [{ id, name, stage, label }] }. */
export async function fetchIncludableSubjects() {
  return tutorFetch('/api/tutor/included-subjects')
}

const includedSubjectPath = (studentId, curriculumId) =>
  `/api/tutor/students/${encodeURIComponent(studentId)}/included-subjects/${encodeURIComponent(curriculumId)}`

/** Include a subject, free, for a roster student. Resolves to { label, outcome }. */
export async function setIncludedSubject(studentId, curriculumId) {
  return tutorFetch(includedSubjectPath(studentId, curriculumId), { method: 'PUT' })
}

/** Stop including a subject for a roster student. */
export async function removeIncludedSubject(studentId, curriculumId) {
  return tutorFetch(includedSubjectPath(studentId, curriculumId), { method: 'DELETE' })
}

/** The tutor's pending invites: [{ id, email, subjects, created_at, sent_at, expired }]. */
export async function fetchPendingInvites() {
  const json = await tutorFetch('/api/tutor/invites')
  return json.invites || []
}

/** Cancel a pending invite so its link stops working. */
export async function cancelInvite(inviteId) {
  return tutorFetch(`/api/tutor/invites/${encodeURIComponent(inviteId)}`, { method: 'DELETE' })
}

/** Pending tutor invites for the signed-in student: [{ token, tutor_name, subjects, created_at }]. */
export async function fetchMyInvites() {
  const json = await tutorFetch('/api/invites/mine')
  return json.invites || []
}

/** Who an invite link is from; works signed out. Resolves to { tutor_name, email, signup_email, subjects, status }. */
export async function fetchInvite(token) {
  const res = await fetch(`/api/invites/${encodeURIComponent(token)}`)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'This invite link isn\'t valid.')
  return json
}

/** Accept or decline an invite as the signed-in user. Accepting resolves to
 *  { ok, tutor_name, subjects, subjectError }: `subjects` are the ones it unlocked. */
/**
 * Accept or decline a tutor's invite. A parent's invite that could be for more
 * than one of their children fails with err.body.code 'choose_child' (and
 * err.body.children); answer with `child`: { childId } or { newChild: true }.
 * Accepting resolves to { tutor_name, subjects, subjectError, student } where
 * `student` is set when the invite went to another child in the family.
 */
export async function respondToInvite(token, accept, child = null) {
  const json = await tutorFetch(`/api/invites/${encodeURIComponent(token)}/${accept ? 'accept' : 'decline'}`, {
    method: 'POST', ...(accept && child ? { body: JSON.stringify(child) } : {}),
  })
  tutoringAccessCache.clear()
  return json
}

// ── FAMILY ───────────────────────────────────────────────────────────────────
// One parent email for several children (api-server routes/family.ts).

/** { canAddChildren, currentId, parentEmail, children: [{ id, name, year_level, set_up, primary }] }. */
export async function fetchFamily() {
  return tutorFetch('/api/family')
}

/** Add a child to the family; resolves to the new child { id, name }. */
export async function addFamilyChild(name) {
  const json = await tutorFetch('/api/family/children', { method: 'POST', body: JSON.stringify({ name }) })
  return json.child
}

/** Sign in to another child in the family (no password), then reload the app on Home. */
export async function switchToChild(userId, path = '/home') {
  const { token_hash } = await tutorFetch('/api/family/switch', { method: 'POST', body: JSON.stringify({ userId }) })
  const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
  if (error) throw error
  window.location.assign(path)
}

/** Remove an added child and their data (needs the parent's password). */
export async function removeFamilyChild(childId, password) {
  return tutorFetch(`/api/family/children/${encodeURIComponent(childId)}`, { method: 'DELETE', body: JSON.stringify({ password }) })
}

// ── OWN ACCOUNT ──────────────────────────────────────────────────────────────

/** Permanently delete the signed-in account (cancels any plan first). */
export async function deleteMyAccount(password) {
  return tutorFetch('/api/account', { method: 'DELETE', body: JSON.stringify({ password }) })
}

/** Copy the current sign-in email onto the Stripe customer, so receipts follow an email change. */
export async function syncBillingEmail() {
  return tutorFetch('/api/account/sync-email', { method: 'POST' })
}

// ── STUDENT PORTAL & MESSAGES ────────────────────────────────────────────────

/** The signed-in student's tutors with their profiles. */
export async function fetchMyTutors() {
  const json = await tutorFetch('/api/portal/tutors')
  return json.tutors || []
}

/** The classes the signed-in student is in, with tutors and classmates. */
export async function fetchMyClasses() {
  const json = await tutorFetch('/api/portal/classes')
  return json.classes || []
}

/** The signed-in tutor's profile (what students see on "My Tutor"). */
export async function fetchTutorProfile() {
  const json = await tutorFetch('/api/tutor/profile')
  return json.profile
}

export async function saveTutorProfile(fields) {
  const json = await tutorFetch('/api/tutor/profile', { method: 'PUT', body: JSON.stringify(fields) })
  return json.profile
}

/** Everyone the caller can message: [{ other_id, other_name, other_role, last_message, unread }]. */
export async function fetchMessageThreads() {
  const json = await tutorFetch('/api/messages/threads')
  return json.threads || []
}

export async function fetchUnreadMessageCount() {
  const json = await tutorFetch('/api/messages/unread')
  return json.unread || 0
}

/** One conversation: { other: { id, name, role }, messages: [{ id, body, created_at, from_me, read_at }] }. */
export async function fetchMessages(otherId) {
  return tutorFetch(`/api/messages/${encodeURIComponent(otherId)}`)
}

export async function sendMessage(otherId, body) {
  const json = await tutorFetch(`/api/messages/${encodeURIComponent(otherId)}`, { method: 'POST', body: JSON.stringify({ body }) })
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('gf-messages-changed'))
  return json.message
}

export async function markMessagesRead(otherId) {
  await tutorFetch(`/api/messages/${encodeURIComponent(otherId)}/read`, { method: 'POST' })
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('gf-messages-changed'))
}

/** Start or stop recording the lesson in this room (tutor only). Resolves to { status }. */
export async function setRoomRecording(roomName, action) {
  return tutorFetch(`/api/rooms/${encodeURIComponent(roomName)}/recording`, { method: 'POST', body: JSON.stringify({ action }) })
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

/** Fetch all assignments created by a tutor (every tutor's with `allTutors`), with student profile data. */
/**
 * Rostered students' answers over the last `days` days, with each question's
 * subtopic, for the tutor's Today page. Tutors can read their own students'
 * answers (RLS); admins can read everyone's.
 */
export async function fetchRosterActivity(studentIds, days = 14) {
  const ids = [...new Set(studentIds)].filter(Boolean)
  if (!ids.length) return []
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const rows = []
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    rows.push(...await fetchAllRows(() =>
      supabase.from('answer_log').select('user_id, answered_at, correct, question_id').in('user_id', chunk).gte('answered_at', since),
      'answered_at'))
  }
  const qIds = [...new Set(rows.map(r => r.question_id).filter(Boolean))]
  const topics = {}
  for (let i = 0; i < qIds.length; i += 200) {
    const { data } = await supabase.from('questions').select('id, topic, subtopic').in('id', qIds.slice(i, i + 200))
    ;(data || []).forEach(q => { topics[q.id] = q.subtopic || q.topic || null })
  }
  return rows.map(r => ({ ...r, subtopic: topics[r.question_id] || null }))
}

/**
 * Every answer on the platform between two times (admins can read them all):
 * [{ user_id, correct, question_id, answered_at }], each with its question's
 * subject when withSubject is set.
 */
export async function adminAnswersBetween(sinceIso, untilIso = null, { withSubject = false } = {}) {
  const rows = await fetchAllRows(() => {
    let q = supabase.from('answer_log').select('user_id, correct, question_id, answered_at').gte('answered_at', sinceIso)
    if (untilIso) q = q.lt('answered_at', untilIso)
    return q
  }, 'answered_at')
  if (!withSubject) return rows
  const ids = [...new Set(rows.map(r => r.question_id).filter(Boolean))]
  const subjects = {}
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('questions').select('id, subject').in('id', ids.slice(i, i + 200))
    ;(data || []).forEach(q => { subjects[q.id] = q.subject })
  }
  return rows.map(r => ({ ...r, subject: subjects[r.question_id] || null }))
}

export async function fetchAssignmentsForTutor(tutorId, { allTutors = false } = {}) {
  let query = supabase
    .from('assignments')
    .select('*, profiles!assignments_student_id_fkey(display_name)')
    .order('created_at', { ascending: false })
  if (!allTutors) query = query.eq('tutor_id', tutorId)
  const { data, error } = await query
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
  if (!res.ok) throw Object.assign(new Error(json.error || `Request failed (${res.status})`), { status: res.status, body: json })
  return json
}

/** Fetch the classes the tutor owns or co-teaches (every class with `allTutors`), with members and tutors. */
export async function fetchTutorClasses({ allTutors = false } = {}) {
  const json = await tutorFetch(`/api/tutor/classes${allTutors ? '?scope=all' : ''}`)
  return json.classes || []
}

/** Tutors and admins, for choosing a class's co-tutors. */
export async function fetchTutorList() {
  const json = await tutorFetch('/api/tutor/tutors')
  return json.tutors || []
}

/** Add a co-tutor to a class; they get its students on their roster. */
export async function addClassTutor(classId, tutorId) {
  return tutorFetch(`/api/tutor/classes/${encodeURIComponent(classId)}/tutors`, {
    method: 'POST',
    body: JSON.stringify({ tutorId }),
  })
}

export async function removeClassTutor(classId, tutorId) {
  return tutorFetch(`/api/tutor/classes/${encodeURIComponent(classId)}/tutors/${encodeURIComponent(tutorId)}`, {
    method: 'DELETE',
  })
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
export async function createBatchAssignment({ type, subject, topics, due_date, question_count, difficulty, min_accuracy = null, pass_mode = 'until_pass', remediation = true, studentIds = [], classIds = [], allRoster = false, notify = true } = {}) {
  return tutorFetch('/api/tutor/assignments/batch', {
    method: 'POST',
    body: JSON.stringify({ type, subject, topics, due_date, question_count, difficulty, min_accuracy, pass_mode, remediation, studentIds, classIds, allRoster, notify }),
  })
}

/** Recurring assignments the tutor has set (every tutor's with `allTutors`), each with `next_on`. */
export async function fetchAssignmentSchedules({ allTutors = false } = {}) {
  const json = await tutorFetch(`/api/tutor/assignment-schedules${allTutors ? '?scope=all' : ''}`)
  return json.schedules || []
}

/** Create a recurring assignment: the same work set again on `days_of_week` (0 = Sunday),
 *  every week or every other week, each due `due_days` after it's set. Returns { schedule, issued }. */
export async function createAssignmentSchedule({ type, subject, topics, question_count, difficulty, min_accuracy = null, pass_mode = 'until_pass', remediation = true, studentIds = [], classIds = [], allRoster = false, days_of_week, every_weeks = 1, due_days = 0, start_date, end_date = null, notify = true } = {}) {
  return tutorFetch('/api/tutor/assignment-schedules', {
    method: 'POST',
    body: JSON.stringify({ type, subject, topics, question_count, difficulty, min_accuracy, pass_mode, remediation, studentIds, classIds, allRoster, days_of_week, every_weeks, due_days, start_date, end_date, notify }),
  })
}

/** Pause or resume a recurring assignment. */
export async function setAssignmentSchedulePaused(scheduleId, paused) {
  const json = await tutorFetch(`/api/tutor/assignment-schedules/${encodeURIComponent(scheduleId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ paused }),
  })
  return json.schedule
}

/** Stop a recurring assignment. Work it has already set stays. */
export async function deleteAssignmentSchedule(scheduleId) {
  await tutorFetch(`/api/tutor/assignment-schedules/${encodeURIComponent(scheduleId)}`, { method: 'DELETE' })
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

/** Record one answer toward an assignment's question_count (and pass mark, if
 *  set). The RPC completes the assignment once both are met. Returns
 *  { progress_count, question_count, min_accuracy, recent_results,
 *  completed_at }, or null if the assignment is already done.
 */
export async function recordAssignmentAnswer(assignmentId, correct, { questionId = null, response = null, timeMs = null } = {}) {
  const { data, error } = await supabase.rpc('record_assignment_answer', {
    p_assignment_id: assignmentId,
    p_correct: !!correct,
    p_question_id: questionId,
    p_response: response ?? null,
    p_time_ms: Number.isFinite(timeMs) ? Math.round(timeMs) : null,
  })
  if (error) throw error
  return Array.isArray(data) ? data[0] || null : data
}

/** The student's most recently finished assignments, each with the
 *  wrong_question_ids they got wrong in it (for redoing just those). */
export async function fetchCompletedAssignmentsForStudent() {
  const json = await tutorFetch('/api/assignments/completed')
  return json.assignments || []
}

/** Tell the API a student's assignment just finished, so it can email the tutor. */
export async function notifyAssignmentFinished(assignmentId) {
  return tutorFetch(`/api/assignments/${encodeURIComponent(assignmentId)}/finished`, { method: 'POST' })
}

/** The tutor's report on one assignment: score, every answer and topic breakdown. */
export async function fetchAssignmentReport(assignmentId) {
  return tutorFetch(`/api/tutor/assignments/${encodeURIComponent(assignmentId)}/report`)
}

/** Generate (or return the cached) AI write-up for an assignment report. */
export async function generateAssignmentReportSummary(assignmentId, { refresh = false } = {}) {
  const json = await tutorFetch(`/api/tutor/assignments/${encodeURIComponent(assignmentId)}/report/summary`, {
    method: 'POST',
    body: JSON.stringify({ refresh }),
  })
  return json.summary
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
export async function fetchRosterDetails({ allTutors = false } = {}) {
  const json = await tutorFetch(`/api/tutor/roster-details${allTutors ? '?scope=all' : ''}`)
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
export async function fetchStudentProgressForTutor(tutorId, studentId, { allTutors = false } = {}) {
  // Verify this student is on the tutor's roster (admins viewing every
  // tutor's students can open anyone).
  if (!allTutors) {
    const { data: rosterRow, error: rosterError } = await supabase
      .from('tutor_students')
      .select('student_id')
      .eq('tutor_id', tutorId)
      .eq('student_id', studentId)
      .single()
    if (rosterError || !rosterRow) throw new Error('Student not on your roster.')
  }

  // Fetch profile stats (xp, streak)
  const { data: prof, error: profError } = await supabase
    .from('profiles')
    .select('xp, streak, best_streak, last_active')
    .eq('id', studentId)
    .single()
  if (profError) throw profError

  // Fetch struggle profile for accuracy/topic breakdown
  const { data: struggles, error: sError } = await supabase
    .from('struggle_profiles')
    .select('question_id, attempts, wrong')
    .eq('user_id', studentId)
  if (sError) throw sError

  // Fetch questions to map question_id → topic. This scans the whole table,
  // which far exceeds the 1000-row cap — page through so every struggle row
  // resolves to a topic (an unpaginated read undercounts the breakdown).
  const questions = await fetchAllRows(() =>
    supabase.from('questions').select('id, topic, subject'), 'id')

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

  // Fetch assignments for this student (from this tutor, or from anyone with allTutors)
  let assignmentsQuery = supabase
    .from('assignments')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (!allTutors) assignmentsQuery = assignmentsQuery.eq('tutor_id', tutorId)
  const { data: assignments, error: aError } = await assignmentsQuery
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
    streak:          currentStreak(prof?.streak, prof?.last_active),
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
export async function fetchTutoringSessions({ status, limit = 20, offset = 0, from, to, order } = {}) {
  const session = await getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated.')
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (status) params.set('status', status)
  if (from) params.set('from', new Date(from).toISOString())
  if (to) params.set('to', new Date(to).toISOString())
  if (order) params.set('order', order)
  const res = await fetch(`/api/sessions?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Failed to fetch sessions.')
  return json.sessions
}

const tutoringAccessCache = new Map()

/**
 * Whether a student has a tutor or has been invited to a lesson — decides
 * whether the Lessons section shows in their sidebar. Cached per user.
 */
export function hasTutoringAccess(userId) {
  if (!userId) return Promise.resolve(false)
  if (!tutoringAccessCache.has(userId)) {
    const check = Promise.all([
      supabase.from('tutor_students').select('tutor_id', { count: 'exact', head: true }).eq('student_id', userId),
      supabase.from('session_participants').select('session_id', { count: 'exact', head: true }).eq('student_id', userId),
    ])
      .then(([roster, lessons]) => (roster.count ?? 0) > 0 || (lessons.count ?? 0) > 0)
      .catch(() => false)
    tutoringAccessCache.set(userId, check)
  }
  return tutoringAccessCache.get(userId)
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
