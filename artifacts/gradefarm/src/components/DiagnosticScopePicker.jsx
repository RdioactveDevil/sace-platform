import { useState, useEffect } from 'react'
import { THEMES } from '../lib/theme'
import { fetchSubjectTopics } from '../lib/db'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

// ── What an invited subject's diagnostic covers: all topics, or the ones picked ──
export default function DiagnosticScopePicker({ subject, selected, onChange, theme, defaultOpen = false }) {
  const t = THEMES[theme]
  const [open, setOpen] = useState(defaultOpen)
  const [topics, setTopics] = useState(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState({}) // topicId: bool
  useEffect(() => {
    if (!open || topics || !subject) return
    fetchSubjectTopics(subject.id).then(setTopics).catch(e => setError(e.message || 'Could not load the topics.'))
  }, [open, topics, subject])
  if (!subject) return null

  const chosen = new Set(selected)
  const setTopic = (topic, on) => {
    const ids = topic.subtopics.map(st => st.id)
    onChange(on ? [...new Set([...selected, ...ids])] : selected.filter(id => !ids.includes(id)))
  }
  const toggleSub = (id) => onChange(chosen.has(id) ? selected.filter(x => x !== id) : [...selected, id])
  const summary = selected.length ? `${selected.length} subtopic${selected.length === 1 ? '' : 's'}` : 'All topics'

  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: '8px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{subject.label}</span>
        <span style={{ fontSize: 12, color: t.textMuted }}>· Diagnostic covers: {summary}</span>
        <button type="button" onClick={() => setOpen(o => !o)}
          style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 7, border: `1px solid ${open ? 'var(--t-text)' : t.border}`, background: 'transparent', color: open ? 'var(--t-text)' : t.textSub, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
          {open ? 'Done' : 'Choose topics'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
          {error && <div style={{ fontSize: 12, color: t.danger }}>{error}</div>}
          {!topics && !error && <div style={{ fontSize: 12, color: t.textMuted }}>Loading topics…</div>}
          {topics?.length === 0 && <div style={{ fontSize: 12, color: t.textMuted }}>This subject has no topics yet, so the diagnostic covers the whole subject.</div>}
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: t.textSub, fontSize: 11, cursor: 'pointer', padding: 0, fontFamily: FONT_B, textDecoration: 'underline' }}>
              Back to all topics
            </button>
          )}
          {topics?.map(topic => {
            const ids = topic.subtopics.map(st => st.id)
            const count = ids.filter(id => chosen.has(id)).length
            return (
              <div key={topic.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" disabled={!ids.length} checked={ids.length > 0 && count === ids.length}
                    ref={el => { if (el) el.indeterminate = count > 0 && count < ids.length }}
                    onChange={e => setTopic(topic, e.target.checked)} aria-label={topic.name} style={{ accentColor: 'var(--t-text)' }} />
                  <button type="button" onClick={() => setExpanded(x => ({ ...x, [topic.id]: !x[topic.id] }))} disabled={!ids.length}
                    style={{ border: 'none', background: 'transparent', color: t.text, fontSize: 12, fontWeight: 600, cursor: ids.length ? 'pointer' : 'default', padding: 0, fontFamily: FONT_B, textAlign: 'left' }}>
                    {topic.name}{ids.length ? ` (${count ? `${count}/` : ''}${ids.length}) ${expanded[topic.id] ? '▾' : '▸'}` : ''}
                  </button>
                </div>
                {expanded[topic.id] && (
                  <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                    {topic.subtopics.map(st => (
                      <label key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: t.textSub, cursor: 'pointer' }}>
                        <input type="checkbox" checked={chosen.has(st.id)} onChange={() => toggleSub(st.id)} style={{ accentColor: 'var(--t-text)' }} />
                        {st.name}
                      </label>
                    ))}
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
