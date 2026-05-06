import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { saveWritingAttempt, updateWritingAttemptFeedback, getWritingAttempts } from '../lib/writingDb'
import { downloadWritingReportPdf } from '../lib/db'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const TEAL   = '#14b8a6'
const PURPLE = '#818cf8'

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

const PRACTICE_BY_CRITERION = {
  'Orientation / engage reader': 'Write 3 practice openings in 5 minutes each: start in the middle of action, with dialogue, and with sensory detail.',
  'Complication / tension': 'Brainstorm 5 complications for a simple scenario; pick one and write a paragraph that raises the stakes.',
  'Character / voice': 'Write a short monologue in first person that shows attitude without stating it directly.',
  'Control of language (grammar, spelling, punctuation)': 'Proofread a paragraph backwards sentence-by-sentence; fix one tense agreement issue and two punctuation choices.',
  'Structure / cohesion (paragraphing, flow)': 'Take a messy draft and add topic sentences only—then rewrite one weak paragraph with clear links to the next.',
  'Position / thesis clarity': 'Write three one-sentence thesis lines for the same prompt; pick the clearest and build one body paragraph.',
  'Argument & supporting evidence': 'For your next practice, include one statistic, one example, and one explanation of why they matter.',
  'Use of persuasive devices / reasoning': 'Annotate a news opinion piece: highlight 3 persuasive moves, then mimic one in your own paragraph.',
  'Acknowledgement of counter-arguments where appropriate': 'Add a short “Some may argue…” paragraph followed by a two-sentence rebuttal.',
}

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function hasSubstantiveContent(mode, essayText, plannerFields) {
  if (mode === 'full_essay') return essayText.trim().length > 0
  return Object.values(plannerFields || {}).some(v => typeof v === 'string' && v.trim().length > 0)
}

function normalizeWritingTab(pathname) {
  if (pathname.startsWith('/writing/planner')) return 'planner'
  if (pathname.startsWith('/writing/history')) return 'history'
  if (pathname.startsWith('/writing/study-plan')) return 'study-plan'
  return 'essay'
}

