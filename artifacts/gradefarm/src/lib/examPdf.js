// Exam builder → a real A4 PDF file, made in the browser.
//
// Printing to PDF depends on the browser and its print settings: Safari and
// Firefox, or Chrome with margins or scaling left on, ignore the paper's A4
// page size and page breaks, so the pages run into each other and lines are
// cut at the sheet edges. Instead, each page of the paper (ExamPaper.jsx's
// .xp-page, already laid out at A4) is drawn to an image at print resolution
// and placed on its own A4 page, so the file is the same in every browser.

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

/**
 * Make the PDF of the paper under `root` and download it as `fileName`.
 * onProgress(done, total) is called as pages are drawn.
 */
export async function downloadExamPdf(root, fileName, onProgress = () => {}) {
  const pages = [...(root?.querySelectorAll('.xp-page') || [])]
  if (!pages.length) throw new Error('Nothing to download')
  const [{ toJpeg, getFontEmbedCSS }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')])
  await document.fonts?.ready
  await imagesLoaded(root)
  // Fonts (KaTeX's included) are read once and reused for every page.
  const fontEmbedCSS = await getFontEmbedCSS(pages[0]).catch(() => undefined)

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  for (let i = 0; i < pages.length; i++) {
    onProgress(i, pages.length)
    const data = await toJpeg(pages[i], {
      quality: 0.92,
      pixelRatio: PIXEL_RATIO,
      backgroundColor: '#ffffff',
      width: PAGE_PX.w,
      height: PAGE_PX.h,
      fontEmbedCSS,
      cacheBust: false,
      // The preview's page shadow and gap aren't part of the page.
      style: { margin: '0', boxShadow: 'none' },
    })
    if (i > 0) pdf.addPage('a4', 'portrait')
    pdf.addImage(data, 'JPEG', 0, 0, 210, 297, undefined, 'FAST')
    // Let the page repaint between pages so the progress shows.
    await new Promise(r => setTimeout(r, 0))
  }
  onProgress(pages.length, pages.length)
  pdf.save(fileName)
}
