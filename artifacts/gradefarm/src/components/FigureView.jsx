// Draws a maths figure from a structured spec (stored as question.diagram.figure),
// so shapes are to scale, labels sit in the right place and both themes work.
// The AI describes WHAT to draw; this file decides HOW. Three kinds:
//
//   { type: 'geometry',
//     points:  { A: [x, y], ... }                       // maths coords, y up, any unit
//     polygons: [{ vertices: ['A','B','C'] }],
//     segments: [{ from: 'A', to: 'D', dashed: true }],  // heights, diagonals
//     sideLabels: [{ from: 'A', to: 'B', text: '8 cm' }],
//     angles: [{ at: 'B', from: 'A', to: 'C', text: '35°' } | { ..., right: true }],
//     circles: [{ center: 'O', radius: 5, label: 'r = 5 cm' }],
//     showPointNames: true, hiddenPoints: ['D'] }   // hide helper point names
//   { type: 'number_line', min, max, step, marks: [{ value, label, open }], jumps: [{ from, to, label }] }
//   { type: 'bar_chart', title, xLabel, yLabel, bars: [{ label, value }] }

import { THEMES } from '../lib/theme'

const GOLD = '#f1be43'
const FONT = "'Plus Jakarta Sans', sans-serif"
const MAX_ITEMS = 40

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const list = (v) => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : [])
const str = (v) => (v == null ? '' : String(v).slice(0, 40))

function fmt(n) {
  if (Number.isInteger(n)) return String(n)
  return String(Math.round(n * 1000) / 1000)
}

// Text with a halo in the background colour so labels stay readable over lines.
function Label({ x, y, children, c, size = 13, anchor = 'middle', weight = 600, fill }) {
  return (
    <text x={x} y={y} textAnchor={anchor} dominantBaseline="central" fontFamily={FONT} fontSize={size} fontWeight={weight}
      fill={fill || c.text} stroke={c.bg} strokeWidth={4} strokeLinejoin="round" paintOrder="stroke">
      {children}
    </text>
  )
}

