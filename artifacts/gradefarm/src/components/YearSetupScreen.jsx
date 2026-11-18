import { useEffect, useMemo, useState } from 'react'
import { THEMES } from '../lib/theme'
import { AuthLayout, Field, Note, authBtn, linkStyle, choiceChip } from './AuthLayout'
import CalmBackground from './CalmBackground'
import InfinityLoader from './InfinityLoader'
import { groupSubject } from '../lib/homeSubjects'
import { courseOrder, coveredSubtopics, daysUntil } from '../lib/yearPlan'
import { curriculumIdOf, loadCourse, loadYearSetup, saveYearSetup, addStudentTest, deleteStudentTest } from '../lib/yearSetup'

const KINDS = [['test', 'Test'], ['sat', 'SAT'], ['investigation', 'Investigation'], ['exam', 'Exam']]
const STEPS = ['topic', 'sub', 'skipped', 'test']

const fmtDate = (s) => {
  const [y, m, d] = String(s || '').split('-').map(Number)
  return y ? new Date(y, m - 1, d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : s
}

/**
 * Set up your year (from the card on Practice): one question per screen, in
 * onboarding's style. Which topic their class is on, which part of it, what
 * their class skipped, and their tests. Saves as it goes; Practice then shows
 * the week's plan (YearPlanCard). Opening it again edits what's saved.
 */
export default function YearSetupScreen({ profile, subject, theme = 'dark', onToggleTheme, onDone }) {
  const t = THEMES[theme]
  const curriculumId = curriculumIdOf(subject)
  const short = groupSubject({ name: subject?.name, level: subject?.stage }).name || subject?.name || 'your subject'
  const [course, setCourse] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [step, setStep] = useState('topic')
  const [topicId, setTopicId] = useState(null)
  const [currentId, setCurrentId] = useState(null)
  const [skipped, setSkipped] = useState(() => new Set())
  const [tests, setTests] = useState([])
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!curriculumId || !profile?.id) return
    let alive = true
    Promise.all([loadCourse(curriculumId), loadYearSetup(profile.id, curriculumId)])
      .then(([c, saved]) => {
        if (!alive) return
        setCourse(c)
        setTests(saved.tests)
        const s = saved.setup
        if (s?.current_subtopic_id) {
          setCurrentId(s.current_subtopic_id)
          setSkipped(new Set(s.skipped_subtopic_ids || []))
          const sub = c.topics.flatMap(tp => tp.subtopics).find(x => x.id === s.current_subtopic_id)
          if (sub) setTopicId(sub.topic_id)
        }
      })
      .catch(() => { if (alive) setLoadError("Your subject's topics couldn't be loaded. Check your connection and try again.") })
    return () => { alive = false }
  }, [curriculumId, profile?.id])

  const flat = useMemo(() => courseOrder(course?.topics || []), [course])
  const topics = useMemo(() => [...(course?.topics || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)), [course])
  const topic = topics.find(tp => tp.id === topicId)
  const topicNum = topic ? topics.indexOf(topic) + 1 : 0
  const current = flat.find(s => s.id === currentId)
  const before = current ? flat.slice(0, flat.indexOf(current)) : []
  const covered = coveredSubtopics(flat, currentId, [...skipped])
  const at = STEPS.indexOf(step)

  const newForm = () => ({
    name: topicNum ? `Topic ${topicNum} test` : '',
    test_date: '',
    kind: 'test',
    subtopic_ids: covered.filter(s => s.topicId === topicId).map(s => s.id),
  })
  const go = (s) => { setError(''); setStep(s); if (s === 'test' && !form) setForm(newForm()) }
  const pickThen = (fn, next) => { fn(); setTimeout(() => go(next), 160) }

  const formReady = !!(form?.name.trim() && form?.test_date)
  const saveForm = async () => {
    if (!formReady) return true
    setBusy('test'); setError('')
    try {
      const row = await addStudentTest(profile.id, curriculumId, form)
      setTests(ts => [...ts, row].sort((a, b) => a.test_date.localeCompare(b.test_date)))
      setForm({ ...newForm(), name: '' })
      return true
    } catch (e) {
      setError(e?.message && !/fetch/i.test(e.message) ? e.message : "That test couldn't be saved. Check your connection and try again.")
      return false
    } finally { setBusy('') }
  }
  const removeTest = async (id) => {
    try { await deleteStudentTest(id); setTests(ts => ts.filter(x => x.id !== id)) }
    catch { setError("That test couldn't be removed. Try again.") }
  }
  const finish = async ({ noDates = false } = {}) => {
    if (!noDates && !(await saveForm())) return
    setBusy('save'); setError('')
    try {
      await saveYearSetup(profile.id, curriculumId, {
        current_subtopic_id: currentId,
        skipped_subtopic_ids: [...skipped].filter(id => before.some(s => s.id === id)),
        no_test_dates: noDates && tests.length === 0,
        checked_in_at: new Date().toISOString(),
      })
      onDone?.()
    } catch (e) {
      setError(e?.message && !/fetch/i.test(e.message) ? e.message : "We couldn't save your year. Check your connection and try again.")
      setBusy('')
    }
  }

  const H = ({ children }) => <h1 style={{ margin: 0, fontSize: 'clamp(24px, 5vw, 30px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.2, color: t.text, textWrap: 'balance' }}>{children}</h1>
  const Sub = ({ children }) => <p style={{ margin: 0, fontSize: 14.5, color: t.textMuted, lineHeight: 1.6, maxWidth: '50ch' }}>{children}</p>
  const back = (to) => <button type="button" className="af-link" onClick={() => go(to)} style={{ ...linkStyle(t), fontSize: 13.5, fontWeight: 600, textDecorationColor: t.border, color: t.textMuted }}>Back</button>
  const bigInput = { fontSize: 17, padding: '13px 15px', borderRadius: 11, maxWidth: 380 }

  let body
  if (!curriculumId) body = <Note theme={theme}>Setting up your year works with GradeFarm's own subjects. Pick one from your subjects first.</Note>
  else if (loadError) body = <Note tone="danger" theme={theme}>{loadError}</Note>
  else if (!course) body = <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><InfinityLoader size={56} /></div>
  else if (step === 'topic') body = (
    <>
      <span style={{ fontSize: 13, fontWeight: 600, color: t.textMuted }}>Question 1 of 4</span>
      <H>Which topic is your class on?</H>
      <div role="radiogroup" aria-label="Topic" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
        {topics.map((tp, i) => (
          <button key={tp.id} type="button" role="radio" aria-checked={topicId === tp.id} className="af-chip"
            onClick={() => pickThen(() => { if (topicId !== tp.id) { setTopicId(tp.id); setCurrentId(null) } }, 'sub')}
            style={{ ...choiceChip(t, topicId === tp.id, 'lg'), textAlign: 'left' }}>
            Topic {i + 1} · {tp.name.replace(/^Topic\s*\d+\s*[:.\-–]\s*/i, '')}
          </button>
        ))}
      </div>
      <div><button type="button" className="af-link" onClick={onDone} style={{ ...linkStyle(t), fontSize: 13.5, fontWeight: 600, textDecorationColor: t.border, color: t.textMuted }}>Not now</button></div>
    </>
  )
  else if (step === 'sub') body = (
    <>
      <span style={{ fontSize: 13, fontWeight: 600, color: t.textMuted }}>Question 2 of 4</span>
      <H>Which part of Topic {topicNum}?</H>
      <Sub>The part you're doing in class now.</Sub>
      <div role="radiogroup" aria-label="Subtopic" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {[...(topic?.subtopics || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).map(s => (
          <button key={s.id} type="button" role="radio" aria-checked={currentId === s.id} className="af-chip"
            onClick={() => pickThen(() => { if (currentId !== s.id) { setCurrentId(s.id); setSkipped(new Set()); setForm(null) } }, 'skipped')}
            style={choiceChip(t, currentId === s.id, 'lg')}>
            {s.name}
          </button>
        ))}
      </div>
      <div>{back('topic')}</div>
    </>
  )
  else if (step === 'skipped') body = (
    <>
      <span style={{ fontSize: 13, fontWeight: 600, color: t.textMuted }}>Question 3 of 4</span>
      <H>Anything your class hasn't done yet?</H>
      <Sub>{before.length ? <>We've counted everything before {current?.name} as done. Tap any your class skipped or will come back to.</> : 'Nothing comes before it: you’re right at the start.'}</Sub>
      {before.length > 0 && (
        <div role="group" aria-label="Earlier subtopics" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {before.map(s => {
            const off = skipped.has(s.id)
            return (
              <button key={s.id} type="button" aria-pressed={off} className="af-chip"
                onClick={() => setSkipped(prev => { const n = new Set(prev); off ? n.delete(s.id) : n.add(s.id); return n })}
                style={{ ...choiceChip(t, false), ...(off ? { textDecoration: 'line-through', borderStyle: 'dashed', color: t.textMuted, background: 'transparent' } : {}) }}>
                {s.name}
              </button>
            )
          })}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
        <button type="button" className="af-btn" onClick={() => go('test')} style={authBtn(t, 'primary')}>
          {skipped.size ? `Next (${skipped.size} not done yet)` : 'Next'}
        </button>
        {back('sub')}
      </div>
    </>
  )
  else body = (
    <>
      <span style={{ fontSize: 13, fontWeight: 600, color: t.textMuted }}>Question 4 of 4</span>
      <H>{tests.length ? 'Any other tests coming up?' : `When's your next ${short} test?`}</H>
      <Sub>
        {course.examDate ? <>Your exam on {fmtDate(course.examDate)} is already in. </> : null}
        Add your school&rsquo;s tests, SATs and investigations as you find out about them.
      </Sub>
      {tests.length > 0 && (
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, maxWidth: 520 }}>
          {tests.map((x, i) => (
            <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i ? `1px solid ${t.border}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: t.text }}>{x.name}</div>
                <div style={{ fontSize: 12.5, color: t.textMuted }}>{fmtDate(x.test_date)}{daysUntil(x.test_date) >= 0 ? ` · in ${daysUntil(x.test_date)} days` : ''}</div>
              </div>
              <button type="button" className="af-link" onClick={() => removeTest(x.id)} aria-label={`Remove ${x.name}`} style={{ ...linkStyle(t), fontSize: 13, fontWeight: 600, textDecorationColor: t.border, color: t.textMuted }}>Remove</button>
            </div>
          ))}
        </div>
      )}
      {form && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
          <Field id="ys-name" label="What's it called?" theme={theme}>
            <input id="ys-name" className="af-inp" style={bigInput} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field id="ys-date" label="When is it?" theme={theme}>
            <input id="ys-date" className="af-inp" type="date" style={bigInput} value={form.test_date} onChange={e => setForm(f => ({ ...f, test_date: e.target.value }))} />
          </Field>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span id="ys-kind" style={{ fontSize: 13, fontWeight: 700, color: t.textSub }}>What kind?</span>
            <div role="radiogroup" aria-labelledby="ys-kind" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {KINDS.map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={form.kind === k} className="af-chip" onClick={() => setForm(f => ({ ...f, kind: k }))} style={choiceChip(t, form.kind === k)}>{label}</button>
              ))}
            </div>
          </div>
          {covered.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span id="ys-topics" style={{ fontSize: 13, fontWeight: 700, color: t.textSub }}>What&rsquo;s in it? <span style={{ fontWeight: 500, color: t.textMuted }}>We&rsquo;ve ticked what your class has covered in this topic.</span></span>
              <div role="group" aria-labelledby="ys-topics" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {covered.map(s => {
                  const on = form.subtopic_ids.includes(s.id)
                  return (
                    <button key={s.id} type="button" aria-pressed={on} className="af-chip" style={choiceChip(t, on)}
                      onClick={() => setForm(f => ({ ...f, subtopic_ids: on ? f.subtopic_ids.filter(x => x !== s.id) : [...f.subtopic_ids, s.id] }))}>
                      {s.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {error && <Note tone="danger" theme={theme}>{error}</Note>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
        <button type="button" className="af-btn" onClick={() => finish()} disabled={!!busy || (!formReady && tests.length === 0)}
          style={authBtn(t, 'primary', { disabled: !!busy || (!formReady && tests.length === 0) })}>
          {busy === 'save' ? 'Saving…' : 'See my week'}
        </button>
        <button type="button" className="af-btn" onClick={saveForm} disabled={!formReady || !!busy} style={authBtn(t, 'secondary', { disabled: !formReady || !!busy })}>Add another</button>
        {tests.length === 0 && <button type="button" className="af-btn" onClick={() => finish({ noDates: true })} disabled={!!busy} style={authBtn(t, 'secondary', { disabled: !!busy })}>I don&rsquo;t know yet</button>}
        {back('skipped')}
      </div>
    </>
  )

  return (
    <AuthLayout theme={theme} backdrop={<CalmBackground theme={theme} />} onToggleTheme={onToggleTheme} align="top"
      center={course && !loadError && (
        <div role="progressbar" aria-label="Setting up your year" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={at + 1} style={{ display: 'flex', gap: 5 }}>
          {STEPS.map((s, i) => <span key={s} style={{ width: 22, height: 3, borderRadius: 3, background: i <= at ? t.text : t.border }} />)}
        </div>
      )}>
      <div key={step} className="af-in" style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 18, padding: 'clamp(16px, 10vh, 100px) 0 0' }}>
        {body}
      </div>
    </AuthLayout>
  )
}
