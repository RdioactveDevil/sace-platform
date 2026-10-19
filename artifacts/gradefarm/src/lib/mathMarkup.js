import { tokenizeMath, applyOutsideMath } from './tokenizeMath.js'

/**
 * Turns the maths-bearing text we get from the question bank and from AI chat
 * into an ordered list of text / math tokens ready for KaTeX.
 *
 * tokenizeMath() only understands clean `$...$` / `$$...$$`. Real model output
 * is messier, so before tokenizing we repair the failure modes seen in the app:
 *
 *   1. JSON-corrupted commands. `JSON.parse('"\frac"')` yields a form-feed
 *      followed by "rac", `\times` becomes TAB + "imes", `\beta` becomes
 *      BACKSPACE + "eta" and so on. We restore the backslash.
 *   2. Over-escaped commands (`\\frac`), which KaTeX reads as a line break
 *      followed by the word "frac".
 *   3. `\(...\)` and `\[...\]` delimiters — Claude's default in chat — which
 *      we rewrite to `$...$` / `$$...$$`.
 *   4. Bare LaTeX outside any delimiter ("Simplify \frac{x^2-4}{x-2}"), which
 *      we wrap in inline math.
 *
 * After that, the older plain-text heuristics (chemical formulas, caret
 * exponents, derivatives, (a)/(b) fractions) run on strings that carry no
 * explicit delimiters, exactly as before.
 */

// Commands recognised outside $...$ and when repairing corrupted escapes.
// Kept to maths vocabulary so ordinary backslashes (e.g. "C:\Users") are left alone.
const MATH_COMMANDS = new Set(`
  frac dfrac tfrac cfrac sqrt times div cdot cdotp cdots ldots dots vdots ddots
  pm mp le leq ge geq leqslant geqslant neq ne approx equiv sim simeq cong propto ll gg
  infty partial nabla int iint iiint oint sum prod lim limsup liminf
  to rightarrow leftarrow Rightarrow Leftarrow leftrightarrow Leftrightarrow
  longrightarrow longleftarrow rightleftharpoons leftrightharpoons implies iff mapsto
  uparrow downarrow xrightarrow xleftarrow
  in notin ni subset subseteq supset supseteq cup cap setminus emptyset varnothing
  forall exists neg not land lor vee wedge oplus otimes
  angle triangle degree circ perp parallel mid ast star bullet prime
  sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh ln log exp min max det deg gcd bmod pmod
  alpha beta gamma Gamma delta Delta epsilon varepsilon zeta eta theta Theta vartheta
  iota kappa lambda Lambda mu nu xi Xi pi Pi rho varrho sigma Sigma tau upsilon Upsilon
  phi Phi varphi chi psi Psi omega Omega hbar ell Re Im
  hat bar vec dot ddot tilde widehat widetilde overline underline overrightarrow overbrace underbrace
  text textbf textit textrm mathrm mathbf mathit mathbb mathcal mathsf operatorname boldsymbol
  left right big Big bigg Bigg bigl bigr Bigl Bigr langle rangle lfloor rfloor lceil rceil
  binom dbinom tbinom begin end quad qquad displaystyle overset underset stackrel boxed
  ce pu checkmark square
`.trim().split(/\s+/))

const isLetter = (c) => c !== undefined && /[A-Za-z]/.test(c)

// ── 1. JSON-corrupted escapes ────────────────────────────────────────────────

// JSON escape letter → the control character JSON.parse turns it into.
const CONTROL_CHARS = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }

function commandTailRegex(letter, ctrl) {
  const tails = [...MATH_COMMANDS]
    .filter((c) => c[0] === letter && c.length > 1)
    .map((c) => c.slice(1))
    .sort((a, b) => b.length - a.length)
  return new RegExp(`${ctrl}(${tails.join('|')})(?![A-Za-z])`, 'g')
}

const CONTROL_REPAIRS = Object.entries(CONTROL_CHARS).map(([letter, ctrl]) => ({
  letter,
  ctrl,
  re: commandTailRegex(letter, ctrl),
}))

/**
 * Restore commands whose leading `\x` was eaten by JSON.parse. Form-feed,
 * backspace, tab and carriage return never belong in display text, so those
 * are repaired wherever they precede a known command tail. A newline is a
 * legitimate character, so `\n` + "eq" is only repaired inside an unclosed
 * inline `$` on the same line (inline math can't span lines anyway).
 */