function Geometry({ fig, c }) {
  const pts = {}
  for (const [name, p] of Object.entries(fig.points || {}).slice(0, MAX_ITEMS)) {
    if (Array.isArray(p) && num(p[0]) != null && num(p[1]) != null) pts[name] = [p[0], p[1]]
  }
  const circles = list(fig.circles).filter(ci => pts[ci?.center] && num(ci?.radius) > 0)
  const names = Object.keys(pts)
  if (names.length === 0) return null

  // Bounding box of everything drawn, in maths units.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  const grow = (x, y) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  names.forEach(n => grow(...pts[n]))
  circles.forEach(ci => { const [x, y] = pts[ci.center]; grow(x - ci.radius, y - ci.radius); grow(x + ci.radius, y + ci.radius) })
  const w = Math.max(maxX - minX, 1e-6), h = Math.max(maxY - minY, 1e-6)
  const PAD = 44
  const scale = Math.min(360 / w, 230 / h)
  const W = w * scale + PAD * 2, H = h * scale + PAD * 2
  const P = (n) => [PAD + (pts[n][0] - minX) * scale, PAD + (maxY - pts[n][1]) * scale]

  // Labels are pushed away from the middle of the figure.
  const centre = names.reduce((a, n) => { const [x, y] = P(n); return [a[0] + x / names.length, a[1] + y / names.length] }, [0, 0])
  const away = (x, y, d) => {
    const dx = x - centre[0], dy = y - centre[1], len = Math.hypot(dx, dy) || 1
    return [x + (dx / len) * d, y + (dy / len) * d]
  }

  const polygons = list(fig.polygons).map(p => list(p?.vertices).filter(v => pts[v])).filter(v => v.length >= 2)
  const segments = list(fig.segments).filter(s => pts[s?.from] && pts[s?.to])

  // Every drawn line, to keep labels off lines that cross a label's spot.
  const lines = [
    ...polygons.flatMap(v => v.map((n, i) => [n, v[(i + 1) % v.length]])),
    ...segments.map(s => [s.from, s.to]),
  ]
  const nearOtherLine = (x, y, a, b) => lines.some(([p, q]) => {
    if ((p === a && q === b) || (p === b && q === a)) return false
    const [px, py] = P(p), [qx, qy] = P(q)
    const dx = qx - px, dy = qy - py, len2 = dx * dx + dy * dy || 1
    const k = Math.max(0, Math.min(1, ((x - px) * dx + (y - py) * dy) / len2))
    return Math.hypot(x - (px + k * dx), y - (py + k * dy)) < 14
  })

  const sideLabels = list(fig.sideLabels).filter(s => pts[s?.from] && pts[s?.to] && s.text != null).map((s, i) => {
    const [x1, y1] = P(s.from), [x2, y2] = P(s.to)
    let mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    // Another line crosses the midpoint (e.g. a kite's diagonals): slide along.
    if (nearOtherLine(mx, my, s.from, s.to)) { mx = x1 + (x2 - x1) * 0.3; my = y1 + (y2 - y1) * 0.3 }
    let nx = -(y2 - y1), ny = x2 - x1
    const len = Math.hypot(nx, ny) || 1
    nx /= len; ny /= len
    // Point the normal away from the figure's centre.
    if ((mx - centre[0]) * nx + (my - centre[1]) * ny < 0) { nx = -nx; ny = -ny }
    // Outside the figure first; flip sides if that spot is on another line
    // (e.g. a height drawn inside a trapezium, next to a slanted side).
    const tw = str(s.text).length * 8 // rough label width at 15px
    const probe = (k) => {
      const sideways = Math.abs(nx) > 0.7
      const cx = mx + nx * k * (sideways ? 9 + tw / 2 : 16), cy = my + ny * k * (sideways ? 9 : 16)
      return [-tw / 2, 0, tw / 2].some(dx => nearOtherLine(cx + dx, cy, s.from, s.to))
    }
    if (probe(1) && !probe(-1)) { nx = -nx; ny = -ny }
    // On steep edges anchor the text at its near end so it never sits over the line.
    const anchor = Math.abs(nx) > 0.7 ? (nx > 0 ? 'start' : 'end') : 'middle'
    const d = anchor === 'middle' ? 16 : 9
    return <Label key={`s${i}`} c={c} x={mx + nx * d} y={my + ny * d} anchor={anchor} size={15}>{str(s.text)}</Label>
  })

  const angles = list(fig.angles).filter(a => pts[a?.at] && pts[a?.from] && pts[a?.to]).map((a, i) => {
    const [bx, by] = P(a.at), [ax, ay] = P(a.from), [cx, cy] = P(a.to)
    let ux = ax - bx, uy = ay - by, vx = cx - bx, vy = cy - by
    const lu = Math.hypot(ux, uy) || 1, lv = Math.hypot(vx, vy) || 1
    ux /= lu; uy /= lu; vx /= lv; vy /= lv
    if (a.right) {
      const s = 12
      return <path key={`a${i}`} d={`M ${bx + ux * s} ${by + uy * s} L ${bx + (ux + vx) * s} ${by + (uy + vy) * s} L ${bx + vx * s} ${by + vy * s}`} fill="none" stroke={c.stroke} strokeWidth={1.5} />
    }
    const r = 22
    const sweep = ux * vy - uy * vx > 0 ? 1 : 0
    let bxs = ux + vx, bys = uy + vy
    const lb = Math.hypot(bxs, bys) || 1
    bxs /= lb; bys /= lb
    return (
      <g key={`a${i}`}>
        <path d={`M ${bx + ux * r} ${by + uy * r} A ${r} ${r} 0 0 ${sweep} ${bx + vx * r} ${by + vy * r}`} fill="none" stroke={GOLD} strokeWidth={1.75} />
        {a.text != null && <Label c={c} x={bx + bxs * (r + 16)} y={by + bys * (r + 16)} size={14} fill={c.accentText}>{str(a.text)}</Label>}
      </g>
    )
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 300 }} role="img" aria-label={fig.caption || 'Figure'}>
      {polygons.map((v, i) => (
        <polygon key={`p${i}`} points={v.map(n => P(n).join(',')).join(' ')} fill={c.fill} stroke={c.stroke} strokeWidth={2} strokeLinejoin="round" />
      ))}
      {segments.map((s, i) => {
        const [x1, y1] = P(s.from), [x2, y2] = P(s.to)
        return <line key={`g${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.stroke} strokeWidth={1.75} strokeDasharray={s.dashed ? '5 4' : undefined} />
      })}
      {circles.map((ci, i) => {
        const [x, y] = P(ci.center), r = ci.radius * scale
        return (
          <g key={`c${i}`}>
            <circle cx={x} cy={y} r={r} fill={c.fill} stroke={c.stroke} strokeWidth={2} />
            {ci.label != null && <>
              <line x1={x} y1={y} x2={x + r} y2={y} stroke={c.stroke} strokeWidth={1.5} strokeDasharray="4 3" />
              <circle cx={x} cy={y} r={2.5} fill={c.stroke} />
              <Label c={c} x={x + r / 2} y={y - 14} size={15}>{str(ci.label)}</Label>
            </>}
          </g>
        )
      })}
      {angles}
      {sideLabels}
      {fig.showPointNames !== false && names.filter(n => !list(fig.hiddenPoints).includes(n)).map(n => {
        const [x, y] = P(n)
        const [lx, ly] = away(x, y, 15)
        return <Label key={`n${n}`} c={c} x={lx} y={ly} size={14} weight={700} fill={c.muted}>{n.length <= 3 ? n : ''}</Label>
      })}
    </svg>
  )
}

function NumberLine({ fig, c }) {
  const min = num(fig.min), max = num(fig.max)
  if (min == null || max == null || max <= min) return null
  let step = num(fig.step) > 0 ? fig.step : (max - min) / 10
  while ((max - min) / step > 24) step *= 2
  const W = 460, H = 116, L = 30, R = W - 30, Y = 68
  const X = (v) => L + ((v - min) / (max - min)) * (R - L)
  const ticks = []
  for (let v = min, i = 0; v <= max + step / 1000 && i < 60; v += step, i++) ticks.push(Math.round(v * 1e6) / 1e6)
  const marks = list(fig.marks).filter(m => num(m?.value) != null && m.value >= min && m.value <= max)
  const jumps = list(fig.jumps).filter(j => num(j?.from) != null && num(j?.to) != null)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 160 }} role="img" aria-label={fig.caption || 'Number line'}>
      <line x1={L - 14} y1={Y} x2={R + 14} y2={Y} stroke={c.stroke} strokeWidth={2} />
      <path d={`M ${R + 14} ${Y} l -8 -5 v 10 Z M ${L - 14} ${Y} l 8 -5 v 10 Z`} fill={c.stroke} />
      {ticks.map(v => (
        <g key={v}>
          <line x1={X(v)} y1={Y - 6} x2={X(v)} y2={Y + 6} stroke={c.stroke} strokeWidth={1.5} />
          <Label c={c} x={X(v)} y={Y + 22} size={13} weight={500} fill={c.muted}>{fmt(v)}</Label>
        </g>
      ))}
      {jumps.map((j, i) => {
        const x1 = X(j.from), x2 = X(j.to), mid = (x1 + x2) / 2, top = Y - 30
        return (
          <g key={`j${i}`}>
            <path d={`M ${x1} ${Y - 4} Q ${mid} ${top - 10} ${x2} ${Y - 4}`} fill="none" stroke={GOLD} strokeWidth={1.75} />
            {j.label != null && <Label c={c} x={mid} y={top - 10} size={13} fill={c.accentText}>{str(j.label)}</Label>}
          </g>
        )
      })}
      {marks.map((m, i) => (
        <g key={`m${i}`}>
          <circle cx={X(m.value)} cy={Y} r={6} fill={m.open ? c.bg : GOLD} stroke={GOLD} strokeWidth={2} />
          {m.label != null && <Label c={c} x={X(m.value)} y={Y - 20} size={14} weight={700}>{str(m.label)}</Label>}
        </g>
      ))}
    </svg>
  )
}

function BarChart({ fig, c }) {
  const bars = list(fig.bars).filter(b => num(b?.value) != null).slice(0, 12)
  if (bars.length === 0) return null
  const maxV = Math.max(...bars.map(b => b.value), 0) || 1
  const rawStep = maxV / 5
  const mag = 10 ** Math.floor(Math.log10(rawStep))
  const stepV = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= rawStep) || rawStep
  const top = Math.ceil(maxV / stepV) * stepV
  const W = 460, H = 260, L = 52, R = W - 16, T = fig.title ? 34 : 16, B = H - 46
  const Y = (v) => B - (v / top) * (B - T)
  const slot = (R - L) / bars.length
  const gridVals = []
  for (let v = 0; v <= top + 1e-9; v += stepV) gridVals.push(Math.round(v * 1e6) / 1e6)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 300 }} role="img" aria-label={fig.title || fig.caption || 'Bar chart'}>
      {fig.title && <Label c={c} x={W / 2} y={14} size={14} weight={700}>{String(fig.title).slice(0, 60)}</Label>}
      {gridVals.map(v => (
        <g key={v}>
          <line x1={L} y1={Y(v)} x2={R} y2={Y(v)} stroke={c.grid} strokeWidth={1} />
          <Label c={c} x={L - 8} y={Y(v)} size={12} weight={500} anchor="end" fill={c.muted}>{fmt(v)}</Label>
        </g>
      ))}
      {bars.map((b, i) => {
        const bw = Math.min(slot * 0.62, 56), x = L + slot * i + (slot - bw) / 2
        return (
          <g key={i}>
            <rect x={x} y={Y(Math.max(b.value, 0))} width={bw} height={B - Y(Math.max(b.value, 0))} rx={3} fill={GOLD} opacity={0.85} />
            <Label c={c} x={x + bw / 2} y={B + 15} size={12} weight={600}>{str(b.label)}</Label>
          </g>
        )
      })}
      <line x1={L} y1={B} x2={R} y2={B} stroke={c.stroke} strokeWidth={1.5} />
      {fig.xLabel && <Label c={c} x={(L + R) / 2} y={H - 10} size={11} weight={600} fill={c.muted}>{str(fig.xLabel)}</Label>}
      {fig.yLabel && (
        <text x={14} y={(T + B) / 2} transform={`rotate(-90 14 ${(T + B) / 2})`} textAnchor="middle" dominantBaseline="central" fontFamily={FONT} fontSize={11} fontWeight={600} fill={c.muted}>{str(fig.yLabel)}</text>
      )}
    </svg>
  )
}

/** True when a spec has something FigureView can draw. */
export function isDrawableFigure(fig) {
  return !!fig && typeof fig === 'object' && ['geometry', 'number_line', 'bar_chart'].includes(fig.type)
}

export default function FigureView({ figure, theme = 'dark' }) {
  if (!isDrawableFigure(figure)) return null
  const t = THEMES[theme] || THEMES.dark
  const light = theme === 'light'
  const c = {
    bg: t.bgSubtle,
    text: t.text,
    muted: t.textMuted,
    stroke: light ? '#334155' : '#cbd5e1',
    grid: t.border,
    fill: light ? '#fff8e6' : 'rgba(241,190,67,0.08)',
    accentText: t.goldText,
  }
  if (figure.type === 'geometry') return <Geometry fig={figure} c={c} />
  if (figure.type === 'number_line') return <NumberLine fig={figure} c={c} />
  return <BarChart fig={figure} c={c} />
}
