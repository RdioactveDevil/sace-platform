import { useState, useEffect, useRef } from 'react'
import { getTopicsBySubject, refreshManagedTopicsCache, getManagedSubjectNames } from '../lib/adminTopics'
import { adminApiPost } from '../lib/adminApi'
import { loadManagedCurriculaTopics, fetchLiveCurricula } from '../lib/curriculaDb'
import { supabase } from '../lib/supabase'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

const COUNTS = [5, 10, 20]
const DIFFICULTIES = [
  { value: 'mixed', label: 'Mixed (1–5)' },
  { value: '1',     label: '1 — Easy' },
  { value: '2',     label: '2' },
  { value: '3',     label: '3 — Medium' },
  { value: '4',     label: '4' },
  { value: '5',     label: '5 — Hard' },
]

// ── Group flat subtopic array by parent topic name ─────────────────────────────
function groupTopicsByParent(topics) {
  const groups = []
  const seen = {}
  for (const t of topics) {
    const key = t.topicName || 'General'
    if (!seen[key]) {
      seen[key] = { label: key, subtopics: [] }
      groups.push(seen[key])
    }
    seen[key].subtopics.push(t)
  }
  return groups
}

export default function AdminGenerateScreen() {
  const [subject,         setSubject]         = useState('')
  const [selectedCodes,   setSelectedCodes]   = useState(new Set())
  const [count,           setCount]           = useState(10)
  const [difficulty,      setDifficulty]      = useState('mixed')
  const [contextNotes,    setContextNotes]    = useState('')
  const [examContext,     setExamContext]      = useState('')
  const [loading,         setLoading]         = useState(false)
  const [elapsed,         setElapsed]         = useState(0)
  const [result,          setResult]          = useState(null)
  const [error,           setError]           = useState(null)
  const [managedSubjects, setManagedSubjects] = useState([])
  const [builtInSubjects, setBuiltInSubjects] = useState([])
  const [curriculumMap,   setCurriculumMap]   = useState({}) // name → { id, exam_context }
  const [showContext,     setShowContext]      = useState(false)
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
        // Build a map for quick lookup of exam_context per curriculum
        const map = {}
        curricula.forEach(c => { map[c.name] = c })
        setCurriculumMap(map)
        if (!subject && subjects.length > 0) {
          setSubject(subjects[0].id)
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch exam_context when subject changes
  useEffect(() => {
    if (!subject) return
    const fetchExamContext = async () => {
      const { data } = await supabase
        .from('curricula')
        .select('exam_context')
        .eq('name', subject)
        .maybeSingle()
      setExamContext(data?.exam_context || '')
    }
    fetchExamContext().catch(() => {})
  }, [subject])

  useEffect(() => {
    if (loading) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [loading])

  const topics      = getTopicsBySubject(subject)
  const topicGroups = groupTopicsByParent(topics)

  const handleSubjectChange = (s) => {
    setSubject(s)
    setSelectedCodes(new Set())
    setResult(null)
    setError(null)
    setExamContext('')
  }

  const toggleCode = (code) => {
    setSelectedCodes(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const toggleGroup = (group) => {
    const codes = group.subtopics.map(s => s.code)
    const allSelected = codes.every(c => selectedCodes.has(c))
    setSelectedCodes(prev => {
      const next = new Set(prev)
      codes.forEach(c => allSelected ? next.delete(c) : next.add(c))
      return next
    })
  }

  const selectAll = () => setSelectedCodes(new Set(topics.map(t => t.code)))
  const clearAll  = () => setSelectedCodes(new Set())

  const totalQuestionsToGenerate = selectedCodes.size * count

  const handleSubmit = async () => {
    if (selectedCodes.size === 0) return
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const isManaged = managedSubjects.includes(subject)
      const isBuiltIn = builtInSubjects.some(s => s.id === subject)
      const payload = {
        ...(isBuiltIn || isManaged ? { subject } : { stage: subject }),
        topicCodes: Array.from(selectedCodes),
        count,
        difficulty,
        ...(contextNotes.trim() ? { contextNotes } : {}),
      }

      const data = await adminApiPost('/api/generate-questions', payload)
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const selectStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: '#0c1037',
    color: '#fff', fontSize: 13, fontFamily: FONT_B, outline: 'none',
  }

  const filteredBuiltIn = builtInSubjects.filter(
    s => !managedSubjects.includes(s.label) && !managedSubjects.includes(s.id)
  )

  return (
    <div>
      <h2 style={{ color: '#fff', marginTop: 0 }}>Generate Questions</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
        Select a subject, tick the subtopics you want questions for, then let Claude generate MCQs.
        Questions land in the draft queue for your review.
      </p>

      {/* Subject */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subject</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filteredBuiltIn.map(s => (
            <button
              key={s.id}
              onClick={() => handleSubjectChange(s.id)}
              style={{
                padding: '8px 16px', borderRadius: 8,
                border: `1px solid ${subject === s.id ? GOLD : 'rgba(255,255,255,0.12)'}`,
                background: subject === s.id ? 'rgba(241,190,67,0.1)' : 'transparent',
                color: subject === s.id ? GOLD : 'rgba(255,255,255,0.5)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        {managedSubjects.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {managedSubjects.map(s => (
              <button
                key={s}
                onClick={() => handleSubjectChange(s)}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: `1px solid ${subject === s ? GOLD : 'rgba(255,255,255,0.12)'}`,
                  background: subject === s ? 'rgba(241,190,67,0.1)' : 'transparent',
                  color: subject === s ? GOLD : 'rgba(255,255,255,0.5)',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Topic Checkbox Tree */}
      {subject && topicGroups.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Topics &amp; Subtopics
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={selectAll}
                style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 5,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent', color: 'rgba(255,255,255,0.45)',
                  cursor: 'pointer', fontFamily: FONT_B,
                }}
              >
                Select all
              </button>
              <button
                onClick={clearAll}
                style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 5,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent', color: 'rgba(255,255,255,0.45)',
                  cursor: 'pointer', fontFamily: FONT_B,
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Selection summary pill */}
          {selectedCodes.size > 0 && (
            <div style={{
              marginBottom: 10, padding: '6px 12px', borderRadius: 8,
              background: 'rgba(241,190,67,0.08)', border: '1px solid rgba(241,190,67,0.2)',
              fontSize: 12, color: GOLD, fontFamily: FONT_B,
            }}>
              {selectedCodes.size} subtopic{selectedCodes.size !== 1 ? 's' : ''} selected
              — will generate {totalQuestionsToGenerate} questions total ({count} per subtopic)
            </div>
          )}

          <div style={{
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, overflow: 'hidden',
            maxHeight: 420, overflowY: 'auto',
          }}>
            {topicGroups.map((group, gi) => {
              const groupCodes = group.subtopics.map(s => s.code)
              const allGroupSelected = groupCodes.every(c => selectedCodes.has(c))
              const someGroupSelected = groupCodes.some(c => selectedCodes.has(c))

              return (
                <div key={group.label}>
                  {/* Topic group header */}
                  <div
                    onClick={() => toggleGroup(group)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 14px',
                      background: gi % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      cursor: 'pointer',
                    }}
                    title={`${allGroupSelected ? 'Deselect' : 'Select'} all in this topic`}
                  >
                    {/* Group checkbox indicator */}
                    <span style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${allGroupSelected ? GOLD : someGroupSelected ? GOLD : 'rgba(255,255,255,0.25)'}`,
                      background: allGroupSelected ? GOLD : someGroupSelected ? 'rgba(241,190,67,0.3)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: '#0c1037', fontWeight: 900,
                    }}>
                      {allGroupSelected ? '✓' : someGroupSelected ? '–' : ''}
                    </span>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: FONT_B }}>
                      {group.label}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: FONT_B }}>
                      {groupCodes.filter(c => selectedCodes.has(c)).length}/{groupCodes.length}
                    </span>
                  </div>

                  {/* Subtopic rows */}
                  {group.subtopics.map(subtopic => {
                    const checked = selectedCodes.has(subtopic.code)
                    return (
                      <label
                        key={subtopic.code}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          padding: '7px 14px 7px 30px',
                          background: checked ? 'rgba(241,190,67,0.04)' : 'transparent',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          cursor: 'pointer',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                        onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent' }}
                      >
                        {/* Custom checkbox */}
                        <span
                          onClick={e => { e.preventDefault(); toggleCode(subtopic.code) }}
                          style={{
                            width: 15, height: 15, borderRadius: 3, flexShrink: 0, marginTop: 1,
                            border: `2px solid ${checked ? GOLD : 'rgba(255,255,255,0.25)'}`,
                            background: checked ? GOLD : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, color: '#0c1037', fontWeight: 900, cursor: 'pointer',
                          }}
                        >
                          {checked ? '✓' : ''}
                        </span>
                        <span
                          onClick={() => toggleCode(subtopic.code)}
                          style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'baseline' }}
                        >
                          <span style={{ fontSize: 11, color: GOLD, fontFamily: FONT_B, fontWeight: 700, minWidth: 38, flexShrink: 0 }}>
                            {subtopic.code}
                          </span>
                          <span style={{ fontSize: 12, color: checked ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)', fontFamily: FONT_B, lineHeight: 1.4 }}>
                            {subtopic.name}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Count */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Questions per Subtopic
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {COUNTS.map(c => (
            <button
              key={c}
              onClick={() => setCount(c)}
              style={{
                padding: '8px 18px', borderRadius: 8,
                border: `1px solid ${count === c ? GOLD : 'rgba(255,255,255,0.12)'}`,
                background: count === c ? 'rgba(241,190,67,0.1)' : 'transparent',
                color: count === c ? GOLD : 'rgba(255,255,255,0.5)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Difficulty</label>
        <select value={difficulty} onChange={e => setDifficulty(e.target.value)} style={selectStyle}>
          {DIFFICULTIES.map(d => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>

      {/* Accuracy / Context section */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => setShowContext(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', padding: 0,
            cursor: 'pointer', fontFamily: FONT_B,
          }}
        >
          <span style={{
            fontSize: 11, width: 16, height: 16, borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.4)', flexShrink: 0,
          }}>
            {showContext ? '▲' : '▼'}
          </span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Accuracy &amp; Context
          </span>
          {(examContext || contextNotes) && (
            <span style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 10,
              background: 'rgba(241,190,67,0.15)', color: GOLD, fontWeight: 700,
            }}>
              {examContext && contextNotes ? '2 active' : '1 active'}
            </span>
          )}
        </button>

        {showContext && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Exam context from curriculum (read-only preview) */}
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, fontFamily: FONT_B }}>
                Curriculum exam scope (set in Curricula → Edit Curriculum)
              </label>
              {examContext ? (
                <div style={{
                  padding: '10px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.55,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                  color: 'rgba(255,255,255,0.5)', fontFamily: FONT_B,
                  maxHeight: 140, overflowY: 'auto', whiteSpace: 'pre-wrap',
                }}>
                  {examContext}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', fontFamily: FONT_B }}>
                  No exam context set for this curriculum. Add it in the Curricula tab to improve generation accuracy.
                </div>
              )}
            </div>

            {/* Per-request context override */}
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, fontFamily: FONT_B }}>
                Extra context for this batch (optional)
              </label>
              <textarea
                value={contextNotes}
                onChange={e => setContextNotes(e.target.value)}
                placeholder={'e.g. "Focus on SACE 2024 exam style — short calculation MCQs, no extended questions. Reference Nelson Chemistry Units 3 & 4 terminology."'}
                rows={4}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: '#0c1037', color: '#fff',
                  fontSize: 12, fontFamily: FONT_B, outline: 'none',
                  resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5,
                }}
              />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4, fontFamily: FONT_B }}>
                Paste exam syllabus excerpts, past-paper instructions, or textbook scope notes. Claude will use these to anchor question style and terminology.
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={selectedCodes.size === 0 || loading}
        style={{
          padding: '12px 28px', borderRadius: 10, border: 'none',
          background: (selectedCodes.size === 0 || loading) ? 'rgba(255,255,255,0.08)' : GOLD,
          color: (selectedCodes.size === 0 || loading) ? 'rgba(255,255,255,0.3)' : '#0c1037',
          fontSize: 14, fontWeight: 800,
          cursor: (selectedCodes.size === 0 || loading) ? 'not-allowed' : 'pointer',
          fontFamily: FONT_B,
        }}
      >
        {loading
          ? `Generating… ${elapsed}s`
          : selectedCodes.size === 0
            ? 'Select subtopics to generate'
            : `Generate ${totalQuestionsToGenerate} Questions (${selectedCodes.size} subtopic${selectedCodes.size !== 1 ? 's' : ''} × ${count})`
        }
      </button>

      {loading && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: FONT_B }}>
          {elapsed < 10
            ? 'Calling Claude API…'
            : elapsed < 30
            ? 'Claude is writing questions…'
            : elapsed < 60
            ? 'Almost there, parsing response…'
            : `Still working… (${elapsed}s — multiple subtopics can take ~90s)`}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <div style={{ color: '#4ade80', fontWeight: 700 }}>
            ✓ {result.inserted} question{result.inserted !== 1 ? 's' : ''} added to the draft queue
            {result.topicsProcessed > 1 && ` across ${result.topicsProcessed} subtopics`}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>
            Go to the Review Queue tab to approve them.
          </div>
          {result.errors?.length > 0 && (
            <div style={{ marginTop: 8, color: '#fbbf24', fontSize: 12 }}>
              Warnings: {result.errors.join(' | ')}
            </div>
          )}
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
