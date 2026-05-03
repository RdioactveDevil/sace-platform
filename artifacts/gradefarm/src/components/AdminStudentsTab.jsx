import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  adminListStudents,
  adminGetStudentStats,
  adminSetTutor,
  adminSetAdmin,
  adminApproveTutor,
  adminRejectTutor,
} from '../lib/db'
import { supabase } from '../lib/supabase'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'
const BG     = '#080d28'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtRelative(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return fmtDate(iso)
}

function initials(name, email) {
  if (name) {
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()
  }
  return (email || '?')[0].toUpperCase()
}

export default function AdminStudentsTab({ profile, onCountLoad }) {
  const [students, setStudents]             = useState([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState('')
  const [search, setSearch]                 = useState('')
  const [filterSchool, setFilterSchool]     = useState('')
  const [filterSubject, setFilterSubject]   = useState('')
  const [filterTutor, setFilterTutor]       = useState('')
  const [selected, setSelected]             = useState(null)
  const [detailStats, setDetailStats]       = useState(null)
  const [statsLoading, setStatsLoading]     = useState(false)
  const [busyId, setBusyId]                 = useState(null)
  const [roleError, setRoleError]           = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const json = await adminListStudents()
      const list = json.students || []
      setStudents(list)
      onCountLoad?.(list.length)
      if (json.warnings?.length) {
        console.warn('[AdminStudentsTab] API warnings:', json.warnings)
      }
    } catch (e) {
      if (!silent) setError(e.message)
    }
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    load()

    // Poll every 30 s so newly registered students appear automatically
    const pollId = setInterval(() => load(true), 30_000)

    // Also refresh when the browser tab regains focus
    const onFocus = () => load(true)
    window.addEventListener('focus', onFocus)

    // Supabase realtime: re-fetch on any profiles INSERT or UPDATE
    const channel = supabase
      .channel('admin-students-profiles')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, () => load(true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => load(true))
      .subscribe()

    return () => {
      clearInterval(pollId)
      window.removeEventListener('focus', onFocus)
      supabase.removeChannel(channel)
    }
  }, [])

  const openDetail = (student) => {
    setSelected(student)
    setDetailStats(null)
    setRoleError('')
    setStatsLoading(true)
    adminGetStudentStats(student.id)
      .then(s => { setDetailStats(s); setStatsLoading(false) })
      .catch(() => setStatsLoading(false))
  }

  const closeDetail = () => { setSelected(null); setDetailStats(null) }

  const runRole = async (id, fn) => {
    setBusyId(id)
    setRoleError('')
    try {
      await fn()
      // Reload full list and update the detail panel in-place (or close if promoted out of students)
      const json = await adminListStudents()
      const list = json.students || []
      setStudents(list)
      onCountLoad?.(list.length)
      const updated = list.find(s => s.id === id)
      setSelected(updated ?? null)
    } catch (e) {
      setRoleError(e.message)
    }
    setBusyId(null)
  }

  // Derive filter options from loaded students
  const schools   = useMemo(() => [...new Set(students.map(s => s.school).filter(Boolean))].sort(), [students])
  const subjects  = useMemo(() => {
    const set = new Set()
    students.forEach(s => s.subjects.forEach(sub => set.add(sub.subject_name)))
    return [...set].sort()
  }, [students])
  const tutors    = useMemo(() => [...new Set(students.map(s => s.tutor_name).filter(Boolean))].sort(), [students])

  const filtered  = useMemo(() => {
    return students.filter(s => {
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!(s.display_name || '').toLowerCase().includes(q) &&
            !(s.email || '').toLowerCase().includes(q)) return false
      }
      if (filterSchool  && s.school !== filterSchool)  return false
      if (filterTutor   && s.tutor_name !== filterTutor) return false
      if (filterSubject && !s.subjects.some(sub => sub.subject_name === filterSubject)) return false
      return true
    })
  }, [students, search, filterSchool, filterSubject, filterTutor])

  const hasFilters = search || filterSchool || filterSubject || filterTutor

  return (
    <div style={{ fontFamily: FONT_B, color: '#e2e8f0', position: 'relative' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, color: GOLD, flexShrink: 0 }}>
          Students
          {!loading && <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8, fontWeight: 400 }}>({filtered.length}{hasFilters ? ` of ${students.length}` : ''})</span>}
        </h2>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or email…"
          style={inputStyle}
        />

        <select value={filterSchool} onChange={e => setFilterSchool(e.target.value)} style={selectStyle}>
          <option value="">All schools</option>
          {schools.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)} style={selectStyle}>
          <option value="">All subjects</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={filterTutor} onChange={e => setFilterTutor(e.target.value)} style={selectStyle}>
          <option value="">All tutors</option>
          {tutors.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setFilterSchool(''); setFilterSubject(''); setFilterTutor('') }}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B, flexShrink: 0 }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: '#f87171', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#64748b', fontSize: 13, padding: '24px 0' }}>Loading students…</div>
      ) : (
        <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 780 }}>
            <thead style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
              <tr>
                <th style={th}>Student</th>
                <th style={th}>School</th>
                <th style={th}>XP / Streak</th>
                <th style={th}>Last Active</th>
                <th style={th}>Subjects</th>
                <th style={th}>Tutor</th>
                <th style={th}>Joined</th>
                <th style={th}>Role</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr
                  key={u.id}
                  onClick={() => openDetail(u)}
                  style={{
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    background: selected?.id === u.id ? 'rgba(241,190,67,0.06)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (selected?.id !== u.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = selected?.id === u.id ? 'rgba(241,190,67,0.06)' : 'transparent' }}
                >
                  <td style={td}>
                    <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 13 }}>{u.display_name || '—'}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{u.email}</div>
                    {!u.onboarding_completed && (
                      <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 2 }}>Onboarding incomplete</div>
                    )}
                  </td>
                  <td style={{ ...td, color: '#94a3b8' }}>{u.school || '—'}</td>
                  <td style={td}>
                    <span style={{ color: GOLD, fontWeight: 700 }}>{u.xp.toLocaleString()}</span>
                    <span style={{ color: '#64748b' }}> · </span>
                    <span style={{ color: '#f97316' }}>🔥{u.streak}</span>
                  </td>
                  <td style={{ ...td, color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtRelative(u.last_active)}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {u.subjects.length === 0
                        ? <span style={{ color: '#475569', fontSize: 11 }}>None</span>
                        : u.subjects.slice(0, 2).map((s, i) => (
                            <span key={i} style={pillStyle}>{s.subject_name}</span>
                          ))
                      }
                      {u.subjects.length > 2 && (
                        <span style={{ ...pillStyle, background: 'rgba(100,116,139,0.2)', borderColor: 'rgba(100,116,139,0.3)', color: '#94a3b8' }}>
                          +{u.subjects.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ ...td, color: '#94a3b8', fontSize: 12, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.tutor_name || <span style={{ color: '#475569' }}>—</span>}
                  </td>
                  <td style={{ ...td, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(u.created_at)}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {u.is_admin && <Badge color="#a78bfa">Admin</Badge>}
                      {u.is_tutor && <Badge color={GOLD}>Tutor</Badge>}
                      {!u.is_admin && !u.is_tutor && <Badge color="#64748b">Student</Badge>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...td, color: '#64748b', textAlign: 'center', padding: '24px 12px' }}>
                    {hasFilters ? 'No students match your filters.' : 'No students found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel overlay */}
      {selected && (
        <>
          <div
            onClick={closeDetail}
            style={{
              position: 'fixed', inset: 0, zIndex: 40,
              background: 'rgba(0,0,0,0.45)',
            }}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
            width: 420, maxWidth: '100vw',
            background: '#0f172a',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            overflowY: 'auto',
            fontFamily: FONT_B,
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Panel header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: '50%',
                background: `linear-gradient(135deg, ${GOLD}44, ${GOLD}22)`,
                border: `1px solid ${GOLD}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 800, color: GOLD, flexShrink: 0,
              }}>
                {initials(selected.display_name, selected.email)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selected.display_name || 'Unnamed student'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selected.email}
                </div>
              </div>
              <button
                onClick={closeDetail}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4, flexShrink: 0 }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Profile fields */}
              <Section title="Profile">
                <Row label="School"      value={selected.school || '—'} />
                <Row label="Joined"      value={fmtDate(selected.created_at)} />
                <Row label="Last active" value={fmtDate(selected.last_active)} />
                <Row label="Onboarding"  value={selected.onboarding_completed ? '✓ Complete' : '⚠ Incomplete'} valueColor={selected.onboarding_completed ? '#4ade80' : '#f59e0b'} />
              </Section>

              {/* XP / Streak stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <StatCard label="XP" value={selected.xp.toLocaleString()} color={GOLD} />
                <StatCard label="Streak" value={`${selected.streak}d`} color="#f97316" />
                <StatCard label="Best Streak" value={`${selected.best_streak}d`} color="#a78bfa" />
              </div>

              {/* Enrolled subjects */}
              <Section title="Enrolled Subjects">
                {selected.subjects.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#475569' }}>No subjects enrolled.</div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {selected.subjects.map((s, i) => (
                      <span key={i} style={{ ...pillStyle, fontSize: 12, padding: '4px 10px' }}>
                        {s.subject_name}
                        {s.stage && <span style={{ opacity: 0.7, marginLeft: 4 }}>{s.stage}</span>}
                      </span>
                    ))}
                  </div>
                )}
              </Section>

              {/* Assigned tutor */}
              <Section title="Assigned Tutor">
                {selected.tutor_name
                  ? <div style={{ fontSize: 13, color: '#e2e8f0' }}>{selected.tutor_name}</div>
                  : <div style={{ fontSize: 12, color: '#475569' }}>No tutor assigned.</div>
                }
              </Section>

              {/* Activity summary */}
              <Section title="Activity Summary">
                {statsLoading ? (
                  <div style={{ fontSize: 12, color: '#64748b' }}>Loading…</div>
                ) : detailStats ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
                      <StatCard label="Questions" value={detailStats.totalAnswers.toLocaleString()} color="#38bdf8" />
                      <StatCard label="Accuracy"  value={`${detailStats.accuracy}%`}  color="#4ade80" />
                      <StatCard label="Sessions / 7d" value={detailStats.sessionsWeek} color="#c084fc" />
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: '#475569' }}>Could not load activity stats.</div>
                )}
              </Section>

              {/* Weak topics */}
              {detailStats?.weakTopics?.length > 0 && (
                <Section title="Top Weak Topics">
                  {detailStats.weakTopics.map((t, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < detailStats.weakTopics.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.topic}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{t.subject} · {t.attempts} attempts</div>
                      </div>
                      <div style={{
                        padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                        background: t.accuracy < 50 ? 'rgba(248,113,113,0.12)' : 'rgba(251,191,36,0.12)',
                        color: t.accuracy < 50 ? '#f87171' : GOLD,
                        border: `1px solid ${t.accuracy < 50 ? '#f8717130' : GOLD + '30'}`,
                        flexShrink: 0,
                      }}>
                        {t.accuracy}%
                      </div>
                    </div>
                  ))}
                </Section>
              )}

              {/* Role management */}
              <Section title="Role Management">
                {roleError && (
                  <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>{roleError}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selected.tutor_application_status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn onClick={() => runRole(selected.id, () => adminApproveTutor(selected.id))} disabled={!!busyId} variant="primary">Approve Tutor Application</Btn>
                      <Btn onClick={() => runRole(selected.id, () => adminRejectTutor(selected.id))} disabled={!!busyId}>Reject</Btn>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {!selected.is_tutor ? (
                      <Btn onClick={() => runRole(selected.id, () => adminSetTutor(selected.id, true))} disabled={!!busyId}>
                        Make Tutor
                      </Btn>
                    ) : (
                      <Btn onClick={() => runRole(selected.id, () => adminSetTutor(selected.id, false))} disabled={!!busyId}>
                        Remove Tutor
                      </Btn>
                    )}
                    {!selected.is_admin ? (
                      <Btn onClick={() => runRole(selected.id, () => adminSetAdmin(selected.id, true))} disabled={!!busyId}>
                        Make Admin
                      </Btn>
                    ) : (
                      <Btn
                        onClick={() => runRole(selected.id, () => adminSetAdmin(selected.id, false))}
                        disabled={!!busyId || selected.id === profile?.id}
                        title={selected.id === profile?.id ? "You can't remove your own admin role" : ''}
                      >
                        Remove Admin
                      </Btn>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.5 }}>
                    Current role:&nbsp;
                    {selected.is_admin ? <span style={{ color: '#a78bfa' }}>Admin</span>
                      : selected.is_tutor ? <span style={{ color: GOLD }}>Tutor</span>
                      : <span style={{ color: '#94a3b8' }}>Student</span>}
                  </div>
                </div>
              </Section>

            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: '#475569', textTransform: 'uppercase', marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 12, color: valueColor || '#e2e8f0', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10, padding: '12px 10px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, fontWeight: 600, letterSpacing: 0.4 }}>{label.toUpperCase()}</div>
    </div>
  )
}

function Badge({ children, color }) {
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700,
      color, border: `1px solid ${color}55`, background: `${color}14`,
    }}>{children}</span>
  )
}

function Btn({ children, onClick, disabled, variant, title }) {
  const isPrimary = variant === 'primary'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '7px 12px', borderRadius: 7,
        border: '1px solid ' + (isPrimary ? '#f1be4399' : 'rgba(255,255,255,0.12)'),
        background: isPrimary ? '#f1be4322' : 'rgba(255,255,255,0.04)',
        color: isPrimary ? '#f1be43' : '#e2e8f0',
        fontSize: 12, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: FONT_B,
        whiteSpace: 'nowrap',
      }}
    >{children}</button>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const th = {
  padding: '9px 10px', fontSize: 10, color: '#64748b',
  fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
  whiteSpace: 'nowrap',
}
const td = { padding: '9px 10px', verticalAlign: 'middle' }

const pillStyle = {
  padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600,
  color: '#38bdf8', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
  whiteSpace: 'nowrap',
}

const inputStyle = {
  padding: '7px 12px', borderRadius: 8, flex: 1, minWidth: 180,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  color: '#f1f5f9', fontSize: 12, fontFamily: FONT_B, outline: 'none',
}

const selectStyle = {
  padding: '7px 10px', borderRadius: 8,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  color: '#94a3b8', fontSize: 12, fontFamily: FONT_B, outline: 'none', cursor: 'pointer',
}
