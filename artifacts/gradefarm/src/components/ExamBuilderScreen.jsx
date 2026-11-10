import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Printer, Shuffle, RefreshCw, X, ChevronUp, ChevronDown, Plus, Save, Link2, Trash2 } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { getExamBankForTile, fetchTutorClasses, fetchMyClasses, fetchSolutions } from '../lib/db'
import { listBuiltExams, getBuiltExam, saveBuiltExam, deleteBuiltExam } from '../lib/builtExams'
import {
  bankSummary, examPool, pickExam, swapCandidate, examTotals, writingMinutes, isMathsSubject,
  sourceLabel, marksOf, BANK_SOURCE,
} from '../lib/examBuilder'
import { groupSubject } from '../lib/homeSubjects'
import ExamPaper from './ExamPaper'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

const strip = (name = '') => String(name).replace(/^(VCE|SACE)\s+/i, '').replace(/\s*(Units?\s*\d.*|Stage\s*\d.*)$/i, '').trim()
const paperNumber = (paper = '') => (String(paper).match(/\d+/) || [''])[0]

/** 'sace' for SACE subjects, else 'vce': which exam's look the paper takes. */
const boardOf = (subject) => (groupSubject({ name: subject?.name, level: subject?.stage }).group === 'sace' ? 'sace' : 'vce')

/** VCE: the cover's approved materials. SACE: the cover's instructions. One per line. */
function defaultMaterials(board, subjectName, paper) {
  const maths = isMathsSubject(subjectName)
  if (board === 'sace') {
    return maths
      ? ['Show appropriate working and steps of logic in the question booklets', 'State all answers correct to three significant figures, unless otherwise instructed', 'Use black or blue pen', 'You may use a sharp dark pencil for diagrams and graphical representations']
      : ['Use black or blue pen', 'You may use a sharp dark pencil for diagrams and other representations', 'Approved calculators may be used']
  }
  if (!maths) return ['One scientific calculator']
  if (paperNumber(paper) === '1') return []
  return ['Protractors, set squares and aids for curve sketching', 'One bound reference', 'One approved CAS calculator or CAS software, and one scientific calculator']
}

/** A full paper's shape: VCE tech-free maths papers have no multiple choice; SACE papers are all written. */
function fullPaper(board, subjectName, paper) {
  if (board === 'sace') return { mc: 0, b: isMathsSubject(subjectName) ? 100 : 120 }
  if (isMathsSubject(subjectName) && paperNumber(paper) === '1') return { mc: 0, b: 40 }
  return { mc: 20, b: 60 }
}

/** Writing time: VCE 1.5 minutes a mark; SACE papers are 130 minutes for a full paper. */
const examMinutes = (board, marks) => (board === 'sace' ? (marks >= 90 ? 130 : Math.max(15, Math.round((marks * 1.3) / 5) * 5)) : writingMinutes(marks))

/**
 * The exam builder: a full practice exam mixed from real past exams and
 * commercial trial exams in the bank (filtered by paper, source, year and
 * topic), with every question swappable, removable and reorderable, laid out
 * like the real paper (ExamPaper.jsx) and saved as PDF from the print window.
 * Exams can be saved (built_exams) and opened again from the list or a link
 * (/exam-builder?exam=<id>); tutors can share a saved exam with a class, and
 * its students see it under "From your tutor".
 */
const DEFAULT_STORE = { list: listBuiltExams, get: getBuiltExam, save: saveBuiltExam, remove: deleteBuiltExam }

