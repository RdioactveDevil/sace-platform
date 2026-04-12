import { THEMES } from '../lib/theme'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

export default function SubtopicHeatmap({ questions, struggleMap, onStartSession, theme }) {
  const t = THEMES[theme]

  const topicMap = {}
  questions.forEach((q) => {
    if (!q.subtopic) return
    if (!topicMap[q.topic]) topicMap[q.topic] = {}
    if (!topicMap[q.topic][q.subtopic]) topicMap[q.topic][q.subtopic] = { correct: 0, wrong: 0, attempted: 0 }
    const s = struggleMap[q.id]
    if (s && s.attempts > 0) {
      topicMap[q.topic][q.subtopic].correct += (s.attempts - s.wrong)
      topicMap[q.topic][q.subtopic].wrong += s.wrong
      topicMap[q.topic][q.subtopic].attempted += s.attempts
    }
  })

  let worstSubtopic = null
  let worstAccuracy = Infinity
  Object.entries(topicMap).forEach(([, subtopics]) => {
    Object.entries(subtopics).forEach(([sub, d]) => {
      if (d.attempted === 0) return
      const acc = d.correct / Math.max(d.correct + d.wrong, 1)
      if (acc < worstAccuracy) { worstAccuracy = acc; worstSubtopic = sub }
    })
  })

  const chipStyle = (d) => {
    if (d.attempted === 0) return { bg: t.bgHover, color: t.textMuted, border: t.border }
    const acc = d.correct / Math.max(d.correct + d.wrong, 1)
    if (acc >= 0.7) return { bg: `${t.success}18`, color: t.success, border: `${t.success}40` }
    if (acc >= 0.4) return { bg: 'rgba(241,190,67,0.15)', color: GOLD, border: 'rgba(241,190,67,0.4)' }
    return { bg: `${t.danger}18`, color: t.danger, border: `${t.danger}40` }
  }

  const card = {
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: 16,
    boxShadow: theme === 'light' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
    padding: '18px 20px',
    marginTop: 16,
  }

  const topics = Object.entries(topicMap)
  if (topics.length === 0) return null

  return (
    <div style={card}>
      <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>Subtopic Heatmap</div>
      <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 14 }}>Colour shows accuracy — red is weakest, green is strongest.</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {topics.map(([topic, subtopics]) => {
          const sorted = Object.entries(subtopics).sort(([, a], [, b]) => {
            if (a.attempted === 0 && b.attempted === 0) return 0
            if (a.attempted === 0) return 1
            if (b.attempted === 0) return -1
            const accA = a.correct / Math.max(a.correct + a.wrong, 1)
            const accB = b.correct / Math.max(b.correct + b.wrong, 1)
            return accA - accB
          })

          return (
            <div key={topic}>
              <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{topic}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {sorted.map(([sub, d]) => {
                  const s = chipStyle(d)
                  const acc = d.attempted > 0 ? Math.round(d.correct / Math.max(d.correct + d.wrong, 1) * 100) : null
                  return (
                    <div key={sub} style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                      {sub}{acc !== null ? ` ${acc}%` : ' —'}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {worstSubtopic && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            onClick={() => onStartSession?.({ mode: 'wrong', subtopics: [worstSubtopic] })}
            style={{ padding: '9px 14px', borderRadius: 10, border: `1px solid ${t.danger}40`, background: `${t.danger}12`, color: t.danger, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}
          >
            Drill weakest subtopic →
          </button>
        </div>
      )}
    </div>
  )
}
