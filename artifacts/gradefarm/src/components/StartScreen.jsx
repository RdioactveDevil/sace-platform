import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getPlatformSettings, startGuestCheckout } from '../lib/db'
import { usePublicSubjects } from '../lib/publicSubjects'
import { formatSubjectLabel } from '../lib/subjects'
import { studentTiers, extraLadder, monthlySaving, money } from '../lib/pricing'

const GOLD   = '#f1be43'
const NAVYD  = '#080d28'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

/**
 * /start — pay first, sign up after. Pick a subject and weekly or monthly
 * billing, pay in Stripe Checkout (which takes the email), and the account is
 * made from that email (api-server lib/guest-checkout.ts); /welcome picks up
 * from there. ?subject=<curriculum id> preselects a subject.
 */
export default function StartScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const subjects = usePublicSubjects()
  const [pricing, setPricing] = useState(null)
  const [subjectId, setSubjectId] = useState(params.get('subject') || '')
  const [interval, setBillingInterval] = useState('week')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { getPlatformSettings('pricing').then(setPricing).catch(() => {}) }, [])
  useEffect(() => {
    if (subjects?.length && !subjects.some(s => s.id === subjectId)) setSubjectId(subjects[0].id)
  }, [subjects]) // eslint-disable-line react-hooks/exhaustive-deps

  const weekly = studentTiers(pricing?.student_tiers)
  const monthly = studentTiers(pricing?.student_monthly_tiers, 'month')
  const tiers = interval === 'month' ? monthly : weekly
  const saving = monthlySaving(weekly[0], monthly[0])
  const chosen = subjects?.find(s => s.id === subjectId)

  const pay = async () => {
    if (!chosen || busy) return
    setBusy(true); setError('')
    try {
      const { url } = await startGuestCheckout(chosen.id, interval)
      window.location.assign(url)
    } catch (e) {
      setError(e.message || 'Could not start checkout. Please try again.')
      setBusy(false)
    }
  }

  const option = (active) => ({
    padding: '12px 14px', borderRadius: 12, cursor: busy ? 'default' : 'pointer', fontFamily: FONT_B, textAlign: 'left',
    border: `1.5px solid ${active ? GOLD : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(241,190,67,0.08)' : 'rgba(255,255,255,0.02)', color: '#f1f5f9',
  })

  return (
    <div style={{ minHeight: '100vh', background: NAVYD, color: '#f1f5f9', fontFamily: FONT_B, padding: '40px 16px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <button type="button" onClick={() => navigate('/home')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT_D, fontSize: 22, letterSpacing: 1, marginBottom: 28 }}>
          <span style={{ color: '#f1f5f9' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
        </button>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 8px', lineHeight: 1.2 }}>Start practising in two minutes</h1>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 28px' }}>
          Pick a subject and pay securely. We'll make your account from your email and you're straight in: unlimited questions and Titan AI help. Cancel any time.
        </p>

        <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>1. Your subject</div>
        {subjects === null ? (
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 24 }}>Loading subjects…</div>
        ) : subjects.length === 0 ? (
          <div style={{ fontSize: 14, color: '#f87171', marginBottom: 24 }}>Couldn't load subjects. Refresh to try again.</div>
        ) : (
          <select value={subjectId} onChange={e => setSubjectId(e.target.value)} disabled={busy} aria-label="Subject"
            style={{ width: '100%', padding: '13px 14px', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#f1f5f9', fontSize: 15, fontFamily: FONT_B, marginBottom: 24 }}>
            {subjects.map(s => <option key={s.id} value={s.id} style={{ color: '#0c1037' }}>{formatSubjectLabel({ name: s.name, stage: s.level })}</option>)}
          </select>
        )}

        <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>2. How you pay</div>
        <div role="radiogroup" aria-label="Billing period" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {[['week', weekly[0], 'Weekly', null], ['month', monthly[0], 'Monthly', saving ? `Save ${saving}%` : null]].map(([value, price, label, note]) => (
            <button key={value} type="button" role="radio" aria-checked={interval === value} onClick={() => setBillingInterval(value)} disabled={busy} style={option(interval === value)}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{label}{note && <span style={{ color: '#34d399', marginLeft: 6 }}>{note}</span>}</div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>${money(price)}<span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}> / {value}</span></div>
            </button>
          ))}
        </div>

        <button type="button" onClick={pay} disabled={!chosen || busy}
          style={{ width: '100%', padding: 16, borderRadius: 14, border: 'none', background: !chosen || busy ? 'rgba(255,255,255,0.1)' : GOLD, color: !chosen || busy ? 'rgba(255,255,255,0.4)' : NAVYD, fontSize: 16, fontWeight: 900, fontFamily: FONT_B, cursor: !chosen || busy ? 'default' : 'pointer' }}>
          {busy ? 'Opening secure checkout…' : `Pay $${money(tiers[0])}/${interval} and start →`}
        </button>
        {error && <div role="alert" style={{ marginTop: 12, fontSize: 13, color: '#f87171' }}>{error}</div>}
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginTop: 14 }}>
          Paying for a student? Use <strong style={{ color: 'rgba(255,255,255,0.7)' }}>their</strong> email at checkout: it becomes their sign-in.
          Extra subjects cost less (${extraLadder(tiers)}/{interval} each) and can be added once you're in. Payments by Stripe, in AUD.
        </p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 20 }}>
          Already have an account? <button type="button" onClick={() => navigate('/auth')} style={{ background: 'none', border: 'none', padding: 0, color: GOLD, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, fontSize: 13 }}>Sign in</button>
          {' · '}Want to try first? <button type="button" onClick={() => navigate('/auth')} style={{ background: 'none', border: 'none', padding: 0, color: GOLD, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, fontSize: 13 }}>Start free</button>
        </p>
      </div>
    </div>
  )
}
