// ─── ADAPTIVE ENGINE ─────────────────────────────────────────────────────────
// Pure functions — no Supabase calls here, just logic

/**
 * Compute a priority weight for each question given the user's struggle profile
 * and an optional target difficulty derived from recent session performance.
 *
 * Formula (base):
 *   errorRate   = wrong / attempts         (0–1, how often they fail it)
 *   recency     = exp decay over 48h       (1 = just seen, 0 = long ago)
 *   base weight = errorRate*0.65 + recency*0.25 + difficultyBonus*0.10
 *
 * Adaptive difficulty bonus (when targetDifficulty is supplied):
 *   proximity   = 1 – |q.difficulty – target| / 4   (0–1)
 *   adds 0.30 * proximity — strong enough to steer selection without
 *   overriding high-struggle prioritisation.
 *
 * Unseen questions get a base weight of 0.3 so they do appear, but
 * struggled questions always outrank them.
 */
export function computeWeights(questions, struggleMap, targetDifficulty = null) {
  const now = Date.now()
  const DECAY_MS = 1000 * 60 * 60 * 48 // 48 hours

  return questions.map(q => {
    const s = struggleMap[q.id]

    let weight
    if (!s || s.attempts === 0) {
      // Small jitter (0–0.05) shuffles unseen questions each session. Kept
      // deliberately small so it can't swamp the adaptive-difficulty signal
      // below — a larger jitter let easy questions keep winning even when the
      // target had moved up, which pinned the session at low difficulty.
      weight = 0.3 + (q.difficulty / 5) * 0.1 + Math.random() * 0.05
    } else {
      const errorRate = s.wrong / s.attempts
      const msSince = now - new Date(s.last_seen).getTime()
      const recency = Math.exp(-msSince / DECAY_MS)
      const diffBonus = ((q.difficulty - 1) / 4) * 0.1
      weight = errorRate * 0.65 + recency * 0.25 + diffBonus
    }

    // Adaptive difficulty: bias strongly towards questions near the target
    // difficulty level. The proximity falls off over a ±2 band (not ±4) and
    // carries a large bonus, so an on-target question clearly outranks an
    // off-target unseen one while still sitting just below a genuinely
    // struggled question (errorRate-driven weight ~0.9+).
    if (targetDifficulty !== null) {
      const qDiff = q.difficulty || 3
      const proximity = Math.max(0, 1 - Math.abs(qDiff - targetDifficulty) / 2) // 0–1
      weight += proximity * 0.45
    }

    return { id: q.id, weight }
  })
}

// Keys are cached per question object: the engine asks for every question's
// key on each pick and each count, which was the bulk of their cost.
const contentKeyCache = new WeakMap()

/**
 * Identity of a question's content, so the same question stored under two ids
 * (word-for-word duplicates in the bank, or an AI variant saved both as a
 * variant and as a bank row) counts as one. Whitespace, case and `$` are
 * ignored; the options are included because generic stems ("Which statement
 * is true?") recur across different questions, as is the passage for reading
 * questions ("What is the main idea of the passage?").
 */
export function questionContentKey(q) {
  if (!q?.question) return null
  const cached = contentKeyCache.get(q)
  if (cached?.question === q.question && cached.options === q.options && cached.passage_id === q.passage_id) return cached.key
  const norm = (s) => String(s ?? '').toLowerCase().replace(/\$/g, '').replace(/\s+/g, '')
  let options = q.options
  if (typeof options === 'string') {
    try { options = JSON.parse(options) } catch { options = [options] }
  }
  const opts = Array.isArray(options) ? options.map(norm).join('|') : ''
  const key = `${q.passage_id || ''}::${norm(q.question)}::${opts}`
  contentKeyCache.set(q, { key, question: q.question, options: q.options, passage_id: q.passage_id })
  return key
}

/**
 * Returns a predicate telling whether the student has already attempted a
 * question — by id, or by content when the same question exists under
 * another id. A student should never be served a seen question unless they
 * asked to review (the 'wrong' and 'all' modes).
 */
export function seenQuestionChecker(questions, struggleMap) {
  const attempted = (id) => (struggleMap?.[id]?.attempts ?? 0) > 0
  const seenKeys = new Set()
  for (const q of questions || []) {
    if (!attempted(q.id)) continue
    const key = questionContentKey(q)
    if (key) seenKeys.add(key)
  }
  return (q) => {
    if (!q) return false
    if (attempted(q.id)) return true
    const key = questionContentKey(q)
    return !!key && seenKeys.has(key)
  }
}

