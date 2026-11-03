import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStructures, sameFormula, formulaCounts, sanitizeChemFigure, describeChemDiagram, chemDiagramColumn } from "../src/lib/chem-figures.ts";

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
