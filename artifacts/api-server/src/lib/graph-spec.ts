// Function graphs on questions (questions.graph), drawn by the web app's
// GraphView. The model writes the spec; this file keeps it well-formed and
// describes it in words for the answer verifier, which cannot see the image.
//
// {
//   functions:  [{ expr: "x**2 - 4", domain?: [a, b], color?: "#hex" }],
//   points:     [{ x, y, label?, open?: true }],     // open = hollow endpoint
//   asymptotes: [{ x: 2, label? } | { y: -1, label? }],  // dashed lines
//   shade:      [{ fn: 0, from, to, to_fn?: 1 }],    // region under fn (or between fn and to_fn)
//   xRange: [min, max], yRange: [min, max], xLabel?: "t", yLabel?: "V"
// }

type Obj = Record<string, unknown>;
const MAX = 12;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, MAX) : []);
const str = (v: unknown, n = 40) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
const pair = (v: unknown): [number, number] | undefined =>
  Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]) && v[0] < v[1] ? [v[0], v[1]] : undefined;

/** Keep only well-formed fields; null when there is nothing to draw. */
export function sanitizeGraph(raw: unknown): Obj | null {
  if (!raw || typeof raw !== "object") return null;
  const g = obj(raw);
  const functions = arr(g.functions).map(obj)
    .filter((f) => typeof f.expr === "string" && f.expr.trim())
    .map((f) => ({ expr: String(f.expr).slice(0, 200), domain: pair(f.domain), color: str(f.color, 9) }));
  const points = arr(g.points).map(obj).filter((p) => isNum(p.x) && isNum(p.y))
    .map((p) => ({ x: p.x, y: p.y, label: str(p.label), open: p.open === true ? true : undefined }));
  const asymptotes = arr(g.asymptotes).map(obj)
    .filter((a) => isNum(a.x) !== isNum(a.y))
    .map((a) => (isNum(a.x) ? { x: a.x, label: str(a.label) } : { y: a.y as number, label: str(a.label) }));
  const shade = arr(g.shade).map(obj)
    .filter((s) => Number.isInteger(s.fn) && (s.fn as number) < functions.length && isNum(s.from) && isNum(s.to) && s.from < s.to)
    .map((s) => ({
      fn: s.fn as number, from: s.from as number, to: s.to as number,
      to_fn: Number.isInteger(s.to_fn) && (s.to_fn as number) < functions.length ? (s.to_fn as number) : undefined,
    }));
  if (!functions.length && !points.length) return null;
  return {
    functions, points, asymptotes, shade,
    xRange: pair(g.xRange) ?? [-5, 5],
    yRange: pair(g.yRange) ?? [-6, 6],
    xLabel: str(g.xLabel, 8),
    yLabel: str(g.yLabel, 8),
  };
}

/**
 * The graph as the student sees it, in words, appended to the question sent to
 * the verifier. Exact values are only what is labelled; everything else is read
 * off the drawing, so a question that needs an unlabelled value exactly is
 * flawed.
 */
export function describeGraph(raw: unknown): string {
  const g = sanitizeGraph(raw);
  if (!g) return "";
  const fns = g.functions as { expr: string; domain?: [number, number] }[];
  const pts = g.points as { x: number; y: number; label?: string; open?: boolean }[];
  const asy = g.asymptotes as { x?: number; y?: number; label?: string }[];
  const shade = g.shade as { fn: number; from: number; to: number; to_fn?: number }[];
  const lines = [
    "[Graph shown to the student, drawn to scale. The student does NOT see the formulas below, only the curves.",
    "They can read labelled points and asymptotes exactly, other values only approximately from the grid.",
    "If answering needs a value that is neither stated in the question nor labelled on the graph, the question is flawed.]",
    `Window: x from ${(g.xRange as number[])[0]} to ${(g.xRange as number[])[1]}, y from ${(g.yRange as number[])[0]} to ${(g.yRange as number[])[1]}.`,
    ...fns.map((f, i) => `Curve ${i + 1} (hidden rule): y = ${f.expr}${f.domain ? `, drawn only for ${f.domain[0]} ≤ x ≤ ${f.domain[1]}` : ""}`),
    ...pts.map((p) => `Point${p.open ? " (hollow, excluded)" : ""} at (${p.x}, ${p.y})${p.label ? ` labelled "${p.label}"` : " (no label)"}`),
    ...asy.map((a) => `Dashed asymptote ${a.x != null ? `x = ${a.x}` : `y = ${a.y}`}${a.label ? ` labelled "${a.label}"` : ""}`),
    ...shade.map((s) => `Shaded region ${s.to_fn != null ? `between curves ${s.fn + 1} and ${s.to_fn + 1}` : `between curve ${s.fn + 1} and the x-axis`} for ${s.from} ≤ x ≤ ${s.to}`),
  ];
  return lines.join("\n");
}
