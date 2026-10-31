import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchQuestionReports, bulkScanQuestions, retryPendingReports, resolveQuestionReport, isOpenReport } from '../lib/adminDb'
import MathText from './MathText'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const LETTERS = 'ABCDEFGH'

// What happened to a report, in words.
const OUTCOME = {
  pending:     'Waiting for the AI check',
  processing:  'AI check running',
  dismissed:   'Question was right',
  fixed_index: 'Answer key fixed',
  regenerated: 'Question replaced',
  deleted:     'Question removed',
  error:       'AI check failed',
}
const FILTERS = [
  ['open', 'Open'],
  ['fixed', 'Fixed'],
  ['dismissed', 'Dismissed'],
  ['all', 'All'],
]
const inFilter = (r, f) =>
  f === 'all' ? true
  : f === 'open' ? isOpenReport(r)
  : f === 'fixed' ? ['fixed_index', 'regenerated', 'deleted'].includes(r.ai_status)
  : r.ai_status === 'dismissed'

const parseOptions = (o) => {
  if (Array.isArray(o)) return o
  try { return JSON.parse(o) || [] } catch { return [] }
}
const ago = (iso) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 31 ? `${days}d ago` : new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

/**
 * Admin › Reports: questions students reported as wrong. The AI checks each
 * one; anything it couldn't settle stays open here for a person. A report
 * opens beside the list with the answer key, what students picked, and the
 * buttons that settle it.
 */
export default function AdminReportsScreen({ onChange }) {
  const navigate = useNavigate()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('open')
  const [selectedId, setSelectedId] = useState(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null) // { ok, text }

  const load = useCallback(async () => {
    try {
      setReports(await fetchQuestionReports('all'))
      setError('')
    } catch (e) { setError(e.message || 'Could not load reports.') }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([f]) => [f, reports.filter(r => inFilter(r, f)).length])), [reports])
  const shown = useMemo(() => reports.filter(r => inFilter(r, filter)), [reports, filter])
  // Keep a report selected: the chosen one if it's still in the list, else the first.
  const selected = shown.find(r => r.id === selectedId) || shown[0] || null

  const run = async (key, fn, okText) => {
    setBusy(key); setNotice(null)
    try {
      const res = await fn()
      setNotice({ ok: true, text: typeof okText === 'function' ? okText(res) : okText })
      await load(); onChange?.()
    } catch (e) { setNotice({ ok: false, text: e.message || 'That didn’t work.' }) }
    setBusy('')
  }

  const chip = (on) => ({ padding: '6px 12px', borderRadius: 999, border: `1px solid ${on ? 'var(--t-text)' : 'var(--t-border)'}`, background: on ? 'var(--t-text)' : 'var(--t-bgCard)', color: on ? 'var(--t-bg)' : 'var(--t-textMuted)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, whiteSpace: 'nowrap' })
  const btn = (primary) => ({ padding: '8px 14px', borderRadius: 9, fontFamily: FONT_B, fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', border: primary ? 'none' : '1px solid var(--t-border)', background: primary ? 'var(--t-accent)' : 'var(--t-bgCard)', color: primary ? '#0c1037' : 'var(--t-text)' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT_B }}>
      <style>{`
        .rp-layout { display: grid; grid-template-columns: minmax(260px, 360px) minmax(0, 1fr); gap: 16px; align-items: start; }
        .rp-item:hover { background: var(--t-bgHover); }
        .rp-item:focus-visible { outline: 2px solid var(--t-accent); outline-offset: -2px; }
        @media (max-width: 900px) { .rp-layout { grid-template-columns: minmax(0, 1fr); } }
      `}</style>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div role="group" aria-label="Show" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} style={chip(filter === f)}>{label} · {counts[f] ?? 0}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button type="button" disabled={!!busy} style={btn(false)} title="Run the AI check again on reports that are stuck or failed"
            onClick={() => run('retry', () => retryPendingReports({ limit: 20 }), r => r.retried ? `Checked ${r.retried} stuck report${r.retried === 1 ? '' : 's'} again.` : 'No stuck reports.')}>
            {busy === 'retry' ? 'Checking…' : 'Retry stuck checks'}
          </button>
          <button type="button" disabled={!!busy} style={btn(false)} title="Ask the AI to check 100 questions from the bank, without a student report"
            onClick={() => run('scan', () => bulkScanQuestions({ limit: 100 }), r => `Checked ${r.queued} question${r.queued === 1 ? '' : 's'}.`)}>
            {busy === 'scan' ? 'Checking 100 questions…' : 'Check 100 questions'}
          </button>
        </div>
      </div>
      {notice && <div role="status" style={{ fontSize: 13, fontWeight: 600, color: notice.ok ? 'var(--t-success)' : 'var(--t-danger)' }}>{notice.text}</div>}
      {error && <div style={{ fontSize: 13, color: 'var(--t-danger)' }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 36, color: 'var(--t-textMuted)', fontSize: 13 }}>Loading reports…</div>
      ) : shown.length === 0 ? (
        <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--t-textMuted)', fontSize: 13, background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12 }}>
          {filter === 'open' ? 'No open reports. When students report a question, the AI checks it and anything it can’t settle shows up here.' : 'No reports here.'}
        </div>
      ) : (
        <div className="rp-layout">
          <div role="listbox" aria-label="Reports" style={{ background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12, overflow: 'hidden', maxHeight: 640, overflowY: 'auto' }}>
            {shown.map(r => {
              const q = r.questions
              const on = selected?.id === r.id
              return (
                <div key={r.id} role="option" aria-selected={on} tabIndex={0} className="rp-item"
                  onClick={() => setSelectedId(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(r.id) } }}
                  style={{ padding: '11px 14px', borderBottom: '1px solid var(--t-border)', cursor: 'pointer', background: on ? 'var(--t-bgSubtle)' : 'transparent', boxShadow: on ? 'inset 2px 0 0 var(--t-text)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q?.subtopic || q?.topic || 'Question removed'}</span>
                    <span style={{ fontSize: 12, color: 'var(--t-textFaint)', flexShrink: 0 }}>{ago(r.reported_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: r.ai_status === 'error' ? 'var(--t-danger)' : 'var(--t-textMuted)' }}>
                    {[q?.subject, OUTCOME[r.ai_status] || r.ai_status].filter(Boolean).join(' · ')}
                  </div>
                </div>
              )
            })}
          </div>
          {selected && <ReportDetail key={selected.id} report={selected} busy={busy} btn={btn}
            onResolve={(action, answerIndex, okText) => run(action, () => resolveQuestionReport(selected.id, action, answerIndex), okText)}
            onPreview={() => navigate(`/admin/questions?tab=preview&id=${encodeURIComponent(selected.question_id)}`)} />}
        </div>
      )}
    </div>
  )
}

