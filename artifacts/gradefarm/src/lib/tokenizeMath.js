/**
 * Deterministic LaTeX delimiter tokenizer.
 *
 * Splits a string into an ordered list of text / math tokens by pairing `$`
 * delimiters left-to-right. This is the single source of truth for delimiter
 * parsing used by every math renderer in the app, so explanations can never
 * "desync" (where prose between equations gets captured as math and the real
 * math leaks out as literal text).
 *
 * Rules (pandoc / remark-math style — handles real math AND real currency):
 *   - `$$...$$`  → display math, paired in order.
 *   - `$...$`    → inline math. An opening `$` must be followed by a non-space
 *                  character; a closing `$` must be preceded by a non-space
 *                  character and NOT be immediately followed by a digit. This
 *                  lets `$92 = 8 + (n-1) \times 6$` render as math while
 *                  `it costs $5 and $10` stays as plain currency text.
 *   - `\$`       → a literal, escaped dollar sign.
 *   - Inline math does not span newlines.
 *
 * @param {string} text
 * @returns {Array<{type:'text', content:string} | {type:'math', display:boolean, content:string}>}
 */
export function tokenizeMath(text) {
  const tokens = []
  if (!text || typeof text !== 'string') return tokens

  const n = text.length
  let buf = ''
  let i = 0

  const flushText = () => {
    if (buf) {
      tokens.push({ type: 'text', content: buf })
      buf = ''
    }
  }

  const isSpace = (c) => c === undefined || /\s/.test(c)
  const isDigit = (c) => c !== undefined && c >= '0' && c <= '9'

  while (i < n) {
    const ch = text[i]

    // Escaped dollar → literal `$`
    if (ch === '\\' && text[i + 1] === '$') {
      buf += '$'
      i += 2
      continue
    }

    if (ch === '$') {
      // Display math: $$ ... $$
      if (text[i + 1] === '$') {
        const end = text.indexOf('$$', i + 2)
        if (end !== -1) {
          flushText()
          tokens.push({ type: 'math', display: true, content: text.slice(i + 2, end) })
          i = end + 2
          continue
        }
        // No closing $$ → treat both as literal characters
        buf += '$$'
        i += 2
        continue
      }

      // Inline math: opening `$` must be followed by a non-space character
      const next = text[i + 1]
      if (next !== undefined && next !== '$' && !isSpace(next)) {
        let j = i + 1
        let close = -1
        while (j < n) {
          if (text[j] === '\\' && text[j + 1] === '$') {
            j += 2
            continue
          }
          if (text[j] === '\n') break // inline math doesn't span newlines
          if (text[j] === '$') {
            const prev = text[j - 1]
            const after = text[j + 1]
            // Valid close: preceded by non-space and not followed by a digit
            if (!isSpace(prev) && !isDigit(after)) {
              close = j
              break
            }
          }
          j++
        }
        if (close !== -1) {
          flushText()
          tokens.push({ type: 'math', display: false, content: text.slice(i + 1, close) })
          i = close + 1
          continue
        }
      }

      // Not a valid delimiter → literal dollar sign
      buf += '$'
      i += 1
      continue
    }

    buf += ch
    i += 1
  }

  flushText()
  return tokens
}

/**
 * Apply `fn` only to the text portions that fall outside `$...$` / `$$...$$`
 * math regions, leaving the math (and its delimiters) untouched.
 *
 * @param {string} s
 * @param {(segment:string) => string} fn
 * @returns {string}
 */
export function applyOutsideMath(s, fn) {
  return tokenizeMath(s)
    .map((t) =>
      t.type === 'text'
        ? fn(t.content)
        : t.display
          ? `$$${t.content}$$`
          : `$${t.content}$`,
    )
    .join('')
}

export default tokenizeMath
