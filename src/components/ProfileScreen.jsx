import { getLevelProgress, RANKS, RANK_ICONS } from '../lib/engine'
import { THEMES } from '../lib/theme'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

export default function ProfileScreen({ profile, questions, struggleMap, theme, embedded, onStartSession, onOpenLearn }) {
  const t = THEMES[theme]
  const { level, pct } = getLevelProgress(profile.xp)
  const rank = RANKS[Math.min(level, RANKS.length - 1)]
  const nextRank = RANKS[Math.min(level + 1, RANKS.length - 1)]
  const rIcon = RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]

  const topicStats = {}
  const topicSubtopics = {}
  questions.forEach((q) => {
    if (!topicStats[q.topic]) topicStats[q.topic] = { total: 0, attempted: 0, correct: 0, wrong: 0 }
    if (!topicSubtopics[q.topic]) topicSubtopics[q.topic] = []
    topicStats[q.topic].total += 1
    if (q.subtopic && !topicSubtopics[q.topic].includes(q.subtopic)) topicSubtopics[q.topic].push(q.subtopic)
    const s = struggleMap[q.id]
    if (s && s.attempts > 0) {
      topicStats[q.topic].attempted += 1
      topicStats[q.topic].correct += (s.attempts - s.wrong)
      topicStats[q.topic].wrong += s.wrong
    }
  })

  const studyPlan = Object.entries(topicStats)
    .filter(([, s]) => s.attempted > 0 || s.total > 0)
    .map(([topic, s]) => ({
      topic,
      total: s.total,
      attempted: s.attempted,
      rate: s.correct / Math.max(s.correct + s.wrong, 1),
      subtopics: topicSubtopics[topic] || [],
    }))
    .sort((a, b) => {
      const aRate = Number.isFinite(a.rate) ? a.rate : 1
      const bRate = Number.isFinite(b.rate) ? b.rate : 1
      if (aRate !== bRate) return aRate - bRate
      return a.attempted - b.attempted
    })
    .slice(0, 4)

  const totalAttempts = Object.values(struggleMap).reduce((s, v) => s + (v.attempts || 0), 0)
  const totalWrong = Object.values(struggleMap).reduce((s, v) => s + (v.wrong || 0), 0)
  const accuracy = totalAttempts > 0 ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100) : 0

  const card = {
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: 16,
    boxShadow: theme === 'light' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
  }

  const startTopicQuiz = (topic) => {
    const subtopics = topicSubtopics[topic] || []
    onStartSession?.({ mode: 'new', subtopics })
  }

  return (
    <div style={{ height: embedded ? '100%' : '100vh', minHeight: 0, background: embedded ? 'transparent' : t.bg, color: t.text, fontFamily: FONT_B, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .ps-scroll { flex: 1; min-height: 0; overflow-y: auto; }
        .ps-inner { padding: 28px 32px 32px; animation: fadeUp 0.3s ease; }
        .ps-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }
        .ps-study-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .ps-topic-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        @media (max-width: 980px) {
          .ps-study-grid, .ps-topic-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 860px) {
          .ps-inner { padding: 18px 14px 22px; }
          .ps-summary-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="ps-scroll">
        <div className="ps-inner">
          <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Analytics</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: t.text, margin: 0 }}>My Progress</h1>
          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 6 }}>Track your level, identify weak areas, and jump straight into focused revision.</div>

          <div style={{ ...card, padding: '18px 20px', marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>XP Progress</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>{profile.xp.toLocaleString()} XP total</div>
              </div>
              <div style={{ fontSize: 12, color: t.textMuted }}>Level {level} → Level {level + 1}</div>
            </div>
            <div style={{ background: t.border, borderRadius: 999, height: 10, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${GOLD}, ${GOLDL})`, borderRadius: 999, transition: 'width 0.8s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <div style={{ fontSize: 11, color: t.textMuted }}>Current rank: <span style={{ color: GOLD, fontWeight: 700 }}>{rank}</span></div>
              <div style={{ fontSize: 11, color: t.textMuted }}>{Math.max(0, 100 - Math.round(pct))}% to next level</div>
            </div>
          </div>

          <div className="ps-summary-grid">
            <div style={{ ...card, padding: '18px 20px', background: theme === 'dark' ? 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(14,165,233,0.08))' : 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(14,165,233,0.04))', border: `1px solid ${theme === 'dark' ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.18)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Current Rank</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: t.text }}>{rank}</div>
                  <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>Level {level} · {profile.xp.toLocaleString()} XP</div>
                  {nextRank !== rank && <div style={{ fontSize: 12, color: GOLD, marginTop: 8 }}>Next up: {nextRank}</div>}
                </div>
                <div style={{ fontSize: 48, lineHeight: 1 }}>{rIcon}</div>
              </div>
            </div>

            <div style={{ ...card, padding: '18px 20px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 }}>Your Stats</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {[
                  { label: 'Total XP', value: profile.xp.toLocaleString(), color: GOLD },
                  { label: 'Accuracy', value: `${accuracy}%`, color: accuracy >= 70 ? t.success : accuracy >= 40 ? GOLD : t.danger },
                  { label: 'Questions', value: totalAttempts, color: t.purple },
                  { label: 'Best Streak', value: `${profile.best_streak || 0} 🔥`, color: GOLD },
                ].map((item) => (
                  <div key={item.label} style={{ background: t.bgHover, borderRadius: 12, padding: '12px 12px 11px', border: `1px solid ${t.border}` }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{item.value}</div>
                    <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ ...card, padding: '18px 20px', marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Study Plan</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>Start with the weakest topics and jump straight into action.</div>
              </div>
            </div>

            {studyPlan.length === 0 ? (
              <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6 }}>No targeted study plan yet. Complete some quiz questions first and this section will prioritise your weakest topics.</div>
            ) : (
              <div className="ps-study-grid">
                {studyPlan.map((item, idx) => {
                  const pctCorrect = Number.isFinite(item.rate) ? Math.round(item.rate * 100) : 0
                  const tone = pctCorrect >= 70 ? t.success : pctCorrect >= 40 ? GOLD : t.danger
                  const recommendation = pctCorrect < 40
                    ? `Rebuild the foundations in ${item.topic} before doing more questions.`
                    : pctCorrect < 70
                      ? `You are close. Do another focused set on ${item.topic} to lock it in.`
                      : `Keep momentum with a short revision burst on ${item.topic}.`

                  return (
                    <div key={item.topic} style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: '14px 14px 12px', background: theme === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Priority {idx + 1}</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{item.topic}</div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: tone }}>{pctCorrect}%</div>
                      </div>
                      <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6, minHeight: 38 }}>{recommendation}</div>
                      <div style={{ fontSize: 11, color: t.textFaint, marginTop: 8 }}>{item.attempted}/{item.total} attempted · {item.subtopics.length} subtopic{item.subtopics.length !== 1 ? 's' : ''}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                        <button onClick={() => startTopicQuiz(item.topic)} style={{ padding: '9px 12px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${GOLD}, ${GOLDL})`, color: '#0c1037', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
                          Start quiz
                        </button>
                        <button onClick={() => onOpenLearn?.(item.topic)} style={{ padding: '9px 12px', borderRadius: 10, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
                          Review in Learn
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ ...card, padding: '18px 20px', marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 }}>Topic Breakdown</div>
            <div className="ps-topic-grid">
              {Object.entries(topicStats).map(([topic, s]) => {
                const rate = s.attempted > 0 ? s.correct / Math.max(s.correct + s.wrong, 1) : null
                const pctAttempted = s.total > 0 ? Math.round((s.attempted / s.total) * 100) : 0
                const tone = rate === null ? t.textFaint : rate >= 0.75 ? t.success : rate >= 0.45 ? GOLD : t.danger
                const label = rate === null ? 'Not started' : rate >= 0.75 ? 'Strong' : rate >= 0.45 ? 'Developing' : 'Needs work'
                return (
                  <div key={topic} style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: '14px 14px 12px', background: theme === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{topic}</div>
                        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>{s.attempted}/{s.total} attempted</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: tone }}>{label}</div>
                        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>{rate === null ? '0% correct' : `${Math.round(rate * 100)}% correct`}</div>
                      </div>
                    </div>
                    <div style={{ background: t.border, borderRadius: 999, height: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${pctAttempted}%`, height: '100%', background: tone, borderRadius: 999 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
