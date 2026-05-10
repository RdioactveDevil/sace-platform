import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loadDiagnosticByToken, submitDiagnosticAnswers } from '../lib/db'

const GOLD  = '#f1be43'
const GOLDL = '#f9d87a'
const NAVY  = '#0c1037'
const FONT  = "'Plus Jakarta Sans', sans-serif"

const DIFF_LABEL = { easy: 'Foundation', moderate: 'Core', exam: 'Exam Style' }
const DIFF_COLOR = { easy: '#4ade80', moderate: GOLD, exam: '#f87171' }

// ── Helpers ────────────────────────────────────────────────────────────────────

function difficultyGroups(questions) {
  const easy     = questions.filter(q => q.difficulty === 'easy')
  const moderate = questions.filter(q => q.difficulty === 'moderate')
  const exam     = questions.filter(q => q.difficulty === 'exam')
  return [
    { key: 'easy',     label: 'Section A — Foundation',    color: '#4ade80', questions: easy,     marks: easy.reduce((s, q) => s + q.marks, 0) },
    { key: 'moderate', label: 'Section B — Core Skills',   color: GOLD,       questions: moderate, marks: moderate.reduce((s, q) => s + q.marks, 0) },
    { key: 'exam',     label: 'Section C — Exam Style',    color: '#f87171',  questions: exam,     marks: exam.reduce((s, q) => s + q.marks, 0) },
  ].filter(g => g.questions.length > 0)
}

function BandBadge({ band }) {
  const colors = {
    Outstanding: { bg: 'rgba(167,243,208,0.15)', border: '#4ade80', text: '#4ade80' },
    High:        { bg: 'rgba(241,190,67,0.15)',  border: GOLD,      text: GOLD },
    Satisfactory:{ bg: 'rgba(96,165,250,0.15)',  border: '#60a5fa', text: '#60a5fa' },
    Developing:  { bg: 'rgba(251,191,36,0.15)',  border: '#fbbf24', text: '#fbbf24' },
    Beginning:   { bg: 'rgba(248,113,113,0.15)', border: '#f87171', text: '#f87171' },
  }
  const c = colors[band] || colors.Satisfactory
  return (
    <span style={{ fontSize: 13, padding: '4px 12px', borderRadius: 20, border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontWeight: 700 }}>
      {band}
    </span>
  )
}

// ── Assessment question display ────────────────────────────────────────────────

function McqQuestion({ q, answer, onAnswer, disabled }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {(q.options || []).map((opt, i) => {
        const letter = String.fromCharCode(65 + i)
        const selected = answer === letter
        return (
          <button
            key={letter}
            onClick={() => !disabled && onAnswer(q.id, letter)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '13px 16px', borderRadius: 10, textAlign: 'left',
              border: `2px solid ${selected ? GOLD : 'rgba(255,255,255,0.1)'}`,
              background: selected ? 'rgba(241,190,67,0.12)' : 'rgba(255,255,255,0.03)',
              color: selected ? '#fff' : 'rgba(255,255,255,0.8)',
              cursor: disabled ? 'default' : 'pointer', fontFamily: FONT, fontSize: 14,
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <span style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
              border: `2px solid ${selected ? GOLD : 'rgba(255,255,255,0.25)'}`,
              background: selected ? GOLD : 'transparent',
              color: selected ? NAVY : 'rgba(255,255,255,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800,
            }}>
              {letter}
            </span>
            <span style={{ flex: 1, lineHeight: 1.5, marginTop: 2 }}>{opt.replace(/^[A-D]\.\s*/, '')}</span>
          </button>
        )
      })}
    </div>
  )
}

function TextQuestion({ q, answer, onAnswer, disabled }) {
  const isExtended = q.type === 'extended_response'
  return (
    <textarea
      value={answer || ''}
      onChange={e => !disabled && onAnswer(q.id, e.target.value)}
      disabled={disabled}
      placeholder={isExtended
        ? 'Write your full response here. Take your time and structure your answer clearly…'
        : 'Write your answer here…'
      }
      style={{
        width: '100%', boxSizing: 'border-box',
        minHeight: isExtended ? 220 : 110,
        padding: '14px 16px', borderRadius: 10,
        border: `2px solid rgba(255,255,255,0.12)`,
        background: 'rgba(255,255,255,0.05)',
        color: '#fff', fontFamily: FONT, fontSize: 14, lineHeight: 1.6,
        resize: 'vertical', outline: 'none',
      }}
      onFocus={e => { e.target.style.borderColor = GOLD }}
      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)' }}
    />
  )
}

