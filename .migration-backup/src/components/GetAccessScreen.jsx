import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { addSubscription } from '../lib/db'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const NAVY   = '#0c1037'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

export default function GetAccessScreen({ profile, onAccessGranted }) {
  const { state } = useLocation()
  const navigate  = useNavigate()
  const subj      = state?.subject
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  if (!subj) {
    navigate('/subject-picker', { replace: true })
    return null
  }

  const handleUnlock = async () => {
    setLoading(true)
    setError(null)
    try {
      await addSubscription(profile.id, subj.name, subj.stage)
      await onAccessGranted()
      navigate('/subject-picker', { replace: true })
    } catch (e) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9ff', fontFamily: FONT_B, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', boxSizing: 'border-box' }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .unlock-btn:hover { opacity: 0.92; transform: translateY(-1px); box-shadow: 0 12px 36px rgba(12,16,55,0.3) !important; }
        .unlock-btn:active { transform: translateY(0); }
        .back-btn:hover { color: #0c1037 !important; }
      `}</style>

      <div style={{ width: '100%', maxWidth: 420, animation: 'fadeUp 0.4s ease' }}>

        {/* Back */}
        <button
          className="back-btn"
          onClick={() => navigate('/subject-picker')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#94a3b8', fontFamily: FONT_B, fontWeight: 600, marginBottom: 28, display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}
        >
          ← Back to subjects
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: `${subj.color}22`, border: `1.5px solid ${subj.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 16px' }}>
            {subj.icon}
          </div>
          <div style={{ fontFamily: FONT_D, fontSize: 11, color: '#94a3b8', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Get Access</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY, margin: '0 0 4px' }}>{subj.name}</h1>
          <div style={{ fontSize: 13, color: subj.color, fontWeight: 700 }}>{subj.stage}</div>
        </div>

        {/* Pricing card */}
        <div style={{ background: '#fff', border: '1px solid #e2e5f0', borderRadius: 20, padding: '28px 24px', marginBottom: 16, boxShadow: '0 4px 24px rgba(12,16,55,0.07)' }}>

          {/* Price */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: FONT_D, fontSize: 48, color: NAVY, lineHeight: 1 }}>$0</span>
            <span style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>/ forever</span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: `${GOLD}22`, border: `1px solid ${GOLD}55`, borderRadius: 20, padding: '4px 10px', marginBottom: 24 }}>
            <span style={{ fontSize: 11, color: '#92660a', fontWeight: 700 }}>🎉 Free during Beta</span>
          </div>

          {/* What's included */}
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>What's included</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {[
              `${subj.questionCount} practice questions`,
              'Instant feedback on every answer',
              'Spaced repetition to lock in memory',
              'Full topic coverage for ' + subj.stage,
            ].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#d1fae5', border: '1px solid #6ee7b7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: '#059669', fontWeight: 800 }}>✓</span>
                </div>
                <span style={{ fontSize: 13, color: '#334155' }}>{item}</span>
              </div>
            ))}
          </div>

          {/* Topics preview */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {subj.topics.map(t => (
              <span key={t} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: '#f1f5f9', border: '1px solid #e2e5f0', color: '#475569' }}>{t}</span>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          className="unlock-btn"
          onClick={handleUnlock}
          disabled={loading}
          style={{
            width: '100%', padding: '16px', borderRadius: 14, border: 'none',
            background: loading ? '#e2e5f0' : `linear-gradient(135deg, ${NAVY}, #1e2a6e)`,
            color: loading ? '#94a3b8' : GOLD,
            fontSize: 15, fontWeight: 800, cursor: loading ? 'default' : 'pointer',
            fontFamily: FONT_B, transition: 'all 0.2s ease',
            boxShadow: loading ? 'none' : '0 8px 28px rgba(12,16,55,0.25)',
          }}
        >
          {loading ? 'Unlocking…' : `Unlock ${subj.name} ${subj.stage} — Free →`}
        </button>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 14 }}>
          No payment required · Instant access · Cancel anytime
        </p>
      </div>
    </div>
  )
}
