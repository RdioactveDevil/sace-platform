import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { getProfile, getStruggleMap, signOut, getQuestions } from './lib/db'
import { THEMES } from './lib/theme'
import { getLevelProgress, RANKS, RANK_ICONS } from './lib/engine'
import LandingPage       from './components/LandingPage'
import AuthScreen        from './components/AuthScreen'
import SubjectPicker     from './components/SubjectPicker'
import HomeScreen        from './components/HomeScreen'
import QuizScreen        from './components/QuizScreen'
import LearnScreen       from './components/LearnScreen'
import LeaderboardScreen from './components/LeaderboardScreen'
import ProfileScreen     from './components/ProfileScreen'
import HistoryScreen     from './components/HistoryScreen'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const SUBJECT_DB_MAP = {
  'chemistry_s1': 'Chemistry Stage 1',
  'chemistry_s2': 'Chemistry',
}

const NAV_ITEMS = [
  { icon: '⚡', label: 'Question Bank', id: 'home',         path: '/question-bank' },
  { icon: '🎓', label: 'Learn',         id: 'learn',        path: '/learn'         },
  { icon: '📊', label: 'My Progress',   id: 'profile',      path: '/my-progress'   },
  { icon: '🏆', label: 'Leaderboard',   id: 'leaderboard',  path: '/leaderboard'   },
  { icon: '📚', label: 'Study Plan',    id: 'study',        path: '/study-plan'    },
  { icon: '🕐', label: 'History',       id: 'history',      path: '/history'       },
]

