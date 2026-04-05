import { useState } from 'react'
import { THEMES } from '../lib/theme'
import { getQuestionCounts } from '../lib/engine'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

export default function HomeScreen({ profile, struggleMap, questions, subject, onStartSession, theme }) {
  const t = THEMES[theme]
  const [selectedSubtopics, setSelectedSubtopics] = useState([]) // empty = all
  const [showSubtopicPicker, setShowSubtopicPicker] = useState(false)

  const topStruggles = Object.entries(struggleMap)
    .map(([qid, s]) => {
      const q = questions.find(x => x.id === qid)
      if (!q || s.attempts === 0) return null
      return { q, rate: s.wrong / s.attempts, ...s }
    })
    .filter(x => x && x.rate >= 0.4)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5)

  const topicGroups = {}
  questions.forEach(q => {
    if (!topicGroups[q.topic]) topicGroups[q.topic] = { total: 0, attempted: 0, correct: 0 }
    topicGroups[q.topic].total++
    const s = struggleMap[q.id]
    if (s && s.attempts > 0) {
      topicGroups[q.topic].attempted++
      topicGroups[q.topic].correct += (s.attempts - s.wrong)
    }
  })

  // Build subtopic list for selector
  const subtopicGroups = {}
  questions.forEach(q => {
    if (!subtopicGroups[q.subtopic]) subtopicGroups[q.subtopic] = { topic: q.topic, total: 0, attempted: 0, wrong: 0 }
    subtopicGroups[q.subtopic].total++
    const s = struggleMap[q.id]
    if (s && s.attempts > 0) {
      subtopicGroups[q.subtopic].attempted++
      subtopicGroups[q.subtopic].wrong += s.wrong
    }
  })
  // Ensure subtopicGroups has total for all subtopics
  // (already done above — total incremented for every question)

  const totalAttempts = Object.values(struggleMap).reduce((s, v) => s + v.attempts, 0)
  const totalWrong    = Object.values(struggleMap).reduce((s, v) => s + v.wrong, 0)
  const accuracy      = totalAttempts > 0 ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100) : 0
  const days          = ['M','T','W','T','F','S','S']
  const activity      = [0,0,0,0,totalAttempts,0,0]
  const maxAct        = Math.max(...activity, 1)

  const card = {
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: 16,
    boxShadow: theme === 'light' ? '0 2px 12px rgba(12,16,55,0.07)' : '0 2px 12px rgba(0,0,0,0.25)',
  }

  // Shared cards rendered in both mobile (inline) and desktop (right panel)
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

  return (
    <div style={{ color: t.text, fontFamily: FONT_B, animation: 'hs-fadeUp 0.3s ease', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes hs-fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .hs-wrap  { display: flex; align-items: flex-start; height: 100%; }
        .hs-main  { flex: 1; min-width: 0; padding: 32px 32px; height: 100%; overflow-y: auto; }
        .hs-right { width: 260px; flex-shrink: 0; padding: 32px 28px 32px 0; display: flex; flex-direction: column; gap: 14px; height: 100%; overflow-y: auto; }
        .hs-mobile-cards { display: none; flex-direction: column; gap: 14px; margin-top: 14px; }
        @media (max-width: 860px) {
          .hs-wrap  { display: block; height: auto; }
          .hs-main  { padding: 18px 14px; height: auto; overflow-y: visible; }
          .hs-right { display: none; }
          .hs-mobile-cards { display: flex; }
        }
      `}</style>

      <div className="hs-wrap" style={{ flex: 1, minHeight: 0 }}>

        {/* ── MAIN COLUMN ── */}
        <div className="hs-main">

          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4, color: t.text }}>Question Bank</h1>
          <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 20 }}>
            {subject?.stage || 'Stage 1'} · {subject?.name || 'Chemistry'} · {questions.length} questions
          </p>

          {/* Activity graph */}
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
                  { val: totalAttempts,   label: 'answered' },
                  { val: `${accuracy}%`,  label: 'correct'  },
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

          {/* New Session */}
          <div style={{ ...card, padding: '16px 20px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: t.text }}>New Session</div>

            {/* Session action buttons — at the top */}
            {(() => {
              const counts = getQuestionCounts(questions, struggleMap)
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {counts.unseen > 0 ? (
                    <button onClick={() => onStartSession({ mode: 'new', subtopics: selectedSubtopics })} style={{ width: '100%', padding: '15px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: '#0c1037', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B, boxShadow: `0 6px 24px rgba(241,190,67,0.35)` }}>
                      Start Session · {(selectedSubtopics.length === 0 ? counts.unseen : questions.filter(q => selectedSubtopics.includes(q.subtopic) && (!struggleMap[q.id] || struggleMap[q.id].attempts === 0)).length)} new question{counts.unseen !== 1 ? 's' : ''}{selectedSubtopics.length > 0 ? ' (filtered)' : ''} →
                    </button>
                  ) : (
                    <div style={{ padding: '14px 16px', borderRadius: 12, background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : '#f5f6ff', border: `1px solid ${t.border}`, textAlign: 'center' }}>
                      <div style={{ fontSize: 20, marginBottom: 6 }}>🎉</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 4 }}>All questions attempted!</div>
                      <div style={{ fontSize: 12, color: t.textMuted }}>More questions coming soon.</div>
                    </div>
                  )}
                  {counts.wrong > 0 && (
                    <button onClick={() => onStartSession({ mode: 'wrong', subtopics: selectedSubtopics })} style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: t.danger, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
                      Re-attempt {counts.wrong} wrong answer{counts.wrong !== 1 ? 's' : ''}
                    </button>
                  )}
                  {counts.unseen === 0 && (
                    <button onClick={() => onStartSession({ mode: 'all', subtopics: selectedSubtopics })} style={{ width: '100%', padding: '12px', borderRadius: 12, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
                      Repeat all questions
                    </button>
                  )}
                </div>
              )
            })()}

            {/* Topic progress + filter */}
            <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: t.textMuted }}>
                  {selectedSubtopics.length === 0 ? 'All topics' : `${selectedSubtopics.length} subtopic${selectedSubtopics.length !== 1 ? 's' : ''} selected`}
                </span>
                <button onClick={() => setShowSubtopicPicker(p => !p)}
                  style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, border: `1px solid ${showSubtopicPicker ? GOLD : t.border}`, background: showSubtopicPicker ? 'rgba(241,190,67,0.12)' : 'transparent', color: showSubtopicPicker ? GOLD : t.textMuted, cursor: 'pointer', fontFamily: FONT_B }}>
                  {showSubtopicPicker ? 'Done ✓' : 'Filter topics'}
                </button>
              </div>

              {/* Compact progress bars — always visible */}
              {Object.entries(topicGroups).map(([topic, s]) => {
                const pct    = s.total > 0 ? s.attempted / s.total : 0
                const acc    = s.attempted > 0 ? s.correct / s.attempted : null
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
          </div>

          {/* Subtopic picker — tree style */}
          {showSubtopicPicker && (() => {
            // All subtopics selected = none explicitly chosen
            const allMode = selectedSubtopics.length === 0

            const toggleTopic = (topic) => {
              const subs = questions.filter(q => q.topic === topic).map(q => q.subtopic).filter((v,i,a) => a.indexOf(v) === i)
              const allSel = subs.every(s => selectedSubtopics.includes(s))
              if (allMode) {
                // Was in "all" mode — deselect this topic by selecting everything else
                const allSubs = Object.keys(topicGroups).flatMap(t => questions.filter(q => q.topic === t).map(q => q.subtopic).filter((v,i,a) => a.indexOf(v) === i))
                setSelectedSubtopics(allSubs.filter(s => !subs.includes(s)))
              } else if (allSel) {
                setSelectedSubtopics(prev => prev.filter(s => !subs.includes(s)))
              } else {
                setSelectedSubtopics(prev => [...new Set([...prev, ...subs])])
              }
            }

            const toggleSub = (sub) => {
              if (allMode) {
                // Was "all" — now select everything except this one
                const allSubs = Object.keys(topicGroups).flatMap(t => questions.filter(q => q.topic === t).map(q => q.subtopic).filter((v,i,a) => a.indexOf(v) === i))
                setSelectedSubtopics(allSubs.filter(s => s !== sub))
              } else {
                setSelectedSubtopics(prev => prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub])
              }
            }

            return (
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Filter by topic</span>
                  {!allMode && (
                    <button onClick={() => setSelectedSubtopics([])}
                      style={{ fontSize: 11, color: GOLD, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_B }}>
                      Clear filter
                    </button>
                  )}
                </div>

                {/* All row */}
                <div onClick={() => setSelectedSubtopics([])}
                  style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', cursor: 'pointer', background: allMode ? 'rgba(241,190,67,0.07)' : 'transparent', borderBottom: `1px solid ${t.border}` }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${allMode ? GOLD : t.border}`, background: allMode ? GOLD : 'transparent', marginRight: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {allMode && <span style={{ fontSize: 10, color: '#0c1037', fontWeight: 800 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: allMode ? GOLD : t.text, flex: 1 }}>All Topics</span>
                  <span style={{ fontSize: 12, color: t.textMuted }}>
                    {Object.values(struggleMap).filter(s => s.attempts > 0).length} / {questions.length}
                  </span>
                </div>

                {/* Topic rows with subtopic children */}
                <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                  {Object.entries(topicGroups).map(([topic, tg]) => {
                    const subs = questions.filter(q => q.topic === topic).map(q => q.subtopic).filter((v,i,a) => a.indexOf(v) === i)
                    const topicSel = allMode || subs.every(s => selectedSubtopics.includes(s))
                    const topicPartial = !allMode && subs.some(s => selectedSubtopics.includes(s)) && !topicSel

                    return (
                      <div key={topic}>
                        {/* Topic row */}
                        <div onClick={() => toggleTopic(topic)}
                          style={{ display: 'flex', alignItems: 'center', padding: '9px 16px', cursor: 'pointer', borderBottom: `1px solid ${t.border}` }}>
                          <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${topicSel ? GOLD : topicPartial ? GOLD : t.border}`, background: topicSel ? GOLD : 'transparent', marginRight: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {topicSel && <span style={{ fontSize: 10, color: '#0c1037', fontWeight: 800 }}>✓</span>}
                            {topicPartial && <span style={{ fontSize: 10, color: GOLD, fontWeight: 800 }}>−</span>}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: topicSel ? t.text : t.textMuted, flex: 1 }}>{topic}</span>
                          <span style={{ fontSize: 12, color: t.textMuted }}>{tg.attempted} / {tg.total}</span>
                        </div>

                        {/* Subtopic rows */}
                        {subs.map(sub => {
                          const sg = subtopicGroups[sub] || { attempted: 0, total: 0, wrong: 0 }
                          const subSel = allMode || selectedSubtopics.includes(sub)
                          const errRate = sg.attempted > 0 ? Math.round((sg.wrong / sg.attempted) * 100) : null
                          return (
                            <div key={sub} onClick={() => toggleSub(sub)}
                              style={{ display: 'flex', alignItems: 'center', padding: '7px 16px 7px 40px', cursor: 'pointer', borderBottom: `1px solid ${t.border}`, background: subSel ? 'rgba(241,190,67,0.04)' : 'transparent' }}>
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
            )
          })()}

          {/* Mobile-only cards — shown below session card on small screens */}
          <div className="hs-mobile-cards">
            <PriorityCard />
            <StatsCard />
            <SprintCard />
          </div>

        </div>

        {/* ── RIGHT PANEL — desktop only ── */}
        <div className="hs-right">
          <PriorityCard />
          <StatsCard />
          <SprintCard />
        </div>

      </div>
    </div>
  )
}
