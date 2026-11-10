/**
 * Finding a figure on an exam page from the PDF's own text positions.
 *
 * Exam papers are real PDFs: every word's exact position is in the file.
 * So instead of guessing a box, this works out what on the page is NOT the
 * figure and removes it:
 *
 *   1. Read every line of text on the page with its position (pdf.js).
 *   2. Question text is recognisable by its shape: paragraph lines that are
 *      wide, or start with a part label, or continue such a line at the same
 *      indent. Page furniture ("(2 marks)", "page 6 of 12", "PLEASE TURN
 *      OVER") is recognisable by pattern. Both are painted white on the
 *      rendered page. Answer lines (long, thin, isolated rules) go too.
 *   3. What is left is figures with their own labels and captions.
 *   4. The part's text says where its figure is ("… is shown below."): the
 *      figure is all remaining ink between that line and the next line of
 *      question text. That is the crop.
 *
 * Nothing here is estimated by a model, and no threshold is tuned to a
 * particular figure.
 */
import { createRequire } from "node:module";
import sharp from "sharp";
import { PDFiumLibrary } from "@hyzyla/pdfium";

const require = createRequire(import.meta.url);

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;
function pdfjs(): Promise<PdfJs> {
  pdfjsPromise ||= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}
// pdf.js looks for its worker file even in Node; point it at the real one so it loads quietly.
let workerSet = false;

export type Line = {
  text: string;
  x0: number; y0: number; x1: number; y1: number; // PDF points, origin top-left
  size: number;
  /** How much of the line's width is ink, and the widest gap between its pieces: a sentence is dense, a row of labels is not. */
  fill: number; maxGap: number;
  kind: "body" | "furniture" | "other";
};
export type PageText = { width: number; height: number; lines: Line[] };

const FURNITURE = [
  /^\(\s*\d+\s*marks?\s*\)$/i,
  /^_{6,}\s*(\(\s*\d+\s*marks?\s*\))?$/, // an answer line (underscores), with or without its marks
  /^page\s*\d+\s*of\s*\d+/i,
  /please turn over/i,
  /^question\s+\d+\s+continues/i,
  /end of booklet/i,
  /^you may write on this page/i,
  /^question booklet \d/i,
];
const PART_LABEL = /^(\(?[a-z]{1,4}\)|\(\d{1,2}\)|\d{1,2}\.)\s/i;

/** Every page's text lines with positions and what each line is. */
export async function readPages(pdf: Buffer): Promise<PageText[]> {
  const lib = await pdfjs();
  if (!workerSet) {
    lib.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    workerSet = true;
  }
  const doc = await lib.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, disableFontFace: true, verbosity: 0 }).promise;
  const pages: PageText[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    type Item = { str: string; transform: number[]; width: number };
    const items = (content.items as Item[]).filter((it) => it.str && it.str.trim());
    // Group items into lines by baseline.
    const rows: { base: number; size: number; items: { x0: number; x1: number; str: string }[] }[] = [];
    for (const it of items) {
      const [, b, , d, e, f] = it.transform;
      const size = Math.hypot(b, d) || 10;
      const row = rows.find((r) => Math.abs(r.base - f) < 0.4 * Math.max(size, r.size));
      const entry = { x0: e, x1: e + it.width, str: it.str };
      if (row) { row.items.push(entry); row.size = Math.max(row.size, size); }
      else rows.push({ base: f, size, items: [entry] });
    }
    // A row of items on one baseline is split into separate lines where the
    // gap between pieces is wide (a mark allocation far to the right, labels
    // spread across a figure), so each line is one run of text.
    const groups: typeof rows = [];
    for (const r of rows) {
      const its = [...r.items].sort((a, b) => a.x0 - b.x0);
      let cur: typeof its = [];
      for (const it of its) {
        if (cur.length && it.x0 - Math.max(...cur.map((c) => c.x1)) > 3 * r.size) { groups.push({ ...r, items: cur }); cur = []; }
        cur.push(it);
      }
      if (cur.length) groups.push({ ...r, items: cur });
    }
    const lines: Line[] = groups.map((r) => {
      const its = r.items;
      // Join fragments; a gap wider than a third of the font size is a space.
      let text = "";
      let lastX1 = -Infinity, inked = 0, maxGap = 0;
      for (const it of its) {
        if (text && it.x0 - lastX1 > r.size * 0.3 && !text.endsWith(" ") && !it.str.startsWith(" ")) text += " ";
        if (lastX1 > -Infinity) maxGap = Math.max(maxGap, it.x0 - lastX1);
        text += it.str;
        inked += Math.max(0, it.x1 - Math.max(it.x0, lastX1));
        lastX1 = Math.max(lastX1, it.x1);
      }
      const x0 = its[0].x0, x1 = Math.max(...its.map((i) => i.x1));
      return {
        text: text.replace(/\s+/g, " ").trim(),
        x0, x1,
        y0: vp.height - r.base - r.size * 0.8, y1: vp.height - r.base + r.size * 0.25,
        size: r.size, fill: inked / Math.max(1, x1 - x0), maxGap, kind: "other" as const,
      };
    }).filter((l) => l.text).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    classify(lines, vp.width);
    pages.push({ width: vp.width, height: vp.height, lines });
  }
  await doc.destroy();
  return pages;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Mark each line as question text, page furniture, or other (figure labels, captions, equations). */
