import { useState } from 'react'
import { signIn, signUp } from '../lib/db'

const GOLD  = '#f1be43'
const GOLDL = '#f9d87a'
const NAVY  = '#0c1037'
const NAVYD = '#080d28'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

export default function AuthScreen({ onAuth, onBack, theme, onToggleTheme }) {
  const [mode, setMode]       = useState('signin')
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
        onAuth(false)
      } else {
        if (!name.trim()) throw new Error('Please enter your name.')
        await signUp(email, pass, name, school)
        onAuth(true)
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const inp = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#f1f5f9', fontSize: 14, outline: 'none',
    fontFamily: FONT_B, boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  }

  return (
    <div style={{ minHeight: '100vh', background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: FONT_B, position: 'relative', backgroundImage: `radial-gradient(ellipse at 30% 20%, rgba(241,190,67,0.06) 0%, transparent 55%)` }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        input::placeholder { color: #334155; }
        input:focus { border-color: ${GOLD} !important; }
      `}</style>

      {onBack && (
        <button onClick={onBack} style={{ position: 'fixed', top: 20, left: 24, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: FONT_B, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, transition: 'all 0.2s', zIndex: 10 }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
        >← Back to home</button>
      )}

      <div style={{ width: '100%', maxWidth: 400, background: 'rgba(8,13,40,0.95)', borderRadius: 20, border: '1px solid rgba(241,190,67,0.15)', padding: '36px 32px', boxShadow: '0 32px 80px rgba(0,0,0,0.6)', animation: 'fadeUp 0.5s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontFamily: FONT_D, fontSize: 26, color: '#f1f5f9', letterSpacing: 1 }}>
            gradefarm<span style={{ color: GOLD }}>.</span>
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#475569' }}>by Titanium Tutoring · SACE Stage 1 & 2</p>
        </div>

        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4, marginBottom: 24, gap: 4 }}>
          {['signin', 'signup'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError('') }} style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: mode === m ? `linear-gradient(135deg,${GOLD},${GOLDL})` : 'transparent', color: mode === m ? NAVYD : '#475569', fontSize: 13, fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s', fontFamily: FONT_B }}>
              {m === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mode === 'signup' && (
            <>
              <input style={inp} placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
              <input style={inp} placeholder="School (optional)" value={school} onChange={e => setSchool(e.target.value)} />
            </>
          )}
          <input style={inp} placeholder="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
          <input style={inp} placeholder="Password" type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: '#f87171' }}>{error}</div>
        )}

        <button onClick={submit} disabled={loading} style={{ width: '100%', marginTop: 16, padding: '14px', borderRadius: 12, border: 'none', background: loading ? 'rgba(255,255,255,0.05)' : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: loading ? '#475569' : NAVYD, fontSize: 15, fontWeight: 800, cursor: loading ? 'default' : 'pointer', fontFamily: FONT_B, boxShadow: loading ? 'none' : `0 8px 24px rgba(241,190,67,0.3)`, transition: 'all 0.2s' }}>
          {loading ? 'Loading…' : mode === 'signin' ? 'Sign In →' : 'Create Account →'}
        </button>

        {mode === 'signup' && (
          <p style={{ margin: '14px 0 0', fontSize: 12, color: '#334155', textAlign: 'center' }}>Free during beta · No credit card needed</p>
        )}
      </div>
    </div>
  )
}