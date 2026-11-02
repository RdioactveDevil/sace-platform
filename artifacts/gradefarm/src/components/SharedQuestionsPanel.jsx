import { useState, useEffect, useMemo } from 'react'
import { adminApiPost } from '../lib/adminApi'
import { ui, btn, note, FONT_B } from '../lib/adminUi'

// In a subject's editor: borrow questions from another subject, a subtopic
// at a time (api-server routes/subtopic-links.ts). Pick the subject to borrow
// from, match each of this subject's subtopics to one of its subtopics (or
// let AI suggest the matches), and save. This subject's students then also get
// those questions, under this subject's subtopics. The questions stay in the
// other subject, so fixing one fixes it in both.

const selectStyle = {
  padding: '7px 9px', borderRadius: 8, border: '1px solid var(--t-border)', background: 'var(--t-bgInput)',
  color: 'var(--t-text)', fontSize: 13, fontFamily: FONT_B, outline: 'none', width: '100%', minWidth: 0,
}

export default function SharedQuestionsPanel({ curriculumId }) {
  const [state, setState] = useState(null)      // { subtopics, links, subjects }
  const [sourceId, setSourceId] = useState('')
  const [source, setSource] = useState(null)    // { subtopics: [{ id, name, topic, questions }] }
  const [picks, setPicks] = useState({})        // subtopicId -> sourceSubtopicId | ''
  const [saved, setSaved] = useState({})        // the same, as last saved
  const [busy, setBusy] = useState('')          // 'load' | 'suggest' | 'save'
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    adminApiPost('/api/admin/subtopic-links/state', { curriculumId })
      .then(d => {
        if (cancelled) return
        setState(d)
        // Open on the subject most of the current links point to.
        const tally = {}
        for (const l of d.links) if (l.sourceCurriculumId) tally[l.sourceCurriculumId] = (tally[l.sourceCurriculumId] || 0) + 1
        const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0]
        if (top) setSourceId(top)
      })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [curriculumId])

  // Load the subject to borrow from, and this subject's links to it.
  useEffect(() => {
    if (!sourceId || !state) { setSource(null); return undefined }
    let cancelled = false
    setBusy('load'); setError(''); setMessage('')
    adminApiPost('/api/admin/subtopic-links/source', { curriculumId: sourceId })
      .then(d => {
        if (cancelled) return
        setSource(d)
        const theirs = new Set(d.subtopics.map(s => s.id))
        const p = Object.fromEntries(state.subtopics.map(s => [s.id, '']))
        for (const l of state.links) if (theirs.has(l.sourceSubtopicId) && p[l.subtopicId] === '') p[l.subtopicId] = l.sourceSubtopicId
        setPicks(p); setSaved(p)
      })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setBusy('') })
    return () => { cancelled = true }
    // Only when the subject changes (or first loads): saving updates state.links without reloading.
  }, [sourceId, state ? 'ready' : '']) // eslint-disable-line react-hooks/exhaustive-deps

  const byTopic = (subs) => {
    const out = []
    for (const s of subs) {
      const last = out[out.length - 1]
      if (last && last.topic === s.topic) last.items.push(s)
      else out.push({ topic: s.topic, items: [s] })
    }
    return out
  }
  const sourceById = useMemo(() => Object.fromEntries((source?.subtopics || []).map(s => [s.id, s])), [source])
  const linked = Object.values(picks).filter(Boolean)
  const borrowedCount = linked.reduce((a, id) => a + (sourceById[id]?.questions || 0), 0)
  const dirty = Object.keys(picks).some(k => (picks[k] || '') !== (saved[k] || ''))

  const suggest = async () => {
    setBusy('suggest'); setError(''); setMessage('')
    try {
      const { matches } = await adminApiPost('/api/admin/subtopic-links/suggest', { curriculumId, sourceCurriculumId: sourceId })
      const next = { ...picks }
      for (const m of matches) next[m.subtopicId] = m.sourceSubtopicId || ''
      setPicks(next)
      const n = matches.filter(m => m.sourceSubtopicId).length
      setMessage(`AI matched ${n} of ${state.subtopics.length} subtopics. Check them, change any that are wrong, then save.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  const save = async () => {
    setBusy('save'); setError(''); setMessage('')
    try {
      const links = state.subtopics.map(s => ({ subtopicId: s.id, sourceSubtopicId: picks[s.id] || null }))
      const r = await adminApiPost('/api/admin/subtopic-links/save', { curriculumId, sourceCurriculumId: sourceId, links })
      setSaved(picks)
      // Keep the loaded links in step, so switching subjects and back shows what's saved.
      setState(prev => ({
        ...prev,
        links: [
          ...prev.links.filter(l => !sourceById[l.sourceSubtopicId]),
          ...links.filter(l => l.sourceSubtopicId).map(l => ({ ...l, sourceCurriculumId: sourceId })),
        ],
      }))
      setMessage(r.links ? `Saved. ${r.links} subtopic${r.links === 1 ? '' : 's'} now borrow ${borrowedCount.toLocaleString()} questions.` : 'Saved. Nothing is borrowed from that subject now.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  const subjects = (state?.subjects || []).filter(s => !s.archived || s.id === sourceId)

  return (
    <div style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 10, background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', fontFamily: FONT_B }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--t-text)', marginBottom: 4 }}>Share questions from another subject</div>
      <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', marginBottom: 12, maxWidth: '78ch' }}>
        Match this subject's subtopics to another subject's, and students here also get those questions. They stay in the other subject, so a fix shows in both, and a student's history for a question is the same in each.
      </div>

      {!state && !error && <div style={{ fontSize: 13, color: 'var(--t-textMuted)' }} role="status">Loading…</div>}
      {state && !state.subtopics.length && <div style={{ fontSize: 13, color: 'var(--t-textMuted)' }}>Add topics and subtopics to this subject first.</div>}

      {state && state.subtopics.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <div style={{ flex: '1 1 260px', maxWidth: 420 }}>
              <label htmlFor="sq-source" style={ui.label}>Borrow from</label>
              <select id="sq-source" value={sourceId} onChange={e => setSourceId(e.target.value)} style={selectStyle} disabled={!!busy}>
                <option value="">Choose a subject…</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}{s.level ? ` · ${s.level}` : ''}{s.archived ? ' (archived)' : ''}</option>)}
              </select>
            </div>
            {sourceId && source && (
              <button type="button" onClick={suggest} disabled={!!busy} style={btn('secondary', !!busy)}>
                {busy === 'suggest' ? 'Matching…' : 'Suggest matches with AI'}
              </button>
            )}
          </div>

          {busy === 'load' && <div style={{ fontSize: 13, color: 'var(--t-textMuted)' }} role="status">Loading that subject's subtopics…</div>}

          {sourceId && source && busy !== 'load' && (
            <>
              <div style={{ border: '1px solid var(--t-border)', borderRadius: 9, overflow: 'hidden', marginBottom: 12 }}>
                {byTopic(state.subtopics).map(g => (
                  <div key={g.topic}>
                    <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 800, color: 'var(--t-textMuted)', background: 'var(--t-bgSubtle)', borderBottom: '1px solid var(--t-border)' }}>{g.topic || 'No topic'}</div>
                    {g.items.map(s => {
                      const pick = picks[s.id] || ''
                      return (
                        <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr) 70px', gap: 10, alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--t-border)' }}>
                          <label htmlFor={`sq-${s.id}`} style={{ fontSize: 13, color: 'var(--t-text)', fontWeight: 600, minWidth: 0 }}>{s.name}</label>
                          <select id={`sq-${s.id}`} value={pick} onChange={e => setPicks(p => ({ ...p, [s.id]: e.target.value }))} style={selectStyle} disabled={!!busy}>
                            <option value="">Don't borrow</option>
                            {byTopic(source.subtopics).map(sg => (
                              <optgroup key={sg.topic} label={sg.topic || 'No topic'}>
                                {sg.items.map(x => <option key={x.id} value={x.id}>{x.name} ({x.questions})</option>)}
                              </optgroup>
                            ))}
                          </select>
                          <span style={{ fontSize: 12, color: pick ? 'var(--t-text)' : 'var(--t-textFaint)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {pick ? `+${(sourceById[pick]?.questions || 0).toLocaleString()}` : '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--t-textSub)' }}>
                  {linked.length} of {state.subtopics.length} subtopics borrow · {borrowedCount.toLocaleString()} questions
                </span>
                <button type="button" onClick={save} disabled={!dirty || !!busy} style={{ ...btn('primary', !dirty || !!busy), marginLeft: 'auto' }}>
                  {busy === 'save' ? 'Saving…' : 'Save matches'}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {message && <div role="status" style={{ ...note('success'), marginTop: 12 }}>{message}</div>}
      {error && <div role="alert" style={{ ...note('danger'), marginTop: 12 }}>{error}</div>}
    </div>
  )
}
