import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Video, Clock, Users, User, PlayCircle, Download, Folder, FileText, PenLine, ChartColumn, Link as LinkIcon, CalendarDays, Radio, X, Loader, CircleAlert } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { fetchTutoringSessions, fetchStudentResources, getTutorResourceDownloadUrl } from '../lib/db'

const GOLD = '#f1be43'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

/** Lessons open this many minutes before their start time. */
export const JOIN_EARLY_MIN = 15

const sessionStart = (s) => new Date(s.scheduled_at).getTime()
const sessionEnd = (s) => sessionStart(s) + (s.duration_minutes || 60) * 60_000

/** Joinable now: running, or scheduled and inside the join window. */
export function isJoinable(s, now = Date.now()) {
  if (s.status === 'cancelled' || s.status === 'completed') return false
  if (s.status === 'active') return true
  return now >= sessionStart(s) - JOIN_EARLY_MIN * 60_000 && now <= sessionEnd(s)
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function startsIn(ms) {
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `in ${mins} min`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `in ${hrs} hr${hrs !== 1 ? 's' : ''}`
  const days = Math.round(hrs / 24)
  return days === 1 ? 'tomorrow' : `in ${days} days`
}

const timeLabel = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function typeLabel(s) {
  if (s.class_id) return { icon: Users, text: 'Class' }
  if (s.session_type === 'group') return { icon: Users, text: 'Group' }
  return { icon: User, text: '1:1' }
}

function formatSize(bytes) {
  if (!bytes) return null
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes > 1e6) return `${Math.round(bytes / 1e6)} MB`
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`
}

const RESOURCE_ICONS = { notes: PenLine, worksheet: FileText, recording: Video, slides: ChartColumn, resource: Folder, link: LinkIcon }

/** Lessons, recordings and resources from the student's tutors. */
export default function StudentLessonsScreen({ theme, active = true }) {
  const t = THEMES[theme]
  const isDark = theme === 'dark'
  const location = useLocation()
  const navigate = useNavigate()
  const view = location.pathname === '/recordings' ? 'recordings' : location.pathname === '/class-resources' ? 'resources' : 'lessons'
  const now = useNow()

  const [upcoming, setUpcoming] = useState([])
  const [past, setPast] = useState([])
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(null) // { resource, url }

  const load = useCallback(async () => {
    setError('')
    try {
      // "Upcoming" reaches back a few hours so a lesson that's running still shows.
      const since = Date.now() - 6 * 3600_000
      const [next, prev, res] = await Promise.all([
        fetchTutoringSessions({ from: since, limit: 50 }),
        fetchTutoringSessions({ to: Date.now(), order: 'desc', limit: 30 }),
        fetchStudentResources(),
      ])
      setUpcoming((next || []).filter(s => s.status !== 'cancelled'))
      setPast(prev || [])
      setResources(res || [])
    } catch (e) {
      setError(e.message || 'Could not load your lessons.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load when first shown, and refresh whenever the student comes back to it.
  useEffect(() => { if (active) load() }, [active, load])

  const recordings = useMemo(() => resources.filter(r => r.type === 'recording'), [resources])
  const otherResources = useMemo(() => resources.filter(r => r.type !== 'recording'), [resources])
  const recordingBySession = useMemo(() => new Map(recordings.filter(r => r.session_id).map(r => [r.session_id, r])), [recordings])

  const live = upcoming.filter(s => isJoinable(s, now))
  const later = upcoming.filter(s => !isJoinable(s, now) && sessionEnd(s) > now && s.status !== 'completed')
  const pastLessons = past.filter(s => s.status !== 'cancelled' && !isJoinable(s, now) && (s.status === 'completed' || sessionEnd(s) <= now))

  const play = async (resource) => {
    setPlaying({ resource, url: null })
    try {
      const url = await getTutorResourceDownloadUrl(resource.id)
      setPlaying({ resource, url })
    } catch {
      setPlaying({ resource, url: resource.download_url, })
    }
  }

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, boxShadow: t.shadowCard }
  const sectionTitle = (text, extra) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, margin: '0 0 12px' }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: t.text }}>{text}</h2>
      {extra && <span style={{ fontSize: 12, color: t.textMuted }}>{extra}</span>}
    </div>
  )
  const empty = (Icon, title, body) => (
    <div style={{ ...card, padding: '36px 24px', textAlign: 'center', color: t.textMuted }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bgSubtle, color: t.goldText }}>
        <Icon size={22} aria-hidden="true" />
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, maxWidth: 380, margin: '0 auto', lineHeight: 1.5 }}>{body}</div>
    </div>
  )
  const goldButton = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: GOLD, color: '#171724', fontFamily: FONT_B, fontSize: 13.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }
  const quietButton = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 36, padding: '0 14px', borderRadius: 10, border: `1px solid ${t.borderMid}`, background: 'transparent', color: t.text, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none' }

  const DateBlock = ({ date, highlight }) => (
    <div style={{ width: 52, flexShrink: 0, borderRadius: 12, overflow: 'hidden', textAlign: 'center', border: `1px solid ${highlight ? 'rgba(241,190,67,0.45)' : t.border}`, background: t.bgSubtle }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', padding: '3px 0', background: highlight ? GOLD : (isDark ? 'rgba(255,255,255,0.06)' : '#e8ebf7'), color: highlight ? '#171724' : t.textMuted }}>
        {date.toLocaleDateString([], { month: 'short' }).toUpperCase()}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: t.text, padding: '4px 0 5px' }}>{date.getDate()}</div>
    </div>
  )

  const LessonRow = ({ s, children }) => {
    const start = new Date(s.scheduled_at)
    const type = typeLabel(s)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderTop: `1px solid ${t.border}` }} className="gf-lesson-row">
        <DateBlock date={start} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || 'Tutoring session'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', marginTop: 4, fontSize: 12, color: t.textMuted }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Clock size={12} aria-hidden="true" />{start.toLocaleDateString([], { weekday: 'short' })} {timeLabel(start)} · {s.duration_minutes || 60} min</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><type.icon size={12} aria-hidden="true" />{type.text} with {s.other_party_name || 'your tutor'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{children}</div>
      </div>
    )
  }

  const lessonsView = (
    <>
      {live.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {live.map(s => {
            const start = new Date(s.scheduled_at)
            const started = now >= sessionStart(s) || s.status === 'active'
            return (
              <div key={s.id} style={{ ...card, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', border: '1px solid rgba(241,190,67,0.45)', background: isDark ? 'linear-gradient(135deg, rgba(241,190,67,0.12), rgba(241,190,67,0.03))' : 'linear-gradient(135deg, #fff8e6, #ffffff)' }}>
                <div style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: GOLD, color: '#171724' }}>
                  <Radio size={24} aria-hidden="true" />
                </div>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: started ? t.success : t.goldText, marginBottom: 3 }}>
                    {started ? 'HAPPENING NOW' : `STARTS ${startsIn(sessionStart(s) - now).toUpperCase()}`}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: t.text }}>{s.title || 'Tutoring session'}</div>
                  <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                    {timeLabel(start)} – {timeLabel(new Date(sessionEnd(s)))} · with {s.other_party_name || 'your tutor'}
                  </div>
                </div>
                <button type="button" style={{ ...goldButton, height: 46, padding: '0 24px', fontSize: 14.5 }} onClick={() => navigate(`/session/${s.id}`)}>
                  <Video size={18} aria-hidden="true" /> Join lesson
                </button>
              </div>
            )
          })}
        </section>
      )}

      <section>
        {sectionTitle('Upcoming lessons', later.length ? `${later.length} scheduled` : null)}
        {later.length === 0 ? (
          live.length ? null : empty(CalendarDays, 'No lessons scheduled', 'When your tutor schedules an online lesson with you, it will show up here. You can join from this page when it starts.')
        ) : (
          <div style={{ ...card, overflow: 'hidden' }}>
            {later.map((s, i) => (
              <div key={s.id} style={i === 0 ? { marginTop: -1 } : undefined}>
                <LessonRow s={s}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }} title={`Opens ${JOIN_EARLY_MIN} minutes before the start`}>
                    {startsIn(sessionStart(s) - now)}
                  </span>
                </LessonRow>
              </div>
            ))}
          </div>
        )}
      </section>

      {pastLessons.length > 0 && (
        <section>
          {sectionTitle('Past lessons')}
          <div style={{ ...card, overflow: 'hidden' }}>
            {pastLessons.map((s, i) => {
              const rec = recordingBySession.get(s.id)
              return (
                <div key={s.id} style={i === 0 ? { marginTop: -1 } : undefined}>
                  <LessonRow s={s}>
                    {rec ? (
                      <button type="button" style={quietButton} onClick={() => play(rec)}>
                        <PlayCircle size={15} aria-hidden="true" /> Watch recording
                      </button>
                    ) : s.recording_status === 'recording' || s.recording_status === 'processing' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.textMuted }}><Loader size={13} aria-hidden="true" /> Recording processing</span>
                    ) : null}
                  </LessonRow>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </>
  )

  const recordingsView = recordings.length === 0
    ? empty(Video, 'No recordings yet', 'When your tutor records a lesson, the video appears here a few minutes after the lesson ends.')
    : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {recordings.map(r => (
          <button key={r.id} type="button" onClick={() => play(r)}
            style={{ ...card, padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', fontFamily: FONT_B, display: 'flex', flexDirection: 'column' }}>
            <div style={{ aspectRatio: '16 / 9', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #12152a, #262b4a)', color: GOLD }}>
              <PlayCircle size={44} strokeWidth={1.5} aria-hidden="true" />
            </div>
            <div style={{ padding: '12px 14px 14px' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text, lineHeight: 1.35 }}>{r.title}</div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
                {r.tutor_name} · {new Date(r.created_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </button>
        ))}
      </div>
    )

  const resourcesView = otherResources.length === 0
    ? empty(Folder, 'No resources yet', 'Notes, worksheets and links your tutor shares with you will appear here.')
    : (
      <div style={{ ...card, overflow: 'hidden' }}>
        {otherResources.map((r, i) => {
          const Icon = RESOURCE_ICONS[r.type] || Folder
          const meta = [r.tutor_name, r.kind === 'link' ? 'Link' : formatSize(r.file_size), new Date(r.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderTop: i ? `1px solid ${t.border}` : 'none' }}>
              <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bgSubtle, color: t.goldText }}>
                <Icon size={18} aria-hidden="true" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                {r.description && <div style={{ fontSize: 12, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>}
                <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 2 }}>{meta}</div>
              </div>
              <a href={r.download_url || '#'} target="_blank" rel="noopener noreferrer" style={quietButton}>
                {r.kind === 'link' ? <LinkIcon size={14} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
                {r.kind === 'link' ? 'Open' : 'Download'}
              </a>
            </div>
          )
        })}
      </div>
    )

  const heading = {
    lessons: { title: 'Online Lessons', sub: 'Join live lessons with your tutor and catch up on past ones.' },
    recordings: { title: 'Recordings', sub: 'Watch your recorded lessons any time.' },
    resources: { title: 'Resources', sub: 'Notes, worksheets and links from your tutor.' },
  }[view]

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', fontFamily: FONT_B }}>
      <style>{`@media (max-width: 640px) { .gf-lesson-row { flex-wrap: wrap; } .gf-lesson-row > div:last-child { width: 100%; justify-content: flex-end; } }`}</style>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 20px 56px', display: 'flex', flexDirection: 'column', gap: 26 }}>
        <header>
          <h1 style={{ margin: 0, fontFamily: FONT_D, fontWeight: 400, fontSize: 26, letterSpacing: '0.03em', color: t.text }}>{heading.title}</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: t.textMuted }}>{heading.sub}</p>
        </header>

        {error ? (
          <div style={{ ...card, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 10, color: t.danger, fontSize: 13.5 }}>
            <CircleAlert size={18} aria-hidden="true" /> {error}
            <button type="button" style={{ ...quietButton, marginLeft: 'auto' }} onClick={() => { setLoading(true); load() }}>Try again</button>
          </div>
        ) : loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ ...card, height: 76, opacity: 0.6 }} />)}
          </div>
        ) : view === 'recordings' ? recordingsView : view === 'resources' ? resourcesView : lessonsView}
      </div>

      {playing && (
        <div role="dialog" aria-modal="true" aria-label={playing.resource.title}
          onClick={() => setPlaying(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(4,6,18,0.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(1100px, 100%)', borderRadius: 16, overflow: 'hidden', background: '#0b0d1a', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px 12px 18px', color: '#f5f6ff' }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playing.resource.title}</div>
              {playing.url && (
                <a href={playing.url} download={playing.resource.file_name || true} style={{ ...quietButton, color: '#f5f6ff', borderColor: 'rgba(255,255,255,0.18)' }}>
                  <Download size={14} aria-hidden="true" /> Download
                </a>
              )}
              <button type="button" onClick={() => setPlaying(null)} aria-label="Close" style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#f5f6ff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div style={{ aspectRatio: '16 / 9', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {playing.url
                ? <video src={playing.url} controls autoPlay playsInline style={{ width: '100%', height: '100%' }} />
                : <Loader size={28} color={GOLD} aria-label="Loading" />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
