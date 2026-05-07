import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  signUpAsTutorAccount,
  applyForTutor,
  saveSubscriptions,
  completeOnboarding,
} from '../lib/db'
import { supabase } from '../lib/supabase'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const NAVYD = '#080d28'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const XP_YEARS = [0, 1, 2, 3, 5, 8, 10, 15]

export default function TutorSignupScreen() {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [org, setOrg] = useState('')
  const [phone, setPhone] = useState('')
  const [subjects, setSubjects] = useState('')
  const [years, setYears] = useState(null)
  const [qualifications, setQualifications] = useState('')
  const [bio, setBio] = useState('')
  const [terms, setTerms] = useState(false)

  const next = () => {
    setError('')
    setStep(s => s + 1)
  }
  const back = () => {
    setError('')
    setStep(s => Math.max(0, s - 1))
  }

  const validateStep0 = () => {
    if (!name.trim()) return 'Please enter your full name.'
    if (!email.trim()) return 'Please enter your email.'
    if (pass.length < 8) return 'Password must be at least 8 characters.'
    return ''
  }

  const validateStep1 = () => {
    if (!org.trim()) return 'Please enter your organisation or tutoring business name.'
    if (!phone.trim()) return 'Please enter a contact phone number.'
    if (!subjects.trim()) return 'Please list the subjects or year levels you support.'
    if (years == null) return 'Please select your years of teaching or tutoring experience.'
    if (!qualifications.trim()) return 'Please summarise your qualifications or credentials.'
    return ''
  }

  const onContinue0 = () => {
    const e = validateStep0()
    if (e) {
      setError(e)
      return
    }
    next()
  }

  const onContinue1 = () => {
    const e = validateStep1()
    if (e) {
      setError(e)
      return
    }
    next()
  }

  const submit = async () => {
    if (!terms) {
      setError('Please accept the Terms and Privacy Policy to continue.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await signUpAsTutorAccount(email.trim(), pass, name.trim())
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) {
        throw new Error(
          'Account created. If your project uses email confirmation, open the link we sent you, sign in, then contact support or use Sign In to finish — your tutor application may still be pending.'
        )
      }
      const uid = session.user.id
      await applyForTutor()
      await saveSubscriptions(uid, [])
      await completeOnboarding(uid, {
        display_name: name.trim(),
        school: org.trim(),
        tutor_organization: org.trim(),
        tutor_phone: phone.trim(),
        tutor_subjects_offered: subjects.trim(),
        tutor_qualifications: qualifications.trim(),
        tutor_experience_years: years,
        tutor_bio: bio.trim() || null,
      })
      // Full navigation so App refetches profile (onboarding + tutor fields) before /tutorial
      window.location.assign('/tutorial')
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    }
    setLoading(false)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0c18',
        display: 'flex',
        fontFamily: FONT_B,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        .ts-inp { width:100%; padding:12px 14px; border-radius:10px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.09); color:#f1f5f9; font-size:14px; outline:none; font-family:${FONT_B}; box-sizing:border-box; transition:border-color 0.2s, background 0.2s; }
        .ts-inp::placeholder { color:#334155; }
        .ts-inp:focus { border-color:${GOLD} !important; background:rgba(241,190,67,0.03) !important; }
        .ts-inp:hover { border-color:rgba(255,255,255,0.16); }
        @media(max-width:820px){ .ts-left{display:none!important} .ts-wrap{padding:24px 18px!important} }
      `}</style>

      <div
        style={{
          position: 'absolute',
          top: '10%',
          left: '25%',
          width: 520,
          height: 520,
          borderRadius: '50%',
          background: 'radial-gradient(circle,rgba(241,190,67,0.06) 0%,transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      <Link
          to="/auth"
          style={{
            position: 'fixed',
            top: 20,
            left: 24,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#64748b',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: FONT_B,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 8,
            textDecoration: 'none',
            zIndex: 10,
          }}
        >
          ← Student sign up
      </Link>

      <div
        className="ts-left"
        style={{
          flex: 1,
          background: 'linear-gradient(135deg,#080d28 0%,#06091f 100%)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '48px 52px',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(241,190,67,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(241,190,67,0.035) 1px,transparent 1px)',
            backgroundSize: '40px 40px',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: FONT_D, fontSize: 22, letterSpacing: 1.5, marginBottom: 36 }}>
            <span style={{ color: '#fff' }}>grade</span>
            <span style={{ color: GOLD }}>farm.</span>
          </div>
          <h2
            style={{
              fontFamily: FONT_D,
              fontSize: 28,
              color: '#fff',
              margin: '0 0 14px',
              lineHeight: 1.2,
              letterSpacing: 0.5,
            }}
          >
            JOIN AS A<br />
            <span style={{ color: GOLD }}>TUTOR OR EDUCATOR.</span>
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.48)', lineHeight: 1.75, margin: 0, maxWidth: 360 }}>
            This path is for teachers and tutors who want the Tutor Dashboard — roster, classes, and assignments. We review
            every application. You can still practise from the question bank while you wait.
          </p>
          <ul
            style={{
              margin: '28px 0 0',
              paddingLeft: 18,
              color: 'rgba(255,255,255,0.52)',
              fontSize: 13,
              lineHeight: 1.85,
            }}
          >
            <li>Different questions than the student sign-up flow</li>
            <li>Professional and contact details we share with admins only</li>
            <li>Same account — Titan and the bank work for you too</li>
          </ul>
        </div>
      </div>

      <div
        className="ts-wrap"
        style={{
          flex: '0 0 460px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '44px 36px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ width: '100%', maxWidth: 400, animation: 'fadeUp 0.4s ease' }}>
          <div style={{ marginBottom: 10, fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', fontWeight: 700 }}>
            STEP {step + 1} OF 3 — TUTOR APPLICATION
          </div>
          <h2 style={{ fontSize: 21, fontWeight: 800, color: '#f1f5f9', margin: '0 0 6px' }}>
            {step === 0 && 'Account'}
            {step === 1 && 'Your practice'}
            {step === 2 && 'Review & submit'}
          </h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', margin: '0 0 22px', lineHeight: 1.55 }}>
            {step === 0 && 'Create login credentials. You will use these to sign in after approval.'}
            {step === 1 && 'Tell us about your teaching so we can review your application.'}
            {step === 2 && 'Confirm details and accept terms to send your application.'}
          </p>

          <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 99,
                  background: step >= i ? `linear-gradient(90deg,${GOLD},${GOLDL})` : 'rgba(255,255,255,0.08)',
                }}
              />
            ))}
          </div>

          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input className="ts-inp" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
              <input
                className="ts-inp"
                placeholder="Email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
              <input
                className="ts-inp"
                placeholder="Password (min 8 characters)"
                type="password"
                value={pass}
                onChange={e => setPass(e.target.value)}
              />
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input className="ts-inp" placeholder="Organisation / business name" value={org} onChange={e => setOrg(e.target.value)} />
              <input className="ts-inp" placeholder="Phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
              <textarea
                className="ts-inp"
                placeholder="Subjects & stages you teach (e.g. SACE Chemistry Stage 1–2, Year 10 Maths)"
                value={subjects}
                onChange={e => setSubjects(e.target.value)}
                rows={3}
                style={{ resize: 'vertical', minHeight: 72, lineHeight: 1.5 }}
              />
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>
                  Years of teaching / tutoring experience
                </label>
                <select
                  className="ts-inp"
                  value={years ?? ''}
                  onChange={e => setYears(e.target.value === '' ? null : Number(e.target.value))}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="" style={{ background: NAVYD }}>
                    Select…
                  </option>
                  {XP_YEARS.map(y => (
                    <option key={y} value={y} style={{ background: NAVYD }}>
                      {y === 0 ? 'Less than 1 year' : `${y}+ years`}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                className="ts-inp"
                placeholder="Qualifications (degrees, registrations, relevant certifications)"
                value={qualifications}
                onChange={e => setQualifications(e.target.value)}
                rows={3}
                style={{ resize: 'vertical', minHeight: 72, lineHeight: 1.5 }}
              />
              <textarea
                className="ts-inp"
                placeholder="Short bio (optional — how you work with students)"
                value={bio}
                onChange={e => setBio(e.target.value)}
                rows={2}
                style={{ resize: 'vertical', minHeight: 52, lineHeight: 1.5 }}
              />
            </div>
          )}

          {step === 2 && (
            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: '14px 16px',
                fontSize: 13,
                color: '#94a3b8',
                lineHeight: 1.65,
                marginBottom: 14,
              }}
            >
              <div>
                <strong style={{ color: '#e2e8f0' }}>{name}</strong> · {email}
              </div>
              <div style={{ marginTop: 10 }}>{org}</div>
              <div style={{ marginTop: 8 }}>{phone}</div>
              <div style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{subjects}</div>
              <div style={{ marginTop: 8 }}>
                Experience: {years == null ? '—' : years === 0 ? '< 1 year' : `${years}+ years`}
              </div>
              <div style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{qualifications}</div>
              {bio.trim() && <div style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{bio}</div>}
            </div>
          )}

          {step === 2 && (
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(241,190,67,0.05)',
                border: '1px solid rgba(241,190,67,0.16)',
                cursor: 'pointer',
                fontSize: 13,
                color: '#cbd5e1',
                marginBottom: 8,
              }}
            >
              <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} style={{ marginTop: 2, accentColor: GOLD }} />
              <span>
                I agree to the{' '}
                <button
                  type="button"
                  onClick={() => window.open('/terms', '_blank')}
                  style={{ background: 'none', border: 'none', padding: 0, color: GOLD, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_B }}
                >
                  Terms
                </button>{' '}
                and{' '}
                <button
                  type="button"
                  onClick={() => window.open('/privacy', '_blank')}
                  style={{ background: 'none', border: 'none', padding: 0, color: GOLD, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_B }}
                >
                  Privacy Policy
                </button>
                .
              </span>
            </label>
          )}

          {error && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.28)',
                borderRadius: 8,
                fontSize: 13,
                color: '#f87171',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '13px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent',
                  color: '#94a3b8',
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: FONT_B,
                }}
              >
                ← Back
              </button>
            )}
            {step < 2 && (
              <button
                type="button"
                onClick={step === 0 ? onContinue0 : onContinue1}
                style={{
                  flex: 2,
                  padding: '13px',
                  borderRadius: 12,
                  border: 'none',
                  background: `linear-gradient(135deg,${GOLD},${GOLDL})`,
                  color: NAVYD,
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: FONT_B,
                  boxShadow: `0 6px 22px rgba(241,190,67,0.28)`,
                }}
              >
                Continue →
              </button>
            )}
            {step === 2 && (
              <button
                type="button"
                onClick={submit}
                disabled={loading || !terms}
                style={{
                  flex: 2,
                  padding: '13px',
                  borderRadius: 12,
                  border: 'none',
                  background: loading || !terms ? 'rgba(255,255,255,0.06)' : `linear-gradient(135deg,${GOLD},${GOLDL})`,
                  color: loading || !terms ? '#475569' : NAVYD,
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: loading || !terms ? 'default' : 'pointer',
                  fontFamily: FONT_B,
                }}
              >
                {loading ? 'Submitting…' : 'Submit application →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