export function repairControlEscapes(text) {
  let out = text
  for (const { letter, ctrl, re } of CONTROL_REPAIRS) {
    if (!out.includes(ctrl)) continue
    re.lastIndex = 0
    out = out.replace(re, (whole, tail, offset, s) => {
      if (letter === 'n') {
        const lineStart = s.lastIndexOf('\n', offset - 1) + 1
        const dollars = (s.slice(lineStart, offset).match(/(?<!\\)\$/g) || []).length
        if (dollars % 2 === 0) return whole
      }
      return `\\${letter}${tail}`
    })
  }
  return out
}

// ── 2. Over-escaped commands ─────────────────────────────────────────────────

const OVER_ESCAPED_RE = new RegExp(
  `(?<!\\\\)\\\\\\\\(${[...MATH_COMMANDS].sort((a, b) => b.length - a.length).join('|')})(?![A-Za-z])`,
  'g',
)

/**
 * `\\frac` → `\frac`. A real `\\` row break is followed by whitespace or
 * another command (`\\ \frac`, `\\\frac`), never directly by a command name,
 * so collapsing only before known names is safe.
 */
export function collapseOverEscapes(text) {
  return text.replace(OVER_ESCAPED_RE, '\\$1')
}

// ── 2b. Literal "\n" line breaks ────────────────────────────────────────────

// LaTeX commands starting with "n". Any other "\n" + letters is a line break.
// Keep in sync with LATEX_N_COMMANDS in api-server/src/lib/json-latex.ts.
const LATEX_N_COMMANDS = new Set(`
  ne neq neg nabla nu ni not notin newline nleq ngeq nless ngtr nmid nexists natural
  nearrow nwarrow nolimits nsubseteq nsupseteq nparallel nsim ncong nleftarrow nrightarrow
  nLeftarrow nRightarrow nleftrightarrow nLeftrightarrow nvdash nVdash nprec nsucc
`.trim().split(/\s+/))

/**
 * Older generated questions stored a model's JSON newline as a literal
 * backslash-n ("...15, ...\n\nWhich rule..."). Turn those back into line
 * breaks, leaving real commands (\neq, \nabla, \nu) and `\\` row breaks alone.
 */
export function restoreLiteralNewlines(text) {
  if (!text.includes('\\n')) return text
  return text.replace(/(?<!\\)\\(n[A-Za-z]*)/g, (whole, name) =>
    LATEX_N_COMMANDS.has(name) ? whole : `\n${name.slice(1)}`,
  )
}

// ── 3. \( \) and \[ \] delimiters ────────────────────────────────────────────

function findUnescaped(s, needle, from) {
  let i = s.indexOf(needle, from)
  while (i > 0 && s[i - 1] === '\\') i = s.indexOf(needle, i + 1)
  return i
}

/**
 * Rewrite `\(x\)` → `$x$` and `\[x\]` → `$$x$$`. A `\[` preceded by another
 * backslash is a row break with spacing (`\\[4pt]`), not a delimiter.
 */
export function convertBracketDelimiters(text) {
  if (!text.includes('\\(') && !text.includes('\\[')) return text
  let out = ''
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\' && (text[i + 1] === '(' || text[i + 1] === '[') && text[i - 1] !== '\\') {
      const display = text[i + 1] === '['
      const close = findUnescaped(text, display ? '\\]' : '\\)', i + 2)
      if (close !== -1) {
        const inner = text.slice(i + 2, close)
        // tokenizeMath requires inline math to hug its delimiters.
        out += display ? `$$${inner}$$` : `$${inner.trim()}$`
        i = close + 2
        continue
      }
    }
    out += ch
    i += 1
  }
  return out
}

// ── 4. Bare LaTeX outside delimiters ─────────────────────────────────────────

// Short English words that end a maths run ("\mu = 5 and \sigma = 2").
const STOPWORDS = new Set(
  'is to of in at as or an be by if it on so we us do no up my he me am are and the for with then when where so'
    .split(' '),
)

// Characters that may sit inside an inline maths run.
const MATH_CHAR_RE = /[0-9+\-*/=<>()[\]|^_'!.,&~×÷−±≤≥≠≈∞°·→←⇌πθαβγδλμσΔΣΩ]/

function matchBrace(s, i) {
  let depth = 0
  for (let j = i; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue }
    if (s[j] === '{') depth++
    else if (s[j] === '}' && --depth === 0) return j
  }
  return -1
}

