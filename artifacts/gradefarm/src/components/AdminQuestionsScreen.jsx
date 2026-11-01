import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchLiveCurricula } from '../lib/curriculaDb'
import AdminGenerateScreen     from './AdminGenerateScreen'
import AdminVisionScreen       from './AdminVisionScreen'
import AdminUploadScreen       from './AdminUploadScreen'
import AdminReviewScreen       from './AdminReviewScreen'
import AdminQuestionPreviewTab from './AdminQuestionPreviewTab'
import MathText from './MathText'
import { QuestionPanel } from './AdminQuestionPanel'
import { searchQuestions, transcribeQuestionImage, editQuestion, deleteQuestion } from '../lib/adminDb'
import { ui, btn, note } from '../lib/adminUi'

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
export default function AdminQuestionsScreen({ profile, tab, onReviewChange, theme }) {
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
        {method === 'generate' && <AdminGenerateScreen />}
        {method === 'photo' && <AdminVisionScreen />}
        {method === 'pdf' && <AdminUploadScreen />}
      </div>
    )
  }
  if (tab === 'review') return <AdminReviewScreen profile={profile} onChange={onReviewChange} />
  if (tab === 'preview') return <AdminQuestionPreviewTab key={params.get('id') || ''} initialId={params.get('id')} theme={theme} />
  return <QuestionBank onOpen={(id) => navigate(`/admin/questions?tab=preview&id=${encodeURIComponent(id)}`)} />
}

const ROW_FIELDS = 'id, subject, topic, subtopic, question, options, answer_index, solution, difficulty'

/**
 * The live question bank. Paste what a student sent (their copy of the
 * question, or its ID) or drop in a photo of it, and the closest matches come
 * first; a question opens beside the list to fix or remove. With nothing
 * typed, it lists every question by subject.
 */
