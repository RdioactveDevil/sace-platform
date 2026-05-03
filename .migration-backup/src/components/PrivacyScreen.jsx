import { useNavigate } from 'react-router-dom'

const GOLD  = '#f1be43'
const NAVYD = '#080d28'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const SECTIONS = [
  {
    title: '1. Who We Are',
    body: `GradeFarm is operated by Titanium Tutoring, based in South Australia, Australia. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our platform.`,
  },
  {
    title: '2. Information We Collect',
    body: `We collect the following information when you register and use GradeFarm:\n\n• Identity data: full name, date of birth, year level\n• Contact data: email address\n• Academic data: school name, ATAR target, subjects studied\n• Usage data: questions answered, scores, session activity, and performance analytics\n• Technical data: IP address, browser type, and device information`,
  },
  {
    title: '3. How We Use Your Information',
    body: `We use your information to:\n\n• Create and manage your account\n• Personalise your study experience and topic recommendations\n• Generate performance analytics and progress reports\n• Communicate platform updates and support responses\n• Improve the platform through aggregated, anonymised analytics\n\nWe do not sell your personal data to third parties.`,
  },
  {
    title: '4. Data Retention',
    body: `We retain your personal data for as long as your account is active. You may request deletion of your account and associated data at any time by contacting support@titaniumtutoring.com.au. We will process deletion requests within 30 days.`,
  },
  {
    title: '5. Data Storage and Security',
    body: `Your data is stored securely using Supabase (PostgreSQL), hosted on infrastructure compliant with industry security standards. We use row-level security and encrypted connections. While we take reasonable steps to protect your data, no internet transmission is 100% secure.`,
  },
  {
    title: '6. Children\'s Privacy',
    body: `GradeFarm is intended for students aged 13 and above. If you are under 18, we recommend reviewing this policy with a parent or guardian. We do not knowingly collect data from children under 13. If we become aware of such data, we will delete it promptly.`,
  },
  {
    title: '7. Third-Party Services',
    body: `We use the following third-party services which may process your data:\n\n• Supabase — database and authentication\n• OpenAI — AI-generated study tips (anonymised question context only, no personal identifiers)\n• Vercel — hosting infrastructure\n\nEach provider has their own privacy policy governing their data practices.`,
  },
  {
    title: '8. Your Rights',
    body: `Under Australian Privacy Law (Privacy Act 1988) and applicable regulations, you have the right to:\n\n• Access the personal information we hold about you\n• Request correction of inaccurate data\n• Request deletion of your data\n• Opt out of non-essential communications\n\nTo exercise these rights, contact us at support@titaniumtutoring.com.au`,
  },
  {
    title: '9. Cookies',
    body: `GradeFarm uses local browser storage (localStorage) to remember your session preferences such as theme and selected subject. We do not use third-party tracking cookies or advertising cookies.`,
  },
  {
    title: '10. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. We will notify registered users of material changes via email. Continued use of GradeFarm after changes are posted constitutes acceptance of the updated policy.`,
  },
  {
    title: '11. Contact Us',
    body: `For privacy-related enquiries or to exercise your rights, contact:\n\nTitanium Tutoring\nEmail: support@titaniumtutoring.com.au\nLocation: Adelaide, South Australia`,
  },
]

export default function PrivacyScreen() {
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
          <h1 style={{ fontFamily: FONT_D, fontSize: 'clamp(26px,4vw,36px)', margin: '0 0 12px', color: '#f1f5f9', letterSpacing: 1 }}>PRIVACY POLICY</h1>
          <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>Last updated: April 2026 · Titanium Tutoring</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {SECTIONS.map(s => (
            <div key={s.title}>
              <h2 style={{ fontFamily: FONT_D, fontSize: 15, color: GOLD, margin: '0 0 10px', letterSpacing: 0.5, fontWeight: 400 }}>{s.title}</h2>
              <p style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-line' }}>{s.body}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 56, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => navigate('/terms')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 18px', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: FONT_B }}>
            Terms of Service →
          </button>
          <button type="button" onClick={() => navigate(-1)} style={{ background: `linear-gradient(135deg,${GOLD},#f9d87a)`, border: 'none', borderRadius: 8, padding: '10px 18px', color: NAVYD, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
            Back to GradeFarm
          </button>
        </div>
      </div>
    </div>
  )
}
