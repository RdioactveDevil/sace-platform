import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updatePassword } from '../lib/db'
import { THEMES } from '../lib/theme'
import { AuthLayout, Field, PasswordInput, Note, authBtn } from './AuthLayout'

/**
 * Where the password-reset email lands. Supabase signs the user in from the
 * link (a recovery session), so all that's left is choosing the new password.
 */
export default function ResetPasswordScreen({ signedIn, theme = 'dark', onToggleTheme }) {
  const t = THEMES[theme]
  const navigate = useNavigate()
  const [pass, setPass]       = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (loading) return
    setError('')
    if (pass.length < 6) { setError('Use at least 6 characters.'); return }
    if (pass !== confirm) { setError("The two passwords don't match."); return }
    setLoading(true)
    try {
      await updatePassword(pass)
      setDone(true)
    } catch (err) {
      setError(err.message || "We couldn't update your password. Try again.")
    }
    setLoading(false)
  }

  const heading = (text) => <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: t.text }}>{text}</h1>
  const para = (text) => <p style={{ margin: '6px 0 18px', fontSize: 14, color: t.textMuted, lineHeight: 1.6 }}>{text}</p>

  return (
    <AuthLayout theme={theme} onToggleTheme={onToggleTheme} onLogoClick={() => navigate('/home')}>
      <div className="af-in" style={{ width: '100%', maxWidth: 400, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: 'clamp(20px, 5vw, 28px)', boxSizing: 'border-box' }}>
        {!signedIn ? (
          <>
            {heading('This link has expired')}
            {para('Password reset links work once, and only for a short time. Ask for a new one from the sign-in page.')}
            <button type="button" className="af-btn" onClick={() => navigate('/auth', { replace: true })} style={authBtn(t, 'primary', { full: true })}>Go to sign in</button>
          </>
        ) : done ? (
          <>
            {heading('Password updated')}
            {para("You're signed in with your new password.")}
            <button type="button" className="af-btn" onClick={() => navigate('/home', { replace: true })} style={authBtn(t, 'primary', { full: true })}>Continue</button>
          </>
        ) : (
          <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>{heading('Choose a new password')}</div>
            <Field id="reset-pass" label="New password" hint="At least 6 characters." theme={theme}>
              <PasswordInput id="reset-pass" theme={theme} value={pass} onChange={e => setPass(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field id="reset-confirm" label="Type it again" theme={theme}>
              <PasswordInput id="reset-confirm" theme={theme} value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
            {error && <Note tone="danger" theme={theme}>{error}</Note>}
            <button type="submit" className="af-btn" disabled={loading} style={authBtn(t, 'primary', { disabled: loading, full: true })}>
              {loading ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  )
}
