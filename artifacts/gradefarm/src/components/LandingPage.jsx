import { useState, useEffect, useRef } from 'react'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const NAVY   = '#0c1037'
const NAVYD  = '#080d28'
const PURPLE = '#a78bfa'
const GREEN  = '#10b981'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const MUTED  = '#94a3b8'

/* ─── helpers ─────────────────────────────────────────────────────────── */

function Counter({ target, suffix = '', duration = 2000, delay = 0 }) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  const started = useRef(false)
  useEffect(() => {
    let timerId = null
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true
        timerId = setTimeout(() => {
          const t0 = Date.now()
          const tick = () => {
            const p = Math.min((Date.now() - t0) / duration, 1)
            setCount(Math.round((1 - Math.pow(1 - p, 3)) * target))
            if (p < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }, delay)
      }
    }, { threshold: 0.5 })
    if (ref.current) obs.observe(ref.current)
    return () => { obs.disconnect(); if (timerId !== null) clearTimeout(timerId) }
  }, [target, duration, delay])
  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>
}

function useFadeUp() {
  const ref = useRef(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect() } }, { threshold: 0.08 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return { ref, visible: v }
}

function FadeUp({ children, delay = 0, style = {}, className = '' }) {
  const { ref, visible } = useFadeUp()
  return (
    <div ref={ref} className={className} style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(32px)', transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`, ...style }}>
      {children}
    </div>
  )
}

/* ─── mini UI mockups ──────────────────────────────────────────────────── */

function TopicGrid() {
  const topics = [
    { name: 'Atomic Theory', s: 91 }, { name: 'Chemical Bonds', s: 78 }, { name: 'Organic Naming', s: 45 },
    { name: 'Equilibrium', s: 19 },   { name: 'Acids & Bases', s: 67 }, { name: 'Redox Reactions', s: 34 },
    { name: 'Electrochemistry', s: 58 }, { name: 'Solutions', s: 82 },  { name: 'Kinetics', s: 23 },
  ]
  const col = s => s > 75 ? GREEN : s > 48 ? GOLD : '#ef4444'
  const bg  = s => s > 75 ? 'rgba(16,185,129,0.12)' : s > 48 ? 'rgba(241,190,67,0.12)' : 'rgba(239,68,68,0.12)'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
      {topics.map(t => (
        <div key={t.name} style={{ background: bg(t.s), border: `1px solid ${col(t.s)}33`, borderRadius: 8, padding: '8px 9px' }}>
          <div style={{ fontSize: 9, color: MUTED, marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
              <div style={{ width: `${t.s}%`, height: '100%', background: col(t.s), borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 9, fontWeight: 800, color: col(t.s) }}>{t.s}%</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function TitanChat() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ background: 'rgba(241,190,67,0.12)', border: '1px solid rgba(241,190,67,0.22)', borderRadius: '14px 14px 4px 14px', padding: '10px 14px', maxWidth: '82%' }}>
          <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.55 }}>I don't get limiting reagents at all 😭</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#a78bfa,#6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, boxShadow: '0 0 16px rgba(167,139,250,0.4)' }}>🎓</div>
        <div style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.22)', borderRadius: '4px 14px 14px 14px', padding: '10px 14px', maxWidth: '88%' }}>
          <div style={{ fontSize: 10, color: PURPLE, fontWeight: 800, letterSpacing: '0.08em', marginBottom: 6 }}>TITAN AI</div>
          <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.65 }}>Think of making burgers — 5 buns, 3 patties. You can only make <span style={{ color: GOLD, fontWeight: 700 }}>3 burgers</span>. The patties limit you. That's exactly what happens in a reaction. 🍔</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#a78bfa,#6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🎓</div>
        <div style={{ display: 'flex', gap: 5, padding: '12px 16px', background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: '4px 14px 14px 14px' }}>
          {[0,1,2].map(i => <div key={i} className={`tdot td${i}`} style={{ width: 6, height: 6, borderRadius: '50%', background: PURPLE }} />)}
        </div>
      </div>
    </div>
  )
}

function LeaderboardMini() {
  const rows = [
    { rank: '🥇', name: 'Alex K.', xp: 2450, pct: 100, you: false },
    { rank: '🥈', name: 'You',     xp: 2180, pct: 89,  you: true  },
    { rank: '🥉', name: 'Sam L.', xp: 1920, pct: 78,  you: false },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: r.you ? 'rgba(241,190,67,0.1)' : 'rgba(255,255,255,0.03)', border: r.you ? `1px solid rgba(241,190,67,0.3)` : '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 18 }}>{r.rank}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 13, fontWeight: r.you ? 800 : 500, color: r.you ? GOLD : '#e2e8f0' }}>{r.name}</span>
              <span style={{ fontSize: 11, color: MUTED }}>{r.xp.toLocaleString()} XP</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
              <div style={{ width: `${r.pct}%`, height: '100%', borderRadius: 2, background: r.you ? `linear-gradient(90deg,${GOLD},${GOLDL})` : 'rgba(255,255,255,0.18)' }} />
            </div>
          </div>
        </div>
      ))}
      <div style={{ textAlign: 'center', fontSize: 11, color: '#475569', paddingTop: 4 }}>Weekly · Chemistry Stage 2</div>
    </div>
  )
}

