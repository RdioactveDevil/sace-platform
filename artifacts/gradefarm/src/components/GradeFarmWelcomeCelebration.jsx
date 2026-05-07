import { useEffect, useState } from 'react'
import { THEMES } from '../lib/theme'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const NAVYD = '#080d28'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

/** Full-screen “welcome to GradeFarm” moment after the feature tour completes. */
export default function GradeFarmWelcomeCelebration({ theme, onDismiss }) {
  const t = THEMES[theme] || THEMES.dark
  const [phase, setPhase] = useState('enter')

  useEffect(() => {
    const a = requestAnimationFrame(() => setPhase('revealed'))
    return () => cancelAnimationFrame(a)
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gf-welcome-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: FONT_B,
        overflow: 'hidden',
      }}
    >
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes gf-welcome-bg-pulse {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.04); }
        }
        @keyframes gf-welcome-ring-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes gf-welcome-title-in {
          from { opacity: 0; transform: translateY(28px) scale(0.92); letter-spacing: 0.5em; }
          to { opacity: 1; transform: translateY(0) scale(1); letter-spacing: 0.12em; }
        }
        @keyframes gf-welcome-sub-in {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes gf-welcome-spark {
          0%, 100% { opacity: 0.35; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-6px); }
        }
        @keyframes gf-welcome-shimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 80% 55% at 50% 42%, rgba(241,190,67,0.22) 0%, transparent 55%), radial-gradient(ellipse 90% 70% at 50% 100%, rgba(99,102,241,0.12) 0%, transparent 45%), linear-gradient(165deg, #050716 0%, #0a0f2e 40%, #060814 100%)`,
          animation: phase === 'revealed' ? 'gf-welcome-bg-pulse 10s ease-in-out infinite' : 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(rgba(241,190,67,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(241,190,67,0.03) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          opacity: 0.55,
        }}
      />

      {/* Decorative rings */}
      <div
        style={{
          position: 'absolute',
          width: 'min(120vw, 920px)',
          height: 'min(120vw, 920px)',
          borderRadius: '50%',
          border: '1px solid rgba(241,190,67,0.14)',
          animation: phase === 'revealed' ? 'gf-welcome-ring-spin 48s linear infinite' : 'none',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 'min(95vw, 620px)',
          height: 'min(95vw, 620px)',
          borderRadius: '50%',
          border: '1px dashed rgba(241,190,67,0.16)',
          animation: phase === 'revealed' ? 'gf-welcome-ring-spin 62s linear infinite reverse' : 'none',
          pointerEvents: 'none',
        }}
      />

      {/* Spark dots */}
      {[...Array(12)].map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: GOLD,
            left: `${8 + (i * 7.8) % 84}%`,
            top: `${12 + (i * 11) % 76}%`,
            opacity: 0,
            animation: phase === 'revealed' ? `gf-welcome-spark ${3 + (i % 4)}s ease-in-out infinite` : 'none',
            animationDelay: `${i * 0.15}s`,
            boxShadow: `0 0 12px ${GOLD}`,
            pointerEvents: 'none',
          }}
        />
      ))}

      <div
        style={{
          position: 'relative',
          maxWidth: 560,
          width: '100%',
          textAlign: 'center',
          opacity: phase === 'revealed' ? 1 : 0,
          transition: 'opacity 0.7s ease',
        }}
      >
        <div
          id="gf-welcome-title"
          style={{
            fontFamily: FONT_D,
            fontSize: 'clamp(13px, 3.5vw, 15px)',
            color: 'rgba(255,255,255,0.38)',
            letterSpacing: '0.38em',
            textTransform: 'uppercase',
            marginBottom: 14,
            animation: phase === 'revealed' ? 'gf-welcome-title-in 1.15s cubic-bezier(0.22,1,0.36,1) forwards' : 'none',
          }}
        >
          Welcome to
        </div>

        <div
          style={{
            fontFamily: FONT_D,
            fontSize: 'clamp(36px, 11vw, 62px)',
            fontWeight: 700,
            lineHeight: 1.08,
            marginBottom: 18,
            animation: phase === 'revealed' ? 'gf-welcome-title-in 1.05s cubic-bezier(0.22,1,0.36,1) 0.12s forwards' : 'none',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              background: `linear-gradient(135deg, #ffffff 0%, ${GOLD} 55%, ${GOLDL} 78%, #fefce8 100%)`,
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              animation: phase === 'revealed' ? 'gf-welcome-shimmer 10s ease infinite 1s' : 'none',
            }}
          >
            grade
          </span>
          <span style={{ color: GOLD }}>farm.</span>
        </div>

        <p
          style={{
            fontSize: 'clamp(15px, 4vw, 18px)',
            color: t.textMuted || '#94a3b8',
            lineHeight: 1.75,
            margin: '0 auto 36px',
            maxWidth: 440,
            animation: phase === 'revealed' ? 'gf-welcome-sub-in 0.9s ease 0.55s forwards' : 'none',
            opacity: phase === 'revealed' ? 1 : 0,
          }}
        >
          You are inside the live app — adaptive practice, Titan-powered Learn, and your progress hub are ready.
          <span style={{ display: 'block', marginTop: 12, color: GOLD, fontWeight: 700, fontSize: '0.92em' }}>
            Study smarter. Score higher.
          </span>
        </p>

        <button
          type="button"
          onClick={onDismiss}
          style={{
            padding: '16px 40px',
            borderRadius: 14,
            border: 'none',
            cursor: 'pointer',
            fontFamily: FONT_B,
            fontSize: 15,
            fontWeight: 800,
            color: NAVYD,
            background: `linear-gradient(135deg, ${GOLD}, ${GOLDL})`,
            boxShadow: `0 16px 48px rgba(241,190,67,0.45), 0 0 0 1px rgba(255,255,255,0.12) inset`,
            letterSpacing: '0.02em',
            animation: phase === 'revealed' ? 'gf-welcome-sub-in 0.85s ease 0.85s forwards' : 'none',
            opacity: phase === 'revealed' ? 1 : 0,
          }}
        >
          Begin →
        </button>
      </div>
    </div>
  )
}
