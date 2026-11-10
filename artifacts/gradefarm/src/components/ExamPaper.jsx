import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import MathText from './MathText'
import GraphView from './GraphView'
import TableView from './TableView'
import DiagramView from './DiagramView'
import { partsOf, marksOf, sourceLabel, paginate, linesForMarks, formatMinutes, splitAtFigure, wantsDrawing, figureSizeMm } from '../lib/examBuilder'

// Practice exams laid out like the real papers, in two house styles matched
// to the 2025 papers: VCE (VCAA question and answer book) and SACE (question
// booklets). Blocks (a section's instructions, a question heading, a part
// with its answer space) are measured off-screen at the page's content width
// and packed onto A4 pages, so what prints is exactly what shows. GradeFarm
// branding only: no board logos, crests, copyright lines or acknowledgements.

const MM = 96 / 25.4
const letter = (i) => (Number.isInteger(i) ? String.fromCharCode(65 + i) : '–')
// A student's copy has answers only for questions they've answered or from real papers.
const NOT_YET = 'Solution shown once you have answered this question in practice.'
const range = (n) => Array.from({ length: Math.max(0, n) }, (_, i) => i)

// ── Geometry (mm) ────────────────────────────────────────────────────────────
const VCE = { strip: 15, gap: 12, outer: 13, top: 21, height: 251 }
VCE.width = 210 - VCE.strip - VCE.gap - VCE.outer // 170
const SACE = { side: 25, top: 25, height: 242 }
SACE.width = 210 - SACE.side * 2 // 160

const BAND = { exam1: '#d47a8b', exam2: '#9e8a5a' }

