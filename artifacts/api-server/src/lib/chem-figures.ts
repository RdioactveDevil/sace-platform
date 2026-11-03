import { Molecule, type MoleculeToSVGOptions } from "openchemlib";
import { sanitizeFigure } from "./figure";

/**
 * Chemistry figures for generated questions, in the style of the SACE
 * Chemistry exam:
 *
 *  - structures: the model writes each molecule as SMILES (a precise text
 *    code it handles well). Here every SMILES is parsed, its molecular formula
 *    checked against the one the model claimed, and the structure drawn the
 *    way SACE draws it: a skeletal formula with heteroatoms labelled, or, for
 *    small molecules, the full structural formula with every hydrogen. A
 *    structure that doesn't parse or doesn't match drops the question.
 *  - figure: a chemistry graph (calibration graph, titration curve,
 *    concentration/rate against time, energy profile) or a TLC plate,
 *    described as data and drawn to scale by the app.
 *
 * Stored on a question as diagram = { structures?: [...], figure?: {...}, caption? }.
 */


/** Chemistry curricula get these figures (and the SACE conventions below). */
export function isChemSubject(subject: string): boolean {
  return /chem/i.test(subject || "");
}

// The full structural formula (every H drawn) only stays readable for small molecules.
const FULL_MAX_HEAVY_ATOMS = 8;
const MAX_STRUCTURES = 4;

export type StoredStructure = {
  smiles: string;
  label?: string;
  formula: string;
  style: "skeletal" | "full";
  /** Black-on-transparent SVG; the app recolours it for the theme. */
  svg: string;
};

const SVG_OPTS: MoleculeToSVGOptions = {
  autoCrop: true,
  autoCropMargin: 12,
  suppressChiralText: true,
  suppressCIPParity: true,
  suppressESR: true,
  noStereoProblem: true,
  noImplicitAtomLabelColors: true,
  strokeWidth: 1.2,
  fontWeight: "normal",
};

/** Element counts from a formula like C4H8O2 or C2H7NO (charges and dots ignored). */
export function formulaCounts(formula: string): Record<string, number> {
  const counts: Record<string, number> = {};
  // Drop spaces, a trailing charge (2+, -, ^+) and any hydrate dot.
  const clean = String(formula || "").trim()
    .replace(/(\s|\^)\d*[+\-−]$/, "")
    .replace(/\s+/g, "")
    .replace(/[·.]/g, "");
  for (const [, el, n] of clean.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    counts[el] = (counts[el] || 0) + (n ? Number(n) : 1);
  }
  return counts;
}

export function sameFormula(a: string, b: string): boolean {
  const x = formulaCounts(a), y = formulaCounts(b);
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) if ((x[k] || 0) !== (y[k] || 0)) return false;
  return keys.size > 0;
}

function monochrome(svg: string): string {
  return svg
    .replace(/rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/g, "#000000")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
}

/** Draw one SMILES. Throws when it isn't a valid molecule. */
export function drawStructure(smiles: string, style: "skeletal" | "full" = "skeletal", id = "s"): StoredStructure {
  const mol = Molecule.fromSmiles(smiles);
  if (mol.getAllAtoms() === 0) throw new Error("empty structure");
  const formula = mol.getMolecularFormula().formula;
  const heavy = mol.getAtoms();
  const useFull = style === "full" && heavy <= FULL_MAX_HEAVY_ATOMS;
  let drawn = mol;
  if (useFull) {
    // Every H drawn; wedges and hashes would only clutter it, so stereo bonds become plain bonds.
    drawn = mol.getCompactCopy();
    const flatten = () => {
      drawn.ensureHelperArrays(Molecule.cHelperNeighbours);
      for (let a = 0; a < drawn.getAllAtoms(); a++) drawn.convertStereoBondsToSingleBonds(a);
    };
    flatten();
    drawn.addImplicitHydrogens();
    drawn.inventCoordinates({ keepHydrogens: true, seed: 7 });
    flatten();
  }
  const svg = drawn.toSVG(useFull ? 380 : 320, useFull ? 260 : 220, id, SVG_OPTS);
  return { smiles, formula, style: useFull ? "full" : "skeletal", svg: monochrome(svg) };
}

/**
 * Check and draw a question's structures. Each raw item: { smiles, label?, formula?, style? }.
 * `problems` lists anything wrong; callers drop the question when it isn't empty.
 */
