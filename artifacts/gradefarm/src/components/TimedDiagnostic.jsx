import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { startDiagnostic, submitDiagnosticAnswers } from '../lib/db'
import { sittingClock, timeLeft, timeUp, inWarning, loadAnswers, saveAnswers, clearAnswers, loadName, saveName } from '../lib/timedDiagnostic'
import { usesMathInput } from '../lib/subjects'
import MathText from './MathText'
import TableView from './TableView'
import DiagramView from './DiagramView'
import McqQuestion from './DiagnosticMcq'
import TimerBar from './TimerBar'
import { WrittenAnswerInput } from './questions/WrittenAnswer'
import { Field } from './AuthLayout'
import { C, Panel, H1, P, btnStyle } from './publicUi'

const MathWorkingInput = lazy(() => import('./questions/MathWorkingInput'))

const isMcq = q => q.type === 'multiple_choice'
const marksOf = qs => qs.reduce((s, q) => s + (Number(q.marks) || 0), 0)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function QuestionCard({ q, number, answered, theme, children }) {
  return (
    <section aria-labelledby={`tq-${q.id}`} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: C.muted }}>
        <span id={`tq-${q.id}`} style={{ fontWeight: 700, color: C.sub }}>Question {number}</span>
        {q.topic && <span>· {q.topic}{q.subtopic ? `, ${q.subtopic}` : ''}</span>}
        <span>· {plural(q.marks, 'mark')}</span>
        {answered && <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, color: C.success, fontWeight: 700 }}><Check size={13} strokeWidth={2.5} aria-hidden="true" />Answered</span>}
      </div>
      {q.table_data && <TableView table={q.table_data} theme={theme} />}
      {q.diagram && <DiagramView diagram={q.diagram} theme={theme} />}
      <div style={{ fontSize: 15.5, fontWeight: 700, color: C.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        <MathText text={q.question} />
      </div>
      {children}
    </section>
  )
}

/**
 * A timed diagnostic (`time_limit_minutes` set): a start page, then part 1
 * (the multiple-choice questions) and part 2 (the short answers) under one
 * clock that started when Start was first pressed. Answers save as they
 * change; at 0 they're submitted automatically. Submitting hands the result
 * to `onSubmitted` (the page shows its usual "Submitted" screen): marking
 * happens on the server afterwards, so there's no marking screen here.
 */
