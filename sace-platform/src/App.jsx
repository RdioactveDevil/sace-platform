import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { getProfile, getStruggleMap, signOut, getQuestions } from './lib/db'
import LandingPage       from './components/LandingPage'
import AuthScreen        from './components/AuthScreen'
import SubjectPicker     from './components/SubjectPicker'
import HomeScreen        from './components/HomeScreen'
import QuizScreen        from './components/QuizScreen'
import LearnScreen       from './components/LearnScreen'
import LeaderboardScreen from './components/LeaderboardScreen'
import ProfileScreen     from './components/ProfileScreen'

const link = document.createElement('link')
link.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap'
link.rel  = 'stylesheet'
document.head.appendChild(link)

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
  const [showAuth, setShowAuth]               = useState(false)   // show auth modal over landing
  const [theme, setTheme]                     = useState(() => localStorage.getItem('saceiq-theme') || 'dark')

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('saceiq-theme', next)
      return next
    })
  }

  useEffect(() => {
    document.body.style.background = theme === 'dark' ? '#070c16' : '#f0f4f8'
  }, [theme])

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
    setShowAuth(false)
    Promise.all([
      getProfile(user.id),
      getStruggleMap(user.id),
    ]).then(([prof, map]) => {
      setProfile(prof)
      setStruggleMap(map)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [user])

  const handleSelectSubject = async (subject) => {
    setLoading(true)
    setSelectedSubject(subject)
    const dbSubject = SUBJECT_DB_MAP[subject.id] || subject.name
    const qs = await getQuestions(dbSubject)
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

  const handleBackToSubjects = () => {
    setSelectedSubject(null)
    setQuestions([])
    setScreen('home')
  }

  const commonProps = { theme, onToggleTheme: toggleTheme }

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: theme === 'dark' ? '#070c16' : '#f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#14b8a6,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚗️</div>
      <div style={{ fontSize: 13, color: '#64748b' }}>Loading…</div>
    </div>
  )

  // ── NOT LOGGED IN → Landing page (with optional auth overlay) ──────────────
  if (!user || !profile) {
    if (showAuth) return (
      <AuthScreen {...commonProps} onAuth={() => setShowAuth(false)}
        onBack={() => setShowAuth(false)} />
    )
    return (
      <LandingPage
        onGetStarted={() => setShowAuth(true)}
        onSignIn={() => setShowAuth(true)}
      />
    )
  }

  // ── LOGGED IN — no subject yet ─────────────────────────────────────────────
  if (!selectedSubject) return (
    <SubjectPicker {...commonProps} profile={profile} onSelect={handleSelectSubject} />
  )

  // ── APP SCREENS ───────────────────────────────────────────────────────────
  if (screen === 'quiz') return (
    <QuizScreen {...commonProps} profile={profile} setProfile={setProfile}
      questions={questions} struggleMap={struggleMap} setStruggleMap={setStruggleMap}
      onHome={() => setScreen('home')} />
  )
  if (screen === 'learn') return (
    <LearnScreen {...commonProps} profile={profile} struggleMap={struggleMap}
      questions={questions} subject={selectedSubject}
      onBack={() => setScreen('home')} />
  )
  if (screen === 'leaderboard') return (
    <LeaderboardScreen {...commonProps} profile={profile} onBack={() => setScreen('home')} />
  )
  if (screen === 'profile') return (
    <ProfileScreen {...commonProps} profile={profile} questions={questions}
      struggleMap={struggleMap} onBack={() => setScreen('home')} />
  )

  return (
    <HomeScreen {...commonProps}
      profile={profile} struggleMap={struggleMap} questions={questions}
      subject={selectedSubject}
      onStartSession={() => setScreen('quiz')}
      onLeaderboard={() => setScreen('leaderboard')}
      onProfile={() => setScreen('profile')}
      onLearn={() => setScreen('learn')}
      onChangeSubject={handleBackToSubjects}
      onSignOut={handleSignOut} />
  )
}