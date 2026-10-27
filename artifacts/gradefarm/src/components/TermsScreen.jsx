import { useNavigate } from 'react-router-dom'

const GOLD  = '#f1be43'
const NAVYD = '#080d28'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: `By creating an account and using GradeFarm, you agree to be bound by these Terms of Service. If you are under 18, you confirm that a parent or guardian has agreed to these Terms on your behalf and will make or approve any payments. If you do not agree, please do not use GradeFarm.`,
  },
  {
    title: '2. Description of Service',
    body: `GradeFarm is an online study platform providing practice questions, performance analytics, AI-assisted learning tools (including Titan AI) and, for students who work with a tutor, messaging and live online lessons. Subjects follow Australian curricula such as the Australian Curriculum, SACE and VCE, and the subjects on offer change over time. The platform is operated by Titanium Tutoring.`,
  },
  {
    title: '3. Account Registration',
    body: `You must provide accurate information when registering. You are responsible for maintaining the confidentiality of your password and for all activity under your account. Notify us immediately at support@titaniumtutoring.com.au if you suspect unauthorised access.`,
  },
  {
    title: '4. Free and Paid Subjects',
    body: `Every student can choose one subject to use free of charge, with a daily limit on questions and on Titan AI use, as shown in the app. You can change your free subject at any time. Other subjects require a paid subscription. Prices are shown in the app and on our pricing page, in Australian dollars.`,
  },
  {
    title: '5. Billing, Renewal and Cancellation',
    body: `Paid subjects are billed weekly in advance through our payment provider, Stripe, and renew automatically each week until you cancel. Your first paid subject may start with a free trial for the period shown at checkout. We take your card details when the trial starts but charge nothing until it ends; we will email you a reminder before then. If you cancel before the trial ends, you keep access until it ends and are not charged. Otherwise your plan starts and your card is charged on the day the trial ends. A free trial covers one subject: adding another subject during the trial ends it and starts billing straight away. Each account may have one free trial. If you add a subject part-way through a week, you are charged only for the rest of that week. You can stop paying for a subject at any time from your account. If you keep other paid subjects, it is removed straight away and the unused part of the week is credited to your next bill. If it is your last paid subject, you keep access until the end of the week you have paid for and are not charged again. If a payment fails, we will retry it, and paid subjects may be locked until it is paid. We will tell you before a price change applies to your plan, so you can cancel first. Except where the law requires otherwise, payments already made are not refundable. Nothing in these Terms excludes or limits your rights under the Australian Consumer Law.`,
  },
  {
    title: '6. Tutors, Messages and Live Lessons',
    body: `If you work with a tutor through GradeFarm, your tutor can see your progress, assignments and answers, and you can message each other. Live lessons take place by video in your browser. A tutor may record a lesson: everyone in the call is shown when recording starts and stops, and the recording is shared with the people the lesson was for.`,
  },
  {
    title: '7. AI Features',
    body: `Titan AI and other AI features generate explanations, feedback and practice questions automatically. They can make mistakes, so check anything important with your teacher or tutor. Daily limits may apply.`,
  },
  {
    title: '8. Acceptable Use',
    body: `You agree not to: share your account or your access to paid subjects; share, sell, or redistribute platform content; attempt to reverse-engineer or scrape the platform; use the platform for any unlawful purpose; or impersonate another user. Violations may result in immediate account suspension or termination.`,
  },
  {
    title: '9. Intellectual Property',
    body: `All content on GradeFarm — including questions, explanations, and study materials — is owned by Titanium Tutoring or its licensors. You may not reproduce, distribute, or create derivative works without written permission. You keep ownership of anything you upload, such as notes or essays, and allow us to use it to provide GradeFarm to you.`,
  },
  {
    title: '10. Changes to the Service',
    body: `We are continually improving GradeFarm, so features and subjects may change. We aim to keep the platform available but cannot guarantee it will be uninterrupted or error-free. If we stop offering a subject you pay for, we will stop charging you for it.`,
  },
  {
    title: '11. Disclaimer of Warranties',
    body: `To the extent permitted by law, GradeFarm is provided "as is". We do not guarantee specific academic outcomes. The platform is a supplementary study tool and is not a replacement for school instruction or official curriculum and exam resources.`,
  },
  {
    title: '12. Limitation of Liability',
    body: `To the maximum extent permitted by law, Titanium Tutoring will not be liable for any indirect, incidental, or consequential damages arising from your use of GradeFarm.`,
  },
  {
    title: '13. Closing Your Account',
    body: `You can stop using GradeFarm at any time. Cancel any paid subjects from your account first, then contact us if you would like your account closed. We may suspend or close accounts that break these Terms.`,
  },
  {
    title: '14. Changes to Terms',
    body: `We may update these Terms at any time. Continued use of the platform after changes are posted constitutes acceptance of the new Terms. We will notify registered users of material changes via email.`,
  },
  {
    title: '15. Governing Law',
    body: `These Terms are governed by the laws of South Australia, Australia.`,
  },
  {
    title: '16. Contact',
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
          <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>Last updated: October 2026 · Titanium Tutoring</p>
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
