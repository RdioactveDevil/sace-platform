import { Fragment, useEffect, useMemo, useState } from 'react'
import { ui, btn, note, FONT_B } from '../lib/adminUi'
import { confirmDialog } from '../lib/dialog'
import MathText from './MathText'
import { QuestionPanel } from './AdminQuestionPanel'
import {
  fetchSubjectQuestions, fetchHiddenQuestionIds, fetchQuestionRow, bulkEditQuestions, bulkScanQuestions,
  fetchQuestionReports, isOpenReport, editQuestion, deleteQuestion,
} from '../lib/adminDb'
import { filterSubjectQuestions, questionSource, SOURCE_FILTERS, FLAG_FILTERS, TYPE_FILTERS } from '../lib/subjectQuestions'
import { getQuestionType, QUESTION_TYPES } from '../lib/questionTypes'

const PAGE = 50
const NO_FILTERS = { text: '', topic: '', subtopic: '', type: 'all', difficulty: '', source: 'all', flag: 'any' }
const plural = (n, word) => `${n.toLocaleString('en-AU')} ${word}${n === 1 ? '' : 's'}`

/**
 * A subject's own questions: search, filter, tick and fix many at once
 * (move to a subtopic, set difficulty, hide from the subject, AI check, delete),
 * or open one to edit it. Questions borrowed from other subjects are on the
 * Borrowed questions page.
 */
