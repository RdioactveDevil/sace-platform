import { useState, useEffect } from 'react'
import { THEMES } from '../lib/theme'
import MathText from './MathText'
import { supabase } from '../lib/supabase'
import { groupAnswersIntoSessions } from '../lib/sessionHistory'
import { Zap, GraduationCap, Trophy, TrendingUp, Dumbbell, Gamepad2, Music } from 'lucide-react'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

function timeAgo(date) {
  const s = Math.floor((new Date() - new Date(date)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// The most common subject among a session's questions, to load its question bank.
function sessionSubject(answers) {
  const counts = {}
  for (const a of answers) if (a.subject) counts[a.subject] = (counts[a.subject] || 0) + 1
  return Object.keys(counts).sort((x, y) => counts[y] - counts[x])[0] || null
}

export default function HistoryScreen({ profile, theme, embedded, active = true, onStartSession }) {
  const t = THEMES[theme]
  const [quizSessions, setQuizSessions] = useState([])
  const [learnSessions, setLearnSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('quiz')
  const [expanded, setExpanded] = useState(null)

  // Reload each time History is opened, so a session just finished is listed.
  useEffect(() => {
    if (active) loadHistory()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, active])

  const loadHistory = async () => {
    setLoading(true)

    const { data: answers } = await supabase
      .from('answer_log')
      .select('*')
      .eq('user_id', profile.id)
      .order('answered_at', { ascending: false })
      .limit(300)

    // Fetch question text for all unique question IDs in one query
    const qIds = [...new Set((answers || []).map(a => a.question_id).filter(Boolean))]
    let questionMap = {}
    if (qIds.length > 0) {
      const { data: qs } = await supabase
        .from('questions')
        .select('id, question, topic, subtopic, subject')
        .in('id', qIds)
      ;(qs || []).forEach(q => { questionMap[q.id] = q })
    }

    ;(answers || []).forEach((a) => {
      const q = questionMap[a.question_id]
      a.question_text = q?.question || null
      a.topic        = q?.topic    || null
      a.subtopic     = q?.subtopic || null
      a.subject      = q?.subject  || null
    })

    setQuizSessions(
      groupAnswersIntoSessions(answers)
        .slice(0, 20)
        .map(s => ({ ...s, subject: sessionSubject(s.answers) }))
    )

    const { data: learns } = await supabase
      .from('learn_sessions')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20)

    setLearnSessions(learns || [])
    setLoading(false)
  }

  // Go back over a past session's questions as practice (the 'review' mode).
  const redo = (session, ids) =>
    onStartSession({ mode: 'review', subtopics: [], subject: session.subject, reviewIds: ids })

  const card = {
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: 14,
    boxShadow: theme === 'light' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
  }

  return (
    <div style={{ height: embedded ? '100%' : '100vh', minHeight: 0, background: embedded ? 'transparent' : t.bg, color: t.text, fontFamily: FONT_B, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .hist-scroll { flex: 1; min-height: 0; overflow-y: auto; }
        .hist-inner { padding: 28px 32px 32px; animation: fadeUp 0.3s ease; }
        @media (max-width: 860px) { .hist-inner { padding: 18px 14px 22px; } }
      `}</style>

      <div className="hist-scroll">
        <div className="hist-inner">
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Activity</div>
          <h1 style={{ fontSize: 26, fontFamily: FONT_D, fontWeight: 400, letterSpacing: 1.5, margin: 0, color: t.text }}>History</h1>
          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 6, marginBottom: 22 }}>Review your quiz sessions and Titan AI chats in one place.</div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
            {[
              { id: 'quiz', icon: Zap, label: 'Quiz Sessions', count: quizSessions.length },
              { id: 'learn', icon: GraduationCap, label: 'Titan AI Chats', count: learnSessions.length },
            ].map((tb) => (
              <button key={tb.id} onClick={() => setTab(tb.id)} style={{ padding: '8px 18px', borderRadius: 999, border: `1px solid ${tab === tb.id ? GOLD : t.border}`, background: tab === tb.id ? 'rgba(241,190,67,0.12)' : 'transparent', color: tab === tb.id ? GOLD : t.textMuted, fontSize: 13, fontWeight: tab === tb.id ? 700 : 600, cursor: 'pointer', fontFamily: FONT_B, display: 'flex', alignItems: 'center', gap: 6 }}>
                <tb.icon size={15} aria-hidden="true" />
                {tb.label}
                {tb.count > 0 && <span style={{ background: tab === tb.id ? GOLD : t.border, color: tab === tb.id ? '#0c1037' : t.textMuted, fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 999 }}>{tb.count}</span>}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ color: t.textMuted, padding: '40px 0', textAlign: 'center' }}>Loading…</div>
          ) : tab === 'quiz' ? (
            quizSessions.length === 0 ? (
              <div style={{ ...card, padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: GOLD }}><Zap size={36} aria-hidden="true" /></div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 6 }}>No quiz sessions yet</div>
                <div style={{ fontSize: 13, color: t.textMuted }}>Complete a session in Question Bank to see your history here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {quizSessions.map((session, i) => {
                  const accuracy = session.total > 0 ? Math.round((session.correct / session.total) * 100) : 0
                  const isOpen = expanded === session.id
                  const accColor = accuracy >= 70 ? t.success : accuracy >= 40 ? GOLD : t.danger
                  const AccIcon = accuracy >= 70 ? Trophy : accuracy >= 40 ? TrendingUp : Dumbbell
                  return (
                    <div key={session.id} style={{ ...card, overflow: 'hidden' }}>
                      <div onClick={() => setExpanded(isOpen ? null : session.id)} style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${accColor}15`, border: `1px solid ${accColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, color: accColor }}>
                          <AccIcon size={20} aria-hidden="true" />
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
                      {onStartSession && session.allIds.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 18px 14px' }}>
                          <button
                            onClick={() => redo(session, session.allIds)}
                            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}
                          >
                            Redo all {session.allIds.length}
                          </button>
                          {session.wrongIds.length > 0 && (
                            <button
                              onClick={() => redo(session, session.wrongIds)}
                              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#ef4444,#f87171)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}
                            >
                              Redo {session.wrongIds.length} wrong
                            </button>
                          )}
                        </div>
                      )}
                      {isOpen && (
                        <div style={{ borderTop: `1px solid ${t.border}`, padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {session.answers.slice(0, 15).map((a, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: j < Math.min(session.answers.length, 15) - 1 ? `1px solid ${t.border}` : 'none' }}>
                              <div style={{ width: 20, height: 20, borderRadius: '50%', background: a.correct ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: a.correct ? t.success : t.danger, flexShrink: 0 }}>{a.correct ? '✓' : '✗'}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.question_text ? <MathText text={a.question_text} style={{ whiteSpace: 'nowrap' }} /> : `Question ${j + 1}`}</div>
                                {a.subtopic && <div style={{ fontSize: 10, color: t.textMuted, marginTop: 1 }}>{a.subtopic}</div>}
                              </div>
                              <div style={{ fontSize: 11, color: a.correct ? t.success : t.danger, fontWeight: 600, flexShrink: 0 }}>{a.correct ? '+XP' : 'Wrong'}</div>
                            </div>
                          ))}
                          {session.answers.length > 15 && <div style={{ fontSize: 12, color: t.textMuted, textAlign: 'center', paddingTop: 6 }}>+{session.answers.length - 15} more</div>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          ) : learnSessions.length === 0 ? (
            <div style={{ ...card, padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: GOLD }}><GraduationCap size={36} aria-hidden="true" /></div>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 6 }}>No Titan AI sessions yet</div>
              <div style={{ fontSize: 13, color: t.textMuted }}>Start a lesson in Learn to see your chat history here.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {learnSessions.map((session) => {
                const isOpen = expanded === `learn-${session.id}`
                const msgs = Array.isArray(session.messages) ? session.messages : []
                const ModeIcon = session.interests === 'gaming' ? Gamepad2 : session.interests === 'music' ? Music : Trophy
                return (
                  <div key={session.id} style={{ ...card, overflow: 'hidden' }}>
                    <div onClick={() => setExpanded(isOpen ? null : `learn-${session.id}`)} style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(241,190,67,0.12)', border: '1px solid rgba(241,190,67,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, color: GOLD }}><GraduationCap size={20} aria-hidden="true" /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.topic}</div>
                        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{timeAgo(session.created_at)} · {msgs.length} messages · <ModeIcon size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {session.interests} mode</div>
                      </div>
                      <div style={{ color: t.textMuted, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', fontSize: 11 }}>▼</div>
                    </div>
                    {isOpen && msgs.length > 0 && (
                      <div style={{ borderTop: `1px solid ${t.border}`, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 400, overflowY: 'auto' }}>
                        {msgs.map((msg, j) => {
                          const blocks = Array.isArray(msg.content) ? msg.content : null
                          const imageBlocks = blocks ? blocks.filter(b => b && b.type === 'image' && b.source?.data) : []
                          const textOut = blocks
                            ? blocks.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n').trim()
                            : (typeof msg.content === 'string' ? msg.content : '')
                          return (
                            <div key={j} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                              <div style={{ maxWidth: '80%', padding: '8px 12px', borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px', background: msg.role === 'user' ? `linear-gradient(135deg, ${GOLD}, ${GOLDL})` : t.bgHover, color: msg.role === 'user' ? '#0c1037' : t.text, fontSize: 13, lineHeight: 1.6, border: msg.role === 'user' ? 'none' : `1px solid ${t.border}` }}>
                                {imageBlocks.length > 0 && (
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: textOut ? 6 : 0 }}>
                                    {imageBlocks.map((b, k) => (
                                      <img
                                        key={k}
                                        src={`data:${b.source.media_type};base64,${b.source.data}`}
                                        alt="attached"
                                        style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6, display: 'block', border: `1px solid ${t.border}` }}
                                      />
                                    ))}
                                  </div>
                                )}
                                {textOut}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
