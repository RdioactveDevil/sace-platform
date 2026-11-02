import { useState, useEffect, useRef } from 'react'
import { FileText } from 'lucide-react'
import { adminApiPost, prepareCurriculumDoc } from '../lib/adminApi'
import { ui, btn, chip, note, FONT_B } from '../lib/adminUi'
import MathText from './MathText'

// In a subject's editor: keep its questions on the course
// (api-server routes/course-scope.ts).
//
// 1. Course scope: what each subtopic covers in this course, and what the
//    course leaves out. AI drafts it from the course document; an admin checks
//    and saves it. The question generators follow it, and a course check
//    rejects new questions that go outside it.
// 2. Check the bank: runs the course check over every question this subject
//    has (its own and any it borrows), then lists the ones off the course, and
//    any students reported, to delete, hide from this subject, or keep.

const box = { marginBottom: 20, padding: '14px 16px', borderRadius: 10, background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', fontFamily: FONT_B }
const area = { ...ui.input, width: '100%', resize: 'vertical', lineHeight: 1.5, fontSize: 12.5 }

function byTopic(subs) {
  const out = []
  for (const s of subs) {
    const last = out[out.length - 1]
    if (last && last.topic === s.topic) last.items.push(s)
    else out.push({ topic: s.topic, items: [s] })
  }
  return out
}

export default function CourseScopePanel({ curriculumId }) {
  // ── scope ──
  const [loaded, setLoaded] = useState(null)   // { outOfScope, subtopics }
  const [outOfScope, setOutOfScope] = useState('')
  const [scopes, setScopes] = useState({})     // subtopicId -> text
  const [busy, setBusy] = useState('')         // 'extract' | 'save'
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const fileRef = useRef(null)

  // ── bank check ──
  const [audit, setAudit] = useState(null)     // { total, checked, remaining, open }
  const [auditing, setAuditing] = useState(false)
  const stopRef = useRef(false)
  const [review, setReview] = useState(null)   // items
  const [show, setShow] = useState('open')     // 'open' | 'hidden' | 'kept'
  const [acting, setActing] = useState('')     // question id being resolved

  const loadScope = async () => {
    const d = await adminApiPost('/api/admin/course-scope/state', { curriculumId })
    setLoaded(d)
    setOutOfScope(d.outOfScope || '')
    setScopes(Object.fromEntries(d.subtopics.map(s => [s.id, s.scope || ''])))
  }
  const loadReview = async () => {
    const d = await adminApiPost('/api/admin/course-scope/review', { curriculumId })
    setReview(d.items)
  }
  useEffect(() => {
    loadScope().catch(e => setError(e.message))
    loadReview().catch(() => {})
    return () => { stopRef.current = true }
  }, [curriculumId]) // eslint-disable-line react-hooks/exhaustive-deps

  const filled = loaded ? loaded.subtopics.filter(s => (scopes[s.id] || '').trim()).length : 0
  const dirty = loaded && (outOfScope.trim() !== (loaded.outOfScope || '').trim()
    || loaded.subtopics.some(s => (scopes[s.id] || '').trim() !== (s.scope || '').trim()))
  const hasAnyScope = loaded && ((loaded.outOfScope || '').trim() || loaded.subtopics.some(s => (s.scope || '').trim()))

  const extract = async (file) => {
    if (!file) return
    setBusy('extract'); setError(''); setMessage('')
    try {
      const doc = await prepareCurriculumDoc(file)
      const d = await adminApiPost('/api/admin/course-scope/extract', { curriculumId, ...doc })
      setOutOfScope(d.outOfScope || '')
      setScopes(prev => ({ ...prev, ...Object.fromEntries(d.subtopics.map(s => [s.id, s.scope])) }))
      const n = d.subtopics.filter(s => s.scope).length
      setMessage(`AI wrote the scope for ${n} of ${loaded.subtopics.length} subtopics from ${file.name}. Read it through, fix anything that's wrong, then save.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = async () => {
    setBusy('save'); setError(''); setMessage('')
    try {
      await adminApiPost('/api/admin/course-scope/save', {
        curriculumId, outOfScope, subtopics: loaded.subtopics.map(s => ({ id: s.id, scope: scopes[s.id] || '' })),
      })
      await loadScope()
      setMessage('Saved. New questions for this subject will follow it, and the course check will hold them to it.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  const runAudit = async (restart = false) => {
    setAuditing(true); setError(''); stopRef.current = false
    try {
      let first = true
      for (;;) {
        const d = await adminApiPost('/api/admin/course-scope/audit', { curriculumId, restart: restart && first })
        first = false
        setAudit(d)
        if (!d.remaining || stopRef.current) break
      }
      await loadReview()
    } catch (e) {
      setError(e.message)
    } finally {
      setAuditing(false)
    }
  }

  const resolve = async (item, action) => {
    setActing(item.question_id); setError('')
    try {
      await adminApiPost('/api/admin/course-scope/resolve', { curriculumId, questionId: item.question_id, action })
      setReview(prev => action === 'delete'
        ? prev.filter(x => x.question_id !== item.question_id)
        : prev.map(x => x.question_id === item.question_id ? { ...x, resolution: action === 'hide' ? 'hidden' : 'kept' } : x))
    } catch (e) {
      setError(e.message)
    } finally {
      setActing('')
    }
  }

  const lists = {
    open: (review || []).filter(x => !x.resolution),
    hidden: (review || []).filter(x => x.resolution === 'hidden'),
    kept: (review || []).filter(x => x.resolution === 'kept'),
  }
  const shown = lists[show]

  return (
    <>
      {/* 1 · course scope */}
      <div style={box}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--t-text)', marginBottom: 4 }}>Course scope</div>
        <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', marginBottom: 12, maxWidth: '80ch' }}>
          What each subtopic covers in this course, from the official course document (the SACE subject outline or VCAA study design), and what the course leaves out. New questions follow it, and any that go outside it are rejected before they reach students.
        </div>

        {!loaded && !error && <div style={{ fontSize: 13, color: 'var(--t-textMuted)' }} role="status">Loading…</div>}
        {loaded && !loaded.subtopics.length && <div style={{ fontSize: 13, color: 'var(--t-textMuted)' }}>Add topics and subtopics to this subject first.</div>}

        {loaded && loaded.subtopics.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} style={btn('secondary', !!busy)}>
                <FileText size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
                {busy === 'extract' ? 'Reading the document…' : 'Fill from the course document with AI'}
              </button>
              <input ref={fileRef} type="file" accept="application/pdf,text/plain" style={{ display: 'none' }} onChange={e => extract(e.target.files[0])} />
              <span style={{ fontSize: 12.5, color: 'var(--t-textMuted)' }}>A PDF or .txt of the subject outline or study design. This can take a couple of minutes.</span>
            </div>

            <label htmlFor="cs-out" style={ui.label}>Not in this course</label>
            <textarea id="cs-out" rows={4} value={outOfScope} onChange={e => setOutOfScope(e.target.value)} disabled={!!busy}
              placeholder={'- Inverse functions\n- CAS-only methods (graphics calculators only)\n- Anything from Units 3 & 4'} style={area} />
            <div style={{ ...ui.hint, margin: '4px 0 14px' }}>One line each. Things a question writer might wrongly include: another level's or another state's content, methods or notation this course doesn't use, calculator rules.</div>

            <div style={{ ...ui.label, marginBottom: 6 }}>What each subtopic covers <span style={{ fontWeight: 600, color: 'var(--t-textMuted)' }}>· {filled} of {loaded.subtopics.length} written</span></div>
            <div style={{ border: '1px solid var(--t-border)', borderRadius: 9, overflow: 'hidden', marginBottom: 12 }}>
              {byTopic(loaded.subtopics).map(g => {
                const gFilled = g.items.filter(s => (scopes[s.id] || '').trim()).length
                return (
                  <details key={g.topic} style={{ borderBottom: '1px solid var(--t-border)' }}>
                    <summary style={{ padding: '9px 12px', fontSize: 12.5, fontWeight: 800, color: 'var(--t-text)', background: 'var(--t-bgSubtle)', cursor: 'pointer' }}>
                      {g.topic || 'No topic'} <span style={{ fontWeight: 600, color: 'var(--t-textMuted)' }}>· {gFilled} of {g.items.length}</span>
                    </summary>
                    {g.items.map(s => (
                      <div key={s.id} style={{ padding: '9px 12px', borderTop: '1px solid var(--t-border)' }}>
                        <label htmlFor={`cs-${s.id}`} style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--t-textSub)', marginBottom: 5 }}>{s.name}</label>
                        <textarea id={`cs-${s.id}`} rows={3} value={scopes[s.id] || ''} disabled={!!busy}
                          onChange={e => { const v = e.target.value; setScopes(p => ({ ...p, [s.id]: v })) }}
                          placeholder="- Key idea or dot point from the course document" style={area} />
                      </div>
                    ))}
                  </details>
                )
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={save} disabled={!dirty || !!busy} style={btn('primary', !dirty || !!busy)}>{busy === 'save' ? 'Saving…' : 'Save scope'}</button>
            </div>
          </>
        )}
        {message && <div role="status" style={{ ...note('success'), marginTop: 12 }}>{message}</div>}
        {error && <div role="alert" style={{ ...note('danger'), marginTop: 12 }}>{error}</div>}
      </div>

      {/* 2 · check the bank */}
      <div style={box}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--t-text)', marginBottom: 4 }}>Check the bank against the course</div>
        <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', marginBottom: 12, maxWidth: '80ch' }}>
          AI reads every question this subject has, including any it borrows, and lists the ones that go outside the course scope. Questions students report as "not in my course" show up here too. Borrowed ones found off the course are hidden from this subject straight away and stay in their own subject.
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {auditing ? (
            <button type="button" onClick={() => { stopRef.current = true }} style={btn('secondary')}>Stop</button>
          ) : (
            <>
              <button type="button" onClick={() => runAudit(false)} disabled={!hasAnyScope} title={hasAnyScope ? undefined : 'Save the course scope first'} style={btn('primary', !hasAnyScope)}>
                {audit && audit.checked > 0 && audit.remaining === 0 ? 'Check new questions' : 'Check the bank'}
              </button>
              {audit && audit.checked > 0 && (
                <button type="button" onClick={() => runAudit(true)} style={btn('secondary')}>Check everything again</button>
              )}
            </>
          )}
          {audit && (
            <span role="status" style={{ fontSize: 13, color: 'var(--t-textSub)', fontVariantNumeric: 'tabular-nums' }}>
              {auditing ? 'Checking… ' : ''}{audit.checked.toLocaleString()} of {audit.total.toLocaleString()} checked · {audit.open} to review
            </span>
          )}
          {!hasAnyScope && loaded && <span style={{ fontSize: 12.5, color: 'var(--t-textMuted)' }}>Save the course scope first, so there's something to check against.</span>}
        </div>

        {review && (
          <>
            <div role="group" aria-label="Show" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {[['open', 'To review'], ['hidden', 'Hidden here'], ['kept', 'Kept']].map(([k, label]) => (
                <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} style={chip(show === k)}>{label} · {lists[k].length}</button>
              ))}
            </div>
            {shown.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--t-textMuted)', padding: '10px 2px' }}>
                {show === 'open' ? (audit?.checked ? 'Nothing to review. Every question checked so far is on the course.' : 'Nothing to review yet.') : 'None.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {shown.map(item => {
                  const q = item.question
                  const opts = Array.isArray(q.options) ? q.options : (() => { try { return JSON.parse(q.options || '[]') } catch { return [] } })()
                  const busyHere = acting === item.question_id
                  return (
                    <div key={item.question_id} style={{ border: '1px solid var(--t-border)', borderRadius: 9, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12, color: 'var(--t-textMuted)' }}>
                        <span style={{ fontWeight: 700 }}>{[q.topic, q.subtopic].filter(Boolean).join(' › ')}</span>
                        <span>· {item.source === 'student' ? 'Reported by a student' : 'Course check'}</span>
                        {item.borrowed && <span>· Borrowed from {item.from}</span>}
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--t-text)', fontWeight: 600 }}><MathText text={q.question || ''} /></div>
                      {opts.length > 0 && (
                        <ol type="A" style={{ margin: 0, paddingLeft: 22, fontSize: 13, color: 'var(--t-textSub)', display: 'grid', gap: 2 }}>
                          {opts.map((o, i) => <li key={i} style={{ fontWeight: i === q.answer_index ? 800 : 400 }}><MathText text={String(o)} /></li>)}
                        </ol>
                      )}
                      {item.reason && <div style={{ fontSize: 13, color: 'var(--t-danger)' }}>{item.reason}</div>}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {!item.borrowed && (
                          <button type="button" disabled={busyHere} onClick={() => resolve(item, 'delete')} style={btn('danger', busyHere)}>Delete question</button>
                        )}
                        {item.resolution !== 'hidden' && (
                          <button type="button" disabled={busyHere} onClick={() => resolve(item, 'hide')} style={btn('secondary', busyHere)}>Hide from this subject</button>
                        )}
                        {item.resolution !== 'kept' && (
                          <button type="button" disabled={busyHere} onClick={() => resolve(item, 'keep')} style={btn('secondary', busyHere)}>{item.resolution === 'hidden' ? 'Show it again' : "It's fine, keep it"}</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
