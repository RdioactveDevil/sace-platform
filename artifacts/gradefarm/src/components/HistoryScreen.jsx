import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { THEMES } from '../lib/theme'
import MathText from './MathText'
import { supabase } from '../lib/supabase'
import { fetchMyExamAttempts } from '../lib/db'
import { fetchLessons } from '../lib/learnStore'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
// Answers less than this far apart count as one practice session.
const SESSION_GAP_MS = 30 * 60 * 1000

function dayLabel(ms) {
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(ms).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
}

const timeOf = (ms) => new Date(ms).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })

/**
 * Everything the student has done, newest first and grouped by day: practice
 * sessions (from their answers), timed papers, guided lessons and Titan chats.
 */
export default function HistoryScreen({ profile, subject, questions = [], theme, embedded, onOpenChat, onOpenLesson }) {
  const t = THEMES[theme]
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const subjectName = subject?.name || ''
  const questionIds = useMemo(() => new Set(questions.map(q => q.id)), [questions])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const [answersRes, chatsRes, lessons, exams] = await Promise.all([
        supabase.from('answer_log').select('answered_at, correct, question_id').eq('user_id', profile.id).order('answered_at', { ascending: false }).limit(400),
        supabase.from('learn_sessions').select('*').eq('user_id', profile.id).order('updated_at', { ascending: false }).limit(30),
        fetchLessons(profile.id, subjectName),
        fetchMyExamAttempts(profile.id, 20).catch(() => []),
      ])

      // Question text for the answers, in one query.
      const answers = (answersRes.data || []).filter(a => !questionIds.size || questionIds.has(a.question_id))
      const qIds = [...new Set(answers.map(a => a.question_id).filter(Boolean))]
      const questionMap = {}
      if (qIds.length) {
        const { data: qs } = await supabase.from('questions').select('id, question, topic, subtopic').in('id', qIds)
        ;(qs || []).forEach(q => { questionMap[q.id] = q })
      }

      // Group answers into sessions: a new session starts after a 30-minute gap.
      const sessions = []
      answers.forEach(a => {
        const at = Date.parse(a.answered_at)
        const q = questionMap[a.question_id]
        const last = sessions[sessions.length - 1]
        if (!last || last.start - at > SESSION_GAP_MS) sessions.push({ start: at, end: at, answers: [] })
        const s = sessions[sessions.length - 1]
        s.start = at
        s.answers.push({ ...a, question: q?.question, subtopic: q?.subtopic || q?.topic })
      })
      const practice = sessions.map(s => {
        const counts = {}
        s.answers.forEach(a => { if (a.subtopic) counts[a.subtopic] = (counts[a.subtopic] || 0) + 1 })
        const topics = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => k)
        const correct = s.answers.filter(a => a.correct).length
        const minutes = Math.max(1, Math.round((s.end - s.start) / 60000))
        return {
          key: `practice-${s.start}`, kind: 'Practice', group: 'practice', at: s.end,
          title: topics.length ? `${topics[0]}${topics.length > 1 ? ` + ${topics.length - 1} more` : ''}` : 'Practice',
          sub: `${s.answers.length} question${s.answers.length !== 1 ? 's' : ''} · ${minutes} min`,
          score: { correct, total: s.answers.length }, answers: [...s.answers].reverse(),
        }
      })
      const examItems = (exams || []).map(e => ({
        key: `exam-${e.id}`, kind: 'Exam', group: 'practice', at: Date.parse(e.created_at),
        title: e.title || 'Practice paper', sub: `${e.total_questions} questions`, score: { correct: e.total_correct, total: e.total_questions },
      }))
      const lessonItems = Object.values(lessons || {}).map(l => ({
        key: `lesson-${l.topic}`, kind: 'Lesson', group: 'learn', at: l.updatedAt || 0, title: l.topic,
        sub: l.finishedAt ? `Finished · ${(l.answers || []).filter(Boolean).length} of ${(l.answers || []).length} check questions` : `Step ${Math.min(l.step + 1, 4)} of 4`,
        action: l.finishedAt ? 'Review' : 'Resume', run: () => onOpenLesson?.(l.topic),
      }))
      const chatItems = (chatsRes.data || [])
        .filter(c => !c.subject || !subjectName || c.subject === subjectName)
        .map(c => {
          const msgs = Array.isArray(c.messages) ? c.messages : []
          const firstUser = msgs.find(m => m.role === 'user')
          const firstText = typeof firstUser?.content === 'string' ? firstUser.content : ''
          return {
            key: `chat-${c.id}`, kind: 'Chat', group: 'learn', at: Date.parse(c.updated_at || c.created_at),
            title: c.title || c.topic || firstText.slice(0, 80) || 'Chat with Titan', sub: `${msgs.length} message${msgs.length !== 1 ? 's' : ''}`,
            action: 'Open', run: () => onOpenChat?.(c.id),
          }
        })

      if (!cancelled) {
        setItems([...practice, ...examItems, ...lessonItems, ...chatItems].filter(i => i.at).sort((a, b) => b.at - a.at))
        setLoading(false)
      }
    }
    load().catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [profile.id, subjectName, questionIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = items.filter(i => filter === 'all' || i.group === filter)
  const byDay = []
  shown.forEach(i => {
    const label = dayLabel(i.at)
    if (!byDay.length || byDay[byDay.length - 1].label !== label) byDay.push({ label, items: [] })
    byDay[byDay.length - 1].items.push(i)
  })

  const toneOf = (pct) => (pct < 40 ? t.danger : pct < 70 ? t.goldText : t.success)
  const segOn = theme === 'dark' ? { background: t.text, color: t.bg } : { background: '#0c1037', color: '#fff' }
  const linkBtn = { border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: FONT_B, fontSize: 13, fontWeight: 700, color: t.text, textDecoration: 'underline', textDecorationColor: GOLD, textDecorationThickness: 2, textUnderlineOffset: 4 }

  return (
    <div style={{ height: embedded ? '100%' : '100vh', minHeight: 0, background: embedded ? 'transparent' : t.bg, color: t.text, fontFamily: FONT_B, overflowY: 'auto' }}>
      <style>{`
        .hi-inner { max-width: 900px; margin: 0 auto; padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 14px; }
        .hi-row { box-sizing: border-box; display: grid; grid-template-columns: 74px minmax(0, 1fr) auto; gap: 14px; align-items: center; width: 100%; padding: 11px 14px; border: none; background: transparent; font-family: inherit; text-align: left; color: inherit; }
        .hi-row:focus-visible, .hi-inner button:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 2px; }
        @media (max-width: 860px) { .hi-inner { padding: 18px 14px 28px; } .hi-row { grid-template-columns: minmax(0, 1fr) auto; } .hi-kind { display: none; } }
      `}</style>
      <div className="hi-inner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: t.textMuted }}>Practice sessions, lessons and chats, newest first</span>
          <div role="group" aria-label="Show" style={{ display: 'inline-flex', border: `1px solid ${t.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {[['all', 'All'], ['practice', 'Practice'], ['learn', 'Learn']].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
                style={{ padding: '6px 13px', border: 'none', fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', ...(filter === id ? segOn : { background: 'transparent', color: t.textMuted }) }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: t.textMuted, padding: '24px 0' }}>Loading your history…</div>
        ) : byDay.length === 0 ? (
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: '28px 20px', textAlign: 'center', fontSize: 13, color: t.textMuted }}>
            {filter === 'learn' ? 'Lessons and chats with Titan will show here.' : 'Finish a practice session and it will show here.'}
          </div>
        ) : byDay.map(day => (
          <div key={day.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: t.textFaint, padding: '6px 2px 0' }}>{day.label}</div>
            {day.items.map(item => {
              const open = expanded === item.key
              const pct = item.score?.total ? Math.round((item.score.correct / item.score.total) * 100) : null
              const expandable = !!item.answers
              return (
                <div key={item.key} style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div className="hi-row" style={{ cursor: expandable ? 'pointer' : 'default' }} {...(expandable ? { role: 'button', tabIndex: 0, 'aria-expanded': open, onClick: () => setExpanded(open ? null : item.key), onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(open ? null : item.key) } } } : {})}>
                    <span className="hi-kind" style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>{item.kind}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                      <span style={{ display: 'block', fontSize: 12, color: t.textFaint }}>{timeOf(item.at)} · {item.sub}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {pct != null && <span style={{ fontSize: 14, fontWeight: 800, color: toneOf(pct), fontVariantNumeric: 'tabular-nums' }}>{item.score.correct}/{item.score.total}</span>}
                      {item.run && <button type="button" style={linkBtn} onClick={item.run}>{item.action}</button>}
                      {expandable && <span aria-hidden="true" style={{ display: 'flex', color: t.textFaint }}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>}
                    </span>
                  </div>
                  {open && (
                    <div style={{ borderTop: `1px solid ${t.border}`, padding: '4px 14px 10px' }}>
                      {item.answers.map((a, j) => (
                        <div key={j} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', gap: 10, padding: '8px 0', borderTop: j > 0 ? `1px solid ${t.border}` : 'none', alignItems: 'start' }}>
                          <span aria-label={a.correct ? 'Correct' : 'Wrong'} style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, background: a.correct ? t.successBg : t.dangerBg, color: a.correct ? t.success : t.danger }}>{a.correct ? '✓' : '✗'}</span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.question ? <MathText text={a.question} /> : 'Question no longer available'}</span>
                            {a.subtopic && <span style={{ display: 'block', fontSize: 11.5, color: t.textFaint }}>{a.subtopic}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
