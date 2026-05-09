import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { THEMES } from '../lib/theme'
import { getY7TopicConfig, getY7ShortLabel } from '../lib/australianCurriculumTopics'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function StudyPlanScreen({ profile, questions, struggleMap, theme, onStartSession, subject, lastSessionAt, onOpenLearn }) {
  const t = THEMES[theme]

  const y7Config = getY7TopicConfig(subject?.id)

  // Per-topic aggregated stats (normalize topic names for Y7 subjects)
  const topicStats = useMemo(() => {
    const normFn = y7Config?.normFn
    const map = {}
    for (const q of questions) {
      const topicKey = normFn ? (normFn(q.topic) ?? q.topic) : q.topic
      if (!map[topicKey]) map[topicKey] = { topic: topicKey, subtopics: new Set(), total: 0, attempts: 0, wrong: 0 }
      map[topicKey].subtopics.add(q.subtopic)
      map[topicKey].total++
      const s = struggleMap[q.id]
      if (s) {
        map[topicKey].attempts += s.attempts
        map[topicKey].wrong += s.wrong
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
  }, [questions, struggleMap, y7Config])

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

  // ── To-Do List ──────────────────────────────────────────────────────────────
  const todoKey = profile?.id ? `gradefarm_todo_${profile.id}` : null

  const [todoList, setTodoList] = useState(() => {
    if (!todoKey) return []
    try { return JSON.parse(localStorage.getItem(todoKey)) || [] } catch { return [] }
  })
  const [todoGenerating, setTodoGenerating] = useState(false)

  const saveTodo = useCallback((list) => {
    setTodoList(list)
    if (todoKey) localStorage.setItem(todoKey, JSON.stringify(list))
  }, [todoKey])

  const generateTodoList = useCallback(async () => {
    if (todoGenerating) return
    setTodoGenerating(true)
    try {
      const weakTopics = topicStats
        .filter(ts => ts.attempts > 0)
        .sort((a, b) => a.mastery - b.mastery)
        .slice(0, 8)
        .map(ts => ({ topic: ts.topic, mastery: ts.mastery, attempts: ts.attempts }))
      const subjectName = subject?.name || 'this subject'

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_tokens: 600,
          system: [
            'You are a study coach. Generate a JSON array of 5-8 study tasks for a student.',
            'Each task: { "topic": string, "action": "practice"|"revise", "estimatedMinutes": number }.',
            '"practice" means quiz-based drill. "revise" means concept study with AI.',
            'Weight toward low-mastery topics. Mix practice and revise.',
            'Return ONLY the JSON array, no markdown, no explanation.',
          ].join(' '),
          messages: [{ role: 'user', content: `Subject: ${subjectName}. Topic mastery: ${JSON.stringify(weakTopics)}` }],
        }),
      })
      const d = await res.json()
      const raw = d?.content?.[0]?.text || '[]'
      const start = raw.indexOf('[')
      const end = raw.lastIndexOf(']')
      const parsed = JSON.parse(start !== -1 && end > start ? raw.slice(start, end + 1) : '[]')
      const list = parsed.map(item => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        topic: item.topic || '',
        subject: subjectName,
        action: item.action === 'revise' ? 'revise' : 'practice',
        estimatedMinutes: typeof item.estimatedMinutes === 'number' ? item.estimatedMinutes : 15,
        done: false,
      }))
      saveTodo(list)
    } catch {}
    setTodoGenerating(false)
  }, [topicStats, subject, todoGenerating, saveTodo])

  const lastSessionAtRef = useRef(null)
  useEffect(() => {
    if (!lastSessionAt) return
    if (lastSessionAt === lastSessionAtRef.current) return
    lastSessionAtRef.current = lastSessionAt
    if (todoList.length === 0) return
    generateTodoList()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSessionAt])

  return (
    <div style={{ height: '100%', color: t.text, fontFamily: FONT_B, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes sp-fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .sp-scroll { flex: 1; min-height: 0; overflow-y: auto; }
        .sp-inner  { padding: 28px 32px 32px; animation: sp-fadeUp 0.3s ease; }
        .sp-focus-card { transition: border-color 0.15s, box-shadow 0.15s; cursor: pointer; }
        .sp-focus-card:hover { border-color: ${GOLD} !important; box-shadow: 0 0 0 1px ${GOLD}22; }
        @media (max-width: 860px) { .sp-inner { padding: 18px 14px 22px; } }
      `}</style>

      <div className="sp-scroll">
        <div className="sp-inner">
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Personalised</div>
          <h1 style={{ fontSize: 26, fontFamily: FONT_D, fontWeight: 400, letterSpacing: 1.5, margin: 0, color: t.text }}>Study Plan</h1>
          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 6, marginBottom: 28 }}>Based on your quiz performance and spaced repetition schedule</div>

          {!hasActivity ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>📊</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 8 }}>No data yet</div>
              <div style={{ fontSize: 13, color: t.textMuted }}>Answer some questions in the Question Bank — your personalised plan will appear here.</div>
            </div>
          ) : (
            <>
              {/* To-Do List */}
              <section style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.textSub, letterSpacing: '0.1em', textTransform: 'uppercase' }}>To-Do List</div>
                  <button
                    onClick={generateTodoList}
                    disabled={todoGenerating}
                    style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid rgba(241,190,67,0.3)`, background: todoGenerating ? 'transparent' : 'rgba(241,190,67,0.08)', color: GOLD, fontSize: 12, fontWeight: 700, cursor: todoGenerating ? 'default' : 'pointer', fontFamily: FONT_B, opacity: todoGenerating ? 0.6 : 1 }}
                  >
                    {todoGenerating ? 'Generating…' : todoList.length > 0 ? '↺ Regenerate' : '✦ Generate To-Do List'}
                  </button>
                </div>

                {todoList.length === 0 && !todoGenerating && (
                  <div style={{ padding: '20px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 13, color: t.textMuted }}>Click "Generate To-Do List" to get personalised study tasks based on your performance.</div>
                  </div>
                )}

                {todoGenerating && todoList.length === 0 && (
                  <div style={{ padding: '20px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 13, color: t.textFaint, fontStyle: 'italic' }}>Analysing your performance…</div>
                  </div>
                )}

                {todoList.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {todoList.map(task => (
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, opacity: task.done ? 0.55 : 1 }}>
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={() => {
                            const updated = todoList.map(t2 => t2.id === task.id ? { ...t2, done: !t2.done } : t2)
                            saveTodo(updated)
                          }}
                          style={{ width: 16, height: 16, accentColor: GOLD, cursor: 'pointer', flexShrink: 0 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, textDecoration: task.done ? 'line-through' : 'none' }}>{task.topic}</div>
                          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                            <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 4, marginRight: 6, background: task.action === 'practice' ? 'rgba(241,190,67,0.12)' : 'rgba(139,92,246,0.12)', color: task.action === 'practice' ? GOLD : '#a78bfa', fontSize: 10, fontWeight: 700 }}>
                              {task.action === 'practice' ? 'Practice Quiz' : 'Study & Revise'}
                            </span>
                            {task.estimatedMinutes} min
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (task.action === 'practice') {
                              const match = topicStats.find(ts => ts.topic.toLowerCase() === task.topic.toLowerCase())
                              onStartSession?.({ mode: match?.attempts > 0 ? 'wrong' : 'new', subtopics: match?.subtopics ?? [] })
                            } else {
                              onOpenLearn?.(task.topic)
                            }
                          }}
                          style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid rgba(241,190,67,0.3)`, background: 'rgba(241,190,67,0.08)', color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, flexShrink: 0, whiteSpace: 'nowrap' }}
                        >
                          Start →
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

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
                {y7Config ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {y7Config.macroGroups.map(macro => {
                      const macroTopics = topicStats.filter(ts => macro.topics.includes(ts.topic))
                      if (macroTopics.length === 0) return null
                      const macroAttempts = macroTopics.reduce((s, ts) => s + ts.attempts, 0)
                      const macroWrong    = macroTopics.reduce((s, ts) => s + ts.wrong, 0)
                      const macroMastery  = macroAttempts > 0 ? Math.max(0, Math.round((1 - macroWrong / macroAttempts) * 100)) : null
                      const macroColor    = macroMastery >= 70 ? '#4ade80' : macroMastery >= 40 ? GOLD : '#f87171'
                      return (
                        <div key={macro.id}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, letterSpacing: '0.05em' }}>{macro.label}</div>
                            {macroMastery !== null && (
                              <div style={{ fontSize: 12, fontWeight: 700, color: macroColor }}>{macroMastery}% strand avg</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {macroTopics.map(topic => {
                              const barColor = topic.mastery >= 70 ? '#4ade80' : topic.mastery >= 40 ? GOLD : '#f87171'
                              const shortLabel = getY7ShortLabel(topic.topic)
                              const ti = macro.topics.indexOf(topic.topic)
                              const prefix = ti >= 0 ? `${macro.num}.${ti + 1}` : null
                              return (
                                <div
                                  key={topic.topic}
                                  className="sp-focus-card"
                                  onClick={() => onStartSession?.({ mode: topic.attempts > 0 ? 'wrong' : 'new', subtopics: topic.subtopics })}
                                  title={topic.topic}
                                  style={{ padding: '12px 16px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10 }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: topic.attempts > 0 ? 8 : 0 }}>
                                    <div>
                                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text }} aria-label={topic.topic}>
                                        {prefix && <span style={{ opacity: 0.55, fontWeight: 600, marginRight: 6 }}>{prefix}</span>}
                                        {shortLabel}
                                      </div>
                                      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                                        {topic.total} questions · {topic.subtopics.length} subtopic{topic.subtopics.length !== 1 ? 's' : ''}
                                      </div>
                                    </div>
                                    {topic.attempts > 0 ? (
                                      <div style={{ fontSize: 16, fontWeight: 800, color: barColor, flexShrink: 0 }}>{topic.mastery}%</div>
                                    ) : (
                                      <div style={{ fontSize: 11, color: t.textFaint, fontStyle: 'italic', flexShrink: 0 }}>Not started</div>
                                    )}
                                  </div>
                                  {topic.attempts > 0 && (
                                    <div style={{ background: t.bg, borderRadius: 4, height: 4, overflow: 'hidden' }}>
                                      <div style={{ width: `${topic.mastery}%`, height: '100%', background: barColor, transition: 'width 0.6s ease' }} />
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
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
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