function QuestionCard({ q, idx, answer, onAnswer, disabled }) {
  const dc = DIFF_COLOR[q.difficulty] || GOLD
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 14, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: `${dc}20`, border: `1px solid ${dc}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800, color: dc, flexShrink: 0,
        }}>
          Q{idx + 1}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{q.topic}{q.subtopic ? ` · ${q.subtopic}` : ''}</span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, border: `1px solid ${dc}40`, background: `${dc}15`, color: dc, fontWeight: 700 }}>
              {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
            </span>
            {!answer && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginLeft: 'auto' }}>Unanswered</span>
            )}
            {answer && (
              <span style={{ fontSize: 11, color: '#4ade80', marginLeft: 'auto' }}>✓ Answered</span>
            )}
          </div>
          <div style={{ fontSize: 15, color: '#fff', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{q.question}</div>
        </div>
      </div>
      {q.type === 'multiple_choice'
        ? <McqQuestion q={q} answer={answer} onAnswer={onAnswer} disabled={disabled} />
        : <TextQuestion q={q} answer={answer} onAnswer={onAnswer} disabled={disabled} />
      }
    </div>
  )
}

// ── Result screen ──────────────────────────────────────────────────────────────

function ResultScreen({ result, preCallFormUrl, onRedirect }) {
  const { score, maxScore, percentage, band, report } = result
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - percentage / 100)

  useEffect(() => {
    if (preCallFormUrl) {
      const timer = setTimeout(onRedirect, 8000)
      return () => clearTimeout(timer)
    }
  }, [preCallFormUrl, onRedirect])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, padding: '48px 24px' }}>
      {/* Score ring */}
      <div style={{ position: 'relative', width: 140, height: 140 }}>
        <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
          <circle cx="70" cy="70" r={radius} fill="none" stroke={GOLD} strokeWidth="10"
            strokeDasharray={circumference} strokeDashoffset={dashOffset}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#fff' }}>{score}/{maxScore}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{percentage}%</div>
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Assessment Complete!</div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><BandBadge band={band} /></div>
        {report?.summary && <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', maxWidth: 480, lineHeight: 1.6 }}>{report.summary}</div>}
      </div>

      {/* Section scores */}
      {report && (
        <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Section A — Foundation', score: report.easy_score, max: report.easy_max, color: '#4ade80' },
            { label: 'Section B — Core Skills', score: report.moderate_score, max: report.moderate_max, color: GOLD },
            { label: 'Section C — Exam Style', score: report.exam_score, max: report.exam_max, color: '#f87171' },
          ].filter(s => s.max > 0).map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{s.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.score}/{s.max}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${s.max > 0 ? (s.score / s.max) * 100 : 0}%`, background: s.color, borderRadius: 3, transition: 'width 0.8s ease' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {preCallFormUrl && (
        <div style={{ background: 'rgba(241,190,67,0.1)', border: `1px solid rgba(241,190,67,0.3)`, borderRadius: 12, padding: '18px 24px', maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 6 }}>Next Step</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 14, lineHeight: 1.5 }}>
            You will be redirected to a short Pre-Call Questionnaire to help your tutor prepare for your first session.
          </div>
          <button
            onClick={onRedirect}
            style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVY, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT }}
          >
            Go to Questionnaire →
          </button>
        </div>
      )}

      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
        Your results have been sent to your tutor. They will review and get in touch with you soon.
      </div>
    </div>
  )
}

// ── Main DiagnosticScreen ──────────────────────────────────────────────────────

