import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signUpAsTutorAccount, sendTutorApplication } from '../lib/db'
import { THEMES } from '../lib/theme'
import { AuthLayout, Field, PasswordInput, Note, authBtn, linkStyle, choiceChip } from './AuthLayout'

const XP_YEARS = [0, 1, 2, 3, 5, 8, 10, 15]
const xpLabel = (y) => (y === 0 ? 'Under 1' : `${y}+`)

/**
 * Applying to tutor: an account (name, email, password), then about their
 * tutoring. Sending it creates the account and the application; the team
 * reviews it. If the account needs its email confirmed first, the details
 * are kept with the account and sent at their first sign-in (tutor onboarding).
 */
export default function TutorSignupScreen({ theme = 'dark', onToggleTheme }) {
  const t = THEMES[theme]
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [org, setOrg] = useState('')
  const [phone, setPhone] = useState('')
  const [subjects, setSubjects] = useState('')
  const [years, setYears] = useState(null)
  const [qualifications, setQualifications] = useState('')
  const [bio, setBio] = useState('')

  const accountError = () => {
    if (!name.trim()) return 'Enter your full name.'
    if (!email.trim()) return 'Enter your email address.'
    if (pass.length < 8) return 'Use at least 8 characters for your password.'
    return ''
  }
  const tutoringError = () => {
    if (!org.trim()) return 'Enter your organisation or business name.'
    if (!phone.trim()) return 'Enter a phone number we can reach you on.'
    if (!subjects.trim()) return 'List the subjects and year levels you teach.'
    if (years == null) return 'Choose how many years you have been teaching or tutoring.'
    if (!qualifications.trim()) return 'Add your qualifications.'
    return ''
  }

  const toTutoring = (e) => {
    e.preventDefault()
    const msg = accountError()
    setError(msg)
    if (!msg) setStep(1)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (loading) return
    const msg = tutoringError()
    setError(msg)
    if (msg) return
    setLoading(true)
    const application = {
      display_name: name.trim(),
      school: org.trim(),
      tutor_organization: org.trim(),
      tutor_phone: phone.trim(),
      tutor_subjects_offered: subjects.trim(),
      tutor_qualifications: qualifications.trim(),
      tutor_experience_years: years,
      tutor_bio: bio.trim() || null,
    }
    try {
      const data = await signUpAsTutorAccount(email.trim(), pass, name.trim(), application)
      const uid = data?.session?.user?.id
      if (!uid) {
        // Email confirmation is on: the application goes at their first sign-in.
        setSentTo(email.trim())
        setLoading(false)
        return
      }
      await sendTutorApplication(uid, application)
      window.location.assign('/onboarding/tutor')
    } catch (err) {
      setError(err.message || "That didn't go through. Try again.")
      setLoading(false)
    }
  }

  const card = { width: '100%', maxWidth: 480, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: 'clamp(20px, 5vw, 28px)', boxSizing: 'border-box' }
  const heading = { margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: t.text }
  const sub = { margin: '4px 0 0', fontSize: 13.5, color: t.textMuted, lineHeight: 1.55 }
  const quietLink = { ...linkStyle(t), fontWeight: 600, textDecorationColor: t.border, color: t.textMuted }

  return (
    <AuthLayout theme={theme} onToggleTheme={onToggleTheme} onLogoClick={() => navigate('/home')}
      right={<button type="button" className="af-link" onClick={() => navigate('/auth', { state: { mode: 'signup' } })} style={quietLink}>Student sign-up</button>}>

      {sentTo ? (
        <div className="af-in" style={card}>
          <h1 style={heading}>Check your email</h1>
          <p style={{ ...sub, margin: '8px 0 18px', fontSize: 14 }}>
            We've sent a confirmation link to <strong style={{ color: t.text }}>{sentTo}</strong>. Open it, then sign in, and your application goes to our team.
          </p>
          <button type="button" className="af-btn" onClick={() => navigate('/auth')} style={authBtn(t, 'primary', { full: true })}>Go to sign in</button>
        </div>
      ) : (
        <div key={step} className="af-in" style={card}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: t.textFaint, marginBottom: 6 }}>Step {step + 1} of 2</div>
          <h1 style={heading}>{step === 0 ? 'Apply to tutor on Gradefarm' : 'About your tutoring'}</h1>
          <p style={sub}>
            {step === 0
              ? 'We review every application. While you wait, you can practise from the question bank.'
              : 'We use these details to review your application.'}
          </p>

          {step === 0 ? (
            <form onSubmit={toTutoring} onChange={() => error && setError('')} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
              <Field id="ts-name" label="Full name" theme={theme}>
                <input id="ts-name" className="af-inp" autoComplete="name" value={name} onChange={e => setName(e.target.value)} />
              </Field>
              <Field id="ts-email" label="Email" theme={theme}>
                <input id="ts-email" className="af-inp" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} />
              </Field>
              <Field id="ts-pass" label="Password" hint="At least 8 characters." theme={theme}>
                <PasswordInput id="ts-pass" theme={theme} value={pass} onChange={e => setPass(e.target.value)} autoComplete="new-password" />
              </Field>
              {error && <Note tone="danger" theme={theme}>{error}</Note>}
              <button type="submit" className="af-btn" style={authBtn(t, 'primary', { full: true })}>Continue</button>
              <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: t.textMuted }}>
                Have an account? <button type="button" className="af-link" onClick={() => navigate('/auth')} style={linkStyle(t)}>Sign in</button>
              </p>
            </form>
          ) : (
            <form onSubmit={submit} onChange={() => error && setError('')} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
              <Field id="ts-org" label="Organisation or business name" theme={theme}>
                <input id="ts-org" className="af-inp" autoComplete="organization" value={org} onChange={e => setOrg(e.target.value)} />
              </Field>
              <Field id="ts-phone" label="Phone" theme={theme}>
                <input id="ts-phone" className="af-inp" type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} />
              </Field>
              <Field id="ts-subjects" label="Subjects and year levels you teach" hint="For example: SACE Chemistry Stage 1 and 2, Year 10 Maths." theme={theme}>
                <textarea id="ts-subjects" className="af-inp" rows={2} value={subjects} onChange={e => setSubjects(e.target.value)} style={{ resize: 'vertical', lineHeight: 1.5 }} />
              </Field>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span id="ts-years" style={{ fontSize: 13, fontWeight: 700, color: t.textSub }}>Years teaching or tutoring</span>
                <div role="radiogroup" aria-labelledby="ts-years" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {XP_YEARS.map(y => (
                    <button key={y} type="button" role="radio" aria-checked={years === y} aria-label={y === 0 ? 'Under 1 year' : `${y} or more years`} className="af-chip" onClick={() => { setYears(y); setError('') }} style={{ ...choiceChip(t, years === y), padding: '7px 11px' }}>{xpLabel(y)}</button>
                  ))}
                </div>
              </div>
              <Field id="ts-quals" label="Qualifications" hint="Degrees, teacher registration, relevant certificates." theme={theme}>
                <textarea id="ts-quals" className="af-inp" rows={2} value={qualifications} onChange={e => setQualifications(e.target.value)} style={{ resize: 'vertical', lineHeight: 1.5 }} />
              </Field>
              <Field id="ts-bio" label="How you work with students" optional theme={theme}>
                <textarea id="ts-bio" className="af-inp" rows={2} value={bio} onChange={e => setBio(e.target.value)} style={{ resize: 'vertical', lineHeight: 1.5 }} />
              </Field>
              {error && <Note tone="danger" theme={theme}>{error}</Note>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" className="af-link" onClick={() => { setError(''); setStep(0) }} disabled={loading} style={{ ...quietLink, fontSize: 13.5 }}>Back</button>
                <button type="submit" className="af-btn" disabled={loading} style={{ ...authBtn(t, 'primary', { disabled: loading }), marginLeft: 'auto' }}>
                  {loading ? 'Sending…' : 'Send application'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </AuthLayout>
  )
}
