// Titan's Advice: finding the annotated words on screen and placing the
// handwritten notes so they don't overlap. The drawing is in TitanAdvice.jsx.

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim()

/** Rectangles (one per line) covering `quote` inside `container`, or [] when it isn't there. */
export function findQuoteRects(container, quote) {
  if (!container || !quote) return []
  if (quote.startsWith('$')) {
    const tex = squash(quote.replace(/^\$+|\$+$/g, ''))
    const el = [...container.querySelectorAll('[data-tex]')].find(e => squash(e.getAttribute('data-tex')) === tex)
    return el ? [el.getBoundingClientRect()] : []
  }
  // Plain words: search the text outside maths, across text nodes.
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('[data-tex], .katex') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  const nodes = []
  let text = ''
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n, start: text.length })
    text += n.nodeValue
  }
  const at = text.indexOf(quote)
  if (at < 0) return []
  const locate = (offset) => {
    for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i].start <= offset) return { node: nodes[i].node, offset: offset - nodes[i].start }
    return null
  }
  const a = locate(at), b = locate(at + quote.length)
  if (!a || !b) return []
  const range = document.createRange()
  range.setStart(a.node, a.offset)
  range.setEnd(b.node, Math.min(b.offset, b.node.nodeValue.length))
  return mergeLineRects([...range.getClientRects()])
}

/**
 * One rectangle per line of what's actually drawn in `container`: its words
 * and its maths. (A Range over the whole container also returns KaTeX's
 * invisible sizing boxes, which sit above the maths and look like extra lines.)
 */
export function textLineRects(container) {
  if (!container) return []
  const rects = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('[data-tex], .katex') || !n.nodeValue.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
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

/** Rough size of a handwritten note at the given font size. */
export function noteSize(text, size = 20) {
  return { w: Math.ceil(String(text).length * size * 0.46) + 10, h: Math.ceil(size * 1.15) }
}

const overlaps = (a, b, gap = 0) =>
  a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y

// Clear space kept between a note and any words (or another note), in pixels.
// No overlap is allowed at all: a note that only just fits at one zoom level
// would sit on the words at the next.
export const NOTE_GAP = 3
// The longest gap between a note and its target: further away, the arrow runs
// along the line and the note reads as belonging to something else.
export const MAX_REACH = 120

/**
 * Place each note near its target: just above it where there's room, else
 * just below, at the free spot closest to the target horizontally, so the
 * arrows stay short. targets: [{ x, y, w, h, nw, nh, rects? }] in the
 * container's coordinates (nw/nh: the note's size; rects: every line the
 * quote covers, with its pen mark; lines: every line of the question's text,
 * which notes keep off too); returns [{ x, y, above, fits }] (fits: false
 * when there was no clear spot for it).
 */
export function layoutNotes(targets, width, lines = []) {
  const placed = []
  const avoid = targets.map(t => t.rects?.length ? t.rects : [{ x: t.x, y: t.y, w: t.w, h: t.h }])
  const clampX = (x, w) => Math.max(0, Math.min(x, Math.max(0, width - w)))
  return targets.map((t, i) => {
    const words = [...avoid.flat(), ...lines]
    const free = (box) => box.y >= 0
      && !placed.some(p => overlaps(p, box, NOTE_GAP + 3))
      && !words.some(o => overlaps(o, box, NOTE_GAP))
    const reach = (x) => Math.max(0, x - (t.x + t.w), t.x - (x + t.nw))
    const xs = [t.x, t.x + t.w / 2 - t.nw / 2, t.x + t.w - t.nw]
    for (const p of placed) xs.push(p.x + p.w + 12, p.x - t.nw - 12)
    const centre = t.x + t.w / 2
    const bottom = Math.max(...avoid[i].map(r => r.y + r.h))
    const tries = []
    for (const [y, above] of [[t.y - t.nh - NOTE_GAP - 1, true], [bottom + NOTE_GAP + 1, false]]) {
      for (const x0 of xs) {
        const x = clampX(x0, t.nw)
        if (reach(x) > MAX_REACH) continue
        tries.push({ x, y, above, cost: Math.abs(x + t.nw / 2 - centre) + (above ? 0 : 40) })
      }
    }
    tries.sort((a, b) => a.cost - b.cost)
    const pick = tries.find(c => free({ x: c.x, y: c.y, w: t.nw, h: t.nh }))
    // No clear spot (a crowded line, a narrow screen): the caller lists it
    // under the question instead of writing it over the words.
    if (!pick) return { x: t.x, y: t.y, above: true, fits: false }
    placed.push({ x: pick.x, y: pick.y, w: t.nw, h: t.nh })
    return { x: pick.x, y: pick.y, above: pick.above, fits: true }
  })
}

/**
 * A wobbly hand-drawn path, deterministic for a given seed, drawn in a w × h
 * pixel box (the wobble is in pixels, so a long box stays tight to its text).
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
