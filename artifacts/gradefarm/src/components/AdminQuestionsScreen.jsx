import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchLiveCurricula } from '../lib/curriculaDb'
import AdminGenerateScreen     from './AdminGenerateScreen'
import AdminVisionScreen       from './AdminVisionScreen'
import AdminUploadScreen       from './AdminUploadScreen'
import AdminReviewScreen       from './AdminReviewScreen'
import AdminQuestionPreviewTab from './AdminQuestionPreviewTab'
import MathText from './MathText'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const PAGE = 50

// The three ways to add questions. Each ends in the review queue.
const METHODS = [
  { id: 'generate', label: 'Generate with AI', hint: 'Pick topics and AI writes them' },
  { id: 'photo',    label: 'From a photo',     hint: 'A photo or screenshot of questions' },
  { id: 'pdf',      label: 'From a PDF',       hint: 'A past paper or worksheet' },
]

/**
 * Admin › Questions: the bank, adding questions, the review queue and the
 * preview. The tab comes from AdminScreen (?tab=); the add method (?method=)
 * and the previewed question (?id=) from the URL.
 */
export default function AdminQuestionsScreen({ profile, tab, onReviewChange }) {
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)

  if (tab === 'add') {
    const method = METHODS.some(m => m.id === params.get('method')) ? params.get('method') : 'generate'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: FONT_B }}>
        <div role="radiogroup" aria-label="How to add questions" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {METHODS.map(m => {
            const on = m.id === method
            return (
              <button key={m.id} type="button" role="radio" aria-checked={on}
                onClick={() => navigate(`/admin/questions?tab=add${m.id === 'generate' ? '' : `&method=${m.id}`}`, { replace: true })}
                style={{ textAlign: 'left', padding: '11px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: FONT_B, background: 'var(--t-bgCard)', border: `1px solid ${on ? 'var(--t-text)' : 'var(--t-border)'}`, boxShadow: on ? '0 0 0 1px var(--t-text)' : 'none' }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--t-text)' }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--t-textMuted)', marginTop: 1 }}>{m.hint}</div>
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', marginTop: -8 }}>New questions go to the review queue before students see them.</div>
        {method === 'generate' && <AdminGenerateScreen />}
        {method === 'photo' && <AdminVisionScreen />}
        {method === 'pdf' && <AdminUploadScreen />}
      </div>
    )
  }
  if (tab === 'review') return <AdminReviewScreen profile={profile} onChange={onReviewChange} />
  if (tab === 'preview') return <AdminQuestionPreviewTab key={params.get('id') || ''} initialId={params.get('id')} />
  return <QuestionBank onOpen={(id) => navigate(`/admin/questions?tab=preview&id=${encodeURIComponent(id)}`)} />
}

/** Every live question, searchable and filterable by subject; a row opens it in Preview. */
function QuestionBank({ onOpen }) {
  const [subjects, setSubjects] = useState([])
  const [subject, setSubject] = useState('')
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchLiveCurricula().then(cs => setSubjects([...new Set(cs.map(c => c.name).filter(Boolean))].sort())).catch(() => {})
  }, [])
  // Search after typing stops.
  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const query = (from) => {
    let q = supabase.from('questions')
      .select('id, subject, topic, subtopic, question, difficulty', { count: 'exact' })
      .order('subject').order('topic').order('id')
      .range(from, from + PAGE - 1)
    if (subject) q = q.eq('subject', subject)
    if (term) q = q.or(`question.ilike.%${term.replace(/[%,()]/g, ' ')}%,id.ilike.%${term.replace(/[%,()]/g, ' ')}%`)
    return q
  }
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    query(0).then(({ data, count, error: err }) => {
      if (cancelled) return
      if (err) setError(err.message)
      setRows(data || []); setTotal(count ?? null); setLoading(false)
    })
    return () => { cancelled = true }
  }, [subject, term]) // eslint-disable-line react-hooks/exhaustive-deps
  const loadMore = async () => {
    setLoading(true)
    const { data, error: err } = await query(rows.length)
    if (err) setError(err.message)
    setRows(prev => [...prev, ...(data || [])]); setLoading(false)
  }

  const ctrl = { padding: '7px 11px', borderRadius: 9, border: '1px solid var(--t-border)', background: 'var(--t-bgInput)', color: 'var(--t-text)', fontSize: 13, fontFamily: FONT_B, outline: 'none' }
  const th = (label, right) => <th style={{ textAlign: right ? 'right' : 'left', fontSize: 11.5, color: 'var(--t-textMuted)', fontWeight: 700, padding: '10px 16px', borderBottom: '1px solid var(--t-border)', whiteSpace: 'nowrap' }}>{label}</th>
  const td = { padding: '10px 16px', fontSize: 13, borderBottom: '1px solid var(--t-border)', verticalAlign: 'top' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT_B }}>
      <style>{`.qb-row:hover { background: var(--t-bgHover); } .qb-row:focus-visible { outline: 2px solid var(--t-accent); outline-offset: -2px; }`}</style>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search question text or ID" aria-label="Search questions" style={{ ...ctrl, flex: '1 1 240px', maxWidth: 380 }} />
        <select value={subject} onChange={e => setSubject(e.target.value)} aria-label="Subject" style={{ ...ctrl, color: subject ? 'var(--t-text)' : 'var(--t-textMuted)' }}>
          <option value="">All subjects</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {total != null && <span style={{ fontSize: 12.5, color: 'var(--t-textMuted)' }}>{total.toLocaleString()} question{total === 1 ? '' : 's'}</span>}
      </div>
      {error && <div style={{ fontSize: 13, color: 'var(--t-danger)' }}>{error}</div>}
      <div style={{ background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12, overflow: 'hidden' }}>
        {!loading && rows.length === 0 ? (
          <div style={{ padding: 36, textAlign: 'center', color: 'var(--t-textMuted)', fontSize: 13 }}>{term || subject ? 'No questions match.' : 'No questions in the bank yet.'}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead><tr>{th('Question')}{th('Subject')}{th('Topic')}{th('Level', true)}</tr></thead>
              <tbody>
                {rows.map(q => (
                  <tr key={q.id} className="qb-row" tabIndex={0} onClick={() => onOpen(q.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(q.id) }} style={{ cursor: 'pointer' }}>
                    <td style={{ ...td, maxWidth: 460 }}>
                      <div style={{ color: 'var(--t-text)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}><MathText text={q.question || ''} /></div>
                      <div style={{ fontSize: 11.5, color: 'var(--t-textFaint)', marginTop: 2 }}>{q.id}</div>
                    </td>
                    <td style={{ ...td, color: 'var(--t-textSub)' }}>{q.subject}</td>
                    <td style={{ ...td, color: 'var(--t-textSub)' }}>{q.subtopic || q.topic || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--t-textMuted)', fontVariantNumeric: 'tabular-nums' }}>{q.difficulty ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {loading && <div style={{ padding: 16, textAlign: 'center', color: 'var(--t-textMuted)', fontSize: 13 }}>Loading…</div>}
      </div>
      {!loading && total != null && rows.length < total && (
        <button type="button" onClick={loadMore} style={{ alignSelf: 'center', padding: '8px 16px', borderRadius: 9, border: '1px solid var(--t-border)', background: 'var(--t-bgCard)', color: 'var(--t-text)', fontFamily: FONT_B, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Show {Math.min(PAGE, total - rows.length)} more
        </button>
      )}
    </div>
  )
}