export default function ExamBuilderScreen({ theme = 'dark', subject, profile, onExit, loadBank = getExamBankForTile, store = DEFAULT_STORE, loadClasses = null, loadSolutions = fetchSolutions }) {
  const t = THEMES[theme]
  const subjectName = subject?.name || ''
  const board = boardOf(subject)
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

  // Saved exams: the caller's own, and those shared with their classes.
  const myId = profile?.id || null
  const isTutor = !!(profile?.is_tutor || profile?.is_admin)
  const [saved, setSaved] = useState(null)
  const [current, setCurrent] = useState(null)   // the saved exam on screen: { id, title, classId, ownerId }
  const [notice, setNotice] = useState('')
  const [classes, setClasses] = useState([])
  useEffect(() => {
    let alive = true
    store.list(subjectName).then(rows => { if (alive) setSaved(rows || []) })
    const getClasses = loadClasses || (isTutor ? fetchTutorClasses : fetchMyClasses)
    Promise.resolve(getClasses()).then(list => { if (alive) setClasses(list || []) }).catch(() => {})
    return () => { alive = false }
  }, [subjectName, isTutor]) // eslint-disable-line react-hooks/exhaustive-deps
  const className = (id) => classes.find(c => c.id === id)?.name || 'your class'
  const mine = (saved || []).filter(r => r.owner_id === myId)
  const fromTutor = (saved || []).filter(r => r.owner_id !== myId && r.class_id)

  // First load: a saved exam from the link, else the paper with the most real
  // exam questions, its sources and its usual shape.
  useEffect(() => {
    if (!bank || saved === null || paper !== null) return
    const want = new URLSearchParams(window.location.search).get('exam')
    const open = (row) => {
      if (row && row.subject === subjectName) { applySaved(row); return }
      if (row) setNotice(`That exam is for ${row.subject}. Switch subject to open it.`)
      else if (want) setNotice("That saved exam couldn't be found. It may have been deleted or not shared with you.")
      const first = [...realPapers].sort((a, b) => b.count - a.count)[0]?.name || ''
      choosePaper(first)
    }
    if (!want) { open(null); return }
    const row = saved.find(r => r.id === want)
    if (row) open(row)
    else store.get(want).then(open)
  }, [bank, saved]) // eslint-disable-line react-hooks/exhaustive-deps

  const sourcesForPaper = (p) => summary.sources.filter(s => !p || !s.paper || s.paper === p)
  function choosePaper(p) {
    setPaper(p)
    const list = sourcesForPaper(p)
    const real = list.filter(s => s.kind !== 'bank')
    setSources((real.length ? real : list).map(s => s.key))
    const shape = fullPaper(board, subjectName, p)
    setMcCount(shape.mc)
    setBMarks(shape.b)
    setPaperTitle(p && paperNumber(p) ? `Examination ${paperNumber(p)}` : 'Examination')
    setMaterials(defaultMaterials(board, subjectName, p).join('\n'))
  }

  const pool = useMemo(() => examPool(bank || [], { paper: paper || '', sources: sources || [], topics }), [bank, paper, sources, topics])
  const byId = useMemo(() => new Map((bank || []).map(q => [q.id, q])), [bank])
  const byIdRef = useRef(byId)
  byIdRef.current = byId

  // The exam: rebuilt when a setting changes; then edited by hand. A saved
  // exam keeps its own questions until one of its settings is changed.
  const [picked, setPicked] = useState({ A: [], B: [] })
  const [edited, setEdited] = useState(false)
  const settingsKey = JSON.stringify([paper, sources, topics, mcCount, bMarks, seed])
  const appliedKey = useRef(null)
  useEffect(() => {
    if (!bank || sources === null) return
    if (appliedKey.current === settingsKey) return
    appliedKey.current = null
    setPicked(pickExam(pool, { mcCount, bMarks, seed, allQuestions: bank }))
    setEdited(false)
  }, [pool, mcCount, bMarks, seed]) // eslint-disable-line react-hooks/exhaustive-deps

  function applySaved(row) {
    const st = row.settings || {}
    const next = {
      paper: st.paper ?? '', sources: st.sources ?? [], topics: st.topics ?? [],
      mcCount: st.mcCount ?? 0, bMarks: st.bMarks ?? 0,
    }
    appliedKey.current = JSON.stringify([next.paper, next.sources, next.topics, next.mcCount, next.bMarks, seed])
    setPaper(next.paper); setSources(next.sources); setTopics(next.topics); setMcCount(next.mcCount); setBMarks(next.bMarks)
    setShowSources(!!st.showSources); setAnswerSheet(st.answerSheet !== false); setSolutions(st.solutions !== false)
    setSubjectTitle(st.subjectTitle || strip(subjectName)); setPaperTitle(st.paperTitle || ''); setMaterials(st.materials || '')
    setPicked({ A: row.questions?.A || [], B: row.questions?.B || [] })
    setEdited(false)
    setCurrent({ id: row.id, title: row.title, classId: row.class_id, ownerId: row.owner_id })
    const missing = [...(row.questions?.A || []), ...(row.questions?.B || [])].filter(id => !byIdRef.current.has(id)).length
    setNotice(missing ? `${missing} question${missing === 1 ? ' is' : 's are'} no longer in the bank, so ${missing === 1 ? 'it was' : 'they were'} left out.` : '')
    try { window.history.replaceState(null, '', `${window.location.pathname}?exam=${row.id}`) } catch {}
  }

  const exam = useMemo(() => ({
    A: picked.A.map(id => byId.get(id)).filter(Boolean),
    B: picked.B.map(id => byId.get(id)).filter(Boolean),
  }), [picked, byId])
  const totals = examTotals(exam)
  const minutes = examMinutes(board, totals.total)

  // The bank comes without answers. For the solutions pages, ask the server for
  // them: tutors and admins get every one; students get those for questions
  // they've answered and for questions from real past and trial papers.
  const askedSolutions = useRef(new Set())
  const examIds = [...exam.A, ...exam.B].map(q => q.id).join(',')
  useEffect(() => {
    if (!solutions || !examIds) return
    const want = examIds.split(',').filter(id => !askedSolutions.current.has(id))
    if (!want.length) return
    want.forEach(id => askedSolutions.current.add(id))
    let alive = true
    loadSolutions(want).then(found => {
      if (!alive || !found || !Object.keys(found).length) return
      setBank(prev => (prev || []).map(q => (found[q.id] ? { ...q, ...found[q.id] } : q)))
    }).catch(() => { want.forEach(id => askedSolutions.current.delete(id)) })
    return () => { alive = false }
  }, [solutions, examIds]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Saving: a new exam, or changes to one the caller owns. Tutors can share it with a class.
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveClass, setSaveClass] = useState('')
  const [saveState, setSaveState] = useState('')
  const ownsCurrent = !!current && current.ownerId === myId
  const openSave = () => {
    setSaveTitle(current?.title || `${subjectTitle} ${board === 'vce' ? paperTitle : ''} practice exam`.replace(/\s+/g, ' ').trim())
    setSaveClass(ownsCurrent ? current.classId || '' : '')
    setSaveState('')
    setSaveOpen(true)
  }
  const doSave = async (asNew) => {
    if (!myId || !saveTitle.trim()) return
    setSaveState('saving')
    const row = await store.save({
      id: ownsCurrent && !asNew ? current.id : undefined, ownerId: myId, subject: subjectName, title: saveTitle.trim(),
      questions: picked, classId: isTutor ? saveClass || null : null,
      settings: { board, paper, sources, topics, mcCount, bMarks, showSources, answerSheet, solutions, subjectTitle, paperTitle, materials },
    })
    if (!row) { setSaveState('error'); return }
    setSaved(prev => [row, ...(prev || []).filter(r => r.id !== row.id)])
    setCurrent({ id: row.id, title: row.title, classId: row.class_id, ownerId: row.owner_id })
    appliedKey.current = settingsKey
    setEdited(false)
    setSaveState('saved')
    setSaveOpen(false)
    try { window.history.replaceState(null, '', `${window.location.pathname}?exam=${row.id}`) } catch {}
  }
  const removeSaved = async (row) => {
    if (!window.confirm(`Delete "${row.title}"?${row.class_id ? ' Your class will no longer see it.' : ''}`)) return
    if (!(await store.remove(row.id))) return
    setSaved(prev => (prev || []).filter(r => r.id !== row.id))
    if (current?.id === row.id) setCurrent(null)
  }
  const [copied, setCopied] = useState(false)
  const copyLink = () => {
    if (!current) return
    const url = `${window.location.origin}/exam-builder?exam=${current.id}`
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {})
  }

  // Download PDF makes the file itself (lib/examPdf.js), page by page at A4,
  // so it doesn't depend on the browser's print settings. If that fails, the
  // print window is the fallback.
  const [pdfProgress, setPdfProgress] = useState(null) // null | { done, total }
  const fileTitle = `${subjectTitle} ${board === 'vce' ? paperTitle : ''} practice exam`.replace(/\s+/g, ' ').trim()
  const printInstead = () => {
    const before = document.title
    document.title = fileTitle
    const restore = () => { document.title = before; window.removeEventListener('afterprint', restore) }
    window.addEventListener('afterprint', restore)
    window.print()
    setTimeout(restore, 1000)
  }
  const download = async () => {
    if (pdfProgress) return
    setPdfProgress({ done: 0, total: 0 })
    try {
      const { downloadExamPdf } = await import('../lib/examPdf')
      await downloadExamPdf(previewRef.current, `${fileTitle.replace(/[^\w .-]+/g, '') || 'Practice exam'}.pdf`, (done, total) => setPdfProgress({ done, total }))
    } catch (err) {
      console.warn('[exam builder] making the PDF failed; printing instead', err)
      printInstead()
    } finally {
      setPdfProgress(null)
    }
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
        <div className="eb-title" style={{ fontSize: 15, fontWeight: 800 }}>{current ? current.title : 'Exam builder'}</div>
        <div style={{ display: 'flex', gap: 8 }}>
        {myId && (
          <button type="button" onClick={openSave} disabled={!totals.total}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgCard, color: totals.total ? t.text : t.textFaint, fontFamily: FONT_B, fontSize: 13.5, fontWeight: 700, cursor: totals.total ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
            <Save size={15} aria-hidden="true" /> {saveState === 'saved' && !edited ? 'Saved' : 'Save'}
          </button>
        )}
        <button type="button" onClick={download} disabled={!totals.total || !!pdfProgress} aria-live="polite"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, border: 'none', background: totals.total ? t.accent : t.bgHover, color: totals.total ? '#0c1037' : t.textFaint, fontFamily: FONT_B, fontSize: 13.5, fontWeight: 800, cursor: totals.total && !pdfProgress ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
          <Printer size={16} aria-hidden="true" />
          {pdfProgress ? (pdfProgress.total ? `Downloading… ${pdfProgress.done}/${pdfProgress.total}` : 'Downloading…') : 'Download PDF'}
        </button>
        </div>
      </div>

      {saveOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="eb-save-h" onClick={e => { if (e.target === e.currentTarget) setSaveOpen(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: 16 }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div id="eb-save-h" style={{ fontSize: 16, fontWeight: 800 }}>{ownsCurrent ? 'Save changes' : 'Save this exam'}</div>
            <label style={{ fontSize: 12, color: t.textMuted }}>Name
              <input autoFocus value={saveTitle} onChange={e => setSaveTitle(e.target.value)} maxLength={120} style={{ ...input, marginTop: 4 }}
                onKeyDown={e => { if (e.key === 'Enter') doSave(false) }} />
            </label>
            {isTutor && (
              <label style={{ fontSize: 12, color: t.textMuted }}>Share with a class
                <select value={saveClass} onChange={e => setSaveClass(e.target.value)} style={{ ...input, marginTop: 4 }}>
                  <option value="">Don't share (just me)</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.subject ? ` · ${c.subject}` : ''}</option>)}
                </select>
                <span style={{ display: 'block', marginTop: 4, color: t.textFaint }}>Students in the class see it under "From your tutor" in their exam builder.</span>
              </label>
            )}
            {saveState === 'error' && <div role="alert" style={{ fontSize: 12.5, color: t.danger }}>Couldn't save. Check your connection and try again.</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setSaveOpen(false)} style={{ padding: '9px 14px', borderRadius: 10, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontFamily: FONT_B, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              {ownsCurrent && <button type="button" onClick={() => doSave(true)} disabled={!saveTitle.trim() || saveState === 'saving'} style={{ padding: '9px 14px', borderRadius: 10, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontFamily: FONT_B, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save as new</button>}
              <button type="button" onClick={() => doSave(false)} disabled={!saveTitle.trim() || saveState === 'saving'} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: t.accent, color: '#0c1037', fontFamily: FONT_B, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                {saveState === 'saving' ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!bank ? (
        <p role="status" style={{ padding: 24, color: loadError ? t.danger : t.textMuted }}>{loadError || 'Loading exam questions…'}</p>
      ) : (
        <div className="eb-grid">
          <div className="eb-side">
            {notice && <div className="eb-card" role="status" style={{ fontSize: 12.5, color: t.textSub, lineHeight: 1.55 }}>{notice}</div>}

            {(mine.length > 0 || fromTutor.length > 0 || current) && (
              <div className="eb-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {current && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6, borderBottom: `1px solid ${t.border}` }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                      <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Open: {current.title}</div>
                      <div style={{ color: t.textMuted }}>{current.ownerId !== myId ? `From your tutor · ${className(current.classId)}` : current.classId ? `Shared with ${className(current.classId)}` : 'Only you can see it'}{edited ? ' · unsaved changes' : ''}</div>
                    </div>
                    <button type="button" onClick={copyLink} title="Copy a link to this exam" aria-label="Copy link" style={iconBtn}><Link2 size={15} /></button>
                    {copied && <span style={{ fontSize: 11.5, color: t.success }}>Copied</span>}
                  </div>
                )}
                {fromTutor.length > 0 && (
                  <>
                    <span style={{ ...label, marginBottom: 0 }}>From your tutor</span>
                    {fromTutor.map(r => (
                      <button key={r.id} type="button" onClick={() => applySaved(r)}
                        style={{ textAlign: 'left', border: 'none', background: current?.id === r.id ? t.bgSubtle : 'transparent', color: t.text, padding: '6px 4px', borderRadius: 7, cursor: 'pointer', fontFamily: FONT_B }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{r.title}</div>
                        <div style={{ fontSize: 11.5, color: t.textMuted }}>{className(r.class_id)} · {new Date(r.updated_at).toLocaleDateString()}</div>
                      </button>
                    ))}
                  </>
                )}
                {mine.length > 0 && (
                  <>
                    <span style={{ ...label, marginBottom: 0, marginTop: fromTutor.length ? 6 : 0 }}>My saved exams</span>
                    {mine.map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 7, background: current?.id === r.id ? t.bgSubtle : 'transparent' }}>
                        <button type="button" onClick={() => applySaved(r)} style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent', color: t.text, padding: '6px 4px', cursor: 'pointer', fontFamily: FONT_B }}>
                          <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                          <div style={{ fontSize: 11.5, color: t.textMuted }}>{new Date(r.updated_at).toLocaleDateString()}{r.class_id ? ` · shared with ${className(r.class_id)}` : ''}</div>
                        </button>
                        <button type="button" onClick={() => removeSaved(r)} title="Delete" aria-label={`Delete ${r.title}`} style={iconBtn}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

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
              <span style={label}>{board === 'sace' ? 'Multiple choice' : 'Section A · multiple choice'}</span>
              {numberRow('Multiple-choice questions', mcCount, setMcCount, [0, 5, 10, 20, 30])}
              <div style={{ fontSize: 11.5, color: t.textFaint, marginTop: 5 }}>{pool.A.length} available</div>
            </div>
            <div>
              <span style={label}>{board === 'sace' ? 'Written questions · marks' : 'Section B · marks'}</span>
              {numberRow('Section B marks', bMarks, setBMarks, board === 'sace' ? [20, 40, 60, 80, 100, 120] : [0, 20, 40, 60, 80])}
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
              {board === 'vce' && <label style={{ fontSize: 12, color: t.textMuted }}>Paper<input value={paperTitle} onChange={e => setPaperTitle(e.target.value)} style={{ ...input, marginTop: 4 }} /></label>}
              <label style={{ fontSize: 12, color: t.textMuted }}>{board === 'sace' ? 'Instructions' : 'Approved materials'} (one per line)<textarea value={materials} onChange={e => setMaterials(e.target.value)} rows={4} style={{ ...input, marginTop: 4, resize: 'vertical' }} /></label>
              {[
                ...(board === 'vce' ? [['Multiple-choice answer sheet', answerSheet, setAnswerSheet]] : []),
                ['Solutions at the end', solutions, setSolutions],
                ['Show where each question is from', showSources, setShowSources],
              ].map(([text, on, set]) => (
                <label key={text} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: t.textSub, cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ width: 16, height: 16, accentColor: t.text }} /> {text}
                </label>
              ))}
            </div>
            <div style={{ fontSize: 12, color: t.textFaint, lineHeight: 1.5 }}>Download PDF saves an A4 PDF ready to print. It takes a few seconds for a long exam.</div>
          </div>

          <div className="eb-preview" ref={previewRef}>
            <div className="eb-zoom" style={{ zoom }}>
              {totals.total > 0 ? (
                <ExamPaper exam={exam} meta={{
                  board, subjectTitle: subjectTitle || strip(subjectName), paperTitle, paperNumber: paperNumber(paper || ''),
                  headerTitle: `GradeFarm Practice ${subjectTitle || strip(subjectName)} ${paperTitle}`.trim(),
                  materials: materials.split('\n').map(s => s.trim()).filter(Boolean),
                  readingMinutes: 15, writingMinutes: minutes, isMaths: isMathsSubject(subjectName),
                  showSources, answerSheet: board === 'vce' && answerSheet, solutions, totals,
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
