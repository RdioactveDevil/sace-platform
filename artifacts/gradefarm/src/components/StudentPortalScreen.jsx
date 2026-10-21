import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { GraduationCap, MessageSquare, Users, CalendarDays, Video, ClipboardList, Folder, Lock, BookOpen, Award, Clock, CircleAlert } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { fetchMyTutors, fetchMyClasses, fetchTutoringSessions, fetchStudentResources, fetchAssignmentsForStudent, fetchMessageThreads } from '../lib/db'
import MessagesView from './MessagesView'
import { isJoinable } from './StudentLessonsScreen'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

export const PORTAL_PATHS = ['/portal', '/portal/tutor', '/portal/messages', '/portal/class']

const VIEWS = {
  '/portal':          { id: 'overview', title: 'Student Portal', sub: 'Your tutor, classes, lessons and messages in one place.' },
  '/portal/tutor':    { id: 'tutor',    title: 'My Tutor',       sub: 'Who teaches you and what they cover with you.' },
  '/portal/messages': { id: 'messages', title: 'Messages',       sub: 'Ask your tutor anything. They get an email and reply here.' },
  '/portal/class':    { id: 'class',    title: 'My Class',       sub: 'The classes you’re in and who’s in them with you.' },
}

const fmtDay = (iso) => new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const firstName = (name) => (name || '').split(/\s+/)[0] || name

function Avatar({ name, size = 44 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: size * 0.4, color: '#0c1037', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, boxShadow: '0 4px 14px rgba(241,190,67,0.3)' }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  )
}

