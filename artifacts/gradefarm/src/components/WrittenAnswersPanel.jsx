import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { generateMarkedQuestions, generateMarkedForSubtopic } from '../lib/db'
import { deleteQuestion } from '../lib/adminDb'
import { markingScheme, totalMarks } from '../lib/questionTypes'
import { ui, btn, note, FONT_B } from '../lib/adminUi'
import MathText from './MathText'
import DiagramView from './DiagramView'
import TableView from './TableView'

// The app's current theme (App sets it on <html>), for the structure and graph previews.
const pageTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

// Subtopics written at once in "Generate for every subtopic".
const BULK_CONCURRENCY = 2

/**
 * Admin › Curricula › subject: written-answer questions, marked by AI against
 * a marking scheme. Write and check a few for a subtopic, look them over, and
 * remove any that aren't right. Students only see them once "Written answers"
 * is switched on in Student features.
 */
export default function WrittenAnswersPanel({ curriculumId, topics, enabled }) {
  const subtopics = useMemo(() => (topics || []).flatMap(t =>
    (t.subtopics || []).filter(s => s.id).map(s => ({ id: s.id, label: `${t.name} → ${s.name}` }))), [topics])
  const [subtopicId, setSubtopicId] = useState('')
  const [count, setCount] = useState(3)
  const [difficulty, setDifficulty] = useState('mixed')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const [error, setError] = useState('')
  const [questions, setQuestions] = useState(null)
  const [openId, setOpenId] = useState(null)
  // Every subtopic at once: how many each, whether to skip ones that have some, and the run's progress.
  const [bulkPer, setBulkPer] = useState(3)
  const [skipExisting, setSkipExisting] = useState(true)
  const [bulk, setBulk] = useState(null) // { running, total, done, saved, notSaved, failed: [label] }
  const stopRef = useRef(false)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('questions')
      .select('id, topic, subtopic, subtopic_id, question, total_marks, marking_scheme, solution, difficulty, diagram, table_data, created_at')
      .eq('curriculum_id', curriculumId).eq('question_type', 'marked')
      .order('created_at', { ascending: false }).limit(1000)
    if (e) { setQuestions([]); setError(e.message); return }
    setQuestions(data || [])
  }, [curriculumId])
  useEffect(() => { load() }, [load])

  // Leaving the page stops a whole-subject run, so ask first.
  const bulkRunning = !!bulk?.running
  useEffect(() => {
    if (!bulkRunning) return
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [bulkRunning])

  const generate = async () => {
    if (!subtopicId || busy) return
    setBusy(true); setError(''); setOutcome(null)
    try {
      const res = await generateMarkedQuestions(subtopicId, { count, difficulty: difficulty === 'mixed' ? 'mixed' : Number(difficulty) })
      setOutcome(res)
      await load()
    } catch (e) {
      setError(e.message || 'Generating the questions failed.')
    }
    setBusy(false)
  }

  // Written answers already in the bank, by subtopic id.
  const haveBySubtopic = useMemo(() => {
    const m = new Map()
    for (const q of questions || []) if (q.subtopic_id) m.set(q.subtopic_id, (m.get(q.subtopic_id) || 0) + 1)
    return m
  }, [questions])
  const bulkTargets = subtopics.filter(s => !skipExisting || !haveBySubtopic.get(s.id))

  const generateAll = async () => {
    if (busy || bulk?.running || bulkTargets.length === 0) return
    const queue = [...bulkTargets]
    if (!window.confirm(`Write ${bulkPer} written-answer question${bulkPer === 1 ? '' : 's'} for each of ${queue.length} subtopic${queue.length === 1 ? '' : 's'} (${queue.length * bulkPer} in all)? They cost a few cents each and take a minute or more per subtopic. Keep this page open.`)) return
    stopRef.current = false
    setError(''); setOutcome(null)
    setBulk({ running: true, total: queue.length, done: 0, saved: 0, notSaved: 0, failed: [] })
    let next = 0
    const worker = async () => {
      while (!stopRef.current && next < queue.length) {
        const sub = queue[next++]
        const r = await generateMarkedForSubtopic(sub.id, bulkPer, { shouldStop: () => stopRef.current })
        setBulk(b => ({
          ...b, done: b.done + 1, saved: b.saved + r.saved, notSaved: b.notSaved + r.rejected.length,
          failed: r.error ? [...b.failed, sub.label] : b.failed,
        }))
      }
    }
    await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, queue.length) }, worker))
    setBulk(b => ({ ...b, running: false, stopped: stopRef.current }))
    await load()
  }

  const remove = async (id) => {
    if (!window.confirm('Remove this question from the bank? Students’ marks for it go too.')) return
    try {
      await deleteQuestion(id)
      setQuestions(prev => prev.filter(q => q.id !== id))
    } catch (e) { setError(e.message || 'Could not remove it.') }
  }

  const select = { ...ui.input, padding: '7px 10px' }

  return (
    <div style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 10, background: 'var(--t-bgCard)', border: '1px solid var(--t-border)' }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--t-text)', marginBottom: 4 }}>
        Written answers{questions ? ` · ${questions.length}` : ''}
      </div>
      <div style={{ ...ui.hint, marginBottom: 12 }}>
        Short-answer questions worth 2–6 marks, each with a marking scheme and a model answer. Students write their answer and the AI marks it
        point by point, quoting what earned each mark. Each new question is checked twice before it’s saved: the chemistry and scheme are reviewed,
        and the model answer has to earn full marks from the marker.{' '}
        {enabled
          ? <strong style={{ color: 'var(--t-text)' }}>Students can see these (switched on in Student features).</strong>
          : <strong style={{ color: 'var(--t-text)' }}>Students can’t see these yet. Switch on Written answers in Student features when you’re happy with them.</strong>}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select aria-label="Subtopic" value={subtopicId} onChange={e => setSubtopicId(e.target.value)} disabled={busy} style={{ ...select, flex: '1 1 260px', minWidth: 0 }}>
          <option value="">Choose a subtopic…</option>
          {subtopics.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select aria-label="How many" value={count} onChange={e => setCount(Number(e.target.value))} disabled={busy} style={select}>
          {[1, 2, 3].map(n => <option key={n} value={n}>{n} question{n === 1 ? '' : 's'}</option>)}
        </select>
        <select aria-label="Difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value)} disabled={busy} style={select}>
          <option value="mixed">Mixed difficulty</option>
          {[2, 3, 4, 5].map(n => <option key={n} value={n}>Difficulty {n}</option>)}
        </select>
        <button type="button" onClick={generate} disabled={!subtopicId || busy || bulk?.running} style={btn('primary', !subtopicId || busy || bulk?.running)}>
          {busy ? 'Writing and checking…' : 'Generate'}
        </button>
      </div>
      {busy && <div style={{ ...ui.hint, marginTop: 8 }}>This takes one to three minutes. Keep this page open.</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--t-border)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>Every subtopic</span>
        <select aria-label="How many per subtopic" value={bulkPer} onChange={e => setBulkPer(Number(e.target.value))} disabled={bulk?.running} style={select}>
          {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} each</option>)}
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--t-textMuted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={skipExisting} onChange={e => setSkipExisting(e.target.checked)} disabled={bulk?.running} style={{ accentColor: 'var(--t-text)' }} />
          Skip subtopics that already have some
        </label>
        {bulk?.running ? (
          <button type="button" onClick={() => { stopRef.current = true }} style={btn('secondary')}>Stop</button>
        ) : (
          <button type="button" onClick={generateAll} disabled={busy || bulkTargets.length === 0} style={btn('primary', busy || bulkTargets.length === 0)}>
            Generate for {bulkTargets.length} subtopic{bulkTargets.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
      {bulk && (
        <div role="status" style={{ ...note(bulk.running ? 'info' : bulk.failed.length ? 'danger' : 'success'), marginTop: 10 }}>
          {bulk.running
            ? `${bulk.done} of ${bulk.total} subtopics done · ${bulk.saved} saved${bulk.notSaved ? ` · ${bulk.notSaved} didn't pass the checks` : ''}. Keep this page open.`
            : `${bulk.stopped ? 'Stopped. ' : ''}${bulk.saved} saved across ${bulk.done} subtopic${bulk.done === 1 ? '' : 's'}${bulk.notSaved ? `; ${bulk.notSaved} didn't pass the checks` : ''}.`}
          {bulk.failed.length > 0 && <div style={{ marginTop: 4 }}>Couldn’t finish: {bulk.failed.join(', ')}. Run it again with “Skip subtopics that already have some” to fill gaps.</div>}
        </div>
      )}

      {outcome && (
        <div style={{ ...note(outcome.saved?.length ? 'success' : 'info'), marginTop: 10 }}>
          {outcome.saved?.length ? `Saved ${outcome.saved.length} question${outcome.saved.length === 1 ? '' : 's'}.` : 'No questions were saved.'}
          {outcome.rejected?.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {outcome.rejected.map((r, i) => <li key={i}>Not saved: {r.reason}</li>)}
            </ul>
          )}
        </div>
      )}
      {error && <div role="alert" style={{ ...note('danger'), marginTop: 10 }}>{error}</div>}

      {questions && questions.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {questions.map(q => {
            const open = openId === q.id
            const scheme = markingScheme(q)
            return (
              <div key={q.id} style={{ border: '1px solid var(--t-border)', borderRadius: 9, background: 'var(--t-bg)' }}>
                <button type="button" onClick={() => setOpenId(open ? null : q.id)} aria-expanded={open}
                  style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'baseline', textAlign: 'left', padding: '9px 11px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: FONT_B }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--t-textMuted)', whiteSpace: 'nowrap' }}>{totalMarks(q)} marks</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--t-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.subtopic} · {q.question}</span>
                </button>
                {open && (
                  <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--t-textSub)', lineHeight: 1.6 }}>
                    <div style={{ color: 'var(--t-text)' }}><MathText text={q.question} /></div>
                    {q.table_data && <TableView table={q.table_data} theme={pageTheme()} />}
                    {q.diagram && <DiagramView diagram={q.diagram} theme={pageTheme()} />}
                    <div>
                      <div style={ui.label}>Marking scheme</div>
                      <ol style={{ margin: 0, paddingLeft: 20 }}>
                        {scheme.map((p, i) => (
                          <li key={i} style={{ marginBottom: 4 }}>
                            <strong style={{ color: 'var(--t-text)' }}>[{p.marks}]</strong> <MathText text={p.point} />
                            {p.guidance && <div style={{ fontSize: 12, color: 'var(--t-textMuted)' }}><MathText text={p.guidance} /></div>}
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div>
                      <div style={ui.label}>Model answer</div>
                      <MathText text={q.solution || ''} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => remove(q.id)} style={btn('danger')}>Remove</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
