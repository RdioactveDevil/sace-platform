import { useState, useEffect } from 'react'
import { getLevelProgress, RANKS, RANK_ICONS } from '../lib/engine'
import { THEMES } from '../lib/theme'

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

export default function HomeScreen({ profile, struggleMap, questions, onStartSession, onLeaderboard, onProfile, onLearn, onSignOut, onChangeSubject, subject, theme, onToggleTheme }) {
  const [activeNav, setActiveNav]     = useState('home')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile]       = useState(window.innerWidth <= 768)
  const t = THEMES[theme]

  // Key colour splits: sidebar always navy (#0c1037), content area bg differs by mode
  const NAV_BG      = '#0c1037'
  const NAV_BORDER  = 'rgba(255,255,255,0.07)'
  const NAV_TEXT    = '#f1f5f9'
  const NAV_MUTED   = theme === 'dark' ? '#2d3a5e' : '#3d5080'
  const GOLD        = '#f1be43'
  const GOLDL       = '#f9d87a'

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
  const days          = ['M','T','W','T','F','S','S']
  const activity      = [0, 0, 0, 0, totalAttempts, 0, 0]
  const maxAct        = Math.max(...activity, 1)

  const handleNav = (id) => {
    setActiveNav(id)
    setMobileMenuOpen(false)
    if (id === 'leaderboard') onLeaderboard()
    if (id === 'profile') onProfile()
    if (id === 'learn') onLearn()
  }

  // Theme toggle — compact pill on sidebar
  const ThemeToggle = () => (
    <button onClick={onToggleTheme} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', cursor: 'pointer', flexShrink: 0 }}>
      <span style={{ fontSize: 11 }}>{theme === 'dark' ? '🌙' : '☀️'}</span>
      <div style={{ width: 28, height: 15, borderRadius: 8, background: 'rgba(255,255,255,0.1)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 2, left: theme === 'dark' ? 2 : 13, width: 11, height: 11, borderRadius: '50%', background: GOLD, transition: 'left 0.25s ease' }} />
      </div>
    </button>
  )

  // ── SIDEBAR — always navy regardless of mode ─────────────────────────────
  const SidebarContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: NAV_BG, fontFamily: FONT_B }}>

      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: `1px solid ${NAV_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: FONT_D, fontSize: 17, letterSpacing: 1, color: NAV_TEXT }}>
          grade<span style={{ color: GOLD }}>farm.</span>
        </div>
        <ThemeToggle />
      </div>

      {/* Subject label */}
      <div style={{ padding: '8px 16px', borderBottom: `1px solid ${NAV_BORDER}` }}>
        <div style={{ fontSize: 10, color: NAV_MUTED }}>{subject?.name || 'Chemistry'} · {subject?.stage || 'Stage 1'}</div>
      </div>

      {/* Profile */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${NAV_BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#0c1037', flexShrink: 0 }}>
            {profile.display_name[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: NAV_TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name}</div>
            <div style={{ fontSize: 10, color: GOLD, fontWeight: 600 }}>{icon} {rank}</div>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 4, overflow: 'hidden', marginBottom: 3 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, transition: 'width 0.8s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, color: NAV_MUTED }}>Level {level}</span>
          <span style={{ fontSize: 9, color: NAV_MUTED }}>{profile.xp}/{next} XP</span>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => handleNav(item.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 8, border: 'none',
            background: activeNav === item.id ? 'rgba(241,190,67,0.1)' : 'transparent',
            borderLeft: `2px solid ${activeNav === item.id ? GOLD : 'transparent'}`,
            color: activeNav === item.id ? GOLD : NAV_MUTED,
            fontSize: 13, fontWeight: activeNav === item.id ? 700 : 500,
            cursor: 'pointer', fontFamily: FONT_B,
            textAlign: 'left', width: '100%', transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Bottom actions */}
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${NAV_BORDER}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={onChangeSubject} style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid rgba(241,190,67,0.25)`, background: 'transparent', color: GOLD, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
          ⇄ Change Subject
        </button>
        <button onClick={onSignOut} style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid ${NAV_BORDER}`, background: 'transparent', color: NAV_MUTED, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>
          Sign out
        </button>
      </div>
    </div>
  )

  // ── MAIN CONTENT ─────────────────────────────────────────────────────────
  const MainContent = () => (
    <div style={{ flex: 1, padding: isMobile ? '16px' : '32px 36px', maxWidth: isMobile ? '100%' : 820, width: '100%' }}>
      <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, marginBottom: 3, color: t.text, fontFamily: FONT_B }}>Question Bank</h1>
      <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 18 }}>{subject?.stage || 'Stage 1'} · {subject?.name || 'Chemistry'} · {questions.length} questions</div>

      {/* Activity */}
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: '14px', marginBottom: 12, boxShadow: theme === 'light' ? '0 2px 12px rgba(12,16,55,0.07)' : '0 2px 8px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {['Week','Month','All'].map((tab, i) => (
              <button key={tab} style={{ padding: '4px 12px', borderRadius: 20, border: 'none', background: i === 0 ? GOLD : 'transparent', color: i === 0 ? '#0c1037' : t.textMuted, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>{tab}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: isMobile ? 14 : 22 }}>
            {[{val: totalAttempts, label: 'answered'}, {val: `${accuracy}%`, label: 'correct'}, {val: profile.streak || 0, label: 'streak'}].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: t.text }}>{s.val}</div>
                <div style={{ fontSize: 10, color: t.textMuted }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 44 }}>
          {days.map((d, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', background: activity[i] > 0 ? GOLD : t.border, borderRadius: '3px 3px 0 0', height: activity[i] > 0 ? `${Math.max((activity[i] / maxAct) * 36, 8)}px` : '3px', transition: 'height 0.6s' }} />
              <div style={{ fontSize: 9, color: i === 4 ? GOLD : t.textFaint, fontWeight: i === 4 ? 700 : 400 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* New session */}
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: '14px', boxShadow: theme === 'light' ? '0 2px 12px rgba(12,16,55,0.07)' : '0 2px 8px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: t.text }}>New Session</div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '3px 6px', marginBottom: 2 }}>
            <span style={{ fontSize: 11, color: t.textMuted, flex: 1 }}>All Topics</span>
            <span style={{ fontSize: 10, color: t.textFaint }}>{questions.length} questions</span>
          </div>
          {Object.entries(topicGroups).map(([topic, s]) => {
            const pctDone = s.total > 0 ? s.attempted / s.total : 0
            const acc     = s.attempted > 0 ? s.correct / s.attempted : null
            const dotCol  = acc === null ? t.textFaint : acc > 0.7 ? t.success : acc > 0.4 ? GOLD : t.danger
            return (
              <div key={topic} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px', borderRadius: 7 }}
                onMouseEnter={e => e.currentTarget.style.background = t.bgHover}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: dotCol }} />
                <span style={{ fontSize: 12, color: t.textSub, flex: 1 }}>{topic}</span>
                <div style={{ width: 56, background: t.border, borderRadius: 3, height: 3, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ width: `${pctDone * 100}%`, height: '100%', background: GOLD }} />
                </div>
                <span style={{ fontSize: 10, color: t.textFaint, width: 32, textAlign: 'right', flexShrink: 0 }}>{s.attempted}/{s.total}</span>
              </div>
            )
          })}
        </div>

        {topStruggles.length > 0 && (
          <div style={{ background: theme === 'dark' ? 'rgba(239,68,68,0.06)' : '#fff5f5', border: `1px solid ${theme === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(220,38,38,0.15)'}`, borderRadius: 9, padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: t.danger, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 7 }}>⚡ Priority Queue</div>
            {topStruggles.slice(0, 3).map((s, i) => (
              <div key={s.q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: i < 2 ? `1px solid ${t.border}` : 'none' }}>
                <span style={{ fontSize: 12, color: t.textSub }}>{s.q.subtopic}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: t.danger }}>{Math.round(s.rate * 100)}% error</span>
              </div>
            ))}
          </div>
        )}

        <button onClick={onStartSession} style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: '#0c1037', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B, boxShadow: `0 6px 20px rgba(241,190,67,0.35)`, transition: 'all 0.15s' }}>
          Start Adaptive Session →
        </button>
      </div>
    </div>
  )

  // ── RIGHT SIDEBAR ─────────────────────────────────────────────────────────
  const RightSidebar = () => (
    <div style={{ width: 260, padding: '32px 20px', borderLeft: `1px solid ${t.border}`, flexShrink: 0 }}>
      {topStruggles.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 3 }}>Priority Topics</div>
          <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 12 }}>Hit first in your next session</div>
          {topStruggles.map((s, i) => (
            <div key={s.q.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: `1px solid ${t.border}` }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${t.danger}15`, border: `1px solid ${t.danger}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: t.danger, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.q.subtopic}</div>
                <div style={{ fontSize: 10, color: t.textMuted }}>{s.q.topic}</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.danger, flexShrink: 0 }}>{Math.round(s.rate * 100)}%</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>Your Stats</div>
        {[
          { label: 'Total XP',       val: profile.xp.toLocaleString(), color: GOLD },
          { label: 'Best streak',    val: `${profile.best_streak || 0} days 🔥`, color: GOLD },
          { label: 'Questions done', val: totalAttempts, color: t.text },
          { label: 'Accuracy',       val: `${accuracy}%`, color: accuracy > 70 ? t.success : accuracy > 40 ? GOLD : t.danger },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${t.border}` }}>
            <span style={{ fontSize: 12, color: t.textMuted }}>{s.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.val}</span>
          </div>
        ))}
      </div>

      <div style={{ background: theme === 'dark' ? 'rgba(241,190,67,0.05)' : 'rgba(12,16,55,0.03)', border: `1px solid ${theme === 'dark' ? 'rgba(241,190,67,0.15)' : '#e2e5f0'}`, borderRadius: 10, padding: '14px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: theme === 'dark' ? GOLD : '#0c1037', marginBottom: 5 }}>📅 SACE Exam Sprint</div>
        <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.6, marginBottom: 10 }}>Set a study goal to track your daily progress towards your target ATAR.</div>
        <button style={{ width: '100%', padding: '8px', borderRadius: 7, border: `1px solid ${theme === 'dark' ? 'rgba(241,190,67,0.2)' : '#e2e5f0'}`, background: 'transparent', color: theme === 'dark' ? GOLD : '#0c1037', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
          Set Study Goal →
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: FONT_B }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideIn { from{transform:translateX(-100%)} to{transform:translateX(0)} }
      `}</style>

      {/* Desktop sidebar */}
      {!isMobile && (
        <div style={{ width: 220, display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 50 }}>
          <SidebarContent />
        </div>
      )}

      {/* Mobile sidebar overlay */}
      {isMobile && mobileMenuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setMobileMenuOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: 260, height: '100vh', animation: 'slideIn 0.25s ease', zIndex: 201 }}>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main area */}
      <div style={{ marginLeft: isMobile ? 0 : 220, display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>

        {/* Mobile topbar */}
        {isMobile && (
          <div style={{ position: 'sticky', top: 0, zIndex: 100, background: NAV_BG, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={() => setMobileMenuOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[20, 14, 20].map((w, i) => <div key={i} style={{ width: w, height: 2, background: '#fff', borderRadius: 2 }} />)}
              </div>
              <span style={{ fontFamily: FONT_D, fontSize: 16, color: '#fff', marginLeft: 6, letterSpacing: 1 }}>grade<span style={{ color: GOLD }}>farm.</span></span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ThemeToggle />
              <span style={{ fontSize: 12, color: GOLD, fontWeight: 700 }}>{profile.xp} XP</span>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#0c1037' }}>
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