import { test } from "node:test";
import assert from "node:assert/strict";
import { hintLine, findText, isFurniture, type PageText, type Line } from "./figure-find";

const line = (text: string, y: number, kind: Line["kind"] = "other", x0 = 110, x1 = 500): Line =>
  ({ text, x0, x1, y0: y, y1: y + 11, size: 10, fill: 0.9, maxGap: 4, kind });

test("the line by a figure is the last one saying below, else above, else the first", () => {
  assert.equal(hintLine("The graph below shows X.\nOn the graph below, sketch Y.").text, "On the graph below, sketch Y.");
  assert.deepEqual(hintLine("On the diagram above, draw an arrow."), { text: "On the diagram above, draw an arrow.", above: true });
  assert.equal(hintLine("Explain whether methanethiol is a waste product.").text, "Explain whether methanethiol is a waste product.");
});

test("a part's sentence is found on the page it is printed on, ignoring maths markup", () => {
  const page: PageText = { width: 595, height: 842, lines: [
    line("(b) Methanol, CH3OH, can be manufactured as an e-fuel.", 100, "body"),
    line("The equation for the reaction between carbon dioxide and hydrogen to produce methanol is", 120, "body"),
    line("shown below.", 132, "body"),
  ] };
  assert.equal(findText(page, "Methanol, $\\ce{CH3OH}$, can be manufactured as an e-fuel."), 0);
  assert.equal(findText(page, "The equation for the reaction between carbon dioxide and hydrogen to produce methanol is shown below."), 2);
  assert.equal(findText(page, "Something that is not on this page at all, at all."), -1);
  // A short prefix alone is not enough: that is how the wrong page gets matched.
  assert.equal(findText(page, "The equation for the reaction between carbon dioxide and hydrogen to produce ethanol is shown below.", 25), 1);
  assert.equal(findText(page, "The equation for the reaction between carbon dioxide and hydrogen to produce ethanol is shown below."), -1);
});

test("page headers and footers from trial papers are recognised, figure labels are not", () => {
  for (const t of [
    "SECTION B – Question 1 – continued", "SECTION B - Continued", "SECTION B - Continued TURNOVER", "TURNOVER", "TURN OVER",
    "Question 3 continued", "Question 3 continues on the next page", "Continued over page", "continued", "PLEASE TURN OVER",
    "Page 6 of 12", "End of Section B", "1 mark", "[2 marks]", "DO NOT WRITE IN THIS AREA", "© NEAP 2023", "Copyright © Insight Publications 2022",
  ]) assert.equal(isFurniture(t), true, t);
  for (const t of ["reaction progress", "Low temp", "Na metal anode", "Section B consists of 7 questions.", "continued heating of the mixture"]) {
    assert.equal(isFurniture(t), false, t);
  }
});