export function buildStructures(raw: unknown): { structures: StoredStructure[]; problems: string[] } {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_STRUCTURES) : [];
  const structures: StoredStructure[] = [];
  const problems: string[] = [];
  list.forEach((item, i) => {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const smiles = typeof o.smiles === "string" ? o.smiles.trim() : "";
    const label = typeof o.label === "string" ? o.label.trim().slice(0, 80) : "";
    if (!smiles) { if (label) problems.push(`Structure ${i + 1} (${label}) has no SMILES`); return; }
    if (smiles.length > 300) { problems.push(`Structure ${i + 1} is too large`); return; }
    try {
      const s = drawStructure(smiles, o.style === "full" ? "full" : "skeletal", `st${i}_${Math.random().toString(36).slice(2, 7)}`);
      const claimed = typeof o.formula === "string" ? o.formula.trim() : "";
      if (claimed && !sameFormula(claimed, s.formula)) {
        problems.push(`Structure ${i + 1}${label ? ` (${label})` : ""} is ${s.formula}, not the ${claimed} the question says`);
        return;
      }
      structures.push(label ? { ...s, label } : s);
    } catch {
      problems.push(`Structure ${i + 1}${label ? ` (${label})` : ""} isn't a valid molecule (${smiles.slice(0, 60)})`);
    }
  });
  return { structures, problems };
}

// ── Graphs and TLC plates ────────────────────────────────────────────────────

const MAX = 40;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const short = (v: unknown, n = 60) => (v == null ? undefined : String(v).slice(0, n));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, MAX) : []);
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const point = (p: unknown): [number, number] | null =>
  Array.isArray(p) && isNum(p[0]) && isNum(p[1]) ? [p[0], p[1]] : null;
const range = (r: unknown): [number, number] | null =>
  Array.isArray(r) && isNum(r[0]) && isNum(r[1]) && r[1] > r[0] ? [r[0], r[1]] : null;