function QuestionBank({ onOpen }) {
  const [subjects, setSubjects] = useState([])
  const [subject, setSubject] = useState('')
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ranked, setRanked] = useState(false)      // results are best-match first
  const [selectedId, setSelectedId] = useState(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)
  const [reading, setReading] = useState(false)    // reading a photo
  const fileRef = useRef(null)

  useEffect(() => {
    fetchLiveCurricula().then(cs => setSubjects([...new Set(cs.map(c => c.name).filter(Boolean))].sort())).catch(() => {})
  }, [])
  // Search after typing stops.
  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 400)
    return () => clearTimeout(id)
  }, [search])

  const browse = (from) => {
    let q = supabase.from('questions').select(ROW_FIELDS, { count: 'exact' })
      .order('subject').order('topic').order('id').range(from, from + PAGE - 1)
    if (subject) q = q.eq('subject', subject)
    return q
  }
  // Exact-substring search: the fallback when the ranked search isn't available.
  const plainSearch = () => {
    const safe = term.replace(/[%,()]/g, ' ').slice(0, 200)
    let q = supabase.from('questions').select(ROW_FIELDS, { count: 'exact' })
      .or(`question.ilike.%${safe}%,id.ilike.%${safe}%`).limit(PAGE)
    if (subject) q = q.eq('subject', subject)
    return q
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    const done = (list, count, isRanked) => {
      if (cancelled) return
      setRows(list); setTotal(count); setRanked(isRanked); setLoading(false)
      setSelectedId(prev => (list.some(r => r.id === prev) ? prev : isRanked ? list[0]?.id ?? null : prev))
    }
    if (!term) {
      browse(0).then(({ data, count, error: err }) => { if (err) setError(err.message); done(data || [], count ?? null, false) })
    } else {
      searchQuestions(term, { subject })
        .then(list => done(list, list.length, true))
        .catch(() => plainSearch().then(({ data, count, error: err }) => { if (err) setError(err.message); done(data || [], count ?? null, false) }))
    }
    return () => { cancelled = true }
  }, [subject, term]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    setLoading(true)
    const { data, error: err } = await browse(rows.length)
    if (err) setError(err.message)
    setRows(prev => [...prev, ...(data || [])]); setLoading(false)
  }

  // Read the question out of a photo, then search for it.
  const onPhoto = async (file) => {
    if (!file) return
    setReading(true); setNotice(null)
    try {
      const text = await transcribeQuestionImage(file)
      if (!text.trim()) setNotice({ ok: false, text: 'No question found in that image. Try a clearer photo, or type a few words.' })
      else { setSearch(text); setTerm(text.trim()); setNotice({ ok: true, text: 'Read from the photo. Edit the text if it got something wrong.' }) }
    } catch (e) { setNotice({ ok: false, text: e.message || 'Couldn’t read that photo.' }) }
    setReading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const selected = rows.find(r => r.id === selectedId) || null
  // After a change, fetch the question again so the list and panel show it.
  const refresh = async (id) => {
    const { data } = await supabase.from('questions').select(ROW_FIELDS).eq('id', id).maybeSingle()
    setRows(prev => (data ? prev.map(r => (r.id === id ? { ...r, ...data } : r)) : prev.filter(r => r.id !== id)))
    if (!data) setSelectedId(null)
  }
  const run = async (key, fn, okText) => {
    setBusy(key); setNotice(null)
    let ok = false
    try { await fn(); ok = true; setNotice({ ok: true, text: okText }); await refresh(selected.id) }
    catch (e) { setNotice({ ok: false, text: e.message || 'That didn’t work.' }) }
    setBusy('')
    return ok
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT_B }}>
      <style>{`
        .qb-layout { display: grid; grid-template-columns: minmax(280px, 420px) minmax(0, 1fr); gap: 16px; align-items: start; }
        .qb-item:hover { background: var(--t-bgHover); }
        .qb-item:focus-visible { outline: 2px solid var(--t-accent); outline-offset: -2px; }
        @media (max-width: 900px) { .qb-layout { grid-template-columns: minmax(0, 1fr); } }
      `}</style>

      <div style={{ ...ui.card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label htmlFor="qb-search" style={{ ...ui.label, marginBottom: 0 }}>Find a question</label>
        <textarea id="qb-search" rows={2} value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Paste what the student sent (their copy of the question, or its ID). It doesn’t need to match exactly."
          style={{ ...ui.input, width: '100%', resize: 'vertical', lineHeight: 1.5 }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={reading} style={btn('secondary', reading)}>
            {reading ? 'Reading the photo…' : 'Find from a photo'}
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => onPhoto(e.target.files?.[0])} style={{ display: 'none' }} />
          <select value={subject} onChange={e => setSubject(e.target.value)} aria-label="Subject" style={{ ...ui.input, color: subject ? 'var(--t-text)' : 'var(--t-textMuted)' }}>
            <option value="">All subjects</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {search && <button type="button" onClick={() => { setSearch(''); setTerm(''); setNotice(null) }} style={{ ...btn('secondary'), border: 'none', background: 'none', color: 'var(--t-textMuted)' }}>Clear</button>}
          <span style={{ ...ui.hint, marginLeft: 'auto' }}>
            {loading ? 'Searching…' : term ? `${rows.length} match${rows.length === 1 ? '' : 'es'}${ranked ? ', closest first' : ''}` : total != null ? `${total.toLocaleString()} questions` : ''}
          </span>
        </div>
      </div>
      {notice && <div role="status" style={{ fontSize: 13, fontWeight: 600, color: notice.ok ? 'var(--t-success)' : 'var(--t-danger)' }}>{notice.text}</div>}
      {error && <div role="alert" style={note('danger')}>{error}</div>}

      {!loading && rows.length === 0 ? (
        <div style={ui.empty}>{term ? 'Nothing close. Try fewer words, the most unusual ones from the question, or a different subject.' : 'No questions in the bank yet.'}</div>
      ) : (
        <div className="qb-layout">
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div role="listbox" aria-label="Questions" style={{ ...ui.card, overflow: 'hidden', maxHeight: 720, overflowY: 'auto' }}>
              {rows.map(q => {
                const on = q.id === selectedId
                return (
                  <div key={q.id} role="option" aria-selected={on} tabIndex={0} className="qb-item"
                    onClick={() => setSelectedId(q.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(q.id) } }}
                    style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-border)', cursor: 'pointer', background: on ? 'var(--t-bgSubtle)' : 'transparent', boxShadow: on ? 'inset 2px 0 0 var(--t-text)' : 'none' }}>
                    <div style={{ fontSize: 13, color: 'var(--t-text)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}><MathText text={q.question || ''} /></div>
                    <div style={{ fontSize: 12, color: 'var(--t-textMuted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[q.subject, q.subtopic || q.topic, q.id].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                )
              })}
              {loading && <div style={{ padding: 16, textAlign: 'center', color: 'var(--t-textMuted)', fontSize: 13 }}>Loading…</div>}
            </div>
            {!term && !loading && total != null && rows.length < total && (
              <button type="button" onClick={loadMore} style={{ ...btn('secondary'), alignSelf: 'center' }}>
                Show {Math.min(PAGE, total - rows.length)} more
              </button>
            )}
          </div>

          {selected ? (
            <QuestionPanel key={selected.id} questionId={selected.id} q={selected} busy={busy} open
              meta={<>{[selected.subject, selected.topic, selected.subtopic].filter(Boolean).join(' · ')} · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{selected.id}</span></>}
              onSetAnswer={(i) => run('set_answer', () => editQuestion(selected.id, { answerIndex: i }), `Answer set to ${'ABCDEFGH'[i]}. Check the worked solution still matches.`)}
              onEdit={(fields) => run('edit', () => editQuestion(selected.id, fields), 'Saved.')}
              onDelete={() => run('delete', () => deleteQuestion(selected.id), 'Removed from the bank.')}
              onPreview={() => onOpen(selected.id)} />
          ) : (
            <div style={ui.empty}>Pick a question to see it as students do, and fix or remove it.</div>
          )}
        </div>
      )}
    </div>
  )
}
