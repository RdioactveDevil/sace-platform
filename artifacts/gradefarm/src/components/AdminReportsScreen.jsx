import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  fetchQuestionReports, bulkScanQuestions, retryPendingReports, resolveQuestionReport, isOpenReport,
  fetchQuestionFlags, clearQuestionFlags, editQuestion, deleteQuestion,
} from '../lib/adminDb'
import { fetchLiveCurricula } from '../lib/curriculaDb'
import { ui, chip, btn, note, FONT_B } from '../lib/adminUi'
import MathText from './MathText'

const LETTERS = 'ABCDEFGH'
const FLAG_TAGS = ['Typo', 'Confusing', 'Too hard', 'Too easy']

// What happened to a report, in words.
const OUTCOME = {
  pending:     'Waiting for the AI check',
  processing:  'AI check running',
  dismissed:   'Question was right',
  fixed_index: 'Answer key fixed',
  edited:      'Question edited',
  regenerated: 'Question replaced',
  deleted:     'Question removed',
  error:       'AI check failed',
}
const STATUS = [
  ['open', 'Open'],
  ['fixed', 'Fixed'],
  ['dismissed', 'Dismissed'],
  ['all', 'All'],
]
const inStatus = (r, f) =>
  f === 'all' ? true
  : f === 'open' ? isOpenReport(r)
  : f === 'fixed' ? ['fixed_index', 'edited', 'regenerated', 'deleted'].includes(r.ai_status)
  : r.ai_status === 'dismissed'

const parseOptions = (o) => {
  if (Array.isArray(o)) return o
  try { return JSON.parse(o) || [] } catch { return [] }
}
const ago = (iso) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 31 ? `${days}d ago` : new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })

/**
 * Admin › Reports, in two views:
 * - Wrong answers: questions a student reported with "Wrong answer", plus
 *   questions an admin asked the AI to check. The AI checks each one; anything
 *   it couldn't settle stays open for a person.
 * - Student flags: questions students tagged Typo, Confusing, Too hard or
 *   Too easy.
 * A question opens beside the list with its answer key, what students picked,
 * and the buttons that settle it: set the answer, edit it, remove it.
 */
export default function AdminReportsScreen({ onChange }) {
  const location = useLocation()
  const [view, setView] = useState(() => (new URLSearchParams(location.search).get('view') === 'flags' ? 'flags' : 'reports'))
  const [reports, setReports] = useState(null)
  const [flags, setFlags] = useState(null)
  const [error, setError] = useState('')

  const loadReports = useCallback(() => fetchQuestionReports('all').then(setReports).catch(e => { setReports([]); setError(e.message || 'Could not load reports.') }), [])
  const loadFlags = useCallback(() => fetchQuestionFlags().then(setFlags).catch(e => { setFlags([]); setError(e.message || 'Could not load flags.') }), [])
  useEffect(() => { loadReports(); loadFlags() }, [loadReports, loadFlags])

  const openCount = reports ? new Set(reports.filter(isOpenReport).map(r => r.question_id)).size : null
  const segOn = { background: 'var(--t-text)', color: 'var(--t-bg)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT_B }}>
      <style>{`
        .rp-layout { display: grid; grid-template-columns: minmax(260px, 360px) minmax(0, 1fr); gap: 16px; align-items: start; }
        .rp-item:hover { background: var(--t-bgHover); }
        .rp-item:focus-visible { outline: 2px solid var(--t-accent); outline-offset: -2px; }
        @media (max-width: 900px) { .rp-layout { grid-template-columns: minmax(0, 1fr); } }
      `}</style>

      <div role="group" aria-label="View" style={{ display: 'inline-flex', alignSelf: 'flex-start', border: '1px solid var(--t-border)', borderRadius: 9, overflow: 'hidden' }}>
        {[['reports', 'Wrong answers', openCount], ['flags', 'Student flags', flags?.length]].map(([id, label, n]) => (
          <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
            style={{ padding: '7px 14px', border: 'none', fontFamily: FONT_B, fontSize: 13, fontWeight: 700, cursor: 'pointer', ...(view === id ? segOn : { background: 'var(--t-bgCard)', color: 'var(--t-textMuted)' }) }}>
            {label}{n ? <span style={{ marginLeft: 6, fontWeight: 600, opacity: 0.75 }}>{n}</span> : null}
          </button>
        ))}
      </div>
      {error && <div role="alert" style={note('danger')}>{error}</div>}

      {view === 'reports'
        ? <ReportsView reports={reports} reload={async () => { await loadReports(); onChange?.() }} />
        : <FlagsView flags={flags} reload={loadFlags} />}
    </div>
  )
}

