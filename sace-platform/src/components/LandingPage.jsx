import { useState, useEffect, useRef } from 'react'

// ─── ANIMATED COUNTER ────────────────────────────────────────────────────────
function Counter({ target, suffix = '', duration = 2000 }) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  const started = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true
        const start = Date.now()
        const tick = () => {
          const elapsed = Date.now() - start
          const progress = Math.min(elapsed / duration, 1)
          const ease = 1 - Math.pow(1 - progress, 3)
          setCount(Math.round(ease * target))
          if (progress < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.5 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [target, duration])

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>
}

// ─── FLOATING CARD (demo quiz UI) ────────────────────────────────────────────
function DemoCard() {
  const [selected, setSelected] = useState(null)
  const [showAns, setShowAns] = useState(false)

  const handleSelect = (i) => {
    if (showAns) return
    setSelected(i)
    setShowAns(true)
  }

  const opts = ['Butanoic acid', 'Propanoic acid', 'Pentanoic acid', 'Ethanoic acid']
  const correct = 0

  return (
    <div style={{
      background: 'rgba(12,21,37,0.95)', borderRadius: 18,
      border: '1px solid rgba(20,184,166,0.2)',
      padding: '24px', width: '100%', maxWidth: 420,
      boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(20,184,166,0.1)',
      backdropFilter: 'blur(20px)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 11, background: 'rgba(20,184,166,0.15)', border: '1px solid rgba(20,184,166,0.3)', padding: '3px 10px', borderRadius: 20, color: '#14b8a6', fontWeight: 700 }}>Organic Chemistry</span>
          <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', padding: '3px 10px', borderRadius: 20, color: '#475569' }}>★★☆☆☆</span>
        </div>
        <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700, background: 'rgba(239,68,68,0.1)', padding: '3px 9px', borderRadius: 20, border: '1px solid rgba(239,68,68,0.2)' }}>⚡ Priority</span>
      </div>

      <div style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', lineHeight: 1.7, marginBottom: 18 }}>
        What is the IUPAC name for CH₃CH₂CH₂COOH?
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {opts.map((opt, i) => {
          let bg = 'rgba(255,255,255,0.03)', border = '1px solid rgba(255,255,255,0.08)', color = '#94a3b8'
          if (showAns) {
            if (i === correct) { bg = 'rgba(16,185,129,0.08)'; border = '1px solid #10b981'; color = '#4ade80' }
            else if (i === selected) { bg = 'rgba(239,68,68,0.08)'; border = '1px solid #ef4444'; color = '#f87171' }
            else { color = '#334155' }
          } else if (selected === i) {
            bg = 'rgba(20,184,166,0.08)'; border = '1px solid #14b8a6'; color = '#5eead4'
          }
          return (
            <button key={i} onClick={() => handleSelect(i)} style={{ background: bg, border, color, padding: '11px 14px', borderRadius: 9, fontSize: 13, textAlign: 'left', cursor: showAns ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s' }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {showAns && i === correct ? '✓' : showAns && i === selected ? '✗' : String.fromCharCode(65+i)}
              </span>
              {opt}
            </button>
          )
        })}
      </div>

      {showAns && (
        <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: '#4ade80', fontWeight: 700, marginBottom: 4 }}>✓ Correct! +24 XP</div>
          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>4 carbons including the carboxyl carbon = butanoic acid. Count ALL carbons including the one in –COOH.</div>
        </div>
      )}
    </div>
  )
}