const CSS = `
  .xp { color: #1a1a1a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .xp * { box-sizing: border-box; }
  .xp h1, .xp h2, .xp h3, .xp h4, .xp b, .xp strong { font-weight: 700; }
  .xp ul { list-style: disc; margin: 0; padding-left: 5mm; }
  .xp-page { position: relative; width: 210mm; height: 297mm; background: #fff; overflow: hidden; margin: 0 auto 10mm; box-shadow: 0 6px 30px rgba(0,0,0,0.28); }
  .xp-blk { display: flow-root; }
  .xp-fig { margin: 2.5mm 0; max-width: 120mm; }
  .xp-fig img { max-width: 100%; max-height: 95mm; object-fit: contain; display: block; }
  .xp-fig > div { background: #fff !important; border: none !important; border-radius: 0 !important; margin: 0 !important; }
  .xp .katex { font-size: 1.04em; }
  /* On paper nothing scrolls: a scroll box would print its scrollbar and cut off what doesn't fit. */
  .xp .mt-display, .xp .mt-table, .xp-fig div { overflow: visible !important; }
  .xp-measure { position: absolute; left: -10000px; top: 0; visibility: hidden; pointer-events: none; }

  /* VCE */
  .xv { font-family: Arial, Helvetica, sans-serif; }
  .xv-body { font-size: 10.5pt; line-height: 1.4; }
  .xv-serif { font-family: 'Times New Roman', Times, serif; font-size: 11.5pt; line-height: 1.45; }
  .xv-box { position: absolute; top: ${VCE.top}mm; width: ${VCE.width}mm; height: ${VCE.height}mm; }
  .xv-even .xv-box, .xv-even .xv-head { left: ${VCE.outer}mm; }
  .xv-odd .xv-box, .xv-odd .xv-head { left: ${VCE.strip + VCE.gap}mm; }
  .xv-strip { position: absolute; top: 0; bottom: 0; width: ${VCE.strip}mm; background: #393536; display: flex; align-items: center; justify-content: center; }
  .xv-even .xv-strip { right: 0; } .xv-odd .xv-strip { left: 0; }
  .xv-strip span { writing-mode: vertical-rl; color: #fff; font-weight: 700; font-size: 11pt; white-space: nowrap; }
  .xv-odd .xv-strip span { transform: rotate(180deg); }
  .xv-head { position: absolute; top: 9.5mm; width: ${VCE.width}mm; display: flex; justify-content: space-between; font-size: 9pt; padding-bottom: 1.6mm; border-bottom: 0.25mm solid #1a1a1a; }
  .xv-foot { position: absolute; bottom: 14mm; font-size: 10pt; }
  .xv-even .xv-foot { right: ${VCE.strip + VCE.gap}mm; } .xv-odd .xv-foot { right: ${VCE.outer}mm; }
  .xv-sec h2 { font-size: 15pt; font-weight: 400; margin: 0 0 2.5mm; } .xv-sec h2 b { font-weight: 700; }
  .xv-sec h3 { font-size: 12pt; margin: 0 0 1mm; }
  .xv-sec ul { padding-left: 4mm; margin-bottom: 4mm; } .xv-sec li { margin-bottom: 0.9mm; }
  .xv-sec { border-bottom: 0.45mm solid #1a1a1a; margin-bottom: 7mm; }
  .xv-q { padding-bottom: 7mm; }
  .xv-qh { font-size: 10.5pt; margin-bottom: 1mm; }
  .xv-src { font-size: 8pt; font-style: italic; color: #555; margin-left: 2mm; }
  .xv-opts { margin-top: 1.5mm; display: flex; flex-direction: column; gap: 2mm; }
  .xv-opt { display: grid; grid-template-columns: 8mm 1fr; }
  .xv-opt > b { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; padding-top: 0.4mm; }
  .xv-part { display: grid; grid-template-columns: 8mm minmax(0, 1fr) 22mm; padding-bottom: 6mm; }
  .xv-part.l2 { grid-template-columns: 16mm minmax(0, 1fr) 22mm; }
  .xv-part.l3 { grid-template-columns: 24mm minmax(0, 1fr) 22mm; }
  .xv-part > .lbl { font-weight: 700; font-size: 10.5pt; padding-top: 0.4mm; }
  .xv-part.l2 > .lbl { padding-left: 8mm; } .xv-part.l3 > .lbl { padding-left: 16mm; }
  .xv-part > .mk { text-align: right; font-size: 10.5pt; align-self: end; }
  .xv-lines { grid-column: 2 / 3; padding-top: 2mm; }
  .xv-line { height: 8.6mm; border-bottom: 0.3mm solid #1a1a1a; }
  .xv-endsec { display: flex; justify-content: flex-end; padding-top: 6mm; }
  .xv-endsec span { border-top: 0.4mm solid #1a1a1a; padding-top: 1.5mm; width: 32mm; text-align: right; font-weight: 700; font-size: 10.5pt; }
  .xv-blank { position: absolute; left: 0; right: 0; top: 46%; text-align: center; font-weight: 700; font-size: 10.5pt; }
  .xv-cover { position: absolute; inset: 0; }
  .xv-band { position: absolute; top: 0; bottom: 0; width: 10mm; }
  .xv-label { position: absolute; top: 11mm; left: 105mm; right: 12mm; height: 31mm; border: 0.35mm dotted #555; border-radius: 3mm; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 6.5pt; line-height: 1.5; }
  .xv-sn { position: absolute; top: 47mm; left: 89mm; right: 12mm; }
  .xv-sn .row { display: flex; justify-content: space-between; }
  .xv-sn .grp { display: flex; }
  .xv-sn .cell { width: 10.6mm; height: 9.6mm; border: 0.3mm solid #1a1a1a; margin-left: -0.3mm; }
  .xv-sn .cap { display: flex; justify-content: space-between; font-size: 9.5pt; margin-top: 1.6mm; }
  .xv-title { position: absolute; left: 20mm; right: 24mm; }
  .xv-title .t1 { font-size: 29pt; line-height: 1.12; font-weight: 400; margin: 0; }
  .xv-title .t2 { font-size: 19pt; margin: 2mm 0 3mm; font-weight: 400; }
  .xv-title .t3 { font-size: 15pt; padding-bottom: 3mm; border-bottom: 0.5mm solid #1a1a1a; }
  .xv-cbody { font-size: 10.5pt; line-height: 1.45; padding-top: 2.5mm; }
  .xv-cbody h3 { font-size: 12.5pt; margin: 2.2mm 0 0.6mm; }
  .xv-cbody ul { padding-left: 4mm; }
  .xv-contents { margin-top: 4mm; padding-top: 3mm; border-top: 0.5mm solid #1a1a1a; font-size: 10.5pt; }
  .xv-contents .r { display: flex; align-items: baseline; gap: 1.5mm; margin-top: 1.4mm; }
  .xv-contents .lead { flex: 1; border-bottom: 0.3mm solid #1a1a1a; transform: translateY(-1mm); }
  .xv-cfoot { position: absolute; left: 20mm; right: 12mm; bottom: 12mm; display: flex; justify-content: space-between; align-items: flex-end; font-size: 9pt; color: #333; }

  /* SACE */
  .xs { font-family: Arial, Helvetica, sans-serif; }
  .xs-body { font-size: 10.5pt; line-height: 1.38; }
  .xs-box { position: absolute; top: ${SACE.top}mm; left: ${SACE.side}mm; width: ${SACE.width}mm; height: ${SACE.height}mm; }
  .xs-foot { position: absolute; bottom: 14mm; left: ${SACE.side}mm; right: ${SACE.side}mm; font-size: 10pt; text-align: center; }
  .xs-foot .po { position: absolute; right: 0; top: 0; }
  .xs-cont { position: absolute; bottom: 26mm; left: ${SACE.side}mm; right: ${SACE.side}mm; text-align: center; font-weight: 700; font-style: italic; font-size: 10.5pt; }
  .xs-q { padding-bottom: 3mm; }
  .xs-stem { display: grid; grid-template-columns: 7mm 1fr; padding-bottom: 4mm; }
  .xs-qh { padding-bottom: 5mm; } .xs-qh b { display: inline-block; width: 35mm; }
  .xs-src { font-size: 8pt; font-style: italic; color: #555; margin-left: 2mm; }
  .xs-part { display: grid; grid-template-columns: 7mm 7mm 7mm 7mm minmax(0, 1fr); padding-bottom: 3mm; }
  .xs-part > * { grid-row: 1; }
  .xs-part > .lbl { grid-column: var(--lc); }
  .xs-part > .txt { grid-column: var(--tc) / -1; }
  .xs-lines { margin-bottom: 7mm; }
  .xs-line { height: 8.4mm; border-bottom: 0.25mm solid #9a9a9a; }
  .xs-line.last { display: flex; align-items: flex-end; border-bottom: none; }
  .xs-line.last i { flex: 1; border-bottom: 0.25mm solid #9a9a9a; margin-right: 1.5mm; }
  .xs-mk { text-align: right; padding: 2mm 0 7mm; }
  .xs-grid { border: 0.25mm solid #9a9a9a; background-image: linear-gradient(#b5b5b5 0.2mm, transparent 0.2mm), linear-gradient(90deg, #b5b5b5 0.2mm, transparent 0.2mm); background-size: 5mm 5mm; background-position: -0.2mm -0.2mm; }
  .xs-opts { display: flex; flex-direction: column; gap: 1.5mm; margin: 0 0 2mm 7mm; }
  .xs-opt { display: grid; grid-template-columns: 9mm 1fr; }
  .xs-tab { position: absolute; width: 10mm; height: 40mm; background: #1e1e1e; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 22pt; }
  .xs-cover { position: absolute; inset: 0; }
  .xs-brand { position: absolute; top: 18mm; left: 9mm; font-size: 15pt; font-weight: 700; letter-spacing: 0.02em; line-height: 1.15; }
  .xs-brand small { display: block; font-size: 8.5pt; font-weight: 700; letter-spacing: 0; }
  .xs-narrow { font-family: 'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif; font-stretch: condensed; font-weight: 700; letter-spacing: -0.01em; }
  .xs-title { position: absolute; top: 57mm; right: 15mm; text-align: right; line-height: 1.1; }
  .xs-title .t1 { font-size: 26pt; } .xs-title .t2 { font-size: 19pt; }
  .xs-cbody { position: absolute; top: 85mm; left: 27mm; right: 15mm; font-size: 10pt; line-height: 1.35; }
  .xs-cbody h2 { font-size: 16pt; margin: 0 0 4mm; }
  .xs-cbody h3 { font-size: 10pt; margin: 4mm 0 0; }
  .xs-cbody ul { padding-left: 4mm; }
  .xs-cfoot { position: absolute; left: 27mm; right: 15mm; bottom: 14mm; font-size: 9pt; }
  .xs-cfoot .note { text-align: center; font-style: italic; padding-bottom: 2mm; border-bottom: 0.25mm solid #aaa; margin-bottom: 3mm; color: #333; }
  .xs-lbox { border: 0.3mm solid #1a1a1a; height: 30mm; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 9.5pt; text-align: center; }
  .xs-calc { border: 0.3mm solid #1a1a1a; height: 30mm; padding: 1.5mm 2mm; font-size: 8.5pt; }
  .xs-calc .ln { display: flex; gap: 1mm; margin-top: 1.6mm; } .xs-calc .ln i { flex: 1; border-bottom: 0.25mm solid #1a1a1a; }

  .xp-sol h4 { margin: 0 0 1mm; font-size: 10.5pt; }
  .xp-sol .src { font-size: 8pt; font-style: italic; color: #555; font-weight: 400; }
  .xp-sol-part { display: grid; grid-template-columns: 21mm minmax(0, 1fr) auto; column-gap: 2mm; padding-bottom: 2.5mm; }
  .xp-sol-part > b { white-space: nowrap; }
  .xp-anstable { border-collapse: collapse; width: 100%; margin-bottom: 5mm; font-size: 10pt; }
  .xp-anstable td { border: 0.25mm solid #1a1a1a; padding: 1.4mm 2mm; text-align: center; }
  .xp-sheet { padding: 16mm 20mm; height: 100%; font-size: 10pt; font-family: Arial, Helvetica, sans-serif; }
  .xp-bub { width: 8mm; height: 4.6mm; border: 0.3mm solid #1a1a1a; border-radius: 2.3mm; font-size: 7pt; display: inline-flex; align-items: center; justify-content: center; }

  @media print {
    @page { size: A4; margin: 0; }
    html, body { background: #fff !important; margin: 0 !important; }
    body * { visibility: hidden; }
    .xp-print, .xp-print * { visibility: visible; }
    .xp-print { position: absolute; left: 0; top: 0; zoom: 1 !important; }
    .xp-page { margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
  }
`

