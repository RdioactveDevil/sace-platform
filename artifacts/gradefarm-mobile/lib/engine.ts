export interface Question {
  id: string;
  subject: string;
  topic: string;
  subtopic: string;
  question: string;
  options: string[];
  answer_index: number;
  solution?: string;
  tip?: string;
  difficulty: number;
  concept_tag?: string;
}

export interface StruggleEntry {
  attempts: number;
  wrong: number;
  last_seen: string;
  next_review: string;
}

export type StruggleMap = Record<string, StruggleEntry>;

interface WeightEntry {
  id: string;
  weight: number;
}

export function computeWeights(
  questions: Question[],
  struggleMap: StruggleMap
): WeightEntry[] {
  const now = Date.now();
  const DECAY_MS = 1000 * 60 * 60 * 48;

  return questions.map((q) => {
    const s = struggleMap[q.id];
    if (!s || s.attempts === 0) {
      return { id: q.id, weight: 0.3 + (q.difficulty / 5) * 0.1 + Math.random() * 0.15 };
    }
    const errorRate = s.wrong / s.attempts;
    const msSince = now - new Date(s.last_seen).getTime();
    const recency = Math.exp(-msSince / DECAY_MS);
    const diffBonus = ((q.difficulty - 1) / 4) * 0.1;
    return { id: q.id, weight: errorRate * 0.65 + recency * 0.25 + diffBonus };
  });
}

export function selectNextQuestion(
  questions: Question[],
  struggleMap: StruggleMap,
  sessionAnsweredIds: string[],
  mode: "new" | "wrong" | "all" = "all"
): Question | null {
  let pool: Question[];
  if (mode === "new") {
    pool = questions.filter(
      (q) => (!struggleMap[q.id] || struggleMap[q.id].attempts === 0) && !sessionAnsweredIds.includes(q.id)
    );
  } else if (mode === "wrong") {
    pool = questions.filter(
      (q) => struggleMap[q.id]?.wrong > 0 && !sessionAnsweredIds.includes(q.id)
    );
  } else {
    pool = questions.filter((q) => !sessionAnsweredIds.includes(q.id));
  }

  if (!pool.length) return null;

  const weights = computeWeights(pool, struggleMap);
  weights.sort((a, b) => b.weight - a.weight);

  const top = weights.slice(0, Math.min(5, weights.length));
  const total = top.reduce((s, w) => s + w.weight, 0);
  let rand = Math.random() * total;

  for (const w of top) {
    rand -= w.weight;
    if (rand <= 0) return questions.find((q) => q.id === w.id) ?? null;
  }
  return questions.find((q) => q.id === top[0].id) ?? null;
}

export function getQuestionCounts(
  questions: Question[],
  struggleMap: StruggleMap
) {
  const unseen = questions.filter(
    (q) => !struggleMap[q.id] || struggleMap[q.id].attempts === 0
  ).length;
  const wrong = questions.filter((q) => (struggleMap[q.id]?.wrong ?? 0) > 0).length;
  return { unseen, wrong, total: questions.length };
}

export function nextReviewTime(attempts: number, wrong: number): Date {
  const correct = attempts - wrong;
  if (wrong >= attempts * 0.5) return new Date(Date.now() + 1000 * 60 * 60);
  if (correct <= 1) return new Date(Date.now() + 1000 * 60 * 60 * 24);
  if (correct <= 2) return new Date(Date.now() + 1000 * 60 * 60 * 72);
  return new Date(Date.now() + 1000 * 60 * 60 * 168);
}

// Same tiers as the web app (artifacts/gradefarm/src/lib/engine.js): a rank
// needs its XP and, from Silver up, a minimum recent accuracy.
export const RANK_TIERS = [
  { name: "Rookie", xp: 0, accuracy: 0 },
  { name: "Bronze II", xp: 200, accuracy: 0 },
  { name: "Bronze I", xp: 500, accuracy: 0 },
  { name: "Silver II", xp: 1200, accuracy: 0.5 },
  { name: "Silver I", xp: 2200, accuracy: 0.55 },
  { name: "Gold", xp: 4000, accuracy: 0.6 },
  { name: "Platinum", xp: 7000, accuracy: 0.65 },
  { name: "Diamond", xp: 12000, accuracy: 0.7 },
  { name: "Master", xp: 20000, accuracy: 0.75 },
  { name: "Grandmaster", xp: 30000, accuracy: 0.8 },
  { name: "Legend", xp: 50000, accuracy: 0.85 },
];
export const RANKS = RANK_TIERS.map((r) => r.name);
export const XP_LEVELS = RANK_TIERS.map((r) => r.xp);

/** Recent accuracy (0–1) from a profile's decayed answer counts; 0 with no answers. */
export function rankAccuracy(p?: { recent_correct?: number | null; recent_answers?: number | null } | null): number {
  const answers = Number(p?.recent_answers) || 0;
  if (answers <= 0) return 0;
  return Math.min(1, Math.max(0, (Number(p?.recent_correct) || 0) / answers));
}

/** The highest rank whose XP and accuracy requirements are both met. */
export function getLevel(xp: number, accuracy = 0): number {
  let level = 0;
  RANK_TIERS.forEach((tier, i) => {
    if ((xp || 0) >= tier.xp && accuracy >= tier.accuracy) level = i;
  });
  return level;
}

export function getLevelProgress(xp: number, accuracy = 0) {
  const level = getLevel(xp, accuracy);
  const current = XP_LEVELS[level];
  const nextTier = RANK_TIERS[level + 1];
  if (!nextTier) return { level, current, next: current, pct: 100, maxed: true, needsAccuracy: null as number | null };
  const pct = Math.min(100, Math.max(0, (((xp || 0) - current) / (nextTier.xp - current)) * 100));
  const needsAccuracy = (xp || 0) >= nextTier.xp && accuracy < nextTier.accuracy ? nextTier.accuracy : null;
  return { level, current, next: nextTier.xp, pct, maxed: false, needsAccuracy };
}

// A wrong answer costs as much as a right one earns before the streak bonus.
export function calcXP(correct: boolean, difficulty: number, streak: number): number {
  if (!correct) return -(difficulty * 12);
  const base = difficulty * 12;
  const multi = Math.min(1 + streak * 0.1, 2);
  return Math.round(base * multi);
}
