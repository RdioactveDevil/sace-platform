import { getLevelProgress, RANKS, RANK_ICONS } from '../lib/engine'

export default function ProfileScreen({ profile, questions, struggleMap, onBack }) {
  const { level, pct } = getLevelProgress(profile.xp)
  const rank = RANKS[Math.min(level, RANKS.length - 1)]
  const icon = RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]

  // Build topic-level stats
  const topicStats = {}
  questions.forEach(q => {
    if (!topicStats[q.topic]) topicStats[q.topic] = { total: 0, attempted: 0, correct: 0, wrong: 0 }
    topicStats[q.topic].total++
    const s = struggleMap[q.id]
    if (s && s.attempts > 0) {
      topicStats[q.topic].attempted++
      topicStats[q.topic].correct += (s.attempts - s.wrong)
      topicStats[q.topic].wrong   += s.wrong
    }
  })

  // Study plan: worst topics first
  const studyPlan = Object.entries(topicStats)
    .filter(([, s]) => s.attempted > 0)
    .map(([topic, s]) => ({ topic, rate: s.correct / (s.correct + s.wrong) }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 3)

  const totalAttempts = Object.values(struggleMap).reduce((s, v) => s + v.attempts, 0)
  const totalWrong    = Object.values(struggleMap).reduce((s, v) => s + v.wrong, 0)
  const accuracy      = totalAttempts > 0 ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100) : 0

  return (
    <div style={{
      minHeight: '100vh', background: '#070c16', color: '#e2e8f0',
      fontFamily: "'Syne', sans-serif", padding: '20px 16px 40px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      backgroundImage: 'radial-gradient(ellipse at 20% 10%, rgba(99,102,241,0.06) 0%, transparent 50%)',
    }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{
        width: '100%', maxWidth: 620,
        background: 'rgba(12,21,37,0.97)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 18, padding: '22px 22px',
        animation: 'fadeUp 0.4s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: '#6366f1', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>Analytics</div>
            <h2 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800 }}>My Progress</h2>
          </div>
          <button onClick={onBack} style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid #1e293b',
            background: 'transparent', color: '#475569', fontSize: 12,
            cursor: 'pointer', fontFamily: "'Syne', sans-serif",
          }}>← Back</button>
        </div>

        {/* Rank card */}
        <div style={{
          background: 'linear-gradient(135deg,rgba(99,102,241,0.1),rgba(14,165,233,0.08))',
          border: '1px solid rgba(99,102,241,0.25)', borderRadius: 14,
          padding: '16px 18px', marginBottom: 14,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#818cf8', fontWeight: 700, marginBottom: 3 }}>CURRENT RANK</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{rank}</div>
            <div style={{ fontSize: 12, color: '#334155', marginTop: 2 }}>
              Level {level} · {profile.xp.toLocaleString()} XP
            </div>
          </div>
          <div style={{ fontSize: 40 }}>{icon}</div>
        </div>

        {/* XP progress */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ background: '#0c1525', borderRadius: 6, height: 7, overflow: 'hidden', border: '1px solid #1e293b' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#6366f1,#14b8a6)', borderRadius: 6, transition: 'width 0.8s' }} />
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 18 }}>
          {[
            { label: 'Questions', val: totalAttempts },
            { label: 'Accuracy', val: `${accuracy}%` },
            { label: 'Best Streak', val: `${profile.best_streak || 0}🔥` },
          ].map(s => (
            <div key={s.label} style={{
              background: '#0c1525', borderRadius: 11, padding: '12px 8px',
              textAlign: 'center', border: '1px solid #1e293b',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0', fontFamily: "'JetBrains Mono', monospace" }}>
                {s.val}
              </div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Topic breakdown */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
            Topic Breakdown
          </div>
          {Object.entries(topicStats).map(([topic, s]) => {
            const rate = s.attempted > 0 ? (s.correct / (s.correct + s.wrong)) : null
            const col   = rate === null ? '#334155' : rate > 0.75 ? '#14b8a6' : rate > 0.45 ? '#f59e0b' : '#ef4444'
            const label = rate === null ? 'Not started' : rate > 0.75 ? 'Strong' : rate > 0.45 ? 'Developing' : 'Needs work'
            return (
              <div key={topic} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', background: '#0c1525', borderRadius: 10,
                marginBottom: 6, border: '1px solid #1e293b',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{topic}</div>
                  <div style={{ fontSize: 11, color: '#334155', marginTop: 2 }}>
                    {s.attempted}/{s.total} attempted
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: col }}>{label}</div>
                  {rate !== null && (
                    <div style={{ fontSize: 11, color: '#334155' }}>{Math.round(rate * 100)}% correct</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Study plan */}
        {studyPlan.length > 0 && (
          <div style={{
            background: '#08111f',
            border: '1px solid rgba(239,68,68,0.15)',
            borderRadius: 14, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
              📚 Recommended Study Plan
            </div>
            {studyPlan.map((p, i) => (
              <div key={p.topic} style={{
                padding: '9px 0',
                borderBottom: i < studyPlan.length - 1 ? '1px solid #0c1525' : 'none',
              }}>
                <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 700 }}>
                  {i + 1}. {p.topic}
                </div>
                <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.55, marginTop: 3 }}>
                  {p.rate < 0.4
                    ? `Re-read your SACE notes on ${p.topic} from scratch before attempting more questions.`
                    : `Do 5–8 more ${p.topic} questions. Focus on the subtopics flagged in your Priority Queue.`}
                </div>
              </div>
            ))}
          </div>
        )}

        {studyPlan.length === 0 && (
          <div style={{
            background: '#08111f', border: '1px solid rgba(20,184,166,0.15)',
            borderRadius: 14, padding: '14px 16px',
            fontSize: 13, color: '#334155', textAlign: 'center',
          }}>
            Complete a few sessions to generate your personalised study plan.
          </div>
        )}
      </div>
    </div>
  )
}
