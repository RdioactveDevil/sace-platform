// Titan's Advice: which words of the question each pen mark goes on, and
// which side of those words its handwritten note sits. The drawing is in
// TitanAdvice.jsx.
//
// Nothing here positions anything on screen. Each quoted phrase is wrapped in
// its own element in the question's text (markParts), and its pen stroke is
// that element's background, so the browser draws it on exactly those words at
// any zoom, width or font. Each note is placed inside the first or last word of
// its phrase (its anchor), so it moves with the words too. The only thing
// measured is which side of its words a note fits on (placeNotes), and a wrong
// guess there can only ever put a note in the list under the question.

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim()
// Stands in for maths (and a table between two blocks of text) in the
// searchable text: no quote of plain words can match across it.
const OBJECT = '￼'

// The searchable text of one parsed part. An auto-detected chemical formula
// (\ce{CO2}) reads as its formula, so "of CO2 gas" is still found.
function partText(p) {
  if (p?.type === 'text') return p.content
  const ce = p?.type === 'math' && /^\\ce\{([^{}\s]+)\}$/.exec(String(p.content).trim())
  return ce ? ce[1] : OBJECT
}

const isWordChar = (ch) => !!ch && /[\p{L}\p{N}]/u.test(ch)

/**
 * Split the question's parsed parts (MathText's tokens: { type: 'text' | 'math'
 * | 'break', content }) so each quote's words are parts of their own, tagged
 * { mark: i }, and the first and last word of each quote are tagged
 * { anchor: 'start' | 'end' } ('both' when it's one word). A quote that is one
 * whole maths segment ("$...$") marks that segment. Whitespace and **bold**
 * markers don't have to match exactly. A quote that can't be found, or only
 * overlapping an earlier one, is left out: found[i] is false.
 */
export function markParts(parts, quotes) {
  const list = Array.isArray(parts) ? parts : []
  const qs = Array.isArray(quotes) ? quotes : []
  // The parts' text with whitespace collapsed, and where each character came from.
  let text = ''
  const from = []
  const span = list.map(() => [0, 0])
  list.forEach((p, k) => {
    const s = partText(p)
    span[k][0] = from.length
    for (let off = 0; off < s.length; off++) {
      const space = /\s/.test(s[off])
      if (space && text.endsWith(' ')) continue
      text += space ? ' ' : s[off]
      from.push({ k, off, len: s.length, text: p.type === 'text' })
    }
    span[k][1] = from.length
  })
  const taken = []
  const free = (a, b) => !taken.some(([s, e]) => a < e && b > s)
  const found = qs.map(() => false)
  const owner = list.map((p) => (p.type === 'text' ? new Array(p.content.length).fill(-1) : -1))

  qs.forEach((quote, i) => {
    const raw = String(quote || '').trim()
    let range = null
    if (raw.startsWith('$')) {
      const tex = squash(raw.replace(/^\$+|\$+$/g, ''))
      const k = list.findIndex((p, k) => p.type === 'math' && squash(p.content) === tex && free(...span[k]))
      if (k >= 0) range = span[k]
    } else {
      const q = squash(raw.replace(/\*\*/g, ''))
      if (q && !q.includes(OBJECT)) {
        // Whole words first ("the air", not the end of "other air"), then anywhere.
        const hits = []
        for (let at = text.indexOf(q); at >= 0; at = text.indexOf(q, at + 1)) {
          const end = at + q.length
          const a = from[at], b = from[end - 1]
          // A match can't start or end partway through a formula.
          if ((!a.text && a.off !== 0) || (!b.text && b.off !== b.len - 1) || !free(at, end)) continue
          hits.push({ at, end, whole: !isWordChar(text[at - 1]) && !isWordChar(text[end]) })
        }
        const hit = hits.find(h => h.whole) || hits[0]
        if (hit) range = [hit.at, hit.end]
      }
    }
    if (!range || range[1] <= range[0]) return
    taken.push(range)
    found[i] = true
    const a = from[range[0]], b = from[range[1] - 1]
    for (let k = a.k; k <= b.k; k++) {
      if (!Array.isArray(owner[k])) { owner[k] = i; continue }
      const lo = k === a.k ? a.off : 0
      const hi = k === b.k ? b.off : owner[k].length - 1
      for (let o = lo; o <= hi; o++) owner[k][o] = i
    }
  })

  // Cut the text parts where a mark starts or ends.
  const out = []
  list.forEach((p, k) => {
    if (!Array.isArray(owner[k])) { out.push(owner[k] >= 0 ? { ...p, mark: owner[k] } : p); return }
    let start = 0
    for (let o = 1; o <= p.content.length; o++) {
      if (o < p.content.length && owner[k][o] === owner[k][start]) continue
      const piece = { ...p, content: p.content.slice(start, o) }
      if (owner[k][start] >= 0) piece.mark = owner[k][start]
      out.push(piece)
      start = o
    }
  })

  // Split off each mark's first and last word: the notes are anchored to them.
  const firstOf = new Map(), lastOf = new Map()
  out.forEach((p, j) => {
    if (p.mark === undefined) return
    if (!firstOf.has(p.mark)) firstOf.set(p.mark, j)
    lastOf.set(p.mark, j)
  })
  const result = []
  out.forEach((p, j) => {
    const first = p.mark !== undefined && firstOf.get(p.mark) === j
    const last = p.mark !== undefined && lastOf.get(p.mark) === j
    if (!first && !last) { result.push(p); return }
    if (p.type !== 'text') { result.push({ ...p, anchor: first && last ? 'both' : first ? 'start' : 'end' }); return }
    const c = p.content
    const headEnd = first ? c.search(/\s/) : -1
    const tailStart = last ? c.search(/\S+$/) : -1
    if (first && last && headEnd < 0) { result.push({ ...p, anchor: 'both' }); return }
    const cuts = []
    if (first) cuts.push([0, headEnd < 0 ? c.length : headEnd, 'start'])
    if (last && tailStart >= 0) cuts.push([tailStart, c.length, 'end'])
    let at = 0
    for (const [s, e, anchor] of cuts) {
      if (s > at) result.push({ ...p, content: c.slice(at, s) })
      if (e > s) result.push({ ...p, content: c.slice(s, e), anchor })
      at = Math.max(at, e)
    }
    if (at < c.length) result.push({ ...p, content: c.slice(at) })
  })
  return { parts: result, found }
}

