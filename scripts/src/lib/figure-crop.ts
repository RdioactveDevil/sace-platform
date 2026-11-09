/**
 * Cropping a figure out of a rendered exam page, cleanly.
 *
 * The box a model gives for a figure is approximate: it can stop short of a
 * label ("distillate" cut in half), or reach into the question text above or
 * below. snapToInk() fixes both using the page's own pixels:
 *
 *   - Rows: the ink near the box is split into horizontal bands wherever
 *     there's a clear blank gap. A band is kept if the box covers most of it,
 *     so a line of question text the box only clips is dropped, and a figure
 *     row the box cut through is kept whole. A single line of text at the top
 *     or bottom, set apart from the figure by a clear gap, is question text
 *     and is dropped too (a caption sits close to its figure).
 *   - Columns: across the kept rows, ink that touches the box is followed
 *     outward until a clear gap, so a label the box cut off is kept whole.
 *
 * Coordinates are pixels of the rendered page.
 */
import sharp from "sharp";

export type PxBox = { left: number; top: number; width: number; height: number };
export type Page = { png: Buffer; width: number; height: number };

/** A grey pixel darker than this counts as ink. */
const INK = 200;

/** The page as one grey byte per pixel, made once per page. */
const greyCache = new WeakMap<Buffer, Promise<Uint8Array>>();
function grey(page: Page): Promise<Uint8Array> {
  let g = greyCache.get(page.png);
  if (!g) {
    g = sharp(page.png).greyscale().raw().toBuffer().then((b) => new Uint8Array(b));
    greyCache.set(page.png, g);
  }
  return g;
}

type Band = { start: number; end: number }; // inclusive

/** Runs of `true` in `ink`, joining runs separated by fewer than `gap` falses. */
export function bands(ink: boolean[], gap: number): Band[] {
  const out: Band[] = [];
  let cur: Band | null = null;
  let blank = 0;
  for (let i = 0; i < ink.length; i++) {
    if (ink[i]) {
      if (cur && blank < gap) cur.end = i;
      else { cur = { start: i, end: i }; out.push(cur); }
      blank = 0;
    } else {
      blank++;
    }
  }
  return out;
}

/**
 * Tighten and correct a figure box against the page's ink (see above).
 * `scale` is the render scale (pixels per PDF point ÷ 1), used to size gaps.
 */
export async function snapToInk(page: Page, box: PxBox, scale = 3): Promise<PxBox> {
  const g = await grey(page);
  const W = page.width;
  const H = page.height;
  const clampX = (x: number) => Math.max(0, Math.min(W - 1, Math.round(x)));
  const clampY = (y: number) => Math.max(0, Math.min(H - 1, Math.round(y)));
  // How far beyond the box to look for the rest of a cut-off figure.
  const reachX = Math.round(W * 0.06);
  const reachY = Math.round(H * 0.04);
  const x0 = clampX(box.left), x1 = clampX(box.left + box.width - 1);
  const y0 = clampY(box.top), y1 = clampY(box.top + box.height - 1);
  const sx0 = clampX(x0 - reachX), sx1 = clampX(x1 + reachX);
  const sy0 = clampY(y0 - reachY), sy1 = clampY(y1 + reachY);
  const dark = (x: number, y: number) => g[y * W + x] < INK;

  // Rows, judged across the box's own columns (a little wider for labels).
  const cx0 = clampX(x0 - reachX / 3), cx1 = clampX(x1 + reachX / 3);
  const rowInk: boolean[] = [];
  for (let y = sy0; y <= sy1; y++) {
    let n = 0;
    for (let x = cx0; x <= cx1 && n < 2; x++) if (dark(x, y)) n++;
    rowInk.push(n >= 2);
  }
  // Lines of ink (text lines come apart at a small gap), then blocks: lines
  // closer than a clear gap belong together (a figure and its caption, a
  // paragraph of text). Blocks the box mostly covers are kept.
  const lines = bands(rowInk, 1).map((b) => ({ start: b.start + sy0, end: b.end + sy0 }));
  const apart = 12 * scale;
  const blocks: Band[][] = [];
  for (const l of lines) {
    const last = blocks[blocks.length - 1];
    if (last && l.start - last[last.length - 1].end < apart) last.push(l);
    else blocks.push([l]);
  }
  const span = (bl: Band[]) => ({ start: bl[0].start, end: bl[bl.length - 1].end });
  const kept = blocks.filter((bl) => {
    const { start, end } = span(bl);
    const overlap = Math.min(end, y1) - Math.max(start, y0) + 1;
    return overlap > 0 && overlap >= 0.5 * (end - start + 1);
  });
  if (!kept.length) return box;
  // Question text the box reached into: a block made only of text-high lines,
  // at the top or bottom, set apart from the figure by that clear gap.
  const textLine = 16 * scale;
  const isText = (bl: Band[]) => bl.every((l) => l.end - l.start + 1 <= textLine);
  while (kept.length > 1 && isText(kept[0])) kept.shift();
  while (kept.length > 1 && isText(kept[kept.length - 1])) kept.pop();
  const top = span(kept[0]).start;
  const bottom = span(kept[kept.length - 1]).end;

  // Columns across the kept rows; keep column bands that touch the box.
  const colInk: boolean[] = [];
  for (let x = sx0; x <= sx1; x++) {
    let n = 0;
    for (let y = top; y <= bottom && n < 2; y++) if (dark(x, y)) n++;
    colInk.push(n >= 2);
  }
  // A clear gap between columns: wider than the space between words.
  const colGap = Math.max(6, Math.round(14 * scale));
  const cols = bands(colInk, colGap)
    .map((b) => ({ start: b.start + sx0, end: b.end + sx0 }))
    .filter((b) => b.end >= x0 && b.start <= x1);
  if (!cols.length) return box;
  const left = Math.min(...cols.map((b) => b.start));
  const right = Math.max(...cols.map((b) => b.end));

  const pad = Math.round(3 * scale);
  const l = clampX(left - pad), t = clampY(top - pad);
  return { left: l, top: t, width: clampX(right + pad) - l + 1, height: clampY(bottom + pad) - t + 1 };
}

/** Percent box (0–100 of the page) → pixels. */
export function pctToPx(page: Page, b: { x: number; y: number; w: number; h: number }): PxBox {
  return {
    left: Math.round((b.x / 100) * page.width),
    top: Math.round((b.y / 100) * page.height),
    width: Math.round((b.w / 100) * page.width),
    height: Math.round((b.h / 100) * page.height),
  };
}

/** Grow a pixel box by `frac` of the page on every side (for context), within the page. */
export function grow(page: Page, b: PxBox, frac: number): PxBox {
  const dx = Math.round(page.width * frac), dy = Math.round(page.height * frac);
  const left = Math.max(0, b.left - dx), top = Math.max(0, b.top - dy);
  return {
    left, top,
    width: Math.min(page.width, b.left + b.width + dx) - left,
    height: Math.min(page.height, b.top + b.height + dy) - top,
  };
}

export async function crop(page: Page, b: PxBox): Promise<Buffer> {
  const left = Math.max(0, Math.min(page.width - 8, b.left));
  const top = Math.max(0, Math.min(page.height - 8, b.top));
  const width = Math.max(8, Math.min(b.width, page.width - left));
  const height = Math.max(8, Math.min(b.height, page.height - top));
  return sharp(page.png).extract({ left, top, width, height }).png().toBuffer();
}
