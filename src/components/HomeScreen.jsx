import { useMemo, useState } from 'react'
import { THEMES } from '../lib/theme'
import { getQuestionCounts } from '../lib/engine'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

export default function HomeScreen({ profile, struggleMap, questions, subject, onStartSession, theme }) {
  const t = THEMES[theme]
  const [selectedSubtopics, setSelectedSubtopics] = useState([]) // [] = none selected by default
  const [expandedTopics, setExpandedTopics] = useState(() => new Set())

  const questionIds = useMemo(() => new Set(questions.map(q => q.id)), [questions])
  const currentStruggleMap = useMemo(() => {
    const filtered = {}
    Object.entries(struggleMap || {}).forEach(([qid, stats]) => {
      if (questionIds.has(qid)) filtered[qid] = stats
    })
    return filtered
  }, [struggleMap, questionIds])

  const topicGroups = {}
  const subtopicGroups = {}
  questions.forEach(q => {
    if (!topicGroups[q.topic]) topicGroups[q.topic] = { total: 0, attempted: 0, correct: 0, wrong: 0 }
    topicGroups[q.topic].total++

    if (!subtopicGroups[q.subtopic]) subtopicGroups[q.subtopic] = { topic: q.topic, total: 0, attempted: 0, wrong: 0 }
    subtopicGroups[q.subtopic].total++

    const s = currentStruggleMap[q.id]
    if (s && s.attempts > 0) {
      topicGroups[q.topic].attempted++
      topicGroups[q.topic].correct += (s.attempts - s.wrong)
      topicGroups[q.topic].wrong += s.wrong
      subtopicGroups[q.subtopic].attempted++
      subtopicGroups[q.subtopic].wrong += s.wrong
    }
  })

  const topicEntries = Object.entries(topicGroups)
  const allSubtopics = [...new Set(questions.map(q => q.subtopic).filter(Boolean))]
  const hasNoTopicsSelected = selectedSubtopics.length === 0
  const isAllTopicsSelected = allSubtopics.length > 0 && selectedSubtopics.length === allSubtopics.length
  const effectiveSubtopics = selectedSubtopics
  const selectedQuestionTotal = hasNoTopicsSelected
    ? 0
    : questions.filter(q => selectedSubtopics.includes(q.subtopic)).length

  const fullCounts = getQuestionCounts(questions, currentStruggleMap)
  const filteredCounts = hasNoTopicsSelected
    ? { unseen: 0, wrong: 0, total: 0 }
    : getQuestionCounts(questions, currentStruggleMap, effectiveSubtopics)

  const selectedTopicsSummary = hasNoTopicsSelected
    ? 'No topics selected'
    : isAllTopicsSelected
      ? 'All topics'
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
  const days = ['M','T','W','T','F','S','S']
  const activity = [0,0,0,0,totalAttempts,0,0]
  const maxAct = Math.max(...activity, 1)

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
      <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 2 }}>Priority Topics</div>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 12 }}>Hit first in your next session</div>
      {topStruggles.map((s, i) => (
        <div key={s.q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${t.danger}15`, border: `1px solid ${t.danger}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: t.danger, flexShrink: 0 }}>{i+1}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.q.subtopic}</div>
            <div style={{ fontSize: 10, color: t.textMuted }}>{s.q.topic}</div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.danger, flexShrink: 0 }}>{Math.round(s.rate*100)}%</div>
        </div>
      ))}
    </div>
  ) : null

  const StatsCard = () => (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 12 }}>Your Stats</div>
      {[
        { label: 'Total XP',       val: profile.xp.toLocaleString(),         color: GOLD },
        { label: 'Best streak',    val: `${profile.best_streak||0} days 🔥`, color: GOLD },
        { label: 'Questions done', val: totalAttempts,                        color: t.text },
        { label: 'Accuracy',       val: `${accuracy}%`,                      color: accuracy > 70 ? t.success : accuracy > 40 ? GOLD : t.danger },
      ].map(s => (
        <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${t.border}` }}>
          <span style={{ fontSize: 15, color: t.textMuted }}>{s.label}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.val}</span>
        </div>
      ))}
    </div>
  )

  const SprintCard = () => (
    <div style={{ ...card, padding: '16px 18px', background: theme === 'dark' ? 'rgba(241,190,67,0.05)' : t.bgCard, border: `1px solid ${theme === 'dark' ? 'rgba(241,190,67,0.15)' : t.border}` }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: GOLD, marginBottom: 6 }}>📅 SACE Exam Sprint</div>
      <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.6, marginBottom: 10 }}>Set a study goal to track your daily progress.</div>
      <button style={{ width: '100%', padding: '9px', borderRadius: 8, border: `1px solid rgba(241,190,67,0.25)`, background: 'transparent', color: GOLD, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
        Set Study Goal →
      </button>
    </div>
  )

  const toggleTopic = (topic) => {
    const subs = [...new Set(questions.filter(q => q.topic === topic).map(q => q.subtopic).filter(Boolean))]
    const allSel = subs.every(s => selectedSubtopics.includes(s))

    if (allSel) {
      setSelectedSubtopics(prev => prev.filter(s => !subs.includes(s)))
      return
    }

    setSelectedSubtopics(prev => [...new Set([...prev, ...subs])])
  }

  const toggleSub = (sub) => {
    setSelectedSubtopics(prev => prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub])
  }

  const toggleExpanded = (topic) => {
    setExpandedTopics(prev => {
      const next = new Set(prev)
      if (next.has(topic)) next.delete(topic)
      else next.add(topic)
      return next
    })
  }

  const topicStatusColor = (topic) => {
    const tg = topicGroups[topic]
    if (!tg || tg.attempted === 0) return GOLD
    const rate = tg.wrong / tg.attempted
    if (rate >= 0.5) return t.danger
    if (rate >= 0.25) return GOLD
    return t.success
  }

  return (
    <div style={{ color: t.text, fontFamily: FONT_B, animation: 'hs-fadeUp 0.3s ease', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes hs-fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .hs-wrap  { display: flex; align-items: flex-start; gap: 24px; flex: 1; min-height: 0; }
        .hs-main  { flex: 1; min-width: 0; max-width: 980px; padding: 32px 24px 32px 32px; overflow-y: auto; height: 100%; box-sizing: border-box; }
        .hs-right { width: 328px; flex-shrink: 0; padding: 32px 32px 32px 0; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; height: 100%; box-sizing: border-box; }
        .hs-mobile-cards { display: none; flex-direction: column; gap: 14px; margin-top: 14px; }
        .hs-selected-actions { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 10px; }
        .hs-topic-grid { display: grid; grid-template-columns: minmax(280px, 340px) 180px 56px; align-items: center; column-gap: 18px; width: 100%; }
        .hs-topic-track { width: 180px; height: 4px; border-radius: 999px; overflow: hidden; justify-self: start; }
        @media (max-width: 1240px) {
          .hs-main  { max-width: none; padding-right: 16px; }
          .hs-right { width: 300px; padding-right: 24px; }
        }
        @media (max-width: 1100px) {
          .hs-selected-actions { grid-template-columns: 1fr; }
          .hs-topic-grid { grid-template-columns: minmax(220px, 1fr) 140px 48px; column-gap: 14px; }
          .hs-topic-track { width: 140px; }
          .hs-right { width: 280px; padding-right: 20px; }
        }
        @media (max-width: 860px) {
          .hs-wrap  { display: block !important; flex: none !important; height: auto !important; overflow: visible !important; min-height: auto !important; }
          .hs-main  { height: auto !important; overflow-y: visible !important; padding: 18px 14px !important; }
          .hs-right { display: none !important; }
          .hs-mobile-cards { display: flex; }
          .hs-topic-grid { grid-template-columns: 1fr; row-gap: 8px; }
          .hs-topic-track { width: 120px; }
        }
        @media (max-width: 560px) {
          .hs-topic-track { width: 100px; }
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
              <div style={{ display: 'flex', gap: 5 }}>
                {['Week','Month','All'].map((tab, i) => (
                  <button key={tab} style={{ padding: '5px 14px', borderRadius: 20, border: 'none', background: i === 0 ? GOLD : 'transparent', color: i === 0 ? '#0c1037' : t.textMuted, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
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
              {days.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: '100%', background: activity[i] > 0 ? GOLD : t.border, borderRadius: '3px 3px 0 0', height: activity[i] > 0 ? `${Math.max((activity[i]/maxAct)*38, 8)}px` : '3px' }} />
                  <div style={{ fontSize: 10, color: i === 4 ? GOLD : t.textFaint, fontWeight: i === 4 ? 700 : 400 }}>{d}</div>
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
                  variant: 'primary',
                  onClick: () => onStartSession({ mode: 'new', subtopics: [] }),
                })
              ) : (
                <div style={{ borderRadius: 12, padding: '20px 16px', background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : '#f6f7fc', border: `1px solid ${t.border}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>🎉</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>All questions attempted!</div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>Use the options below to review and repeat.</div>
                </div>
              )}

              {fullCounts.wrong > 0 && renderActionButton({
                label: `Re-attempt ${fullCounts.wrong} wrong answer${fullCounts.wrong !== 1 ? 's' : ''}`,
                variant: 'danger',
                onClick: () => onStartSession({ mode: 'wrong', subtopics: [] }),
              })}

              {fullCounts.attempted > 0 && renderActionButton({
                label: 'Repeat all questions',
                onClick: () => onStartSession({ mode: 'all', subtopics: [] }),
              })}
            </div>
          </div>

          <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: t.text, marginBottom: 2 }}>Topic Progress</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>{topicEntries.length} topics · {questions.length} questions</div>
              </div>
              {!isAllTopicsSelected && (
                <button
                  onClick={() => setSelectedSubtopics(null)}
                  style={{ padding: '7px 12px', borderRadius: 10, border: `1px solid rgba(241,190,67,0.35)`, background: 'transparent', color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}
                >
                  Done ✓
                </button>
              )}
            </div>

            <div onClick={() => setSelectedSubtopics(isAllTopicsSelected ? [] : allSubtopics)}
              style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', background: isAllTopicsSelected ? 'rgba(241,190,67,0.07)' : 'transparent', borderBottom: `1px solid ${t.border}` }}>
              <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${isAllTopicsSelected ? GOLD : t.border}`, background: isAllTopicsSelected ? GOLD : 'transparent', marginRight: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isAllTopicsSelected && <span style={{ fontSize: 10, color: '#0c1037', fontWeight: 800 }}>✓</span>}
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: isAllTopicsSelected ? GOLD : t.text, flex: 1 }}>All Topics</span>
              <span style={{ fontSize: 13, color: t.textMuted }}>{questions.length}/{questions.length}</span>
            </div>

            <div style={{ maxHeight: 520, overflowY: 'auto' }}>
              {topicEntries.map(([topic, tg]) => {
                const subs = [...new Set(questions.filter(q => q.topic === topic).map(q => q.subtopic).filter(Boolean))]
                const topicSel = subs.every(s => selectedSubtopics.includes(s))
                const topicPartial = subs.some(s => selectedSubtopics.includes(s)) && !topicSel
                const accent = topicStatusColor(topic)
                const topicPct = tg.total > 0 ? Math.round((tg.attempted / tg.total) * 100) : 0
                const isExpanded = expandedTopics.has(topic)

                return (
                  <div key={topic}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${t.border}`, gap: 12 }}
                    >
                      <div
                        onClick={() => toggleTopic(topic)}
                        style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${topicSel || topicPartial ? GOLD : t.border}`, background: topicSel ? GOLD : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        {topicSel && <span style={{ fontSize: 10, color: '#0c1037', fontWeight: 800 }}>✓</span>}
                        {topicPartial && !topicSel && <span style={{ fontSize: 10, color: GOLD, fontWeight: 800 }}>−</span>}
                      </div>

                      <button
                        onClick={() => toggleExpanded(topic)}
                        aria-label={isExpanded ? `Collapse ${topic}` : `Expand ${topic}`}
                        style={{ border: 'none', background: 'transparent', padding: 0, margin: 0, cursor: 'pointer', color: t.textMuted, fontSize: 14, lineHeight: 1, width: 14, flexShrink: 0 }}
                      >
                        {isExpanded ? '▾' : '▸'}
                      </button>

                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }} />

                      <div className="hs-topic-grid" style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {topic} <span style={{ color: t.textMuted, fontWeight: 600 }}>({tg.attempted}/{tg.total})</span>
                        </div>
                        <div className="hs-topic-track" style={{ background: t.border }}>
                          <div style={{ width: `${topicPct}%`, height: '100%', background: GOLD, borderRadius: 999 }} />
                        </div>
                        <div style={{ fontSize: 11, color: t.textFaint, textAlign: 'right' }}>{topicPct}%</div>
                      </div>
                    </div>

                    {isExpanded && subs.map(sub => {
                      const sg = subtopicGroups[sub] || { attempted: 0, total: 0, wrong: 0 }
                      const subSel = selectedSubtopics.includes(sub)
                      const errRate = sg.attempted > 0 ? Math.round((sg.wrong / sg.attempted) * 100) : null
                      return (
                        <div key={sub} onClick={() => toggleSub(sub)}
                          style={{ display: 'flex', alignItems: 'center', padding: '9px 16px 9px 64px', cursor: 'pointer', borderBottom: `1px solid ${t.border}`, background: subSel ? 'rgba(241,190,67,0.04)' : 'transparent' }}>
                          <div style={{ width: 14, height: 14, borderRadius: 4, border: `2px solid ${subSel ? GOLD : t.border}`, background: subSel ? GOLD : 'transparent', marginRight: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {subSel && <span style={{ fontSize: 9, color: '#0c1037', fontWeight: 800 }}>✓</span>}
                          </div>
                          <span style={{ fontSize: 12, color: subSel ? t.text : t.textMuted, flex: 1 }}>{sub}</span>
                          {errRate !== null && errRate > 0 && (
                            <span style={{ fontSize: 10, color: t.danger, fontWeight: 700, marginRight: 8 }}>⚡ {errRate}%</span>
                          )}
                          <span style={{ fontSize: 11, color: t.textMuted }}>{sg.attempted}/{sg.total}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ ...card, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Selected for next session</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
                  {isAllTopicsSelected ? allSubtopics.length : selectedSubtopics.length} subtopic{(isAllTopicsSelected ? allSubtopics.length : selectedSubtopics.length) !== 1 ? 's' : ''} selected
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{selectedTopicsSummary}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>{selectedQuestionTotal}</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>questions included</div>
              </div>
            </div>

            <div className="hs-selected-actions">
              {renderActionButton({
                label: `Start selected session · ${filteredCounts.unseen} new`,
                variant: 'primary',
                disabled: hasNoTopicsSelected || filteredCounts.unseen === 0,
                onClick: () => onStartSession({ mode: 'new', subtopics: effectiveSubtopics }),
              })}
              {renderActionButton({
                label: `Re-attempt wrong · ${filteredCounts.wrong}`,
                variant: 'danger',
                disabled: hasNoTopicsSelected || filteredCounts.wrong === 0,
                onClick: () => onStartSession({ mode: 'wrong', subtopics: effectiveSubtopics }),
              })}
              {renderActionButton({
                label: 'Repeat selected',
                disabled: hasNoTopicsSelected || selectedQuestionTotal === 0,
                onClick: () => onStartSession({ mode: 'all', subtopics: effectiveSubtopics }),
              })}
            </div>

            {hasNoTopicsSelected && (
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 10 }}>Select at least one topic to start a session.</div>
            )}
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
