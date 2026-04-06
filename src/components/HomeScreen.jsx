import { useEffect, useMemo, useState } from 'react'
import { THEMES } from '../lib/theme'
import { getQuestionCounts } from '../lib/engine'
import { supabase } from '../lib/supabase'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const DESKTOP_GAP = 24

function startOfDayLocal(dateLike) {
  const d = new Date(dateLike)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(dateLike, days) {
  const d = new Date(dateLike)
  d.setDate(d.getDate() + days)
  return d
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function HomeScreen({ profile, struggleMap, questions, subject, onStartSession, theme }) {
  const t = THEMES[theme]
  const [selectedSubtopics, setSelectedSubtopics] = useState(null) // null = all, [] = none, [..] = filtered
  const [showSubtopicPicker, setShowSubtopicPicker] = useState(false)
  const [activityTab, setActivityTab] = useState('Week')
  const [answerLog, setAnswerLog] = useState([])

  useEffect(() => {
    let cancelled = false

    async function loadActivity() {
      if (!profile?.id) {
        if (!cancelled) setAnswerLog([])
        return
      }

      const { data, error } = await supabase
        .from('answer_log')
        .select('question_id, answered_at')
        .eq('user_id', profile.id)
        .order('answered_at', { ascending: false })
        .limit(5000)

      if (!cancelled) {
        setAnswerLog(error || !data ? [] : data)
      }
    }

    loadActivity()
    return () => { cancelled = true }
  }, [profile?.id])

  const questionIds = useMemo(() => new Set(questions.map(q => q.id)), [questions])
  const currentStruggleMap = useMemo(() => {
    const filtered = {}
    Object.entries(struggleMap || {}).forEach(([qid, stats]) => {
      if (questionIds.has(qid)) filtered[qid] = stats
    })
    return filtered
  }, [struggleMap, questionIds])

  const filteredAnswerLog = useMemo(() => {
    if (!Array.isArray(answerLog)) return []
    return answerLog.filter(a => questionIds.has(a.question_id))
  }, [answerLog, questionIds])

  const topicGroups = {}
  const subtopicGroups = {}
  questions.forEach(q => {
    if (!topicGroups[q.topic]) topicGroups[q.topic] = { total: 0, attempted: 0, correct: 0 }
    topicGroups[q.topic].total++

    if (!subtopicGroups[q.subtopic]) subtopicGroups[q.subtopic] = { topic: q.topic, total: 0, attempted: 0, wrong: 0 }
    subtopicGroups[q.subtopic].total++

    const s = currentStruggleMap[q.id]
    if (s && s.attempts > 0) {
      topicGroups[q.topic].attempted++
      topicGroups[q.topic].correct += (s.attempts - s.wrong)
      subtopicGroups[q.subtopic].attempted++
      subtopicGroups[q.subtopic].wrong += s.wrong
    }
  })

  const allSubtopics = [...new Set(questions.map(q => q.subtopic).filter(Boolean))]
  const isAllTopicsSelected = selectedSubtopics === null
  const hasNoTopicsSelected = Array.isArray(selectedSubtopics) && selectedSubtopics.length === 0
  const effectiveSubtopics = isAllTopicsSelected ? [] : selectedSubtopics
  const selectedQuestionTotal = isAllTopicsSelected
    ? questions.length
    : questions.filter(q => selectedSubtopics?.includes(q.subtopic)).length

  const fullCounts = getQuestionCounts(questions, currentStruggleMap)
  const filteredCounts = getQuestionCounts(questions, currentStruggleMap, effectiveSubtopics)
  const attemptedQuestionCount = questions.filter(q => (currentStruggleMap[q.id]?.attempts || 0) > 0).length

  const selectedTopicsSummary = isAllTopicsSelected
    ? 'All topics'
    : hasNoTopicsSelected
      ? 'No topics selected'
      : [...new Set(questions.filter(q => selectedSubtopics.includes(q.subtopic)).map(q => q.topic))].join(', ')

  const topStruggles = Object.entries(currentStruggleMap)
    .map(([qid, s]) => {
      const q = questions.find(x => x.id === qid)
      if (!q || s.attempts === 0) return null
      return { q, rate: s.wrong / s.attempts, ...s }
    })
    .filter(x => x && x.rate >= 0.4)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5)

  const totalAttempts = Object.values(currentStruggleMap).reduce((s, v) => s + (v.attempts || 0), 0)
  const totalWrong = Object.values(currentStruggleMap).reduce((s, v) => s + (v.wrong || 0), 0)
  const accuracy = totalAttempts > 0 ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100) : 0

  const graphData = useMemo(() => {
    const today = startOfDayLocal(new Date())

    if (activityTab === 'Week') {
      const start = addDays(today, -6)
      const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
      const days = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(start, i)
        const count = filteredAnswerLog.reduce((sum, row) => {
          if (!row?.answered_at) return sum
          const answered = startOfDayLocal(row.answered_at)
          return sameDay(answered, date) ? sum + 1 : sum
        }, 0)
        return {
          label: labels[i],
          count,
          isToday: sameDay(date, today),
        }
      })
      return { items: days, max: Math.max(1, ...days.map(d => d.count)) }
    }

    if (activityTab === 'Month') {
      const start = addDays(today, -29)
      const buckets = Array.from({ length: 5 }, (_, i) => ({
        label: i === 4 ? 'Now' : `W${i + 1}`,
        count: 0,
        isToday: i === 4,
      }))

      filteredAnswerLog.forEach(row => {
        if (!row?.answered_at) return
        const answered = startOfDayLocal(row.answered_at)
        if (answered < start || answered > today) return
        const diffDays = Math.floor((answered - start) / 86400000)
        const bucketIndex = Math.min(4, Math.floor(diffDays / 7))
        buckets[bucketIndex].count += 1
      })

      return { items: buckets, max: Math.max(1, ...buckets.map(d => d.count)) }
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthBuckets = Array.from({ length: 6 }, (_, i) => {
      const date = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1)
      return {
        label: months[date.getMonth()],
        month: date.getMonth(),
        year: date.getFullYear(),
        count: 0,
        isToday: date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear(),
      }
    })

    filteredAnswerLog.forEach(row => {
      if (!row?.answered_at) return
      const answered = new Date(row.answered_at)
      const bucket = monthBuckets.find(m => m.month === answered.getMonth() && m.year === answered.getFullYear())
      if (bucket) bucket.count += 1
    })

    return { items: monthBuckets, max: Math.max(1, ...monthBuckets.map(d => d.count)) }
  }, [activityTab, filteredAnswerLog])

  const card = {
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: 16,
    boxShadow: theme === 'light' ? '0 2px 12px rgba(12,16,55,0.07)' : '0 2px 12px rgba(0,0,0,0.25)',
  }

  const actionButtonBase = {
    width: '100%',
    borderRadius: 12,
    cursor: 'pointer',
    fontFamily: FONT_B,
  }

  const renderActionButton = ({ label, onClick, variant = 'secondary', disabled = false, small = false }) => {
    const styles = {
      primary: {
        border: 'none',
        background: disabled ? (theme === 'dark' ? 'rgba(255,255,255,0.06)' : '#eceef8') : `linear-gradient(135deg,${GOLD},${GOLDL})`,
        color: disabled ? t.textFaint : '#0c1037',
        boxShadow: disabled ? 'none' : '0 6px 24px rgba(241,190,67,0.35)',
      },
      danger: {
        border: '1px solid rgba(239,68,68,0.3)',
        background: disabled ? 'transparent' : 'rgba(239,68,68,0.06)',
        color: disabled ? t.textFaint : t.danger,
      },
      secondary: {
        border: `1px solid ${t.border}`,
        background: 'transparent',
        color: disabled ? t.textFaint : t.textMuted,
      },
    }

    return (
      <button
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        style={{
          ...actionButtonBase,
          ...styles[variant],
          padding: small ? '12px 14px' : '14px 16px',
          fontSize: small ? 13 : 14,
          fontWeight: variant === 'primary' ? 800 : 700,
          opacity: disabled ? 0.65 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {label}
      </button>
    )
  }

  const PriorityCard = () => topStruggles.length > 0 ? (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 2 }}>Priority Topics</div>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 12 }}>Hit first in your next session</div>
      {topStruggles.map((s, i) => (
        <div key={s.q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${t.danger}15`, border: `1px solid ${t.danger}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: t.danger, flexShrink: 0 }}>{i+1}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.q.subtopic}</div>
            <div style={{ fontSize: 10, color: t.textMuted }}>{s.q.topic}</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.danger, flexShrink: 0 }}>{Math.round(s.rate*100)}%</div>
        </div>
      ))}
    </div>
  ) : null

  const StatsCard = () => (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 12 }}>Your Stats</div>
      {[
        { label: 'Total XP',       val: profile.xp.toLocaleString(),         color: GOLD },
        { label: 'Best streak',    val: `${profile.best_streak||0} days 🔥`, color: GOLD },
        { label: 'Questions done', val: totalAttempts,                        color: t.text },
        { label: 'Accuracy',       val: `${accuracy}%`,                      color: accuracy > 70 ? t.success : accuracy > 40 ? GOLD : t.danger },
      ].map(s => (
        <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${t.border}` }}>
          <span style={{ fontSize: 13, color: t.textMuted }}>{s.label}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.val}</span>
        </div>
      ))}
    </div>
  )

  const SprintCard = () => (
    <div style={{ ...card, padding: '16px 18px', background: theme === 'dark' ? 'rgba(241,190,67,0.05)' : t.bgCard, border: `1px solid ${theme === 'dark' ? 'rgba(241,190,67,0.15)' : t.border}` }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, marginBottom: 6 }}>📅 SACE Exam Sprint</div>
      <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 10 }}>Set a study goal to track your daily progress.</div>
      <button style={{ width: '100%', padding: '9px', borderRadius: 8, border: `1px solid rgba(241,190,67,0.25)`, background: 'transparent', color: GOLD, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
        Set Study Goal →
      </button>
    </div>
  )

  const toggleTopic = (topic) => {
    const subs = [...new Set(questions.filter(q => q.topic === topic).map(q => q.subtopic).filter(Boolean))]
    const allSel = !isAllTopicsSelected && subs.every(s => selectedSubtopics.includes(s))

    if (isAllTopicsSelected) {
      setSelectedSubtopics(allSubtopics.filter(s => !subs.includes(s)))
      return
    }
    if (allSel) {
      setSelectedSubtopics(prev => prev.filter(s => !subs.includes(s)))
      return
    }
    setSelectedSubtopics(prev => [...new Set([...(prev || []), ...subs])])
  }

  const toggleSub = (sub) => {
    if (isAllTopicsSelected) {
      setSelectedSubtopics(allSubtopics.filter(s => s !== sub))
      return
    }
    setSelectedSubtopics(prev => prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub])
  }

  return (
    <div style={{ color: t.text, fontFamily: FONT_B, animation: 'hs-fadeUp 0.3s ease', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes hs-fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .hs-wrap  { display: grid; grid-template-columns: minmax(0, 1fr) 320px; column-gap: ${DESKTOP_GAP}px; align-items: start; flex: 1; min-height: 0; }
        .hs-main  { min-width: 0; padding: 32px 12px 32px 32px; margin-right: -12px; overflow-y: auto; height: 100%; box-sizing: border-box; }
        .hs-right { min-width: 0; padding: 32px 32px 32px 0; display: flex; flex-direction: column; gap: 14px; overflow-y: visible; height: 100%; box-sizing: border-box; }
        .hs-mobile-cards { display: none; flex-direction: column; gap: 14px; margin-top: 14px; }
        .hs-selected-actions { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 10px; }
        @media (max-width: 1100px) {
          .hs-selected-actions { grid-template-columns: 1fr; }
        }
        @media (max-width: 860px) {
          .hs-wrap  { display: block !important; flex: none !important; height: auto !important; overflow: visible !important; min-height: auto !important; }
          .hs-main  { height: auto !important; overflow-y: visible !important; padding: 18px 14px !important; margin-right: 0 !important; }
          .hs-right { display: none !important; }
          .hs-mobile-cards { display: flex; }
        }
      `}</style>

      <div className="hs-wrap">
        <div className="hs-main">
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4, color: t.text }}>Question Bank</h1>
          <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 20 }}>
            {subject?.stage || 'Stage 1'} · {subject?.name || 'Chemistry'} · {questions.length} questions
          </p>

          <div style={{ ...card, padding: '16px 20px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {['Week','Month','All'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActivityTab(tab)}
                    style={{ padding: '5px 14px', borderRadius: 20, border: 'none', background: activityTab === tab ? GOLD : 'transparent', color: activityTab === tab ? '#0c1037' : t.textMuted, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                {[
                  { val: totalAttempts, label: 'answered' },
                  { val: `${accuracy}%`, label: 'correct' },
                  { val: profile.streak || 0, label: 'streak' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: t.text }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 48 }}>
              {graphData.items.map((d, i) => (
                <div key={`${d.label}-${i}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: '100%', background: d.count > 0 ? GOLD : t.border, borderRadius: '3px 3px 0 0', height: d.count > 0 ? `${Math.max((d.count / graphData.max) * 38, 8)}px` : '3px' }} />
                  <div style={{ fontSize: 10, color: d.isToday ? GOLD : t.textFaint, fontWeight: d.isToday ? 700 : 400 }}>{d.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...card, padding: '16px 20px', marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: t.text }}>Quick Start (All Topics)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {fullCounts.unseen > 0 ? (
                renderActionButton({
                  label: `Start Session · ${fullCounts.unseen} new question${fullCounts.unseen !== 1 ? 's' : ''} →`,
                  onClick: () => onStartSession({ mode: 'new', subtopics: null }),
                  variant: 'primary',
                })
              ) : (
                <div style={{ padding: '14px 16px', borderRadius: 12, background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : '#f5f6ff', border: `1px solid ${t.border}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>🎉</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 4 }}>All questions attempted!</div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>Use the options below to review and repeat.</div>
                </div>
              )}

              {fullCounts.wrong > 0 && renderActionButton({
                label: `Re-attempt ${fullCounts.wrong} wrong answer${fullCounts.wrong !== 1 ? 's' : ''}`,
                onClick: () => onStartSession({ mode: 'wrong', subtopics: null }),
                variant: 'danger',
                small: true,
              })}

              {fullCounts.unseen === 0 && renderActionButton({
                label: 'Repeat all questions',
                onClick: () => onStartSession({ mode: 'all', subtopics: null }),
                variant: 'secondary',
                small: true,
              })}
            </div>
          </div>

          <div style={{ ...card, padding: '16px 20px' }}>
            <div style={{ borderBottom: `1px solid ${t.border}`, paddingBottom: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: t.textMuted }}>
                  {isAllTopicsSelected ? 'All topics' : hasNoTopicsSelected ? 'No topics selected' : `${selectedSubtopics.length} subtopic${selectedSubtopics.length !== 1 ? 's' : ''} selected`}
                </span>
                <button
                  onClick={() => setShowSubtopicPicker(p => !p)}
                  style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, border: `1px solid ${showSubtopicPicker ? GOLD : t.border}`, background: showSubtopicPicker ? 'rgba(241,190,67,0.12)' : 'transparent', color: showSubtopicPicker ? GOLD : t.textMuted, cursor: 'pointer', fontFamily: FONT_B }}
                >
                  {showSubtopicPicker ? 'Done ✓' : 'Filter topics'}
                </button>
              </div>

              {Object.entries(topicGroups).map(([topic, s]) => {
                const pct = s.total > 0 ? s.attempted / s.total : 0
                const acc = s.attempted > 0 ? s.correct / s.attempted : null
                const dotCol = acc === null ? t.textFaint : acc > 0.7 ? t.success : acc > 0.4 ? GOLD : t.danger
                return (
                  <div key={topic} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: dotCol }} />
                    <span style={{ fontSize: 12, color: t.textSub, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic}</span>
                    <div style={{ width: 48, background: t.border, borderRadius: 3, height: 3, overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ width: `${pct*100}%`, height: '100%', background: GOLD }} />
                    </div>
                    <span style={{ fontSize: 10, color: t.textFaint, width: 32, textAlign: 'right', flexShrink: 0 }}>{s.attempted}/{s.total}</span>
                  </div>
                )
              })}
            </div>

            {showSubtopicPicker && (
              <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 14 }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Filter by topic</span>
                  {!isAllTopicsSelected && (
                    <button
                      onClick={() => setSelectedSubtopics(null)}
                      style={{ fontSize: 11, color: GOLD, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_B }}
                    >
                      Clear filter
                    </button>
                  )}
                </div>

                <div
                  onClick={() => setSelectedSubtopics(isAllTopicsSelected ? [] : null)}
                  style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', cursor: 'pointer', background: isAllTopicsSelected ? 'rgba(241,190,67,0.07)' : 'transparent', borderBottom: `1px solid ${t.border}` }}
                >
                  <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${isAllTopicsSelected ? GOLD : t.border}`, background: isAllTopicsSelected ? GOLD : 'transparent', marginRight: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isAllTopicsSelected && <span style={{ fontSize: 10, color: '#0c1037', fontWeight: 800 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isAllTopicsSelected ? GOLD : t.text, flex: 1 }}>All Topics</span>
                  <span style={{ fontSize: 12, color: t.textMuted }}>{attemptedQuestionCount} / {questions.length}</span>
                </div>

                <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                  {Object.entries(topicGroups).map(([topic, tg]) => {
                    const subs = [...new Set(questions.filter(q => q.topic === topic).map(q => q.subtopic).filter(Boolean))]
                    const topicSel = isAllTopicsSelected || subs.every(s => selectedSubtopics.includes(s))
                    const topicPartial = !isAllTopicsSelected && subs.some(s => selectedSubtopics.includes(s)) && !topicSel

                    return (
                      <div key={topic}>
                        <div
                          onClick={() => toggleTopic(topic)}
                          style={{ display: 'flex', alignItems: 'center', padding: '9px 16px', cursor: 'pointer', borderBottom: `1px solid ${t.border}` }}
                        >
                          <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${topicSel || topicPartial ? GOLD : t.border}`, background: topicSel ? GOLD : 'transparent', marginRight: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {topicSel && <span style={{ fontSize: 10, color: '#0c1037', fontWeight: 800 }}>✓</span>}
                            {topicPartial && !topicSel && <span style={{ fontSize: 10, color: GOLD, fontWeight: 800 }}>−</span>}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: topicSel ? t.text : t.textMuted, flex: 1 }}>{topic}</span>
                          <span style={{ fontSize: 12, color: t.textMuted }}>{tg.attempted} / {tg.total}</span>
                        </div>

                        {subs.map(sub => {
                          const sg = subtopicGroups[sub] || { attempted: 0, total: 0, wrong: 0 }
                          const subSel = isAllTopicsSelected || selectedSubtopics.includes(sub)
                          const errRate = sg.attempted > 0 ? Math.round((sg.wrong / sg.attempted) * 100) : null
                          return (
                            <div
                              key={sub}
                              onClick={() => toggleSub(sub)}
                              style={{ display: 'flex', alignItems: 'center', padding: '7px 16px 7px 40px', cursor: 'pointer', borderBottom: `1px solid ${t.border}`, background: subSel ? 'rgba(241,190,67,0.04)' : 'transparent' }}
                            >
                              <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${subSel ? GOLD : t.border}`, background: subSel ? GOLD : 'transparent', marginRight: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {subSel && <span style={{ fontSize: 9, color: '#0c1037', fontWeight: 800 }}>✓</span>}
                              </div>
                              <span style={{ fontSize: 12, color: subSel ? t.text : t.textMuted, flex: 1 }}>{sub}</span>
                              {errRate !== null && errRate > 0 && (
                                <span style={{ fontSize: 10, color: t.danger, fontWeight: 700, marginRight: 8 }}>⚡{errRate}%</span>
                              )}
                              <span style={{ fontSize: 11, color: t.textMuted }}>{sg.attempted} / {sg.total}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ ...card, padding: '16px 18px', background: theme === 'dark' ? 'rgba(241,190,67,0.04)' : '#fffaf0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 4 }}>Selected for next session</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 4 }}>
                    {isAllTopicsSelected ? `${allSubtopics.length} subtopics selected` : hasNoTopicsSelected ? '0 subtopics selected' : `${selectedSubtopics.length} subtopic${selectedSubtopics.length !== 1 ? 's' : ''} selected`}
                  </div>
                  <div style={{ fontSize: 12, color: hasNoTopicsSelected ? t.danger : t.textMuted }}>
                    {selectedTopicsSummary}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: GOLD }}>{selectedQuestionTotal}</div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>questions included</div>
                </div>
              </div>

              <div className="hs-selected-actions">
                {renderActionButton({
                  label: hasNoTopicsSelected
                    ? 'Select at least one topic'
                    : `Start selected session · ${filteredCounts.unseen} new`,
                  onClick: () => onStartSession({ mode: 'new', subtopics: selectedSubtopics }),
                  variant: 'primary',
                  disabled: hasNoTopicsSelected,
                })}
                {renderActionButton({
                  label: `Re-attempt wrong${filteredCounts.wrong > 0 ? ` · ${filteredCounts.wrong}` : ''}`,
                  onClick: () => onStartSession({ mode: 'wrong', subtopics: selectedSubtopics }),
                  variant: 'danger',
                  disabled: hasNoTopicsSelected || filteredCounts.wrong === 0,
                })}
                {renderActionButton({
                  label: 'Repeat selected',
                  onClick: () => onStartSession({ mode: 'all', subtopics: selectedSubtopics }),
                  variant: 'secondary',
                  disabled: hasNoTopicsSelected || selectedQuestionTotal === 0,
                })}
              </div>
            </div>
          </div>

          <div className="hs-mobile-cards">
            <PriorityCard />
            <StatsCard />
            <SprintCard />
          </div>
        </div>

        <div className="hs-right">
          <PriorityCard />
          <StatsCard />
          <SprintCard />
        </div>
      </div>
    </div>
  )
}
