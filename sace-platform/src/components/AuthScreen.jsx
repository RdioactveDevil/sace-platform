import { useState } from 'react'
import { signIn, signUp } from '../lib/db'

export default function AuthScreen({ onAuth, theme, onToggleTheme }) {
  const [mode, setMode]       = useState('signin') // signin | signup
  const [email, setEmail]     = useState('')
  const [pass, setPass]       = useState('')
  const [name, setName]       = useState('')
  const [school, setSchool]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const submit = async () => {
    setError('')
    setLoading(true)
    try {
      if (mode === 'signin') {
        await signIn(email, pass)
      } else {
        if (!name.trim()) throw new Error('Please enter your name.')
        await signUp(email, pass, name, school)
      }
      onAuth()
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const inp = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    background: '#0c1525', border: '1px solid #1e293b',
    color: '#e2e8f0', fontSize: 14, outline: 'none',
    fontFamily: "'Syne', sans-serif", boxSizing: 'border-box',
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#070c16', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
      fontFamily: "'Syne', sans-serif",
      backgroundImage: 'radial-gradient(ellipse at 30% 20%, rgba(20,184,166,0.07) 0%, transparent 55%)',
    }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        input::placeholder { color: #334155; }
        input:focus { border-color: #14b8a6 !important; }
      `}</style>

      <div style={{
        width: '100%', maxWidth: 400,
        background: 'rgba(12,21,37,0.97)', borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.07)',
        padding: '36px 32px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        animation: 'fadeUp 0.5s ease',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, #14b8a6, #0ea5e9)',
            fontSize: 22, marginBottom: 14,
            boxShadow: '0 8px 24px rgba(20,184,166,0.3)',
          }}>⚗️</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>
            SACE<span style={{ color: '#14b8a6' }}>IQ</span>
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#475569' }}>
            Adaptive practice for SACE Stage 2
          </p>
        </div>

        {/* Toggle */}
        <div style={{
          display: 'flex', background: '#0a1020', borderRadius: 10,
          padding: 4, marginBottom: 24, gap: 4,
        }}>
          {['signin', 'signup'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError('') }} style={{
              flex: 1, padding: '9px', borderRadius: 8, border: 'none',
              background: mode === m ? '#14b8a6' : 'transparent',
              color: mode === m ? '#fff' : '#475569',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              transition: 'all 0.2s', fontFamily: "'Syne', sans-serif",
            }}>
              {m === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mode === 'signup' && (
            <>
              <input style={inp} placeholder="Your name" value={name}
                onChange={e => setName(e.target.value)} />
              <input style={inp} placeholder="School (optional)" value={school}
                onChange={e => setSchool(e.target.value)} />
            </>
          )}
          <input style={inp} placeholder="Email address" type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
          <input style={inp} placeholder="Password" type="password" value={pass}
            onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
            fontSize: 13, color: '#f87171',
          }}>{error}</div>
        )}

        <button onClick={submit} disabled={loading} style={{
          width: '100%', marginTop: 16, padding: '14px',
          borderRadius: 12, border: 'none',
          background: loading ? '#1e293b' : 'linear-gradient(135deg, #14b8a6, #0ea5e9)',
          color: loading ? '#475569' : '#fff',
          fontSize: 15, fontWeight: 800, cursor: loading ? 'default' : 'pointer',
          fontFamily: "'Syne', sans-serif",
          boxShadow: loading ? 'none' : '0 8px 24px rgba(20,184,166,0.25)',
          transition: 'all 0.2s',
        }}>
          {loading ? 'Loading…' : mode === 'signin' ? 'Sign In →' : 'Create Account →'}
        </button>

        {mode === 'signup' && (
          <p style={{ margin: '14px 0 0', fontSize: 12, color: '#334155', textAlign: 'center' }}>
            Free during beta · No credit card needed
          </p>
        )}
      </div>
    </div>
  )
}