// ── Sidebar ───────────────────────────────────────────────────────────────────
function SidebarContent({ profile, subject, onChangeSubject, onSignOut, theme, onToggleTheme, onClose }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { level, pct, next } = getLevelProgress(profile.xp)
  const rank = RANKS[Math.min(level, RANKS.length - 1)]
  const icon = RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]

  const go = (path) => { navigate(path); onClose?.() }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#080d28', fontFamily: FONT_B }}>
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span onClick={() => go('/home')} style={{ fontFamily: FONT_D, fontSize: 17, letterSpacing: 1, cursor: 'pointer' }}>
          <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
        </span>
        <button onClick={onToggleTheme} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 7px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer' }}>
          <span style={{ fontSize: 10 }}>{theme === 'dark' ? '🌙' : '☀️'}</span>
          <div style={{ width: 24, height: 13, borderRadius: 7, background: 'rgba(255,255,255,0.1)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 1, left: theme === 'dark' ? 1 : 11, width: 11, height: 11, borderRadius: '50%', background: GOLD, transition: 'left 0.25s' }} />
          </div>
        </button>
      </div>

      <div style={{ padding: '7px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{subject?.name || 'Chemistry'} · {subject?.stage || 'Stage 1'}</div>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#080d28', flexShrink: 0 }}>
            {profile.display_name[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name}</div>
            <div style={{ fontSize: 10, color: GOLD, fontWeight: 600 }}>{icon} {rank}</div>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 4, overflow: 'hidden', marginBottom: 3 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, transition: 'width 0.8s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>Level {level}</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{profile.xp}/{next} XP</span>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path || (item.path === '/home' && location.pathname === '/')
          return (
            <button key={item.id} onClick={() => go(item.path)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: active ? 'rgba(241,190,67,0.12)' : 'transparent', borderLeft: `2px solid ${active ? GOLD : 'transparent'}`, color: active ? GOLD : 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B, textAlign: 'left', width: '100%' }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>

      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <button onClick={onChangeSubject} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid rgba(241,190,67,0.3)', background: 'transparent', color: GOLD, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>⇄ Change Subject</button>
        <button onClick={onSignOut} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)', background: 'transparent', color: 'rgba(255,255,255,0.3)', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Sign out</button>
      </div>
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: t.bg }}>
      <style>{`@font-face{font-family:'Sifonn Pro';src:url('/SIFONN_PRO.otf') format('opentype');font-display:swap;}@keyframes slideIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}`}</style>

      {!isMobile && (
        <div style={{ width: 228, flexShrink: 0, position: 'sticky', top: 0, height: '100vh', borderRight: '1px solid rgba(255,255,255,0.07)', zIndex: 10 }}>
          <SidebarContent {...sProps} />
        </div>
      )}

      {isMobile && menuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }}>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: 260, height: '100vh', animation: 'slideIn 0.25s ease', zIndex: 1000, borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <SidebarContent {...sProps} onClose={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
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
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>{children}</div>
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
  // learn state
  phase, setPhase, topic, setTopic, messages, setMessages,
  interests, setInterests, docContext, setDocContext, docName, setDocName,
}) {
  const navigate   = useNavigate()
  const location   = useLocation()
  const screen     = location.pathname.replace('/', '') // e.g. 'question-bank'
  const commonProps = { theme, onToggleTheme }
  const learnState  = { phase, setPhase, topic, setTopic, messages, setMessages, interests, setInterests, docContext, setDocContext, docName, setDocName }
  const shellProps  = { ...commonProps, profile, subject, onChangeSubject, onSignOut }
  const GOLD = '#f1be43'
  const FONT_B = "'Plus Jakarta Sans', sans-serif"

  const show = (s) => ({ display: screen === s ? 'flex' : 'none', flexDirection: 'column', height: '100%', minHeight: 0 })

  return (
    <AppShell {...shellProps}>
      <div style={show('question-bank')}>
        <HomeScreen {...commonProps}
          profile={profile} struggleMap={struggleMap}
          questions={questions} subject={subject}
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
          profile={profile} questions={questions}
          struggleMap={struggleMap} embedded />
      </div>
      <div style={show('study-plan')}>
        <div style={{ padding: '40px 32px', color: THEMES[theme].text, fontFamily: FONT_B }}>
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>Coming Soon</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 12 }}>Study Plan</h1>
          <p style={{ color: THEMES[theme].textMuted, fontSize: 15 }}>Personalised study schedules based on your quiz performance. Coming soon.</p>
        </div>
      </div>
      <div style={show('history')}>
        <HistoryScreen {...commonProps} profile={profile} embedded />
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
  const [selectedSubject, setSelectedSubject] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gf-subject')) || null } catch { return null }
  })
  const [showAuth, setShowAuth]               = useState(false)
  const [theme, setTheme]                     = useState(() => localStorage.getItem('gf-theme') || 'dark')

  // Lifted Learn state — survives route changes
  const [learnPhase,      setLearnPhase]      = useState('setup')
  const [learnTopic,      setLearnTopic]      = useState('')
  const [learnMessages,   setLearnMessages]   = useState([])
  const [learnInterests,  setLearnInterests]  = useState('sport')
  const [learnDocContext, setLearnDocContext]  = useState('')
  const [learnDocName,    setLearnDocName]    = useState('')

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
      if (!session?.user) setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    Promise.all([getProfile(user.id), getStruggleMap(user.id)])
      .then(([prof, map]) => { setProfile(prof); setStruggleMap(map); setLoading(false) })
      .catch(() => setLoading(false))
  }, [user])

  // Reload questions if subject was persisted but questions are empty
  useEffect(() => {
    if (!selectedSubject || questions.length > 0) return
    getQuestions(SUBJECT_DB_MAP[selectedSubject.id] || selectedSubject.name)
      .then(qs => setQuestions(qs))
      .catch(() => {})
  }, [selectedSubject])

  const handleSelectSubject = async (subject) => {
    setLoading(true)
    setSelectedSubject(subject)
    localStorage.setItem('gf-subject', JSON.stringify(subject))
    const qs = await getQuestions(SUBJECT_DB_MAP[subject.id] || subject.name)
    setQuestions(qs)
    setLoading(false)
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
    setQuizQ(null)
    setQuizResults([])
    setQuizAnswered([])
    setQuizQNumber(1)
    setQuizSessionXP(0)
    setQuizMode('new')
    setQuizSubtopics([])
    navigate('/home')
  }

  const handleChangeSubject = () => {
    setSelectedSubject(null)
    localStorage.removeItem('gf-subject')
    setQuestions([])
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
  }

  const learnState   = {
    phase: learnPhase,       setPhase: setLearnPhase,
    topic: learnTopic,       setTopic: setLearnTopic,
    messages: learnMessages, setMessages: setLearnMessages,
    interests: learnInterests, setInterests: setLearnInterests,
    docContext: learnDocContext, setDocContext: setLearnDocContext,
    docName: learnDocName,   setDocName: setLearnDocName,
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: FONT_B }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🦁</div>
      <div style={{ fontSize: 13, color: '#64748b' }}>Loading…</div>
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
    <Routes>
      {/* Root → landing if not logged in, dashboard if logged in */}
      <Route path="/" element={<Navigate to="/home" replace />} />

      {/* Landing page — public */}
      <Route path="/home" element={
        (user && profile)
          ? <Navigate to="/question-bank" replace />
          : <LandingPage onGetStarted={() => navigate('/auth')} onSignIn={() => navigate('/auth')} />
      } />

      {/* Auth — public */}
      <Route path="/auth" element={
        (user && profile)
          ? <Navigate to="/question-bank" replace />
          : <AuthScreen {...commonProps} onAuth={() => navigate('/subject-picker')} onBack={() => navigate('/home')} />
      } />

      {/* Subject picker — logged in only */}
      <Route path="/subject-picker" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : <SubjectPicker {...commonProps} profile={profile} onSelect={handleSelectSubject} />
      } />

      {/* Quiz — full screen, no shell */}
      <Route path="/quiz" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : <QuizScreen {...commonProps} {...quizState}
              profile={profile} setProfile={setProfile}
              questions={questions} struggleMap={struggleMap} setStruggleMap={setStruggleMap}
              onHome={() => navigate('/question-bank')} />
      } />

      {/* Single shell route — AppShellScreens stays mounted across ALL tab switches */}
      <Route path="/*" element={
        !(user && profile) ? <Navigate to="/home" replace /> :
        !selectedSubject ? <Navigate to="/subject-picker" replace /> :
        <AppShellScreens {...shellProps} {...learnState}
          profile={profile} questions={questions} struggleMap={struggleMap}
          setStruggleMap={setStruggleMap} subject={selectedSubject}
          onStartSession={(opts) => { if(opts?.mode) setQuizMode(opts.mode); if(opts?.subtopics) setQuizSubtopics(opts.subtopics || []); navigate('/quiz') }} quizSubtopics={quizSubtopics} setQuizSubtopics={setQuizSubtopics} />
      } />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