/** Keep only well-formed chemistry figure fields; null when nothing drawable remains. */
export function sanitizeChemFigure(raw: unknown): Obj | null {
  const f = obj(typeof raw === "string" ? safeJson(raw) : raw);
  const caption = short(f.caption, 160);
  if (f.type === "xy_plot") {
    const xRange = range(f.xRange), yRange = range(f.yRange);
    if (!xRange || !yRange) return null;
    const series = arr(f.series).map(obj).map((s) => ({
      kind: s.kind === "line" || s.kind === "curve" ? s.kind : "points",
      points: arr(s.points).map(point).filter((p): p is [number, number] => !!p),
      ...(s.label ? { label: short(s.label, 40) } : {}),
      ...(s.dashed ? { dashed: true } : {}),
      ...(s.arrow ? { arrow: true } : {}),
    })).filter((s) => (s.kind === "points" ? s.points.length >= 1 : s.points.length >= 2)).slice(0, 6);
    const hlines = arr(f.hlines).map(obj).filter((l) => isNum(l.y)).map((l) => ({ y: l.y, ...(l.label ? { label: short(l.label, 40) } : {}), dashed: l.dashed !== false }));
    const vlines = arr(f.vlines).map(obj).filter((l) => isNum(l.x)).map((l) => ({ x: l.x, ...(l.label ? { label: short(l.label, 40) } : {}), dashed: l.dashed !== false }));
    const labels = arr(f.labels).map(obj).filter((l) => isNum(l.x) && isNum(l.y) && l.text != null).map((l) => ({ x: l.x, y: l.y, text: short(l.text, 40) }));
    const arrows = arr(f.arrows).map(obj).map((a) => ({ from: point(a.from), to: point(a.to), text: short(a.text, 30), both: !!a.both }))
      .filter((a) => a.from && a.to).map((a) => ({ from: a.from, to: a.to, ...(a.text ? { text: a.text } : {}), ...(a.both ? { both: true } : {}) }));
    if (!series.length && !hlines.length) return null;
    return {
      type: "xy_plot", xRange, yRange,
      ...(isNum(f.xStep) && f.xStep > 0 ? { xStep: f.xStep } : {}),
      ...(isNum(f.yStep) && f.yStep > 0 ? { yStep: f.yStep } : {}),
      xLabel: short(f.xLabel) ?? "", yLabel: short(f.yLabel) ?? "",
      showNumbers: f.showNumbers !== false, grid: f.grid !== false,
      series, hlines, vlines, labels, arrows,
      ...(caption ? { caption } : {}),
    };
  }
  if (f.type === "tlc_plate") {
    const lanes = arr(f.lanes).map(obj).map((l) => ({
      label: short(l.label, 20) ?? "",
      spots: arr(l.spots).filter((r): r is number => isNum(r) && r > 0 && r < 1).slice(0, 6),
    })).filter((l) => l.label || l.spots.length).slice(0, 6);
    if (!lanes.length) return null;
    return {
      type: "tlc_plate", lanes,
      ...(isNum(f.solventFrontCm) && f.solventFrontCm > 0 ? { solventFrontCm: f.solventFrontCm } : {}),
      showRuler: !!f.showRuler,
      ...(caption ? { caption } : {}),
    };
  }
  if (f.type === "flow_chart") {
    const ids = new Set<string>();
    const nodes = arr(f.nodes).map(obj).map((n) => ({
      id: short(n.id, 20) ?? "",
      text: short(n.text, 50) ?? "",
      kind: n.kind === "text" ? "text" : "box",
      row: Math.max(0, Math.min(7, Math.round(Number(n.row)) || 0)),
      col: Math.max(0, Math.min(4, Math.round(Number(n.col)) || 0)),
    })).filter((n) => n.id && n.text && !ids.has(n.id) && ids.add(n.id)).slice(0, 14);
    const has = new Set(nodes.map((n) => n.id));
    const edges = arr(f.edges).map(obj)
      .filter((e) => has.has(String(e.from)) && has.has(String(e.to)) && e.from !== e.to)
      .map((e) => ({ from: String(e.from), to: String(e.to), ...(e.label ? { label: short(e.label, 50) } : {}) }))
      .slice(0, 20);
    if (nodes.length < 2 || !edges.length) return null;
    return { type: "flow_chart", nodes, edges, ...(caption ? { caption } : {}) };
  }
  if (f.type === "apparatus") {
    const slots = APPARATUS_SLOTS[String(f.kind)];
    if (!slots) return null;
    const given = obj(f.labels);
    const labels: Record<string, string> = {};
    for (const k of slots) if (given[k] != null && String(given[k]).trim()) labels[k] = String(given[k]).trim().slice(0, 40);
    const out: Obj = { type: "apparatus", kind: f.kind, labels };
    if (f.kind === "galvanic_cell" && ["left_to_right", "right_to_left"].includes(String(f.electronFlow))) out.electronFlow = f.electronFlow;
    if (f.kind === "distillation" && f.fractional) out.fractional = true;
    if (f.kind === "glassware") {
      if (!GLASSWARE.includes(String(f.item))) return null;
      out.item = f.item;
    }
    if (caption) out.caption = caption;
    return out;
  }
  if (f.type === "particles") {
    const kinds = new Set(PARTICLE_KINDS);
    const boxes = arr(f.boxes).map(obj).map((b) => ({
      label: short(b.label, 40) ?? "",
      particles: arr(b.particles).map(obj)
        .filter((p) => kinds.has(String(p.kind)) && isNum(p.count) && p.count > 0)
        .map((p) => ({ kind: String(p.kind), count: Math.min(20, Math.round(p.count as number)) })),
    })).filter((b) => b.particles.length).slice(0, 3);
    if (!boxes.length) return null;
    const keyIn = obj(f.key);
    const key: Record<string, string> = {};
    for (const k of PARTICLE_KINDS) if (keyIn[k] != null && String(keyIn[k]).trim()) key[k] = String(keyIn[k]).trim().slice(0, 30);
    return { type: "particles", boxes, key, ...(caption ? { caption } : {}) };
  }
  // Bar charts (e.g. emissions by source) use the maths figure's bar_chart.
  if (f.type === "bar_chart") return sanitizeFigure(f);
  return null;
}

/** Single pieces of glassware the app can draw, for "name this equipment" questions. */
export const GLASSWARE = ["pipette", "volumetric_flask", "measuring_cylinder", "burette", "conical_flask", "beaker"];

/**
 * Particle diagram kinds: A filled atom, B open atom, C filled–filled
 * molecule, D open–open molecule, E filled–open molecule, F small filled atom.
 */
export const PARTICLE_KINDS = ["A", "B", "C", "D", "E", "F"];

/**
 * Labelled apparatus the app can draw, and the label slots each one has.
 * Labels left out are left blank on the drawing (e.g. so the student names them).
 */