/**
 * One rectangle per line of what's actually drawn in `container`: its words
 * and its maths, not counting the handwritten notes. (A Range over the whole
 * container also returns KaTeX's invisible sizing boxes, which sit above the
 * maths and look like extra lines.)
 */
export function textLineRects(container) {
  if (!container) return []
  const rects = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('[data-tex], .katex, [data-tm-note]') || !n.nodeValue.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  const range = document.createRange()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    range.selectNodeContents(n)
    rects.push(...range.getClientRects())
  }
  container.querySelectorAll('[data-tex]').forEach(el => rects.push(el.getBoundingClientRect()))
  return mergeLineRects(rects, { overlap: true })
}

/** Join the per-glyph-run rectangles a Range gives into one rectangle per line. */
export function mergeLineRects(rects, { overlap = false } = {}) {
  const lines = []
  // overlap: join rectangles that share most of their height (words and taller maths on one line).
  const sameLine = overlap
    ? (l, r) => Math.min(l.bottom, r.top + r.height) - Math.max(l.top, r.top) > Math.min(l.bottom - l.top, r.height) / 2
    : (l, r) => Math.abs(l.top - r.top) < r.height / 2
  for (const r of rects) {
    if (!r.width || !r.height) continue
    const line = lines.find(l => sameLine(l, r))
    if (line) {
      line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.left + r.width)
      line.top = Math.min(line.top, r.top); line.bottom = Math.max(line.bottom, r.top + r.height)
    } else lines.push({ left: r.left, right: r.left + r.width, top: r.top, bottom: r.top + r.height })
  }
  return lines.map(l => ({ left: l.left, top: l.top, width: l.right - l.left, height: l.bottom - l.top }))
}

const hits = (a, b, gx, gy) =>
  a.x < b.x + b.w + gx && a.x + a.w + gx > b.x && a.y < b.y + b.h + gy && a.y + a.h + gy > b.y
const sameRow = (a, b) => a.y < b.y + b.h && a.y + a.h > b.y

/**
 * Which side of its words each note goes: just above the line its phrase is
 * on (else just below it), over the phrase's own words, clear of every word,
 * every pen mark and every note already placed. All in one coordinate system
 * (the screen's): notes: [{ w, h, anchors: { start, end }, frags } | null],
 * where anchors are the rects of the phrase's first and last word and frags
 * the phrase's rect on each line it covers; obstacles: the question's lines of
 * text and its pen marks; bounds: { left, top, right, bottom }, where notes may
 * go. Returns, per note, { anchor: 'start' | 'end', x, y } (its top-left), or
 * null when there's no clear spot, so it's listed under the question instead.
 */
