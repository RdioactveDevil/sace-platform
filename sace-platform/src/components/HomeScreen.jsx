import { THEMES } from '../lib/theme'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'

export default function HomeScreen({ profile, struggleMap, questions, onStartSession, subject, theme }) {
  const t = THEMES[theme]

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

  const totalAttempts = Object.values(struggleMap).reduce((s, v) => s + v.attempts, 0)
  const totalWrong    = Object.values(struggleMap).reduce((s, v) => s + v.wrong, 0)
  const accuracy      = totalAttempts > 0 ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100) : 0
  const days          = ['M','T','W','T','F','S','S']
  const activity      = [0, 0, 0, 0, totalAttempts, 0, 0]
  const maxAct        = Math.max(...activity, 1)

  const card = {
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: 16,
    boxShadow: theme === 'light' ? '0 2px 16px rgba(12,16,55,0.07)' : '0 2px 12px rgba(0,0,0,0.3)',
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: t.bg, fontFamily: FONT_B }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, padding: '44px 48px', animation: 'fadeUp 0.4s ease', minWidth: 0 }}>

        <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 4, color: t.text }}>Question Bank</h1>
        <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 28 }}>
          {subject?.stage || 'Stage 1'} · {subject?.name || 'Chemistry'} · {questions.length} questions
        </div>

        {/* Activity graph */}
        <div style={{ ...card, padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['Week','Month','All'].map((tab, i) => (
                <button key={tab} style={{ padding: '6px 16px', borderRadius: 20, border: 'none', background: i === 0 ? GOLD : 'transparent', color: i === 0 ? '#0c1037' : t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>{tab}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 32 }}>
              {[{val: totalAttempts, label: 'answered'}, {val: `${accuracy}%`, label: 'correct'}, {val: profile.streak || 0, label: 'streak'}].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: t.text, lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
            {days.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ width: '100%', background: activity[i] > 0 ? GOLD : t.border, borderRadius: '4px 4px 0 0', height: activity[i] > 0 ? `${Math.max((activity[i]/maxAct)*50,10)}px` : '4px', transition: 'height 0.6s' }} />
                <div style={{ fontSize: 11, color: i === 4 ? GOLD : t.textFaint, fontWeight: i === 4 ? 700 : 400 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* New session */}
        <div style={{ ...card, padding: '20px 24px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: t.text }}>New Session</div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: t.textMuted, flex: 1 }}>All Topics</span>
              <span style={{ fontSize: 12, color: t.textFaint }}>{questions.length} questions</span>
            </div>
            {Object.entries(topicGroups).map(([topic, s]) => {
              const pctDone = s.total > 0 ? s.attempted / s.total : 0
              const acc     = s.attempted > 0 ? s.correct / s.attempted : null
              const dotCol  = acc === null ? t.textFaint : acc > 0.7 ? t.success : acc > 0.4 ? GOLD : t.danger
              return (
                <div key={topic} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px', borderRadius: 9, cursor: 'default' }}
                  onMouseEnter={e => e.currentTarget.style.background = t.bgHover}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: dotCol }} />
                  <span style={{ fontSize: 14, color: t.textSub, flex: 1 }}>{topic}</span>
                  <div style={{ width: 80, background: t.border, borderRadius: 3, height: 4, overflow: 'hidden', flexShrink: 0 }}>
                    <div style={{ width: `${pctDone*100}%`, height: '100%', background: GOLD }} />
                  </div>
                  <span style={{ fontSize: 12, color: t.textFaint, width: 40, textAlign: 'right', flexShrink: 0 }}>{s.attempted}/{s.total}</span>
                </div>
              )
            })}
          </div>

          {topStruggles.length > 0 && (
            <div style={{ background: theme === 'dark' ? 'rgba(239,68,68,0.06)' : '#fff5f5', border: `1px solid ${theme === 'dark' ? 'rgba(239,68,68,0.15)' : 'rgba(220,38,38,0.15)'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: t.danger, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>⚡ Priority Queue</div>
              {topStruggles.slice(0, 3).map((s, i) => (
                <div key={s.q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 2 ? `1px solid ${t.border}` : 'none' }}>
                  <span style={{ fontSize: 14, color: t.textSub }}>{s.q.subtopic}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.danger }}>{Math.round(s.rate*100)}% error</span>
                </div>
              ))}
            </div>
          )}

          <button onClick={onStartSession} style={{ width: '100%', padding: '16px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: '#0c1037', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B, boxShadow: `0 6px 24px rgba(241,190,67,0.4)`, transition: 'all 0.15s' }}>
            Start Adaptive Session →
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ width: 300, flexShrink: 0, padding: '44px 32px 44px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {topStruggles.length > 0 && (
          <div style={{ ...card, padding: '20px 20px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 3 }}>Priority Topics</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 14 }}>Hit first in your next session</div>
            {topStruggles.map((s, i) => (
              <div key={s.q.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${t.border}` }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${t.danger}15`, border: `1px solid ${t.danger}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: t.danger, flexShrink: 0 }}>{i+1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.q.subtopic}</div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>{s.q.topic}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.danger, flexShrink: 0 }}>{Math.round(s.rate*100)}%</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ ...card, padding: '20px 20px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 16 }}>Your Stats</div>
          {[
            { label: 'Total XP',       val: profile.xp.toLocaleString(), color: GOLD },
            { label: 'Best streak',    val: `${profile.best_streak || 0} days 🔥`, color: GOLD },
            { label: 'Questions done', val: totalAttempts, color: t.text },
            { label: 'Accuracy',       val: `${accuracy}%`, color: accuracy > 70 ? t.success : accuracy > 40 ? GOLD : t.danger },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${t.border}` }}>
              <span style={{ fontSize: 14, color: t.textMuted }}>{s.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.val}</span>
            </div>
          ))}
        </div>

        <div style={{ ...card, padding: '20px 20px', background: theme === 'dark' ? 'rgba(241,190,67,0.05)' : '#fff', border: `1px solid ${theme === 'dark' ? 'rgba(241,190,67,0.15)' : t.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: theme === 'dark' ? GOLD : '#0c1037', marginBottom: 6 }}>📅 SACE Exam Sprint</div>
          <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 12 }}>Set a study goal to track your daily progress towards your target ATAR.</div>
          <button style={{ width: '100%', padding: '10px', borderRadius: 8, border: `1px solid ${theme === 'dark' ? 'rgba(241,190,67,0.25)' : t.border}`, background: 'transparent', color: theme === 'dark' ? GOLD : '#0c1037', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
            Set Study Goal →
          </button>
        </div>
      </div>
    </div>
  )
}