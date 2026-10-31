import { useEffect, useMemo, useState } from 'react'
import { THEMES } from '../lib/theme'
import { fetchRosterActivity, fetchMessageThreads } from '../lib/db'
import { isJoinable } from './StudentLessonsScreen'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const DAY_MS = 86400000
const QUIET_DAYS = 7

/** Monday 00:00 of this week, as ms. */
function weekStartMs(offsetWeeks = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - offsetWeeks * 7)
  return d.getTime()
}
const endOfDay = (date) => new Date(date).setHours(23, 59, 59, 999)
const shortDate = (date) => new Date(date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
const timeOf = (date) => new Date(date).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })

/**
 * The tutor's Today page: this week's numbers (from the students' real
 * answers), everything waiting on the tutor in one list, today's lessons, and
 * the topics the tutor's students find hardest.
 */
export default function TutorToday({ theme, roster, assignments, sessions, onNavigate, onJoinSession, onOpenReport }) {
  const t = THEMES[theme]
  const [activity, setActivity] = useState(null)
  const [threads, setThreads] = useState([])
  const [now, setNow] = useState(() => Date.now())

  const studentIds = useMemo(() => roster.map(r => r.student_id), [roster])
  useEffect(() => {
    let cancelled = false
    fetchRosterActivity(studentIds, 14).then(rows => { if (!cancelled) setActivity(rows) }).catch(() => { if (!cancelled) setActivity([]) })
    fetchMessageThreads().then(rows => { if (!cancelled) setThreads(rows) }).catch(() => {})
    return () => { cancelled = true }
  }, [studentIds])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const nameOf = (id) => roster.find(r => r.student_id === id)?.profiles?.display_name || 'A student'

  // ── This week ─────────────────────────────────────────────────────────────
  const week = useMemo(() => {
    const start = weekStartMs(), prevStart = weekStartMs(1)
    const rows = activity || []
    const thisWeek = rows.filter(r => Date.parse(r.answered_at) >= start)
    const lastWeek = rows.filter(r => { const at = Date.parse(r.answered_at); return at >= prevStart && at < start })
    const pct = (list) => (list.length ? Math.round((list.filter(r => r.correct).length / list.length) * 100) : null)
    const end = start + 7 * DAY_MS
    const dueThisWeek = assignments.filter(a => a.due_date && Date.parse(a.due_date) >= start && Date.parse(a.due_date) < end)
    return {
      practised: new Set(thisWeek.map(r => r.user_id)).size,
      accuracy: pct(thisWeek),
      lastAccuracy: pct(lastWeek),
      dueThisWeek: dueThisWeek.length,
      doneThisWeek: dueThisWeek.filter(a => a.completed_at).length,
      completedThisWeek: assignments.filter(a => a.completed_at && Date.parse(a.completed_at) >= start).length,
    }
  }, [activity, assignments])

  // ── Needs you ─────────────────────────────────────────────────────────────
  const needs = useMemo(() => {
    const items = []
    assignments
      .filter(a => !a.completed_at && a.due_date && endOfDay(a.due_date) < now)
      .sort((a, b) => Date.parse(a.due_date) - Date.parse(b.due_date))
      .forEach(a => items.push({
        key: `overdue-${a.id}`, kind: 'Overdue', who: a.profiles?.display_name || nameOf(a.student_id), what: `${a.type}${a.topics?.length ? ` · ${a.topics.slice(0, 2).join(', ')}` : ''}`,
        detail: `Was due ${shortDate(a.due_date)}${a.question_count ? ` · ${a.progress_count || 0} of ${a.question_count} answered` : ''}`,
        action: 'Message', run: () => onNavigate(`messages?with=${a.student_id}`), tone: t.danger,
      }))
    assignments
      .filter(a => a.completed_at && now - Date.parse(a.completed_at) < 3 * DAY_MS)
      .sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at))
      .forEach(a => items.push({
        key: `done-${a.id}`, kind: 'Finished', who: a.profiles?.display_name || nameOf(a.student_id), what: `${a.type}${a.topics?.length ? ` · ${a.topics.slice(0, 2).join(', ')}` : ''}`,
        detail: a.passed === false ? `Below the ${a.min_accuracy}% pass mark` : `Finished ${shortDate(a.completed_at)}`,
        action: 'Report', run: () => onOpenReport(a.id), tone: a.passed === false ? t.danger : t.textMuted,
      }))
    threads
      .filter(th => th.unread > 0 && th.other_role === 'student')
      .forEach(th => items.push({
        key: `msg-${th.other_id}`, kind: 'Message', who: th.other_name, what: '',
        detail: th.last_message?.body ? `“${th.last_message.body.slice(0, 90)}${th.last_message.body.length > 90 ? '…' : ''}”` : `${th.unread} unread`,
        action: 'Reply', run: () => onNavigate(`messages?with=${th.other_id}`), tone: t.textMuted,
      }))
    // Students who haven't practised in a week (by their answers, or last sign-in when there are none).
    if (activity) {
      const lastAnswer = {}
      activity.forEach(r => { const at = Date.parse(r.answered_at); if (!lastAnswer[r.user_id] || at > lastAnswer[r.user_id]) lastAnswer[r.user_id] = at })
      roster.forEach(r => {
        const last = lastAnswer[r.student_id] || (r.profiles?.last_active ? Date.parse(r.profiles.last_active) : null)
        if (last && now - last < QUIET_DAYS * DAY_MS) return
        const days = last ? Math.floor((now - last) / DAY_MS) : null
        items.push({
          key: `quiet-${r.student_id}`, kind: 'Quiet', who: r.profiles?.display_name || 'A student', what: '',
          detail: days == null ? 'Hasn’t practised yet' : `No practice for ${days} days`,
          action: 'Message', run: () => onNavigate(`messages?with=${r.student_id}`), tone: t.textMuted,
        })
      })
    }
    return items
  }, [assignments, threads, activity, roster, now]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lessons today ─────────────────────────────────────────────────────────
  const lessonsToday = useMemo(() => {
    const today = new Date(now).toDateString()
    return (sessions || [])
      .filter(s => s.scheduled_at && new Date(s.scheduled_at).toDateString() === today && s.status !== 'cancelled')
      .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))
  }, [sessions, now])

  // ── Weakest topics across students (last 14 days) ─────────────────────────
  const weakTopics = useMemo(() => {
    const map = {}
    ;(activity || []).forEach(r => {
      if (!r.subtopic) return
      const m = map[r.subtopic] || (map[r.subtopic] = { total: 0, correct: 0, students: new Set() })
      m.total++
      if (r.correct) m.correct++
      m.students.add(r.user_id)
    })
    return Object.entries(map)
      .map(([topic, m]) => ({ topic, students: m.students.size, pct: Math.round((m.correct / m.total) * 100), total: m.total }))
      .filter(x => x.total >= 5 && x.pct < 60)
      .sort((a, b) => a.pct - b.pct || b.students - a.students)
      .slice(0, 4)
  }, [activity])

  // ── Styles ────────────────────────────────────────────────────────────────
  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: '12px 16px' }
  const cardTitle = { fontSize: 14.5, fontWeight: 800, color: t.text }
  const btn = (primary) => ({ padding: '7px 13px', borderRadius: 8, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, border: primary ? 'none' : `1px solid ${t.border}`, background: primary ? t.accent : t.bgCard, color: primary ? '#0c1037' : t.text })
  const row = (first) => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: first ? 'none' : `1px solid ${t.border}` })
  const kindChip = { fontSize: 11, fontWeight: 700, color: t.textSub, padding: '1px 8px', border: `1px solid ${t.border}`, borderRadius: 999, marginRight: 8, whiteSpace: 'nowrap' }
  const fact = (value, text) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: t.text, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12.5, color: t.textMuted }}>{text}</div>
    </div>
  )
  const delta = week.accuracy != null && week.lastAccuracy != null ? week.accuracy - week.lastAccuracy : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: FONT_B, color: t.text }}>
      <style>{`
        .tt-cols { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 16px; align-items: start; }
        @media (max-width: 1000px) { .tt-cols { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        {fact(activity ? `${week.practised} of ${roster.length}` : '…', 'students practised this week')}
        {fact(week.accuracy == null ? '—' : `${week.accuracy}%`, week.accuracy == null ? 'average accuracy this week' : delta == null ? 'average accuracy this week' : `average accuracy, ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta)} pts`)}
        {week.dueThisWeek > 0
          ? fact(`${week.doneThisWeek} of ${week.dueThisWeek}`, 'assignments due this week done')
          : fact(week.completedThisWeek, 'assignments finished this week')}
      </div>

      <div className="tt-cols">
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <span style={cardTitle}>Needs you</span>
            {needs.length > 0 && <span style={{ fontSize: 12, color: t.textFaint }}>{needs.length} thing{needs.length !== 1 ? 's' : ''}</span>}
          </div>
          {needs.length === 0 ? (
            <div style={{ fontSize: 13, color: t.textMuted, padding: '10px 0 4px' }}>Nothing waiting on you. Overdue work, finished assignments, messages and quiet students show up here.</div>
          ) : (
            <div style={{ maxHeight: 460, overflowY: 'auto' }}>
              {needs.slice(0, 12).map((n, i) => (
                <div key={n.key} style={row(i === 0)}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 2 }}>
                      <span style={kindChip}>{n.kind}</span>
                      <span style={{ fontWeight: 700 }}>{n.who}</span>
                      {n.what && <span style={{ color: t.textSub }}>&nbsp;· {n.what}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: n.tone, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.detail}</div>
                  </div>
                  <button type="button" style={btn(false)} onClick={n.run}>{n.action}</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span style={cardTitle}>Lessons today</span>
              <button type="button" onClick={() => onNavigate('sessions')}
                style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, color: t.text, textDecoration: 'underline', textDecorationColor: GOLD, textDecorationThickness: 2, textUnderlineOffset: 4 }}>
                All lessons
              </button>
            </div>
            {lessonsToday.length === 0 ? (
              <div style={{ fontSize: 13, color: t.textMuted, padding: '10px 0 4px' }}>No lessons today.</div>
            ) : lessonsToday.map((s, i) => {
              const joinable = isJoinable(s, now)
              const startsIn = Date.parse(s.scheduled_at) - now
              return (
                <div key={s.id} style={row(i === 0)}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', minWidth: 0 }}>
                    <span style={{ width: 64, flexShrink: 0, fontSize: 13, fontWeight: 700, color: t.textSub }}>{timeOf(s.scheduled_at)}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || 'Lesson'}</span>
                  </div>
                  {joinable
                    ? <button type="button" style={btn(true)} onClick={() => onJoinSession(s.id)}>Join</button>
                    : <span style={{ fontSize: 12.5, color: t.textFaint, flexShrink: 0 }}>{startsIn > 0 ? (startsIn < 3600000 ? `In ${Math.max(1, Math.round(startsIn / 60000))} min` : `In ${Math.round(startsIn / 3600000)} h`) : 'Finished'}</span>}
                </div>
              )
            })}
          </div>

          <div style={card}>
            <span style={cardTitle}>Hardest topics for your students</span>
            {weakTopics.length === 0 ? (
              <div style={{ fontSize: 13, color: t.textMuted, padding: '10px 0 4px' }}>{activity ? 'Nothing stands out from the last two weeks.' : 'Loading…'}</div>
            ) : weakTopics.map((w, i) => (
              <div key={w.topic} style={row(i === 0)}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.topic}</div>
                  <div style={{ fontSize: 12, color: t.textFaint }}>{w.students} student{w.students !== 1 ? 's' : ''} · <span style={{ color: w.pct < 40 ? t.danger : t.goldText }}>{w.pct}% correct</span> in the last 2 weeks</div>
                </div>
                <button type="button" style={btn(false)} onClick={() => onNavigate('assignments')}>Assign</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