// ── Wrong-answer reports ──────────────────────────────────────────────────────

function ReportsView({ reports, reload }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState('open')
  const [source, setSource] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null) // { ok, text }
  const [subjects, setSubjects] = useState([])
  const [scanSubject, setScanSubject] = useState('')
  useEffect(() => { fetchLiveCurricula().then(cs => setSubjects([...new Set(cs.map(c => c.name))].sort())).catch(() => {}) }, [])

  // One row per question: its newest report, and how many reports it has here.
  const rows = useMemo(() => {
    const list = (reports || []).filter(r => inStatus(r, status) && (source === 'all' || r.source === source))
    const byQ = new Map()
    for (const r of list) {
      const e = byQ.get(r.question_id)
      if (!e) byQ.set(r.question_id, { ...r, times: 1, reporters: r.reporter?.name && r.source === 'student' ? [r.reporter.name] : [] })
      else {
        e.times++
        if (r.reporter?.name && r.source === 'student' && !e.reporters.includes(r.reporter.name)) e.reporters.push(r.reporter.name)
      }
    }
    return [...byQ.values()]
  }, [reports, status, source])
  const counts = useMemo(() => Object.fromEntries(STATUS.map(([f]) => [f, new Set((reports || []).filter(r => inStatus(r, f) && (source === 'all' || r.source === source)).map(r => r.question_id)).size])), [reports, source])
  const selected = rows.find(r => r.id === selectedId) || rows[0] || null

  const run = async (key, fn, okText) => {
    setBusy(key); setNotice(null)
    let ok = false
    try {
      const res = await fn()
      setNotice({ ok: true, text: typeof okText === 'function' ? okText(res) : okText })
      ok = true
      await reload()
    } catch (e) { setNotice({ ok: false, text: e.message || 'That didn’t work.' }) }
    setBusy('')
    return ok
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div role="group" aria-label="Status" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUS.map(([f, label]) => (
            <button key={f} type="button" aria-pressed={status === f} onClick={() => setStatus(f)} style={chip(status === f)}>{label} · {counts[f] ?? 0}</button>
          ))}
        </div>
        <select aria-label="Reported by" value={source} onChange={e => setSource(e.target.value)} style={{ ...ui.input, padding: '6px 9px', fontSize: 12.5 }}>
          <option value="all">Students and AI checks</option>
          <option value="student">From students</option>
          <option value="check">From AI checks</option>
        </select>
      </div>

      <div style={{ ...ui.card, padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--t-textSub)', flex: '1 1 220px' }}>Ask the AI to check questions from the bank for wrong answers.</span>
        <select aria-label="Subject to check" value={scanSubject} onChange={e => setScanSubject(e.target.value)} style={{ ...ui.input, padding: '6px 9px', fontSize: 12.5, maxWidth: 240 }}>
          <option value="">Any subject</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" disabled={!!busy} style={btn('secondary', !!busy)}
          onClick={() => run('scan', () => bulkScanQuestions({ subject: scanSubject || undefined, limit: 50 }), r => r.queued ? `Checked ${r.queued} question${r.queued === 1 ? '' : 's'}. Any it found wrong are fixed or open below.` : 'Nothing left to check there.')}>
          {busy === 'scan' ? 'Checking 50 questions…' : 'Check 50 questions'}
        </button>
        <button type="button" disabled={!!busy} style={btn('secondary', !!busy)} title="Run the AI check again on reports that got stuck or failed"
          onClick={() => run('retry', () => retryPendingReports({ limit: 20 }), r => r.retried ? `Checked ${r.retried} stuck report${r.retried === 1 ? '' : 's'} again.` : 'No stuck reports.')}>
          {busy === 'retry' ? 'Retrying…' : 'Retry stuck checks'}
        </button>
      </div>
      {notice && <div role="status" style={{ fontSize: 13, fontWeight: 600, color: notice.ok ? 'var(--t-success)' : 'var(--t-danger)' }}>{notice.text}</div>}

      {reports == null ? (
        <div style={{ padding: 24, color: 'var(--t-textMuted)', fontSize: 13 }}>Loading reports…</div>
      ) : rows.length === 0 ? (
        <div style={ui.empty}>
          {status === 'open' ? 'No open reports. When a student taps “Wrong answer”, the AI checks the question, and anything it can’t settle shows up here.' : 'No reports here.'}
        </div>
      ) : (
        <div className="rp-layout">
          <div role="listbox" aria-label="Reported questions" style={{ ...ui.card, overflow: 'hidden', maxHeight: 680, overflowY: 'auto' }}>
            {rows.map(r => {
              const q = r.questions
              const on = selected?.id === r.id
              return (
                <ListItem key={r.id} on={on} onSelect={() => setSelectedId(r.id)}
                  title={q?.subtopic || q?.topic || 'Question removed'} when={ago(r.reported_at)}
                  sub={[q?.subject, r.source === 'check' ? 'AI check' : r.times > 1 ? `${r.times} reports` : 'Student report', OUTCOME[r.ai_status] || r.ai_status].filter(Boolean).join(' · ')}
                  danger={r.ai_status === 'error'} />
              )
            })}
          </div>
          {selected && (
            <QuestionPanel key={selected.id} questionId={selected.question_id} q={selected.questions} busy={busy}
              meta={<>
                {[selected.questions?.subject, selected.questions?.topic, selected.questions?.subtopic].filter(Boolean).join(' · ') || 'This question is no longer in the bank.'}
                {' · '}{selected.source === 'check'
                  ? `AI check ${shortDate(selected.reported_at)}`
                  : `Reported ${shortDate(selected.reported_at)}${selected.reporters.length ? ` by ${selected.reporters.join(', ')}` : ''}${selected.times > 1 ? ` (${selected.times} times)` : ''}`}
              </>}
              reporterId={selected.source === 'student' ? selected.reported_by : null}
              reporterName={selected.reporter?.name}
              outcome={(selected.ai_verdict?.explanation || selected.resolution_note) && (
                <><span style={{ fontWeight: 700, color: 'var(--t-text)' }}>{OUTCOME[selected.ai_status] || selected.ai_status}.</span>{' '}{selected.ai_verdict?.explanation || selected.resolution_note}</>
              )}
              open={isOpenReport(selected)}
              onSetAnswer={(i) => run('set_answer', () => resolveQuestionReport(selected.id, 'set_answer', { answerIndex: i }), `Answer set to ${LETTERS[i]}. Check the worked solution still matches.`)}
              onDismiss={() => run('dismiss', () => resolveQuestionReport(selected.id, 'dismiss'), 'Dismissed. The question stays as it is.')}
              onRecheck={() => run('recheck', () => resolveQuestionReport(selected.id, 'recheck'), 'Checked again.')}
              onEdit={(fields) => run('edit', () => resolveQuestionReport(selected.id, 'edit', fields), 'Saved. The report is closed.')}
              onDelete={() => run('delete', () => resolveQuestionReport(selected.id, 'delete'), 'Removed from the bank.')}
              onPreview={() => navigate(`/admin/questions?tab=preview&id=${encodeURIComponent(selected.question_id)}`)} />
          )}
        </div>
      )}
    </>
  )
}

