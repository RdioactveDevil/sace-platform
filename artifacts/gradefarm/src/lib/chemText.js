/**
 * Chemistry text for SVG labels: "Fe2+" → Fe²⁺, "H2O" → H₂O, "SO42-" → SO₄²⁻,
 * "NH4+" → NH₄⁺, "mol L^-1" → mol L⁻¹. Returns [kind, text] pieces, kind
 * 'n' (normal), 'sub' or 'sup'.
 *
 * Digits after an element symbol are subscripts. For an ion, the digit just
 * before the sign is its charge when there are two digits there (SO42-) or the
 * ion is a single element (Fe2+, O2-); otherwise it's a subscript (NH4+, NO3-).
 * Anything after ^ is a superscript.
 */
const FORMULA = /^(?:[A-Z][a-z]?\d*)+$/

function formulaParts(body, push) {
  for (const [, el, n] of body.matchAll(/([A-Z][a-z]?)(\d*)/g)) { push(el); push(n, 'sub') }
}

export function chemTextParts(text) {
  const s = String(text ?? '')
  if (hasLatex(s)) return latexParts(s, chemPlainParts)
  return chemPlainParts(s)
}

/**
 * A figure label that isn't chemistry (bar charts, number lines, geometry):
 * only LaTeX markup is converted, so "Q1" stays "Q1" rather than Q₁.
 */
export function labelParts(text) {
  const s = String(text ?? '')
  return hasLatex(s) ? latexParts(s, (t) => (t ? [['n', t]] : [])) : (s ? [['n', s]] : [])
}

/** The label as one plain string (sub/superscripts flattened), e.g. for aria-labels. */
export function labelPlain(text) {
  return labelParts(text).map(([, t]) => t).join('')
}

// --- LaTeX in labels -------------------------------------------------------
// The lesson writer (and some generated questions) put LaTeX in figure labels:
// "CO$_2$", "mol L$^{-1}$", "$\Delta H$". SVG text can't be typeset by KaTeX,
// so the common markup is turned into sub/superscript pieces and symbols.

const SYMBOLS = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', varepsilon: 'ε', theta: 'θ', Theta: 'Θ',
  lambda: 'λ', mu: 'μ', nu: 'ν', pi: 'π', Pi: 'Π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', tau: 'τ', phi: 'φ', varphi: 'φ',
  omega: 'ω', Omega: 'Ω', chi: 'χ', psi: 'ψ',
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', degree: '°', circ: '°', deg: '°', infty: '∞',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', propto: '∝',
  rightarrow: '→', to: '→', longrightarrow: '→', leftarrow: '←', rightleftharpoons: '⇌', leftrightarrow: '↔',
  ldots: '…', dots: '…', cdots: '⋯', prime: '′', partial: '∂',
  quad: ' ', qquad: ' ', ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ',
  '%': '%', '$': '$', '&': '&', '#': '#', '_': '_', '{': '{', '}': '}',
}
// Commands whose argument is shown as it is (\text{Mass} → Mass).
const AS_IS = new Set(['text', 'textrm', 'mathrm', 'mathbf', 'textbf', 'mathit', 'textit', 'operatorname', 'mbox', 'boldsymbol', 'mathsf', 'textsf'])
// Commands with no visible output of their own.
const DROP = new Set(['left', 'right', 'big', 'Big', 'displaystyle', 'textstyle', 'limits', 'mathstrut'])

