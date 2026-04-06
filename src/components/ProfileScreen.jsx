import { getLevelProgress, RANKS, RANK_ICONS } from '../lib/engine'
import { THEMES } from '../lib/theme'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

export default function ProfileScreen({ profile, questions, struggleMap, theme, embedded, onStartSession, onOpenLearn }) {
  const { level, pct } = getLevelProgress(profile.xp)
  const rank = RANKS[Math.min(level, RANKS.length - 1)]
  const rIcon = RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]
  const t = THEMES[theme]
  const nextRank = RANKS[Math.min(level + 1, RANKS.length - 1)]

  const topicStats = {}
  questions.forEach(q => {
    if (!topicStats[q.topic]) topicStats[q.topic] = { total: 0, attempted: 0, correct: 0, wrong: 0 }
    topicStats[q.topic].total++
    const s = struggleMap[q.id]
    if (s && s.attempts > 0) {
      topicStats[q.topic].attempted++
      topicStats[q.topic].correct += s.attempts - s.wrong
      topicStats[q.topic].wrong += s.wrong
    }
  })

  const studyPlan = Object.entries(topicStats)
    .filter(([, s]) => s.attempted > 0)
    .map(([topic, s]) => ({ topic, rate: s.correct / Math.max(s.correct + s.wrong, 1) }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 6)

  const totalAttempts = Object.values(struggleMap).reduce((s, v) => s + v.attempts, 0)
  const totalWrong = Object.values(struggleMap).reduce((s, v) => s + v.wrong, 0)
  const accuracy = totalAttempts > 0 ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100) : 0

  const card = {
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: 14,
    boxShadow: theme === 'light' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
  }


  const actionBtn = ({ label, onClick, variant = 'secondary', disabled = false }) => {
    const variants = {
      primary: {
        border: 'none',
        background: disabled ? (theme === 'dark' ? 'rgba(255,255,255,0.06)' : '#eceef8') : `linear-gradient(135deg,${GOLD},${GOLDL})`,
        color: disabled ? t.textFaint : '#0c1037',
        boxShadow: disabled ? 'none' : '0 6px 20px rgba(241,190,67,0.28)',
      },
      secondary: {
        border: `1px solid ${t.border}`,
        background: theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)',
        color: disabled ? t.textFaint : t.text,
      },
    }
    return (
      <button
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 700,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: FONT_B,
          opacity: disabled ? 0.65 : 1,
          ...variants[variant],
        }}
      >
        {label}
      </button>
    )
  }

  const topicToSubtopics = Object.values(questions.reduce((acc, q) => {
    if (!q.topic || !q.subtopic) return acc
    if (!acc[q.topic]) acc[q.topic] = { topic: q.topic, subs: new Set() }
    acc[q.topic].subs.add(q.subtopic)
    return acc
  }, {})).reduce((acc, entry) => {
    acc[entry.topic] = [...entry.subs]
    return acc
  }, {})

  const RankCard = () => (
    <div
      style={{
        ...card,
        padding: '18px 20px',
        background:
          theme === 'dark'
            ? 'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(14,165,233,0.08))'
            : 'linear-gradient(135deg,rgba(99,102,241,0.06),rgba(14,165,233,0.04))',
        border: `1px solid ${theme === 'dark' ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.2)'}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: 182,
      }}
    >
      <div>
        <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, marginBottom: 4, letterSpacing: '0.08em' }}>CURRENT RANK</div>
        <div style={{ fontSize: 34, fontWeight: 800, color: t.text, lineHeight: 1.1 }}>{rank}</div>
        <div style={{ fontSize: 14, color: t.textMuted, marginTop: 8 }}>Level {level} · {profile.xp.toLocaleString()} XP</div>
        {nextRank !== rank && <div style={{ fontSize: 13, color: GOLD, marginTop: 10, fontWeight: 600 }}>Next: {nextRank} →</div>}
      </div>
      <div style={{ fontSize: 60, lineHeight: 1 }}>{rIcon}</div>
    </div>
  )

  const StatsCard = () => (
    <div style={{ ...card, padding: '18px 20px', minHeight: 182 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 }}>Your Stats</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { label: 'Total XP', val: profile.xp.toLocaleString(), color: GOLD },
          { label: 'Accuracy', val: `${accuracy}%`, color: accuracy > 70 ? t.success : accuracy > 40 ? GOLD : t.danger },
          { label: 'Questions', val: totalAttempts, color: t.purple },
          { label: 'Best Streak', val: `${profile.best_streak || 0} 🔥`, color: GOLD },
        ].map(s => (
          <div key={s.label} style={{ background: t.bgSubtle || t.bgHover, borderRadius: 10, padding: '12px', border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )

  const XPCard = () => (
    <div style={{ ...card, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>XP Progress</div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>You are currently at <span style={{ color: t.text, fontWeight: 700 }}>Level {level}</span></div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, color: t.text, fontWeight: 700 }}>{profile.xp.toLocaleString()} XP</div>
          {nextRank !== rank && <div style={{ fontSize: 12, color: GOLD, marginTop: 4 }}>Working towards {nextRank}</div>}
        </div>
      </div>
      <div style={{ background: t.border, borderRadius: 999, height: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, borderRadius: 999, transition: 'width 0.9s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 12, color: t.textMuted }}>Level {level}</span>
        <span style={{ fontSize: 12, color: t.textFaint }}>Level {level + 1}</span>
      </div>
    </div>
  )

  const StudyPlanCard = () =>
    studyPlan.length > 0 ? (
      <div
        style={{
          ...card,
          padding: '18px 20px',
          background: theme === 'dark' ? 'rgba(239,68,68,0.04)' : '#fff8f8',
          border: `1px solid ${theme === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(220,38,38,0.12)'}`,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>📚 Study Plan</div>
        <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 14 }}>Focus on these first</div>
        <div className="ps-study-grid">
          {studyPlan.map((p, i) => {
            const subtopics = topicToSubtopics[p.topic] || []
            const hasQuizAction = typeof onStartSession === 'function' && subtopics.length > 0
            const hasLearnAction = typeof onOpenLearn === 'function'
            return (
            <div
              key={p.topic}
              style={{
                background: theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.65)',
                border: `1px solid ${t.border}`,
                borderRadius: 12,
                padding: '14px 14px 12px',
                minHeight: 112,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: t.text, marginBottom: 8 }}>
                  {i + 1}. {p.topic}
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.55 }}>
                  {p.rate < 0.4
                    ? `Re-read your notes on ${p.topic} before attempting more questions.`
                    : `Do 5–8 more ${p.topic} questions to build confidence.`}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: hasLearnAction ? '1fr 1fr' : '1fr', gap: 8 }}>
                {hasQuizAction && actionBtn({
                  label: 'Start quiz',
                  variant: 'primary',
                  onClick: () => onStartSession({ mode: 'new', subtopics }),
                })}
                {hasLearnAction && actionBtn({
                  label: 'Review in Learn',
                  variant: 'secondary',
                  onClick: () => onOpenLearn(p.topic),
                })}
              </div>
            </div>
          )})}
        </div>
      </div>
    ) : null

  const TopicsCard = () => (
    <div style={{ ...card, padding: '18px 20px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 16 }}>Topic Breakdown</div>
      {Object.entries(topicStats).map(([topic, s]) => {
        const rate = s.attempted > 0 ? s.correct / Math.max(s.correct + s.wrong, 1) : null
        const col = rate === null ? t.textFaint : rate > 0.75 ? t.success : rate > 0.45 ? GOLD : t.danger
        const label = rate === null ? 'Not started' : rate > 0.75 ? 'Strong' : rate > 0.45 ? 'Developing' : 'Needs work'
        const pctW = s.total > 0 ? (s.attempted / s.total) * 100 : 0
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
  )

  return (
    <div
      style={{
        height: embedded ? 'auto' : '100%',
        minHeight: 0,
        background: embedded ? 'transparent' : t.bg,
        color: t.text,
        fontFamily: FONT_B,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .ps-wrap { display: flex; flex-direction: column; gap: 16px; padding: 32px 32px; animation: fadeUp 0.4s ease; }
        .ps-summary-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 16px; align-items: stretch; }
        .ps-study-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 980px) {
          .ps-summary-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 860px) {
          .ps-wrap { padding: 18px 14px; gap: 14px; }
        }
        @media (max-width: 720px) {
          .ps-study-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: embedded ? 'visible' : 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '28px 32px 0' }}>Analytics</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: t.text, padding: '4px 32px 20px' }}>My Progress</h1>

        <div className="ps-wrap">
          <XPCard />

          <div className="ps-summary-grid">
            <RankCard />
            <StatsCard />
          </div>

          <StudyPlanCard />
          <TopicsCard />
        </div>
      </div>
    </div>
  )
}
