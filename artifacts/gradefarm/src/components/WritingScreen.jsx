import { useState, useEffect, useRef } from 'react'
import { saveWritingAttempt, updateWritingAttemptFeedback, getWritingAttempts } from '../lib/writingDb'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const TEAL   = '#14b8a6'

const NARRATIVE_FIELDS = [
  { key: 'context',        label: 'Context / Scene' },
  { key: 'rising_action',  label: 'Rising Action' },
  { key: 'climax',         label: 'Climax' },
  { key: 'falling_action', label: 'Falling Action' },
  { key: 'resolution',     label: 'Resolution' },
  { key: 'character',      label: 'Character Development' },
]

const PERSUASIVE_FIELDS = [
  { key: 'contention',       label: 'Contention' },
  { key: 'argument1',        label: 'Argument 1' },
  { key: 'argument2',        label: 'Argument 2' },
  { key: 'important_points', label: 'Important Points to Include' },
]

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function WritingScreen({ subject, profile, onBack }) {
  const [stage,          setStage]          = useState('setup')
  const [essayType,      setEssayType]      = useState('narrative')
  const [mode,           setMode]           = useState('full_essay')

  const [essayTimed,     setEssayTimed]     = useState(false)
  const [essayMinutes,   setEssayMinutes]   = useState(40)

  const [plannerTimed,   setPlannerTimed]   = useState(true)
  const [plannerMinutes, setPlannerMinutes] = useState(2)

  const [prompt,         setPrompt]         = useState('')
  const [imageUrl,       setImageUrl]       = useState(null)
  const [loadingPrompt,  setLoadingPrompt]  = useState(false)
  const [promptError,    setPromptError]    = useState(null)

  const [essayText,      setEssayText]      = useState('')
  const [plannerFields,  setPlannerFields]  = useState({})

  const [secondsLeft,    setSecondsLeft]    = useState(null)
  const [startTime,      setStartTime]      = useState(null)
  const timerRef = useRef(null)

  const [loadingFeedback, setLoadingFeedback] = useState(false)
  const [feedback,        setFeedback]        = useState(null)
  const [feedbackError,   setFeedbackError]   = useState(null)
  const [attemptId,       setAttemptId]       = useState(null)

  const [showPast,    setShowPast]    = useState(false)
  const [pastAttempts, setPastAttempts] = useState([])
  const [loadingPast,  setLoadingPast]  = useState(false)
  const [selectedPast, setSelectedPast] = useState(null)

  const timed   = mode === 'full_essay' ? essayTimed   : plannerTimed
  const minutes = mode === 'full_essay' ? essayMinutes : plannerMinutes

  useEffect(() => {
    if (stage !== 'writing' || !timed) return
    const secs = minutes * 60
    setSecondsLeft(secs)
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { clearInterval(timerRef.current); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [stage])

  const handleGeneratePrompt = async () => {
    setLoadingPrompt(true)
    setPromptError(null)
    try {
      const res = await fetch('/api/writing/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.id, essayType }),
      })
      if (!res.ok) throw new Error('Failed to generate prompt')
      const data = await res.json()
      setPrompt(data.prompt)
      setImageUrl(data.imageUrl || null)
      setStage('prompt')
    } catch (err) {
      setPromptError(err.message)
    } finally {
      setLoadingPrompt(false)
    }
  }

  const handleStartWriting = () => {
    setEssayText('')
    setPlannerFields({})
    setStartTime(Date.now())
    setStage('writing')
  }

  const handleSubmit = async () => {
    clearInterval(timerRef.current)
    const actualSeconds = startTime ? Math.floor((Date.now() - startTime) / 1000) : null
    const content = mode === 'full_essay' ? essayText : plannerFields

    setLoadingFeedback(true)
    setFeedback(null)
    setFeedbackError(null)
    setAttemptId(null)
    setStage('feedback')

    let savedId = null
    try {
      savedId = await saveWritingAttempt(profile.id, {
        subject: subject.id,
        essayType,
        mode,
        prompt,
        imageUrl,
        content,
        feedback: null,
        timed,
        durationSeconds: timed ? minutes * 60 : null,
        actualSeconds,
      })
      setAttemptId(savedId)
    } catch {}

    try {
      const res = await fetch('/api/writing/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.id, essayType, mode, prompt, imageUrl, content }),
      })
      if (!res.ok) throw new Error('Failed to get feedback')
      const fb = await res.json()
      setFeedback(fb)
      if (savedId) {
        try { await updateWritingAttemptFeedback(savedId, fb) } catch {}
      }
    } catch (err) {
      setFeedbackError(err.message)
    } finally {
      setLoadingFeedback(false)
    }
  }

  const handleTryAgain = () => {
    clearInterval(timerRef.current)
    setStage('setup')
    setPrompt('')
    setImageUrl(null)
    setFeedback(null)
    setFeedbackError(null)
    setEssayText('')
    setPlannerFields({})
    setSecondsLeft(null)
    setStartTime(null)
    setAttemptId(null)
  }

  const handleShowPast = async () => {
    setLoadingPast(true)
    setShowPast(true)
    setSelectedPast(null)
    try {
      const attempts = await getWritingAttempts(profile.id, subject.id)
      setPastAttempts(attempts)
    } catch {}
    setLoadingPast(false)
  }

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const s = {
    container: {
      maxWidth: 780, margin: '0 auto', padding: '32px 24px',
      fontFamily: FONT_B, color: '#f1f5f9',
    },
    label: {
      display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8,
    },
    toggleBtn: (active) => ({
      padding: '9px 20px', borderRadius: 8, cursor: 'pointer',
      border: `1px solid ${active ? TEAL : 'rgba(255,255,255,0.12)'}`,
      background: active ? 'rgba(20,184,166,0.12)' : 'transparent',
      color: active ? TEAL : 'rgba(255,255,255,0.5)',
      fontSize: 13, fontWeight: 700, fontFamily: FONT_B,
    }),
    primaryBtn: (disabled = false) => ({
      padding: '12px 28px', borderRadius: 10, border: 'none',
      background: disabled ? 'rgba(255,255,255,0.08)' : TEAL,
      color: disabled ? 'rgba(255,255,255,0.3)' : '#fff',
      fontSize: 14, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: FONT_B,
    }),
    ghostBtn: {
      padding: '10px 20px', borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.12)',
      background: 'transparent', color: 'rgba(255,255,255,0.5)',
      fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B,
    },
    textarea: {
      width: '100%', padding: '12px 14px', borderRadius: 10,
      border: '1px solid rgba(255,255,255,0.12)',
      background: '#0c1037', color: '#f1f5f9',
      fontSize: 14, fontFamily: FONT_B, resize: 'vertical',
      outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
    },
    promptPanel: {
      marginBottom: 24, borderRadius: 12,
      border: '1px solid rgba(20,184,166,0.25)',
      background: 'rgba(20,184,166,0.06)', overflow: 'hidden',
    },
    numInput: {
      width: 64, padding: '8px 10px', borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.12)',
      background: '#0c1037', color: '#fff',
      fontSize: 14, fontFamily: FONT_B, outline: 'none', textAlign: 'center',
    },
  }

  const PromptPanel = ({ compact = false }) => (
    <div style={{ ...s.promptPanel, marginBottom: compact ? 16 : 24 }}>
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Writing prompt"
          style={{ width: '100%', maxHeight: compact ? 160 : 280, objectFit: 'cover', display: 'block' }}
        />
      )}
      <div style={{ padding: compact ? '12px 14px' : '18px 20px' }}>
        <div style={{ fontSize: 11, color: TEAL, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          {essayType === 'narrative' ? 'Narrative Prompt' : 'Persuasive Prompt'}
        </div>
        <div style={{ fontSize: compact ? 13 : 16, lineHeight: 1.7, color: '#f1f5f9' }}>{prompt}</div>
      </div>
    </div>
  )

  // ── Stage: Setup ──────────────────────────────────────────────────────────────
  if (stage === 'setup') return (
    <div style={s.container}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button onClick={onBack} style={{ ...s.ghostBtn, padding: '6px 12px', fontSize: 12 }}>← Back</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{subject.icon} {subject.name} · {subject.stage}</h2>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>English Writing Practice</div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <span style={s.label}>Essay Type</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.toggleBtn(essayType === 'narrative')}  onClick={() => setEssayType('narrative')}>Narrative</button>
          <button style={s.toggleBtn(essayType === 'persuasive')} onClick={() => setEssayType('persuasive')}>Persuasive</button>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <span style={s.label}>Mode</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.toggleBtn(mode === 'full_essay')}      onClick={() => setMode('full_essay')}>Full Essay</button>
          <button style={s.toggleBtn(mode === 'prompt_planner')}  onClick={() => setMode('prompt_planner')}>Prompt Planner</button>
        </div>
      </div>

      {mode === 'full_essay' && (
        <div style={{ marginBottom: 20 }}>
          <span style={s.label}>Timer</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={s.toggleBtn(essayTimed)} onClick={() => setEssayTimed(t => !t)}>
              {essayTimed ? '⏱ Timed' : 'Untimed'}
            </button>
            {essayTimed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number" min={1} max={180} value={essayMinutes}
                  onChange={e => setEssayMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                  style={s.numInput}
                />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>minutes</span>
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'prompt_planner' && (
        <div style={{ marginBottom: 20 }}>
          <span style={s.label}>Planning Timer</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={s.toggleBtn(plannerTimed)} onClick={() => setPlannerTimed(t => !t)}>
              {plannerTimed ? '⏱ Timed' : 'Untimed'}
            </button>
            {plannerTimed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number" min={1} max={60} value={plannerMinutes}
                  onChange={e => setPlannerMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                  style={s.numInput}
                />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                  min <span style={{ color: 'rgba(255,255,255,0.3)' }}>(recommended: 2)</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {promptError && (
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13 }}>
          {promptError} — try again.
        </div>
      )}

      <button onClick={handleGeneratePrompt} disabled={loadingPrompt} style={s.primaryBtn(loadingPrompt)}>
        {loadingPrompt ? 'Generating prompt…' : 'Generate Prompt'}
      </button>

      <div style={{ marginTop: 36, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 20 }}>
        {!showPast ? (
          <button onClick={handleShowPast} style={{ ...s.ghostBtn, fontSize: 12 }}>View Past Attempts</button>
        ) : loadingPast ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
        ) : pastAttempts.length === 0 ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No past attempts yet.</div>
        ) : (
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Past Attempts</div>
            {pastAttempts.map(a => (
              <div
                key={a.id}
                onClick={() => setSelectedPast(selectedPast?.id === a.id ? null : a)}
                style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', marginBottom: 8, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', textTransform: 'capitalize' }}>
                    {a.essay_type} · {a.mode.replace('_', ' ')}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{new Date(a.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.prompt}</div>
                {selectedPast?.id === a.id && a.feedback && (
                  <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.18)' }}>
                    <div style={{ fontSize: 11, color: TEAL, fontWeight: 700, marginBottom: 6 }}>Overall Impression</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{a.feedback.overallImpression}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // ── Stage: Prompt ─────────────────────────────────────────────────────────────
  if (stage === 'prompt') return (
    <div style={s.container}>
      <button onClick={() => setStage('setup')} style={{ ...s.ghostBtn, padding: '6px 12px', fontSize: 12, marginBottom: 24 }}>← Back to Setup</button>
      <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800 }}>Your Writing Prompt</h2>
      <PromptPanel />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={handleStartWriting} style={s.primaryBtn()}>Start Writing</button>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
          {mode === 'full_essay'
            ? (essayTimed ? `⏱ ${essayMinutes} min` : 'Untimed')
            : (plannerTimed ? `⏱ ${plannerMinutes} min planning` : 'Untimed')}
        </div>
      </div>
    </div>
  )

  // ── Stage: Writing ────────────────────────────────────────────────────────────
  if (stage === 'writing') {
    const fields = essayType === 'narrative' ? NARRATIVE_FIELDS : PERSUASIVE_FIELDS
    const timerColor = secondsLeft !== null && secondsLeft < 60 ? '#ef4444' : TEAL

    return (
      <div style={s.container}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEAL, textTransform: 'capitalize' }}>
            {essayType} · {mode.replace('_', ' ')}
          </div>
          {timed && secondsLeft !== null && (
            <div style={{ fontSize: 17, fontWeight: 800, color: timerColor, fontVariantNumeric: 'tabular-nums' }}>
              ⏱ {formatTime(secondsLeft)}
            </div>
          )}
        </div>

        <PromptPanel compact />

        {mode === 'full_essay' ? (
          <div style={{ marginBottom: 20 }}>
            <span style={s.label}>Your Essay</span>
            <textarea
              value={essayText}
              onChange={e => setEssayText(e.target.value)}
              rows={18}
              placeholder="Start writing here…"
              style={s.textarea}
              autoFocus
            />
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            {fields.map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <span style={s.label}>{f.label}</span>
                <textarea
                  value={plannerFields[f.key] || ''}
                  onChange={e => setPlannerFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                  rows={3}
                  placeholder={`${f.label}…`}
                  style={s.textarea}
                />
              </div>
            ))}
          </div>
        )}

        <button onClick={handleSubmit} style={s.primaryBtn()}>Submit &amp; Get Feedback</button>
      </div>
    )
  }

  // ── Stage: Feedback ───────────────────────────────────────────────────────────
  if (stage === 'feedback') return (
    <div style={s.container}>
      <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 800 }}>Feedback</h2>

      {loadingFeedback && (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>📝</div>
          Assessing your writing…
        </div>
      )}

      {feedbackError && (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13, marginBottom: 20 }}>
          Could not load feedback: {feedbackError}
        </div>
      )}

      {feedback && (
        <div>
          <div style={{ padding: '18px 20px', borderRadius: 12, background: 'rgba(20,184,166,0.07)', border: '1px solid rgba(20,184,166,0.25)', marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: TEAL, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Overall Impression</div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: '#f1f5f9' }}>{feedback.overallImpression}</div>
          </div>

          {Array.isArray(feedback.annotations) && feedback.annotations.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Specific Feedback</div>
              {feedback.annotations.map((a, i) => (
                <div key={i} style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: TEAL, marginBottom: 6 }}>{a.aspect}</div>
                  {a.quote && (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', borderLeft: `2px solid rgba(20,184,166,0.4)`, paddingLeft: 10, marginBottom: 8 }}>
                      "{a.quote}"
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>{a.comment}</div>
                </div>
              ))}
            </div>
          )}

          {Array.isArray(feedback.improvements) && feedback.improvements.length > 0 && (
            <div style={{ padding: '16px 18px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>What to Improve Next Time</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {feedback.improvements.map((imp, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>{imp}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={handleTryAgain} style={s.primaryBtn()}>Try Again</button>
        <button onClick={onBack} style={s.ghostBtn}>Change Subject</button>
      </div>
    </div>
  )

  return null
}
