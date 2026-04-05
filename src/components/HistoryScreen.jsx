import { useState, useEffect } from 'react'
import { THEMES } from '../lib/theme'
import { supabase } from '../lib/supabase'

const GOLD  = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

function timeAgo(date) {
  const s = Math.floor((new Date() - new Date(date)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  if (s < 604800) return `${Math.floor(s/86400)}d ago`
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function HistoryScreen({ profile, theme, embedded }) {
  const t = THEMES[theme]
  const [quizSessions, setQuizSessions] = useState([])
  const [learnSessions, setLearnSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('quiz')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    loadHistory()
  }, [profile.id])

  const loadHistory = async () => {
    setLoading(true)

    // Quiz sessions from answer_log
    const { data: answers } = await supabase
      .from('answer_log')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(300)

    // Group into 30-min sessions
    const sessionMap = {}
    ;(answers || []).forEach(a => {
      const bucket = Math.floor(new Date(a.created_at).getTime() / (30 * 60 * 1000))
      if (!sessionMap[bucket]) sessionMap[bucket] = { id: String(bucket), date: a.created_at, answers: [], correct: 0, total: 0 }
      sessionMap[bucket].answers.push(a)
      sessionMap[bucket].total++
      if (a.correct) sessionMap[bucket].correct++
    })

    setQuizSessions(
      Object.values(sessionMap)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 20)
    )

    // Learn sessions from Supabase
    const { data: learns } = await supabase
      .from('learn_sessions')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20)

    setLearnSessions(learns || [])
    setLoading(false)
  }

  const card = {
    background: t.bgCard, border: `1px solid ${t.border}`,
    borderRadius: 14, boxShadow: theme === 'light' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
  }

  return (
    <div style={{ minHeight: embedded ? 'auto' : '100vh', background: embedded ? 'transparent' : t.bg, color: t.text, fontFamily: FONT_B }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{ padding: '28px 32px', animation: 'fadeUp 0.4s ease' }}>
        <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Activity</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 20, color: t.text }}>History</h1>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {[
            { id: 'quiz',  label: '⚡ Quiz Sessions',   count: quizSessions.length },
            { id: 'learn', label: '🎓 Titan AI Chats',  count: learnSessions.length },
          ].map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)} style={{ padding: '8px 18px', borderRadius: 20, border: `1px solid ${tab === tb.id ? GOLD : t.border}`, background: tab === tb.id ? 'rgba(241,190,67,0.12)' : 'transparent', color: tab === tb.id ? GOLD : t.textMuted, fontSize: 13, fontWeight: tab === tb.id ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6 }}>
              {tb.label}
              {tb.count > 0 && <span style={{ background: tab === tb.id ? GOLD : t.border, color: tab === tb.id ? '#0c1037' : t.textMuted, fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10 }}>{tb.count}</span>}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: t.textMuted, padding: '40px 0', textAlign: 'center' }}>Loading…</div>

        ) : tab === 'quiz' ? (
          quizSessions.length === 0 ? (
            <div style={{ ...card, padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚡</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 6 }}>No quiz sessions yet</div>
              <div style={{ fontSize: 13, color: t.textMuted }}>Complete a session in Question Bank to see your history here.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {quizSessions.map((session, i) => {
                const accuracy = session.total > 0 ? Math.round((session.correct / session.total) * 100) : 0
                const isOpen   = expanded === session.id
                const accColor = accuracy >= 70 ? t.success : accuracy >= 40 ? GOLD : t.danger
                return (
                  <div key={session.id} style={{ ...card, overflow: 'hidden' }}>
                    <div onClick={() => setExpanded(isOpen ? null : session.id)}
                      style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${accColor}15`, border: `1px solid ${accColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                        {accuracy >= 70 ? '🏆' : accuracy >= 40 ? '📈' : '💪'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Quiz Session #{quizSessions.length - i}</div>
                        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{formatDate(session.date)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: accColor }}>{accuracy}%</div>
                          <div style={{ fontSize: 10, color: t.textMuted }}>accuracy</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: t.text }}>{session.total}</div>
                          <div style={{ fontSize: 10, color: t.textMuted }}>questions</div>
                        </div>
                        <div style={{ color: t.textMuted, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', fontSize: 11 }}>▼</div>
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ borderTop: `1px solid ${t.border}`, padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {session.answers.slice(0, 15).map((a, j) => (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: j < Math.min(session.answers.length, 15) - 1 ? `1px solid ${t.border}` : 'none' }}>
                            <div style={{ width: 20, height: 20, borderRadius: '50%', background: a.correct ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: a.correct ? t.success : t.danger, flexShrink: 0 }}>
                              {a.correct ? '✓' : '✗'}
                            </div>
                            <div style={{ flex: 1, fontSize: 12, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {a.question_text || `Question ${j + 1}`}
                            </div>
                            <div style={{ fontSize: 11, color: a.correct ? t.success : t.danger, fontWeight: 600, flexShrink: 0 }}>
                              {a.correct ? '+XP' : 'Wrong'}
                            </div>
                          </div>
                        ))}
                        {session.answers.length > 15 && (
                          <div style={{ fontSize: 12, color: t.textMuted, textAlign: 'center', paddingTop: 6 }}>
                            +{session.answers.length - 15} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )

        ) : (
          learnSessions.length === 0 ? (
            <div style={{ ...card, padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎓</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 6 }}>No Titan AI sessions yet</div>
              <div style={{ fontSize: 13, color: t.textMuted }}>Start a lesson in Learn to see your chat history here.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {learnSessions.map((session, i) => {
                const isOpen   = expanded === `learn-${session.id}`
                const msgs     = Array.isArray(session.messages) ? session.messages : []
                const modeIcon = session.interests === 'gaming' ? '🎮' : session.interests === 'music' ? '🎵' : '🏈'
                return (
                  <div key={session.id} style={{ ...card, overflow: 'hidden' }}>
                    <div onClick={() => setExpanded(isOpen ? null : `learn-${session.id}`)}
                      style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(241,190,67,0.12)', border: '1px solid rgba(241,190,67,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🎓</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.topic}</div>
                        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                          {timeAgo(session.created_at)} · {msgs.length} messages · {modeIcon} {session.interests} mode
                        </div>
                      </div>
                      <div style={{ color: t.textMuted, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', fontSize: 11 }}>▼</div>
                    </div>
                    {isOpen && msgs.length > 0 && (
                      <div style={{ borderTop: `1px solid ${t.border}`, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 400, overflowY: 'auto' }}>
                        {msgs.map((msg, j) => (
                          <div key={j} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                            <div style={{ maxWidth: '80%', padding: '8px 12px', borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px', background: msg.role === 'user' ? `linear-gradient(135deg,${GOLD},${GOLDL})` : t.bgHover, color: msg.role === 'user' ? '#0c1037' : t.text, fontSize: 13, lineHeight: 1.6, border: msg.role === 'user' ? 'none' : `1px solid ${t.border}` }}>
                              {msg.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}
