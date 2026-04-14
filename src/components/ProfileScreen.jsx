import { useState, useEffect } from 'react'
import { getLevelProgress, RANKS, RANK_ICONS } from '../lib/engine'
import { THEMES } from '../lib/theme'
import { getAnswerLogLast30Days, getAssessments, addAssessment, deleteAssessment } from '../lib/db'
import { SACE_STAGE1_TOPICS, SACE_STAGE2_TOPICS, getTopicConfig } from '../lib/saceTopics'
import ReadinessCard from './ReadinessCard'
import StreakCalendar from './StreakCalendar'
import SubtopicHeatmap from './SubtopicHeatmap'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

export default function ProfileScreen({ profile, questions, struggleMap, theme, embedded, onStartSession, onOpenLearn, subject }) {
  const t = THEMES[theme]
  const { normFn: normalizeCurriculumTopic } = getTopicConfig(subject?.stage)
  const curriculumTopics = subject?.stage === 'Stage 2' ? SACE_STAGE2_TOPICS : SACE_STAGE1_TOPICS
  const [answerLog, setAnswerLog] = useState([])
  const [assessments, setAssessments] = useState([])
  const [addFormType, setAddFormType] = useState('Test')
  const [addFormLabel, setAddFormLabel] = useState('')
  const [addFormDate, setAddFormDate] = useState('')
  const [addFormError, setAddFormError] = useState('')
  const [addingAssessment, setAddingAssessment] = useState(false)

  useEffect(() => {
    let cancelled = false
    getAnswerLogLast30Days(profile.id).then(rows => { if (!cancelled) setAnswerLog(rows) }).catch(() => {})
    getAssessments(profile.id).then(rows => { if (!cancelled) setAssessments(rows) }).catch(() => {})
    return () => { cancelled = true }
  }, [profile.id])

  const { level, pct } = getLevelProgress(profile.xp)
  const rank = RANKS[Math.min(level, RANKS.length - 1)]
  const nextRank = RANKS[Math.min(level + 1, RANKS.length - 1)]
  const rIcon = RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]

  const topicStats = {}
  const topicSubtopics = {}
  questions.forEach((q) => {
    const topic = normalizeCurriculumTopic(q.topic)
    if (!topic) return // skip questions whose topic isn't in the current stage curriculum
    if (!topicStats[topic]) topicStats[topic] = { total: 0, attempted: 0, correct: 0, wrong: 0 }
    if (!topicSubtopics[topic]) topicSubtopics[topic] = []
    topicStats[topic].total += 1
    if (q.subtopic && !topicSubtopics[topic].includes(q.subtopic)) topicSubtopics[topic].push(q.subtopic)
    const s = struggleMap[q.id]
    if (s && s.attempts > 0) {
      topicStats[topic].attempted += 1
      topicStats[topic].correct += (s.attempts - s.wrong)
      topicStats[topic].wrong += s.wrong
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

  const handleAddAssessment = async () => {
    if (!addFormType || !addFormLabel.trim() || !addFormDate) return
    setAddingAssessment(true)
    setAddFormError('')
    try {
      const row = await addAssessment(profile.id, addFormType, addFormLabel.trim(), addFormDate)
      setAssessments(prev => [...prev, row].sort((a, b) => new Date(a.date) - new Date(b.date)))
      setAddFormLabel('')
      setAddFormDate('')
    } catch {
      setAddFormError('Failed to save. Please try again.')
    }
    setAddingAssessment(false)
  }

  const handleDeleteAssessment = async (id) => {
    const prev = assessments
    setAssessments(a => a.filter(x => x.id !== id))
    try {
      await deleteAssessment(id)
    } catch {
      setAssessments(prev)
    }
  }

  return (
    <div style={{ height: embedded ? '100%' : '100vh', minHeight: 0, background: embedded ? 'transparent' : t.bg, color: t.text, fontFamily: FONT_B, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .ps-scroll { flex: 1; min-height: 0; overflow-y: auto; }
        .ps-inner { padding: 28px 32px 32px; animation: fadeUp 0.3s ease; }
        .ps-header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
        .ps-header-text { flex: 1; min-width: 0; }
        .ps-stats-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; align-items: stretch; }
        .ps-study-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .ps-topic-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        @media (max-width: 980px) {
          .ps-study-grid, .ps-topic-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 860px) {
          .ps-inner { padding: 18px 14px 22px; }
          .ps-header-row { flex-direction: column; }
          .ps-stats-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="ps-scroll">
        <div className="ps-inner">

          {/* Page header + Current Rank side by side */}
          <div className="ps-header-row">
            <div className="ps-header-text">
              <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Analytics</div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: t.text, margin: 0 }}>My Progress</h1>
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: 6 }}>Track your level, identify weak areas, and jump straight into focused revision.</div>
            </div>
            <div style={{ ...card, padding: '16px 20px', background: theme === 'dark' ? 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(14,165,233,0.08))' : 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(14,165,233,0.04))', border: `1px solid ${theme === 'dark' ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.18)'}`, flexShrink: 0, minWidth: 210 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Current Rank</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: t.text }}>{rank}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>Level {level} · {profile.xp.toLocaleString()} XP</div>
                  {nextRank !== rank && <div style={{ fontSize: 11, color: GOLD, marginTop: 6 }}>Next up: {nextRank}</div>}
                </div>
                <div style={{ fontSize: 40, lineHeight: 1 }}>{rIcon}</div>
              </div>
            </div>
          </div>

          {/* XP Progress bar */}
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

          {/* Your Stats (left) + Exam Readiness (right) */}
          <div className="ps-stats-row">
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
            <ReadinessCard
              profile={profile}
              questions={questions}
              struggleMap={struggleMap}
              assessments={assessments}
              onStartSession={onStartSession}
              theme={theme}
            />
          </div>

          {/* Last 30 Days (left) + Assessments (right) */}
          <div className="ps-stats-row">
            <StreakCalendar
              answerLog={answerLog}
              onStartSession={onStartSession}
              theme={theme}
            />

            {/* Assessments */}
            <div style={{ ...card, padding: '18px 20px', boxSizing: 'border-box' }}>
              <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>My Assessments</div>
              <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 14 }}>Track your upcoming tests, assignments, and exams.</div>

              {assessments.length === 0 && (
                <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 14 }}>No assessments yet. Add your first one below.</div>
              )}

              {assessments.length > 0 && (() => {
                const todayStr = new Date().toDateString()
                const upcoming = assessments.filter(a => new Date(a.date) >= new Date(todayStr))
                const past = assessments.filter(a => new Date(a.date) < new Date(todayStr))
                const TYPE_COLORS = {
                  Assignment: { bg: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: 'rgba(56,189,248,0.35)' },
                  Test: { bg: 'rgba(241,190,67,0.15)', color: GOLD, border: 'rgba(241,190,67,0.35)' },
                  'Revision Test': { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: 'rgba(167,139,250,0.35)' },
                  Exam: { bg: `${t.danger}18`, color: t.danger, border: `${t.danger}40` },
                }
                const renderRow = (a, faded = false) => {
                  const days = Math.ceil((new Date(a.date) - new Date()) / 86400000)
                  const daysColor = days > 60 ? t.success : days > 21 ? GOLD : t.danger
                  const tc = TYPE_COLORS[a.type] || TYPE_COLORS['Test']
                  const dateStr = new Date(a.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', weekday: 'short' })
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${t.border}`, opacity: faded ? 0.45 : 1, flexWrap: 'wrap' }}>
                      <div style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`, flexShrink: 0 }}>{a.type}</div>
                      <div style={{ flex: 1, minWidth: 80 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{a.label}</div>
                        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{dateStr}</div>
                      </div>
                      {!faded && (
                        <div style={{ padding: '4px 10px', borderRadius: 8, background: `${daysColor}18`, border: `1px solid ${daysColor}40`, textAlign: 'center', flexShrink: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: daysColor, lineHeight: 1 }}>{Math.max(0, days)}</div>
                          <div style={{ fontSize: 9, color: t.textMuted }}>days</div>
                        </div>
                      )}
                      <button
                        onClick={() => handleDeleteAssessment(a.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 14, padding: '4px 6px', borderRadius: 6, flexShrink: 0 }}
                        title="Remove"
                      >🗑</button>
                    </div>
                  )
                }
                return (
                  <div>
                    {upcoming.map(a => renderRow(a, false))}
                    {past.length > 0 && (
                      <>
                        <div style={{ fontSize: 10, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '12px 0 4px' }}>Past</div>
                        {past.map(a => renderRow(a, true))}
                      </>
                    )}
                  </div>
                )
              })()}

              {/* Add form */}
              <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: '0 0 auto' }}>
                  <label style={{ fontSize: 10, color: t.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Type</label>
                  <select
                    value={addFormType}
                    onChange={e => setAddFormType(e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: 9, border: `1px solid ${t.border}`, background: t.bgInput, color: t.text, fontSize: 12, fontFamily: FONT_B, outline: 'none' }}
                  >
                    {['Assignment', 'Test', 'Revision Test', 'Exam'].map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 100 }}>
                  <label style={{ fontSize: 10, color: t.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Label</label>
                  <input
                    type="text"
                    value={addFormLabel}
                    onChange={e => setAddFormLabel(e.target.value)}
                    placeholder="e.g. Unit 3 Test"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: `1px solid ${t.border}`, background: t.bgInput, color: t.text, fontSize: 12, fontFamily: FONT_B, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: '0 0 auto' }}>
                  <label style={{ fontSize: 10, color: t.textMuted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Date</label>
                  <input
                    type="date"
                    value={addFormDate}
                    onChange={e => setAddFormDate(e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: 9, border: `1px solid ${t.border}`, background: t.bgInput, color: t.text, fontSize: 12, fontFamily: FONT_B, outline: 'none', colorScheme: theme === 'dark' ? 'dark' : 'light' }}
                  />
                </div>
                <button
                  onClick={handleAddAssessment}
                  disabled={!addFormLabel.trim() || !addFormDate || addingAssessment}
                  style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: addFormLabel.trim() && addFormDate ? `linear-gradient(135deg, ${GOLD}, ${GOLDL})` : t.border, color: addFormLabel.trim() && addFormDate ? '#0c1037' : t.textMuted, fontSize: 12, fontWeight: 800, cursor: addFormLabel.trim() && addFormDate ? 'pointer' : 'not-allowed', fontFamily: FONT_B, alignSelf: 'flex-end' }}
                >
                  {addingAssessment ? 'Adding…' : 'Add'}
                </button>
              </div>
              {addFormError && <div style={{ fontSize: 12, color: t.danger, marginTop: 8 }}>{addFormError}</div>}
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

          <SubtopicHeatmap
            questions={questions}
            struggleMap={struggleMap}
            onStartSession={onStartSession}
            theme={theme}
            subject={subject}
          />

          <div style={{ ...card, padding: '18px 20px', marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Topic Breakdown</div>
              <div style={{ fontSize: 11, color: t.textMuted }}>SACE {subject?.stage || 'Stage 1'} {subject?.name || 'Chemistry'}</div>
            </div>
            <div className="ps-topic-grid">
              {curriculumTopics.map((topic) => {
                const s = topicStats[topic]
                const rate = s && s.attempted > 0 ? s.correct / Math.max(s.correct + s.wrong, 1) : null
                const total = s?.total ?? 0
                const attempted = s?.attempted ?? 0
                const pctAttempted = total > 0 ? Math.round((attempted / total) * 100) : 0
                const tone = rate === null ? t.textFaint : rate >= 0.75 ? t.success : rate >= 0.45 ? GOLD : t.danger
                const label = rate === null ? (total === 0 ? 'No questions' : 'Not started') : rate >= 0.75 ? 'Strong' : rate >= 0.45 ? 'Developing' : 'Needs work'
                return (
                  <div key={topic} style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: '14px 14px 12px', background: theme === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{topic}</div>
                        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>{attempted}/{total} attempted</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: tone }}>{label}</div>
                        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>{rate === null ? '—' : `${Math.round(rate * 100)}%`}</div>
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