/**
 * Split a plain-text segment into units: 'cmd' (a known \command), 'math'
 * (anything that can live inside an equation), 'space', or 'prose'.
 */
function scanUnits(s) {
  const units = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    const prev = units[units.length - 1]

    if (ch === '\\') {
      if (isLetter(s[i + 1])) {
        let j = i + 1
        while (isLetter(s[j])) j++
        const name = s.slice(i + 1, j)
        if (!MATH_COMMANDS.has(name)) {
          units.push({ kind: 'prose', text: s.slice(i, j) })
          i = j
          continue
        }
        // Keep a whole \begin{env}...\end{env} together, newlines and all.
        if (name === 'begin' && s[j] === '{') {
          const envClose = s.indexOf('}', j)
          const env = s.slice(j + 1, envClose)
          const endTag = `\\end{${env}}`
          const end = envClose === -1 ? -1 : s.indexOf(endTag, envClose)
          if (end !== -1) {
            units.push({ kind: 'cmd', text: s.slice(i, end + endTag.length), block: true })
            i = end + endTag.length
            continue
          }
        }
        units.push({ kind: 'cmd', text: s.slice(i, j) })
        i = j
        continue
      }
      // \, \; \! \{ \} \\ and friends
      if (s[i + 1] !== undefined && s[i + 1] !== '\n') {
        units.push({ kind: 'math', text: s.slice(i, i + 2) })
        i += 2
        continue
      }
    }

    if (ch === '{') {
      const close = matchBrace(s, i)
      if (close !== -1) {
        units.push({ kind: 'math', text: s.slice(i, close + 1) })
        i = close + 1
        continue
      }
    }

    if (isLetter(ch)) {
      let j = i
      while (isLetter(s[j])) j++
      const word = s.slice(i, j)
      const attached = prev && prev.kind !== 'space' && prev.kind !== 'prose'
      const mathy =
        !STOPWORDS.has(word.toLowerCase()) &&
        (word.length === 1 || /^d[a-z]$/.test(word) || (attached && word.length <= 2))
      units.push({ kind: mathy ? 'math' : 'prose', text: word })
      i = j
      continue
    }

    if (ch === ' ' || ch === '\t') {
      units.push({ kind: 'space', text: ch })
      i += 1
      continue
    }

    units.push({ kind: MATH_CHAR_RE.test(ch) ? 'math' : 'prose', text: ch })
    i += 1
  }
  return units
}

/**
 * Wrap runs of bare LaTeX in a plain-text segment as inline maths. Returns
 * tokens; segments without a known \command come back as a single text token.
 */
export function wrapBareLatex(segment) {
  if (!/\\[A-Za-z]/.test(segment)) return [{ type: 'text', content: segment }]

  const units = scanUnits(segment)
  const tokens = []
  const pushText = (str) => {
    if (!str) return
    const last = tokens[tokens.length - 1]
    if (last && last.type === 'text') last.content += str
    else tokens.push({ type: 'text', content: str })
  }

  let i = 0
  while (i < units.length) {
    if (units[i].kind === 'prose') {
      pushText(units[i].text)
      i++
      continue
    }
    // Collect a maximal run of math/cmd/space units.
    let j = i
    while (j < units.length && units[j].kind !== 'prose') j++
    let run = units.slice(i, j)

    if (!run.some((u) => u.kind === 'cmd')) {
      pushText(run.map((u) => u.text).join(''))
      i = j
      continue
    }

    // Trim spaces / sentence punctuation off both ends, and a leading article
    // ("a \frac{1}{2} chance") that sits directly before the maths.
    const lead = []
    const trail = []
    const isEdge = (u) => u.kind === 'space' || (u.kind === 'math' && /^[.,]$/.test(u.text))
    while (run.length && isEdge(run[0])) lead.push(run.shift())
    while (run.length && isEdge(run[run.length - 1])) trail.unshift(run.pop())
    if (run.length > 2 && /^(a|A|I)$/.test(run[0].text) && run[1].kind === 'space') {
      const next = run.slice(1).find((u) => u.kind !== 'space')
      if (next && (next.kind === 'cmd' || /^[{0-9]/.test(next.text))) {
        lead.push(run.shift())
        while (run[0].kind === 'space') lead.push(run.shift())
      }
    }

    pushText(lead.map((u) => u.text).join(''))
    const content = run.map((u) => u.text).join('')
    const display = run.length === 1 && run[0].block === true
    tokens.push({ type: 'math', display, content })
    pushText(trail.map((u) => u.text).join(''))
    i = j
  }
  return tokens
}

// ── Legacy plain-text heuristics (chemistry, caret exponents, fractions) ─────

// Convert Unicode reaction arrows to mhchem notation
function toMhchem(str) {
  return str
    .replace(/→|⟶/g, '->')
    .replace(/⇌|⟷/g, '<->')
    .replace(/←|⟵/g, '<-')
    .replace(/⇒/g, '=>')
}

// Returns true if the string contains at least one chemical formula token
// (an element symbol immediately followed by a subscript digit, e.g. SO2, H2O)
function hasChemFormula(str) {
  return /[A-Z][a-z]?\d/.test(str)
}

/**
 * Detect numbered-list patterns like "(1) ... (2) ..." and insert \n
 * before each item so equations appear on their own lines. A number in
 * brackets attached to a name ("T(1)", "f(2)") is a function argument, not a
 * list marker, and text inside $...$ is never split.
 */
const LIST_MARKER_RE = /\s*(?<![A-Za-z0-9_)\]])(\(\d+\))/g

