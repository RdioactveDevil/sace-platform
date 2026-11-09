// Marking answers on the server: the same rules as the app's gradeResponse
// (artifacts/gradefarm/src/lib/questionTypes.js), and the XP an answer earns
// (engine.js calcXP / calcRemediationXP). The app no longer has the answers,
// so it can't mark anything itself.

export type GradableQuestion = {
  id: string;
  question_type?: string | null;
  difficulty?: number | null;
  options?: unknown;
  answer_index?: number | null;
  answer_indices?: unknown;
  answer?: unknown;
  tolerance?: unknown;
  unit?: string | null;
  accept?: unknown;
  case_sensitive?: boolean | null;
  items?: unknown;
  hotspots?: unknown;
  markers?: unknown;
  solution?: string | null;
  tip?: string | null;
  marking_scheme?: unknown;
  advice?: unknown;
  parts?: unknown;
};

/** The columns that say what the answer is: never sent before the question is answered. */
export const ANSWER_COLUMNS = [
  "answer_index", "answer_indices", "answer", "tolerance", "accept", "items",
  "hotspots", "markers", "solution", "tip", "marking_scheme", "advice", "parts",
] as const;

const TYPES = new Set(["mcq", "multi_select", "numeric", "short_text", "order", "hotspot", "image_label", "marked", "extended"]);

export function questionType(q: { question_type?: string | null } | null | undefined): string {
  const t = q?.question_type;
  return t && TYPES.has(t) ? t : "mcq";
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

function normalizeText(s: unknown, caseSensitive: boolean): string {
  let v = String(s ?? "").trim().replace(/\s+/g, " ");
  if (!caseSensitive) v = v.toLowerCase();
  return v;
}

function sameSet(a: unknown, b: unknown[]): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

function sameOrder(a: unknown, b: unknown[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Whether a response is right. Written answers ('marked') are marked by AI
 * against their scheme instead (routes/marking.ts), so this says false for them.
 */
export function gradeResponse(q: GradableQuestion, response: unknown): boolean {
  switch (questionType(q)) {
    case "mcq":
      return Number.isInteger(response) && response === q.answer_index;
    case "multi_select":
      return sameSet(response, asArray(q.answer_indices));
    case "numeric": {
      const val = parseFloat(String(response ?? ""));
      const target = parseFloat(String(q.answer ?? ""));
      if (Number.isNaN(val) || Number.isNaN(target)) return false;
      const tol = Math.abs(parseFloat(String(q.tolerance ?? "")) || 0);
      return Math.abs(val - target) <= tol + 1e-9;
    }
    case "short_text": {
      if (typeof response !== "string") return false;
      const cs = !!q.case_sensitive;
      const got = normalizeText(response, cs);
      return asArray(q.accept).some((a) => normalizeText(a, cs) === got);
    }
    case "order":
      return sameOrder(response, asArray(q.items));
    case "hotspot": {
      const hs = asArray(q.hotspots) as { correct?: unknown }[];
      return Number.isInteger(response) && (response as number) >= 0 && (response as number) < hs.length && !!hs[response as number]?.correct;
    }
    case "image_label": {
      const markers = asArray(q.markers) as { answer?: unknown }[];
      if (!Array.isArray(response) || response.length !== markers.length) return false;
      return markers.every((m, i) => response[i] === m?.answer);
    }
    default:
      return false;
  }
}

/** The answer fields of a question, to show once it has been answered. */
export function revealOf(q: GradableQuestion): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of ANSWER_COLUMNS) {
    const v = (q as Record<string, unknown>)[col];
    if (v !== undefined && v !== null) out[col] = v;
  }
  return out;
}

/**
 * A question as a student may see it before answering, like the
 * questions_student view: no key, solution, tip, scheme or advice; ordering
 * items shuffled; hotspots, markers and parts without what says which is right.
 */
export function withoutAnswers<T extends Record<string, unknown>>(q: T): Partial<T> {
  const out: Record<string, unknown> = { ...q };
  for (const col of ["answer_index", "answer_indices", "answer", "tolerance", "accept", "solution", "tip", "marking_scheme", "advice"]) delete out[col];
  const strip = (v: unknown, keys: string[]) => asArray(v).map((x) => {
    if (!x || typeof x !== "object") return x;
    const copy = { ...(x as Record<string, unknown>) };
    for (const k of keys) delete copy[k];
    return copy;
  });
  if (out.items != null) out.items = [...asArray(out.items)].sort(() => Math.random() - 0.5);
  if (out.hotspots != null) out.hotspots = strip(out.hotspots, ["correct", "label"]);
  if (out.markers != null) out.markers = strip(out.markers, ["answer"]);
  if (out.parts != null) out.parts = strip(out.parts, ["solution", "answer", "marking_scheme"]);
  return out as Partial<T>;
}

/** A sane response to store: small, plain JSON. Anything else becomes null. */
export function cleanResponse(response: unknown): unknown {
  if (response === null || response === undefined) return null;
  if (typeof response === "number") return Number.isFinite(response) ? response : null;
  if (typeof response === "string") return response.slice(0, 20_000);
  if (Array.isArray(response) && response.length <= 50) {
    return response.map((x) => (typeof x === "string" ? x.slice(0, 2_000) : typeof x === "number" && Number.isFinite(x) ? x : null));
  }
  return null;
}

const clampDifficulty = (d: unknown) => Math.max(1, Math.min(5, Math.round(Number(d) || 1)));

/** XP for a bank question: right earns more on a run of right answers (×2 at most), wrong loses the base. */
export function calcXP(correct: boolean, difficulty: unknown, run: number): number {
  const base = clampDifficulty(difficulty) * 12;
  if (!correct) return -base;
  return Math.round(base * Math.min(1 + Math.max(0, run) * 0.1, 2));
}

/** XP for part marks on a written answer: that share of a right answer, at least 1. */
export function partMarksXP(difficulty: unknown, awarded: number, total: number): number {
  return Math.max(1, Math.round(calcXP(true, difficulty, 0) * awarded / total));
}

/** Extra-practice questions: a little for a right answer, nothing lost for a wrong one. */
export const remediationXP = (correct: boolean) => (correct ? 2 : 0);
export const REMEDIATION_BONUS = 5;
