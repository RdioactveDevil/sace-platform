import { useState, useEffect, useRef } from 'react'
import { THEMES } from '../lib/theme'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const NAVY = '#0c1037'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

// Essay types map to the /api/writing pipeline. `subject` drives the school-level
// year range; GAMSAT types ignore it (assessed at adult/graduate level).
const ESSAY_TYPES = [
  { id: 'persuasive',       label: 'Persuasive',     subject: 'writing_y910', blurb: 'Argue a position', timed: 30 },
  { id: 'narrative',        label: 'Narrative',      subject: 'writing_y910', blurb: 'Tell a story',     timed: 30 },
  { id: 'gamsat_argument',  label: 'GAMSAT Task A',  subject: 'gamsat',       blurb: 'Argumentative (theme)', timed: 30 },
  { id: 'gamsat_reflective',label: 'GAMSAT Task B',  subject: 'gamsat',       blurb: 'Reflective (theme)',    timed: 30 },
]

function clock(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function ScoreBar({ t, name, score, comment }) {
  const pct = Math.round((score / 10) * 100)
  const c = score >= 7 ? t.success : score >= 4 ? GOLD : t.danger
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 10 }}>
        <span style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>{name}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: c }}>{score}/10</span>
      </div>
      <div style={{ background: t.borderMid, borderRadius: 999, height: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: c, borderRadius: 999, transition: 'width 0.6s ease' }} />
      </div>
      {comment && <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4, lineHeight: 1.5 }}>{comment}</div>}
    </div>
  )
}

