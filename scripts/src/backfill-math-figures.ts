/**
 * One-time backfill: give existing maths questions the figure they should have.
 *
 * Picks maths questions with no figure, graph, table or image whose topic is
 * about shapes / measurement / data (geometry, Pythagoras, area, angles,
 * statistics, number lines…) or whose text refers to a figure ("shown",
 * "below", "diagram"). For each, an AI reads the question and returns ONE of:
 *   - figure      → stored as diagram = { figure, caption, backfilled }
 *   - table_data  → a table of values
 *   - graph       → a function graph
 *   - none        → nothing would help (reported, row untouched)
 * The figure is a structured spec the app draws to scale (FigureView.jsx).
 *
 * Dry-run by default: prints and writes a JSON report of what WOULD change.
 * Pass --apply to write. Rows are only updated while still figure-less, and
 * every write is tagged `backfilled` so it can be found (and undone) later:
 *   update questions set diagram = null where diagram ? 'backfilled';
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<k> ANTHROPIC_API_KEY=<a> \
 *     pnpm --filter @workspace/scripts run backfill:math-figures                       # dry run, all
 *   ... -- --subject "Year 6 Mathematics" --limit 25 --apply                           # a sample
 *   ... -- --report figures-report.json --concurrency 4
 *
 * NOTE: FIGURE_SCHEMA_LINES and sanitizeFigure mirror
 * artifacts/api-server/src/lib/figure.ts (separate package). Keep them in sync.
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

const args = process.argv.slice(2);
function argValue(name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}
const SERVICE_KEY = argValue("--key") || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = args.includes("--apply");
const SUBJECT = argValue("--subject");
const LIMIT = Number(argValue("--limit") || "0") || 0;
const CONCURRENCY = Math.max(1, Number(argValue("--concurrency") || "4") || 4);
const REPORT = argValue("--report") || "math-figures-report.json";

const ANTHROPIC_KEY = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_BASE = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const MODEL = process.env.AI_FIGURE_MODEL || "claude-sonnet-4-6";

if (!SERVICE_KEY) { console.error("ERROR: set SUPABASE_SERVICE_KEY or pass --key"); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error("ERROR: set ANTHROPIC_API_KEY"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const BACKFILL_TAG = new Date().toISOString().slice(0, 10);

const FIGURE_TOPIC_RE =
  /(geometr|triangle|pythag|area|perimeter|angle|polygon|quadrilateral|circle|circumference|shape|volume|surface|prism|congruen|similar|transformation|trigonometr|bearing|statistic|data|chart|column graph|number line|coordinate|cartesian)/i;
const REFERS_TO_FIGURE_RE = /\b(shown|below|diagram|figure|pictured|graph above|table above)\b/i;

// ─── mirror of api-server/src/lib/figure.ts ──────────────────────────────────
const FIGURE_SCHEMA_LINES = [
  `  figure (a maths figure the app draws to scale). Exactly one of these three shapes:`,
  `    geometry: { "type": "geometry", "points": { "A": [x, y], ... }, "polygons": [{ "vertices": ["A","B","C"] }], "segments": [{ "from": "A", "to": "D", "dashed": true }], "sideLabels": [{ "from": "A", "to": "B", "text": "8 cm" }], "angles": [{ "at": "B", "from": "A", "to": "C", "text": "35°" }, { "at": "A", "from": "B", "to": "C", "right": true }], "circles": [{ "center": "O", "radius": 5, "label": "r = 5 cm" }], "hiddenPoints": ["D"], "showPointNames": true, "caption": "<optional>" }`,
  `      points are maths coordinates (y up) in the SAME units as the question, so the figure is to scale (a 3-4-5 triangle: A [0,0], B [4,0], C [0,3]).`,
  `      Label every length/angle the question gives; label the unknown with its pronumeral (x, θ, ?) and never with its value. Mark right angles with "right": true. Use dashed segments for heights and diagonals. hiddenPoints hides helper point names (e.g. the foot of a height).`,
  `    number_line: { "type": "number_line", "min": -5, "max": 5, "step": 1, "marks": [{ "value": -3, "label": "A", "open": false }], "jumps": [{ "from": -3, "to": 2, "label": "+5" }] }`,
  `    bar_chart: { "type": "bar_chart", "title": "...", "xLabel": "...", "yLabel": "...", "bars": [{ "label": "AFL", "value": 12 }] }`,
  `    The question text must still state every value needed to answer it; the figure shows the same values and must agree with the text exactly. Never reveal the answer in the figure.`,
];

type Obj = Record<string, unknown>;
const MAX = 40;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const short = (v: unknown, n = 40) => (v == null ? undefined : String(v).slice(0, n));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, MAX) : []);
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

function sanitizeFigure(raw: unknown): Obj | null {
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
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeTable(raw: unknown): Obj | null {
  const t = obj(raw);
  const headers = arr(t.headers).map((h) => String(h).slice(0, 40));
  const rows = arr(t.rows).filter(Array.isArray).map((r) => (r as unknown[]).slice(0, 12).map((c) => (isNum(c) ? c : String(c ?? "").slice(0, 40))));
  if (headers.length < 1 || rows.length < 1) return null;
  return { headers, rows, ...(t.caption ? { caption: short(t.caption, 120) } : {}) };
}

function sanitizeGraph(raw: unknown): Obj | null {
  const g = obj(raw);
  const functions = arr(g.functions).map(obj).filter((f) => typeof f.expr === "string" && f.expr.length < 120).map((f) => ({ expr: f.expr, ...(f.color ? { color: short(f.color, 12) } : {}) }));
  const points = arr(g.points).map(obj).filter((p) => isNum(p.x) && isNum(p.y)).map((p) => ({ x: p.x, y: p.y, ...(p.label != null ? { label: short(p.label) } : {}) }));
  const range = (r: unknown) => (Array.isArray(r) && isNum(r[0]) && isNum(r[1]) && r[1] > r[0] ? [r[0], r[1]] : undefined);
  if (!functions.length && !points.length) return null;
  return { functions, points, ...(range(g.xRange) ? { xRange: range(g.xRange) } : {}), ...(range(g.yRange) ? { yRange: range(g.yRange) } : {}) };
}

type Row = {
  id: string; subject: string; topic: string | null; subtopic: string | null; question: string;
  options: string[] | null; answer_index: number | null; question_type: string | null;
  answer: unknown; solution: string | null;
};

function parseObject(text: string): Obj {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error(`No JSON in response: ${text.slice(0, 160)}`);
  return JSON.parse(text.slice(start, end + 1));
}

function promptFor(q: Row): string {
  const answerText = Array.isArray(q.options) && q.answer_index != null
    ? q.options.map((o, i) => `${String.fromCharCode(65 + i)}${i === q.answer_index ? " (correct)" : ""}: ${o}`).join("\n")
    : `Answer: ${JSON.stringify(q.answer)}`;
  return `You are adding a figure to an existing ${q.subject} practice question (topic: ${q.topic ?? ""} — ${q.subtopic ?? ""}).

Question: ${q.question}
${answerText}
Worked solution: ${q.solution ?? "(none)"}

Decide whether students would be helped by ONE visual, and if so produce it. Choose:
- "figure" for a shape, angle, length, area, Pythagoras, circle, composite shape, number line or bar chart;
- "table_data" for a table of values or frequencies: { "headers": [...], "rows": [[...], ...], "caption": "<optional>" };
- "graph" for a function graph: { "functions": [{ "expr": "<JS expression in x, ** for powers>" }], "points": [{ "x": 1, "y": 2 }], "xRange": [min, max], "yRange": [min, max] };
- "none" if the question is purely numeric/algebraic or there is nothing meaningful to draw.
If the question text refers to a figure that isn't there ("shown", "below", "diagram"), draw that figure from the information in the text and solution.

Figure format:
${FIGURE_SCHEMA_LINES.join("\n")}

Rules: the visual must agree exactly with every value in the question; label unknowns with their pronumeral or "?", never with the answer; keep it simple and uncluttered.

Respond with ONLY one JSON object, no prose:
{"kind":"figure","figure":{...}} | {"kind":"table_data","table_data":{...}} | {"kind":"graph","graph":{...}} | {"kind":"none","reason":"<few words>"}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

async function ask(prompt: string): Promise<Obj> {
  let lastErr: Error = new Error("request failed");
  for (let attempt = 0; attempt <= 6; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    let resp: Response | null = null;
    try {
      resp = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 2500, messages: [{ role: "user", content: prompt }] }),
      });
      if (resp.ok) {
        const body = (await resp.json()) as { content?: { text?: string }[] };
        return parseObject((body.content?.[0]?.text ?? "").trim());
      }
    } catch (err) {
      lastErr = err as Error;
    } finally {
      clearTimeout(timer);
    }
    if (resp?.ok) throw lastErr;
    if (resp && !RETRYABLE.has(resp.status)) throw new Error(`Anthropic API ${resp.status}`);
    if (resp) lastErr = new Error(`Anthropic API ${resp.status}`);
    const retryAfter = resp ? Number(resp.headers.get("retry-after")) : NaN;
    await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 30_000)) + Math.random() * 500);
  }
  throw lastErr;
}

async function loadCandidates(): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from("questions")
      .select("id, subject, topic, subtopic, question, options, answer_index, question_type, answer, solution")
      .ilike("subject", "%math%")
      .is("diagram", null).is("graph", null).is("table_data", null).is("image_url", null)
      .order("id")
      .range(from, from + 999);
    if (SUBJECT) query = query.eq("subject", SUBJECT);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out.filter((q) =>
    FIGURE_TOPIC_RE.test(`${q.topic ?? ""} ${q.subtopic ?? ""}`) || REFERS_TO_FIGURE_RE.test(q.question ?? ""));
}

async function main() {
  let rows = await loadCandidates();
  // Questions that point at a missing figure go first: they're broken today.
  rows.sort((a, b) => Number(REFERS_TO_FIGURE_RE.test(b.question)) - Number(REFERS_TO_FIGURE_RE.test(a.question)));
  if (LIMIT) rows = rows.slice(0, LIMIT);
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} · ${rows.length} candidate questions${SUBJECT ? ` in ${SUBJECT}` : ""} · model ${MODEL}`);

  const results: Obj[] = [];
  const counts: Record<string, number> = { figure: 0, table_data: 0, graph: 0, none: 0, invalid: 0, error: 0, written: 0 };
  let cursor = 0;

  const worker = async () => {
    while (cursor < rows.length) {
      const q = rows[cursor++];
      const refersToFigure = REFERS_TO_FIGURE_RE.test(q.question);
      try {
        const res = await ask(promptFor(q));
        const kind = String(res.kind ?? "none");
        let update: Obj | null = null;
        if (kind === "figure") {
          const figure = sanitizeFigure(res.figure);
          if (figure) update = { diagram: { figure, ...(figure.caption ? { caption: figure.caption } : {}), backfilled: BACKFILL_TAG } };
        } else if (kind === "table_data") {
          const table = sanitizeTable(res.table_data);
          if (table) update = { table_data: { ...table, backfilled: BACKFILL_TAG } };
        } else if (kind === "graph") {
          const graph = sanitizeGraph(res.graph);
          if (graph) update = { graph: { ...graph, backfilled: BACKFILL_TAG } };
        }
        const outcome = update ? kind : kind === "none" ? "none" : "invalid";
        counts[outcome]++;
        if (update && APPLY) {
          // Only fill rows that are still figure-less (never overwrite).
          const { data, error } = await supabase.from("questions").update(update)
            .eq("id", q.id).is("diagram", null).is("graph", null).is("table_data", null).select("id");
          if (error) throw new Error(error.message);
          if (data?.length) counts.written++;
        }
        results.push({ id: q.id, subject: q.subject, subtopic: q.subtopic, question: q.question, refersToFigure, outcome, reason: res.reason ?? null, update });
      } catch (err) {
        counts.error++;
        results.push({ id: q.id, subject: q.subject, question: q.question, refersToFigure, outcome: "error", reason: (err as Error).message });
      }
      const done = results.length;
      if (done % 25 === 0 || done === rows.length) console.log(`  ${done}/${rows.length} · ${JSON.stringify(counts)}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length || 1) }, worker));

  writeFileSync(REPORT, JSON.stringify({ apply: APPLY, tag: BACKFILL_TAG, counts, results }, null, 2));
  console.log(`\nDone. ${JSON.stringify(counts)}\nReport written to ${REPORT}`);
  const brokenLeft = results.filter((r) => r.refersToFigure && (r.outcome === "none" || r.outcome === "invalid" || r.outcome === "error"));
  if (brokenLeft.length) {
    console.log(`\n${brokenLeft.length} question(s) refer to a figure but none could be added:`);
    for (const r of brokenLeft) console.log(`  ${r.id} · ${String(r.question).slice(0, 110)}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
