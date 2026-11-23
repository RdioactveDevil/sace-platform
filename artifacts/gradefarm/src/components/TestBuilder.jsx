import { useState, useEffect, Fragment } from 'react'
import { Bot } from 'lucide-react'
import { THEMES } from '../lib/theme'
import MathText from './MathText'
import DiagnosticScopePicker from './DiagnosticScopePicker'
import { fetchLiveCurricula } from '../lib/curriculaDb'
import { dbDiagnosticSubject } from '../lib/diagnosticSubjects'
import { generateDiagnosticQuestions, generateShortAnswers, fetchSubjectTopics } from '../lib/db'
import { isEnglishOnly, buildTimedTest } from '../lib/timedDiagnostic'
import { YEAR_LEVEL_GROUPS, ALL_DIAGNOSTIC_SUBJECTS, getSubjectsForYearLevel } from '../lib/diagnosticTestScope'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

export const DIFF_LABEL = { easy: 'Foundation', moderate: 'Core', exam: 'Exam style' }

/**
 * What a test covers (year level, subject, topics, writing type), shared by the
 * Diagnostic tab's create form, New consultation and "Send a test". Built-in
 * subjects are merged with the curriculum database's.
 */
export function useTestScope() {
  const [mergedSubjects, setMergedSubjects] = useState(ALL_DIAGNOSTIC_SUBJECTS)
  useEffect(() => {
    let cancelled = false
    fetchLiveCurricula()
      .then(curricula => {
        if (cancelled) return
        const builtInNames = new Set(ALL_DIAGNOSTIC_SUBJECTS.map(s => s.name.toLowerCase()))
        const dynamic = curricula
          .filter(c => !builtInNames.has(c.name.toLowerCase()))
          .map(dbDiagnosticSubject)
        setMergedSubjects([...ALL_DIAGNOSTIC_SUBJECTS, ...dynamic])
      })
      .catch(() => { /* fall back to static list already set */ })
    return () => { cancelled = true }
  }, [])

  const [yearLevel, setYearLevel] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedTopics, setSelectedTopics] = useState([])
  const [selectedSubtopicIds, setSelectedSubtopicIds] = useState([]) // database subjects; none = whole subject
  const [writingType, setWritingType] = useState('paragraph')

  const availableSubjects = getSubjectsForYearLevel(yearLevel, mergedSubjects)
  const selectedSubject = availableSubjects.find(s => s.id === selectedSubjectId)

  const changeYear = (v) => { setYearLevel(v); setSelectedSubjectId(''); setSelectedTopics([]); setSelectedSubtopicIds([]) }
  const changeSubject = (v) => { setSelectedSubjectId(v); setSelectedTopics([]); setSelectedSubtopicIds([]) }
  const toggleTopic = (topic) => {
    setSelectedTopics(prev => (prev.includes(topic) ? prev.filter(x => x !== topic) : [...prev, topic]))
  }

  // What the test covers, as sent to the server. A database subject sends its
  // curriculum and the chosen subtopics (none = the whole subject).
  const buildConfig = () => selectedSubject.fromDb
    ? { name: selectedSubject.name, topics: selectedSubject.topics, curriculumId: selectedSubject.curriculumId, subtopicIds: selectedSubtopicIds }
    : { name: selectedSubject.name, topics: selectedTopics, ...(selectedSubject.isWriting ? { writingType } : {}) }

  /** The first thing missing before a test can be generated, or ''. */
  const validate = () => {
    if (!yearLevel) return 'Please select a year level.'
    if (!selectedSubjectId) return 'Please select a subject.'
    if (!selectedSubject.fromDb && selectedTopics.length === 0) return 'Please select at least one topic.'
    return ''
  }

  const reset = () => {
    setYearLevel('')
    setSelectedSubjectId('')
    setSelectedTopics([])
    setSelectedSubtopicIds([])
    setWritingType('paragraph')
  }

  return {
    yearLevel, selectedSubjectId, selectedTopics, selectedSubtopicIds, writingType,
    availableSubjects, selectedSubject,
    changeYear, changeSubject, toggleTopic, setSelectedSubtopicIds, setWritingType,
    buildConfig, validate, reset,
  }
}

