import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Printer, Shuffle, RefreshCw, X, ChevronUp, ChevronDown, Plus } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { getExamBankForTile } from '../lib/db'
import {
  bankSummary, examPool, pickExam, swapCandidate, examTotals, writingMinutes, subjectCode, isMathsSubject,
  sourceLabel, marksOf, BANK_SOURCE,
} from '../lib/examBuilder'
import ExamPaper from './ExamPaper'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

const strip = (name = '') => String(name).replace(/^(VCE|SACE)\s+/i, '').replace(/\s*(Units?\s*\d.*|Stage\s*\d.*)$/i, '').trim()
const paperNumber = (paper = '') => (String(paper).match(/\d+/) || [''])[0]

function defaultMaterials(subjectName, paper) {
  if (!isMathsSubject(subjectName)) return 'pens, pencils, highlighters, erasers, sharpeners, rulers and one scientific calculator'
  if (paperNumber(paper) === '1') return 'pens, pencils, highlighters, erasers, sharpeners and rulers'
  return 'pens, pencils, highlighters, erasers, sharpeners, rulers, a protractor, set squares, aids for curve sketching, one bound reference, one approved technology (calculator or software) and, if desired, one scientific calculator'
}

/** A full paper's shape for this subject and paper: tech-free maths papers have no multiple choice. */
function fullPaper(subjectName, paper) {
  if (isMathsSubject(subjectName) && paperNumber(paper) === '1') return { mc: 0, b: 40 }
  return { mc: 20, b: 60 }
}

/**
 * The exam builder: a full practice exam mixed from real past exams and
 * commercial trial exams in the bank (filtered by paper, source, year and
 * topic), with every question swappable, removable and reorderable, laid out
 * like the real paper (ExamPaper.jsx) and saved as PDF from the print window.
 */
