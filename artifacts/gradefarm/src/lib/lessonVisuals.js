// Tables, graphs and diagrams in guided lessons. A key idea or the worked
// example can carry a `visual` that the app draws with the same renderers as
// the question bank (TableView, GraphView, FigureView), so it is to scale and
// works in both themes. The model describes WHAT to draw; LessonVisual.jsx
// draws it.
//
// Lessons are written in the browser and saved straight to learn_lessons, so
// nothing on the server tidies the model's output. cleanVisual() keeps only
// well-formed, plain data. Graph rules are compiled into functions by
// GraphView, so they must be plain arithmetic in x: see isSafeExpr().
//
//   { type: 'table', headers: [...], rows: [[...]], caption? }
//   { type: 'graph', functions: [{ expr, domain? }], points, asymptotes, shade, xRange, yRange, xLabel?, yLabel?, caption? }
//   { type: <a FigureView type>, ...that figure's spec, caption? }

import { normalizeExprVariable } from './graphExpr.js'

export const FIGURE_TYPES = ['geometry', 'number_line', 'bar_chart', 'xy_plot', 'flow_chart', 'particles', 'apparatus', 'tlc_plate']
const APPARATUS = ['galvanic_cell', 'electrolytic_cell', 'titration', 'reflux', 'distillation', 'calorimetry', 'gas_collection', 'gas_syringe', 'separating_funnel', 'filtration', 'glassware']
const MAX_JSON = 8000

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const arr = (v, n = 40) => (Array.isArray(v) ? v.slice(0, n) : [])
const text = (v, n = 60) => (v == null || typeof v === 'object' ? '' : String(v).trim().slice(0, n))
const pair = (v) => (Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]) && v[0] < v[1] ? [v[0], v[1]] : null)

