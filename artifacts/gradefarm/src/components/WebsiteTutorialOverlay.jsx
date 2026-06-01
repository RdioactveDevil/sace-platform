import { useState, useLayoutEffect, useCallback, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { THEMES } from '../lib/theme'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const NAVYD = '#080d28'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

/** Paths where the in-app spotlight tutorial may appear (not quiz — different shell concerns). */
export const WEBSITE_TUTORIAL_PATH_PREFIXES = ['/question-bank', '/learn', '/leaderboard', '/my-progress', '/study-plan', '/history', '/my-account', '/writing', '/tutor']

export function isWebsiteTutorialSurface(pathname) {
  if (pathname === '/quiz') return false
  return WEBSITE_TUTORIAL_PATH_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

/** Position the tour card beside the spotlight rect (fallback: bottom-centered). */
function computeTooltipStyle(rect, estimateH = 248) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 400
  const vh = typeof window !== 'undefined' ? window.innerHeight : 700
  const margin = 12
  const gap = 14
  const tw = Math.min(400, vw - margin * 2)
  const th = estimateH

  if (!rect) {
    return {
      position: 'fixed',
      left: '50%',
      bottom: margin,
      transform: 'translateX(-50%)',
      width: tw,
    }
  }

  const roomRight = vw - rect.right - gap - margin
  const roomLeft = rect.left - gap - margin
  const roomBelow = vh - rect.bottom - gap - margin
  const roomAbove = rect.top - gap - margin
  const cx = rect.left + rect.width / 2

  let left
  let top
  const transform = 'none'

  if (roomRight >= tw) {
    left = rect.right + gap
    top = clamp(rect.top + rect.height / 2 - th / 2, margin, vh - th - margin)
  } else if (roomLeft >= tw) {
    left = rect.left - gap - tw
    top = clamp(rect.top + rect.height / 2 - th / 2, margin, vh - th - margin)
  } else if (roomBelow >= th) {
    left = clamp(cx - tw / 2, margin, vw - tw - margin)
    top = rect.bottom + gap
  } else if (roomAbove >= th) {
    left = clamp(cx - tw / 2, margin, vw - tw - margin)
    top = rect.top - gap - th
  } else {
    left = clamp(cx - tw / 2, margin, vw - tw - margin)
    top = clamp(vh - th - margin, margin, vh - margin)
  }

  return {
    position: 'fixed',
    left,
    top,
    transform,
    width: tw,
    maxWidth: `calc(100vw - ${margin * 2}px)`,
  }
}

function studentSteps(isTutor) {
  const base = [
    {
      path: '/question-bank',
      target: 'subject-chip',
      title: 'Your subject',
      body: 'Everything in this sidebar is scoped to the subject you chose. Use Change subject anytime to switch courses.',
    },
    {
      path: '/question-bank',
      target: 'nav-home',
      title: 'Question Bank',
      body: 'Start adaptive practice sessions, track readiness, and earn XP from the home hub.',
    },
    {
      path: '/learn',
      target: 'nav-learn',
      title: 'Learn',
      body: 'When you need deeper explanation, open Learn — Titan can walk through concepts and tie them to your notes.',
    },
    {
      path: '/my-progress',
      target: 'nav-profile',
      title: 'My Progress',
      body: 'See strengths, gaps, and streaks so you know where to focus next.',
    },
    {
      path: '/leaderboard',
      target: 'nav-leaderboard',
      title: 'Leaderboard',
      body: 'Compare XP with other students on the same subjects — friendly motivation, optional gamification.',
    },
    {
      path: '/study-plan',
      target: 'nav-study',
      title: 'Study Plan',
      body: 'Auto-built priorities from your mistakes and assignments keep revision structured.',
    },
    {
      path: '/history',
      target: 'nav-history',
      title: 'History',
      body: 'Review past sessions and drill patterns over time.',
    },
  ]
  const tutorStep = isTutor
    ? [
        {
          path: '/tutor',
          target: 'nav-tutor',
          title: 'Tutor Dashboard',
          body:
            'Manage roster, classes, batch assignments, and student progress from here.',
        },
      ]
    : []
  const tail = [
    {
      path: '/question-bank',
      target: 'change-subject',
      title: 'Switch courses',
      body: 'Use Change subject to pick another enrolled topic — the whole sidebar updates with it.',
    },
  ]
  return [...base, ...tutorStep, ...tail]
}

const WRITING_STEPS = [
  {
    path: '/writing/essay',
    target: 'subject-chip',
    title: 'Writing mode',
    body: 'English Writing uses a focused sidebar: essays, planner, history, and study plan for writing.',
  },
  {
    path: '/writing/essay',
    target: 'nav-w-essay',
    title: 'Write an Essay',
    body: 'Draft, get structured feedback, and download reports from the writing workspace.',
  },
  {
    path: '/writing/planner',
    target: 'nav-w-planner',
    title: 'Prompt Planner',
    body: 'Break down prompts and plan paragraphs before you write.',
  },
  {
    path: '/writing/history',
    target: 'nav-w-history',
    title: 'Writing history',
    body: 'Revisit past attempts and feedback in one place.',
  },
  {
    path: '/writing/study-plan',
    target: 'nav-w-study',
    title: 'Writing study plan',
    body: 'Stay on track with writing-specific goals and reminders.',
  },
  {
    path: '/writing/essay',
    target: 'change-subject',
    title: 'Back to other subjects',
    body: 'Switch subject to return to multiple-choice banks and the standard sidebar.',
  },
]

function SpotlightSlices({ rect }) {
  const pad = 10
  const t = Math.max(0, rect.top - pad)
  const l = Math.max(0, rect.left - pad)
  const r = rect.right + pad
  const b = rect.bottom + pad
  const dim = 'rgba(5,8,22,0.78)'
  const z = 100000
  const common = { position: 'fixed', pointerEvents: 'none', zIndex: z }
  return (
    <>
      <div style={{ ...common, top: 0, left: 0, right: 0, height: t, background: dim }} />
      <div style={{ ...common, top: t, left: 0, width: l, height: b - t, background: dim }} />
      <div style={{ ...common, top: t, left: r, right: 0, height: b - t, background: dim }} />
      <div style={{ ...common, top: b, left: 0, right: 0, bottom: 0, background: dim }} />
      <div
        style={{
          position: 'fixed',
          top: t,
          left: l,
          width: r - l,
          height: b - t,
          zIndex: z + 1,
          borderRadius: 12,
          boxShadow: `0 0 0 3px ${GOLD}, 0 0 28px rgba(241,190,67,0.45)`,
          pointerEvents: 'none',
        }}
      />
    </>
  )
}

export default function WebsiteTutorialOverlay({ writingNav, isTutor, theme, onSeen, onFinish }) {
  const navigate = useNavigate()
  const location = useLocation()
  const t = THEMES[theme] || THEMES.dark

  const steps = useMemo(() => {
    if (writingNav) return WRITING_STEPS
    return studentSteps(isTutor)
  }, [writingNav, isTutor])

  const [ix, setIx] = useState(0)

  useEffect(() => {
    if (onSeen) onSeen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [rect, setRect] = useState(null)
  const [tooltipStyle, setTooltipStyle] = useState(() => computeTooltipStyle(null))
  const [finishing, setFinishing] = useState(false)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 860 : false))

  useEffect(() => {
    if (!steps.length) return
    setIx(i => Math.min(i, Math.max(0, steps.length - 1)))
  }, [steps.length])

  const safeIx = Math.min(ix, Math.max(0, steps.length - 1))
  const step = steps[safeIx]

  useLayoutEffect(() => {
    const upd = () => setTooltipStyle(computeTooltipStyle(rect))
    upd()
    window.addEventListener('resize', upd)
    return () => window.removeEventListener('resize', upd)
  }, [rect, safeIx])

  useLayoutEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 860)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const measure = useCallback(() => {
    if (!step) return
    const sel = `[data-tutorial-target="${step.target}"]`
    let el = document.querySelector(sel)
    if (!el && isMobile && step.target.startsWith('nav-')) {
      window.dispatchEvent(new CustomEvent('gf-tutorial-open-sidebar'))
      el = document.querySelector(sel)
    }
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'instant' })
      setRect(el.getBoundingClientRect())
    } else {
      setRect(null)
    }
  }, [step, isMobile])

  useLayoutEffect(() => {
    if (!isWebsiteTutorialSurface(location.pathname)) return
    const pathOk =
      location.pathname === step.path ||
      (step.path.length > 1 && location.pathname.startsWith(step.path + '/'))
    if (!pathOk) {
      navigate(step.path)
      return
    }
    let id = requestAnimationFrame(() => {
      requestAnimationFrame(measure)
    })
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [safeIx, step, location.pathname, navigate, measure])

  const finish = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      await onFinish()
    } catch (e) {
      console.error(e)
      setFinishing(false)
    }
  }

  const next = () => {
    if (safeIx >= steps.length - 1) void finish()
    else setIx(safeIx + 1)
  }

  const back = () => setIx(i => Math.max(0, i - 1))

  if (!isWebsiteTutorialSurface(location.pathname)) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        pointerEvents: 'auto',
        fontFamily: FONT_B,
      }}
    >
      {rect && <SpotlightSlices rect={rect} />}

      <div
        style={{
          ...tooltipStyle,
          zIndex: 100002,
          transition: 'top 0.22s ease, left 0.22s ease, transform 0.22s ease',
          background: t.bgCard || 'rgba(12,16,42,0.97)',
          border: `1px solid rgba(241,190,67,0.35)`,
          borderRadius: 18,
          padding: '20px 22px',
          boxShadow: '0 28px 80px rgba(0,0,0,0.65)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ fontSize: 11, color: t.textMuted || '#64748b', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 8 }}>
          FEATURE TOUR · {safeIx + 1} / {steps.length}
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: t.text || '#f1f5f9', marginBottom: 10 }}>{step.title}</div>
        <p style={{ fontSize: 14, color: t.textMuted || '#94a3b8', lineHeight: 1.65, margin: '0 0 18px' }}>{step.body}</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => void finish()}
            disabled={finishing}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent',
              color: t.textMuted || '#64748b',
              fontSize: 13,
              cursor: finishing ? 'wait' : 'pointer',
              fontFamily: FONT_B,
              opacity: finishing ? 0.65 : 1,
            }}
          >
            Skip tour
          </button>
          <button
            type="button"
            onClick={back}
            disabled={safeIx === 0 || finishing}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent',
              color: safeIx === 0 || finishing ? '#475569' : '#94a3b8',
              fontSize: 13,
              cursor: safeIx === 0 || finishing ? 'default' : 'pointer',
              fontFamily: FONT_B,
            }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={next}
            disabled={finishing}
            style={{
              flex: 1,
              padding: '11px 16px',
              borderRadius: 11,
              border: 'none',
              background: `linear-gradient(135deg,${GOLD},${GOLDL})`,
              color: NAVYD,
              fontSize: 14,
              fontWeight: 800,
              cursor: finishing ? 'wait' : 'pointer',
              fontFamily: FONT_B,
              boxShadow: `0 6px 22px rgba(241,190,67,0.3)`,
              opacity: finishing ? 0.85 : 1,
            }}
          >
            {finishing ? '…' : safeIx >= steps.length - 1 ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