function hasLatex(s) {
  return /\$|\\[A-Za-z]|[_^]\{|_\d/.test(s)
}

// The {…} group (or the single character or command) at s[i]: [content, next index].
function readArg(s, i) {
  while (s[i] === ' ') i++
  if (s[i] === '{') {
    let depth = 1, j = i + 1
    for (; j < s.length && depth; j++) {
      if (s[j] === '{') depth++
      else if (s[j] === '}') depth--
    }
    return [s.slice(i + 1, depth ? j : j - 1), j]
  }
  if (s[i] === '\\') {
    const m = s.slice(i).match(/^\\([A-Za-z]+|.)/)
    if (m) return [m[0], i + m[0].length]
  }
  return [s[i] ?? '', i + 1]
}

const flat = (s) => latexParts(s, (t) => (t ? [['n', t]] : [])).map(([, t]) => t).join('')

// mhchem: "\ce{SO4^2-}", "\ce{A -> B}".
function cePieces(arg) {
  const s = arg.replace(/<=>|<->/g, '⇌').replace(/->/g, '→').replace(/<-/g, '←')
  return chemPlainParts(s.replace(/\^\{?([^}\s]*)\}?/g, (_, ch) => (/^\d?[+-]$/.test(ch) ? ch : `^${ch}`)))
}

function latexParts(s, plain) {
  const parts = []
  let buf = ''
  const flush = () => { if (buf) { parts.push(...plain(buf)); buf = '' } }
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '$' || ch === '{' || ch === '}') { i++; continue }
    if (ch === '\\') {
      const m = s.slice(i).match(/^\\([A-Za-z]+|.)/)
      if (!m) { i++; continue }
      const name = m[1]
      i += m[0].length
      // As in LaTeX, spaces after a command word aren't shown ("\\Delta H" → ΔH).
      if (/^[A-Za-z]/.test(name)) while (s[i] === ' ') i++
      if (name === 'ce' || name === 'pu') {
        const [arg, j] = readArg(s, i)
        flush(); parts.push(...cePieces(arg)); i = j
      } else if (AS_IS.has(name)) {
        const [arg, j] = readArg(s, i)
        buf += flat(arg); i = j
      } else if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const [a, j1] = readArg(s, i)
        const [b, j2] = readArg(s, j1)
        const wrap = (x) => (x.length > 1 && /[^\w.]/.test(x) ? `(${x})` : x)
        buf += `${wrap(flat(a))}/${wrap(flat(b))}`; i = j2
      } else if (name === 'sqrt') {
        const [a, j] = readArg(s, i)
        const v = flat(a)
        buf += v.length > 1 ? `√(${v})` : `√${v}`; i = j
      } else if (name in SYMBOLS) {
        buf += SYMBOLS[name]
      } else if (!DROP.has(name)) {
        // Unknown command: show its name rather than a stray backslash.
        buf += name.length > 1 ? name : ''
      }
      continue
    }
    if (ch === '_' || ch === '^') {
      const [arg, j] = readArg(s, i + 1)
      const v = flat(arg)
      if (ch === '^' && (v === '°' || v === '∘')) { buf += '°'; i = j; continue }
      flush()
      if (v) parts.push([ch === '_' ? 'sub' : 'sup', ch === '^' ? v.replace(/-/g, '−') : v])
      i = j
      continue
    }
    buf += ch
    i++
  }
  flush()
  return parts
}

function chemPlainParts(text) {
  const parts = []
  const push = (t, kind = 'n') => { if (t) parts.push([kind, t]) }
  for (const token of String(text ?? '').split(/(\s+|[(),[\]])/)) {
    const sup = token.match(/^(.*?)\^([-+−]?\d*[-+−]?)$/)
    if (sup && sup[2]) { push(sup[1]); push(sup[2].replace(/-/g, '−'), 'sup'); continue }

    const ion = token.match(/^([A-Za-z\d]+?)(\d*)([+-])$/)
    if (ion && /^[A-Z]/.test(ion[1])) {
      let body = ion[1], digits = ion[2], charge = ''
      if (digits.length >= 2) { charge = digits.slice(-1); body += digits.slice(0, -1) }
      else if (digits.length === 1 && /^[A-Z][a-z]?$/.test(body)) charge = digits
      else body += digits
      if (FORMULA.test(body)) {
        formulaParts(body, push)
        push(charge + ion[3].replace('-', '−'), 'sup')
        continue
      }
    }

    if (FORMULA.test(token) && /\d/.test(token)) { formulaParts(token, push); continue }
    push(token)
  }
  return parts
}
