import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Check, RotateCcw } from 'lucide-react'
import { signIn, signUp, sendPasswordReset, signInWithProvider } from '../lib/db'
import { enabledProviders, rememberParentSignup } from '../lib/oauth'
import { THEMES } from '../lib/theme'
import { AuthLayout, Field, PasswordInput, Note, authBtn, linkStyle, FONT_B } from './AuthLayout'
import CalmBackground from './CalmBackground'

// Which of Google and Apple to offer (lib/oauth.js): set once each is switched on in Supabase.
const PROVIDERS = enabledProviders(import.meta.env?.VITE_OAUTH_PROVIDERS)

// Grades drifting slowly behind the headline: [text, where, size px, tilt deg, seconds, delay s].
const FLOATERS = [
  ['A+', { top: -78, left: -18 }, 68, -10, 19, 0],
  ['100%', { top: 18, right: -6 }, 40, 6, 23, -6],
  ['95%', { bottom: -54, left: '38%' }, 46, -4, 21, -11],
  ['A', { bottom: -92, right: '4%' }, 76, 8, 25, -3],
]

// What GradeFarm does for a student, beside the form (wide screens; below it on a phone).
const HELPS = [
  { Icon: Search, title: 'Find your weak spots before your test does' },
  { Icon: Check, title: 'See where every mark goes' },
  { Icon: RotateCcw, title: 'Turn a wrong answer into a right one' },
]

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function AppleMark({ color }) {
  return (
    <svg aria-hidden="true" width="15" height="18" viewBox="0 0 814 1000">
      <path fill={color} d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  )
}

