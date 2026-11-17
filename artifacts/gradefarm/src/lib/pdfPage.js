// Drawing an exam paper's PDF page in the browser for the crop tool, with
// pdf.js (the version the ingest uses), at the ingest's scale (cropTools.js).
// pdf.js is loaded only when a page is first drawn.
import { CROP_SCALE } from './cropTools'

let lib = null
async function pdfjs() {
  if (!lib) {
    lib = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([m, worker]) => {
      m.GlobalWorkerOptions.workerSrc = worker.default
      return m
    })
  }
  return lib
}

const docs = new Map()
/** The PDF at `url`, opened once per page visit. */
async function openPdf(url) {
  if (!docs.has(url)) docs.set(url, pdfjs().then(m => m.getDocument({ url }).promise).catch(e => { docs.delete(url); throw e }))
  return docs.get(url)
}

/** Page `pageNo` (1-based) drawn on a white canvas at `scale` pixels per point: { canvas, width, height, pages }. */
export async function renderPdfPage(url, pageNo, scale = CROP_SCALE) {
  const doc = await openPdf(url)
  const n = Math.min(Math.max(1, pageNo), doc.numPages)
  const page = await doc.getPage(n)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport, background: 'rgb(255,255,255)' }).promise
  return { canvas, width: canvas.width, height: canvas.height, page: n, pages: doc.numPages }
}

/** The page's pixels as greyscale (0 black … 255 white), for tightenBox. */
export function greyOf(canvas) {
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height)
  const g = new Uint8Array(canvas.width * canvas.height)
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
  return g
}

/** The box of the page as a PNG, at full resolution. */
export function cropPng(canvas, box) {
  const out = document.createElement('canvas')
  out.width = box.width
  out.height = box.height
  out.getContext('2d').drawImage(canvas, box.left, box.top, box.width, box.height, 0, 0, box.width, box.height)
  return new Promise((resolve, reject) => out.toBlob(b => (b ? resolve(b) : reject(new Error('The crop could not be made'))), 'image/png'))
}