/**
 * Generate a test's questions for a scope config (from `useTestScope().buildConfig()`).
 * English-only subjects keep today's single request; everything else is a timed
 * test: 20 multiple choice + 30 marks of short answers. `onProgress` gets the
 * timed build's progress.
 */
export async function generateTestQuestions(yearLevel, config, onProgress) {
  if (isEnglishOnly([config])) {
    const json = await generateDiagnosticQuestions({ yearLevel, subjects: [config] })
    const questions = json.questions || []
    if (!questions.length) throw new Error('No questions came back. Please try again.')
    return questions
  }
  let scopeTopics
  if (config.curriculumId) {
    // The same topic tree the scope picker shows: the ticked subtopics, or everything if none are ticked.
    const tree = await fetchSubjectTopics(config.curriculumId)
    const ticked = new Set(config.subtopicIds || [])
    scopeTopics = tree
      .map(tp => ({ topic: tp.name, subtopicIds: tp.subtopics.map(st => st.id).filter(id => !ticked.size || ticked.has(id)) }))
      .filter(tp => tp.subtopicIds.length)
    if (!scopeTopics.length) throw new Error('This subject has no subtopics to build a test from.')
  } else {
    scopeTopics = (config.topics || []).map(topic => ({ topic }))
  }
  return buildTimedTest(
    { yearLevel, subject: config, scopeTopics },
    { generateMcq: generateDiagnosticQuestions, generateShortAnswers, onProgress },
  )
}

/** The Generate button's label: while a timed test is built it shows what is being written. */
export function GeneratingLabel({ progress, size = 16 }) {
  return (
    <>
      <Bot size={size} aria-hidden="true" />
      {progress
        ? <> {progress.mcq === 'done' ? 'Multiple choice done' : 'Writing multiple choice…'} · Short answers {progress.shortDone} of {progress.shortTotal}… <span style={{ opacity: 0.6 }}>(2–3 minutes)</span></>
        : <> Generating questions… <span style={{ opacity: 0.6 }}>(30–60 sec)</span></>}
    </>
  )
}

