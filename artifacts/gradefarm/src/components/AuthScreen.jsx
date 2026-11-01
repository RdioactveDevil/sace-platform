import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { signIn, signUp, sendPasswordReset } from '../lib/db'
import { THEMES } from '../lib/theme'
import { AuthLayout, Field, PasswordInput, Note, authBtn, linkStyle, FONT_B } from './AuthLayout'

/** Sign in, create an account (as a student or for a child), or reset a password. */
export default function AuthScreen({ onAuth, onBack, theme = 'dark', onToggleTheme }) {
  const t = THEMES[theme]
  const navigate = useNavigate()
  const location = useLocation()
  // The tutor-invite page links here with { mode, email, redirectTo, invitedBy },
  // plus { as: 'parent', childName } when the invite went to a parent.
  const invite = location.state?.invitedBy !== undefined ? location.state : null
  const [mode, setMode]       = useState(location.state?.mode === 'signup' ? 'signup' : 'signin')
  const [email, setEmail]     = useState(location.state?.email || '')
  const [pass, setPass]       = useState('')
  const [name, setName]       = useState('')
  // A parent setting up an account for their child (the Year 6 page and a
  // parent's invite link here with { as: 'parent' }): they sign in with their own email.
  const [asParent, setAsParent] = useState(location.state?.as === 'parent')
  const [childName, setChildName] = useState(location.state?.childName || '')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  // Shown instead of an error when there's nothing wrong but the user has to
  // go to their inbox (confirm sign-up, reset password).
  const [notice, setNotice]   = useState('')

  const switchMode = (m) => { setMode(m); setError(''); setNotice('') }

  const submit = async (e) => {
    e?.preventDefault()
    if (loading) return
    setError('')
    setNotice('')
    // Phone keyboards often add a trailing space after autocompleting an email.
    const addr = email.trim()
    setLoading(true)
    try {
      if (mode === 'reset') {
        if (!addr) throw new Error('Enter the email address you signed up with.')
        await sendPasswordReset(addr)
        setNotice(`If ${addr} has an account, we've emailed it a link to choose a new password.`)
      } else if (mode === 'signin') {
        if (!addr || !pass) throw new Error('Enter your email and password.')
        await signIn(addr, pass)
        onAuth(false)
      } else {
        if (!name.trim()) throw new Error('Enter your name.')
        if (asParent && !childName.trim()) throw new Error("Enter your child's first name.")
        if (!addr) throw new Error('Enter your email address.')
        if (pass.length < 6) throw new Error('Use at least 6 characters for your password.')
        const data = asParent
          ? await signUp(addr, pass, childName.trim(), '', false, invite?.redirectTo, name.trim())
          : await signUp(addr, pass, name.trim(), '', false, invite?.redirectTo)
        // With email confirmation on there is no session until the link is clicked.
        if (data?.session) onAuth(true)
        else {
          setNotice(invite
            ? `We've sent a confirmation link to ${addr}. Open it and we'll accept your invite${invite.invitedBy ? ` from ${invite.invitedBy}` : ''}.`
            : `We've sent a confirmation link to ${addr}. Open it to finish creating your account, then sign in.`)
          setMode('signin')
        }
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const title = mode === 'signin' ? 'Welcome back' : mode === 'reset' ? 'Reset your password' : asParent ? "Set up your child's account" : 'Create your account'
  const subtitle = invite?.invitedBy && mode !== 'reset'
    ? `${mode === 'signin' ? 'Sign in' : 'Create an account'} to accept ${invite.invitedBy}'s invite.`
    : mode === 'reset' ? "We'll email you a link to choose a new one."
    : mode === 'signup' ? (asParent ? "You sign in with your email, and we send you their progress each week. Their first subject is free." : 'Start with one subject free.')
    : null
  const emailLabel = mode === 'signup' && asParent ? 'Your email' : 'Email'
  const submitLabel = loading
    ? (mode === 'signin' ? 'Signing in…' : mode === 'reset' ? 'Sending…' : 'Creating your account…')
    : (mode === 'signin' ? 'Sign in' : mode === 'reset' ? 'Send reset link' : 'Create account')

  return (
    <AuthLayout theme={theme} onToggleTheme={onToggleTheme} onLogoClick={onBack}
      right={onBack && <button type="button" className="af-link" onClick={onBack} style={{ ...linkStyle(t), fontWeight: 600, textDecorationColor: t.border, color: t.textMuted }}>Back to home</button>}>
      <div className="af-in" style={{ width: '100%', maxWidth: 400, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: 'clamp(20px, 5vw, 28px)', boxSizing: 'border-box' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: t.text }}>{title}</h1>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13.5, color: t.textMuted, lineHeight: 1.55 }}>{subtitle}</p>}

        <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
          {mode === 'signup' && !invite && (
            <div role="radiogroup" aria-label="Who is this account for?" style={{ display: 'flex', padding: 3, gap: 3, borderRadius: 10, background: t.bgSubtle }}>
              {[[false, 'For me'], [true, 'For my child']].map(([v, label]) => (
                <button key={label} type="button" role="radio" aria-checked={asParent === v} className="af-btn" onClick={() => { setAsParent(v); setError('') }}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: FONT_B, fontSize: 13, fontWeight: 700, border: 'none',
                    background: asParent === v ? t.bgCard : 'transparent', color: asParent === v ? t.text : t.textMuted, boxShadow: asParent === v ? `0 0 0 1px ${t.border}` : 'none' }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {mode === 'signup' && (
            <Field id="auth-name" label="Your name" theme={theme}>
              <input id="auth-name" className="af-inp" autoComplete="name" value={name} onChange={e => setName(e.target.value)} />
            </Field>
          )}
          {mode === 'signup' && asParent && (
            <Field id="auth-child" label="Your child's first name" theme={theme}>
              <input id="auth-child" className="af-inp" autoComplete="off" value={childName} onChange={e => setChildName(e.target.value)} />
            </Field>
          )}
          <Field id="auth-email" label={emailLabel} theme={theme}>
            <input id="auth-email" className="af-inp" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} />
          </Field>
          {mode !== 'reset' && (
            <Field id="auth-pass" label="Password" hint={mode === 'signup' ? 'At least 6 characters.' : null} theme={theme}>
              <PasswordInput id="auth-pass" theme={theme} value={pass} onChange={e => setPass(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </Field>
          )}
          {mode === 'signin' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -6, fontSize: 13 }}>
              <button type="button" className="af-link" onClick={() => switchMode('reset')} style={{ ...linkStyle(t), fontWeight: 600 }}>Forgot password?</button>
            </div>
          )}

          {error && <Note tone="danger" theme={theme}>{error}</Note>}
          {notice && <Note theme={theme}>{notice}</Note>}

          <button type="submit" className="af-btn" disabled={loading} style={authBtn(t, 'primary', { disabled: loading, full: true })}>{submitLabel}</button>
        </form>

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', fontSize: 13, color: t.textMuted, textAlign: 'center' }}>
          {mode === 'signin' && <span>New here? <button type="button" className="af-link" onClick={() => switchMode('signup')} style={linkStyle(t)}>Create an account</button></span>}
          {mode === 'signup' && <span>Have an account? <button type="button" className="af-link" onClick={() => switchMode('signin')} style={linkStyle(t)}>Sign in</button></span>}
          {mode === 'reset' && <button type="button" className="af-link" onClick={() => switchMode('signin')} style={linkStyle(t)}>Back to sign in</button>}
          {mode === 'signup' && !asParent && !invite && (
            <span>Tutoring with us? <button type="button" className="af-link" onClick={() => navigate('/auth/tutor')} style={linkStyle(t)}>Apply as a tutor</button></span>
          )}
        </div>
      </div>
    </AuthLayout>
  )
}
