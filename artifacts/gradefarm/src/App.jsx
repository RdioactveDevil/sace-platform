import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation, useBlocker, createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { supabase } from './lib/supabase'
import { initObservability } from './lib/analytics'
import { notify, notifyError } from './lib/notify'
import { clearPendingInvite, pendingInvite } from './lib/pendingInvite'
import { takePendingCheckout, startCheckout, subjectTileFor } from './lib/pendingCheckout'
import ErrorBoundary from './components/ErrorBoundary'
import { lazyWithReload, reloadForNewVersion } from './lib/chunkReload'
import { getProfile, getStruggleMap, signOut, getQuestionsForSubjectTile, getSubscriptions, markTutorialComplete, updateProfile, hasTutoringAccess, fetchTutoringSessions, fetchUnreadMessageCount, syncCheckout, getFreeQuestionUsage, countFreeQuestion, respondToInvite, fetchMyDiagnostics, prepareDiagnostic } from './lib/db'
import { refreshManagedTopicsCache } from './lib/adminTopics'
import { loadManagedCurriculaTopics, fetchLiveCurricula } from './lib/curriculaDb'
import { THEMES } from './lib/theme'
import { getLevelProgress, rankAccuracy, RANKS } from './lib/engine'
import { Sun, Moon, Lock, TriangleAlert, Radio, Video, ClipboardList } from 'lucide-react'
import RankIcon from './components/RankIcon'
import { curriculumToSubjectTile, findTileForSubjectString, formatSubjectLabel, subjectHasFeature, writingSubjectFor, subjectAccess } from './lib/subjects'
import { getTopicConfigForSubject } from './lib/topicConfig'
import StudentLessonsScreen, { isJoinable } from './components/StudentLessonsScreen'
import StudentPortalScreen, { PORTAL_PATHS } from './components/StudentPortalScreen'
import PortalWelcome, { PORTAL_TOUR_STEPS } from './components/PortalWelcome'
import WebsiteTutorialOverlay from './components/WebsiteTutorialOverlay'
import ParentConsentBanner from './components/ParentConsentBanner'
import FamilySwitcher from './components/FamilySwitcher'
import GradeFarmWelcomeCelebration from './components/GradeFarmWelcomeCelebration'
import AdminRoute        from './components/AdminRoute'
import TutorRoute        from './components/TutorRoute'

// Vite fires this when a chunk's preloaded dependencies are gone after a
// deploy; reload to pick up the new build instead of erroring.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewVersion()) event.preventDefault()
  })
}

// Heavy / route-only screens are lazy-loaded so their dependencies (Excalidraw,
// LiveKit, MathLive, the entire admin bundle, marketing pages, etc.) are split
// out of the initial app bundle and only fetched when the route is visited.
const LandingPage           = lazyWithReload(() => import('./components/LandingPage'))
const Year6Page             = lazyWithReload(() => import('./components/Year6Page'))
const ReadinessCheckScreen  = lazyWithReload(() => import('./components/ReadinessCheckScreen'))
const AuthScreen            = lazyWithReload(() => import('./components/AuthScreen'))
const OnboardingScreen      = lazyWithReload(() => import('./components/OnboardingScreen'))
const TutorOnboardingScreen = lazyWithReload(() => import('./components/TutorOnboardingScreen'))
const TutorSignupScreen     = lazyWithReload(() => import('./components/TutorSignupScreen'))
const GetAccessScreen       = lazyWithReload(() => import('./components/GetAccessScreen'))
const TermsScreen           = lazyWithReload(() => import('./components/TermsScreen'))
const PrivacyScreen         = lazyWithReload(() => import('./components/PrivacyScreen'))
const AdminScreen           = lazyWithReload(() => import('./components/AdminScreen'))
const TutorScreen           = lazyWithReload(() => import('./components/TutorScreen'))
const TutorPlanGate         = lazyWithReload(() => import('./components/TutorPlan'))
const WritingScreen         = lazyWithReload(() => import('./components/WritingScreen'))
const DiagnosticScreen      = lazyWithReload(() => import('./components/DiagnosticScreen'))
const InviteScreen          = lazyWithReload(() => import('./components/InviteScreen'))
const PricingPage           = lazyWithReload(() => import('./components/PricingPage'))
const QuestionLabScreen     = lazyWithReload(() => import('./components/QuestionLabScreen'))
const ExamModeScreen        = lazyWithReload(() => import('./components/ExamModeScreen'))
const EssayMarkerScreen     = lazyWithReload(() => import('./components/EssayMarkerScreen'))
const SessionRoom           = lazyWithReload(() => import('./components/SessionRoom'))
const RecurringRoomPage     = lazyWithReload(() => import('./components/RecurringRoomPage'))
const ResetPasswordScreen   = lazyWithReload(() => import('./components/ResetPasswordScreen'))

// The signed-in study screens are split out too, so the landing and sign-in
// pages don't download the quiz engine, KaTeX and every progress screen.
// prefetchStudyScreens() warms them once someone signs in.
const SubjectPicker     = lazyWithReload(() => import('./components/SubjectPicker'))
const HomeScreen        = lazyWithReload(() => import('./components/HomeScreen'))
const QuizScreen        = lazyWithReload(() => import('./components/QuizScreen'))
const LearnScreen       = lazyWithReload(() => import('./components/LearnScreen'))
const LeaderboardScreen = lazyWithReload(() => import('./components/LeaderboardScreen'))
const ProfileScreen     = lazyWithReload(() => import('./components/ProfileScreen'))
const AccountScreen     = lazyWithReload(() => import('./components/AccountScreen'))
const HistoryScreen     = lazyWithReload(() => import('./components/HistoryScreen'))
const StudyPlanScreen   = lazyWithReload(() => import('./components/StudyPlanScreen'))

let studyScreensPrefetched = false
function prefetchStudyScreens() {
  if (studyScreensPrefetched) return
  studyScreensPrefetched = true
  // Most-used first.
  const run = () => [HomeScreen, QuizScreen, SubjectPicker, LearnScreen, ProfileScreen,
    StudyPlanScreen, HistoryScreen, LeaderboardScreen, AccountScreen].forEach(s => s.preload())
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 3000 })
  else setTimeout(run, 1500)
}

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

// Student navigation: three sections in the sidebar, each with tabs across the
// top of the page (SectionTabs) for its sub-pages. Pages with a `feature` only
// appear for subjects that switch it on (Admin → Curricula → Features); Exam
// Mode and Essay Marker are full-screen, so their tabs open those screens.
// Sections marked `tutoring` only show for students with a tutor or a lesson.
// The Student Portal (`separate`) sits apart from the rest, above Change Subject.
const NAV_SECTIONS = [
  { icon: 'home', label: 'Practice', id: 'practice', pages: [
    { id: 'home',  label: 'Question Bank', path: '/question-bank' },
    { id: 'exam',  label: 'Exam Mode',     path: '/exam', feature: 'exam_mode' },
  ]},
  { icon: 'learn', label: 'Learn', id: 'learn', pages: [
    { id: 'learn', label: 'Titan AI',      path: '/learn' },
    { id: 'essay', label: 'Essay Marker',  path: '/essay-lab', feature: 'essay_marker' },
  ]},
  { icon: 'portal', label: 'Student Portal', id: 'portal', tutoring: true, separate: true, pages: [
    { id: 'portal',     label: 'Overview',   path: '/portal' },
    { id: 'my-tutor',   label: 'My Tutor',   path: '/portal/tutor' },
    { id: 'messages',   label: 'Messages',   path: '/portal/messages' },
    { id: 'my-class',   label: 'My Class',   path: '/portal/class' },
    { id: 'lessons',    label: 'Lessons',    path: '/lessons' },
    { id: 'recordings', label: 'Recordings', path: '/recordings' },
    { id: 'class-res',  label: 'Resources',  path: '/class-resources' },
  ]},
  { icon: 'pen', label: 'Writing', id: 'writing', feature: 'writing', pages: [
    { id: 'w-essay',   label: 'Write an Essay', path: '/writing/essay' },
    { id: 'w-planner', label: 'Prompt Planner', path: '/writing/planner' },
    { id: 'w-history', label: 'Writing History', path: '/writing/history' },
    { id: 'w-study',   label: 'Writing Plan',   path: '/writing/study-plan' },
  ]},
  { icon: 'profile', label: 'Progress', id: 'progress', pages: [
    { id: 'profile',     label: 'Overview',    path: '/my-progress' },
    { id: 'study',       label: 'Study Plan',  path: '/study-plan' },
    { id: 'history',     label: 'History',     path: '/history' },
    { id: 'leaderboard', label: 'Leaderboard', path: '/leaderboard' },
  ]},
]
const NAV_ITEMS = NAV_SECTIONS.filter(sec => !sec.separate).map(sec => ({ icon: sec.icon, label: sec.label, id: sec.id, path: sec.pages[0].path, feature: sec.feature, tutoring: sec.tutoring }))
const LESSON_PATHS = ['/lessons', '/recordings', '/class-resources']

/** Whether this student has a tutor or a lesson (unlocks the Student Portal). */
function useHasTutoring(userId) {
  const [has, setHas] = useState(false)
  useEffect(() => {
    let cancelled = false
    hasTutoringAccess(userId).then(v => { if (!cancelled) setHas(v) })
    return () => { cancelled = true }
  }, [userId])
  return has
}