export const APPARATUS_SLOTS: Record<string, string[]> = {
  galvanic_cell: ["left_electrode", "left_solution", "left_sign", "right_electrode", "right_solution", "right_sign", "salt_bridge", "meter"],
  electrolytic_cell: ["left_electrode", "left_sign", "right_electrode", "right_sign", "electrolyte", "power_supply", "left_product", "right_product"],
  titration: ["burette", "flask", "stand"],
  reflux: ["flask", "condenser", "heat", "water_in", "water_out"],
  distillation: ["flask", "thermometer", "column", "condenser", "water_in", "water_out", "receiver", "distillate", "heat"],
  calorimetry: ["thermometer", "can", "water", "burner", "fuel"],
  gas_collection: ["flask", "reactants", "delivery_tube", "cylinder", "gas", "trough"],
  gas_syringe: ["flask", "reactants", "syringe", "reading"],
  separating_funnel: ["funnel", "top_layer", "bottom_layer", "tap", "beaker"],
  filtration: ["mixture", "funnel", "filter_paper", "residue", "filtrate"],
  glassware: ["name"],
};

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

/** questions.diagram for a chemistry question, or null when it has nothing to draw. */
export function chemDiagramColumn(structures: StoredStructure[], figure: Obj | null, caption?: string): Obj | null {
  if (!structures.length && !figure) return null;
  return {
    ...(structures.length ? { structures } : {}),
    ...(figure ? { figure } : {}),
    ...(caption ? { caption: caption.slice(0, 160) } : {}),
  };
}

/** Plain-text description of a chemistry diagram, for the checker and the marker. */
export function describeChemDiagram(diagram: unknown): string {
  const d = obj(diagram);
  const lines: string[] = [];
  arr(d.structures).map(obj).forEach((s, i) => {
    lines.push(`Structure ${i + 1}${s.label ? ` (${s.label})` : ""}, shown as a ${s.style === "full" ? "full structural" : "skeletal"} formula: SMILES ${s.smiles}, molecular formula ${s.formula}.`);
  });
  const f = obj(d.figure);
  if (f.type === "xy_plot") {
    lines.push(`Graph: x axis "${f.xLabel}" ${JSON.stringify(f.xRange)}, y axis "${f.yLabel}" ${JSON.stringify(f.yRange)}${f.showNumbers === false ? " (no numbers on the axes)" : ""}.`);
    arr(f.series).map(obj).forEach((s) => lines.push(`  ${s.kind === "points" ? "Plotted points" : s.kind === "line" ? "Straight line" : "Smooth curve"}${s.label ? ` "${s.label}"` : ""}: ${JSON.stringify(s.points)}`));
    arr(f.hlines).map(obj).forEach((l) => lines.push(`  Horizontal line at y = ${l.y}${l.label ? ` labelled "${l.label}"` : ""}`));
    arr(f.vlines).map(obj).forEach((l) => lines.push(`  Vertical line at x = ${l.x}${l.label ? ` labelled "${l.label}"` : ""}`));
    arr(f.arrows).map(obj).forEach((a) => lines.push(`  Arrow from ${JSON.stringify(a.from)} to ${JSON.stringify(a.to)}${a.text ? ` labelled "${a.text}"` : ""}`));
    arr(f.labels).map(obj).forEach((l) => lines.push(`  Label "${l.text}" at (${l.x}, ${l.y})`));
  } else if (f.type === "tlc_plate") {
    lines.push(`TLC plate${isNum(f.solventFrontCm) ? `, solvent front ${f.solventFrontCm} cm from the origin` : ""}:`);
    arr(f.lanes).map(obj).forEach((l) => lines.push(`  Lane "${l.label}": spots at Rf ${arr(l.spots).join(", ") || "none"}`));
  } else if (f.type === "flow_chart") {
    const nodes = arr(f.nodes).map(obj);
    const name = (id: unknown) => { const n = nodes.find((x) => x.id === id); return n ? `${n.kind === "box" ? "[" : ""}${n.text}${n.kind === "box" ? "]" : ""}` : String(id); };
    lines.push("Flow chart (boxes in [ ]):");
    arr(f.edges).map(obj).forEach((e) => lines.push(`  ${name(e.from)} → ${name(e.to)}${e.label ? ` (arrow labelled "${e.label}")` : ""}`));
  } else if (f.type === "apparatus") {
    const labels = obj(f.labels);
    const what = ({
      galvanic_cell: "Galvanic cell (two half-cells joined by a salt bridge and a wire through a meter)",
      electrolytic_cell: "Electrolytic cell (two electrodes in one electrolyte, connected to a DC power supply)",
      titration: "Titration set-up (burette above a conical flask)",
      reflux: "Heating under reflux (round-bottom flask with a vertical condenser)",
      distillation: f.fractional ? "Fractional distillation (flask, fractionating column, thermometer at the side arm, sloping condenser, receiver)" : "Simple distillation (flask, thermometer at the side arm, sloping condenser, receiver)",
      calorimetry: "Calorimetry (a spirit burner heating water in a metal can, with a thermometer in the water)",
      gas_collection: "Gas collection over water (reaction flask, delivery tube into an upturned measuring cylinder in a trough of water)",
      gas_syringe: "Gas syringe (reaction flask connected to a gas syringe)",
      separating_funnel: "Separating funnel with two immiscible layers above a beaker",
      filtration: "Filtration (filter funnel with filter paper over a flask)",
      glassware: `A single piece of glassware: ${String(f.item || "").replace(/_/g, " ")}`,
    } as Record<string, string>)[String(f.kind)] || "Apparatus";
    lines.push(`${what}. Labels: ${Object.entries(labels).map(([k, v]) => `${k.replace(/_/g, " ")} = "${v}"`).join("; ") || "none"}${f.electronFlow ? `; electron flow ${String(f.electronFlow).replace(/_/g, " ")} through the wire` : ""}.`);
  } else if (f.type === "particles") {
    const key = obj(f.key);
    const shape: Record<string, string> = { A: "filled atom", B: "open atom", C: "molecule of two filled atoms", D: "molecule of two open atoms", E: "molecule of one filled and one open atom", F: "small filled atom" };
    lines.push("Particle diagram:");
    arr(f.boxes).map(obj).forEach((b) => lines.push(`  Box${b.label ? ` "${b.label}"` : ""}: ${arr(b.particles).map(obj).map((p) => `${p.count} × ${key[String(p.kind)] || shape[String(p.kind)]}`).join(", ")}`));
    if (Object.keys(key).length) lines.push(`  Key: ${Object.entries(key).map(([k, v]) => `${shape[k]} = ${v}`).join("; ")}`);
  } else if (f.type === "bar_chart") {
    lines.push(`Bar chart${f.title ? ` "${f.title}"` : ""}${f.yLabel ? `, y axis "${f.yLabel}"` : ""}: ${arr(f.bars).map(obj).map((b) => `${b.label} = ${b.value}`).join(", ")}`);
  }
  return lines.length ? `The question shows:\n${lines.join("\n")}` : "";
}

