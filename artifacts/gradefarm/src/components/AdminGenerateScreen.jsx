import { useState, useEffect, useRef } from 'react'
import { getTopicsBySubject, refreshManagedTopicsCache, getManagedSubjectNames } from '../lib/adminTopics'
import { adminApiPost } from '../lib/adminApi'
import { loadManagedCurriculaTopics, fetchLiveCurricula } from '../lib/curriculaDb'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

const COUNTS = [5, 10, 20]
const DIFFICULTIES = [
  { value: 'mixed', label: 'Mixed (1–5)' },
  { value: '1', label: '1 — Easy' },
  { value: '2', label: '2' },
  { value: '3', label: '3 — Medium' },
  { value: '4', label: '4' },
  { value: '5', label: '5 — Hard' },
]

// Group flat topic list by parent topic name
function groupTopics(topics) {
  const groups = []
  const seen = {}
  for (const t of topics) {
    const parent = t.topicName || t.code.split('.')[0]
    if (!seen[parent]) {
      seen[parent] = { name: parent, subtopics: [] }
      groups.push(seen[parent])
    }
    seen[parent].subtopics.push(t)
  }
  return groups
}

export default function AdminGenerateScreen() {
  const [subject,         setSubject]         = useState('')
  const [selectedCodes,   setSelectedCodes]   = useState(new Set())
  const [count,           setCount]           = useState(10)
  const [difficulty,      setDifficulty]      = useState('mixed')
  const [extraTypes,      setExtraTypes]      = useState(new Set()) // formats beyond plain MCQ
  const [includeDiagrams, setIncludeDiagrams] = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [elapsed,         setElapsed]         = useState(0)
  const [result,          setResult]          = useState(null)
  const [error,           setError]           = useState(null)
  const [managedSubjects, setManagedSubjects] = useState([])
  const [builtInSubjects, setBuiltInSubjects] = useState([])
  const [expandedGroups,  setExpandedGroups]  = useState(new Set())
  const timerRef = useRef(null)

  useEffect(() => {
    refreshManagedTopicsCache(loadManagedCurriculaTopics)
      .then(() => setManagedSubjects(getManagedSubjectNames()))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchLiveCurricula()
      .then(curricula => {
        const subjects = curricula.map(c => ({ id: c.name, label: c.name }))
        setBuiltInSubjects(subjects)
        if (!subject && subjects.length > 0) setSubject(subjects[0].id)
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loading) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [loading])

  const topics = getTopicsBySubject(subject)
  const groups = groupTopics(topics)

  const handleSubjectChange = (s) => {
    setSubject(s)
    setSelectedCodes(new Set())
    setExpandedGroups(new Set())
    setResult(null)
    setError(null)
  }

  const toggleCode = (code) => {
    setSelectedCodes(prev => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
  }

  const toggleGroup = (groupName, subtopics) => {
    const codes = subtopics.map(t => t.code)
    const allSelected = codes.every(c => selectedCodes.has(c))
    setSelectedCodes(prev => {
      const next = new Set(prev)
      if (allSelected) codes.forEach(c => next.delete(c))
      else codes.forEach(c => next.add(c))
      return next
    })
  }

  const toggleExpanded = (groupName) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(groupName) ? next.delete(groupName) : next.add(groupName)
      return next
    })
  }

  const selectAll = () => setSelectedCodes(new Set(topics.map(t => t.code)))
  const clearAll  = () => setSelectedCodes(new Set())

  const handleSubmit = async () => {
    if (!selectedCodes.size) return
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const isManaged = managedSubjects.includes(subject)
      const isBuiltIn = builtInSubjects.some(s => s.id === subject)
      const topicCodes = Array.from(selectedCodes)

      // Only send questionTypes when the admin opted into richer formats, so
      // the default request stays byte-identical to the MCQ-only flow.
      const questionTypes = extraTypes.size ? ['mcq', ...Array.from(extraTypes)] : undefined

      const extras = {
        ...(questionTypes ? { questionTypes } : {}),
        ...(includeDiagrams ? { includeDiagrams: true } : {}),
      }
      const payload = (isBuiltIn || isManaged)
        ? { subject, topicCodes, count, difficulty, ...extras }
        : { stage: subject, topicCodes, count, difficulty, ...extras }

      const data = await adminApiPost('/api/generate-questions', payload)
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredBuiltIn = builtInSubjects.filter(
    s => !managedSubjects.includes(s.label) && !managedSubjects.includes(s.id)
  )

  const totalQuestions = selectedCodes.size * count

  const selectStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: '#0c1037', color: '#fff', fontSize: 13, fontFamily: FONT_B, outline: 'none',
  }

  const chipBtn = (active) => ({
    padding: '8px 16px', borderRadius: 8,
    border: `1px solid ${active ? GOLD : 'rgba(255,255,255,0.12)'}`,
    background: active ? 'rgba(241,190,67,0.1)' : 'transparent',
    color: active ? GOLD : 'rgba(255,255,255,0.5)',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
  })

  return (
    <div>
      <h2 style={{ color: '#fff', marginTop: 0 }}>Generate Questions</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
        Pick a subject and one or more subtopics, then let Claude generate MCQs. They land in the draft queue for your review.
      </p>

      {/* Subject */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subject</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filteredBuiltIn.map(s => (
            <button key={s.id} onClick={() => handleSubjectChange(s.id)} style={chipBtn(subject === s.id)}>{s.label}</button>
          ))}
        </div>
        {managedSubjects.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {managedSubjects.map(s => (
              <button key={s} onClick={() => handleSubjectChange(s)} style={chipBtn(subject === s)}>{s}</button>
            ))}
          </div>
        )}
      </div>

      {/* Topic checkbox tree */}
      {groups.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Topics</label>
            <button onClick={selectAll} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, padding: 0 }}>Select all</button>
            <button onClick={clearAll}  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B, padding: 0 }}>Clear</button>
            {selectedCodes.size > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 12, color: GOLD, fontWeight: 700 }}>
                {selectedCodes.size} subtopic{selectedCodes.size !== 1 ? 's' : ''} · {totalQuestions} questions total
              </span>
            )}
          </div>

          <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden' }}>
            {groups.map((group, gi) => {
              const groupCodes = group.subtopics.map(t => t.code)
              const allSel  = groupCodes.every(c => selectedCodes.has(c))
              const someSel = groupCodes.some(c => selectedCodes.has(c))
              const expanded = expandedGroups.has(group.name)

              return (
                <div key={group.name} style={{ borderBottom: gi < groups.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                  {/* Group header row */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', cursor: 'pointer' }}
                    onClick={() => toggleExpanded(group.name)}
                  >
                    {/* group checkbox */}
                    <div
                      onClick={e => { e.stopPropagation(); toggleGroup(group.name, group.subtopics) }}
                      style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        border: `2px solid ${allSel ? GOLD : someSel ? GOLD : 'rgba(255,255,255,0.25)'}`,
                        background: allSel ? GOLD : someSel ? 'rgba(241,190,67,0.3)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      {(allSel || someSel) && <span style={{ color: allSel ? '#0c1037' : GOLD, fontSize: 10, fontWeight: 900, lineHeight: 1 }}>{allSel ? '✓' : '−'}</span>}
                    </div>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, flex: 1 }}>{group.name}</span>
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
                      {someSel ? `${groupCodes.filter(c => selectedCodes.has(c)).length}/${group.subtopics.length}` : group.subtopics.length} subtopics
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                  </div>

                  {/* Subtopics */}
                  {expanded && (
                    <div style={{ paddingBottom: 4 }}>
                      {group.subtopics.map(t => {
                        const checked = selectedCodes.has(t.code)
                        return (
                          <div
                            key={t.code}
                            onClick={() => toggleCode(t.code)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '8px 14px 8px 40px',
                              cursor: 'pointer',
                              background: checked ? 'rgba(241,190,67,0.04)' : 'transparent',
                            }}
                          >
                            <div style={{
                              width: 15, height: 15, borderRadius: 3, flexShrink: 0,
                              border: `2px solid ${checked ? GOLD : 'rgba(255,255,255,0.2)'}`,
                              background: checked ? GOLD : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {checked && <span style={{ color: '#0c1037', fontSize: 9, fontWeight: 900 }}>✓</span>}
                            </div>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 700, minWidth: 36 }}>{t.code}</span>
                            <span style={{ color: checked ? '#fff' : 'rgba(255,255,255,0.65)', fontSize: 13 }}>{t.name}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Count */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Questions per Subtopic</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {COUNTS.map(c => (
            <button key={c} onClick={() => setCount(c)} style={chipBtn(count === c)}>{c}</button>
          ))}
        </div>
        {selectedCodes.size > 1 && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
            {selectedCodes.size} subtopics × {count} = {totalQuestions} questions total
          </div>
        )}
      </div>

      {/* Difficulty */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Difficulty</label>
        <select value={difficulty} onChange={e => setDifficulty(e.target.value)} style={selectStyle}>
          {DIFFICULTIES.map(d => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>

      {/* Question formats — opt into types beyond plain multiple choice */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Question formats</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: 'rgba(241,190,67,0.16)', border: '1px solid rgba(241,190,67,0.4)', color: GOLD }}>
            Multiple choice ✓
          </span>
          {[
            { id: 'multi_select', label: 'Multiple select' },
            { id: 'numeric',      label: 'Numeric answer' },
            { id: 'short_text',   label: 'Short answer' },
            { id: 'order',        label: 'Put in order' },
          ].map(tp => {
            const on = extraTypes.has(tp.id)
            return (
              <button
                key={tp.id}
                onClick={() => setExtraTypes(prev => {
                  const next = new Set(prev)
                  next.has(tp.id) ? next.delete(tp.id) : next.add(tp.id)
                  return next
                })}
                style={{
                  padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
                  background: on ? 'rgba(241,190,67,0.16)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${on ? 'rgba(241,190,67,0.4)' : 'rgba(255,255,255,0.12)'}`,
                  color: on ? GOLD : 'rgba(255,255,255,0.6)',
                }}
              >{on ? `${tp.label} ✓` : tp.label}</button>
            )
          })}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: FONT_B }}>
          {extraTypes.size
            ? 'Claude will mix these formats with multiple choice. (~half stay MCQ.)'
            : 'Multiple choice only. Enable extra formats to generate a varied mix.'}
        </div>
        <button
          onClick={() => setIncludeDiagrams(v => !v)}
          style={{
            marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 9, padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: FONT_B, fontSize: 13, fontWeight: 700,
            background: includeDiagrams ? 'rgba(241,190,67,0.16)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${includeDiagrams ? 'rgba(241,190,67,0.4)' : 'rgba(255,255,255,0.12)'}`,
            color: includeDiagrams ? GOLD : 'rgba(255,255,255,0.6)',
          }}
        >
          <span style={{ fontSize: 15 }}>{includeDiagrams ? '☑' : '☐'}</span>
          Auto-draw diagrams (AI vector figures — no upload)
        </button>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!selectedCodes.size || loading}
        style={{
          padding: '12px 28px', borderRadius: 10, border: 'none',
          background: (!selectedCodes.size || loading) ? 'rgba(255,255,255,0.08)' : GOLD,
          color: (!selectedCodes.size || loading) ? 'rgba(255,255,255,0.3)' : '#0c1037',
          fontSize: 14, fontWeight: 800,
          cursor: (!selectedCodes.size || loading) ? 'not-allowed' : 'pointer',
          fontFamily: FONT_B,
        }}
      >
        {loading
          ? `Generating… ${elapsed}s`
          : selectedCodes.size === 0
          ? 'Select topics to generate'
          : selectedCodes.size === 1
          ? `Generate ${count} Questions`
          : `Generate ${totalQuestions} Questions (${selectedCodes.size} × ${count})`}
      </button>

      {loading && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: FONT_B }}>
          {elapsed < 10
            ? 'Calling Claude API…'
            : elapsed < 30
            ? 'Claude is writing questions…'
            : elapsed < 60
            ? 'Almost there, parsing response…'
            : `Still working… (${elapsed}s — large batches can take ~2 min)`}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <div style={{ color: '#4ade80', fontWeight: 700 }}>✓ {result.inserted} questions added to the draft queue</div>
          {result.topicsProcessed > 1 && (
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>{result.topicsProcessed} subtopics processed</div>
          )}
          {result.errors?.length > 0 && (
            <div style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{result.errors.length} subtopic(s) had errors: {result.errors.join(', ')}</div>
          )}
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>Go to the Review Queue tab to approve them.</div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  )
}
