// Chemistry figures, drawn the way the SACE Chemistry exam draws them:
//
//   { type: 'xy_plot', xLabel, yLabel, xRange: [a, b], yRange: [a, b], xStep?, yStep?,
//     showNumbers: true, grid: true,
//     series: [{ kind: 'points' | 'line' | 'curve', points: [[x, y], ...], label?, dashed?, arrow? }],
//     hlines: [{ y, label?, dashed }], vlines: [{ x, label?, dashed }],
//     arrows: [{ from: [x, y], to: [x, y], text?, both? }], labels: [{ x, y, text }] }
//     (calibration graphs, titration curves, concentration–time, energy profiles)
//   { type: 'tlc_plate', lanes: [{ label, spots: [Rf, ...] }], solventFrontCm?, showRuler? }
//
// Structures (diagram.structures) are drawn on the server from SMILES; see
// StructureList below and api-server/src/lib/chem-figures.ts.

import { chemTextParts } from '../lib/chemText'

const FONT = "'Plus Jakarta Sans', sans-serif"
const MAX = 40

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const list = (v) => (Array.isArray(v) ? v.slice(0, MAX) : [])
const str = (v, n = 40) => (v == null ? '' : String(v).slice(0, n))
const pt = (p) => (Array.isArray(p) && num(p[0]) != null && num(p[1]) != null ? [p[0], p[1]] : null)

function fmt(n) {
  if (Number.isInteger(n)) return String(n)
  return String(Math.round(n * 1000) / 1000)
}

/** A tidy grid step for a range: 1, 2, 2.5 or 5 times a power of ten, about `target` lines. */
function niceStep(span, target = 5) {
  const raw = span / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) || raw
}

function ticks(min, max, step) {
  const out = []
  const first = Math.ceil(min / step - 1e-9) * step
  for (let v = first, i = 0; v <= max + step / 1000 && i < 60; v += step, i++) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

// Labels are split into normal, subscript and superscript pieces (lib/chemText).
function ChemString({ text, size }) {
  const out = []
  chemTextParts(text).forEach(([kind, t], i) => {
    if (kind === 'n') { out.push(<tspan key={i}>{t}</tspan>); return }
    const shift = kind === 'sub' ? size * 0.28 : -size * 0.38
    out.push(<tspan key={i} fontSize={size * 0.72} dy={shift}>{t}</tspan>)
    out.push(<tspan key={`r${i}`} dy={-shift}>{'\u200b'}</tspan>) // back to the baseline
  })
  return out
}

function Text({ x, y, children, c, size = 12, anchor = 'middle', weight = 500, fill, rotate, chem }) {
  return (
    <text x={x} y={y} textAnchor={anchor} dominantBaseline="central" fontFamily={FONT} fontSize={size} fontWeight={weight}
      fill={fill || c.text} stroke={c.bg} strokeWidth={3.5} strokeLinejoin="round" paintOrder="stroke"
      transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}>
      {chem ? <ChemString text={children} size={size} /> : children}
    </text>
  )
}

/**
 * Smooth curve through points that never overshoots them (monotone cubic,
 * Fritsch–Carlson), so a flat stretch stays flat and a peak stays a peak.
 * Points are in screen coordinates and must run left to right.
 */
function smoothPath(p) {
  if (p.length < 3) return `M ${p.map(q => q.join(' ')).join(' L ')}`
  const n = p.length
  const dx = [], m = []
  for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = dx[i] ? (p[i + 1][1] - p[i][1]) / dx[i] : 0 }
  const t = [m[0]]
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2
  t[n - 1] = m[n - 2]
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b
    if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i] }
  }
  let d = `M ${p[0][0]} ${p[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C ${p[i][0] + h} ${p[i][1] + t[i] * h} ${p[i + 1][0] - h} ${p[i + 1][1] - t[i + 1] * h} ${p[i + 1][0]} ${p[i + 1][1]}`
  }
  return d
}

function Arrowhead({ at, from, c, size = 8 }) {
  const ang = Math.atan2(at[1] - from[1], at[0] - from[0])
  const a1 = ang + Math.PI - 0.4, a2 = ang + Math.PI + 0.4
  return <path d={`M ${at[0]} ${at[1]} L ${at[0] + size * Math.cos(a1)} ${at[1] + size * Math.sin(a1)} L ${at[0] + size * Math.cos(a2)} ${at[1] + size * Math.sin(a2)} Z`} fill={c.stroke} />
}

