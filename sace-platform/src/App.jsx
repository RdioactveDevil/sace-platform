import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { getProfile, getStruggleMap, signOut, getQuestions } from './lib/db'
import { THEMES } from './lib/theme'
import Sidebar           from './components/Sidebar'
import LandingPage       from './components/LandingPage'
import AuthScreen        from './components/AuthScreen'
import SubjectPicker     from './components/SubjectPicker'
import HomeScreen        from './components/HomeScreen'
import QuizScreen        from './components/QuizScreen'
import LearnScreen       from './components/LearnScreen'
import LeaderboardScreen from './components/LeaderboardScreen'
import ProfileScreen     from './components/ProfileScreen'

const SIDEBAR_W = 220

const SUBJECT_DB_MAP = {
  'chemistry_s1': 'Chemistry Stage 1',
  'chemistry_s2': 'Chemistry',
}

export default function App() {
  const [user, setUser]                       = useState(null)
  const [profile, setProfile]                 = useState(null)
  const [questions, setQuestions]             = useState([])
  const [struggleMap, setStruggleMap]         = useState({})
  const [screen, setScreen]                   = useState('home')
  const [loading, setLoading]                 = useState(true)
  const [selectedSubject, setSelectedSubject] = useState(null)
  const [showAuth, setShowAuth]               = useState(false)
  const [theme, setTheme]                     = useState(() => localStorage.getItem('saceiq-theme') || 'dark')

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('saceiq-theme', next)
      return next
    })
  }

  const t = THEMES[theme]

  useEffect(() => {
    document.body.style.background = t.bg
    document.body.style.margin = '0'
    document.body.style.padding = '0'
  }, [theme, t.bg])

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

  const handleSelectSubject = async (subject) => {
    setLoading(true)
    setSelectedSubject(subject)
    const qs = await getQuestions(SUBJECT_DB_MAP[subject.id] || subject.name)
    setQuestions(qs)
    setLoading(false)
    setScreen('home')
  }

  const handleSignOut = async () => {
    await signOut()
    setScreen('home')
    setSelectedSubject(null)
    setQuestions([])
  }

  const handleNav = (id) => {
    if (['home','learn','profile','leaderboard'].includes(id)) setScreen(id)
  }

  const sidebarProps = {
    profile,
    subject: selectedSubject,
    activeScreen: screen,
    onNav: handleNav,
    onChangeSubject: () => { setSelectedSubject(null); setQuestions([]) },
    onSignOut: handleSignOut,
    theme,
    onToggleTheme: toggleTheme,
  }

  // Loading
  if (loading) return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#f1be43,#f9d87a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🦁</div>
      <div style={{ fontSize: 13, color: '#64748b' }}>Loading…</div>
    </div>
  )

  // Not logged in
  if (!user || !profile) {
    if (showAuth) return <AuthScreen theme={theme} onToggleTheme={toggleTheme} onAuth={() => setShowAuth(false)} onBack={() => setShowAuth(false)} />
    return <LandingPage onGetStarted={() => setShowAuth(true)} onSignIn={() => setShowAuth(true)} />
  }

  // No subject selected
  if (!selectedSubject) return (
    <SubjectPicker theme={theme} onToggleTheme={toggleTheme} profile={profile} onSelect={handleSelectSubject} />
  )

  // Quiz — full screen, no sidebar
  if (screen === 'quiz') return (
    <QuizScreen theme={theme} onToggleTheme={toggleTheme}
      profile={profile} setProfile={setProfile}
      questions={questions} struggleMap={struggleMap} setStruggleMap={setStruggleMap}
      onHome={() => setScreen('home')} />
  )

  // All other screens — sidebar + content side by side
  const renderScreen = () => {
    if (screen === 'learn') return (
      <LearnScreen theme={theme} onToggleTheme={toggleTheme}
        profile={profile} struggleMap={struggleMap}
        questions={questions} subject={selectedSubject}
        onBack={() => setScreen('home')} />
    )
    if (screen === 'leaderboard') return (
      <LeaderboardScreen theme={theme} profile={profile} onBack={() => setScreen('home')} />
    )
    if (screen === 'profile') return (
      <ProfileScreen theme={theme} profile={profile}
        questions={questions} struggleMap={struggleMap} onBack={() => setScreen('home')} />
    )
    return (
      <HomeScreen theme={theme} onToggleTheme={toggleTheme}
        profile={profile} struggleMap={struggleMap} questions={questions}
        subject={selectedSubject} onStartSession={() => setScreen('quiz')} />
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: t.bg }}>
      {/* Sidebar — rendered directly, always visible */}
      <Sidebar {...sidebarProps} />
      {/* Content — offset by sidebar width */}
      <div style={{ marginLeft: SIDEBAR_W, flex: 1, minWidth: 0 }}>
        {renderScreen()}
      </div>
    </div>
  )
}