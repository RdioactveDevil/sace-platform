import { useNavigate } from 'react-router-dom'

const GOLD  = '#f1be43'
const NAVYD = '#080d28'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const SECTIONS = [
  {
    title: '1. Who We Are',
    body: `GradeFarm is operated by Titanium Tutoring, based in South Australia, Australia. This Privacy Policy explains how we collect, use, share, store, and protect your personal information when you use our platform.`,
  },
  {
    title: '2. Information We Collect',
    body: `We collect the following information when you register and use GradeFarm:\n\n• Account and profile data: name, email address, date of birth, school, year level, ATAR target, study goals and study hours. Your password is managed by our authentication provider and is never visible to us.\n• Study data: questions answered, answers given, scores, time taken, XP and streaks, study plans, and assessments you add.\n• Content you create: Titan AI conversations, notes or documents you upload, essays and other writing you submit, and messages with your tutor.\n• Live lessons: video and audio during lessons you join, and recordings of lessons your tutor records.\n• Payment data: the subjects you pay for and the status of your subscription. Card details are handled by our payment provider, Stripe; we never see or store your card number.\n• Technical data: IP address, browser type, device information, and how you use the site (see Cookies, below).`,
  },
  {
    title: '3. How We Use Your Information',
    body: `We use your information to:\n\n• Create and manage your account\n• Personalise your study experience, practice questions and topic recommendations\n• Provide AI features such as Titan AI explanations, feedback and essay marking\n• Generate performance analytics and progress reports, for you and for your tutor\n• Run live lessons and share lesson recordings with the people the lesson was for\n• Process payments for paid subjects\n• Send emails such as account messages, lesson and assignment reminders, and support responses\n• Improve the platform, including through aggregated analytics\n\nWe do not sell your personal data to third parties.`,
  },
  {
    title: '4. Who Can See Your Information',
    body: `• Your tutor: if you are on a tutor's student list, they can see your profile, progress, answers, assignments, writing and your messages with them.\n• Your classmates: if you are in a class, other members can see your display name, XP, level and streak on the class leaderboard.\n• Titanium Tutoring staff: our administrators can access account and study data to run the platform and help with support requests.\n• Service providers: the companies listed in section 6 process data on our behalf to provide GradeFarm.`,
  },
  {
    title: '5. AI Features',
    body: `When you use Titan AI, AI feedback, AI essay marking or other AI features, the content needed to produce a response is sent to our AI provider, Anthropic. This can include your first name, your messages and questions, your answers, and any notes or writing you submit. Please don't include personal details in your messages or uploads that aren't needed for your study.`,
  },
  {
    title: '6. Third-Party Services and Overseas Storage',
    body: `We use the following third-party services, which process your data on our behalf:\n\n• Supabase — database, accounts and file storage\n• Vercel — website hosting and application servers\n• Anthropic — AI features\n• Stripe — payments\n• Resend — email delivery\n• LiveKit — live video lessons\n• Cloudflare — storage of lesson recordings\n• Google Analytics — website usage analytics\n\nSome of these providers store or process data outside Australia, including in Japan (where our database and application servers are located) and the United States. Each provider has its own privacy policy governing its data practices.`,
  },
  {
    title: '7. Data Retention',
    body: `We retain your personal data for as long as your account is active. You may request deletion of your account and associated data at any time by contacting support@titaniumtutoring.com.au. We will process deletion requests within 30 days. We may keep payment records for as long as the law requires.`,
  },
  {
    title: '8. Data Storage and Security',
    body: `Your data is stored in our Supabase (PostgreSQL) database, protected by row-level security so each user can only reach the data they are allowed to see, and all connections are encrypted. Payments are processed by Stripe. While we take reasonable steps to protect your data, no internet transmission is 100% secure.`,
  },
  {
    title: '9. Children and Parents',
    body: `GradeFarm is used by school students, including primary school students. If you are under 18, a parent or guardian must agree to this policy on your behalf, and we recommend reading it together. A parent or guardian can contact us to access, correct or delete their child's information.`,
  },
  {
    title: '10. Your Rights',
    body: `Under the Privacy Act 1988 (Cth) and the Australian Privacy Principles, you have the right to:\n\n• Access the personal information we hold about you\n• Request correction of inaccurate data\n• Request deletion of your data\n• Opt out of reminder emails, using the unsubscribe link in any reminder or the Email reminders setting in My Account\n\nTo exercise these rights, contact us at support@titaniumtutoring.com.au. If you are not satisfied with our response, you can complain to the Office of the Australian Information Commissioner (oaic.gov.au).`,
  },
  {
    title: '11. Cookies and Local Storage',
    body: `GradeFarm uses your browser's local storage to keep you signed in and to remember preferences such as your theme and selected subject. We use Google Analytics, which sets cookies, to understand how the site is used. You can block these cookies in your browser settings or with Google's Analytics opt-out browser add-on.`,
  },
  {
    title: '12. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. We will notify registered users of material changes via email. Continued use of GradeFarm after changes are posted constitutes acceptance of the updated policy.`,
  },
  {
    title: '13. Contact Us',
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
          <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>Last updated: October 2026 · Titanium Tutoring</p>
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
