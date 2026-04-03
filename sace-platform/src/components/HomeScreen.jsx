import { getLevelProgress, RANKS, RANK_ICONS } from '../lib/engine'

export default function HomeScreen({ profile, struggleMap, questions, onStartSession, onLeaderboard, onProfile, onSignOut }) {
  const { level, pct, next, current } = getLevelProgress(profile.xp)
  const rank = RANKS[Math.min(level, RANKS.length - 1)]
  const icon = RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]

  // Compute top struggle topics
  const topStruggles = Object.entries(struggleMap)
    .map(([qid, s]) => {
      const q = questions.find(x => x.id === qid)
      if (!q || s.attempts === 0) return null
      return { q, rate: s.wrong / s.attempts, ...s }
    })
    .filter(x => x && x.rate >= 0.4)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 4)

  // Topic mastery overview
  const topicMap = {}
  questions.forEach(q => {
    if (!topicMap[q.topic]) topicMap[q.topic] = { total: 0, correct: 0, attempted: 0 }
    topicMap[q.topic].total++
    const s = struggleMap[q.id]
    if (s && s.attempts > 0) {
      topicMap[q.topic].attempted++
      topicMap[q.topic].correct += (s.attempts - s.wrong)
    }
  })

  const accuracy = profile.xp > 0
    ? Math.round((profile.xp / (profile.xp + 10)) * 100) // rough proxy until we store separately
    : 0

  const c = {
    wrap: {
      minHeight: '100vh', background: '#070c16', color: '#e2e8f0',
      fontFamily: "'Syne', sans-serif", padding: '20px 16px 40px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      backgroundImage: 'radial-gradient(ellipse at 15% 0%, rgba(20,184,166,0.06) 0%, transparent 50%), radial-gradient(ellipse at 85% 90%, rgba(14,165,233,0.05) 0%, transparent 50%)',
    },
    card: {
      width: '100%', maxWidth: 620,
      background: 'rgba(12,21,37,0.97)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 18, padding: '22px 22px',
      boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
    },
  }

  return (
    <div style={c.wrap}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .tile:hover { background: #132030 !important; }
        .ghostbtn:hover { background: #132030 !important; }
      `}</style>

      <div style={{ ...c.card, animation: 'fadeUp 0.4s ease' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: '#14b8a6', letterSpacing: '0.15em', fontWeight: 700, textTransform: 'uppercase' }}>
              SACE Stage 2 · Chemistry
            </div>
            <h1 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>
              Hey, {profile.display_name.split(' ')[0]} 👋
            </h1>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20 }}>{icon}</div>
            <div style={{ fontSize: 12, color: '#14b8a6', fontWeight: 700 }}>{rank}</div>
            <div style={{ fontSize: 11, color: '#334155' }}>Level {level}</div>
          </div>
        </div>

        {/* XP Bar */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#475569', fontFamily: "'JetBrains Mono', monospace" }}>
              {profile.xp.toLocaleString()} XP
            </span>
            <span style={{ fontSize: 11, color: '#334155', fontFamily: "'JetBrains Mono', monospace" }}>
              {next.toLocaleString()} XP to Level {level + 1}
            </span>
          </div>
          <div style={{ background: '#0c1525', borderRadius: 6, height: 7, overflow: 'hidden', border: '1px solid #1e293b' }}>
            <div style={{
              width: `${pct}%`, height: '100%',
              background: 'linear-gradient(90deg, #14b8a6, #0ea5e9)',
              borderRadius: 6, transition: 'width 0.9s cubic-bezier(.4,0,.2,1)',
              boxShadow: '0 0 10px rgba(20,184,166,0.4)',
            }} />
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 18 }}>
          {[
            { label: 'XP Earned', val: profile.xp.toLocaleString(), color: '#14b8a6' },
            { label: 'Streak', val: `${profile.streak || 0} 🔥`, color: '#f59e0b' },
            { label: 'Best Streak', val: profile.best_streak || 0, color: '#6366f1' },
          ].map(s => (
            <div key={s.label} className="tile" style={{
              background: '#0c1525', borderRadius: 12, padding: '12px 10px',
              textAlign: 'center', border: '1px solid #1e293b', cursor: 'default',
              transition: 'background 0.2s',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>
                {s.val}
              </div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Struggle Radar */}
        {topStruggles.length > 0 && (
          <div style={{
            background: '#08111f', border: '1px solid rgba(239,68,68,0.15)',
            borderRadius: 14, padding: '14px 16px', marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', marginBottom: 10 }}>
              ⚡ Priority Queue — We'll hit these first
            </div>
            {topStruggles.map(s => (
              <div key={s.q.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 10px', background: '#0c1525', borderRadius: 8, marginBottom: 5,
                borderLeft: `3px solid ${s.rate > 0.65 ? '#ef4444' : '#f59e0b'}`,
              }}>
                <div>
                  <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{s.q.subtopic}</span>
                  <span style={{ fontSize: 11, color: '#334155', marginLeft: 7 }}>{s.q.topic}</span>
                </div>
                <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: s.rate > 0.65 ? '#f87171' : '#fbbf24', fontWeight: 700 }}>
                  {Math.round(s.rate * 100)}% error
                </span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#334155', marginTop: 6 }}>
              Your session will automatically prioritise these topics.
            </div>
          </div>
        )}

        {topStruggles.length === 0 && (
          <div style={{
            background: '#08111f', border: '1px solid rgba(20,184,166,0.15)',
            borderRadius: 14, padding: '14px 16px', marginBottom: 14,
            fontSize: 13, color: '#475569',
          }}>
            ✨ No flagged topics yet — complete a few sessions to start building your profile.
          </div>
        )}

        {/* Nav buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <button className="ghostbtn" onClick={onLeaderboard} style={{
            padding: '11px', borderRadius: 10, border: '1px solid #1e293b',
            background: '#0c1525', color: '#94a3b8', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: "'Syne', sans-serif", transition: 'background 0.2s',
          }}>🏆 Leaderboard</button>
          <button className="ghostbtn" onClick={onProfile} style={{
            padding: '11px', borderRadius: 10, border: '1px solid #1e293b',
            background: '#0c1525', color: '#94a3b8', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: "'Syne', sans-serif", transition: 'background 0.2s',
          }}>📊 My Progress</button>
        </div>

        {/* Start button */}
        <button onClick={onStartSession} style={{
          width: '100%', padding: '16px', borderRadius: 14, border: 'none',
          background: 'linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)',
          color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer',
          fontFamily: "'Syne', sans-serif", letterSpacing: '0.02em',
          boxShadow: '0 10px 36px rgba(20,184,166,0.3)',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
          onMouseEnter={e => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '0 14px 40px rgba(20,184,166,0.4)' }}
          onMouseLeave={e => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = '0 10px 36px rgba(20,184,166,0.3)' }}
        >
          Start Adaptive Session →
        </button>

        <button onClick={onSignOut} style={{
          marginTop: 10, width: '100%', padding: '10px', borderRadius: 10,
          border: 'none', background: 'transparent', color: '#334155',
          fontSize: 12, cursor: 'pointer', fontFamily: "'Syne', sans-serif",
        }}>Sign out</button>
      </div>
    </div>
  )
}