/**
 * Prompt lines for generators: the SACE Chemistry exam's conventions, and how
 * to describe structures and figures. figureAsJsonString: the figure comes as
 * a JSON string (structured outputs); tableKey: where data tables go, if anywhere.
 */
export function chemPromptLines(opts: { figureAsJsonString?: boolean; writtenAnswers?: boolean; tableKey?: string; subject?: string } = {}): string[] {
  const figureKey = opts.figureAsJsonString ? "figure_json (a JSON string, or \"\" for none)" : "figure (an object, or omit)";
  const stage = sacStage(opts.subject);
  return [
    stage === 1
      ? "SACE CHEMISTRY CONVENTIONS (Stage 1, Year 11: school-based tests and tasks, written in the same style and notation as SACE Stage 2 exams):"
      : "SACE CHEMISTRY CONVENTIONS (follow the real SACE Stage 2 exam):",
    "  - Use only data on the SACE data sheet, or give any other value in the question in square brackets, e.g. [Enthalpy of combustion of methane = −890 kJ mol^-1]. The data sheet has the periodic table (molar masses to 4 significant figures, e.g. H 1.008, C 12.01, O 16.00, Fe 55.85), n = m/M, c = n/V, Q = mcΔT, ΔH = Q/n, pH = −log[H+], the SI prefixes and the metal activity series.",
    "  - Units as SACE writes them: mol L^-1, g mol^-1, kJ mol^-1, ppm, mL, °C. Use IUPAC systematic names (ethyl ethanoate, ethane-1,2-diamine, hexane-1,4-diol).",
    "  - Command words as SACE uses them: State, Identify, Name, Write an equation for, Write the half-equation for, Calculate, Showing your working, calculate…, Give your final answer to the appropriate number of significant figures, Describe, Explain, Explain whether…, With reference to…, Discuss.",
    "  - Ground questions in a realistic context (an industrial process, an analysis, an environmental or biological setting) as SACE does.",
    ...(opts.writtenAnswers
      ? ["  - Students type their answers, so don't ask them to draw. Instead of \"Draw the structural formula of…\" ask them to name it, write its molecular or condensed structural formula (e.g. CH3COOCH2CH3), or identify a functional group."]
      : []),
    "STRUCTURES (include whenever the question refers to a molecule's structure, e.g. organic compounds, polymers, amino acids, sugars):",
    "  structures: an array of up to 4 objects { \"smiles\": \"<SMILES>\", \"label\": \"<the name shown under it, e.g. 'monomer 1' or 'quinic acid'>\", \"formula\": \"<its molecular formula, e.g. C4H8O2>\", \"style\": \"skeletal\" | \"full\" }.",
    "    Write SMILES carefully; the app draws the structure from it and checks the formula, and a mismatch rejects the question. Use \"full\" (every atom and bond, every H shown) for small molecules where the bonds matter (up to 8 atoms other than hydrogen); otherwise \"skeletal\".",
    "    The question text should refer to it the way SACE does (\"The structural formula of quinic acid is shown below.\") and must not give away the answer in the label (don't label a structure with the name the student must work out; use \"compound X\" instead).",
    "    Use [] when the question has no structure.",
    `GRAPHS, TLC PLATES, FLOW CHARTS AND APPARATUS — ${figureKey}, one per question, only when the question needs one:`,
    "  xy_plot: { \"type\": \"xy_plot\", \"xLabel\": \"Concentration of Fe2+ (ppm)\", \"yLabel\": \"Absorbance\", \"xRange\": [0, 25], \"yRange\": [0, 0.5], \"xStep\": 5, \"yStep\": 0.1, \"showNumbers\": true, \"grid\": true,",
    "    \"series\": [{ \"kind\": \"points\", \"points\": [[4, 0.14], [8, 0.19]] }, { \"kind\": \"line\", \"points\": [[0, 0], [22.5, 0.5]], \"label\": \"Line of best fit\", \"arrow\": true }],",
    "    \"hlines\": [{ \"y\": 0.3, \"label\": \"reactants\" }], \"vlines\": [], \"arrows\": [{ \"from\": [2, 0.3], \"to\": [2, 0.8], \"text\": \"Ea\", \"both\": true }], \"labels\": [{ \"x\": 5, \"y\": 0.9, \"text\": \"transition state\" }] }",
    "    kind: points (plotted data), line (straight line through its points), curve (smooth curve through its points: titration curves, concentration–time, Maxwell–Boltzmann, energy profiles).",
    "    Calibration graphs, titration curves and rate graphs: give realistic data with numbers on the axes. Qualitative sketches (e.g. concentration against time, energy profile): \"showNumbers\": false, axis titles only.",
    "  tlc_plate: { \"type\": \"tlc_plate\", \"lanes\": [{ \"label\": \"A\", \"spots\": [0.25, 0.70] }], \"solventFrontCm\": 8.0, \"showRuler\": false } (spots are Rf values between 0 and 1).",
    "  flow_chart (a manufacturing or reaction sequence, as SACE draws them): { \"type\": \"flow_chart\",",
    "    \"nodes\": [{ \"id\": \"a\", \"text\": \"2,6-dichloroaniline\", \"kind\": \"text\", \"row\": 0, \"col\": 0 }, { \"id\": \"i1\", \"text\": \"Intermediate 1\", \"kind\": \"box\", \"row\": 1, \"col\": 1 }, { \"id\": \"r\", \"text\": \"CH3I\", \"kind\": \"text\", \"row\": 1, \"col\": 2 }],",
    "    \"edges\": [{ \"from\": \"a\", \"to\": \"i1\" }, { \"from\": \"r\", \"to\": \"i1\" }, { \"from\": \"i1\", \"to\": \"i2\", \"label\": \"Heat under reflux conditions\" }] }",
    "    Boxes (kind box) are substances made in the process; reagents and side products are plain text (kind text). row (0–7, top to bottom) and col (0–4, left to right) place each node on a grid; the main sequence runs down one column, reagents come in from the side, products leave to the side. Arrow labels give conditions.",
    "  apparatus (labelled laboratory apparatus): { \"type\": \"apparatus\", \"kind\": <one of the kinds below>, \"labels\": { ... }, \"electronFlow\": \"left_to_right\" | \"right_to_left\" (galvanic_cell only, optional), \"fractional\": true (distillation only, optional), \"item\": <glassware only> }",
    "    Label slots (leave any out to show it unlabelled, e.g. when the student must identify it; use neutral names like \"electrode 1\" when the answer is the electrode's identity):",
    "      galvanic_cell: left_electrode, left_solution, left_sign (+ or −), right_electrode, right_solution, right_sign, salt_bridge, meter (e.g. V).",
    "      electrolytic_cell: left_electrode, left_sign, right_electrode, right_sign, electrolyte, power_supply, left_product, right_product.",
    "      titration: burette (its solution), flask (its contents), stand.",
    "      reflux: flask (its contents), condenser, heat, water_in, water_out.",
    "      distillation: flask (its contents), thermometer, column (fractional only), condenser, water_in, water_out, receiver, distillate, heat.",
    "      calorimetry (spirit burner under a can of water): thermometer, can, water (e.g. \"200.0 g water\"), burner, fuel.",
    "      gas_collection (over water, in an upturned measuring cylinder): flask, reactants, delivery_tube, cylinder, gas, trough.",
    "      gas_syringe (rate of reaction by gas volume): flask, reactants, syringe, reading (e.g. \"45 mL\").",
    "      separating_funnel (two immiscible liquids): funnel, top_layer, bottom_layer, tap, beaker.",
    "      filtration: mixture, funnel, filter_paper, residue, filtrate.",
    "      glassware (one piece, e.g. \"Name the piece of volumetric glassware shown\"): item = pipette | volumetric_flask | measuring_cylinder | burette | conical_flask | beaker; label name (e.g. \"A\", or leave out).",
    "  particles (particle diagrams: states, mixtures, reactions, equilibrium): { \"type\": \"particles\",",
    "    \"boxes\": [{ \"label\": \"before\", \"particles\": [{ \"kind\": \"C\", \"count\": 4 }, { \"kind\": \"D\", \"count\": 6 }] }, { \"label\": \"after\", \"particles\": [{ \"kind\": \"E\", \"count\": 8 }] }],",
    "    \"key\": { \"C\": \"H2\", \"D\": \"Cl2\", \"E\": \"HCl\" } }",
    "    kinds: A filled atom, B open atom, C two filled atoms bonded, D two open atoms bonded, E one filled + one open atom bonded, F small filled atom. Up to 3 boxes, 20 of a kind per box. Counts must obey conservation of atoms when the boxes show a reaction.",
    "  bar_chart: { \"type\": \"bar_chart\", \"title\": \"...\", \"xLabel\": \"...\", \"yLabel\": \"...\", \"bars\": [{ \"label\": \"Transport\", \"value\": 18 }] }",
    "  Every value the question relies on must be in the question text or clearly readable from the figure, and the two must agree exactly. Never reveal the answer in the figure.",
    ...(opts.tableKey ? [`  Tables of data (results, Rf values, titres) go in ${opts.tableKey}, captioned like SACE (\"Table 1\"), not in a figure.`] : []),
  ];
}

/** 1 or 2 for a SACE Stage 1 / Stage 2 subject name, else null. */
export function sacStage(subject?: string): 1 | 2 | null {
  const m = String(subject || "").match(/stage\s*([12])/i);
  return m ? (Number(m[1]) as 1 | 2) : null;
}

/**
 * For generated multiple-choice batches: draw and check each question's
 * `structures` and chemistry `figure`, and put the result in `diagram`. A
 * question with a structure that fails the check is dropped.
 */
export function attachChemFigures<T extends { structures?: unknown; figure?: unknown; diagram?: unknown }>(
  questions: T[],
): { kept: T[]; problems: string[] } {
  const kept: T[] = [];
  const problems: string[] = [];
  for (const q of questions) {
    const built = buildStructures(q.structures);
    if (built.problems.length) { problems.push(...built.problems); continue; }
    const diagram = chemDiagramColumn(built.structures, sanitizeChemFigure(q.figure));
    const { structures: _s, figure: _f, ...rest } = q as T & Record<string, unknown>;
    kept.push({ ...rest, diagram: diagram ?? null } as unknown as T);
  }
  return { kept, problems };
}
