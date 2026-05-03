import { useState } from 'react'
import { signIn, signUp } from '../lib/db'

const GOLD  = '#f1be43'
const GOLDL = '#f9d87a'
const NAVY  = '#0c1037'
const NAVYD = '#080d28'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const TRUST_ITEMS = [
  { icon: '⚡', label: 'Adaptive algorithm learns your weak spots' },
  { icon: '🎓', label: 'Titan AI explains using your own class notes' },
  { icon: '📊', label: 'Real-time exam readiness score after every session' },
  { icon: '🏆', label: 'XP, streaks & leaderboards built in' },
]

export default function AuthScreen({ onAuth, onBack, theme, onToggleTheme }) {
  const [mode, setMode]       = useState('signin')
  const [email, setEmail]     = useState('')
  const [pass, setPass]       = useState('')
  const [name, setName]       = useState('')
  const [school, setSchool]   = useState('')
  const [applyTutor, setApplyTutor] = useState(false)
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
        await signUp(email, pass, name, school, applyTutor)
        onAuth(true)
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0c18', display: 'flex', fontFamily: FONT_B, position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes authGlow { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
        .auth-inp { width:100%; padding:12px 14px; border-radius:10px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.09); color:#f1f5f9; font-size:14px; outline:none; font-family:${FONT_B}; box-sizing:border-box; transition:border-color 0.2s, background 0.2s; }
        .auth-inp::placeholder { color:#334155; }
        .auth-inp:focus { border-color:${GOLD} !important; background:rgba(241,190,67,0.03) !important; }
        .auth-inp:hover { border-color:rgba(255,255,255,0.16); }
        .auth-left { display:flex; flex-direction:column; justify-content:center; padding:48px 56px; }
        @media(max-width:820px) { .auth-left { display:none !important; } .auth-right { padding:24px 20px !important; } .auth-mobile-logo { display:block !important; } }
      `}</style>

      <div style={{ position:'absolute', top:'10%', left:'30%', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle,rgba(241,190,67,0.07) 0%,transparent 65%)', animation:'authGlow 8s ease-in-out infinite', pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'5%', right:'10%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle,rgba(167,139,250,0.05) 0%,transparent 65%)', animation:'authGlow 10s ease-in-out infinite 3s', pointerEvents:'none' }} />

      {onBack && (
        <button onClick={onBack} style={{ position:'fixed', top:20, left:24, background:'transparent', border:'1px solid rgba(255,255,255,0.08)', color:'#64748b', fontSize:13, cursor:'pointer', fontFamily:FONT_B, display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, transition:'all 0.2s', zIndex:10 }}
          onMouseEnter={e => { e.currentTarget.style.color='#e2e8f0'; e.currentTarget.style.borderColor='rgba(255,255,255,0.2)' }}
          onMouseLeave={e => { e.currentTarget.style.color='#64748b'; e.currentTarget.style.borderColor='rgba(255,255,255,0.08)' }}
        >← Back to home</button>
      )}

      <div className="auth-left" style={{ flex:1, background:'linear-gradient(135deg,#080d28 0%,#06091f 100%)', borderRight:'1px solid rgba(255,255,255,0.06)', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(241,190,67,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(241,190,67,0.04) 1px,transparent 1px)', backgroundSize:'48px 48px', pointerEvents:'none' }} />
        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ marginBottom:48 }}>
            <div style={{ fontFamily:FONT_D, fontSize:22, letterSpacing:1.5, marginBottom:6 }}>
              <span style={{ color:'#fff' }}>grade</span><span style={{ color:GOLD }}>farm.</span>
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', letterSpacing:'0.06em', textTransform:'uppercase' }}>by Titanium Tutoring</div>
          </div>

          <div style={{ marginBottom:48 }}>
            <h2 style={{ fontFamily:FONT_D, fontSize:32, color:'#fff', margin:'0 0 12px', lineHeight:1.15, letterSpacing:1 }}>
              STUDY SMARTER.<br />
              <span style={{ color:GOLD }}>SCORE HIGHER.</span>
            </h2>
            <p style={{ fontSize:14, color:'rgba(255,255,255,0.45)', lineHeight:1.7, margin:0, maxWidth:340 }}>
              The adaptive study platform built for SACE students who want results — not more hours grinding.
            </p>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {TRUST_ITEMS.map((item, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:'rgba(241,190,67,0.10)', border:'1px solid rgba(241,190,67,0.18)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>{item.icon}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.55)', lineHeight:1.5 }}>{item.label}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop:56, display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ display:'flex' }}>
              {['A','K','S','M'].map((l,i) => (
                <div key={i} style={{ width:28, height:28, borderRadius:'50%', background:`linear-gradient(135deg,${GOLD},${GOLDL})`, border:'2px solid #080d28', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:NAVYD, marginLeft: i > 0 ? -8 : 0 }}>{l}</div>
              ))}
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#f1f5f9' }}>Joined by SACE students</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>Free during beta</div>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-right" style={{ flex:'0 0 440px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 40px', position:'relative', zIndex:1 }}>
        <div style={{ width:'100%', maxWidth:360, animation:'fadeUp 0.45s ease' }}>
          <div style={{ textAlign:'center', marginBottom:28, display:'none' }} className="auth-mobile-logo">
            <div style={{ fontFamily:FONT_D, fontSize:22, letterSpacing:1 }}>
              <span style={{ color:'#f1f5f9' }}>grade</span><span style={{ color:GOLD }}>farm.</span>
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:4 }}>by Titanium Tutoring</div>
          </div>

          <h2 style={{ fontSize:22, fontWeight:800, color:'#f1f5f9', margin:'0 0 4px', letterSpacing:'-0.02em' }}>
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)', margin:'0 0 28px' }}>
            {mode === 'signin' ? 'Sign in to continue your study sessions.' : 'Free during beta. No credit card required.'}
          </p>

          <div style={{ display:'flex', background:'rgba(255,255,255,0.04)', borderRadius:10, padding:4, marginBottom:24, gap:4 }}>
            {['signin', 'signup'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError('') }}
                style={{ flex:1, padding:'9px', borderRadius:8, border:'none', background: mode === m ? `linear-gradient(135deg,${GOLD},${GOLDL})` : 'transparent', color: mode === m ? NAVYD : 'rgba(255,255,255,0.4)', fontSize:13, fontWeight:800, cursor:'pointer', transition:'all 0.2s', fontFamily:FONT_B }}>
                {m === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {mode === 'signup' && (
              <>
                <input className="auth-inp" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
                <input className="auth-inp" placeholder="School (optional)" value={school} onChange={e => setSchool(e.target.value)} />
              </>
            )}
            <input className="auth-inp" placeholder="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
            <input className="auth-inp" placeholder="Password" type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
            {mode === 'signup' && (
              <label style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px', borderRadius:10, background:'rgba(241,190,67,0.05)', border:'1px solid rgba(241,190,67,0.16)', cursor:'pointer', fontSize:13, color:'#cbd5e1' }}>
                <input type="checkbox" checked={applyTutor} onChange={e => setApplyTutor(e.target.checked)} style={{ marginTop:2, accentColor:GOLD, cursor:'pointer' }} />
                <span>
                  <strong style={{ color:'#f1f5f9' }}>Sign up as a tutor</strong>
                  <span style={{ display:'block', marginTop:2, fontSize:11, color:'#94a3b8' }}>
                    Your tutor access will be activated after admin approval. You can use the app as a student in the meantime.
                  </span>
                </span>
              </label>
            )}
          </div>

          {error && (
            <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.28)', borderRadius:8, fontSize:13, color:'#f87171' }}>{error}</div>
          )}

          <button onClick={submit} disabled={loading}
            style={{ width:'100%', marginTop:16, padding:'14px', borderRadius:12, border:'none', background: loading ? 'rgba(255,255,255,0.05)' : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: loading ? '#475569' : NAVYD, fontSize:15, fontWeight:800, cursor: loading ? 'default' : 'pointer', fontFamily:FONT_B, boxShadow: loading ? 'none' : `0 6px 22px rgba(241,190,67,0.30)`, transition:'all 0.2s', letterSpacing:'-0.01em' }}>
            {loading ? 'Loading…' : mode === 'signin' ? 'Sign In →' : 'Create Account →'}
          </button>

          {mode === 'signup' && (
            <p style={{ margin:'14px 0 0', fontSize:12, color:'rgba(255,255,255,0.2)', textAlign:'center' }}>Free during beta · No credit card needed</p>
          )}
        </div>
      </div>
    </div>
  )
}
