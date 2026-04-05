import { getLevelProgress, RANKS, RANK_ICONS } from '../lib/engine'
import { THEMES } from '../lib/theme'

export default function ProfileScreen({ profile, questions, struggleMap, onBack, theme, embedded }) {
  const { level, pct } = getLevelProgress(profile.xp)
  const rank  = RANKS[Math.min(level, RANKS.length - 1)]
  const rIcon = RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]
  const t     = THEMES[theme]

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

  const studyPlan = Object.entries(topicStats)
    .filter(([, s]) => s.attempted > 0)
    .map(([topic, s]) => ({ topic, rate: s.correct / Math.max(s.correct + s.wrong, 1) }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 3)

  const totalAttempts = Object.values(struggleMap).reduce((s, v) => s + v.attempts, 0)
  const totalWrong    = Object.values(struggleMap).reduce((s, v) => s + v.wrong, 0)
  const accuracy      = totalAttempts > 0 ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100) : 0
  const nextRank      = RANKS[Math.min(level + 1, RANKS.length - 1)]

  return (
    <div style={{ minHeight: embedded ? 'auto' : '100vh', background: embedded ? 'transparent' : t.bg, color: t.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 900, padding: '36px 40px', animation: 'fadeUp 0.4s ease' }}>
          <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Analytics</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24, color: t.text }}>My Progress</h1>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>

            {/* Left column */}
            <div>
              {/* Rank card */}
              <div style={{ background: theme==='dark'?'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(14,165,233,0.08))':'linear-gradient(135deg,rgba(99,102,241,0.06),rgba(14,165,233,0.04))', border:`1px solid ${theme==='dark'?'rgba(99,102,241,0.25)':'rgba(99,102,241,0.2)'}`, borderRadius: 14, padding: '20px 24px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: theme==='light'?'0 1px 4px rgba(0,0,0,0.06)':'none' }}>
                <div>
                  <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, marginBottom: 4 }}>CURRENT RANK</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: t.text }}>{rank}</div>
                  <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>Level {level} · {profile.xp.toLocaleString()} XP</div>
                  {nextRank !== rank && <div style={{ fontSize: 12, color: '#f1be43', marginTop: 6 }}>Next: {nextRank} →</div>}
                </div>
                <div style={{ fontSize: 52 }}>{rIcon}</div>
              </div>

              {/* XP progress */}
              <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: '18px 20px', marginBottom: 20, boxShadow: theme==='light'?'0 1px 4px rgba(0,0,0,0.06)':'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>XP Progress</span>
                  <span style={{ fontSize: 12, color: t.textMuted }}>{profile.xp.toLocaleString()} XP</span>
                </div>
                <div style={{ background: t.border, borderRadius: 6, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#f1be43,#f9d87a)', borderRadius: 6, transition: 'width 0.9s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: t.textMuted }}>Level {level}</span>
                  <span style={{ fontSize: 11, color: t.textFaint }}>Level {level + 1}</span>
                </div>
              </div>

              {/* Topic breakdown */}
              <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: '18px 20px', boxShadow: theme==='light'?'0 1px 4px rgba(0,0,0,0.06)':'none' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 16 }}>Topic Breakdown</div>
                {Object.entries(topicStats).map(([topic, s]) => {
                  const rate  = s.attempted > 0 ? s.correct / Math.max(s.correct + s.wrong, 1) : null
                  const col   = rate === null ? t.textFaint : rate > 0.75 ? t.success : rate > 0.45 ? t.xp : t.danger
                  const label = rate === null ? 'Not started' : rate > 0.75 ? 'Strong' : rate > 0.45 ? 'Developing' : 'Needs work'
                  const pctW  = s.total > 0 ? (s.attempted / s.total) * 100 : 0
                  return (
                    <div key={topic} style={{ padding: '12px 0', borderBottom: `1px solid ${t.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{topic}</div>
                          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{s.attempted}/{s.total} attempted</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: col }}>{label}</div>
                          {rate !== null && <div style={{ fontSize: 11, color: t.textMuted }}>{Math.round(rate * 100)}% correct</div>}
                        </div>
                      </div>
                      <div style={{ background: t.border, borderRadius: 3, height: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${pctW}%`, height: '100%', background: col, borderRadius: 3, transition: 'width 0.6s' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: '18px 20px', boxShadow: theme==='light'?'0 1px 4px rgba(0,0,0,0.06)':'none' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 }}>Your Stats</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label:'Total XP',    val:profile.xp.toLocaleString(), color:'#f1be43' },
                    { label:'Accuracy',    val:`${accuracy}%`, color:accuracy>70?t.success:accuracy>40?t.xp:t.danger },
                    { label:'Questions',   val:totalAttempts, color:t.purple },
                    { label:'Best Streak', val:`${profile.best_streak||0}🔥`, color:t.xp },
                  ].map(s => (
                    <div key={s.label} style={{ background: t.bgSubtle, borderRadius: 10, padding: '12px', border: `1px solid ${t.border}` }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
                      <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {studyPlan.length > 0 ? (
                <div style={{ background: theme==='dark'?'#08111f':'#fff8f8', border:`1px solid ${theme==='dark'?'rgba(239,68,68,0.15)':'rgba(220,38,38,0.15)'}`, borderRadius: 14, padding: '18px 20px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>📚 Study Plan</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 14 }}>Focus on these first</div>
                  {studyPlan.map((p, i) => (
                    <div key={p.topic} style={{ padding: '10px 0', borderBottom: i < studyPlan.length-1 ? `1px solid ${t.border}` : 'none' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 4 }}>{i+1}. {p.topic}</div>
                      <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.55 }}>
                        {p.rate < 0.4 ? `Re-read your SACE notes on ${p.topic} before attempting more questions.` : `Do 5–8 more ${p.topic} questions to build confidence.`}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: '18px 20px', fontSize: 13, color: t.textMuted, textAlign: 'center', lineHeight: 1.6 }}>
                  Complete a few sessions to generate your personalised study plan.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}