function ReportDetail({ report, busy, btn, onResolve, onPreview }) {
  const q = report.questions
  const options = parseOptions(q?.options)
  const open = isOpenReport(report)
  const [pick, setPick] = useState(null)
  const [picks, setPicks] = useState(null) // { index: count } from students' answers

  // What students chose on this question.
  useEffect(() => {
    let cancelled = false
    supabase.from('answer_log').select('selected').eq('question_id', report.question_id).limit(1000)
      .then(({ data }) => {
        if (cancelled || !data) return
        const m = {}
        data.forEach(a => { if (a.selected != null) m[a.selected] = (m[a.selected] || 0) + 1 })
        setPicks(m)
      })
    return () => { cancelled = true }
  }, [report.question_id])
  const totalPicks = picks ? Object.values(picks).reduce((s, n) => s + n, 0) : 0
  const verdict = report.ai_verdict

  return (
    <div style={{ background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)' }}>
        {[q?.subject, q?.topic, q?.subtopic].filter(Boolean).join(' · ') || 'This question is no longer in the bank.'}
        {' · '}Reported {new Date(report.reported_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
      </div>
      {q && <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)', lineHeight: 1.5 }}><MathText text={q.question} /></div>}

      {options.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map((opt, i) => {
            const isKey = i === q.answer_index
            const chosen = pick === i
            const n = picks?.[i] || 0
            return (
              <button key={i} type="button" disabled={!open} onClick={() => setPick(chosen ? null : i)} aria-pressed={chosen}
                style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '8px 11px', borderRadius: 9, fontFamily: FONT_B, fontSize: 13.5, color: 'var(--t-text)', cursor: open ? 'pointer' : 'default',
                  background: chosen ? 'var(--t-bgSubtle)' : 'var(--t-bgCard)', border: `1px solid ${chosen ? 'var(--t-text)' : isKey ? 'var(--t-success)' : 'var(--t-border)'}` }}>
                <span style={{ fontWeight: 800, color: 'var(--t-textMuted)', width: 14 }}>{LETTERS[i]}</span>
                <span style={{ flex: 1, minWidth: 0 }}><MathText text={String(opt)} /></span>
                {isKey && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-success)', whiteSpace: 'nowrap' }}>Answer key</span>}
                {totalPicks > 0 && <span style={{ fontSize: 12, color: 'var(--t-textMuted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{n} of {totalPicks}</span>}
              </button>
            )
          })}
          {totalPicks > 0 && <div style={{ fontSize: 12, color: 'var(--t-textFaint)' }}>The counts are what students picked, from {totalPicks} answer{totalPicks === 1 ? '' : 's'}.</div>}
        </div>
      )}

      {(verdict?.explanation || report.resolution_note) && (
        <div style={{ fontSize: 13, color: 'var(--t-textSub)', lineHeight: 1.55 }}>
          <span style={{ fontWeight: 700, color: 'var(--t-text)' }}>{OUTCOME[report.ai_status] || report.ai_status}.</span>{' '}
          {verdict?.explanation || report.resolution_note}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {open && q && (
          <button type="button" style={{ ...btn(true), opacity: pick == null || pick === q.answer_index ? 0.5 : 1 }} disabled={!!busy || pick == null || pick === q.answer_index}
            title={pick == null ? 'Pick the right option above first' : ''}
            onClick={() => onResolve('set_answer', pick, `Answer set to ${LETTERS[pick]}. The worked solution wasn’t changed, so check it in preview.`)}>
            {pick == null || pick === q.answer_index ? 'Pick the right option' : `Set answer to ${LETTERS[pick]}`}
          </button>
        )}
        {open && <button type="button" style={btn(false)} disabled={!!busy} onClick={() => onResolve('dismiss', undefined, 'Dismissed. The question stays as it is.')}>Question is right</button>}
        {q && <button type="button" style={btn(false)} disabled={!!busy} onClick={() => onResolve('recheck', undefined, 'Checked again.')}>{busy === 'recheck' ? 'Checking…' : 'Check again with AI'}</button>}
        {q && <button type="button" style={btn(false)} onClick={onPreview}>Open in preview</button>}
      </div>
    </div>
  )
}
