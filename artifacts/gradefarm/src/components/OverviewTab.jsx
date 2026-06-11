import { useMemo, useState } from 'react'
import { THEMES } from '../lib/theme'
import { notifyStudent } from '../lib/db'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-AU', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}
function isToday(iso) {
  if (!iso) return false
  const d = new Date(iso), n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}
function isOverdue(a) {
  if (a.completed_at || !a.due_date) return false
  const due = new Date(a.due_date); due.setHours(23, 59, 59, 999)
  return due.getTime() < Date.now()
}

export default function OverviewTab({ profile, theme, roster, classes, assignments, resources, sessions, onNavigate, onJoinSession }) {
  const t = THEMES[theme]
  const [nudged, setNudged] = useState({})

  const pending = useMemo(() => assignments.filter(a => !a.completed_at), [assignments])
  const overdue = useMemo(() => assignments.filter(isOverdue), [assignments])
  const dueThisWeek = useMemo(() => {
    const wk = Date.now() + 7 * 86400000
    return pending.filter(a => a.due_date && new Date(a.due_date).getTime() <= wk).length
  }, [pending])

  const upcoming = useMemo(() => sessions
    .filter(s => (s.status === 'scheduled' || s.status === 'active') && s.scheduled_at && new Date(s.scheduled_at).getTime() > Date.now() - 3600000)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .slice(0, 4), [sessions])
  const sessionsToday = useMemo(() => sessions.filter(s => (s.status === 'scheduled' || s.status === 'active') && isToday(s.scheduled_at)).length, [sessions])

  // Needs attention — students ranked by overdue task count.
  const needsAttention = useMemo(() => {
    const byStudent = {}
    for (const a of overdue) {
      byStudent[a.student_id] = byStudent[a.student_id] || { count: 0, name: a.profiles?.display_name }
      byStudent[a.student_id].count++
    }
    return Object.entries(byStudent)
      .map(([id, v]) => {
        const r = roster.find(x => x.student_id === id)
        return { id, name: v.name || r?.profiles?.display_name || 'Student', count: v.count }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [overdue, roster])

  const recent = useMemo(() => {
    const items = []
    for (const a of assignments) {
      if (a.completed_at) items.push({ ts: a.completed_at, icon: '✅', text: `${a.profiles?.display_name || 'A student'} completed ${a.type}` })
    }
    for (const r of resources) {
      items.push({ ts: r.created_at, icon: r.kind === 'link' ? '🔗' : '📁', text: `${r.title} added to Resources` })
    }
    return items.filter(i => i.ts).sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 6)
  }, [assignments, resources])

  const handleNudge = async (id) => {
    setNudged(n => ({ ...n, [id]: 'sending' }))
    const res = await notifyStudent(id)
    setNudged(n => ({ ...n, [id]: res.ok ? 'sent' : 'fail' }))
  }

  const card = theme === 'dark'
    ? { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, boxShadow: '0 4px 28px rgba(0,0,0,0.40)' }
    : { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, boxShadow: t.shadowCard }
  const divider = theme === 'dark' ? 'rgba(255,255,255,0.07)' : t.border
  const cardH = { padding: '15px 20px', borderBottom: `1px solid ${divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }
  const h3 = { fontSize: 13, fontWeight: 400, color: t.text, fontFamily: "'Sifonn Pro', sans-serif", letterSpacing: '0.04em' }
  const link = { color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'none', border: 'none', fontFamily: FONT_B }
  const avatar = (name, c) => (
    <div style={{ width: 36, height: 36, borderRadius: '50%', background: c || `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#0c1037', flexShrink: 0, fontSize: 14 }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  )

  const kpis = [
    { v: roster.length, l: 'Active students', icon: '👥', sub: `${classes.length} class${classes.length !== 1 ? 'es' : ''}` },
    { v: sessionsToday, l: 'Sessions today', icon: '📹', sub: upcoming[0] ? `Next ${fmtTime(upcoming[0].scheduled_at)}` : 'None scheduled' },
    { v: pending.length, l: 'Pending assignments', icon: '📋', sub: `${dueThisWeek} due this week`, accent: GOLD },
    { v: overdue.length, l: 'Overdue', icon: '⚠️', danger: true, sub: `${needsAttention.length} student${needsAttention.length !== 1 ? 's' : ''}` },
  ]
  const actions = [
    { icon: '＋', t: 'Add student', d: 'Invite by email', to: 'students' },
    { icon: '📋', t: 'New assignment', d: 'Quiz · Test · HW', to: 'assignments' },
    { icon: '📹', t: 'Schedule session', d: '1:1 or group', to: 'sessions' },
    { icon: '📁', t: 'Upload resource', d: 'Notes · recording', to: 'resources' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
        {kpis.map((k, i) => (
          <div key={k.l} className={`td-fadein td-fadein-${i + 1}`} style={{ ...card, padding: '18px 20px', borderColor: k.danger ? 'rgba(248,113,113,0.3)' : (theme === 'dark' ? 'rgba(255,255,255,0.07)' : t.border), position: 'relative', overflow: 'hidden' }}>
            <span style={{ position: 'absolute', right: 14, top: 14, fontSize: 20, opacity: 0.35 }}>{k.icon}</span>
            <div style={{ fontSize: 32, fontFamily: "'Sifonn Pro', sans-serif", letterSpacing: '-0.5px', lineHeight: 1, color: k.danger ? t.danger : GOLD }}>{k.v}</div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k.l}</div>
            <div style={{ fontSize: 11, marginTop: 6, fontWeight: 600, color: k.danger ? t.danger : k.accent || t.textMuted }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        {actions.map((a, i) => (
          <button key={a.t} className={`td-fadein td-fadein-${i + 1}`} onClick={() => onNavigate(a.to)}
            style={{ display: 'flex', alignItems: 'center', gap: 11, ...card, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: FONT_B, color: t.text, transition: 'border-color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(241,190,67,0.45)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(255,255,255,0.07)' : t.border }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(241,190,67,0.14)', color: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{a.icon}</span>
            <span><span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>{a.t}</span><span style={{ fontSize: 11, color: t.textMuted }}>{a.d}</span></span>
          </button>
        ))}
      </div>

      {/* Two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }} className="ov-grid">
        <style>{`@media (max-width: 900px){ .ov-grid{ grid-template-columns: 1fr !important; } }`}</style>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={card}>
            <div style={cardH}><div style={h3}>⚠️ Needs attention</div><button style={link} onClick={() => onNavigate('assignments')}>View all</button></div>
            {needsAttention.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>🎉 Nobody's behind — no overdue tasks.</div>
            ) : needsAttention.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 20px', borderBottom: `1px solid ${divider}` }}>
                {avatar(s.name)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>{s.count} overdue task{s.count !== 1 ? 's' : ''}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: t.dangerBg, color: t.danger }}>Overdue</span>
                <button onClick={() => handleNudge(s.id)} disabled={!!nudged[s.id]}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: nudged[s.id] === 'sent' ? t.successBg : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: nudged[s.id] === 'sent' ? t.success : '#0c1037', fontSize: 12, fontWeight: 800, cursor: nudged[s.id] ? 'default' : 'pointer', fontFamily: FONT_B }}>
                  {nudged[s.id] === 'sending' ? '…' : nudged[s.id] === 'sent' ? '✓ Sent' : nudged[s.id] === 'fail' ? 'Retry' : 'Nudge'}
                </button>
              </div>
            ))}
          </div>

          <div style={card}>
            <div style={cardH}><div style={h3}>Recent activity</div></div>
            {recent.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No recent activity yet.</div>
            ) : (
              <div style={{ padding: '6px 20px' }}>
                {recent.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < recent.length - 1 ? `1px solid ${divider}` : 'none' }}>
                    <span style={{ fontSize: 16 }}>{r.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: t.text }}>{r.text}</div>
                      <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>{fmtDate(r.ts)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={card}>
            <div style={cardH}><div style={h3}>📹 Today &amp; upcoming</div><button style={link} onClick={() => onNavigate('sessions')}>All</button></div>
            {upcoming.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No upcoming sessions.</div>
            ) : upcoming.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: `1px solid ${divider}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || 'Tutoring Session'}</div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>{fmtTime(s.scheduled_at)} · {s.other_party_name || 'Student'}</div>
                </div>
                {(s.recording_status === 'recording' || s.record_session) && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: t.successBg, color: t.success }}>🔴 Records</span>
                )}
                <button onClick={() => onJoinSession(s.id)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: '#0c1037', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>Join</button>
              </div>
            ))}
          </div>

          <div style={card}>
            <div style={cardH}><div style={h3}>📁 Recent resources</div><button style={link} onClick={() => onNavigate('resources')}>All</button></div>
            {resources.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No resources yet.</div>
            ) : resources.slice(0, 4).map(r => {
              const icon = { notes: '📝', worksheet: '📄', recording: '🎥', slides: '📊', resource: '📁', link: '🔗' }[r.type] || '📁'
              const target = r.student_name ? `👤 ${r.student_name}` : r.class_name ? `🏫 ${r.class_name}` : '👥 Roster'
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: `1px solid ${divider}` }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: t.textMuted }}>{target} · {fmtDate(r.created_at)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
