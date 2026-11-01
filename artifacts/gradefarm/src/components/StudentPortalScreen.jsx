import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CircleAlert, Video } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { assignmentGoalLabel } from '../lib/engine'
import { fetchMyTutors, fetchMyClasses, fetchTutoringSessions, fetchStudentResources, fetchAssignmentsForStudent, fetchCompletedAssignmentsForStudent, fetchMessageThreads } from '../lib/db'
import MessagesView from './MessagesView'
import { isJoinable, JOIN_EARLY_MIN } from './StudentLessonsScreen'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

// /portal/class is the old My Class page; it now opens Tutor and class.
export const PORTAL_PATHS = ['/portal', '/portal/tutor', '/portal/messages', '/portal/class']

const VIEWS = {
  '/portal':          { id: 'overview', title: 'Student Portal' },
  '/portal/tutor':    { id: 'tutor',    title: 'Tutor and class' },
  '/portal/class':    { id: 'tutor',    title: 'Tutor and class' },
  '/portal/messages': { id: 'messages', title: 'Messages' },
}

const fmtDay = (iso) => new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const firstName = (name) => (name || '').split(/\s+/)[0] || name
const agoLabel = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${Math.max(1, mins)} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return fmtDay(iso)
}
/** "Today", "Tomorrow" or "Mon 2 Nov", for a lesson's day. */
const dayWord = (iso) => {
  const d = new Date(iso); const today = new Date(); const tmw = new Date(Date.now() + 86400000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tmw.toDateString()) return 'Tomorrow'
  return fmtDay(iso)
}

/**
 * The Student Portal: an overview of what to do (the next lesson, work from
 * the tutor, the latest message, files they've shared), Messages, and Tutor
 * and class. The Lessons tab is StudentLessonsScreen. `onStartSession` starts
 * or continues an assignment, as on Practice.
 */
