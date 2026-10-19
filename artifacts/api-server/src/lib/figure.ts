// Structured maths figures. The model describes WHAT to draw (points, side and
// angle labels, number-line marks, bar values) and the app's FigureView draws
// it to scale. Stored on a question as diagram = { figure, caption }.
//
// NOTE: scripts/src/backfill-math-figures.ts keeps a copy of FIGURE_SCHEMA_LINES
// and sanitizeFigure (separate workspace package). Keep them in sync.

const FIGURE_TOPIC_RE =
  /(geometr|triangle|pythag|area|perimeter|angle|polygon|quadrilateral|circle|circumference|shape|volume|surface|prism|congruen|similar|transformation|trigonometr|bearing|statistic|data|chart|column graph|number line|coordinate|cartesian)/i;

/** Maths curricula get structured figures instead of free-form SVG. */
export function isMathSubject(subject: string): boolean {
  return /math/i.test(subject);
}

/** Topics where most questions should come with a figure. */
export function topicWantsFigures(...names: string[]): boolean {
  return names.some((n) => FIGURE_TOPIC_RE.test(n || ""));
}

export const FIGURE_SCHEMA_LINES = [
  `  figure (a maths figure the app draws to scale). Exactly one of these three shapes:`,
  `    geometry: { "type": "geometry", "points": { "A": [x, y], ... }, "polygons": [{ "vertices": ["A","B","C"] }], "segments": [{ "from": "A", "to": "D", "dashed": true }], "sideLabels": [{ "from": "A", "to": "B", "text": "8 cm" }], "angles": [{ "at": "B", "from": "A", "to": "C", "text": "35°" }, { "at": "A", "from": "B", "to": "C", "right": true }], "circles": [{ "center": "O", "radius": 5, "label": "r = 5 cm" }], "hiddenPoints": ["D"], "showPointNames": true, "caption": "<optional>" }`,
  `      points are maths coordinates (y up) in the SAME units as the question, so the figure is to scale (a 3-4-5 triangle: A [0,0], B [4,0], C [0,3]).`,
  `      Label every length/angle the question gives; label the unknown with its pronumeral (x, θ, ?) and never with its value. Mark right angles with "right": true. Use dashed segments for heights and diagonals. hiddenPoints hides helper point names (e.g. the foot of a height).`,
  `    number_line: { "type": "number_line", "min": -5, "max": 5, "step": 1, "marks": [{ "value": -3, "label": "A", "open": false }], "jumps": [{ "from": -3, "to": 2, "label": "+5" }] }`,
  `    bar_chart: { "type": "bar_chart", "title": "...", "xLabel": "...", "yLabel": "...", "bars": [{ "label": "AFL", "value": 12 }] }`,
  `    The question text must still state every value needed to answer it; the figure shows the same values and must agree with the text exactly. Never reveal the answer in the figure.`,
];

export function figureInstructions(required: boolean): string[] {
  return [
    required
      ? `  figure (REQUIRED for every question about a shape, angle, length, area, perimeter, volume, Pythagoras, a number line or a data display in this topic — students expect to see the figure. Omit only for questions with nothing to draw.)`
      : `  figure (optional — include when a shape, angle, number line or bar chart would help, e.g. any triangle, polygon, circle or composite shape question. Otherwise omit the key.)`,
    ...FIGURE_SCHEMA_LINES,
    `  For tables of values use table_data, and for graphs of functions use graph — not figure.`,
  ];
}

const MAX = 40;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const short = (v: unknown, n = 40) => (v == null ? undefined : String(v).slice(0, n));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, MAX) : []);
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** Keep only well-formed fields; null when nothing drawable remains. */
export function sanitizeFigure(raw: unknown): Obj | null {
  const f = obj(raw);
  const caption = short(f.caption, 160);
  if (f.type === "geometry") {
    const points: Record<string, [number, number]> = {};
    for (const [k, p] of Object.entries(obj(f.points)).slice(0, MAX)) {
      if (Array.isArray(p) && isNum(p[0]) && isNum(p[1]) && /^[A-Za-z][A-Za-z0-9']{0,2}$/.test(k)) points[k] = [p[0], p[1]];
    }
    const has = (n: unknown) => typeof n === "string" && n in points;
    const polygons = arr(f.polygons).map((p) => ({ vertices: arr(obj(p).vertices).filter(has) })).filter((p) => p.vertices.length >= 2);
    const segments = arr(f.segments).map(obj).filter((s) => has(s.from) && has(s.to)).map((s) => ({ from: s.from, to: s.to, dashed: !!s.dashed }));
    const sideLabels = arr(f.sideLabels).map(obj).filter((s) => has(s.from) && has(s.to) && s.text != null).map((s) => ({ from: s.from, to: s.to, text: short(s.text) }));
    const angles = arr(f.angles).map(obj).filter((a) => has(a.at) && has(a.from) && has(a.to)).map((a) => ({ at: a.at, from: a.from, to: a.to, ...(a.right ? { right: true } : {}), ...(a.text != null ? { text: short(a.text) } : {}) }));
    const circles = arr(f.circles).map(obj).filter((c) => has(c.center) && isNum(c.radius) && c.radius > 0).map((c) => ({ center: c.center, radius: c.radius, ...(c.label != null ? { label: short(c.label) } : {}) }));
    if (!Object.keys(points).length || (!polygons.length && !segments.length && !circles.length)) return null;
    return {
      type: "geometry", points, polygons, segments, sideLabels, angles, circles,
      hiddenPoints: arr(f.hiddenPoints).filter(has),
      showPointNames: f.showPointNames !== false,
      ...(caption ? { caption } : {}),
    };
  }
  if (f.type === "number_line") {
    if (!isNum(f.min) || !isNum(f.max) || f.max <= f.min) return null;
    return {
      type: "number_line", min: f.min, max: f.max, ...(isNum(f.step) && f.step > 0 ? { step: f.step } : {}),
      marks: arr(f.marks).map(obj).filter((m) => isNum(m.value)).map((m) => ({ value: m.value, ...(m.label != null ? { label: short(m.label) } : {}), open: !!m.open })),
      jumps: arr(f.jumps).map(obj).filter((j) => isNum(j.from) && isNum(j.to)).map((j) => ({ from: j.from, to: j.to, ...(j.label != null ? { label: short(j.label) } : {}) })),
      ...(caption ? { caption } : {}),
    };
  }
  if (f.type === "bar_chart") {
    const bars = arr(f.bars).map(obj).filter((b) => isNum(b.value)).slice(0, 12).map((b) => ({ label: short(b.label) ?? "", value: b.value }));
    if (!bars.length) return null;
    return {
      type: "bar_chart", bars,
      ...(f.title ? { title: short(f.title, 60) } : {}), ...(f.xLabel ? { xLabel: short(f.xLabel) } : {}), ...(f.yLabel ? { yLabel: short(f.yLabel) } : {}),
      ...(caption ? { caption } : {}),
    };
  }
  return null;
}

/** The value stored in questions.diagram: a structured figure wins over raw SVG. */
export function diagramColumn(q: { figure?: unknown; diagram?: unknown }): unknown {
  const fig = sanitizeFigure(q.figure);
  if (fig) return { figure: fig, ...(typeof fig.caption === "string" ? { caption: fig.caption } : {}) };
  return q.diagram || null;
}
