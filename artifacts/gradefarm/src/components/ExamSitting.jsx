// Sitting a built exam under timed conditions (/exams/:attemptId/sit).
// First an instructions page (how long it goes for, what to have ready),
// then a full-screen timer: reading time (VCE only), writing time straight
// after, with Pause and End exam, chimes at the change-over and at 30, 10 and
// 5 minutes left, and "Pens down" at the end, which leads to marking.
// The timer is timestamps saved on the attempt (lib/examSitting.js), so it
// carries on through a refresh, a closed tab or another device.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, Square, Maximize2, Minimize2, Check, ExternalLink, Download } from 'lucide-react'
import { confirmDialog } from '../lib/dialog'
import { tally } from '../lib/examMarking'
import { dataBookletFor } from '../lib/subjects'
import { formatMinutes } from '../lib/examBuilder'
import {
  timesForSnapshot, startSitting, sittingState, pauseSitting, resumeSitting, skipReading, endSitting,
  timeIsUp, formatClock, formatSpan, warningCrossed, sectionAPace,
} from '../lib/examSitting'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
// One line of encouragement at the top of the timer, the same for the whole sitting.
const QUOTES = [
  "You've prepared for this. Trust your work.",
  'One question at a time.',
  'Read carefully, show your working, keep moving.',
  "Good luck. You've got this.",
  'Stay calm, stay focused, finish strong.',
  'Every mark counts. Keep going.',
  'Breathe. Read the question twice, then write.',
  'Hard work got you here. Now show it.',
]
const quoteFor = (id = '') => QUOTES[[...String(id)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % QUOTES.length]
const clockTime = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

// A timer's chime plays whatever the app's sound setting is: it's an alarm.
let audioCtx = null
function unlockAudio() {
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!Ctx) return
  try {
    if (!audioCtx) audioCtx = new Ctx()
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  } catch { audioCtx = null }
}
function chime(times = 2) {
  if (!audioCtx) return
  try {
    const now = audioCtx.currentTime
    for (let i = 0; i < times; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain()
      o.type = 'sine'; o.frequency.value = 880
      const at = now + i * 0.45
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(0.25, at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.38)
      o.connect(g); g.connect(audioCtx.destination)
      o.start(at); o.stop(at + 0.4)
    }
  } catch { /* no sound is fine */ }
}

export default function ExamSitting({ t, attempt, subject, store, onSaved, go, newExam }) {
  const [sitting, setSitting] = useState(attempt.sitting || null)
  const [saveFailed, setSaveFailed] = useState(false)
  const persist = (next) => {
    setSitting(next)
    Promise.resolve(store.saveSitting?.(attempt, next)).then(row => {
      if (row) { onSaved(row); setSaveFailed(false) } else setSaveFailed(true)
    }).catch(() => setSaveFailed(true))
  }

  const st = sittingState(sitting)
  if (!sitting) return <Instructions t={t} attempt={attempt} subject={subject} newExam={newExam} go={go} onBegin={(times) => { unlockAudio(); persist(startSitting(times)) }} />
  if (st.phase === 'done' && sitting.ended_at) return <PensDown t={t} attempt={attempt} sitting={sitting} go={go} />
  return <Clock t={t} attempt={attempt} sitting={sitting} persist={persist} saveFailed={saveFailed} />
}