export default function DiagnosticScreen() {
  const { token } = useParams()
  const navigate  = useNavigate()

  const [phase, setPhase]       = useState('loading')  // loading | intro | test | submitting | result | error
  const [assessment, setAssessment] = useState(null)
  const [studentName, setStudentName] = useState('')
  const [answers, setAnswers]   = useState({})
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState('')
  const [submitError, setSubmitError] = useState('')
  const [groups, setGroups]     = useState([])
  const [activeGroup, setActiveGroup] = useState(0)
  const topRef = useRef(null)

  useEffect(() => {
    loadDiagnosticByToken(token)
      .then(({ assessment: a }) => {
        if (a.status === 'completed') {
          setPhase('error')
          setError('This assessment has already been completed.')
          return
        }
        setAssessment(a)
        setGroups(difficultyGroups(a.questions))
        setPhase('intro')
      })
      .catch(err => {
        setError(err.message || 'Could not load assessment.')
        setPhase('error')
      })
  }, [token])

  const handleAnswer = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [String(questionId)]: value }))
  }

  const allCurrentGroupAnswered = () => {
    if (!groups[activeGroup]) return false
    return groups[activeGroup].questions.every(q => answers[String(q.id)]?.trim())
  }

  const allAnswered = () => {
    if (!assessment) return false
    return assessment.questions.every(q => answers[String(q.id)]?.trim())
  }

  const handleSubmit = async () => {
    setSubmitError('')
    if (!studentName.trim()) { setSubmitError('Please enter your name before submitting.'); return }
    setPhase('submitting')
    try {
      const res = await submitDiagnosticAnswers(token, { studentName: studentName.trim(), answers })
      setResult(res)
      setPhase('result')
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
    } catch (err) {
      setSubmitError(err.message || 'Submission failed. Please try again.')
      setPhase('test')
    }
  }

  const handleRedirect = () => {
    if (result?.preCallFormUrl || assessment?.pre_call_form_url) {
      window.location.href = result?.preCallFormUrl || assessment?.pre_call_form_url
    }
  }

  const answeredCount = assessment ? assessment.questions.filter(q => answers[String(q.id)]?.trim()).length : 0
  const totalCount    = assessment ? assessment.questions.length : 0

  const subjectNames = (assessment?.subjects || []).map(s => s.name).join(', ')

  return (
    <div ref={topRef} style={{ minHeight: '100vh', background: NAVY, fontFamily: FONT, color: '#fff' }}>
      <style>{`
        @font-face { font-family: 'Plus Jakarta Sans'; src: url('/PlusJakartaSans.woff2') format('woff2'); font-display: swap; }
        * { box-sizing: border-box; }
        textarea:focus { outline: none; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🎓</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Diagnostic Assessment</div>
            {assessment && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{assessment.year_level} · {subjectNames}</div>}
          </div>
        </div>
        {phase === 'test' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{answeredCount}/{totalCount} answered</div>
            <div style={{ width: 80, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${totalCount > 0 ? (answeredCount / totalCount) * 100 : 0}%`, background: GOLD, borderRadius: 3, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 740, margin: '0 auto', padding: '0 20px' }}>

        {/* ─ Loading ─ */}
        {phase === 'loading' && (
          <div style={{ paddingTop: 80, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
            <div style={{ fontSize: 15 }}>Loading your assessment…</div>
          </div>
        )}

        {/* ─ Error ─ */}
        {phase === 'error' && (
          <div style={{ paddingTop: 80, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Assessment Unavailable</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{error || 'This assessment could not be found.'}</div>
          </div>
        )}

        {/* ─ Intro ─ */}
        {phase === 'intro' && assessment && (
          <div style={{ paddingTop: 48, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
                {assessment.year_level} Diagnostic Assessment
              </div>
              <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)' }}>{subjectNames}</div>
            </div>

            {/* Info cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              {[
                { icon: '📝', label: 'Questions', value: `${assessment.questions.length}` },
                { icon: '⭐', label: 'Total Marks', value: `${assessment.score_max}` },
                { icon: '🎯', label: 'Sections', value: `${groups.length}` },
              ].map(item => (
                <div key={item.label} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{item.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>{item.value}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{item.label}</div>
                </div>
              ))}
            </div>

            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 12 }}>About this assessment</div>
              <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <li style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>This diagnostic covers {subjectNames} at the {assessment.year_level} level.</li>
                <li style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>There are 3 sections: Foundation (easy), Core Skills (moderate), and Exam Style (challenging).</li>
                <li style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>Work through each section at your own pace. There is no time limit.</li>
                <li style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>Your results will be sent to your tutor to help plan your lessons.</li>
                <li style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>Answer every question as best you can — it's okay if you're unsure!</li>
              </ul>
            </div>

            {/* Name input */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: 8 }}>
                Your Name
              </label>
              <input
                type="text"
                value={studentName}
                onChange={e => setStudentName(e.target.value)}
                placeholder={assessment.student_name || 'Enter your full name'}
                style={{ width: '100%', padding: '13px 16px', borderRadius: 10, border: `2px solid rgba(255,255,255,0.12)`, background: 'rgba(255,255,255,0.05)', color: '#fff', fontFamily: FONT, fontSize: 14, outline: 'none' }}
                onFocus={e => { e.target.style.borderColor = GOLD }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)' }}
                onKeyDown={e => { if (e.key === 'Enter' && studentName.trim()) setPhase('test') }}
              />
            </div>

            <button
              onClick={() => { if (studentName.trim()) setPhase('test') }}
              disabled={!studentName.trim()}
              style={{ padding: '14px 32px', borderRadius: 10, border: 'none', background: studentName.trim() ? `linear-gradient(135deg,${GOLD},${GOLDL})` : 'rgba(255,255,255,0.1)', color: studentName.trim() ? NAVY : 'rgba(255,255,255,0.3)', fontSize: 15, fontWeight: 800, cursor: studentName.trim() ? 'pointer' : 'not-allowed', fontFamily: FONT }}
            >
              Start Assessment →
            </button>
          </div>
        )}

        {/* ─ Test ─ */}
        {phase === 'test' && assessment && (
          <div style={{ paddingTop: 32, paddingBottom: 80, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Section tabs */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
              {groups.map((g, i) => (
                <button
                  key={g.key}
                  onClick={() => setActiveGroup(i)}
                  style={{
                    padding: '12px 18px', border: 'none', background: 'transparent', fontFamily: FONT,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    color: activeGroup === i ? g.color : 'rgba(255,255,255,0.4)',
                    borderBottom: activeGroup === i ? `2px solid ${g.color}` : '2px solid transparent',
                  }}
                >
                  {g.label.split('—')[0].trim()}
                  <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>
                    ({g.questions.filter(q => answers[String(q.id)]?.trim()).length}/{g.questions.length})
                  </span>
                </button>
              ))}
            </div>

            {/* Active section */}
            {groups[activeGroup] && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{groups[activeGroup].label}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{groups[activeGroup].marks} marks — {groups[activeGroup].questions.length} question{groups[activeGroup].questions.length !== 1 ? 's' : ''}</div>
                </div>
                {groups[activeGroup].questions.map((q, qi) => (
                  <QuestionCard
                    key={q.id}
                    q={q}
                    idx={assessment.questions.indexOf(q)}
                    answer={answers[String(q.id)]}
                    onAnswer={handleAnswer}
                    disabled={false}
                  />
                ))}

                {/* Section navigation */}
                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                  {activeGroup > 0 && (
                    <button onClick={() => { setActiveGroup(activeGroup - 1); topRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
                      style={{ padding: '11px 20px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                      ← Previous
                    </button>
                  )}
                  {activeGroup < groups.length - 1 && (
                    <button onClick={() => { setActiveGroup(activeGroup + 1); topRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
                      style={{ padding: '11px 20px', borderRadius: 9, border: `1px solid ${allCurrentGroupAnswered() ? GOLD : 'rgba(255,255,255,0.15)'}`, background: allCurrentGroupAnswered() ? 'rgba(241,190,67,0.1)' : 'transparent', color: allCurrentGroupAnswered() ? GOLD : 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                      Next Section →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Submit */}
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(12,16,55,0.95)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, zIndex: 100 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                {answeredCount}/{totalCount} questions answered
                {!allAnswered() && <span style={{ color: GOLD }}> — try to answer all before submitting</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                {submitError && <div style={{ fontSize: 12, color: '#f87171' }}>{submitError}</div>}
                <button
                  onClick={handleSubmit}
                  style={{ padding: '11px 24px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVY, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}
                >
                  Submit Assessment
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─ Submitting ─ */}
        {phase === 'submitting' && (
          <div style={{ paddingTop: 80, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 20 }}>🤖</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Marking your assessment…</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 24 }}>AI is reviewing your responses. This may take 20–40 seconds.</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD, opacity: 0.4, animation: `pulse 1.2s ${i * 0.4}s infinite` }} />
              ))}
            </div>
            <style>{`@keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }`}</style>
          </div>
        )}

        {/* ─ Result ─ */}
        {phase === 'result' && result && (
          <ResultScreen
            result={result}
            preCallFormUrl={result.preCallFormUrl || assessment?.pre_call_form_url}
            onRedirect={handleRedirect}
          />
        )}
      </div>
    </div>
  )
}
