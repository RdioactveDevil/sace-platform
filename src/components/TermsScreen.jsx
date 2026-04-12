import { useNavigate } from 'react-router-dom'

const GOLD  = '#f1be43'
const NAVYD = '#080d28'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: `By creating an account and using GradeFarm, you agree to be bound by these Terms of Service. If you are under 18, you confirm that a parent or guardian has consented to your use of the platform. If you do not agree, please do not use GradeFarm.`,
  },
  {
    title: '2. Description of Service',
    body: `GradeFarm is an online study platform providing practice questions, performance analytics, and AI-assisted learning tools aligned to the South Australian Certificate of Education (SACE) curriculum. The platform is operated by Titanium Tutoring.`,
  },
  {
    title: '3. Account Registration',
    body: `You must provide accurate information when registering. You are responsible for maintaining the confidentiality of your password and for all activity under your account. Notify us immediately at support@titaniumtutoring.com.au if you suspect unauthorised access.`,
  },
  {
    title: '4. Acceptable Use',
    body: `You agree not to: share, sell, or redistribute platform content; attempt to reverse-engineer or scrape the platform; use the platform for any unlawful purpose; or impersonate another user. Violations may result in immediate account termination.`,
  },
  {
    title: '5. Intellectual Property',
    body: `All content on GradeFarm — including questions, explanations, and study materials — is owned by Titanium Tutoring or its licensors. You may not reproduce, distribute, or create derivative works without written permission.`,
  },
  {
    title: '6. Beta Access',
    body: `GradeFarm is currently in beta. Features may change, be removed, or be unavailable at any time. Beta access is provided free of charge. Titanium Tutoring makes no guarantees of uptime or data persistence during the beta period.`,
  },
  {
    title: '7. Disclaimer of Warranties',
    body: `GradeFarm is provided "as is" without warranties of any kind. We do not guarantee specific academic outcomes. The platform is a supplementary study tool and is not a replacement for school instruction or official SACE resources.`,
  },
  {
    title: '8. Limitation of Liability',
    body: `To the maximum extent permitted by law, Titanium Tutoring will not be liable for any indirect, incidental, or consequential damages arising from your use of GradeFarm.`,
  },
  {
    title: '9. Changes to Terms',
    body: `We may update these Terms at any time. Continued use of the platform after changes are posted constitutes acceptance of the new Terms. We will notify registered users of material changes via email.`,
  },
  {
    title: '10. Contact',
    body: `For any questions about these Terms, contact us at: support@titaniumtutoring.com.au`,
  },
]

export default function TermsScreen() {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: NAVYD, fontFamily: FONT_B, color: '#e2e8f0' }}>
      <style>{`@font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }`}</style>

      {/* Nav bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(8,13,40,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button type="button" onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, fontFamily: FONT_B, display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
          ← Back
        </button>
        <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
        <span style={{ fontFamily: FONT_D, fontSize: 15, letterSpacing: 0.5 }}>
          <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
        </span>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 32px 80px' }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Legal</div>
          <h1 style={{ fontFamily: FONT_D, fontSize: 'clamp(26px,4vw,36px)', margin: '0 0 12px', color: '#f1f5f9', letterSpacing: 1 }}>TERMS OF SERVICE</h1>
          <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>Last updated: April 2026 · Titanium Tutoring</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {SECTIONS.map(s => (
            <div key={s.title}>
              <h2 style={{ fontFamily: FONT_D, fontSize: 15, color: GOLD, margin: '0 0 10px', letterSpacing: 0.5, fontWeight: 400 }}>{s.title}</h2>
              <p style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.8, margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 56, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => navigate('/privacy')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 18px', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: FONT_B }}>
            Privacy Policy →
          </button>
          <button type="button" onClick={() => navigate(-1)} style={{ background: `linear-gradient(135deg,${GOLD},#f9d87a)`, border: 'none', borderRadius: 8, padding: '10px 18px', color: NAVYD, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
            Back to GradeFarm
          </button>
        </div>
      </div>
    </div>
  )
}
