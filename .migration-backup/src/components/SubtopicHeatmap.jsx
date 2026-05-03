import { THEMES } from '../lib/theme'
import { getTopicConfig } from '../lib/saceTopics'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif'"

/**
 * One chip per official curriculum topic (macro → topic list from saceTopics),
 * with accuracy rolled up across all questions in that topic — not per raw q.subtopic.
 */
export default function SubtopicHeatmap({ questions, struggleMap, onStartSession, theme, subject }) {
  const t = THEMES[theme]
  const { macroGroups, normFn } = getTopicConfig(subject?.stage)

  const topicAgg = {}
  const topicTotals = {}
  questions.forEach((q) => {
    const canon = normFn(q.topic)
    if (!canon) return
    topicTotals[canon] = (topicTotals[canon] || 0) + 1
    if (!topicAgg[canon]) topicAgg[canon] = { correct: 0, wrong: 0, attempted: 0 }
    const s = struggleMap[q.id]
    if (s && s.attempts > 0) {
      topicAgg[canon].correct += (s.attempts - s.wrong)
      topicAgg[canon].wrong += s.wrong
      topicAgg[canon].attempted += s.attempts
    }
  })

  const subtopicsForCanonical = (canonicalTopic) => {
    const set = new Set()
    questions.forEach((q) => {
      if (normFn(q.topic) !== canonicalTopic || !q.subtopic) return
      set.add(q.subtopic)
    })
    return [...set]
  }

  let worstTopic = null
  let worstAccuracy = Infinity
  Object.entries(topicAgg).forEach(([topic, d]) => {
    if (d.attempted === 0) return
    const acc = d.correct / Math.max(d.correct + d.wrong, 1)
    if (acc < worstAccuracy) {
      worstAccuracy = acc
      worstTopic = topic
    }
  })

  const drillSubtopics = worstTopic ? subtopicsForCanonical(worstTopic) : []

  const chipStyle = (d, totalInBank) => {
    if (!totalInBank) return { bg: t.bgHover, color: t.textFaint, border: t.border }
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

  const rows = macroGroups.map((macro) => ({
    macro,
    topics: macro.topics.map((topicName) => ({
      name: topicName,
      agg: topicAgg[topicName] || { correct: 0, wrong: 0, attempted: 0 },
      total: topicTotals[topicName] || 0,
    })),
  })).filter((row) => row.topics.some((x) => x.total > 0))

  if (rows.length === 0) return null

  return (
    <div style={card}>
      <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>Topic heatmap</div>
      <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 14 }}>Colour shows accuracy across each curriculum topic — red is weakest, green is strongest.</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {rows.map(({ macro, topics }) => (
          <div key={macro.id}>
            <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{macro.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {topics.filter((x) => x.total > 0).map(({ name, agg, total }) => {
                const s = chipStyle(agg, total)
                const acc = agg.attempted > 0 ? Math.round(agg.correct / Math.max(agg.correct + agg.wrong, 1) * 100) : null
                return (
                  <div key={name} style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                    {name}{acc !== null ? ` ${acc}%` : ' —'}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {worstTopic && drillSubtopics.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            onClick={() => onStartSession?.({ mode: 'wrong', subtopics: drillSubtopics })}
            style={{ padding: '9px 14px', borderRadius: 10, border: `1px solid ${t.danger}40`, background: `${t.danger}12`, color: t.danger, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}
          >
            Drill weakest topic →
          </button>
        </div>
      )}
    </div>
  )
}