export default function TimedDiagnostic({ token, assessment, title, theme, initialName, onStage, onSubmitted }) {
  const questions = assessment.questions || []
  const mcqs = questions.filter(isMcq)
  const shorts = questions.filter(q => !isMcq(q))
  const limit = assessment.time_limit_minutes
  const mathBox = (assessment.subjects || []).some(s => usesMathInput(s.name))

  // Already started (a reload, or the link opened again): straight back in, on the time that's left.
  const [clock, setClock] = useState(() => (assessment.started_at
    ? sittingClock({ startedAt: assessment.started_at, limitMinutes: limit, serverNow: assessment.server_now })
    : null))
  const [stage, setStage] = useState(() => (assessment.started_at ? 'part1' : 'start'))
  const [now, setNow] = useState(() => Date.now())
  const [name, setName] = useState(() => loadName(token) || initialName || '')
  const [answers, setAnswers] = useState(() => loadAnswers(token))
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const headingRef = useRef(null)
  const inFlight = useRef(false)
  const autoSubmitted = useRef(false)

  // Before paint, so the page doesn't flash the parts centred on a resume.
  useLayoutEffect(() => { onStage?.(stage) }, [stage, onStage])
  useEffect(() => { saveAnswers(token, answers) }, [token, answers])

  // On to a part: back to the top, and focus its heading for screen readers.
  useEffect(() => {
    if (stage === 'start') return
    window.scrollTo(0, 0)
    headingRef.current?.focus({ preventScroll: true })
  }, [stage])

  useEffect(() => {
    if (!clock) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [clock])

  const answered = q => !!answers[String(q.id)]?.trim?.()
  const unanswered = questions.filter(q => !answered(q)).length
  const left = clock ? timeLeft(clock, now) : limit * 60000
  // The danger colour stays on at 0:00 (e.g. while a late submit retries).
  const warning = clock ? inWarning(clock, now) || timeUp(clock, now) : false

  const handleAnswer = (id, value) => {
    setConfirmSubmit(false)
    setAnswers(prev => ({ ...prev, [String(id)]: value }))
  }

  const go = (next) => { setConfirmSubmit(false); setStage(next) }

  const begin = async () => {
    const trimmed = name.trim()
    if (!trimmed || starting) return
    setStarting(true)
    setStartError('')
    const pressedAt = Date.now()
    try {
      const res = await startDiagnostic(token)
      saveName(token, trimmed)
      const c = sittingClock({ startedAt: res?.startedAt, limitMinutes: res?.timeLimitMinutes || limit, serverNow: res?.serverNow }, Date.now(), pressedAt)
      setClock(c)
      setNow(Date.now())
      setStage('part1')
    } catch (err) {
      setStartError(err.message || "The test didn't start. Try again.")
      setStarting(false)
    }
  }

  const submit = async ({ auto = false } = {}) => {
    if (inFlight.current) return
    setSubmitError('')
    const late = auto || (clock && timeUp(clock))
    if (!late && unanswered > 0 && !confirmSubmit) { setConfirmSubmit(true); return }
    setConfirmSubmit(false)
    inFlight.current = true
    setSubmitting(true)
    try {
      const res = await submitDiagnosticAnswers(token, { studentName: name.trim(), answers })
      clearAnswers(token)
      onSubmitted(res, name.trim())
    } catch (err) {
      inFlight.current = false
      setSubmitting(false)
      setSubmitError(err.message || "Your answers didn't send. Try again.")
      setStage('part2')
    }
  }

  // Time's up (on a tick, or already on load): submit, once.
  const submitRef = useRef(submit)
  submitRef.current = submit
  useEffect(() => {
    if (!clock || autoSubmitted.current || !timeUp(clock, now)) return
    autoSubmitted.current = true
    submitRef.current({ auto: true })
  }, [clock, now])

  if (stage === 'start') {
    const ready = !!name.trim() && !starting
    return (
      <Panel>
        <H1>{title}</H1>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{assessment.score_max} marks · {limit} minutes</div>
        <P>Part 1: multiple choice ({marksOf(mcqs)} marks). Part 2: short answer ({marksOf(shorts)} marks).</P>
        <P muted>The timer starts when you press Start and doesn't stop, even if you close the page. Answers save as you go.</P>
        <Field id="dg-name" label="Your name" theme={theme}>
          <input id="dg-name" className="af-inp" type="text" autoComplete="name" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') begin() }} />
        </Field>
        <button type="button" className="af-btn" onClick={begin} disabled={!ready}
          style={{ ...btnStyle('primary'), opacity: ready ? 1 : 0.55, cursor: ready ? 'pointer' : 'default' }}>
          {starting ? 'Starting…' : 'Start'}
        </button>
        {startError && <div role="alert" style={{ fontSize: 13.5, color: 'var(--t-danger)' }}>{startError}</div>}
      </Panel>
    )
  }

  const part1 = stage === 'part1'
  const shown = part1 ? mcqs : shorts
  const partAnswered = shown.filter(answered).length
  const numberOf = q => questions.indexOf(q) + 1

  return (
    <div style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 48 }}>
      <TimerBar
        left={left}
        warning={warning}
        part={part1 ? 'Part 1 of 2 · Multiple choice' : 'Part 2 of 2 · Short answer'}
        progress={submitting
          ? 'Submitting your answers…'
          : submitError ? 'Not sent yet. Press Submit to try again.' : `${partAnswered} of ${shown.length} answered`}
      />
      <H1>{title}</H1>
      <h2 ref={headingRef} tabIndex={-1} style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text, outline: 'none' }}>
        {part1 ? 'Part 1: Multiple choice' : 'Part 2: Short answer'}
        <span style={{ fontWeight: 500, fontSize: 13, color: C.muted, marginLeft: 8 }}>
          {plural(shown.length, 'question')} · {plural(marksOf(shown), 'mark')}
        </span>
      </h2>

      {shown.map(q => (
        <QuestionCard key={q.id} q={q} number={numberOf(q)} answered={answered(q)} theme={theme}>
          {part1 ? (
            <McqQuestion q={q} answer={answers[String(q.id)]} onAnswer={handleAnswer} disabled={submitting} />
          ) : mathBox ? (
            <Suspense fallback={<div style={{ minHeight: 120 }} />}>
              <MathWorkingInput key={q.id} question={{ ...q, total_marks: q.marks }} response={answers[String(q.id)]}
                onChange={v => handleAnswer(q.id, v)} disabled={submitting} onSubmit={() => {}} canSubmit={false} theme={theme} />
            </Suspense>
          ) : (
            <WrittenAnswerInput question={{ ...q, total_marks: q.marks }} response={answers[String(q.id)]}
              onChange={v => handleAnswer(q.id, v)} disabled={submitting} onSubmit={() => {}} canSubmit={false} theme={theme} />
          )}
        </QuestionCard>
      ))}

      {part1 ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="af-btn" onClick={() => go('part2')} style={btnStyle('primary', false)}>Next: short answer</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
          <div role="status" style={{ fontSize: 13.5, color: submitError ? 'var(--t-danger)' : C.muted, minHeight: 20 }}>
            {submitError
              ? submitError
              : confirmSubmit
                ? <>{unanswered} question{unanswered !== 1 ? 's are' : ' is'} unanswered. Submit anyway?</>
                : <><strong style={{ color: C.text }}>{questions.length - unanswered} of {questions.length}</strong> answered</>}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="af-btn" onClick={() => go('part1')} disabled={submitting} style={btnStyle('secondary', false)}>Back to multiple choice</button>
            <span style={{ flex: 1 }} />
            {confirmSubmit && (
              <button type="button" className="af-btn" onClick={() => setConfirmSubmit(false)} style={btnStyle('secondary', false)}>Keep going</button>
            )}
            <button type="button" className="af-btn" onClick={() => submit()} disabled={submitting}
              style={{ ...btnStyle('primary', false), opacity: submitting ? 0.7 : 1, cursor: submitting ? 'default' : 'pointer' }}>
              {submitting ? 'Submitting…' : confirmSubmit ? 'Submit anyway' : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
