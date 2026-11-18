// How big a question's maths prints (questions.math_scale, migration
// 20261118000004_question_math_scale.sql). Exam papers set superscripts,
// subscripts, integral limits and fractions in a line of text small, and some
// rebuilt equations come out hard to read; an admin can print one question's
// maths bigger from its paper page. null (or 1) is the normal size.

/** The sizes offered, as multiples of the normal printed maths size. */
export const MATH_SCALES = [1, 1.15, 1.3, 1.5]

/** The scale a question prints its maths at: 1 unless one of MATH_SCALES is set. */
export function mathScaleOf(q) {
  const k = Number(q?.math_scale)
  return MATH_SCALES.includes(k) ? k : 1
}

/** The next size up (dir 1) or down (dir -1) from `k`, staying within MATH_SCALES. */
export function stepMathScale(k, dir) {
  const i = Math.max(0, MATH_SCALES.indexOf(MATH_SCALES.includes(k) ? k : 1))
  return MATH_SCALES[Math.min(MATH_SCALES.length - 1, Math.max(0, i + (dir > 0 ? 1 : -1)))]
}

/** "100%", "115%", … for showing a scale. */
export const mathScaleLabel = (k) => `${Math.round(k * 100)}%`