// ─── MAIN LANDING PAGE ────────────────────────────────────────────────────────
export default function LandingPage({ onGetStarted, onSignIn }) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const accent  = '#14b8a6'
  const accentB = '#0ea5e9'

  return (
    <div style={{ minHeight: '100vh', background: '#070c16', color: '#e2e8f0', fontFamily: "'Plus Jakarta Sans', sans-serif", overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes fadeUp    { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
        @keyframes float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes glow      { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
        @keyframes slideIn   { from{transform:translateX(-100%)} to{transform:translateX(0)} }
        .nav-link { color: #64748b; font-size: 14px; font-weight: 500; text-decoration: none; transition: color 0.2s; cursor: pointer; background: none; border: none; font-family: inherit; }
        .nav-link:hover { color: #e2e8f0; }
        .feature-card { transition: transform 0.2s, box-shadow 0.2s; }
        .feature-card:hover { transform: translateY(-4px); box-shadow: 0 24px 60px rgba(0,0,0,0.4) !important; }
        .cta-btn { transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s; }
        .cta-btn:hover { transform: translateY(-2px); opacity: 0.92; }
        .subject-pill:hover { border-color: #14b8a6 !important; color: #14b8a6 !important; }
        * { box-sizing: border-box; }
      `}</style>

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: '0 32px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrolled ? 'rgba(7,12,22,0.95)' : 'transparent',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        transition: 'all 0.3s ease',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg,${accent},${accentB})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>⚗️</div>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9' }}>SACE<span style={{ color: accent }}>IQ</span></span>
          <span style={{ fontSize: 10, color: '#334155', marginLeft: 2 }}>by Titanium Tutoring</span>
        </div>

        {/* Desktop nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }} className="desktop-nav">
          <button className="nav-link" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>Features</button>
          <button className="nav-link" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>How it works</button>
          <button className="nav-link" onClick={() => document.getElementById('subjects')?.scrollIntoView({ behavior: 'smooth' })}>Subjects</button>
          <button className="nav-link" onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}>Pricing</button>
        </div>

        {/* Auth buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onSignIn} className="nav-link" style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>Sign in</button>
          <button onClick={onGetStarted} className="cta-btn" style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg,${accent},${accentB})`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 4px 16px ${accent}40` }}>
            Get started free
          </button>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '100px 32px 60px', position: 'relative', overflow: 'hidden' }}>

        {/* Background glow */}
        <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, ${accent}18 0%, transparent 70%)`, animation: 'glow 4s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '10%', right: '10%', width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle, ${accentB}10 0%, transparent 70%)`, animation: 'glow 6s ease-in-out infinite 2s', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1100, width: '100%', display: 'flex', alignItems: 'center', gap: 60, position: 'relative', zIndex: 1 }}>

          {/* Left — copy */}
          <div style={{ flex: 1, animation: 'fadeUp 0.6s ease' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.25)', borderRadius: 20, padding: '6px 14px', marginBottom: 24 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} />
              <span style={{ fontSize: 12, color: accent, fontWeight: 600 }}>Built for SACE Stage 1 & 2</span>
            </div>

            <h1 style={{ fontSize: 'clamp(36px, 5vw, 58px)', fontWeight: 800, lineHeight: 1.1, margin: '0 0 20px', color: '#f1f5f9' }}>
              The study platform that{' '}
              <span style={{ background: `linear-gradient(135deg,${accent},${accentB})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                actually adapts
              </span>{' '}
              to you.
            </h1>

            <p style={{ fontSize: 18, color: '#64748b', lineHeight: 1.7, margin: '0 0 32px', maxWidth: 480 }}>
              SACE IQ learns what you struggle with and keeps drilling you until you don't. Backed by Titanium Tutoring. Free to start.
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={onGetStarted} className="cta-btn" style={{ padding: '14px 28px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${accent},${accentB})`, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 8px 28px ${accent}40` }}>
                Start for free →
              </button>
              <button onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })} className="cta-btn" style={{ padding: '14px 28px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                See how it works
              </button>
            </div>

            {/* Social proof */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 32, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex' }}>
                {['A','J','M','S','P'].map((l,i) => (
                  <div key={i} style={{ width: 32, height: 32, borderRadius: '50%', background: `hsl(${i*40+160},60%,40%)`, border: '2px solid #070c16', marginLeft: i > 0 ? -10 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>{l}</div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Join students already using SACE IQ</div>
                <div style={{ fontSize: 12, color: '#475569' }}>Free during beta · No credit card needed</div>
              </div>
            </div>
          </div>

          {/* Right — demo card */}
          <div style={{ flexShrink: 0, animation: 'fadeUp 0.8s ease 0.2s both', display: 'flex', justifyContent: 'center' }}>
            <div style={{ animation: 'float 6s ease-in-out infinite' }}>
              <DemoCard />
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────────────────── */}
      <section style={{ padding: '0 32px 80px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 2 }}>
          {[
            { val: 65, suffix: '+', label: 'SACE questions', sub: 'Stage 1 & 2 Chemistry' },
            { val: 100, suffix: '%', label: 'Adaptive', sub: 'Targets your exact weaknesses' },
            { val: 0, suffix: '$', label: 'Cost to start', sub: 'Free during beta' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '32px 20px', background: i === 1 ? 'rgba(20,184,166,0.06)' : 'rgba(255,255,255,0.02)', borderRadius: i === 0 ? '14px 0 0 14px' : i === 2 ? '0 14px 14px 0' : 0, border: `1px solid ${i === 1 ? 'rgba(20,184,166,0.15)' : 'rgba(255,255,255,0.05)'}` }}>
              <div style={{ fontSize: 42, fontWeight: 800, color: i === 1 ? accent : '#f1f5f9', lineHeight: 1 }}>
                <Counter target={s.val} suffix={s.suffix} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginTop: 6 }}>{s.label}</div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: '80px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11, color: accent, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>Why SACE IQ</div>
            <h2 style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 800, margin: 0, color: '#f1f5f9' }}>Not just another study app.</h2>
            <p style={{ fontSize: 16, color: '#64748b', marginTop: 12, maxWidth: 500, margin: '12px auto 0' }}>Most apps give you the same questions every time. SACE IQ watches what you get wrong and comes back for it.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {[
              {
                icon: '🎯',
                color: '#14b8a6',
                title: 'Adaptive by design',
                desc: 'Every session is different. The algorithm tracks your error rate per topic and difficulty, always serving you questions where you need it most.',
              },
              {
                icon: '🎓',
                color: '#6366f1',
                title: 'Learn with Titan',
                desc: 'Our AI tutor explains concepts using real-world analogies — sport, gaming, everyday life. Teaches from your actual class notes, not generic content.',
              },
              {
                icon: '⚡',
                color: '#f59e0b',
                title: 'XP & leaderboards',
                desc: 'Earn XP for every correct answer. Streak multipliers, rank progression, and weekly leaderboards make studying feel less like studying.',
              },
              {
                icon: '📊',
                color: '#10b981',
                title: 'Know your gaps',
                desc: 'After every session, see exactly which topics need work and a personalised study plan to fix them. No guessing what to revise.',
              },
              {
                icon: '📄',
                color: '#ec4899',
                title: 'Your notes, your tutor',
                desc: 'Upload your teacher\'s slides or notes. Titan reads them and teaches you from your exact school content — not some textbook you\'ve never seen.',
              },
              {
                icon: '🏫',
                color: '#0ea5e9',
                title: 'Backed by Titanium Tutoring',
                desc: 'Questions written and reviewed by real SACE tutors. Not AI-generated guesswork — actual exam-relevant content aligned to the SACE curriculum.',
              },
            ].map(f => (
              <div key={f.title} className="feature-card" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '28px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${f.color}20`, border: `1px solid ${f.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>{f.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>{f.title}</div>
                <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section id="how" style={{ padding: '80px 32px', background: 'rgba(255,255,255,0.015)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11, color: accent, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>How it works</div>
            <h2 style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 800, margin: 0, color: '#f1f5f9' }}>Simple. Effective. Yours.</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { num: '01', title: 'Sign up free', desc: 'Create an account in 30 seconds. No credit card, no commitment. Pick your subject and stage.', icon: '✍️' },
              { num: '02', title: 'Do a session', desc: 'Answer adaptive questions. The algorithm starts learning what you know and what you don\'t from your very first question.', icon: '⚡' },
              { num: '03', title: 'Get taught by Titan', desc: 'Struggling with a topic? Switch to Learn mode. Titan explains it using sport analogies, checks your understanding, and adjusts in real time.', icon: '🎓' },
              { num: '04', title: 'Watch the gaps close', desc: 'Your struggle profile updates after every session. The Priority Queue shows exactly what to fix next. Your progress is visible, measurable, real.', icon: '📈' },
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 24, padding: '32px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none', alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 14, background: `linear-gradient(135deg,${accent}20,${accentB}10)`, border: `1px solid ${accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{step.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: accent, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4 }}>{step.num}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>{step.title}</div>
                  <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65 }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SUBJECTS ─────────────────────────────────────────────────────────── */}
      <section id="subjects" style={{ padding: '80px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: accent, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>Subjects</div>
          <h2 style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 800, margin: '0 0 12px', color: '#f1f5f9' }}>Starting with Chemistry.</h2>
          <p style={{ fontSize: 16, color: '#64748b', marginBottom: 40, maxWidth: 480, margin: '0 auto 40px' }}>More subjects dropping soon. Stage 1 and Stage 2 covered.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {[
              { name: 'Chemistry', stage: 'Stage 1 & 2', icon: '⚗️', color: '#14b8a6', available: true, count: '65 questions' },
              { name: 'Mathematical Methods', stage: 'Stage 2', icon: '∫', color: '#6366f1', available: false },
              { name: 'Physics', stage: 'Stage 2', icon: '⚛️', color: '#f59e0b', available: false },
              { name: 'Biology', stage: 'Stage 2', icon: '🧬', color: '#10b981', available: false },
              { name: 'English Literary Studies', stage: 'Stage 2', icon: '📖', color: '#ec4899', available: false },
              { name: 'Economics', stage: 'Stage 2', icon: '📈', color: '#0ea5e9', available: false },
            ].map(s => (
              <div key={s.name} className="subject-pill" style={{ padding: '20px 16px', borderRadius: 14, border: `1px solid ${s.available ? s.color + '40' : 'rgba(255,255,255,0.06)'}`, background: s.available ? `${s.color}08` : 'rgba(255,255,255,0.02)', textAlign: 'center', opacity: s.available ? 1 : 0.5, cursor: s.available ? 'pointer' : 'default', transition: 'all 0.15s' }}
                onClick={s.available ? onGetStarted : undefined}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: s.available ? '#f1f5f9' : '#475569', marginBottom: 3 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: s.available ? s.color : '#334155' }}>{s.available ? s.count : s.stage + ' · Coming soon'}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ padding: '80px 32px', background: 'rgba(255,255,255,0.015)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: accent, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>Pricing</div>
          <h2 style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 800, margin: '0 0 12px', color: '#f1f5f9' }}>Free while we're in beta.</h2>
          <p style={{ fontSize: 16, color: '#64748b', marginBottom: 48, maxWidth: 420, margin: '0 auto 48px' }}>Everything is free right now. Pricing comes later — beta users get locked in at the lowest rate forever.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, maxWidth: 700, margin: '0 auto' }}>
            {[
              {
                name: 'Beta',
                price: 'Free',
                sub: 'While in beta',
                highlight: true,
                features: ['All subjects (Chemistry now)', 'Unlimited quiz sessions', 'Learn with Titan', 'Struggle tracking', 'Leaderboard', 'Priority beta pricing later'],
              },
              {
                name: 'Coming Soon',
                price: '$12',
                sub: '/month after beta',
                highlight: false,
                features: ['Everything in Beta', 'All SACE subjects', 'Parent dashboard', 'School assignments', 'Exam countdown', 'Priority support'],
              },
            ].map(plan => (
              <div key={plan.name} style={{ background: plan.highlight ? `linear-gradient(135deg,${accent}15,${accentB}08)` : 'rgba(255,255,255,0.02)', border: `1px solid ${plan.highlight ? accent + '40' : 'rgba(255,255,255,0.06)'}`, borderRadius: 18, padding: '32px 28px', textAlign: 'left', position: 'relative' }}>
                {plan.highlight && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: `linear-gradient(135deg,${accent},${accentB})`, color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 20 }}>AVAILABLE NOW</div>}
                <div style={{ fontSize: 14, fontWeight: 700, color: plan.highlight ? accent : '#64748b', marginBottom: 4 }}>{plan.name}</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#f1f5f9', marginBottom: 2 }}>{plan.price}</div>
                <div style={{ fontSize: 13, color: '#475569', marginBottom: 24 }}>{plan.sub}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#94a3b8' }}>
                      <span style={{ color: plan.highlight ? accent : '#334155', fontSize: 14 }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                {plan.highlight && (
                  <button onClick={onGetStarted} className="cta-btn" style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg,${accent},${accentB})`, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 6px 20px ${accent}40` }}>
                    Get started free →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section style={{ padding: '80px 32px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🧪</div>
          <h2 style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 800, margin: '0 0 16px', color: '#f1f5f9', lineHeight: 1.2 }}>
            "It's okay. SACE IQ will save me at home."
          </h2>
          <p style={{ fontSize: 16, color: '#64748b', marginBottom: 32, lineHeight: 1.7 }}>
            If you didn't get it in class, that's fine. Titan explains it a different way. The quiz finds exactly what you're missing. Your ATAR doesn't have to depend on how good your teacher is at explaining things.
          </p>
          <button onClick={onGetStarted} className="cta-btn" style={{ padding: '16px 36px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${accent},${accentB})`, color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 10px 36px ${accent}40` }}>
            Start for free →
          </button>
          <div style={{ marginTop: 16, fontSize: 12, color: '#334155' }}>No credit card · No commitment · Beta is free</div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg,${accent},${accentB})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>⚗️</div>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>SACE<span style={{ color: accent }}>IQ</span></span>
          <span style={{ fontSize: 11, color: '#334155' }}>by Titanium Tutoring</span>
        </div>
        <div style={{ fontSize: 12, color: '#334155' }}>© 2025 Titanium Tutoring · Adelaide, SA · Built for SACE students</div>
      </footer>

      {/* Mobile responsive overrides */}
      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
        }
        @media (max-width: 900px) {
          section > div { flex-direction: column !important; }
        }
      `}</style>
    </div>
  )
}