export function XYPlot({ fig, c }) {
  const xr = pt(fig.xRange), yr = pt(fig.yRange)
  if (!xr || !yr || xr[1] <= xr[0] || yr[1] <= yr[0]) return null
  const showNumbers = fig.showNumbers !== false
  const W = 460, H = 310, L = showNumbers ? 60 : 40, R = W - 24, T = 18, B = H - (showNumbers ? 52 : 36)
  const X = (x) => L + ((x - xr[0]) / (xr[1] - xr[0])) * (R - L)
  const Y = (y) => B - ((y - yr[0]) / (yr[1] - yr[0])) * (B - T)
  const xStep = num(fig.xStep) > 0 ? fig.xStep : niceStep(xr[1] - xr[0])
  const yStep = num(fig.yStep) > 0 ? fig.yStep : niceStep(yr[1] - yr[0])
  const xt = ticks(xr[0], xr[1], xStep), yt = ticks(yr[0], yr[1], yStep)
  // Minor grid at a fifth of the step, like exam graph paper.
  const minor = fig.grid !== false
  const xm = minor ? ticks(xr[0], xr[1], xStep / 5) : [], ym = minor ? ticks(yr[0], yr[1], yStep / 5) : []
  const yDecimals = Math.max(0, ...yt.map(v => (String(v).split('.')[1] || '').length))
  const yFmt = (v) => v.toFixed(Math.min(yDecimals, 4))
  const series = list(fig.series)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 360 }} role="img" aria-label={fig.caption || `Graph of ${str(fig.yLabel)} against ${str(fig.xLabel)}`}>
      {xm.map(v => <line key={`xm${v}`} x1={X(v)} y1={T} x2={X(v)} y2={B} stroke={c.grid} strokeWidth={0.5} opacity={0.6} />)}
      {ym.map(v => <line key={`ym${v}`} x1={L} y1={Y(v)} x2={R} y2={Y(v)} stroke={c.grid} strokeWidth={0.5} opacity={0.6} />)}
      {fig.grid !== false && xt.map(v => <line key={`xg${v}`} x1={X(v)} y1={T} x2={X(v)} y2={B} stroke={c.grid} strokeWidth={1} />)}
      {fig.grid !== false && yt.map(v => <line key={`yg${v}`} x1={L} y1={Y(v)} x2={R} y2={Y(v)} stroke={c.grid} strokeWidth={1} />)}
      <line x1={L} y1={B} x2={R} y2={B} stroke={c.stroke} strokeWidth={1.5} />
      <line x1={L} y1={B} x2={L} y2={T} stroke={c.stroke} strokeWidth={1.5} />
      {showNumbers && xt.map(v => <Text key={`xl${v}`} c={c} x={X(v)} y={B + 14} fill={c.muted}>{fmt(v)}</Text>)}
      {showNumbers && yt.map(v => <Text key={`yl${v}`} c={c} x={L - 8} y={Y(v)} anchor="end" fill={c.muted}>{yFmt(v)}</Text>)}
      {fig.xLabel && <Text chem c={c} x={(L + R) / 2} y={H - 12} size={13} weight={600}>{str(fig.xLabel, 60)}</Text>}
      {fig.yLabel && <Text chem c={c} x={14} y={(T + B) / 2} size={13} weight={600} rotate={-90}>{str(fig.yLabel, 60)}</Text>}

      {list(fig.hlines).filter(l => num(l?.y) != null).map((l, i) => (
        <g key={`h${i}`}>
          <line x1={L} y1={Y(l.y)} x2={R} y2={Y(l.y)} stroke={c.stroke} strokeWidth={1.2} strokeDasharray={l.dashed === false ? undefined : '5 4'} />
          {l.label && <Text chem c={c} x={R - 4} y={Y(l.y) - 10} anchor="end" size={12}>{str(l.label)}</Text>}
        </g>
      ))}
      {list(fig.vlines).filter(l => num(l?.x) != null).map((l, i) => (
        <g key={`v${i}`}>
          <line x1={X(l.x)} y1={T} x2={X(l.x)} y2={B} stroke={c.stroke} strokeWidth={1.2} strokeDasharray={l.dashed === false ? undefined : '5 4'} />
          {l.label && <Text chem c={c} x={X(l.x) + 4} y={T + 10} anchor="start" size={12}>{str(l.label)}</Text>}
        </g>
      ))}

      {series.map((s, i) => {
        const p = list(s?.points).map(pt).filter(Boolean).sort((a, b) => (s.kind === 'curve' ? a[0] - b[0] : 0)).map(([x, y]) => [X(x), Y(y)])
        if (!p.length) return null
        if (s.kind === 'points') {
          return <g key={`s${i}`}>{p.map(([x, y], j) => <circle key={j} cx={x} cy={y} r={3.6} fill={c.text} />)}</g>
        }
        if (p.length < 2) return null
        const d = s.kind === 'curve' ? smoothPath(p) : `M ${p.map(q => q.join(' ')).join(' L ')}`
        const end = p[p.length - 1], before = p[p.length - 2]
        return (
          <g key={`s${i}`}>
            <path d={d} fill="none" stroke={c.text} strokeWidth={1.6} strokeDasharray={s.dashed ? '6 4' : undefined} />
            {s.arrow && <Arrowhead at={end} from={before} c={{ stroke: c.text }} />}
            {s.label && <Text chem c={c} x={Math.min(end[0] + 6, R)} y={Math.max(end[1] - 12, T + 6)} anchor={end[0] > R - 80 ? 'end' : 'start'} size={12}>{str(s.label)}</Text>}
          </g>
        )
      })}

      {list(fig.arrows).map((a, i) => {
        const f = pt(a?.from), t = pt(a?.to)
        if (!f || !t) return null
        const p1 = [X(f[0]), Y(f[1])], p2 = [X(t[0]), Y(t[1])]
        return (
          <g key={`a${i}`}>
            <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={c.stroke} strokeWidth={1.3} />
            <Arrowhead at={p2} from={p1} c={c} />
            {a.both && <Arrowhead at={p1} from={p2} c={c} />}
            {a.text && <Text chem c={c} x={(p1[0] + p2[0]) / 2 + 8} y={(p1[1] + p2[1]) / 2} anchor="start" size={13} weight={600}>{str(a.text, 30)}</Text>}
          </g>
        )
      })}
      {list(fig.labels).filter(l => num(l?.x) != null && num(l?.y) != null).map((l, i) => (
        <Text chem key={`l${i}`} c={c} x={X(l.x)} y={Y(l.y)} size={12}>{str(l.text)}</Text>
      ))}
    </svg>
  )
}

export function TLCPlate({ fig, c }) {
  const lanes = list(fig.lanes).slice(0, 6)
  if (!lanes.length) return null
  const laneW = 56, W = Math.max(240, lanes.length * laneW + 140), H = 330
  const plateL = 44, plateR = W - 92, top = 24, bottom = H - 50
  const front = top + 26, origin = bottom - 34
  const Yrf = (rf) => origin - rf * (origin - front)
  const cm = num(fig.solventFrontCm) > 0 ? fig.solventFrontCm : null
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 340 }} role="img" aria-label={fig.caption || 'TLC plate'}>
      <rect x={plateL} y={top} width={plateR - plateL} height={bottom - top} fill={c.fill} stroke={c.stroke} strokeWidth={1.4} />
      <line x1={plateL} y1={front} x2={plateR} y2={front} stroke={c.stroke} strokeWidth={1.2} strokeDasharray="5 4" />
      <Text c={c} x={plateR + 6} y={front} anchor="start" size={11} fill={c.muted}>solvent front</Text>
      <line x1={plateL} y1={origin} x2={plateR} y2={origin} stroke={c.stroke} strokeWidth={1} />
      <Text c={c} x={plateR + 6} y={origin} anchor="start" size={11} fill={c.muted}>origin</Text>
      {lanes.map((lane, i) => {
        const x = plateL + ((i + 0.5) * (plateR - plateL)) / lanes.length
        return (
          <g key={i}>
            <circle cx={x} cy={origin} r={2.2} fill={c.stroke} />
            {list(lane.spots).filter(r => num(r) != null && r > 0 && r < 1).map((rf, j) => (
              <ellipse key={j} cx={x} cy={Yrf(rf)} rx={9} ry={6} fill={c.text} opacity={0.75} />
            ))}
            <Text chem c={c} x={x} y={bottom + 16} size={12} weight={700}>{str(lane.label, 20)}</Text>
          </g>
        )
      })}
      {fig.showRuler && cm && (
        <g>
          {ticks(0, cm, cm > 10 ? 2 : 1).map(v => {
            const y = origin - (v / cm) * (origin - front)
            return (
              <g key={`r${v}`}>
                <line x1={plateL - 10} y1={y} x2={plateL - 2} y2={y} stroke={c.stroke} strokeWidth={1} />
                <Text c={c} x={plateL - 14} y={y} anchor="end" size={10} fill={c.muted}>{fmt(v)}</Text>
              </g>
            )
          })}
          <Text c={c} x={plateL - 24} y={top + 8} size={10} fill={c.muted}>cm</Text>
        </g>
      )}
    </svg>
  )
}

/** Structures drawn on the server (black SVG), recoloured for the theme, with SACE-style bold labels. */
export function StructureList({ structures, color, labelColor }) {
  const items = list(structures).filter(s => s && typeof s.svg === 'string' && /^<svg[\s>]/i.test(s.svg.trim())).slice(0, 4)
  if (!items.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 28px', justifyContent: 'center', alignItems: 'flex-end' }}>
      {items.map((s, i) => {
        const svg = s.svg
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
          .replace(/#000000/gi, color)
        return (
          <figure key={i} style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
            <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt={s.label ? `Structural formula of ${s.label}` : 'Structural formula'}
              style={{ display: 'block', maxWidth: '100%', maxHeight: 220, height: 'auto' }} />
            {s.label && <figcaption style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: labelColor }}>{str(s.label, 80)}</figcaption>}
          </figure>
        )
      })}
    </div>
  )
}

