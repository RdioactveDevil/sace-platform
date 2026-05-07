import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { markTutorialComplete } from '../lib/db'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const NAVYD = '#080d28'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const STUDENT_SLIDES = [
  {
    title: 'Welcome to GradeFarm',
    body: 'You will move between sections using the sidebar. Pick a subject once, then practise, learn, and track progress from one place.',
    icon: '✦',
  },
  {
    title: 'Question Bank',
    body: 'Adaptive sessions target weak areas. Finish sets to earn XP, keep streaks, and unlock readiness insights after each run.',
    icon: '◆',
  },
  {
    title: 'Learn with Titan',
    body: 'Open Learn when a worked solution is not enough. Titan can explain in plain language and tie ideas back to your notes when you add them.',
    icon: '◇',
  },
  {
    title: 'Progress & planning',
    body: 'My Progress shows strengths and gaps. Study Plan lines up what to revise next so you are not guessing what to drill.',
    icon: '◎',
  },
  {
    title: 'You are set',
    body: 'Choose your subject next, then jump into a session. You can change subject any time from the sidebar.',
    icon: '→',
  },
]

const TUTOR_SLIDES = [
  {
    title: 'Welcome, educator',
    body: 'You applied as a tutor. While we review your account you have the same question bank and Learn tools as students — handy for demos and your own practice.',
    icon: '✦',
  },
  {
    title: 'After approval',
    body: 'Approved tutors unlock the Tutor Dashboard from the sidebar: roster, classes, batch assignments, and student progress. We will email you when your access is active.',
    icon: '◆',
  },
  {
    title: 'Pick a subject',
    body: 'Next you will choose a subject context like students do — it drives which question bank and Study Plan you see until you change it.',
    icon: '→',
  },
]

export default function AppTutorialScreen({ user, profile, onProfileRefresh }) {
  const navigate = useNavigate()
  const isTutorPath = user?.user_metadata?.signup_path === 'tutor'
  const slides = isTutorPath ? TUTOR_SLIDES : STUDENT_SLIDES
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)

  const finish = async () => {
    if (!profile?.id) return
    setBusy(true)
    try {
      await markTutorialComplete(profile.id)
      onProfileRefresh?.({ app_tutorial_completed_at: new Date().toISOString() })
    } catch (e) {
      console.error(e)
    }
    setBusy(false)
    navigate('/subject-picker', { replace: true })
  }

  const goNext = () => {
    if (index < slides.length - 1) setIndex(i => i + 1)
    else finish()
  }

  const skip = () => finish()

  const slide = slides[index]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: NAVYD,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: FONT_B,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes tfade { from { opacity:0; transform: translateY(12px) } to { opacity:1; transform: translateY(0) } }
      `}</style>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px)',
          backgroundSize: '48px 48px',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          position: 'relative',
          background: 'rgba(8,13,40,0.96)',
          borderRadius: 24,
          border: '1px solid rgba(241,190,67,0.22)',
          padding: '36px 32px 28px',
          boxShadow: '0 40px 100px rgba(0,0,0,0.65)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span style={{ fontFamily: FONT_D, fontSize: 20, letterSpacing: 1.2 }}>
            <span style={{ color: '#fff' }}>grade</span>
            <span style={{ color: GOLD }}>farm.</span>
          </span>
          <div style={{ fontSize: 10, color: '#475569', marginTop: 4, letterSpacing: '0.1em', fontWeight: 700 }}>QUICK TOUR</div>
        </div>

        <div
          key={index}
          style={{
            animation: 'tfade 0.45s ease',
            textAlign: 'center',
            minHeight: 200,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: `linear-gradient(135deg,${GOLD},${GOLDL})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              color: NAVYD,
              fontWeight: 900,
              marginBottom: 18,
              boxShadow: `0 10px 28px rgba(241,190,67,0.35)`,
            }}
          >
            {slide.icon}
          </div>
          <h2 style={{ fontFamily: FONT_D, fontSize: 20, color: '#f1f5f9', margin: '0 0 12px', letterSpacing: 0.6, lineHeight: 1.25 }}>
            {slide.title}
          </h2>
          <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.75, margin: 0, maxWidth: 360 }}>
            {slide.body}
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to step ${i + 1}`}
              onClick={() => setIndex(i)}
              style={{
                width: i === index ? 22 : 7,
                height: 7,
                borderRadius: 99,
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                background: i === index ? `linear-gradient(90deg,${GOLD},${GOLDL})` : 'rgba(255,255,255,0.12)',
                transition: 'width 0.25s ease, background 0.2s',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={skip}
            disabled={busy}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent',
              color: '#64748b',
              fontSize: 13,
              cursor: busy ? 'default' : 'pointer',
              fontFamily: FONT_B,
            }}
          >
            Skip
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={busy}
            style={{
              flex: 2,
              padding: '13px',
              borderRadius: 12,
              border: 'none',
              background: busy ? 'rgba(255,255,255,0.08)' : `linear-gradient(135deg,${GOLD},${GOLDL})`,
              color: busy ? '#475569' : NAVYD,
              fontSize: 14,
              fontWeight: 800,
              cursor: busy ? 'default' : 'pointer',
              fontFamily: FONT_B,
              boxShadow: busy ? 'none' : `0 6px 22px rgba(241,190,67,0.28)`,
            }}
          >
            {busy ? 'Saving…' : index < slides.length - 1 ? 'Next →' : 'Choose subject →'}
          </button>
        </div>
      </div>
    </div>
  )
}