function GapsMini() {
  const topics = [
    { name: 'Equilibrium', pct: 19, color: '#ef4444', label: '⚡ Priority' },
    { name: 'Electrochemistry', pct: 41, color: '#f97316', label: 'Needs work' },
    { name: 'Acids & Bases', pct: 67, color: GOLD, label: 'Improving' },
    { name: 'Atomic Theory', pct: 91, color: GREEN, label: 'Strong' },
  ]
  const r = 26, C = 2 * Math.PI * r
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px', background: 'rgba(241,190,67,0.07)', border: '1px solid rgba(241,190,67,0.18)', borderRadius: 12 }}>
        <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
          <svg viewBox="0 0 64 64" style={{ width: 64, height: 64, transform: 'rotate(-90deg)' }}>
            <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
            <circle cx="32" cy="32" r={r} fill="none" stroke={GOLD} strokeWidth="8" strokeDasharray={`${C * 0.58} ${C}`} strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: GOLD }}>58%</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Exam Readiness</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>4 topics flagged</div>
          <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 700, marginTop: 4 }}>⚡ Review Equilibrium next</div>
        </div>
      </div>
      {topics.map(t => (
        <div key={t.name}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: '#e2e8f0' }}>{t.name}</span>
            <span style={{ fontSize: 10, color: t.color, fontWeight: 700 }}>{t.label}</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)' }}>
            <div style={{ width: `${t.pct}%`, height: '100%', borderRadius: 3, background: t.color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── DemoCard ─────────────────────────────────────────────────────────── */

function DemoCard() {
  const [selected, setSelected] = useState(null)
  const [showAns, setShowAns]   = useState(false)
  const opts    = ['Butanoic acid', 'Propanoic acid', 'Pentanoic acid', 'Ethanoic acid']
  const correct = 0
  const handle  = i => { if (showAns) return; setSelected(i); setShowAns(true) }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 380, height: 380, borderRadius: '50%', background: `radial-gradient(circle,rgba(241,190,67,0.32) 0%,transparent 70%)`, filter: 'blur(32px)', pointerEvents: 'none', zIndex: 0 }} />
      {/* floating badges */}
      <div style={{ position: 'absolute', top: -16, left: -20, background: 'rgba(12,16,55,0.95)', border: '1px solid rgba(241,190,67,0.3)', borderRadius: 20, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: GOLD, whiteSpace: 'nowrap', zIndex: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', animation: 'float 5s ease-in-out infinite' }}>⚡ Priority topic</div>
      <div style={{ position: 'absolute', bottom: 24, right: -24, background: 'rgba(12,16,55,0.95)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: GREEN, whiteSpace: 'nowrap', zIndex: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', animation: 'float 6s ease-in-out infinite 1s' }}>✓ Correct! +24 XP</div>
      <div style={{ position: 'absolute', top: '40%', right: -32, background: 'rgba(12,16,55,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', zIndex: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', animation: 'float 7s ease-in-out infinite 0.5s' }}>🔥 3 day streak</div>
      <div style={{ position: 'relative', zIndex: 1, background: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 40px 100px rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>Organic Chemistry</span>
          <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, background: '#fef2f2', padding: '3px 9px', borderRadius: 20 }}>⚡ Priority</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0c1037', lineHeight: 1.65, marginBottom: 16 }}>What is the IUPAC name for CH₃CH₂CH₂COOH?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {opts.map((opt, i) => {
            let bg = '#f5f6ff', border = '1px solid #e2e5f0', color = '#334155', lBg = '#e2e5f0', lC = '#0c1037'
            if (showAns) {
              if (i === correct)       { bg = '#f0fdf4'; border = '1px solid #86efac'; color = '#166534'; lBg = '#bbf7d0'; lC = '#166534' }
              else if (i === selected) { bg = '#fef2f2'; border = '1px solid #fca5a5'; color = '#991b1b'; lBg = '#fecaca'; lC = '#991b1b' }
              else                     { bg = '#fafafa'; border = '1px solid #f0f0f0'; color = '#9ca3af'; lBg = '#f0f0f0'; lC = '#9ca3af' }
            } else if (selected === i) { bg = '#fefce8'; border = `1px solid ${GOLD}`; color = '#78350f'; lBg = '#fef3c7'; lC = '#92400e' }
            return (
              <button key={i} onClick={() => handle(i)} style={{ background: bg, border, color, padding: '11px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, textAlign: 'left', cursor: showAns ? 'default' : 'pointer', fontFamily: FONT_B, display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s' }}
                onMouseEnter={e => { if (!showAns) e.currentTarget.style.borderColor = GOLD }}
                onMouseLeave={e => { if (!showAns && selected !== i) e.currentTarget.style.borderColor = '#e2e5f0' }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: lBg, color: lC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                  {showAns && i === correct ? '✓' : showAns && i === selected ? '✗' : String.fromCharCode(65+i)}
                </span>
                {opt}
              </button>
            )
          })}
        </div>
        {showAns && (
          <div style={{ marginTop: 12, padding: '12px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: '#166534', fontWeight: 700, marginBottom: 3 }}>✓ Correct! +24 XP · 🔥 Streak extended</div>
            <div style={{ fontSize: 12, color: '#4b7a5a', lineHeight: 1.6 }}>Count ALL carbons including the –COOH carbon. 4 carbons = butanoic acid.</div>
          </div>
        )}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>gradefarm. · by Titanium Tutoring</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: NAVY, background: '#fef3c7', padding: '2px 8px', borderRadius: 6 }}>🔥 3 streak</span>
        </div>
      </div>
    </div>
  )
}

/* ─── MobileMenu ───────────────────────────────────────────────────────── */

function MobileMenu({ open, onClose, onNavigate }) {
  const NAV_LINKS = [['features','Features'],['how','How It Works'],['subjects','Subjects'],['pricing','Pricing']]

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{ position:'fixed', inset:0, zIndex:98, background:'transparent' }}
        />
      )}
      <div style={{
        position: 'fixed', top: 64, left: 0, right: 0, zIndex: 99,
        background: 'rgba(8,13,40,0.98)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(241,190,67,0.15)',
        overflow: 'hidden',
        maxHeight: open ? 280 : 0,
        visibility: open ? 'visible' : 'hidden',
        transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1), visibility 0s linear ' + (open ? '0s' : '0.35s'),
      }}>
        <div style={{ padding: '12px 24px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV_LINKS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              style={{
                background: 'none', border: 'none',
                color: '#94a3b8', fontSize: 16, fontWeight: 600,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                textAlign: 'left', cursor: 'pointer',
                padding: '14px 8px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#f1f5f9' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/* ─── main component ───────────────────────────────────────────────────── */

export default function LandingPage({ onGetStarted, onSignIn }) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])
  const scroll = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  const handleMobileNav = id => { scroll(id); setMenuOpen(false) }

  return (
    <div style={{ minHeight: '100vh', background: NAVYD, color: '#f1f5f9', fontFamily: FONT_B, overflowX: 'hidden' }}>
      <style>{`
        @font-face { font-family:'Sifonn Pro'; src:url('/SIFONN_PRO.otf') format('opentype'); font-display:swap; }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes float   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes glow    { 0%,100%{opacity:0.25} 50%{opacity:0.65} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes typing  { 0%,100%{opacity:0.25;transform:scale(0.9)} 50%{opacity:1;transform:scale(1.1)} }
        @keyframes scan    { 0%{top:-40%} 100%{top:110%} }
        @keyframes pulse   { 0%,100%{box-shadow:0 0 0 3px rgba(241,190,67,0.2)} 50%{box-shadow:0 0 0 7px rgba(241,190,67,0.06)} }
        .tdot { animation:typing 1.4s ease-in-out infinite; }
        .td0  { animation-delay:0ms; }
        .td1  { animation-delay:220ms; }
        .td2  { animation-delay:440ms; }
        .nl:hover { color:#f1f5f9 !important; }
        .ctab { transition:transform 0.15s,box-shadow 0.15s; }
        .ctab:hover { transform:translateY(-2px); box-shadow:0 14px 40px rgba(241,190,67,0.45) !important; }
        .bc { transition:transform 0.25s,box-shadow 0.25s,border-color 0.25s; }
        .bc:hover { transform:translateY(-4px); box-shadow:0 28px 64px rgba(0,0,0,0.55) !important; }
        .bc-gold:hover { transform:translateY(-4px); box-shadow:0 28px 64px rgba(241,190,67,0.2) !important; }
        .pill { animation:fadeUp 0.5s ease; }
        .dot-grid { background-image: linear-gradient(rgba(241,190,67,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(241,190,67,0.045) 1px, transparent 1px); background-size: 48px 48px; }
        .grad-text { background:linear-gradient(135deg,${GOLD} 0%,${GOLDL} 50%,#fff 100%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
        .shimmer-btn { background:linear-gradient(90deg,${GOLD} 0%,${GOLDL} 30%,#fff8e1 50%,${GOLDL} 70%,${GOLD} 100%); background-size:200% auto; animation:shimmer 3s linear infinite; }
        .scan-line { position:absolute; left:0; right:0; height:40%; background:linear-gradient(to bottom,transparent,rgba(241,190,67,0.04),transparent); animation:scan 4s ease-in-out infinite; pointer-events:none; }
        * { box-sizing:border-box; }
        @media(max-width:900px) {
          .hmenu { display:block !important; }
          .dnav { display:none !important; }
          .hero-grid { flex-direction:column !important; }
          .demo-wrap { display:none !important; }
          .bento-grid { grid-template-columns:1fr !important; }
          .bento-span-2, .bento-span-3, .bc-gold { grid-column:span 1 !important; }
          /* old .bento-span alias — collapse any remaining uses */
          .bento-span { grid-column:span 1 !important; }
          .spotlight-row { flex-direction:column !important; }
          .spotlight-visual { display:none !important; }
          .steps-grid { grid-template-columns:1fr !important; }
          .tgrid { flex-direction:column !important; }
          .subjects-grid { grid-template-columns:repeat(2,1fr) !important; }
          .pricing-grid { grid-template-columns:1fr !important; }
          .footer-row { flex-direction:column !important; gap:12px !important; }
        }
        @media(max-width:560px) {
          /* tighten gutters on every section to avoid mobile horizontal overflow */
          .lp-pad { padding-left:16px !important; padding-right:16px !important; }
          .lp-nav { padding-left:14px !important; padding-right:14px !important; }
          .lp-pad-hero { padding-top:88px !important; padding-bottom:48px !important; }
          .lp-pad-cta { padding-top:72px !important; padding-bottom:72px !important; }
          .lp-pad-section { padding-top:60px !important; padding-bottom:60px !important; }
          /* hide the "by Titanium Tutoring" tagline in the nav so the hamburger fits */
          .lp-tag { display:none !important; }
          /* drop forced line breaks inside display headlines so words can wrap naturally */
          .lp-hbr { display:none !important; }
          /* allow long all-caps display words to wrap inside their container */
          .lp-display { overflow-wrap:anywhere; word-break:break-word; }
          .lp-h1 { font-size:clamp(30px,9vw,40px) !important; letter-spacing:0.5px !important; }
          .lp-h2 { font-size:clamp(24px,7vw,32px) !important; letter-spacing:0.5px !important; }
          .lp-h2-cta { font-size:clamp(22px,6.5vw,30px) !important; letter-spacing:0.5px !important; }
          /* keep stats / pill rows wrapping cleanly inside their containers */
          .lp-stats { gap:14px !important; justify-content:flex-start !important; }
          .lp-pill-text { white-space:normal !important; }
          /* footer copyright wraps instead of pushing the row */
          .lp-copy { text-align:center; width:100%; line-height:1.5; }
          .footer-row { gap:14px !important; }
          .lp-footer-links { gap:14px !important; }
          /* stats banner: stack to single column with smaller numbers/padding so they fit */
          .lp-stats-grid { grid-template-columns:1fr !important; gap:8px !important; }
          .lp-stats-grid > div > div { border-radius:14px !important; padding:24px 16px !important; }
          .lp-stats-num { font-size:44px !important; }
          /* SACE/Curriculum bento banner: tighten padding, drop forced min-width, shrink stat numbers so 3-up row fits */
          .lp-sace-banner { padding:22px 18px !important; gap:20px !important; }
          .lp-sace-text { min-width:0 !important; flex-basis:100% !important; }
          .lp-sace-stats { width:100% !important; gap:10px !important; flex-shrink:1 !important; justify-content:space-between !important; }
          .lp-sace-num { font-size:22px !important; letter-spacing:0.5px !important; }
          /* let icon+heading row fill the banner width and wrap if needed instead of overflowing */
          .lp-sace-head { width:100% !important; min-width:0 !important; flex:1 1 100% !important; gap:12px !important; }
          .lp-sace-icon { width:44px !important; height:44px !important; font-size:22px !important; }
          .lp-sace-title { flex:1 1 auto !important; }
          .lp-sace-title > div:last-child { font-size:16px !important; line-height:1.3 !important; overflow-wrap:anywhere; }
        }
        @media(max-width:380px) {
          .subjects-grid { grid-template-columns:1fr !important; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className="lp-nav" style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, padding:'0 32px', height:64, display:'flex', alignItems:'center', justifyContent:'space-between', background: scrolled ? 'rgba(8,13,40,0.96)' : 'transparent', borderBottom: scrolled ? '1px solid rgba(241,190,67,0.1)' : 'none', backdropFilter: scrolled ? 'blur(20px)' : 'none', transition:'all 0.3s ease' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontFamily:FONT_D, fontSize:20, letterSpacing:1 }}>
            <span style={{ color:'#fff' }}>grade</span><span style={{ color:GOLD }}>farm.</span>
          </span>
          <span className="lp-tag" style={{ fontSize:10, color:'rgba(255,255,255,0.28)' }}>by Titanium Tutoring</span>
        </div>
        <div className="dnav" style={{ display:'flex', alignItems:'center', gap:28 }}>
          {[['features','Features'],['how','How It Works'],['subjects','Subjects'],['pricing','Pricing']].map(([id, label]) => (
            <button key={id} className="nl" onClick={() => scroll(id)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.55)', fontSize:13.5, fontWeight:500, cursor:'pointer', fontFamily:FONT_B, transition:'color 0.15s' }}>{label}</button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={onSignIn} className="dnav" style={{ padding:'8px 16px', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.65)', fontSize:13, cursor:'pointer', fontFamily:FONT_B, transition:'all 0.2s' }}>Sign in</button>
          <button onClick={onGetStarted} className="ctab shimmer-btn dnav" style={{ padding:'9px 20px', borderRadius:9, border:'none', color:NAVYD, fontSize:13, fontWeight:900, cursor:'pointer', fontFamily:FONT_B, boxShadow:`0 4px 16px rgba(241,190,67,0.35)` }}>Get started free</button>
          {/* hamburger — mobile only */}
          <button
            className="hmenu"
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            style={{ display:'none', background:'none', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#f1f5f9', fontSize:22, lineHeight:1, cursor:'pointer', padding:'6px 10px', fontFamily:'monospace' }}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={handleMobileNav} />

      {/* ── HERO ── */}
      <section className="dot-grid lp-pad lp-pad-hero" style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'100px 32px 60px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'15%', left:'50%', transform:'translateX(-50%)', width:800, height:800, borderRadius:'50%', background:`radial-gradient(circle,rgba(241,190,67,0.08) 0%,transparent 65%)`, animation:'glow 6s ease-in-out infinite', pointerEvents:'none' }} />
        <div style={{ position:'absolute', top:'60%', left:'10%', width:400, height:400, borderRadius:'50%', background:`radial-gradient(circle,rgba(167,139,250,0.06) 0%,transparent 65%)`, animation:'glow 8s ease-in-out infinite 2s', pointerEvents:'none' }} />
        <div className="scan-line" />

        <div className="hero-grid" style={{ maxWidth:1160, width:'100%', display:'flex', alignItems:'center', gap:80, position:'relative', zIndex:1 }}>
          {/* left */}
          <div style={{ flex:1, animation:'fadeUp 0.6s ease' }}>
            <div className="pill" style={{ display:'inline-flex', alignItems:'center', gap:9, background:'rgba(241,190,67,0.08)', border:'1px solid rgba(241,190,67,0.32)', borderRadius:24, padding:'7px 16px', marginBottom:28 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:GOLD, animation:'pulse 2.2s ease-in-out infinite', flexShrink:0 }} />
              <span className="lp-pill-text" style={{ fontSize:12, color:GOLD, fontWeight:700, letterSpacing:'0.02em' }}>AI-powered · Built for Australia · Free to start</span>
            </div>

            <h1 className="lp-display lp-h1" style={{ fontFamily:FONT_D, fontSize:'clamp(36px,5.5vw,68px)', lineHeight:1.02, margin:'0 0 24px', color:'#fff', letterSpacing:1 }}>
              THE STUDY PLATFORM<br className="lp-hbr" />
              {' '}THAT <span className="grad-text">ADAPTS</span><br className="lp-hbr" />
              {' '}TO YOU.
            </h1>

            <p style={{ fontSize:18, color:MUTED, lineHeight:1.75, margin:'0 0 36px', maxWidth:500 }}>
              gradefarm. uses AI to track every question you get wrong and keeps drilling until you nail it — then moves to your next weakness. Backed by Titanium Tutoring.
            </p>

            <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:40 }}>
              <button onClick={onGetStarted} className="ctab shimmer-btn" style={{ padding:'15px 36px', borderRadius:12, border:'none', color:NAVYD, fontSize:15, fontWeight:900, cursor:'pointer', fontFamily:FONT_B, boxShadow:`0 10px 36px rgba(241,190,67,0.4)` }}>
                Start for free →
              </button>
              <button onClick={() => scroll('features')} className="ctab" style={{ padding:'15px 28px', borderRadius:12, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.03)', color:MUTED, fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:FONT_B }}>
                See all features
              </button>
            </div>

            {/* trust row */}
            <div style={{ display:'flex', alignItems:'center', gap:16, paddingTop:28, borderTop:'1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display:'flex' }}>
                {[['A',GOLD,NAVYD],['J',PURPLE,'#0a0620'],['M',GREEN,'#03180e'],['S',GOLD,NAVYD],['P',PURPLE,'#0a0620'],['R',GREEN,'#03180e']].map(([l,bg,fg],i) => (
                  <div key={i} style={{ width:34, height:34, borderRadius:'50%', background:`linear-gradient(135deg,${bg},${bg}bb)`, border:'2px solid #080d28', marginLeft:i>0?-10:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color:fg, flexShrink:0 }}>{l}</div>
                ))}
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#e2e8f0' }}>Trusted by students preparing for their ATAR</div>
                <div style={{ fontSize:12, color:MUTED }}>Free during beta · No credit card · Cancel anytime</div>
              </div>
            </div>
          </div>

          {/* right — DemoCard */}
          <div className="demo-wrap" style={{ flexShrink:0, animation:'fadeUp 0.8s ease 0.25s both' }}>
            <div style={{ animation:'float 6s ease-in-out infinite' }}>
              <DemoCard />
            </div>
          </div>
        </div>
      </section>

      {/* ── SEPARATOR ── */}
      <div style={{ height:1, background:'linear-gradient(90deg,transparent 0%,rgba(241,190,67,0.3) 30%,rgba(241,190,67,0.5) 50%,rgba(241,190,67,0.3) 70%,transparent 100%)' }} />

      {/* ── STATS ── */}
      <section className="lp-pad" style={{ padding:'56px 32px' }}>
        <div className="lp-stats-grid" style={{ maxWidth:960, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:2 }}>
          {[
            { val:175, suf:'+', label:'SACE Questions', sub:'Stage 1 & 2 Chemistry', hi:false },
            { val:100, suf:'%', label:'Adaptive',       sub:'Tracks your exact weaknesses', hi:true  },
            { val:0,   suf:'$', label:'Cost to Start',  sub:'Free during beta', hi:false },
          ].map((s,i) => (
            <FadeUp key={i} delay={i * 70}>
              <div style={{ textAlign:'center', padding:'40px 24px', background: s.hi ? 'rgba(241,190,67,0.07)' : 'rgba(255,255,255,0.02)', borderRadius: i===0?'16px 0 0 16px':i===2?'0 16px 16px 0':0, border:`1px solid ${s.hi?'rgba(241,190,67,0.22)':'rgba(255,255,255,0.05)'}` }}>
                <div className="lp-stats-num" style={{ fontFamily:FONT_D, fontSize:62, color: s.hi ? GOLD : '#f1f5f9', lineHeight:1, letterSpacing:1 }}><Counter target={s.val} suffix={s.suf} delay={i * 70 + 400} /></div>
                <div style={{ fontSize:15, fontWeight:700, color:'#e2e8f0', marginTop:10 }}>{s.label}</div>
                <div style={{ fontSize:12, color:MUTED, marginTop:4 }}>{s.sub}</div>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── BENTO FEATURES ── */}
      <section id="features" className="lp-pad lp-pad-section" style={{ padding:'80px 32px' }}>
        <div style={{ maxWidth:1160, margin:'0 auto' }}>
          <FadeUp>
            <div style={{ textAlign:'center', marginBottom:60 }}>
              <div style={{ fontSize:11, color:GOLD, fontWeight:800, letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:14 }}>Everything you need</div>
              <h2 style={{ fontFamily:FONT_D, fontSize:'clamp(28px,4vw,50px)', margin:'0 0 16px', color:'#fff', letterSpacing:1 }}>BUILT FOR THE ATAR GENERATION.</h2>
              <p style={{ fontSize:17, color:MUTED, maxWidth:560, margin:'0 auto', lineHeight:1.7 }}>Six next-generation capabilities working together — so you stop guessing what to study and start making real progress.</p>
            </div>
          </FadeUp>

          <div className="bento-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>

            {/* CARD 1 — Adaptive (span 2, tall) */}
            <FadeUp delay={0} className="bento-span-2" style={{ gridColumn:'span 2' }}>
              <div className="bc-gold" style={{ background:'rgba(241,190,67,0.04)', border:'1.5px solid rgba(241,190,67,0.28)', borderRadius:20, padding:32, overflow:'hidden', position:'relative', minHeight:320, height:'100%' }}>
                <div style={{ position:'absolute', top:0, right:0, width:200, height:200, borderRadius:'50%', background:`radial-gradient(circle,rgba(241,190,67,0.12) 0%,transparent 70%)`, filter:'blur(20px)', pointerEvents:'none' }} />
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                  <div style={{ width:48, height:48, borderRadius:14, background:'linear-gradient(135deg,rgba(241,190,67,0.22),rgba(241,190,67,0.08))', border:'1px solid rgba(241,190,67,0.38)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, boxShadow:'0 4px 18px rgba(241,190,67,0.22)', flexShrink:0 }}>🎯</div>
                  <div>
                    <div style={{ fontSize:10, color:GOLD, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase' }}>Core Technology</div>
                    <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>Adaptive Intelligence Engine</div>
                  </div>
                </div>
                <p style={{ fontSize:14, color:MUTED, lineHeight:1.7, marginBottom:24, maxWidth:420 }}>Every session is different. The algorithm tracks your error rate per topic and difficulty tier — always serving questions where you're weakest. It learns you, not just from you.</p>
                <TopicGrid />
                <div style={{ marginTop:14, display:'flex', gap:8, flexWrap:'wrap' }}>
                  {['Error-rate tracking','Difficulty weighting','Priority queue','Per-topic analysis'].map(t => (
                    <span key={t} style={{ fontSize:11, background:'rgba(241,190,67,0.1)', border:'1px solid rgba(241,190,67,0.2)', borderRadius:20, padding:'4px 10px', color:GOLD, fontWeight:700 }}>{t}</span>
                  ))}
                </div>
              </div>
            </FadeUp>

            {/* CARD 2 — Titan AI (span 1, tall) */}
            <FadeUp delay={70}>
              <div className="bc" style={{ background:'rgba(167,139,250,0.04)', border:'1px solid rgba(167,139,250,0.22)', borderRadius:20, padding:28, position:'relative', overflow:'hidden', height:'100%' }}>
                <div style={{ position:'absolute', top:0, right:0, width:140, height:140, borderRadius:'50%', background:`radial-gradient(circle,rgba(167,139,250,0.14) 0%,transparent 70%)`, filter:'blur(16px)', pointerEvents:'none' }} />
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                  <div style={{ width:44, height:44, borderRadius:13, background:'linear-gradient(135deg,rgba(167,139,250,0.22),rgba(167,139,250,0.08))', border:'1px solid rgba(167,139,250,0.35)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, boxShadow:'0 4px 18px rgba(167,139,250,0.18)', flexShrink:0 }}>🎓</div>
                  <div>
                    <div style={{ fontSize:10, color:PURPLE, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase' }}>AI Tutor</div>
                    <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>Titan AI</div>
                  </div>
                </div>
                <p style={{ fontSize:13, color:MUTED, lineHeight:1.65, marginBottom:20 }}>Explains using sport, gaming, and everyday life. Doesn't just check answers — understands how you think.</p>
                <TitanChat />
              </div>
            </FadeUp>

            {/* CARD 3 — XP & Leaderboards */}
            <FadeUp delay={140}>
              <div className="bc" style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:20, padding:28, overflow:'hidden', position:'relative', height:'100%' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                  <div style={{ width:44, height:44, borderRadius:13, background:'linear-gradient(135deg,rgba(241,190,67,0.22),rgba(241,190,67,0.08))', border:'1px solid rgba(241,190,67,0.32)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, boxShadow:'0 4px 18px rgba(241,190,67,0.18)', flexShrink:0 }}>⚡</div>
                  <div>
                    <div style={{ fontSize:10, color:GOLD, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase' }}>Gamification</div>
                    <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>XP & Leaderboards</div>
                  </div>
                </div>
                <p style={{ fontSize:13, color:MUTED, lineHeight:1.65, marginBottom:18 }}>Earn XP for every correct answer. Streak multipliers, rank progression, and weekly leaderboards make studying feel less like studying.</p>
                <LeaderboardMini />
              </div>
            </FadeUp>

            {/* CARD 4 — Know Your Gaps */}
            <FadeUp delay={210}>
              <div className="bc" style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:20, padding:28, overflow:'hidden', position:'relative', height:'100%' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                  <div style={{ width:44, height:44, borderRadius:13, background:'linear-gradient(135deg,rgba(16,185,129,0.22),rgba(16,185,129,0.08))', border:'1px solid rgba(16,185,129,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, boxShadow:'0 4px 18px rgba(16,185,129,0.16)', flexShrink:0 }}>📊</div>
                  <div>
                    <div style={{ fontSize:10, color:GREEN, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase' }}>Gap Analysis</div>
                    <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>Know Your Gaps</div>
                  </div>
                </div>
                <p style={{ fontSize:13, color:MUTED, lineHeight:1.65, marginBottom:18 }}>After every session, see exactly which topics are holding your ATAR back. Real-time readiness score. No more guessing what to revise.</p>
                <GapsMini />
              </div>
            </FadeUp>

            {/* CARD 5 — Your Notes */}
            <FadeUp delay={280}>
              <div className="bc" style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:20, padding:28, overflow:'hidden', position:'relative', height:'100%' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                  <div style={{ width:44, height:44, borderRadius:13, background:'linear-gradient(135deg,rgba(249,216,122,0.22),rgba(249,216,122,0.08))', border:'1px solid rgba(249,216,122,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, boxShadow:'0 4px 18px rgba(249,216,122,0.16)', flexShrink:0 }}>📄</div>
                  <div>
                    <div style={{ fontSize:10, color:GOLDL, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase' }}>Smart Upload</div>
                    <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>Your Notes, Your Tutor</div>
                  </div>
                </div>
                <p style={{ fontSize:13, color:MUTED, lineHeight:1.65, marginBottom:24 }}>Upload your teacher's slides or class notes. Titan AI reads them and teaches from your exact school content — not a textbook you've never seen.</p>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10 }}>
                    <span style={{ fontSize:22 }}>📁</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:'#e2e8f0' }}>Chem_Unit3_Reactions.pdf</div>
                      <div style={{ fontSize:10, color:MUTED }}>Uploading... 84%</div>
                      <div style={{ height:3, borderRadius:2, background:'rgba(255,255,255,0.08)', marginTop:5 }}>
                        <div style={{ width:'84%', height:'100%', borderRadius:2, background:`linear-gradient(90deg,${GOLD},${GOLDL})` }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'rgba(167,139,250,0.07)', border:'1px solid rgba(167,139,250,0.2)', borderRadius:10 }}>
                    <span style={{ fontSize:18 }}>🎓</span>
                    <div style={{ fontSize:12, color:'#e2e8f0' }}>Titan has read your notes — ready to teach from <span style={{ color:GOLD, fontWeight:700 }}>your content</span></div>
                  </div>
                </div>
              </div>
            </FadeUp>

            {/* CARD 6 — SACE Content (full width banner) */}
            <FadeUp delay={350} className="bento-span-3" style={{ gridColumn:'span 3' }}>
              <div className="bc lp-sace-banner" style={{ background:'rgba(255,255,255,0.015)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:20, padding:'28px 36px', display:'flex', alignItems:'center', gap:40, flexWrap:'wrap', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', left:0, top:0, bottom:0, width:4, borderRadius:'20px 0 0 20px', background:`linear-gradient(to bottom,${GOLD},${GOLDL})` }} />
                <div className="lp-sace-head" style={{ display:'flex', alignItems:'center', gap:14, flex:'0 0 auto' }}>
                  <div className="lp-sace-icon" style={{ width:52, height:52, borderRadius:14, background:'linear-gradient(135deg,rgba(241,190,67,0.24),rgba(241,190,67,0.1))', border:'1px solid rgba(241,190,67,0.38)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, boxShadow:'0 6px 22px rgba(241,190,67,0.22)', flexShrink:0 }}>⭐</div>
                  <div className="lp-sace-title" style={{ minWidth:0 }}>
                    <div style={{ fontSize:10, color:GOLD, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:4 }}>Curriculum</div>
                    <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>Backed by Titanium Tutoring</div>
                  </div>
                </div>
                <div className="lp-sace-text" style={{ flex:1, minWidth:240 }}>
                  <p style={{ fontSize:14, color:MUTED, lineHeight:1.65, margin:0 }}>Questions written and peer-reviewed by real SACE tutors with proven results. Every question is curriculum-mapped to Stage 1 & Stage 2 Chemistry — nothing off-syllabus, nothing wasted.</p>
                </div>
                <div className="lp-stats lp-sace-stats" style={{ display:'flex', gap:20, minWidth:0, flexWrap:'wrap' }}>
                  {[['175+','SACE questions'],['100%','Curriculum-aligned'],['2','Stages covered']].map(([n,l]) => (
                    <div key={l} style={{ textAlign:'center' }}>
                      <div className="lp-sace-num" style={{ fontFamily:FONT_D, fontSize:28, color:GOLD, letterSpacing:1 }}>{n}</div>
                      <div style={{ fontSize:11, color:MUTED, marginTop:2 }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </FadeUp>

          </div>
        </div>
      </section>

      {/* ── SPOTLIGHT 1: TITAN AI ── */}
      <FadeUp>
        <section className="lp-pad lp-pad-section" style={{ padding:'80px 32px', background:'rgba(167,139,250,0.03)', borderTop:'1px solid rgba(167,139,250,0.08)', borderBottom:'1px solid rgba(167,139,250,0.08)' }}>
          <div style={{ maxWidth:1160, margin:'0 auto' }}>
            <div className="spotlight-row" style={{ display:'flex', alignItems:'center', gap:80 }}>
              {/* text */}
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:PURPLE, fontWeight:800, letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:16 }}>Deep dive</div>
                <h2 className="lp-display lp-h2" style={{ fontFamily:FONT_D, fontSize:'clamp(26px,3.5vw,44px)', margin:'0 0 20px', color:'#fff', letterSpacing:1, lineHeight:1.1 }}>
                  MEET TITAN AI.<br className="lp-hbr" />
                  {' '}<span style={{ color:PURPLE }}>YOUR TUTOR THAT</span><br className="lp-hbr" />
                  {' '}ACTUALLY GETS YOU.
                </h2>
                <p style={{ fontSize:16, color:MUTED, lineHeight:1.75, marginBottom:32, maxWidth:480 }}>Most tutors explain things once and move on. Titan explains it differently — using sport, gaming, pop culture — until your brain actually clicks. Then it checks you actually got it.</p>
                <div style={{ display:'flex', flexDirection:'column', gap:16, marginBottom:36 }}>
                  {[
                    { icon:'🍔', text:'Explains with sport, gaming, and everyday analogies — whatever makes it stick for you' },
                    { icon:'📁', text:'Upload your class notes — Titan reads them and teaches from your exact school content' },
                    { icon:'🔄', text:'Real-time comprehension checks after every concept — no passive reading' },
                    { icon:'🌙', text:'Available 24/7 — no scheduling, no waiting, no minimum booking' },
                  ].map((f,i) => (
                    <div key={i} style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                      <div style={{ width:38, height:38, borderRadius:11, background:'linear-gradient(135deg,rgba(167,139,250,0.2),rgba(167,139,250,0.07))', border:'1px solid rgba(167,139,250,0.28)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, boxShadow:'0 3px 14px rgba(167,139,250,0.15)' }}>{f.icon}</div>
                      <div style={{ fontSize:14, color:'#e2e8f0', lineHeight:1.65, paddingTop:8 }}>{f.text}</div>
                    </div>
                  ))}
                </div>
                <button onClick={onGetStarted} className="ctab" style={{ padding:'14px 32px', borderRadius:12, border:'none', background:`linear-gradient(135deg,${PURPLE},#6d28d9)`, color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:FONT_B, boxShadow:'0 8px 28px rgba(167,139,250,0.35)' }}>
                  Try Titan AI free →
                </button>
              </div>
              {/* visual */}
              <div className="spotlight-visual" style={{ flex:1, maxWidth:480 }}>
                <div style={{ background:'rgba(8,13,40,0.9)', border:'1px solid rgba(167,139,250,0.25)', borderRadius:20, padding:28, boxShadow:'0 32px 80px rgba(0,0,0,0.5)', position:'relative' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, paddingBottom:16, borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#a78bfa,#6d28d9)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, boxShadow:'0 0 20px rgba(167,139,250,0.4)' }}>🎓</div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>Titan AI</div>
                      <div style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:6, height:6, borderRadius:'50%', background:GREEN }} /><span style={{ fontSize:11, color:GREEN }}>Online · Organic Chemistry</span></div>
                    </div>
                    <div style={{ marginLeft:'auto', fontSize:11, color:MUTED }}>From your notes ✓</div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                    <div style={{ display:'flex', justifyContent:'flex-end' }}>
                      <div style={{ background:'rgba(241,190,67,0.12)', border:'1px solid rgba(241,190,67,0.2)', borderRadius:'14px 14px 4px 14px', padding:'10px 14px', maxWidth:'80%', fontSize:14, color:'#e2e8f0', lineHeight:1.55 }}>Why is carbon so special in organic chemistry?</div>
                    </div>
                    <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                      <div style={{ width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg,#a78bfa,#6d28d9)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>🎓</div>
                      <div style={{ background:'rgba(167,139,250,0.1)', border:'1px solid rgba(167,139,250,0.2)', borderRadius:'4px 14px 14px 14px', padding:'10px 14px', maxWidth:'88%' }}>
                        <div style={{ fontSize:10, color:PURPLE, fontWeight:800, letterSpacing:'0.08em', marginBottom:6 }}>TITAN AI</div>
                        <div style={{ fontSize:13, color:'#e2e8f0', lineHeight:1.65 }}>Carbon is like a universal LEGO brick — it has 4 bonding "hands" and can connect to almost anything: other carbons, hydrogen, oxygen, nitrogen. That flexibility is why life itself is carbon-based. <span style={{ color:GOLD, fontWeight:700 }}>4 bonds = infinite combinations.</span> 🧱</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', justifyContent:'flex-end' }}>
                      <div style={{ background:'rgba(241,190,67,0.12)', border:'1px solid rgba(241,190,67,0.2)', borderRadius:'14px 14px 4px 14px', padding:'10px 14px', maxWidth:'80%', fontSize:14, color:'#e2e8f0', lineHeight:1.55 }}>So what makes a compound "organic"?</div>
                    </div>
                    <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                      <div style={{ width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg,#a78bfa,#6d28d9)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>🎓</div>
                      <div style={{ display:'flex', gap:5, padding:'12px 16px', background:'rgba(167,139,250,0.07)', border:'1px solid rgba(167,139,250,0.15)', borderRadius:'4px 14px 14px 14px' }}>
                        {[0,1,2].map(i => <div key={i} className={`tdot td${i}`} style={{ width:6, height:6, borderRadius:'50%', background:PURPLE }} />)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </FadeUp>

      {/* ── SPOTLIGHT 2: ADAPTIVE ALGORITHM ── */}
      <FadeUp>
        <section className="lp-pad lp-pad-section" style={{ padding:'80px 32px' }}>
          <div style={{ maxWidth:1160, margin:'0 auto' }}>
            <div className="spotlight-row" style={{ display:'flex', alignItems:'center', gap:80 }}>
              {/* visual */}
              <div className="spotlight-visual" style={{ flex:1, maxWidth:500 }}>
                <div style={{ background:'rgba(8,13,40,0.9)', border:'1px solid rgba(241,190,67,0.2)', borderRadius:20, padding:28, boxShadow:'0 32px 80px rgba(0,0,0,0.5)' }}>
                  <div style={{ fontSize:12, fontWeight:800, color:GOLD, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:16 }}>Your topic mastery map</div>
                  <TopicGrid />
                  <div style={{ marginTop:20, padding:'14px 16px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, display:'flex', gap:12, alignItems:'center' }}>
                    <span style={{ fontSize:22 }}>⚡</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#fca5a5' }}>Priority queue: Equilibrium (19%)</div>
                      <div style={{ fontSize:12, color:MUTED }}>Next 8 questions will target this topic</div>
                    </div>
                  </div>
                  <div style={{ marginTop:10, padding:'14px 16px', background:'rgba(241,190,67,0.06)', border:'1px solid rgba(241,190,67,0.15)', borderRadius:12, display:'flex', gap:12, alignItems:'center' }}>
                    <span style={{ fontSize:22 }}>📈</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:GOLD }}>Session progress: +12% on Redox</div>
                      <div style={{ fontSize:12, color:MUTED }}>Difficulty unlocked: Level 3 questions</div>
                    </div>
                  </div>
                </div>
              </div>
              {/* text */}
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:GOLD, fontWeight:800, letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:16 }}>Deep dive</div>
                <h2 className="lp-display lp-h2" style={{ fontFamily:FONT_D, fontSize:'clamp(26px,3.5vw,44px)', margin:'0 0 20px', color:'#fff', letterSpacing:1, lineHeight:1.1 }}>
                  AN ALGORITHM THAT<br className="lp-hbr" />
                  {' '}<span style={{ color:GOLD }}>LEARNS YOU.</span><br className="lp-hbr" />
                  {' '}NOT JUST FROM YOU.
                </h2>
                <p style={{ fontSize:16, color:MUTED, lineHeight:1.75, marginBottom:32, maxWidth:480 }}>Most study apps give you a random bank of questions. gradefarm. tracks your error rate at the topic-and-difficulty level — so every session zeros in on exactly what your exam will punish you for.</p>
                <div style={{ display:'flex', flexDirection:'column', gap:16, marginBottom:36 }}>
                  {[
                    { icon:'📊', text:'Error rate tracked per topic and per difficulty tier — not just "right or wrong"' },
                    { icon:'🔢', text:'Weighted priority queue updates in real time after every answer you give' },
                    { icon:'🧠', text:'Difficulty scales automatically — easier when you\'re struggling, harder when you\'re confident' },
                    { icon:'🔁', text:'Questions you\'ve missed come back in spaced intervals until they stick permanently' },
                  ].map((f,i) => (
                    <div key={i} style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                      <div style={{ width:38, height:38, borderRadius:11, background:'linear-gradient(135deg,rgba(241,190,67,0.2),rgba(241,190,67,0.07))', border:'1px solid rgba(241,190,67,0.28)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, boxShadow:'0 3px 14px rgba(241,190,67,0.15)' }}>{f.icon}</div>
                      <div style={{ fontSize:14, color:'#e2e8f0', lineHeight:1.65, paddingTop:8 }}>{f.text}</div>
                    </div>
                  ))}
                </div>
                <button onClick={onGetStarted} className="ctab shimmer-btn" style={{ padding:'14px 32px', borderRadius:12, border:'none', color:NAVYD, fontSize:14, fontWeight:900, cursor:'pointer', fontFamily:FONT_B, boxShadow:`0 8px 28px rgba(241,190,67,0.4)` }}>
                  See it in action →
                </button>
              </div>
            </div>
          </div>
        </section>
      </FadeUp>

      {/* ── SPOTLIGHT 3: PROGRESS & GAPS ── */}
      <FadeUp>
        <section className="lp-pad lp-pad-section" style={{ padding:'80px 32px', background:'rgba(16,185,129,0.02)', borderTop:'1px solid rgba(16,185,129,0.07)', borderBottom:'1px solid rgba(16,185,129,0.07)' }}>
          <div style={{ maxWidth:1160, margin:'0 auto' }}>
            <div className="spotlight-row" style={{ display:'flex', alignItems:'center', gap:80 }}>
              {/* text */}
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:GREEN, fontWeight:800, letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:16 }}>Deep dive</div>
                <h2 className="lp-display lp-h2" style={{ fontFamily:FONT_D, fontSize:'clamp(26px,3.5vw,44px)', margin:'0 0 20px', color:'#fff', letterSpacing:1, lineHeight:1.1 }}>
                  SEE EXACTLY<br className="lp-hbr" />
                  {' '}<span style={{ color:GREEN }}>WHERE YOU STAND.</span><br className="lp-hbr" />
                  {' '}FIX WHAT'S BROKEN.
                </h2>
                <p style={{ fontSize:16, color:MUTED, lineHeight:1.75, marginBottom:32, maxWidth:480 }}>After every session, your struggle profile updates. You get a real-time exam readiness score, a topic-by-topic breakdown, and a personalised action plan — not a vague "keep studying" message.</p>
                <div style={{ display:'flex', flexDirection:'column', gap:16, marginBottom:36 }}>
                  {[
                    { icon:'🎯', text:'Exam readiness score shows you the honest number — not a feel-good estimate' },
                    { icon:'🗺️', text:'Topic heatmap shows which areas are red (danger), yellow (watch), and green (solid)' },
                    { icon:'📋', text:'Personalised study plan generated after every session with specific next steps' },
                    { icon:'📈', text:'Progress tracking over time so you can see the gaps actually closing' },
                  ].map((f,i) => (
                    <div key={i} style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                      <div style={{ width:38, height:38, borderRadius:11, background:'linear-gradient(135deg,rgba(16,185,129,0.2),rgba(16,185,129,0.07))', border:'1px solid rgba(16,185,129,0.28)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, boxShadow:'0 3px 14px rgba(16,185,129,0.15)' }}>{f.icon}</div>
                      <div style={{ fontSize:14, color:'#e2e8f0', lineHeight:1.65, paddingTop:8 }}>{f.text}</div>
                    </div>
                  ))}
                </div>
                <button onClick={onGetStarted} className="ctab" style={{ padding:'14px 32px', borderRadius:12, border:'none', background:`linear-gradient(135deg,${GREEN},#059669)`, color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:FONT_B, boxShadow:'0 8px 28px rgba(16,185,129,0.35)' }}>
                  Track my progress →
                </button>
              </div>
              {/* visual */}
              <div className="spotlight-visual" style={{ flex:1, maxWidth:460 }}>
                <div style={{ background:'rgba(8,13,40,0.9)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:20, padding:28, boxShadow:'0 32px 80px rgba(0,0,0,0.5)' }}>
                  <div style={{ fontSize:12, fontWeight:800, color:GREEN, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:20 }}>Session summary · Oct 28</div>
                  <GapsMini />
                  <div style={{ marginTop:20, padding:'14px 16px', background:'rgba(16,185,129,0.07)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:12 }}>
                    <div style={{ fontSize:12, fontWeight:800, color:GREEN, marginBottom:8 }}>📋 Your action plan</div>
                    {['Review equilibrium Le Chatelier shifts (Titan can help)', '3 more sessions on Electrochemistry needed', 'Redox is improving — keep momentum'].map((a,i) => (
                      <div key={i} style={{ display:'flex', gap:8, fontSize:12, color:MUTED, lineHeight:1.55, marginBottom: i<2?6:0 }}>
                        <span style={{ color:GREEN, flexShrink:0 }}>→</span>{a}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </FadeUp>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="lp-pad lp-pad-section" style={{ padding:'80px 32px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <FadeUp>
            <div style={{ textAlign:'center', marginBottom:64 }}>
              <div style={{ fontSize:11, color:GOLD, fontWeight:800, letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:14 }}>How it works</div>
              <h2 style={{ fontFamily:FONT_D, fontSize:'clamp(28px,4vw,48px)', margin:'0 0 16px', color:'#fff', letterSpacing:1 }}>FROM SIGN-UP TO RESULTS.</h2>
              <p style={{ fontSize:16, color:MUTED, maxWidth:480, margin:'0 auto', lineHeight:1.7 }}>Four steps. One outcome: fewer gaps, more confidence, better exam performance.</p>
            </div>
          </FadeUp>
          <div className="steps-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
            {[
              { num:'01', icon:'✍️', color:GOLD,   rgb:'241,190,67',  title:'Sign up free',        desc:'30 seconds. Pick your subject. No credit card, no commitment. You\'re in.' },
              { num:'02', icon:'⚡', color:GOLD,   rgb:'241,190,67',  title:'Do a session',         desc:'Answer adaptive questions. The algorithm starts learning your weak spots from question one.' },
              { num:'03', icon:'🎓', color:PURPLE, rgb:'167,139,250', title:'Learn with Titan',     desc:'Stuck on a topic? Switch to Learn mode. Titan teaches it from your class notes using analogies that actually land.' },
              { num:'04', icon:'📈', color:GREEN,  rgb:'16,185,129',  title:'Watch gaps close',     desc:'Your readiness score updates live. Priority Queue shows the exact next thing to fix. Repeat until exam.' },
            ].map((s,i) => (
              <FadeUp key={i} delay={i * 80}>
                <div style={{ background:'rgba(255,255,255,0.02)', border:`1px solid rgba(${s.rgb},0.14)`, borderLeft:`3px solid ${s.color}`, borderRadius:18, padding:28, position:'relative', height:'100%', overflow:'hidden' }}>
                  <div style={{ position:'absolute', top:-8, right:-4, fontFamily:FONT_D, fontSize:88, color:`rgba(${s.rgb},0.05)`, letterSpacing:2, lineHeight:1, userSelect:'none', pointerEvents:'none' }}>{s.num}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
                    <div style={{ width:48, height:48, borderRadius:14, background:`linear-gradient(135deg,rgba(${s.rgb},0.2),rgba(${s.rgb},0.07))`, border:`1px solid rgba(${s.rgb},0.3)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, boxShadow:`0 4px 16px rgba(${s.rgb},0.18)`, flexShrink:0 }}>{s.icon}</div>
                    <div style={{ fontFamily:FONT_D, fontSize:12, color:s.color, letterSpacing:'0.1em' }}>STEP {s.num}</div>
                  </div>
                  <div style={{ fontFamily:FONT_D, fontSize:16, color:'#fff', marginBottom:10, letterSpacing:0.5, lineHeight:1.2 }}>{s.title.toUpperCase()}</div>
                  <div style={{ fontSize:13.5, color:MUTED, lineHeight:1.7 }}>{s.desc}</div>
                  {i < 3 && <div style={{ position:'absolute', top:'50%', right:-9, transform:'translateY(-50%)', width:18, height:18, borderRadius:'50%', background:NAVYD, border:`1px solid rgba(241,190,67,0.3)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:GOLD, zIndex:1 }}>→</div>}
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="lp-pad" style={{ padding:'0 32px 80px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <FadeUp>
            <div style={{ textAlign:'center', marginBottom:48 }}>
              <div style={{ fontSize:11, color:GOLD, fontWeight:800, letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:14 }}>What students say</div>
              <h2 style={{ fontFamily:FONT_D, fontSize:'clamp(24px,3.5vw,40px)', margin:0, color:'#fff', letterSpacing:1 }}>REAL STUDENTS. REAL RESULTS.</h2>
            </div>
          </FadeUp>
          <div className="tgrid" style={{ display:'flex', gap:16 }}>
            {[
              { quote:'I bombed my first Chem SAT but after two weeks on gradefarm. my topic scores are genuinely going up. The algorithm kept hammering Equilibrium until I actually got it.', name:'Aiden M.', sub:'Stage 2 Chemistry', init:'AM', hue:210 },
              { quote:'Titan explains things in a way that actually makes sense. I uploaded my teacher\'s notes and it explained limiting reagents with a burger analogy. It clicked immediately.', name:'Sophie R.', sub:'Stage 2 Chemistry', init:'SR', hue:270 },
              { quote:'The Priority Queue is insane — it always knows exactly what I need to drill. My exam readiness score went from 41% to 74% in three weeks. I actually feel prepared now.', name:'Jake T.', sub:'Stage 1 Chemistry', init:'JT', hue:160 },
            ].map((t,i) => (
              <FadeUp key={i} delay={i * 100} style={{ flex:1 }}>
                <div style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:18, padding:28, display:'flex', flexDirection:'column', gap:16, height:'100%' }}>
                  <div style={{ display:'flex', gap:3 }}>{[0,1,2,3,4].map(s => <span key={s} style={{ color:GOLD, fontSize:14 }}>★</span>)}</div>
                  <p style={{ fontSize:14, color:'#e2e8f0', lineHeight:1.8, margin:0, flex:1, fontStyle:'italic' }}>"{t.quote}"</p>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:`hsl(${t.hue},40%,30%)`, border:`2px solid rgba(241,190,67,0.2)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#fff', flexShrink:0 }}>{t.init}</div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:800, color:'#e2e8f0' }}>{t.name}</div>
                      <div style={{ fontSize:11, color:GOLD }}>{t.sub}</div>
                    </div>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── SUBJECTS ── */}
      <FadeUp>
        <section id="subjects" className="lp-pad lp-pad-section" style={{ padding:'80px 32px', background:'rgba(255,255,255,0.015)', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ maxWidth:960, margin:'0 auto', textAlign:'center' }}>
            <div style={{ fontSize:11, color:GOLD, fontWeight:800, letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:14 }}>Subjects</div>
            <h2 style={{ fontFamily:FONT_D, fontSize:'clamp(26px,4vw,44px)', margin:'0 0 14px', color:'#fff', letterSpacing:1 }}>STARTING WITH CHEMISTRY.</h2>
            <p style={{ fontSize:16, color:MUTED, marginBottom:44, lineHeight:1.7 }}>More subjects are coming. Stage 1 and Stage 2 covered from day one.</p>
            <div className="subjects-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
              {[
                { name:'Chemistry',               stage:'Stage 1 & 2', icon:'⚗️', color:GOLD,    available:true,  count:'175+ questions' },
                { name:'Mathematical Methods',    stage:'Stage 2',     icon:'∫',  color:'#a78bfa',available:false },
                { name:'Physics',                 stage:'Stage 2',     icon:'⚛️', color:GOLDL,   available:false },
                { name:'Biology',                 stage:'Stage 2',     icon:'🧬', color:GREEN,   available:false },
                { name:'English Literary Studies',stage:'Stage 2',     icon:'📖', color:'#f87171',available:false },
                { name:'Economics',               stage:'Stage 2',     icon:'📈', color:GOLD,    available:false },
              ].map(s => (
                <div key={s.name} onClick={s.available ? onGetStarted : undefined} style={{ padding:'24px 18px', borderRadius:16, border:`1px solid ${s.available?'rgba(241,190,67,0.32)':'rgba(255,255,255,0.06)'}`, background: s.available?'rgba(241,190,67,0.06)':'rgba(255,255,255,0.02)', textAlign:'center', opacity: s.available?1:0.45, cursor: s.available?'pointer':'default', transition:'all 0.18s', boxShadow: s.available?'0 4px 24px rgba(241,190,67,0.12)':'none' }}>
                  <div style={{ fontSize:28, marginBottom:10 }}>{s.icon}</div>
                  <div style={{ fontSize:13, fontWeight:800, color: s.available?'#f1f5f9':'#475569', marginBottom:4 }}>{s.name}</div>
                  <div style={{ fontSize:11, color: s.available?GOLD:'#334155' }}>{s.available ? s.count : s.stage+' · Coming soon'}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeUp>

      {/* ── PRICING ── */}
      <FadeUp>
        <section id="pricing" className="lp-pad lp-pad-section" style={{ padding:'80px 32px' }}>
          <div style={{ maxWidth:820, margin:'0 auto', textAlign:'center' }}>
            <div style={{ fontSize:11, color:GOLD, fontWeight:800, letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:14 }}>Pricing</div>
            <h2 style={{ fontFamily:FONT_D, fontSize:'clamp(26px,4vw,44px)', margin:'0 0 14px', color:'#fff', letterSpacing:1 }}>FREE WHILE IN BETA.</h2>
            <p style={{ fontSize:16, color:MUTED, marginBottom:52, maxWidth:440, margin:'0 auto 52px', lineHeight:1.7 }}>Everything is free right now. Beta users lock in the lowest price forever.</p>
            <div className="pricing-grid" style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16, maxWidth:720, margin:'0 auto' }}>
              {[
                { name:'Beta', price:'Free', sub:'While in beta · lock in your rate forever', hi:true, features:['All subjects (Chemistry live now)','Unlimited quiz sessions','Learn with Titan AI','Struggle tracking & readiness score','Weekly leaderboard','Priority beta pricing forever'] },
                { name:'Full Release', price:'$12', sub:'/month · after beta ends', hi:false, features:['Everything in Beta','All SACE subjects','Parent dashboard','School assignment mode','Exam countdown planner','Priority support'] },
              ].map(p => (
                <div key={p.name} style={{ background: p.hi?'rgba(241,190,67,0.06)':'rgba(255,255,255,0.02)', border:`1px solid ${p.hi?'rgba(241,190,67,0.32)':'rgba(255,255,255,0.06)'}`, borderTop: p.hi?`3px solid ${GOLD}`:`1px solid rgba(255,255,255,0.06)`, borderRadius:20, padding: p.hi?'38px 30px 34px':'36px 30px', textAlign:'left', position:'relative' }}>
                  {p.hi && <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:`linear-gradient(135deg,${GOLD},${GOLDL})`, color:NAVYD, fontSize:11, fontWeight:900, padding:'5px 16px', borderRadius:20, whiteSpace:'nowrap' }}>AVAILABLE NOW</div>}
                  <div style={{ fontSize:11, fontWeight:800, color: p.hi?GOLD:'rgba(255,255,255,0.28)', marginBottom:8, letterSpacing:'0.12em', textTransform:'uppercase' }}>{p.name}</div>
                  <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:4 }}>
                    <div style={{ fontFamily:FONT_D, fontSize:52, color: p.hi?'#fff':'rgba(255,255,255,0.4)', letterSpacing:1, lineHeight:1 }}>{p.price}</div>
                  </div>
                  <div style={{ fontSize:12, color:MUTED, marginBottom:28, lineHeight:1.5 }}>{p.sub}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:11, marginBottom:28 }}>
                    {p.features.map(f => (
                      <div key={f} style={{ display:'flex', alignItems:'flex-start', gap:10, fontSize:13, color: p.hi?'#cbd5e1':MUTED }}>
                        <div style={{ width:18, height:18, borderRadius:'50%', background: p.hi?'rgba(241,190,67,0.15)':'rgba(255,255,255,0.04)', border:`1px solid ${p.hi?'rgba(241,190,67,0.35)':'rgba(255,255,255,0.1)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                          <span style={{ fontSize:8, fontWeight:900, color: p.hi?GOLD:'#475569' }}>✓</span>
                        </div>
                        {f}
                      </div>
                    ))}
                  </div>
                  {p.hi && (
                    <button onClick={onGetStarted} className="ctab shimmer-btn" style={{ width:'100%', padding:'15px 14px', borderRadius:11, border:'none', color:NAVYD, fontSize:14, fontWeight:900, cursor:'pointer', fontFamily:FONT_B, boxShadow:`0 6px 20px rgba(241,190,67,0.35)` }}>
                      Get started free →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeUp>

      {/* ── FINAL CTA ── */}
      <FadeUp>
        <section className="lp-pad lp-pad-cta" style={{ padding:'100px 32px', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:700, height:400, borderRadius:'50%', background:`radial-gradient(ellipse,rgba(241,190,67,0.1) 0%,transparent 70%)`, filter:'blur(40px)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:400, height:200, borderRadius:'50%', background:`radial-gradient(ellipse,rgba(241,190,67,0.15) 0%,transparent 60%)`, filter:'blur(20px)', pointerEvents:'none' }} />
          <div style={{ maxWidth:680, margin:'0 auto', textAlign:'center', position:'relative', zIndex:1 }}>
            <div style={{ fontSize:11, color:GOLD, fontWeight:800, letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:20 }}>Ready?</div>
            <h2 className="lp-display lp-h2-cta" style={{ fontFamily:FONT_D, fontSize:'clamp(24px,4.5vw,52px)', margin:'0 0 20px', color:'#fff', lineHeight:1.1, letterSpacing:1 }}>
              YOUR ATAR DOESN'T CARE HOW GOOD <span style={{ color:GOLD }}>YOUR TEACHER IS AT EXPLAINING.</span> GRADEFARM. DOES.
            </h2>
            <p style={{ fontSize:17, color:MUTED, marginBottom:40, lineHeight:1.75, maxWidth:520, margin:'0 auto 40px' }}>
              Start free today. No credit card, no commitment. The algorithm gets to work on your first question.
            </p>
            <div style={{ position:'relative', display:'inline-block' }}>
              <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:300, height:120, borderRadius:'50%', background:`radial-gradient(ellipse,rgba(241,190,67,0.45) 0%,transparent 70%)`, filter:'blur(20px)', pointerEvents:'none' }} />
              <button onClick={onGetStarted} className="ctab shimmer-btn" style={{ position:'relative', padding:'18px 56px', borderRadius:14, border:'none', color:NAVYD, fontSize:17, fontWeight:900, cursor:'pointer', fontFamily:FONT_B, boxShadow:`0 12px 40px rgba(241,190,67,0.5)` }}>
                Start for free →
              </button>
            </div>
            <div style={{ marginTop:20, fontSize:13, color:MUTED }}>No credit card · No commitment · Beta is free</div>
          </div>
        </section>
      </FadeUp>

      {/* ── FOOTER ── */}
      <footer className="lp-pad" style={{ borderTop:'1px solid rgba(241,190,67,0.1)', padding:'28px 32px' }}>
        <div className="footer-row" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontFamily:FONT_D, fontSize:16, letterSpacing:1 }}><span style={{ color:'#f1f5f9' }}>grade</span><span style={{ color:GOLD }}>farm.</span></span>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.28)' }}>by Titanium Tutoring</span>
          </div>
          <div className="lp-footer-links" style={{ display:'flex', gap:24, flexWrap:'wrap', justifyContent:'center' }}>
            {[['features','Features'],['how','How It Works'],['subjects','Subjects'],['pricing','Pricing']].map(([id,l]) => (
              <button key={id} className="nl" onClick={() => scroll(id)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.35)', fontSize:12, cursor:'pointer', fontFamily:FONT_B, transition:'color 0.15s' }}>{l}</button>
            ))}
          </div>
          <div className="lp-copy" style={{ fontSize:12, color:'rgba(255,255,255,0.25)' }}>© 2026 Titanium Tutoring · Adelaide, SA · Per aspera ad astra</div>
        </div>
      </footer>
    </div>
  )
}