// ── Flow charts ───────────────────────────────────────────────────────────────
//   { type: 'flow_chart', nodes: [{ id, text, kind: 'box' | 'text', row, col }], edges: [{ from, to, label? }] }
// Boxes are substances made in the process; reagents and side products are plain text.

const approxWidth = (text, size) => String(text).length * size * 0.6

export function FlowChart({ fig, c }) {
  const nodes = list(fig.nodes).filter(n => n && n.id && n.text).slice(0, 14)
  if (nodes.length < 2) return null
  const cols = [...new Set(nodes.map(n => n.col | 0))].sort((a, b) => a - b)
  const rows = [...new Set(nodes.map(n => n.row | 0))].sort((a, b) => a - b)
  const COL_W = 176, ROW_H = 80, PAD = 18, SIZE = 13
  const W = cols.length * COL_W + PAD * 2, H = rows.length * ROW_H + PAD
  const at = {}
  for (const n of nodes) {
    const w = Math.min(COL_W - 14, approxWidth(n.text, SIZE) + (n.kind === 'text' ? 8 : 26))
    at[n.id] = { x: PAD + cols.indexOf(n.col | 0) * COL_W + COL_W / 2, y: PAD + rows.indexOf(n.row | 0) * ROW_H + 18, hw: w / 2, hh: n.kind === 'text' ? 10 : 17, n }
  }
  // Where a line from a node's centre towards (dx, dy) leaves its box, plus a small gap.
  const edgePoint = (a, dx, dy, gap) => {
    const len = Math.hypot(dx, dy) || 1
    const t = Math.min(dx ? a.hw / Math.abs(dx) : Infinity, dy ? a.hh / Math.abs(dy) : Infinity)
    return [a.x + dx * t + (dx / len) * gap, a.y + dy * t + (dy / len) * gap]
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 460 }} role="img" aria-label={fig.caption || 'Flow chart'}>
      {list(fig.edges).map((e, i) => {
        const a = at[e?.from], b = at[e?.to]
        if (!a || !b) return null
        const dx = b.x - a.x, dy = b.y - a.y
        const p1 = edgePoint(a, dx, dy, 3), p2 = edgePoint(b, -dx, -dy, 4)
        const vertical = Math.abs(dy) > Math.abs(dx)
        const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
        return (
          <g key={`e${i}`}>
            <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={c.stroke} strokeWidth={1.3} />
            <Arrowhead at={p2} from={p1} c={c} size={7} />
            {e.label && (
              <text x={vertical ? mid[0] + 8 : mid[0]} y={vertical ? mid[1] : mid[1] - 9} textAnchor={vertical ? 'start' : 'middle'} dominantBaseline="central"
                fontFamily={FONT} fontSize={12} fontStyle="italic" fill={c.text} stroke={c.bg} strokeWidth={3.5} paintOrder="stroke">
                <ChemString text={str(e.label, 50)} size={12} />
              </text>
            )}
          </g>
        )
      })}
      {nodes.map(n => {
        const a = at[n.id]
        return (
          <g key={n.id}>
            {n.kind !== 'text' && <rect x={a.x - a.hw} y={a.y - a.hh} width={a.hw * 2} height={a.hh * 2} fill={c.bg} stroke={c.stroke} strokeWidth={1.3} />}
            <Text chem c={c} x={a.x} y={a.y} size={SIZE} weight={500}>{str(n.text, 50)}</Text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Apparatus ────────────────────────────────────────────────────────────────
//   { type: 'apparatus', kind: 'galvanic_cell' | 'electrolytic_cell' | 'titration' | 'reflux',
//     labels: { slot: text }, electronFlow?: 'left_to_right' | 'right_to_left' }
// A label left out is drawn unlabelled (the student may have to name it).

function Lead({ from, to, c }) {
  return <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={c.muted} strokeWidth={0.9} />
}

function Sign({ x, y, sign, c }) {
  if (!sign) return null
  const s = /^[-−]/.test(sign) ? '−' : /^\+/.test(sign) ? '+' : str(sign, 3)
  return (
    <g>
      <circle cx={x} cy={y} r={9} fill={c.bg} stroke={c.stroke} strokeWidth={1.2} />
      <text x={x} y={y + 0.5} textAnchor="middle" dominantBaseline="central" fontFamily={FONT} fontSize={13} fontWeight={700} fill={c.text}>{s}</text>
    </g>
  )
}

function Beaker({ x1, x2, top, bottom, liquid, c }) {
  return (
    <g>
      <rect x={x1 + 2} y={liquid} width={x2 - x1 - 4} height={bottom - liquid - 2} fill={c.fill} />
      <path d={`M ${x1} ${top} V ${bottom} H ${x2} V ${top}`} fill="none" stroke={c.stroke} strokeWidth={2} />
    </g>
  )
}

function Electrode({ x, top, bottom, c }) {
  return <rect x={x - 9} y={top} width={18} height={bottom - top} fill={c.grid} stroke={c.stroke} strokeWidth={1.3} />
}

function GalvanicCell({ fig, c }) {
  const L = fig.labels || {}
  const W = 520, H = 336
  const flow = fig.electronFlow
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 360 }} role="img" aria-label={fig.caption || 'Galvanic cell'}>
      <Beaker x1={60} x2={220} top={150} bottom={290} liquid={185} c={c} />
      <Beaker x1={300} x2={460} top={150} bottom={290} liquid={185} c={c} />
      {/* salt bridge: an upside-down U tube dipping into both solutions */}
      <path d="M 185 245 V 128 H 335 V 245" fill="none" stroke={c.stroke} strokeWidth={18} />
      <path d="M 185 245 V 128 H 335 V 245" fill="none" stroke={c.bg} strokeWidth={14} />
      <path d="M 185 245 V 128 H 335 V 245" fill="none" stroke={c.fill} strokeWidth={14} />
      <Electrode x={120} top={104} bottom={262} c={c} />
      <Electrode x={400} top={104} bottom={262} c={c} />
      <path d="M 120 104 V 60 H 400 V 104" fill="none" stroke={c.stroke} strokeWidth={1.6} />
      <circle cx={260} cy={60} r={19} fill={c.bg} stroke={c.stroke} strokeWidth={1.6} />
      <Text chem c={c} x={260} y={60} size={14} weight={700}>{str(L.meter || 'V', 6)}</Text>
      {flow && (
        <g>
          <line x1={flow === 'left_to_right' ? 170 : 350} y1={36} x2={flow === 'left_to_right' ? 222 : 298} y2={36} stroke={c.stroke} strokeWidth={1.4} />
          <Arrowhead at={[flow === 'left_to_right' ? 228 : 292, 36]} from={[flow === 'left_to_right' ? 170 : 350, 36]} c={c} />
          <Text chem c={c} x={flow === 'left_to_right' ? 196 : 324} y={22} size={13}>e^-</Text>
        </g>
      )}
      {L.salt_bridge && <Text chem c={c} x={260} y={104} size={12.5}>{L.salt_bridge}</Text>}
      <Sign x={150} y={96} sign={L.left_sign} c={c} />
      <Sign x={430} y={96} sign={L.right_sign} c={c} />
      {L.left_electrode && <><Lead from={[96, 128]} to={[110, 140]} c={c} /><Text chem c={c} x={92} y={124} anchor="end" size={12.5}>{L.left_electrode}</Text></>}
      {L.right_electrode && <><Lead from={[424, 128]} to={[410, 140]} c={c} /><Text chem c={c} x={428} y={124} anchor="start" size={12.5}>{L.right_electrode}</Text></>}
      {L.left_solution && <Text chem c={c} x={140} y={312} size={12.5}>{L.left_solution}</Text>}
      {L.right_solution && <Text chem c={c} x={380} y={312} size={12.5}>{L.right_solution}</Text>}
    </svg>
  )
}

function ElectrolyticCell({ fig, c }) {
  const L = fig.labels || {}
  const W = 480, H = 336
  // Long plate = positive terminal; put it on the side the labels say is positive.
  const leftPositive = !(/^[-−]/.test(L.left_sign || '') || /^\+/.test(L.right_sign || ''))
  const longX = leftPositive ? 232 : 248, shortX = leftPositive ? 248 : 232
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 360 }} role="img" aria-label={fig.caption || 'Electrolytic cell'}>
      <Beaker x1={110} x2={370} top={150} bottom={290} liquid={182} c={c} />
      <Electrode x={180} top={108} bottom={262} c={c} />
      <Electrode x={300} top={108} bottom={262} c={c} />
      <path d={`M 180 108 V 52 H 232`} fill="none" stroke={c.stroke} strokeWidth={1.6} />
      <path d={`M 300 108 V 52 H 248`} fill="none" stroke={c.stroke} strokeWidth={1.6} />
      {/* DC supply as a cell symbol */}
      <line x1={longX} y1={34} x2={longX} y2={70} stroke={c.stroke} strokeWidth={1.8} />
      <line x1={shortX} y1={42} x2={shortX} y2={62} stroke={c.stroke} strokeWidth={4} />
      <text x={longX + (leftPositive ? -10 : 10)} y={30} textAnchor="middle" fontFamily={FONT} fontSize={12} fontWeight={700} fill={c.text}>+</text>
      <text x={shortX + (leftPositive ? 10 : -10)} y={30} textAnchor="middle" fontFamily={FONT} fontSize={12} fontWeight={700} fill={c.text}>−</text>
      {L.power_supply && <Text chem c={c} x={240} y={88} size={12}>{L.power_supply}</Text>}
      <Sign x={210} y={128} sign={L.left_sign} c={c} />
      <Sign x={330} y={128} sign={L.right_sign} c={c} />
      {L.left_electrode && <><Lead from={[136, 112]} to={[170, 124]} c={c} /><Text chem c={c} x={132} y={108} anchor="end" size={12.5}>{L.left_electrode}</Text></>}
      {L.right_electrode && <><Lead from={[344, 104]} to={[310, 118]} c={c} /><Text chem c={c} x={348} y={100} anchor="start" size={12.5}>{L.right_electrode}</Text></>}
      {L.left_product && <><Lead from={[104, 232]} to={[170, 232]} c={c} /><Text chem c={c} x={100} y={232} anchor="end" size={12.5}>{L.left_product}</Text></>}
      {L.right_product && <><Lead from={[376, 232]} to={[310, 232]} c={c} /><Text chem c={c} x={380} y={232} anchor="start" size={12.5}>{L.right_product}</Text></>}
      {L.electrolyte && <Text chem c={c} x={240} y={312} size={12.5}>{L.electrolyte}</Text>}
    </svg>
  )
}

