// The scientific calculator in the quiz's Tools (QuizToolsDock.jsx). Students
// type an expression the way they'd key it into an exam calculator, so this
// reads what they type rather than running it as code:
//
//   numbers      12, 0.5, .5, 6.02E23 (E is "× 10 to the", as on the EXP key)
//   operators    + - * / ^ and × ÷ − ·, with the usual order (^ before × ÷ before + -)
//   after        ! (factorial), % (÷ 100), ² ³ ⁻¹
//   functions    sin cos tan asin acos atan (or sin⁻¹ …) sinh cosh tanh
//                ln log (base 10, or log(x, base)) √ / sqrt ∛ / cbrt abs exp
//                nCr(n, r) nPr(n, r); brackets optional for one number: sin 30, √2
//   constants    π / pi, e, Ans (the last answer)
//   implied ×    2π, 3(4 + 1), (1 + 2)(3), 2sin(30), 5Ans
//
// Trig uses degrees unless `deg` is false. Errors are CalcError: "Syntax
// error" for something it can't read, "Math error" for an undefined result.

export class CalcError extends Error {}

const syntax = () => new CalcError('Syntax error')
const mathErr = () => new CalcError('Math error')

const FUNCS = ['asinh', 'acosh', 'atanh', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sin', 'cos', 'tan', 'sqrt', 'cbrt', 'abs', 'exp', 'log', 'ln', 'nCr', 'nPr']
const WORDS = [...FUNCS, 'Ans', 'pi'].sort((a, b) => b.length - a.length)

// Unicode a student may type or the keypad inserts, as the plain form.
function normalise(src) {
  return String(src ?? '')
    .replace(/[×·✕]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/√/g, 'sqrt')
    .replace(/∛/g, 'cbrt')
    .replace(/π/g, 'pi')
    .replace(/ans/gi, 'Ans')
    .replace(/pi/gi, 'pi')
    .replace(/(sin|cos|tan|sinh|cosh|tanh)⁻¹/g, 'a$1')
}

function tokenize(src) {
  const s = normalise(src)
  const out = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { i++; continue }
    const num = s.slice(i).match(/^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?/)
    if (num) {
      if (num[0] === '.' || /^[.\d]/.test(s.slice(i + num[0].length))) throw syntax() // 2..3
      out.push({ t: 'num', v: Number(num[0].replace('E', 'e')), written: true })
      i += num[0].length
      continue
    }
    const word = WORDS.find(w => s.startsWith(w, i))
    if (word) {
      if (word === 'Ans') out.push({ t: 'ans' })
      else if (word === 'pi') out.push({ t: 'num', v: Math.PI })
      else out.push({ t: 'fn', v: word })
      i += word.length
      continue
    }
    if (c === 'e') { out.push({ t: 'num', v: Math.E }); i++; continue }
    if ('+-*/^()!%,'.includes(c)) { out.push({ t: c }); i++; continue }
    if (c === '²' || c === '³') { out.push({ t: 'pow', v: c === '²' ? 2 : 3 }); i++; continue }
    if (s.startsWith('⁻¹', i)) { out.push({ t: 'inv' }); i += 2; continue }
    throw syntax()
  }
  return out
}

function factorial(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw mathErr()
  let r = 1
  for (let k = 2; k <= n; k++) r *= k
  return r
}

function choose(n, r, perm) {
  if (![n, r].every(Number.isInteger) || n < 0 || r < 0 || r > n) throw mathErr()
  let out = 1
  for (let k = 0; k < r; k++) out *= (n - k) / (perm ? 1 : k + 1)
  return Math.round(out)
}

/**
 * The value of an expression. `ans` is what Ans means; `deg` picks degrees
 * (true) or radians for trig.
 */
