// Compiles graph function expressions (as emitted in `graph.functions[].expr`)
// into sampling functions of a single variable.
//
// The evaluator binds only `x`. Word problems, however, routinely phrase the
// function in terms of another letter — t for time, n for a count, P for a
// population — and the generated `expr` inherits that letter. Because the
// compiled function only knows `x`, every sample throws a ReferenceError, the
// path string stays empty, and the curve silently vanishes (leaving any
// plotted points behind, which is exactly the "graph rendering issue" seen on
// the radioactive-decay question N(t) = 1200·(1/3)^(t/5)). Normalising the lone
// variable to `x` before compiling makes these curves render.

// Identifiers that are already meaningful inside an expression and must never
// be treated as the independent variable.
const RESERVED = new Set([
  'abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'cos', 'exp', 'floor',
  'log', 'max', 'min', 'pow', 'round', 'sign', 'sin', 'sqrt', 'tan',
  'PI', 'E', 'Math', 'x',
])

// A bare identifier not preceded by a word char or `.` (so `Math.exp` and the
// `e5` of `1e5` are skipped) and not followed by a word char.
const IDENT_RE = /(?<![A-Za-z0-9_.])[A-Za-z][A-Za-z0-9]*/g

// If `expr` uses exactly one non-reserved variable and it isn't already `x`,
// rewrite every standalone occurrence of it to `x`. When zero or several such
// variables appear, the expression is left untouched (it either already uses
// `x` or is too ambiguous to rewrite safely).
export function normalizeExprVariable(expr) {
  if (typeof expr !== 'string') return expr
  const vars = new Set()
  let m
  IDENT_RE.lastIndex = 0
  while ((m = IDENT_RE.exec(expr)) !== null) {
    if (!RESERVED.has(m[0])) vars.add(m[0])
  }
  if (vars.size !== 1) return expr
  const v = [...vars][0]
  return expr.replace(
    new RegExp(`(?<![A-Za-z0-9_.])${v}(?![A-Za-z0-9_])`, 'g'),
    'x',
  )
}

// Safe-ish expression evaluator — only exposes Math.* to the expression string.
// Returns a function of x, or null if the expression can't be compiled.
export function makeEvalFn(expr) {
  try {
    // Normalise the variable, then replace ^ with ** for exponentiation.
    const safe = normalizeExprVariable(expr).replace(/\^/g, '**')
    // eslint-disable-next-line no-new-func
    return new Function(
      'x',
      `"use strict"; const {abs,acos,asin,atan,atan2,ceil,cos,exp,floor,log,max,min,pow,round,sign,sin,sqrt,tan,PI,E} = Math; return (${safe});`,
    )
  } catch {
    return null
  }
}