function Titration({ fig, c }) {
  const L = fig.labels || {}
  const W = 470, H = 384
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 380 }} role="img" aria-label={fig.caption || 'Titration set-up'}>
      {/* stand and clamp */}
      <rect x={58} y={360} width={200} height={10} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
      <rect x={78} y={36} width={7} height={324} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
      <line x1={85} y1={118} x2={170} y2={118} stroke={c.stroke} strokeWidth={3} />
      {/* burette */}
      <rect x={171} y={62} width={18} height={168} fill={c.fill} />
      <rect x={170} y={28} width={20} height={203} fill="none" stroke={c.stroke} strokeWidth={1.6} />
      {Array.from({ length: 12 }, (_, i) => <line key={i} x1={170} y1={42 + i * 15} x2={i % 5 === 0 ? 180 : 176} y2={42 + i * 15} stroke={c.stroke} strokeWidth={0.9} />)}
      <rect x={163} y={232} width={34} height={7} rx={2} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
      <path d="M 175 239 V 262 L 180 270 L 185 262 V 239" fill="none" stroke={c.stroke} strokeWidth={1.4} />
      {/* conical flask */}
      <polygon points="146,330 219,330 244,354 126,354" fill={c.fill} />
      <path d="M 170 284 V 306 L 124 356 H 246 L 190 306 V 284" fill="none" stroke={c.stroke} strokeWidth={1.8} strokeLinejoin="round" />
      {L.burette && <><Lead from={[194, 130]} to={[214, 130]} c={c} /><Text chem c={c} x={218} y={130} anchor="start" size={12.5}>{L.burette}</Text></>}
      {L.flask && <><Lead from={[232, 338]} to={[252, 326]} c={c} /><Text chem c={c} x={256} y={322} anchor="start" size={12.5}>{L.flask}</Text></>}
      {L.stand && <Text chem c={c} x={82} y={24} size={12}>{L.stand}</Text>}
    </svg>
  )
}

function Reflux({ fig, c }) {
  const L = fig.labels || {}
  const W = 400, H = 400
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 400 }} role="img" aria-label={fig.caption || 'Heating under reflux'}>
      <defs><clipPath id="rf-flask"><circle cx={170} cy={300} r={46} /></clipPath></defs>
      {/* round-bottom flask */}
      <rect x={120} y={304} width={100} height={50} fill={c.fill} clipPath="url(#rf-flask)" />
      <path d="M 161 214 V 257 A 46 46 0 1 0 179 257 V 214" fill="none" stroke={c.stroke} strokeWidth={1.8} />
      {/* condenser: inner tube with a water jacket and two side arms */}
      <rect x={162} y={36} width={16} height={180} fill="none" stroke={c.stroke} strokeWidth={1.5} />
      <rect x={148} y={58} width={44} height={136} rx={6} fill={c.grid} fillOpacity={0.35} stroke={c.stroke} strokeWidth={1.5} />
      <rect x={162} y={56} width={16} height={140} fill={c.bg} stroke={c.stroke} strokeWidth={1.2} />
      <path d="M 192 178 H 226 M 192 74 H 226" stroke={c.stroke} strokeWidth={1.5} />
      <line x1={252} y1={178} x2={230} y2={178} stroke={c.stroke} strokeWidth={1.3} />
      <Arrowhead at={[226, 178]} from={[252, 178]} c={c} size={7} />
      <line x1={230} y1={74} x2={252} y2={74} stroke={c.stroke} strokeWidth={1.3} />
      <Arrowhead at={[256, 74]} from={[230, 74]} c={c} size={7} />
      {L.water_in && <Text chem c={c} x={260} y={178} anchor="start" size={12.5}>{L.water_in}</Text>}
      {L.water_out && <Text chem c={c} x={262} y={74} anchor="start" size={12.5}>{L.water_out}</Text>}
      {L.condenser && <><Lead from={[146, 126]} to={[118, 126]} c={c} /><Text chem c={c} x={114} y={126} anchor="end" size={12.5}>{L.condenser}</Text></>}
      {L.flask && <><Lead from={[214, 316]} to={[240, 316]} c={c} /><Text chem c={c} x={244} y={316} anchor="start" size={12.5}>{L.flask}</Text></>}
      {/* heat */}
      <path d="M 162 392 Q 154 380 162 368 Q 166 376 170 364 Q 176 376 178 368 Q 186 380 178 392 Z" fill="none" stroke={c.stroke} strokeWidth={1.4} />
      {L.heat && <Text chem c={c} x={196} y={380} anchor="start" size={12.5}>{L.heat}</Text>}
    </svg>
  )
}