/**
 * Fixed difficulty bands a tutor can set on an assignment. `min`/`max` bound
 * the stars served (falling back to the whole pool when the bank has none in
 * the band) and `target` steers weighting and AI top-up generation.
 * 'adaptive' has no band: the engine follows the student's level.
 */
export const ASSIGNMENT_DIFFICULTIES = {
  easy:   { label: 'Easy',   min: 1, max: 2, target: 2 },
  medium: { label: 'Medium', min: 3, max: 3, target: 3 },
  hard:   { label: 'Hard',   min: 4, max: 5, target: 4 },
}

/**
 * Where an assignment with a tutor-set count stands. With a pass mark
 * (min_accuracy) and pass_mode 'until_pass', it completes only once the most
 * recent question_count answers reach it; with 'one_attempt' it ends at the
 * count either way and `passed` says whether the mark was reached. Mirrors
 * record_assignment_answer() in the database.
 */
export function assignmentStanding(a) {
  if (!a?.question_count) return null
  const goal = a.question_count
  const progress = Math.min(a.progress_count || 0, goal)
  const recent = Array.isArray(a.recent_results) ? a.recent_results : []
  const recentCorrect = recent.filter(Boolean).length
  const accuracy = recent.length > 0 ? Math.round((recentCorrect / recent.length) * 100) : null
  const meetsMark = !a.min_accuracy || (recent.length > 0 && recentCorrect * 100 >= a.min_accuracy * recent.length)
  const oneAttempt = !!a.min_accuracy && a.pass_mode === 'one_attempt'
  const complete = progress >= goal && (meetsMark || oneAttempt)
  return {
    goal, progress, minAccuracy: a.min_accuracy || null, oneAttempt, accuracy, meetsMark, complete,
    passed: complete && a.min_accuracy ? meetsMark : null,
  }
}

/** The assignment after one more answer — the same update the database makes. */
export function applyAssignmentAnswer(a, correct) {
  const goal = a.question_count
  const recent = [...(a.recent_results || []), !!correct].slice(-goal)
  return { ...a, progress_count: Math.min((a.progress_count || 0) + 1, goal), recent_results: recent }
}

/** "4/10 questions · Hard · Pass 80% · No remediation" for an assignment with a tutor-set count, else null. */
export function assignmentGoalLabel(a) {
  const st = assignmentStanding(a)
  if (!st) return null
  const parts = [`${st.progress}/${st.goal} questions`, ASSIGNMENT_DIFFICULTIES[a.difficulty]?.label || 'Adaptive']
  if (st.minAccuracy) parts.push(`Pass ${st.minAccuracy}%${st.oneAttempt ? ' (one attempt)' : ''}`)
  if (a.remediation === false) parts.push('No remediation')
  return parts.join(' · ')
}

/**
 * The difficulty a new-questions session aims for before the student has
 * answered anything. Without one, the small bonus unseen questions get for
 * difficulty decided the first pick, so every session opened on a 5★ question.
 */
export const STARTING_DIFFICULTY = 2

/**
 * Pick the next question using weighted random selection.
 *
 * mode:
 *   'new'    — only unseen questions (attempts === 0). Returns null if all done.
 *   'wrong'  — only questions answered wrong at least once
 *   'all'    — all questions including already-seen
 *
 * targetDifficulty (1–5 or null): when provided, biases selection towards
 *   questions at that difficulty level for adaptive pacing. In 'new' mode a
 *   null target means STARTING_DIFFICULTY.
 *
 * difficultyRange ({ min, max } or null): restricts the pool to questions in
 *   that star range when any are left; otherwise the whole pool is used.
 *
 * Within the eligible pool, adaptive weighting still applies.
 */
