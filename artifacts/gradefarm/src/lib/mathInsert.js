// The symbol bar in Admin's question editors (components/EditorTools.jsx):
// buttons that insert the LaTeX for maths and chemistry at the cursor. The
// questions' text uses $…$ for maths and \ce{…} for chemistry (MathText).
//
// A snippet's code may hold one "|": the slot the selected text goes into and
// where the cursor ends up. Snippets with math: true are wrapped in $…$ when
// the cursor isn't already inside maths.

export const SNIPPETS = [
  // Maths
  { id: 'fraction', group: 'Maths', label: 'a/b', title: 'Fraction', code: '\\frac{|}{}', math: true },
  { id: 'power', group: 'Maths', label: 'xⁿ', title: 'Power', code: '^{|}', math: true },
  { id: 'sub', group: 'Maths', label: 'xₙ', title: 'Subscript', code: '_{|}', math: true },
  { id: 'root', group: 'Maths', label: '√', title: 'Square root', code: '\\sqrt{|}', math: true },
  { id: 'deriv', group: 'Maths', label: 'dy/dx', title: 'Derivative', code: '\\frac{\\mathrm{d}y}{\\mathrm{d}x}|', math: true },
  { id: 'integral', group: 'Maths', label: '∫', title: 'Integral (from…to)', code: '\\int_{|}^{} \\, \\mathrm{d}x', math: true },
  { id: 'times', group: 'Maths', label: '×', title: 'Times', code: '\\times ', math: true },
  { id: 'le', group: 'Maths', label: '≤', title: 'Less than or equal to', code: '\\le ', math: true },
  { id: 'ge', group: 'Maths', label: '≥', title: 'Greater than or equal to', code: '\\ge ', math: true },
  { id: 'approx', group: 'Maths', label: '≈', title: 'Approximately', code: '\\approx ', math: true },
  { id: 'pi', group: 'Maths', label: 'π', title: 'Pi', code: '\\pi ', math: true },
  { id: 'theta', group: 'Maths', label: 'θ', title: 'Theta', code: '\\theta ', math: true },
  { id: 'degree', group: 'Maths', label: '°', title: 'Degrees', code: '^{\\circ}', math: true },
  { id: 'text', group: 'Maths', label: 'units', title: 'Units or words in maths (upright)', code: '\\text{|}', math: true },
  // Chemistry
  { id: 'formula', group: 'Chemistry', label: 'H₂O', title: 'Chemical formula: numbers become subscripts', code: '\\ce{|}', math: true },
  { id: 'reaction', group: 'Chemistry', label: '→', title: 'Reaction', code: '\\ce{| -> }', math: true },
  { id: 'equilibrium', group: 'Chemistry', label: '⇌', title: 'Equilibrium', code: '\\ce{| <=> }', math: true },
  { id: 'deltaH', group: 'Chemistry', label: 'ΔH', title: 'Enthalpy change', code: '\\Delta H = |\\ \\text{kJ mol}^{-1}', math: true },
  { id: 'delta', group: 'Chemistry', label: 'Δ', title: 'Delta', code: '\\Delta ', math: true },
  { id: 'display', group: 'Layout', label: '$$', title: 'Equation on its own line', code: '\n$$|$$\n', math: false },
]

/** Whether position `at` in `text` is inside maths: an odd number of unescaped $ before it. */
export function insideMath(text, at) {
  // \$ is a dollar sign, not maths; $$ opens or closes a displayed equation like one $.
  const before = String(text || '').slice(0, at).replace(/\\\$/g, '').replace(/\$\$/g, '$')
  return ((before.match(/\$/g) || []).length % 2) === 1
}

/**
 * The text with `snippet` inserted over the selection start…end, and where the
 * cursor goes: the selection fills the snippet's slot; outside maths a maths
 * snippet is wrapped in $…$.
 */
export function insertSnippet(value, start, end, snippet) {
  const text = String(value || '')
  const sel = text.slice(start, end)
  const [head, tail = ''] = snippet.code.split('|')
  const hasSlot = snippet.code.includes('|')
  const wrap = snippet.math && !insideMath(text, start)
  const open = wrap ? '$' : ''
  const close = wrap ? '$' : ''
  const inserted = `${open}${head}${sel}${hasSlot ? tail : ''}${close}`
  const caret = start + open.length + head.length + sel.length
  return { value: text.slice(0, start) + inserted + text.slice(end), caret }
}