function Figure({ q, src, onLoad }) {
  const [size, setSize] = useState(null)
  if (!(q?.graph || q?.table_data || q?.diagram || src)) return null
  // A figure cropped from an exam paper prints at the size it had on that paper.
  const loaded = (e) => {
    const img = e.currentTarget
    if (/\/exam-papers\//.test(src)) setSize(figureSizeMm(img.naturalWidth, img.naturalHeight))
    onLoad?.()
  }
  return (
    <div className="xp-fig">
      {q?.graph && <GraphView graph={q.graph} theme="light" />}
      {q?.table_data && <TableView table={q.table_data} theme="light" />}
      {q?.diagram && <DiagramView diagram={q.diagram} theme="light" />}
      {src && <img src={src} alt="" onLoad={loaded} onError={onLoad} style={size ? { width: `${size.width}mm`, height: 'auto' } : undefined} />}
    </div>
  )
}

/** A part's text with its figure where the text says it is ("... shown below"). */
function PartText({ text, src, onLoad }) {
  const [before, after] = src ? splitAtFigure(text) : [text, '']
  return (
    <>
      {before && <MathText text={before} />}
      <Figure src={src} onLoad={onLoad} />
      {after && <div><MathText text={after} /></div>}
    </>
  )
}

/**
 * Shrink any equation that is wider than the space it sits in, so that it
 * prints whole. Sizes are compared within one family of measurements so the
 * preview's zoom doesn't matter.
 */
function fitMath(root) {
  if (!root) return
  for (const el of root.querySelectorAll('.mt-display, span[data-tex]')) {
    el.style.fontSize = ''
    const display = el.classList.contains('mt-display')
    let box = el, width = el.scrollWidth
    if (!display) {
      width = el.offsetWidth
      if (width < 150) continue
      box = el.parentElement
      while (box && getComputedStyle(box).display.startsWith('inline')) box = box.parentElement
    }
    const room = box?.clientWidth || 0
    if (room > 0 && width > room + 1) el.style.fontSize = `${Math.max(50, Math.floor((room / width) * 100))}%`
  }
}

/** Fit the equations on the printed pages after every render. */
function useFitMath() {
  const ref = useRef(null)
  useLayoutEffect(() => { fitMath(ref.current) })
  return ref
}

/** Measure every block once, at the page's content width, in a hidden copy outside any zoomed preview. */
function useHeights(lists, className, widthMm) {
  const ref = useRef(null)
  const [heights, setHeights] = useState({})
  const [tick, setTick] = useState(0)
  useEffect(() => { document.fonts?.ready?.then(() => setTick(t => t + 1)) }, [])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const next = {}
    fitMath(el)
    for (const child of el.children) next[child.dataset.key] = child.getBoundingClientRect().height
    setHeights(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [lists, tick])
  const portal = createPortal(
    <div className={`xp ${className}`} aria-hidden="true">
      <div className="xp-measure" ref={ref} style={{ width: `${widthMm}mm` }}>
        {lists.flat().map(b => <div key={b.key} data-key={b.key} className="xp-blk">{b.el}</div>)}
      </div>
    </div>,
    document.body,
  )
  return { heights, portal, bump: () => setTick(t => t + 1) }
}

const packed = (blocks, heights, capacityMm) => paginate(blocks.map(b => ({ ...b, h: heights[b.key] ?? 0, tail: (b.tailMm || 0) * MM })), capacityMm * MM)

// ── Solutions (both styles) ───────────────────────────────────────────────────
function solutionBlocks(exam, numberOf) {
  const out = [{ key: 'sol-h', keepWithNext: true, el: <div style={{ fontSize: '15pt', fontWeight: 700, marginBottom: '4mm' }}>Solutions</div> }]
  if (exam.A.length) {
    out.push({
      key: 'sol-key', el: (
        <table className="xp-anstable"><tbody>
          {range(Math.ceil(exam.A.length / 10)).map(r => (
            <tr key={r}>{exam.A.slice(r * 10, r * 10 + 10).map((q, j) => <td key={q.id}><b>{numberOf('A', r * 10 + j)}</b> {letter(q.answer_index)}</td>)}</tr>
          ))}
        </tbody></table>
      ),
    })
    exam.A.forEach((q, i) => out.push({
      key: `sol-A-${q.id}`, el: (
        <div className="xp-sol" style={{ paddingBottom: '4mm' }}>
          <h4>Question {numberOf('A', i)}: {letter(q.answer_index)} <span className="src">{sourceLabel(q)}</span></h4>
          {q.solution ? <MathText text={q.solution} /> : !Number.isInteger(q.answer_index) && <p>{NOT_YET}</p>}
        </div>
      ),
    }))
  }
  exam.B.forEach((q, i) => {
    out.push({ key: `sol-B-${q.id}`, keepWithNext: true, el: <div className="xp-sol" style={{ paddingBottom: '1.5mm' }}><h4>Question {numberOf('B', i)} ({marksOf(q)} marks) <span className="src">{sourceLabel(q)}</span></h4></div> })
    const parts = partsOf(q)
    if (!parts.some(p => p.solution)) {
      out.push({ key: `sol-B-${q.id}-none`, el: <div className="xp-sol-part"><b /><div>{NOT_YET}</div><span /></div> })
      return
    }
    // Each answer under its full label, e.g. (b)(ii)(1): the parts that only
    // introduce their sub-parts have no answer of their own and aren't listed.
    const path = []
    parts.forEach((p, k) => {
      path.length = Math.max(0, p.level - 1)
      path[p.level - 1] = p.label ? `(${p.label})` : ''
      if (!p.solution && !p.marks) return
      out.push({
        key: `sol-B-${q.id}-${k}`, el: (
          <div className="xp-sol-part">
            <b>{path.join('')}</b>
            <div><MathText text={p.solution || '—'} /></div>
            <span style={{ whiteSpace: 'nowrap' }}>{p.marks ? `${p.marks} mark${p.marks === 1 ? '' : 's'}` : ''}</span>
          </div>
        ),
      })
    })
  })
  return out
}

function SolutionPages({ pages, blocks, title, widthMm, top, body }) {
  return pages.map((page, i) => (
    <div key={`sol${i}`} className="xp-page">
      <div style={{ position: 'absolute', top: '10mm', left: `${(210 - widthMm) / 2}mm`, width: `${widthMm}mm`, display: 'flex', justifyContent: 'space-between', fontSize: '9pt', borderBottom: '0.25mm solid #1a1a1a', paddingBottom: '1.5mm' }}>
        <span>{title} – Solutions</span><span>{i + 1}</span>
      </div>
      <div className={body} style={{ position: 'absolute', top: `${top}mm`, left: `${(210 - widthMm) / 2}mm`, width: `${widthMm}mm` }}>
        {page.map(bi => <div key={blocks[bi].key} className="xp-blk">{blocks[bi].el}</div>)}
      </div>
    </div>
  ))
}

function AnswerSheet({ exam, meta }) {
  return (
    <div className="xp-page">
      <div className="xp-sheet">
        <div style={{ fontSize: '17pt' }}>{meta.subjectTitle}</div>
        <div style={{ fontSize: '13pt' }}>{meta.paperTitle}</div>
        <div style={{ fontSize: '14pt', fontWeight: 700, margin: '6mm 0 4mm' }}>Multiple-Choice Answer Sheet</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8mm' }}>
          <div>Student name<div style={{ height: '8mm', borderBottom: '0.3mm solid #1a1a1a' }} /></div>
          <div>Student number<div style={{ height: '8mm', borderBottom: '0.3mm solid #1a1a1a' }} /></div>
        </div>
        <ul style={{ margin: '6mm 0' }}>
          <li>Use a <b>pencil</b> for <b>all</b> entries. Shade the oval that shows your answer.</li>
          <li>Marks will <b>not</b> be deducted for incorrect answers.</li>
          <li>No marks will be given if more than one answer is completed for any question.</li>
          <li>If you make a mistake, <b>erase</b> the incorrect answer – do <b>not</b> cross it out.</li>
        </ul>
        <div style={{ display: 'grid', gridAutoFlow: 'column', gridTemplateRows: `repeat(${Math.min(20, exam.A.length)}, 7.2mm)`, columnGap: '12mm', alignItems: 'center' }}>
          {exam.A.map((q, i) => (
            <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: '2.2mm' }}>
              <b style={{ width: '7mm', textAlign: 'right' }}>{i + 1}</b>
              {range(Math.max(4, (q.options || []).length)).map(j => <span key={j} className="xp-bub">{letter(j)}</span>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── VCE ──────────────────────────────────────────────────────────────────────
function vceBlocks(exam, meta, onLoad) {
  const blocks = []
  const src = (q) => meta.showSources && q.source ? <span className="xv-src">{sourceLabel(q)}</span> : null
  const bullets = (items) => <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
  const writtenRules = [
    <>Answer <b>all</b> questions in the spaces provided.</>,
    <>Write your responses in English.</>,
    ...(meta.isMaths ? [
      <>In questions where a numerical answer is required, an <b>exact</b> value must be given unless otherwise specified.</>,
      <>In questions where more than one mark is available, appropriate working <b>must</b> be shown.</>,
    ] : [<>Where a calculation is required, show your working.</>]),
    <>Unless otherwise indicated, the diagrams in this book are <b>not</b> drawn to scale.</>,
  ]
  const sections = exam.A.length > 0

  if (sections) {
    blocks.push({
      key: 'secA', section: 'A', breakBefore: true, keepWithNext: true, el: (
        <div className="xv-sec">
          <h2><b>Section A</b> – Multiple-choice questions</h2>
          <h3>Instructions</h3>
          {bullets([
            <>Answer <b>all</b> questions in pencil on your Multiple-Choice Answer Sheet.</>,
            <>Choose the response that is <b>correct</b> for the question.</>,
            <>A correct answer scores 1; an incorrect answer scores 0.</>,
            <>Marks will <b>not</b> be deducted for incorrect answers.</>,
            <>No marks will be given if more than one answer is completed for any question.</>,
            <>Unless otherwise indicated, the diagrams in this book are <b>not</b> drawn to scale.</>,
          ])}
        </div>
      ),
    })
    exam.A.forEach((q, i) => blocks.push({
      key: `A-${q.id}`, section: 'A', tailMm: 7, el: (
        <div className="xv-q">
          <div className="xv-qh"><b>Question {i + 1}</b>{src(q)}</div>
          <div className="xv-serif"><MathText text={q.question} /></div>
          <Figure q={q} src={q.image_url} onLoad={onLoad} />
          <div className="xv-opts xv-serif">
            {(q.options || []).map((o, j) => <div key={j} className="xv-opt"><b>{letter(j)}.</b><span><MathText text={o} /></span></div>)}
          </div>
        </div>
      ),
    }))
    blocks.push({ key: 'endA', section: 'A', el: <div className="xv-endsec"><span>End of Section A</span></div> })
  }

  if (exam.B.length) {
    const section = sections ? 'B' : ''
    blocks.push({
      key: 'secB', section, breakBefore: true, startEven: sections, keepWithNext: true, el: (
        <div className="xv-sec">
          {sections && <h2><b>Section B</b></h2>}
          <h3>Instructions</h3>
          {bullets(writtenRules)}
        </div>
      ),
    })
    exam.B.forEach((q, i) => {
      const parts = partsOf(q)
      const single = parts.length === 1 && !parts[0].label
      blocks.push({
        key: `B-${q.id}`, section, keepWithNext: true, el: (
          <div style={{ paddingBottom: '2.5mm' }}>
            <div className="xv-qh"><b>Question {i + 1}</b> ({marksOf(q)} mark{marksOf(q) === 1 ? '' : 's'}){src(q)}</div>
            {q.question && <div className="xv-serif"><MathText text={q.question} /></div>}
            <Figure q={q} src={q.image_url} onLoad={onLoad} />
          </div>
        ),
      })
      parts.forEach((p, k) => {
        const intro = !p.marks
        blocks.push({
          key: `B-${q.id}-${k}`, section, keepWithNext: intro, tailMm: 6, el: (
            <div className={`xv-part${p.level > 1 ? ` l${p.level}` : ''}`} style={single ? { gridTemplateColumns: '0 minmax(0, 1fr) 22mm' } : undefined}>
              <span className="lbl">{p.label ? `${p.label}.` : ''}</span>
              <div className="xv-serif"><PartText text={p.text} src={p.image_url} onLoad={onLoad} /></div>
              <span className="mk">{intro ? '' : `${p.marks} mark${p.marks === 1 ? '' : 's'}`}</span>
              {!intro && (wantsDrawing(p.text)
                ? <div className="xv-lines" style={{ height: `${8.6 * Math.max(5, linesForMarks(p.marks))}mm` }} />
                : <div className="xv-lines">{range(linesForMarks(p.marks)).map(j => <div key={j} className="xv-line" />)}</div>)}
            </div>
          ),
        })
      })
    })
    if (sections) blocks.push({ key: 'endB', section: 'B', el: <div className="xv-endsec"><span>End of Section B</span></div> })
  }
  blocks.push({ key: 'end', section: 'end', el: <div className="xv-endsec" style={{ paddingTop: '10mm' }}><span style={{ width: '45mm' }}>End of examination</span></div> })
  return blocks
}

function VcePage({ n, total, title, section, children, footer }) {
  const even = n % 2 === 0
  const sec = section ? <b>Section {section}</b> : null
  return (
    <div className={`xp-page ${even ? 'xv-even' : 'xv-odd'}`}>
      <div className="xv-strip"><span>Do not write in this area.</span></div>
      <div className="xv-head">
        {even
          ? <><span>Page {n} of {total}</span><span>{sec}{sec && ' '}{title}</span></>
          : <><span>{title}{sec && ' '}{sec}</span><span>Page {n} of {total}</span></>}
      </div>
      {children}
      {footer && <div className="xv-foot">{footer}</div>}
    </div>
  )
}

function VceExam({ exam, meta }) {
  const sol = useMemo(() => (meta.solutions ? solutionBlocks(exam, (_, i) => i + 1) : []), [exam, meta.solutions])
  const bumpRef = useRef(() => {})
  const blocks = useMemo(() => vceBlocks(exam, meta, () => bumpRef.current()), [exam, meta.showSources, meta.isMaths]) // eslint-disable-line react-hooks/exhaustive-deps
  const lists = useMemo(() => [blocks, sol], [blocks, sol])
  const { heights, portal, bump } = useHeights(lists, 'xv xv-body', VCE.width)
  bumpRef.current = bump
  const fitRef = useFitMath()
  const pages = useMemo(() => packed(blocks, heights, VCE.height), [blocks, heights])
  const solPages = useMemo(() => (sol.length ? packed(sol, heights, VCE.height) : []), [sol, heights])

  // The book: cover, pages (Section B opens on a left-hand page), blank
  // pages to a multiple of four, and a back cover.
  const seq = []
  for (const p of pages) {
    if (blocks[p[0]].startEven && (seq.length + 2) % 2 === 1) seq.push({ blank: true })
    seq.push({ blocks: p, section: blocks[p[0]].section === 'end' ? '' : blocks[p[0]].section })
  }
  while ((seq.length + 2) % 4 !== 0) seq.push({ blank: true })
  const total = seq.length + 2
  const techFree = meta.isMaths && meta.paperNumber === '1'
  const band = techFree ? BAND.exam1 : BAND.exam2
  const { totals } = meta

  // Contents: the page range of each section.
  const pagesOf = (sec) => {
    const ns = seq.map((s, i) => (s.blocks && s.blocks.some(bi => blocks[bi].section === sec) ? i + 2 : null)).filter(Boolean)
    return ns.length ? `${ns[0]}–${ns[ns.length - 1]}` : ''
  }
  const contents = exam.A.length
    ? [[<><b>Section A</b> ({totals.aCount} questions, {totals.aMarks} marks)</>, pagesOf('A')], ...(exam.B.length ? [[<><b>Section B</b> ({totals.bCount} questions, {totals.bMarks} marks)</>, pagesOf('B')]] : [])]
    : [[<>{totals.bCount} questions ({totals.bMarks} marks)</>, pagesOf('')]]

  return (
    <div className="xp xv">
      {portal}
      <div className="xp-print" ref={fitRef}>
        {/* Cover */}
        <div className="xp-page">
          <div className="xv-cover">
            <div className="xv-band" style={{ left: 0, background: band }} />
            <div className="xv-label">SUPERVISOR TO ATTACH<br />PROCESSING LABEL HERE</div>
            <div className="xv-sn">
              <div className="row">
                <div style={{ display: 'flex', gap: '4.5mm' }}>
                  {[2, 3, 3].map((n, g) => <div key={g} className="grp">{range(n).map(i => <div key={i} className="cell" />)}</div>)}
                </div>
                <div className="grp"><div className="cell" /></div>
              </div>
              <div className="cap"><span>Write your <b>student number</b> in the boxes above.</span><b>Letter</b></div>
            </div>
            <div className="xv-title" style={{ top: techFree ? '100mm' : '80mm' }}>
              <h1 className="t1">{meta.subjectTitle}<br />{meta.paperTitle}</h1>
              <div className="t2">Question and Answer Book</div>
              <div className="t3">GradeFarm Practice Examination</div>
              <div className="xv-cbody">
                <ul>
                  <li>Reading time is <b>{formatMinutes(meta.readingMinutes)}</b></li>
                  <li>Writing time is <b>{formatMinutes(meta.writingMinutes)}</b></li>
                </ul>
                {meta.materials.length > 0 && <><h3>Approved materials</h3><ul>{meta.materials.map((m, i) => <li key={i}>{m}</li>)}</ul></>}
                <h3>Materials supplied</h3>
                <ul>
                  <li>Question and Answer Book of {total} pages</li>
                  {exam.A.length > 0 && meta.answerSheet && <li>Multiple-Choice Answer Sheet</li>}
                </ul>
                <h3>Instructions</h3>
                {techFree && <div>Students are <b>not</b> permitted to bring any technology (calculators or software), or notes of any kind, into the examination room.</div>}
                {exam.A.length > 0 && meta.answerSheet && (
                  <ul>
                    <li>Follow the instructions on your Multiple-Choice Answer Sheet.</li>
                    <li>At the end of the examination, place your Multiple-Choice Answer Sheet inside the front cover of this book.</li>
                  </ul>
                )}
                <div style={{ marginTop: '1mm' }}>Students are <b>not</b> permitted to bring mobile phones and/or any unauthorised electronic devices into the examination room.</div>
                <div className="xv-contents">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><b style={{ fontSize: '12.5pt' }}>Contents</b><span>pages</span></div>
                  {contents.map(([label, pg], i) => <div key={i} className="r"><span>{label}</span><span className="lead" /><span>{pg}</span></div>)}
                </div>
              </div>
            </div>
            <div className="xv-cfoot">
              <span>Practice examination assembled by GradeFarm from past and trial examination questions.<br />Not an official examination.</span>
              <b style={{ fontSize: '12pt', letterSpacing: '0.04em' }}>GRADEFARM</b>
            </div>
          </div>
        </div>

        {seq.map((s, i) => {
          const n = i + 2
          const nextHasContent = seq.slice(i + 1).some(x => x.blocks)
          return s.blank ? (
            <VcePage key={`p${i}`} n={n} total={total} title={meta.headerTitle} footer={nextHasContent ? 'Examination continues on the next page.' : null}>
              <div className="xv-blank">This page is blank.</div>
            </VcePage>
          ) : (
            <VcePage key={`p${i}`} n={n} total={total} title={meta.headerTitle} section={s.section}>
              <div className="xv-box xv-body">{s.blocks.map(bi => <div key={blocks[bi].key} className="xp-blk">{blocks[bi].el}</div>)}</div>
            </VcePage>
          )
        })}

        {/* Back cover */}
        <div className="xp-page">
          <div className="xv-band" style={{ right: 0, background: band }} />
          <div style={{ position: 'absolute', top: '47%', left: 0, right: '10mm', textAlign: 'center', fontSize: '10pt' }}>GradeFarm practice examination</div>
        </div>

        {exam.A.length > 0 && meta.answerSheet && <AnswerSheet exam={exam} meta={meta} />}
        <SolutionPages pages={solPages} blocks={sol} title={meta.headerTitle} widthMm={VCE.width} top={VCE.top} body="xv xv-body" />
      </div>
    </div>
  )
}

// ── SACE ─────────────────────────────────────────────────────────────────────
function saceBlocks(questions, startNumber, meta, onLoad) {
  const blocks = []
  const src = (q) => meta.showSources && q.source ? <span className="xs-src">{sourceLabel(q)}</span> : null
  questions.forEach((q, qi) => {
    const num = startNumber + qi
    const qid = q.id
    if (q._section === 'A') {
      blocks.push({
        key: `S-${qid}`, qid, num, el: (
          <div className="xs-q">
            <div className="xs-stem"><span>{num}.</span><div><MathText text={q.question} />{src(q)}<Figure q={q} src={q.image_url} onLoad={onLoad} /></div></div>
            <div className="xs-opts">{(q.options || []).map((o, j) => <div key={j} className="xs-opt"><span>({letter(j)})</span><span><MathText text={o} /></span></div>)}</div>
            <div className="xs-mk" style={{ paddingTop: 0 }}>(1 mark)</div>
          </div>
        ),
      })
      return
    }
    const parts = partsOf(q)
    const single = parts.length === 1 && !parts[0].label
    // Question heading: maths "Question 1 (8 marks)", other subjects "1." before the stem.
    blocks.push({
      key: `S-${qid}`, qid, num, keepWithNext: true, el: meta.isMaths ? (
        <div>
          <div className="xs-qh"><b>Question {num}</b>({marksOf(q)} mark{marksOf(q) === 1 ? '' : 's'}){src(q)}</div>
          {q.question && <div style={{ paddingBottom: '4mm' }}><MathText text={q.question} /><Figure q={q} src={q.image_url} onLoad={onLoad} /></div>}
        </div>
      ) : (
        <div className="xs-stem"><span>{num}.</span><div>{q.question && <MathText text={q.question} />}{src(q)}<Figure q={q} src={q.image_url} onLoad={onLoad} /></div></div>
      ),
    })
    // A label printed alone, e.g. "(iii)" before its "(1)", goes on the next part's line.
    let carried = null
    parts.forEach((p, k) => {
      const intro = !p.marks
      const marks = `(${p.marks} mark${p.marks === 1 ? '' : 's'})`
      // Columns: maths labels start at the margin; other subjects are indented under the question number.
      const base = meta.isMaths ? 1 : 2
      const lc = single ? base : base + p.level - 1
      const tc = single ? base : lc + 1
      if (intro && !p.text && !p.image_url && parts[k + 1]?.level > p.level) { carried = { label: p.label, col: lc }; return }
      const lead = carried
      carried = null
      let space = null
      if (!intro) {
        if (meta.isMaths) {
          space = <><div className="xs-grid" style={{ height: `${5 * Math.min(22, 2 * p.marks + 2)}mm`, marginTop: '1mm' }} /><div className="xs-mk">{marks}</div></>
        } else {
          const n = Math.min(14, 2 * p.marks)
          space = wantsDrawing(p.text) ? (
            <div style={{ marginLeft: `${7 * (tc - 1)}mm` }}>
              <div style={{ height: `${8.4 * Math.max(6, n)}mm` }} />
              <div className="xs-mk" style={{ paddingTop: 0 }}>{marks}</div>
            </div>
          ) : (
            <div className="xs-lines" style={{ marginLeft: `${7 * (tc - 1)}mm` }}>
              {range(n - 1).map(j => <div key={j} className="xs-line" />)}
              <div className="xs-line last"><i />{marks}</div>
            </div>
          )
        }
      }
      blocks.push({
        key: `S-${qid}-${k}`, qid, num, keepWithNext: intro, tailMm: intro ? 3 : 7, el: (
          <div>
            {(p.text || p.label || p.image_url) && (
              <div className="xs-part" style={{ '--lc': lc, '--tc': tc }}>
                {lead && <span style={{ gridColumn: lead.col }}>({lead.label})</span>}
                {!single && <span className="lbl" style={p.label.length > 3 ? { letterSpacing: '-0.05em' } : undefined}>{p.label ? `(${p.label})` : ''}</span>}
                <div className="txt"><PartText text={p.text} src={p.image_url} onLoad={onLoad} /></div>
              </div>
            )}
            {space}
          </div>
        ),
      })
    })
  })
  return blocks
}

/** Split the questions into two booklets at about half the marks, as full SACE papers are. */
export function splitBooklets(questions) {
  const total = questions.reduce((s, q) => s + marksOf(q), 0)
  if (total < 60 || questions.length < 2) return [questions]
  let run = 0, cut = 1, best = Infinity
  questions.forEach((q, i) => {
    run += marksOf(q)
    const d = Math.abs(run - total / 2)
    if (i < questions.length - 1 && d < best) { best = d; cut = i + 1 }
  })
  return [questions.slice(0, cut), questions.slice(cut)]
}

function SacePage({ n, total, last, tabTop, children, cont }) {
  return (
    <div className="xp-page">
      {children}
      {cont && <div className="xs-cont">{cont}</div>}
      {last && tabTop != null && <div className="xs-tab" style={{ right: 0, top: `${tabTop}mm` }} />}
      <div className="xs-foot">
        page <b>{n}</b> of {total}{last && <> — <b><i>end of booklet</i></b></>}
        {!last && n % 2 === 1 && <span className="po">PLEASE TURN OVER</span>}
      </div>
    </div>
  )
}

function SaceExam({ exam, meta }) {
  const all = useMemo(() => [...exam.A.map(q => ({ ...q, _section: 'A' })), ...exam.B.map(q => ({ ...q, _section: 'B' }))], [exam])
  const booklets = useMemo(() => splitBooklets(all), [all])
  const bumpRef = useRef(() => {})
  const bookletBlocks = useMemo(() => {
    let start = 1
    return booklets.map(qs => { const b = saceBlocks(qs, start, meta, () => bumpRef.current()); start += qs.length; return b })
  }, [booklets, meta.showSources, meta.isMaths]) // eslint-disable-line react-hooks/exhaustive-deps
  const sol = useMemo(() => (meta.solutions ? solutionBlocks(exam, (s, i) => (s === 'A' ? i + 1 : exam.A.length + i + 1)) : []), [exam, meta.solutions])
  const lists = useMemo(() => [...bookletBlocks, sol], [bookletBlocks, sol])
  const { heights, portal, bump } = useHeights(lists, 'xs xs-body', SACE.width)
  bumpRef.current = bump
  // Leave room at the foot of each page for "Question N continues on page M."
  const bookletPages = useMemo(() => bookletBlocks.map(b => packed(b, heights, SACE.height - 9)), [bookletBlocks, heights])
  const solPages = useMemo(() => (sol.length ? packed(sol, heights, SACE.height) : []), [sol, heights])

  const fitRef = useFitMath()
  const totalMarks = all.reduce((s, q) => s + marksOf(q), 0)
  const extras = meta.isMaths ? ['Formula sheet'] : /chem/i.test(meta.subjectTitle) ? ['Periodic table and data sheet'] : []

  let firstNum = 1
  return (
    <div className="xp xs">
      {portal}
      <div className="xp-print" ref={fitRef}>
        {booklets.map((qs, b) => {
          const pages = bookletPages[b] || []
          const blocks = bookletBlocks[b]
          // Cover, question pages, a blank page if needed to make the count even, then the extra-space page.
          const content = pages.length + (pages.length % 2)
          const total = 1 + content + 1
          const marks = qs.reduce((s, q) => s + marksOf(q), 0)
          const from = firstNum, to = firstNum + qs.length - 1
          firstNum = to + 1
          const tabTop = b === 0 ? 59 : 110
          const allow = Math.round((meta.writingMinutes * marks) / Math.max(1, totalMarks) / 5) * 5
          return (
            <div key={b}>
              <div className="xp-page">
                <div className="xs-cover">
                  <div className="xs-tab" style={{ left: 0, top: `${tabTop}mm` }}>{b + 1}</div>
                  <div className="xs-brand">GradeFarm<small>Practice examination</small></div>
                  <div className="xs-title xs-narrow"><div className="t1">{meta.subjectTitle}</div><div className="t2">Practice exam</div></div>
                  <div className="xs-cbody">
                    <h2 className="xs-narrow">Question booklet {b + 1}</h2>
                    <ul>
                      <li>{from === to ? `Question ${from}` : `Questions ${from} to ${to}`} ({marks} marks)</li>
                      <li>Answer <b><i>all</i></b> questions</li>
                      <li>Write your answers in this question booklet</li>
                      <li>You may write on page {total} if you need more space</li>
                      <li>Allow approximately {allow || meta.writingMinutes} minutes</li>
                      {meta.isMaths && b === 0 && <li>Approved calculators may be used — complete the box below</li>}
                    </ul>
                    {b === 0 && (
                      <>
                        <h2 className="xs-narrow" style={{ marginTop: '8mm' }}>Examination information</h2>
                        <h3>Materials</h3>
                        <ul>
                          {booklets.map((_, i) => <li key={i}>Question booklet {i + 1}</li>)}
                          {extras.map(x => <li key={x}>{x}</li>)}
                          <li>SACE registration number label</li>
                        </ul>
                        {meta.materials.length > 0 && <><h3>Instructions</h3><ul>{meta.materials.map((m, i) => <li key={i}>{m}</li>)}</ul></>}
                        <div style={{ marginTop: '4mm' }}><b>Total time:</b> {meta.writingMinutes} minutes<br /><b>Total marks:</b> {totalMarks}</div>
                      </>
                    )}
                  </div>
                  <div className="xs-cfoot">
                    <div className="note">Practice examination assembled by GradeFarm from past and trial examination questions. Not an official examination.</div>
                    <div style={{ display: 'flex', gap: '3mm' }}>
                      {b === 0 ? (
                        <div className="xs-lbox" style={{ width: '90mm' }}>Attach your SACE registration number label here</div>
                      ) : (
                        <div className="xs-lbox" style={{ width: '90mm', flexDirection: 'column', gap: '2mm' }}>
                          <span>Copy the information from your SACE label here</span>
                          <div style={{ display: 'flex', gap: '4mm', alignItems: 'flex-end', fontWeight: 400, fontSize: '7pt' }}>
                            <div style={{ textAlign: 'center' }}>SEQ<div style={{ width: '10mm', height: '7mm', border: '0.3mm solid #1a1a1a' }} /></div>
                            <div style={{ textAlign: 'center' }}>FIGURES<div style={{ display: 'flex' }}>{range(6).map(i => <div key={i} style={{ width: '5mm', height: '7mm', border: '0.3mm solid #1a1a1a', marginLeft: '-0.3mm' }} />)}</div></div>
                            <div style={{ textAlign: 'center' }}>CHECK<div style={{ width: '5mm', height: '7mm', border: '0.3mm solid #1a1a1a', margin: '0 auto' }} /></div>
                            <div style={{ textAlign: 'center' }}>BIN<div style={{ width: '10mm', height: '7mm', border: '0.3mm solid #1a1a1a' }} /></div>
                          </div>
                        </div>
                      )}
                      {meta.isMaths && b === 0 && (
                        <div className="xs-calc" style={{ width: '33mm' }}>
                          <b style={{ display: 'block', textAlign: 'center' }}>Graphics calculator</b>
                          <div className="ln">1. Brand <i /></div><div className="ln">Model <i /></div>
                          <div className="ln">2. Brand <i /></div><div className="ln">Model <i /></div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {pages.map((page, i) => {
                const n = i + 2
                const lastBlk = blocks[page[page.length - 1]]
                const next = pages[i + 1] ? blocks[pages[i + 1][0]] : null
                const cont = next && lastBlk && next.qid === lastBlk.qid ? `Question ${lastBlk.num} continues on page ${n + 1}.` : null
                return (
                  <SacePage key={i} n={n} total={total} cont={cont}>
                    <div className="xs-box xs-body">{page.map(bi => <div key={blocks[bi].key} className="xp-blk">{blocks[bi].el}</div>)}</div>
                  </SacePage>
                )
              })}
              {content > pages.length && <SacePage n={pages.length + 2} total={total} />}
              <SacePage n={total} total={total} last tabTop={tabTop}>
                <div className="xs-box xs-body">
                  <div style={{ fontStyle: 'italic', marginBottom: '4mm' }}>You may write on this page if you need more space to finish your answers to any of the questions in this question booklet. Make sure to label each answer carefully (e.g. {from}(a)(i) continued).</div>
                  {range(Math.floor((SACE.height - 22) / 8.4)).map(j => <div key={j} className="xs-line" />)}
                </div>
              </SacePage>
            </div>
          )
        })}
        <SolutionPages pages={solPages} blocks={sol} title={`${meta.subjectTitle} practice exam`} widthMm={SACE.width} top={SACE.top} body="xs xs-body" />
      </div>
    </div>
  )
}

/**
 * `meta`: { board: 'vce' | 'sace', subjectTitle, paperTitle, paperNumber,
 * headerTitle, readingMinutes, writingMinutes, materials[], isMaths,
 * showSources, answerSheet, solutions, totals }.
 */
export default function ExamPaper({ exam, meta }) {
  return (
    <>
      <style>{CSS}</style>
      {meta.board === 'sace' ? <SaceExam exam={exam} meta={meta} /> : <VceExam exam={exam} meta={meta} />}
    </>
  )
}