function classify(lines: Line[], pageWidth: number) {
  const wide = pageWidth * 0.38;
  // A sentence: its pieces sit close together (word spaces, or the tab after
  // a part label). A row of atom labels or captions across a figure does not.
  const sentence = (l: Line) => l.fill >= 0.5 && l.maxGap <= 2.5 * l.size;
  for (const l of lines) {
    if (FURNITURE.some((re) => re.test(l.text))) l.kind = "furniture";
    else if (/^source:/i.test(l.text)) l.kind = "other"; // a figure's citation, printed with it
    else if (sentence(l) && ((l.x1 - l.x0 > wide && words(l.text) >= 4) || (PART_LABEL.test(l.text) && words(l.text) >= 3))) l.kind = "body";
  }
  // A short line that continues a paragraph: directly under a body line, at
  // its indent (or the indent of its text after a part label).
  const continuations = () => {
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.kind !== "other") continue;
      const prev = [...lines.slice(0, i)].reverse().find((p) => p.kind === "body" && p.y1 <= l.y0 + 2 && l.y0 - p.y1 < p.size * 1.1);
      if (!prev) continue;
      const label = prev.text.match(PART_LABEL);
      const textStart = label ? prev.x0 + estimateWidth(label[0], prev.size) : prev.x0;
      if (Math.abs(l.x0 - prev.x0) < 2.5 || Math.abs(l.x0 - textStart) < 6) l.kind = "body";
    }
  };
  continuations();
  // A sentence at one of the page's paragraph indents is question text even
  // when short or printed in a narrow column beside a figure. The indents are
  // where the body lines found so far start (and where their text starts
  // after a part label).
  const indents: number[] = [];
  for (const b of lines.filter((l) => l.kind === "body")) {
    const label = b.text.match(PART_LABEL);
    indents.push(b.x0);
    if (label) indents.push(b.x0 + estimateWidth(label[0], b.size));
  }
  const shared = indents.filter((x) => indents.filter((y) => Math.abs(x - y) < 2.5).length >= 2);
  for (const l of lines) {
    if (l.kind === "other" && sentence(l) && words(l.text) >= 4 && shared.some((x) => Math.abs(l.x0 - x) < 2.5)) l.kind = "body";
  }
  // Those lines can have short last lines of their own.
  continuations();
}
// Where the text after a part label like "(iii) " begins, roughly: labels are set in a fixed tab.
const estimateWidth = (label: string, size: number) => Math.max(label.length * size * 0.45, size * 1.6);

const normalize = (s: string) =>
  s.toLowerCase()
    .replace(/\\ce\{([^}]*)\}/g, "$1").replace(/\\[a-zA-Z]+/g, " ").replace(/[${}^_]/g, "")
    .replace(/[^a-z0-9]+/g, "");

/**
 * The line of a part's text that sits right by its figure: the last one
 * saying "below" (a part can say it twice, and the figure follows the
 * second), else one saying "above", else the first line.
 */
