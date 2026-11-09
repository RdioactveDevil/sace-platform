import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import MathText from './MathText'
import GraphView from './GraphView'
import TableView from './TableView'
import DiagramView from './DiagramView'
import { partsOf, marksOf, sourceLabel, paginate, linesForMarks, formatMinutes } from '../lib/examBuilder'

// Page geometry in millimetres (A4). Every content page has the same content
// box, so blocks measured once fit any page; the grey "do not write" strip
// sits on the outer edge (right on odd pages, left on even pages).
const PAGE_W = 210, PAGE_H = 297
const STRIP = 13, OUTER = 9, INNER = 18, TOP = 22, BOTTOM = 22
const CONTENT_W = PAGE_W - STRIP - OUTER - INNER
const CONTENT_H = PAGE_H - TOP - BOTTOM
const MM = 96 / 25.4
const letter = (i) => String.fromCharCode(65 + i)

const CSS = `
  .xp { --ink: #000; font-family: Arial, Helvetica, sans-serif; color: var(--ink); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .xp-page { position: relative; width: ${PAGE_W}mm; height: ${PAGE_H}mm; background: #fff; overflow: hidden; margin: 0 auto 10mm; box-shadow: 0 6px 30px rgba(0,0,0,0.28); }
  .xp-body, .xp-measure > div { font-size: 11pt; line-height: 1.42; }
  .xp-blk { display: flow-root; }
  .xp h1, .xp h2, .xp h3, .xp h4, .xp h5, .xp b, .xp strong { font-weight: 700; }
  .xp ul { list-style: disc; }
  .xp-fig > div { background: #fff !important; border: none !important; border-radius: 0 !important; margin: 0 !important; }
  .xp-box { position: absolute; top: ${TOP}mm; width: ${CONTENT_W}mm; height: ${CONTENT_H}mm; }
  .xp-odd .xp-box { left: ${INNER}mm; } .xp-even .xp-box { left: ${STRIP + OUTER}mm; }
  .xp-strip { position: absolute; top: 0; bottom: 0; width: ${STRIP}mm; background: #d9d9d9; display: flex; align-items: center; justify-content: center; }
  .xp-odd .xp-strip { right: 0; } .xp-even .xp-strip { left: 0; }
  .xp-strip span { writing-mode: vertical-rl; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.25em; color: #444; white-space: nowrap; }
  .xp-even .xp-strip span { transform: rotate(180deg); }
  .xp-head { position: absolute; top: 9mm; width: ${CONTENT_W}mm; display: flex; justify-content: space-between; font-size: 9.5pt; font-weight: 700; }
  .xp-odd .xp-head { left: ${INNER}mm; } .xp-even .xp-head { left: ${STRIP + OUTER}mm; flex-direction: row-reverse; }
  .xp-foot { position: absolute; bottom: 9mm; width: ${CONTENT_W}mm; text-align: right; font-size: 9.5pt; }
  .xp-odd .xp-foot { left: ${INNER}mm; } .xp-even .xp-foot { left: ${STRIP + OUTER}mm; }
  .xp-foot b { display: block; font-size: 10.5pt; letter-spacing: 0.04em; }
  .xp-sec { font-size: 12pt; font-weight: 700; text-align: center; margin: 0 0 4mm; letter-spacing: 0.02em; }
  .xp-instr { border: 0.35mm solid #000; padding: 3mm 4mm; margin: 0 0 6mm; }
  .xp-instr h4 { margin: 0 0 1.5mm; font-size: 11pt; }
  .xp-instr p { margin: 0 0 1.2mm; }
  .xp-q { padding: 0 0 6mm; }
  .xp-qh { font-weight: 700; margin: 0 0 1.5mm; }
  .xp-src { font-weight: 400; font-style: italic; font-size: 8.5pt; color: #444; margin-left: 2mm; }
  .xp-opts { margin: 2mm 0 0; display: flex; flex-direction: column; gap: 1.6mm; }
  .xp-opt { display: grid; grid-template-columns: 9mm 1fr; }
  .xp-opt b { font-weight: 700; }
  .xp-fig { margin: 2.5mm 0; max-width: 125mm; }
  .xp-fig img { max-width: 100%; max-height: 95mm; object-fit: contain; display: block; }
  .xp-part { display: grid; grid-template-columns: 8mm 1fr auto; column-gap: 2mm; padding: 0 0 4mm; }
  .xp-part.l2 { grid-template-columns: 8mm 8mm 1fr auto; }
  .xp-label { font-weight: 700; }
  .xp-marks { font-weight: 700; white-space: nowrap; align-self: end; font-size: 10pt; }
  .xp-lines { grid-column: 1 / -1; margin: 2mm 0 0 8mm; }
  .xp-part.l2 .xp-lines { margin-left: 16mm; }
  .xp-line { height: 8.6mm; border-bottom: 0.25mm solid #9a9a9a; }
  .xp-end { text-align: center; font-weight: 700; font-size: 11pt; padding: 6mm 0; }
  .xp-cover { padding: 12mm ${INNER}mm 12mm ${INNER}mm; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; font-size: 10.5pt; line-height: 1.38; }
  .xp-sn { display: flex; align-items: flex-end; gap: 2mm; }
  .xp-sn .cells { display: flex; }
  .xp-sn .cell { width: 7.5mm; height: 9.5mm; border: 0.35mm solid #000; margin-left: -0.35mm; }
  .xp-sn .lbl { font-size: 8.5pt; font-weight: 700; letter-spacing: 0.06em; }
  .xp-title { font-size: 25pt; font-weight: 700; letter-spacing: 0.02em; margin: 0; line-height: 1.1; }
  .xp-table { width: 100%; border-collapse: collapse; margin: 2mm 0 5mm; font-size: 10pt; }
  .xp-table th, .xp-table td { border: 0.3mm solid #000; padding: 1.6mm 2.5mm; text-align: center; }
  .xp-table th { background: #d9d9d9; font-weight: 700; }
  .xp-cover ul { margin: 0 0 3mm; padding-left: 6mm; }
  .xp-cover li { margin-bottom: 0.8mm; }
  .xp-cover h3 { font-size: 10.5pt; margin: 2.5mm 0 1mm; }
  .xp-sheet { padding: 14mm ${INNER}mm; height: 100%; box-sizing: border-box; font-size: 10pt; }
  .xp-bubbles { display: grid; grid-auto-flow: column; gap: 0 10mm; margin-top: 6mm; }
  .xp-brow { display: flex; align-items: center; gap: 2.2mm; height: 7.2mm; }
  .xp-brow .n { width: 7mm; text-align: right; font-weight: 700; }
  .xp-bub { width: 8mm; height: 4.6mm; border: 0.3mm solid #000; border-radius: 2.3mm; font-size: 7pt; display: flex; align-items: center; justify-content: center; }
  .xp-sol h5 { margin: 0 0 1mm; font-size: 11pt; }
  .xp-sol .src { font-size: 8.5pt; font-style: italic; color: #444; }
  .xp-measure { position: absolute; left: -10000px; top: 0; width: ${CONTENT_W}mm; visibility: hidden; pointer-events: none; }
  @media print {
    @page { size: A4; margin: 0; }
    html, body { background: #fff !important; margin: 0 !important; }
    body * { visibility: hidden; }
    .xp-print, .xp-print * { visibility: visible; }
    .xp-print { position: absolute; left: 0; top: 0; zoom: 1 !important; }
    .xp-page { margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
    .xp-measure { display: none; }
  }
`

