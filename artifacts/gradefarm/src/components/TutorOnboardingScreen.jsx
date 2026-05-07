import { useState, useEffect } from 'react'
import { completeOnboarding } from '../lib/db'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const NAVYD = '#080d28'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

export default function TutorOnboardingScreen({ profile, userEmail, onDone }) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40)
    return () => clearTimeout(t)
  }, [])

  const next = () => setStep(s => s + 1)
  const back = () => setStep(s => Math.max(0, s - 1))

  const finish = async () => {
    if (!termsAccepted) return
    setSaving(true)
    try {
      await completeOnboarding(profile.id, {})
    } catch (e) {
      console.error('Tutor onboarding save error:', e)
    }
    setSaving(false)
    onDone()
  }

  const navButtons = ({ onNext, nextLabel = 'Continue →', nextDisabled = false, hideBack = false }) => (
    <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
      {!hideBack && (
        <button type="button" onClick={back} style={{
          flex: 1, padding: '12px', borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
          color: '#475569', fontSize: 14, cursor: 'pointer', fontFamily: FONT_B,
        }}>← Back</button>
      )}
      <button type="button"
        onClick={onNext}
        disabled={nextDisabled}
        style={{
          flex: 2, padding: '13px', borderRadius: 10, border: 'none',
          background: nextDisabled ? 'rgba(255,255,255,0.05)' : `linear-gradient(135deg,${GOLD},${GOLDL})`,
          color: nextDisabled ? '#475569' : NAVYD,
          fontSize: 14, fontWeight: 800,
          cursor: nextDisabled ? 'default' : 'pointer',
          fontFamily: FONT_B,
          boxShadow: nextDisabled ? 'none' : `0 4px 20px ${GOLD}40`,
        }}
      >{nextLabel}</button>
    </div>
  )

  const stepWelcome = () => (
    <div style={{ textAlign: 'center', animation: 'slideIn 0.45s ease both' }}>
      <div style={{ width: 64, height: 64, borderRadius: 18, margin: '0 auto 20px', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, boxShadow: `0 12px 32px ${GOLD}40` }}>🎓</div>
      <h2 style={{ fontFamily: FONT_D, fontSize: 22, color: '#f1f5f9', margin: '0 0 12px', letterSpacing: 0.8, lineHeight: 1.3 }}>
        WELCOME,<br /><span style={{ color: GOLD }}>EDUCATOR.</span>
      </h2>
      <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.75, margin: '0 0 20px' }}>
        Thanks for applying to tutor on GradeFarm. Your application is with our team — this short setup explains how things work for
        tutors, which is different from the student onboarding flow.
      </p>
      {profile?.tutor_organization && (
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 18 }}>
          <span style={{ color: '#94a3b8' }}>Application as </span>
          <strong style={{ color: '#e2e8f0' }}>{profile.tutor_organization}</strong>
          {userEmail && (
            <span style={{ display: 'block', marginTop: 6 }}>{userEmail}</span>
          )}
        </div>
      )}
      {navButtons({ onNext: next, hideBack: true, nextLabel: 'Show me how it works →' })}
    </div>
  )

  const stepHowItWorks = () => (
    <div style={{ animation: 'slideIn 0.4s ease both' }}>
      <h2 style={{ fontFamily: FONT_D, fontSize: 19, color: '#f1f5f9', margin: '0 0 6px', letterSpacing: 0.6, textAlign: 'center' }}>
        HOW IT WORKS FOR TUTORS
      </h2>
      <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 22 }}>
        No ATAR targets or student subject picks here — you already told us what you teach.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          { t: 'Review queue', d: 'We verify your details and approve tutor access when ready. You will use the same account throughout.' },
          { t: 'Before approval', d: 'You can explore the question bank and Learn tools like a student — useful for demos and your own practice.' },
          { t: 'After approval', d: 'Tutor Dashboard appears in the sidebar: roster, classes, assignments, and progress insights for your students.' },
        ].map((row, i) => (
          <div key={i} style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: GOLD, marginBottom: 6 }}>{row.t}</div>
            <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{row.d}</div>
          </div>
        ))}
      </div>
      {navButtons({ onNext: next })}
    </div>
  )

  const stepTerms = () => (
    <div style={{ animation: 'slideIn 0.4s ease both' }}>
      <h2 style={{ fontFamily: FONT_D, fontSize: 19, color: '#f1f5f9', margin: '0 0 6px', letterSpacing: 0.6, textAlign: 'center' }}>
        TERMS & GET STARTED
      </h2>
      <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 18 }}>
        Accept terms to finish onboarding — then we will walk you through the app.
      </p>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px', borderRadius: 10, border: `1px solid ${termsAccepted ? GOLD : 'rgba(255,255,255,0.1)'}`, background: termsAccepted ? 'rgba(241,190,67,0.06)' : 'rgba(255,255,255,0.02)', marginBottom: 8 }}>
        <button type="button" onClick={() => setTermsAccepted(v => !v)} style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${termsAccepted ? GOLD : 'rgba(255,255,255,0.2)'}`, background: termsAccepted ? GOLD : 'transparent', flexShrink: 0, marginTop: 1, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {termsAccepted && <span style={{ fontSize: 11, color: NAVYD, fontWeight: 800 }}>✓</span>}
        </button>
        <span style={{ fontSize: 13, color: termsAccepted ? '#e2e8f0' : '#64748b', lineHeight: 1.5 }}>
          I agree to the{' '}
          <button type="button" onClick={() => window.open('/terms', '_blank')} style={{ background: 'none', border: 'none', padding: 0, color: GOLD, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_B, fontSize: 'inherit' }}>Terms of Service</button>
          {' '}and{' '}
          <button type="button" onClick={() => window.open('/privacy', '_blank')} style={{ background: 'none', border: 'none', padding: 0, color: GOLD, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_B, fontSize: 'inherit' }}>Privacy Policy</button>
          .
        </span>
      </div>
      {navButtons({ onNext: finish, nextLabel: saving ? 'Saving…' : 'Continue to tour →', nextDisabled: !termsAccepted || saving })}
    </div>
  )

  const progressBar = () => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        {['Welcome', 'How it works', 'Terms'].map((label, i) => (
          <span key={label} style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: step >= i ? GOLD : 'rgba(255,255,255,0.2)',
          }}>{label}</span>
        ))}
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99 }}>
        <div style={{
          height: '100%', borderRadius: 99,
          background: `linear-gradient(90deg,${GOLD},${GOLDL})`,
          width: `${((step + 1) / 3) * 100}%`,
          transition: 'width 0.45s cubic-bezier(0.34,1.56,0.64,1)',
          boxShadow: `0 0 8px ${GOLD}80`,
        }} />
      </div>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh', background: NAVYD,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: FONT_B,
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes slideIn { from { opacity:0; transform: translateY(16px) } to { opacity:1; transform: translateY(0) } }
        input:focus { border-color: #f1be43 !important; box-shadow: 0 0 0 3px rgba(241,190,67,0.12) !important; }
      `}</style>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-12%', left: '-8%', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(241,190,67,0.08) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-8%', right: '-5%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.014) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.014) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>
      <div style={{
        width: '100%', maxWidth: 440, position: 'relative',
        background: 'rgba(8,13,40,0.96)', borderRadius: 24,
        border: '1px solid rgba(241,190,67,0.2)',
        padding: '32px 28px',
        boxShadow: '0 40px 100px rgba(0,0,0,0.7)',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(28px)',
        transition: 'opacity 0.55s ease, transform 0.55s cubic-bezier(0.34,1.2,0.64,1)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={{ fontFamily: FONT_D, fontSize: 20, letterSpacing: 1 }}>
            <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
          </span>
          <div style={{ fontSize: 10, color: '#475569', marginTop: 4, letterSpacing: '0.1em', fontWeight: 700 }}>TUTOR ONBOARDING</div>
        </div>
        {progressBar()}
        {[stepWelcome, stepHowItWorks, stepTerms][step]()}
      </div>
    </div>
  )
}
