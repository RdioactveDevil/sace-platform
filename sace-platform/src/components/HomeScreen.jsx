import { useState } from 'react'
import { getLevelProgress, RANKS, RANK_ICONS } from '../lib/engine'

const NAV_ITEMS = [
  { icon: '⚡', label: 'Question Bank', id: 'home' },
  { icon: '📊', label: 'My Progress', id: 'profile' },
  { icon: '🏆', label: 'Leaderboard', id: 'leaderboard' },
  { icon: '📚', label: 'Study Plan', id: 'study' },
  { icon: '🕐', label: 'History', id: 'history' },
]

export default function HomeScreen({ profile, struggleMap, questions, onStartSession, onLeaderboard, onProfile, onSignOut }) {
  const [activeNav, setActiveNav] = useState('home')
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

  // Mock weekly activity (replace with real data later)
  const days = ['M','T','W','T','F','S','S']
  const activity = [0, 0, 0, 0, totalAttempts, 0, 0]
  const maxAct = Math.max(...activity, 1)

  const handleNav = (id) => {
    setActiveNav(id)
    if (id === 'leaderboard') onLeaderboard()
    if (id === 'profile') onProfile()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#070c16', color: '#e2e8f0', fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex' }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .nav-item:hover { background: rgba(20,184,166,0.08) !important; color: #e2e8f0 !important; }
        .topic-row:hover { background: #132030 !important; }
        .start-btn:hover { opacity: 0.9; transform: translateY(-1px); }
      `}</style>

      {/* LEFT SIDEBAR */}
      <div style={{ width: 220, background: '#0a1020', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 50 }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#14b8a6,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>⚗️</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>SACE<span style={{ color: '#14b8a6' }}>IQ</span></div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>Chemistry · Stage 2</div>
            </div>
          </div>
        </div>

        {/* User card */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#14b8a6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff' }}>
              {profile.display_name[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name}</div>
              <div style={{ fontSize: 11, color: '#14b8a6', fontWeight: 600 }}>{icon} {rank}</div>
            </div>
          </div>
          {/* XP bar */}
          <div style={{ background: '#1e293b', borderRadius: 4, height: 5, overflow: 'hidden', marginBottom: 4 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#14b8a6,#0ea5e9)', transition: 'width 0.8s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: '#475569' }}>Level {level}</span>
            <span style={{ fontSize: 10, color: '#334155' }}>{profile.xp}/{next} XP</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map(item => (
            <button key={item.id} className="nav-item" onClick={() => handleNav(item.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9,
              border: 'none', background: activeNav === item.id ? 'rgba(20,184,166,0.12)' : 'transparent',
              color: activeNav === item.id ? '#14b8a6' : '#475569',
              fontSize: 13, fontWeight: activeNav === item.id ? 700 : 500,
              cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
              textAlign: 'left', width: '100%', transition: 'all 0.15s',
              borderLeft: activeNav === item.id ? '2px solid #14b8a6' : '2px solid transparent',
            }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Sign out */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #1e293b' }}>
          <button onClick={onSignOut} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #1e293b', background: 'transparent', color: '#334155', fontSize: 12, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Sign out
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ marginLeft: 220, flex: 1, display: 'flex', minHeight: '100vh' }}>

        {/* Centre */}
        <div style={{ flex: 1, padding: '32px 32px', maxWidth: 800 }}>
          <div style={{ animation: 'fadeUp 0.4s ease' }}>

            {/* Page title */}
            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Question Bank</h1>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 28 }}>SACE Stage 2 · Chemistry · {questions.length} questions</div>

            {/* Activity graph */}
            <div style={{ background: '#0c1525', border: '1px solid #1e293b', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['Week','Month','All'].map((t,i) => (
                    <button key={t} style={{ padding: '5px 12px', borderRadius: 20, border: 'none', background: i===0 ? '#14b8a6' : 'transparent', color: i===0 ? '#fff' : '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{t}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 24, textAlign: 'right' }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>{totalAttempts}</div>
                    <div style={{ fontSize: 11, color: '#475569' }}>answered</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>{accuracy}%</div>
                    <div style={{ fontSize: 11, color: '#475569' }}>correct</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>{profile.streak || 0}</div>
                    <div style={{ fontSize: 11, color: '#475569' }}>day streak</div>
                  </div>
                </div>
              </div>

              {/* Bar chart */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 60, marginBottom: 8 }}>
                {days.map((d, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: '100%', background: activity[i] > 0 ? '#14b8a6' : '#1e293b', borderRadius: '4px 4px 0 0', height: activity[i] > 0 ? `${Math.max((activity[i]/maxAct)*50, 8)}px` : '4px', transition: 'height 0.6s ease' }} />
                    <div style={{ fontSize: 10, color: i === 4 ? '#14b8a6' : '#334155', fontWeight: i === 4 ? 700 : 400 }}>{d}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* New Session */}
            <div style={{ background: '#0c1525', border: '1px solid #1e293b', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>New Session</div>

              {/* Topic list */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#475569', flex: 1 }}>All Topics</span>
                  <span style={{ fontSize: 12, color: '#334155' }}>{questions.length} questions</span>
                </div>
                {Object.entries(topicGroups).map(([topic, s]) => {
                  const pctDone = s.total > 0 ? (s.attempted / s.total) : 0
                  const acc = s.attempted > 0 ? s.correct / (s.attempted) : null
                  return (
                    <div key={topic} className="topic-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, transition: 'background 0.15s', cursor: 'default' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: acc === null ? '#334155' : acc > 0.7 ? '#10b981' : acc > 0.4 ? '#f59e0b' : '#ef4444', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: '#94a3b8', flex: 1 }}>{topic}</span>
                      <div style={{ width: 80, background: '#1e293b', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${pctDone * 100}%`, height: '100%', background: '#14b8a6' }} />
                      </div>
                      <span style={{ fontSize: 11, color: '#334155', width: 48, textAlign: 'right' }}>{s.attempted}/{s.total}</span>
                    </div>
                  )
                })}
              </div>

              {/* Start button */}
              <button className="start-btn" onClick={onStartSession} style={{
                width: '100%', padding: '15px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #14b8a6, #0ea5e9)',
                color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                boxShadow: '0 8px 28px rgba(20,184,166,0.3)',
                transition: 'all 0.15s',
              }}>
                Start Adaptive Session →
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div style={{ width: 280, padding: '32px 20px', borderLeft: '1px solid #1e293b', flexShrink: 0 }}>
          <div style={{ animation: 'fadeUp 0.5s ease' }}>

            {/* Priority queue */}
            {topStruggles.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Priority Topics</div>
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 12 }}>These will be hit first</div>
                {topStruggles.map((s, i) => (
                  <div key={s.q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #0f1729' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: s.rate > 0.65 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', border: `1px solid ${s.rate > 0.65 ? '#ef4444' : '#f59e0b'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: s.rate > 0.65 ? '#f87171' : '#fbbf24', flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.q.subtopic}</div>
                      <div style={{ fontSize: 11, color: '#475569' }}>{s.q.topic}</div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: s.rate > 0.65 ? '#f87171' : '#fbbf24', flexShrink: 0 }}>{Math.round(s.rate * 100)}%</div>
                  </div>
                ))}
              </div>
            )}

            {/* Stats summary */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>Your Stats</div>
              {[
                { label: 'Total XP', val: profile.xp.toLocaleString(), color: '#14b8a6' },
                { label: 'Best streak', val: `${profile.best_streak || 0} days 🔥`, color: '#f59e0b' },
                { label: 'Questions done', val: totalAttempts, color: '#6366f1' },
                { label: 'Accuracy', val: `${accuracy}%`, color: accuracy > 70 ? '#10b981' : accuracy > 40 ? '#f59e0b' : '#ef4444' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #0f1729' }}>
                  <span style={{ fontSize: 12, color: '#475569' }}>{s.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.val}</span>
                </div>
              ))}
            </div>

            {/* ATAR exam countdown placeholder */}
            <div style={{ background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.2)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#14b8a6', marginBottom: 6 }}>📅 SACE Exam Sprint</div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                Set up a study goal to track your daily progress towards your target ATAR.
              </div>
              <button style={{ marginTop: 10, width: '100%', padding: '8px', borderRadius: 8, border: '1px solid rgba(20,184,166,0.3)', background: 'transparent', color: '#14b8a6', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Set Study Goal →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}