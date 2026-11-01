import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Video, Users, User, Download, X, Loader, CircleAlert } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { fetchTutoringSessions, fetchStudentResources, getTutorResourceDownloadUrl } from '../lib/db'

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

/**
 * The Student Portal's Lessons tab: lessons coming up (Join when they're
 * live), past lessons with their recordings, and the files tutors share.
 * /recordings and /class-resources open here too.
 */
export default function StudentLessonsScreen({ theme, active = true }) {
  const t = THEMES[theme]
  const location = useLocation()
  const navigate = useNavigate()
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

  // Recordings that don't sit on a past lesson below (older, or not tied to one).
  const pastIds = new Set(pastLessons.map(s => s.id))
  const looseRecordings = recordings.filter(r => !r.session_id || !pastIds.has(r.session_id))

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12 }
  const sectionTitle = (text, extra) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, margin: '0 0 8px' }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: t.text }}>{text}</h2>
      {extra && <span style={{ fontSize: 12.5, color: t.textMuted }}>{extra}</span>}
    </div>
  )
  const emptyLine = (text) => <div style={{ ...card, padding: '16px 18px', fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>{text}</div>
  const goldButton = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 9, border: 'none', background: t.accent, color: '#0c1037', fontFamily: FONT_B, fontSize: 13.5, fontWeight: 800, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' }
  const linkAction = { border: 'none', background: 'none', padding: 0, fontFamily: FONT_B, fontSize: 13, fontWeight: 700, color: t.text, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: t.accent, textDecorationThickness: 2, textUnderlineOffset: 3, whiteSpace: 'nowrap' }
  const dateLabel = (d) => d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })

  const DateBlock = ({ date }) => (
    <div aria-hidden="true" style={{ width: 40, flexShrink: 0, textAlign: 'center', lineHeight: 1.1 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.textMuted }}>{date.toLocaleDateString([], { month: 'short' })}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: t.text, fontVariantNumeric: 'tabular-nums' }}>{date.getDate()}</div>
    </div>
  )
  const Row = ({ first, children }) => (
    <div className="gf-lesson-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderTop: first ? 'none' : `1px solid ${t.border}` }}>{children}</div>
  )
  const lessonMeta = (s) => {
    const start = new Date(s.scheduled_at)
    const type = typeLabel(s)
    return `${dateLabel(start)}, ${timeLabel(start)} · ${s.duration_minutes || 60} min · ${type.text === '1:1' ? 'one-on-one' : type.text.toLowerCase()} with ${s.other_party_name || 'your tutor'}`
  }

  const body = (
    <>
      {live.map(s => {
        const started = now >= sessionStart(s) || s.status === 'active'
        return (
          <div key={s.id} style={{ ...card, borderColor: t.text, boxShadow: `0 0 0 1px ${t.text}`, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: started ? t.success : t.textMuted }}>{started ? 'Happening now' : `Starts ${startsIn(sessionStart(s) - now)}`}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: t.text, marginTop: 2 }}>{s.title || 'Tutoring session'}</div>
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>{timeLabel(new Date(s.scheduled_at))} to {timeLabel(new Date(sessionEnd(s)))} · with {s.other_party_name || 'your tutor'}</div>
            </div>
            <button type="button" style={goldButton} onClick={() => navigate(`/session/${s.id}`)}><Video size={16} aria-hidden="true" /> Join lesson</button>
          </div>
        )
      })}

      <section>
        {sectionTitle('Coming up', later.length ? `${later.length} scheduled` : null)}
        {later.length === 0
          ? (live.length ? null : emptyLine('No lessons scheduled. When your tutor books an online lesson, it shows here, and you can join from here when it starts.'))
          : (
            <div style={card}>
              {later.map((s, i) => (
                <Row key={s.id} first={i === 0}>
                  <DateBlock date={new Date(s.scheduled_at)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || 'Tutoring session'}</div>
                    <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>{lessonMeta(s)}</div>
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: t.textMuted, whiteSpace: 'nowrap' }} title={`You can join ${JOIN_EARLY_MIN} minutes before it starts`}>
                    {(() => { const x = startsIn(sessionStart(s) - now); return x[0].toUpperCase() + x.slice(1) })()}
                  </span>
                </Row>
              ))}
            </div>
          )}
      </section>

      {(pastLessons.length > 0 || looseRecordings.length > 0) && (
        <section>
          {sectionTitle('Past lessons')}
          <div style={card}>
            {pastLessons.map((s, i) => {
              const rec = recordingBySession.get(s.id)
              return (
                <Row key={s.id} first={i === 0}>
                  <DateBlock date={new Date(s.scheduled_at)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || 'Tutoring session'}</div>
                    <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>{lessonMeta(s)}</div>
                  </div>
                  {rec ? (
                    <button type="button" style={linkAction} onClick={() => play(rec)}>Watch recording</button>
                  ) : s.recording_status === 'recording' || s.recording_status === 'processing' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: t.textMuted }}><Loader size={13} aria-hidden="true" /> Recording on its way</span>
                  ) : s.recording_status === 'failed' ? (
                    <span style={{ fontSize: 12.5, color: t.textMuted }}>Recording unavailable</span>
                  ) : null}
                </Row>
              )
            })}
            {looseRecordings.map((r, i) => (
              <Row key={r.id} first={pastLessons.length === 0 && i === 0}>
                <DateBlock date={new Date(r.created_at)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                  <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>Recording · {r.tutor_name}</div>
                </div>
                <button type="button" style={linkAction} onClick={() => play(r)}>Watch recording</button>
              </Row>
            ))}
          </div>
        </section>
      )}

      <section id="files">
        {sectionTitle(otherResources.length ? 'Files from your tutor' : 'Files', otherResources.length ? `${otherResources.length}` : null)}
        {otherResources.length === 0 ? emptyLine('Notes, worksheets and links your tutor shares show here.') : (
          <div style={card}>
            {otherResources.map((r, i) => {
              const meta = [r.kind === 'link' ? 'Link' : (r.type && r.type !== 'resource' ? r.type[0].toUpperCase() + r.type.slice(1) : null), r.kind === 'link' ? null : formatSize(r.file_size), r.tutor_name, new Date(r.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')
              return (
                <Row key={r.id} first={i === 0}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    {r.description && <div style={{ fontSize: 12.5, color: t.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>}
                    <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>{meta}</div>
                  </div>
                  <a href={r.download_url || '#'} target="_blank" rel="noopener noreferrer" style={linkAction}>{r.kind === 'link' ? 'Open' : 'Download'}</a>
                </Row>
              )
            })}
          </div>
        )}
      </section>
    </>
  )

  // Old links to Recordings and Resources open here, at that part.
  useEffect(() => {
    if (!active || loading || location.pathname !== '/class-resources') return
    document.getElementById('files')?.scrollIntoView({ block: 'start' })
  }, [active, loading, location.pathname])

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', fontFamily: FONT_B, background: t.bg }}>
      <style>{`@media (max-width: 640px) { .gf-lesson-row { flex-wrap: wrap; row-gap: 6px; } .gf-lesson-row > div:nth-child(2) { flex: 1 1 calc(100% - 54px) !important; } .gf-lesson-row > :nth-child(3) { margin-left: 54px; } }`}</style>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: t.text }}>Lessons</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: t.textMuted }}>Online lessons with your tutor, their recordings, and the files they share.</p>
        </header>

        {error ? (
          <div role="alert" style={{ ...card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, color: t.danger, fontSize: 13.5, flexWrap: 'wrap' }}>
            <CircleAlert size={18} aria-hidden="true" /> {error}
            <button type="button" style={{ ...linkAction, marginLeft: 'auto' }} onClick={() => { setLoading(true); load() }}>Try again</button>
          </div>
        ) : loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ ...card, height: 64, opacity: 0.6 }} />)}
          </div>
        ) : body}
      </div>

      {playing && (
        <div role="dialog" aria-modal="true" aria-label={playing.resource.title}
          onClick={() => setPlaying(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(4,6,18,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(1100px, 100%)', borderRadius: 14, overflow: 'hidden', background: '#0b0d1a', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px 10px 16px', color: '#f5f6ff' }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playing.resource.title}</div>
              {playing.url && (
                <a href={playing.url} download={playing.resource.file_name || true} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)', color: '#f5f6ff', fontFamily: FONT_B, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                  <Download size={14} aria-hidden="true" /> Download
                </a>
              )}
              <button type="button" onClick={() => setPlaying(null)} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#f5f6ff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div style={{ aspectRatio: '16 / 9', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {playing.url
                ? <video src={playing.url} controls autoPlay playsInline style={{ width: '100%', height: '100%' }} />
                : <Loader size={28} color="#f1be43" aria-label="Loading" />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
