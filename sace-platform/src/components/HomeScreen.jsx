import { useState, useEffect } from 'react'
import { getLevelProgress, RANKS, RANK_ICONS } from '../lib/engine'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const NAVY   = '#0c1037'
const NAVYD  = '#080d28'
const NAVYL  = '#141852'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const NAV_ITEMS = [
  { icon: '⚡', label: 'Question Bank', id: 'home' },
  { icon: '🎓', label: 'Learn',         id: 'learn' },
  { icon: '📊', label: 'My Progress',   id: 'profile' },
  { icon: '🏆', label: 'Leaderboard',   id: 'leaderboard' },
  { icon: '📚', label: 'Study Plan',    id: 'study' },
  { icon: '🕐', label: 'History',       id: 'history' },
]

// Dark mode only tokens — gold palette throughout
const D = {
  bg:        NAVY,
  bgCard:    '#111a4a',
  bgNav:     NAVYD,
  bgHover:   NAVYL,
  border:    'rgba(255,255,255,0.07)',
  text:      '#f1f5f9',
  textSub:   '#94a3b8',
  textMuted: '#475569',
  textFaint: '#334155',
  danger:    '#ef4444',
  success:   '#10b981',
}

export default function HomeScreen({ profile, struggleMap, questions, onStartSession, onLeaderboard, onProfile, onLearn, onSignOut, onChangeSubject, subject, theme, onToggleTheme }) {
  const [activeNav, setActiveNav]       = useState('home')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile]         = useState(window.innerWidth <= 768)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const { level, pct, next } = getLevelProgress(profile.xp)
  const rank = RANKS[Math.min(level, RANKS.length - 1)]
  const icon = RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]

  const topStruggles = Object.entries(struggleMap)
    .map(([qid, s]) => {
      const q = questions.find(x => x.id === qid)
      if (!q || s.attempts === 0) return null
      return { q, rate: s.wrong / s.attempts, ...s }
    })
    .filter(x => x && x.rate >= 0.4)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5)

  const topicGroups = {}
  questions.forEach(q => {
    if (!topicGroups[q.topic]) topicGroups[q.topic] = { total: 0, attempted: 0, correct: 0 }
    topicGroups[q.topic].total++
    const s = struggleMap[q.id]
    if (s && s.attempts > 0) {
      topicGroups[q.topic].attempted++
      topicGroups[q.topic].correct += (s.attempts - s.wrong)
    }
  })

  const totalAttempts = Object.values(struggleMap).reduce((s, v) => s + v.attempts, 0)
  const totalWrong    = Object.values(struggleMap).reduce((s, v) => s + v.wrong, 0)
  const accuracy      = totalAttempts > 0 ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100) : 0

  const days     = ['M','T','W','T','F','S','S']
  const activity = [0, 0, 0, 0, totalAttempts, 0, 0]
  const maxAct   = Math.max(...activity, 1)

  const handleNav = (id) => {
    setActiveNav(id)
    setMobileMenuOpen(false)
    if (id === 'leaderboard') onLeaderboard()
    if (id === 'profile') onProfile()
    if (id === 'learn') onLearn()
  }

  const ThemeToggle = () => (
    <button onClick={onToggleTheme} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 20, border: `1px solid ${D.border}`, background: 'transparent', cursor: 'pointer' }}>
      <span style={{ fontSize: 12 }}>{theme === 'dark' ? '🌙' : '☀️'}</span>
      <div style={{ width: 32, height: 17, borderRadius: 9, background: theme === 'dark' ? '#1e293b' : '#d1a820', position: 'relative', transition: 'background 0.3s' }}>
        <div style={{ position: 'absolute', top: 2, left: theme === 'dark' ? 2 : 16, width: 13, height: 13, borderRadius: '50%', background: GOLD, transition: 'left 0.25s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
      </div>
    </button>
  )

  const SidebarContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: NAVYD, fontFamily: FONT_B }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🦁</div>
          <div>
            <div style={{ fontFamily: FONT_D, fontSize: 14, color: '#fff', letterSpacing: 0.5 }}>grade<span style={{ color: GOLD }}>farm.</span></div>
            <div style={{ fontSize: 10, color: D.textMuted, marginTop: 1 }}>{subject?.name || 'Chemistry'} · {subject?.stage || 'Stage 1'}</div>
          </div>
        </div>
        <ThemeToggle />
      </div>

      {/* Profile */}
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${D.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: NAVY, flexShrink: 0 }}>
            {profile.display_name[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name}</div>
            <div style={{ fontSize: 11, color: GOLD, fontWeight: 600 }}>{icon} {rank}</div>
          </div>
        </div>
        {/* XP bar */}
        <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 5, overflow: 'hidden', marginBottom: 4 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, transition: 'width 0.8s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: D.textMuted }}>Level {level}</span>
          <span style={{ fontSize: 10, color: D.textFaint }}>{profile.xp}/{next} XP</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => handleNav(item.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9,
            border: 'none', fontFamily: FONT_B, textAlign: 'left', width: '100%', cursor: 'pointer',
            background: activeNav === item.id ? 'rgba(241,190,67,0.12)' : 'transparent',
            color: activeNav === item.id ? GOLD : D.textMuted,
            fontSize: 13, fontWeight: activeNav === item.id ? 700 : 500,
            borderLeft: activeNav === item.id ? `2px solid ${GOLD}` : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${D.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={onChangeSubject} style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid rgba(241,190,67,0.3)`, background: 'transparent', color: GOLD, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
          ⇄ Change Subject
        </button>
        <button onClick={onSignOut} style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid ${D.border}`, background: 'transparent', color: D.textFaint, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>
          Sign out
        </button>
      </div>
    </div>
  )

  const MainContent = () => (
    <div style={{ flex: 1, padding: isMobile ? '16px' : '36px 40px', maxWidth: isMobile ? '100%' : 860, margin: '0 auto', width: '100%', fontFamily: FONT_B }}>
      <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, marginBottom: 4, color: '#f1f5f9' }}>Question Bank</h1>
      <div style={{ fontSize: 13, color: D.textMuted, marginBottom: 20 }}>{subject?.stage || 'Stage 1'} · {subject?.name || 'Chemistry'} · {questions.length} questions</div>

      {/* Activity graph */}
      <div style={{ background: '#111a4a', border: `1px solid ${D.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {['Week','Month','All'].map((tab, i) => (
              <button key={tab} style={{ padding: '5px 12px', borderRadius: 20, border: 'none', background: i === 0 ? GOLD : 'transparent', color: i === 0 ? NAVY : D.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>{tab}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: isMobile ? 16 : 24 }}>
            {[{val:totalAttempts,label:'answered'},{val:`${accuracy}%`,label:'correct'},{val:profile.streak||0,label:'streak'}].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: '#f1f5f9' }}>{s.val}</div>
                <div style={{ fontSize: 11, color: D.textMuted }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 50 }}>
          {days.map((d, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', background: activity[i] > 0 ? GOLD : 'rgba(255,255,255,0.07)', borderRadius: '4px 4px 0 0', height: activity[i] > 0 ? `${Math.max((activity[i]/maxAct)*38,8)}px` : '4px', transition: 'height 0.6s' }} />
              <div style={{ fontSize: 10, color: i === 4 ? GOLD : D.textFaint, fontWeight: i === 4 ? 700 : 400 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* New session */}
      <div style={{ background: '#111a4a', border: `1px solid ${D.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#f1f5f9' }}>New Session</div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', marginBottom: 2 }}>
            <span style={{ fontSize: 12, color: D.textMuted, flex: 1 }}>All Topics</span>
            <span style={{ fontSize: 11, color: D.textFaint }}>{questions.length} questions</span>
          </div>
          {Object.entries(topicGroups).map(([topic, s]) => {
            const pctDone = s.total > 0 ? s.attempted / s.total : 0
            const acc     = s.attempted > 0 ? s.correct / s.attempted : null
            const dotCol  = acc === null ? D.textFaint : acc > 0.7 ? D.success : acc > 0.4 ? GOLD : D.danger
            return (
              <div key={topic} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 8, cursor: 'default' }}
                onMouseEnter={e => e.currentTarget.style.background = NAVYL}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: dotCol }} />
                <span style={{ fontSize: 13, color: D.textSub, flex: 1 }}>{topic}</span>
                <div style={{ width: 60, background: 'rgba(255,255,255,0.07)', borderRadius: 3, height: 4, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ width: `${pctDone*100}%`, height: '100%', background: GOLD }} />
                </div>
                <span style={{ fontSize: 11, color: D.textFaint, width: 36, textAlign: 'right', flexShrink: 0 }}>{s.attempted}/{s.total}</span>
              </div>
            )
          })}
        </div>

        {topStruggles.length > 0 && (
          <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: D.danger, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>⚡ Priority Queue</div>
            {topStruggles.slice(0,3).map((s, i) => (
              <div key={s.q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: i < 2 ? `1px solid ${D.border}` : 'none' }}>
                <span style={{ fontSize: 12, color: D.textSub }}>{s.q.subtopic}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: s.rate > 0.65 ? D.danger : GOLD }}>{Math.round(s.rate*100)}% error</span>
              </div>
            ))}
          </div>
        )}

        <button onClick={onStartSession} style={{ width: '100%', padding: '15px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVY, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B, boxShadow: `0 8px 28px rgba(241,190,67,0.3)`, transition: 'all 0.15s' }}>
          Start Adaptive Session →
        </button>
      </div>
    </div>
  )

  const RightSidebar = () => (
    <div style={{ width: 280, padding: '36px 24px', borderLeft: `1px solid ${D.border}`, flexShrink: 0, fontFamily: FONT_B }}>
      {topStruggles.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>Priority Topics</div>
          <div style={{ fontSize: 11, color: D.textMuted, marginBottom: 14 }}>Hit first in your next session</div>
          {topStruggles.map((s, i) => (
            <div key={s.q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${D.border}` }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: s.rate > 0.65 ? 'rgba(239,68,68,0.15)' : 'rgba(241,190,67,0.15)', border: `1px solid ${s.rate > 0.65 ? D.danger : GOLD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: s.rate > 0.65 ? D.danger : GOLD, flexShrink: 0 }}>{i+1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.q.subtopic}</div>
                <div style={{ fontSize: 11, color: D.textMuted }}>{s.q.topic}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: s.rate > 0.65 ? D.danger : GOLD, flexShrink: 0 }}>{Math.round(s.rate*100)}%</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 14 }}>Your Stats</div>
        {[
          { label:'Total XP',       val: profile.xp.toLocaleString(), color: GOLD },
          { label:'Best streak',    val: `${profile.best_streak||0} days 🔥`, color: GOLD },
          { label:'Questions done', val: totalAttempts, color: '#f1f5f9' },
          { label:'Accuracy',       val: `${accuracy}%`, color: accuracy > 70 ? D.success : accuracy > 40 ? GOLD : D.danger },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${D.border}` }}>
            <span style={{ fontSize: 13, color: D.textMuted }}>{s.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.val}</span>
          </div>
        ))}
      </div>

      <div style={{ background: 'rgba(241,190,67,0.06)', border: '1px solid rgba(241,190,67,0.2)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 6 }}>📅 SACE Exam Sprint</div>
        <div style={{ fontSize: 12, color: D.textMuted, lineHeight: 1.6 }}>Set a study goal to track your daily progress towards your target ATAR.</div>
        <button style={{ marginTop: 10, width: '100%', padding: '9px', borderRadius: 8, border: `1px solid rgba(241,190,67,0.3)`, background: 'transparent', color: GOLD, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
          Set Study Goal →
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: NAVY, color: '#f1f5f9', fontFamily: FONT_B }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideIn { from{transform:translateX(-100%)} to{transform:translateX(0)} }
      `}</style>

      {/* Desktop sidebar */}
      {!isMobile && (
        <div style={{ width: 220, display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 50, borderRight: `1px solid ${D.border}` }}>
          <SidebarContent />
        </div>
      )}

      {/* Mobile sidebar overlay */}
      {isMobile && mobileMenuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setMobileMenuOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: 260, height: '100vh', animation: 'slideIn 0.25s ease', zIndex: 201, borderRight: `1px solid ${D.border}` }}>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main */}
      <div style={{ marginLeft: isMobile ? 0 : 220, display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>

        {/* Mobile topbar */}
        {isMobile && (
          <div style={{ position: 'sticky', top: 0, zIndex: 100, background: NAVYD, borderBottom: `1px solid ${D.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={() => setMobileMenuOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[20,14,20].map((w,i) => <div key={i} style={{ width: w, height: 2, background: '#f1f5f9', borderRadius: 2 }} />)}
              </div>
              <span style={{ fontFamily: FONT_D, fontSize: 16, color: '#fff', marginLeft: 8, letterSpacing: 0.5 }}>grade<span style={{ color: GOLD }}>farm.</span></span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ThemeToggle />
              <span style={{ fontSize: 12, color: GOLD, fontWeight: 700 }}>{profile.xp} XP</span>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: NAVY }}>
                {profile.display_name[0].toUpperCase()}
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{ display: 'flex', flex: 1, animation: 'fadeUp 0.4s ease' }}>
          <MainContent />
          {!isMobile && <RightSidebar />}
        </div>
      </div>
    </div>
  )
}