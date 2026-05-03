import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { getProfile, getStruggleMap, signOut, getQuestions, getSubscriptions } from './lib/db'
import { THEMES } from './lib/theme'
import { getLevelProgress, RANKS, RANK_ICONS } from './lib/engine'
import LandingPage       from './components/LandingPage'
import AuthScreen        from './components/AuthScreen'
import SubjectPicker     from './components/SubjectPicker'
import { QUESTIONS_SUBJECT_BY_ID, ALL_SUBJECTS } from './lib/subjects'
import { getTopicConfig } from './lib/saceTopics'
import { getY7TopicConfig } from './lib/australianCurriculumTopics'
import HomeScreen        from './components/HomeScreen'
import QuizScreen        from './components/QuizScreen'
import LearnScreen       from './components/LearnScreen'
import LeaderboardScreen from './components/LeaderboardScreen'
import ProfileScreen     from './components/ProfileScreen'
import AccountScreen from './components/AccountScreen'
import HistoryScreen     from './components/HistoryScreen'
import StudyPlanScreen   from './components/StudyPlanScreen'
import OnboardingScreen  from './components/OnboardingScreen'
import GetAccessScreen   from './components/GetAccessScreen'
import TermsScreen       from './components/TermsScreen'
import PrivacyScreen     from './components/PrivacyScreen'
import AdminRoute        from './components/AdminRoute'
import AdminScreen       from './components/AdminScreen'
import TutorRoute        from './components/TutorRoute'
import TutorScreen       from './components/TutorScreen'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const NAV_ITEMS = [
  { icon: 'home',        label: 'Question Bank', id: 'home',        path: '/question-bank' },
  { icon: 'learn',       label: 'Learn',         id: 'learn',       path: '/learn'         },
  { icon: 'profile',     label: 'My Progress',   id: 'profile',     path: '/my-progress'   },
  { icon: 'leaderboard', label: 'Leaderboard',   id: 'leaderboard', path: '/leaderboard'   },
  { icon: 'study',       label: 'Study Plan',    id: 'study',       path: '/study-plan'    },
  { icon: 'history',     label: 'History',       id: 'history',     path: '/history'       },
]