export default function ExamBuilderScreen({ theme = 'dark', subject, onExit, loadBank = getExamBankForTile }) {
  const t = THEMES[theme]
  const subjectName = subject?.name || ''
  const [bank, setBank] = useState(null)
  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    let alive = true
    loadBank(subject).then(qs => { if (alive) setBank(qs) }).catch(() => { if (alive) setLoadError("Couldn't load the question bank. Check your connection and try again.") })
    return () => { alive = false }
  }, [subject]) // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => bankSummary(bank || []), [bank])
  const realPapers = summary.papers.filter(p => p.name)
  const hasRealExams = summary.sources.some(s => s.kind !== 'bank')

  const [paper, setPaper] = useState(null)
  const [sources, setSources] = useState(null)
  const [topics, setTopics] = useState([])
  const [mcCount, setMcCount] = useState(20)
  const [bMarks, setBMarks] = useState(60)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [showSources, setShowSources] = useState(false)
  const [answerSheet, setAnswerSheet] = useState(true)
  const [solutions, setSolutions] = useState(true)
  const [subjectTitle, setSubjectTitle] = useState(strip(subjectName))
  const [paperTitle, setPaperTitle] = useState('')
  const [materials, setMaterials] = useState('')

  // First load: the paper with the most real exam questions, its sources, its usual shape.
  useEffect(() => {
    if (!bank || paper !== null) return
    const first = [...realPapers].sort((a, b) => b.count - a.count)[0]?.name || ''
    choosePaper(first)
  }, [bank]) // eslint-disable-line react-hooks/exhaustive-deps

  const sourcesForPaper = (p) => summary.sources.filter(s => !p || !s.paper || s.paper === p)
  function choosePaper(p) {
    setPaper(p)
    const list = sourcesForPaper(p)
    const real = list.filter(s => s.kind !== 'bank')
    setSources((real.length ? real : list).map(s => s.key))
    const shape = fullPaper(subjectName, p)
    setMcCount(shape.mc)
    setBMarks(shape.b)
    setPaperTitle(p ? `Written examination ${paperNumber(p) || p}` : 'Written examination')
    setMaterials(defaultMaterials(subjectName, p))
  }

  const pool = useMemo(() => examPool(bank || [], { paper: paper || '', sources: sources || [], topics }), [bank, paper, sources, topics])
  const byId = useMemo(() => new Map((bank || []).map(q => [q.id, q])), [bank])

  // The exam: rebuilt when a setting changes; then edited by hand.
  const [picked, setPicked] = useState({ A: [], B: [] })
  const [edited, setEdited] = useState(false)
  useEffect(() => {
    if (!bank || sources === null) return
    setPicked(pickExam(pool, { mcCount, bMarks, seed, allQuestions: bank }))
    setEdited(false)
  }, [pool, mcCount, bMarks, seed]) // eslint-disable-line react-hooks/exhaustive-deps

  const exam = useMemo(() => ({
    A: picked.A.map(id => byId.get(id)).filter(Boolean),
    B: picked.B.map(id => byId.get(id)).filter(Boolean),
  }), [picked, byId])
  const totals = examTotals(exam)
  const minutes = writingMinutes(totals.total)

  const used = [...picked.A, ...picked.B]
  const swapSeed = useRef(1)
  const edit = (fn) => { setPicked(prev => fn({ A: [...prev.A], B: [...prev.B] })); setEdited(true) }
  const swap = (section, i) => {
    const current = byId.get(picked[section][i])
    const next = swapCandidate(pool, current, used, seed + swapSeed.current++)
    if (next) edit(p => { p[section][i] = next.id; return p })
  }
  const remove = (section, i) => edit(p => { p[section].splice(i, 1); return p })
  const move = (section, i, d) => edit(p => {
    const j = i + d
    if (j < 0 || j >= p[section].length) return p
    ;[p[section][i], p[section][j]] = [p[section][j], p[section][i]]
    return p
  })
  const add = (section, id) => edit(p => { p[section].push(id); return p })

  const [adding, setAdding] = useState(null)
  const [search, setSearch] = useState('')
  const addable = adding ? pool[adding].filter(q => !used.includes(q.id) && (!search.trim() || `${q.question} ${q.topic} ${sourceLabel(q)}`.toLowerCase().includes(search.trim().toLowerCase()))).slice(0, 60) : []

  const download = () => {
    const before = document.title
    document.title = `${subjectTitle} ${paperTitle} practice exam`.trim()
    const restore = () => { document.title = before; window.removeEventListener('afterprint', restore) }
    window.addEventListener('afterprint', restore)
    window.print()
    setTimeout(restore, 1000)
  }

  // Preview scale: pages are A4 at 96 dpi (794px wide).
  const previewRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    const el = previewRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setZoom(Math.min(1, (e.contentRect.width - 8) / 794)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const chip = (on) => ({
    padding: '6px 11px', borderRadius: 999, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${on ? t.text : t.border}`, background: on ? t.text : t.bgCard, color: on ? t.bg : t.textSub,
  })
  const label = { fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: t.textMuted, marginBottom: 8, display: 'block' }
  const input = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, fontFamily: FONT_B, fontSize: 13 }
  const iconBtn = { border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer', padding: 3, display: 'inline-flex' }
  const numberRow = (name, value, set, options) => (
    <div role="radiogroup" aria-label={name} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(n => <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => set(n)} style={chip(value === n)}>{n}</button>)}
    </div>
  )

  const questionRow = (section, id, i) => {
    const q = byId.get(id)
    if (!q) return null
    return (
      <div key={id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 0', borderTop: `1px solid ${t.border}` }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: t.textMuted, minWidth: 26 }}>{section === 'A' ? `A${i + 1}` : `B${i + 1}`}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.topic || 'Question'}{section === 'B' ? ` · ${marksOf(q)} marks` : ''}</div>
          <div style={{ fontSize: 11.5, color: q.source ? t.textMuted : t.textFaint }}>{sourceLabel(q)}</div>
        </div>
        <button type="button" title="Move up" aria-label="Move up" style={iconBtn} onClick={() => move(section, i, -1)}><ChevronUp size={15} /></button>
        <button type="button" title="Move down" aria-label="Move down" style={iconBtn} onClick={() => move(section, i, 1)}><ChevronDown size={15} /></button>
        <button type="button" title="Swap for another question" aria-label="Swap" style={iconBtn} onClick={() => swap(section, i)}><RefreshCw size={14} /></button>
        <button type="button" title="Remove" aria-label="Remove" style={iconBtn} onClick={() => remove(section, i)}><X size={15} /></button>
      </div>
    )
  }

  const css = `
    .eb { min-height: 100vh; background: ${t.bg}; color: ${t.text}; font-family: ${FONT_B}; }
    .eb-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; border-bottom: 1px solid ${t.border}; position: sticky; top: 0; background: ${t.bg}; z-index: 3; }
    .eb-grid { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 20px; padding: 20px; align-items: start; }
    .eb-side { display: flex; flex-direction: column; gap: 18px; position: sticky; top: 70px; max-height: calc(100vh - 90px); overflow-y: auto; padding-right: 6px; }
    .eb-card { background: ${t.bgCard}; border: 1px solid ${t.border}; border-radius: 12px; padding: 14px; }
    .eb-preview { min-width: 0; background: ${theme === 'dark' ? '#0e0e10' : '#e6e8ee'}; border-radius: 12px; padding: 16px 4px; overflow: hidden; }
    @media screen and (max-width: 960px) { .eb-grid { grid-template-columns: 1fr; padding: 12px; } .eb-side { position: static; max-height: none; overflow: visible; } }
    @media screen and (max-width: 560px) { .eb-title { display: none; } }
    @media print { .eb-bar, .eb-side { display: none !important; } .eb-preview { background: none; padding: 0; } .eb-zoom { zoom: 1 !important; } }
  `

  return (
    <div className="eb">
      <style>{css}</style>
      <div className="eb-bar">
        <button type="button" onClick={onExit} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: t.text, fontFamily: FONT_B, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to practice
        </button>
        <div className="eb-title" style={{ fontSize: 15, fontWeight: 800 }}>Exam builder</div>
        <button type="button" onClick={download} disabled={!totals.total}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, border: 'none', background: totals.total ? t.accent : t.bgHover, color: totals.total ? '#0c1037' : t.textFaint, fontFamily: FONT_B, fontSize: 13.5, fontWeight: 800, cursor: totals.total ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
          <Printer size={16} aria-hidden="true" /> Download PDF
        </button>
      </div>

      {!bank ? (
        <p role="status" style={{ padding: 24, color: loadError ? t.danger : t.textMuted }}>{loadError || 'Loading exam questions…'}</p>
      ) : (
        <div className="eb-grid">
          <div className="eb-side">
            {!hasRealExams && (
              <div className="eb-card" style={{ fontSize: 12.5, color: t.textSub, lineHeight: 1.55 }}>
                No past or trial exam papers are loaded for this subject yet, so this exam uses GradeFarm questions.
              </div>
            )}

            {realPapers.length > 0 && (
              <div>
                <span style={label}>Paper</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {realPapers.map(p => <button key={p.name} type="button" aria-pressed={paper === p.name} onClick={() => choosePaper(p.name)} style={chip(paper === p.name)}>{p.name}</button>)}
                </div>
              </div>
            )}

            <div>
              <span style={label}>Questions from</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {['official', 'commercial', 'bank'].map(kind => {
                  const list = sourcesForPaper(paper).filter(s => s.kind === kind)
                  if (!list.length) return null
                  return (
                    <div key={kind}>
                      <div style={{ fontSize: 11.5, color: t.textFaint, margin: '4px 0' }}>{kind === 'official' ? 'Past exams' : kind === 'commercial' ? 'Trial exams' : 'GradeFarm'}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {list.map(s => {
                          const on = (sources || []).includes(s.key)
                          return (
                            <button key={s.key} type="button" aria-pressed={on} style={chip(on)}
                              onClick={() => setSources(prev => on ? prev.filter(k => k !== s.key) : [...prev, s.key])}>
                              {s.key === BANK_SOURCE ? 'Question bank' : s.key.replace(paper ? ` ${paper}` : '', '')} <span style={{ opacity: 0.6 }}>{s.count}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <span style={label}>Topics</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button type="button" aria-pressed={!topics.length} onClick={() => setTopics([])} style={chip(!topics.length)}>All topics</button>
                {summary.topics.map(tp => {
                  const on = topics.includes(tp.name)
                  return <button key={tp.name} type="button" aria-pressed={on} style={chip(on)} onClick={() => setTopics(prev => on ? prev.filter(x => x !== tp.name) : [...prev, tp.name])}>{tp.name}</button>
                })}
              </div>
            </div>

            <div>
              <span style={label}>Section A · multiple choice</span>
              {numberRow('Multiple-choice questions', mcCount, setMcCount, [0, 5, 10, 20, 30])}
              <div style={{ fontSize: 11.5, color: t.textFaint, marginTop: 5 }}>{pool.A.length} available</div>
            </div>
            <div>
              <span style={label}>Section B · marks</span>
              {numberRow('Section B marks', bMarks, setBMarks, [0, 20, 40, 60, 80])}
              <div style={{ fontSize: 11.5, color: t.textFaint, marginTop: 5 }}>{pool.B.length} questions available</div>
            </div>

            <button type="button" onClick={() => setSeed(s => s + 1)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, fontFamily: FONT_B, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Shuffle size={15} aria-hidden="true" /> New mix of questions
            </button>

            <div className="eb-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>This exam</span>
                <span style={{ fontSize: 12, color: t.textMuted }}>{totals.total} marks · {minutes} min</span>
              </div>
              {edited && <div style={{ fontSize: 11.5, color: t.textFaint, marginTop: 4 }}>Edited by hand. Changing a setting above rebuilds it.</div>}
              {['A', 'B'].map(section => (
                <div key={section} style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: t.textSub }}>Section {section}</span>
                    <button type="button" onClick={() => { setAdding(adding === section ? null : section); setSearch('') }} style={{ ...iconBtn, color: t.text, fontSize: 12, fontWeight: 700, gap: 4, fontFamily: FONT_B }}>
                      <Plus size={14} /> Add
                    </button>
                  </div>
                  {adding === section && (
                    <div style={{ margin: '6px 0', padding: 8, borderRadius: 9, background: t.bgSubtle }}>
                      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search questions, topics or papers" style={input} autoFocus />
                      <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 6 }}>
                        {addable.length === 0 && <div style={{ fontSize: 12, color: t.textFaint, padding: 6 }}>Nothing else matches.</div>}
                        {addable.map(q => (
                          <button key={q.id} type="button" onClick={() => add(section, q.id)}
                            style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderTop: `1px solid ${t.border}`, background: 'transparent', color: t.text, padding: '7px 4px', cursor: 'pointer', fontFamily: FONT_B }}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{sourceLabel(q)}{section === 'B' ? ` · ${marksOf(q)} marks` : ''}</div>
                            <div style={{ fontSize: 11.5, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.topic} · {String(q.question || '').replace(/\$/g, '').slice(0, 90)}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {picked[section].length === 0 && <div style={{ fontSize: 12, color: t.textFaint, padding: '6px 0' }}>No questions.</div>}
                  {picked[section].map((id, i) => questionRow(section, id, i))}
                </div>
              ))}
            </div>

            <div className="eb-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ ...label, marginBottom: 0 }}>Cover page</span>
              <label style={{ fontSize: 12, color: t.textMuted }}>Subject<input value={subjectTitle} onChange={e => setSubjectTitle(e.target.value)} style={{ ...input, marginTop: 4 }} /></label>
              <label style={{ fontSize: 12, color: t.textMuted }}>Paper<input value={paperTitle} onChange={e => setPaperTitle(e.target.value)} style={{ ...input, marginTop: 4 }} /></label>
              <label style={{ fontSize: 12, color: t.textMuted }}>Permitted materials<textarea value={materials} onChange={e => setMaterials(e.target.value)} rows={3} style={{ ...input, marginTop: 4, resize: 'vertical' }} /></label>
              {[
                ['Multiple-choice answer sheet', answerSheet, setAnswerSheet],
                ['Solutions at the end', solutions, setSolutions],
                ['Show where each question is from', showSources, setShowSources],
              ].map(([text, on, set]) => (
                <label key={text} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: t.textSub, cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ width: 16, height: 16, accentColor: t.text }} /> {text}
                </label>
              ))}
            </div>
            <div style={{ fontSize: 12, color: t.textFaint, lineHeight: 1.5 }}>Download PDF opens the print window: choose Save as PDF, paper size A4, margins none.</div>
          </div>

          <div className="eb-preview" ref={previewRef}>
            <div className="eb-zoom" style={{ zoom }}>
              {totals.total > 0 ? (
                <ExamPaper exam={exam} meta={{
                  subjectTitle: subjectTitle || strip(subjectName), paperTitle, materials,
                  headerCode: `${subjectCode(subjectName)} PRACTICE ${paper ? paper.toUpperCase() : 'EXAM'}`,
                  readingMinutes: 15, writingMinutes: minutes, isMaths: isMathsSubject(subjectName),
                  showSources, answerSheet, solutions, totals,
                }} />
              ) : (
                <p style={{ color: t.textMuted, textAlign: 'center', padding: 40 }}>No questions match these settings.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
