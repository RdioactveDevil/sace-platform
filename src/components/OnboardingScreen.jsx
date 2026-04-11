import { useState } from 'react'
import { updateProfile } from '../lib/db'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const NAVY   = '#0c1037'
const NAVYD  = '#080d28'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const GRADES = [
  { label: 'A+',  sub: 'I want to ace it',          emoji: '🏆' },
  { label: 'A',   sub: 'Solid performance',          emoji: '⭐' },
  { label: 'B+',  sub: 'Above average',              emoji: '📈' },
  { label: 'B',   sub: 'Comfortable pass',           emoji: '👍' },
  { label: 'C+',  sub: 'Just need to pass',          emoji: '🎯' },
]

export default function OnboardingScreen({ profile, onDone }) {
  const [step, setStep]           = useState(0)
  const [examDate, setExamDate]   = useState('')
  const [grade, setGrade]         = useState('')
  const [saving, setSaving]       = useState(false)

  const totalSteps = 3

  const next = () => setStep(s => s + 1)

  const finish = async () => {
    setSaving(true)
    try {
      const updates = {}
      if (examDate) updates.exam_date = examDate
      if (Object.keys(updates).length > 0) {
        await updateProfile(profile.id, updates)
      }
      if (grade) {
        localStorage.setItem(`gf-target-grade-${profile.id}`, grade)
      }
    } catch (_) {
      // non-blocking — onboarding should never block entry
    }
    setSaving(false)
    onDone()
  }

  const inp = {
    padding: '12px 14px', borderRadius: 10,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#f1f5f9', fontSize: 15, outline: 'none',
    fontFamily: FONT_B, boxSizing: 'border-box',
    width: '100%', transition: 'border-color 0.2s',
  }

  // ── Progress dots ─────────────────────────────────────────────────────────
  const Dots = () => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 32 }}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div key={i} style={{
          width: i === step ? 20 : 7, height: 7, borderRadius: 4,
          background: i <= step ? GOLD : 'rgba(255,255,255,0.1)',
          transition: 'all 0.3s',
        }} />
      ))}
    </div>
  )

  // ── Step 0: Welcome ───────────────────────────────────────────────────────
  const StepWelcome = () => (
    <div style={{ textAlign: 'center', animation: 'fadeUp 0.4s ease' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>🦁</div>
      <h2 style={{ fontFamily: FONT_D, fontSize: 26, color: '#f1f5f9', margin: '0 0 10px', letterSpacing: 1 }}>
        WELCOME, {profile.display_name.split(' ')[0].toUpperCase()}!
      </h2>
      <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.7, margin: '0 0 28px' }}>
        Let's set up your profile so gradefarm. knows exactly how to help you crush your exams.
      </p>
      <p style={{ fontSize: 13, color: '#475569', marginBottom: 32 }}>Takes 30 seconds. Skip anything you want.</p>
      <button onClick={next} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVYD, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B, boxShadow: `0 8px 24px rgba(241,190,67,0.3)` }}>
        Let's go →
      </button>
    </div>
  )

  // ── Step 1: Exam date ─────────────────────────────────────────────────────
  const StepExamDate = () => {
    const today = new Date().toISOString().split('T')[0]
    const daysLeft = examDate
      ? Math.ceil((new Date(examDate) - new Date()) / 86400000)
      : null

    return (
      <div style={{ animation: 'fadeUp 0.4s ease' }}>
        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 14 }}>📅</div>
        <h2 style={{ fontFamily: FONT_D, fontSize: 22, color: '#f1f5f9', margin: '0 0 8px', letterSpacing: 1, textAlign: 'center' }}>
          WHEN'S YOUR EXAM?
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 24 }}>
          We'll show you a countdown and pace your study plan.
        </p>
        <input
          style={{ ...inp, colorScheme: 'dark' }}
          type="date"
          min={today}
          value={examDate}
          onChange={e => setExamDate(e.target.value)}
          onFocus={e => { e.currentTarget.style.borderColor = GOLD }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
        />
        {daysLeft !== null && daysLeft > 0 && (
          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 14, color: daysLeft <= 14 ? '#f87171' : daysLeft <= 30 ? GOLD : '#4ade80', fontWeight: 700 }}>
            {daysLeft <= 14 ? '🔥' : daysLeft <= 30 ? '⚡' : '📚'} {daysLeft} days to go
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button onClick={() => { setExamDate(''); next() }} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#475569', fontSize: 14, cursor: 'pointer', fontFamily: FONT_B }}>
            Skip
          </button>
          <button onClick={next} style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVYD, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
            {examDate ? 'Save & continue →' : 'Continue →'}
          </button>
        </div>
      </div>
    )
  }

  // ── Step 2: Target grade ──────────────────────────────────────────────────
  const StepGrade = () => (
    <div style={{ animation: 'fadeUp 0.4s ease' }}>
      <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 14 }}>🎯</div>
      <h2 style={{ fontFamily: FONT_D, fontSize: 22, color: '#f1f5f9', margin: '0 0 8px', letterSpacing: 1, textAlign: 'center' }}>
        WHAT'S YOUR TARGET GRADE?
      </h2>
      <p style={{ fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 24 }}>
        This helps us calibrate session difficulty.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {GRADES.map(g => {
          const sel = grade === g.label
          return (
            <button key={g.label} onClick={() => setGrade(sel ? '' : g.label)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '13px 16px', borderRadius: 10,
                border: `1px solid ${sel ? GOLD : 'rgba(255,255,255,0.08)'}`,
                background: sel ? 'rgba(241,190,67,0.1)' : 'rgba(255,255,255,0.03)',
                color: sel ? '#f1f5f9' : '#64748b',
                fontSize: 14, fontWeight: sel ? 700 : 500,
                cursor: 'pointer', fontFamily: FONT_B, textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{g.emoji}</span>
              <div>
                <div style={{ fontWeight: 700, color: sel ? GOLD : '#e2e8f0' }}>{g.label}</div>
                <div style={{ fontSize: 12, color: '#475569' }}>{g.sub}</div>
              </div>
              {sel && <span style={{ marginLeft: 'auto', color: GOLD, fontSize: 16 }}>✓</span>}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        <button onClick={() => { setGrade(''); finish() }} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#475569', fontSize: 14, cursor: 'pointer', fontFamily: FONT_B }}>
          Skip
        </button>
        <button onClick={finish} disabled={saving} style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: saving ? 'rgba(255,255,255,0.05)' : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: saving ? '#475569' : NAVYD, fontSize: 14, fontWeight: 800, cursor: saving ? 'default' : 'pointer', fontFamily: FONT_B }}>
          {saving ? 'Saving…' : "Let's start! →"}
        </button>
      </div>
    </div>
  )

  const STEPS = [<StepWelcome key={0} />, <StepExamDate key={1} />, <StepGrade key={2} />]

  return (
    <div style={{ minHeight: '100vh', background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: FONT_B, backgroundImage: `radial-gradient(ellipse at 30% 20%, rgba(241,190,67,0.06) 0%, transparent 55%)` }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.6); cursor: pointer; }
        input:focus { border-color: ${GOLD} !important; }
      `}</style>

      <div style={{ width: '100%', maxWidth: 420, background: 'rgba(8,13,40,0.95)', borderRadius: 20, border: '1px solid rgba(241,190,67,0.15)', padding: '36px 32px', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <span style={{ fontFamily: FONT_D, fontSize: 20, letterSpacing: 1 }}>
            <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
          </span>
        </div>

        <Dots />

        {STEPS[step]}
      </div>
    </div>
  )
}