export function insertLineBreaks(text) {
  if (!text || text.includes('\n')) return text
  const markers = applyOutsideMath(text, (seg) => seg.replace(LIST_MARKER_RE, '\u0000$1'))
  if (!markers.includes('\u0000(1)') || !markers.includes('\u0000(2)')) return text
  return markers.replace(/\u0000/g, '\n')
}

// Unicode superscript characters → ASCII, so "x³" becomes "x^3" before wrapping.
const SUPERSCRIPT_MAP = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', 'ⁿ': 'n', 'ⁱ': 'i',
}

function convertUnicodeSuperscripts(text) {
  return text.replace(/([0-9A-Za-z)\]])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱ]+)/g, (whole, base, sup) => {
    const mapped = Array.from(sup).map((c) => SUPERSCRIPT_MAP[c] ?? '').join('')
    if (!mapped) return whole
    return `${base}^${mapped.length > 1 ? `{${mapped}}` : mapped}`
  })
}

/**
 * KaTeX needs an exponent grouped in braces, otherwise a bare `e^(-0.5x)`
 * raises only the "(" to the power. Rewrite `^(...)` → `^{(...)}` so the whole
 * parenthesised expression is treated as the exponent.
 */
function groupParenExponents(str) {
  return str.replace(/\^\(([^()]*)\)/g, '^{($1)}')
}

/**
 * Auto-detect math expressions not already wrapped in $ delimiters.
 * Handles two cases:
 *   A. Pure math strings (answer options like "e^x", "(x+2)e^x") — wrap entirely.
 *   B. Mixed prose+math (questions like "If f(x)=xe^x, what is f''(x)?") — wrap
 *      individual sub-expressions.
 * Unicode superscripts (x², x³) are converted to caret notation first.
 * (expr)/(expr) fractions are converted to \frac{expr}{expr}.
 */
