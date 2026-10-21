import { useEffect, useState } from 'react'
import { GraduationCap, MessageSquare, Users, Video, Folder, Sparkles } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { fetchMyTutors } from '../lib/db'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const NAVYD = '#080d28'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

/** Spotlight tour of the Student Portal (run by WebsiteTutorialOverlay). */
export const PORTAL_TOUR_STEPS = [
  {
    path: '/portal',
    target: 'nav-portal',
    title: 'Your Student Portal',
    body: 'Everything from your tutor lives here, set apart from your practice tools. A gold badge appears when you have new messages.',
  },
  {
    path: '/portal',
    target: 'tabs-portal',
    title: 'Portal tabs',
    body: 'Overview, My Tutor, Messages, My Class, Lessons, Recordings and Resources. Switch between them along the top.',
  },
  {
    path: '/portal/tutor',
    target: 'portal-tutor',
    title: 'My Tutor',
    body: 'Who your tutor is, what they teach, their qualifications and the subjects they tutor you in.',
  },
  {
    path: '/portal/messages',
    target: 'portal-messages',
    title: 'Message your tutor',
    body: 'Stuck on a question or need to reschedule? Send your tutor a message. They get an email and reply right here.',
  },
  {
    path: '/portal/class',
    target: 'portal-class',
    title: 'My Class',
    body: 'The classes you’re in, who teaches them, your classmates and upcoming class lessons.',
  },
  {
    path: '/lessons',
    target: 'tabs-portal',
    title: 'Lessons, recordings & resources',
    body: 'Join live online lessons when they start, rewatch recorded ones, and download the notes and worksheets your tutor shares.',
  },
]

const FEATURES = [
  { icon: GraduationCap, title: 'My Tutor', body: 'Your tutor’s profile and what they cover with you' },
  { icon: MessageSquare, title: 'Messages', body: 'Ask your tutor questions any time' },
  { icon: Users, title: 'My Class', body: 'Your classes and classmates' },
  { icon: Video, title: 'Live lessons', body: 'Join lessons and rewatch recordings' },
  { icon: Folder, title: 'Resources', body: 'Notes and worksheets from your tutor' },
]

/** Shown once when a student first gets a tutor: the Student Portal has unlocked. */
export default function PortalWelcome({ theme, onTour, onClose }) {
  const t = THEMES[theme] || THEMES.dark
  const [tutorName, setTutorName] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchMyTutors().then(tu => { if (!cancelled && tu.length) setTutorName(tu[tu.length - 1].name) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="gf-portal-welcome-title"
      style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(4,6,18,0.78)', backdropFilter: 'blur(8px)', fontFamily: FONT_B }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes gf-pw-in { from { opacity: 0; transform: translateY(14px) scale(0.98) } to { opacity: 1; transform: none } }
        @keyframes gf-pw-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(241,190,67,0.45) } 50% { box-shadow: 0 0 0 14px rgba(241,190,67,0) } }
      `}</style>
      <div style={{ width: '100%', maxWidth: 480, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', boxSizing: 'border-box', borderRadius: 22, padding: '30px 26px 24px', background: t.bgCard, border: '1px solid rgba(241,190,67,0.35)', boxShadow: '0 30px 90px rgba(0,0,0,0.6)', animation: 'gf-pw-in 0.35s ease' }}>
        <div style={{ width: 62, height: 62, borderRadius: 18, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVYD, animation: 'gf-pw-glow 2s ease-in-out infinite' }}>
          <Sparkles size={30} aria-hidden="true" />
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: t.goldText, marginBottom: 6 }}>UNLOCKED</div>
        <h2 id="gf-portal-welcome-title" style={{ margin: 0, textAlign: 'center', fontFamily: FONT_D, fontWeight: 400, fontSize: 25, letterSpacing: '0.03em', color: t.text }}>Student Portal</h2>
        <p style={{ margin: '10px auto 20px', maxWidth: 360, textAlign: 'center', fontSize: 14, lineHeight: 1.6, color: t.textMuted }}>
          {tutorName ? <><strong style={{ color: t.text }}>{tutorName}</strong> is now your tutor. </> : 'You now have a tutor. '}
          Your new portal sits at the bottom of the sidebar, above Change Subject.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 12, background: t.bgSubtle }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(241,190,67,0.15)', color: t.goldText }}>
                <f.icon size={16} aria-hidden="true" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: t.text }}>{f.title}</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>{f.body}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: '12px', borderRadius: 11, border: `1px solid ${t.borderMid}`, background: 'transparent', color: t.textMuted, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
            Maybe later
          </button>
          <button type="button" onClick={onTour} autoFocus
            style={{ flex: 2, padding: '12px', borderRadius: 11, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVYD, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B, boxShadow: '0 6px 22px rgba(241,190,67,0.3)' }}>
            Show me around
          </button>
        </div>
      </div>
    </div>
  )
}
