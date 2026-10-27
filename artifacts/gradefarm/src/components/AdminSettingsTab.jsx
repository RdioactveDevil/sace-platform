import { useState, useEffect } from 'react'
import { getPlatformSettings, setPlatformSetting } from '../lib/db'
import { DEFAULT_STUDENT_TIERS, DEFAULT_MONTHLY_TIERS } from '../lib/pricing'

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
const DEFAULT_PRICING   = { student_tiers: DEFAULT_STUDENT_TIERS, student_monthly_tiers: DEFAULT_MONTHLY_TIERS, free_daily_questions: 20, free_daily_ai_messages: 10, student_trial_days: 7, tutor_plans: [
  { name: 'Starter', price: 29, students: 10, subjects: 1, subject_swaps: false, recordings: false, parent_reports: false },
  { name: 'Pro', price: 59, students: 25, subjects: 3, subject_swaps: true, recordings: true, parent_reports: true },
  { name: 'Agency', price: 99, students: 999, subjects: 999, subject_swaps: true, recordings: true, parent_reports: true },
], annual_discount: 0.15 }

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
    const val = ['price', 'students', 'subjects'].includes(field) ? (raw === '' ? '' : Number(raw)) : raw
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
      {/* ── Student access ── */}
      <Section title="Student access">
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
          Every student can pick one free subject (limited questions per day). Paid subjects are one Stripe plan per
          student, billed weekly or monthly (their choice), cheaper for each extra subject (prices below). Subjects unlocked during the beta stay free. To
          give a student a subject for free, grant it from <strong>Students</strong>; removing a paid subject there takes
          it off their plan. Tutors and admins can use every subject.
        </div>
      </Section>

      {/* ── Pricing ── */}
      <Section title="Pricing (shown on pricing page)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 4 }}>
          {[['student_tiers', 'week'], ['student_monthly_tiers', 'month']].flatMap(([key, unit]) =>
            ['1st subject', '2nd subject', '3rd+ subjects (each)'].map((label, i) => (
              <Field key={`${key}-${i}`} label={`${label} ($/${unit}, AUD)`} hint={i === 0 ? `New ${unit}ly plans use these prices` : undefined}>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  step={0.5}
                  value={(pr[key] || DEFAULT_PRICING[key])[i] ?? ''}
                  onChange={e => setPr(p => {
                    const next = [...(p[key] || DEFAULT_PRICING[key])]
                    next[i] = e.target.value === '' ? '' : Number(e.target.value)
                    return { ...p, [key]: next }
                  })}
                  placeholder={String(DEFAULT_PRICING[key][i])}
                />
              </Field>
            )))}
          <Field label="Free tier: Titan AI messages per day" hint="Students with no paid subject">
            <input
              style={inputStyle}
              type="number"
              min={0}
              value={pr.free_daily_ai_messages ?? ''}
              onChange={e => setPr(p => ({ ...p, free_daily_ai_messages: e.target.value === '' ? '' : Number(e.target.value) }))}
              placeholder="10"
            />
          </Field>
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
          <Field label="Free trial: days on a student's first paid subject" hint="Card required; 0 turns trials off">
            <input
              style={inputStyle}
              type="number"
              min={0}
              max={90}
              value={pr.student_trial_days ?? ''}
              onChange={e => setPr(p => ({ ...p, student_trial_days: e.target.value === '' ? '' : Number(e.target.value) }))}
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

        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, marginTop: 4 }}>Tutor Plans</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 12, lineHeight: 1.5 }}>
          Tutors need one of these to use the tutor portal, billed monthly or yearly (annual discount above). A plan
          caps students on the roster plus pending invites and the subjects a tutor can tutor in (999 means
          unlimited), and says whether they can record lessons and send weekly parent reports. Tutors already
          subscribed keep the price, limits and features they signed up with until they change plan. Don't rename a
          plan while tutors are on it.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 4 }}>
          {(pr.tutor_plans || []).map((plan, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Field label={`${plan.name || `Plan ${idx + 1}`}: price`} hint="$/month">
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  value={plan.price ?? ''}
                  onChange={e => updateTutorPlan(idx, 'price', e.target.value)}
                  placeholder="0"
                />
              </Field>
              {[['students', 'Students'], ['subjects', 'Subjects']].map(([field, label]) => (
                <Field key={field} label={label} hint="999 = unlimited">
                  <input
                    style={inputStyle}
                    type="number"
                    min={1}
                    value={plan[field] ?? ''}
                    onChange={e => updateTutorPlan(idx, field, e.target.value)}
                    placeholder="999"
                  />
                </Field>
              ))}
              {[['subject_swaps', 'Tutors can swap subjects'], ['recordings', 'Lesson recordings'], ['parent_reports', 'Weekly parent reports']].map(([field, label]) => (
                <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.65)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={plan[field] !== false} onChange={e => updateTutorPlan(idx, field, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
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
