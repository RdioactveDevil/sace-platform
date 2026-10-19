import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Timer, PenLine } from 'lucide-react'
import { saveWritingAttempt, updateWritingAttemptFeedback, getWritingAttempts } from '../lib/writingDb'
import { downloadWritingReportPdf } from '../lib/db'
import { THEMES } from '../lib/theme'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"
const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const NAVY   = '#0c1037'

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

export default function WritingScreen({ subject, profile, theme = 'dark', onBack }) {
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

  // ── Theme ─────────────────────────────────────────────────────────────────────
  const t = THEMES[theme] || THEMES.dark
  const light = theme === 'light'
  // Writing keeps its teal accent, deepened in light mode so it reads on white.
  const accent       = light ? '#0f766e' : '#2dd4bf'
  const accentBg     = light ? 'rgba(15,118,110,0.07)' : 'rgba(45,212,191,0.08)'
  const accentBorder = light ? 'rgba(15,118,110,0.30)' : 'rgba(45,212,191,0.28)'
  const warn         = light ? '#b45309' : '#fbbf24'
  const warnBg       = light ? 'rgba(180,83,9,0.08)' : 'rgba(251,191,36,0.08)'
  const scoreColor = (n) => (typeof n !== 'number' ? t.textMuted : n >= 7 ? t.success : n >= 5 ? warn : t.danger)

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const s = {
    scrollWrap: {
      flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      background: t.bg,
    },
    container: {
      maxWidth: 820, margin: '0 auto', padding: '28px 24px 56px',
      fontFamily: FONT_B, color: t.text,
    },
    card: {
      background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16,
      boxShadow: t.shadowCard, padding: '20px 22px',
    },
    label: {
      display: 'block', fontSize: 11, fontWeight: 700, color: t.textMuted,
      textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
    },
    sectionTitle: {
      fontSize: 11, fontWeight: 800, color: t.textMuted,
      textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
    },
    optionBtn: (active) => ({
      flex: '1 1 200px', textAlign: 'left', padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
      border: `1.5px solid ${active ? accent : t.border}`,
      background: active ? accentBg : 'transparent',
      fontFamily: FONT_B, transition: 'border-color 0.15s, background 0.15s',
    }),
    toggleBtn: (active) => ({
      padding: '9px 18px', borderRadius: 10, cursor: 'pointer',
      border: `1.5px solid ${active ? accent : t.borderMid}`,
      background: active ? accentBg : 'transparent',
      color: active ? accent : t.textSub,
      fontSize: 13, fontWeight: 700, fontFamily: FONT_B,
    }),
    primaryBtn: (disabled = false) => ({
      padding: '13px 28px', borderRadius: 12, border: 'none',
      background: disabled ? t.bgHover : `linear-gradient(135deg,${GOLD},${GOLDL})`,
      color: disabled ? t.textFaint : NAVY,
      fontSize: 14, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: FONT_B, boxShadow: disabled ? 'none' : t.shadowGold,
    }),
    ghostBtn: {
      padding: '11px 18px', borderRadius: 12,
      border: `1px solid ${t.borderMid}`,
      background: 'transparent', color: t.textSub,
      fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
    },
    accentBtn: {
      padding: '11px 18px', borderRadius: 12,
      border: `1px solid ${accentBorder}`,
      background: accentBg, color: accent,
      fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
    },
    backBtn: {
      display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 18,
      padding: '6px 12px', borderRadius: 999, border: `1px solid ${t.border}`,
      background: t.bgCard, color: t.textMuted,
      fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
    },
    textarea: {
      width: '100%', padding: '14px 16px', borderRadius: 12,
      border: `1px solid ${t.borderMid}`,
      background: t.bgCard, color: t.text,
      fontSize: 14, fontFamily: FONT_B, resize: 'vertical',
      outline: 'none', lineHeight: 1.7, boxSizing: 'border-box',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    },
    numInput: {
      width: 64, padding: '8px 10px', borderRadius: 10,
      border: `1px solid ${t.borderMid}`,
      background: t.bgInput, color: t.text,
      fontSize: 14, fontWeight: 700, fontFamily: FONT_B, outline: 'none', textAlign: 'center',
    },
    notice: (color, bg) => ({
      marginBottom: 16, padding: '12px 14px', borderRadius: 12,
      background: bg, border: `1px solid ${color}40`, color, fontSize: 13, fontWeight: 600,
    }),
    pill: (color, bg) => ({
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
      background: bg, color, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
    }),
  }

  // Focus ring for the text areas (inline styles can't express :focus).
  const focusCss = (
    <style>{`
      .gf-writing-input:focus { border-color: ${accent} !important; box-shadow: 0 0 0 3px ${accentBg}; }
      .gf-writing-input::placeholder { color: ${t.textFaint}; }
    `}</style>
  )

  const wrap = (inner) => <div style={s.scrollWrap}>{focusCss}{inner}</div>

  const header = ({ title, subtitle, back, backLabel = 'Back' }) => (
    <div style={{ marginBottom: 24 }}>
      {back && <button type="button" onClick={back} style={s.backBtn}>← {backLabel}</button>}
      <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>
        Writing · {subject.stage} {subject.name}
      </div>
      <h1 style={{ margin: 0, fontSize: 24, fontFamily: FONT_D, fontWeight: 400, letterSpacing: 1.5, color: t.text }}>{title}</h1>
      {subtitle && <p style={{ margin: '6px 0 0', fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>{subtitle}</p>}
    </div>
  )

  const typeLabel = essayType === 'narrative' ? 'Narrative' : 'Persuasive'
  const modeLabel = (m) => (m === 'prompt_planner' ? 'Prompt planner' : 'Full essay')

  const promptPanel = (compact = false) => (
    <div style={{ ...s.card, padding: 0, overflow: 'hidden', marginBottom: compact ? 16 : 22, borderColor: accentBorder }}>
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Writing prompt"
          style={{ width: '100%', maxHeight: compact ? 160 : 300, objectFit: 'cover', display: 'block' }}
        />
      )}
      <div style={{ padding: compact ? '14px 18px' : '22px 24px', borderLeft: `4px solid ${accent}` }}>
        <div style={{ fontSize: 11, color: accent, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          {typeLabel} prompt
        </div>
        <div style={{ fontSize: compact ? 14 : 17, lineHeight: 1.7, color: t.text, fontWeight: compact ? 500 : 600 }}>{prompt}</div>
      </div>
    </div>
  )

  const scoreBar = (score) => (
    <div style={{ height: 6, borderRadius: 999, background: t.bgHover, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ width: `${Math.max(0, Math.min(10, score)) * 10}%`, height: '100%', borderRadius: 999, background: scoreColor(score) }} />
    </div>
  )

  const renderFeedbackBlocks = (fb, opts = {}) => {
    const { compact = false } = opts
    if (!fb || typeof fb !== 'object') return null
    const gap = compact ? 12 : 16
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        {fb.overallScore != null && (
          <div style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 18, padding: compact ? '14px 16px' : '20px 22px' }}>
            <div style={{
              width: compact ? 64 : 84, height: compact ? 64 : 84, borderRadius: '50%', flexShrink: 0,
              border: `4px solid ${scoreColor(fb.overallScore)}`, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontSize: compact ? 20 : 26, fontWeight: 800, color: t.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fb.overallScore}</div>
              <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 700 }}>/10</div>
            </div>
            <div>
              <div style={{ fontSize: compact ? 14 : 16, fontWeight: 800, color: t.text }}>Overall score</div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4, lineHeight: 1.5 }}>
                Indicative score using NAPLAN / selective-style criteria.
              </div>
            </div>
          </div>
        )}

        {fb.overallImpression && (
          <div style={{ ...s.card, background: accentBg, borderColor: accentBorder, boxShadow: 'none', padding: compact ? '14px 16px' : '18px 20px' }}>
            <div style={{ ...s.sectionTitle, color: accent, marginBottom: 6 }}>Overall impression</div>
            <div style={{ fontSize: compact ? 13 : 15, lineHeight: 1.7, color: t.text }}>{fb.overallImpression}</div>
          </div>
        )}

        {Array.isArray(fb.criteriaScores) && fb.criteriaScores.length > 0 && (
          <div style={{ ...s.card, padding: compact ? '14px 16px' : '18px 20px' }}>
            <div style={s.sectionTitle}>Criteria</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {fb.criteriaScores.map((c, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{c.name}</span>
                    {c.score != null && <span style={{ fontSize: 13, fontWeight: 800, color: scoreColor(c.score), fontVariantNumeric: 'tabular-nums' }}>{c.score}/10</span>}
                  </div>
                  {typeof c.score === 'number' && scoreBar(c.score)}
                  {c.comment && <div style={{ fontSize: 13, color: t.textSub, lineHeight: 1.55, marginTop: 6 }}>{c.comment}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(fb.annotations) && fb.annotations.length > 0 && (
          <div style={{ ...s.card, padding: compact ? '14px 16px' : '18px 20px' }}>
            <div style={s.sectionTitle}>Specific feedback</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {fb.annotations.map((a, i) => (
                <div key={i}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: accent }}>{a.aspect}</div>
                  {a.quote && (
                    <div style={{ margin: '6px 0', padding: '6px 12px', borderLeft: `3px solid ${t.borderStrong}`, fontSize: 13, color: t.textMuted, fontStyle: 'italic', lineHeight: 1.55 }}>
                      “{a.quote}”
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: t.textSub, lineHeight: 1.55 }}>{a.comment}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(fb.improvements) && fb.improvements.length > 0 && (
          <div style={{ ...s.card, background: t.purpleBg, borderColor: `${t.purple}33`, boxShadow: 'none', padding: compact ? '14px 16px' : '18px 20px' }}>
            <div style={{ ...s.sectionTitle, color: t.purple }}>What to improve</div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {fb.improvements.map((imp, i) => (
                <li key={i} style={{ fontSize: 13, color: t.textSub, lineHeight: 1.55 }}>{imp}</li>
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
        {header({ title: 'Writing History', subtitle: 'Your past attempts, feedback reports and PDFs.', back: onBack, backLabel: 'Change subject' })}
        {loadingList ? (
          <div style={{ color: t.textMuted, fontSize: 14 }}>Loading…</div>
        ) : listAttempts.length === 0 ? (
          <div style={{ ...s.card, color: t.textMuted, fontSize: 14, lineHeight: 1.6 }}>
            No attempts yet. Use <strong style={{ color: t.text }}>Write an Essay</strong> or <strong style={{ color: t.text }}>Prompt Planner</strong> to submit your first piece.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {listAttempts.map(a => {
              const open = selectedListId === a.id
              const score = a.feedback?.overallScore
              return (
                <div key={a.id} style={{ ...s.card, padding: 0, overflow: 'hidden', borderColor: open ? accentBorder : t.border }}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => setSelectedListId(open ? null : a.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedListId(open ? null : a.id) } }}
                    style={{ padding: '16px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                        <span style={{ ...s.pill(accent, accentBg), textTransform: 'capitalize' }}>{a.essay_type}</span>
                        <span style={s.pill(t.textSub, t.bgSubtle)}>{modeLabel(a.mode)}</span>
                        <span style={{ fontSize: 12, color: t.textMuted }}>
                          {new Date(a.created_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, color: t.text, marginTop: 10, lineHeight: 1.55 }}>{a.prompt}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                      {typeof score === 'number'
                        ? <span style={{ fontSize: 18, fontWeight: 800, color: scoreColor(score), fontVariantNumeric: 'tabular-nums' }}>{score}<span style={{ fontSize: 12, color: t.textMuted }}>/10</span></span>
                        : <span style={{ fontSize: 12, color: t.textFaint }}>No score</span>}
                      <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 700 }}>{open ? 'Hide ▲' : 'Details ▼'}</span>
                    </div>
                  </div>
                  {open && (
                    <div style={{ padding: '16px 18px 18px', borderTop: `1px solid ${t.border}`, background: t.bgSubtle }}>
                      <div style={s.sectionTitle}>Your submission</div>
                      <div style={{ fontSize: 13, color: t.textSub, whiteSpace: 'pre-wrap', lineHeight: 1.65, maxHeight: 220, overflowY: 'auto', padding: '12px 14px', borderRadius: 10, background: t.bgCard, border: `1px solid ${t.border}` }}>
                        {contentSnippet(a.content) || '—'}
                      </div>
                      {a.feedback ? (
                        <div style={{ marginTop: 18 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{ ...s.sectionTitle, marginBottom: 0 }}>Report</div>
                            <button
                              type="button"
                              disabled={pdfLoadingId === a.id}
                              onClick={() => {
                                setPdfLoadingId(a.id)
                                void downloadWritingReportPdf(a.id, profile?.display_name).finally(() => setPdfLoadingId(null))
                              }}
                              style={{ ...s.accentBtn, padding: '7px 14px', fontSize: 12 }}
                            >
                              {pdfLoadingId === a.id ? 'Preparing PDF…' : 'Download PDF'}
                            </button>
                          </div>
                          {renderFeedbackBlocks(a.feedback, { compact: true })}
                        </div>
                      ) : (
                        <div style={{ marginTop: 14, fontSize: 13, color: t.textMuted }}>No report stored for this attempt.</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    ))
  }

  // ─── Study Plan tab ───────────────────────────────────────────────────────
  if (writingTab === 'study-plan') {
    return wrap((
      <div style={s.container}>
        {header({ title: 'Writing Plan', subtitle: 'What to work on next, based on your feedback so far.', back: onBack, backLabel: 'Change subject' })}
        {loadingList ? (
          <div style={{ color: t.textMuted, fontSize: 14 }}>Loading…</div>
        ) : !studyInsights.hasData ? (
          <div style={{ ...s.card, color: t.textMuted, fontSize: 14, lineHeight: 1.6 }}>
            Complete at least one writing attempt with feedback to see personalised focus areas and practice tasks here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
            {studyInsights.weakCriteria.length > 0 && (
              <section>
                <div style={s.label}>Criteria to strengthen</div>
                <p style={{ fontSize: 13, color: t.textMuted, margin: '-4px 0 12px', lineHeight: 1.5 }}>
                  Averages across your marked attempts, lowest first.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {studyInsights.weakCriteria.map(c => (
                    <div key={c.name} style={s.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: t.text }}>{c.name}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: scoreColor(c.avg), whiteSpace: 'nowrap' }}>
                          {c.avg}/10 <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 600 }}>({c.n} marked)</span>
                        </span>
                      </div>
                      {scoreBar(c.avg)}
                      <div style={{ fontSize: 13, color: t.textSub, marginTop: 12, lineHeight: 1.6 }}>
                        <strong style={{ color: t.purple }}>Practice:</strong>{' '}
                        {PRACTICE_BY_CRITERION[c.name] || 'Do one timed short response focused only on this criterion, then compare to the rubric comments in History.'}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {studyInsights.topImprovements.length > 0 && (
              <section>
                <div style={s.label}>Recurring themes in your feedback</div>
                <div style={s.card}>
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {studyInsights.topImprovements.map((line, i) => (
                      <li key={i} style={{ fontSize: 13, color: t.textSub, lineHeight: 1.6 }}>{line}</li>
                    ))}
                  </ul>
                </div>
              </section>
            )}
            {studyInsights.lowestAttempts.length > 0 && (
              <section>
                <div style={s.label}>Review these attempts</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {studyInsights.lowestAttempts.map(a => (
                    <div key={a.id} style={{ ...s.card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: scoreColor(a.feedback?.overallScore), minWidth: 48, fontVariantNumeric: 'tabular-nums' }}>{a.feedback?.overallScore}/10</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.text, textTransform: 'capitalize' }}>{a.essay_type} · {modeLabel(a.mode).toLowerCase()}</div>
                        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{new Date(a.created_at).toLocaleDateString('en-AU', { dateStyle: 'medium' })}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => navigate('/writing/history')} style={{ ...s.accentBtn, marginTop: 12 }}>Open History →</button>
              </section>
            )}
          </div>
        )}
      </div>
    ))
  }

  // ── Stage: Setup (essay / planner tabs only) ───────────────────────────────
  if (stage === 'setup') {
    const isPlanner = writingTab === 'planner'
    const isTimed = isPlanner ? plannerTimed : essayTimed
    const setTimedFn = isPlanner ? setPlannerTimed : setEssayTimed
    const mins = isPlanner ? plannerMinutes : essayMinutes
    const setMins = isPlanner ? setPlannerMinutes : setEssayMinutes
    const types = [
      { id: 'narrative',  title: 'Narrative',  desc: 'Tell a story with a clear complication and resolution.' },
      { id: 'persuasive', title: 'Persuasive', desc: 'Take a position and argue it with evidence.' },
    ]
    return wrap((
      <div style={s.container}>
        {header({
          title: isPlanner ? 'Prompt Planner' : 'Write an Essay',
          subtitle: isPlanner
            ? 'Plan the structure of a response in a few minutes, then get feedback on your plan.'
            : 'Write a full response to a fresh prompt, then get marked feedback.',
          back: onBack,
          backLabel: 'Change subject',
        })}

        <div style={{ ...s.card, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <span style={s.label}>Essay type</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {types.map(o => {
                const active = essayType === o.id
                return (
                  <button key={o.id} type="button" aria-pressed={active} style={s.optionBtn(active)} onClick={() => setEssayType(o.id)}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: active ? accent : t.text }}>{o.title}</div>
                    <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4, lineHeight: 1.45 }}>{o.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <span style={s.label}>{isPlanner ? 'Planning timer' : 'Timer'}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <button type="button" aria-pressed={!isTimed} style={s.toggleBtn(!isTimed)} onClick={() => setTimedFn(false)}>Untimed</button>
              <button type="button" aria-pressed={isTimed} style={s.toggleBtn(isTimed)} onClick={() => setTimedFn(true)}><Timer size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} aria-hidden="true" />Timed</button>
              {isTimed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 4 }}>
                  <input
                    type="number" min={1} max={isPlanner ? 60 : 180} value={mins}
                    onChange={e => setMins(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="gf-writing-input"
                    style={s.numInput}
                  />
                  <span style={{ fontSize: 13, color: t.textSub }}>
                    minutes{isPlanner && <span style={{ color: t.textMuted }}> (recommended: 2)</span>}
                  </span>
                </div>
              )}
            </div>
          </div>

          {promptError && (
            <div style={{ ...s.notice(t.danger, t.dangerBg), marginBottom: 0 }}>
              {promptError} — try again.
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
            <button type="button" onClick={handleGeneratePrompt} disabled={loadingPrompt} style={s.primaryBtn(loadingPrompt)}>
              {loadingPrompt ? 'Generating prompt…' : 'Generate prompt →'}
            </button>
            <span style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
              Reports are saved to <strong style={{ color: t.textSub }}>History</strong>; practice ideas build up in your <strong style={{ color: t.textSub }}>Writing Plan</strong>.
            </span>
          </div>
        </div>
      </div>
    ))
  }

  // ── Stage: Prompt ───────────────────────────────────────────────────────────
  if (stage === 'prompt') return wrap((
    <div style={s.container}>
      {header({ title: 'Your writing prompt', subtitle: 'Read it carefully, then start when you’re ready.', back: () => setStage('setup') })}
      {promptPanel()}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={handleStartWriting} style={s.primaryBtn()}>Start writing →</button>
        <button type="button" onClick={handleGeneratePrompt} disabled={loadingPrompt} style={s.ghostBtn}>
          {loadingPrompt ? 'Generating…' : 'New prompt'}
        </button>
        <span style={s.pill(t.textSub, t.bgSubtle)}>
          {mode === 'full_essay'
            ? (essayTimed ? <><Timer size={14} aria-hidden="true" />{essayMinutes} min</> : 'Untimed')
            : (plannerTimed ? <><Timer size={14} aria-hidden="true" />{plannerMinutes} min planning</> : 'Untimed')}
        </span>
      </div>
      {promptError && <div style={{ ...s.notice(t.danger, t.dangerBg), marginTop: 16 }}>{promptError} — try again.</div>}
    </div>
  ))

  // ── Stage: Writing ──────────────────────────────────────────────────────────
  if (stage === 'writing') {
    const fields = essayType === 'narrative' ? NARRATIVE_FIELDS : PERSUASIVE_FIELDS
    const lowTime = secondsLeft !== null && secondsLeft < 60
    const words = essayText.trim() ? essayText.trim().split(/\s+/).length : 0

    return wrap(
      <div style={s.container}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={s.pill(accent, accentBg)}>{typeLabel}</span>
            <span style={s.pill(t.textSub, t.bgSubtle)}>{modeLabel(mode)}</span>
          </div>
          {timed && secondsLeft !== null && (
            <span style={{ ...s.pill(lowTime ? t.danger : t.text, lowTime ? t.dangerBg : t.bgCard), border: `1px solid ${lowTime ? `${t.danger}55` : t.border}`, fontSize: 16, padding: '6px 14px', fontVariantNumeric: 'tabular-nums' }}>
              <Timer size={18} aria-hidden="true" />{secondsLeft === 0 ? 'Time’s up' : formatTime(secondsLeft)}
            </span>
          )}
        </div>

        {promptPanel(true)}

        {submitBlocked && (
          <div style={s.notice(warn, warnBg)}>
            Add your writing before submitting — the text area or planner fields are empty.
          </div>
        )}

        {mode === 'full_essay' ? (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={s.label}>Your essay</span>
              <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>{words} {words === 1 ? 'word' : 'words'}</span>
            </div>
            <textarea
              value={essayText}
              onChange={e => { setEssayText(e.target.value); setSubmitBlocked(false) }}
              rows={18}
              placeholder="Start writing here…"
              className="gf-writing-input"
              style={{ ...s.textarea, fontSize: 16, lineHeight: 1.8, padding: '18px 20px', minHeight: 360 }}
              autoFocus
            />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 20 }}>
            {fields.map(f => (
              <div key={f.key}>
                <span style={s.label}>{f.label}</span>
                <textarea
                  value={plannerFields[f.key] || ''}
                  onChange={e => { setPlannerFields(prev => ({ ...prev, [f.key]: e.target.value })); setSubmitBlocked(false) }}
                  rows={4}
                  placeholder={`${f.label}…`}
                  className="gf-writing-input"
                  style={s.textarea}
                />
              </div>
            ))}
          </div>
        )}

        <button type="button" onClick={handleSubmit} style={s.primaryBtn()}>Submit &amp; get feedback →</button>
      </div>
    )
  }

  // ── Stage: Feedback ─────────────────────────────────────────────────────────
  if (stage === 'feedback') return wrap((
    <div style={s.container}>
      {header({ title: 'Feedback', subtitle: `${typeLabel} · ${modeLabel(mode).toLowerCase()}` })}

      {loadingFeedback && (
        <div style={{ ...s.card, padding: 40, textAlign: 'center', color: t.textMuted, fontSize: 14 }}>
          <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center' }}><PenLine size={36} aria-hidden="true" /></div>
          Assessing your writing…
        </div>
      )}

      {feedbackError && (
        <div style={s.notice(t.danger, t.dangerBg)}>
          Could not load feedback: {feedbackError}
        </div>
      )}

      {feedback && renderFeedbackBlocks(feedback)}

      {!loadingFeedback && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
          <button type="button" onClick={handleTryAgain} style={s.primaryBtn()}>Try another prompt</button>
          {attemptId && feedback && (
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
              style={s.accentBtn}
            >
              {pdfLoading ? 'Preparing PDF…' : 'Download PDF report'}
            </button>
          )}
          <button type="button" onClick={() => navigate('/writing/history')} style={s.ghostBtn}>History</button>
          <button type="button" onClick={() => navigate('/writing/study-plan')} style={s.ghostBtn}>Writing Plan</button>
        </div>
      )}
    </div>
  ))

  return null
}