// A conical flask: neck from neckTop, body to bottom, liquid from liquidY down.
function ConicalFlask({ cx, neckTop, bottom, liquidY, c, halfNeck = 10, halfBase = 60 }) {
  const shoulder = neckTop + (bottom - neckTop) * 0.3
  const xAt = (y, side) => {
    if (y <= shoulder) return cx + side * halfNeck
    return cx + side * (halfNeck + ((y - shoulder) / (bottom - shoulder)) * (halfBase - halfNeck))
  }
  const ly = Math.max(liquidY ?? bottom, shoulder)
  return (
    <g>
      {liquidY != null && liquidY < bottom && (
        <polygon points={`${xAt(ly, -1)},${ly} ${xAt(ly, 1)},${ly} ${cx + halfBase - 1},${bottom - 1} ${cx - halfBase + 1},${bottom - 1}`} fill={c.fill} />
      )}
      <path d={`M ${cx - halfNeck} ${neckTop} V ${shoulder} L ${cx - halfBase} ${bottom} H ${cx + halfBase} L ${cx + halfNeck} ${shoulder} V ${neckTop}`}
        fill="none" stroke={c.stroke} strokeWidth={1.8} strokeLinejoin="round" />
    </g>
  )
}

function Flame({ x, y, c, size = 1 }) {
  const s = size
  return <path d={`M ${x - 8 * s} ${y} Q ${x - 16 * s} ${y - 12 * s} ${x - 8 * s} ${y - 24 * s} Q ${x - 4 * s} ${y - 16 * s} ${x} ${y - 28 * s} Q ${x + 6 * s} ${y - 16 * s} ${x + 8 * s} ${y - 24 * s} Q ${x + 16 * s} ${y - 12 * s} ${x + 8 * s} ${y} Z`}
    fill="none" stroke={c.stroke} strokeWidth={1.4} />
}

// A glass tube drawn as two walls: an outer stroke with the background inside.
function Tube({ d, c, width = 9 }) {
  return (
    <g>
      <path d={d} fill="none" stroke={c.stroke} strokeWidth={width} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={c.bg} strokeWidth={width - 3} strokeLinejoin="round" />
    </g>
  )
}

function Ticks({ x, y1, y2, step = 12, c, left = true }) {
  const out = []
  for (let y = y1, i = 0; y <= y2; y += step, i++) out.push(<line key={i} x1={x} y1={y} x2={x + (left ? 1 : -1) * (i % 5 === 0 ? 10 : 6)} y2={y} stroke={c.stroke} strokeWidth={0.9} />)
  return <g>{out}</g>
}

function Distillation({ fig, c }) {
  const L = fig.labels || {}
  const frac = !!fig.fractional
  const cx = 170, cy = 250, r = 44
  const head = frac ? 78 : 150 // top of the still head
  const S = [cx + 10, head + 22], E = [450, head + 132]
  const len = Math.hypot(E[0] - S[0], E[1] - S[1])
  const d = [(E[0] - S[0]) / len, (E[1] - S[1]) / len], n = [-d[1], d[0]] // n points down-left
  const at = (t) => [S[0] + (E[0] - S[0]) * t, S[1] + (E[1] - S[1]) * t]
  const J1 = at(0.22), J2 = at(0.86)
  const inStub = [J2[0] + n[0] * 13, J2[1] + n[1] * 13], inEnd = [J2[0] + n[0] * 40, J2[1] + n[1] * 40]
  const outStub = [J1[0] - n[0] * 13, J1[1] - n[1] * 13], outEnd = [J1[0] - n[0] * 40, J1[1] - n[1] * 40]
  const mid = at(0.55)
  const rx = E[0] + 8, rTop = E[1] + 14, rBottom = rTop + 74
  const H = Math.max(cy + r + 56, rBottom + 26), W = 560
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 380 }} role="img" aria-label={fig.caption || (frac ? 'Fractional distillation' : 'Distillation')}>
      <defs><clipPath id="ds-flask"><circle cx={cx} cy={cy} r={r - 1} /></clipPath></defs>
      <rect x={cx - r} y={cy + 6} width={r * 2} height={r} fill={c.fill} clipPath="url(#ds-flask)" />
      <path d={`M ${cx - 9} ${head} V ${cy - r + 4} A ${r} ${r} 0 1 0 ${cx + 9} ${cy - r + 4} V ${head + 30}`} fill="none" stroke={c.stroke} strokeWidth={1.8} />
      {frac && Array.from({ length: 12 }, (_, i) => <circle key={i} cx={cx - 4 + (i % 2) * 8} cy={head + 44 + i * ((cy - r - head - 50) / 12)} r={3} fill="none" stroke={c.stroke} strokeWidth={0.9} />)}
      {/* condenser: jacket then the inner tube */}
      <path d={`M ${J1[0]} ${J1[1]} L ${J2[0]} ${J2[1]}`} stroke={c.stroke} strokeWidth={28} strokeLinecap="round" />
      <path d={`M ${J1[0]} ${J1[1]} L ${J2[0]} ${J2[1]}`} stroke={c.bg} strokeWidth={25} strokeLinecap="round" />
      <path d={`M ${J1[0]} ${J1[1]} L ${J2[0]} ${J2[1]}`} stroke={c.grid} strokeOpacity={0.4} strokeWidth={25} strokeLinecap="round" />
      <Tube d={`M ${cx + 6} ${head + 22} L ${E[0]} ${E[1]}`} c={c} />
      <path d={`M ${inStub[0]} ${inStub[1]} L ${inEnd[0]} ${inEnd[1]} M ${outStub[0]} ${outStub[1]} L ${outEnd[0]} ${outEnd[1]}`} stroke={c.stroke} strokeWidth={1.4} />
      <Arrowhead at={inStub} from={inEnd} c={c} size={7} />
      <Arrowhead at={[outEnd[0] - n[0] * 4, outEnd[1] - n[1] * 4]} from={outStub} c={c} size={7} />
      {/* stopper and thermometer, bulb at the side arm */}
      <rect x={cx - 12} y={head - 8} width={24} height={9} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
      <rect x={cx - 2} y={head - 58} width={4} height={76} fill={c.bg} stroke={c.stroke} strokeWidth={1} />
      <circle cx={cx} cy={head + 21} r={4.5} fill={c.bg} stroke={c.stroke} strokeWidth={1.2} />
      {/* receiver */}
      <ConicalFlask cx={rx} neckTop={rTop} bottom={rBottom} liquidY={rBottom - 16} c={c} halfBase={38} halfNeck={9} />
      <Flame x={cx} y={cy + r + 42} c={c} />
      {L.thermometer && <><Lead from={[cx - 6, head - 40]} to={[cx - 26, head - 40]} c={c} /><Text chem c={c} x={cx - 30} y={head - 40} anchor="end" size={12.5}>{L.thermometer}</Text></>}
      {frac && L.column && <><Lead from={[cx - 12, (head + cy - r) / 2]} to={[cx - 34, (head + cy - r) / 2]} c={c} /><Text chem c={c} x={cx - 38} y={(head + cy - r) / 2} anchor="end" size={12.5}>{L.column}</Text></>}
      {L.flask && <><Lead from={[cx - r - 2, cy + 10]} to={[cx - r - 20, cy + 10]} c={c} /><Text chem c={c} x={cx - r - 24} y={cy + 10} anchor="end" size={12.5}>{L.flask}</Text></>}
      {L.condenser && <Text chem c={c} x={mid[0] - n[0] * 30} y={mid[1] - n[1] * 30} anchor="start" size={12.5}>{L.condenser}</Text>}
      {L.water_in && <Text chem c={c} x={inEnd[0] - 4} y={inEnd[1] + 10} anchor="end" size={12}>{L.water_in}</Text>}
      {L.water_out && <Text chem c={c} x={outEnd[0] + 4} y={outEnd[1] - 8} anchor="start" size={12}>{L.water_out}</Text>}
      {L.receiver && <><Lead from={[rx + 30, rTop + 30]} to={[rx + 48, rTop + 30]} c={c} /><Text chem c={c} x={rx + 52} y={rTop + 30} anchor="start" size={12.5}>{L.receiver}</Text></>}
      {L.distillate && <><Lead from={[rx + 30, rBottom - 8]} to={[rx + 48, rBottom - 8]} c={c} /><Text chem c={c} x={rx + 52} y={rBottom - 8} anchor="start" size={12.5}>{L.distillate}</Text></>}
      {L.heat && <Text chem c={c} x={cx + 22} y={cy + r + 30} anchor="start" size={12.5}>{L.heat}</Text>}
    </svg>
  )
}