function Figure({ q, src, onLoad }) {
  const has = q?.graph || q?.table_data || q?.diagram || src
  if (!has) return null
  return (
    <div className="xp-fig">
      {q?.graph && <GraphView graph={q.graph} theme="light" />}
      {q?.table_data && <TableView table={q.table_data} theme="light" />}
      {q?.diagram && <DiagramView diagram={q.diagram} theme="light" />}
      {src && <img src={src} alt="" onLoad={onLoad} onError={onLoad} />}
    </div>
  )
}

/**
 * Blocks in reading order, each a piece of the paper that is never split
 * across pages: section headings with their instructions, each multiple-choice
 * question, and each written question's heading and each of its parts.
 */
function buildBlocks(exam, opts, onLoad) {
  const blocks = []
  const { showSources, isMaths } = opts
  const src = (q) => showSources && q.source ? <span className="xp-src">{sourceLabel(q)}</span> : null

  if (exam.A.length) {
    blocks.push({
      key: 'secA', section: 'A', breakBefore: true, keepWithNext: true,
      el: (
        <>
          <div className="xp-sec">SECTION A – Multiple-choice questions</div>
          <div className="xp-instr">
            <h4>Instructions for Section A</h4>
            <p>Answer all questions in pencil on the answer sheet provided for multiple-choice questions.</p>
            <p>Choose the response that is correct or that best answers the question.</p>
            <p>A correct answer scores 1; an incorrect answer scores 0.</p>
            <p>Marks will not be deducted for incorrect answers.</p>
            <p>No marks will be given if more than one answer is completed for any question.</p>
            <p style={{ margin: 0 }}>Unless otherwise indicated, the diagrams in this book are not drawn to scale.</p>
          </div>
        </>
      ),
    })
    exam.A.forEach((q, i) => blocks.push({
      key: `A-${q.id}`, section: 'A',
      el: (
        <div className="xp-q">
          <div className="xp-qh">Question {i + 1}{src(q)}</div>
          <MathText text={q.question} />
          <Figure q={q} src={q.image_url} onLoad={onLoad} />
          <div className="xp-opts">
            {(q.options || []).map((o, j) => (
              <div key={j} className="xp-opt"><b>{letter(j)}.</b><span><MathText text={o} /></span></div>
            ))}
          </div>
        </div>
      ),
    }))
  }

  if (exam.B.length) {
    blocks.push({
      key: 'secB', section: 'B', breakBefore: true, keepWithNext: true,
      el: (
        <>
          <div className="xp-sec">{exam.A.length ? 'SECTION B' : 'Instructions'}</div>
          <div className="xp-instr">
            {exam.A.length > 0 && <h4>Instructions for Section B</h4>}
            <p>Answer all questions in the spaces provided.</p>
            {isMaths
              ? <>
                  <p>In all questions where a numerical answer is required, an exact value must be given, unless otherwise specified.</p>
                  <p>In questions where more than one mark is available, appropriate working must be shown.</p>
                </>
              : <p>Where an answer requires a calculation, show your working. Give answers to an appropriate number of significant figures, with units.</p>}
            <p style={{ margin: 0 }}>Unless otherwise indicated, the diagrams in this book are not drawn to scale.</p>
          </div>
        </>
      ),
    })
    exam.B.forEach((q, i) => {
      const parts = partsOf(q)
      const single = parts.length === 1 && !parts[0].label
      blocks.push({
        key: `B-${q.id}`, section: 'B', keepWithNext: true,
        el: (
          <div style={{ paddingBottom: '2mm' }}>
            <div className="xp-qh">Question {i + 1} ({marksOf(q)} mark{marksOf(q) === 1 ? '' : 's'}){src(q)}</div>
            {q.question && <MathText text={q.question} />}
            <Figure q={q} src={q.image_url} onLoad={onLoad} />
          </div>
        ),
      })
      parts.forEach((p, k) => {
        const intro = p.marks === 0
        blocks.push({
          key: `B-${q.id}-${k}`, section: 'B', keepWithNext: intro,
          el: (
            <div className={`xp-part${p.level === 2 ? ' l2' : ''}`} style={single ? { gridTemplateColumns: '1fr auto' } : undefined}>
              {!single && p.level === 2 && <span />}
              {!single && <span className="xp-label">{p.label ? `${p.label}.` : ''}</span>}
              <div>
                {p.text && <MathText text={p.text} />}
                <Figure src={p.image_url} onLoad={onLoad} />
              </div>
              <span className="xp-marks">{intro ? '' : `${p.marks} mark${p.marks === 1 ? '' : 's'}`}</span>
              {!intro && (
                <div className="xp-lines" style={single ? { marginLeft: 0 } : undefined}>
                  {Array.from({ length: linesForMarks(p.marks) }, (_, j) => <div key={j} className="xp-line" />)}
                </div>
              )}
            </div>
          ),
        })
      })
    })
  }
  blocks.push({ key: 'end', section: 'end', el: <div className="xp-end">END OF QUESTION AND ANSWER BOOK</div> })
  return blocks
}

