import LegalPage from './LegalPage'


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
    body: `Every student can choose one subject to use free of charge, with a daily limit on questions, on written answers marked and on Titan AI use, as shown in the app. You can change your free subject at any time. Other subjects require a paid subscription. Prices are shown in the app and on our pricing page, in Australian dollars.`,
  },
  {
    title: '5. Billing, Renewal and Cancellation',
    body: `Paid subjects are billed weekly or monthly in advance, as you choose, through our payment provider, Stripe, and renew automatically each week or month until you cancel. If your first paid subject is billed weekly, its first week may cost a reduced introductory price, shown in the app and at checkout (for example, $2). You are charged the introductory price when you start, and from the second week the full weekly price shown at checkout, every week until you cancel. The introductory price covers the first week of one subject: if you add another subject during that week, it is charged at its normal price for the rest of the week. If you cancel during your first week, you keep access until the week ends and are not charged again. If your first paid subject is billed monthly, it may instead start with a free trial for the period shown at checkout. We take your card details when the trial starts but charge nothing until it ends; we will email you a reminder before then. If you cancel before the trial ends, you keep access until it ends and are not charged. Otherwise your plan starts and your card is charged on the day the trial ends. A free trial covers one subject: adding another subject during the trial ends it and starts billing straight away. Each account may have one introductory offer, either an introductory price or a free trial. If you add a subject part-way through a week, you are charged only for the rest of that week or month. You can stop paying for a subject at any time from your account. If you keep other paid subjects, it is removed straight away and the unused part of the week or month is credited to your next bill. If it is your last paid subject, you keep access until the end of the week or month you have paid for and are not charged again. If a payment fails, we will retry it, and paid subjects may be locked until it is paid. We will tell you before a price change applies to your plan, so you can cancel first. Except where the law requires otherwise, payments already made are not refundable. Nothing in these Terms excludes or limits your rights under the Australian Consumer Law.`,
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
  return <LegalPage title="Terms of Service" updated="November 2026" sections={SECTIONS} other={{ label: 'Privacy Policy', path: '/privacy' }} />
}