function Calorimetry({ fig, c }) {
  const L = fig.labels || {}
  const W = 440, H = 360
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 360 }} role="img" aria-label={fig.caption || 'Calorimetry'}>
      <rect x={40} y={340} width={220} height={10} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
      <rect x={62} y={30} width={7} height={310} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
      <line x1={69} y1={120} x2={150} y2={120} stroke={c.stroke} strokeWidth={3} />
      {/* can of water */}
      <rect x={151} y={118} width={98} height={80} fill={c.fill} />
      <path d="M 150 90 V 200 H 250 V 90" fill="none" stroke={c.stroke} strokeWidth={2} />
      <rect x={196} y={34} width={6} height={150} fill={c.bg} stroke={c.stroke} strokeWidth={1} />
      <circle cx={199} cy={186} r={5} fill={c.bg} stroke={c.stroke} strokeWidth={1.2} />
      {/* spirit burner */}
      <Flame x={200} y={246} c={c} />
      <rect x={197} y={246} width={6} height={30} fill={c.stroke} />
      <path d="M 168 276 H 232 Q 244 276 244 290 V 318 Q 244 330 232 330 H 168 Q 156 330 156 318 V 290 Q 156 276 168 276 Z" fill={c.bg} stroke={c.stroke} strokeWidth={1.6} />
      <rect x={158} y={300} width={84} height={28} rx={8} fill={c.fill} />
      {L.thermometer && <><Lead from={[205, 54]} to={[226, 54]} c={c} /><Text chem c={c} x={230} y={54} anchor="start" size={12.5}>{L.thermometer}</Text></>}
      {L.can && <><Lead from={[252, 100]} to={[272, 100]} c={c} /><Text chem c={c} x={276} y={100} anchor="start" size={12.5}>{L.can}</Text></>}
      {L.water && <><Lead from={[244, 160]} to={[272, 160]} c={c} /><Text chem c={c} x={276} y={160} anchor="start" size={12.5}>{L.water}</Text></>}
      {L.burner && <><Lead from={[246, 286]} to={[266, 286]} c={c} /><Text chem c={c} x={270} y={286} anchor="start" size={12.5}>{L.burner}</Text></>}
      {L.fuel && <><Lead from={[236, 316]} to={[266, 316]} c={c} /><Text chem c={c} x={270} y={316} anchor="start" size={12.5}>{L.fuel}</Text></>}
    </svg>
  )
}

function GasCollection({ fig, c }) {
  const L = fig.labels || {}
  const W = 610, H = 330
  return (
    <svg viewBox={`-70 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 340 }} role="img" aria-label={fig.caption || 'Gas collection over water'}>
      <ConicalFlask cx={110} neckTop={150} bottom={300} liquidY={250} c={c} halfBase={58} />
      <rect x={98} y={142} width={24} height={14} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
      {/* trough of water with the upturned cylinder */}
      <rect x={282} y={222} width={196} height={76} fill={c.fill} />
      <path d="M 280 196 V 300 H 480 V 196" fill="none" stroke={c.stroke} strokeWidth={2} />
      <rect x={341} y={150} width={58} height={128} fill={c.fill} />
      <path d="M 340 282 V 70 H 400 V 282" fill="none" stroke={c.stroke} strokeWidth={1.8} />
      <Ticks x={340} y1={84} y2={266} c={c} />
      {/* over the trough's rim, along the bottom, up under the cylinder's mouth */}
      <Tube d="M 110 156 V 112 H 302 V 290 H 368 V 250" c={c} />
      {L.flask && <><Lead from={[56, 270]} to={[38, 270]} c={c} /><Text chem c={c} x={34} y={270} anchor="end" size={12.5}>{L.flask}</Text></>}
      {L.reactants && <Text chem c={c} x={110} y={316} size={12.5}>{L.reactants}</Text>}
      {L.delivery_tube && <Text chem c={c} x={180} y={98} size={12.5}>{L.delivery_tube}</Text>}
      {L.gas && <><Lead from={[392, 110]} to={[420, 110]} c={c} /><Text chem c={c} x={424} y={110} anchor="start" size={12.5}>{L.gas}</Text></>}
      {L.cylinder && <><Lead from={[402, 180]} to={[420, 180]} c={c} /><Text chem c={c} x={424} y={180} anchor="start" size={12.5}>{L.cylinder}</Text></>}
      {L.trough && <Text chem c={c} x={440} y={316} size={12.5}>{L.trough}</Text>}
    </svg>
  )
}

function GasSyringe({ fig, c }) {
  const L = fig.labels || {}
  const W = 610, H = 300
  return (
    <svg viewBox={`-70 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 320 }} role="img" aria-label={fig.caption || 'Gas syringe'}>
      <ConicalFlask cx={110} neckTop={130} bottom={270} liquidY={225} c={c} halfBase={56} />
      <rect x={98} y={122} width={24} height={14} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
      <Tube d="M 110 136 V 100 H 262" c={c} />
      {/* syringe: barrel, plunger */}
      <rect x={262} y={86} width={190} height={28} fill="none" stroke={c.stroke} strokeWidth={1.8} />
      {Array.from({ length: 10 }, (_, i) => <line key={i} x1={280 + i * 17} y1={86} x2={280 + i * 17} y2={i % 5 === 0 ? 96 : 92} stroke={c.stroke} strokeWidth={0.9} />)}
      <rect x={338} y={89} width={6} height={22} fill={c.grid} stroke={c.stroke} strokeWidth={1} />
      <rect x={344} y={97} width={140} height={6} fill={c.grid} stroke={c.stroke} strokeWidth={1} />
      <rect x={484} y={80} width={8} height={40} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
      {L.flask && <><Lead from={[56, 245]} to={[38, 245]} c={c} /><Text chem c={c} x={34} y={245} anchor="end" size={12.5}>{L.flask}</Text></>}
      {L.reactants && <Text chem c={c} x={110} y={288} size={12.5}>{L.reactants}</Text>}
      {L.syringe && <Text chem c={c} x={380} y={64} size={12.5}>{L.syringe}</Text>}
      {L.reading && <><Lead from={[341, 116]} to={[341, 140]} c={c} /><Text chem c={c} x={341} y={152} size={12.5}>{L.reading}</Text></>}
    </svg>
  )
}