export function selectNextQuestion(questions, struggleMap, sessionAnsweredIds, mode = 'new', subtopics = [], targetDifficulty = null, difficultyRange = null) {
  const questionPool = subtopics.length > 0
    ? questions.filter(q => subtopics.includes(q.subtopic))
    : questions

  let pool
  if (mode === 'new') {
    const isSeen = seenQuestionChecker(questions, struggleMap)
    const answeredKeys = new Set(
      questions.filter(q => sessionAnsweredIds.includes(q.id)).map(questionContentKey).filter(Boolean),
    )
    pool = questionPool.filter(q =>
      !isSeen(q) && !sessionAnsweredIds.includes(q.id) && !answeredKeys.has(questionContentKey(q)),
    )
  } else if (mode === 'wrong') {
    pool = questionPool.filter(q => {
      const s = struggleMap[q.id]
      return s && s.wrong > 0 && !sessionAnsweredIds.includes(q.id)
    })
  } else {
    pool = questionPool.filter(q => !sessionAnsweredIds.includes(q.id))
  }

  if (!pool.length) return null

  if (targetDifficulty == null && mode === 'new') targetDifficulty = STARTING_DIFFICULTY

  // Finish the reading passage the student is part-way through before moving on.
  const sibling = nextPassageSibling(questions, pool, sessionAnsweredIds)
  if (sibling) return sibling

  if (difficultyRange) {
    const inRange = pool.filter(q => {
      const d = q.difficulty || 3
      return d >= difficultyRange.min && d <= difficultyRange.max
    })
    if (inRange.length) pool = inRange
  }

  const weights = computeWeights(pool, struggleMap, targetDifficulty)
  weights.sort((a, b) => b.weight - a.weight)

  const top = weights.slice(0, Math.min(5, weights.length))
  const total = top.reduce((s, w) => s + w.weight, 0)
  let rand = Math.random() * total

  for (const w of top) {
    rand -= w.weight
    if (rand <= 0) return questions.find(q => q.id === w.id)
  }

  return questions.find(q => q.id === top[0].id)
}

/**
 * If the most recently answered question belongs to a reading passage, return
 * the next unanswered question (in pool) from the same passage, else null.
 */
export function nextPassageSibling(questions, pool, sessionAnsweredIds) {
  const lastId = sessionAnsweredIds[sessionAnsweredIds.length - 1]
  if (!lastId) return null
  const last = questions.find(q => q.id === lastId)
  if (!last?.passage_id) return null
  return pool.find(q => q.passage_id === last.passage_id) || null
}

/**
 * Count unseen, wrong, and total questions for session start UI.
 */
export function getQuestionCounts(questions, struggleMap, subtopics = []) {
  const pool = subtopics.length > 0
    ? questions.filter(q => subtopics.includes(q.subtopic))
    : questions

  const isSeen = seenQuestionChecker(questions, struggleMap)
  // Duplicates of one unseen question only count once.
  const unseenKeys = new Set(pool.filter(q => !isSeen(q)).map(q => questionContentKey(q) || q.id))
  const unseen = unseenKeys.size
  const wrong = pool.filter(q => struggleMap[q.id]?.wrong > 0).length

  return { unseen, wrong, total: pool.length }
}

/**
 * Compute next review time using an accuracy-weighted spaced repetition schedule.
 *
 * Intervals grow based on cumulative correct count, with a bonus tier when
 * overall accuracy is ≥ 75% (the student is consistently getting it right):
 *
 *   correct=0 or error rate ≥ 50%  → 1h   (needs immediate re-exposure)
 *   correct=1                        → 1d  (low acc) / 2d  (high acc)
 *   correct=2                        → 4d  (low acc) / 7d  (high acc)
 *   correct=3–4                      → 14d (low acc) / 21d (high acc)
 *   correct≥5                        → 30d (low acc) / 60d (high acc)
 */
export function nextReviewTime(attempts, wrong) {
  const correct = attempts - wrong
  const accuracy = attempts > 0 ? correct / attempts : 0
  const hi = accuracy >= 0.75
  const h = 1000 * 60 * 60

  if (correct === 0 || wrong >= attempts * 0.5) return new Date(Date.now() + h)
  if (correct === 1)  return new Date(Date.now() + h * (hi ? 48  : 24))
  if (correct === 2)  return new Date(Date.now() + h * (hi ? 168 : 96))
  if (correct <= 4)   return new Date(Date.now() + h * (hi ? 504 : 336))
  return                     new Date(Date.now() + h * (hi ? 1440 : 720))
}

// ─── XP SYSTEM ───────────────────────────────────────────────────────────────
// A rank needs its XP AND, from Silver up, a minimum recent accuracy, so XP
// earned at a low hit rate can't carry anyone to the top. Recent accuracy is
// read from the profile's decayed answer counts (see rankAccuracy), which the
// award_xp RPC keeps up to date.
export const RANK_TIERS = [
  { name: 'Rookie',      xp: 0,      accuracy: 0 },
  { name: 'Bronze II',   xp: 200,    accuracy: 0 },
  { name: 'Bronze I',    xp: 500,    accuracy: 0 },
  { name: 'Silver II',   xp: 1200,   accuracy: 0.5 },
  { name: 'Silver I',    xp: 2200,   accuracy: 0.55 },
  { name: 'Gold',        xp: 4000,   accuracy: 0.6 },
  { name: 'Platinum',    xp: 7000,   accuracy: 0.65 },
  { name: 'Diamond',     xp: 12000,  accuracy: 0.7 },
  { name: 'Master',      xp: 20000,  accuracy: 0.75 },
  { name: 'Grandmaster', xp: 30000,  accuracy: 0.8 },
  { name: 'Legend',      xp: 50000,  accuracy: 0.85 },
]
export const RANKS = RANK_TIERS.map(r => r.name)
export const XP_LEVELS = RANK_TIERS.map(r => r.xp)
// Rank icons are drawn by components/RankIcon.jsx.

