import LegalPage from './LegalPage'


const SECTIONS = [
  {
    title: '1. Who We Are',
    body: `GradeFarm is operated by Titanium Tutoring, based in South Australia, Australia. This Privacy Policy explains how we collect, use, share, store, and protect your personal information when you use our platform.`,
  },
  {
    title: '2. Information We Collect',
    body: `We collect the following information when you register and use GradeFarm:\n\n• Account and profile data: name, email address, date of birth, school, year level, ATAR target, study goals and study hours, and the name and email of a parent or guardian when one is given. Your password is managed by our authentication provider and is never visible to us.\n• Study data: questions answered, answers given, scores, time taken, XP and streaks, study plans, and assessments you add.\n• Content you create: Titan AI conversations, notes or documents you upload, essays and other writing you submit, and messages with your tutor.\n• Live lessons: video and audio during lessons you join, and recordings of lessons your tutor records.\n• Payment data: the subjects you pay for and the status of your subscription. Card details are handled by our payment provider, Stripe; we never see or store your card number.\n• Technical data: IP address, browser type, device information, and how you use the site (see Cookies, below).`,
  },
  {
    title: '3. How We Use Your Information',
    body: `We use your information to:\n\n• Create and manage your account\n• Personalise your study experience, practice questions and topic recommendations\n• Provide AI features such as Titan AI explanations, feedback and essay marking\n• Generate performance analytics and progress reports, for you and for your tutor\n• Run live lessons and share lesson recordings with the people the lesson was for\n• Process payments for paid subjects\n• Send emails such as account messages, lesson and assignment reminders, and support responses\n• Improve the platform, including through aggregated analytics\n\nWe do not sell your personal data to third parties.`,
  },
  {
    title: '4. Who Can See Your Information',
    body: `• Your tutor: if you are on a tutor's student list, they can see your profile, progress, answers, assignments, writing and your messages with them.\n• Your classmates: if you are in a class, other members can see your display name, XP, level and streak on the class leaderboard. You can hide yourself from leaderboards in Account → Preferences; your tutors and our administrators can still see you there.\n• Titanium Tutoring staff: our administrators can access account and study data to run the platform and help with support requests.\n• Service providers: the companies listed in section 6 process data on our behalf to provide GradeFarm.`,
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
    body: `We retain your personal data for as long as your account is active. You can delete your account and associated data at any time in My Account under Security & privacy, which takes effect immediately and cancels any paid plan. You can also ask us to delete it by contacting support@titaniumtutoring.com.au, and we will process emailed requests within 30 days. We may keep payment records for as long as the law requires.`,
  },
  {
    title: '8. Data Storage and Security',
    body: `Your data is stored in our Supabase (PostgreSQL) database, protected by row-level security so each user can only reach the data they are allowed to see, and all connections are encrypted. Payments are processed by Stripe. While we take reasonable steps to protect your data, no internet transmission is 100% secure.`,
  },
  {
    title: '9. Children and Parents',
    body: `GradeFarm is used by school students, including primary school students. If you are under 18, a parent or guardian must agree to this policy on your behalf, and we recommend reading it together.\n\n• A parent or guardian can set up the account for their child, signing in with their own email and agreeing on the child's behalf.\n• If a student under 15 signs up themselves, we ask for a parent or guardian's email and send that person a link to confirm. Titan AI and the other AI features stay off until they confirm; practice questions work in the meantime.\n• A confirmed parent or guardian gets a weekly progress email about the student: questions answered, accuracy, days active, streak, and topics they are strong at or should work on. They can stop it with the link in any of those emails.\n• A parent or guardian can add more than one child under their email. Each child has their own account and data, and emails about any of them go to the parent.\n• A parent or guardian can run the free readiness check without an account. We keep their email, the child's first name and year level, the answers and the report, use the email to send the report (and tips only if they ask for them), and use a scrambled form of the IP address to limit how many checks one place can start.\n• Students under 15 are not shown on the leaderboard that every signed-in user can see. Class leaderboards are only visible to members of that class.\n\nA parent or guardian can contact us to access, correct or delete their child's information.`,
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
  return <LegalPage title="Privacy Policy" updated="October 2026" sections={SECTIONS} other={{ label: 'Terms of Service', path: '/terms' }} preLine />
}