function SeparatingFunnel({ fig, c }) {
  const L = fig.labels || {}
  const W = 420, H = 390
  const body = 'M 184 60 Q 96 120 150 196 L 186 240 V 262 H 194 V 240 L 230 196 Q 284 120 196 60 Z'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 390 }} role="img" aria-label={fig.caption || 'Separating funnel'}>
      <defs><clipPath id="sf-body"><path d={body} /></clipPath></defs>
      <rect x={60} y={372} width={170} height={10} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
      <rect x={66} y={30} width={7} height={342} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
      <line x1={73} y1={150} x2={128} y2={150} stroke={c.stroke} strokeWidth={3} />
      <rect x={100} y={96} width={180} height={60} fill={c.fill} clipPath="url(#sf-body)" />
      <rect x={100} y={156} width={180} height={110} fill={c.grid} fillOpacity={0.55} clipPath="url(#sf-body)" />
      <line x1={110} y1={156} x2={270} y2={156} stroke={c.stroke} strokeWidth={1} clipPath="url(#sf-body)" />
      <path d={body} fill="none" stroke={c.stroke} strokeWidth={1.8} strokeLinejoin="round" />
      <rect x={180} y={34} width={20} height={26} rx={3} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
      <path d="M 186 278 V 322 L 190 330 L 194 322 V 278" fill="none" stroke={c.stroke} strokeWidth={1.5} />
      <rect x={172} y={262} width={36} height={16} rx={3} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
      <path d="M 150 316 V 372 H 230 V 316" fill="none" stroke={c.stroke} strokeWidth={1.8} />
      {L.funnel && <><Lead from={[232, 80]} to={[262, 80]} c={c} /><Text chem c={c} x={266} y={80} anchor="start" size={12.5}>{L.funnel}</Text></>}
      {L.top_layer && <><Lead from={[236, 128]} to={[286, 128]} c={c} /><Text chem c={c} x={290} y={128} anchor="start" size={12.5}>{L.top_layer}</Text></>}
      {L.bottom_layer && <><Lead from={[232, 196]} to={[286, 196]} c={c} /><Text chem c={c} x={290} y={196} anchor="start" size={12.5}>{L.bottom_layer}</Text></>}
      {L.tap && <><Lead from={[210, 270]} to={[262, 270]} c={c} /><Text chem c={c} x={266} y={270} anchor="start" size={12.5}>{L.tap}</Text></>}
      {L.beaker && <><Lead from={[232, 350]} to={[262, 350]} c={c} /><Text chem c={c} x={266} y={350} anchor="start" size={12.5}>{L.beaker}</Text></>}
    </svg>
  )
}

function Filtration({ fig, c }) {
  const L = fig.labels || {}
  const W = 420, H = 370
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 370 }} role="img" aria-label={fig.caption || 'Filtration'}>
      {L.mixture && <><Text chem c={c} x={190} y={26} size={12.5}>{L.mixture}</Text><line x1={190} y1={38} x2={190} y2={68} stroke={c.stroke} strokeWidth={1.3} /><Arrowhead at={[190, 74]} from={[190, 38]} c={c} size={7} /></>}
      {/* filter paper cone, with the residue at its tip */}
      <path d="M 134 86 L 246 86 L 190 166 Z" fill="none" stroke={c.stroke} strokeWidth={1} strokeDasharray="4 3" />
      <path d="M 169 136 L 211 136 L 190 166 Z" fill={c.grid} fillOpacity={0.7} />
      <path d="M 120 82 L 182 172 V 250 H 198 V 172 L 260 82" fill="none" stroke={c.stroke} strokeWidth={1.8} strokeLinejoin="round" />
      <ConicalFlask cx={190} neckTop={232} bottom={352} liquidY={322} c={c} halfBase={62} halfNeck={13} />
      {L.funnel && <><Lead from={[254, 96]} to={[280, 96]} c={c} /><Text chem c={c} x={284} y={96} anchor="start" size={12.5}>{L.funnel}</Text></>}
      {L.filter_paper && <><Lead from={[228, 112]} to={[280, 124]} c={c} /><Text chem c={c} x={284} y={126} anchor="start" size={12.5}>{L.filter_paper}</Text></>}
      {L.residue && <><Lead from={[202, 152]} to={[280, 156]} c={c} /><Text chem c={c} x={284} y={158} anchor="start" size={12.5}>{L.residue}</Text></>}
      {L.filtrate && <><Lead from={[236, 336]} to={[280, 336]} c={c} /><Text chem c={c} x={284} y={336} anchor="start" size={12.5}>{L.filtrate}</Text></>}
    </svg>
  )
}

