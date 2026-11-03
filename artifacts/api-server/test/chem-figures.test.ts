import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStructures, sameFormula, formulaCounts, sanitizeChemFigure, describeChemDiagram, chemDiagramColumn, sacStage, chemPromptLines } from "../src/lib/chem-figures.ts";

test("formulas compare by element counts", () => {
  assert.equal(sameFormula("C4H8O2", "C4H8O2"), true);
  assert.equal(sameFormula("C2H7NO", "C2H7ON"), true);
  assert.equal(sameFormula("C4H8O2", "C4H10O2"), false);
  assert.deepEqual(formulaCounts("Cr2O7 2-"), { Cr: 2, O: 7 });
  assert.deepEqual(formulaCounts("NH4^+"), { N: 1, H: 4 });
});

test("structures are checked and drawn", () => {
  const r = buildStructures([
    { smiles: "CCOC(C)=O", label: "ethyl ethanoate", formula: "C4H8O2", style: "full" },
    { smiles: "OC1CC(O)(CC(O)C1O)C(O)=O", label: "quinic acid", formula: "C7H12O6" },
  ]);
  assert.deepEqual(r.problems, []);
  assert.equal(r.structures.length, 2);
  assert.equal(r.structures[0].style, "full");
  assert.equal(r.structures[1].style, "skeletal");
  assert.match(r.structures[0].svg, /^<svg/);
  assert.doesNotMatch(r.structures[0].svg, /rgb\(/);
});

test("bad SMILES and wrong formulas are problems", () => {
  const r = buildStructures([{ smiles: "C1CC(", label: "x" }, { smiles: "CCO", label: "ethanol", formula: "C2H4O" }]);
  assert.equal(r.structures.length, 0);
  assert.equal(r.problems.length, 2);
  assert.match(r.problems[1], /C2H6O/);
});

test("big molecules fall back to skeletal", () => {
  const r = buildStructures([{ smiles: "CCCCCCCCCC(=O)O", style: "full" }]);
  assert.equal(r.structures[0].style, "skeletal");
});

test("chem figures are sanitised and described", () => {
  const f = sanitizeChemFigure(JSON.stringify({ type: "xy_plot", xLabel: "c (ppm)", yLabel: "Absorbance", xRange: [0, 25], yRange: [0, 0.5],
    series: [{ kind: "points", points: [[4, 0.14], [8, "x"]] }, { kind: "line", points: [[0, 0], [22, 0.5]], arrow: true }] }));
  assert.equal(f?.type, "xy_plot");
  assert.equal((f!.series as any[])[0].points.length, 1);
  assert.equal(sanitizeChemFigure({ type: "xy_plot", xRange: [5, 1], yRange: [0, 1], series: [] }), null);
  const tlc = sanitizeChemFigure({ type: "tlc_plate", lanes: [{ label: "A", spots: [0.2, 1.4] }] });
  assert.deepEqual((tlc!.lanes as any[])[0].spots, [0.2]);
  const d = chemDiagramColumn(buildStructures([{ smiles: "CCO", label: "ethanol" }]).structures, f);
  assert.match(describeChemDiagram(d), /SMILES CCO, molecular formula C2H6O/);
  assert.match(describeChemDiagram(d), /Plotted points/);
});

test("flow charts and apparatus are sanitised and described", () => {
  const fc = sanitizeChemFigure({ type: "flow_chart", nodes: [
    { id: "a", text: "2,6-dichloroaniline", kind: "text", row: 0, col: 0 },
    { id: "i1", text: "Intermediate 1", kind: "box", row: 1, col: 1 },
    { id: "i1", text: "duplicate", row: 2, col: 1 },
    { id: "c", text: "clonidine", kind: "box", row: 2, col: 1 },
  ], edges: [{ from: "a", to: "i1" }, { from: "i1", to: "c", label: "React at 130 °C" }, { from: "c", to: "missing" }] });
  assert.equal((fc!.nodes as any[]).length, 3);
  assert.equal((fc!.edges as any[]).length, 2);
  assert.match(describeChemDiagram({ figure: fc }), /\[Intermediate 1\] → \[clonidine\] \(arrow labelled "React at 130 °C"\)/);
  const cell = sanitizeChemFigure({ type: "apparatus", kind: "galvanic_cell", labels: { left_electrode: "Zn", right_electrode: "Cu", junk: "x" }, electronFlow: "left_to_right" });
  assert.deepEqual(cell!.labels, { left_electrode: "Zn", right_electrode: "Cu" });
  assert.match(describeChemDiagram({ figure: cell }), /Galvanic cell.*left electrode = "Zn".*electron flow left to right/);
  assert.equal(sanitizeChemFigure({ type: "apparatus", kind: "spaceship" }), null);
});

test("more apparatus, glassware, particles and bar charts", () => {
  const d = sanitizeChemFigure({ type: "apparatus", kind: "distillation", fractional: true, labels: { flask: "crude oil", thermometer: "thermometer" } });
  assert.equal(d!.fractional, true);
  assert.match(describeChemDiagram({ figure: d }), /Fractional distillation/);
  assert.equal(sanitizeChemFigure({ type: "apparatus", kind: "glassware", item: "teapot" }), null);
  const g = sanitizeChemFigure({ type: "apparatus", kind: "glassware", item: "volumetric_flask", labels: { name: "A" } });
  assert.equal(g!.item, "volumetric_flask");
  const p = sanitizeChemFigure({ type: "particles", boxes: [{ label: "before", particles: [{ kind: "C", count: 4 }, { kind: "Z", count: 2 }, { kind: "D", count: 99 }] }], key: { C: "H2", D: "Cl2", Q: "x" } });
  assert.deepEqual((p!.boxes as any[])[0].particles, [{ kind: "C", count: 4 }, { kind: "D", count: 20 }]);
  assert.deepEqual(p!.key, { C: "H2", D: "Cl2" });
  assert.match(describeChemDiagram({ figure: p }), /4 × H2, 20 × Cl2/);
  const b = sanitizeChemFigure({ type: "bar_chart", bars: [{ label: "Transport", value: 18 }] });
  assert.equal(b!.type, "bar_chart");
  assert.match(describeChemDiagram({ figure: b }), /Transport = 18/);
});

test("stage-aware conventions", () => {
  assert.equal(sacStage("SACE Chemistry Stage 1"), 1);
  assert.equal(sacStage("Chemistry Stage 2"), 2);
  assert.equal(sacStage("Year 10 Science"), null);
  assert.match(chemPromptLines({ subject: "SACE Chemistry Stage 1" })[0], /Stage 1, Year 11/);
  assert.match(chemPromptLines({ subject: "SACE Chemistry Stage 2" })[0], /Stage 2 exam/);
});