function contentSnippet(content) {
  if (typeof content === 'string') {
    const t = content.trim()
    return t.length > 500 ? `${t.slice(0, 500)}…` : t
  }
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const raw = Object.entries(content)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : ''}`)
      .join('\n')
      .trim()
    return raw.length > 500 ? `${raw.slice(0, 500)}…` : raw
  }
  return ''
}

/** Aggregate weak criteria and practice themes from saved feedback (last 30 attempts with feedback). */
function buildStudyInsights(attempts) {
  const withFb = (attempts || []).filter(a => a.feedback && typeof a.feedback === 'object')
  const criterionTotals = {}
  const criterionCounts = {}
  const improvementLines = []

  for (const a of withFb) {
    const fb = a.feedback
    if (Array.isArray(fb.criteriaScores)) {
      for (const c of fb.criteriaScores) {
        if (typeof c?.name !== 'string' || typeof c?.score !== 'number') continue
        criterionTotals[c.name] = (criterionTotals[c.name] || 0) + c.score
        criterionCounts[c.name] = (criterionCounts[c.name] || 0) + 1
      }
    }
    if (Array.isArray(fb.improvements)) {
      for (const line of fb.improvements) {
        if (typeof line === 'string' && line.trim()) improvementLines.push(line.trim())
      }
    }
  }

  const criterionAverages = Object.keys(criterionTotals).map(name => ({
    name,
    avg: Math.round((criterionTotals[name] / criterionCounts[name]) * 10) / 10,
    n: criterionCounts[name],
  })).sort((x, y) => x.avg - y.avg)

  const weakCriteria = criterionAverages.filter(c => c.avg <= 6).slice(0, 6)
  if (weakCriteria.length === 0 && criterionAverages.length > 0) {
    weakCriteria.push(...criterionAverages.slice(0, 3))
  }

  const impFreq = {}
  for (const line of improvementLines) {
    const key = line.toLowerCase().replace(/\s+/g, ' ').slice(0, 120)
    impFreq[key] = (impFreq[key] || 0) + 1
  }
  const topImprovements = Object.entries(impFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([text]) => improvementLines.find(l => l.toLowerCase().replace(/\s+/g, ' ').slice(0, 120) === text) || text)

  const scored = withFb
    .filter(a => typeof a.feedback.overallScore === 'number')
    .sort((a, b) => (a.feedback.overallScore || 0) - (b.feedback.overallScore || 0))
    .slice(0, 3)

  return { weakCriteria, topImprovements, lowestAttempts: scored, hasData: withFb.length > 0 }
}

export default function WritingScreen({ subject, profile, onBack }) {
  const location = useLocation()
  const navigate = useNavigate()
  const writingTab = normalizeWritingTab(location.pathname || '')
  const mode = writingTab === 'planner' ? 'prompt_planner' : 'full_essay'

  const [stage,          setStage]          = useState('setup')
  const [essayType,      setEssayType]      = useState('narrative')

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

  const [listAttempts, setListAttempts] = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [selectedListId, setSelectedListId] = useState(null)
  const [pdfLoadingId, setPdfLoadingId] = useState(null)

  const [pdfLoading, setPdfLoading] = useState(false)
  const [submitBlocked, setSubmitBlocked] = useState(false)

  const timed   = mode === 'full_essay' ? essayTimed   : plannerTimed
  const minutes = mode === 'full_essay' ? essayMinutes : plannerMinutes

  const refreshAttemptsList = useCallback(async () => {
    setLoadingList(true)
    try {
      const rows = await getWritingAttempts(profile.id, subject.id)
      setListAttempts(rows || [])
    } catch {
      setListAttempts([])
    }
    setLoadingList(false)
  }, [profile.id, subject.id])

  useEffect(() => {
    if (writingTab === 'history' || writingTab === 'study-plan') {
      void refreshAttemptsList()
    }
  }, [writingTab, refreshAttemptsList])

  useEffect(() => {
    if (writingTab === 'essay' || writingTab === 'planner') {
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
      setSubmitBlocked(false)
    }
  }, [writingTab])

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
  }, [stage, timed, minutes])

  const studyInsights = useMemo(() => buildStudyInsights(listAttempts), [listAttempts])

  const handleGeneratePrompt = async () => {
    setLoadingPrompt(true)
    setPromptError(null)
    try {
      const res = await fetch('/api/writing/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.id, essayType }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = [data.error, data.detail].filter(Boolean).join(': ') || 'Failed to generate prompt'
        throw new Error(msg)
      }
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
    if (!hasSubstantiveContent(mode, essayText, plannerFields)) {
      setSubmitBlocked(true)
      return
    }
    setSubmitBlocked(false)

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
    const base = writingTab === 'planner' ? '/writing/planner' : '/writing/essay'
    navigate(base)
  }

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const s = {
    scrollWrap: {
      flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
    },
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

  const wrap = (inner) => <div style={s.scrollWrap}>{inner}</div>

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

  const renderFeedbackBlocks = (fb, opts = {}) => {
    const { compact = false } = opts
    if (!fb || typeof fb !== 'object') return null
    return (
      <div>
        {(fb.overallScore != null || fb.emptySubmission) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: compact ? 10 : 14, marginBottom: compact ? 12 : 18 }}>
            {fb.overallScore != null && (
              <div style={{ padding: compact ? '8px 12px' : '12px 18px', borderRadius: 12, border: `2px solid ${TEAL}`, background: 'rgba(20,184,166,0.1)' }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overall</div>
                <div style={{ fontSize: compact ? 20 : 26, fontWeight: 800, color: TEAL, fontVariantNumeric: 'tabular-nums' }}>{fb.overallScore}<span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>/10</span></div>
              </div>
            )}
            {!compact && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', maxWidth: 420, lineHeight: 1.5 }}>
                Indicative scores (NAPLAN / selective-style criteria).
              </div>
            )}
          </div>
        )}
        {Array.isArray(fb.criteriaScores) && fb.criteriaScores.length > 0 && (
          <div style={{ marginBottom: compact ? 12 : 20 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Criteria</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {fb.criteriaScores.map((c, i) => (
                <div key={i} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>{c.name}</span>
                    {c.score != null && <span style={{ fontSize: 12, fontWeight: 800, color: TEAL }}>{c.score}/10</span>}
                  </div>
                  {c.comment && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.62)', lineHeight: 1.5, marginTop: 4 }}>{c.comment}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        {fb.overallImpression && (
          <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(20,184,166,0.07)', border: '1px solid rgba(20,184,166,0.25)', marginBottom: compact ? 12 : 20 }}>
            <div style={{ fontSize: 10, color: TEAL, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Overall impression</div>
            <div style={{ fontSize: compact ? 13 : 14, lineHeight: 1.65, color: '#f1f5f9' }}>{fb.overallImpression}</div>
          </div>
        )}
        {Array.isArray(fb.annotations) && fb.annotations.length > 0 && (
          <div style={{ marginBottom: compact ? 12 : 20 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 8 }}>Specific feedback</div>
            {fb.annotations.map((a, i) => (
              <div key={i} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: TEAL }}>{a.aspect}</div>
                {a.quote && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', marginTop: 4 }}>“{a.quote}”</div>}
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', marginTop: 4 }}>{a.comment}</div>
              </div>
            ))}
          </div>
        )}
        {Array.isArray(fb.improvements) && fb.improvements.length > 0 && (
          <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div style={{ fontSize: 10, color: PURPLE, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>What to improve</div>
            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {fb.improvements.map((imp, i) => (
                <li key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.55 }}>{imp}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  // ─── History tab ───────────────────────────────────────────────────────────
  if (writingTab === 'history') {
    return wrap((
      <div style={s.container}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button type="button" onClick={onBack} style={{ ...s.ghostBtn, padding: '6px 12px', fontSize: 12 }}>← Change subject</button>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>History</h2>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{subject.icon} {subject.name} · {subject.stage} — past attempts and reports</div>
          </div>
        </div>
        {loadingList ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading…</div>
        ) : listAttempts.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>No attempts yet. Use Write an Essay or Prompt Planner to submit your first piece.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {listAttempts.map(a => (
              <div
                key={a.id}
                style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedListId(selectedListId === a.id ? null : a.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedListId(selectedListId === a.id ? null : a.id) } }}
                  style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize', color: '#f1f5f9' }}>
                      {a.essay_type} · {(a.mode || '').replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>
                      {new Date(a.created_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                      {typeof a.feedback?.overallScore === 'number' && (
                        <span style={{ marginLeft: 8, color: TEAL, fontWeight: 700 }}>· {a.feedback.overallScore}/10</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 8, lineHeight: 1.5 }}>{a.prompt}</div>
                  </div>
                  <button
                    type="button"
                    disabled={!a.feedback || pdfLoadingId === a.id}
                    onClick={e => {
                      e.stopPropagation()
                      setPdfLoadingId(a.id)
                      void downloadWritingReportPdf(a.id, profile?.display_name).finally(() => setPdfLoadingId(null))
                    }}
                    style={{ ...s.ghostBtn, padding: '8px 14px', fontSize: 12, flexShrink: 0, borderColor: TEAL, color: TEAL, opacity: a.feedback ? 1 : 0.4 }}
                  >
                    {pdfLoadingId === a.id ? 'PDF…' : 'PDF report'}
                  </button>
                </div>
                {selectedListId === a.id && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginTop: 12, marginBottom: 8 }}>Your submission</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'pre-wrap', lineHeight: 1.55, maxHeight: 200, overflowY: 'auto', padding: '10px 12px', borderRadius: 8, background: '#0c1037', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {contentSnippet(a.content) || '—'}
                    </div>
                    {a.feedback ? (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 10, color: TEAL, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Report</div>
                        {renderFeedbackBlocks(a.feedback, { compact: true })}
                      </div>
                    ) : (
                      <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>No report stored for this attempt.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    ))
  }

  // ─── Study Plan tab ───────────────────────────────────────────────────────
  if (writingTab === 'study-plan') {
    return wrap((
      <div style={s.container}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button type="button" onClick={onBack} style={{ ...s.ghostBtn, padding: '6px 12px', fontSize: 12 }}>← Change subject</button>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Study plan</h2>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>What to improve next — from your latest feedback</div>
          </div>
        </div>
        {loadingList ? (
          <div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
        ) : !studyInsights.hasData ? (
          <div style={{ color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
            Complete at least one writing attempt with feedback to see personalised focus areas and practice tasks here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {studyInsights.weakCriteria.length > 0 && (
              <section>
                <div style={s.label}>Criteria to strengthen</div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '0 0 12px', lineHeight: 1.5 }}>
                  Averages across your scored attempts (lower = prioritise first).
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {studyInsights.weakCriteria.map(c => (
                    <div key={c.name} style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(20,184,166,0.22)', background: 'rgba(20,184,166,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{c.name}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: TEAL }}>{c.avg}/10 <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>({c.n} marked)</span></span>
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 10, lineHeight: 1.55 }}>
                        <strong style={{ color: PURPLE }}>Practice:</strong>{' '}
                        {PRACTICE_BY_CRITERION[c.name] || 'Do one timed short response focused only on this criterion, then compare to the rubric comments in History.'}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {studyInsights.topImprovements.length > 0 && (
              <section>
                <div style={s.label}>Repeat themes from your feedback</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {studyInsights.topImprovements.map((t, i) => (
                    <li key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.55 }}>{t}</li>
                  ))}
                </ul>
              </section>
            )}
            {studyInsights.lowestAttempts.length > 0 && (
              <section>
                <div style={s.label}>Review these attempts</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 10 }}>Open History for full text and PDF reports.</div>
                {studyInsights.lowestAttempts.map(a => (
                  <div key={a.id} style={{ marginBottom: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: TEAL }}>{a.feedback?.overallScore}/10</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginLeft: 8, textTransform: 'capitalize' }}>{a.essay_type} · {(a.mode || '').replace(/_/g, ' ')}</span>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{new Date(a.created_at).toLocaleDateString('en-AU')}</div>
                  </div>
                ))}
                <button type="button" onClick={() => navigate('/writing/history')} style={{ ...s.ghostBtn, marginTop: 8, borderColor: TEAL, color: TEAL }}>Open History</button>
              </section>
            )}
          </div>
        )}
      </div>
    ))
  }

  // ── Stage: Setup (essay / planner tabs only) ───────────────────────────────
  if (stage === 'setup') return wrap((
    <div style={s.container}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button type="button" onClick={onBack} style={{ ...s.ghostBtn, padding: '6px 12px', fontSize: 12 }}>← Back</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{subject.icon} {subject.name} · {subject.stage}</h2>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            {writingTab === 'planner' ? 'Prompt Planner — structure your ideas before writing' : 'Write an Essay — full response'}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <span style={s.label}>Essay type</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={s.toggleBtn(essayType === 'narrative')}  onClick={() => setEssayType('narrative')}>Narrative</button>
          <button type="button" style={s.toggleBtn(essayType === 'persuasive')} onClick={() => setEssayType('persuasive')}>Persuasive</button>
        </div>
      </div>

      {mode === 'full_essay' && (
        <div style={{ marginBottom: 20 }}>
          <span style={s.label}>Timer</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" style={s.toggleBtn(essayTimed)} onClick={() => setEssayTimed(t => !t)}>
              {essayTimed ? '⏱ Timed' : 'Untimed'}
            </button>
            {essayTimed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number" min={1} max={180} value={essayMinutes}
                  onChange={e => setEssayMinutes(Math.max(1, parseInt(e.target.value, 10) || 1))}
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
          <span style={s.label}>Planning timer</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" style={s.toggleBtn(plannerTimed)} onClick={() => setPlannerTimed(t => !t)}>
              {plannerTimed ? '⏱ Timed' : 'Untimed'}
            </button>
            {plannerTimed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number" min={1} max={60} value={plannerMinutes}
                  onChange={e => setPlannerMinutes(Math.max(1, parseInt(e.target.value, 10) || 1))}
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

      <div style={{ marginBottom: 20, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
        Reports and PDFs are saved to <strong style={{ color: '#f1f5f9' }}>History</strong>. Your personalised practice list is in <strong style={{ color: '#f1f5f9' }}>Study Plan</strong>.
      </div>

      {promptError && (
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13 }}>
          {promptError} — try again.
        </div>
      )}

      <button type="button" onClick={handleGeneratePrompt} disabled={loadingPrompt} style={s.primaryBtn(loadingPrompt)}>
        {loadingPrompt ? 'Generating prompt…' : 'Generate prompt'}
      </button>
    </div>
  ))

  // ── Stage: Prompt ───────────────────────────────────────────────────────────
  if (stage === 'prompt') return wrap((
    <div style={s.container}>
      <button type="button" onClick={() => setStage('setup')} style={{ ...s.ghostBtn, padding: '6px 12px', fontSize: 12, marginBottom: 24 }}>← Back</button>
      <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800 }}>Your writing prompt</h2>
      <PromptPanel />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button type="button" onClick={handleStartWriting} style={s.primaryBtn()}>Start</button>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
          {mode === 'full_essay'
            ? (essayTimed ? `⏱ ${essayMinutes} min` : 'Untimed')
            : (plannerTimed ? `⏱ ${plannerMinutes} min planning` : 'Untimed')}
        </div>
      </div>
    </div>
  ))

  // ── Stage: Writing ──────────────────────────────────────────────────────────
  if (stage === 'writing') {
    const fields = essayType === 'narrative' ? NARRATIVE_FIELDS : PERSUASIVE_FIELDS
    const timerColor = secondsLeft !== null && secondsLeft < 60 ? '#ef4444' : TEAL

    return wrap(
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

        {submitBlocked && (
          <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)', color: '#fbbf24', fontSize: 13 }}>
            Add your writing before submitting — the text area or planner fields are empty.
          </div>
        )}

        {mode === 'full_essay' ? (
          <div style={{ marginBottom: 20 }}>
            <span style={s.label}>Your essay</span>
            <textarea
              value={essayText}
              onChange={e => { setEssayText(e.target.value); setSubmitBlocked(false) }}
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
                  onChange={e => { setPlannerFields(prev => ({ ...prev, [f.key]: e.target.value })); setSubmitBlocked(false) }}
                  rows={3}
                  placeholder={`${f.label}…`}
                  style={s.textarea}
                />
              </div>
            ))}
          </div>
        )}

        <button type="button" onClick={handleSubmit} style={s.primaryBtn()}>Submit &amp; get feedback</button>
      </div>
    )
  }

  // ── Stage: Feedback ─────────────────────────────────────────────────────────
  if (stage === 'feedback') return wrap((
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

      {feedback && renderFeedbackBlocks(feedback)}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
        <button type="button" onClick={handleTryAgain} style={s.primaryBtn()}>Try again</button>
        <button type="button" onClick={() => navigate('/writing/history')} style={s.ghostBtn}>View History</button>
        <button type="button" onClick={() => navigate('/writing/study-plan')} style={s.ghostBtn}>Study plan</button>
        <button type="button" onClick={onBack} style={s.ghostBtn}>Change subject</button>
        {attemptId && feedback && !loadingFeedback && (
          <button
            type="button"
            disabled={pdfLoading}
            onClick={async () => {
              setPdfLoading(true)
              try {
                await downloadWritingReportPdf(attemptId, profile?.display_name)
              } catch (e) { console.warn(e) }
              finally { setPdfLoading(false) }
            }}
            style={{ ...s.ghostBtn, borderColor: TEAL, color: TEAL }}
          >
            {pdfLoading ? 'Preparing PDF…' : 'Download PDF report'}
          </button>
        )}
      </div>
    </div>
  ))

  return null
}