function Glassware({ fig, c }) {
  const L = fig.labels || {}
  const W = 240, H = 340, cx = 120
  let art = null
  if (fig.item === 'pipette') {
    art = <g>
      <path d={`M ${cx - 4} 18 V 120 Q ${cx - 18} 132 ${cx - 18} 170 Q ${cx - 18} 208 ${cx - 4} 220 V 300 L ${cx} 312 L ${cx + 4} 300 V 220 Q ${cx + 18} 208 ${cx + 18} 170 Q ${cx + 18} 132 ${cx + 4} 120 V 18`} fill="none" stroke={c.stroke} strokeWidth={1.6} />
      <line x1={cx - 9} y1={64} x2={cx + 9} y2={64} stroke={c.stroke} strokeWidth={1.4} />
    </g>
  } else if (fig.item === 'volumetric_flask') {
    art = <g>
      <rect x={cx - 11} y={20} width={22} height={16} rx={3} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
      {/* long neck with a calibration mark, round bulb, flat base */}
      <path d={`M ${cx - 8} 36 V 198 A 58 58 0 0 0 ${cx - 40} 304 H ${cx + 40} A 58 58 0 0 0 ${cx + 8} 198 V 36`} fill="none" stroke={c.stroke} strokeWidth={1.8} />
      <line x1={cx - 12} y1={100} x2={cx + 12} y2={100} stroke={c.stroke} strokeWidth={1.4} />
    </g>
  } else if (fig.item === 'measuring_cylinder') {
    art = <g>
      <path d={`M ${cx - 24} 30 L ${cx - 30} 22 M ${cx - 24} 30 V 296 H ${cx + 24} V 30`} fill="none" stroke={c.stroke} strokeWidth={1.8} />
      <Ticks x={cx - 24} y1={46} y2={286} step={10} c={c} />
      <rect x={cx - 44} y={296} width={88} height={10} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
    </g>
  } else if (fig.item === 'burette') {
    art = <g>
      <rect x={cx - 10} y={14} width={20} height={250} fill="none" stroke={c.stroke} strokeWidth={1.6} />
      <Ticks x={cx - 10} y1={28} y2={250} step={10} c={c} />
      <rect x={cx - 18} y={266} width={36} height={8} rx={2} fill={c.grid} stroke={c.stroke} strokeWidth={1.2} />
      <path d={`M ${cx - 5} 274 V 300 L ${cx} 310 L ${cx + 5} 300 V 274`} fill="none" stroke={c.stroke} strokeWidth={1.4} />
    </g>
  } else if (fig.item === 'conical_flask') {
    art = <ConicalFlask cx={cx} neckTop={60} bottom={300} c={c} halfBase={86} halfNeck={20} />
  } else if (fig.item === 'beaker') {
    art = <g>
      <path d={`M ${cx - 80} 110 L ${cx - 70} 120 V 300 H ${cx + 70} V 110`} fill="none" stroke={c.stroke} strokeWidth={1.8} />
      <Ticks x={cx - 70} y1={150} y2={270} step={30} c={c} />
    </g>
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 320 }} role="img" aria-label={fig.caption || 'Glassware'}>
      {art}
      {L.name && <Text chem c={c} x={cx} y={H - 12} size={14} weight={700}>{L.name}</Text>}
    </svg>
  )
}

export function Apparatus({ fig, c }) {
  if (fig.kind === 'galvanic_cell') return <GalvanicCell fig={fig} c={c} />
  if (fig.kind === 'electrolytic_cell') return <ElectrolyticCell fig={fig} c={c} />
  if (fig.kind === 'titration') return <Titration fig={fig} c={c} />
  if (fig.kind === 'reflux') return <Reflux fig={fig} c={c} />
  if (fig.kind === 'distillation') return <Distillation fig={fig} c={c} />
  if (fig.kind === 'calorimetry') return <Calorimetry fig={fig} c={c} />
  if (fig.kind === 'gas_collection') return <GasCollection fig={fig} c={c} />
  if (fig.kind === 'gas_syringe') return <GasSyringe fig={fig} c={c} />
  if (fig.kind === 'separating_funnel') return <SeparatingFunnel fig={fig} c={c} />
  if (fig.kind === 'filtration') return <Filtration fig={fig} c={c} />
  if (fig.kind === 'glassware') return <Glassware fig={fig} c={c} />
  return null
}

// ── Particle diagrams ─────────────────────────────────────────────────────────
//   { type: 'particles', boxes: [{ label, particles: [{ kind: 'A'..'F', count }] }], key: { A: 'N2', ... } }
// A filled atom, B open atom, C filled–filled, D open–open, E filled–open molecule, F small filled atom.

function Particle({ kind, x, y, angle, c }) {
  const filled = { fill: c.text, stroke: c.text }
  const open = { fill: c.bg, stroke: c.text }
  const r = 7
  if (kind === 'A') return <circle cx={x} cy={y} r={8} {...filled} strokeWidth={1.2} />
  if (kind === 'B') return <circle cx={x} cy={y} r={8} {...open} strokeWidth={1.4} />
  if (kind === 'F') return <circle cx={x} cy={y} r={4.5} {...filled} />
  const dx = Math.cos(angle) * r * 0.9, dy = Math.sin(angle) * r * 0.9
  const a = kind === 'D' ? open : filled, b = kind === 'C' ? filled : open
  return (
    <g>
      <circle cx={x - dx} cy={y - dy} r={r} {...a} strokeWidth={1.3} />
      <circle cx={x + dx} cy={y + dy} r={r} {...b} strokeWidth={1.3} />
    </g>
  )
}

// Deterministic positions so a figure always looks the same: a seeded generator with spacing.
function scatter(count, w, h, seed, minGap) {
  let s = seed >>> 0
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
  const pts = []
  for (let tries = 0; pts.length < count && tries < count * 400; tries++) {
    const p = [14 + rand() * (w - 28), 14 + rand() * (h - 28), rand() * Math.PI]
    if (pts.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= minGap)) pts.push(p)
  }
  return pts
}

export function Particles({ fig, c }) {
  const boxes = list(fig.boxes).slice(0, 3)
  if (!boxes.length) return null
  const BOX = 170, GAP = 28, TOP = 26
  const key = fig.key && typeof fig.key === 'object' ? fig.key : {}
  const used = [...new Set(boxes.flatMap(b => list(b.particles).map(p => p.kind)))]
  const keyRows = used.filter(k => key[k])
  const W = boxes.length * BOX + (boxes.length - 1) * GAP + 20, H = TOP + BOX + 16 + keyRows.length * 26
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: 360 }} role="img" aria-label={fig.caption || 'Particle diagram'}>
      {boxes.map((b, bi) => {
        const x0 = 10 + bi * (BOX + GAP)
        const items = list(b.particles).flatMap(p => Array.from({ length: Math.min(20, p.count | 0) }, () => p.kind)).slice(0, 30)
        const pos = scatter(items.length, BOX, BOX, 977 * (bi + 1) + items.length, items.length > 20 ? 24 : 30)
        return (
          <g key={bi}>
            {b.label && <Text chem c={c} x={x0 + BOX / 2} y={12} size={12.5} weight={700}>{str(b.label)}</Text>}
            <rect x={x0} y={TOP} width={BOX} height={BOX} fill={c.bg} stroke={c.stroke} strokeWidth={1.4} />
            {items.map((k, i) => pos[i] && <Particle key={i} kind={k} x={x0 + pos[i][0]} y={TOP + pos[i][1]} angle={pos[i][2]} c={c} />)}
            {bi < boxes.length - 1 && (
              <g>
                <line x1={x0 + BOX + 5} y1={TOP + BOX / 2} x2={x0 + BOX + GAP - 7} y2={TOP + BOX / 2} stroke={c.stroke} strokeWidth={1.4} />
                <Arrowhead at={[x0 + BOX + GAP - 3, TOP + BOX / 2]} from={[x0 + BOX + 5, TOP + BOX / 2]} c={c} size={6} />
              </g>
            )}
          </g>
        )
      })}
      {keyRows.map((k, i) => (
        <g key={k}>
          <Particle kind={k} x={30} y={TOP + BOX + 30 + i * 26} angle={0} c={c} />
          <Text chem c={c} x={52} y={TOP + BOX + 30 + i * 26} anchor="start" size={12.5}>{str(key[k], 30)}</Text>
        </g>
      ))}
    </svg>
  )
}