/** Year level, subject, topics and (for writing subjects) the task type. */
export function TestScopeFields({ scope, theme, labelStyle, inputStyle, idPrefix = 'test' }) {
  const t = THEMES[theme]
  const { yearLevel, selectedSubjectId, selectedTopics, selectedSubtopicIds, writingType, availableSubjects, selectedSubject } = scope
  return (
    <>
      {/* Year level */}
      <div>
        <label htmlFor={`${idPrefix}-year`} style={labelStyle}>Year level</label>
        <select id={`${idPrefix}-year`} className="td-input-gold" value={yearLevel} onChange={e => scope.changeYear(e.target.value)} style={inputStyle}>
          <option value="">Select year level…</option>
          {YEAR_LEVEL_GROUPS.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.levels.map(y => <option key={y} value={y}>{y}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Subject */}
      <div>
        <label htmlFor={`${idPrefix}-subject`} style={labelStyle}>Subject</label>
        <select id={`${idPrefix}-subject`} className="td-input-gold" value={selectedSubjectId} onChange={e => scope.changeSubject(e.target.value)} style={inputStyle} disabled={!yearLevel}>
          <option value="">{yearLevel ? 'Select subject…' : 'Select a year level first…'}</option>
          {availableSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Topics */}
      {selectedSubject?.fromDb && (
        <div>
          <div style={labelStyle}>Topics / Subtopics <span style={{ color: t.textFaint, fontWeight: 400, textTransform: 'none' }}>— tick topics or single subtopics, or leave all unticked for the whole subject</span></div>
          <DiagnosticScopePicker key={selectedSubject.curriculumId} subject={{ id: selectedSubject.curriculumId, label: selectedSubject.name }}
            selected={selectedSubtopicIds} onChange={scope.setSelectedSubtopicIds} theme={theme} defaultOpen />
        </div>
      )}
      {selectedSubject && !selectedSubject.fromDb && (
        <div>
          <div style={labelStyle}>Topics / Subtopics <span style={{ color: t.textFaint, fontWeight: 400, textTransform: 'none' }}>— select all that apply</span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {selectedSubject.topics.map(topic => {
              const sel = selectedTopics.includes(topic)
              return (
                <button
                  key={topic}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => scope.toggleTopic(topic)}
                  style={{ padding: '6px 13px', borderRadius: 12, border: `1px solid ${sel ? 'var(--t-text)' : t.border}`, background: sel ? 'var(--t-bgSubtle)' : 'transparent', color: sel ? t.text : t.textMuted, fontSize: 12, fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B, transition: 'all 0.15s' }}
                >
                  {topic}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Writing type — only for English/writing subjects */}
      {selectedSubject?.isWriting && (
        <div>
          <div style={labelStyle}>Writing Task Type <span style={{ fontWeight: 400, textTransform: 'none', color: t.textFaint }}>(Section C exam task)</span></div>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { value: 'paragraph', label: 'Paragraph / Short Response', desc: 'Structured paragraph or short analytical response (suited to Year 7–10)' },
              { value: 'essay',     label: 'Essay',     desc: 'Full analytical or creative essay with intro, body, conclusion (suited to Stage 1–2)' },
            ].map(opt => {
              const sel = writingType === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => scope.setWritingType(opt.value)}
                  style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: `2px solid ${sel ? 'var(--t-text)' : t.border}`, background: sel ? 'var(--t-bgSubtle)' : 'transparent', color: t.text, cursor: 'pointer', fontFamily: FONT_B, textAlign: 'left' }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: sel ? 'var(--t-text)' : t.text, marginBottom: 2 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>{opt.desc}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

/** The mark summary and the questions of a generated test. */
export function TestQuestionList({ questions, theme, maxHeight = 440 }) {
  const t = THEMES[theme]
  const easyMarks = questions.filter(q => q.difficulty === 'easy').reduce((s, q) => s + q.marks, 0)
  const modMarks  = questions.filter(q => q.difficulty === 'moderate').reduce((s, q) => s + q.marks, 0)
  const examMarks = questions.filter(q => q.difficulty === 'exam').reduce((s, q) => s + q.marks, 0)
  const totalMarks = questions.reduce((s, q) => s + q.marks, 0)
  const timed = questions.some(q => q.type === 'marked')
  const mcMarks = questions.filter(q => q.type === 'multiple_choice').reduce((s, q) => s + q.marks, 0)
  const firstMarked = questions.findIndex(q => q.type === 'marked')
  const summary = timed
    ? [
        { label: 'Part 1 — Multiple choice', marks: mcMarks, color: t.success },
        { label: 'Part 2 — Short answer', marks: totalMarks - mcMarks, color: t.danger },
        { label: 'TOTAL', marks: totalMarks, color: t.text },
      ]
    : [
        { label: 'Section A — Foundation', marks: easyMarks, color: t.success },
        { label: 'Section B — Core Skills', marks: modMarks,  color: 'var(--t-goldText)' },
        { label: 'Section C — Exam Style', marks: examMarks, color: t.danger },
        { label: 'TOTAL', marks: totalMarks, color: t.text },
      ]
  const partHeading = { padding: '10px 20px', fontSize: 12, fontWeight: 800, color: t.text, background: 'var(--t-bgSubtle)', borderBottom: `1px solid ${t.border}` }
  return (
    <>
      {/* Mark summary */}
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {summary.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: t.textMuted }}>{s.label}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.marks}</span>
          </div>
        ))}
      </div>

      {/* Questions list */}
      <div style={{ maxHeight, overflowY: 'auto' }}>
        {questions.map((q, i) => {
          const dc = q.difficulty === 'easy' ? t.success : q.difficulty === 'moderate' ? t.goldText : t.danger
          return (
            <Fragment key={q.id}>
            {timed && i === 0 && <div style={partHeading}>Part 1 — Multiple choice</div>}
            {timed && i === firstMarked && <div style={partHeading}>Part 2 — Short answer</div>}
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: `${dc}15`, border: `1px solid ${dc}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: dc, flexShrink: 0 }}>
                Q{i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 12, border: `1px solid ${dc}30`, background: `${dc}10`, color: dc, fontWeight: 700 }}>{DIFF_LABEL[q.difficulty] || q.difficulty}</span>
                  <span style={{ fontSize: 11, color: t.textMuted }}>{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                  <span style={{ fontSize: 11, color: t.textFaint }}>{q.topic}{q.subtopic ? ` · ${q.subtopic}` : ''}</span>
                  <span style={{ fontSize: 11, color: t.textFaint, marginLeft: 'auto' }}>{q.type?.replace(/_/g, ' ')}</span>
                </div>
                <div style={{ fontSize: 13, color: t.text, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}><MathText text={q.question} style={{ whiteSpace: 'pre-wrap' }} /></div>
                {q.options && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {q.options.map(opt => (
                      <div key={opt} style={{ fontSize: 12, color: opt.startsWith(q.correct_answer) ? t.success : t.textMuted, paddingLeft: 4 }}>
                        {opt.startsWith(q.correct_answer) ? '✓ ' : '   '}<MathText text={opt} />
                      </div>
                    ))}
                  </div>
                )}
                {q.type === 'marked' && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(q.marking_scheme || []).length > 0 && (
                      <div style={{ fontSize: 12, color: t.textMuted }}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>Mark points</div>
                        {q.marking_scheme.map((m, k) => (
                          <div key={k} style={{ paddingLeft: 4 }}>{m.marks} mark{m.marks !== 1 ? 's' : ''} — <MathText text={m.point} /></div>
                        ))}
                      </div>
                    )}
                    {q.solution && (
                      <div style={{ fontSize: 12, color: t.success }}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>Model answer</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}><MathText text={q.solution} style={{ whiteSpace: 'pre-wrap' }} /></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            </Fragment>
          )
        })}
      </div>
    </>
  )
}

/**
 * Pick the scope, Generate, and preview the questions: the same steps as the
 * Diagnostic tab, in one piece (New consultation, Send a test).
 * `value` is { yearLevel, subjects, questions } once generated, else null;
 * `onChange` gets that, or null when the tutor goes back to change the scope.
 */
export function TestBuilder({ theme, value, onChange, idPrefix = 'test', labelStyle, inputStyle, disabled = false }) {
  const t = THEMES[theme]
  const scope = useTestScope()
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')

  const generate = async () => {
    setError('')
    const problem = scope.validate()
    if (problem) { setError(problem); return }
    const config = scope.buildConfig()
    setGenerating(true)
    try {
      const questions = await generateTestQuestions(scope.yearLevel, config, setProgress)
      onChange({ yearLevel: scope.yearLevel, subjects: [config], questions })
    } catch (err) {
      setError(err.message || 'Generation failed. Please try again.')
    }
    setProgress(null)
    setGenerating(false)
  }

  if (value) {
    const total = value.questions.reduce((s, q) => s + q.marks, 0)
    return (
      <div style={{ border: '1px solid var(--t-border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Check the questions</div>
            <div style={{ fontSize: 12, color: t.textMuted }}>{value.yearLevel} · {value.subjects.map(s => s.name).join(', ')} · {value.questions.length} questions · {total} marks</div>
          </div>
          <button type="button" disabled={disabled} onClick={() => onChange(null)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>
            ← Change or regenerate
          </button>
        </div>
        <TestQuestionList questions={value.questions} theme={theme} maxHeight={300} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <TestScopeFields scope={scope} theme={theme} labelStyle={labelStyle} inputStyle={inputStyle} idPrefix={idPrefix} />
      {error && <div role="alert" style={{ fontSize: 13, color: t.danger, padding: '10px 14px', borderRadius: 8, background: t.dangerBg, border: `1px solid ${t.danger}40` }}>{error}</div>}
      <button
        type="button"
        onClick={generate}
        disabled={generating || disabled}
        style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: generating ? t.border : 'var(--t-accent)', color: generating ? t.textMuted : 'var(--t-onAccent)', fontSize: 13, fontWeight: 800, cursor: generating ? 'not-allowed' : 'pointer', fontFamily: FONT_B, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 10 }}
      >
        {generating ? <GeneratingLabel progress={progress} /> : <><Bot size={16} aria-hidden="true" /> Generate test</>}
      </button>
    </div>
  )
}