function NavIcon({ name, size = 14, color = 'currentColor' }) {
  const S = { fill: 'none', stroke: color, strokeWidth: '1.65', strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0, display: 'block' }}>
      {name === 'home'        && <><polygon points="8,2 2,7 2,14 5.5,14 5.5,9.5 10.5,9.5 10.5,14 14,14 14,7" {...S} /></>}
      {name === 'learn'       && <><path d="M2 3h5.5v11H2zM8.5 3H14v11H8.5z" {...S} /><line x1="5" y1="7" x2="5" y2="7" strokeWidth="2" stroke={color} /></>}
      {name === 'profile'     && <polyline points="2,13 5,8 8,11 13,3" {...S} />}
      {name === 'leaderboard' && <><rect x="2" y="9" width="3" height="5" rx="1" {...S} /><rect x="6.5" y="5" width="3" height="9" rx="1" {...S} /><rect x="11" y="1" width="3" height="13" rx="1" {...S} /></>}
      {name === 'study'       && <><line x1="3" y1="4" x2="10" y2="4" {...S} /><line x1="3" y1="8" x2="10" y2="8" {...S} /><line x1="3" y1="12" x2="7" y2="12" {...S} /><polyline points="10,10.5 12,12.5 15.5,9" {...S} /></>}
      {name === 'history'     && <><circle cx="8" cy="8" r="6" {...S} /><polyline points="8,5 8,8.5 10.5,10" {...S} /></>}
      {name === 'tutor'       && <><circle cx="8" cy="5.5" r="3" {...S} /><path d="M3 14.5c0-2.8 2.2-5 5-5s5 2.2 5 5" {...S} /></>}
    </svg>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function SidebarContent({ profile, subject, onChangeSubject, onSignOut, theme, onToggleTheme, onClose }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { level, pct, next } = getLevelProgress(profile.xp)
  const rank = RANKS[Math.min(level, RANKS.length - 1)]
  const icon = RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]

  const go = (path) => { navigate(path); onClose?.() }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'linear-gradient(180deg,#080d28 0%,#06091f 100%)', fontFamily: FONT_B }}>
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div onClick={() => go('/home')} style={{ cursor: 'pointer', lineHeight: 1 }}>
          <span style={{ fontFamily: FONT_D, fontSize: 18, letterSpacing: 1.5 }}>
            <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
          </span>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', fontFamily: FONT_B, letterSpacing: '0.06em', marginTop: 3, textTransform: 'uppercase' }}>by Titanium Tutoring</div>
        </div>
        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(241,190,67,0.35)'; e.currentTarget.style.background = 'rgba(241,190,67,0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
        >
          <span style={{ fontSize: 11 }}>{theme === 'dark' ? '🌙' : '☀️'}</span>
          <div style={{ width: 26, height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.08)', position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 2, left: theme === 'dark' ? 2 : 12, width: 10, height: 10, borderRadius: '50%', background: GOLD, transition: 'left 0.25s cubic-bezier(0.34,1.56,0.64,1)', boxShadow: `0 0 6px ${GOLD}80` }} />
          </div>
        </button>
      </div>

      <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, background: 'rgba(241,190,67,0.08)', border: '1px solid rgba(241,190,67,0.15)' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD, flexShrink: 0 }} />
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: '0.04em' }}>{subject?.name || 'Chemistry'} · {subject?.stage || 'Stage 1'}</div>
        </div>
      </div>

      <div
        onClick={() => go('/my-account')}
        style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, cursor: 'pointer', transition: 'background 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#06091f', flexShrink: 0, boxShadow: `0 2px 8px ${GOLD}40` }}>
            {profile.display_name[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{profile.display_name}</div>
            <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, marginTop: 1, letterSpacing: '0.02em' }}>{icon} {rank}</div>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>›</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 3, height: 3, overflow: 'hidden', marginBottom: 4 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, transition: 'width 0.8s ease', borderRadius: 3 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.04em' }}>Level {level}</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)' }}>{profile.xp.toLocaleString()} XP</span>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path || (item.path === '/home' && location.pathname === '/') || (item.path === '/question-bank' && location.pathname === '/quiz')
          return (
            <button key={item.id} onClick={() => go(item.path)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px 9px 12px', borderRadius: 8, border: 'none', background: active ? 'rgba(241,190,67,0.10)' : 'transparent', borderLeft: `2px solid ${active ? GOLD : 'transparent'}`, color: active ? GOLD : 'rgba(255,255,255,0.60)', fontSize: 13.5, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B, textAlign: 'left', width: '100%', transition: 'color 0.15s, background 0.15s, border-color 0.15s', letterSpacing: active ? '-0.01em' : '0' }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'rgba(255,255,255,0.60)'; e.currentTarget.style.background = 'transparent' } }}
            >
              <NavIcon name={item.icon} size={14} color={active ? GOLD : 'rgba(255,255,255,0.55)'} />
              {item.label}
            </button>
          )
        })}
        {profile?.is_tutor && (
          <button onClick={() => go('/tutor')}
            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px 9px 12px', borderRadius: 8, border: 'none', background: location.pathname === '/tutor' ? 'rgba(241,190,67,0.10)' : 'transparent', borderLeft: `2px solid ${location.pathname === '/tutor' ? GOLD : 'transparent'}`, color: location.pathname === '/tutor' ? GOLD : 'rgba(255,255,255,0.60)', fontSize: 13.5, fontWeight: location.pathname === '/tutor' ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B, textAlign: 'left', width: '100%', transition: 'color 0.15s, background 0.15s' }}
            onMouseEnter={e => { if (location.pathname !== '/tutor') { e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' } }}
            onMouseLeave={e => { if (location.pathname !== '/tutor') { e.currentTarget.style.color = 'rgba(255,255,255,0.60)'; e.currentTarget.style.background = 'transparent' } }}
          >
            <NavIcon name="tutor" size={14} color={location.pathname === '/tutor' ? GOLD : 'rgba(255,255,255,0.55)'} />
            Tutor Dashboard
          </button>
        )}
      </nav>

      {/* Bottom actions */}
      <div style={{ padding: '10px 12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
        <button
          onClick={onChangeSubject}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(241,190,67,0.25)', background: 'rgba(241,190,67,0.06)', color: GOLD, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B, transition: 'background 0.15s, border-color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(241,190,67,0.12)'; e.currentTarget.style.borderColor = 'rgba(241,190,67,0.4)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(241,190,67,0.06)'; e.currentTarget.style.borderColor = 'rgba(241,190,67,0.25)' }}
        >⇄ Change Subject</button>
        <button
          onClick={onSignOut}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'transparent', color: 'rgba(255,255,255,0.25)', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B, transition: 'color 0.15s, border-color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
        >Sign out</button>
      </div>
    </div>
  )
}


// ── Locked Subject Screen ─────────────────────────────────────────────────────
function LockedSubjectScreen({ subject, onChangeSubject, theme }) {
  const t = THEMES[theme]
  return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24, fontFamily: "'Plus Jakarta Sans', sans-serif", textAlign: 'center' }}>
      <div style={{ fontSize: 52 }}>🔒</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: t.text, margin: 0 }}>Subject Not in Your Plan</h2>
      <p style={{ fontSize: 14, color: t.textMuted, maxWidth: 360, lineHeight: 1.6, margin: 0 }}>
        <strong style={{ color: t.text }}>{subject?.name} {subject?.stage}</strong> is not included in your current subscription. Contact Titanium Tutoring to add it.
      </p>
      <a href="mailto:hello@titaniumtutoring.com.au" style={{ padding: '12px 24px', borderRadius: 12, background: GOLD, color: '#0c1037', fontSize: 14, fontWeight: 800, textDecoration: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        Contact us to upgrade →
      </a>
      <button onClick={onChangeSubject} style={{ padding: '10px 20px', borderRadius: 10, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 13, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        ← Back to subject picker
      </button>
    </div>
  )
}

// ── AppShell ──────────────────────────────────────────────────────────────────
function AppShell({ children, profile, subject, onChangeSubject, onSignOut, theme, onToggleTheme }) {
  const t = THEMES[theme]
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 860)
  const navigate = useNavigate()

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
          <div style={{ position: 'absolute', top: 0, left: 0, width: 272, height: '100vh', animation: 'slideIn 0.25s ease', zIndex: 1000, borderRight: '1px solid rgba(255,255,255,0.07)' }}>
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
              <button onClick={onToggleTheme} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 15 }}>{theme === 'dark' ? '🌙' : '☀️'}</button>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#080d28' }}>
                {profile.display_name[0].toUpperCase()}
              </div>
            </div>
          </div>
        )}
        <div style={{ flex: isMobile ? '0 0 auto' : 1, minHeight: isMobile ? 'auto' : 0, overflow: isMobile ? 'visible' : 'hidden', display: 'flex', flexDirection: 'column' }}>{children}</div>
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
// ── AppShellScreens — all screens always mounted, toggled via display:none ───
// This prevents unmount/remount on tab switch — no reload flashes, state preserved
function AppShellScreens({
  profile, questions, struggleMap, setStruggleMap, subject,
  onStartSession, onChangeSubject, onSignOut, theme, onToggleTheme, quizSubtopics, setQuizSubtopics,
  assignmentsVersion,
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
  const shellProps  = { ...commonProps, profile, subject, onChangeSubject, onSignOut }
  const GOLD = '#f1be43'
  const FONT_B = "'Plus Jakarta Sans', sans-serif"

  const show = (s) => screen === s ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'visible' } : { display: 'none' }

  return (
    <AppShell {...shellProps}>
      <div style={show('question-bank')}>
        <HomeScreen {...commonProps}
          profile={profile} struggleMap={struggleMap}
          questions={questions} subject={subject}
          assignmentsVersion={assignmentsVersion}
          onStartSession={onStartSession} />
      </div>
      <div style={show('learn')}>
        <LearnScreen {...commonProps} {...learnState}
          profile={profile} struggleMap={struggleMap}
          questions={questions} subject={subject}
          onBack={() => navigate('/question-bank')} />
      </div>
      <div style={show('leaderboard')}>
        <LeaderboardScreen {...commonProps} profile={profile} embedded />
      </div>
      <div style={show('my-progress')}>
        <ProfileScreen {...commonProps}
          profile={profile} questions={questions} subject={subject}
          struggleMap={struggleMap} embedded
          onStartSession={onStartSession}
          onOpenLearn={(nextTopic) => {
            if (nextTopic) setTopic(nextTopic)
            setPhase('setup')
            navigate('/learn')
          }} />
      </div>
      <div style={show('study-plan')}>
        <StudyPlanScreen
          profile={profile} questions={questions} struggleMap={struggleMap}
          theme={theme} onStartSession={onStartSession} subject={subject} />
      </div>
      <div style={show('history')}>
        <HistoryScreen {...commonProps} profile={profile} embedded />
      </div>
      <div style={show('my-account')}>
        <AccountScreen {...commonProps} profile={profile} onSignOut={onSignOut} onChangeSubject={onChangeSubject} />
      </div>
    </AppShell>
  )
}

