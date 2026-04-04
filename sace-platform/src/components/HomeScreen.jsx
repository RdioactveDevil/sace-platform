import { useState, useEffect } from 'react'
import { getLevelProgress, RANKS, RANK_ICONS } from '../lib/engine'
import { THEMES } from '../lib/theme'

const NAV_ITEMS = [
  { icon: '⚡', label: 'Question Bank', id: 'home' },
  { icon: '🎓', label: 'Learn',         id: 'learn' },
  { icon: '📊', label: 'My Progress',   id: 'profile' },
  { icon: '🏆', label: 'Leaderboard',   id: 'leaderboard' },
  { icon: '📚', label: 'Study Plan',    id: 'study' },
  { icon: '🕐', label: 'History',       id: 'history' },
]

export default function HomeScreen({ profile, struggleMap, questions, onStartSession, onLeaderboard, onProfile, onLearn, onSignOut, onChangeSubject, subject, theme, onToggleTheme }) {
  const [activeNav, setActiveNav]           = useState('home')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile]             = useState(window.innerWidth <= 768)
  const t = THEMES[theme]

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
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
    <button onClick={onToggleTheme} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 8px', borderRadius: 20,
      border: `1px solid ${t.border}`,
      background: t.bgSubtle, cursor: 'pointer',
      transition: 'all 0.2s', flexShrink: 0,
    }}>
      <span style={{ fontSize: 12 }}>{theme === 'dark' ? '🌙' : '☀️'}</span>
      <div style={{ width: 32, height: 17, borderRadius: 9, background: theme === 'dark' ? '#1e293b' : '#cbd5e1', position: 'relative', transition: 'background 0.3s' }}>
        <div style={{ position: 'absolute', top: 2, left: theme === 'dark' ? 2 : 16, width: 13, height: 13, borderRadius: '50%', background: theme === 'dark' ? t.accent : t.xp, transition: 'left 0.25s cubic-bezier(.4,0,.2,1)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
      </div>
    </button>
  )

  const SidebarContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: t.bgNav }}>
      <div style={{ padding: '18px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg,${t.accent},${t.accentLight})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🦁</div>
          <div>
            <div style={{ fontFamily: "'Sifonn Pro', sans-serif", fontSize: 15, lineHeight: 1, color: t.text, letterSpacing: 0.5 }}>grade<span style={{ color: t.accent }}>farm.</span></div>
            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>{subject?.name || 'Chemistry'} · {subject?.stage || 'Stage 2'}</div>
          </div>
        </div>
        <ThemeToggle />
      </div>

      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: `linear-gradient(135deg,${t.accent},${t.accentLight})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
            {profile.display_name[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name}</div>
            <div style={{ fontSize: 11, color: t.accent, fontWeight: 600 }}>{icon} {rank}</div>
          </div>
        </div>
        <div style={{ background: t.border, borderRadius: 4, height: 5, overflow: 'hidden', marginBottom: 4 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${t.accent},${t.accentBlue})`, transition: 'width 0.8s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: t.textMuted }}>Level {level}</span>
          <span style={{ fontSize: 10, color: t.textFaint }}>{profile.xp}/{next} XP</span>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => handleNav(item.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9,
            border: 'none',
            background: activeNav === item.id ? `${t.accent}18` : 'transparent',
            color: activeNav === item.id ? t.accent : t.textMuted,
            fontSize: 13, fontWeight: activeNav === item.id ? 700 : 500,
            cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
            textAlign: 'left', width: '100%', transition: 'all 0.15s',
            borderLeft: activeNav === item.id ? `2px solid ${t.accent}` : '2px solid transparent',
          }}>
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: '12px 16px', borderTop: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={onChangeSubject} style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid ${t.accent}44`, background: 'transparent', color: t.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          ⇄ Change Subject
        </button>
        <button onClick={onSignOut} style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textFaint, fontSize: 12, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Sign out
        </button>
      </div>
    </div>
  )

  const MainContent = () => (
    <div style={{ flex: 1, padding: isMobile ? '16px' : '36px 40px', maxWidth: isMobile ? '100%' : 860, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, marginBottom: 4, color: t.text }}>Question Bank</h1>
      <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 20 }}>{subject?.stage || 'Stage 2'} · {subject?.name || 'Chemistry'} · {questions.length} questions</div>

      {/* Activity graph */}
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: '16px', marginBottom: 14, boxShadow: theme === 'light' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {['Week','Month','All'].map((tab, i) => (
              <button key={tab} style={{ padding: '5px 12px', borderRadius: 20, border: 'none', background: i === 0 ? t.accent : 'transparent', color: i === 0 ? '#fff' : t.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{tab}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: isMobile ? 16 : 24 }}>
            {[{val:totalAttempts,label:'answered'},{val:`${accuracy}%`,label:'correct'},{val:profile.streak||0,label:'streak'}].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: t.text }}>{s.val}</div>
                <div style={{ fontSize: 11, color: t.textMuted }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 50 }}>
          {days.map((d, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', background: activity[i] > 0 ? t.accent : t.border, borderRadius: '4px 4px 0 0', height: activity[i] > 0 ? `${Math.max((activity[i]/maxAct)*38,8)}px` : '4px', transition: 'height 0.6s' }} />
              <div style={{ fontSize: 10, color: i === 4 ? t.accent : t.textFaint, fontWeight: i === 4 ? 700 : 400 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* New session */}
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: '16px', boxShadow: theme === 'light' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none' }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: t.text }}>New Session</div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', marginBottom: 2 }}>
            <span style={{ fontSize: 12, color: t.textMuted, flex: 1 }}>All Topics</span>
            <span style={{ fontSize: 11, color: t.textFaint }}>{questions.length} questions</span>
          </div>
          {Object.entries(topicGroups).map(([topic, s]) => {
            const pctDone = s.total > 0 ? s.attempted / s.total : 0
            const acc     = s.attempted > 0 ? s.correct / s.attempted : null
            const dotCol  = acc === null ? t.textFaint : acc > 0.7 ? t.success : acc > 0.4 ? t.xp : t.danger
            return (
              <div key={topic} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = t.bgHover}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: dotCol }} />
                <span style={{ fontSize: 13, color: t.textSub, flex: 1 }}>{topic}</span>
                <div style={{ width: 60, background: t.border, borderRadius: 3, height: 4, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ width: `${pctDone*100}%`, height: '100%', background: t.accent }} />
                </div>
                <span style={{ fontSize: 11, color: t.textFaint, width: 36, textAlign: 'right', flexShrink: 0 }}>{s.attempted}/{s.total}</span>
              </div>
            )
          })}
        </div>

        {topStruggles.length > 0 && (
          <div style={{ background: theme === 'dark' ? '#0a0d22' : '#fff9f0', border: `1px solid ${theme==='dark'?'rgba(239,68,68,0.15)':'rgba(220,38,38,0.2)'}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: t.danger, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>⚡ Priority Queue</div>
            {topStruggles.slice(0,3).map((s, i) => (
              <div key={s.q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: i < 2 ? `1px solid ${t.border}` : 'none' }}>
                <span style={{ fontSize: 12, color: t.textSub }}>{s.q.subtopic}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: s.rate > 0.65 ? t.danger : t.xp }}>{Math.round(s.rate*100)}% error</span>
              </div>
            ))}
          </div>
        )}

        <button onClick={onStartSession} style={{ width: '100%', padding: '15px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${t.accent},${t.accentLight})`, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: `0 8px 28px ${t.accent}40`, transition: 'all 0.15s' }}>
          Start Adaptive Session →
        </button>
      </div>
    </div>
  )

  const RightSidebar = () => (
    <div style={{ width: 280, padding: '36px 24px', borderLeft: `1px solid ${t.border}`, flexShrink: 0 }}>
      {topStruggles.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>Priority Topics</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 14 }}>Hit first in your next session</div>
          {topStruggles.map((s, i) => (
            <div key={s.q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${t.border}` }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: s.rate > 0.65 ? `${t.danger}22` : `${t.xp}22`, border: `1px solid ${s.rate > 0.65 ? t.danger : t.xp}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: s.rate > 0.65 ? t.danger : t.xp, flexShrink: 0 }}>{i+1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.q.subtopic}</div>
                <div style={{ fontSize: 11, color: t.textMuted }}>{s.q.topic}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: s.rate > 0.65 ? t.danger : t.xp, flexShrink: 0 }}>{Math.round(s.rate*100)}%</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 }}>Your Stats</div>
        {[
          { label:'Total XP',       val:profile.xp.toLocaleString(), color:t.accent },
          { label:'Best streak',    val:`${profile.best_streak||0} days 🔥`, color:t.xp },
          { label:'Questions done', val:totalAttempts, color:t.purple },
          { label:'Accuracy',       val:`${accuracy}%`, color:accuracy>70?t.success:accuracy>40?t.xp:t.danger },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${t.border}` }}>
            <span style={{ fontSize: 13, color: t.textMuted }}>{s.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.val}</span>
          </div>
        ))}
      </div>

      <div style={{ background: `${t.accent}0a`, border:`1px solid ${t.accent}33`, borderRadius: 12, padding: '16px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.accent, marginBottom: 6 }}>📅 SACE Exam Sprint</div>
        <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6 }}>Set a study goal to track your daily progress towards your target ATAR.</div>
        <button style={{ marginTop: 10, width: '100%', padding: '9px', borderRadius: 8, border: `1px solid ${t.accent}44`, background: 'transparent', color: t.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Set Study Goal →
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideIn { from{transform:translateX(-100%)} to{transform:translateX(0)} }
      `}</style>

      {/* Desktop sidebar — only on desktop */}
      {!isMobile && (
        <div style={{ width: 220, display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 50, borderRight: `1px solid ${t.border}` }}>
          <SidebarContent />
        </div>
      )}

      {/* Mobile sidebar overlay */}
      {isMobile && mobileMenuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setMobileMenuOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: 260, height: '100vh', animation: 'slideIn 0.25s ease', zIndex: 201, borderRight: `1px solid ${t.border}` }}>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main */}
      <div style={{ marginLeft: isMobile ? 0 : 220, display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>

        {/* Mobile top bar */}
        {isMobile && (
          <div style={{ position: 'sticky', top: 0, zIndex: 100, background: t.bgNav, borderBottom: `1px solid ${t.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={() => setMobileMenuOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[20,14,20].map((w,i) => <div key={i} style={{ width: w, height: 2, background: t.text, borderRadius: 2 }} />)}
              </div>
              <span style={{ fontFamily: "'Sifonn Pro', sans-serif", fontSize: 16, color: t.text, marginLeft: 6, letterSpacing: 0.5 }}>grade<span style={{ color: t.accent }}>farm.</span></span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ThemeToggle />
              <span style={{ fontSize: 12, color: t.accent, fontWeight: 700 }}>{profile.xp} XP</span>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg,${t.accent},${t.accentLight})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff' }}>
                {profile.display_name[0].toUpperCase()}
              </div>
            </div>
          </div>
        )}

        {/* Content row */}
        <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between', animation: 'fadeUp 0.4s ease' }}>
          <MainContent />
          {!isMobile && <RightSidebar />}
        </div>
      </div>
    </div>
  )
}