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
    <div style={{ color: t.text, fontFamily: FONT_B, animation: 'hs-fadeUp 0.3s ease' }}>
      <style>{`
        @keyframes hs-fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .hs-wrap  { display: flex; align-items: flex-start; }
        .hs-main  { flex: 1; min-width: 0; padding: 32px 32px; }
        .hs-right { width: 260px; flex-shrink: 0; padding: 32px 28px 32px 0; display: flex; flex-direction: column; gap: 14px; }
        .hs-mobile-cards { display: none; flex-direction: column; gap: 14px; margin-top: 14px; }
        @media (max-width: 860px) {
          .hs-wrap  { display: block; }
          .hs-main  { padding: 18px 14px; }
          .hs-right { display: none; }
          .hs-mobile-cards { display: flex; }
        }
      `}</style>

      <div className="hs-wrap">

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

            {/* Subtopic picker */}
            <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Topics</div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>
                    {selectedSubtopics.length === 0 ? 'All topics selected' : `${selectedSubtopics.length} topic${selectedSubtopics.length !== 1 ? 's' : ''} selected`}
                  </div>
                </div>
                <button onClick={() => setShowSubtopicPicker(p => !p)}
                  style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: `1px solid ${t.border}`, background: showSubtopicPicker ? GOLD : 'transparent', color: showSubtopicPicker ? '#0c1037' : t.textMuted, cursor: 'pointer', fontFamily: FONT_B, transition: 'all 0.15s' }}>
                  {showSubtopicPicker ? 'Done' : 'Filter'}
                </button>
              </div>

              {showSubtopicPicker ? (
                // Subtopic picker — grouped by topic
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 280, overflowY: 'auto' }}>
                  {/* Select all / clear */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setSelectedSubtopics([])}
                      style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: `1px solid ${t.border}`, background: selectedSubtopics.length === 0 ? GOLD : 'transparent', color: selectedSubtopics.length === 0 ? '#0c1037' : t.textMuted, cursor: 'pointer', fontFamily: FONT_B }}>
                      All topics
                    </button>
                    {Object.keys(topicGroups).map(topic => (
                      <button key={topic} onClick={() => {
                        const subs = questions.filter(q => q.topic === topic).map(q => q.subtopic).filter((v,i,a) => a.indexOf(v) === i)
                        setSelectedSubtopics(subs)
                      }}
                        style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, cursor: 'pointer', fontFamily: FONT_B, whiteSpace: 'nowrap' }}>
                        {topic}
                      </button>
                    ))}
                  </div>
                  {/* Individual subtopics */}
                  {Object.entries(topicGroups).map(([topic, _]) => (
                    <div key={topic}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{topic}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {questions.filter(q => q.topic === topic).map(q => q.subtopic).filter((v,i,a) => a.indexOf(v) === i).map(sub => {
                          const active = selectedSubtopics.includes(sub)
                          const sg = subtopicGroups[sub] || {}
                          const errRate = sg.attempted > 0 ? Math.round((sg.wrong / sg.attempted) * 100) : null
                          return (
                            <button key={sub} onClick={() => setSelectedSubtopics(prev =>
                              prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]
                            )}
                              style={{ fontSize: 11, fontWeight: active ? 700 : 500, padding: '5px 10px', borderRadius: 8, border: `1px solid ${active ? GOLD : t.border}`, background: active ? 'rgba(241,190,67,0.12)' : t.bgCard, color: active ? GOLD : t.textMuted, cursor: 'pointer', fontFamily: FONT_B, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.12s' }}>
                              {sub}
                              {errRate !== null && errRate > 0 && <span style={{ fontSize: 9, color: active ? '#f87171' : t.danger }}>⚡{errRate}%</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Compact topic progress view
                <div>
                  {Object.entries(topicGroups).map(([topic, s]) => {
                    const pct    = s.total > 0 ? s.attempted / s.total : 0
                    const acc    = s.attempted > 0 ? s.correct / s.attempted : null
                    const dotCol = acc === null ? t.textFaint : acc > 0.7 ? t.success : acc > 0.4 ? GOLD : t.danger
                    return (
                      <div key={topic} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px' }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: dotCol }} />
                        <span style={{ fontSize: 13, color: t.textSub, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic}</span>
                        <div style={{ width: 56, background: t.border, borderRadius: 3, height: 3, overflow: 'hidden', flexShrink: 0 }}>
                          <div style={{ width: `${pct*100}%`, height: '100%', background: GOLD }} />
                        </div>
                        <span style={{ fontSize: 11, color: t.textFaint, width: 38, textAlign: 'right', flexShrink: 0 }}>{s.attempted}/{s.total}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

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