export function placeNotes(notes, obstacles, bounds, { clear = 3, gap = 10 } = {}) {
  const placed = []
  return (notes || []).map((n) => {
    if (!n || !(n.w > 0) || !(n.h > 0) || n.w > bounds.right - bounds.left) return null
    const tries = []
    const anchors = [['start', n.anchors?.start], ['end', n.anchors?.end]].filter(([, r]) => r)
    anchors.forEach(([which, a], ai) => {
      // The same word anchors both ends of a one-word phrase: try it once.
      if (ai && anchors[0][1].x === a.x && anchors[0][1].y === a.y) return
      // The phrase on this word's line, and everything drawn on that line.
      const frag = (n.frags || []).find(f => sameRow(f, a)) || a
      const row = obstacles.filter(o => sameRow(o, { y: a.y + a.h / 2 - 1, h: 2 }))
      const xs = [frag.x + frag.w / 2 - n.w / 2, frag.x, frag.x + frag.w - n.w]
      for (const p of placed) xs.push(p.x + p.w + gap, p.x - n.w - gap)
      const centre = frag.x + frag.w / 2
      for (const x0 of xs) {
        const x = Math.max(bounds.left, Math.min(x0, bounds.right - n.w))
        // Over its own words, so it's plainly theirs without an arrow.
        const over = Math.min(x + n.w, frag.x + frag.w) - Math.max(x, frag.x)
        if (over < Math.min(24, frag.w / 2)) continue
        const under = row.filter(o => o.x < x + n.w && o.x + o.w > x).concat(frag)
        const top = Math.min(...under.map(o => o.y))
        const bottom = Math.max(...under.map(o => o.y + o.h))
        const cost = Math.abs(x + n.w / 2 - centre) + (which === 'end' ? 15 : 0)
        tries.push({ which, x, y: top - clear - n.h, cost })
        tries.push({ which, x, y: bottom + clear, cost: cost + 40 })
      }
    })
    tries.sort((a, b) => a.cost - b.cost)
    const pick = tries.find(({ x, y }) => {
      const box = { x, y, w: n.w, h: n.h }
      return y >= bounds.top && y + n.h <= bounds.bottom
        && !obstacles.some(o => hits(box, o, 2, clear - 0.5))
        && !placed.some(p => hits(box, p, gap - 0.5, clear - 0.5))
    })
    if (!pick) return null
    placed.push({ x: pick.x, y: pick.y, w: n.w, h: n.h })
    return { anchor: pick.which, x: pick.x, y: pick.y }
  })
}

/**
 * A wobbly hand-drawn path, deterministic for a given seed, drawn in a w × h
 * box.
 */
export function handPath(kind, seed = 1, w = 100, h = 100) {
  let s = (seed * 9301 + 49297) % 233280
  const j = (n = 3) => { s = (s * 9301 + 49297) % 233280; return ((s / 233280) - 0.5) * n }
  const r = (v) => Math.round(v * 10) / 10
  if (kind === 'circle') {
    const X = (u) => r(u * w / 100), Y = (v) => r(v * h / 100)
    return `M${X(52 + j())} ${Y(5 + j())} C${X(82 + j())} ${Y(2 + j())} ${X(98 + j())} ${Y(24 + j())} ${X(96 + j())} ${Y(50 + j())} C${X(94 + j())} ${Y(80 + j())} ${X(72 + j())} ${Y(97 + j())} ${X(46 + j())} ${Y(95 + j())} C${X(18 + j())} ${Y(94 + j())} ${X(3 + j())} ${Y(76 + j())} ${X(5 + j())} ${Y(48 + j())} C${X(7 + j())} ${Y(21 + j())} ${X(26 + j())} ${Y(5 + j())} ${X(60 + j())} ${Y(10 + j())}`
  }
  if (kind === 'box') {
    // Four slightly crooked sides, the last one running a little past the start, as a pen does.
    return `M${r(1 + j(2))} ${r(1 + j(2))} L${r(w - 1 + j(2))} ${r(j(2))} L${r(w + j(2))} ${r(h - 1 + j(2))} L${r(j(2))} ${r(h + j(2))} L${r(2 + j(2))} ${r(-2 + j(1))}`
  }
  // underline: across the box, wavering around mid-height
  const m = h / 2, a = h / 2
  return `M0 ${r(m + j(a))} C${r(w * 0.22)} ${r(m + j(a))} ${r(w * 0.44)} ${r(m + j(a))} ${r(w * 0.64)} ${r(m + j(a))} S${r(w * 0.9)} ${r(m + j(a))} ${r(w)} ${r(m + j(a))}`
}

