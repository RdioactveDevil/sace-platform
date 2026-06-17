// VersionLanding — the per-platform marketing/landing page (logged-out).
//
// One data-driven template themed by the active version's accent + `landing`
// config from the version registry (src/lib/brand.js). Every subdomain
// (selective./sace./vce./ucat./gamsat.) gets a bespoke-feeling landing with no
// extra code — adding UCAT/GAMSAT content is purely registry data. The apex
// (default) domain keeps the full original LandingPage; this renders for the
// branded subdomains.

const NAVY = '#06091f'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

function hexA(hex, a) {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}
function lighten(hex, amt) {
  const c = hex.replace('#', '')
  let r = parseInt(c.slice(0, 2), 16)
  let g = parseInt(c.slice(2, 4), 16)
  let b = parseInt(c.slice(4, 6), 16)
  r = Math.round(r + (255 - r) * amt)
  g = Math.round(g + (255 - g) * amt)
  b = Math.round(b + (255 - b) * amt)
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

// Capabilities shared by every version — the one engine behind all platforms.
const ENGINE_FEATURES = [
  { icon: '🎯', title: 'Adaptive engine', desc: 'Every session targets the exact topics and difficulty where you lose marks.' },
  { icon: '🤖', title: 'Titan AI tutor', desc: 'Instant, step-by-step explanations and hints for any question.' },
  { icon: '🔁', title: 'Smart remediation', desc: 'Get it wrong and we drill the underlying concept until it sticks.' },
  { icon: '⏱️', title: 'Exam-mode mocks', desc: 'Timed papers with indicative scoring so you walk in ready.' },
]

export default function VersionLanding({ brand, onGetStarted, onSignIn }) {
  const accent = brand.accent
  const accentL = lighten(accent, 0.3)
  const L = brand.landing || {}
  const comingSoon = !!(L.comingSoon || (brand.subjects?.length ?? 0) === 0)
  const headline = L.headline || `${brand.productName || 'GradeFarm'}.`
  const subhead = L.subhead || brand.tagline
  const eyebrow = L.eyebrow || brand.tagline
  const bullets = L.bullets || []
  const primaryCta = L.primaryCta || (comingSoon ? 'Join the waitlist' : 'Start free')

  const btnPrimary = {
    padding: '14px 26px', borderRadius: 12, border: 'none', cursor: 'pointer',
    background: `linear-gradient(135deg, ${accentL}, ${accent})`, color: NAVY,
    fontSize: 15, fontWeight: 800, fontFamily: FONT_B, letterSpacing: '0.01em',
    boxShadow: `0 12px 32px ${hexA(accent, 0.35)}`,
  }
  const btnGhost = {
    padding: '14px 24px', borderRadius: 12, cursor: 'pointer',
    border: `1px solid ${hexA('#ffffff', 0.18)}`, background: 'transparent',
    color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: FONT_B,
  }

  return (
    <div style={{
      minHeight: '100vh', fontFamily: FONT_B, color: '#fff',
      background: `radial-gradient(900px 480px at 78% -8%, ${hexA(accent, 0.16)} 0%, transparent 60%), radial-gradient(640px 420px at -8% 92%, ${hexA(accent, 0.10)} 0%, transparent 55%), linear-gradient(180deg, #080b22 0%, #05071a 100%)`,
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 0' }}>
          <div style={{ fontFamily: FONT_D, fontSize: 22, letterSpacing: 1.4 }}>
            <span style={{ color: '#fff' }}>grade</span><span style={{ color: '#f1be43' }}>farm.</span>
            {brand.logoSuffix && <span style={{ color: accent, marginLeft: 7 }}>{brand.logoSuffix}</span>}
          </div>
          <button onClick={onSignIn} style={{ ...btnGhost, padding: '9px 18px', fontSize: 14 }}>Sign in</button>
        </nav>

        {/* Hero */}
        <header style={{ padding: '52px 0 28px', maxWidth: 760 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 13px', borderRadius: 999,
            background: hexA(accent, 0.12), border: `1px solid ${hexA(accent, 0.4)}`, marginBottom: 22,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, boxShadow: `0 0 8px ${accent}` }} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: accentL }}>{eyebrow}</span>
            {comingSoon && <span style={{ fontSize: 10, fontWeight: 800, color: NAVY, background: accent, padding: '2px 7px', borderRadius: 999, letterSpacing: '0.06em' }}>COMING SOON</span>}
          </div>
          <h1 style={{ fontFamily: FONT_D, fontSize: 'clamp(36px, 6vw, 60px)', lineHeight: 1.04, margin: '0 0 18px', letterSpacing: '-0.01em' }}>
            {headline}
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: 'rgba(255,255,255,0.66)', margin: '0 0 30px', maxWidth: 620 }}>
            {subhead}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <button onClick={onGetStarted} style={btnPrimary}>{primaryCta} →</button>
            <button onClick={onSignIn} style={btnGhost}>I already have an account</button>
          </div>
          {bullets.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '30px 0 0', display: 'grid', gap: 10 }}>
              {bullets.map((b) => (
                <li key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 15, color: 'rgba(255,255,255,0.78)' }}>
                  <span style={{ color: accent, fontWeight: 900, flexShrink: 0 }}>✓</span>{b}
                </li>
              ))}
            </ul>
          )}
        </header>

        {/* Built-in subjects (only when the platform ships them) */}
        {!comingSoon && (brand.subjects?.length ?? 0) > 0 && (
          <section style={{ padding: '34px 0' }}>
            <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '0 0 16px' }}>
              What you'll practise
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {brand.subjects.map((s) => (
                <div key={s.name} style={{
                  padding: '18px 18px', borderRadius: 14, background: hexA('#ffffff', 0.03),
                  border: `1px solid ${hexA(accent, 0.25)}`, boxShadow: `inset 0 1px 0 ${hexA('#ffffff', 0.05)}`,
                }}>
                  <div style={{ width: 36, height: 4, borderRadius: 999, background: accent, marginBottom: 12 }} />
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{s.name}</div>
                  {s.level && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{s.level}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Shared engine features */}
        <section style={{ padding: '34px 0 16px' }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '0 0 16px' }}>
            One proven engine, tuned for {brand.productName || 'you'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
            {ENGINE_FEATURES.map((f) => (
              <div key={f.title} style={{ padding: '20px 18px', borderRadius: 14, background: hexA('#ffffff', 0.025), border: `1px solid ${hexA('#ffffff', 0.08)}` }}>
                <div style={{ fontSize: 26, marginBottom: 10 }}>{f.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 6 }}>{f.title}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.6)' }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section style={{
          margin: '40px 0 64px', padding: '40px 28px', borderRadius: 20, textAlign: 'center',
          background: `linear-gradient(135deg, ${hexA(accent, 0.18)}, ${hexA(accent, 0.05)})`,
          border: `1px solid ${hexA(accent, 0.32)}`,
        }}>
          <h2 style={{ fontFamily: FONT_D, fontSize: 'clamp(24px, 4vw, 34px)', margin: '0 0 12px' }}>
            {comingSoon ? `${brand.productName} is launching soon.` : 'Ready to get started?'}
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.66)', maxWidth: 460, margin: '0 auto 22px', lineHeight: 1.6 }}>
            {comingSoon
              ? 'Be first in line when we open. Create an account and we’ll let you know the moment it’s live.'
              : 'Create a free account and start your first adaptive session in under a minute.'}
          </p>
          <button onClick={onGetStarted} style={btnPrimary}>{primaryCta} →</button>
        </section>

        {/* Footer */}
        <footer style={{ padding: '18px 0 36px', borderTop: `1px solid ${hexA('#ffffff', 0.07)}`, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', color: 'rgba(255,255,255,0.36)', fontSize: 12.5 }}>
          <span>© {new Date().getFullYear()} GradeFarm by Titanium Tutoring</span>
          <span>{brand.tagline}</span>
        </footer>
      </div>
    </div>
  )
}
