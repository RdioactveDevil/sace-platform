// Exam builder → a real A4 PDF file, made in the browser.
//
// Printing to PDF depends on the browser and its print settings: Safari and
// Firefox, or Chrome with margins or scaling left on, ignore the paper's A4
// page size and page breaks, so the pages run into each other and lines are
// cut at the sheet edges. Instead, each page of the paper (ExamPaper.jsx's
// .xp-page, already laid out at A4) is drawn to an image at print resolution
// and placed on its own A4 page, so the file is the same in every browser.
//
// Pictures (figures cropped from exam papers) are not left to the page
// drawing: Safari, which every browser on an iPhone or iPad uses, draws them
// blank. They are hidden while the page is drawn and painted onto it
// afterwards, in the same place.

const PAGE_PX = { w: 794, h: 1123 } // A4 at 96 dpi, as the paper lays it out
const PIXEL_RATIO = 2.5            // ≈ 240 dpi: crisp text when printed

/** Wait for every image under `root` to load (or fail), so pages aren't drawn with blanks. */
async function imagesLoaded(root) {
  const imgs = [...root.querySelectorAll('img')]
  await Promise.all(imgs.map(img => (img.complete ? null : new Promise(res => {
    img.addEventListener('load', res, { once: true })
    img.addEventListener('error', res, { once: true })
  }))))
}

/** A picture fetched afresh (so drawing it doesn't lock the canvas), ready to draw. */
const pictures = new Map()
function picture(src) {
  if (!pictures.has(src)) {
    pictures.set(src, (async () => {
      const res = await fetch(src, { mode: 'cors' })
      if (!res.ok) throw new Error(`Image ${res.status}`)
      const url = URL.createObjectURL(await res.blob())
      const img = new Image()
      img.src = url
      await img.decode()
      return img
    })().catch(() => null))
  }
  return pictures.get(src)
}

/**
 * Where each picture on `page` sits, in the page's own pixels (the preview
 * may be zoomed), with the box an object-fit: contain picture fills.
 */
export function placeImages(page, imgs) {
  const box = page.getBoundingClientRect()
  const k = box.width / PAGE_PX.w || 1
  return imgs.map(img => {
    const r = img.getBoundingClientRect()
    let x = (r.left - box.left) / k, y = (r.top - box.top) / k, w = r.width / k, h = r.height / k
    const nw = img.naturalWidth, nh = img.naturalHeight
    if (nw && nh && w && h) {
      const s = Math.min(w / nw, h / nh)
      const dw = nw * s, dh = nh * s
      x += (w - dw) / 2; y += (h - dh) / 2; w = dw; h = dh
    }
    return { img, x, y, w, h }
  })
}

/**
 * Make the PDF of the paper under `root` and download it as `fileName`.
 * onProgress(done, total) is called as pages are drawn.
 */
export async function downloadExamPdf(root, fileName, onProgress = () => {}) {
  const pages = [...(root?.querySelectorAll('.xp-page') || [])]
  if (!pages.length) throw new Error('Nothing to download')
  const [{ toCanvas, getFontEmbedCSS }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')])
  await document.fonts?.ready
  await imagesLoaded(root)
  // Fonts (KaTeX's included) are read once and reused for every page.
  const fontEmbedCSS = await getFontEmbedCSS(pages[0]).catch(() => undefined)

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  for (let i = 0; i < pages.length; i++) {
    onProgress(i, pages.length)
    const page = pages[i]
    const shown = [...page.querySelectorAll('img')].filter(img => img.offsetWidth > 0 && img.offsetHeight > 0 && img.naturalWidth > 0)
    const spots = placeImages(page, shown)
    const loaded = await Promise.all(spots.map(s => picture(s.img.currentSrc || s.img.src)))
    // Hide the pictures the page drawing would leave blank; their space stays.
    const hidden = spots.filter((_, j) => loaded[j])
    hidden.forEach(s => { s.img.style.visibility = 'hidden' })
    let canvas
    try {
      canvas = await toCanvas(page, {
        pixelRatio: PIXEL_RATIO,
        backgroundColor: '#ffffff',
        width: PAGE_PX.w,
        height: PAGE_PX.h,
        fontEmbedCSS,
        cacheBust: false,
        // The preview's page shadow and gap aren't part of the page.
        style: { margin: '0', boxShadow: 'none' },
      })
    } finally {
      hidden.forEach(s => { s.img.style.visibility = '' })
    }
    const ctx = canvas.getContext('2d')
    const px = canvas.width / PAGE_PX.w
    ctx.imageSmoothingQuality = 'high'
    spots.forEach((s, j) => { if (loaded[j]) ctx.drawImage(loaded[j], s.x * px, s.y * px, s.w * px, s.h * px) })
    const data = canvas.toDataURL('image/jpeg', 0.92)
    if (i > 0) pdf.addPage('a4', 'portrait')
    pdf.addImage(data, 'JPEG', 0, 0, 210, 297, undefined, 'FAST')
    // Let the page repaint between pages so the progress shows.
    await new Promise(r => setTimeout(r, 0))
  }
  onProgress(pages.length, pages.length)
  pdf.save(fileName)
}
