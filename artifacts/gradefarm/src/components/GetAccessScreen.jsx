import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { addSubscription, getPlatformSettings } from '../lib/db'
import { formatSubjectLabel } from '../lib/subjects'
import { SubjectIcon } from './SubjectIcons'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

function hex(color, alpha) {
  const c = color.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function GetAccessScreen({ profile, onAccessGranted }) {
  const { state } = useLocation()
  const navigate  = useNavigate()
  const subj      = state?.subject
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  // Free-tier settings from DB (fallback to beta defaults)
  const [freeTier, setFreeTier] = useState({ is_beta: true, beta_label: 'Free during Beta' })
  useEffect(() => {
    getPlatformSettings('free_tier').then(val => {
      if (val) setFreeTier(prev => ({ ...prev, ...val }))
    }).catch(() => {})
  }, [])

  if (!subj) {
    navigate('/subject-picker', { replace: true })
    return null
  }

  const color = subj.color ?? GOLD

  const handleUnlock = async () => {
    setLoading(true)
    setError(null)
    try {
      await addSubscription(profile.id, subj.name, subj.stage)
      await onAccessGranted()
      navigate('/subject-picker', { replace: true })
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#06071a',
      backgroundImage: `
        radial-gradient(ellipse 700px 500px at 70% -5%, ${hex(color, 0.12)} 0%, transparent 60%),
        radial-gradient(ellipse 400px 300px at -5% 90%, rgba(99,102,241,0.07) 0%, transparent 55%)
      `,
      fontFamily: FONT_B,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', boxSizing: 'border-box',
      color: '#f1f5f9',
    }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes gaFadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
        .ga-fadein { animation: gaFadeUp 0.32s ease both; }
        .ga-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .ga-btn:active:not(:disabled) { transform: translateY(0); }
        .ga-back:hover { color: rgba(255,255,255,0.7) !important; }
      `}</style>

      <div className="ga-fadein" style={{ width: '100%', maxWidth: 440 }}>

        {/* Back */}
        <button
          className="ga-back"
          onClick={() => navigate('/subject-picker')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, color: 'rgba(255,255,255,0.35)',
            fontFamily: FONT_B, fontWeight: 600,
            marginBottom: 28, display: 'flex', alignItems: 'center', gap: 6, padding: 0,
            transition: 'color 0.15s',
          }}
        >
          ← Back to subjects
        </button>

        {/* Hero card */}
        <div style={{
          borderRadius: 24,
          background: `linear-gradient(145deg, ${hex(color, 0.22)} 0%, ${hex(color, 0.08)} 45%, rgba(15,18,50,0.98) 100%)`,
          border: `1.5px solid ${hex(color, 0.38)}`,
          padding: '28px 32px',
          marginBottom: 14,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: `0 20px 72px ${hex(color, 0.16)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}>
          {/* glow blob */}
          <div style={{
            position: 'absolute', bottom: -40, right: -40,
            width: 240, height: 240, borderRadius: '50%', pointerEvents: 'none',
            background: `radial-gradient(circle, ${hex(color, 0.28)} 0%, transparent 65%)`,
          }} />

          {/* top row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, position: 'relative' }}>
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
                background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.28)',
                borderRadius: 99, padding: '4px 12px',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', boxShadow: '0 0 6px rgba(255,255,255,0.7)' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: '0.08em' }}>
                  {subj.stage}
                </span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {subj.name}
              </div>
            </div>

            <div style={{
              width: 60, height: 60, borderRadius: 16, flexShrink: 0,
              background: 'rgba(255,255,255,0.12)',
              border: '1.5px solid rgba(255,255,255,0.28)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
            }}>
              <SubjectIcon subj={subj} color="#fff" size={28} />
            </div>
          </div>

          {/* topics */}
          {subj.topics?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, position: 'relative' }}>
              {subj.topics.map(t => (
                <span key={t} style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 11px', borderRadius: 99,
                  background: hex(color, 0.14), border: `1px solid ${hex(color, 0.30)}`,
                  color: color,
                }}>{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* Pricing card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 20, padding: '24px 28px', marginBottom: 12,
        }}>
          {/* Price */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: FONT_D, fontSize: 44, color: '#fff', lineHeight: 1 }}>{freeTier.is_beta ? '$0' : '$7'}</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 7 }}>{freeTier.is_beta ? '/ forever' : '/ month'}</span>
          </div>
          {freeTier.is_beta && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: hex(GOLD, 0.14), border: `1px solid ${hex(GOLD, 0.35)}`,
              borderRadius: 99, padding: '4px 12px', marginBottom: 22,
            }}>
              <span style={{ fontSize: 11, color: GOLD, fontWeight: 700 }}>🎉 {freeTier.beta_label || 'Free during Beta'}</span>
            </div>
          )}

          {/* What's included */}
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
            color: 'rgba(255,255,255,0.28)', marginBottom: 12,
          }}>WHAT'S INCLUDED</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
            {[
              `${subj.questionCount || 'Hundreds of'} practice questions`,
              'Instant feedback on every answer',
              'Spaced repetition to lock in memory',
              `Full topic coverage for ${subj.stage}`,
            ].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 9, color: '#34d399', fontWeight: 900 }}>✓</span>
                </div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.35)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 12,
            fontSize: 13, color: '#f87171',
          }}>
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          className="ga-btn"
          onClick={handleUnlock}
          disabled={loading}
          style={{
            width: '100%', padding: '15px', borderRadius: 14, border: 'none',
            background: loading ? 'rgba(255,255,255,0.06)' : '#ffffff',
            color: loading ? 'rgba(255,255,255,0.3)' : '#06071a',
            fontSize: 15, fontWeight: 800,
            cursor: loading ? 'default' : 'pointer',
            fontFamily: FONT_B, letterSpacing: '0.01em',
            boxShadow: loading ? 'none' : '0 8px 28px rgba(0,0,0,0.3)',
            transition: 'all 0.2s ease',
          }}
        >
          {loading ? 'Unlocking…' : `Unlock ${formatSubjectLabel(subj)} — Free →`}
        </button>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 14 }}>
          No payment required · Instant access · Cancel anytime
        </p>
      </div>
    </div>
  )
}
