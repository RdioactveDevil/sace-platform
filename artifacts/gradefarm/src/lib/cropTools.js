// Cropping a figure from an exam paper's page in Admin (CropTool.jsx).
//
// Pages are drawn at the ingest's scale, 3 pixels per PDF point
// (scripts/src/ingest-past-paper.ts renders at scale 3), so a figure cropped
// here has the pixel size an ingest crop of the same area has, and the printed
// paper sizes it the same (examBuilder.js figureSizeMm). Pure functions on a
// greyscale page; drawing the page is lib/pdfPage.js.

/** Pixels per PDF point, as the ingest crops. */
export const CROP_SCALE = 3

/** Darker than this is ink (as the ingest's figure finder counts it). */
const INK = 200

/** A box in whole pixels, on the page; a box dragged up or left is turned the right way round. */
export function clampBox(box, W, H) {
  const x0 = Math.min(box.left, box.left + box.width)
  const x1 = Math.max(box.left, box.left + box.width)
  const y0 = Math.min(box.top, box.top + box.height)
  const y1 = Math.max(box.top, box.top + box.height)
  const cx = (v) => Math.min(W, Math.max(0, Math.round(v)))
  const cy = (v) => Math.min(H, Math.max(0, Math.round(v)))
  const left = cx(x0), top = cy(y0)
  return { left, top, width: cx(x1) - left, height: cy(y1) - top }
}

/**
 * The box trimmed to the drawing inside it: every row and column with ink
 * (two or more dark pixels, so a speck doesn't count) is kept, then a white
 * margin of up to 3 points (9 px, the ingest's) is added on each side, only
 * through blank rows and columns and never past the box the admin drew. A box
 * with no ink in it comes back as it was.
 */
export function tightenBox(grey, W, H, box, scale = CROP_SCALE) {
  const b = clampBox(box, W, H)
  const L = b.left, T = b.top, R = b.left + b.width - 1, B = b.top + b.height - 1
  if (R < L || B < T) return b
  const rowInk = (y) => { let n = 0; for (let x = L; x <= R; x++) if (grey[y * W + x] < INK && ++n >= 2) return true; return false }
  const colInk = (x) => { let n = 0; for (let y = T; y <= B; y++) if (grey[y * W + x] < INK && ++n >= 2) return true; return false }
  let y0 = -1, y1 = -1, x0 = -1, x1 = -1
  for (let y = T; y <= B; y++) if (rowInk(y)) { if (y0 < 0) y0 = y; y1 = y }
  for (let x = L; x <= R; x++) if (colInk(x)) { if (x0 < 0) x0 = x; x1 = x }
  if (y0 < 0 || x0 < 0) return b
  const pad = Math.round(3 * scale)
  for (let i = 0; i < pad && y0 > T && !rowInk(y0 - 1); i++) y0--
  for (let i = 0; i < pad && y1 < B && !rowInk(y1 + 1); i++) y1++
  for (let i = 0; i < pad && x0 > L && !colInk(x0 - 1); i++) x0--
  for (let i = 0; i < pad && x1 < R && !colInk(x1 + 1); i++) x1++
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}