/** The solutions booklet: answers with worked solutions and where each question is from. */
function buildSolutionBlocks(exam, onLoad) {
  const blocks = [{
    key: 'sol-h', section: 'S', keepWithNext: true,
    el: <div className="xp-sec" style={{ textAlign: 'left' }}>Solutions</div>,
  }]
  if (exam.A.length) {
    blocks.push({
      key: 'sol-a-key', section: 'S',
      el: (
        <div className="xp-q">
          <h5 style={{ margin: '0 0 2mm' }}>Section A – answers</h5>
          <table className="xp-table" style={{ margin: 0 }}>
            <tbody>
              {Array.from({ length: Math.ceil(exam.A.length / 10) }, (_, r) => (
                <tr key={r}>
                  {exam.A.slice(r * 10, r * 10 + 10).map((q, j) => (
                    <td key={q.id}><b>{r * 10 + j + 1}</b> {letter(q.answer_index)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    })
    exam.A.forEach((q, i) => blocks.push({
      key: `sol-A-${q.id}`, section: 'S',
      el: (
        <div className="xp-q xp-sol">
          <h5>Question {i + 1}: {letter(q.answer_index)} <span className="src">{sourceLabel(q)}</span></h5>
          {q.solution && <MathText text={q.solution} />}
        </div>
      ),
    }))
  }
  exam.B.forEach((q, i) => {
    const parts = partsOf(q)
    blocks.push({
      key: `sol-B-${q.id}`, section: 'S', keepWithNext: true,
      el: <div className="xp-sol" style={{ paddingBottom: '2mm' }}><h5>Section B Question {i + 1} ({marksOf(q)} marks) <span className="src">{sourceLabel(q)}</span></h5></div>,
    })
    parts.forEach((p, k) => {
      if (!p.solution && p.marks === 0) return
      blocks.push({
        key: `sol-B-${q.id}-${k}`, section: 'S',
        el: (
          <div className={`xp-part${p.level === 2 ? ' l2' : ''}`} style={{ paddingBottom: '3mm' }}>
            {p.level === 2 && <span />}
            <span className="xp-label">{p.label ? `${p.label}.` : ''}</span>
            <div><MathText text={p.solution || '—'} /></div>
            <span className="xp-marks">{p.marks ? `${p.marks} mark${p.marks === 1 ? '' : 's'}` : ''}</span>
          </div>
        ),
      })
    })
  })
  return blocks
}

function ContentPage({ n, header, footer, children, strip = true }) {
  const odd = n % 2 === 1
  return (
    <div className={`xp-page ${odd ? 'xp-odd' : 'xp-even'}`}>
      {strip && <div className="xp-strip"><span>DO NOT WRITE IN THIS AREA</span></div>}
      <div className="xp-head"><span>{header}</span><span>{n}</span></div>
      <div className="xp-box xp-body">{children}</div>
      {footer}
    </div>
  )
}

function StudentNumber({ letterBox = true }) {
  return (
    <div className="xp-sn">
      <div>
        <div className="lbl" style={{ marginBottom: '1mm' }}>STUDENT NUMBER</div>
        <div className="cells">{Array.from({ length: 8 }, (_, i) => <div key={i} className="cell" />)}</div>
      </div>
      {letterBox && (
        <div>
          <div className="lbl" style={{ marginBottom: '1mm' }}>Letter</div>
          <div className="cells"><div className="cell" /></div>
        </div>
      )}
    </div>
  )
}

/**
 * A practice exam laid out like the real paper: cover page, Section A and B
 * on numbered A4 pages with running heads, grey margins and "continued" /
 * "TURN OVER" footers, ruled answer space, the multiple-choice answer sheet
 * and, if asked, a solutions booklet. Blocks are measured off-screen and
 * packed onto pages (paginate in lib/examBuilder.js), so what prints is
 * exactly what shows. `meta`: { subjectTitle, paperTitle, headerCode,
 * readingMinutes, writingMinutes, materials[], isMaths, showSources,
 * answerSheet, solutions, totals }.
 */
export default function ExamPaper({ exam, meta }) {
  const measureRef = useRef(null)
  const [heights, setHeights] = useState({})
  const [tick, setTick] = useState(0)
  const bump = () => setTick(t => t + 1)

  const opts = { showSources: meta.showSources, isMaths: meta.isMaths }
  const blocks = useMemo(() => buildBlocks(exam, opts, bump), [exam, meta.showSources, meta.isMaths]) // eslint-disable-line react-hooks/exhaustive-deps
  const solBlocks = useMemo(() => (meta.solutions ? buildSolutionBlocks(exam, bump) : []), [exam, meta.solutions]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { document.fonts?.ready?.then(bump) }, [])
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const next = {}
    for (const child of el.children) next[child.dataset.key] = child.getBoundingClientRect().height
    setHeights(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [blocks, solBlocks, tick])

  const capacity = CONTENT_H * MM
  const measured = (list) => list.map(b => ({ ...b, h: heights[b.key] ?? 0 }))
  const pages = useMemo(() => paginate(measured(blocks), capacity), [blocks, heights]) // eslint-disable-line react-hooks/exhaustive-deps
  const solPages = useMemo(() => (solBlocks.length ? paginate(measured(solBlocks), capacity) : []), [solBlocks, heights]) // eslint-disable-line react-hooks/exhaustive-deps

  // The book has an even number of pages; a spare page is extra writing space.
  const bookPages = 1 + pages.length
  const extraPage = bookPages % 2 === 1
  const totalBookPages = bookPages + (extraPage ? 1 : 0)
  const { totals } = meta

  const footerFor = (i) => {
    const page = pages[i]
    const n = i + 2
    const last = blocks[page[page.length - 1]]
    const next = pages[i + 1] ? blocks[pages[i + 1][0]] : null
    const continues = next && last && next.section === last.section && last.section !== 'end'
    const turnOver = n % 2 === 1 && (pages[i + 1] || extraPage)
    if (!continues && !turnOver) return null
    return (
      <div className="xp-foot">
        {continues && <span>SECTION {last.section} – continued</span>}
        {turnOver && <b>TURN OVER</b>}
      </div>
    )
  }

  return (
    <div className="xp">
      <style>{CSS}</style>
      {/* Measured outside any zoomed preview, at real size. */}
      {createPortal(
        <div className="xp" aria-hidden="true">
          <div className="xp-measure" ref={measureRef}>
            {[...blocks, ...solBlocks].map(b => <div key={b.key} data-key={b.key} className="xp-blk">{b.el}</div>)}
          </div>
        </div>,
        document.body,
      )}

      <div className="xp-print">
        {/* Cover */}
        <div className="xp-page">
          <div className="xp-cover">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '9pt', fontWeight: 700, letterSpacing: '0.08em', lineHeight: 1.5 }}>
                GRADEFARM<br /><span style={{ fontWeight: 400, letterSpacing: 0 }}>Practice examination</span>
              </div>
              <StudentNumber />
            </div>
            <div style={{ marginTop: '22mm' }}>
              <h1 className="xp-title">{meta.subjectTitle.toUpperCase()}</h1>
              <div style={{ fontSize: '15pt', fontWeight: 700, marginTop: '2mm' }}>{meta.paperTitle}</div>
              <div style={{ marginTop: '5mm' }}>
                <div>Reading time: {formatMinutes(meta.readingMinutes)}</div>
                <div>Writing time: {formatMinutes(meta.writingMinutes)}</div>
              </div>
            </div>
            <div style={{ fontSize: '15pt', fontWeight: 700, margin: '9mm 0 5mm', letterSpacing: '0.03em' }}>QUESTION AND ANSWER BOOK</div>
            <div style={{ fontWeight: 700 }}>Structure of book</div>
            <table className="xp-table">
              <thead>
                <tr><th>Section</th><th>Number of questions</th><th>Number of questions to be answered</th><th>Number of marks</th></tr>
              </thead>
              <tbody>
                {totals.aCount > 0 && <tr><td>A</td><td>{totals.aCount}</td><td>{totals.aCount}</td><td>{totals.aMarks}</td></tr>}
                {totals.bCount > 0 && <tr><td>{totals.aCount > 0 ? 'B' : '–'}</td><td>{totals.bCount}</td><td>{totals.bCount}</td><td>{totals.bMarks}</td></tr>}
                {totals.aCount > 0 && totals.bCount > 0 && <tr><td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>Total</td><td style={{ fontWeight: 700 }}>{totals.total}</td></tr>}
              </tbody>
            </table>
            <ul>
              <li>Students are permitted to bring into the examination room: {meta.materials}.</li>
              <li>Students are NOT permitted to bring into the examination room: blank sheets of paper and/or correction fluid/tape.</li>
            </ul>
            <h3>Materials supplied</h3>
            <ul>
              <li>Question and answer book of {totalBookPages} pages</li>
              {totals.aCount > 0 && meta.answerSheet && <li>Answer sheet for multiple-choice questions</li>}
            </ul>
            <h3>Instructions</h3>
            <ul>
              <li>Write your student number in the space provided above on this page.</li>
              <li>Unless otherwise indicated, the diagrams in this book are not drawn to scale.</li>
              <li>All written responses must be in English.</li>
            </ul>
            {totals.aCount > 0 && meta.answerSheet && (
              <>
                <h3>At the end of the examination</h3>
                <ul><li>Place the answer sheet for multiple-choice questions inside the front cover of this book.</li></ul>
              </>
            )}
            <div style={{ marginTop: 'auto', borderTop: '0.3mm solid #000', paddingTop: '2.5mm', fontSize: '9pt' }}>
              <div style={{ fontWeight: 700 }}>Students are NOT permitted to bring mobile phones and/or any unauthorised electronic devices into the examination room.</div>
              <div style={{ marginTop: '1.5mm', color: '#444' }}>Practice examination assembled by GradeFarm from past and trial examination questions. It is not an official examination.</div>
            </div>
          </div>
        </div>

        {/* Question and answer book */}
        {pages.map((page, i) => (
          <ContentPage key={`p${i}`} n={i + 2} header={meta.headerCode} footer={footerFor(i)}>
            {page.map(bi => <div key={blocks[bi].key} className="xp-blk">{blocks[bi].el}</div>)}
          </ContentPage>
        ))}
        {extraPage && (
          <ContentPage n={bookPages + 1} header={meta.headerCode}>
            <div style={{ fontWeight: 700, marginBottom: '1mm' }}>Extra space for responses</div>
            <div style={{ marginBottom: '3mm' }}>Clearly number all responses in this space.</div>
            {Array.from({ length: Math.floor((CONTENT_H - 16) / 8.6) }, (_, j) => <div key={j} className="xp-line" />)}
          </ContentPage>
        )}

        {/* Multiple-choice answer sheet */}
        {totals.aCount > 0 && meta.answerSheet && (
          <div className="xp-page">
            <div className="xp-sheet">
              <div style={{ fontSize: '14pt', fontWeight: 700 }}>{meta.subjectTitle.toUpperCase()}</div>
              <div style={{ fontWeight: 700 }}>{meta.paperTitle}</div>
              <div style={{ fontSize: '13pt', fontWeight: 700, margin: '5mm 0 4mm' }}>Answer sheet for multiple-choice questions</div>
              <StudentNumber letterBox={false} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6mm', marginTop: '6mm' }}>
                <div>Student’s name<div className="xp-line" /></div>
                <div>Signature<div className="xp-line" /></div>
              </div>
              <div className="xp-instr" style={{ marginTop: '6mm' }}>
                <h4>Instructions</h4>
                <p>Use a <b>PENCIL</b> for <b>ALL</b> entries. For each question, shade the box that indicates your answer.</p>
                <p>Marks will <b>NOT</b> be deducted for incorrect answers.</p>
                <p><b>NO MARK</b> will be given if more than <b>ONE</b> answer is completed for any question.</p>
                <p style={{ margin: 0 }}>If you make a mistake, <b>ERASE</b> the incorrect answer – <b>DO NOT</b> cross it out.</p>
              </div>
              <div className="xp-bubbles" style={{ gridTemplateRows: `repeat(${Math.min(20, totals.aCount)}, auto)` }}>
                {exam.A.map((q, i) => (
                  <div key={q.id} className="xp-brow">
                    <span className="n">{i + 1}</span>
                    {Array.from({ length: Math.max(4, (q.options || []).length) }, (_, j) => <span key={j} className="xp-bub">{letter(j)}</span>)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Solutions */}
        {solPages.map((page, i) => (
          <ContentPage key={`s${i}`} n={i + 1} header={`${meta.headerCode} · SOLUTIONS`} strip={false}>
            {page.map(bi => <div key={solBlocks[bi].key} className="xp-blk">{solBlocks[bi].el}</div>)}
          </ContentPage>
        ))}
      </div>
    </div>
  )
}
