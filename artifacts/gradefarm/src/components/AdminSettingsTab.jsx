import { useState, useEffect } from 'react'
import { getPlatformSettings, setPlatformSetting } from '../lib/db'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'
const BG     = '#080d28'

function Section({ title, children }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px 28px', marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: GOLD, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>{title}</div>
      {children}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.65)', marginBottom: 6 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.35)', marginLeft: 8 }}>{hint}</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#f1f5f9',
  fontFamily: FONT_B,
  fontSize: 14,
  padding: '9px 12px',
  width: '100%',
  boxSizing: 'border-box',
}

const btnStyle = {
  padding: '9px 22px',
  borderRadius: 9,
  border: 'none',
  background: `linear-gradient(135deg, ${GOLD}, #f9d87a)`,
  color: '#080d28',
  fontFamily: FONT_B,
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
}

const disabledBtnStyle = {
  ...btnStyle,
  background: 'rgba(255,255,255,0.1)',
  color: 'rgba(255,255,255,0.3)',
  cursor: 'default',
}

// Default values (used as fallback while loading or if DB is empty)
const DEFAULT_PRICING   = { student_tiers: [5, 4, 3], free_daily_questions: 20, tutor_plans: [{ name: 'Starter', price: 29 }, { name: 'Growth', price: 59 }, { name: 'Pro', price: 99 }], annual_discount: 0.15 }

export default function AdminSettingsTab() {
  // Pricing state
  const [pr, setPr]             = useState(DEFAULT_PRICING)
  const [prSaving, setPrSaving] = useState(false)
  const [prMsg, setPrMsg]       = useState(null)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getPlatformSettings('pricing').then((prVal) => {
      if (cancelled) return
      if (prVal) setPr({ ...DEFAULT_PRICING, ...prVal, tutor_plans: prVal.tutor_plans || DEFAULT_PRICING.tutor_plans })
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const savePr = async () => {
    setPrSaving(true)
    setPrMsg(null)
    try {
      await setPlatformSetting('pricing', pr)
      setPrMsg({ ok: true, text: 'Saved.' })
    } catch (e) {
      setPrMsg({ ok: false, text: e.message || 'Save failed.' })
    } finally {
      setPrSaving(false)
    }
  }

  const updateTutorPlan = (idx, field, raw) => {
    const val = field === 'price' ? (raw === '' ? '' : Number(raw)) : raw
    setPr(p => {
      const plans = [...(p.tutor_plans || [])]
      plans[idx] = { ...plans[idx], [field]: val }
      return { ...p, tutor_plans: plans }
    })
  }

  if (loading) {
    return <div style={{ color: 'rgba(255,255,255,0.4)', fontFamily: FONT_B, fontSize: 14 }}>Loading settings…</div>
  }

  return (
    <div style={{ fontFamily: FONT_B }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>Platform Settings</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 28 }}>Student access and pricing.</div>

      {/* ── Student access ── */}
      <Section title="Student access">
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
          Every student can pick one free subject (limited questions per day). Paid subjects are one weekly Stripe plan
          per student, cheaper for each extra subject (prices below). Subjects unlocked during the beta stay free. To
          give a student a subject for free, grant it from <strong>Students</strong>; removing a paid subject there takes
          it off their plan. Tutors and admins can use every subject.
        </div>
      </Section>

      {/* ── Pricing ── */}
      <Section title="Pricing (shown on pricing page)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 4 }}>
          {['1st subject', '2nd subject', '3rd+ subjects (each)'].map((label, i) => (
            <Field key={label} label={`${label} ($/week, AUD)`} hint={i === 0 ? 'New plans use these prices' : undefined}>
              <input
                style={inputStyle}
                type="number"
                min={1}
                step={0.5}
                value={(pr.student_tiers || DEFAULT_PRICING.student_tiers)[i] ?? ''}
                onChange={e => setPr(p => {
                  const next = [...(p.student_tiers || DEFAULT_PRICING.student_tiers)]
                  next[i] = e.target.value === '' ? '' : Number(e.target.value)
                  return { ...p, student_tiers: next }
                })}
                placeholder={String(DEFAULT_PRICING.student_tiers[i])}
              />
            </Field>
          ))}
          <Field label="Free subject: questions per day">
            <input
              style={inputStyle}
              type="number"
              min={0}
              value={pr.free_daily_questions ?? ''}
              onChange={e => setPr(p => ({ ...p, free_daily_questions: e.target.value === '' ? '' : Number(e.target.value) }))}
              placeholder="20"
            />
          </Field>
          <Field label="Annual discount %" hint="e.g. 15 for 15%">
            <input
              style={inputStyle}
              type="number"
              min={0}
              max={100}
              value={pr.annual_discount != null ? Math.round(pr.annual_discount * 100) : ''}
              onChange={e => setPr(p => ({ ...p, annual_discount: e.target.value === '' ? 0 : Number(e.target.value) / 100 }))}
              placeholder="15"
            />
          </Field>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, marginTop: 4 }}>Tutor Plan Prices</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 4 }}>
          {(pr.tutor_plans || []).map((plan, idx) => (
            <Field key={idx} label={plan.name || `Plan ${idx + 1}`} hint="$/month">
              <input
                style={inputStyle}
                type="number"
                min={0}
                value={plan.price ?? ''}
                onChange={e => updateTutorPlan(idx, 'price', e.target.value)}
                placeholder="0"
              />
            </Field>
          ))}
        </div>

        {prMsg && (
          <div style={{ fontSize: 12, color: prMsg.ok ? '#10b981' : '#f87171', marginBottom: 10 }}>{prMsg.text}</div>
        )}
        <button style={prSaving ? disabledBtnStyle : btnStyle} onClick={savePr} disabled={prSaving}>
          {prSaving ? 'Saving…' : 'Save Pricing Settings'}
        </button>
      </Section>
    </div>
  )
}