// What a graph rule may use: Math's functions and constants (GraphView binds
// these by name) and the one variable. GraphView rewrites a lone t, n, ... to x.
const GRAPH_NAMES = new Set(['abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'cos', 'exp', 'floor', 'log', 'max', 'min', 'pow', 'round', 'sign', 'sin', 'sqrt', 'tan', 'PI', 'E', 'x'])

/**
 * True when a graph rule is plain arithmetic in one variable, so compiling it
 * (GraphView uses new Function) can only ever compute a number: digits,
 * + - * / ^ ( ) , . and spaces, Math's function names and x. No property
 * access, strings, brackets or other names.
 */
export function isSafeExpr(expr) {
  if (typeof expr !== 'string' || !expr.trim() || expr.length > 200) return false
  if (!/^[A-Za-z0-9+\-*/^().,\s]*$/.test(expr)) return false
  // Numbers first (1e5, .5), so their digits and exponent aren't read as names.
  const names = (e) => e.replace(/(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/gi, ' 0 ').match(/[A-Za-z][A-Za-z0-9]*/g) || []
  if (/\.\s*[A-Za-z]/.test(expr.replace(/(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/gi, ' 0 '))) return false
  // The variable is one letter (x, t, n), and once GraphView renames it to x
  // nothing but Math's names may be left.
  if (!names(expr).every(n => GRAPH_NAMES.has(n) || n.length === 1)) return false
  return names(normalizeExprVariable(expr)).every(n => GRAPH_NAMES.has(n))
}

function cleanTable(v) {
  const headers = arr(v.headers, 8).map(h => text(h, 40))
  const rows = arr(v.rows, 14).map(r => arr(Array.isArray(r) ? r : [r], 8).map(c => text(c, 60))).filter(r => r.some(Boolean))
  if (!rows.length) return null
  return { type: 'table', headers: headers.some(Boolean) ? headers : [], rows }
}

function cleanGraph(v) {
  const functions = arr(v.functions, 4).filter(isObj).filter(f => isSafeExpr(f.expr))
    .map(f => ({ expr: f.expr.trim(), ...(pair(f.domain) && { domain: pair(f.domain) }) }))
  const points = arr(v.points, 12).filter(p => isObj(p) && isNum(p.x) && isNum(p.y))
    .map(p => ({ x: p.x, y: p.y, ...(text(p.label) && { label: text(p.label, 24) }), ...(p.open === true && { open: true }) }))
  const asymptotes = arr(v.asymptotes, 4).filter(a => isObj(a) && isNum(a.x) !== isNum(a.y))
    .map(a => ({ ...(isNum(a.x) ? { x: a.x } : { y: a.y }), ...(text(a.label) && { label: text(a.label, 24) }) }))
  const shade = arr(v.shade, 3).filter(s => isObj(s) && Number.isInteger(s.fn) && s.fn >= 0 && s.fn < functions.length && isNum(s.from) && isNum(s.to) && s.from < s.to)
    .map(s => ({ fn: s.fn, from: s.from, to: s.to, ...(Number.isInteger(s.to_fn) && s.to_fn >= 0 && s.to_fn < functions.length && { to_fn: s.to_fn }) }))
  if (!functions.length && !points.length) return null
  return {
    type: 'graph', functions, points, asymptotes, shade,
    xRange: pair(v.xRange) || [-5, 5],
    yRange: pair(v.yRange) || [-6, 6],
    xLabel: text(v.xLabel, 8) || 'x',
    yLabel: text(v.yLabel, 8) || 'y',
  }
}

// FigureView's drawers already skip malformed parts; this only drops figures
// with nothing to draw, so the card doesn't show an empty frame.
function figureDrawable(v) {
  switch (v.type) {
    case 'geometry': return isObj(v.points) && Object.values(v.points).filter(p => Array.isArray(p) && isNum(p[0]) && isNum(p[1])).length >= 2
    case 'number_line': return isNum(v.min) && isNum(v.max) && v.min < v.max
    case 'bar_chart': return arr(v.bars).some(b => isObj(b) && isNum(b.value))
    case 'xy_plot': return !!pair(v.xRange) && !!pair(v.yRange) && (arr(v.series).some(isObj) || arr(v.hlines).some(isObj))
    case 'flow_chart': return arr(v.nodes).filter(n => isObj(n) && n.id && n.text).length >= 2 && arr(v.edges).some(isObj)
    case 'particles': return arr(v.boxes).some(b => isObj(b) && arr(b.particles).some(isObj))
    case 'apparatus': return APPARATUS.includes(v.kind)
    case 'tlc_plate': return arr(v.lanes).some(isObj)
    default: return false
  }
}

/** A visual from the model (or a saved lesson), checked and tidied, or null. */
export function cleanVisual(raw) {
  if (!isObj(raw)) return null
  let v
  try {
    const json = JSON.stringify(raw)
    if (json.length > MAX_JSON) return null
    v = JSON.parse(json) // plain data only
  } catch { return null }
  const caption = text(v.caption, 160)
  let out = null
  if (v.type === 'table') out = cleanTable(v)
  else if (v.type === 'graph') out = cleanGraph(v)
  else if (FIGURE_TYPES.includes(v.type) && figureDrawable(v)) {
    const { caption: _c, ...fig } = v
    out = fig
  }
  return out && (caption ? { ...out, caption } : out)
}

/**
 * The visual in words, for Titan's chat prompt (Titan can't see the card).
 * Tables and graphs are spelled out; other figures are given as their spec.
 */
export function describeVisual(v) {
  if (!v) return ''
  const cap = v.caption ? ` (caption: "${v.caption}")` : ''
  if (v.type === 'table') {
    const lines = [`Table shown${cap}:`]
    if (v.headers.length) lines.push(`  | ${v.headers.join(' | ')} |`)
    v.rows.forEach(r => lines.push(`  | ${r.join(' | ')} |`))
    return lines.join('\n')
  }
  if (v.type === 'graph') {
    return [
      `Graph shown, drawn to scale${cap}: x from ${v.xRange[0]} to ${v.xRange[1]}, y from ${v.yRange[0]} to ${v.yRange[1]}.`,
      ...v.functions.map((f, i) => `  Curve ${i + 1}: y = ${f.expr}${f.domain ? ` for ${f.domain[0]} ≤ x ≤ ${f.domain[1]}` : ''}`),
      ...v.points.map(p => `  Point at (${p.x}, ${p.y})${p.label ? ` labelled "${p.label}"` : ''}${p.open ? ' (hollow)' : ''}`),
      ...v.asymptotes.map(a => `  Dashed asymptote ${a.x != null ? `x = ${a.x}` : `y = ${a.y}`}`),
    ].join('\n')
  }
  const { caption: _c, ...spec } = v
  return `Diagram shown (${v.type.replace('_', ' ')})${cap}, drawn by the app from: ${JSON.stringify(spec).slice(0, 1200)}`
}

/**
 * Prompt lines telling the lesson writer how to add visuals. Chemistry also
 * gets lab apparatus, particle diagrams and TLC plates.
 */
export function visualPromptLines(subjectName = '') {
  const chem = /chem/i.test(subjectName)
  return [
    'VISUALS: a key idea, or the worked example, can have a "visual" the app draws: a table, a graph or a diagram. Add one wherever seeing it genuinely helps understanding (a table of values or results, the graph of a function, a labelled triangle or angle diagram, a number line, data as a bar chart or graph, a process or cycle as a flow chart). Aim for 1 to 3 visuals in the lesson; leave the key out where it adds nothing.',
    'A visual must agree exactly with the text beside it, and every value the text relies on must also be written in the text. Questions are shown on their own card, so never write a question that needs a visual to answer. Use one of these shapes:',
    '  table: {"type": "table", "headers": ["x", "y"], "rows": [["0", "1"], ["1", "3"]], "caption": "..."} (up to 8 columns and 14 rows; cells may use $...$)',
    '  graph (a function drawn to scale): {"type": "graph", "functions": [{"expr": "x^2 - 4", "domain": [-3, 3]}], "points": [{"x": 2, "y": 0, "label": "(2, 0)", "open": false}], "asymptotes": [{"x": 1}], "shade": [{"fn": 0, "from": 0, "to": 2}], "xRange": [-5, 5], "yRange": [-6, 6], "xLabel": "x", "yLabel": "y", "caption": "..."}',
    '    expr is plain arithmetic in x: numbers, + - * / ^ ( ), and abs sqrt exp log sin cos tan (log is the natural log; angles in radians), PI, E. Write 2*x, not 2x. domain, points, asymptotes and shade are optional.',
    '  bar_chart: {"type": "bar_chart", "title": "...", "xLabel": "...", "yLabel": "...", "bars": [{"label": "A", "value": 12}]}',
    '  number_line: {"type": "number_line", "min": -5, "max": 5, "step": 1, "marks": [{"value": -3, "label": "A", "open": false}], "jumps": [{"from": -3, "to": 2, "label": "+5"}]}',
    '  geometry (drawn to scale): {"type": "geometry", "points": {"A": [0, 0], "B": [4, 0], "C": [0, 3]}, "polygons": [{"vertices": ["A", "B", "C"]}], "segments": [{"from": "A", "to": "D", "dashed": true}], "sideLabels": [{"from": "A", "to": "B", "text": "4 cm"}], "angles": [{"at": "B", "from": "A", "to": "C", "text": "θ"}, {"at": "A", "from": "B", "to": "C", "right": true}], "circles": [{"center": "O", "radius": 5, "label": "r = 5"}]}',
    '    points are coordinates (y up) in the units of the text, so a 3-4-5 triangle has sides 3 and 4 long.',
    '  xy_plot (data or a sketch with titled axes: experimental results, distance–time, rate, energy profiles): {"type": "xy_plot", "xLabel": "Time (s)", "yLabel": "Distance (m)", "xRange": [0, 10], "yRange": [0, 50], "showNumbers": true, "series": [{"kind": "points" | "line" | "curve", "points": [[0, 0], [5, 20]], "label": "..."}], "hlines": [{"y": 30, "label": "..."}], "labels": [{"x": 5, "y": 40, "text": "..."}]}',
    '    For a qualitative sketch use "showNumbers": false.',
    '  flow_chart (a process, sequence or cycle): {"type": "flow_chart", "nodes": [{"id": "a", "text": "short label", "kind": "box" | "text", "row": 0, "col": 0}], "edges": [{"from": "a", "to": "b", "label": "optional"}]}',
    '    row (0 to 7, top to bottom) and col (0 to 4, left to right) place each node; keep node text under 30 characters.',
    ...(chem ? [
      '  particles (particle diagrams for states, mixtures and reactions): {"type": "particles", "boxes": [{"label": "before", "particles": [{"kind": "C", "count": 4}]}], "key": {"C": "H2"}}',
      '    kinds: A filled atom, B open atom, C two filled atoms bonded, D two open atoms bonded, E filled + open atom bonded, F small filled atom. Up to 3 boxes; conserve atoms across a reaction.',
      '  apparatus (labelled lab set-up): {"type": "apparatus", "kind": "galvanic_cell" | "electrolytic_cell" | "titration" | "reflux" | "distillation" | "calorimetry" | "gas_collection" | "gas_syringe" | "separating_funnel" | "filtration", "labels": {"slot": "text"}}',
      '    label slots: galvanic_cell left_electrode, left_solution, left_sign, right_electrode, right_solution, right_sign, salt_bridge, meter; electrolytic_cell left_electrode, left_sign, right_electrode, right_sign, electrolyte, power_supply; titration burette, flask; reflux flask, condenser, heat; distillation flask, thermometer, condenser, receiver, distillate; calorimetry thermometer, water, burner, fuel; gas_collection flask, reactants, cylinder, gas; gas_syringe flask, reactants, syringe; separating_funnel top_layer, bottom_layer; filtration mixture, residue, filtrate.',
      '  tlc_plate: {"type": "tlc_plate", "lanes": [{"label": "A", "spots": [0.25, 0.7]}]} (spots are Rf values between 0 and 1)',
    ] : []),
    'Every visual can have a short "caption".',
  ]
}
