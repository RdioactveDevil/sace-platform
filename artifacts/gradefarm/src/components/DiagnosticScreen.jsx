import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { loadDiagnosticByToken, submitDiagnosticAnswers, prepareDiagnostic } from '../lib/db'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import 'mathlive'
import 'mathlive/fonts.css'
import MathText from './MathText'
import { Check } from 'lucide-react'
import { AuthLayout, Field } from './AuthLayout'

const FONT  = "'Plus Jakarta Sans', sans-serif"
// Colours come from the app's theme variables (set on <html> by App), so the
// page and its maths input follow light and dark mode.
const C = {
  text: 'var(--t-text)', sub: 'var(--t-textSub)', muted: 'var(--t-textMuted)', faint: 'var(--t-textFaint)',
  card: 'var(--t-bgCard)', subtle: 'var(--t-bgSubtle)', hover: 'var(--t-bgHover)', border: 'var(--t-border)', bg: 'var(--t-bg)',
  success: 'var(--t-success)', accent: 'var(--t-accent)',
}

// ── Math rendering ─────────────────────────────────────────────────────────────

function renderMath(text, displayMode = false) {
  try {
    return katex.renderToString(text, { throwOnError: false, displayMode })
  } catch {
    return text
  }
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
    <div style={{ marginTop: 8, background: C.subtle, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <div role="tablist" aria-label="Symbol groups" style={{ display: 'flex', overflowX: 'auto', borderBottom: `1px solid ${C.border}`, scrollbarWidth: 'none' }}>
        {MATH_SYMBOLS.map((g, i) => (
          <button key={g.group} type="button" role="tab" aria-selected={activeGroup === i} onClick={() => setActiveGroup(i)} style={{
            padding: '7px 13px', border: 'none', background: 'transparent', fontFamily: FONT,
            fontSize: 12, fontWeight: activeGroup === i ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
            color: activeGroup === i ? C.text : C.muted,
            borderBottom: activeGroup === i ? `2px solid ${C.text}` : '2px solid transparent',
          }}>
            {g.group}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px' }}>
        {group.symbols.map((sym) => (
          <button
            key={sym.label}
            type="button"
            className="dg-key"
            onClick={() => onInsert(sym)}
            style={{
              padding: '6px 11px', borderRadius: 7, border: `1px solid ${C.border}`,
              background: C.card, color: C.text, fontFamily: FONT,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 36, minHeight: 32,
            }}
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

// Same test MathLive uses to decide whether to auto-show its virtual keyboard
function isTouchDevice() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia) return window.matchMedia('(pointer: coarse)').matches
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

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
      border: `1px solid ${C.border}`,
      background: C.card,
      color: C.text,
      fontSize: '17px',
      padding: '14px 16px',
      boxSizing: 'border-box',
      transition: 'border-color 0.15s',
      cursor: disabled ? 'default' : 'text',
    })
    container.appendChild(mf)

    const configure = () => {
      if (cancelled) return
      // MathLive's input sink is hard-coded to inputmode=none, so touch devices
      // (iPad, phones) never get the OS keyboard. 'auto' shows MathLive's own
      // virtual keyboard on focus there; desktops are unaffected.
      mf.mathVirtualKeyboardPolicy = 'auto'
      mf.smartMode = true
      mf.readOnly = !!disabled
      if (value) mf.setValue(value, { suppressChangeNotifications: true })

      const onInput = () => stableAnswer.current(questionId, mf.value)
      const onFocus = () => {
        mf.style.borderColor = 'var(--t-text)'
        mf.style.boxShadow = '0 0 0 1px var(--t-text)'
        // Keep the field visible above the virtual keyboard once it slides up
        if (isTouchDevice()) setTimeout(() => mf.scrollIntoView({ block: 'center', behavior: 'smooth' }), 400)
      }
      const onBlur  = () => { mf.style.borderColor = C.border; mf.style.boxShadow = 'none' }
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
    { key: 'easy',     label: 'Warm-up',    questions: easy,     marks: easy.reduce((s, q) => s + q.marks, 0) },
    { key: 'moderate', label: 'Core',       questions: moderate, marks: moderate.reduce((s, q) => s + q.marks, 0) },
    { key: 'exam',     label: 'Exam style', questions: exam,     marks: exam.reduce((s, q) => s + q.marks, 0) },
  ].filter(g => g.questions.length > 0)
}

// ── Question components ────────────────────────────────────────────────────────

function McqQuestion({ q, answer, onAnswer, disabled }) {
  return (
    <div role="radiogroup" aria-label={`Question ${q.id} options`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(q.options || []).map((opt, i) => {
        const letter = String.fromCharCode(65 + i)
        const selected = answer === letter
        return (
          <button
            key={letter}
            type="button"
            role="radio"
            aria-checked={selected}
            className="dg-opt"
            onClick={() => !disabled && onAnswer(q.id, letter)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 14px', borderRadius: 10, textAlign: 'left',
              border: `1px solid ${selected ? C.text : C.border}`, boxShadow: selected ? `0 0 0 1px ${C.text}` : 'none',
              background: C.card, color: C.text,
              cursor: disabled ? 'default' : 'pointer', fontFamily: FONT, fontSize: 14.5,
            }}
          >
            <span aria-hidden="true" style={{
              width: 24, height: 24, borderRadius: 6, flexShrink: 0,
              border: `1px solid ${selected ? C.text : C.border}`,
              background: selected ? C.text : 'transparent',
              color: selected ? C.bg : C.muted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11.5, fontWeight: 800,
            }}>
              {letter}
            </span>
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>
              <MathText text={opt.replace(/^[A-D]\.\s*/, '')} />
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

  // Extended responses need multi-line prose — always use plain textarea
  if (isMath && !isExtended) {
    return (
      <div>
        <MathLiveInput
          questionId={q.id}
          value={answer}
          onAnswer={onAnswer}
          insertFnRef={insertFnRef}
          disabled={disabled}
          minHeight={isExtended ? 180 : 64}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            type="button"
            onClick={() => setShowKeyboard(v => !v)}
            aria-pressed={showKeyboard}
            style={{
              padding: '4px 10px', borderRadius: 7,
              border: `1px solid ${showKeyboard ? C.text : C.border}`,
              background: C.card, color: showKeyboard ? C.text : C.muted,
              fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {showKeyboard ? 'Hide symbols' : 'Maths symbols'}
          </button>
        </div>
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
      label={`Answer to question ${q.id}`}
    />
  )
}

function PlainTextInput({ value, onChange, disabled, isExtended, label }) {
  return (
    <textarea
      className="af-inp"
      aria-label={label}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      placeholder={isExtended ? 'Write your full answer here' : 'Write your answer here'}
      style={{ minHeight: isExtended ? 180 : 96, fontSize: 15.5, lineHeight: 1.7, resize: 'vertical', cursor: disabled ? 'default' : 'text' }}
    />
  )
}

function QuestionCard({ q, idx, answer, onAnswer, disabled, isMath }) {
  const answered = !!answer?.trim?.()
  return (
    <section aria-labelledby={`dq-${q.id}`} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: C.muted }}>
        <span id={`dq-${q.id}`} style={{ fontWeight: 700, color: C.sub }}>Question {idx + 1}</span>
        {q.topic && <span>· {q.topic}{q.subtopic ? `, ${q.subtopic}` : ''}</span>}
        <span>· {q.marks} {q.marks === 1 ? 'mark' : 'marks'}</span>
        {answered && <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, color: C.success, fontWeight: 700 }}><Check size={13} strokeWidth={2.5} aria-hidden="true" />Answered</span>}
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: C.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        <MathText text={q.question} />
      </div>
      {q.type === 'multiple_choice'
        ? <McqQuestion q={q} answer={answer} onAnswer={onAnswer} disabled={disabled} />
        : <TextQuestion q={q} answer={answer} onAnswer={onAnswer} disabled={disabled} isMath={isMath} />
      }
    </section>
  )
}

function Dots() {
  return (
    <div aria-hidden="true" style={{ display: 'flex', gap: 6 }}>
      {[0, 1, 2].map(i => <span key={i} className="dg-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: C.muted, animation: `dgPulse 1.2s ${i * 0.4}s infinite` }} />)}
    </div>
  )
}

// A centred card for the short screens (loading, done, errors).
function Panel({ children }) {
  return (
    <div className="af-in" style={{ width: '100%', maxWidth: 460, margin: '0 auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 'clamp(20px, 5vw, 28px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {children}
    </div>
  )
}
const H1 = ({ children }) => <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.25, color: C.text, textWrap: 'balance' }}>{children}</h1>
const P = ({ children, muted }) => <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: muted ? C.muted : C.sub }}>{children}</p>
const OkLine = ({ children }) => <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, color: C.success }}><Check size={16} strokeWidth={2.5} aria-hidden="true" />{children}</div>
const btnStyle = (kind, full = true) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 42, padding: '0 18px', borderRadius: 10,
  fontFamily: FONT, fontSize: 14, fontWeight: 800, cursor: 'pointer', width: full ? '100%' : undefined,
  ...(kind === 'primary' ? { border: 'none', background: C.accent, color: '#0c1037' } : { border: `1px solid ${C.border}`, background: C.card, color: C.text }),
})

function SubmittedScreen({ preCallFormUrl, onRedirect, studentName, tutorName }) {
  useEffect(() => {
    if (preCallFormUrl) {
      const timer = setTimeout(onRedirect, 6000)
      return () => clearTimeout(timer)
    }
  }, [preCallFormUrl, onRedirect])

  const first = (studentName || '').trim().split(' ')[0]
  return (
    <Panel>
      <OkLine>Sent to {tutorName || 'your tutor'}</OkLine>
      <H1>Thanks{first ? `, ${first}` : ''}. That's done.</H1>
      <P muted>{tutorName || 'Your tutor'} will go through your answers and plan your lessons around them.{preCallFormUrl ? '' : ' You can close this page.'}</P>
      {preCallFormUrl && (
        <>
          <P muted>Next, a few questions to help {tutorName || 'your tutor'} prepare for your first lesson. They open in a few seconds.</P>
          <button type="button" className="af-btn" onClick={onRedirect} style={btnStyle('primary')}>Open the questions now</button>
        </>
      )}
    </Panel>
  )
}

/** What a student sees after their tutor-included subject's diagnostic: the tutor gets the full report. */
function LinkedResult({ summary, subject, tutorName }) {
  const list = (title, items) => items.length > 0 && (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 6 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map(item => <li key={item} style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>{item}</li>)}
      </ul>
    </div>
  )
  return (
    <Panel>
      <OkLine>Diagnostic done</OkLine>
      <H1>{subject || 'Your diagnostic'}</H1>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: C.text, fontVariantNumeric: 'tabular-nums' }}>{summary.percentage}%</span>
        {summary.band && <span style={{ fontSize: 14, color: C.muted }}>{summary.band}</span>}
      </div>
      {list("You're strong at", summary.strong || [])}
      {list("What we'll work on", summary.work_on || [])}
      <P muted>{tutorName || 'Your tutor'} has your full results. Your practice now starts with the areas that need it most.</P>
      <button type="button" className="af-btn" onClick={() => window.location.assign('/home')} style={btnStyle('primary')}>Start practising</button>
    </Panel>
  )
}

// ── Main DiagnosticScreen ──────────────────────────────────────────────────────

export default function DiagnosticScreen({ theme = 'dark', onToggleTheme }) {
  const { token } = useParams()

  const [phase, setPhase]           = useState('loading')
  const [assessment, setAssessment] = useState(null)
  const [studentName, setStudentName] = useState('')
  const [answers, setAnswers]       = useState({})
  const [result, setResult]         = useState(null)
  const [error, setError]           = useState('')
  const [submitError, setSubmitError] = useState('')
  const [groups, setGroups]         = useState([])
  // Submitting with questions unanswered asks first.
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [isMath, setIsMath]         = useState(true)
  const [prepareError, setPrepareError] = useState('')
  const [prepareAttempt, setPrepareAttempt] = useState(0)
  const topRef = useRef(null)
  // A tutor-included subject's diagnostic (signed-in student): no name to
  // enter, written on first use, and they get a summary at the end.
  const linked = !!assessment?.linked

  const load = useCallback(() => {
    loadDiagnosticByToken(token)
      .then(({ assessment: a }) => {
        if (a.status === 'completed') {
          if (a.linked && a.summary) {
            setAssessment(a)
            setResult({ linked: true, summary: a.summary })
            setPhase('result')
            return
          }
          setPhase('error')
          setError('This assessment has already been completed.')
          return
        }
        setAssessment(a)
        // The name the tutor gave, filled in (they can change it).
        if (a.student_name) setStudentName(n => n || a.student_name)
        if (a.linked && !a.ready) { setPhase('preparing'); return }
        setGroups(difficultyGroups(a.questions))
        setIsMath(detectIsMath(a.subjects || []))
        setPhase('intro')
      })
      .catch(err => {
        setError(err.message || 'Could not load assessment.')
        setPhase('error')
      })
  }, [token])
  useEffect(() => { load() }, [load])

  // Pad the page by the virtual keyboard's height so the last questions can
  // still be scrolled above it on touch devices.
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  useEffect(() => {
    const kbd = window.mathVirtualKeyboard
    if (!kbd) return
    const onGeometry = () => setKeyboardHeight(kbd.visible ? kbd.boundingRect.height : 0)
    kbd.addEventListener('geometrychange', onGeometry)
    return () => kbd.removeEventListener('geometrychange', onGeometry)
  }, [])

  // iOS doesn't resize the layout viewport for its keyboard, so a fixed bottom
  // bar comes loose and floats mid-screen while scrolling. Hide it while an
  // answer box has focus on touch devices.
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    if (!isTouchDevice()) return
    const isField = el => el?.matches?.('textarea, input, math-field')
    const onFocusIn  = e => { if (isField(e.target)) setTyping(true) }
    const onFocusOut = e => { if (isField(e.target)) setTyping(false) }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  // Still being written: write it (or wait for whoever is), then load it.
  useEffect(() => {
    if (phase !== 'preparing') return
    let cancelled = false
    let timer
    const attempt = async () => {
      try {
        const ready = await prepareDiagnostic(token)
        if (cancelled) return
        if (ready) load()
        else timer = setTimeout(attempt, 5000)
      } catch (err) {
        if (!cancelled) setPrepareError(err.message)
      }
    }
    setPrepareError('')
    attempt()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [phase, token, load, prepareAttempt])

  const handleAnswer = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [String(questionId)]: value }))
  }

  const allAnswered = () => {
    if (!assessment) return false
    return assessment.questions.every(q => answers[String(q.id)]?.trim())
  }

  const handleSubmit = async () => {
    setSubmitError('')
    if (!linked && !studentName.trim()) { setSubmitError('Add your name at the top before you submit.'); return }
    if (!allAnswered() && !confirmSubmit) { setConfirmSubmit(true); return }
    setConfirmSubmit(false)
    setPhase('submitting')
    try {
      const res = await submitDiagnosticAnswers(token, { studentName: studentName.trim(), answers })
      setResult(res)
      setPhase('result')
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
    } catch (err) {
      setSubmitError(err.message || "That didn't send. Try again.")
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

  const tutorName = assessment?.tutor_name || null
  const tutorFirst = tutorName ? tutorName.split(' ')[0] : null
  const sectionNames = groups.map(g => g.label)
  const sectionsLine = sectionNames.length > 1
    ? `${sectionNames.length === 2 ? 'Two' : 'Three'} short sections: ${sectionNames.slice(0, -1).join(', ')} and ${sectionNames[sectionNames.length - 1]}.`
    : null
  const title = linked ? `Your ${subjectNames} diagnostic` : `${assessment?.year_level ? `${assessment.year_level} ` : ''}${subjectNames} diagnostic`
  const unanswered = totalCount - answeredCount

  return (
    <div ref={topRef} style={{ paddingBottom: keyboardHeight }}>
      <AuthLayout theme={theme} onToggleTheme={onToggleTheme} align={phase === 'test' ? 'top' : 'center'}>
        <style>{`
          math-field {
            --caret-color: var(--t-text);
            --selection-background-color: rgba(var(--ink-rgb), 0.15);
            --selection-background-color-focused: rgba(var(--ink-rgb), 0.2);
            --primary-color: var(--t-text);
            --text-color: var(--t-text);
            --smart-fence-color: var(--t-textMuted);
            --placeholder-color: var(--t-textFaint);
            --contains-highlight-background-color: rgba(var(--ink-rgb), 0.06);
            color: var(--t-text);
            font-family: ${FONT};
          }
          math-field::part(virtual-keyboard-toggle) { display: none; }
          math-field::part(menu-toggle) { display: none; }
          math-field .ML__latex { color: var(--t-text); }
          math-field .ML__fieldcontainer { background: transparent; }
          .dg-opt:hover, .dg-key:hover { border-color: var(--t-textMuted) !important; }
          .dg-opt:focus-visible, .dg-key:focus-visible { outline: 2px solid var(--t-accent); outline-offset: 2px; }
          @keyframes dgPulse { 0%,100% { opacity: 0.35 } 50% { opacity: 1 } }
          @media (prefers-reduced-motion: reduce) { .dg-dot { animation: none !important; } }
        `}</style>

        {phase === 'loading' && <Panel><P muted>Loading your diagnostic…</P></Panel>}

        {/* Still being written (a tutor-included subject's diagnostic, written on first use) */}
        {phase === 'preparing' && (
          <Panel>
            {prepareError ? (
              <>
                <H1>That didn't load</H1>
                <P muted>{prepareError}</P>
                <button type="button" className="af-btn" onClick={() => setPrepareAttempt(n => n + 1)} style={btnStyle('primary')}>Try again</button>
              </>
            ) : (
              <>
                <H1>Getting your diagnostic ready</H1>
                <P muted>We're writing questions on the topics {tutorFirst || 'your tutor'} picked. This takes about a minute.</P>
                <Dots />
              </>
            )}
          </Panel>
        )}

        {phase === 'error' && (
          <Panel>
            <H1>This diagnostic isn't available</H1>
            <P muted>{error || "We couldn't find it. Check the link with your tutor."}</P>
          </Panel>
        )}

        {phase === 'intro' && assessment && (
          <Panel>
            <H1>{title}</H1>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13.5, color: C.muted }}>
              <span><strong style={{ color: C.text }}>{assessment.questions.length}</strong> questions</span>
              <span><strong style={{ color: C.text }}>{assessment.score_max}</strong> marks</span>
              <span>No time limit</span>
            </div>
            <P>
              {sectionsLine ? `${sectionsLine} ` : ''}Answer what you can; it's fine to be unsure.{' '}
              {linked
                ? `${tutorFirst || 'Your tutor'} gets your results, and your practice starts with what needs it most.`
                : `${tutorFirst || 'Your tutor'} gets your answers to plan your lessons.`}
            </P>
            {!linked && (
              <Field id="dg-name" label="Your name" theme={theme}>
                <input id="dg-name" className="af-inp" type="text" autoComplete="name" value={studentName} onChange={e => setStudentName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && studentName.trim()) setPhase('test') }} />
              </Field>
            )}
            <button type="button" className="af-btn" onClick={() => { if (linked || studentName.trim()) setPhase('test') }} disabled={!linked && !studentName.trim()}
              style={{ ...btnStyle('primary'), opacity: !linked && !studentName.trim() ? 0.55 : 1, cursor: !linked && !studentName.trim() ? 'default' : 'pointer' }}>
              Start
            </button>
          </Panel>
        )}

        {phase === 'test' && assessment && (
          <div style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 96 }}>
            <H1>{title}</H1>
            {groups.map(g => (
              <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text }}>
                  {g.label}
                  <span style={{ fontWeight: 500, fontSize: 13, color: C.muted, marginLeft: 8 }}>
                    {g.questions.length} question{g.questions.length !== 1 ? 's' : ''} · {g.marks} mark{g.marks !== 1 ? 's' : ''}
                  </span>
                </h2>
                {g.questions.map(q => (
                  <QuestionCard key={q.id} q={q} idx={assessment.questions.indexOf(q)} answer={answers[String(q.id)]} onAnswer={handleAnswer} disabled={false} isMath={isMath} />
                ))}
              </div>
            ))}

            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20, background: C.card, borderTop: `1px solid ${C.border}`,
              padding: '12px max(16px, env(safe-area-inset-right, 0px)) calc(12px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px))',
              display: typing ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ width: '100%', maxWidth: 680, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div role="status" style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: submitError ? 'var(--t-danger)' : C.muted }}>
                  {submitError
                    ? submitError
                    : confirmSubmit
                      ? <>{unanswered} question{unanswered !== 1 ? 's are' : ' is'} unanswered. Submit anyway?</>
                      : <><strong style={{ color: C.text }}>{answeredCount} of {totalCount}</strong> answered</>}
                </div>
                {confirmSubmit && !submitError && (
                  <button type="button" className="af-btn" onClick={() => setConfirmSubmit(false)} style={btnStyle('secondary', false)}>Keep going</button>
                )}
                <button type="button" className="af-btn" onClick={handleSubmit} style={btnStyle('primary', false)}>{confirmSubmit ? 'Submit anyway' : 'Submit'}</button>
              </div>
            </div>
          </div>
        )}

        {phase === 'submitting' && (
          <Panel>
            <H1>Marking your answers</H1>
            <P muted>This usually takes 20 to 40 seconds. Keep this page open.</P>
            <Dots />
          </Panel>
        )}

        {phase === 'result' && result?.linked && (
          <LinkedResult summary={result.summary} subject={subjectNames} tutorName={tutorName} />
        )}
        {phase === 'result' && !result?.linked && (
          <SubmittedScreen
            preCallFormUrl={result?.preCallFormUrl || assessment?.pre_call_form_url}
            onRedirect={handleRedirect}
            studentName={studentName}
            tutorName={tutorName}
          />
        )}
      </AuthLayout>
    </div>
  )

}