export function hintLine(partText: string): { text: string; above: boolean } {
  const ls = String(partText || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const below = ls.filter((s) => /\bbelow\b/i.test(s));
  const pos = below[below.length - 1] || ls.find((s) => /\babove\b/i.test(s)) || ls[0] || "";
  return { text: pos, above: !/\bbelow\b/i.test(pos) && /\babove\b/i.test(pos) };
}

const PREFIXES = [Infinity, 60, 40, 25];

/**
 * Where a sentence is printed on a page: the index of the line its match
 * ends on, or -1. `len` is how much of the sentence must match (characters
 * of letters and digits); shorter prefixes are tried only across all pages
 * first (findPage), so the longest match anywhere wins.
 */
export function findText(page: PageText, text: string, len = Infinity): number {
  const norm = normalize(text);
  const needle = norm.slice(0, len);
  if (needle.length < 20) return -1;
  const joined = page.lines.map((l) => normalize(l.text));
  const starts: number[] = [];
  let all = "";
  for (const j of joined) { starts.push(all.length); all += j; }
  const at = all.indexOf(needle);
  if (at < 0) return -1;
  const end = at + needle.length - 1;
  let idx = 0;
  while (idx + 1 < starts.length && starts[idx + 1] <= end) idx++;
  return idx;
}

/** The page (0-based) and line a part's text is printed on: the longest match anywhere, or page -1. */
export function findPage(pages: PageText[], text: string): { page: number; line: number; len: number } {
  for (const len of PREFIXES) {
    for (let p = 0; p < pages.length; p++) {
      const line = findText(pages[p], text, len);
      if (line >= 0) return { page: p, line, len };
    }
  }
  return { page: -1, line: -1, len: 0 };
}

export type Found = { page: number; box: { left: number; top: number; width: number; height: number }; how: string };

/** Render one page (1-based) at `scale`. */
export async function renderPage(pdf: Buffer, pageNo: number, scale = 3): Promise<{ png: Buffer; width: number; height: number }> {
  const library = await PDFiumLibrary.init();
  try {
    const doc = await library.loadDocument(pdf);
    try {
      const page = [...doc.pages()][pageNo - 1];
      const image = await page.render({
        scale,
        render: async (o: { data: Uint8Array; width: number; height: number }) =>
          sharp(Buffer.from(o.data), { raw: { width: o.width, height: o.height, channels: 4 } }).png().toBuffer(),
      });
      const png = Buffer.from(image.data);
      const meta = await sharp(png).metadata();
      return { png, width: meta.width || 0, height: meta.height || 0 };
    } finally {
      doc.destroy();
    }
  } finally {
    library.destroy();
  }
}

/**
 * The page with question text, furniture and answer lines painted white, as
 * a greyscale buffer, plus a PNG of the same for cropping from.
 */
export async function maskedPage(page: PageText, rendered: { png: Buffer; width: number; height: number }) {
  const scale = rendered.width / page.width;
  const W = rendered.width, H = rendered.height;
  const grey = new Uint8Array(await sharp(rendered.png).greyscale().raw().toBuffer());
  const paint = (x0: number, y0: number, x1: number, y1: number) => {
    const L = Math.max(0, Math.floor(x0)), R = Math.min(W - 1, Math.ceil(x1));
    const T = Math.max(0, Math.floor(y0)), B = Math.min(H - 1, Math.ceil(y1));
    for (let y = T; y <= B; y++) grey.fill(255, y * W + L, y * W + R + 1);
  };
  for (const l of page.lines) {
    if (l.kind === "other") continue;
    paint((l.x0 - 1.5) * scale, (l.y0 - 1) * scale, (l.x1 + 1.5) * scale, (l.y1 + 1) * scale);
  }
  // The booklet tabs at the page edges, and anything in the outer margins.
  paint(0, 0, 40 * scale, H); paint(W - 40 * scale, 0, W, H);
  // Answer lines: a rule at least half the page wide, no thicker than 1.2pt,
  // with nothing within 6pt above or below it (an axis has its ticks and
  // numbers there; a table rule has its cells' text).
  const dark = (x: number, y: number) => grey[y * W + x] < 200;
  const runs: { y: number; x0: number; x1: number }[] = [];
  for (let y = 0; y < H; y++) {
    let best: [number, number] | null = null, start = -1;
    for (let x = 0; x <= W; x++) {
      if (x < W && dark(x, y)) { if (start < 0) start = x; }
      else if (start >= 0) { if (!best || x - start > best[1] - best[0]) best = [start, x - 1]; start = -1; }
    }
    if (best && best[1] - best[0] + 1 >= 0.5 * W) runs.push({ y, x0: best[0], x1: best[1] });
  }
  const thick = Math.round(1.2 * scale), near = Math.round(6 * scale);
  for (let i = 0; i < runs.length;) {
    let j = i;
    while (j + 1 < runs.length && runs[j + 1].y === runs[j].y + 1) j++;
    const y0 = runs[i].y, y1 = runs[j].y;
    if (y1 - y0 + 1 <= thick) {
      const x0 = Math.min(...runs.slice(i, j + 1).map((r) => r.x0)), x1 = Math.max(...runs.slice(i, j + 1).map((r) => r.x1));
      let n = 0;
      for (let y = Math.max(0, y0 - near); y < y0 && n < 4; y++) for (let x = x0; x <= x1 && n < 4; x++) if (dark(x, y)) n++;
      for (let y = y1 + 1; y <= Math.min(H - 1, y1 + near) && n < 4; y++) for (let x = x0; x <= x1 && n < 4; x++) if (dark(x, y)) n++;
      if (n < 4) paint(x0, y0, x1, y1);
    }
    i = j + 1;
  }
  const png = await sharp(Buffer.from(grey), { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
  return { grey, png, scale, W, H };
}

/**
 * The figure for a part on a page: the remaining ink between the part's
 * line and the next line of question text (or above it, for "above"). Null
 * if the part's text isn't on the page or there is no ink there.
 */
export function locateFigure(page: PageText, masked: { grey: Uint8Array; scale: number; W: number; H: number }, partText: string, lineIndex?: number): Found | null {
  const hint = hintLine(partText);
  const at = lineIndex ?? PREFIXES.map((len) => findText(page, hint.text, len)).find((i) => i >= 0) ?? -1;
  if (at < 0) return null;
  const line = page.lines[at];
  // Only a full-width line of question text ends a figure's space: a narrow
  // column of question text can be printed beside a figure.
  const body = page.lines.filter((l) => l.kind === "body" && l.x1 - l.x0 > page.width * 0.38);
  // Below: the gaps between successive lines of question text after the
  // part's line; the first with ink in it is the figure. The paragraph may
  // run on for a line or two past the sentence, so up to three gaps are tried.
  const below: { top: number; bottom: number }[] = [];
  let top = line.y1 + 1;
  for (let i = 0; i < 3; i++) {
    const next = body.find((l) => l.y0 > top + 2);
    below.push({ top, bottom: next ? next.y0 - 1 : page.height - 30 });
    if (!next) break;
    top = next.y1 + 1;
  }
  const prev = [...body].reverse().find((l) => l.y1 < line.y0 - 3);
  const above = { top: prev ? prev.y1 + 1 : 30, bottom: line.y0 - 1 };
  const order: ["below" | "above", { top: number; bottom: number }][] = hint.above
    ? [["above", above], ...below.map((b) => ["below", b] as ["below", typeof b])]
    : [...below.map((b) => ["below", b] as ["below", typeof b]), ["above", above]];
  for (const [side, band] of order) {
    const box = inkBox(masked, band.top * masked.scale, band.bottom * masked.scale, side === "above" ? "last" : "first");
    if (box) return { page: -1, box, how: `"${line.text.slice(0, 40)}", ${side} (${Math.round(band.top)}–${Math.round(band.bottom)}pt)` };
  }
  return null;
}

/**
 * A figure at the top of a page, before its first line of question text:
 * for a part whose text ends one page and whose figure is printed on the next.
 */
export function figureAtTop(page: PageText, masked: { grey: Uint8Array; scale: number; W: number; H: number }): Found | null {
  const first = page.lines.find((l) => l.kind === "body");
  const box = inkBox(masked, 30 * masked.scale, (first ? first.y0 - 1 : page.height - 30) * masked.scale);
  return box ? { page: -1, box, how: `top of the next page (30–${Math.round(first ? first.y0 : page.height - 30)}pt)` } : null;
}

/**
 * Bounding box of the ink between two rows (pixels), with a small white
 * margin, or null if blank. Where the ink falls in separate clusters with a
 * clear gap (30pt) between them, `which` says whether the first (nearest the
 * text above) or the last is wanted.
 */
export function inkBox(m: { grey: Uint8Array; scale: number; W: number; H: number }, top: number, bottom: number, which: "first" | "last" = "first") {
  const { grey, W, H, scale } = m;
  const T = Math.max(0, Math.round(top)), B = Math.min(H - 1, Math.round(bottom));
  // Rows and columns need two dark pixels, so one speck doesn't count.
  const inkRows: number[] = [];
  for (let y = T; y <= B; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (grey[y * W + x] < 200) { n++; if (n >= 2) { inkRows.push(y); break; } }
  }
  if (!inkRows.length) return null;
  const clusters: [number, number][] = [];
  for (const y of inkRows) {
    const last = clusters[clusters.length - 1];
    if (last && y - last[1] <= 30 * scale) last[1] = y;
    else clusters.push([y, y]);
  }
  const [y0, y1] = which === "first" ? clusters[0] : clusters[clusters.length - 1];
  let x0 = W, x1 = -1;
  for (let x = 0; x < W; x++) {
    let n = 0;
    for (let y = y0; y <= y1; y++) if (grey[y * W + x] < 200) { n++; if (n >= 2) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); break; } }
  }
  if (x1 < 0) return null;
  // Too small to be a figure (a stray mark): less than 12pt in either direction.
  if (x1 - x0 < 12 * scale || y1 - y0 < 12 * scale) return null;
  const pad = Math.round(4 * scale);
  const left = Math.max(0, x0 - pad), topPx = Math.max(0, y0 - pad);
  return { left, top: topPx, width: Math.min(W, x1 + pad + 1) - left, height: Math.min(H, y1 + pad + 1) - topPx };
}

/** Crop a box out of the masked page. */
export async function cropBox(maskedPng: Buffer, box: { left: number; top: number; width: number; height: number }): Promise<Buffer> {
  return sharp(maskedPng).extract(box).png().toBuffer();
}
