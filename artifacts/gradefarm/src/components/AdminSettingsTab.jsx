import { useState, useEffect } from 'react'
import { getPlatformSettings, setPlatformSetting } from '../lib/db'
import { DEFAULT_STUDENT_TIERS, DEFAULT_MONTHLY_TIERS } from '../lib/pricing'

import { ui, btn, FONT_B } from '../lib/adminUi'

function Section({ title, sub, children }) {
  return (
    <section style={{ ...ui.card, padding: '18px 20px', marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--t-text)' }}>{title}</h2>
      {sub && <div style={{ ...ui.hint, fontSize: 13, marginTop: 4, maxWidth: 760 }}>{sub}</div>}
      <div style={{ marginTop: 16 }}>{children}</div>
    </section>
  )
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ ...ui.label, marginBottom: hint ? 2 : 6 }}>{label}</span>
      {hint && <span style={{ display: 'block', ...ui.hint, marginBottom: 6 }}>{hint}</span>}
      {children}
    </label>
  )
}

const inputStyle = { ...ui.input, width: '100%' }

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
    return <div style={{ color: 'var(--t-textMuted)', fontFamily: FONT_B, fontSize: 13 }}>Loading settings…</div>
  }

  return (
    <div style={{ fontFamily: FONT_B }}>
      {/* ── Student access ── */}
      <Section title="How students get subjects">
        <div style={{ fontSize: 13, color: 'var(--t-textSub)', lineHeight: 1.6, maxWidth: 760 }}>
          Every student can pick one free subject, with a daily question limit. Paid subjects are one Stripe plan per
          student, billed weekly or monthly (their choice), cheaper for each extra subject (prices below). Subjects unlocked during the beta stay free.
          To give a student a subject for free, open them in <strong>People</strong>; removing a paid subject there takes
          it off their plan. Tutors and admins can use every subject.
        </div>
      </Section>

      {/* ── Pricing ── */}
      <Section title="Student prices and limits" sub="Shown on the pricing page. Prices are in AUD.">
        {[['student_tiers', 'week', 'Weekly plans'], ['student_monthly_tiers', 'month', 'Monthly plans']].map(([key, unit, title]) => (
          <div key={key} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-text)', marginBottom: 8 }}>{title} <span style={{ fontWeight: 500, color: 'var(--t-textMuted)' }}>· price per {unit}. New {unit}ly plans use these.</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, maxWidth: 720 }}>
              {['1st subject', '2nd subject', '3rd+ subjects (each)'].map((label, i) => (
                <Field key={`${key}-${i}`} label={label}>
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
              ))}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-text)', marginBottom: 8 }}>Free tier, trials and discounts</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <Field label="Free tier: AI tutor messages a day" hint="Students with no paid subject">
            <input
              style={inputStyle}
              type="number"
              min={0}
              value={pr.free_daily_ai_messages ?? ''}
              onChange={e => setPr(p => ({ ...p, free_daily_ai_messages: e.target.value === '' ? '' : Number(e.target.value) }))}
              placeholder="10"
            />
          </Field>
          <Field label="Free subject: questions a day">
            <input
              style={inputStyle}
              type="number"
              min={0}
              value={pr.free_daily_questions ?? ''}
              onChange={e => setPr(p => ({ ...p, free_daily_questions: e.target.value === '' ? '' : Number(e.target.value) }))}
              placeholder="20"
            />
          </Field>
          <Field label="Free trial days on a first paid subject" hint="Card required. 0 turns trials off.">
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
          <Field label="Annual discount (%)" hint="For tutor plans paid yearly">
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

      </Section>

      <Section title="Tutor plans">
        <div style={{ ...ui.hint, fontSize: 13, marginTop: -12, marginBottom: 16, maxWidth: 760 }}>
          Tutors need one of these to use the tutor portal, billed monthly or yearly (annual discount above). A plan
          caps students on the roster plus pending invites and the subjects a tutor can tutor in (999 means
          unlimited), and says whether they can record lessons and send weekly parent reports. Tutors already
          subscribed keep the price, limits and features they signed up with until they change plan. Don't rename a
          plan while tutors are on it.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {(pr.tutor_plans || []).map((plan, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px', borderRadius: 10, border: '1px solid var(--t-border)' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t-text)' }}>{plan.name || `Plan ${idx + 1}`}</div>
              <Field label="Price per month">
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
                <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t-textSub)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={plan[field] !== false} onChange={e => updateTutorPlan(idx, field, e.target.checked)} style={{ accentColor: 'var(--t-text)' }} />
                  {label}
                </label>
              ))}
            </div>
          ))}
        </div>

      </Section>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" style={btn('primary', prSaving)} onClick={savePr} disabled={prSaving}>
          {prSaving ? 'Saving…' : 'Save prices and plans'}
        </button>
        {prMsg && <span role="status" style={{ fontSize: 13, fontWeight: 600, color: prMsg.ok ? 'var(--t-success)' : 'var(--t-danger)' }}>{prMsg.text}</span>}
      </div>
    </div>
  )
}
