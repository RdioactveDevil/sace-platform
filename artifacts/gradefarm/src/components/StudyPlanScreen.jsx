import { useMemo } from 'react'
import { THEMES } from '../lib/theme'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function StudyPlanScreen({ profile, questions, struggleMap, theme, onStartSession }) {
  const t = THEMES[theme]

  // Per-topic aggregated stats
  const topicStats = useMemo(() => {
    const map = {}
    for (const q of questions) {
      if (!map[q.topic]) map[q.topic] = { topic: q.topic, subtopics: new Set(), total: 0, attempts: 0, wrong: 0 }
      map[q.topic].subtopics.add(q.subtopic)
      map[q.topic].total++
      const s = struggleMap[q.id]
      if (s) {
        map[q.topic].attempts += s.attempts
        map[q.topic].wrong += s.wrong
      }
    }
    return Object.values(map).map(r => ({
      ...r,
      subtopics: [...r.subtopics],
      errorRate: r.attempts > 0 ? r.wrong / r.attempts : 0,
      mastery:   r.attempts > 0 ? Math.max(0, Math.round((1 - r.wrong / r.attempts) * 100)) : null,
    })).sort((a, b) => {
      // attempted + high error first, then unattempted
      if (a.attempts > 0 && b.attempts === 0) return -1
      if (a.attempts === 0 && b.attempts > 0) return 1
      return b.errorRate - a.errorRate
    })
  }, [questions, struggleMap])

  // Questions due within 48h, grouped by topic
  const todayFocus = useMemo(() => {
    const cutoff = Date.now() + 1000 * 60 * 60 * 48
    const map = {}
    for (const q of questions) {
      const s = struggleMap[q.id]
      if (!s?.next_review) continue
      if (new Date(s.next_review).getTime() > cutoff) continue
      if (!map[q.topic]) map[q.topic] = { topic: q.topic, subtopics: new Set(), dueCount: 0, wrongCount: 0 }
      map[q.topic].subtopics.add(q.subtopic)
      map[q.topic].dueCount++
      map[q.topic].wrongCount += s.wrong
    }
    return Object.values(map)
      .sort((a, b) => b.wrongCount - a.wrongCount)
      .slice(0, 4)
      .map(r => ({ ...r, subtopics: [...r.subtopics] }))
  }, [questions, struggleMap])

  // Count reviews due per day for next 7 days
  const weeklyDue = useMemo(() => {
    const todayMidnight = new Date()
    todayMidnight.setHours(0, 0, 0, 0)

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(todayMidnight)
      d.setDate(todayMidnight.getDate() + i)
      return { date: d, count: 0, label: i === 0 ? 'Today' : DAY_LABELS[d.getDay()] }
    })

    for (const s of Object.values(struggleMap)) {
      if (!s.next_review) continue
      const due = new Date(s.next_review)
      for (let i = 0; i < 7; i++) {
        const dayStart = days[i].date
        const dayEnd   = new Date(dayStart); dayEnd.setDate(dayStart.getDate() + 1)
        if (due >= dayStart && due < dayEnd) { days[i].count++; break }
      }
    }
    return days
  }, [struggleMap])

  const maxDue      = Math.max(...weeklyDue.map(d => d.count), 1)
  const hasActivity = Object.keys(struggleMap).length > 0

  return (
    <div style={{ height: '100%', color: t.text, fontFamily: FONT_B, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes sp-fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .sp-scroll { flex: 1; min-height: 0; overflow-y: auto; }
        .sp-inner  { max-width: 980px; padding: 28px 32px 32px; animation: sp-fadeUp 0.3s ease; }
        .sp-focus-card { transition: border-color 0.15s, box-shadow 0.15s; cursor: pointer; }
        .sp-focus-card:hover { border-color: ${GOLD} !important; box-shadow: 0 0 0 1px ${GOLD}22; }
        @media (max-width: 860px) { .sp-inner { padding: 18px 14px 22px; } }
      `}</style>

      <div className="sp-scroll">
        <div className="sp-inner">
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Personalised</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: t.text }}>Study Plan</h1>
          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 6, marginBottom: 28 }}>Based on your quiz performance and spaced repetition schedule</div>

          {!hasActivity ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>📊</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 8 }}>No data yet</div>
              <div style={{ fontSize: 13, color: t.textMuted }}>Answer some questions in the Question Bank — your personalised plan will appear here.</div>
            </div>
          ) : (
            <>
              {/* Today's Focus */}
              {todayFocus.length > 0 && (
                <section style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.textSub, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Today's Focus</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {todayFocus.map(f => {
                      const mode = f.wrongCount > 0 ? 'wrong' : 'all'
                      return (
                        <div
                          key={f.topic}
                          className="sp-focus-card"
                          onClick={() => onStartSession?.({ mode, subtopics: [...f.subtopics] })}
                          style={{ flex: '1 1 180px', padding: '14px 16px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12 }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 4 }}>{f.topic}</div>
                          <div style={{ fontSize: 11, color: t.textMuted }}>{f.dueCount} due{f.wrongCount > 0 ? ` · ${f.wrongCount} wrong` : ''}</div>
                          <div style={{ marginTop: 10, fontSize: 11, color: GOLD, fontWeight: 600 }}>Start session →</div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Weekly Schedule */}
              <section style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.textSub, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Review Schedule — Next 7 Days</div>
                <div style={{ padding: '20px 20px 14px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 88 }}>
                    {weeklyDue.map((day, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ fontSize: 10, color: day.count > 0 ? t.textSub : 'transparent', fontWeight: 600 }}>{day.count}</div>
                        <div style={{
                          width: '100%',
                          height: Math.max(4, (day.count / maxDue) * 60),
                          background: i === 0
                            ? `linear-gradient(180deg,${GOLDL},${GOLD})`
                            : day.count > 0 ? 'rgba(241,190,67,0.35)' : t.border,
                          borderRadius: '4px 4px 2px 2px',
                          transition: 'height 0.5s ease',
                        }} />
                        <div style={{ fontSize: 10, color: i === 0 ? GOLD : t.textFaint, fontWeight: i === 0 ? 700 : 400 }}>{day.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Topic Mastery */}
              <section>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.textSub, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Topic Mastery</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {topicStats.map(topic => {
                    const barColor = topic.mastery >= 70 ? '#4ade80' : topic.mastery >= 40 ? GOLD : '#f87171'
                    return (
                      <div
                        key={topic.topic}
                        className="sp-focus-card"
                        onClick={() => onStartSession?.({ mode: topic.attempts > 0 ? 'wrong' : 'new', subtopics: topic.subtopics })}
                        style={{ padding: '14px 18px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12 }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: topic.attempts > 0 ? 10 : 0 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{topic.topic}</div>
                            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                              {topic.total} questions · {topic.subtopics.length} subtopic{topic.subtopics.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                          {topic.attempts > 0 ? (
                            <div style={{ fontSize: 18, fontWeight: 800, color: barColor, flexShrink: 0 }}>{topic.mastery}%</div>
                          ) : (
                            <div style={{ fontSize: 11, color: t.textFaint, fontStyle: 'italic', flexShrink: 0 }}>Not started</div>
                          )}
                        </div>
                        {topic.attempts > 0 && (
                          <div style={{ background: t.bg, borderRadius: 4, height: 5, overflow: 'hidden' }}>
                            <div style={{ width: `${topic.mastery}%`, height: '100%', background: barColor, transition: 'width 0.6s ease' }} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
