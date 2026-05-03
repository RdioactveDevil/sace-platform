import { THEMES } from '../lib/theme'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

export default function ReadinessCard({ profile, questions, struggleMap, assessments, onStartSession, theme }) {
  const t = THEMES[theme]

  const topicData = {}
  questions.forEach((q) => {
    if (!topicData[q.topic]) topicData[q.topic] = { total: 0, correct: 0, wrong: 0, attempted: 0 }
    topicData[q.topic].total += 1
    const s = struggleMap[q.id]
    if (s && s.attempts > 0) {
      topicData[q.topic].attempted += 1
      topicData[q.topic].correct += (s.attempts - s.wrong)
      topicData[q.topic].wrong += s.wrong
    }
  })

  const attemptedTopics = Object.values(topicData).filter(d => d.attempted > 0)
  const totalWeight = attemptedTopics.reduce((s, d) => s + d.total, 0)
  const score = totalWeight === 0
    ? null
    : Math.round(
        attemptedTopics.reduce((s, d) => {
          const accuracy = d.correct / Math.max(d.correct + d.wrong, 1)
          return s + accuracy * d.total
        }, 0) / totalWeight * 100
      )

  const ringColor = score === null ? t.border : score >= 70 ? t.success : score >= 40 ? GOLD : t.danger
  const label = score === null ? null : score >= 70 ? 'Looking strong' : score >= 40 ? "You're on track" : 'Needs work'

  const today = new Date().toDateString()
  const upcoming = (assessments || [])
    .filter(a => new Date(a.date) >= new Date(today))
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0]
  const daysToNext = upcoming
    ? Math.ceil((new Date(upcoming.date) - new Date()) / 86400000)
    : null
  const daysBadgeColor = daysToNext === null ? null : daysToNext > 60 ? t.success : daysToNext > 21 ? GOLD : t.danger

  const card = {
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: 16,
    boxShadow: theme === 'light' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
    padding: '18px 20px',
    height: '100%',
    boxSizing: 'border-box',
  }

  const CIRC = 2 * Math.PI * 26
  const offset = score === null ? CIRC : CIRC * (1 - score / 100)

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>Exam Readiness</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>
            {label ?? 'No data yet'}
          </div>
        </div>
        {daysToNext !== null && (
          <div style={{ padding: '6px 12px', borderRadius: 10, background: `${daysBadgeColor}18`, border: `1px solid ${daysBadgeColor}40`, textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: daysBadgeColor, lineHeight: 1 }}>{daysToNext}</div>
            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>days to {upcoming.label}</div>
          </div>
        )}
      </div>

      {score === null ? (
        <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6 }}>
          Complete some questions to see your readiness score.
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
            <svg viewBox="0 0 64 64" width="80" height="80">
              <circle cx="32" cy="32" r="26" fill="none" stroke={t.border} strokeWidth="8" />
              <circle
                cx="32" cy="32" r="26" fill="none"
                stroke={ringColor} strokeWidth="8"
                strokeDasharray={CIRC}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform="rotate(-90 32 32)"
                style={{ transition: 'stroke-dashoffset 0.8s ease' }}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: ringColor, fontFamily: FONT_B }}>
              {score}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 10 }}>
              Based on your accuracy across all attempted topics.
            </div>
            <button
              onClick={() => onStartSession?.({ mode: 'wrong' })}
              style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${GOLD}, ${GOLDL})`, color: '#0c1037', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}
            >
              Start focused session →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
