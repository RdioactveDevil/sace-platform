import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updatePassword, WELCOME_PASSWORD_FLAG } from '../lib/db'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const NAVYD  = '#080d28'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const inp = {
  width: '100%', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.09)', color: '#f1f5f9', fontSize: 14, outline: 'none',
  fontFamily: FONT_B, boxSizing: 'border-box',
}

/**
 * Where the password-reset email lands. Supabase signs the user in from the
 * link (a recovery session), so all that's left is choosing the new password.
 */
export default function ResetPasswordScreen({ signedIn }) {
  const navigate = useNavigate()
  const [pass, setPass]       = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState(false)
  // Signed in from /welcome after paying: a first password, not a reset.
  const [welcome] = useState(() => {
    try { return sessionStorage.getItem(WELCOME_PASSWORD_FLAG) === '1' } catch { return false }
  })

  const submit = async (e) => {
    e.preventDefault()
    if (loading) return
    setError('')
    if (pass.length < 6) { setError('Use at least 6 characters.'); return }
    if (pass !== confirm) { setError("The two passwords don't match."); return }
    setLoading(true)
    try {
      await updatePassword(pass)
      try { sessionStorage.removeItem(WELCOME_PASSWORD_FLAG) } catch { /* nothing to clear */ }
      setDone(true)
    } catch (err) {
      setError(err.message || 'Could not update your password.')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0c18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: FONT_B }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ fontFamily: FONT_D, fontSize: 22, letterSpacing: 1, textAlign: 'center', marginBottom: 28 }}>
          <span style={{ color: '#f1f5f9' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
        </div>

        {!signedIn ? (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', margin: '0 0 8px' }}>This link has expired</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: '0 0 24px' }}>
              Password reset links work once and only for a short time. Request a new one from the sign-in page.
            </p>
            <button type="button" onClick={() => navigate('/auth', { replace: true })} style={primaryBtn(false)}>Go to sign in →</button>
          </>
        ) : done ? (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', margin: '0 0 8px' }}>{welcome ? "You're all set" : 'Password updated'}</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: '0 0 24px' }}>{welcome ? 'Next, a few quick questions to set up your practice.' : "You're signed in with your new password."}</p>
            <button type="button" onClick={() => navigate('/home', { replace: true })} style={primaryBtn(false)}>Continue →</button>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', margin: '0 0 4px' }}>{welcome ? 'Payment received. Choose a password' : 'Choose a new password'}</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: '0 0 24px' }}>{welcome ? 'You’ll use it to sign in next time. At least 6 characters.' : 'At least 6 characters.'}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input style={inp} type="password" placeholder="New password" aria-label="New password" autoComplete="new-password" value={pass} onChange={e => setPass(e.target.value)} />
              <input style={inp} type="password" placeholder="Confirm new password" aria-label="Confirm new password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            </div>
            {error && (
              <div role="alert" style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 8, fontSize: 13, color: '#f87171' }}>{error}</div>
            )}
            <button type="submit" disabled={loading} style={{ ...primaryBtn(loading), marginTop: 16 }}>
              {loading ? 'Saving…' : 'Save new password →'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function primaryBtn(busy) {
  return {
    width: '100%', padding: 14, borderRadius: 12, border: 'none', fontFamily: FONT_B, fontSize: 15, fontWeight: 800,
    background: busy ? 'rgba(255,255,255,0.05)' : `linear-gradient(135deg,${GOLD},${GOLDL})`,
    color: busy ? '#475569' : NAVYD, cursor: busy ? 'default' : 'pointer',
  }
}
