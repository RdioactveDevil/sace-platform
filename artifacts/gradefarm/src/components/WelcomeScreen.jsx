import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { claimGuestCheckout, WELCOME_PASSWORD_FLAG } from '../lib/db'

const GOLD   = '#f1be43'
const NAVYD  = '#080d28'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

const TRIES = 8

/**
 * /welcome?session_id=… — back from a pay-first checkout (/start). Makes sure
 * the account is set up, then signs a brand-new buyer straight in to choose a
 * password (onboarding follows). An email that already had an account signs
 * in as usual; the subject is waiting there.
 */
export default function WelcomeScreen({ signedIn }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const sessionId = params.get('session_id') || ''
  const [state, setState] = useState({ status: 'working' }) // working | existing | emailed | error
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (!sessionId.startsWith('cs_')) { setState({ status: 'error' }); return }
    let cancelled = false
    const attempt = async (n) => {
      try {
        const result = await claimGuestCheckout(sessionId)
        if (cancelled) return
        if (result.status === 'pending') {
          if (n < TRIES) setTimeout(() => attempt(n + 1), 1500 * n)
          else setState({ status: 'error' })
          return
        }
        if (result.signInUrl) {
          try { sessionStorage.setItem(WELCOME_PASSWORD_FLAG, '1') } catch { /* private mode: plain wording */ }
          window.location.assign(result.signInUrl)
          return
        }
        setState({ status: result.newAccount ? 'emailed' : 'existing', email: result.email })
      } catch {
        if (cancelled) return
        if (n < TRIES) setTimeout(() => attempt(n + 1), 1500 * n)
        else setState({ status: 'error' })
      }
    }
    attempt(1)
    return () => { cancelled = true }
  }, [sessionId])

  const btn = { width: '100%', padding: 14, borderRadius: 12, border: 'none', background: GOLD, color: NAVYD, fontSize: 15, fontWeight: 900, fontFamily: FONT_B, cursor: 'pointer', marginTop: 8 }
  const { status, email } = state
  return (
    <div style={{ minHeight: '100vh', background: NAVYD, color: '#f1f5f9', fontFamily: FONT_B, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ fontFamily: FONT_D, fontSize: 22, letterSpacing: 1, marginBottom: 28 }}>
          <span style={{ color: '#f1f5f9' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
        </div>
        {status === 'working' && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 10px' }}>Payment received. Setting up your account…</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>This takes a few seconds.</p>
          </>
        )}
        {status === 'existing' && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 10px' }}>You're all set</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 18px' }}>
              {email} already has a gradefarm. account, so we've added your subject to it. Sign in to start practising.
            </p>
            <button type="button" style={btn} onClick={() => navigate(signedIn ? '/subject-picker' : '/auth')}>{signedIn ? 'Go to my subjects →' : 'Sign in →'}</button>
          </>
        )}
        {status === 'emailed' && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 10px' }}>Your account is ready</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 18px' }}>
              We've emailed {email} a link to set your password. Can't find it? Use "Forgot password" on the sign-in page with that email.
            </p>
            <button type="button" style={btn} onClick={() => navigate('/auth')}>Go to sign in →</button>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 10px' }}>Almost there</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 18px' }}>
              If you paid, your account is still being set up. We'll email you a link to set your password; if nothing arrives in a few minutes, contact Titanium Tutoring.
            </p>
            <button type="button" style={btn} onClick={() => navigate('/auth')}>Go to sign in →</button>
          </>
        )}
      </div>
    </div>
  )
}