function AppInner() {
  const navigate = useNavigate()
  const [user, setUser]                       = useState(null)
  const [profile, setProfile]                 = useState(null)
  const [questions, setQuestions]             = useState([])
  const [struggleMap, setStruggleMap]         = useState({})
  const [loading, setLoading]                 = useState(true)
  const [bootstrapped, setBootstrapped]       = useState(false)
  const [selectedSubject, setSelectedSubject] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gf-subject')) || null } catch { return null }
  })
  const [showAuth, setShowAuth]               = useState(false)
  const [theme, setTheme]                     = useState(() => localStorage.getItem('gf-theme') || 'dark')
  const [subscriptions, setSubscriptions]     = useState([])
  const [subscriptionsLoaded, setSubscriptionsLoaded] = useState(false)

  const refreshSubscriptions = async () => {
    try {
      const subs = await getSubscriptions(user.id)
      setSubscriptions(subs)
      setSubscriptionsLoaded(true)
    } catch {}
  }

  // Lifted Learn state — survives route changes
  const [learnPhase,      setLearnPhase]      = useState('setup')
  const [learnTopic,      setLearnTopic]      = useState('')
  const [learnMessages,   setLearnMessages]   = useState([])
  const [learnInterests,  setLearnInterests]  = useState(null)
  const [learnDocContext, setLearnDocContext]  = useState('')
  const [learnDocName,    setLearnDocName]    = useState('')

  // Titan AI bridge state
  const [questionContext,     setQuestionContext]     = useState(null)  // set from QuizScreen, consumed by LearnScreen
  const [consolidateSubtopic, setConsolidateSubtopic] = useState(null)  // set from LearnScreen, consumed by QuizScreen

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
  const [activeAssignmentId, setActiveAssignmentId] = useState(null)
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) { setProfile(null); setLoading(false); setBootstrapped(true) }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    Promise.all([getProfile(user.id), getStruggleMap(user.id)])
      .then(([prof, map]) => {
        setProfile(prof)
        setStruggleMap(map)
        setLoading(false)
        setBootstrapped(true)
        if (prof) getSubscriptions(user.id).then(subs => {
          setSubscriptions(subs)
          setSubscriptionsLoaded(true)
          // Evict a persisted subject the user is no longer subscribed to
          const stored = (() => { try { return JSON.parse(localStorage.getItem('gf-subject')) } catch { return null } })()
          if (stored && subs.length > 0 && !subs.some(s => s.subject_name === stored.name && s.stage === stored.stage)) {
            localStorage.removeItem('gf-subject')
            setSelectedSubject(null)
          }
        }).catch(() => { setSubscriptionsLoaded(true) })
      })
      .catch(() => { setLoading(false); setBootstrapped(true) })
  }, [user])

  // Reload questions if subject was persisted but questions are empty
  useEffect(() => {
    if (!selectedSubject || questions.length > 0) return
    getQuestions(QUESTIONS_SUBJECT_BY_ID[selectedSubject.id] || selectedSubject.name)
      .then(qs => setQuestions(qs))
      .catch(() => {})
  }, [selectedSubject])

  const handleSelectSubject = async (subject) => {
    setSelectedSubject(subject)
    localStorage.setItem('gf-subject', JSON.stringify(subject))
    const qs = await getQuestions(QUESTIONS_SUBJECT_BY_ID[subject.id] || subject.name)
    setQuestions(qs)
    navigate('/home')
  }

  const handleSignOut = async () => {
    await signOut()
    setSelectedSubject(null)
    localStorage.removeItem('gf-subject')
    setQuestions([])
    setLearnPhase('setup')
    setLearnMessages([])
    setLearnTopic('')
    setQuestionContext(null)
    setConsolidateSubtopic(null)
    setQuizQ(null)
    setQuizResults([])
    setQuizAnswered([])
    setQuizQNumber(1)
    setQuizSessionXP(0)
    setQuizMode('new')
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
    navigate('/home')
  }

  const handleChangeSubject = () => {
    setSelectedSubject(null)
    localStorage.removeItem('gf-subject')
    setQuestions([])
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
    navigate('/home')
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
  }

  const learnState   = {
    phase: learnPhase,       setPhase: setLearnPhase,
    topic: learnTopic,       setTopic: setLearnTopic,
    messages: learnMessages, setMessages: setLearnMessages,
    interests: learnInterests, setInterests: setLearnInterests,
    docContext: learnDocContext, setDocContext: setLearnDocContext,
    docName: learnDocName,   setDocName: setLearnDocName,
    questionContext, setQuestionContext,
    onConsolidate: (subtopic) => {
      setConsolidateSubtopic(subtopic)
      // Reset quiz session so the filtered practice starts fresh in 'all' mode
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
      setQuizMode('all')    // 'all' ensures subtopic questions are always available
      setQuizSubtopics([])  // consolidation uses its own state, not quizSubtopics
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
      navigate('/quiz')
    },
  }

  if (!bootstrapped && loading) return (
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

  const shellProps = {
    ...commonProps,
    profile,
    subject: selectedSubject,
    onChangeSubject: handleChangeSubject,
    onSignOut: handleSignOut,
  }

  return (
    <>
      <RoleSwitcherBar profile={profile} />
    <Routes>
      {/* Root → landing if not logged in, dashboard if logged in */}
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/terms"   element={<TermsScreen />} />
      <Route path="/privacy" element={<PrivacyScreen />} />

      {/* Landing page — public */}
      <Route path="/home" element={
        (user && profile)
          ? <Navigate to={profile.is_tutor ? '/tutor' : '/question-bank'} replace />
          : <LandingPage onGetStarted={() => navigate('/auth')} onSignIn={() => navigate('/auth')} />
      } />

      {/* Auth — public */}
      <Route path="/auth" element={
        (user && profile)
          ? <Navigate to={profile.is_tutor ? '/tutor' : '/question-bank'} replace />
          : <AuthScreen {...commonProps} onAuth={(isNewUser) => navigate(isNewUser ? '/onboarding' : '/home', { replace: true })} onBack={() => navigate('/home')} />
      } />

      {/* Onboarding — new users only */}
      <Route path="/onboarding" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : profile.onboarding_completed
            ? <Navigate to="/subject-picker" replace />
            : <OnboardingScreen profile={profile} userEmail={user?.email} onDone={async () => {
                try {
                  const subs = await getSubscriptions(profile.id)
                  setSubscriptions(subs)
                  setSubscriptionsLoaded(true)
                } catch {}
                setProfile(prev => ({ ...prev, onboarding_completed: true }))
                navigate('/subject-picker', { replace: true })
              }} />
      } />

      {/* Subject picker — logged in only */}
      <Route path="/subject-picker" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : <SubjectPicker {...commonProps} profile={profile} subscriptions={subscriptions} onSelect={handleSelectSubject} onGetAccess={subj => navigate('/get-access', { state: { subject: subj } })} />
      } />

      {/* Get access / purchase page */}
      <Route path="/get-access" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : <GetAccessScreen profile={profile} onAccessGranted={refreshSubscriptions} />
      } />

      {/* Quiz — wrapped in AppShell so the shared sidebar appears */}
      <Route path="/quiz" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : <AppShell {...shellProps}>
              <QuizScreen {...commonProps} {...quizState}
              profile={profile} setProfile={setProfile}
              questions={questions} struggleMap={struggleMap} setStruggleMap={setStruggleMap}
              onHome={() => navigate('/question-bank')}
              onOpenLearn={(topic, ctx) => {
                if (topic) setLearnTopic(topic)
                if (ctx) setQuestionContext(ctx)
                setLearnPhase('setup')
                setLearnMessages([])
                navigate('/learn')
              }}
              consolidateSubtopic={consolidateSubtopic}
              onClearConsolidate={() => setConsolidateSubtopic(null)}
              activeAssignmentId={activeAssignmentId}
              onAssignmentComplete={() => {
                setActiveAssignmentId(null)
                setAssignmentsVersion(v => v + 1)
              }}
              onBankQuestionsAdded={(newQs) => {
                if (!Array.isArray(newQs) || newQs.length === 0) return
                setQuestions(prev => {
                  const existing = new Set(prev.map(q => q.id))
                  const fresh = newQs.filter(q => !existing.has(q.id))
                  return fresh.length ? [...prev, ...fresh] : prev
                })
              }} />
            </AppShell>
      } />

      {/* Admin — is_admin only */}
      <Route path="/admin/*" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : <AdminRoute profile={profile}>
              <AdminScreen profile={profile} />
            </AdminRoute>
      } />

      {/* Tutor — is_tutor only */}
      <Route path="/tutor" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : <TutorRoute profile={profile}>
              <TutorScreen profile={profile} theme={theme} />
            </TutorRoute>
      } />

      {/* Single shell route — AppShellScreens stays mounted across ALL tab switches */}
      <Route path="/*" element={
        !(user && profile) ? <Navigate to="/home" replace /> :
        !profile.onboarding_completed ? <Navigate to="/onboarding" replace /> :
        !selectedSubject ? <Navigate to="/subject-picker" replace /> :
        (subscriptionsLoaded && subscriptions.length > 0 && !subscriptions.some(s => s.subject_name === selectedSubject?.name && s.stage === selectedSubject?.stage)) ? <LockedSubjectScreen subject={selectedSubject} onChangeSubject={shellProps.onChangeSubject} theme={theme} /> :
        <AppShellScreens {...shellProps} {...learnState}
          profile={profile} questions={questions} struggleMap={struggleMap}
          setStruggleMap={setStruggleMap} subject={selectedSubject}
          assignmentsVersion={assignmentsVersion}
          onStartSession={async (opts) => {
            const nextMode = opts?.mode || 'new'
            const nextSubtopics = Array.isArray(opts?.subtopics) ? opts.subtopics : []
            setActiveAssignmentId(opts?.assignmentId ?? null)

            // If assignment specifies a subject, switch to it and load the right question bank
            let activeQuestions = questions
            let activeSubject = selectedSubject
            if (opts?.assignmentSubject) {
              const matchingSubject = ALL_SUBJECTS.find(
                s => `${s.name} ${s.stage}` === opts.assignmentSubject
              )
              if (matchingSubject && matchingSubject.id !== selectedSubject?.id) {
                setSelectedSubject(matchingSubject)
                localStorage.setItem('gf-subject', JSON.stringify(matchingSubject))
                const qs = await getQuestions(QUESTIONS_SUBJECT_BY_ID[matchingSubject.id] || matchingSubject.name)
                setQuestions(qs)
                activeQuestions = qs
                activeSubject = matchingSubject
              }
            }

            // Assignment entries may be topic names OR subtopic names. Expand topic
            // names to their matching subtopics; keep direct subtopic matches as-is.
            let expandedSubtopics = nextSubtopics
            if (opts?.assignmentId && nextSubtopics.length > 0) {
              const { normFn } = getY7TopicConfig(activeSubject?.id) ?? getTopicConfig(activeSubject?.stage)
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
            setQuizSubtopics(expandedSubtopics)
            setQuizQ(null)
            setQuizSelected(null)
            setQuizShowAns(false)
            setQuizCorrect(null)
            setQuizEarnedXP(0)
            setQuizStreak(profile?.streak || 0)
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
            setConsolidateSubtopic(null)
            navigate('/quiz')
          }} quizSubtopics={quizSubtopics} setQuizSubtopics={setQuizSubtopics} />
      } />
    </Routes>
    </>
  )
}

