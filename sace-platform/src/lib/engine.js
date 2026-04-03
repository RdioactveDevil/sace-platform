// ─── ADAPTIVE ENGINE ─────────────────────────────────────────────────────────
// Pure functions — no Supabase calls here, just logic

/**
 * Compute a priority weight for each question given the user's struggle profile.
 * Higher weight = show sooner.
 *
 * Formula:
 *   errorRate   = wrong / attempts         (0–1, how often they fail it)
 *   recency     = exp decay over 48h       (1 = just seen, 0 = long ago)
 *   weight      = errorRate*0.65 + recency*0.25 + difficultyBonus*0.10
 *
 * Unseen questions get a base weight of 0.3 so they do appear, but
 * struggled questions always outrank them.
 */
export function computeWeights(questions, struggleMap) {
  const now = Date.now()
  const DECAY_MS = 1000 * 60 * 60 * 48 // 48 hours

  return questions.map(q => {
    const s = struggleMap[q.id]

    if (!s || s.attempts === 0) {
      return { id: q.id, weight: 0.3 + (q.difficulty / 5) * 0.1 }
    }

    const errorRate  = s.wrong / s.attempts
    const msSince    = now - new Date(s.last_seen).getTime()
    const recency    = Math.exp(-msSince / DECAY_MS)
    const diffBonus  = (q.difficulty - 1) / 4 * 0.1

    return {
      id: q.id,
      weight: errorRate * 0.65 + recency * 0.25 + diffBonus,
    }
  })
}

/**
 * Pick the next question using weighted random selection.
 * Top 5 by weight are eligible — adds variety while keeping focus.
 */
export function selectNextQuestion(questions, struggleMap, sessionAnsweredIds) {
  const eligible = questions.filter(q => !sessionAnsweredIds.includes(q.id))
  if (!eligible.length) return questions[Math.floor(Math.random() * questions.length)]

  const weights = computeWeights(eligible, struggleMap)
  weights.sort((a, b) => b.weight - a.weight)

  // Top 5, weighted random pick
  const top     = weights.slice(0, Math.min(5, weights.length))
  const total   = top.reduce((s, w) => s + w.weight, 0)
  let   rand    = Math.random() * total

  for (const w of top) {
    rand -= w.weight
    if (rand <= 0) return questions.find(q => q.id === w.id)
  }

  return questions.find(q => q.id === top[0].id)
}

/**
 * Compute next review time using a simple spaced repetition schedule.
 * Wrong: review again in 1h
 * 1st correct: review in 24h
 * 2nd correct: review in 72h
 * 3rd+ correct: review in 7 days
 */
export function nextReviewTime(attempts, wrong) {
  const correct = attempts - wrong
  if (wrong >= attempts * 0.5) return new Date(Date.now() + 1000 * 60 * 60)      // 1h
  if (correct <= 1)            return new Date(Date.now() + 1000 * 60 * 60 * 24)  // 1 day
  if (correct <= 2)            return new Date(Date.now() + 1000 * 60 * 60 * 72)  // 3 days
  return                              new Date(Date.now() + 1000 * 60 * 60 * 168) // 7 days
}

// ─── XP SYSTEM ───────────────────────────────────────────────────────────────
export const XP_LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000, 5000]
export const RANKS     = ['Rookie', 'Bronze II', 'Bronze I', 'Silver II', 'Silver I', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster', 'SACE Legend']
export const RANK_ICONS = ['🌱', '⚔️', '⚔️', '🛡️', '🛡️', '💛', '💎', '💠', '👑', '🔱', '🏆']

export function getLevel(xp) {
  return XP_LEVELS.findIndex((v, i) => xp >= v && xp < (XP_LEVELS[i + 1] ?? Infinity))
}

export function getLevelProgress(xp) {
  const level   = getLevel(xp)
  const current = XP_LEVELS[level] ?? 0
  const next    = XP_LEVELS[level + 1] ?? current + 500
  return { level, current, next, pct: ((xp - current) / (next - current)) * 100 }
}

export function calcXP(correct, difficulty, streak) {
  if (!correct) return 3
  const base  = difficulty * 12
  const multi = Math.min(1 + streak * 0.12, 2.2)
  return Math.round(base * multi)
}
