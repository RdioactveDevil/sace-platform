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