/**
 * Sign in, create an account (as a student or for a child), or reset a
 * password: what GradeFarm does on one side, the form in a card on the other,
 * on the same calm background as onboarding. Google and Apple sit above the
 * email form when they're switched on (lib/oauth.js).
 */
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
  const [leaving, setLeaving] = useState(null) // the provider we're heading to
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

  const withProvider = async (provider) => {
    if (leaving) return
    setError(''); setNotice(''); setLeaving(provider.id)
    rememberParentSignup(mode === 'signup' && asParent)
    try {
      await signInWithProvider(provider.id) // the page leaves for Google or Apple
    } catch (e) {
      setError(e?.message || `We couldn't reach ${provider.label}. Try again, or use your email.`)
      setLeaving(null)
    }
  }

  const title = mode === 'signin' ? 'Welcome back' : mode === 'reset' ? 'Reset your password' : asParent ? "Set up your child's account" : 'Create your account'
  const subtitle = invite?.invitedBy && mode !== 'reset'
    ? `${mode === 'signin' ? 'Sign in' : 'Create an account'} to accept ${invite.invitedBy}'s invite.`
    : mode === 'reset' ? "We'll email you a link to choose a new one."
    : mode === 'signup' && asParent ? "You sign in with your email, and we send you their progress each week. Their first subject is free."
    : mode === 'signup' ? 'Your first subject is free.'
    : 'Sign in to pick up where you left off.'
  const emailLabel = mode === 'signup' && asParent ? 'Your email' : 'Email'
  const submitLabel = loading
    ? (mode === 'signin' ? 'Signing in…' : mode === 'reset' ? 'Sending…' : 'Creating your account…')
    : (mode === 'signin' ? 'Sign in' : mode === 'reset' ? 'Send reset link' : 'Create account')
  // Google and Apple: not for a password reset, nor an invite (which must land on the invited email).
  const providers = mode !== 'reset' && !invite ? PROVIDERS : []
  const dark = theme === 'dark'

  return (
    <AuthLayout theme={theme} onToggleTheme={onToggleTheme} onLogoClick={onBack} backdrop={<CalmBackground theme={theme} />}
      right={onBack && <button type="button" className="af-link" onClick={onBack} style={{ ...linkStyle(t), fontWeight: 600, textDecorationColor: t.border, color: t.textMuted }}>Back to home</button>}>
      <style>{`
        .au-wrap { width: 100%; max-width: 1040px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: clamp(32px, 6vw, 88px); }
        .au-why { position: relative; flex: 1 1 380px; max-width: 500px; display: flex; flex-direction: column; gap: 28px; }
        .au-why > :not(.au-float) { position: relative; z-index: 1; }
        .au-float { position: absolute; z-index: 0; pointer-events: none; user-select: none; font-weight: 800; letter-spacing: -0.03em; line-height: 1;
          color: ${t.goldText}; opacity: ${theme === 'dark' ? 0.14 : 0.2}; transform: rotate(var(--r)); animation: auFloat var(--d) ease-in-out var(--delay) infinite; }
        @keyframes auFloat {
          0%, 100% { transform: translate(0, 0) rotate(var(--r)); }
          50% { transform: translate(8px, -16px) rotate(calc(var(--r) + 4deg)); }
        }
        @media (prefers-reduced-motion: reduce) { .au-float { animation: none; } }
        .au-card { flex: 0 1 410px; }
        .au-sso { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 46px; border-radius: 10px; font-family: ${FONT_B}; font-size: 14px; font-weight: 700; cursor: pointer; }
        .au-sso:disabled { opacity: 0.6; cursor: default; }
        @media (max-width: 860px) { .au-why { order: 2; gap: 18px; } .au-why h2 { font-size: 24px !important; } .au-float { display: none; } }
      `}</style>
      <div className="au-wrap">
        <section className="au-why af-in" aria-label="What GradeFarm does">
          {FLOATERS.map(([text, at, size, tilt, secs, delay]) => (
            <span key={text} className="au-float" aria-hidden="true"
              style={{ ...at, fontSize: size, '--r': `${tilt}deg`, '--d': `${secs}s`, '--delay': `${delay}s` }}>{text}</span>
          ))}
          <h2 style={{ margin: 0, fontSize: 'clamp(30px, 3.6vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, color: t.text, textWrap: 'balance' }}>
            Study like you&rsquo;ve already seen the exam<span style={{ color: t.goldText }}>.</span>
          </h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {HELPS.map(({ Icon, title: head }) => (
              <li key={head} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: t.bgCard, border: `1px solid ${dark ? t.border : '#efe4c6'}`, display: 'grid', placeItems: 'center', flexShrink: 0, color: t.goldText }}>
                  <Icon size={19} strokeWidth={2.2} />
                </span>
                <b style={{ fontSize: 16, color: t.text }}>{head}</b>
              </li>
            ))}
          </ul>
        </section>

        <div className="au-card af-in" style={{ width: '100%', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 18, padding: 'clamp(20px, 5vw, 28px)', boxSizing: 'border-box', boxShadow: dark ? 'none' : '0 20px 50px rgba(12,16,55,0.10)' }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: t.text, textAlign: 'center' }}>{title}</h1>
          {subtitle && <p style={{ margin: '6px 0 0', fontSize: 14, color: t.textMuted, lineHeight: 1.55, textAlign: 'center' }}>{subtitle}</p>}

          <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
            {mode === 'signup' && !invite && (
              <div role="radiogroup" aria-label="Who is this account for?" style={{ display: 'flex', padding: 3, gap: 3, borderRadius: 10, background: t.bgSubtle }}>
                {[[false, 'For me'], [true, 'For my child']].map(([v, label]) => (
                  <button key={label} type="button" role="radio" aria-checked={asParent === v} className="af-btn" onClick={() => { setAsParent(v); setError('') }}
                    style={{ flex: 1, minHeight: 38, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: FONT_B, fontSize: 13, fontWeight: 700, border: 'none',
                      background: asParent === v ? t.bgCard : 'transparent', color: asParent === v ? t.text : t.textMuted, boxShadow: asParent === v ? `0 0 0 1px ${t.border}` : 'none' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {providers.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${providers.length}, minmax(0, 1fr))`, gap: 10 }}>
                  {providers.map(p => (
                    <button key={p.id} type="button" className="af-btn au-sso" onClick={() => withProvider(p)} disabled={!!leaving}
                      aria-label={`${mode === 'signup' ? 'Sign up' : 'Sign in'} with ${p.label}`}
                      style={p.id === 'apple'
                        ? { border: `1px solid ${dark ? '#ffffff' : '#000000'}`, background: dark ? '#ffffff' : '#000000', color: dark ? '#000000' : '#ffffff' }
                        : { border: `1px solid ${dark ? t.border : '#dadce0'}`, background: dark ? t.bgCard : '#ffffff', color: dark ? t.text : '#1f1f1f' }}>
                      {p.id === 'google' ? <GoogleMark /> : <AppleMark color={dark ? '#000000' : '#ffffff'} />}
                      {leaving === p.id ? 'Opening…' : p.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5, color: t.textMuted }}>
                  <span style={{ flex: 1, height: 1, background: t.border }} />or with email<span style={{ flex: 1, height: 1, background: t.border }} />
                </div>
              </>
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

            <button type="submit" className="af-btn" disabled={loading} style={{ ...authBtn(t, 'primary', { disabled: loading, full: true }), minHeight: 46, fontSize: 15 }}>{submitLabel}</button>
          </form>

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', fontSize: 13.5, color: t.textMuted, textAlign: 'center' }}>
            {mode === 'signin' && <span>New here? <button type="button" className="af-link" onClick={() => switchMode('signup')} style={linkStyle(t)}>Create an account</button></span>}
            {mode === 'signup' && <span>Have an account? <button type="button" className="af-link" onClick={() => switchMode('signin')} style={linkStyle(t)}>Sign in</button></span>}
            {mode === 'reset' && <button type="button" className="af-link" onClick={() => switchMode('signin')} style={linkStyle(t)}>Back to sign in</button>}
            {mode === 'signup' && !asParent && !invite && (
              <span>Tutoring with us? <button type="button" className="af-link" onClick={() => navigate('/auth/tutor')} style={linkStyle(t)}>Apply as a tutor</button></span>
            )}
          </div>
        </div>
      </div>
    </AuthLayout>
  )
}
