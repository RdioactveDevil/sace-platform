import { useState, useEffect } from 'react'
import { completeOnboarding, sendTutorApplication } from '../lib/db'
import { THEMES } from '../lib/theme'
import { AuthLayout, Note, authBtn, linkStyle } from './AuthLayout'

const NEXT_STEPS = [
  ['We review your application', 'We check the details you sent. You keep the same account the whole way through.'],
  ['While you wait', 'Practise from the question bank and try Learn with Titan, as a student would. Useful for your own prep.'],
  ['Once you\'re approved', 'Tutor Portal appears in the sidebar menu: Today, Students, Classes, Assignments, Lessons and Messages.'],
]

/**
 * Straight after tutor sign-up: what happens to their application, and the
 * terms. `pendingApplication`: details from the tutor sign-up page, kept with
 * the account when it needed its email confirmed before signing in. They're
 * sent here, on the first sign-in, unless the application has already gone.
 */
export default function TutorOnboardingScreen({ profile, userEmail, onDone, pendingApplication = null, theme = 'dark', onToggleTheme }) {
  const t = THEMES[theme]
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)

  useEffect(() => {
    const status = profile?.tutor_application_status
    if (!pendingApplication || !profile?.id || status === 'pending' || status === 'approved') return
    sendTutorApplication(profile.id, pendingApplication).catch(e => console.error('Tutor application send error:', e))
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async (e) => {
    e.preventDefault()
    if (!termsAccepted || saving) return
    setSaving(true)
    setSaveError('')
    try {
      await completeOnboarding(profile.id, {})
      onDone()
    } catch (err) {
      // Carrying on would bring them back here on their next visit.
      console.error('Tutor onboarding save error:', err)
      setSaveError("We couldn't save that. Check your connection and try again.")
      setSaving(false)
    }
  }

  const firstName = (profile?.display_name || '').trim().split(' ')[0]
  const org = profile?.tutor_organization || pendingApplication?.tutor_organization

  return (
    <AuthLayout theme={theme} onToggleTheme={onToggleTheme} align="top">
      <form className="af-in" onSubmit={finish} noValidate
        style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 18, padding: 'clamp(16px, 10vh, 100px) 0 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(24px, 5vw, 30px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.2, color: t.text, textWrap: 'balance' }}>
            Thanks{firstName ? `, ${firstName}` : ''}. Your application is with us.
          </h1>
          {(org || userEmail) && (
            <p style={{ margin: 0, fontSize: 14, color: t.textMuted }}>
              {org && <>Applying as <strong style={{ color: t.text }}>{org}</strong></>}{org && userEmail ? ' · ' : ''}{userEmail}
            </p>
          )}
        </div>

        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12 }}>
          {NEXT_STEPS.map(([title, text], i) => (
            <li key={title} style={{ display: 'flex', gap: 14, padding: '14px 16px', borderTop: i ? `1px solid ${t.border}` : 'none' }}>
              <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: '50%', border: `1px solid ${t.border}`, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, color: t.textSub, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text }}>{title}</div>
                <div style={{ fontSize: 13.5, color: t.textMuted, lineHeight: 1.55, marginTop: 2 }}>{text}</div>
              </div>
            </li>
          ))}
        </ol>

        <label htmlFor="tob-terms" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: t.textSub, lineHeight: 1.55, cursor: 'pointer' }}>
          <input id="tob-terms" type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} style={{ width: 17, height: 17, marginTop: 2, accentColor: t.text, flexShrink: 0, cursor: 'pointer' }} />
          <span>
            I agree to the <a href="/terms" target="_blank" rel="noreferrer" className="af-link" style={linkStyle(t)}>terms</a> and <a href="/privacy" target="_blank" rel="noreferrer" className="af-link" style={linkStyle(t)}>privacy policy</a>.
          </span>
        </label>

        {saveError && <Note tone="danger" theme={theme}>{saveError}</Note>}

        <div>
          <button type="submit" className="af-btn" disabled={!termsAccepted || saving} style={authBtn(t, 'primary', { disabled: !termsAccepted || saving })}>
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </form>
    </AuthLayout>
  )
}