/** The Student Portal: Overview, My Tutor, Messages and My Class. Lessons, Recordings and Resources live in StudentLessonsScreen. */
export default function StudentPortalScreen({ profile, theme, active = true, hasTutoring = true }) {
  const t = THEMES[theme]
  const isDark = theme === 'dark'
  const location = useLocation()
  const navigate = useNavigate()
  const view = VIEWS[location.pathname] || VIEWS['/portal']
  const messageTo = new URLSearchParams(location.search).get('to')

  const [tutors, setTutors] = useState(null)
  const [classes, setClasses] = useState(null)
  const [sessions, setSessions] = useState([])
  const [resources, setResources] = useState([])
  const [tasks, setTasks] = useState([])
  const [threads, setThreads] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [tu, cl, se, re, ta, th] = await Promise.all([
        fetchMyTutors(),
        fetchMyClasses(),
        fetchTutoringSessions({ from: Date.now() - 6 * 3600_000, limit: 30 }).catch(() => []),
        fetchStudentResources().catch(() => []),
        fetchAssignmentsForStudent(profile.id).catch(() => []),
        fetchMessageThreads().catch(() => []),
      ])
      setTutors(tu); setClasses(cl); setSessions((se || []).filter(s => s.status !== 'cancelled' && s.status !== 'completed'))
      setResources(re); setTasks(ta); setThreads(th)
    } catch (e) {
      setError(e.message || 'Could not load your portal.')
      setTutors(t => t || []); setClasses(c => c || [])
    }
  }, [profile.id])
  useEffect(() => { if (active && hasTutoring) load() }, [active, hasTutoring, load, location.pathname])

  const nextLesson = useMemo(() => sessions
    .filter(s => isJoinable(s) || new Date(s.scheduled_at).getTime() > Date.now())
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0] || null, [sessions])
  const unread = threads.reduce((n, th) => n + (th.unread || 0), 0)

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, boxShadow: t.shadowCard }
  const goldBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 10, border: 'none', background: GOLD, color: '#171724', fontFamily: FONT_B, fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }
  const quietBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 36, padding: '0 14px', borderRadius: 10, border: `1px solid ${t.borderMid}`, background: 'transparent', color: t.text, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
  const label = { fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.textMuted }
  const chip = (text, key, color = GOLD) => (
    <span key={key} style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: `${color}1f`, color: color === GOLD ? t.goldText : color, whiteSpace: 'nowrap' }}>{text}</span>
  )
  const empty = (Icon, title, body) => (
    <div style={{ ...card, padding: '36px 24px', textAlign: 'center', color: t.textMuted }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bgSubtle, color: t.goldText }}>
        <Icon size={22} aria-hidden="true" />
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, maxWidth: 400, margin: '0 auto', lineHeight: 1.5 }}>{body}</div>
    </div>
  )
  const messageTutor = (id) => navigate(`/portal/messages?to=${encodeURIComponent(id)}`)

  if (!hasTutoring) {
    return (
      <Shell t={t} view={view}>
        {empty(Lock, 'The Student Portal opens when you have a tutor', 'When a tutor invites you, accept the invite and this portal unlocks: your tutor’s profile, messages, classes, live lessons, recordings and resources.')}
      </Shell>
    )
  }

  // ── Overview ──
  const overview = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Next lesson */}
      <div data-tutorial-target="portal-next-lesson" style={{ ...card, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        border: nextLesson && isJoinable(nextLesson) ? '1px solid rgba(241,190,67,0.45)' : card.border,
        background: nextLesson && isJoinable(nextLesson) ? (isDark ? 'linear-gradient(135deg, rgba(241,190,67,0.12), rgba(241,190,67,0.03))' : 'linear-gradient(135deg, #fff8e6, #ffffff)') : card.background }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: nextLesson ? GOLD : t.bgSubtle, color: nextLesson ? '#171724' : t.goldText }}>
          <CalendarDays size={21} aria-hidden="true" />
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={label}>{nextLesson && isJoinable(nextLesson) ? 'Happening now' : 'Next lesson'}</div>
          {nextLesson ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 800, color: t.text, marginTop: 3 }}>{nextLesson.title || 'Tutoring session'}</div>
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>{fmtDay(nextLesson.scheduled_at)} · {fmtTime(nextLesson.scheduled_at)} · with {nextLesson.other_party_name || 'your tutor'}</div>
            </>
          ) : (
            <div style={{ fontSize: 14, color: t.textMuted, marginTop: 3 }}>No lessons scheduled yet.</div>
          )}
        </div>
        {nextLesson && isJoinable(nextLesson)
          ? <button type="button" style={goldBtn} onClick={() => navigate(`/session/${nextLesson.id}`)}><Video size={16} aria-hidden="true" /> Join lesson</button>
          : <button type="button" style={quietBtn} onClick={() => navigate('/lessons')}>All lessons</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {/* Tutor */}
        <div data-tutorial-target="portal-tutor-card" style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 6 }}><GraduationCap size={14} aria-hidden="true" /> My tutor{tutors?.length > 1 ? 's' : ''}</div>
          {(tutors || []).slice(0, 3).map(tu => (
            <div key={tu.id} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <Avatar name={tu.name} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tu.name}</div>
                <div style={{ fontSize: 12, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tu.headline || (tu.tutored_subjects.length ? tu.tutored_subjects.join(', ') : 'Your tutor')}</div>
              </div>
              <button type="button" onClick={() => messageTutor(tu.id)} aria-label={`Message ${tu.name}`} title="Message" style={{ ...quietBtn, width: 36, padding: 0 }}><MessageSquare size={15} aria-hidden="true" /></button>
            </div>
          ))}
          <button type="button" style={{ ...quietBtn, marginTop: 'auto', alignSelf: 'flex-start' }} onClick={() => navigate('/portal/tutor')}>View profile</button>
        </div>

        {/* Messages */}
        <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 6 }}><MessageSquare size={14} aria-hidden="true" /> Messages</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: unread ? t.goldText : t.text }}>{unread || 'No'} <span style={{ fontSize: 14, fontWeight: 700, color: t.textMuted }}>new message{unread === 1 ? '' : 's'}</span></div>
          {(() => {
            const latest = threads.find(th => th.last_message)
            return latest
              ? <div style={{ fontSize: 12.5, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{latest.last_message.from_me ? 'You' : firstName(latest.other_name)}: {latest.last_message.body}</div>
              : <div style={{ fontSize: 12.5, color: t.textMuted }}>Stuck on something? Ask your tutor.</div>
          })()}
          <button type="button" style={{ ...goldBtn, marginTop: 'auto', alignSelf: 'flex-start' }} onClick={() => navigate('/portal/messages')}>Open messages</button>
        </div>

        {/* Tasks */}
        <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardList size={14} aria-hidden="true" /> Work from your tutor</div>
          {tasks.length === 0 ? (
            <div style={{ fontSize: 13, color: t.textMuted }}>Nothing assigned right now.</div>
          ) : tasks.slice(0, 3).map(a => {
            const overdue = a.due_date && new Date(a.due_date).setHours(23, 59, 59, 999) < Date.now()
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span style={{ flex: 1, minWidth: 0, color: t.text, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.type} · {a.subject}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: overdue ? t.danger : t.textMuted, flexShrink: 0 }}>{a.due_date ? (overdue ? 'Overdue' : `Due ${fmtDay(a.due_date)}`) : 'No due date'}</span>
              </div>
            )
          })}
          <button type="button" style={{ ...quietBtn, marginTop: 'auto', alignSelf: 'flex-start' }} onClick={() => navigate('/question-bank')}>Go to practice</button>
        </div>

        {/* Class */}
        <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 6 }}><Users size={14} aria-hidden="true" /> My class</div>
          {(classes || []).length === 0
            ? <div style={{ fontSize: 13, color: t.textMuted }}>You’re not in a class. Your tutor teaches you one-on-one.</div>
            : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{classes.map(c => chip(`${c.name} · ${c.members.length}`, c.id, c.color || GOLD))}</div>}
          <button type="button" style={{ ...quietBtn, marginTop: 'auto', alignSelf: 'flex-start' }} onClick={() => navigate('/portal/class')}>View class</button>
        </div>

        {/* Resources */}
        <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 6 }}><Folder size={14} aria-hidden="true" /> Latest from your tutor</div>
          {resources.length === 0
            ? <div style={{ fontSize: 13, color: t.textMuted }}>Notes, worksheets and recordings appear here.</div>
            : resources.slice(0, 3).map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                {r.type === 'recording' ? <Video size={14} color={t.goldText} aria-hidden="true" /> : <BookOpen size={14} color={t.goldText} aria-hidden="true" />}
                <span style={{ flex: 1, minWidth: 0, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
              </div>
            ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
            <button type="button" style={quietBtn} onClick={() => navigate('/class-resources')}>Resources</button>
            <button type="button" style={quietBtn} onClick={() => navigate('/recordings')}>Recordings</button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── My Tutor ──
  const tutorView = (tutors || []).length === 0
    ? empty(GraduationCap, 'No tutor yet', 'When a tutor invites you and you accept, they appear here.')
    : (
      <div data-tutorial-target="portal-tutor" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {tutors.map(tu => {
          const next = sessions.filter(s => s.tutor_id === tu.id).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0]
          return (
            <div key={tu.id} style={{ ...card, overflow: 'hidden' }}>
              <div style={{ padding: '22px 22px 18px', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', background: isDark ? 'linear-gradient(135deg, rgba(241,190,67,0.10), rgba(241,190,67,0.02))' : 'linear-gradient(135deg, #fff8e6, #ffffff)', borderBottom: `1px solid ${t.border}` }}>
                <Avatar name={tu.name} size={64} />
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontSize: 21, fontWeight: 900, color: t.text }}>{tu.name}</div>
                  {tu.headline && <div style={{ fontSize: 14, color: t.textSub, marginTop: 2 }}>{tu.headline}</div>}
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 6 }}>Your tutor since {new Date(tu.since).toLocaleDateString([], { month: 'long', year: 'numeric' })}</div>
                </div>
                <button type="button" style={goldBtn} onClick={() => messageTutor(tu.id)}><MessageSquare size={15} aria-hidden="true" /> Message {firstName(tu.name)}</button>
              </div>
              <div style={{ padding: 22, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 22 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ ...label, marginBottom: 6 }}>About</div>
                  <div style={{ fontSize: 14, color: tu.bio ? t.text : t.textMuted, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{tu.bio || `${firstName(tu.name)} hasn’t written a bio yet.`}</div>
                </div>
                <div>
                  <div style={{ ...label, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><BookOpen size={13} aria-hidden="true" /> Tutors you in</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {tu.tutored_subjects.length ? tu.tutored_subjects.map((s, i) => chip(s, i)) : <span style={{ fontSize: 13, color: t.textMuted }}>Not set yet</span>}
                  </div>
                  {tu.subjects && <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 10 }}>Also teaches: {tu.subjects}</div>}
                </div>
                <div>
                  <div style={{ ...label, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Award size={13} aria-hidden="true" /> Qualifications</div>
                  <div style={{ fontSize: 13.5, color: tu.qualifications ? t.text : t.textMuted, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{tu.qualifications || 'Not added yet'}</div>
                </div>
                <div>
                  <div style={{ ...label, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={13} aria-hidden="true" /> Next lesson together</div>
                  <div style={{ fontSize: 13.5, color: next ? t.text : t.textMuted }}>{next ? `${fmtDay(next.scheduled_at)} at ${fmtTime(next.scheduled_at)}` : 'Nothing scheduled'}</div>
                  {tu.classes.length > 0 && (
                    <>
                      <div style={{ ...label, margin: '14px 0 8px' }}>Your classes with {firstName(tu.name)}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{tu.classes.map((c, i) => chip(c, i, t.blue))}</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )

  // ── My Class ──
  const classView = (classes || []).length === 0
    ? <div data-tutorial-target="portal-class">{empty(Users, 'You’re not in a class', 'If your tutor adds you to a class, you’ll see it here with your classmates and class lessons.')}</div>
    : (
      <div data-tutorial-target="portal-class" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {classes.map(c => {
          const color = c.color || GOLD
          const classLessons = sessions.filter(s => s.class_id === c.id).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)).slice(0, 3)
          return (
            <div key={c.id} style={{ ...card, overflow: 'hidden', borderTop: `4px solid ${color}` }}>
              <div style={{ padding: '18px 20px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 19, fontWeight: 900, color: t.text }}>{c.name}</div>
                  {c.subject && <span style={{ fontSize: 13, color: t.textMuted }}>{c.subject}</span>}
                </div>
                {c.description && <div style={{ fontSize: 13.5, color: t.textSub, marginTop: 6, lineHeight: 1.55 }}>{c.description}</div>}
              </div>
              <div style={{ padding: '0 20px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
                <div>
                  <div style={{ ...label, marginBottom: 8 }}>Taught by</div>
                  {c.tutors.map(tu => (
                    <div key={tu.id} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                      <Avatar name={tu.name} size={28} />
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text, flex: 1 }}>{tu.name}</span>
                      {(tutors || []).some(x => x.id === tu.id) && (
                        <button type="button" onClick={() => messageTutor(tu.id)} aria-label={`Message ${tu.name}`} title="Message" style={{ ...quietBtn, height: 30, width: 30, padding: 0 }}><MessageSquare size={13} aria-hidden="true" /></button>
                      )}
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ ...label, marginBottom: 8 }}>Classmates · {c.members.length}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {c.members.map(m => (
                      <span key={m.id} style={{ fontSize: 12.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: m.is_me ? 'rgba(241,190,67,0.18)' : t.bgSubtle, color: m.is_me ? t.goldText : t.textSub }}>{m.is_me ? 'You' : m.name}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ ...label, marginBottom: 8 }}>Upcoming class lessons</div>
                  {classLessons.length === 0
                    ? <div style={{ fontSize: 13, color: t.textMuted }}>None scheduled</div>
                    : classLessons.map(s => (
                      <div key={s.id} style={{ fontSize: 13, color: t.text, marginBottom: 4 }}>{fmtDay(s.scheduled_at)} · {fmtTime(s.scheduled_at)}{s.title ? ` · ${s.title}` : ''}</div>
                    ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )

  let body
  if (error && !tutors?.length) body = <div style={{ ...card, padding: 16, color: t.danger, fontSize: 13.5, display: 'flex', gap: 8, alignItems: 'center' }}><CircleAlert size={16} aria-hidden="true" />{error}</div>
  else if (view.id === 'messages') body = <div data-tutorial-target="portal-messages"><MessagesView theme={theme} active={active} initialOtherId={messageTo} emptyHint="When you have a tutor, you can message them here." /></div>
  else if (tutors === null) body = <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{[0, 1, 2].map(i => <div key={i} style={{ ...card, height: 90, opacity: 0.6 }} />)}</div>
  else if (view.id === 'tutor') body = tutorView
  else if (view.id === 'class') body = classView
  else body = overview

  return <Shell t={t} view={view}>{body}</Shell>
}

function Shell({ t, view, children }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', fontFamily: FONT_B }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 20px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <header>
          <h1 style={{ margin: 0, fontFamily: FONT_D, fontWeight: 400, fontSize: 26, letterSpacing: '0.03em', color: t.text }}>{view.title}</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: t.textMuted }}>{view.sub}</p>
        </header>
        {children}
      </div>
    </div>
  )
}