export default function AdminSubjectQuestions({ curriculumId, topics = [], initialText = '', onCount }) {
  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [hidden, setHidden] = useState(() => new Set())
  const [reported, setReported] = useState(() => new Set())
  const [f, setF] = useState({ ...NO_FILTERS, text: initialText })
  const [selected, setSelected] = useState(() => new Set())
  const [shown, setShown] = useState(PAGE)
  const [openId, setOpenId] = useState(null)
  const [openRow, setOpenRow] = useState(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)

  const load = async () => {
    try {
      const [qs, hid, reps] = await Promise.all([
        fetchSubjectQuestions(curriculumId),
        fetchHiddenQuestionIds(curriculumId).catch(() => new Set()),
        fetchQuestionReports('all').catch(() => []),
      ])
      setRows(qs)
      setHidden(hid)
      setReported(new Set(reps.filter(isOpenReport).map(r => r.question_id)))
      setLoadError('')
      onCount?.(qs.length)
    } catch (e) {
      setLoadError(e.message || "The questions couldn't be loaded.")
    }
  }
  useEffect(() => { load() }, [curriculumId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setF(prev => ({ ...prev, text: initialText })) }, [initialText])
  useEffect(() => { setShown(PAGE) }, [f])

  const matching = useMemo(() => (rows ? filterSubjectQuestions(rows, f, { reported, hidden }) : []), [rows, f, reported, hidden])
  const page = matching.slice(0, shown)
  const topicNames = topics.map(t => t.name)
  const subtopicNames = f.topic ? (topics.find(t => t.name === f.topic)?.subtopics || []).map(s => s.name) : []
  const destinations = topics.flatMap(t => (t.subtopics || []).filter(s => s.id).map(s => ({ id: s.id, label: `${t.name} → ${s.name}` })))
  const filtered = Object.keys(NO_FILTERS).some(k => k !== 'text' && f[k] !== NO_FILTERS[k]) || !!f.text.trim()

  const set = (key) => (e) => setF(prev => ({ ...prev, [key]: e.target.value, ...(key === 'topic' ? { subtopic: '' } : {}) }))
  const toggle = (id) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const pageAllOn = page.length > 0 && page.every(q => selected.has(q.id))
  const togglePage = () => setSelected(prev => {
    const next = new Set(prev)
    page.forEach(q => (pageAllOn ? next.delete(q.id) : next.add(q.id)))
    return next
  })
  const ids = [...selected]
  const allHidden = ids.length > 0 && ids.every(id => hidden.has(id))

  const run = async (key, fn) => {
    setBusy(key); setNotice(null)
    try { await fn() } catch (e) { setNotice({ ok: false, text: e.message || "That didn't work." }) }
    setBusy('')
  }
  const bulk = (action, extra, done) => run(action, async () => {
    const r = await bulkEditQuestions({ curriculumId, ids, action, ...extra })
    const left = r.skipped ? ` ${plural(r.skipped, 'question')} from another subject ${r.skipped === 1 ? 'was' : 'were'} left alone.` : ''
    setNotice({ ok: true, text: `${done(r.changed)}${left}` })
    setSelected(new Set())
    if (action === 'delete' && ids.includes(openId)) setOpenId(null)
    await load()
  })

  const move = async (e) => {
    const dest = destinations.find(d => d.id === e.target.value)
    e.target.value = ''
    if (!dest) return
    if (!(await confirmDialog(`Move ${plural(ids.length, 'question')} to ${dest.label}?`, { confirm: 'Move' }))) return
    bulk('move', { subtopicId: dest.id }, n => `Moved ${plural(n, 'question')} to ${dest.label}.`)
  }
  const setDifficulty = async (e) => {
    const d = Number(e.target.value)
    e.target.value = ''
    if (!d) return
    bulk('difficulty', { difficulty: d }, n => `Set ${plural(n, 'question')} to level ${d}.`)
  }
  const hideOrShow = () => (allHidden
    ? bulk('unhide', {}, n => `${plural(n, 'question')} shown to students again.`)
    : bulk('hide', {}, n => `${plural(n, 'question')} hidden from this subject. Students won't get them; they stay in the bank.`))
  const remove = async () => {
    if (!(await confirmDialog(`Delete ${plural(ids.length, 'question')} from the bank? Students' history on them goes too. This can't be undone.`, { confirm: 'Delete', danger: true }))) return
    bulk('delete', {}, n => `Deleted ${plural(n, 'question')}.`)
  }
  // The AI check, 10 questions a request so each finishes in time.
  const check = () => run('check', async () => {
    let done = 0
    for (let i = 0; i < ids.length; i += 10) {
      setNotice({ ok: true, text: `Checking ${Math.min(i + 10, ids.length)} of ${ids.length}…` })
      const r = await bulkScanQuestions({ ids: ids.slice(i, i + 10) })
      done += r.queued || 0
    }
    setNotice({ ok: true, text: `Checked ${plural(done, 'question')}. Anything wrong was fixed, or is waiting in Reports.${done < ids.length ? ` ${ids.length - done} were already being checked.` : ''}` })
    setSelected(new Set())
    await load()
  })

  const openQuestion = async (id) => {
    if (openId === id) { setOpenId(null); return }
    setOpenId(id); setOpenRow(null)
    try { setOpenRow(await fetchQuestionRow(id)) } catch { setOpenRow(null) }
  }
  const refreshOpen = async () => {
    const row = await fetchQuestionRow(openId)
    setOpenRow(row)
    setRows(prev => (row ? prev.map(q => (q.id === row.id ? { ...q, ...row } : q)) : prev.filter(q => q.id !== openId)))
    if (!row) setOpenId(null)
  }

  if (loadError) return <div role="alert" style={note('danger')}>{loadError}</div>
  if (!rows) return <div style={{ ...ui.hint, padding: 8 }}>Loading questions…</div>

  const select = { ...ui.input, padding: '7px 10px', fontSize: 12.5, maxWidth: 230 }
  const tag = (bg, color) => ({ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: bg, color, marginRight: 4, whiteSpace: 'nowrap' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT_B }}>
      <style>{`
        .sq-row:hover td { background: var(--t-bgHover); }
        .sq-q { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .sq-open { all: unset; cursor: pointer; display: block; color: var(--t-text); font-weight: 600; }
        .sq-open:focus-visible { outline: 2px solid var(--t-accent); outline-offset: 2px; border-radius: 4px; }
      `}</style>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" value={f.text} onChange={set('text')} placeholder="Search words or a question ID" aria-label="Search questions"
          style={{ ...ui.input, flex: '1 1 220px', minWidth: 180 }} />
        <select value={f.topic} onChange={set('topic')} aria-label="Topic" style={select}>
          <option value="">All topics</option>
          {topicNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        {f.topic && (
          <select value={f.subtopic} onChange={set('subtopic')} aria-label="Subtopic" style={select}>
            <option value="">All subtopics</option>
            {subtopicNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        <select value={f.type} onChange={set('type')} aria-label="Type" style={select}>
          {TYPE_FILTERS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={f.difficulty} onChange={set('difficulty')} aria-label="Difficulty" style={select}>
          <option value="">Any level</option>
          {[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>Level {d}</option>)}
        </select>
        <select value={f.source} onChange={set('source')} aria-label="Source" style={select}>
          {SOURCE_FILTERS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={f.flag} onChange={set('flag')} aria-label="Status" style={select}>
          {FLAG_FILTERS.map(([id, label]) => <option key={id} value={id}>{label}{id === 'reported' && reported.size ? ` (${[...reported].filter(id => rows.some(q => q.id === id)).length})` : ''}</option>)}
        </select>
        {filtered && <button type="button" onClick={() => setF(NO_FILTERS)} style={{ ...btn('secondary'), padding: '7px 11px', fontSize: 12.5 }}>Clear</button>}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--t-textMuted)' }}>
          {filtered ? `${matching.length.toLocaleString('en-AU')} of ${plural(rows.length, 'question')}` : plural(rows.length, 'question')}
        </span>
      </div>

      {selected.size > 0 && (
        <div role="toolbar" aria-label="Change the ticked questions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '9px 12px', borderRadius: 11, background: '#0c1037', color: '#ffffff', border: '1px solid rgba(255,255,255,0.12)', position: 'sticky', top: 0, zIndex: 2 }}>
          <strong style={{ fontSize: 13.5 }}>{selected.size.toLocaleString('en-AU')} ticked</strong>
          {matching.length > selected.size && (
            <button type="button" onClick={() => setSelected(new Set(matching.map(q => q.id)))} style={linkBtn}>Tick all {matching.length.toLocaleString('en-AU')} matching</button>
          )}
          <button type="button" onClick={() => setSelected(new Set())} style={linkBtn}>Clear</button>
          <span style={{ flex: 1 }} />
          <select onChange={move} disabled={!!busy} defaultValue="" aria-label="Move to subtopic" style={barSelect}>
            <option value="" disabled style={opt}>Move to subtopic…</option>
            {destinations.map(d => <option key={d.id} value={d.id} style={opt}>{d.label}</option>)}
          </select>
          <select onChange={setDifficulty} disabled={!!busy} defaultValue="" aria-label="Set difficulty" style={barSelect}>
            <option value="" disabled style={opt}>Set difficulty…</option>
            {[1, 2, 3, 4, 5].map(d => <option key={d} value={d} style={opt}>Level {d}</option>)}
          </select>
          <button type="button" onClick={hideOrShow} disabled={!!busy} style={barBtn}>{allHidden ? 'Show to students' : 'Hide from subject'}</button>
          <button type="button" onClick={check} disabled={!!busy} style={{ ...barBtn, background: 'var(--t-accent)', color: '#0c1037' }}>{busy === 'check' ? 'Checking…' : 'AI check & fix'}</button>
          <button type="button" onClick={remove} disabled={!!busy} style={{ ...barBtn, background: 'rgba(220,38,38,0.25)', color: '#fecaca' }}>Delete</button>
        </div>
      )}

      {notice && <div role="status" style={note(notice.ok ? 'success' : 'danger')}>{notice.text}</div>}

      {!matching.length ? (
        <div style={ui.empty}>
          {rows.length ? 'No questions match these filters.' : 'This subject has no questions yet. Add some from Add questions, or write them from Topics.'}
          {filtered && <div style={{ marginTop: 10 }}><button type="button" onClick={() => setF(NO_FILTERS)} style={btn('secondary')}>Clear filters</button></div>}
        </div>
      ) : (
        <div style={{ ...ui.card, overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ ...ui.th, width: 40 }}>
                  <input type="checkbox" checked={pageAllOn} onChange={togglePage} aria-label="Tick every question shown" />
                </th>
                <th style={ui.th}>Question</th>
                <th style={{ ...ui.th, width: '24%' }}>Subtopic</th>
                <th style={{ ...ui.th, width: 108 }}>Level</th>
              </tr>
            </thead>
            <tbody>
              {page.map(q => {
                const on = selected.has(q.id)
                const src = questionSource(q)
                const cell = { ...ui.td, verticalAlign: 'top', background: on ? 'rgba(241,190,67,0.12)' : undefined }
                const level = Math.max(0, Math.min(5, q.difficulty || 0))
                return (
                  <Fragment key={q.id}>
                    <tr className="sq-row">
                      <td style={cell}>
                        <input type="checkbox" checked={on} onChange={() => toggle(q.id)} aria-label={`Tick question ${q.id}`} />
                      </td>
                      <td style={cell}>
                        <button type="button" className="sq-open" onClick={() => openQuestion(q.id)} aria-expanded={openId === q.id}>
                          <span className="sq-q"><MathText text={q.question || ''} /></span>
                        </button>
                        <div style={{ marginTop: 5, fontSize: 12, color: 'var(--t-textMuted)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                          <span>{QUESTION_TYPES[getQuestionType(q)].label}</span>
                          <span aria-hidden="true">·</span>
                          {src === 'paper'
                            ? <span style={tag('rgba(241,190,67,0.2)', 'var(--t-goldText)')}>{q.source || 'Past paper'}</span>
                            : <span>{src === 'ai' ? 'Written by AI' : q.source}</span>}
                          {reported.has(q.id) && <span style={{ ...tag('var(--t-dangerBg)', 'var(--t-danger)'), marginLeft: 4 }}>Reported</span>}
                          {hidden.has(q.id) && <span style={{ ...tag('var(--t-bgHover)', 'var(--t-textMuted)'), marginLeft: 4 }}>Hidden</span>}
                        </div>
                      </td>
                      <td style={{ ...cell, fontSize: 12.5 }}>{q.subtopic || <span style={{ color: 'var(--t-textFaint)' }}>None</span>}</td>
                      <td style={{ ...cell, color: 'var(--t-goldText)', letterSpacing: 1, whiteSpace: 'nowrap' }} title={`Level ${q.difficulty || '?'}`}>
                        {'★'.repeat(level)}<span style={{ opacity: 0.25 }}>{'★'.repeat(5 - level)}</span>
                      </td>
                    </tr>
                    {openId === q.id && (
                      <tr>
                        <td colSpan={4} style={{ ...ui.td, background: 'var(--t-bgSubtle)', padding: 16 }}>
                          {openRow ? (
                            <QuestionPanel key={openRow.id} questionId={openRow.id} q={openRow} busy={busy} open
                              meta={`${openRow.id} · ${[openRow.topic, openRow.subtopic].filter(Boolean).join(' → ')}`}
                              onEdit={(fields) => run('edit', async () => { await editQuestion(openRow.id, fields); setNotice({ ok: true, text: 'Saved.' }); await refreshOpen() })}
                              onDelete={() => run('delete', async () => { await deleteQuestion(openRow.id); setNotice({ ok: true, text: 'Removed from the bank.' }); setOpenId(null); await load() })}
                            />
                          ) : <span style={ui.hint}>Loading the question…</span>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {matching.length > shown && (
            <div style={{ padding: 12, textAlign: 'center' }}>
              <button type="button" onClick={() => setShown(n => n + PAGE)} style={btn('secondary')}>
                Show {Math.min(PAGE, matching.length - shown)} more ({(matching.length - shown).toLocaleString('en-AU')} left)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const linkBtn = { background: 'none', border: 'none', padding: 0, color: 'inherit', opacity: 0.85, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_B, fontSize: 13 }
const barBtn = { padding: '6px 11px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.12)', color: 'inherit', fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const barSelect = { ...barBtn, appearance: 'auto', maxWidth: 220 }
const opt = { color: '#0c1037', background: '#ffffff' }
