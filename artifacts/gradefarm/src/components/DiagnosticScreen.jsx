import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loadDiagnosticByToken, submitDiagnosticAnswers } from '../lib/db'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import 'mathlive'
import 'mathlive/fonts.css'

const GOLD  = '#f1be43'
const GOLDL = '#f9d87a'
const NAVY  = '#0c1037'
const FONT  = "'Plus Jakarta Sans', sans-serif"

const DIFF_COLOR = { easy: '#4ade80', moderate: GOLD, exam: '#f87171' }

// ── Math rendering ─────────────────────────────────────────────────────────────

function renderMath(text, displayMode = false) {
  try {
    return katex.renderToString(text, { throwOnError: false, displayMode })
  } catch {
    return text
  }
}

function MathText({ children }) {
  if (!children) return null
  const str = String(children)
  const parts = []
  const re = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g
  let lastIndex = 0, m
  while ((m = re.exec(str)) !== null) {
    if (m.index > lastIndex) parts.push({ type: 'text', value: str.slice(lastIndex, m.index) })
    const raw = m[0]
    if (raw.startsWith('$$')) {
      parts.push({ type: 'display', value: raw.slice(2, -2) })
    } else {
      parts.push({ type: 'inline', value: raw.slice(1, -1) })
    }
    lastIndex = m.index + raw.length
  }
  if (lastIndex < str.length) parts.push({ type: 'text', value: str.slice(lastIndex) })

  return (
    <span>
      {parts.map((p, i) => {
        if (p.type === 'text') return <span key={i}>{p.value}</span>
        const html = renderMath(p.value, p.type === 'display')
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} style={p.type === 'display' ? { display: 'block', textAlign: 'center', margin: '8px 0' } : undefined} />
      })}
    </span>
  )
}

// ── Subject detection ──────────────────────────────────────────────────────────

const WRITING_KEYWORDS = ['english', 'history', 'geography', 'literature', 'essay', 'writing', 'humanities', 'economics', 'legal', 'business']

function detectIsMath(subjects = []) {
  return !subjects.some(s =>
    WRITING_KEYWORDS.some(kw => s.name?.toLowerCase().includes(kw))
  )
}

// ── Math symbols ───────────────────────────────────────────────────────────────

// insert: for contentEditable/textarea fallback
// ml: MathLive LaTeX, with #? placeholders (cursor jumps inside)
// preview: KaTeX rendered in button face
const MATH_SYMBOLS = [
  { group: 'Operators', symbols: [
    { label: '×',   ml: '\\times',           preview: null },
    { label: '÷',   ml: '\\div',             preview: null },
    { label: '±',   ml: '\\pm',              preview: null },
    { label: '√',   ml: '\\sqrt{#?}',        preview: '\\sqrt{x}' },
    { label: 'xⁿ',  ml: '#@^{#?}',           preview: 'x^n' },
    { label: '∞',   ml: '\\infty',           preview: '\\infty' },
    { label: 'a/b', ml: '\\frac{#?}{#?}',    preview: '\\frac{a}{b}' },
  ]},
  { group: 'Relations', symbols: [
    { label: '≤',   ml: '\\le' },
    { label: '≥',   ml: '\\ge' },
    { label: '≠',   ml: '\\ne' },
    { label: '≈',   ml: '\\approx' },
    { label: '∈',   ml: '\\in' },
    { label: '→',   ml: '\\to' },
  ]},
  { group: 'Trig', symbols: [
    { label: 'sin',    ml: '\\sin\\left(#?\\right)',         preview: null },
    { label: 'cos',    ml: '\\cos\\left(#?\\right)',         preview: null },
    { label: 'tan',    ml: '\\tan\\left(#?\\right)',         preview: null },
    { label: 'sin⁻¹', ml: '\\sin^{-1}\\left(#?\\right)',    preview: '\\sin^{-1}(x)' },
    { label: 'cos⁻¹', ml: '\\cos^{-1}\\left(#?\\right)',    preview: '\\cos^{-1}(x)' },
    { label: 'tan⁻¹', ml: '\\tan^{-1}\\left(#?\\right)',    preview: '\\tan^{-1}(x)' },
  ]},
  { group: 'Calculus', symbols: [
    { label: 'd/dx',   ml: '\\frac{d}{dx}',            preview: '\\frac{d}{dx}' },
    { label: 'd²/dx²', ml: '\\frac{d^2}{dx^2}',        preview: '\\frac{d^2}{dx^2}' },
    { label: '∫',      ml: '\\int' },
    { label: '∫ dx',   ml: '\\int_{#?}^{#?}#?\\,dx',   preview: '\\int_a^b \\, dx' },
    { label: 'lim',    ml: '\\lim_{x\\to#?}',          preview: '\\lim_{x \\to a}' },
    { label: 'Σ',      ml: '\\sum_{#?}^{#?}' },
    { label: '∂',      ml: '\\partial' },
    { label: 'Δ',      ml: '\\Delta' },
  ]},
  { group: 'Log / Exp', symbols: [
    { label: 'ln',    ml: '\\ln\\left(#?\\right)' },
    { label: 'log',   ml: '\\log\\left(#?\\right)' },
    { label: 'log_n', ml: '\\log_{#?}\\left(#?\\right)',  preview: '\\log_n(x)' },
    { label: 'eˣ',    ml: 'e^{#?}',                      preview: 'e^x' },
  ]},
  { group: 'Greek', symbols: [
    { label: 'π', ml: '\\pi' },
    { label: 'θ', ml: '\\theta' },
    { label: 'α', ml: '\\alpha' },
    { label: 'β', ml: '\\beta' },
    { label: 'λ', ml: '\\lambda' },
    { label: 'μ', ml: '\\mu' },
    { label: 'σ', ml: '\\sigma' },
    { label: 'φ', ml: '\\phi' },
  ]},
]

