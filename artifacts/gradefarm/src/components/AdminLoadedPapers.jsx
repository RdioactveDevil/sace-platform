import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, CircleDashed, FileStack, Loader } from 'lucide-react'
import { confirmDialog } from '../lib/dialog'
import { ui, btn, note, FONT_B } from '../lib/adminUi'
import { groupLoadedPapers } from '../lib/examPapers'
import { reviewSummary, paperStatus } from '../lib/questionChecks'
import { orderPapers, paperPath } from '../lib/paperPage'
import { fetchLoadedPaperQuestions, bulkEditQuestions, reviewQuestions, fetchReviewerNames } from '../lib/adminDb'

const fmtDate = (iso, year = true) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) }) : '')
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const FILTERS = [['all', 'All'], ['unchecked', 'Not checked'], ['partway', 'Part way'], ['checked', 'Checked']]
const STATUS = {
  checked: { Icon: CheckCircle2, bg: 'var(--t-successBg, rgba(22,163,74,0.12))', fg: 'var(--t-success)' },
  partway: { Icon: Loader, bg: 'rgba(241,190,67,0.2)', fg: 'var(--t-goldText)' },
  unchecked: { Icon: CircleDashed, bg: 'var(--t-bgHover)', fg: 'var(--t-textMuted)' },
}

/**
 * The exam papers loaded into a subject for the exam builder: each paper,
 * whether it has been checked (every question approved or rejected), part
 * way or not checked, and its counts. Open a paper to check it question by
 * question (AdminPaperPage); approve the questions the checks found nothing
 * wrong with, or delete the paper, from here.
 */
export default function AdminLoadedPapers({ curriculumId }) {
  const navigate = useNavigate()
  const [papers, setPapers] = useState(null)
  const [names, setNames] = useState(() => new Map())
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    try {
      const list = groupLoadedPapers(await fetchLoadedPaperQuestions(curriculumId)).map(p => {
        const all = [...p.a, ...p.b]
        return { ...p, status: paperStatus(all), sum: reviewSummary(all) }
      })
      setPapers(list)
      setError('')
      fetchReviewerNames(list.map(p => p.status.lastBy)).then(setNames).catch(() => {})
    } catch (e) { setError(e.message || "The papers couldn't be loaded.") }
  }, [curriculumId])
  useEffect(() => { load() }, [load])

  const run = async (key, fn, ok) => {
    setBusy(key); setMsg(null)
    try { await fn(); setMsg({ ok: true, text: ok }); await load() }
    catch (e) { setMsg({ ok: false, text: e.message || "That didn't work." }) }
    finally { setBusy('') }
  }
  const removePaper = async (p) => {
    const ids = [...p.a, ...p.b].map(q => q.id)
    if (!(await confirmDialog(`Delete ${p.label}? Its ${plural(ids.length, 'question')} come out of the bank and the exam builder. Practice exams already built from it just leave those questions out. This can't be undone.`, { confirm: 'Delete paper', danger: true }))) return
    run(`del:${p.key}`, () => bulkEditQuestions({ curriculumId, ids, action: 'delete' }), `Deleted ${p.label}.`)
  }
  const approveClean = async (p) => {
    const ids = p.sum.cleanPending
    if (!(await confirmDialog(`Approve ${plural(ids.length, 'question')} from ${p.label} that the checks found nothing wrong with? They go to students straight away. Check a few against the paper first.`, { confirm: 'Approve' }))) return
    run(`rev:${p.key}`, () => reviewQuestions(ids, 'approved'), `Approved ${plural(ids.length, 'question')}.`)
  }

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([id]) => [id, (papers || []).filter(p => id === 'all' || p.status.state === id).length])), [papers])
  const shown = useMemo(() => orderPapers(papers || [], filter), [papers, filter])

  if (error) return <div role="alert" style={note('danger')}>{error}</div>
  if (!papers) return <div style={ui.hint}>Loading the papers…</div>

  const statusText = (s) => (s.state === 'checked'
    ? `Checked${s.lastAt ? ` ${fmtDate(s.lastAt, false)}` : ''}${s.lastBy && names.get(s.lastBy) ? ` by ${names.get(s.lastBy)}` : ''}`
    : s.state === 'partway' ? `Part way · ${s.checked} of ${s.total} checked` : 'Not checked')

  return (
    <div style={{ ...ui.card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT_B }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--t-text)' }}><FileStack size={17} aria-hidden="true" /> Loaded papers</div>
        <div style={{ ...ui.hint, marginTop: 4 }}>The past and trial papers in this subject's bank, used by the exam builder. Open a paper to check each question against the original as it will print, fix it, and approve or reject it. A paper is checked when every question has been approved or rejected.</div>
      </div>
      {msg && <div role="status" style={note(msg.ok ? 'success' : 'danger')}>{msg.text}</div>}
      {papers.length > 0 && (
        <div role="radiogroup" aria-label="Show papers" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={filter === id} onClick={() => setFilter(id)}
              style={{ ...btn('secondary'), padding: '5px 11px', fontSize: 12.5, borderRadius: 99, ...(filter === id ? { borderColor: 'var(--t-accent)', background: 'var(--t-bgHover)' } : {}) }}>
              {label} <span style={{ color: 'var(--t-textMuted)', fontWeight: 600 }}>{counts[id]}</span>
            </button>
          ))}
        </div>
      )}
      {papers.length === 0 ? <div style={{ ...ui.hint, padding: '6px 0' }}>No papers loaded yet. Load some below.</div>
        : shown.length === 0 ? <div style={{ ...ui.hint, padding: '6px 0' }}>No papers here.</div>
          : shown.map(p => {
            const S = STATUS[p.status.state]
            return (
              <div key={p.key} style={{ border: '1px solid var(--t-border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t-text)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {p.label}
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: p.kind === 'trial' ? 'var(--t-bgHover)' : 'rgba(241,190,67,0.2)', color: p.kind === 'trial' ? 'var(--t-textMuted)' : 'var(--t-goldText)' }}>{p.kind === 'trial' ? 'Trial' : 'Past paper'}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: S.bg, color: S.fg, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <S.Icon size={12} aria-hidden="true" /> {statusText(p.status)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t-textMuted)', marginTop: 3 }}>
                    {[p.a.length && `${p.a.length} multiple choice`, p.b.length && `${p.b.length} extended`, `${p.marks} marks`,
                      p.sum.pending && `${p.sum.pending} to review`, p.sum.flagged && plural(p.sum.flagged, 'possible problem'), p.sum.rejected && `${p.sum.rejected} rejected`,
                      p.loadedAt && `loaded ${fmtDate(p.loadedAt)}`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <button type="button" onClick={() => navigate(paperPath(curriculumId, p.key))} style={btn('primary')}>{p.status.state === 'checked' ? 'Open' : 'Check'}</button>
                {p.sum.cleanPending.length > 0 && <button type="button" onClick={() => approveClean(p)} disabled={!!busy} style={btn('secondary', !!busy)}>Approve {p.sum.cleanPending.length} without problems</button>}
                <button type="button" onClick={() => removePaper(p)} disabled={!!busy} style={btn('danger', !!busy)}>{busy === `del:${p.key}` ? 'Deleting…' : 'Delete paper'}</button>
              </div>
            )
          })}
    </div>
  )
}
