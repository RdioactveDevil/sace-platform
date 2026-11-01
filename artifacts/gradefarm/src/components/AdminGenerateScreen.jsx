import { useState, useEffect, useRef } from 'react'
import { getTopicsBySubject, refreshManagedTopicsCache, getManagedSubjectNames } from '../lib/adminTopics'
import { adminApiPost } from '../lib/adminApi'
import { loadManagedCurriculaTopics, fetchLiveCurricula } from '../lib/curriculaDb'
import { Check as CheckIcon, ChevronRight } from 'lucide-react'
import { ui, chip, btn, note, FONT_B } from '../lib/adminUi'

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
  const [examGrade,       setExamGrade]       = useState(false) // stronger model, hard + graph questions
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
        ...(examGrade ? { examGrade: true, includeGraphs: true, difficulty: 5 } : {}),
      }
      const payload = (isBuiltIn || isManaged)
        ? { subject, topicCodes, count, difficulty, ...extras }
        : { stage: subject, topicCodes, count, difficulty, ...extras }
      if (examGrade && topicCodes.length > 4) throw new Error('Exam-grade takes up to 4 subtopics at a time.')

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
  const section = { display: 'flex', flexDirection: 'column', gap: 6 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: FONT_B }}>
      <p style={{ ...ui.hint, fontSize: 13, margin: 0 }}>AI writes questions for the subtopics you pick. They go to the review queue, and students see them once you approve them.</p>

      {/* Subject */}
      <div style={section}>
        <span style={ui.label}>Subject</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[...filteredBuiltIn.map(s => [s.id, s.label]), ...managedSubjects.map(s => [s, s])].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={subject === id} onClick={() => handleSubjectChange(id)} style={chip(subject === id)}>{label}</button>
          ))}
        </div>
      </div>

      {/* Topic checkbox tree */}
      {groups.length > 0 && (
        <div style={section}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ ...ui.label, marginBottom: 0 }}>Topics</span>
            <button type="button" onClick={selectAll} style={linkBtn}>Select all</button>
            <button type="button" onClick={clearAll} style={{ ...linkBtn, color: 'var(--t-textMuted)' }}>Clear</button>
            {selectedCodes.size > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--t-textSub)', fontWeight: 700 }}>
                {selectedCodes.size} subtopic{selectedCodes.size !== 1 ? 's' : ''} · {totalQuestions} questions
              </span>
            )}
          </div>

          <div style={{ ...ui.card, overflow: 'hidden' }}>
            {groups.map((group, gi) => {
              const groupCodes = group.subtopics.map(t => t.code)
              const allSel  = groupCodes.every(c => selectedCodes.has(c))
              const someSel = groupCodes.some(c => selectedCodes.has(c))
              const expanded = expandedGroups.has(group.name)

              return (
                <div key={group.name} style={{ borderBottom: gi < groups.length - 1 ? '1px solid var(--t-border)' : 'none' }}>
                  <div
                    role="button" tabIndex={0} aria-expanded={expanded}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
                    onClick={() => toggleExpanded(group.name)}
                    onKeyDown={e => { if (e.key === 'Enter') toggleExpanded(group.name) }}
                  >
                    <Check on={allSel} partial={!allSel && someSel} label={`All of ${group.name}`}
                      onClick={e => { e.stopPropagation(); toggleGroup(group.name, group.subtopics) }} />
                    <span style={{ color: 'var(--t-text)', fontSize: 13.5, fontWeight: 700, flex: 1 }}>{group.name}</span>
                    <span style={{ color: 'var(--t-textMuted)', fontSize: 12 }}>
                      {someSel ? `${groupCodes.filter(c => selectedCodes.has(c)).length} of ${group.subtopics.length}` : group.subtopics.length} subtopics
                    </span>
                    <ChevronRight size={15} aria-hidden="true" style={{ color: 'var(--t-textMuted)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                  </div>

                  {expanded && (
                    <div style={{ paddingBottom: 6 }}>
                      {group.subtopics.map(t => {
                        const checked = selectedCodes.has(t.code)
                        return (
                          <div key={t.code} role="checkbox" aria-checked={checked} tabIndex={0}
                            onClick={() => toggleCode(t.code)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleCode(t.code) } }}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px 7px 40px', cursor: 'pointer' }}>
                            <Check on={checked} />
                            <span style={{ color: 'var(--t-textMuted)', fontSize: 12, fontWeight: 700, minWidth: 36, fontVariantNumeric: 'tabular-nums' }}>{t.code}</span>
                            <span style={{ color: checked ? 'var(--t-text)' : 'var(--t-textSub)', fontSize: 13 }}>{t.name}</span>
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

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* Count */}
        <div style={section}>
          <span style={ui.label}>Questions per subtopic</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {COUNTS.map(c => (
              <button key={c} type="button" aria-pressed={count === c} onClick={() => setCount(c)} style={chip(count === c)}>{c}</button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div style={section}>
          <label htmlFor="gen-difficulty" style={ui.label}>Difficulty</label>
          <select id="gen-difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value)} style={{ ...ui.input, minWidth: 180 }}>
            {DIFFICULTIES.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Question formats: opt into types beyond plain multiple choice */}
      <div style={section}>
        <span style={ui.label}>Question formats</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ ...chip(true), cursor: 'default' }} title="Always included">Multiple choice</span>
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
                type="button"
                aria-pressed={on}
                onClick={() => setExtraTypes(prev => {
                  const next = new Set(prev)
                  next.has(tp.id) ? next.delete(tp.id) : next.add(tp.id)
                  return next
                })}
                style={chip(on)}
              >{tp.label}</button>
            )
          })}
        </div>
        <div style={ui.hint}>
          {extraTypes.size
            ? 'About half stay multiple choice; the rest use the formats you picked.'
            : 'Multiple choice only. Pick more formats for a mix.'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Toggle on={includeDiagrams} onClick={() => setIncludeDiagrams(v => !v)}
          title="Draw diagrams" hint="AI draws vector figures where a question needs one. No upload needed." />
        <Toggle on={examGrade} onClick={() => setExamGrade(v => !v)}
          title="Exam grade" hint={examGrade
            ? 'Uses the strongest model: difficulty 4 to 5 multiple choice, graphs wherever the topic allows, up to 3 questions per subtopic and 4 subtopics per run. Questions that fail a strict answer check are dropped. Slower and costs more per question.'
            : 'The hardest questions, with graphs. Slower and costs more.'} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={handleSubmit} disabled={!selectedCodes.size || loading} style={btn('primary', !selectedCodes.size || loading)}>
          {loading
            ? `Generating… ${elapsed}s`
            : selectedCodes.size === 0
            ? 'Pick topics to generate'
            : `Generate ${totalQuestions} question${totalQuestions === 1 ? '' : 's'}`}
        </button>
        {loading && (
          <span style={ui.hint}>
            {elapsed < 10 ? 'Starting…' : elapsed < 30 ? 'Writing questions…' : elapsed < 60 ? 'Checking answers…' : `Still working. Large batches can take about 2 minutes.`}
          </span>
        )}
      </div>

      {result && (
        <div role="status" style={note('success')}>
          <div style={{ fontWeight: 700 }}>{result.inserted} question{result.inserted === 1 ? '' : 's'} added to the review queue{result.topicsProcessed > 1 ? ` from ${result.topicsProcessed} subtopics` : ''}.</div>
          {result.errors?.length > 0 && (
            <div style={{ color: 'var(--t-danger)', marginTop: 4 }}>{result.errors.length} subtopic{result.errors.length === 1 ? '' : 's'} failed: {result.errors.join(', ')}</div>
          )}
          <div style={{ color: 'var(--t-textSub)', marginTop: 4 }}>Approve them in Review queue before students see them.</div>
        </div>
      )}

      {error && <div role="alert" style={note('danger')}>{error}</div>}
    </div>
  )
}

const linkBtn = { background: 'none', border: 'none', color: 'var(--t-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, padding: 0, textDecoration: 'underline', textDecorationColor: 'var(--t-accent)', textUnderlineOffset: 3 }

/** A small checkbox mark: ink when on, a dash when partly on. */
function Check({ on, partial = false, onClick, label }) {
  return (
    <span role={onClick ? 'checkbox' : undefined} aria-checked={onClick ? (partial ? 'mixed' : on) : undefined} aria-label={label}
      onClick={onClick}
      style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: `1.5px solid ${on || partial ? 'var(--t-text)' : 'var(--t-borderStrong)'}`, background: on ? 'var(--t-text)' : 'transparent', cursor: 'pointer' }}>
      {on && <CheckIcon size={11} strokeWidth={3} style={{ color: 'var(--t-bg)' }} aria-hidden="true" />}
      {partial && <span style={{ width: 8, height: 2, borderRadius: 1, background: 'var(--t-text)' }} />}
    </span>
  )
}

/** An on/off option with a title and a line of explanation. */
function Toggle({ on, onClick, title, hint }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: FONT_B, maxWidth: 640 }}>
      <span style={{ marginTop: 2 }}><Check on={on} /></span>
      <span>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--t-text)' }}>{title}</span>
        <span style={{ display: 'block', ...ui.hint }}>{hint}</span>
      </span>
    </button>
  )
}
