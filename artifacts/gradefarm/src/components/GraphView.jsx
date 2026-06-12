import { useMemo } from 'react'
import { makeEvalFn } from '../lib/graphExpr'

const COLORS = ['#4f8ef7', '#f15b5b', '#3cba74', '#f5a623', '#9b59b6']

const SVG_W = 480
const SVG_H = 320
const PAD = { top: 20, right: 20, bottom: 36, left: 44 }
const PLOT_W = SVG_W - PAD.left - PAD.right
const PLOT_H = SVG_H - PAD.top - PAD.bottom

export default function GraphView({ graph, theme }) {
  const {
    functions = [],
    points = [],
    xRange = [-5, 5],
    yRange = [-6, 6],
    xLabel,
    yLabel,
  } = graph || {}

  const [xMin, xMax] = xRange
  const [yMin, yMax] = yRange

  // Map data coords → SVG coords
  const toSvgX = (x) => PAD.left + ((x - xMin) / (xMax - xMin)) * PLOT_W
  const toSvgY = (y) => PAD.top + ((yMax - y) / (yMax - yMin)) * PLOT_H

  // Axis positions in SVG space (clamp to plot area)
  const axisX = Math.max(PAD.left, Math.min(PAD.left + PLOT_W, toSvgX(0)))
  const axisY = Math.max(PAD.top, Math.min(PAD.top + PLOT_H, toSvgY(0)))

  // Generate tick marks
  const xTicks = useMemo(() => {
    const ticks = []
    const step = niceStep(xMax - xMin, 8)
    const start = Math.ceil(xMin / step) * step
    for (let v = start; v <= xMax + 1e-9; v += step) {
      ticks.push(Math.round(v * 1e6) / 1e6)
    }
    return ticks.filter((v) => Math.abs(v) > 1e-9 || true)
  }, [xMin, xMax])

  const yTicks = useMemo(() => {
    const ticks = []
    const step = niceStep(yMax - yMin, 6)
    const start = Math.ceil(yMin / step) * step
    for (let v = start; v <= yMax + 1e-9; v += step) {
      ticks.push(Math.round(v * 1e6) / 1e6)
    }
    return ticks
  }, [yMin, yMax])

  // Sample function paths
  const paths = useMemo(() => {
    return functions.map((fn, fi) => {
      const evalFn = makeEvalFn(fn.expr)
      if (!evalFn) return { d: '', color: fn.color || COLORS[fi % COLORS.length] }
      const steps = 300
      const dx = (xMax - xMin) / steps
      let d = ''
      let penDown = false
      for (let i = 0; i <= steps; i++) {
        const x = xMin + i * dx
        let y
        try { y = evalFn(x) } catch { penDown = false; continue }
        if (!isFinite(y) || isNaN(y)) { penDown = false; continue }
        const sx = toSvgX(x)
        const sy = toSvgY(y)
        if (!penDown) { d += `M ${sx} ${sy} `; penDown = true }
        else { d += `L ${sx} ${sy} ` }
      }
      return { d, color: fn.color || COLORS[fi % COLORS.length] }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [functions, xMin, xMax, yMin, yMax])

  const isDark = theme === 'dark'
  const textColor = isDark ? '#cbd5e1' : '#334155'
  const gridColor = isDark ? '#ffffff18' : '#00000012'
  const axisColor = isDark ? '#94a3b8' : '#64748b'
  const bgColor = isDark ? '#1e293b' : '#f8fafc'
  const borderColor = isDark ? '#334155' : '#e2e8f0'

  return (
    <div style={{ margin: '0 0 18px', borderRadius: 12, overflow: 'hidden', border: `1px solid ${borderColor}`, background: bgColor, maxWidth: 520 }}>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: '100%', display: 'block' }}
        aria-label="Mathematical graph"
      >
        {/* Grid lines */}
        {xTicks.map((v) => (
          <line key={`gx${v}`} x1={toSvgX(v)} y1={PAD.top} x2={toSvgX(v)} y2={PAD.top + PLOT_H} stroke={gridColor} strokeWidth={1} />
        ))}
        {yTicks.map((v) => (
          <line key={`gy${v}`} x1={PAD.left} y1={toSvgY(v)} x2={PAD.left + PLOT_W} y2={toSvgY(v)} stroke={gridColor} strokeWidth={1} />
        ))}

        {/* Axes */}
        <line x1={PAD.left} y1={axisY} x2={PAD.left + PLOT_W} y2={axisY} stroke={axisColor} strokeWidth={1.5} />
        <line x1={axisX} y1={PAD.top} x2={axisX} y2={PAD.top + PLOT_H} stroke={axisColor} strokeWidth={1.5} />

        {/* Axis tick labels */}
        {xTicks.map((v) => (
          <text key={`tx${v}`} x={toSvgX(v)} y={axisY + 16} textAnchor="middle" fontSize={10} fill={textColor} fontFamily="system-ui, sans-serif">
            {v}
          </text>
        ))}
        {yTicks.map((v) => v !== 0 && (
          <text key={`ty${v}`} x={axisX - 6} y={toSvgY(v) + 4} textAnchor="end" fontSize={10} fill={textColor} fontFamily="system-ui, sans-serif">
            {v}
          </text>
        ))}

        {/* Function curves — clipped to plot area */}
        <clipPath id="plotClip">
          <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} />
        </clipPath>
        {paths.map((p, i) => (
          <path key={i} d={p.d} stroke={p.color} strokeWidth={2.2} fill="none" clipPath="url(#plotClip)" />
        ))}

        {/* Points with labels */}
        {points.map((pt, i) => {
          const sx = toSvgX(pt.x)
          const sy = toSvgY(pt.y)
          const labelAbove = pt.y >= (yMin + yMax) / 2
          return (
            <g key={i}>
              <circle cx={sx} cy={sy} r={5} fill={COLORS[i % COLORS.length]} stroke={bgColor} strokeWidth={1.5} />
              {pt.label && (
                <text
                  x={sx + 8}
                  y={labelAbove ? sy - 8 : sy + 16}
                  fontSize={11}
                  fill={textColor}
                  fontFamily="system-ui, sans-serif"
                  fontWeight={600}
                >
                  {pt.label}
                </text>
              )}
            </g>
          )
        })}

        {/* Axis arrows */}
        <polygon points={`${PAD.left + PLOT_W},${axisY} ${PAD.left + PLOT_W - 7},${axisY - 4} ${PAD.left + PLOT_W - 7},${axisY + 4}`} fill={axisColor} />
        <polygon points={`${axisX},${PAD.top} ${axisX - 4},${PAD.top + 7} ${axisX + 4},${PAD.top + 7}`} fill={axisColor} />

        {/* Axis labels */}
        <text x={PAD.left + PLOT_W / 2} y={SVG_H - 2} fontSize={10} fill={axisColor} fontFamily="system-ui, sans-serif" textAnchor="middle" fontStyle={xLabel ? 'normal' : 'italic'}>{xLabel || 'x'}</text>
        {yLabel
          ? <text transform={`translate(${10},${PAD.top + PLOT_H / 2}) rotate(-90)`} fontSize={10} fill={axisColor} fontFamily="system-ui, sans-serif" textAnchor="middle">{yLabel}</text>
          : <text x={axisX + 6} y={PAD.top + 4} fontSize={11} fill={axisColor} fontFamily="system-ui, sans-serif" fontStyle="italic">y</text>}
      </svg>
    </div>
  )
}

function niceStep(range, targetCount) {
  const rough = range / targetCount
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)))
  const residual = rough / magnitude
  if (residual < 1.5) return magnitude
  if (residual < 3.5) return 2 * magnitude
  if (residual < 7.5) return 5 * magnitude
  return 10 * magnitude
}
