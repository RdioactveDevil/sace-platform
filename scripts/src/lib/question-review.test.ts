import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { sameWords, inkAtEdges, cropFlags } from "./question-review";

/** A white W×H image with black rectangles. */
async function image(W: number, H: number, rects: [number, number, number, number][]): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${rects
    .map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#000"/>`).join("")}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

test("same words ignores spacing and case, and empty is never the same", () => {
  assert.equal(sameWords("The molecule  C2H5ClO\nhas isomers.", "the molecule C2H5ClO has isomers."), true);
  assert.equal(sameWords("", ""), false);
  assert.equal(sameWords("a", "b"), false);
});

test("a figure with a white margin isn't cut off; one running off an edge is", async () => {
  assert.deepEqual(await inkAtEdges(await image(100, 80, [[10, 10, 80, 60]])), []);
  // An axis running off the left edge and a curve off the bottom.
  assert.deepEqual(await inkAtEdges(await image(100, 80, [[0, 10, 3, 60], [20, 70, 60, 10]])), ["bottom", "left"]);
  // One stray dark pixel on an edge is not enough.
  assert.deepEqual(await inkAtEdges(await image(200, 200, [[50, 0, 1, 1]])), []);
});

test("crop flags say what is wrong and where", () => {
  const look = { is_figure: true, has_question_text: true, has_page_furniture: true, is_cut_off: false, note: "Includes 'SECTION B – Question 1 – continued'." };
  const flags = cropFlags("a", [], look);
  assert.deepEqual(flags.map((f) => f.code), ["figure_has_text", "figure_has_furniture"]);
  assert.ok(flags.every((f) => f.where === "a" && f.message.startsWith("Part a's figure")));
  assert.deepEqual(cropFlags("", ["left"], null).map((f) => f.code), ["figure_cut_off"]);
  assert.deepEqual(cropFlags("", [], { ...look, is_figure: false, has_question_text: false, has_page_furniture: false }).map((f) => f.code), ["figure_wrong"]);
  assert.deepEqual(cropFlags("", [], null), []);
});
