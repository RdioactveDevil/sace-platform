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

export const XP_LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000, 5000];
export const RANKS = [
  "Rookie", "Bronze II", "Bronze I", "Silver II", "Silver I",
  "Gold", "Platinum", "Diamond", "Master", "Grandmaster", "SACE Legend",
];

export function getLevel(xp: number): number {
  const idx = XP_LEVELS.findIndex((v, i) => xp >= v && xp < (XP_LEVELS[i + 1] ?? Infinity));
  return idx < 0 ? XP_LEVELS.length - 1 : idx;
}

export function getLevelProgress(xp: number) {
  const level = getLevel(xp);
  const current = XP_LEVELS[level] ?? 0;
  const next = XP_LEVELS[level + 1] ?? current + 500;
  return { level, current, next, pct: ((xp - current) / (next - current)) * 100 };
}

export function calcXP(correct: boolean, difficulty: number, streak: number): number {
  if (!correct) return -(difficulty * 4);
  const base = difficulty * 12;
  const multi = Math.min(1 + streak * 0.12, 2.2);
  return Math.round(base * multi);
}