/** Unread tutor messages, refreshed every minute and whenever a conversation changes. */
function useUnreadMessages(enabled) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      fetchUnreadMessageCount().then(n => { if (!cancelled) setCount(n) }).catch(() => {})
    }
    refresh()
    const id = setInterval(refresh, 60_000)
    window.addEventListener('gf-messages-changed', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { cancelled = true; clearInterval(id); window.removeEventListener('gf-messages-changed', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [enabled])
  return count
}

/** A section's pages that the current subject has switched on. */
function visiblePages(section, subject) {
  return section.pages.filter(page => !page.feature || subjectHasFeature(subject, page.feature))
}

function sectionForPath(pathname) {
  const p = pathname === '/' || pathname === '/quiz' ? '/question-bank' : pathname
  return NAV_SECTIONS.find(sec => sec.pages.some(page => page.path === p)) || null
}

// Cohesive lucide-style icon family — uniform 18px viewBox, 1.5 stroke, rounded caps/joins.
function NavIcon({ name, size = 18, color = 'currentColor' }) {
  const S = { fill: 'none', stroke: color, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" style={{ flexShrink: 0, display: 'block' }} aria-hidden="true">
      {name === 'home'        && <><path d="M2.5 8.25 9 3l6.5 5.25V15a1 1 0 0 1-1 1h-3v-4.25h-3V16h-3a1 1 0 0 1-1-1Z" {...S} /></>}
      {name === 'learn'       && <><path d="M3 3.75A1.25 1.25 0 0 1 4.25 2.5H8v12.75H4.25A1.25 1.25 0 0 1 3 14V3.75Z" {...S} /><path d="M10 2.5h3.75A1.25 1.25 0 0 1 15 3.75V14a1.25 1.25 0 0 1-1.25 1.25H10V2.5Z" {...S} /></>}
      {name === 'profile'     && <><path d="M2.5 13.5 6.5 9l3 2.5L15.5 4.5" {...S} /><path d="M11.5 4.5h4v4" {...S} /></>}
      {name === 'leaderboard' && <><rect x="2.5" y="10" width="3.5" height="5.5" rx="0.75" {...S} /><rect x="7.25" y="6" width="3.5" height="9.5" rx="0.75" {...S} /><rect x="12" y="2" width="3.5" height="13.5" rx="0.75" {...S} /></>}
      {name === 'study'       && <><path d="M3 4h7" {...S} /><path d="M3 9h7" {...S} /><path d="M3 14h4.5" {...S} /><path d="M11 12.5 13 14.5 16 11" {...S} /></>}
      {name === 'history'     && <><circle cx="9" cy="9" r="6.5" {...S} /><path d="M9 5.25V9l2.75 1.5" {...S} /></>}
      {name === 'tutor'       && <><circle cx="9" cy="6.25" r="3" {...S} /><path d="M3.25 15.5a5.75 5.75 0 0 1 11.5 0" {...S} /></>}
      {name === 'admin'       && <><path d="M9 2 3.5 4v4.25c0 3.4 2.4 6.4 5.5 7.25 3.1-.85 5.5-3.85 5.5-7.25V4Z" {...S} /><path d="m6.75 9 1.75 1.75L11.5 7.5" {...S} /></>}
      {name === 'pen'         && <><path d="M12 3.5 6.5 9l-1 3.5 3.5-1L17.5 7 15 4.5l-3-1.5Z" {...S} /><path d="M3 15.5h5l1-1" {...S} /></>}
      {name === 'video'       && <><rect x="2" y="4.5" width="10" height="9" rx="1.5" {...S} /><path d="m12 8 4-2.25v6.5L12 10" {...S} /></>}
      {name === 'portal'      && <><path d="M1.75 6.5 9 3l7.25 3.5L9 10Z" {...S} /><path d="M4.5 8v3.75c0 1.1 2 2.25 4.5 2.25s4.5-1.15 4.5-2.25V8" {...S} /><path d="M16.25 6.5v4" {...S} /></>}
      {name === 'list-check'  && <><path d="M3 5.5h2" {...S} /><path d="M3 9h2" {...S} /><path d="M3 12.5h2" {...S} /><path d="m8.5 9 2 2 3.5-3.5" {...S} /></>}
    </svg>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
/** A portal entry above Change Subject (Student Portal, Tutor Portal, Admin), set apart from the study navigation. */
function PortalLink({ icon, title, subtitle, active, badge = 0, target, onClick }) {
  return (
    <button
      type="button"
      data-tutorial-target={target}
      className="gf-footer-btn"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      style={{
        width: '100%', padding: '10px 11px', borderRadius: 12, cursor: 'pointer', fontFamily: FONT_B, textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        border: `1px solid ${active ? 'rgba(241,190,67,0.55)' : 'rgba(255,255,255,0.09)'}`,
        background: active ? 'linear-gradient(135deg, rgba(241,190,67,0.22), rgba(241,190,67,0.07))' : 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)', transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = 'rgba(241,190,67,0.35)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)' }}
    >
      <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: '#06091f' }}>
        <NavIcon name={icon} size={18} color="currentColor" />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: active ? GOLD : '#f1f5f9' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span>
      </span>
      {badge > 0 && (
        <span aria-label={`${badge} unread message${badge === 1 ? '' : 's'}`} style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, background: GOLD, color: '#06091f', fontSize: 11, fontWeight: 800, lineHeight: '20px', textAlign: 'center', flexShrink: 0 }}>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

function SidebarContent({ profile, subject, onChangeSubject, onSignOut, theme, onToggleTheme, onClose }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { level, pct } = getLevelProgress(profile.xp, rankAccuracy(profile))
  const rank = RANKS[level]

  const go = (path) => { navigate(path); onClose?.() }

  // Single source of truth for nav items (incl. role-gated entries) so the active-state logic stays consistent.
  const hasTutoring = useHasTutoring(profile?.id)
  const isTutor = !!profile?.is_tutor
  const isAdmin = !!profile?.is_admin
  // Tutors see unread student messages on the Tutor Portal button, students on the Student Portal one.
  const unreadMessages = useUnreadMessages(hasTutoring || isTutor)
  const portalActive = sectionForPath(location.pathname)?.id === 'portal'
  const tutorActive = location.pathname.startsWith('/tutor')
  const adminActive = location.pathname.startsWith('/admin')
  // Study navigation only; the portals (student, tutor, admin) sit above Change Subject.
  const navItems = NAV_ITEMS.filter(item => (!item.feature || subjectHasFeature(subject, item.feature)) && (!item.tutoring || hasTutoring))
  const isActivePath = (p) =>
    sectionForPath(location.pathname)?.pages[0].path === p ||
    location.pathname === p ||
    (p === '/home' && location.pathname === '/') ||
    (p === '/question-bank' && location.pathname === '/quiz') ||
    // Writing module uses /writing/* routes
    (p.startsWith('/writing/') && location.pathname === p)

  return (
    <div className="gf-sidebar" style={{
      display: 'flex', flexDirection: 'column', height: '100%', fontFamily: FONT_B,
      // Layered premium-dark surface: deeper base + radial highlight + top inner highlight + soft outer shadow.
      background: `radial-gradient(120% 60% at 0% 0%, rgba(241,190,67,0.06) 0%, rgba(241,190,67,0) 55%), linear-gradient(180deg, #07091f 0%, #05071a 100%)`,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), inset -1px 0 0 rgba(255,255,255,0.04), 4px 0 24px rgba(0,0,0,0.35)',
      // The whole panel scrolls (short screens, phone drawer); the nav list grows
      // to keep the portal buttons and Change Subject at the bottom when there's room.
      position: 'relative', overflowX: 'hidden', overflowY: 'auto', overscrollBehavior: 'contain', scrollbarWidth: 'thin',
    }}>
      <style>{`
        .gf-nav-btn { position: relative; isolation: isolate; }
        .gf-nav-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(241,190,67,0.55), 0 0 0 4px rgba(241,190,67,0.15) !important; }
        .gf-nav-btn[data-active="true"] { background: linear-gradient(135deg, rgba(241,190,67,0.16), rgba(241,190,67,0.06)) !important; border-color: rgba(241,190,67,0.28) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 0 rgba(0,0,0,0.2) !important; }
        /* Preserve a visible focus ring even when the focused nav item is the active one */
        .gf-nav-btn[data-active="true"]:focus-visible { box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 2px rgba(241,190,67,0.65), 0 0 0 4px rgba(241,190,67,0.18) !important; }
        .gf-nav-btn[data-active="false"]:hover { background: rgba(255,255,255,0.04) !important; color: #f1f5f9 !important; border-color: rgba(255,255,255,0.06) !important; }
        .gf-nav-btn[data-active="false"]:hover .gf-nav-icon { color: #f1f5f9 !important; }
        .gf-icon-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(241,190,67,0.5) !important; }
        .gf-footer-btn:focus-visible { outline: none; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 2px rgba(241,190,67,0.55), 0 0 0 4px rgba(241,190,67,0.15) !important; }
      `}</style>

      {/* Header — logo + theme toggle, with extra breathing room */}
      <div style={{ padding: '20px 18px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, position: 'relative' }}>
        <div onClick={() => go('/home')} style={{ cursor: 'pointer', lineHeight: 1 }}>
          <span style={{ fontFamily: FONT_D, fontSize: 19, letterSpacing: 1.5 }}>
            <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
          </span>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.32)', fontFamily: FONT_B, letterSpacing: '0.08em', marginTop: 5, textTransform: 'uppercase' }}>by Titanium Tutoring</div>
        </div>
        <button
          className="gf-icon-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(241,190,67,0.35)'; e.currentTarget.style.background = 'rgba(241,190,67,0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
        >
          <span style={{ display: 'flex', color: GOLD }}>{theme === 'dark' ? <Moon size={12} aria-hidden="true" /> : <Sun size={12} aria-hidden="true" />}</span>
          <div style={{ width: 26, height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.08)', position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 2, left: theme === 'dark' ? 2 : 12, width: 10, height: 10, borderRadius: '50%', background: GOLD, transition: 'left 0.25s cubic-bezier(0.34,1.56,0.64,1)', boxShadow: `0 0 6px ${GOLD}80` }} />
          </div>
        </button>
      </div>

      {/* Hairline divider */}
      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07) 20%, rgba(255,255,255,0.07) 80%, transparent)', flexShrink: 0 }} />

      {/* Subject context chip */}
      <div style={{ padding: '14px 18px 10px', flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Studying</div>
        <div
          data-tutorial-target="subject-chip"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 10px 5px 8px', borderRadius: 999, background: 'linear-gradient(135deg, rgba(241,190,67,0.12), rgba(241,190,67,0.05))', border: '1px solid rgba(241,190,67,0.22)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, flexShrink: 0, boxShadow: `0 0 6px ${GOLD}` }} />
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.78)', fontWeight: 600, letterSpacing: '0.02em' }}>{[subject?.name, subject?.stage].filter(Boolean).join(' · ') || 'No subject selected'}</div>
        </div>
      </div>

      {/* Profile / XP card */}
      <div style={{ padding: '0 14px 14px', flexShrink: 0 }}>
        <div
          onClick={() => go('/my-account')}
          style={{ padding: '12px 12px 14px', borderRadius: 14, cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s', background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))', border: '1px solid rgba(255,255,255,0.06)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025))'; e.currentTarget.style.borderColor = 'rgba(241,190,67,0.18)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, color: '#06091f', boxShadow: `0 4px 14px ${GOLD}55, inset 0 1px 0 rgba(255,255,255,0.4)` }}>
                {profile.display_name[0].toUpperCase()}
              </div>
              <div style={{ position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: '50%', background: '#0b1030', border: '2px solid #07091f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: GOLD, fontWeight: 800 }}>{level}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{profile.display_name}</div>
              <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, marginTop: 2, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 4 }}><RankIcon level={level} size={12} /> {rank}</div>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', flexShrink: 0 }}>›</div>
          </div>
          <div style={{ position: 'relative', background: 'rgba(255,255,255,0.06)', borderRadius: 999, height: 4, overflow: 'hidden', marginBottom: 6, boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.25)' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, transition: 'width 0.8s ease', borderRadius: 999, boxShadow: `0 0 8px ${GOLD}80` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.36)', letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase' }}>Level {level}</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{profile.xp.toLocaleString()} XP</span>
          </div>
        </div>
      </div>

      {/* Hairline divider */}
      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent)', flexShrink: 0 }} />

      {/* Nav items */}
      <div style={{ padding: '14px 14px 6px', flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', paddingLeft: 4 }}>Navigate</div>
      </div>
      <nav style={{ flex: '1 0 auto', padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {navItems.map(item => {
          const active = isActivePath(item.path)
          return (
            <button
              key={item.id}
              type="button"
              className="gf-nav-btn"
              data-active={active}
              data-tutorial-target={`nav-${item.id}`}
              onClick={() => go(item.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 11,
                padding: '10px 12px', borderRadius: 10,
                border: '1px solid transparent', background: 'transparent',
                color: active ? GOLD : 'rgba(255,255,255,0.62)',
                fontSize: 13.5, fontWeight: active ? 700 : 500,
                cursor: 'pointer', fontFamily: FONT_B, textAlign: 'left', width: '100%',
                transition: 'color 0.18s, background 0.18s, border-color 0.18s, box-shadow 0.18s',
                letterSpacing: active ? '-0.01em' : '0',
              }}
            >
              <span className="gf-nav-icon" style={{ display: 'flex', color: active ? GOLD : 'rgba(255,255,255,0.55)', transition: 'color 0.18s' }}>
                <NavIcon name={item.icon} size={17} color="currentColor" />
              </span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {/* Gold indicator dot for the active item */}
              {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, boxShadow: `0 0 8px ${GOLD}, 0 0 0 2px rgba(241,190,67,0.18)`, flexShrink: 0 }} />}
            </button>
          )
        })}
      </nav>

      {/* Hairline divider */}
      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent)', flexShrink: 0 }} />

      {/* Footer actions */}
      <div style={{ padding: '12px 14px 16px', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        {/* Portals — kept apart from the study navigation above */}
        {(hasTutoring || isTutor || isAdmin) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
            {hasTutoring && (
              <PortalLink icon="portal" title="Student Portal" subtitle="Your tutor & lessons" target="nav-portal"
                active={portalActive} badge={isTutor ? 0 : unreadMessages} onClick={() => go('/portal')} />
            )}
            {isTutor && (
              <PortalLink icon="tutor" title="Tutor Portal" subtitle="Students & lessons" target="nav-tutor"
                active={tutorActive} badge={unreadMessages} onClick={() => go('/tutor')} />
            )}
            {isAdmin && (
              <PortalLink icon="admin" title="Admin" subtitle="Manage gradefarm." target="nav-admin"
                active={adminActive} onClick={() => go('/admin')} />
            )}
          </div>
        )}
        <FamilySwitcher profile={profile} />
        <button
          data-tutorial-target="change-subject"
          className="gf-footer-btn"
          onClick={onChangeSubject}
          style={{ width: '100%', height: 36, padding: '0 12px', borderRadius: 10, border: '1px solid rgba(241,190,67,0.28)', background: 'linear-gradient(135deg, rgba(241,190,67,0.12), rgba(241,190,67,0.05))', color: GOLD, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, letterSpacing: '0.01em' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(241,190,67,0.20), rgba(241,190,67,0.08))'; e.currentTarget.style.borderColor = 'rgba(241,190,67,0.45)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(241,190,67,0.12), rgba(241,190,67,0.05))'; e.currentTarget.style.borderColor = 'rgba(241,190,67,0.28)' }}
        >⇄ Change Subject</button>
        <button
          className="gf-footer-btn"
          onClick={onSignOut}
          style={{ width: '100%', height: 32, padding: '0 12px', borderRadius: 10, border: '1px solid transparent', background: 'transparent', color: 'rgba(255,255,255,0.32)', fontSize: 11.5, cursor: 'pointer', fontFamily: FONT_B, transition: 'color 0.15s, background 0.15s, border-color 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.32)'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
        >Sign out</button>
      </div>
    </div>
  )
}


// ── Locked Subject Screen ─────────────────────────────────────────────────────
function LockedSubjectScreen({ subject, reason = 'locked', onChangeSubject, theme }) {
  const t = THEMES[theme]
  const navigate = useNavigate()
  const exam = reason === 'exam'
  return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24, fontFamily: "'Plus Jakarta Sans', sans-serif", textAlign: 'center' }}>
      <Lock size={48} color={GOLD} aria-hidden="true" />
      <h2 style={{ fontSize: 22, fontWeight: 800, color: t.text, margin: 0 }}>{exam ? 'Exam Mode is for paid subjects' : `Unlock ${formatSubjectLabel(subject)}`}</h2>
      <p style={{ fontSize: 14, color: t.textMuted, maxWidth: 380, lineHeight: 1.6, margin: 0 }}>
        {exam
          ? <>Full practice exams aren't part of the free subject. Subscribe to <strong style={{ color: t.text }}>{formatSubjectLabel(subject)}</strong> to sit them — you can cancel any time.</>
          : <>You don't have access to <strong style={{ color: t.text }}>{formatSubjectLabel(subject)}</strong> yet. Try it as your free subject or subscribe — you can cancel any time.</>}
      </p>
      <button onClick={() => navigate('/get-access', { state: { subject } })} style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: GOLD, color: '#0c1037', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        See plans →
      </button>
      <button onClick={onChangeSubject} style={{ padding: '10px 20px', borderRadius: 10, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 13, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        {exam ? '← Back to practice' : '← Back to subject picker'}
      </button>
    </div>
  )
}

/** A tutor-included subject whose diagnostic the student hasn't done yet: it comes first. */
function DiagnosticDueScreen({ subject, diagnostic, onChangeSubject, theme }) {
  const t = THEMES[theme]
  const navigate = useNavigate()
  const FONT = "'Plus Jakarta Sans', sans-serif"
  return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24, fontFamily: FONT, textAlign: 'center' }}>
      <ClipboardList size={48} color={GOLD} aria-hidden="true" />
      <h2 style={{ fontSize: 22, fontWeight: 800, color: t.text, margin: 0 }}>First, a quick check-in</h2>
      <p style={{ fontSize: 14, color: t.textMuted, maxWidth: 420, lineHeight: 1.6, margin: 0 }}>
        Your tutor wants to see where you're at in <strong style={{ color: t.text }}>{formatSubjectLabel(subject)}</strong> before you start practising.
        It's 20 questions with no time limit. Your results go to your tutor and set up your practice.
      </p>
      <button onClick={() => navigate(`/diagnostic/${encodeURIComponent(diagnostic.token)}`)} style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: GOLD, color: '#0c1037', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT }}>
        Start the diagnostic →
      </button>
      <button onClick={onChangeSubject} style={{ padding: '10px 20px', borderRadius: 10, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
        ← Back to subject picker
      </button>
    </div>
  )
}

/** Year level (7–12) a subject's stage points to: "Year 11" → 11, SACE "Stage 1"/"Stage 2" → 11/12. */
function yearFromStage(stage) {
  const year = /year\s*(\d{1,2})/i.exec(stage || '')
  if (year) return Number(year[1])
  const sace = /stage\s*([12])/i.exec(stage || '')
  return sace ? 10 + Number(sace[1]) : null
}

// ── AppShell ──────────────────────────────────────────────────────────────────
/** Tabs for the sub-pages of the current sidebar section (e.g. Progress → Overview · Study Plan · …). */
function SectionTabs({ theme, subject }) {
  const navigate = useNavigate()
  const location = useLocation()
  const t = THEMES[theme]
  const activeRef = useRef(null)
  const section = sectionForPath(location.pathname)
  const pages = section ? visiblePages(section, subject) : []
  const current = location.pathname === '/quiz' ? '/question-bank' : location.pathname
  // On narrow screens the strip scrolls sideways; keep the current tab in view.
  useEffect(() => {
    const el = activeRef.current
    const strip = el?.parentElement
    if (el && strip && strip.scrollWidth > strip.clientWidth) {
      const offset = el.getBoundingClientRect().left - strip.getBoundingClientRect().left
      strip.scrollLeft += offset - (strip.clientWidth - el.offsetWidth) / 2
    }
  }, [current])
  if (pages.length < 2) return null
  return (
    // The bottom rule is an inset shadow (painted under the tabs) rather than a
    // border the active underline overlaps with a negative margin: that 1px
    // overflow gave the strip a scrollbar on Windows.
    <div role="tablist" aria-label={section.label} data-tutorial-target={`tabs-${section.id}`} className="gf-section-tabs"
      style={{ display: 'flex', gap: 4, padding: '10px 20px 0', boxShadow: `inset 0 -1px 0 ${t.border}`, flexShrink: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', fontFamily: FONT_B }}>
      {pages.map(page => {
        const active = page.path === current
        return (
          <button key={page.id} type="button" role="tab" aria-selected={active} ref={active ? activeRef : undefined}
            onClick={() => navigate(page.path)}
            style={{
              padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: FONT_B, fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? GOLD : t.textMuted,
              borderBottom: `2px solid ${active ? GOLD : 'transparent'}`,
            }}>
            {page.label}
          </button>
        )
      })}
    </div>
  )
}

/** Banner across student pages while one of their lessons can be joined. */
function LiveLessonBanner({ profile, theme }) {
  const t = THEMES[theme]
  const navigate = useNavigate()
  const location = useLocation()
  const hasTutoring = useHasTutoring(profile?.id)
  const [sessions, setSessions] = useState([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!hasTutoring) return undefined
    let cancelled = false
    const poll = () => {
      setNow(Date.now())
      fetchTutoringSessions({ from: Date.now() - 6 * 3600_000, to: Date.now() + 3600_000, limit: 20 })
        .then(rows => { if (!cancelled) setSessions(rows || []) })
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [hasTutoring])

  const lesson = sessions.find(s => isJoinable(s, now))
  if (!lesson || location.pathname === '/lessons') return null
  const started = lesson.status === 'active' || now >= new Date(lesson.scheduled_at).getTime()
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', flexShrink: 0, fontFamily: FONT_B, borderBottom: `1px solid ${t.border}`, background: theme === 'dark' ? 'rgba(241,190,67,0.10)' : '#fff8e6' }}>
      <Radio size={17} color={t.goldText} aria-hidden="true" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <strong>{lesson.title || 'Your lesson'}</strong>
        <span style={{ color: t.textMuted }}> {started ? 'is happening now' : 'is about to start'} · with {lesson.other_party_name || 'your tutor'}</span>
      </div>
      <button type="button" onClick={() => navigate(`/session/${lesson.id}`)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', borderRadius: 9, border: 'none', background: GOLD, color: '#171724', fontFamily: FONT_B, fontSize: 13, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>
        <Video size={15} aria-hidden="true" /> Join
      </button>
    </div>
  )
}

function AppShell({ children, profile, subject, onChangeSubject, onSignOut, theme, onToggleTheme, tutorialOverlay = null, onProfileUpdated }) {
  const t = THEMES[theme]
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 860)
  const navigate = useNavigate()
  const location = useLocation()

  // The first time a student has a tutor, announce the Student Portal and
  // offer a tour. Remembered per browser.
  const hasTutoring = useHasTutoring(profile?.id)
  const portalWelcomeKey = `gf-portal-welcome-${profile?.id}`
  const [portalWelcome, setPortalWelcome] = useState(false)
  const [portalTour, setPortalTour] = useState(false)
  useEffect(() => {
    if (!hasTutoring || tutorialOverlay || location.pathname === '/quiz') return
    try { if (!localStorage.getItem(portalWelcomeKey)) setPortalWelcome(true) } catch {}
  }, [hasTutoring, tutorialOverlay, location.pathname, portalWelcomeKey])
  const closePortalWelcome = (tour) => {
    try { localStorage.setItem(portalWelcomeKey, new Date().toISOString()) } catch {}
    setPortalWelcome(false)
    if (tour) { navigate('/portal'); setPortalTour(true) }
  }

  useEffect(() => {
    const open = () => setMenuOpen(true)
    const close = () => setMenuOpen(false)
    window.addEventListener('gf-tutorial-open-sidebar', open)
    window.addEventListener('gf-tutorial-close-sidebar', close)
    return () => {
      window.removeEventListener('gf-tutorial-open-sidebar', open)
      window.removeEventListener('gf-tutorial-close-sidebar', close)
    }
  }, [])

  useEffect(() => {
    const h = () => { setIsMobile(window.innerWidth < 860); if (window.innerWidth >= 860) setMenuOpen(false) }
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const sProps = { profile, subject, onChangeSubject, onSignOut, theme, onToggleTheme }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', height: isMobile ? 'auto' : '100vh', overflow: isMobile ? 'visible' : 'hidden', background: t.bg }}>
      <style>{`@font-face{font-family:'Sifonn Pro';src:url('/SIFONN_PRO.otf') format('opentype');font-display:swap;}@keyframes slideIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}@media(max-width:860px){.qs-right-col{height:auto!important;overflow:visible!important}}`}</style>

      {!isMobile && (
        <div style={{ width: 252, flexShrink: 0, position: 'sticky', top: 0, height: '100vh', borderRight: '1px solid rgba(255,255,255,0.07)', zIndex: 10 }}>
          <SidebarContent {...sProps} />
        </div>
      )}

      {isMobile && menuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }}>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: 272, height: '100dvh', animation: 'slideIn 0.25s ease', zIndex: 1000, borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <SidebarContent {...sProps} onClose={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: isMobile ? '100vh' : 0, overflow: isMobile ? 'visible' : 'hidden' }}>
        {isMobile && (
          <div style={{ position: 'sticky', top: 0, zIndex: 100, background: '#080d28', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <button onClick={() => setMenuOpen(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ width: 20, height: 2, background: '#fff', borderRadius: 2 }} />
              <div style={{ width: 14, height: 2, background: '#fff', borderRadius: 2 }} />
              <div style={{ width: 20, height: 2, background: '#fff', borderRadius: 2 }} />
            </button>
            <span onClick={() => navigate('/home')} style={{ fontFamily: FONT_D, fontSize: 17, letterSpacing: 1, cursor: 'pointer' }}>
              <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', color: GOLD }}>{theme === 'dark' ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}</button>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#080d28' }}>
                {profile.display_name[0].toUpperCase()}
              </div>
            </div>
          </div>
        )}
        <LiveLessonBanner profile={profile} theme={theme} />
        <ParentConsentBanner profile={profile} theme={theme} onProfileUpdated={onProfileUpdated} />
        <SectionTabs theme={theme} subject={subject} />
        <div style={{ flex: isMobile ? '0 0 auto' : 1, minHeight: isMobile ? 'auto' : 0, overflow: isMobile ? 'visible' : 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Suspense fallback={<RouteFallback theme={theme} />}>{children}</Suspense>
        </div>
      </div>
      {tutorialOverlay && <WebsiteTutorialOverlay {...tutorialOverlay} />}
      {portalWelcome && <PortalWelcome theme={theme} onTour={() => closePortalWelcome(true)} onClose={() => closePortalWelcome(false)} />}
      {portalTour && <WebsiteTutorialOverlay theme={theme} steps={PORTAL_TOUR_STEPS} onFinish={() => setPortalTour(false)} />}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
// ── AppShellScreens — screens stay mounted once opened, toggled via display:none ───
// This prevents unmount/remount on tab switch — no reload flashes, state preserved.
// A screen isn't mounted until it's first opened, so landing on the Question
// Bank doesn't also load History, the leaderboard, Titan AI's quota, etc.
function AppShellScreens({
  profile, questions, struggleMap, setStruggleMap, subject,
  onStartSession, onChangeSubject, onSignOut, theme, onToggleTheme, quizSubtopics, setQuizSubtopics,
  assignmentsVersion, lastSessionAt, onOpenLearn,
  tutorialOverlay,
  onReplayFeatureTour,
  onProfileUpdated,
  // learn state
  phase, setPhase, topic, setTopic, messages, setMessages,
  interests, setInterests, docContext, setDocContext, docName, setDocName,
  questionContext, setQuestionContext, onConsolidate,
}) {
  const navigate   = useNavigate()
  const location   = useLocation()
  const screen     = location.pathname.replace('/', '') // e.g. 'question-bank'
  const commonProps = { theme, onToggleTheme }
  const learnState  = { phase, setPhase, topic, setTopic, messages, setMessages, interests, setInterests, docContext, setDocContext, docName, setDocName, questionContext, setQuestionContext, onConsolidate }
  const shellProps  = { ...commonProps, profile, subject, onChangeSubject, onSignOut, tutorialOverlay, onProfileUpdated }
  const GOLD = '#f1be43'
  const FONT_B = "'Plus Jakarta Sans', sans-serif"

  const onLessons = LESSON_PATHS.includes(location.pathname)
  const onPortal = PORTAL_PATHS.includes(location.pathname)
  const hasTutoring = useHasTutoring(profile?.id)
  const show = (s) => screen === s ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'visible' } : { display: 'none' }
  const opened = useRef(new Set())
  opened.current.add(screen)
  const wasOpened = (s) => opened.current.has(s)

  // Writing workspace — only for subjects with Writing switched on.
  const writingSubject = writingSubjectFor(subject)
  const onWriting = screen === 'writing' || screen.startsWith('writing/')
  if (onWriting && !writingSubject) return <Navigate to="/question-bank" replace />
  if (screen === 'writing') return <Navigate to="/writing/essay" replace />

  return (
    <AppShell {...shellProps}>
      {writingSubject && (
        <div style={onWriting ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : { display: 'none' }}>
          <WritingScreen subject={writingSubject} profile={profile} theme={theme} onBack={onChangeSubject} />
        </div>
      )}
      {wasOpened('question-bank') && <div style={show('question-bank')}>
        <HomeScreen {...commonProps}
          profile={profile} struggleMap={struggleMap}
          questions={questions} subject={subject}
          assignmentsVersion={assignmentsVersion}
          onStartSession={onStartSession} />
      </div>}
      {wasOpened('learn') && <div style={show('learn')}>
        <LearnScreen {...commonProps} {...learnState}
          profile={profile} struggleMap={struggleMap}
          questions={questions} subject={subject}
          onBack={() => navigate('/question-bank')} />
      </div>}
      {wasOpened('leaderboard') && <div style={show('leaderboard')}>
        <LeaderboardScreen {...commonProps} profile={profile} embedded />
      </div>}
      {wasOpened('my-progress') && <div style={show('my-progress')}>
        <ProfileScreen {...commonProps}
          profile={profile} questions={questions} subject={subject}
          struggleMap={struggleMap} embedded
          onStartSession={onStartSession}
          onOpenStudyPlan={() => navigate('/study-plan')} />
      </div>}
      {wasOpened('study-plan') && <div style={show('study-plan')}>
        <StudyPlanScreen
          profile={profile} questions={questions} struggleMap={struggleMap}
          theme={theme} onStartSession={onStartSession} subject={subject}
          lastSessionAt={lastSessionAt} onOpenLearn={onOpenLearn} />
      </div>}
      <div style={onPortal ? show(screen) : { display: 'none' }}>
        <StudentPortalScreen profile={profile} theme={theme} active={onPortal} hasTutoring={hasTutoring} />
      </div>
      <div style={onLessons ? show(screen) : { display: 'none' }}>
        <StudentLessonsScreen theme={theme} active={onLessons} />
      </div>
      {wasOpened('history') && <div style={show('history')}>
        <HistoryScreen {...commonProps} profile={profile} embedded active={screen === 'history'} onStartSession={onStartSession} />
      </div>}
      {wasOpened('my-account') && <div style={show('my-account')}>
        <AccountScreen {...commonProps} profile={profile} onSignOut={onSignOut} onChangeSubject={onChangeSubject} onReplayFeatureTour={onReplayFeatureTour} onProfileUpdated={onProfileUpdated} />
      </div>}
    </AppShell>
  )
}

function gfTutorialStorageKey(userId) {
  return `gf-tutorial-done-${userId}`
}

/** Persist tutorial completion client-side so auth/session refreshes cannot resurrect the tour. */
function mergeTutorialFromStorage(userId, prof) {
  if (!prof || !userId) return prof
  try {
    const stored = localStorage.getItem(gfTutorialStorageKey(userId))
    if (stored && !prof.app_tutorial_completed_at) {
      return { ...prof, app_tutorial_completed_at: stored }
    }
  } catch (_) {}
  return prof
}

function RouteFallback({ theme }) {
  const t = THEMES[theme] || {}
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg || '#0c1037' }}>
      <style>{`@keyframes gf-routespin { to { transform: rotate(360deg); } }`}</style>
      <div
        role="status"
        aria-label="Loading"
        style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(241,190,67,0.18)', borderTopColor: GOLD, animation: 'gf-routespin 0.8s linear infinite' }}
      />
    </div>
  )
}

function NavBlockerModal({ blocker, theme }) {
  const t = THEMES[theme]
  if (blocker.state !== 'blocked') return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(8px)' }}>
      <div style={{ background: t?.bgCard || '#0c1037', border: `1px solid rgba(241,190,67,0.3)`, borderRadius: 20, padding: '36px 32px', maxWidth: 360, width: '90%', textAlign: 'center', fontFamily: FONT_B }}>
        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center' }}><TriangleAlert size={36} color={GOLD} aria-hidden="true" /></div>
        <div style={{ fontFamily: FONT_D, fontSize: 20, color: t?.text || '#f1f5f9', marginBottom: 8, letterSpacing: 0.5 }}>LEAVE QUIZ?</div>
        <div style={{ fontSize: 14, color: t?.textMuted || '#94a3b8', marginBottom: 28, lineHeight: 1.65 }}>
          Your session progress will be lost if you navigate away now.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => blocker.reset()}
            style={{ flex: 1, padding: '13px', borderRadius: 11, border: `1px solid rgba(255,255,255,0.1)`, background: 'rgba(255,255,255,0.05)', color: t?.textMuted || '#94a3b8', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}
          >
            Stay in Quiz
          </button>
          <button
            onClick={() => blocker.proceed()}
            style={{ flex: 1, padding: '13px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}
          >
            Leave Anyway
          </button>
        </div>
      </div>
    </div>
  )
}

function AppInner() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser]                       = useState(null)
  const [profile, setProfile]                 = useState(null)
  const [questions, setQuestions]             = useState([])
  const [struggleMap, setStruggleMap]         = useState({})
  const [loading, setLoading]                 = useState(true)
  const [bootstrapped, setBootstrapped]       = useState(false)
  const [selectedSubject, setSelectedSubject] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('gf-subject'))
      // Standalone Writing tiles were retired; Writing now lives inside a subject.
      return stored && stored.type !== 'writing' ? stored : null
    } catch { return null }
  })
  const [showAuth, setShowAuth]               = useState(false)
  const [theme, setTheme]                     = useState(() => localStorage.getItem('gf-theme') || 'dark')
  const [subscriptions, setSubscriptions]     = useState([])
  const [subscriptionsLoaded, setSubscriptionsLoaded] = useState(false)
  const [welcomeCelebration, setWelcomeCelebration] = useState(false)
  // The first-run feature tour. Latched open: onSeen records it as seen the
  // moment it mounts (so it never shows twice), which would otherwise make
  // tourDue false and close it before the student saw anything.
  const [tourOpen, setTourOpen] = useState(false)

  const refreshSubscriptions = async () => {
    try {
      const subs = await getSubscriptions(user.id)
      setSubscriptions(subs)
      setSubscriptionsLoaded(true)
    } catch (e) {
      notifyError(e, 'Could not refresh your subjects. Please try again.', { source: 'refreshSubscriptions' })
    }
  }

  // Tutors and admins see every subject. Students need a grant, a paid subject
  // or their one free subject (limited questions per day).
  const hasFullAccess = !!(profile?.is_admin || profile?.is_tutor)
  const selectedAccess = selectedSubject ? subjectAccess(subscriptions, selectedSubject, hasFullAccess) : 'none'
  const subjectLocked = subscriptionsLoaded && !!selectedSubject && selectedAccess === 'none'

  // Today's free-question count while the free subject is open: { used, limit }.
  const [freeQuota, setFreeQuota] = useState(null)
  useEffect(() => {
    if (selectedAccess !== 'free') { setFreeQuota(null); return }
    let cancelled = false
    getFreeQuestionUsage()
      .then(q => { if (!cancelled) setFreeQuota(q) })
      .catch(() => { if (!cancelled) setFreeQuota({ used: 0, limit: 20 }) })
    return () => { cancelled = true }
  }, [selectedAccess, selectedSubject?.id, user?.id])
  const onFreeQuestionAnswered = useCallback(() => {
    setFreeQuota(q => (q ? { ...q, used: q.used + 1 } : q))
    countFreeQuestion().then(r => setFreeQuota({ used: r.used, limit: r.limit })).catch(() => {})
  }, [])

  // Diagnostics on tutor-included subjects. One that isn't done (or waived)
  // stands in front of practising that subject; its questions are written in
  // the background as soon as we know about it, so they're usually ready by
  // the time the student gets there.
  const [myDiagnostics, setMyDiagnostics] = useState([])
  const [diagnosticsLoaded, setDiagnosticsLoaded] = useState(false)
  const refreshDiagnostics = useCallback(async () => {
    try { setMyDiagnostics(await fetchMyDiagnostics()) } catch {}
    setDiagnosticsLoaded(true)
  }, [])
  const isStudent = !!(user && profile && !profile.is_tutor && !profile.is_admin)
  useEffect(() => { if (isStudent) refreshDiagnostics() }, [isStudent, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const preparing = useRef(new Set())
  useEffect(() => {
    const todo = myDiagnostics.filter(d => d.status === 'pending' && !d.ready && !preparing.current.has(d.token))
    if (!todo.length) return
    todo.forEach(d => preparing.current.add(d.token))
    ;(async () => {
      for (const d of todo) await prepareDiagnostic(d.token).catch(() => {}) // the diagnostic page retries
    })()
  }, [myDiagnostics])
  const selectedCurriculumId = String(selectedSubject?.id || '').replace(/^curriculum_/, '')
  const diagnosticDue = isStudent && selectedCurriculumId
    ? myDiagnostics.find(d => d.status === 'pending' && d.curriculum_id === selectedCurriculumId) || null
    : null

  // Signed in after starting from a tutor invite: accept it straight away,
  // wherever sign-up or sign-in left them (onboarding, Home, …), so the
  // subjects it includes are unlocked before they pick one. Not a redirect:
  // sign-up navigates on to onboarding by itself and would win that race.
  // On the invite page itself, the page does it.
  const acceptingInvite = useRef(false)
  useEffect(() => {
    if (!user || !profile || acceptingInvite.current) return
    const token = pendingInvite()
    if (!token || location.pathname.startsWith('/invite/')) return
    acceptingInvite.current = true
    respondToInvite(token, true)
      .then(async (res) => {
        clearPendingInvite()
        await Promise.all([refreshSubscriptions(), refreshDiagnostics()])
        const subjects = res?.subjects || []
        notify.success(subjects.length
          ? `You're in! ${subjects.join(', ')} ${subjects.length > 1 ? 'are' : 'is'} included with your tutoring.`
          : `You're in! ${res?.tutor_name || 'Your tutor'} is now your tutor.`)
        if (res?.subjectError) notify.error(res.subjectError)
      })
      .catch(() => {
        // Wrong account, expired, cancelled…: the invite page says which.
        clearPendingInvite()
        navigate(`/invite/${encodeURIComponent(token)}`)
      })
      .finally(() => { acceptingInvite.current = false })
  }, [user, profile, location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Signed in after picking a paid subject on the pricing page: on to Stripe
  // Checkout for it, before onboarding (which picks up again on the way back).
  const [openingCheckout, setOpeningCheckout] = useState(false)
  useEffect(() => {
    if (!user || !profile || profile.is_tutor || user.user_metadata?.signup_path === 'tutor') return
    const subject = takePendingCheckout()
    if (!subject) return
    setOpeningCheckout(true)
    startCheckout(subject)
      .then((result) => {
        if (!result.hasPlan) return // the browser is on its way to Stripe
        setOpeningCheckout(false)
        navigate('/get-access', { state: { subject: subjectTileFor(subject) } })
      })
      .catch((e) => {
        setOpeningCheckout(false)
        notifyError(e, "Couldn't open checkout. Choose your subject again to pay for it.", { source: 'pendingCheckout' })
      })
  }, [user, profile]) // eslint-disable-line react-hooks/exhaustive-deps

  // Back from Stripe Checkout (?checkout=success&session_id=… or ?checkout=cancelled).
  useEffect(() => {
    if (!user) return
    const params = new URLSearchParams(location.search)
    const checkout = params.get('checkout')
    if (!checkout) return
    const sessionId = params.get('session_id')
    navigate(location.pathname, { replace: true })
    if (checkout === 'cancelled') {
      notify.info("Checkout cancelled — you haven't been charged.")
      return
    }
    if (checkout === 'success' && sessionId) {
      syncCheckout(sessionId)
        .catch(() => {}) // the Stripe webhook records it too
        .finally(async () => {
          await refreshSubscriptions()
          notify.success("You're in! Your new subject is unlocked.")
        })
    }
  }, [user, location.search]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lifted Learn state — survives route changes
  const [learnPhase,      setLearnPhase]      = useState('setup')
  const [learnTopic,      setLearnTopic]      = useState('')
  const [learnMessages,   setLearnMessages]   = useState([])
  const [learnInterests,  setLearnInterests]  = useState(null)
  const [learnDocContext, setLearnDocContext]  = useState('')
  const [learnDocName,    setLearnDocName]    = useState('')

  // Titan AI bridge state
  const [questionContext,     setQuestionContext]     = useState(null)  // set from QuizScreen, consumed by LearnScreen
  // A short "Consolidate — practice this topic" round started from Titan AI:
  // { label, subtopics, canReturn }, consumed by QuizScreen.
  const [consolidation, setConsolidationState] = useState(null)
  // The round and the quiz to go back to after it, mirrored in a ref: the quiz
  // screen ends a round from its unmount cleanup, which can run with props
  // from before a reset (sign-out, a new session) and must then do nothing.
  const consolidationRef = useRef({ active: null, saved: null })
  const setConsolidation = (next, saved = null) => {
    consolidationRef.current = { active: next, saved: next ? saved : null }
    setConsolidationState(next)
  }

  // Lifted Quiz state — persists across tab switches
  const [quizQ,           setQuizQ]           = useState(null)
  const [quizSelected,    setQuizSelected]    = useState(null)
  const [quizShowAns,     setQuizShowAns]     = useState(false)
  const [quizCorrect,     setQuizCorrect]     = useState(null)
  const [quizEarnedXP,    setQuizEarnedXP]    = useState(0)
  const [quizStreak,      setQuizStreak]      = useState(0)
  const [quizSessionXP,   setQuizSessionXP]   = useState(0)
  const [quizResults,     setQuizResults]     = useState([])
  const [quizAnswered,    setQuizAnswered]     = useState([])
  const [quizQNumber,     setQuizQNumber]     = useState(1)
  const [quizAiTip,       setQuizAiTip]       = useState('')
  const [quizLoadingTip,  setQuizLoadingTip]  = useState(false)
  const [quizMode,        setQuizMode]        = useState('new')
  const [quizSubtopics,   setQuizSubtopics]   = useState([])
  const [quizReviewIds,   setQuizReviewIds]   = useState([])
  const [quizSessionId,   setQuizSessionId]   = useState(null)
  const [quizRemediationMode,      setQuizRemediationMode]      = useState(false)
  const [quizRemediationStreak,    setQuizRemediationStreak]    = useState(0)
  const [quizRemediationTarget,    setQuizRemediationTarget]    = useState(3)
  const [quizRemediationQueue,     setQuizRemediationQueue]     = useState([])
  const [quizRemediationStatus,    setQuizRemediationStatus]    = useState('idle')
  const [quizRemediationSource,    setQuizRemediationSource]    = useState('prebuilt')
  const [quizRemediationConcept,   setQuizRemediationConcept]   = useState(null)
  const [quizRemediationParentId,  setQuizRemediationParentId]  = useState(null)
  const [quizRemediationOriginalQ, setQuizRemediationOriginalQ] = useState(null)
  const [quizRemediationUsedIds,   setQuizRemediationUsedIds]   = useState([])
  const [quizRemediationWrongCount, setQuizRemediationWrongCount] = useState(0)
  const [activeAssignment, setActiveAssignment] = useState(null)
  const [quizExamMode, setQuizExamMode] = useState(false)
  const [quizTimerSeconds, setQuizTimerSeconds] = useState(0)
  const [quizFinished, setQuizFinished] = useState(false)
  const [quizSessionTip, setQuizSessionTip] = useState('')
  const [quizSessionTipLoading, setQuizSessionTipLoading] = useState(false)
  const [lastSessionAt, setLastSessionAt] = useState(null)
  const [assignmentsVersion, setAssignmentsVersion] = useState(0)

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('gf-theme', next)
      return next
    })
  }

  const t = THEMES[theme]

  useEffect(() => {
    document.body.style.background = t.bg
    document.body.style.margin = '0'
    document.body.style.padding = '0'
  }, [t.bg])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (!session?.user) { setLoading(false); setBootstrapped(true) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) { setProfile(null); setLoading(false); setBootstrapped(true) }
      // A reset link that came back to the site root (redirect URL not allow-listed) still lands here.
      if (event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/reset-password') navigate('/reset-password', { replace: true })
    })
    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Once someone is signed in, fetch the study screens' code in idle time so
  // the first tab switch doesn't wait on the network.
  useEffect(() => { if (user?.id) prefetchStudyScreens() }, [user?.id])

  // Load managed curriculum topics cache on login so the student-facing quiz
  // can look up topic codes for bank exhaustion / infinite question generation.
  useEffect(() => {
    if (!user?.id) return
    refreshManagedTopicsCache(loadManagedCurriculaTopics).catch(() => {})
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    Promise.all([getProfile(user.id), getStruggleMap(user.id)])
      .then(([prof, map]) => {
        const merged = mergeTutorialFromStorage(user.id, prof)
        setProfile(merged)
        setStruggleMap(map)
        setLoading(false)
        setBootstrapped(true)
        if (prof) getSubscriptions(user.id).then(subs => {
          setSubscriptions(subs)
          setSubscriptionsLoaded(true)
          // Evict a persisted subject the user is no longer subscribed to.
          const stored = (() => { try { return JSON.parse(localStorage.getItem('gf-subject')) } catch { return null } })()
          if (stored && subs.length > 0 && !subs.some(s => s.subject_name === stored.name && s.stage === stored.stage)) {
            localStorage.removeItem('gf-subject')
            setSelectedSubject(null)
          }
        }).catch(() => { setSubscriptionsLoaded(true) })
      })
      .catch(() => { setLoading(false); setBootstrapped(true) })
  }, [user?.id])

  // A subject tile saved in localStorage can be stale (renamed subject, feature
  // switches changed in admin). Refresh it from the curricula table once.
  useEffect(() => {
    const id = selectedSubject?.id
    if (typeof id !== 'string' || !id.startsWith('curriculum_')) return
    let cancelled = false
    fetchLiveCurricula()
      .then(cs => {
        const fresh = cs.map(curriculumToSubjectTile).find(tile => tile.id === id)
        if (cancelled || !fresh) return
        setSelectedSubject(prev => (prev?.id === id ? { ...prev, ...fresh } : prev))
        try { localStorage.setItem('gf-subject', JSON.stringify(fresh)) } catch { /* storage unavailable */ }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedSubject?.id])

  // One request per subject bank (they run to ~1 MB): picking a subject, the
  // reload effect below and the tile refresh above all ask for the same bank.
  const questionsLoad = useRef({ key: null, promise: null })
  const loadQuestions = useCallback((tile) => {
    const key = tile?.id ?? null
    if (questionsLoad.current.key !== key || !questionsLoad.current.promise) {
      const promise = getQuestionsForSubjectTile(tile)
      promise.catch(() => { if (questionsLoad.current.promise === promise) questionsLoad.current = { key: null, promise: null } })
      questionsLoad.current = { key, promise }
    }
    return questionsLoad.current.promise
  }, [])
  const clearQuestions = () => {
    questionsLoad.current = { key: null, promise: null }
    setQuestions([])
  }

  // Load the bank for a subject remembered from last time (signed in only;
  // the question bank is not readable signed out).
  useEffect(() => {
    if (!user?.id || !selectedSubject || questions.length > 0) return
    const key = selectedSubject.id
    loadQuestions(selectedSubject)
      .then(qs => { if (questionsLoad.current.key === key) setQuestions(qs) })
      .catch(() => {})
  }, [user?.id, selectedSubject?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectSubject = async (subject) => {
    setSelectedSubject(subject)
    localStorage.setItem('gf-subject', JSON.stringify(subject))
    const qs = await loadQuestions(subject)
    setQuestions(qs)
    navigate('/home')
  }

  const handleReplayFeatureTour = useCallback(async () => {
    if (!profile?.id) return
    const uid = profile.id
    try {
      localStorage.removeItem(gfTutorialStorageKey(uid))
      await updateProfile(uid, { app_tutorial_completed_at: null })
    } catch (e) {
      console.error('[replay tutorial]', e)
    }
    setProfile(prev => (prev ? { ...prev, app_tutorial_completed_at: null } : prev))
    navigate('/question-bank')
  }, [profile?.id, navigate])

  const handleSignOut = async () => {
    setWelcomeCelebration(false)
    setTourOpen(false)
    await signOut()
    setMyDiagnostics([])
    setDiagnosticsLoaded(false)
    setSelectedSubject(null)
    localStorage.removeItem('gf-subject')
    clearQuestions()
    // Nothing of this account may carry over to the next one on this device.
    setStruggleMap({})
    setSubscriptions([])
    setSubscriptionsLoaded(false)
    setFreeQuota(null)
    setActiveAssignment(null)
    setLastSessionAt(null)
    setLearnPhase('setup')
    setLearnMessages([])
    setLearnTopic('')
    setLearnInterests(null)
    setLearnDocContext('')
    setLearnDocName('')
    setQuestionContext(null)
    setConsolidation(null)
    setQuizQ(null)
    setQuizSelected(null)
    setQuizShowAns(false)
    setQuizCorrect(null)
    setQuizEarnedXP(0)
    setQuizStreak(0)
    setQuizAiTip('')
    setQuizLoadingTip(false)
    setQuizResults([])
    setQuizAnswered([])
    setQuizQNumber(1)
    setQuizSessionXP(0)
    setQuizMode('new')
    setQuizReviewIds([])
    setQuizFinished(false)
    setQuizSessionTip('')
    setQuizSessionTipLoading(false)
    setQuizSubtopics([])
    setQuizExamMode(false)
    setQuizTimerSeconds(0)
    setQuizRemediationMode(false)
    setQuizRemediationStreak(0)
    setQuizRemediationTarget(3)
    setQuizRemediationQueue([])
    setQuizRemediationStatus('idle')
    setQuizRemediationSource('prebuilt')
    setQuizRemediationConcept(null)
    setQuizRemediationParentId(null)
    setQuizRemediationOriginalQ(null)
    setQuizRemediationUsedIds([])
    setQuizRemediationWrongCount(0)
    navigate('/home', { replace: true })
  }

  const handleChangeSubject = () => {
    setConsolidation(null)
    setSelectedSubject(null)
    localStorage.removeItem('gf-subject')
    clearQuestions()
    setQuizQ(null)
    setQuizSelected(null)
    setQuizShowAns(false)
    setQuizCorrect(null)
    setQuizEarnedXP(0)
    setQuizResults([])
    setQuizAnswered([])
    setQuizQNumber(1)
    setQuizSessionXP(0)
    setQuizMode('new')
    setQuizReviewIds([])
    setQuizFinished(false)
    setQuizSessionTip('')
    setQuizSessionTipLoading(false)
    setQuizSubtopics([])
    setQuizRemediationMode(false)
    setQuizRemediationStreak(0)
    setQuizRemediationTarget(3)
    setQuizRemediationQueue([])
    setQuizRemediationStatus('idle')
    setQuizRemediationSource('prebuilt')
    setQuizRemediationConcept(null)
    setQuizRemediationParentId(null)
    setQuizRemediationOriginalQ(null)
    setQuizRemediationUsedIds([])
    setQuizRemediationWrongCount(0)
    setSubscriptionsLoaded(false)
    navigate('/subject-picker')
  }

  const commonProps  = { theme, onToggleTheme: toggleTheme }
  const quizState = {
    currentQ: quizQ,           setCurrentQ: setQuizQ,
    selected: quizSelected,    setSelected: setQuizSelected,
    showAns: quizShowAns,      setShowAns: setQuizShowAns,
    correct: quizCorrect,      setCorrect: setQuizCorrect,
    earnedXP: quizEarnedXP,    setEarnedXP: setQuizEarnedXP,
    streak: quizStreak,        setStreak: setQuizStreak,
    sessionXP: quizSessionXP,  setSessionXP: setQuizSessionXP,
    sessionResults: quizResults, setSessionResults: setQuizResults,
    sessionAnswered: quizAnswered, setSessionAnswered: setQuizAnswered,
    qNumber: quizQNumber,      setQNumber: setQuizQNumber,
    quizMode,                  setQuizMode,
    quizSubtopics,             setQuizSubtopics,
    reviewIds: quizReviewIds,  setReviewIds: setQuizReviewIds,
    sessionId: quizSessionId,  setSessionId: setQuizSessionId,
    aiTip: quizAiTip,          setAiTip: setQuizAiTip,
    loadingTip: quizLoadingTip, setLoadingTip: setQuizLoadingTip,
    remediationMode: quizRemediationMode,           setRemediationMode: setQuizRemediationMode,
    remediationStreak: quizRemediationStreak,       setRemediationStreak: setQuizRemediationStreak,
    remediationTarget: quizRemediationTarget,       setRemediationTarget: setQuizRemediationTarget,
    remediationQueue: quizRemediationQueue,         setRemediationQueue: setQuizRemediationQueue,
    remediationStatus: quizRemediationStatus,       setRemediationStatus: setQuizRemediationStatus,
    remediationSource: quizRemediationSource,       setRemediationSource: setQuizRemediationSource,
    remediationConcept: quizRemediationConcept,     setRemediationConcept: setQuizRemediationConcept,
    remediationParentId: quizRemediationParentId,   setRemediationParentId: setQuizRemediationParentId,
    remediationOriginalQ: quizRemediationOriginalQ, setRemediationOriginalQ: setQuizRemediationOriginalQ,
    remediationUsedIds: quizRemediationUsedIds,     setRemediationUsedIds: setQuizRemediationUsedIds,
    remediationWrongCount: quizRemediationWrongCount, setRemediationWrongCount: setQuizRemediationWrongCount,
    finished: quizFinished, setFinished: setQuizFinished,
    sessionTip: quizSessionTip, setSessionTip: setQuizSessionTip,
    sessionTipLoading: quizSessionTipLoading, setSessionTipLoading: setQuizSessionTipLoading,
    examMode: quizExamMode,
    timerSeconds: quizTimerSeconds,
  }

  const quizIsActive = location.pathname === '/quiz' && quizAnswered.length > 0 && !quizFinished
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      quizIsActive &&
      currentLocation.pathname === '/quiz' &&
      nextLocation.pathname !== '/quiz'
  )

  useEffect(() => {
    if (quizFinished && quizAnswered.length > 0) setLastSessionAt(Date.now())
  }, [quizFinished, quizAnswered.length])

  const learnState   = {
    phase: learnPhase,       setPhase: setLearnPhase,
    topic: learnTopic,       setTopic: setLearnTopic,
    messages: learnMessages, setMessages: setLearnMessages,
    interests: learnInterests, setInterests: setLearnInterests,
    docContext: learnDocContext, setDocContext: setLearnDocContext,
    docName: learnDocName,   setDocName: setLearnDocName,
    questionContext, setQuestionContext,
    onConsolidate: (target) => {
      if (!target?.subtopics?.length) return
      // Keep the quiz they're in to come back to after the round, minus any
      // remediation waiting on the question they asked Titan about: the round
      // is that practice, so they come back to a new question instead.
      const inProgress = !!quizQ || quizResults.length > 0
      setConsolidation(
        { label: target.label, subtopics: target.subtopics, canReturn: inProgress },
        inProgress ? { ...captureQuiz(), remediation: NO_REMEDIATION } : null,
      )
      // The round is a session of its own: new questions on just this topic,
      // outside any assignment (its answers mustn't count towards one).
      setActiveAssignment(null)
      setQuizExamMode(false)
      setQuizTimerSeconds(0)
      resetQuizSession()
      navigate('/quiz')
    },
  }

  // Remediation state for a quiz with none in progress.
  const NO_REMEDIATION = {
    mode: false, streak: 0, target: 3, queue: [], status: 'idle', source: 'prebuilt',
    concept: null, parentId: null, originalQ: null, usedIds: [], wrongCount: 0,
  }

  // Everything the quiz needs to carry on exactly where it was.
  const captureQuiz = () => ({
    q: quizQ, selected: quizSelected, showAns: quizShowAns, correct: quizCorrect,
    earnedXP: quizEarnedXP, streak: quizStreak, sessionXP: quizSessionXP,
    results: quizResults, answered: quizAnswered, qNumber: quizQNumber, aiTip: quizAiTip,
    mode: quizMode, subtopics: quizSubtopics, reviewIds: quizReviewIds, sessionId: quizSessionId, examMode: quizExamMode, timerSeconds: quizTimerSeconds,
    assignment: activeAssignment, finished: quizFinished, sessionTip: quizSessionTip,
    remediation: {
      mode: quizRemediationMode, streak: quizRemediationStreak, target: quizRemediationTarget,
      queue: quizRemediationQueue, status: quizRemediationStatus, source: quizRemediationSource,
      concept: quizRemediationConcept, parentId: quizRemediationParentId,
      originalQ: quizRemediationOriginalQ, usedIds: quizRemediationUsedIds, wrongCount: quizRemediationWrongCount,
    },
  })

  const restoreQuiz = (saved) => {
    setQuizQ(saved.q)
    setQuizSelected(saved.selected)
    setQuizShowAns(saved.showAns)
    setQuizCorrect(saved.correct)
    setQuizEarnedXP(saved.earnedXP)
    setQuizStreak(saved.streak)
    setQuizSessionXP(saved.sessionXP)
    setQuizResults(saved.results)
    setQuizAnswered(saved.answered)
    setQuizQNumber(saved.qNumber)
    setQuizAiTip(saved.aiTip)
    setQuizLoadingTip(false)
    setQuizMode(saved.mode)
    setQuizSubtopics(saved.subtopics)
    setQuizReviewIds(saved.reviewIds || [])
    setQuizSessionId(saved.sessionId ?? null)
    setQuizExamMode(saved.examMode)
    setQuizTimerSeconds(saved.timerSeconds)
    setActiveAssignment(saved.assignment)
    setQuizFinished(saved.finished)
    setQuizSessionTip(saved.sessionTip)
    setQuizSessionTipLoading(false)
    const r = saved.remediation
    setQuizRemediationMode(r.mode)
    setQuizRemediationStreak(r.streak)
    setQuizRemediationTarget(r.target)
    setQuizRemediationQueue(r.queue)
    // A queue still loading when they left was lost with the quiz screen; an
    // empty, active queue makes Next look it up again.
    setQuizRemediationStatus(r.status === 'generating' ? 'activated' : r.status)
    setQuizRemediationSource(r.source)
    setQuizRemediationConcept(r.concept)
    setQuizRemediationParentId(r.parentId)
    setQuizRemediationOriginalQ(r.originalQ)
    setQuizRemediationUsedIds(r.usedIds)
    setQuizRemediationWrongCount(r.wrongCount)
  }

  // A fresh 'new'-questions session (the quiz screen loads the first question).
  const resetQuizSession = () => {
    setQuizQ(null)
    setQuizSelected(null)
    setQuizShowAns(false)
    setQuizCorrect(null)
    setQuizEarnedXP(0)
    setQuizStreak(0)
    setQuizSessionXP(0)
    setQuizResults([])
    setQuizAnswered([])
    setQuizQNumber(1)
    setQuizAiTip('')
    setQuizLoadingTip(false)
    setQuizMode('new')
    setQuizReviewIds([])
    setQuizSubtopics([])
    setQuizFinished(false)
    setQuizSessionTip('')
    setQuizSessionTipLoading(false)
    setQuizRemediationMode(false)
    setQuizRemediationStreak(0)
    setQuizRemediationTarget(3)
    setQuizRemediationQueue([])
    setQuizRemediationStatus('idle')
    setQuizRemediationSource('prebuilt')
    setQuizRemediationConcept(null)
    setQuizRemediationParentId(null)
    setQuizRemediationOriginalQ(null)
    setQuizRemediationUsedIds([])
    setQuizRemediationWrongCount(0)
  }

  // End a consolidation round: back to the quiz they were in, or, if there
  // wasn't one, a normal session on the whole subject. Does nothing once the
  // round is already over.
  const endConsolidation = () => {
    const { active, saved } = consolidationRef.current
    if (!active) return
    setConsolidation(null)
    if (saved) restoreQuiz(saved)
    else resetQuizSession()
  }

  // A student's tour waits for their diagnostics to load and for any due on
  // this subject to be done: the tour lives in the app shell, which the
  // check-in screen replaces, and it counts as seen the moment it opens.
  const tourDue = !!(user && profile && profile.onboarding_completed && !profile.app_tutorial_completed_at && selectedSubject &&
    (!isStudent || (diagnosticsLoaded && !diagnosticDue)))
  useEffect(() => { if (tourDue) setTourOpen(true) }, [tourDue])

  // Also while a just-signed-in user's profile loads, so the landing or sign-in
  // page doesn't flash before the redirect into the app.
  if (((!bootstrapped || (user && !profile)) && loading) || openingCheckout) return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes gf-bootspin { to { transform: rotate(360deg); } }`}</style>
      <div
        role="status"
        aria-label="Loading"
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '2px solid rgba(241,190,67,0.18)',
          borderTopColor: GOLD,
          animation: 'gf-bootspin 0.8s linear infinite',
        }}
      />
    </div>
  )

  const tutorialOverlay =
    tourOpen && user && profile
      ? {
          isTutor: !!profile.is_tutor,
          theme,
          // Called as soon as the overlay mounts — prevents re-showing if the user
          // closes the tab or navigates away before explicitly skipping/finishing.
          onSeen: async () => {
            const uid = profile.id
            const ts = new Date().toISOString()
            try {
              localStorage.setItem(gfTutorialStorageKey(uid), ts)
            } catch (_) {}
            setProfile(prev => ({ ...prev, app_tutorial_completed_at: ts }))
            try {
              await markTutorialComplete(uid)
            } catch (e) {
              console.error('[tutorial seen]', e)
            }
          },
          // Skip and Done both end here.
          onFinish: () => {
            setTourOpen(false)
            setWelcomeCelebration(true)
          },
        }
      : null

  const shellProps = {
    ...commonProps,
    profile,
    subject: selectedSubject,
    onChangeSubject: handleChangeSubject,
    onSignOut: handleSignOut,
    tutorialOverlay,
    onProfileUpdated: (updates) => setProfile(prev => (prev ? { ...prev, ...updates } : prev)),
  }

  const onboardingDest =
    user?.user_metadata?.signup_path === 'tutor' ? '/onboarding/tutor' : '/onboarding'

  return (
    <>
    <NavBlockerModal blocker={blocker} theme={theme} />
    <ErrorBoundary label="app">
    <Suspense fallback={<RouteFallback theme={theme} />}>
    <Routes>
      {/* Root → landing if not logged in, dashboard if logged in */}
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/terms"   element={<TermsScreen />} />
      <Route path="/privacy" element={<PrivacyScreen />} />
      <Route path="/reset-password" element={<ResetPasswordScreen signedIn={!!user} />} />
      <Route path="/pricing" element={<PricingPage onGetStarted={() => navigate('/auth')} onSignIn={() => navigate('/auth')} signedIn={!!(user && profile)} />} />
      {/* Parents of advanced Year 6 students (selective-entry prep) — public */}
      <Route path="/year-6" element={<Year6Page signedIn={!!(user && profile)} />} />
      <Route path="/selective" element={<Navigate to="/year-6" replace />} />
      {/* Free readiness check for parents, no account needed — public */}
      <Route path="/readiness-check" element={<ReadinessCheckScreen signedIn={!!(user && profile)} />} />
      <Route path="/readiness-check/report/:token" element={<ReadinessCheckScreen signedIn={!!(user && profile)} />} />

      {/* Question Lab — public preview of the multi-format question engine */}
      <Route path="/question-lab" element={<AdminRoute profile={profile}><QuestionLabScreen theme={theme} onExit={() => navigate('/admin')} /></AdminRoute>} />

      {/* Exam Mode — timed paper drawn from the subject's bank; only for subjects with exam_mode on */}
      <Route path="/exam" element={
        subjectLocked || selectedAccess === 'free'
          ? <LockedSubjectScreen subject={selectedSubject} reason={subjectLocked ? 'locked' : 'exam'} onChangeSubject={() => navigate('/question-bank')} theme={theme} />
        : subjectHasFeature(selectedSubject, 'exam_mode')
          ? <ExamModeScreen theme={theme} questions={questions} struggleMap={struggleMap} setStruggleMap={setStruggleMap} subject={selectedSubject} profile={profile} onExit={() => navigate('/home')} />
          : <Navigate to="/question-bank" replace />
      } />

      {/* AI Essay Marker — only for subjects with essay_marker on */}
      <Route path="/essay-lab" element={
        subjectHasFeature(selectedSubject, 'essay_marker')
          ? <EssayMarkerScreen theme={theme} onExit={() => navigate('/home')} />
          : <Navigate to="/question-bank" replace />
      } />

      {/* Diagnostic assessment — public, no auth required */}
      <Route path="/diagnostic/:token" element={<DiagnosticScreen />} />

      {/* Tutor invite — public; accepting needs the invited account signed in */}
      <Route path="/invite/:token" element={<InviteScreen signedIn={!!(user && profile)} />} />

      {/* Landing page — public */}
      <Route path="/home" element={
        (user && profile)
          ? !profile.onboarding_completed
            ? <Navigate to={onboardingDest} replace />
          : !profile.app_tutorial_completed_at && !selectedSubject
            ? <Navigate to="/subject-picker" replace />
          : !profile.app_tutorial_completed_at && selectedSubject
            ? <Navigate to={'/question-bank'} replace />
          : <Navigate to={profile.is_tutor ? '/tutor' : '/question-bank'} replace />
          : <LandingPage onGetStarted={() => navigate('/auth')} onSignIn={() => navigate('/auth')} />
      } />

      {/* Auth — public */}
      <Route path="/auth" element={
        (user && profile)
          ? !profile.onboarding_completed
            ? <Navigate to={onboardingDest} replace />
          : !profile.app_tutorial_completed_at && !selectedSubject
            ? <Navigate to="/subject-picker" replace />
          : !profile.app_tutorial_completed_at && selectedSubject
            ? <Navigate to={'/question-bank'} replace />
          : <Navigate to={profile.is_tutor ? '/tutor' : '/question-bank'} replace />
          : <AuthScreen {...commonProps} onAuth={(isNewUser) => navigate(isNewUser ? '/onboarding' : '/home', { replace: true })} onBack={() => navigate('/home')} />
      } />

      <Route path="/auth/tutor" element={
        (user && profile)
          ? !profile.onboarding_completed
            ? <Navigate to={onboardingDest} replace />
          : !profile.app_tutorial_completed_at && !selectedSubject
            ? <Navigate to="/subject-picker" replace />
          : !profile.app_tutorial_completed_at && selectedSubject
            ? <Navigate to={'/question-bank'} replace />
          : <Navigate to={profile.is_tutor ? '/tutor' : '/question-bank'} replace />
          : <TutorSignupScreen />
      } />

      {/* Onboarding — students only (tutors use /onboarding/tutor) */}
      <Route path="/onboarding" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : profile.onboarding_completed
            ? <Navigate to="/subject-picker" replace />
          : user?.user_metadata?.signup_path === 'tutor'
            ? <Navigate to="/onboarding/tutor" replace />
            : <OnboardingScreen profile={profile} userEmail={user?.user_metadata?.family_email || user?.email}
                suggestedYearLevel={subscriptions.filter(sub => sub.source === 'tutor').map(sub => yearFromStage(sub.stage)).find(Boolean) ?? null}
                asParent={user?.user_metadata?.signup_path === 'parent'}
                parentName={user?.user_metadata?.parent_name || ''}
                onDone={async (updates = {}) => {
                try {
                  const subs = await getSubscriptions(profile.id)
                  setSubscriptions(subs)
                  setSubscriptionsLoaded(true)
                } catch {}
                setProfile(prev => ({ ...prev, ...updates, onboarding_completed: true }))
                navigate('/subject-picker', { replace: true })
              }} />
      } />

      <Route path="/onboarding/tutor" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : profile.onboarding_completed
            ? <Navigate to="/subject-picker" replace />
          : user?.user_metadata?.signup_path !== 'tutor'
            ? <Navigate to="/onboarding" replace />
          : <TutorOnboardingScreen profile={profile} userEmail={user?.email} onDone={() => {
              setProfile(prev => ({ ...prev, onboarding_completed: true }))
              navigate('/subject-picker', { replace: true })
            }} />
      } />

      {/* Legacy URL — in-app tour runs on real screens after subject selection */}
      <Route path="/tutorial" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : !profile.onboarding_completed
            ? <Navigate to={onboardingDest} replace />
          : <Navigate to={selectedSubject ? ('/question-bank') : '/subject-picker'} replace />
      } />

      {/* Subject picker — logged in only */}
      <Route path="/subject-picker" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : !profile.onboarding_completed
            ? <Navigate to={onboardingDest} replace />
          : <SubjectPicker {...commonProps} profile={profile} subscriptions={subscriptions} fullAccess={hasFullAccess} onSelect={handleSelectSubject} onGetAccess={subj => navigate('/get-access', { state: { subject: subj } })} />
      } />

      {/* Get access / purchase page */}
      <Route path="/get-access" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : !profile.onboarding_completed
            ? <Navigate to={onboardingDest} replace />
          : <GetAccessScreen subscriptions={subscriptions} onAccessChanged={refreshSubscriptions} />
      } />

      {/* Quiz — wrapped in AppShell so the shared sidebar appears */}
      <Route path="/quiz" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : !profile.onboarding_completed
            ? <Navigate to={onboardingDest} replace />
          : subjectLocked
            ? <LockedSubjectScreen subject={selectedSubject} onChangeSubject={shellProps.onChangeSubject} theme={theme} />
          : <AppShell {...shellProps}>
              <QuizScreen {...commonProps} {...quizState}
              freeQuota={selectedAccess === 'free' && freeQuota ? { ...freeQuota, onAnswered: onFreeQuestionAnswered, onUpgrade: () => navigate('/get-access', { state: { subject: selectedSubject } }) } : null}
              profile={profile} setProfile={setProfile} subjectTile={selectedSubject}
              questions={questions} struggleMap={struggleMap} setStruggleMap={setStruggleMap}
              onHome={() => navigate('/question-bank')}
              onOpenLearn={(topic, ctx) => {
                if (topic) setLearnTopic(topic)
                if (ctx) setQuestionContext(ctx)
                setLearnPhase('setup')
                setLearnMessages([])
                navigate('/learn')
              }}
              consolidation={consolidation}
              onEndConsolidation={endConsolidation}
              activeAssignment={activeAssignment}
              onAssignmentComplete={() => {
                setActiveAssignment(null)
                setAssignmentsVersion(v => v + 1)
              }}
              onAssignmentProgress={(next) => {
                setActiveAssignment(a => (a ? { ...a, ...next } : a))
              }}
              onBankQuestionsAdded={(newQs) => {
                if (!Array.isArray(newQs) || newQs.length === 0) return
                setQuestions(prev => {
                  const existingIds = new Set(prev.map(q => q.id))
                  const existingTexts = new Set(prev.map(q => (q.question || '').trim().toLowerCase()))
                  const fresh = newQs.filter(q =>
                    !existingIds.has(q.id) &&
                    !existingTexts.has((q.question || '').trim().toLowerCase())
                  )
                  return fresh.length ? [...prev, ...fresh] : prev
                })
              }}
              onGoToStudyPlan={() => navigate('/study-plan')} />
            </AppShell>
      } />

      {/* Admin — is_admin only. Wrapped in AppShell like the Tutor and Student portals. */}
      <Route path="/admin/*" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : !profile.onboarding_completed
            ? <Navigate to={onboardingDest} replace />
          : <AdminRoute profile={profile}>
              <AppShell {...shellProps}>
                <AdminScreen profile={profile} />
              </AppShell>
            </AdminRoute>
      } />

      {/* Tutor — is_tutor only. Wrapped in AppShell so the redesigned sidebar (incl. active Tutor Dashboard state) is present here too. */}
      <Route path="/tutor" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : !profile.onboarding_completed
            ? <Navigate to={onboardingDest} replace />
          :               <TutorRoute profile={profile}>
              <AppShell {...shellProps}>
                <TutorPlanGate theme={theme}>
                  <TutorScreen profile={profile} theme={theme} subject={selectedSubject} />
                </TutorPlanGate>
              </AppShell>
            </TutorRoute>
      } />

      {/* Session room — full-page video call, accessible to tutors and students */}
      <Route path="/session/:sessionId" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : <SessionRoom profile={profile} />
      } />

      {/* Permanent recurring room — same URL every week */}
      <Route path="/room/:roomName" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : <RecurringRoomPage profile={profile} />
      } />

      {/* Single shell route — AppShellScreens stays mounted across ALL tab switches */}
      <Route path="/*" element={
        !(user && profile) ? <Navigate to="/home" replace /> :
        !profile.onboarding_completed ? <Navigate to={onboardingDest} replace /> :
        !selectedSubject ? <Navigate to="/subject-picker" replace /> :
        subjectLocked ? <LockedSubjectScreen subject={selectedSubject} onChangeSubject={shellProps.onChangeSubject} theme={theme} /> :
        // The portal (lessons, messages to their tutor) stays open meanwhile.
        diagnosticDue && !PORTAL_PATHS.includes(location.pathname)
          ? <DiagnosticDueScreen subject={selectedSubject} diagnostic={diagnosticDue} onChangeSubject={shellProps.onChangeSubject} theme={theme} /> :
        <AppShellScreens {...shellProps} {...learnState}
          profile={profile} questions={questions} struggleMap={struggleMap}
          setStruggleMap={setStruggleMap} subject={selectedSubject}
          assignmentsVersion={assignmentsVersion}
          lastSessionAt={lastSessionAt}
          onReplayFeatureTour={handleReplayFeatureTour}
          onOpenLearn={(nextTopic) => {
            if (nextTopic) setLearnTopic(nextTopic)
            setLearnPhase('setup')
            navigate('/learn')
          }}
          onStartSession={async (opts) => {
            const nextMode = opts?.mode || 'new'
            const nextSubtopics = Array.isArray(opts?.subtopics) ? opts.subtopics : []
            setActiveAssignment(opts?.assignment ?? null)

            // If the session is for a subject (an assignment's, or a finished
            // assignment being reviewed), switch to it and load its question bank
            let activeQuestions = questions
            let activeSubject = selectedSubject
            const sessionSubject = opts?.assignment?.subject || opts?.subject
            if (sessionSubject) {
              const tiles = await fetchLiveCurricula().then(cs => cs.map(curriculumToSubjectTile)).catch(() => [])
              const matchingSubject = findTileForSubjectString(tiles, sessionSubject)
              if (matchingSubject && matchingSubject.id !== selectedSubject?.id) {
                setSelectedSubject(matchingSubject)
                localStorage.setItem('gf-subject', JSON.stringify(matchingSubject))
                const qs = await loadQuestions(matchingSubject)
                setQuestions(qs)
                activeQuestions = qs
                activeSubject = matchingSubject
              }
            }

            // Assignment entries may be topic names OR subtopic names. Expand topic
            // names to their matching subtopics; keep direct subtopic matches as-is.
            let expandedSubtopics = nextSubtopics
            if ((opts?.assignment || opts?.expandTopics) && nextSubtopics.length > 0) {
              const { normFn } = getTopicConfigForSubject(activeSubject)
              const allSubtopicsLower = new Map()
              activeQuestions.forEach(q => {
                if (q.subtopic) allSubtopicsLower.set(q.subtopic.toLowerCase(), q.subtopic)
              })
              const wantedTopicsLower = new Set()
              const directSubtopics = new Set()
              nextSubtopics.forEach(entry => {
                const lower = entry.toLowerCase()
                if (allSubtopicsLower.has(lower)) {
                  directSubtopics.add(allSubtopicsLower.get(lower))
                } else {
                  wantedTopicsLower.add((normFn?.(entry) || entry).toLowerCase())
                }
              })
              const expanded = new Set(directSubtopics)
              activeQuestions.forEach(q => {
                const tNorm = (normFn?.(q.topic) || q.topic || '').toLowerCase()
                if (wantedTopicsLower.has(tNorm) && q.subtopic) expanded.add(q.subtopic)
              })
              if (expanded.size > 0) expandedSubtopics = Array.from(expanded)
            }

            setQuizMode(nextMode)
            setQuizReviewIds(nextMode === 'review' && Array.isArray(opts?.reviewIds) ? opts.reviewIds : [])
            setQuizSubtopics(expandedSubtopics)
            setQuizExamMode(!!opts?.examMode)
            setQuizTimerSeconds(opts?.examMode && opts?.timerSeconds > 0 ? opts.timerSeconds : 0)
            setQuizQ(null)
            setQuizSelected(null)
            setQuizShowAns(false)
            setQuizCorrect(null)
            setQuizEarnedXP(0)
            setQuizStreak(0)
            setQuizSessionXP(0)
            setQuizResults([])
            setQuizAnswered([])
            setQuizQNumber(1)
            setQuizAiTip('')
            setQuizLoadingTip(false)
            setQuizRemediationMode(false)
            setQuizRemediationStreak(0)
            setQuizRemediationTarget(3)
            setQuizRemediationQueue([])
            setQuizRemediationStatus('idle')
            setQuizRemediationSource('prebuilt')
            setQuizRemediationConcept(null)
            setQuizRemediationParentId(null)
            setQuizRemediationOriginalQ(null)
            setQuizRemediationUsedIds([])
            setQuizRemediationWrongCount(0)
            setConsolidation(null)
            setQuizFinished(false)
            setQuizSessionTip('')
            setQuizSessionTipLoading(false)
            navigate('/quiz')
          }} quizSubtopics={quizSubtopics} setQuizSubtopics={setQuizSubtopics} />
      } />
    </Routes>
    </Suspense>
    </ErrorBoundary>
    {welcomeCelebration && (
      <GradeFarmWelcomeCelebration theme={theme} onDismiss={() => setWelcomeCelebration(false)} />
    )}
    </>
  )
}

const router = createBrowserRouter([{ path: '*', element: <AppInner /> }])

export default function App() {
  useEffect(() => { initObservability() }, [])
  return (
    <ErrorBoundary label="app">
      <RouterProvider router={router} />
      <Toaster
        position="top-center"
        theme="dark"
        toastOptions={{ style: { fontFamily: "'Plus Jakarta Sans', sans-serif" } }}
      />
    </ErrorBoundary>
  )
}
