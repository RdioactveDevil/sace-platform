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
const DEFAULT_FREE_TIER = { is_beta: true, beta_label: 'Free during Beta', daily_question_limit: null, subjects_limit: null }
const DEFAULT_PRICING   = { student_monthly: 7, tutor_plans: [{ name: 'Starter', price: 29 }, { name: 'Growth', price: 59 }, { name: 'Pro', price: 99 }], annual_discount: 0.15 }

export default function AdminSettingsTab() {
  // Free tier state
  const [ft, setFt]             = useState(DEFAULT_FREE_TIER)
  const [ftSaving, setFtSaving] = useState(false)
  const [ftMsg, setFtMsg]       = useState(null) // { ok, text }

  // Pricing state
  const [pr, setPr]             = useState(DEFAULT_PRICING)
  const [prSaving, setPrSaving] = useState(false)
  const [prMsg, setPrMsg]       = useState(null)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getPlatformSettings('free_tier'),
      getPlatformSettings('pricing'),
    ]).then(([ftVal, prVal]) => {
      if (cancelled) return
      if (ftVal) setFt({ ...DEFAULT_FREE_TIER, ...ftVal })
      if (prVal) setPr({ ...DEFAULT_PRICING, ...prVal, tutor_plans: prVal.tutor_plans || DEFAULT_PRICING.tutor_plans })
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const saveFt = async () => {
    setFtSaving(true)
    setFtMsg(null)
    try {
      await setPlatformSetting('free_tier', ft)
      setFtMsg({ ok: true, text: 'Saved.' })
    } catch (e) {
      setFtMsg({ ok: false, text: e.message || 'Save failed.' })
    } finally {
      setFtSaving(false)
    }
  }

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
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 28 }}>Manage free-tier access and pricing displayed on the platform.</div>

      {/* ── Free Tier / Access ── */}
      <Section title="Free Tier / Access">
        <Field label="Beta mode (all access free)">
          <div
            onClick={() => setFt(f => ({ ...f, is_beta: !f.is_beta }))}
            style={{ width: 44, height: 24, borderRadius: 12, background: ft.is_beta ? `linear-gradient(90deg,${GOLD},#f9d87a)` : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}
          >
            <div style={{ position: 'absolute', top: 3, left: ft.is_beta ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 5 }}>
            {ft.is_beta ? 'All subjects free for all users.' : 'Normal paid access enforced.'}
          </div>
        </Field>

        <Field label="Beta label text" hint="shown in GetAccessScreen badge">
          <input
            style={inputStyle}
            value={ft.beta_label ?? ''}
            onChange={e => setFt(f => ({ ...f, beta_label: e.target.value }))}
            placeholder="Free during Beta"
          />
        </Field>

        <Field label="Daily question limit" hint="blank = unlimited">
          <input
            style={{ ...inputStyle, maxWidth: 160 }}
            type="number"
            min={0}
            value={ft.daily_question_limit ?? ''}
            onChange={e => setFt(f => ({ ...f, daily_question_limit: e.target.value === '' ? null : Number(e.target.value) }))}
            placeholder="Unlimited"
          />
        </Field>

        {ftMsg && (
          <div style={{ fontSize: 12, color: ftMsg.ok ? '#10b981' : '#f87171', marginBottom: 10 }}>{ftMsg.text}</div>
        )}
        <button style={ftSaving ? disabledBtnStyle : btnStyle} onClick={saveFt} disabled={ftSaving}>
          {ftSaving ? 'Saving…' : 'Save Free Tier Settings'}
        </button>
      </Section>

      {/* ── Pricing ── */}
      <Section title="Pricing (shown on pricing page)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 4 }}>
          <Field label="Student monthly price ($)">
            <input
              style={inputStyle}
              type="number"
              min={0}
              value={pr.student_monthly ?? ''}
              onChange={e => setPr(p => ({ ...p, student_monthly: e.target.value === '' ? '' : Number(e.target.value) }))}
              placeholder="7"
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
