import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { getProfile, getStruggleMap, signOut } from './lib/db'
import { getQuestions } from './lib/db'
import AuthScreen      from './components/AuthScreen'
import HomeScreen      from './components/HomeScreen'
import QuizScreen      from './components/QuizScreen'
import LeaderboardScreen from './components/LeaderboardScreen'
import ProfileScreen   from './components/ProfileScreen'

// Google Fonts
const link = document.createElement('link')
link.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap'
link.rel  = 'stylesheet'
document.head.appendChild(link)

export default function App() {
  const [user, setUser]               = useState(null)
  const [profile, setProfile]         = useState(null)
  const [questions, setQuestions]     = useState([])
  const [struggleMap, setStruggleMap] = useState({})
  const [screen, setScreen]           = useState('home') // home | quiz | leaderboard | profile
  const [loading, setLoading]         = useState(true)

  // Auth listener
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

  // Load user data when authenticated
  useEffect(() => {
    if (!user) return
    setLoading(true)
    Promise.all([
      getProfile(user.id),
      getStruggleMap(user.id),
      getQuestions('Chemistry'),
    ]).then(([prof, map, qs]) => {
      setProfile(prof)
      setStruggleMap(map)
      setQuestions(qs)
      setLoading(false)
    }).catch(err => {
      console.error('Load error:', err)
      setLoading(false)
    })
  }, [user])

  const handleSignOut = async () => {
    await signOut()
    setScreen('home')
  }

  // ── LOADING ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{
      minHeight: '100vh', background: '#070c16',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16, fontFamily: "'Syne', sans-serif",
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: 'linear-gradient(135deg, #14b8a6, #0ea5e9)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
      }}>⚗️</div>
      <div style={{ fontSize: 13, color: '#334155' }}>Loading SACE IQ…</div>
    </div>
  )

  // ── NOT LOGGED IN ────────────────────────────────────────────────────────────
  if (!user || !profile) return (
    <AuthScreen onAuth={() => {
      // onAuthStateChange will fire and reload data
    }} />
  )

  // ── QUIZ ─────────────────────────────────────────────────────────────────────
  if (screen === 'quiz') return (
    <QuizScreen
      profile={profile}
      setProfile={setProfile}
      questions={questions}
      struggleMap={struggleMap}
      setStruggleMap={setStruggleMap}
      onHome={() => setScreen('home')}
    />
  )

  // ── LEADERBOARD ──────────────────────────────────────────────────────────────
  if (screen === 'leaderboard') return (
    <LeaderboardScreen
      profile={profile}
      onBack={() => setScreen('home')}
    />
  )

  // ── PROFILE ──────────────────────────────────────────────────────────────────
  if (screen === 'profile') return (
    <ProfileScreen
      profile={profile}
      questions={questions}
      struggleMap={struggleMap}
      onBack={() => setScreen('home')}
    />
  )

  // ── HOME ─────────────────────────────────────────────────────────────────────
  return (
    <HomeScreen
      profile={profile}
      struggleMap={struggleMap}
      questions={questions}
      onStartSession={() => setScreen('quiz')}
      onLeaderboard={() => setScreen('leaderboard')}
      onProfile={() => setScreen('profile')}
      onSignOut={handleSignOut}
    />
  )
}