/** Recent accuracy (0–1) from a profile's decayed answer counts; 0 with no answers. */
export function rankAccuracy(profile) {
  const answers = Number(profile?.recent_answers) || 0
  if (answers <= 0) return 0
  return Math.min(1, Math.max(0, (Number(profile.recent_correct) || 0) / answers))
}

/** The highest rank whose XP and accuracy requirements are both met. */
export function getLevel(xp, accuracy = 0) {
  let level = 0
  RANK_TIERS.forEach((tier, i) => {
    if ((xp || 0) >= tier.xp && accuracy >= tier.accuracy) level = i
  })
  return level
}

/**
 * Progress toward the next rank. `next` is that rank's XP; `pct` is XP
 * progress (capped at 100). When the XP is there but accuracy isn't,
 * `needsAccuracy` is the accuracy the next rank needs. At the top rank
 * `maxed` is true and the bar is full.
 */
export function getLevelProgress(xp, accuracy = 0) {
  const level = getLevel(xp, accuracy)
  const current = XP_LEVELS[level]
  const nextTier = RANK_TIERS[level + 1]
  if (!nextTier) return { level, current, next: current, pct: 100, maxed: true, needsAccuracy: null }
  const pct = Math.min(100, Math.max(0, (((xp || 0) - current) / (nextTier.xp - current)) * 100))
  return {
    level,
    current,
    next: nextTier.xp,
    pct,
    maxed: false,
    needsAccuracy: (xp || 0) >= nextTier.xp && accuracy < nextTier.accuracy ? nextTier.accuracy : null,
  }
}

/** One line describing what the next rank needs, for under an XP bar. */
export function nextRankHint(xp, accuracy = 0) {
  const { level, next, maxed, needsAccuracy } = getLevelProgress(xp, accuracy)
  if (maxed) return 'Top rank reached'
  const nextRank = RANKS[level + 1]
  if (needsAccuracy != null) return `Reach ${Math.round(needsAccuracy * 100)}% recent accuracy for ${nextRank}`
  const tier = RANK_TIERS[level + 1]
  const xpLeft = `${Math.max(0, next - (xp || 0)).toLocaleString('en-AU')} XP to ${nextRank}`
  return accuracy < tier.accuracy ? `${xpLeft}, plus ${Math.round(tier.accuracy * 100)}% recent accuracy` : xpLeft
}

// A wrong answer costs as much as a right one earns before the streak bonus,
// so XP only builds up when more answers are right than wrong.
export function calcXP(correct, difficulty, streak) {
  if (!correct) return -(difficulty * 12)
  const base = difficulty * 12
  const multi = Math.min(1 + streak * 0.1, 2)
  return Math.round(base * multi)
}

// ─── REMEDIATION HELPERS ─────────────────────────────────────────────────────
export function getQuestionConceptTag(q) {
  return (
    q?.concept_tag ||
    `${q?.subject || 'Chemistry'}|${q?.topic || ''}|${q?.subtopic || ''}`.toLowerCase()
  )
}

export function buildRemediationQueue({
  directVariants = [],
  conceptVariants = [],
  generatedVariants = [],
  excludeIds = [],
  limit = 6,
}) {
  const seen = new Set(excludeIds)
  const combined = []

  for (const v of directVariants) {
    const id = v.variant_record_id || v.id
    if (!seen.has(id)) {
      combined.push(v)
      seen.add(id)
    }
  }

  for (const v of conceptVariants) {
    const id = v.variant_record_id || v.id
    if (!seen.has(id)) {
      combined.push(v)
      seen.add(id)
    }
  }

  for (const v of generatedVariants) {
    const id = v.variant_record_id || v.id
    if (!seen.has(id)) {
      combined.push(v)
      seen.add(id)
    }
  }

  const sorted = combined.sort((a, b) => {
    const aUsage = a.usage_count ?? 0
    const bUsage = b.usage_count ?? 0
    if (aUsage !== bUsage) return aUsage - bUsage
    return Math.random() - 0.5
  })

  return sorted.slice(0, limit)
}

// Remediation earns back a little of a wrong answer's cost, never more than it.
export function calcRemediationXP(correct) {
  return correct ? 2 : 0
}

export function getRemediationCompletionBonus() {
  return 5
}