// How far each kind of mark reaches beyond its words, in px: [above, below, either side].
const REACH = { underline: [0, 7, 2], double_underline: [0, 11, 2], circle: [6, 6, 8], box: [4, 4, 6] }
// The width of a circle's rounded ends and a box's sides, in px: they keep
// their size however long the phrase, so the stroke never cuts into its first
// or last letter (a stretched ellipse would).
const ENDS = { circle: 14, box: 8 }

/**
 * The CSS that draws a pen mark on the element wrapping its words: the stroke
 * is a stretched SVG background, and padding (taken back with negative side
 * margins, so no word moves) gives it room around the words. A phrase that
 * wraps is drawn as one stroke carried on from line to line.
 */
export function penMarkStyle(kind, seed, pen) {
  const k = REACH[kind] ? kind : 'underline'
  const [above, below, side] = REACH[k]
  let s = (seed * 9301 + 49297) % 233280
  const j = (n = 3) => { s = (s * 9301 + 49297) % 233280; return Math.round(((s / 233280) - 0.5) * n * 10) / 10 }
  const stroke = `fill='none' stroke='${pen}' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' vector-effect='non-scaling-stroke'`
  const path = (d, t = '') => `<path d='${d}' ${stroke}${t ? ` transform='${t}'` : ''}/>`
  const url = (viewBox, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}' preserveAspectRatio='none'>${body}</svg>`)}")`
  const room = { padding: `${above}px ${side}px ${below}px`, margin: `0 -${side}px`, backgroundRepeat: 'no-repeat' }
  if (ENDS[k]) {
    // Two ends of fixed width, and the wavering top and bottom stretched between them.
    const E = ENDS[k], T = 5, B = 95
    const [left, right] = k === 'circle'
      ? [`M${E} ${T} C${5 + j()} ${T - 1 + j()} ${1 + j(1)} ${26 + j()} ${1.5 + j(1)} ${50 + j()} C${2 + j(1)} ${74 + j()} ${6 + j()} ${B + 1 + j(2)} ${E} ${B}`,
         `M0 ${B} C${9 + j()} ${B + 1 + j(2)} ${13 + j(1)} ${74 + j()} ${12.5 + j(1)} ${50 + j()} C${12 + j(1)} ${26 + j()} ${8 + j()} ${T - 1 + j()} 0 ${T}`]
      // A box's sides overshoot its corners a little, as a pen does.
      : [`M${3 + j(1.5)} ${T - 3 + j(2)} L${3 + j(1.5)} ${B + 2 + j(2)}`, `M${5 + j(1.5)} ${T - 2 + j(2)} L${5 + j(1.5)} ${B + 3 + j(2)}`]
    const inset = k === 'circle' ? E - 2 : 3
    return {
      ...room,
      backgroundImage: [
        url(`0 0 ${E} 100`, path(left)),
        url(`0 0 ${E} 100`, path(right)),
        url('0 0 100 100', path(`M0 ${T} C33 ${T + j(4)} 66 ${T + j(4)} 100 ${T}`) + path(`M0 ${B} C33 ${B + j(4)} 66 ${B + j(4)} 100 ${B}`)),
      ].join(', '),
      backgroundPosition: 'left center, right center, center',
      backgroundSize: `${E}px 100%, ${E}px 100%, calc(100% - ${2 * inset}px) 100%`,
    }
  }
  const double = k === 'double_underline'
  const body = double
    ? path(handPath('underline', seed, 100, 4), 'translate(0 1)') + path(handPath('underline', seed + 7, 100, 4), 'translate(0 9)')
    : path(handPath('underline', seed, 100, 6), 'translate(0 2)')
  return {
    ...room,
    backgroundImage: url(double ? '0 0 100 14' : '0 0 100 10', body),
    backgroundPosition: 'left bottom',
    backgroundSize: double ? '100% 14px' : '100% 10px',
  }
}