function autoWrapMath(rawText) {
  // Normalize en/em-dashes to ASCII hyphen so expressions like "x(24 – x²)/2"
  // are recognised as pure math (en-dashes are used as minus signs in generated output).
  const text = convertUnicodeSuperscripts(rawText).replace(/[–—]/g, '-')
  const hasCaret = /[a-zA-Z0-9]\^[a-zA-Z0-9({]/.test(text)
  const hasDerivative = /[a-z]'{1,3}\([a-z]\)/.test(text)
  const hasFraction = /\([^()]+\)\/\([^()]+\)/.test(text)
  if (!hasCaret && !hasDerivative && !hasFraction) return text

  // A pure math string: no sentence punctuation, only math-compatible characters,
  // and doesn't start with a capitalised English word (e.g. "Find").
  const isMathOnly =
    !/[?!]/.test(text) &&
    !/\.\s/.test(text) &&
    !/^[A-Z][a-z]/.test(text) &&
    /^[a-zA-Z0-9\s^+\-*/()\'=,.]+$/.test(text)

  if (isMathOnly) {
    // Convert (a)/(b) to \frac{a}{b} before wrapping the whole expression in $...$
    const withFrac = text.replace(
      /\(([^()]+)\)\/\(([^()]+)\)/g,
      (m, num, den) => (/[\d^+\-]/.test(num) || /[\d^+\-]/.test(den)) ? `\\frac{${num}}{${den}}` : m,
    )
    return `$${groupParenExponents(withFrac.trim())}$`
  }

  // Mixed text: convert (a)/(b) to $\frac{a}{b}$ first, then wrap remaining
  // exponent/derivative sub-expressions only in plain-text segments.
  let result = text

  result = result.replace(
    /\(([^()]+)\)\/\(([^()]+)\)/g,
    (m, num, den) => (/[\d^+\-]/.test(num) || /[\d^+\-]/.test(den)) ? `$\\frac{${num}}{${den}}$` : m,
  )

  result = applyOutsideMath(result, (seg) => {
    // Exponent expressions: x^2, xe^x, e^{2x}, (x+1)^2, (x + 2)e^x, e^(-0.5x).
    seg = seg.replace(
      /(?:\([^()]*\)|[a-zA-Z0-9])+\^(?:\{[^}]*\}|\([^()]*\)|[a-zA-Z0-9]+)/g,
      (m) => `$${groupParenExponents(m)}$`,
    )
    // Derivative notation: f'(x), f''(x), g'(t)
    seg = seg.replace(
      /([a-zA-Z]'{1,3}\([a-zA-Z0-9]\))/g,
      (m) => `$${m}$`,
    )
    return seg
  })

  return result
}

/**
 * Insert LaTeX delimiters into plain text so KaTeX can pick it up.
 *
 * Rules (applied in order):
 *   1. If the text already has $ signs → skip (it uses explicit LaTeX)
 *   2. If the text has a reaction arrow AND a chemical formula →
 *      treat the whole text as a chemical equation
 *   3. Scan for subscript-bearing formula tokens (e.g. SO2) and wrap individually
 *   4. If no $ signs were introduced by the chemical pass, auto-detect math
 *      expressions (caret exponents, derivative notation) and wrap them
 */
function preprocessPlain(text) {
  if (!text || text.includes('$')) return text

  const hasArrow = /[→←⇌⟶⟵⟷⇒]/.test(text)

  if (hasArrow && hasChemFormula(text)) {
    // The whole string is (or contains) a reaction equation
    return `$\\ce{${toMhchem(text)}}$`
  }

  let result = text

  if (hasChemFormula(text)) {
    // Inline formula pass: find tokens like SO2, H2SO4, CO2, NH3, Ca2+
    result = result.replace(
      /(?:[A-Z][a-z]?\d*(?:\([^)]+\)\d*)?)+(?:[+-])?/g,
      (match) => {
        // Only wrap if the match contains a digit (subscript is present)
        // and is longer than 1 character to avoid single letters like "I"
        if (/\d/.test(match) && match.length > 1) {
          return `$\\ce{${match}}$`
        }
        return match
      },
    )
  }

  // Auto-detect math (caret / derivative notation) only when the chemical pass
  // did not already introduce any $ signs.
  if (!result.includes('$')) {
    result = autoWrapMath(result)
  }

  return result
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

/** Apply the source-level repairs (1–3) to a raw string. */
export function normalizeMathSource(text) {
  return convertBracketDelimiters(restoreLiteralNewlines(collapseOverEscapes(repairControlEscapes(text))))
}

/**
 * Parse display text into `{type:'text'|'math', display, content}` tokens,
 * repairing malformed LaTeX and wrapping undelimited maths along the way.
 */
export function parseMathText(text) {
  if (!text || typeof text !== 'string') return []

  const source = normalizeMathSource(insertLineBreaks(text))
  const explicit = tokenizeMath(source)
  // Strings that already use $...$ are trusted as written; the plain-text
  // heuristics only run on strings with no explicit maths at all.
  const usePlainHeuristics = !explicit.some((t) => t.type === 'math')

  const out = []
  const push = (tok) => {
    const last = out[out.length - 1]
    if (tok.type === 'text' && last && last.type === 'text') last.content += tok.content
    else if (tok.type === 'math' || tok.content) out.push({ ...tok })
  }

  for (const tok of explicit) {
    if (tok.type === 'math') { push(tok); continue }
    for (const sub of wrapBareLatex(tok.content)) {
      if (sub.type === 'math' || !usePlainHeuristics || sub.content.includes('$')) {
        push(sub)
        continue
      }
      tokenizeMath(preprocessPlain(sub.content)).forEach(push)
    }
  }
  return out
}

export default parseMathText