// ── Before starting ──────────────────────────────────────────────────────────
function Instructions({ t, attempt, subject, newExam, go, onBegin }) {
  const snap = attempt.snapshot || {}
  const times = timesForSnapshot(snap)
  const marks = tally(snap, {}).available
  const questions = snap.questions?.length || 0
  const sace = snap.board === 'sace'
  const booklet = dataBookletFor(subject)
  const total = times.readingMinutes + times.writingMinutes
  const [ticked, setTicked] = useState({})

  const checklist = [
    { id: 'paper', text: 'Your printed exam paper', extra: attempt.exam_id && (
      <button type="button" className="ex-link" onClick={() => newExam(`exam=${attempt.exam_id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Download size={14} aria-hidden="true" /> Download the paper</button>
    ) },
    { id: 'pens', text: 'Black or blue pens, a pencil and an eraser' },
    { id: 'calc', text: 'Approved calculator' },
    booklet
      ? { id: 'booklet', text: `The ${booklet.title.toLowerCase()}`, extra: <a className="ex-link" href={booklet.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}><ExternalLink size={14} aria-hidden="true" /> Open it to print</a> }
      : { id: 'booklet', text: 'Any data booklet or formula sheet the exam allows' },
    { id: 'phone', text: 'Your phone on silent and out of reach' },
    { id: 'quiet', text: `Somewhere quiet for ${formatMinutes(total)}` },
  ]
  const ready = checklist.filter(c => ticked[c.id]).length
  const allReady = ready === checklist.length

  const fact = (label, value) => (
    <div style={{ padding: '12px 14px', borderRadius: 12, background: t.bgSubtle, border: `1px solid ${t.border}`, minWidth: 0 }}>
      <div className="ex-label">{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  )

  return (
    <main className="ex-main" style={{ maxWidth: 820 }}>
      <div className="ex-card" style={{ padding: '24px 24px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div className="ex-label">Before you start</div>
          <h1 style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>{attempt.title}</h1>
        </div>
        <p style={{ margin: 0, fontSize: 15, color: t.textSub, lineHeight: 1.6 }}>
          This exam goes for <b style={{ color: t.text }}>{formatMinutes(total)}</b>
          {sace ? ' of writing time. SACE exams have no reading time.' : `: ${formatMinutes(times.readingMinutes)} reading time, then ${formatMinutes(times.writingMinutes)} writing time.`}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          {fact('Marks', marks)}
          {fact('Questions', questions)}
          {!sace && fact('Reading time', formatMinutes(times.readingMinutes))}
          {fact('Writing time', formatMinutes(times.writingMinutes))}
        </div>

        <section aria-labelledby="sit-check" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <h2 id="sit-check" className="ex-h">Have these ready</h2>
            <span style={{ fontSize: 12.5, color: ready === checklist.length ? t.success : t.textMuted, fontWeight: 700 }}>{ready} of {checklist.length} ready</span>
          </div>
          {checklist.map(c => (
            <div key={c.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', padding: '10px 12px', borderRadius: 10, border: `1px solid ${ticked[c.id] ? t.borderAccent : t.border}` }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: '1 1 260px', fontSize: 14.5 }}>
                <input type="checkbox" checked={!!ticked[c.id]} onChange={e => setTicked(p => ({ ...p, [c.id]: e.target.checked }))} style={{ width: 18, height: 18, accentColor: t.text }} />
                {c.text}
              </label>
              {c.extra}
            </div>
          ))}
        </section>

        <section aria-labelledby="sit-how" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 id="sit-how" className="ex-h">How the timer works</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: t.textSub, lineHeight: 1.7 }}>
            {sace
              ? <li>Writing time starts as soon as you begin.</li>
              : <li>Reading time starts as soon as you begin. Read the paper, but don't start writing answers. Writing time follows straight on.</li>}
            <li>A chime sounds {sace ? '' : 'when writing time starts and '}when there are 30, 10 and 5 minutes left. Turn your sound on.</li>
            <li>You can pause, but pauses are shown with your result. End exam stops it early.</li>
            <li>The timer keeps running if you leave this page. Come back to Exams to carry on.</li>
          </ul>
        </section>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Only once everything on the checklist is ticked. */}
          <button type="button" className="ex-btn primary" style={{ minHeight: 46, padding: '11px 20px', fontSize: 15 }} disabled={!allReady} onClick={() => onBegin(times)}>
            {sace ? 'Begin writing time' : 'Begin reading time'}
          </button>
          <button type="button" className="ex-btn" onClick={() => go('/exams')}>Not now</button>
        </div>
      </div>
    </main>
  )
}

// ── The timer ────────────────────────────────────────────────────────────────
function Clock({ t, attempt, sitting, persist, saveFailed }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  const st = sittingState(sitting, now)
  const sace = !sitting.reading_ms
  const [notice, setNotice] = useState('')

  // Time ran out (here, or while the page was closed): pens down.
  useEffect(() => {
    if (timeIsUp(sitting, now)) { chime(3); persist(endSitting(sitting, now, 'time')) }
  }, [now]) // eslint-disable-line react-hooks/exhaustive-deps

  // The change to writing time, and the warnings near the end.
  const prev = useRef(null)
  useEffect(() => {
    const p = prev.current
    prev.current = st
    if (!p || st.paused) return
    if (p.phase === 'reading' && st.phase === 'writing') { chime(2); setNotice('Writing time has started. You may begin writing.') }
    else if (st.phase === 'writing') {
      const w = warningCrossed(p.writingLeft, st.writingLeft)
      if (w) { chime(w === 5 ? 3 : 1); setNotice(`${w} minutes of writing time left.`) }
    }
  }, [now]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!notice) return undefined
    const id = setTimeout(() => setNotice(''), 12_000)
    return () => clearTimeout(id)
  }, [notice])

  // The clock in the tab's title, and the screen kept awake while it runs.
  const label = st.paused ? 'Paused' : st.phase === 'reading' ? 'Reading time' : 'Writing time'
  const before = useRef(typeof document !== 'undefined' ? document.title : '')
  useEffect(() => { document.title = `${formatClock(st.left)} · ${label}` })
  useEffect(() => () => { document.title = before.current }, [])
  useEffect(() => {
    if (st.paused || !navigator.wakeLock) return undefined
    let lock = null, gone = false
    const get = () => navigator.wakeLock.request('screen').then(l => { if (gone) l.release(); else lock = l }).catch(() => {})
    const onVis = () => { if (document.visibilityState === 'visible') get() }
    get()
    document.addEventListener('visibilitychange', onVis)
    return () => { gone = true; document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => {}) }
  }, [st.paused])

  const [full, setFull] = useState(typeof document !== 'undefined' && !!document.fullscreenElement)
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.())?.catch?.(() => {})
  // Leave full screen with the timer.
  useEffect(() => () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}) }, [])

  const phaseMs = st.phase === 'reading' ? sitting.reading_ms : sitting.writing_ms
  const progress = Math.min(1, Math.max(0, 1 - st.left / phaseMs))
  const pace = useMemo(() => sectionAPace(attempt.snapshot, sitting.writing_ms), [attempt.snapshot, sitting.writing_ms])
  const writingUsed = sitting.writing_ms - st.writingLeft
  const accent = st.paused ? t.textMuted : st.phase === 'reading' ? t.blue : st.left <= 5 * 60_000 ? t.danger : t.goldText

  const end = async () => {
    unlockAudio()
    const ok = await confirmDialog(`You have ${formatSpan(st.phase === 'reading' ? st.left + sitting.writing_ms : st.left)} left. Your time so far is kept, and you can mark the exam next.`, { title: 'End the exam now?', confirm: 'End exam', danger: true })
    if (ok) persist(endSitting(sitting, Date.now(), 'early'))
  }
  const ctl = (extra = {}) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, padding: '12px 20px', borderRadius: 12,
    fontFamily: FONT_B, fontSize: 15, fontWeight: 800, cursor: 'pointer', border: `1px solid ${t.borderMid}`, background: t.bgCard, color: t.text, ...extra,
  })

  return (
    <div role="region" aria-label="Exam timer" style={{ position: 'fixed', inset: 0, zIndex: 1500, background: t.bg, color: t.text, fontFamily: FONT_B, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attempt.title}</div>
          <div style={{ fontSize: 12.5, color: t.textMuted }}>{tally(attempt.snapshot, {}).available} marks{sace ? ' · no reading time' : ''}</div>
        </div>
        <button type="button" onClick={toggleFull} aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen' : 'Full screen'}
          style={{ ...ctl({ minHeight: 38, padding: '8px 12px', fontSize: 13 }) }}>
          {full ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}<span className="sit-hide-sm">{full ? 'Exit full screen' : 'Full screen'}</span>
        </button>
      </div>

      <div style={{ padding: '16px 20px 0', textAlign: 'center', fontSize: 15, fontStyle: 'italic', color: t.textSub }}>{quoteFor(attempt.id)}</div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '28px 20px', textAlign: 'center' }}>
        {notice && <div role="status" style={{ padding: '10px 18px', borderRadius: 999, background: t.accentGlow, border: `1px solid ${t.borderAccent}`, fontSize: 15, fontWeight: 700 }}>{notice}</div>}
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.text }}>{label}</div>
        <div aria-live="off" style={{ fontSize: 'clamp(64px, 17vw, 168px)', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', opacity: st.paused ? 0.45 : 1 }}>
          {formatClock(st.left)}
        </div>
        <div style={{ width: 'min(560px, 100%)', height: 8, borderRadius: 4, background: t.bgHover }} aria-hidden="true">
          <div style={{ width: `${progress * 100}%`, height: 8, borderRadius: 4, background: accent, transition: 'width 0.25s linear' }} />
        </div>
        {(st.paused || st.phase === 'writing') && <div style={{ fontSize: 15, color: t.textSub, lineHeight: 1.6, maxWidth: 560 }}>
          {st.paused
            ? 'The clock is stopped. Pauses are shown with your result.'
            : <>Writing time ends at <b style={{ color: t.text }}>{clockTime(now + st.left)}</b>.{pace && (writingUsed < pace.ms
                  ? <> Aim to finish Section A ({pace.aMarks} marks) by <b style={{ color: t.text }}>{clockTime(now + pace.ms - writingUsed)}</b>.</>
                  : <> Section B ({pace.bMarks} marks) now.</>)}</>}
        </div>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
          {st.paused
            ? <button type="button" onClick={() => { unlockAudio(); persist(resumeSitting(sitting)) }} style={ctl({ border: 'none', background: t.accent, color: 'var(--t-onAccent)' })}><Play size={18} aria-hidden="true" /> Resume</button>
            : <button type="button" onClick={() => persist(pauseSitting(sitting))} style={ctl()}><Pause size={18} aria-hidden="true" /> Pause</button>}
          {st.phase === 'reading' && !st.paused && (
            <button type="button" onClick={() => { unlockAudio(); persist(skipReading(sitting)) }} style={ctl()}>Start writing now</button>
          )}
          <button type="button" onClick={end} style={ctl({ color: t.danger })}><Square size={16} aria-hidden="true" /> End exam</button>
        </div>
        {saveFailed && <div role="alert" style={{ fontSize: 12.5, color: t.textMuted }}>Couldn't save the timer just now. It keeps running here; keep this page open.</div>}
      </div>
      <style>{'@media (max-width: 520px) { .sit-hide-sm { display: none; } }'}</style>
    </div>
  )
}

// ── Finished ─────────────────────────────────────────────────────────────────
function PensDown({ t, attempt, sitting, go }) {
  const st = sittingState(sitting)
  const allowed = (sitting.reading_ms || 0) + sitting.writing_ms
  return (
    <main className="ex-main" style={{ maxWidth: 720 }}>
      <div className="ex-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: t.accentGlow, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={22} aria-hidden="true" /></div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{st.ended === 'time' ? "Time's up. Pens down." : 'Exam ended'}</h1>
        <div style={{ fontSize: 15, color: t.textSub, lineHeight: 1.6 }}>
          You used <b style={{ color: t.text }}>{formatSpan(st.used)}</b> of {formatSpan(allowed)}
          {st.pauseCount ? `, and paused ${st.pauseCount === 1 ? 'once' : `${st.pauseCount} times`} (${formatSpan(st.pausedMs)})` : ''}.
          {' '}Now mark it against the solutions while it's fresh.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="ex-btn primary" onClick={() => go(`/exams/${attempt.id}/mark`)}>Mark it now</button>
          <button type="button" className="ex-btn" onClick={() => go('/exams')}>Back to Exams</button>
        </div>
      </div>
    </main>
  )
}
