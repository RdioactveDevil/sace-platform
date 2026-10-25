import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getBillingConfig, addPaidSubject, chooseFreeSubject } from '../lib/db'
import { notify } from '../lib/notify'
import { formatSubjectLabel, subjectAccess } from '../lib/subjects'
import { DEFAULT_STUDENT_TIERS, studentTiers, extraLadder } from '../lib/pricing'
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

/**
 * A locked subject: make it the student's free subject (limited questions a
 * day) or pay for it — Stripe Checkout for the first paid subject, otherwise
 * added straight onto their weekly plan.
 */
export default function GetAccessScreen({ subscriptions = [], onAccessChanged }) {
  const { state } = useLocation()
  const navigate  = useNavigate()
  const subj      = state?.subject
  const [error,   setError]   = useState(null)

  const [billing, setBilling] = useState(null)
  const [busy, setBusy] = useState(null) // 'free' | 'paid'
  useEffect(() => {
    getBillingConfig().then(setBilling).catch(() => setBilling({ enabled: false, tiers: DEFAULT_STUDENT_TIERS, nextPrice: DEFAULT_STUDENT_TIERS[0], weeklyTotal: 0, hasPlan: false, freeDailyQuestions: 20 }))
  }, [])

  if (!subj) {
    navigate('/subject-picker', { replace: true })
    return null
  }

  const color = subj.color ?? GOLD

  const curriculumId = String(subj.id || '').replace(/^curriculum_/, '')
  const tiers = studentTiers(billing?.tiers)
  const nextPrice = billing?.nextPrice ?? tiers[0]
  const freeDaily = billing?.freeDailyQuestions ?? 20
  const currentFree = subscriptions.find(sub => sub.source === 'free')
  const currentFreeLabel = currentFree ? formatSubjectLabel({ name: currentFree.subject_name, stage: currentFree.stage }) : null
  // Opened from the free subject's daily limit: only the paid option applies.
  const isFreeSubject = subjectAccess(subscriptions, subj) === 'free'

  const handleFree = async () => {
    setBusy('free'); setError(null)
    try {
      await chooseFreeSubject(curriculumId)
      await onAccessChanged?.()
      notify.success(`${formatSubjectLabel(subj)} is now your free subject.`)
      navigate('/subject-picker', { replace: true })
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
      setBusy(null)
    }
  }

  const handlePaid = async () => {
    setBusy('paid'); setError(null)
    try {
      const result = await addPaidSubject(curriculumId)
      if (result.url) { window.location.assign(result.url); return }
      await onAccessChanged?.()
      notify.success(`${formatSubjectLabel(subj)} added — your plan is now $${result.weeklyTotal}/week.`)
      navigate('/subject-picker', { replace: true })
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
      setBusy(null)
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

        {/* Paid option */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${hex(GOLD, 0.35)}`,
          borderRadius: 20, padding: '22px 24px', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: FONT_D, fontSize: 40, color: '#fff', lineHeight: 1 }}>${nextPrice}</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>/ week · AUD</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginBottom: 16, lineHeight: 1.5 }}>
            {billing?.hasPlan
              ? `Added to your plan: $${billing.weeklyTotal} → $${billing.weeklyTotal + nextPrice}/week, prorated from today.`
              : `Unlimited ${formatSubjectLabel(subj)}. Extra subjects cost less: $${extraLadder(tiers)}/week each.`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 18 }}>
            {[
              'Unlimited practice questions',
              'Unlimited Titan AI tutoring',
              'Exam Mode and full topic coverage',
              'Instant feedback and spaced repetition',
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
          <button
            className="ga-btn"
            onClick={handlePaid}
            disabled={!!busy || !billing || billing.enabled === false}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, border: 'none',
              background: busy ? 'rgba(255,255,255,0.06)' : '#ffffff',
              color: busy ? 'rgba(255,255,255,0.3)' : '#06071a',
              fontSize: 15, fontWeight: 800, cursor: busy ? 'default' : 'pointer',
              fontFamily: FONT_B, boxShadow: busy ? 'none' : '0 8px 28px rgba(0,0,0,0.3)', transition: 'all 0.2s ease',
            }}
          >
            {busy === 'paid' ? (billing?.hasPlan ? 'Adding…' : 'Opening secure checkout…')
              : billing?.enabled === false ? 'Payments are coming soon'
              : billing?.hasPlan ? `Add to my plan — +$${nextPrice}/week`
              : `Subscribe — $${nextPrice}/week →`}
          </button>
          <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '10px 0 0' }}>
            Billed weekly · cancel any time from My Account · secure payment by Stripe
          </p>
        </div>

        {/* Free option */}
        {!isFreeSubject && <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, padding: '18px 24px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 3 }}>Or use it as your free subject</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
              {freeDaily} questions a day, free.{currentFreeLabel ? ` Replaces ${currentFreeLabel} as your free subject.` : ''}
            </div>
          </div>
          <button
            onClick={handleFree}
            disabled={!!busy}
            style={{
              padding: '10px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.18)',
              background: 'transparent', color: '#f1f5f9', fontSize: 13, fontWeight: 700,
              cursor: busy ? 'default' : 'pointer', fontFamily: FONT_B, whiteSpace: 'nowrap', opacity: busy && busy !== 'free' ? 0.5 : 1,
            }}
          >
            {busy === 'free' ? 'Switching…' : currentFreeLabel ? 'Switch free subject' : 'Use for free'}
          </button>
        </div>}

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
      </div>
    </div>
  )
}