function RoleSwitcherBar({ profile }) {
  const navigate = useNavigate()
  const location = useLocation()
  if (!profile) return null

  const path = location.pathname || ''
  // Hide on full-screen quiz / auth / onboarding / landing
  const hideOn = ['/quiz', '/auth', '/home', '/onboarding', '/learn']
  if (hideOn.some(p => path === p || path.startsWith(p + '/'))) return null

  const isPending  = profile.tutor_application_status === 'pending'
  const isAdmin    = !!profile.is_admin
  const isTutor    = !!profile.is_tutor
  const onAdmin    = path.startsWith('/admin')
  const onTutor    = path.startsWith('/tutor')

  if (!isAdmin && !isTutor && !isPending) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 12px',
      background: isPending ? 'rgba(241,190,67,0.10)' : 'rgba(8,13,40,0.9)',
      borderBottom: '1px solid rgba(241,190,67,0.18)',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      fontSize: 12, color: '#cbd5e1',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      {isPending && (
        <span style={{ color: '#f1be43', fontWeight: 700 }}>
          Tutor application pending admin approval
        </span>
      )}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        {isAdmin && !onAdmin && (
          <SwitchLink onClick={() => navigate('/admin')} color="#a78bfa">Admin</SwitchLink>
        )}
        {isTutor && !onTutor && (
          <SwitchLink onClick={() => navigate('/tutor')} color="#f1be43">Tutor dashboard</SwitchLink>
        )}
        {(onAdmin || onTutor) && (
          <SwitchLink onClick={() => navigate('/question-bank')} color="#94a3b8">Student app</SwitchLink>
        )}
      </div>
    </div>
  )
}

function SwitchLink({ onClick, color, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 6,
        border: `1px solid ${color}55`,
        background: `${color}14`,
        color, fontSize: 12, fontWeight: 700,
        cursor: 'pointer',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >{children}</button>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
