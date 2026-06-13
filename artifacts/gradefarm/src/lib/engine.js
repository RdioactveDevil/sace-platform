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

/**
 * Pick the next question using weighted random selection.
 *
 * mode:
 *   'new'    — only unseen questions (attempts === 0). Returns null if all done.
 *   'wrong'  — only questions answered wrong at least once
 *   'all'    — all questions including already-seen
 *
 * targetDifficulty (1–5 or null): when provided, biases selection towards
 *   questions at that difficulty level for adaptive pacing.
 *
 * Within the eligible pool, adaptive weighting still applies.
 */
export function selectNextQuestion(questions, struggleMap, sessionAnsweredIds, mode = 'new', subtopics = [], targetDifficulty = null) {
  const questionPool = subtopics.length > 0
    ? questions.filter(q => subtopics.includes(q.subtopic))
    : questions

  let pool
  if (mode === 'new') {
    pool = questionPool.filter(q => {
      const s = struggleMap[q.id]
      return (!s || s.attempts === 0) && !sessionAnsweredIds.includes(q.id)
    })
  } else if (mode === 'wrong') {
    pool = questionPool.filter(q => {
      const s = struggleMap[q.id]
      return s && s.wrong > 0 && !sessionAnsweredIds.includes(q.id)
    })
  } else {
    pool = questionPool.filter(q => !sessionAnsweredIds.includes(q.id))
  }

  if (!pool.length) return null

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
 * Count unseen, wrong, and total questions for session start UI.
 */
export function getQuestionCounts(questions, struggleMap, subtopics = []) {
  const pool = subtopics.length > 0
    ? questions.filter(q => subtopics.includes(q.subtopic))
    : questions

  const unseen = pool.filter(q => !struggleMap[q.id] || struggleMap[q.id].attempts === 0).length
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
export const XP_LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000, 5000]
export const RANKS = ['Rookie', 'Bronze II', 'Bronze I', 'Silver II', 'Silver I', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster', 'SACE Legend']
export const RANK_ICONS = ['🌱', '⚔️', '⚔️', '🛡️', '🛡️', '💛', '💎', '💠', '👑', '🔱', '🏆']

export function getLevel(xp) {
  return XP_LEVELS.findIndex((v, i) => xp >= v && xp < (XP_LEVELS[i + 1] ?? Infinity))
}

export function getLevelProgress(xp) {
  const level = getLevel(xp)
  const current = XP_LEVELS[level] ?? 0
  const next = XP_LEVELS[level + 1] ?? current + 500
  return {
    level,
    current,
    next,
    pct: ((xp - current) / (next - current)) * 100,
  }
}

export function calcXP(correct, difficulty, streak) {
  if (!correct) return -(difficulty * 4)   // lose XP on wrong — harder questions cost more
  const base = difficulty * 12
  const multi = Math.min(1 + streak * 0.12, 2.2)
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

export function calcRemediationXP(correct) {
  return correct ? 5 : 0
}

export function getRemediationCompletionBonus() {
  return 20
}