export default function EssayMarkerScreen({ theme = 'dark', onExit }) {
  const t = THEMES[theme]
  const [typeId, setTypeId] = useState('persuasive')
  const [prompt, setPrompt] = useState('')
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [essay, setEssay] = useState('')
  const [marking, setMarking] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [error, setError] = useState('')
  const [timed, setTimed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const timerRef = useRef(null)

  const type = ESSAY_TYPES.find((x) => x.id === typeId)
  const words = essay.trim() ? essay.trim().split(/\s+/).length : 0

  useEffect(() => () => clearInterval(timerRef.current), [])

  const startTimer = () => {
    clearInterval(timerRef.current)
    setTimeLeft(type.timed * 60)
    setTimed(true)
    timerRef.current = setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) { clearInterval(timerRef.current); return 0 }
        return s - 1
      })
    }, 1000)
  }
  const stopTimer = () => { clearInterval(timerRef.current); setTimed(false); setTimeLeft(0) }

  const generatePrompt = async () => {
    setLoadingPrompt(true); setError(''); setFeedback(null)
    try {
      const res = await fetch('/api/writing/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: type.subject, essayType: typeId }),
      })
      const data = await res.json()
      if (!res.ok || !data.prompt) throw new Error(data.detail || data.error || 'Could not generate a prompt')
      setPrompt(data.prompt)
    } catch (e) {
      setError(e.message || 'Failed to generate a prompt')
    }
    setLoadingPrompt(false)
  }

  const getMarking = async () => {
    if (!essay.trim()) { setError('Write your response before submitting for marking.'); return }
    setMarking(true); setError(''); setFeedback(null)
    clearInterval(timerRef.current)
    try {
      const res = await fetch('/api/writing/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: type.subject, essayType: typeId, mode: 'full_essay', prompt: prompt || '(no prompt — free response)', content: essay }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Marking failed')
      setFeedback(data)
    } catch (e) {
      setError(e.message || 'Marking failed')
    }
    setMarking(false)
  }

  const reset = () => { setFeedback(null); setEssay(''); setPrompt(''); stopTimer() }

  const inputBg = { background: t.bgSubtle, border: `1px solid ${t.border}`, color: t.text, fontFamily: FONT_B }

  return (
    <div style={{ minHeight: '100vh', background: t.bg, fontFamily: FONT_B, padding: '36px 20px 80px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {onExit && (
          <button onClick={onExit} style={{ marginBottom: 14, padding: '7px 14px', borderRadius: 9, border: `1px solid ${t.border}`, background: t.bgCard, color: t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>← Back</button>
        )}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: t.accentGlow, border: `1px solid ${t.borderAccent}`, color: GOLD, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            ✍️ AI Essay Marker
          </div>
          <div style={{ fontFamily: FONT_D, fontSize: 28, color: t.text, letterSpacing: 1 }}>Get your writing marked instantly</div>
          <div style={{ fontSize: 14, color: t.textMuted, marginTop: 8, lineHeight: 1.6, maxWidth: 540, margin: '8px auto 0' }}>
            Pick a task, generate a real-style prompt, write under timed conditions, and get a band score with criterion-by-criterion feedback.
          </div>
        </div>

        {/* Type picker */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 18 }}>
          {ESSAY_TYPES.map((x) => (
            <button key={x.id} onClick={() => { setTypeId(x.id); setFeedback(null); setPrompt('') }}
              style={{ padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
                border: `1px solid ${typeId === x.id ? t.borderAccent : t.border}`,
                background: typeId === x.id ? t.accentGlow : t.bgCard,
                color: typeId === x.id ? GOLD : t.textMuted }}>
              {x.label}<span style={{ opacity: 0.6, marginLeft: 6, fontSize: 11 }}>{x.blurb}</span>
            </button>
          ))}
        </div>

        {/* Prompt */}
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: prompt ? 12 : 0 }}>
            <span style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Prompt</span>
            <button onClick={generatePrompt} disabled={loadingPrompt}
              style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${t.borderAccent}`, background: t.accentGlow, color: GOLD, fontSize: 12, fontWeight: 700, cursor: loadingPrompt ? 'default' : 'pointer', fontFamily: FONT_B }}>
              {loadingPrompt ? 'Generating…' : prompt ? '↻ New prompt' : '✨ Generate prompt'}
            </button>
          </div>
          {prompt && <div style={{ fontSize: 14, color: t.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{prompt}</div>}
        </div>

        {/* Composer */}
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Your response</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>{words} words</span>
              {timed
                ? <span style={{ fontSize: 12, fontWeight: 800, color: timeLeft <= 60 ? t.danger : GOLD, background: t.accentGlow, padding: '3px 10px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>⏱ {clock(timeLeft)}</span>
                : <button onClick={startTimer} style={{ padding: '5px 11px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>⏱ Start {type.timed}-min timer</button>}
              {timed && <button onClick={stopTimer} style={{ padding: '5px 11px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>Stop</button>}
            </div>
          </div>
          <textarea value={essay} onChange={(e) => setEssay(e.target.value)} placeholder="Write your essay here…"
            style={{ ...inputBg, width: '100%', minHeight: 280, borderRadius: 12, padding: '14px 16px', fontSize: 15, lineHeight: 1.7, resize: 'vertical', outline: 'none' }} />
          <button onClick={getMarking} disabled={marking}
            style={{ marginTop: 14, width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: marking ? t.bgHover : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: marking ? t.textFaint : NAVY, fontSize: 15, fontWeight: 800, cursor: marking ? 'default' : 'pointer', fontFamily: FONT_B }}>
            {marking ? 'Marking your essay…' : 'Mark my essay →'}
          </button>
          {error && <div style={{ marginTop: 10, fontSize: 13, color: t.danger }}>{error}</div>}
        </div>

        {/* Feedback */}
        {feedback && (
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: 22, animation: 'ess-in 0.25s ease' }}>
            <style>{`@keyframes ess-in { from { opacity:0; transform: translateY(10px);} to {opacity:1; transform:none;} }`}</style>
            {typeof feedback.overallScore === 'number' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', flexShrink: 0, background: t.accentGlow, border: `2px solid ${t.borderAccent}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: GOLD, fontFamily: FONT_D, lineHeight: 1 }}>{feedback.overallScore}</span>
                  <span style={{ fontSize: 10, color: t.textMuted }}>/ 10</span>
                </div>
                <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.65 }}>{feedback.overallImpression}</div>
              </div>
            )}
            {!('overallScore' in feedback) && feedback.overallImpression && (
              <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.65, marginBottom: 16 }}>{feedback.overallImpression}</div>
            )}

            {Array.isArray(feedback.criteriaScores) && feedback.criteriaScores.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Criterion scores</div>
                {feedback.criteriaScores.map((c, i) => <ScoreBar key={i} t={t} name={c.name} score={c.score} comment={c.comment} />)}
              </div>
            )}

            {Array.isArray(feedback.annotations) && feedback.annotations.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Specific feedback</div>
                {feedback.annotations.map((a, i) => (
                  <div key={i} style={{ marginBottom: 10, padding: '10px 12px', background: t.bgSubtle, borderRadius: 10, border: `1px solid ${t.border}` }}>
                    {a.aspect && <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 3 }}>{a.aspect}</div>}
                    {a.quote && <div style={{ fontSize: 12, color: t.textMuted, fontStyle: 'italic', marginBottom: 3 }}>“{a.quote}”</div>}
                    {a.comment && <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>{a.comment}</div>}
                  </div>
                ))}
              </div>
            )}

            {Array.isArray(feedback.improvements) && feedback.improvements.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>What to improve next time</div>
                {feedback.improvements.map((imp, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7, fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
                    <span style={{ color: GOLD, flexShrink: 0 }}>→</span><span>{imp}</span>
                  </div>
                ))}
              </div>
            )}

            <button onClick={reset} style={{ marginTop: 18, width: '100%', padding: '12px', borderRadius: 12, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
              Write another →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
