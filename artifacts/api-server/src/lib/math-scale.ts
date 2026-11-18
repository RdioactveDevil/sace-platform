/**
 * How big a question's maths prints (questions.math_scale, migration
 * 20261118000004_question_math_scale.sql), set from Admin → a paper's page.
 * The sizes match the app's lib/mathScale.js; the normal size is stored as null.
 */
export const MATH_SCALES = [1, 1.15, 1.3, 1.5];

export function parseMathScale(body: unknown): { math_scale: number | null } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!("math_scale" in b)) return { error: "math_scale is required" };
  const k = b.math_scale;
  if (k === null || k === 1) return { math_scale: null };
  if (typeof k !== "number" || !MATH_SCALES.includes(k)) return { error: `math_scale must be one of ${MATH_SCALES.join(", ")} or null` };
  return { math_scale: k };
}
