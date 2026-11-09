import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { bands, snapToInk } from "./figure-crop";

test("bands join runs across small gaps only", () => {
  const ink = [0, 1, 1, 0, 1, 0, 0, 0, 1, 1].map(Boolean);
  assert.deepEqual(bands(ink, 2), [{ start: 1, end: 4 }, { start: 8, end: 9 }]);
  assert.deepEqual(bands(ink, 1), [{ start: 1, end: 2 }, { start: 4, end: 4 }, { start: 8, end: 9 }]);
});

/** A white page with black rectangles (x, y, w, h), at render scale 3. */
async function page(rects: number[][]) {
  const width = 1785, height = 2523;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/>${rects.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#000"/>`).join("")}</svg>`;
  return { png: await sharp(Buffer.from(svg)).png().toBuffer(), width, height };
}

// A figure (400–1300 × 600–1000), its caption close under it, a two-line
// paragraph of question text well above it and a line of text well below.
const LAYOUT = [
  [300, 420, 1100, 30], [300, 458, 900, 30],  // question text, two lines
  [400, 600, 900, 400],                        // the figure
  [1350, 780, 160, 30],                        // a label to its right ("distillate")
  [700, 1030, 300, 30],                        // its caption
  [300, 1180, 1000, 30],                       // question text below
];

test("a sloppy box loses the question text and gets back the cut-off label", async () => {
  const p = await page(LAYOUT);
  // Reaches up into the paragraph and down into the line below; cuts the label in half.
  const snapped = await snapToInk(p, { left: 380, top: 440, width: 1040, height: 760 });
  assert.ok(snapped.top > 488 && snapped.top <= 600, `top ${snapped.top}`);
  assert.ok(snapped.top + snapped.height >= 1060 && snapped.top + snapped.height < 1180, `bottom ${snapped.top + snapped.height}`);
  assert.ok(snapped.left <= 400, `left ${snapped.left}`);
  assert.ok(snapped.left + snapped.width >= 1510, `right ${snapped.left + snapped.width}`);
});

test("a box that is already right stays put", async () => {
  const p = await page(LAYOUT);
  const snapped = await snapToInk(p, { left: 390, top: 590, width: 1130, height: 480 });
  assert.ok(Math.abs(snapped.top - 591) <= 10 && Math.abs(snapped.left - 391) <= 10, JSON.stringify(snapped));
});

test("captions spread under a figure stay; a line of running text inside the box goes", async () => {
  // Three structures, their captions well below them (spread out, with wide gaps),
  // and a question sentence above, all inside a generous box.
  const p = await page([
    [300, 400, 1100, 30],                                       // running text (one solid run)
    [400, 600, 250, 200], [800, 600, 250, 200], [1200, 600, 250, 200],
    [430, 860, 190, 30], [830, 860, 190, 30], [1230, 860, 190, 30], // molecule A / B / C
  ]);
  const snapped = await snapToInk(p, { left: 280, top: 380, width: 1200, height: 540 });
  assert.ok(snapped.top > 430, `kept the sentence: top ${snapped.top}`);
  assert.ok(snapped.top + snapped.height >= 890, `lost the captions: bottom ${snapped.top + snapped.height}`);
});