// ── Student flags ─────────────────────────────────────────────────────────────

function FlagsView({ flags, reload }) {
  const navigate = useNavigate()
  const [tag, setTag] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)

  const rows = useMemo(() => (flags || []).filter(f => tag === 'all' || f.counts[tag]), [flags, tag])
  const tagCounts = useMemo(() => Object.fromEntries(FLAG_TAGS.map(t => [t, (flags || []).filter(f => f.counts[t]).length])), [flags])
  const selected = rows.find(f => f.question_id === selectedId) || rows[0] || null

  const run = async (key, fn, okText) => {
    setBusy(key); setNotice(null)
    let ok = false
    try { await fn(); setNotice({ ok: true, text: okText }); ok = true; await reload() }
    catch (e) { setNotice({ ok: false, text: e.message || 'That didn’t work.' }) }
    setBusy('')
    return ok
  }
  const flagLine = (f) => FLAG_TAGS.filter(t => f.counts[t]).map(t => `${t}${f.counts[t] > 1 ? ` ×${f.counts[t]}` : ''}`).join(', ')

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div role="group" aria-label="Flag" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" aria-pressed={tag === 'all'} onClick={() => setTag('all')} style={chip(tag === 'all')}>All · {flags?.length ?? 0}</button>
          {FLAG_TAGS.map(t => (
            <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(t)} style={chip(tag === t)}>{t} · {tagCounts[t] ?? 0}</button>
          ))}
        </div>
        <span style={ui.hint}>Students tag questions while practising. Typo and Confusing usually mean the question needs editing.</span>
      </div>
      {notice && <div role="status" style={{ fontSize: 13, fontWeight: 600, color: notice.ok ? 'var(--t-success)' : 'var(--t-danger)' }}>{notice.text}</div>}

      {flags == null ? (
        <div style={{ padding: 24, color: 'var(--t-textMuted)', fontSize: 13 }}>Loading flags…</div>
      ) : rows.length === 0 ? (
        <div style={ui.empty}>No flagged questions{tag === 'all' ? '' : ` tagged ${tag}`}.</div>
      ) : (
        <div className="rp-layout">
          <div role="listbox" aria-label="Flagged questions" style={{ ...ui.card, overflow: 'hidden', maxHeight: 680, overflowY: 'auto' }}>
            {rows.map(f => (
              <ListItem key={f.question_id} on={selected?.question_id === f.question_id} onSelect={() => setSelectedId(f.question_id)}
                title={f.questions?.subtopic || f.questions?.topic || 'Question removed'} when={ago(f.last_at)}
                sub={[f.questions?.subject, flagLine(f)].filter(Boolean).join(' · ')} />
            ))}
          </div>
          {selected && (
            <QuestionPanel key={selected.question_id} questionId={selected.question_id} q={selected.questions} busy={busy}
              meta={<>{[selected.questions?.subject, selected.questions?.topic, selected.questions?.subtopic].filter(Boolean).join(' · ') || 'This question is no longer in the bank.'} · Flagged {flagLine(selected)}</>}
              open
              onSetAnswer={(i) => run('set_answer', () => editQuestion(selected.question_id, { answerIndex: i }), `Answer set to ${LETTERS[i]}. Check the worked solution still matches.`)}
              onEdit={(fields) => run('edit', async () => { await editQuestion(selected.question_id, fields); await clearQuestionFlags(selected.question_id) }, 'Saved, and its flags are cleared.')}
              onDelete={() => run('delete', () => deleteQuestion(selected.question_id), 'Removed from the bank.')}
              onClearFlags={() => run('clear', () => clearQuestionFlags(selected.question_id), 'Flags cleared. The question stays as it is.')}
              onPreview={() => navigate(`/admin/questions?tab=preview&id=${encodeURIComponent(selected.question_id)}`)} />
          )}
        </div>
      )}
    </>
  )
}

