import { useMemo, useState } from 'react'
import { THEMES } from '../lib/theme'
import { notifyStudent } from '../lib/db'

const GOLD  = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"
const INDIGO = '#6366f1'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-AU', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtTimeShort(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}
function isToday(iso) {
  if (!iso) return false
  const d = new Date(iso), n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}
function isTomorrow(iso) {
  if (!iso) return false
  const d = new Date(iso), n = new Date()
  const tom = new Date(n); tom.setDate(n.getDate() + 1)
  return d.getFullYear() === tom.getFullYear() && d.getMonth() === tom.getMonth() && d.getDate() === tom.getDate()
}
function sessionDateLabel(iso) {
  if (!iso) return ''
  if (isToday(iso)) return 'Today'
  if (isTomorrow(iso)) return 'Tomorrow'
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}
function isOverdue(a) {
  if (a.completed_at || !a.due_date) return false
  const due = new Date(a.due_date); due.setHours(23, 59, 59, 999)
  return due.getTime() < Date.now()
}
function isStartingSoon(iso) {
  if (!iso) return false
  const diff = new Date(iso).getTime() - Date.now()
  return diff > 0 && diff < 30 * 60 * 1000
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

  const pending     = useMemo(() => assignments.filter(a => !a.completed_at), [assignments])
  const completed   = useMemo(() => assignments.filter(a => !!a.completed_at), [assignments])
  const overdue     = useMemo(() => assignments.filter(isOverdue), [assignments])
  const dueThisWeek = useMemo(() => {
    const wk = Date.now() + 7 * 86400000
    return pending.filter(a => a.due_date && new Date(a.due_date).getTime() <= wk).length
  }, [pending])
  const completionRate = useMemo(() => {
    const total = assignments.length
    return total ? Math.round((completed.length / total) * 100) : 0
  }, [assignments, completed])

  const upcoming = useMemo(() => sessions
    .filter(s => (s.status === 'scheduled' || s.status === 'active') && s.scheduled_at && new Date(s.scheduled_at).getTime() > Date.now() - 3600000)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .slice(0, 5), [sessions])
  const sessionsThisWeek = useMemo(() => {
    const wk = Date.now() + 7 * 86400000
    return sessions.filter(s => s.scheduled_at && new Date(s.scheduled_at).getTime() < wk && new Date(s.scheduled_at).getTime() > Date.now() - 7 * 86400000).length
  }, [sessions])

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
      .slice(0, 6)
  }, [overdue, roster])

  const handleNudge = async (id) => {
    setNudged(n => ({ ...n, [id]: 'sending' }))
    const res = await notifyStudent(id)
    setNudged(n => ({ ...n, [id]: res.ok ? 'sent' : 'fail' }))
  }

  /* ── Design tokens ───────────────────────────────────────────────────── */
  const card = isDark
    ? { background: 'rgba(255,255,255,0.028)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, boxShadow: '0 4px 32px rgba(0,0,0,0.44)' }
    : { background: '#ffffff', border: '1px solid #e2e6ed', borderRadius: 12, boxShadow: '0 4px 24px -4px rgba(0,0,0,0.03), 0 0 1px rgba(0,0,0,0.08)' }

  const divider    = isDark ? 'rgba(255,255,255,0.07)' : '#f1f4f9'
  const accent     = isDark ? GOLD : INDIGO
  const accentSoft = isDark ? 'rgba(241,190,67,0.14)' : '#eef2ff'
  const textPri    = isDark ? 'rgba(255,255,255,0.92)' : '#0f172a'
  const textSub    = isDark ? 'rgba(255,255,255,0.52)' : '#64748b'
  const textMuted  = isDark ? 'rgba(255,255,255,0.35)' : '#94a3b8'

  const sectionHdr = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
  }
  const h2style = { fontSize: 14, fontWeight: 700, color: textPri, fontFamily: FONT_B, margin: 0 }
  const linkBtn = {
    fontSize: 13, color: accent, fontWeight: 600, cursor: 'pointer',
    background: 'none', border: 'none', fontFamily: FONT_B, padding: 0,
  }

  /* ── Weekly session bar chart data (last 7 days) ─────────────────────── */
  const weekBars = useMemo(() => {
    const bars = Array(7).fill(0)
    const now = new Date()
    for (const s of sessions) {
      if (!s.scheduled_at) continue
      const d = new Date(s.scheduled_at)
      const diff = Math.floor((now - d) / 86400000)
      if (diff >= 0 && diff < 7) bars[6 - diff]++
    }
    const mx = Math.max(...bars, 1)
    return bars.map(v => Math.round((v / mx) * 100))
  }, [sessions])

  /* ── KPI definitions ─────────────────────────────────────────────────── */
  const kpis = [
    {
      title: 'Active Students',
      value: roster.length,
      trend: `${classes.length} class${classes.length !== 1 ? 'es' : ''}`,
      trendUp: true,
      color: isDark ? GOLD : INDIGO,
      sparkColor: isDark ? GOLD : INDIGO,
      sparkFill: isDark ? 'rgba(241,190,67,0.08)' : '#eef2ff',
      sparkline: (
        <svg viewBox="0 0 100 30" style={{ width: '100%', height: 32 }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M0,25 L15,20 L30,22 L45,15 L60,18 L75,10 L90,12 L100,5" stroke={isDark ? GOLD : INDIGO} />
          <path d="M0,25 L15,20 L30,22 L45,15 L60,18 L75,10 L90,12 L100,5 L100,30 L0,30 Z" fill={isDark ? 'rgba(241,190,67,0.08)' : '#eef2ff'} />
        </svg>
      ),
    },
    {
      title: 'Overdue Tasks',
      value: overdue.length,
      trend: overdue.length ? `${needsAttention.length} student${needsAttention.length !== 1 ? 's' : ''} affected` : 'All on track',
      trendUp: overdue.length === 0,
      alert: overdue.length > 0,
      color: '#f59e0b',
      sparkline: (
        <svg viewBox="0 0 100 30" style={{ width: '100%', height: 32 }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M0,5 L20,15 L40,10 L60,25 L80,20 L100,28" stroke="#f59e0b" />
          <path d="M0,5 L20,15 L40,10 L60,25 L80,20 L100,28 L100,30 L0,30 Z" fill="rgba(245,158,11,0.08)" />
        </svg>
      ),
    },
    {
      title: 'Sessions This Week',
      value: sessionsThisWeek,
      trend: `${upcoming.length} upcoming`,
      trendUp: true,
      color: isDark ? '#a5b4fc' : INDIGO,
      sparkline: (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 32, gap: 3, paddingTop: 4 }}>
          {weekBars.map((h, i) => (
            <div key={i} style={{ flex: 1, background: isDark ? 'rgba(165,180,252,0.12)' : '#e0e7ff', borderRadius: '3px 3px 0 0', display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ width: '100%', background: isDark ? '#a5b4fc' : INDIGO, borderRadius: '3px 3px 0 0', height: `${h}%`, minHeight: h ? 3 : 0 }} />
            </div>
          ))}
        </div>
      ),
    },
    {
      title: 'Completion Rate',
      value: `${completionRate}%`,
      trend: `${completed.length} of ${assignments.length} done`,
      trendUp: completionRate >= 70,
      color: isDark ? '#6ee7b7' : '#10b981',
      sparkline: (
        <svg viewBox="0 0 100 30" style={{ width: '100%', height: 32 }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M0,20 L20,22 L40,15 L60,18 L80,8 L100,5" stroke={isDark ? '#6ee7b7' : '#10b981'} />
          <path d="M0,20 L20,22 L40,15 L60,18 L80,8 L100,5 L100,30 L0,30 Z" fill={isDark ? 'rgba(110,231,183,0.08)' : '#ecfdf5'} />
        </svg>
      ),
    },
  ]

  /* ── Assignment stats for right sidebar ──────────────────────────────── */
  const total = assignments.length || 1
  const statBars = [
    { label: 'Completed', value: completed.length, pct: Math.round((completed.length / total) * 100), color: isDark ? '#6ee7b7' : '#10b981', bg: isDark ? 'rgba(110,231,183,0.12)' : '#ecfdf5' },
    { label: 'Pending', value: pending.length - overdue.length, pct: Math.round(((pending.length - overdue.length) / total) * 100), color: isDark ? '#a5b4fc' : INDIGO, bg: isDark ? 'rgba(165,180,252,0.12)' : '#eef2ff' },
    { label: 'Overdue', value: overdue.length, pct: Math.round((overdue.length / total) * 100), color: '#f87171', bg: 'rgba(248,113,113,0.10)', warn: overdue.length > 0 },
  ]

  const actions = [
    { icon: '📋', label: 'New Assignment', to: 'assignments', color: isDark ? 'rgba(165,180,252,0.18)' : '#eef2ff', iconColor: isDark ? '#a5b4fc' : INDIGO },
    { icon: '👤', label: 'Add Student',    to: 'students',    color: isDark ? 'rgba(241,190,67,0.14)' : '#fffbeb', iconColor: isDark ? GOLD : '#f59e0b' },
    { icon: '📹', label: 'Schedule',       to: 'sessions',    color: isDark ? 'rgba(110,231,183,0.12)' : '#ecfdf5', iconColor: isDark ? '#6ee7b7' : '#10b981' },
    { icon: '📊', label: 'Diagnostic',     to: 'diagnostic',  color: isDark ? 'rgba(248,113,113,0.12)' : '#fff1f2', iconColor: isDark ? '#f87171' : '#ef4444' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: FONT_B }}>
      <style>{`@font-face{font-family:'Sifonn Pro';src:url('/SIFONN_PRO.otf') format('opentype');font-display:swap;}`}</style>

      {/* ── Greeting strip ───────────────────────────────────────────── */}
      <div className="td-fadein" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: textPri, lineHeight: 1.2 }}>
            {greeting()}, <span style={{ color: accent }}>{profile.display_name?.split(' ')[0] || 'Tutor'}</span>
          </div>
          <div style={{ fontSize: 13, color: textMuted, marginTop: 3 }}>{todayLabel()} · {roster.length} student{roster.length !== 1 ? 's' : ''} on your roster</div>
        </div>
        {overdue.length > 0 && (
          <button onClick={() => onNavigate('assignments')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: isDark ? 'rgba(248,113,113,0.10)' : '#fff1f2', border: isDark ? '1px solid rgba(248,113,113,0.25)' : '1px solid #fecaca', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontFamily: FONT_B }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>{overdue.length} overdue task{overdue.length !== 1 ? 's' : ''}</div>
              <div style={{ fontSize: 11, color: textMuted }}>Tap to review</div>
            </div>
          </button>
        )}
      </div>

      {/* ── KPI row ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        {kpis.map((k, i) => (
          <div key={k.title} className={`td-fadein td-fadein-${i + 1}`}
            style={{ ...card, padding: '18px 18px 14px', cursor: 'default',
              transition: 'transform 0.18s ease, box-shadow 0.18s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = isDark ? '0 12px 48px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.10)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = card.boxShadow }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: textMuted, marginBottom: 6 }}>{k.title}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color, lineHeight: 1, marginBottom: 12, letterSpacing: '-0.5px' }}>{k.value}</div>
            <div style={{ marginBottom: 10 }}>{k.sparkline}</div>
            <div style={{ fontSize: 12, color: k.alert ? '#f59e0b' : k.trendUp ? (isDark ? '#6ee7b7' : '#10b981') : textMuted, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
              {k.alert ? <span>⚠</span> : k.trendUp ? <span>↑</span> : null}
              {k.trend}
            </div>
          </div>
        ))}
      </div>

      {/* ── Body: 2/3 + 1/3 grid ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }} className="ov-grid">
        <style>{`@media (max-width: 860px){ .ov-grid{ grid-template-columns: 1fr !important; } }`}</style>

        {/* ── Left column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Upcoming Sessions */}
          <section className="td-fadein td-fadein-2">
            <div style={sectionHdr}>
              <h2 style={h2style}>Upcoming Sessions</h2>
              <button style={linkBtn} onClick={() => onNavigate('sessions')}>View calendar →</button>
            </div>
            <div style={card}>
              {upcoming.length === 0 ? (
                <div style={{ padding: '36px 24px', textAlign: 'center', color: textMuted, fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  No upcoming sessions scheduled.
                </div>
              ) : upcoming.map((s, idx) => {
                const soon = isStartingSoon(s.scheduled_at)
                return (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
                    borderBottom: idx < upcoming.length - 1 ? `1px solid ${divider}` : 'none',
                    transition: 'background 0.12s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.025)' : '#fafbff'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Time column */}
                    <div style={{ width: 64, flexShrink: 0, textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: textPri }}>{fmtTimeShort(s.scheduled_at)}</div>
                      <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>{sessionDateLabel(s.scheduled_at)}</div>
                    </div>
                    <div style={{ width: 1, height: 32, background: divider, flexShrink: 0 }} />
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: textPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.title || 'Tutoring Session'}
                        </span>
                        {soon && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: isDark ? 'rgba(245,158,11,0.15)' : '#fffbeb', color: '#f59e0b', border: isDark ? '1px solid rgba(245,158,11,0.25)' : '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b', animation: 'pulse 1.5s infinite', display: 'inline-block' }} />
                            Starting soon
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: textMuted }}>
                        <span>👤 {s.other_party_name || 'Student'}</span>
                        <span>📹 {s.type === 'group' ? 'Group' : '1-on-1'}</span>
                        {s.record_session && <span style={{ color: '#f87171' }}>🔴 Recording</span>}
                      </div>
                    </div>
                    {/* Action */}
                    <div style={{ flexShrink: 0 }}>
                      {soon ? (
                        <button onClick={() => onJoinSession(s.id)}
                          style={{ padding: '7px 16px', background: isDark ? `linear-gradient(135deg,${GOLD},${GOLDL})` : INDIGO, color: isDark ? '#0c1037' : '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
                          Join
                        </button>
                      ) : (
                        <button onClick={() => onNavigate('sessions')}
                          style={{ padding: '7px 16px', background: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc', color: textSub, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : '#e2e8f0'}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
                          Details
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Students needing attention */}
          <section className="td-fadein td-fadein-3">
            <div style={sectionHdr}>
              <h2 style={h2style}>Overdue Students</h2>
              <button style={linkBtn} onClick={() => onNavigate('assignments')}>View all →</button>
            </div>
            <div style={card}>
              {needsAttention.length === 0 ? (
                <div style={{ padding: '36px 24px', textAlign: 'center', color: textMuted, fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                  All students are on track.
                </div>
              ) : (
                <>
                  {/* Table header */}
                  <div style={{ padding: '10px 20px', borderBottom: `1px solid ${divider}`, background: isDark ? 'rgba(255,255,255,0.015)' : '#fafbff' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: textMuted }}>
                      <div>Student</div>
                      <div style={{ textAlign: 'center' }}>Overdue</div>
                      <div style={{ textAlign: 'right' }}>Action</div>
                    </div>
                  </div>
                  {needsAttention.map((s, idx) => (
                    <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, alignItems: 'center', padding: '13px 20px', borderBottom: idx < needsAttention.length - 1 ? `1px solid ${divider}` : 'none', transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.02)' : '#fafbff'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: isDark ? `linear-gradient(135deg,${GOLD},${GOLDL})` : '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: isDark ? '#0c1037' : '#f59e0b', flexShrink: 0, fontSize: 13 }}>
                          {(s.name || '?')[0].toUpperCase()}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: textPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.22)', whiteSpace: 'nowrap' }}>
                        {s.count} task{s.count !== 1 ? 's' : ''}
                      </span>
                      <button onClick={() => handleNudge(s.id)} disabled={!!nudged[s.id]}
                        style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${isDark ? 'rgba(241,190,67,0.30)' : '#c7d2fe'}`, background: nudged[s.id] === 'sent' ? 'rgba(74,222,128,0.12)' : isDark ? 'rgba(241,190,67,0.10)' : '#eef2ff', color: nudged[s.id] === 'sent' ? '#4ade80' : isDark ? GOLD : INDIGO, fontSize: 12, fontWeight: 700, cursor: nudged[s.id] ? 'default' : 'pointer', fontFamily: FONT_B, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                        {nudged[s.id] === 'sending' ? '…' : nudged[s.id] === 'sent' ? '✓ Sent' : nudged[s.id] === 'fail' ? 'Retry' : 'Nudge'}
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>
        </div>

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Assignment stats */}
          <section className="td-fadein td-fadein-2">
            <div style={sectionHdr}>
              <h2 style={h2style}>Assignment Stats</h2>
              <button style={linkBtn} onClick={() => onNavigate('assignments')}>View →</button>
            </div>
            <div style={{ ...card, padding: '18px 20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {statBars.map(b => (
                  <div key={b.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                      <span style={{ fontWeight: 600, color: textPri }}>{b.label}</span>
                      <span style={{ color: b.warn ? b.color : textSub, fontWeight: b.warn ? 700 : 500 }}>{b.value}</span>
                    </div>
                    <div style={{ height: 7, background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f4f9', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: b.color, borderRadius: 10, width: `${b.pct}%`, minWidth: b.value ? 6 : 0, transition: 'width 0.5s ease' }} />
                    </div>
                    {b.warn && b.value > 0 && (
                      <div style={{ fontSize: 11, color: '#f87171', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>⚠ Needs attention</div>
                    )}
                  </div>
                ))}
                <div style={{ paddingTop: 10, borderTop: `1px solid ${divider}`, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: textMuted }}>
                  <span>{assignments.length} total assignment{assignments.length !== 1 ? 's' : ''}</span>
                  <span style={{ color: isDark ? '#6ee7b7' : '#10b981', fontWeight: 600 }}>{completionRate}% done</span>
                </div>
              </div>
            </div>
          </section>

          {/* Quick Actions */}
          <section className="td-fadein td-fadein-3">
            <h2 style={{ ...h2style, marginBottom: 14 }}>Quick Actions</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {actions.map((a, i) => (
                <button key={a.label} className={`td-fadein td-fadein-${i + 1}`}
                  onClick={() => onNavigate(a.to)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '16px 12px', ...card, cursor: 'pointer', textAlign: 'center', fontFamily: FONT_B,
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : a.color; e.currentTarget.style.borderColor = isDark ? 'rgba(241,190,67,0.30)' : '#c7d2fe' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = card.background; e.currentTarget.style.borderColor = card.border.replace('1px solid ', '') }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, fontSize: 18, transition: 'transform 0.15s' }}>
                    {a.icon}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: textPri }}>{a.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Recent Resources */}
          {resources.length > 0 && (
            <section className="td-fadein td-fadein-4">
              <div style={sectionHdr}>
                <h2 style={h2style}>Recent Resources</h2>
                <button style={linkBtn} onClick={() => onNavigate('resources')}>View →</button>
              </div>
              <div style={card}>
                {resources.slice(0, 4).map((r, idx) => {
                  const icon = { notes: '📝', worksheet: '📄', recording: '🎥', slides: '📊', resource: '📁', link: '🔗' }[r.type] || '📁'
                  const target = r.student_name ? `👤 ${r.student_name}` : r.class_name ? `🏫 ${r.class_name}` : '👥 Roster'
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: idx < Math.min(resources.length, 4) - 1 ? `1px solid ${divider}` : 'none', transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.025)' : '#fafbff'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ fontSize: 18 }}>{icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: textPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                        <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>{target} · {fmtDate(r.created_at)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