function MathKeyboard({ onInsert }) {
  const [activeGroup, setActiveGroup] = useState(0)
  const group = MATH_SYMBOLS[activeGroup]

  return (
    <div style={{ marginTop: 8, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.08)', scrollbarWidth: 'none' }}>
        {MATH_SYMBOLS.map((g, i) => (
          <button key={g.group} onClick={() => setActiveGroup(i)} style={{
            padding: '7px 13px', border: 'none', background: 'transparent', fontFamily: FONT,
            fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            color: activeGroup === i ? GOLD : 'rgba(255,255,255,0.45)',
            borderBottom: activeGroup === i ? `2px solid ${GOLD}` : '2px solid transparent',
          }}>
            {g.group}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px' }}>
        {group.symbols.map((sym) => (
          <button
            key={sym.label}
            onClick={() => onInsert(sym)}
            style={{
              padding: '6px 11px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.06)', color: '#fff', fontFamily: FONT,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.12s, border-color 0.12s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 36, minHeight: 32,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(241,190,67,0.15)'; e.currentTarget.style.borderColor = `${GOLD}60` }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
          >
            {sym.preview
              ? <span dangerouslySetInnerHTML={{ __html: renderMath(sym.preview) }} style={{ pointerEvents: 'none' }} />
              : sym.label
            }
          </button>
        ))}
      </div>
    </div>
  )
}

// ── MathLive input (math subjects) ─────────────────────────────────────────────

function MathLiveInput({ questionId, value, onAnswer, insertFnRef, disabled, minHeight }) {
  const containerRef = useRef(null)
  const stableAnswer = useRef(onAnswer)
  stableAnswer.current = onAnswer

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false

    // Create imperatively so we control when MathLive methods are called
    const mf = document.createElement('math-field')
    Object.assign(mf.style, {
      display: 'block',
      width: '100%',
      minHeight: `${minHeight || 60}px`,
      borderRadius: '10px',
      border: '2px solid rgba(255,255,255,0.12)',
      background: 'rgba(255,255,255,0.05)',
      color: '#fff',
      fontSize: '14px',
      padding: '14px 16px',
      boxSizing: 'border-box',
      transition: 'border-color 0.15s',
      cursor: disabled ? 'default' : 'text',
    })
    container.appendChild(mf)

    const configure = () => {
      if (cancelled) return
      mf.mathVirtualKeyboardPolicy = 'manual'
      mf.readOnly = !!disabled
      if (value) mf.setValue(value, { suppressChangeNotifications: true })

      const onInput = () => stableAnswer.current(questionId, mf.value)
      const onFocus = () => { mf.style.borderColor = GOLD }
      const onBlur  = () => { mf.style.borderColor = 'rgba(255,255,255,0.12)' }
      mf.addEventListener('input', onInput)
      mf.addEventListener('focus', onFocus)
      mf.addEventListener('blur', onBlur)

      if (insertFnRef) {
        insertFnRef.current = (sym) => {
          if (disabled) return
          mf.focus()
          mf.insert(sym.ml, { selectionMode: 'placeholder' })
          stableAnswer.current(questionId, mf.value)
        }
      }
    }

    // Ensure the custom element is upgraded before calling MathLive APIs
    if (customElements.get('math-field')) {
      configure()
    } else {
      customElements.whenDefined('math-field').then(configure)
    }

    return () => {
      cancelled = true
      if (container.contains(mf)) container.removeChild(mf)
      if (insertFnRef) insertFnRef.current = null
    }
  }, [questionId, disabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={{ width: '100%' }} />
}

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

// ── Question components ────────────────────────────────────────────────────────

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
            <span style={{ flex: 1, lineHeight: 1.5, marginTop: 2 }}>
              <MathText>{opt.replace(/^[A-D]\.\s*/, '')}</MathText>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function TextQuestion({ q, answer, onAnswer, disabled, isMath }) {
  const isExtended = q.type === 'extended_response'
  const [showKeyboard, setShowKeyboard] = useState(false)
  const insertFnRef = useRef(null)

  const handleInsert = useCallback((sym) => {
    if (disabled || !insertFnRef.current) return
    insertFnRef.current(sym)
  }, [disabled])

  if (isMath) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <button
            onClick={() => setShowKeyboard(v => !v)}
            style={{
              padding: '4px 12px', borderRadius: 7,
              border: `1px solid ${showKeyboard ? GOLD : 'rgba(255,255,255,0.15)'}`,
              background: showKeyboard ? 'rgba(241,190,67,0.12)' : 'rgba(255,255,255,0.05)',
              color: showKeyboard ? GOLD : 'rgba(255,255,255,0.6)',
              fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ∑ Math
          </button>
        </div>
        <MathLiveInput
          questionId={q.id}
          value={answer}
          onAnswer={onAnswer}
          insertFnRef={insertFnRef}
          disabled={disabled}
          minHeight={isExtended ? 180 : 80}
        />
        {showKeyboard && !disabled && <MathKeyboard onInsert={handleInsert} />}
      </div>
    )
  }

  // Plain textarea for English / humanities subjects
  return (
    <PlainTextInput
      value={answer || ''}
      onChange={v => onAnswer(q.id, v)}
      disabled={disabled}
      isExtended={isExtended}
    />
  )
}

function PlainTextInput({ value, onChange, disabled, isExtended }) {
  const placeholder = isExtended
    ? 'Write your full response here…'
    : 'Write your answer here…'
  const [borderColor, setBorderColor] = useState('rgba(255,255,255,0.12)')
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      onFocus={() => setBorderColor(GOLD)}
      onBlur={() => setBorderColor('rgba(255,255,255,0.12)')}
      style={{
        width: '100%', boxSizing: 'border-box',
        minHeight: isExtended ? 180 : 100,
        padding: '14px 16px', borderRadius: 10,
        border: `2px solid ${borderColor}`,
        background: 'rgba(255,255,255,0.05)',
        color: '#fff', fontFamily: FONT, fontSize: 14, lineHeight: 1.8,
        outline: 'none', resize: 'vertical',
        cursor: disabled ? 'default' : 'text',
        transition: 'border-color 0.15s',
      }}
    />
  )
}

function QuestionCard({ q, idx, answer, onAnswer, disabled, isMath }) {
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
          <div style={{ fontSize: 15, color: '#fff', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
            <MathText>{q.question}</MathText>
          </div>
        </div>
      </div>
      {q.type === 'multiple_choice'
        ? <McqQuestion q={q} answer={answer} onAnswer={onAnswer} disabled={disabled} />
        : <TextQuestion q={q} answer={answer} onAnswer={onAnswer} disabled={disabled} isMath={isMath} />
      }
    </div>
  )
}

// ── Submitted screen ───────────────────────────────────────────────────────────

function SubmittedScreen({ preCallFormUrl, onRedirect }) {
  useEffect(() => {
    if (preCallFormUrl) {
      const timer = setTimeout(onRedirect, 6000)
      return () => clearTimeout(timer)
    }
  }, [preCallFormUrl, onRedirect])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, padding: '64px 24px', textAlign: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', border: '2px solid rgba(74,222,128,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
        ✅
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 10 }}>Assessment Submitted!</div>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', maxWidth: 420, lineHeight: 1.6 }}>
          Thank you for completing the diagnostic. Your tutor will review your responses and get in touch with you soon.
        </div>
      </div>
      {preCallFormUrl && (
        <div style={{ background: 'rgba(241,190,67,0.1)', border: '1px solid rgba(241,190,67,0.3)', borderRadius: 12, padding: '20px 28px', maxWidth: 420, width: '100%' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 6 }}>One more step</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 16, lineHeight: 1.5 }}>
            Please complete a short Pre-Call Questionnaire to help your tutor prepare for your first session.
          </div>
          <button
            onClick={onRedirect}
            style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVY, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT }}
          >
            Go to Questionnaire →
          </button>
        </div>
      )}
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
        You can close this page.
      </div>
    </div>
  )
}

