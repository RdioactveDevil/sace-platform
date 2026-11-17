import { test } from "node:test";
import assert from "node:assert/strict";
import { planBatch, batchLabel } from "./batch-plan";

const paper = (publisher: string, year: number, kind = "commercial", paper = "Exam") => ({ publisher, year, kind, paper, source: batchLabel({ publisher, year, kind, paper }) });

test("papers sharing a label are not loaded; the rest are", () => {
  const papers = [paper("VCAA", 2024, "official"), paper("TSSM", 2024), paper("VCAA", 2024, "official"), paper("NEAP", 2024)];
  const plan = planBatch(papers, {}, { resume: true, apply: true });
  assert.deepEqual(plan.map((s) => s.action), ["duplicate", "load", "duplicate", "load"]);
  assert.match(plan[0].reason, /2 papers in this batch are labelled "VCAA 2024 Exam"/);
});

test("resume skips only papers this batch already loaded for review", () => {
  const papers = [paper("NEAP", 2023), paper("Insight", 2023), paper("Kilbaha", 2019), paper("STAV", 2021)];
  const results = {
    "0": { status: "saved", mode: "apply", reviewed: true },
    "1": { status: "saved", mode: "apply" },               // loaded by the ingest before reviews: load again
    "2": { status: "failed", mode: "apply" },
    "3": { status: "checked", mode: "dry-run", reviewed: true },
  };
  assert.deepEqual(planBatch(papers, results, { resume: true, apply: true }).map((s) => s.action), ["skip", "load", "load", "load"]);
  assert.deepEqual(planBatch(papers, results, { resume: false, apply: true }).map((s) => s.action), ["load", "load", "load", "load"]);
  // A dry run reads every paper.
  assert.deepEqual(planBatch(papers, results, { resume: true, apply: false }).map((s) => s.action), ["load", "load", "load", "load"]);
});