export function evaluate(src, { ans = 0, deg = true } = {}) {
  const toks = tokenize(src)
  if (!toks.length) throw syntax()
  let p = 0
  const peek = () => toks[p]
  const take = (t) => (toks[p]?.t === t ? toks[p++] : null)
  const k = deg ? Math.PI / 180 : 1
  // Exact values at the angles students use (sin 30 = 0.5, not 0.49999999999999994).
  const tidy = (v) => (Math.abs(v - Math.round(v * 1e12) / 1e12) < 1e-14 ? Math.round(v * 1e12) / 1e12 : v)

  const apply = (fn, args) => {
    const [x, y] = args
    const one = () => { if (args.length !== 1) throw syntax() }
    switch (fn) {
      case 'sin': one(); return tidy(Math.sin(x * k))
      case 'cos': one(); return tidy(Math.cos(x * k))
      case 'tan': one(); if (deg && Math.abs(((x % 180) + 180) % 180 - 90) < 1e-9) throw mathErr(); return tidy(Math.tan(x * k))
      case 'asin': one(); return Math.asin(x) / k
      case 'acos': one(); return Math.acos(x) / k
      case 'atan': one(); return Math.atan(x) / k
      case 'sinh': one(); return Math.sinh(x)
      case 'cosh': one(); return Math.cosh(x)
      case 'tanh': one(); return Math.tanh(x)
      case 'asinh': one(); return Math.asinh(x)
      case 'acosh': one(); return Math.acosh(x)
      case 'atanh': one(); return Math.atanh(x)
      case 'sqrt': one(); return Math.sqrt(x)
      case 'cbrt': one(); return Math.cbrt(x)
      case 'abs': one(); return Math.abs(x)
      case 'exp': one(); return Math.exp(x)
      case 'ln': one(); return Math.log(x)
      case 'log':
        if (args.length === 1) return Math.log10(x)
        if (args.length === 2) return Math.log(x) / Math.log(y)
        throw syntax()
      case 'nCr': case 'nPr':
        if (args.length !== 2) throw syntax()
        return choose(x, y, fn === 'nPr')
      default: throw syntax()
    }
  }

  // Does the next token start a value (for implied multiplication)? Not a
  // written number: "2 3" is a slip, not 6 (π, e, Ans, functions and brackets are).
  const startsValue = (tk) => !!tk && ((tk.t === 'num' && !tk.written) || tk.t === 'ans' || tk.t === 'fn' || tk.t === '(')

  function expr() {
    let v = term()
    for (;;) {
      if (take('+')) v += term()
      else if (take('-')) v -= term()
      else return v
    }
  }
  function term() {
    let v = unary()
    for (;;) {
      if (take('*')) v *= unary()
      else if (take('/')) { const d = unary(); if (d === 0) throw mathErr(); v /= d }
      else if (startsValue(peek())) v *= power() // 2π, 3(4), 2sin 30
      else return v
    }
  }
  function unary() {
    if (take('-')) return -unary()
    if (take('+')) return unary()
    return power()
  }
  function power() {
    const base = postfix()
    if (take('^')) return base ** unary() // right-associative: 2^3^2 = 2^9
    return base
  }
  function postfix() {
    let v = primary()
    for (;;) {
      if (take('!')) v = factorial(v)
      else if (take('%')) v /= 100
      else if (peek()?.t === 'pow') v = v ** toks[p++].v
      else if (take('inv')) { if (v === 0) throw mathErr(); v = 1 / v }
      else return v
    }
  }
  function primary() {
    const tk = toks[p++]
    if (!tk) throw syntax()
    if (tk.t === 'num') return tk.v
    if (tk.t === 'ans') return ans
    if (tk.t === '(') {
      const v = expr()
      take(')') // a missing last bracket is closed for them, as on a calculator
      return v
    }
    if (tk.t === 'fn') {
      if (take('(')) {
        const args = [expr()]
        while (take(',')) args.push(expr())
        take(')')
        return apply(tk.v, args)
      }
      // sin 30, √2, ln e: the function takes the next value (with its powers).
      return apply(tk.v, [unary()])
    }
    throw syntax()
  }

  const v = expr()
  if (p !== toks.length) throw syntax()
  if (typeof v !== 'number' || !Number.isFinite(v)) throw mathErr()
  return v
}

/**
 * A result as the display shows it: up to 10 significant figures, and very
 * large or small numbers in scientific notation ({ mantissa, exponent }).
 */
export function formatResult(v) {
  if (!Number.isFinite(v)) return { text: 'Math error' }
  if (v === 0) return { text: '0' }
  const a = Math.abs(v)
  if (a >= 1e10 || a < 1e-6) {
    const [m, e] = v.toExponential(9).split('e')
    const mantissa = String(parseFloat(m))
    const exponent = String(Number(e))
    return { text: `${mantissa}E${exponent}`, mantissa, exponent }
  }
  return { text: String(parseFloat(v.toPrecision(10))) }
}