// ── Shared pieces ─────────────────────────────────────────────────────────────

function ListItem({ on, onSelect, title, when, sub, danger }) {
  return (
    <div role="option" aria-selected={on} tabIndex={0} className="rp-item"
      onClick={onSelect} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      style={{ padding: '11px 14px', borderBottom: '1px solid var(--t-border)', cursor: 'pointer', background: on ? 'var(--t-bgSubtle)' : 'transparent', boxShadow: on ? 'inset 2px 0 0 var(--t-text)' : 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--t-textFaint)', flexShrink: 0 }}>{when}</span>
      </div>
      <div style={{ fontSize: 12, color: danger ? 'var(--t-danger)' : 'var(--t-textMuted)' }}>{sub}</div>
    </div>
  )
}

/**
 * A question with its answer key and what students picked, and the ways to
 * settle it. Only the handlers passed in show as buttons.
 */
function QuestionPanel({ questionId, q, meta, outcome, open, busy, reporterId, reporterName, onSetAnswer, onDismiss, onRecheck, onEdit, onDelete, onClearFlags, onPreview }) {
  const options = parseOptions(q?.options)
  const [pick, setPick] = useState(null)
  const [picks, setPicks] = useState(null) // { index: count } from students' answers
  const [reporterPick, setReporterPick] = useState(null)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // What students chose on this question, and what the reporting student chose.
  useEffect(() => {
    let cancelled = false
    supabase.from('answer_log').select('user_id, selected, answered_at').eq('question_id', questionId).limit(1000)
      .then(({ data }) => {
        if (cancelled || !data) return
        const m = {}
        data.forEach(a => { if (a.selected != null) m[a.selected] = (m[a.selected] || 0) + 1 })
        setPicks(m)
        if (reporterId) {
          const mine = data.filter(a => a.user_id === reporterId && a.selected != null).sort((a, b) => (a.answered_at < b.answered_at ? 1 : -1))[0]
          setReporterPick(mine ? Number(mine.selected) : null)
        }
      })
    return () => { cancelled = true }
  }, [questionId, reporterId])
  const totalPicks = picks ? Object.values(picks).reduce((s, n) => s + n, 0) : 0

  if (editing && q) {
    return <QuestionEditor q={q} busy={busy} onCancel={() => setEditing(false)} onSave={async (fields) => { if (await onEdit(fields)) setEditing(false) }} />
  }

  return (
    <div style={{ ...ui.card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)' }}>{meta}</div>
      {q && <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)', lineHeight: 1.5 }}><MathText text={q.question} /></div>}

      {q && options.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map((opt, i) => {
            const isKey = i === q.answer_index
            const chosen = pick === i
            const n = picks?.[i] || 0
            return (
              <button key={i} type="button" disabled={!open || !onSetAnswer} onClick={() => setPick(chosen ? null : i)} aria-pressed={chosen}
                style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '8px 11px', borderRadius: 9, fontFamily: FONT_B, fontSize: 13.5, color: 'var(--t-text)', cursor: open ? 'pointer' : 'default',
                  background: chosen ? 'var(--t-bgSubtle)' : 'var(--t-bgCard)', border: `1px solid ${chosen ? 'var(--t-text)' : isKey ? 'var(--t-success)' : 'var(--t-border)'}` }}>
                <span style={{ fontWeight: 800, color: 'var(--t-textMuted)', width: 14 }}>{LETTERS[i]}</span>
                <span style={{ flex: 1, minWidth: 0 }}><MathText text={String(opt)} /></span>
                {reporterPick === i && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-textSub)', whiteSpace: 'nowrap' }}>{reporterName ? `${reporterName.split(' ')[0]}’s answer` : 'Their answer'}</span>}
                {isKey && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-success)', whiteSpace: 'nowrap' }}>Answer key</span>}
                {totalPicks > 0 && <span style={{ fontSize: 12, color: 'var(--t-textMuted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{n} of {totalPicks}</span>}
              </button>
            )
          })}
          {totalPicks > 0 && <div style={ui.hint}>The counts are what students picked, from {totalPicks} answer{totalPicks === 1 ? '' : 's'}.</div>}
        </div>
      )}

      {outcome && <div style={{ fontSize: 13, color: 'var(--t-textSub)', lineHeight: 1.55 }}>{outcome}</div>}

      {q && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {open && onSetAnswer && (
            <button type="button" style={btn('primary', !!busy || pick == null || pick === q.answer_index)} disabled={!!busy || pick == null || pick === q.answer_index}
              title={pick == null ? 'Pick the right option above first' : ''}
              onClick={() => onSetAnswer(pick)}>
              {pick == null || pick === q.answer_index ? 'Pick the right option' : `Set answer to ${LETTERS[pick]}`}
            </button>
          )}
          {onEdit && <button type="button" style={btn('secondary', !!busy)} disabled={!!busy} onClick={() => setEditing(true)}>Edit question</button>}
          {open && onDismiss && <button type="button" style={btn('secondary', !!busy)} disabled={!!busy} onClick={onDismiss}>Question is right</button>}
          {onClearFlags && <button type="button" style={btn('secondary', !!busy)} disabled={!!busy} onClick={onClearFlags}>Clear flags</button>}
          {onRecheck && <button type="button" style={btn('secondary', !!busy)} disabled={!!busy} onClick={onRecheck}>{busy === 'recheck' ? 'Checking…' : 'Check again with AI'}</button>}
          <button type="button" style={btn('secondary')} onClick={onPreview}>Open in preview</button>
          {onDelete && <button type="button" style={{ ...btn('danger', !!busy), marginLeft: 'auto' }} disabled={!!busy} onClick={() => setConfirmDelete(true)}>Remove</button>}
        </div>
      )}
      {confirmDelete && (
        <div style={{ ...note('danger'), display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 240px', color: 'var(--t-text)' }}>Remove this question from the bank? Its similar-question variants, flags and students’ review history for it go too. This can’t be undone.</span>
          <button type="button" style={{ ...btn('primary'), background: 'var(--t-danger)', color: '#fff' }} disabled={!!busy} onClick={async () => { setConfirmDelete(false); await onDelete() }}>Remove</button>
          <button type="button" style={btn('secondary')} onClick={() => setConfirmDelete(false)}>Cancel</button>
        </div>
      )}
    </div>
  )
}

/** Rewrite a question's text, options, right answer, worked solution and level. */
function QuestionEditor({ q, busy, onSave, onCancel }) {
  const [question, setQuestion] = useState(q.question || '')
  const [options, setOptions] = useState(parseOptions(q.options).map(String))
  const [answer, setAnswer] = useState(q.answer_index ?? 0)
  const [solution, setSolution] = useState(q.solution || '')
  const [level, setLevel] = useState(q.difficulty ?? '')
  const input = { ...ui.input, width: '100%' }
  const label = { ...ui.label, fontSize: 12 }
  const canSave = question.trim() && options.length >= 2 && options.every(o => o.trim()) && answer < options.length

  return (
    <div style={{ ...ui.card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={ui.heading}>Edit question</div>
      <div>
        <label htmlFor="rq-text" style={label}>Question</label>
        <textarea id="rq-text" rows={3} value={question} onChange={e => setQuestion(e.target.value)} style={{ ...input, resize: 'vertical' }} />
        {question.trim() && <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 9, background: 'var(--t-bgSubtle)', fontSize: 13.5, color: 'var(--t-text)' }}><MathText text={question} /></div>}
      </div>
      <div>
        <span style={label}>Options <span style={{ fontWeight: 500, color: 'var(--t-textMuted)' }}>· tick the right one</span></span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 14, fontSize: 12.5, fontWeight: 800, color: 'var(--t-textMuted)' }}>{LETTERS[i]}</span>
              <input aria-label={`Option ${LETTERS[i]}`} value={opt} onChange={e => setOptions(prev => prev.map((o, j) => (j === i ? e.target.value : o)))}
                style={{ ...input, borderColor: answer === i ? 'var(--t-success)' : 'var(--t-border)' }} />
              <button type="button" aria-pressed={answer === i} aria-label={`Option ${LETTERS[i]} is right`} onClick={() => setAnswer(i)}
                style={{ flexShrink: 0, padding: '7px 10px', borderRadius: 8, fontFamily: FONT_B, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${answer === i ? 'var(--t-success)' : 'var(--t-border)'}`, background: answer === i ? 'var(--t-successBg)' : 'var(--t-bgCard)', color: answer === i ? 'var(--t-success)' : 'var(--t-textMuted)' }}>
                {answer === i ? 'Right' : 'Mark right'}
              </button>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 100px', gap: 10 }}>
        <div>
          <label htmlFor="rq-solution" style={label}>Worked solution</label>
          <textarea id="rq-solution" rows={4} value={solution} onChange={e => setSolution(e.target.value)} style={{ ...input, resize: 'vertical' }} />
        </div>
        <div>
          <label htmlFor="rq-level" style={label}>Level (1–5)</label>
          <input id="rq-level" type="number" min={1} max={5} value={level} onChange={e => setLevel(e.target.value)} style={input} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={!!busy || !canSave} style={btn('primary', !!busy || !canSave)}
          onClick={() => onSave({ question, options, answerIndex: answer, solution, ...(level !== '' && level != null ? { difficulty: Number(level) } : {}) })}>
          {busy === 'edit' ? 'Saving…' : 'Save question'}
        </button>
        <button type="button" style={btn('secondary')} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
