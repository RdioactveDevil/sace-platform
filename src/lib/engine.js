// ================= XP SYSTEM =================
export const XP_LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000, 5000]

export const RANKS = [
  'Rookie','Bronze II','Bronze I','Silver II','Silver I',
  'Gold','Platinum','Diamond','Master','Grandmaster','SACE Legend'
]

export const RANK_ICONS = [
  '🌱','⚔️','⚔️','🛡️','🛡️','💛','💎','💠','👑','🔱','🏆'
]

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
  if (!correct) return 3
  return Math.round(difficulty * 10)
}

export function selectNextQuestion(questions, struggleMap, sessionAnsweredIds) {
  const pool = questions.filter(q => !sessionAnsweredIds.includes(q.id))
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

export function getQuestionCounts(questions) {
  return {
    unseen: questions.length,
    wrong: 0,
    total: questions.length,
  }
}

export function nextReviewTime() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000)
}

export function getQuestionConceptTag(q) {
  return q?.concept_tag || `${q?.subject}|${q?.topic}|${q?.subtopic}`.toLowerCase()
}

export function buildRemediationQueue({ directVariants = [], conceptVariants = [] }) {
  return [...directVariants, ...conceptVariants]
}

export function calcRemediationXP(correct) {
  return correct ? 5 : 0
}

export function getRemediationCompletionBonus() {
  return 20
}