export default function StudentPortalScreen({ profile, theme, active = true, hasTutoring = true, onStartSession }) {
  const t = THEMES[theme]
  const location = useLocation()
  const navigate = useNavigate()
  const view = VIEWS[location.pathname] || VIEWS['/portal']
  const messageTo = new URLSearchParams(location.search).get('to')

  const [tutors, setTutors] = useState(null)
  const [classes, setClasses] = useState(null)
  const [sessions, setSessions] = useState([])
  const [resources, setResources] = useState([])
  const [tasks, setTasks] = useState([])
  const [finished, setFinished] = useState([])
  const [threads, setThreads] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [tu, cl, se, re, ta, fi, th] = await Promise.all([
        fetchMyTutors(),
        fetchMyClasses(),
        fetchTutoringSessions({ from: Date.now() - 6 * 3600_000, limit: 30 }).catch(() => []),
        fetchStudentResources().catch(() => []),
        fetchAssignmentsForStudent(profile.id).catch(() => []),
        fetchCompletedAssignmentsForStudent().catch(() => []),
        fetchMessageThreads().catch(() => []),
      ])
      setTutors(tu); setClasses(cl); setSessions((se || []).filter(s => s.status !== 'cancelled' && s.status !== 'completed'))
      setResources(re); setTasks(ta); setFinished((fi || []).filter(a => a.wrong_question_ids?.length > 0)); setThreads(th)
    } catch (e) {
      setError(e.message || "Your portal didn't load. Try again in a moment.")
      setTutors(x => x || []); setClasses(c => c || [])
    }
  }, [profile.id])
  useEffect(() => { if (active && hasTutoring) load() }, [active, hasTutoring, load, location.pathname])

  // /portal/class: open at the classes.
  useEffect(() => {
    if (!active || location.pathname !== '/portal/class' || !classes) return
    document.getElementById('portal-classes')?.scrollIntoView({ block: 'start' })
  }, [active, location.pathname, classes])

  const nextLesson = useMemo(() => sessions
    .filter(s => isJoinable(s) || new Date(s.scheduled_at).getTime() > Date.now())
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0] || null, [sessions])
  const unread = threads.reduce((n, th) => n + (th.unread || 0), 0)
  const mainTutor = (tutors || [])[0] || null
  const tutorFirst = mainTutor ? firstName(mainTutor.name) : null

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12 }
  const btn = (primary) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 8, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none',
    ...(primary ? { border: 'none', background: t.accent, color: '#0c1037' } : { border: `1px solid ${t.border}`, background: t.bgCard, color: t.text }),
  })
  const link = { border: 'none', background: 'none', padding: 0, fontFamily: FONT_B, fontSize: 13, fontWeight: 700, color: t.text, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: t.accent, textDecorationThickness: 2, textUnderlineOffset: 3, whiteSpace: 'nowrap' }
  const h2 = (text, extra, id) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
      <h2 id={id} style={{ margin: 0, fontSize: 15, fontWeight: 800, color: t.text }}>{text}</h2>
      {extra && <span style={{ fontSize: 12.5, color: t.textMuted }}>{extra}</span>}
    </div>
  )
  const row = (first) => ({ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderTop: first ? 'none' : `1px solid ${t.border}`, flexWrap: 'wrap' })
  const emptyLine = (text) => <div style={{ ...card, padding: '14px 16px', fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>{text}</div>
  const avatar = (name, size = 30) => (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: t.bgSubtle, color: t.text, fontWeight: 800, fontSize: size * 0.4 }}>{(name || '?')[0].toUpperCase()}</span>
  )
  const messageTutor = (id) => navigate(`/portal/messages?to=${encodeURIComponent(id)}`)

  if (!hasTutoring) {
    return (
      <Shell t={t} title={view.title}>
        {emptyLine('The Student Portal opens when you have a tutor. When a tutor invites you and you accept, their profile, messages, lessons and files show up here.')}
      </Shell>
    )
  }

  // ── Overview: what to do next ──
  const due = (a) => {
    if (!a.due_date) return { text: 'No due date', tone: null }
    const end = new Date(a.due_date); end.setHours(23, 59, 59, 999)
    if (end < new Date()) return { text: 'Overdue', tone: 'danger' }
    const days = Math.ceil((end - new Date()) / 86400000)
    return { text: days <= 1 ? 'Due today' : `Due ${new Date(a.due_date).toLocaleDateString([], { weekday: 'short' })}`, tone: null }
  }
  const taskName = (a) => (a.topics?.length ? `${a.type}: ${a.topics.slice(0, 2).join(', ')}${a.topics.length > 2 ? ` +${a.topics.length - 2}` : ''}` : `${a.type} · ${a.subject}`)
  const latest = threads.find(th => th.last_message)
  const files = resources.filter(r => r.type !== 'recording').slice(0, 3)

  const overview = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div data-tutorial-target="portal-next-lesson" style={{ ...card, ...(nextLesson && isJoinable(nextLesson) ? { borderColor: t.text, boxShadow: `0 0 0 1px ${t.text}` } : {}), padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {nextLesson ? (
          <>
            <div aria-hidden="true" style={{ width: 40, textAlign: 'center', lineHeight: 1.1, flexShrink: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.textMuted }}>{new Date(nextLesson.scheduled_at).toLocaleDateString([], { month: 'short' })}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.text }}>{new Date(nextLesson.scheduled_at).getDate()}</div>
            </div>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: isJoinable(nextLesson) ? t.success : t.textMuted }}>{isJoinable(nextLesson) ? 'Happening now' : 'Next lesson'}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.text, marginTop: 1 }}>{nextLesson.title || 'Tutoring session'}</div>
              <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 1 }}>{dayWord(nextLesson.scheduled_at)}, {fmtTime(nextLesson.scheduled_at)} · {nextLesson.duration_minutes || 60} min · with {nextLesson.other_party_name || 'your tutor'}</div>
            </div>
            {isJoinable(nextLesson)
              ? <button type="button" style={{ ...btn(true), height: 38, padding: '0 16px', fontSize: 13.5 }} onClick={() => navigate(`/session/${nextLesson.id}`)}><Video size={15} aria-hidden="true" /> Join lesson</button>
              : <span style={{ fontSize: 12.5, color: t.textMuted }}>You can join {JOIN_EARLY_MIN} min before it starts</span>}
          </>
        ) : (
          <>
            <div style={{ flex: 1, fontSize: 13.5, color: t.textMuted }}>No lessons booked yet.</div>
            <button type="button" style={link} onClick={() => navigate('/lessons')}>Past lessons</button>
          </>
        )}
      </div>

      <div className="portal-cols">
        <section data-tutorial-target="portal-work" aria-labelledby="portal-work-h">
          {h2(`Work from ${tutorFirst || 'your tutor'}`, tasks.length ? `${tasks.length} to do` : null, 'portal-work-h')}
          {tasks.length === 0 && finished.length === 0 ? emptyLine('Nothing to do right now. Work your tutor sets shows here.') : (
            <div style={card}>
              {tasks.slice(0, 6).map((a, i) => {
                const d = due(a)
                return (
                  <div key={a.id} style={row(i === 0)}>
                    <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{taskName(a)}</div>
                      <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 1 }}>{assignmentGoalLabel(a) || a.subject}</div>
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: d.tone === 'danger' ? t.danger : t.textMuted, whiteSpace: 'nowrap' }}>{d.text}</span>
                    {onStartSession && (
                      <button type="button" style={btn(i === 0)} onClick={() => onStartSession({ mode: 'new', subtopics: a.topics || [], assignment: a })}>
                        {a.progress_count > 0 ? 'Continue' : 'Start'}
                      </button>
                    )}
                  </div>
                )
              })}
              {finished.slice(0, 3).map((a, i) => (
                <div key={a.id} style={row(tasks.length === 0 && i === 0)}>
                  <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{taskName(a)}</div>
                    <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 1 }}>
                      Finished{a.score?.total > 0 ? `: ${a.score.correct} of ${a.score.total}` : ''}{a.passed != null ? (a.passed ? ', passed' : ', not passed') : ''}
                    </div>
                  </div>
                  {onStartSession && (
                    <button type="button" style={btn(false)} onClick={() => onStartSession({ mode: 'review', subtopics: [], subject: a.subject, reviewIds: a.wrong_question_ids })}>
                      Redo {a.wrong_question_ids.length} wrong
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="portal-msg-h">
          {h2('Messages', unread ? `${unread} new` : null, 'portal-msg-h')}
          <div style={{ ...card, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {latest ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {avatar(latest.last_message.from_me ? profile.display_name : latest.other_name, 26)}
                  <strong style={{ fontSize: 13, color: t.text }}>{latest.last_message.from_me ? 'You' : firstName(latest.other_name)}</strong>
                  <span style={{ fontSize: 12, color: t.textMuted }}>{agoLabel(latest.last_message.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, color: t.text, lineHeight: 1.5, background: t.bgSubtle, borderRadius: 9, padding: '8px 10px', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{latest.last_message.body}</div>
                <div><button type="button" style={link} onClick={() => messageTutor(latest.other_id)}>{latest.last_message.from_me ? 'Open' : 'Reply'}</button></div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>Stuck on something? {tutorFirst ? `Message ${tutorFirst}` : 'Message your tutor'}. They get an email and reply here.</div>
                {mainTutor && <div><button type="button" style={link} onClick={() => messageTutor(mainTutor.id)}>Write a message</button></div>}
              </>
            )}
          </div>
        </section>
      </div>

      {files.length > 0 && (
        <section aria-labelledby="portal-files-h">
          {h2(`New from ${tutorFirst || 'your tutor'}`, null, 'portal-files-h')}
          <div style={card}>
            {files.map((r, i) => (
              <div key={r.id} style={row(i === 0)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                  <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 1 }}>{r.kind === 'link' ? 'Link' : 'File'} · {new Date(r.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}</div>
                </div>
                <a href={r.download_url || '#'} target="_blank" rel="noopener noreferrer" style={link}>{r.kind === 'link' ? 'Open' : 'Download'}</a>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}><button type="button" style={{ ...link, fontWeight: 600, textDecorationColor: t.border, color: t.textMuted }} onClick={() => navigate('/class-resources')}>All files and recordings</button></div>
        </section>
      )}
    </div>
  )

  // ── Tutor and class ──
  const tutorView = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {(tutors || []).length === 0 ? emptyLine('No tutor yet. When a tutor invites you and you accept, they show here.') : (
        <section data-tutorial-target="portal-tutor" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tutors.map(tu => {
            const next = sessions.filter(s => s.tutor_id === tu.id).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0]
            const facts = [
              ['Tutors you in', tu.tutored_subjects?.length ? tu.tutored_subjects.join(', ') : 'Not set yet'],
              tu.subjects && ['Also teaches', tu.subjects],
              ['Qualifications', tu.qualifications || 'Not added yet'],
              ['Next lesson together', next ? `${fmtDay(next.scheduled_at)}, ${fmtTime(next.scheduled_at)}` : 'Nothing booked'],
            ].filter(Boolean)
            return (
              <div key={tu.id} style={{ ...card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {avatar(tu.name, 44)}
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: t.text }}>{tu.name}</div>
                    <div style={{ fontSize: 12.5, color: t.textMuted }}>{[tu.headline, tu.since && `your tutor since ${new Date(tu.since).toLocaleDateString([], { month: 'long', year: 'numeric' })}`].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button type="button" style={btn(false)} onClick={() => messageTutor(tu.id)}>Message {firstName(tu.name)}</button>
                </div>
                <div style={{ fontSize: 13.5, color: tu.bio ? t.text : t.textMuted, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{tu.bio || `${firstName(tu.name)} hasn't written a bio yet.`}</div>
                <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px 18px' }}>
                  {facts.map(([k, v]) => (
                    <div key={k} style={{ minWidth: 0 }}>
                      <dt style={{ fontSize: 12.5, color: t.textMuted }}>{k}</dt>
                      <dd style={{ margin: '2px 0 0', fontSize: 13.5, fontWeight: 600, color: t.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )
          })}
        </section>
      )}

      <section id="portal-classes" data-tutorial-target="portal-class" style={{ scrollMarginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(classes || []).length === 0 ? (
          <>{h2('Your class')}{emptyLine("You're not in a class. If your tutor adds you to one, it shows here with your classmates and class lessons.")}</>
        ) : classes.map(c => {
          const classLessons = sessions.filter(s => s.class_id === c.id).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)).slice(0, 3)
          return (
            <div key={c.id}>
              {h2(c.name, [c.subject, `${c.members.length} student${c.members.length !== 1 ? 's' : ''}`].filter(Boolean).join(' · '))}
              <div style={card}>
                {c.description && <div style={{ ...row(true), fontSize: 13, color: t.textSub }}>{c.description}</div>}
                <div style={{ ...row(!c.description), fontSize: 13, color: t.textMuted }}>
                  <span style={{ width: 110, flexShrink: 0 }}>Taught by</span>
                  <span style={{ flex: 1, minWidth: 0, color: t.text, fontWeight: 600 }}>{c.tutors.map(tu => tu.name).join(', ')}</span>
                </div>
                <div style={{ ...row(false), fontSize: 13, color: t.textMuted }}>
                  <span style={{ width: 110, flexShrink: 0 }}>Classmates</span>
                  <span style={{ flex: 1, minWidth: 0, color: t.text }}>{c.members.map(m => (m.is_me ? `${m.name} (you)` : m.name)).join(' · ')}</span>
                </div>
                <div style={{ ...row(false), fontSize: 13, color: t.textMuted }}>
                  <span style={{ width: 110, flexShrink: 0 }}>Class lessons</span>
                  <span style={{ flex: 1, minWidth: 0, color: t.text }}>
                    {classLessons.length === 0 ? 'None booked' : classLessons.map(s => `${fmtDay(s.scheduled_at)}, ${fmtTime(s.scheduled_at)}${s.title ? ` (${s.title})` : ''}`).join(' · ')}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )

  let body
  if (error && !tutors?.length) body = (
    <div role="alert" style={{ ...card, padding: '14px 16px', color: t.danger, fontSize: 13.5, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <CircleAlert size={16} aria-hidden="true" />{error}
      <button type="button" style={{ ...link, marginLeft: 'auto' }} onClick={load}>Try again</button>
    </div>
  )
  else if (view.id === 'messages') body = <div data-tutorial-target="portal-messages"><MessagesView theme={theme} active={active} initialOtherId={messageTo} emptyHint="When you have a tutor, you can message them here." /></div>
  else if (tutors === null) body = <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{[0, 1, 2].map(i => <div key={i} style={{ ...card, height: 72, opacity: 0.6 }} />)}</div>
  else if (view.id === 'tutor') body = tutorView
  else body = overview

  const sub = view.id === 'overview' && mainTutor
    ? `${tutors.map(tu => tu.name).join(' and ')} ${tutors.length > 1 ? 'are your tutors' : 'is your tutor'}`
    : view.id === 'messages' ? 'Ask your tutor anything. They get an email and reply here.' : null
  return <Shell t={t} title={view.title} sub={sub}>{body}</Shell>
}

function Shell({ t, title, sub, children }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', fontFamily: FONT_B, background: t.bg }}>
      <style>{'.portal-cols { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 16px; align-items: start; } @media (max-width: 900px) { .portal-cols { grid-template-columns: 1fr; } }'}</style>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 56px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: t.text }}>{title}</h1>
          {sub && <p style={{ margin: '2px 0 0', fontSize: 13, color: t.textMuted }}>{sub}</p>}
        </header>
        {children}
      </div>
    </div>
  )
}
