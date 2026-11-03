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

export function Apparatus({ fig, c }) {
  if (fig.kind === 'galvanic_cell') return <GalvanicCell fig={fig} c={c} />
  if (fig.kind === 'electrolytic_cell') return <ElectrolyticCell fig={fig} c={c} />
  if (fig.kind === 'titration') return <Titration fig={fig} c={c} />
  if (fig.kind === 'reflux') return <Reflux fig={fig} c={c} />
  return null
}
