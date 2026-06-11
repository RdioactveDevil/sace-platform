import { useMemo, useState } from 'react'
import { THEMES } from '../lib/theme'
import { notifyStudent } from '../lib/db'

const GOLD  = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

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
function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
function todayLabel() {
  return new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function OverviewTab({ profile, theme, roster, classes, assignments, resources, sessions, onNavigate, onJoinSession }) {
  const t = THEMES[theme]
  const [nudged, setNudged] = useState({})
  const isDark = theme === 'dark'

  const pending       = useMemo(() => assignments.filter(a => !a.completed_at), [assignments])
  const overdue       = useMemo(() => assignments.filter(isOverdue), [assignments])
  const dueThisWeek   = useMemo(() => {
    const wk = Date.now() + 7 * 86400000
    return pending.filter(a => a.due_date && new Date(a.due_date).getTime() <= wk).length
  }, [pending])

  const upcoming = useMemo(() => sessions
    .filter(s => (s.status === 'scheduled' || s.status === 'active') && s.scheduled_at && new Date(s.scheduled_at).getTime() > Date.now() - 3600000)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .slice(0, 4), [sessions])
  const sessionsToday = useMemo(() => sessions.filter(s => (s.status === 'scheduled' || s.status === 'active') && isToday(s.scheduled_at)).length, [sessions])

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

  /* ── Design tokens ───────────────────────────────────────────────────── */
  const card = isDark
    ? { background: 'rgba(255,255,255,0.028)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, boxShadow: '0 4px 32px rgba(0,0,0,0.44)' }
    : { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, boxShadow: t.shadowCard }

  const divider = isDark ? 'rgba(255,255,255,0.07)' : t.border
  const cardH   = { padding: '16px 22px', borderBottom: `1px solid ${divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }
  const h3      = { fontSize: 12, fontWeight: 400, color: t.text, fontFamily: FONT_D, letterSpacing: '0.06em', textTransform: 'uppercase' }
  const link    = { color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'none', border: 'none', fontFamily: FONT_B }
  const avatar  = (name, c) => (
    <div style={{ width: 36, height: 36, borderRadius: '50%', background: c || `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#0c1037', flexShrink: 0, fontSize: 14, boxShadow: '0 2px 10px rgba(241,190,67,0.25)' }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  )

  /* ── KPI definitions ────────────────────────────────────────────────── */
  const kpis = [
    {
      v: roster.length, l: 'Active Students', icon: '👥',
      sub: `${classes.length} class${classes.length !== 1 ? 'es' : ''}`,
      cls: '', color: GOLD,
    },
    {
      v: sessionsToday, l: 'Sessions Today', icon: '📹',
      sub: upcoming[0] ? `Next: ${fmtTime(upcoming[0].scheduled_at)}` : 'None scheduled',
      cls: 'td-kpi-sessions', color: '#a5b4fc',
    },
    {
      v: pending.length, l: 'Pending Tasks', icon: '📋',
      sub: `${dueThisWeek} due this week`,
      cls: '', color: GOLD,
    },
    {
      v: overdue.length, l: 'Overdue', icon: '⚠️',
      sub: `${needsAttention.length} student${needsAttention.length !== 1 ? 's' : ''} affected`,
      cls: 'td-kpi-danger', color: '#f87171', danger: true,
    },
  ]

  const actions = [
    { icon: '＋', iconBg: `linear-gradient(135deg,${GOLD},${GOLDL})`, iconColor: '#0c1037', t: 'Add student',      d: 'Invite by email',        to: 'students' },
    { icon: '📋', iconBg: 'rgba(129,140,248,0.18)',                    iconColor: '#a5b4fc',   t: 'New assignment',   d: 'Quiz · Test · HW',       to: 'assignments' },
    { icon: '📹', iconBg: 'rgba(52,211,153,0.16)',                     iconColor: '#6ee7b7',   t: 'Schedule session', d: '1:1 or group video',     to: 'sessions' },
    { icon: '📁', iconBg: 'rgba(251,191,36,0.14)',                     iconColor: GOLD,        t: 'Upload resource',  d: 'Notes · recordings',     to: 'resources' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <style>{`@font-face{font-family:'Sifonn Pro';src:url('/SIFONN_PRO.otf') format('opentype');font-display:swap;}`}</style>

      {/* ── Welcome hero ──────────────────────────────────────────────── */}
      <div className="td-fadein" style={{
        ...card,
        padding: '24px 28px',
        background: isDark
          ? 'linear-gradient(120deg, rgba(241,190,67,0.07) 0%, rgba(255,255,255,0.025) 60%)'
          : card.background,
        borderColor: isDark ? 'rgba(241,190,67,0.18)' : t.border,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontFamily: FONT_D, fontSize: 22, color: t.text, letterSpacing: '0.02em', lineHeight: 1.2, marginBottom: 6 }}>
            {greeting()}, <span style={{ color: GOLD }}>{profile.display_name?.split(' ')[0] || 'Tutor'}</span>
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, fontFamily: FONT_B }}>
            {todayLabel()} · {roster.length} student{roster.length !== 1 ? 's' : ''} on your roster
          </div>
        </div>
        {overdue.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 12, padding: '10px 16px' }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f87171', fontFamily: FONT_B }}>{overdue.length} overdue task{overdue.length !== 1 ? 's' : ''}</div>
              <div style={{ fontSize: 11, color: t.textMuted }}>{needsAttention.length} student{needsAttention.length !== 1 ? 's' : ''} need attention</div>
            </div>
          </div>
        )}
      </div>

      {/* ── KPI row ────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {kpis.map((k, i) => (
          <div key={k.l} className={`td-fadein td-fadein-${i + 1} td-kpi ${k.cls}`}
            style={{ ...card, padding: '24px 22px 20px', position: 'relative', overflow: 'hidden' }}>
            {/* Large background icon */}
            <span style={{ position: 'absolute', right: 14, bottom: 12, fontSize: 42, opacity: 0.07, pointerEvents: 'none', userSelect: 'none' }}>{k.icon}</span>
            {/* Number */}
            <div style={{ fontFamily: FONT_D, fontSize: 52, letterSpacing: '-1px', lineHeight: 1, color: k.color, marginBottom: 10, textShadow: isDark ? `0 0 32px ${k.color}44` : 'none' }}>{k.v}</div>
            {/* Label */}
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.10em', color: t.textMuted, marginBottom: 5 }}>{k.l}</div>
            {/* Sub */}
            <div style={{ fontSize: 12, fontWeight: 600, color: k.danger ? '#f87171' : t.textMuted }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Quick actions ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        {actions.map((a, i) => (
          <button key={a.t} className={`td-fadein td-fadein-${i + 1} td-action-tile`}
            onClick={() => onNavigate(a.to)}
            style={{ display: 'flex', alignItems: 'center', gap: 13, ...card, padding: '16px 18px', cursor: 'pointer', textAlign: 'left', fontFamily: FONT_B, color: t.text }}>
            <span style={{
              width: 42, height: 42, borderRadius: 12, background: a.iconBg,
              color: a.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, flexShrink: 0, fontWeight: 800,
            }}>{a.icon}</span>
            <span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: t.text, marginBottom: 2 }}>{a.t}</span>
              <span style={{ fontSize: 11, color: t.textMuted }}>{a.d}</span>
            </span>
          </button>
        ))}
      </div>

      {/* ── Two-column grid ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }} className="ov-grid">
        <style>{`@media (max-width: 900px){ .ov-grid{ grid-template-columns: 1fr !important; } }`}</style>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Needs attention */}
          <div className="td-panel" style={card}>
            <div style={cardH}>
              <div style={h3}>⚠️ Needs attention</div>
              <button style={link} onClick={() => onNavigate('assignments')}>View all</button>
            </div>
            {needsAttention.length === 0 ? (
              <div style={{ padding: '32px 24px', textAlign: 'center', color: t.textMuted, fontSize: 13 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
                Nobody's behind — all tasks are on track.
              </div>
            ) : needsAttention.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 22px', borderBottom: `1px solid ${divider}` }}>
                {avatar(s.name)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>{s.count} overdue task{s.count !== 1 ? 's' : ''}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'rgba(248,113,113,0.14)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}>Overdue</span>
                <button onClick={() => handleNudge(s.id)} disabled={!!nudged[s.id]}
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: nudged[s.id] === 'sent' ? 'rgba(74,222,128,0.15)' : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: nudged[s.id] === 'sent' ? '#4ade80' : '#0c1037', fontSize: 12, fontWeight: 800, cursor: nudged[s.id] ? 'default' : 'pointer', fontFamily: FONT_B, transition: 'opacity 0.15s' }}>
                  {nudged[s.id] === 'sending' ? '…' : nudged[s.id] === 'sent' ? '✓ Sent' : nudged[s.id] === 'fail' ? 'Retry' : 'Nudge'}
                </button>
              </div>
            ))}
          </div>

          {/* Recent activity */}
          <div className="td-panel" style={card}>
            <div style={cardH}><div style={h3}>Recent activity</div></div>
            {recent.length === 0 ? (
              <div style={{ padding: '32px 24px', textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No recent activity yet.</div>
            ) : (
              <div style={{ padding: '4px 22px 10px' }}>
                {recent.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 13, padding: '11px 0', borderBottom: i < recent.length - 1 ? `1px solid ${divider}` : 'none', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 16, marginTop: 1 }}>{r.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: t.text, fontWeight: 500 }}>{r.text}</div>
                      <div style={{ fontSize: 11, color: t.textFaint, marginTop: 3 }}>{fmtDate(r.ts)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Sessions */}
          <div className="td-panel" style={card}>
            <div style={cardH}>
              <div style={h3}>📹 Today &amp; upcoming</div>
              <button style={link} onClick={() => onNavigate('sessions')}>All</button>
            </div>
            {upcoming.length === 0 ? (
              <div style={{ padding: '32px 24px', textAlign: 'center', color: t.textMuted, fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                No upcoming sessions.
              </div>
            ) : upcoming.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 22px', borderBottom: `1px solid ${divider}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || 'Tutoring Session'}</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{fmtTime(s.scheduled_at)} · {s.other_party_name || 'Student'}</div>
                </div>
                {(s.recording_status === 'recording' || s.record_session) && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.22)', flexShrink: 0 }}>🔴</span>
                )}
                <button onClick={() => onJoinSession(s.id)} className="btn-gold-shimmer"
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: '#0c1037', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B, flexShrink: 0 }}>
                  Join
                </button>
              </div>
            ))}
          </div>

          {/* Recent resources */}
          <div className="td-panel" style={card}>
            <div style={cardH}>
              <div style={h3}>📁 Recent resources</div>
              <button style={link} onClick={() => onNavigate('resources')}>All</button>
            </div>
            {resources.length === 0 ? (
              <div style={{ padding: '32px 24px', textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No resources yet.</div>
            ) : resources.slice(0, 4).map(r => {
              const icon = { notes: '📝', worksheet: '📄', recording: '🎥', slides: '📊', resource: '📁', link: '🔗' }[r.type] || '📁'
              const target = r.student_name ? `👤 ${r.student_name}` : r.class_name ? `🏫 ${r.class_name}` : '👥 Roster'
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 22px', borderBottom: `1px solid ${divider}` }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{target} · {fmtDate(r.created_at)}</div>
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
