// Browser checks for the printed exam paper (components/ExamPaper.jsx).
//
//   node browser-checks/run.mjs snapshot <dir>   save every printed page of the
//                                                 fixture exams (VCE and SACE)
//   node browser-checks/run.mjs compare <dir>    1. every page is identical to
//                                                    the snapshot in <dir> (built
//                                                    exams unchanged)
//                                                 2. each question block in the
//                                                    preview is identical to the
//                                                    same block in the built exam
//
// Run from artifacts/gradefarm. Needs Playwright's Chromium (pre-installed in
// the dev container). Exits 1 on any difference and saves both images.
import { createServer } from 'vite'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const [cmd, dir] = process.argv.slice(2)
if (!['snapshot', 'compare'].includes(cmd) || !dir) {
  console.error('usage: node browser-checks/run.mjs snapshot|compare <dir>')
  process.exit(2)
}
fs.mkdirSync(dir, { recursive: true })

const here = path.dirname(new URL(import.meta.url).pathname)
const server = await createServer({ configFile: path.join(here, 'vite.config.mjs') })
await server.listen()
const browser = await chromium.launch()
// [board, maths, sets]: the last cases add questions that share information (question sets).
const CASES = [['vce', '0', '0'], ['sace', '0', '0'], ['sace', '1', '0'], ['vce', '0', '1'], ['sace', '0', '1']]

async function open(params) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`http://localhost:5198/browser-checks/index.html?${params}`)
  await page.evaluate(() => window.__ready)
  return { page, errors }
}

/**
 * Each question block as laid out on its page: its HTML (with the inline
 * styles the page's equation fitting set), its exact size, and a picture of a
 * copy placed at a whole-pixel position, so a block that sits at a fractional
 * height on its page isn't reported as different for that alone.
 */
async function blocks(params) {
  const { page, errors } = await open(params)
  const info = await page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)]
    const xp = document.querySelector('.xp-print').parentElement
    const host = document.createElement('div')
    host.className = `${xp.className} check-host`
    host.style.cssText = 'position:absolute;left:0;top:0;background:#fff;z-index:99'
    document.body.appendChild(host)
    return els.map((b, i) => {
      const r = b.getBoundingClientRect()
      const wrap = document.createElement('div')
      wrap.className = [...b.parentElement.classList].filter(c => !/-box$/.test(c)).join(' ')
      wrap.id = `check-${i}`
      wrap.style.cssText = `position:relative;width:${r.width}px;height:${Math.ceil(r.height)}px;margin-bottom:16px;overflow:hidden`
      wrap.appendChild(b.cloneNode(true))
      host.appendChild(wrap)
      return { html: b.innerHTML, h: r.height, w: r.width }
    })
  }, BLOCKS)
  await page.evaluate(() => Promise.all([...document.querySelectorAll('.check-host img')].map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r })))))
  const pngs = []
  for (let i = 0; i < info.length; i++) pngs.push(await (await page.$(`#check-${i}`)).screenshot())
  await page.close()
  if (errors.length) throw new Error(`${params}: ${errors.join('; ')}`)
  return info.map((x, i) => ({ ...x, png: pngs[i] }))
}

/** Screenshots of the selected elements on a harness page, in order. */
async function shots(params, selector) {
  const { page, errors } = await open(params)
  const els = await page.$$(selector)
  const out = []
  for (const el of els) out.push(await el.screenshot())
  await page.close()
  if (errors.length) throw new Error(`${params}: ${errors.join('; ')}`)
  return out
}

const PAGES = '.xp-print > .xp-page, .xp-print > div > .xp-page'
// Question blocks: every printed block except section instructions and "End of …" lines.
const BLOCKS = '.xp-print .xp-page .xp-blk:not(:has(.xv-sec)):not(:has(.xv-endsec))'

let failed = 0
const same = (a, b) => a.length === b.length && a.equals(b)
for (const [board, maths, sets] of CASES) {
  const name = `${board}${maths === '1' ? '-maths' : ''}${sets === '1' ? '-sets' : ''}`
  const q = `board=${board}&maths=${maths}&sets=${sets}`
  const full = await shots(`${q}&mode=full`, PAGES)
  if (cmd === 'snapshot') {
    full.forEach((png, i) => fs.writeFileSync(path.join(dir, `${name}-page-${i + 1}.png`), png))
    console.log(`${name}: saved ${full.length} pages`)
    continue
  }
  // 1. Built exam unchanged.
  const before = fs.readdirSync(dir).filter(f => new RegExp(`^${name}-page-\\d+\\.png$`).test(f)).length
  if (!before) {
    full.forEach((png, i) => fs.writeFileSync(path.join(dir, `${name}-page-${i + 1}.png`), png))
    console.log(`${name}: no snapshot yet; saved ${full.length} pages`)
  } else if (before !== full.length) { failed++; console.log(`✗ ${name}: ${full.length} pages now, ${before} before`) }
  full.forEach((png, i) => {
    const file = path.join(dir, `${name}-page-${i + 1}.png`)
    if (before && (!fs.existsSync(file) || !same(png, fs.readFileSync(file)))) {
      failed++
      fs.writeFileSync(path.join(dir, `${name}-page-${i + 1}.now.png`), png)
      console.log(`✗ ${name}: page ${i + 1} differs (saved .now.png)`)
    }
  })
  // 2. Preview blocks = built exam blocks: same HTML, same size, same pixels.
  const built = await blocks(`${q}&mode=full`)
  const prev = await blocks(`${q}&mode=preview`)
  if (built.length !== prev.length) { failed++; console.log(`✗ ${name}: ${prev.length} preview blocks, ${built.length} in the built exam`) }
  prev.forEach((b, i) => {
    const o = built[i]
    const why = !o ? 'missing' : b.html !== o.html ? 'HTML differs' : b.h !== o.h || b.w !== o.w ? `size ${b.w}×${b.h} vs ${o.w}×${o.h}` : !same(b.png, o.png) ? 'pixels differ' : ''
    if (why) {
      failed++
      fs.writeFileSync(path.join(dir, `${name}-blk-${i + 1}.preview.png`), b.png)
      if (o) fs.writeFileSync(path.join(dir, `${name}-blk-${i + 1}.built.png`), o.png)
      console.log(`✗ ${name}: question block ${i + 1}: ${why}`)
    }
  })
  const previewPages = await shots(`${q}&mode=preview`, PAGES)
  console.log(`${name}: ${full.length} built pages compared; ${prev.length} question blocks compared with the preview (${previewPages.length} preview pages)`)
}

await browser.close()
await server.close()
console.log(failed ? `${failed} difference(s)` : 'All identical.')
process.exit(failed ? 1 : 0)