// ── Main DiagnosticScreen ──────────────────────────────────────────────────────

export default function DiagnosticScreen() {
  const { token } = useParams()
  const navigate  = useNavigate()

  const [phase, setPhase]           = useState('loading')
  const [assessment, setAssessment] = useState(null)
  const [studentName, setStudentName] = useState('')
  const [answers, setAnswers]       = useState({})
  const [result, setResult]         = useState(null)
  const [error, setError]           = useState('')
  const [submitError, setSubmitError] = useState('')
  const [groups, setGroups]         = useState([])
  const [activeGroup, setActiveGroup] = useState(0)
  const [isMath, setIsMath]         = useState(true)
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
        setIsMath(detectIsMath(a.subjects || []))
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
  const subjectNames  = (assessment?.subjects || []).map(s => s.name).join(', ')

  return (
    <div ref={topRef} style={{ minHeight: '100vh', background: NAVY, fontFamily: FONT, color: '#fff' }}>
      <style>{`
        @font-face { font-family: 'Plus Jakarta Sans'; src: url('/PlusJakartaSans.woff2') format('woff2'); font-display: swap; }
        * { box-sizing: border-box; }
        textarea:focus { outline: none; }
        math-field {
          --caret-color: ${GOLD};
          --selection-background-color: rgba(241,190,67,0.25);
          --selection-background-color-focused: rgba(241,190,67,0.3);
          --primary-color: ${GOLD};
          --text-color: #ffffff;
          --smart-fence-color: rgba(255,255,255,0.5);
          --placeholder-color: rgba(255,255,255,0.3);
          --contains-highlight-background-color: rgba(241,190,67,0.15);
          color: #fff;
          font-family: ${FONT};
        }
        math-field::part(virtual-keyboard-toggle) { display: none; }
        math-field::part(menu-toggle) { display: none; }
        math-field .ML__latex { color: #fff; }
        math-field .ML__fieldcontainer { background: transparent; }
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }
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

            {groups[activeGroup] && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{groups[activeGroup].label}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{groups[activeGroup].marks} marks — {groups[activeGroup].questions.length} question{groups[activeGroup].questions.length !== 1 ? 's' : ''}</div>
                </div>
                {groups[activeGroup].questions.map((q) => (
                  <QuestionCard
                    key={q.id}
                    q={q}
                    idx={assessment.questions.indexOf(q)}
                    answer={answers[String(q.id)]}
                    onAnswer={handleAnswer}
                    disabled={false}
                    isMath={isMath}
                  />
                ))}

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
          </div>
        )}

        {/* ─ Result ─ */}
        {phase === 'result' && (
          <SubmittedScreen
            preCallFormUrl={result?.preCallFormUrl || assessment?.pre_call_form_url}
            onRedirect={handleRedirect}
          />
        )}
      </div>
    </div>
  )
}
