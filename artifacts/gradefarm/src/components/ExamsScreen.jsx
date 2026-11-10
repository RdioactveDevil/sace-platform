import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { fetchSolutions, getExamBankForTile } from '../lib/db'
import { listBuiltExams } from '../lib/builtExams'
import { ATTEMPT_STORE } from '../lib/examAttempts'
import { isExamReady } from '../lib/examBuilder'
import {
  SKIP, tally, partRows, byQuestion, byTopic, summary, cleanMark, skippedParts,
  previousPercent, seenQuestionIds,
} from '../lib/examMarking'
import MathText from './MathText'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const letter = (i) => (Number.isInteger(i) ? String.fromCharCode(65 + i) : '')
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Exams: the student's own exams from the exam builder. They download one,
 * sit it on paper, then mark each part here against the solutions (marks, or
 * Skipped for a blank, kept apart from 0), and keep a history of their scores.
 *
 * `view`: 'dashboard' (/exams), 'mark' (/exams/:id/mark) or 'result'
 * (/exams/:id). `go(path)` navigates; `newExam(query)` opens the builder.
 * Self-marked scores give no XP.
 */
export default function ExamsScreen({
  theme = 'dark', subject, profile, view = 'dashboard', attemptId = null, go = () => {}, newExam = () => {}, onExit = () => {},
  store = ATTEMPT_STORE, loadSolutions = fetchSolutions, loadBank = getExamBankForTile, loadExams = listBuiltExams,
}) {
  const t = THEMES[theme]
  const subjectName = subject?.name || ''
  const myId = profile?.id || null
  const [attempts, setAttempts] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    setAttempts(null)
    store.list(subjectName, myId).then(rows => {
      if (!alive) return
      if (rows === null) setError("Couldn't load your exams. Check your connection and try again.")
      setAttempts(rows || [])
    })
    return () => { alive = false }
  }, [subjectName, myId]) // eslint-disable-line react-hooks/exhaustive-deps

  const replace = (row) => setAttempts(prev => (prev || []).map(a => (a.id === row.id ? row : a)))
  const attempt = attemptId ? (attempts || []).find(a => a.id === attemptId) : null

  const css = `
    .ex { min-height: 100vh; background: ${t.bg}; color: ${t.text}; font-family: ${FONT_B}; }
    .ex-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 24px; border-bottom: 1px solid ${t.border}; position: sticky; top: 0; background: ${t.bg}; z-index: 3; }
    .ex-main { max-width: 1180px; margin: 0 auto; padding: 24px 20px 56px; display: flex; flex-direction: column; gap: 22px; box-sizing: border-box; }
    .ex-card { background: ${t.bgCard}; border: 1px solid ${t.border}; border-radius: 14px; padding: 18px; box-sizing: border-box; min-width: 0; }
    .ex-h { margin: 0; font-size: 16px; font-weight: 800; }
    .ex-label { font-size: 12px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: ${t.textMuted}; }
    .ex-row { display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-start; }
    .ex-wide { flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 22px; }
    .ex-side { flex: 1 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 22px; }
    .ex-table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 520px; }
    .ex-table th { text-align: left; color: ${t.textMuted}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 800; padding: 8px 6px; }
    .ex-table td { padding: 11px 6px; border-top: 1px solid ${t.border}; }
    .ex-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 40px; padding: 9px 15px; border-radius: 10px; font-family: ${FONT_B}; font-size: 13.5px; font-weight: 700; cursor: pointer; border: 1px solid ${t.borderMid}; background: transparent; color: ${t.text}; text-decoration: none; }
    .ex-btn.primary { border: none; background: ${t.accent}; color: #0c1037; font-weight: 800; }
    .ex-btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .ex-link { border: none; background: transparent; color: ${t.goldText}; font-family: ${FONT_B}; font-size: 13.5px; font-weight: 700; cursor: pointer; padding: 0; }
    .ex-mark { min-width: 44px; height: 44px; padding: 0 12px; border-radius: 10px; font-family: ${FONT_B}; font-size: 14px; font-weight: 800; cursor: pointer; border: 1px solid ${t.borderMid}; background: transparent; color: ${t.text}; }
    .ex-skip { border-style: dashed; color: ${t.textMuted}; font-weight: 700; }
    @media (max-width: 640px) { .ex-bar { padding: 10px 14px; } .ex-main { padding: 16px 12px 48px; } .ex-indent { padding-left: 0 !important; margin-left: 0 !important; } }
  `

  let body
  if (attempts === null) body = <p role="status" style={{ padding: 24, color: t.textMuted }}>Loading your exams…</p>
  else if (view !== 'dashboard' && !attempt) {
    body = (
      <main className="ex-main">
        <div className="ex-card" role="alert" style={{ color: t.textSub }}>That exam couldn't be found. It may have been removed.</div>
        <div><button type="button" className="ex-btn" onClick={() => go('/exams')}>Back to Exams</button></div>
      </main>
    )
  } else if (view === 'mark') {
    body = <Marking t={t} attempt={attempt} store={store} loadSolutions={loadSolutions} onSaved={replace} go={go} />
  } else if (view === 'result') {
    body = <Result t={t} attempt={attempt} attempts={attempts} go={go} newExam={newExam} />
  } else {
    body = (
      <Dashboard t={t} attempts={attempts} error={error} subjectName={subjectName} myId={myId} go={go} newExam={newExam}
        loadBank={loadBank} loadExams={loadExams} subject={subject}
        onRemove={async (a) => {
          if (!window.confirm(`Remove "${a.title}" from your exams?${a.status === 'marked' ? ' Its score will be deleted.' : ''}`)) return
          if (await store.remove(a.id)) setAttempts(prev => prev.filter(x => x.id !== a.id))
        }} />
    )
  }

  const back = view === 'dashboard'
    ? <button type="button" onClick={onExit} className="ex-link" style={{ color: t.text, display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={16} aria-hidden="true" /> Back to practice</button>
    : <button type="button" onClick={() => go('/exams')} className="ex-link" style={{ color: t.text, display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={16} aria-hidden="true" /> Exams</button>

  return (
    <div className="ex">
      <style>{css}</style>
      {view === 'dashboard' && (
        <div className="ex-bar">
          {back}
          <div style={{ fontSize: 15.5, fontWeight: 800 }}>Exams{subjectName ? ` · ${subjectName}` : ''}</div>
          <button type="button" className="ex-btn primary" onClick={() => newExam('')}><Plus size={16} aria-hidden="true" /> New exam</button>
        </div>
      )}
      {view !== 'dashboard' && !attempt && <div className="ex-bar">{back}</div>}
      {view !== 'dashboard' && attempt ? <BarFor view={view} back={back} attempt={attempt} go={go} newExam={newExam} /> : null}
      {body}
    </div>
  )
}

// Marking keeps its own header (with the running score), so the bar here is for the result page only.
function BarFor({ view, back, attempt, go, newExam }) {
  if (view !== 'result') return null
  return (
    <div className="ex-bar">
      {back}
      <div style={{ fontSize: 15.5, fontWeight: 800 }}>{attempt.title}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="ex-btn" onClick={() => go(`/exams/${attempt.id}/mark`)}>Change marks</button>
        {attempt.exam_id && <button type="button" className="ex-btn" onClick={() => newExam(`exam=${attempt.exam_id}`)}>Retake</button>}
      </div>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ t, attempts, error, subject, subjectName, myId, go, newExam, loadBank, loadExams, onRemove }) {
  const sum = useMemo(() => summary(attempts), [attempts])
  const topics = useMemo(() => byTopic(attempts).slice(0, 4), [attempts])
  const toMark = attempts.filter(a => a.status !== 'marked')
  const marked = attempts.filter(a => a.status === 'marked')
    .sort((a, b) => String(b.marked_at || '').localeCompare(String(a.marked_at || '')))

  // Exams a tutor shared with the student's classes that they haven't started.
  const [shared, setShared] = useState([])
  useEffect(() => {
    let alive = true
    Promise.resolve(loadExams(subjectName)).then(rows => {
      if (!alive || !rows) return
      const started = new Set(attempts.map(a => a.exam_id))
      setShared(rows.filter(r => r.owner_id !== myId && r.class_id && !started.has(r.id)))
    }).catch(() => {})
    return () => { alive = false }
  }, [subjectName, attempts]) // eslint-disable-line react-hooks/exhaustive-deps

  // How much of the bank's real exam questions the student has met.
  const [bankCount, setBankCount] = useState(null)
  useEffect(() => {
    let alive = true
    Promise.resolve(loadBank(subject)).then(qs => {
      if (!alive || !qs) return
      setBankCount((qs || []).filter(q => isExamReady(q) && q.source).map(q => q.id))
    }).catch(() => {})
    return () => { alive = false }
  }, [subjectName]) // eslint-disable-line react-hooks/exhaustive-deps
  const seen = useMemo(() => seenQuestionIds(attempts), [attempts])
  const seenReal = bankCount ? bankCount.filter(id => seen.has(id)).length : 0

  const weak = topics.filter(r => r.percent < 70).map(r => r.topic)
  const tone = (p) => (p < 50 ? t.danger : p < 75 ? t.accent : t.success)
  const stat = (label, value, sub, subColor) => (
    <div className="ex-card">
      <div className="ex-label">{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: subColor || t.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  )

  if (!attempts.length && !shared.length) {
    return (
      <main className="ex-main">
        {error && <div className="ex-card" role="alert" style={{ color: t.danger }}>{error}</div>}
        <div className="ex-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <h2 className="ex-h" style={{ fontSize: 19 }}>Your exams will appear here</h2>
          <div style={{ fontSize: 14.5, color: t.textSub, lineHeight: 1.6, maxWidth: 620 }}>
            Build a practice exam from past papers and download it. Sit it on paper, then come back here to mark each part against the solutions and keep track of your scores.
          </div>
          <button type="button" className="ex-btn primary" onClick={() => newExam('')}><Plus size={16} aria-hidden="true" /> New exam</button>
        </div>
      </main>
    )
  }

  return (
    <main className="ex-main">
      {error && <div className="ex-card" role="alert" style={{ color: t.danger }}>{error}</div>}
      <section aria-label="Summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        {stat('Exams marked', sum.marked, sum.waiting ? `${sum.waiting} waiting to be marked` : null)}
        {stat('Average score', sum.average === null ? '–' : `${sum.average}%`,
          sum.change === null ? null : sum.change >= 0 ? `Up ${sum.change} points since your first` : `Down ${-sum.change} points since your first`,
          sum.change === null ? null : sum.change >= 0 ? t.success : t.danger)}
        {stat('Latest', sum.latest ? `${sum.latest.percent}%` : '–', sum.latest ? `${sum.latest.scored} / ${sum.latest.available} · ${day(sum.latest.at)}` : null)}
        {stat('Marks skipped', sum.skippedPercent === null ? '–' : `${sum.skippedPercent}%`)}
      </section>

      <div className="ex-row">
        <div className="ex-wide">
          {sum.trend.length > 0 && (
            <section className="ex-card" aria-labelledby="ex-trend">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <h2 id="ex-trend" className="ex-h">Your scores</h2>
                <span style={{ fontSize: 12.5, color: t.textMuted }}>Light top = skipped</span>
              </div>
              <div role="img" aria-label={`Scores: ${sum.trend.map(x => `${day(x.at)} ${x.percent}%`).join(', ')}`}
                style={{ display: 'flex', alignItems: 'flex-end', gap: 22, height: 190, marginTop: 16, padding: '0 6px', borderBottom: `1px solid ${t.borderMid}` }}>
                {sum.trend.map(x => (
                  <div key={x.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{x.percent}%</span>
                    <div style={{ width: '100%', maxWidth: 72, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ height: Math.round(x.skippedPercent * 1.5), background: 'rgba(226,181,76,0.30)', borderRadius: '6px 6px 0 0' }} />
                      <div style={{ height: Math.max(2, Math.round(x.percent * 1.5)), background: t.accent, borderRadius: x.skippedPercent ? 0 : '6px 6px 0 0' }} />
                    </div>
                  </div>
                ))}
              </div>
              <div aria-hidden="true" style={{ display: 'flex', gap: 22, padding: '8px 6px 0', fontSize: 12.5, color: t.textMuted }}>
                {sum.trend.map(x => <span key={x.id} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>{day(x.at)}</span>)}
              </div>
            </section>
          )}

          {(toMark.length > 0 || shared.length > 0) && (
            <section aria-labelledby="ex-tomark" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 id="ex-tomark" className="ex-h">Ready to mark</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                {toMark.map(a => {
                  const tl = tally(a.snapshot, a.marks || {})
                  return (
                    <div key={a.id} className="ex-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderColor: t.borderAccent }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800 }}>{a.title}</div>
                          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 3 }}>Downloaded {day(a.created_at)} · {plural(a.snapshot?.questions?.length || 0, 'question')} · {tl.available} marks</div>
                        </div>
                        <button type="button" onClick={() => onRemove(a)} aria-label={`Remove ${a.title}`} title="Remove" style={{ border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer', padding: 4, display: 'inline-flex' }}><Trash2 size={15} /></button>
                      </div>
                      {tl.entered > 0 && <div style={{ fontSize: 13, color: t.goldText, fontWeight: 700 }}>Marking in progress · {tl.entered} of {tl.parts} parts</div>}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="ex-btn primary" onClick={() => go(`/exams/${a.id}/mark`)}>{tl.entered > 0 ? 'Continue marking' : 'Mark it'}</button>
                        {a.exam_id && <button type="button" className="ex-btn" onClick={() => newExam(`exam=${a.exam_id}`)}>Download again</button>}
                      </div>
                    </div>
                  )
                })}
                {shared.map(r => (
                  <div key={r.id} className="ex-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>{r.title}</div>
                      <div style={{ fontSize: 13, color: t.textMuted, marginTop: 3 }}>From your tutor · {day(r.updated_at)}</div>
                    </div>
                    <div><button type="button" className="ex-btn" onClick={() => newExam(`exam=${r.id}`)}>Open and download</button></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {marked.length > 0 && (
            <section className="ex-card" aria-labelledby="ex-history">
              <h2 id="ex-history" className="ex-h" style={{ marginBottom: 10 }}>Past results</h2>
              <div style={{ overflowX: 'auto', position: 'relative' }}>
                <table className="ex-table">
                  <thead>
                    <tr><th>Exam</th><th>Marked</th><th style={{ textAlign: 'right' }}>Score</th><th style={{ textAlign: 'right' }}>Skipped</th><th><span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</span></th></tr>
                  </thead>
                  <tbody>
                    {marked.map(a => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 700 }}>{a.title}</td>
                        <td style={{ color: t.textSub }}>{day(a.marked_at)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>{a.scored} / {a.available} <span style={{ color: t.textMuted, fontWeight: 600 }}>{a.available ? Math.round((a.scored / a.available) * 100) : 0}%</span></td>
                        <td style={{ textAlign: 'right', color: t.textSub, whiteSpace: 'nowrap' }}>{a.skipped ? plural(a.skipped, 'mark') : '–'}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button type="button" className="ex-link" onClick={() => go(`/exams/${a.id}`)}>View</button>
                          {a.exam_id && <> <span style={{ color: t.textMuted }}>·</span> <button type="button" className="ex-link" onClick={() => newExam(`exam=${a.exam_id}`)}>Retake</button></>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <aside className="ex-side">
          {topics.length > 0 && (
            <section className="ex-card" aria-labelledby="ex-topics" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 id="ex-topics" className="ex-h">Where marks go</h2>
              {topics.map(r => (
                <div key={r.topic} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5 }}><span>{r.topic}</span><b>{r.percent}%</b></div>
                  <div style={{ height: 8, borderRadius: 4, background: t.bgHover }}><div style={{ width: `${r.percent}%`, height: 8, borderRadius: 4, background: tone(r.percent) }} /></div>
                </div>
              ))}
              {weak.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  <button type="button" className="ex-btn" style={{ background: t.bgHover, border: 'none' }} onClick={() => newExam(`topics=${encodeURIComponent(weak[0])}`)}>New exam on {weak[0]}</button>
                  {weak.length > 1 && <button type="button" className="ex-btn" onClick={() => newExam(`topics=${encodeURIComponent(weak.join('|'))}`)}>New exam from my weak topics</button>}
                </div>
              )}
            </section>
          )}
          {bankCount && bankCount.length > 0 && (
            <section className="ex-card" aria-labelledby="ex-seen" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 id="ex-seen" className="ex-h">Question bank</h2>
              <div style={{ fontSize: 14, color: t.textSub, lineHeight: 1.5 }}>You've seen <b style={{ color: t.text }}>{seenReal} of {bankCount.length}</b> real exam questions. New exams use unseen ones first.</div>
              <div style={{ height: 8, borderRadius: 4, background: t.bgHover, marginTop: 4 }}><div style={{ width: `${Math.round((seenReal / bankCount.length) * 100)}%`, height: 8, borderRadius: 4, background: t.blue }} /></div>
            </section>
          )}
        </aside>
      </div>
    </main>
  )
}

// ── Marking ──────────────────────────────────────────────────────────────────
function Marking({ t, attempt, store, loadSolutions, onSaved, go }) {
  const [marks, setMarks] = useState(() => ({ ...(attempt.marks || {}) }))
  const [open, setOpen] = useState({})
  const [all, setAll] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const rows = useMemo(() => partRows(attempt.snapshot), [attempt.snapshot])
  const tl = tally(attempt.snapshot, marks)

  // Solutions from the server: released for questions in the student's own attempts.
  const [solutions, setSolutions] = useState(null)
  useEffect(() => {
    let alive = true
    loadSolutions(attempt.question_ids || []).then(s => { if (alive) setSolutions(s || {}) }).catch(() => { if (alive) setSolutions({}) })
    return () => { alive = false }
  }, [attempt.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const solutionFor = (p) => {
    const r = solutions?.[p.question.id]
    if (!r) return null
    const k = Number(p.key.split('#')[1])
    if (p.question.section === 'A') {
      const ans = Number.isInteger(r.answer_index) ? `**Answer: ${letter(r.answer_index)}**` : ''
      return [ans, r.solution].filter(Boolean).join('\n\n') || null
    }
    return (Array.isArray(r.parts) ? r.parts[k]?.solution : null) || (k === 0 && !Array.isArray(r.parts) ? r.solution : null) || null
  }

  // Save a moment after each change, so marking can stop and carry on later.
  const latest = useRef(attempt)
  const timer = useRef(null)
  const save = async (next, opts) => {
    const row = await store.save(latest.current, next, opts)
    if (!row) { setSaveError(true); return null }
    setSaveError(false)
    latest.current = row
    onSaved(row)
    return row
  }
  const current = useRef(marks)
  const pending = useRef(false)
  // Leaving the page saves anything not yet saved.
  useEffect(() => () => {
    clearTimeout(timer.current)
    if (pending.current) store.save(latest.current, current.current).then(row => { if (row) onSaved(row) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const setMark = (key, v) => {
    const next = { ...current.current }
    if (next[key] === v) delete next[key]
    else next[key] = v
    current.current = next
    setMarks(next)
    pending.current = true
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { pending.current = false; save(next) }, 700)
  }

  const finish = async () => {
    let next = marks
    const missing = rows.filter(p => cleanMark(marks[p.key], p.marks) === undefined)
    if (missing.length) {
      if (!window.confirm(`${plural(missing.length, 'part')} ${missing.length === 1 ? 'has' : 'have'} no mark yet. Count ${missing.length === 1 ? 'it' : 'them'} as skipped and finish?`)) return
      next = { ...marks }
      for (const p of missing) next[p.key] = SKIP
      current.current = next
      setMarks(next)
    }
    clearTimeout(timer.current)
    pending.current = false
    setFinishing(true)
    const row = await save(next, { finish: true })
    setFinishing(false)
    if (row) go(`/exams/${row.id}`)
  }

  const color = (n, max) => (n === max ? t.success : n === 0 ? t.danger : t.accent)
  return (
    <>
      <div className="ex-bar">
        <button type="button" onClick={() => go('/exams')} className="ex-link" style={{ color: t.text, display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={16} aria-hidden="true" /> Exams</button>
        <div style={{ fontSize: 15.5, fontWeight: 800 }}>Marking: {attempt.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }} aria-live="polite">
            <div style={{ fontSize: 17, fontWeight: 800 }}>{tl.scored} <span style={{ color: t.textMuted, fontWeight: 600 }}>/ {tl.scored + tl.lost} marked</span></div>
            <div style={{ fontSize: 12.5, color: t.textMuted }}>{tl.entered} of {tl.parts} parts · {plural(tl.skipped, 'mark')} skipped</div>
          </div>
          <button type="button" className="ex-btn primary" onClick={finish} disabled={finishing}>{finishing ? 'Saving…' : 'Finish marking'}</button>
        </div>
      </div>
      <main className="ex-main" style={{ maxWidth: 940 }}>
        {saveError && <div className="ex-card" role="alert" style={{ color: t.danger, fontSize: 13.5 }}>Couldn't save your marks. Check your connection; they'll save with your next change.</div>}
        <div className="ex-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
          <div style={{ fontSize: 13.5, color: t.textSub, lineHeight: 1.5, flex: '1 1 360px' }}>For each part, pick the marks you earned using the solution. Choose <b style={{ color: t.text }}>Skipped</b> if you left it blank, so it's kept apart from answers that scored 0.</div>
          <button type="button" className="ex-btn" onClick={() => { setAll(a => !a); setOpen({}) }}>{all ? 'Hide all solutions' : 'Show all solutions'}</button>
        </div>
        {(attempt.snapshot?.questions || []).map(q => (
          <section key={q.id} className="ex-card" aria-labelledby={`q-${q.id}`} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', padding: '14px 18px' }}>
              <h2 id={`q-${q.id}`} className="ex-h">Question {q.number} <span style={{ fontWeight: 600, color: t.textMuted }}>({plural(q.marks, 'mark')})</span></h2>
              <span style={{ fontSize: 12.5, color: t.textMuted }}>{[q.source, q.topic].filter(Boolean).join(' · ')}</span>
            </div>
            {rows.filter(p => p.question.id === q.id).map(p => {
              const m = cleanMark(marks[p.key], p.marks)
              const shown = all || open[p.key]
              const sol = solutionFor(p)
              return (
                <div key={p.key} style={{ padding: '14px 18px', borderTop: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                    <div style={{ minWidth: 92, fontWeight: 800, fontSize: 14.5 }}>{p.label || (q.section === 'A' ? 'Answer' : 'Marks')}</div>
                    <div style={{ flex: '1 1 260px', minWidth: 0, fontSize: 13.5, color: t.textSub, lineHeight: 1.5, maxHeight: 64, overflow: 'hidden' }}>
                      {p.text ? <MathText text={p.text.split('\n').filter(Boolean).slice(-1)[0] || p.text} /> : q.title}
                    </div>
                    <div role="group" aria-label={`Marks for ${p.label || `question ${q.number}`}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {Array.from({ length: p.marks + 1 }, (_, n) => (
                        <button key={n} type="button" className="ex-mark" aria-pressed={m === n} onClick={() => setMark(p.key, n)}
                          style={m === n ? { background: color(n, p.marks), borderColor: color(n, p.marks), color: '#111113' } : undefined}>{n}</button>
                      ))}
                      <span aria-hidden="true" style={{ width: 1, height: 26, background: t.borderMid, margin: '0 2px' }} />
                      <button type="button" className="ex-mark ex-skip" aria-pressed={m === SKIP} onClick={() => setMark(p.key, SKIP)}
                        style={m === SKIP ? { background: t.borderMid, color: t.text, borderColor: t.textMuted } : undefined}>Skipped</button>
                    </div>
                  </div>
                  <div className="ex-indent" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 104 }}>
                    <button type="button" className="ex-link" onClick={() => setOpen(o => ({ ...o, [p.key]: !shown }))} aria-expanded={!!shown}>{shown ? 'Hide solution' : 'Show solution'}</button>
                    <span style={{ fontSize: 12.5, color: t.textMuted }}>{plural(p.marks, 'mark')}</span>
                  </div>
                  {shown && (
                    <div className="ex-indent" style={{ marginLeft: 104, padding: '12px 14px', borderRadius: 10, background: t.bgElevated, fontSize: 13.5, lineHeight: 1.6 }}>
                      {solutions === null ? <span style={{ color: t.textMuted }}>Loading the solution…</span>
                        : sol ? <MathText text={sol} /> : <span style={{ color: t.textMuted }}>No written solution for this part. Use the solutions at the back of your exam.</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="ex-btn primary" onClick={finish} disabled={finishing}>{finishing ? 'Saving…' : 'Finish marking'}</button>
        </div>
      </main>
    </>
  )
}

// ── Result ───────────────────────────────────────────────────────────────────
function Result({ t, attempt, attempts, newExam }) {
  const tl = tally(attempt.snapshot, attempt.marks || {})
  const rows = byQuestion(attempt.snapshot, attempt.marks || {})
  const prev = previousPercent(attempts, attempt)
  const blanks = skippedParts(attempt.snapshot, attempt.marks || {})
  const same = attempts.filter(a => a.status === 'marked' && attempt.exam_id && a.exam_id === attempt.exam_id)
    .sort((a, b) => String(b.marked_at || '').localeCompare(String(a.marked_at || '')))
  const lostByTopic = new Map()
  for (const r of rows) {
    const x = lostByTopic.get(r.topic || 'Other') || { lost: 0, max: 0 }
    x.lost += r.max - r.scored
    x.max += r.max
    lostByTopic.set(r.topic || 'Other', x)
  }
  const worst = [...lostByTopic.entries()].sort((a, b) => b[1].lost - a[1].lost)[0]
  const w = (n) => `${tl.available ? (n / tl.available) * 100 : 0}%`
  const hatch = `repeating-linear-gradient(45deg, ${t.textFaint} 0 4px, ${t.borderStrong} 4px 8px)`
  const change = prev === null ? null : tl.percent - prev
  const key = (bg, label, n) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: bg }} />{label} <b style={{ color: t.text }}>{n}</b></span>
  )
  return (
    <main className="ex-main" style={{ maxWidth: 1100 }}>
      <section className="ex-card" aria-label="Score" style={{ padding: 24, display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>
        <div>
          <div className="ex-label">Your score</div>
          <div style={{ fontSize: 50, fontWeight: 800, lineHeight: 1.05, marginTop: 4 }}>{tl.scored}<span style={{ fontSize: 25, color: t.textMuted, fontWeight: 700 }}> / {tl.available}</span></div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
            {tl.percent}%{change !== null && <> · <span style={{ color: change >= 0 ? t.success : t.danger }}>{change >= 0 ? `up ${change}` : `down ${-change}`} point{Math.abs(change) === 1 ? '' : 's'} on your last exam</span></>}
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 6 }}>{attempt.marked_at ? `Marked ${day(attempt.marked_at)}` : 'Not finished marking'}</div>
        </div>
        <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div role="img" aria-label={`${tl.scored} marks scored, ${tl.lost} marks lost, ${tl.skipped} marks skipped, out of ${tl.available}`}
            style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden', background: t.bgHover }}>
            <div style={{ width: w(tl.scored), background: t.success }} />
            <div style={{ width: w(tl.lost), background: t.danger }} />
            <div style={{ width: w(tl.skipped), background: hatch }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, fontSize: 13.5, color: t.textSub }}>
            {key(t.success, 'Scored', tl.scored)}
            {key(t.danger, 'Answered, lost', tl.lost)}
            {key(hatch, 'Skipped', tl.skipped)}
          </div>
          {tl.skipped > 0 && (
            <div style={{ fontSize: 13.5, color: t.textMuted, lineHeight: 1.5 }}>
              Of the questions you answered, you scored <b style={{ color: t.text }}>{tl.answeredPercent}%</b>. Skipped: {blanks.slice(0, 6).join(', ')}{blanks.length > 6 ? ` and ${blanks.length - 6} more` : ''}.
            </div>
          )}
        </div>
      </section>

      <div className="ex-row">
        <section className="ex-card ex-wide" aria-labelledby="ex-byq" style={{ gap: 0 }}>
          <h2 id="ex-byq" className="ex-h" style={{ marginBottom: 10 }}>By question</h2>
          <div style={{ overflowX: 'auto', position: 'relative' }}>
            <table className="ex-table" style={{ minWidth: 460 }}>
              <thead><tr><th>Question</th><th>Topic</th><th style={{ textAlign: 'right' }}>Marks</th><th style={{ textAlign: 'right' }}>Skipped</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700 }}>{r.number}{r.title ? <span style={{ fontWeight: 500, color: t.textSub }}> · {r.title}</span> : null}</td>
                    <td style={{ color: t.textSub }}>{r.topic || '–'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>{r.scored} / {r.max}</td>
                    <td style={{ textAlign: 'right', color: r.skipped ? t.textSub : t.textMuted }}>{r.skipped || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="ex-side">
          <section className="ex-card" aria-labelledby="ex-next" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 id="ex-next" className="ex-h">What next</h2>
            {worst && worst[1].lost > 0 && <div style={{ fontSize: 13.5, color: t.textSub, lineHeight: 1.5 }}>You dropped the most marks in <b style={{ color: t.text }}>{worst[0]}</b> ({worst[1].lost} of {worst[1].max}).</div>}
            {worst && worst[1].lost > 0 && worst[0] !== 'Other' && <button type="button" className="ex-btn primary" onClick={() => newExam(`topics=${encodeURIComponent(worst[0])}`)}>New exam on {worst[0]}</button>}
            {tl.lost > 0 && <button type="button" className="ex-btn" onClick={() => newExam(`from=${attempt.id}&redo=lost`)}>New exam: questions I lost marks on</button>}
            {tl.skipped > 0 && <button type="button" className="ex-btn" onClick={() => newExam(`from=${attempt.id}&redo=skipped`)}>New exam: questions I skipped</button>}
          </section>
          {same.length > 0 && (
            <section className="ex-card" aria-labelledby="ex-attempts" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 id="ex-attempts" className="ex-h" style={{ marginBottom: 6 }}>Attempts at this exam</h2>
              {same.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '8px 0', borderTop: `1px solid ${t.border}`, fontWeight: a.id === attempt.id ? 800 : 500 }}>
                  <span>{day(a.marked_at)}</span><span>{a.scored} / {a.available} · {a.available ? Math.round((a.scored / a.available) * 100) : 0}%</span>
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </main>
  )
}
