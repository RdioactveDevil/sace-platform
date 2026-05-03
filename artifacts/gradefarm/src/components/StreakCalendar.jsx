import { THEMES } from '../lib/theme'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

export default function StreakCalendar({ answerLog, onStartSession, theme }) {
  const t = THEMES[theme]

  const countByDay = {}
  ;(answerLog || []).forEach(row => {
    const day = new Date(row.answered_at).toDateString()
    countByDay[day] = (countByDay[day] || 0) + 1
  })

  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    return d.toDateString()
  })

  const todayStr = new Date().toDateString()
  const todayCount = countByDay[todayStr] || 0

  let streak = 0
  for (let i = 29; i >= 0; i--) {
    if (countByDay[days[i]]) streak++
    else break
  }

  const cellColor = (count) => {
    if (count === 0) return theme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'
    if (count <= 4) return 'rgba(241,190,67,0.35)'
    if (count <= 9) return 'rgba(241,190,67,0.65)'
    return GOLD
  }

  const card = {
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: 16,
    boxShadow: theme === 'light' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
    padding: '18px 20px',
    height: '100%',
    boxSizing: 'border-box',
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Last 30 Days</div>
        <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>{streak} 🔥 streak</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 28px)', gap: 4 }}>
        {days.map((day) => (
          <div
            key={day}
            title={`${day}: ${countByDay[day] || 0} questions`}
            style={{ width: 28, height: 28, borderRadius: 5, background: cellColor(countByDay[day] || 0), transition: 'background 0.2s' }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: t.textMuted }}>Less</div>
        {[cellColor(0), cellColor(2), cellColor(7), cellColor(10)].map((bg, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: bg }} />
        ))}
        <div style={{ fontSize: 10, color: t.textMuted }}>More</div>
      </div>

      {todayCount === 0 && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: t.textMuted }}>Study today to keep your streak alive.</div>
          <button
            onClick={() => onStartSession?.({ mode: 'all' })}
            style={{ padding: '7px 12px', borderRadius: 9, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, whiteSpace: 'nowrap' }}
          >
            Start session →
          </button>
        </div>
      )}
    </div>
  )
}
