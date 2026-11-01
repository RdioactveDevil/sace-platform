import { useEffect, useState, useMemo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  adminListStudents,
  adminListTutors,
  adminAnswersBetween,
  adminGetStudentStats,
  adminGetStudentAssignments,
  adminGetStudentWritingAttempts,
  adminSetTutor,
  adminSetAdmin,
  adminApproveTutor,
  adminRejectTutor,
  adminSetStudentActive,
  adminDeleteStudent,
  adminListSubscriptions,
  adminGrantSubscription,
  adminRevokeSubscription,
  adminListTutorLinks,
  adminLinkTutor,
  adminUnlinkTutor,
  fetchTutorList,
  downloadWritingReportPdf,
} from '../lib/db'
import { supabase } from '../lib/supabase'
import { fetchLiveCurricula } from '../lib/curriculaDb'
import { exportRowsToCsv } from '../lib/csv'
import { X } from 'lucide-react'
import AdminTutorSection from './AdminTutorSection'
import AdminTutorApplicationsTab from './AdminTutorApplicationsTab'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const DAY_MS = 86400000

// Who the table shows (?role=).
const ROLES = [
  ['all', 'All'],
  ['students', 'Students'],
  ['tutors', 'Tutors'],
  ['admins', 'Admins'],
  ['applications', 'Applications'],
]
const inRole = (u, role) =>
  role === 'students' ? !u.is_tutor && !u.is_admin
  : role === 'tutors' ? u.is_tutor
  : role === 'admins' ? u.is_admin
  : true

/** Monday 00:00 this week. */
function weekStartIso() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString()
}

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

/**
 * Admin › People: every account (students, tutors, admins) in one table, plus
 * tutor applications. A person opens in a side panel with what an admin can
 * change for them: subjects, tutors, role, the tutor plan and the account.
 */
export default function AdminPeopleTab({ profile, pendingApps = 0, onApplicationsChange }) {
  const location = useLocation()
  const navigate = useNavigate()
  const roleParam = new URLSearchParams(location.search).get('role')
  const role = ROLES.some(([id]) => id === roleParam) ? roleParam : 'all'
  const setRole = (id) => navigate(id === 'all' ? '/admin/people' : `/admin/people?role=${id}`, { replace: true })
  // Tutor rows (plan, roster size, work set) by id, and answers since Monday by person.
  const [tutorsById, setTutorsById] = useState({})
  const [weekCounts, setWeekCounts] = useState(null)
  const loadTutors = useCallback(() => adminListTutors().then(ts => setTutorsById(Object.fromEntries(ts.map(t => [t.id, t])))).catch(() => {}), [])
  useEffect(() => { loadTutors() }, [loadTutors])
  useEffect(() => {
    let cancelled = false
    adminAnswersBetween(weekStartIso())
      .then(rows => {
        if (cancelled) return
        const m = {}
        rows.forEach(r => { m[r.user_id] = (m[r.user_id] || 0) + 1 })
        setWeekCounts(m)
      })
      .catch(() => { if (!cancelled) setWeekCounts({}) })
    return () => { cancelled = true }
  }, [])

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
  const [detailAssignments, setDetailAssignments] = useState(null)
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [writingAttempts, setWritingAttempts] = useState(null)
  const [writingLoading, setWritingLoading] = useState(false)
  const [pdfBusyId, setPdfBusyId] = useState(null)
  const [subscriptions, setSubscriptions]       = useState([])
  const [subsLoading, setSubsLoading]           = useState(false)
  const [subsError, setSubsError]               = useState('')
  const [liveCurricula, setLiveCurricula]       = useState([])
  const [curriculaLoading, setCurriculaLoading] = useState(false)
  const [grantSubject, setGrantSubject]         = useState('')
  const [grantBusy, setGrantBusy]               = useState(false)
  const [accountBusy, setAccountBusy]           = useState(false)
  const [accountError, setAccountError]         = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const json = await adminListStudents()
      const list = json.students || []
      setStudents(list)
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

  const loadSubscriptions = useCallback(async (userId) => {
    setSubsLoading(true)
    setSubsError('')
    try {
      setSubscriptions(await adminListSubscriptions(userId))
    } catch (e) {
      setSubsError(e.message)
    }
    setSubsLoading(false)
  }, [])

  const openDetail = (student) => {
    setSelected(student)
    setDetailStats(null)
    setDetailAssignments(null)
    setWritingAttempts(null)
    setRoleError('')
    setAccountError('')
    setStatsLoading(true)
    setAssignmentsLoading(true)
    setWritingLoading(true)
    setSubscriptions([])
    setSubsError('')
    setGrantSubject('')
    adminGetStudentStats(student.id)
      .then(s => { setDetailStats(s); setStatsLoading(false) })
      .catch(() => setStatsLoading(false))
    adminGetStudentAssignments(student.id)
      .then(a => { setDetailAssignments(a); setAssignmentsLoading(false) })
      .catch(() => { setDetailAssignments([]); setAssignmentsLoading(false) })
    adminGetStudentWritingAttempts(student.id)
      .then(w => { setWritingAttempts(w); setWritingLoading(false) })
      .catch(() => { setWritingAttempts([]); setWritingLoading(false) })
    loadSubscriptions(student.id)
    if (liveCurricula.length === 0) {
      setCurriculaLoading(true)
      fetchLiveCurricula()
        .then(c => { setLiveCurricula(c); setCurriculaLoading(false) })
        .catch(() => setCurriculaLoading(false))
    }
  }

  const closeDetail = () => {
    setSelected(null)
    setDetailStats(null)
    setDetailAssignments(null)
    setWritingAttempts(null)
    setSubscriptions([])
    setSubsError('')
    setGrantSubject('')
  }

  // Close the detail slide-over on Escape for keyboard accessibility.
  useEffect(() => {
    if (!selected) return
    const onKey = (e) => { if (e.key === 'Escape') closeDetail() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const runRole = async (id, fn) => {
    setBusyId(id)
    setRoleError('')
    try {
      await fn()
      // Reload full list and update the detail panel in-place (or close if promoted out of students)
      const json = await adminListStudents()
      const list = json.students || []
      setStudents(list)
      const updated = list.find(s => s.id === id)
      setSelected(updated ?? null)
    } catch (e) {
      setRoleError(e.message)
    }
    setBusyId(null)
  }

  // Deactivate (soft-delete, reversible) or reactivate the selected account.
  const handleToggleActive = async () => {
    if (!selected) return
    const deactivating = !selected.deactivated_at
    const name = selected.display_name || selected.email
    const msg = deactivating
      ? `Deactivate ${name}?\n\nThey'll be signed out and blocked from logging in until you reactivate them. All their data is kept.`
      : `Reactivate ${name}?\n\nThey'll be able to log in again.`
    if (!window.confirm(msg)) return
    setAccountBusy(true)
    setAccountError('')
    try {
      await adminSetStudentActive(selected.id, !deactivating)
      const json = await adminListStudents()
      const list = json.students || []
      setStudents(list)
      setSelected(list.find(s => s.id === selected.id) ?? null)
    } catch (e) {
      setAccountError(e.message)
    }
    setAccountBusy(false)
  }

  // Permanently delete the selected account and all data tied to it.
  const handleDelete = async () => {
    if (!selected) return
    const name = selected.display_name || selected.email
    if (!window.confirm(`Permanently delete ${name}?\n\nThis removes their account and ALL their data — progress, sessions, subscriptions and assignments. This cannot be undone.`)) return
    if (!window.confirm('Are you absolutely sure? This is irreversible.')) return
    setAccountBusy(true)
    setAccountError('')
    try {
      await adminDeleteStudent(selected.id)
      const json = await adminListStudents()
      const list = json.students || []
      setStudents(list)
      closeDetail()
    } catch (e) {
      setAccountError(e.message)
      setAccountBusy(false)
    }
  }

  // Derive filter options from loaded students
  const schools   = useMemo(() => [...new Set(students.map(s => s.school).filter(Boolean))].sort(), [students])
  const subjects  = useMemo(() => {
    const set = new Set()
    students.forEach(s => s.subjects.forEach(sub => set.add(sub.subject_name)))
    return [...set].sort()
  }, [students])
  const tutors    = useMemo(() => [...new Set(students.map(s => s.tutor_name).filter(Boolean))].sort(), [students])

  const roleCounts = useMemo(() => Object.fromEntries(ROLES.map(([id]) => [id, students.filter(u => inRole(u, id)).length])), [students])
  const isQuiet = (u) => !u.is_tutor && !u.is_admin && u.onboarding_completed && (!u.last_active || Date.now() - Date.parse(u.last_active) > 7 * DAY_MS)

  const filtered  = useMemo(() => {
    return students.filter(s => {
      if (!inRole(s, role)) return false
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
  }, [students, search, filterSchool, filterSubject, filterTutor, role])

  const hasFilters = search || filterSchool || filterSubject || filterTutor

  const exportCsv = () => {
    exportRowsToCsv(
      `gradefarm-${role === 'all' ? 'people' : role}-${new Date().toISOString().slice(0, 10)}`,
      filtered,
      [
        { key: 'display_name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'school', label: 'School' },
        { key: 'xp', label: 'XP' },
        { key: 'streak', label: 'Streak' },
        { key: 'best_streak', label: 'Best streak' },
        { key: 'last_active', label: 'Last active' },
        { key: 'subjects', label: 'Subjects', get: r => (r.subjects || []).map(s => s.subject_name).join('; ') },
        { key: 'tutor_name', label: 'Tutor' },
        { key: 'created_at', label: 'Joined' },
        { key: 'onboarding_completed', label: 'Onboarded', get: r => (r.onboarding_completed ? 'yes' : 'no') },
        { key: 'role', label: 'Role', get: r => (r.is_admin ? 'admin' : r.is_tutor ? 'tutor' : 'student') },
      ],
    )
  }

  const chip = (on) => ({ padding: '6px 12px', borderRadius: 999, border: `1px solid ${on ? 'var(--t-text)' : 'var(--t-border)'}`, background: on ? 'var(--t-text)' : 'var(--t-bgCard)', color: on ? 'var(--t-bg)' : 'var(--t-textMuted)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, whiteSpace: 'nowrap' })
  const roleOf = (u) => (u.is_admin ? 'Admin' : u.is_tutor ? 'Tutor' : 'Student')
  const roleText = (u) => {
    const tr = tutorsById[u.id]
    if (u.is_tutor && tr) return `Tutor · ${tr.roster_size} student${tr.roster_size === 1 ? '' : 's'}${u.is_admin ? ' · admin' : ''}`
    return u.is_admin && u.is_tutor ? 'Tutor · admin' : roleOf(u)
  }
  const selTutor = selected?.is_tutor ? tutorsById[selected.id] : null
  const facts = (value, label) => (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--t-textMuted)' }}>{label}</div>
    </div>
  )

  return (
    <div style={{ fontFamily: FONT_B, color: 'var(--t-textSub)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`
        .pp-row:hover { background: var(--t-bgHover) !important; }
        .pp-row:focus-visible { outline: 2px solid var(--t-accent); outline-offset: -2px; }
        .pp-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
        .pp-layout.has-panel { grid-template-columns: minmax(0, 1fr) 380px; }
        .pp-panel { position: sticky; top: 0; max-height: calc(100vh - 170px); overflow-y: auto; box-sizing: border-box; }
        .pp-backdrop { display: none; }
        @media (max-width: 1150px) {
          .pp-layout.has-panel { grid-template-columns: minmax(0, 1fr); }
          .pp-panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); max-height: none; z-index: 1001; border-radius: 0 !important; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25); }
          .pp-backdrop { display: block; position: fixed; inset: 0; z-index: 1000; background: rgba(0, 0, 0, 0.35); }
        }
      `}</style>

      {/* Search, who to show, export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email" aria-label="Search people" style={{ ...inputStyle, maxWidth: 320 }} />
        <div role="group" aria-label="Show" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ROLES.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={role === id} onClick={() => setRole(id)} style={chip(role === id)}>
              {label} · {id === 'applications' ? pendingApps : roleCounts[id]}
            </button>
          ))}
        </div>
        {role !== 'applications' && (
          <button onClick={exportCsv} disabled={loading || filtered.length === 0} title="Download this list as a CSV file"
            style={{ marginLeft: 'auto', flexShrink: 0, padding: '7px 13px', borderRadius: 9, fontFamily: FONT_B, border: '1px solid var(--t-border)', background: 'var(--t-bgCard)', color: 'var(--t-text)', fontSize: 12.5, fontWeight: 700,
              cursor: loading || filtered.length === 0 ? 'not-allowed' : 'pointer', opacity: loading || filtered.length === 0 ? 0.5 : 1 }}>
            Export CSV
          </button>
        )}
      </div>

      {role !== 'applications' && (schools.length > 1 || subjects.length > 1 || tutors.length > 1) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {schools.length > 1 && (
            <select aria-label="School" value={filterSchool} onChange={e => setFilterSchool(e.target.value)} style={selectStyle}>
              <option value="">All schools</option>
              {schools.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {subjects.length > 1 && (
            <select aria-label="Subject" value={filterSubject} onChange={e => setFilterSubject(e.target.value)} style={selectStyle}>
              <option value="">All subjects</option>
              {subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {tutors.length > 1 && (
            <select aria-label="Tutor" value={filterTutor} onChange={e => setFilterTutor(e.target.value)} style={selectStyle}>
              <option value="">All tutors</option>
              {tutors.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {hasFilters && (
            <>
              <span style={{ fontSize: 12.5, color: 'var(--t-textMuted)' }}>Showing {filtered.length}</span>
              <button onClick={() => { setSearch(''); setFilterSchool(''); setFilterSubject(''); setFilterTutor('') }}
                style={{ background: 'none', border: 'none', color: 'var(--t-textMuted)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, padding: 0 }}>Clear</button>
            </>
          )}
        </div>
      )}

      {error && <div style={{ fontSize: 13, color: 'var(--t-danger)' }}>{error}</div>}

      {role === 'applications' ? (
        <AdminTutorApplicationsTab onChange={() => { onApplicationsChange?.(); load(true) }} />
      ) : loading ? (
        <div style={{ color: 'var(--t-textMuted)', fontSize: 13, padding: '24px 0' }}>Loading people…</div>
      ) : (
        <div className={`pp-layout${selected ? ' has-panel' : ''}`}>
        <div style={{ background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12, overflowX: 'auto', minWidth: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Role</th>
                <th style={th}>Subjects</th>
                <th style={th}>Tutor</th>
                <th style={{ ...th, textAlign: 'right' }} title="Questions answered since Monday">This week</th>
                <th style={{ ...th, textAlign: 'right' }}>Last active</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const on = selected?.id === u.id
                const subs = u.is_tutor && !u.subjects.length ? (tutorsById[u.id]?.plan_subjects || []) : u.subjects.map(s => s.subject_name)
                return (
                  <tr key={u.id} className="pp-row" tabIndex={0} aria-selected={on}
                    onClick={() => (on ? closeDetail() : openDetail(u))}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); on ? closeDetail() : openDetail(u) } }}
                    style={{ cursor: 'pointer', background: on ? 'var(--t-bgSubtle)' : 'transparent' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 700, color: 'var(--t-text)', fontSize: 13.5 }}>{u.display_name || 'No name yet'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--t-textMuted)', marginTop: 1 }}>{u.email}</div>
                      {u.deactivated_at && <div style={{ fontSize: 11.5, color: 'var(--t-danger)', marginTop: 2, fontWeight: 600 }}>Deactivated</div>}
                    </td>
                    <td style={{ ...td, color: 'var(--t-textSub)', whiteSpace: 'nowrap' }}>{roleText(u)}</td>
                    <td style={{ ...td, color: subs.length ? 'var(--t-textSub)' : 'var(--t-textFaint)' }}>
                      {!u.onboarding_completed && !u.is_tutor && !u.is_admin
                        ? <span style={{ color: 'var(--t-goldText)', fontWeight: 600 }}>Not set up</span>
                        : subs.length ? `${subs.slice(0, 2).join(', ')}${subs.length > 2 ? ` +${subs.length - 2}` : ''}` : '—'}
                    </td>
                    <td style={{ ...td, color: u.tutor_name ? 'var(--t-textSub)' : 'var(--t-textFaint)', whiteSpace: 'nowrap' }}>{u.tutor_name || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: weekCounts?.[u.id] ? 'var(--t-text)' : 'var(--t-textFaint)' }}>
                      {weekCounts ? (weekCounts[u.id] || 0) : '…'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', color: isQuiet(u) ? 'var(--t-danger)' : 'var(--t-textMuted)' }}>{fmtRelative(u.last_active)}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...td, color: 'var(--t-textMuted)', textAlign: 'center', padding: '28px 12px' }}>
                    {hasFilters ? 'No one matches these filters.' : 'No one here yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      {/* The selected person */}
      {selected && (
        <>
          <div onClick={closeDetail} aria-hidden="true" className="pp-backdrop" />
          <aside className="pp-panel" aria-label={selected.display_name || selected.email || 'Person'}
            style={{ background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12, fontFamily: FONT_B, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 18px 0', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--t-text)', letterSpacing: '-0.01em' }}>{selected.display_name || 'No name yet'}</div>
                <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', overflowWrap: 'anywhere' }}>
                  {[roleText(selected), selected.school, `joined ${fmtDate(selected.created_at)}`].filter(Boolean).join(' · ')}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', overflowWrap: 'anywhere' }}>{selected.email}</div>
                {selected.deactivated_at && <div style={{ fontSize: 12.5, color: 'var(--t-danger)', fontWeight: 600, marginTop: 4 }}>Deactivated. They can't sign in.</div>}
              </div>
              <button type="button" onClick={closeDetail} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--t-textMuted)', cursor: 'pointer', padding: 2, display: 'flex' }}><X size={16} aria-hidden="true" /></button>
            </div>

            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 20 }}>

              {(!selected.is_tutor || selected.subjects.length > 0 || (detailStats?.totalAnswers ?? 0) > 0) && (
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  {facts(weekCounts ? (weekCounts[selected.id] || 0) : '…', 'answered this week')}
                  {facts(statsLoading ? '…' : detailStats ? `${detailStats.accuracy}%` : '—', 'correct, all time')}
                  {facts(selected.streak, selected.streak === 1 ? 'day streak' : 'day streak')}
                </div>
              )}

              {!selected.onboarding_completed && !selected.is_tutor && !selected.is_admin && (
                <div style={{ fontSize: 12.5, color: 'var(--t-goldText)', fontWeight: 600 }}>Hasn't finished setting up their account.</div>
              )}

              {selTutor && <AdminTutorSection tutor={selTutor} students={students.filter(s => !s.is_tutor || s.is_admin)} onChange={() => loadTutors()} />}
              {/* Their tutors */}
              {!selected.is_tutor && (
                <Section title="Tutors">
                  <TutorLinksSection studentId={selected.id} onChange={() => load(true)} />
                </Section>
              )}

              {/* Weak topics */}
              {detailStats?.weakTopics?.length > 0 && (
                <Section title="Weakest topics">
                  {detailStats.weakTopics.map((t, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < detailStats.weakTopics.length - 1 ? '1px solid var(--t-border)' : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-textSub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.topic}</div>
                        <div style={{ fontSize: 11, color: 'var(--t-textMuted)' }}>{t.subject} · {t.attempts} attempts</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.accuracy < 50 ? 'var(--t-danger)' : 'var(--t-goldText)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {t.accuracy}%
                      </div>
                    </div>
                  ))}
                </Section>
              )}

              {/* Assignment history (a tutor only sees this when someone set them work) */}
              {(!selected.is_tutor || detailAssignments?.length > 0) && <Section title="Work set">
                {assignmentsLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--t-textMuted)' }}>Loading…</div>
                ) : !detailAssignments || detailAssignments.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--t-textFaint)' }}>No assignments yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                    {detailAssignments.map(a => {
                      const c = a.status === 'completed' ? 'var(--t-success)' : a.status === 'overdue' ? 'var(--t-danger)' : 'var(--t-goldText)'
                      return (
                        <div key={a.id} style={{ padding: '9px 11px', border: '1px solid var(--t-border)', borderRadius: 9 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{a.type}</span>
                            <span style={{ fontSize: 9, padding: '1px 7px', borderRadius: 10, border: `1px solid ${c}40`, background: `${c}15`, color: c, fontWeight: 700, textTransform: 'capitalize' }}>{a.status}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--t-textMuted)' }}>
                            From <strong style={{ color: 'var(--t-textSub)' }}>{a.tutor_name}</strong> · {a.subject}
                          </div>
                          {a.topics?.length > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--t-textMuted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {a.topics.join(', ')}
                            </div>
                          )}
                          <div style={{ fontSize: 10, color: 'var(--t-textFaint)', marginTop: 3 }}>
                            Due {fmtDate(a.due_date)}
                            {a.completed_at && ` · Completed ${fmtDate(a.completed_at)}`}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Section>}

              {/* English writing practice (only when they've done some) */}
              {writingAttempts?.length > 0 && <Section title="English writing">
                {writingLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--t-textMuted)' }}>Loading…</div>
                ) : !writingAttempts || writingAttempts.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--t-textFaint)' }}>No writing attempts yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                    {writingAttempts.map(w => {
                      const sc = w.feedback?.overallScore
                      return (
                        <div key={w.id} style={{ padding: '9px 11px', border: '1px solid var(--t-border)', borderRadius: 9 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)', textTransform: 'capitalize' }}>
                                {w.essay_type} · {(w.mode || '').replace(/_/g, ' ')}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--t-textMuted)', marginTop: 2 }}>{w.subject} · {fmtDate(w.created_at)}</div>
                              {typeof sc === 'number' && (
                                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--t-goldText)', marginTop: 6 }}>Overall {sc}/10</div>
                              )}
                              <div style={{ fontSize: 11, color: 'var(--t-textMuted)', marginTop: 4, maxHeight: 48, overflow: 'hidden' }}>{w.prompt}</div>
                            </div>
                            <button
                              type="button"
                              disabled={!w.feedback || pdfBusyId === w.id}
                              onClick={async () => {
                                setPdfBusyId(w.id)
                                try {
                                  await downloadWritingReportPdf(w.id, selected.display_name)
                                } catch (e) { console.warn(e) }
                                setPdfBusyId(null)
                              }}
                              style={{
                                flexShrink: 0,
                                padding: '5px 10px',
                                borderRadius: 6,
                                border: '1px solid var(--t-border)',
                                background: 'var(--t-bgCard)',
                                color: 'var(--t-text)',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: !w.feedback || pdfBusyId === w.id ? 'not-allowed' : 'pointer',
                                fontFamily: FONT_B,
                              }}
                            >
                              {pdfBusyId === w.id ? '…' : 'PDF'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Section>}

              {/* Subject Access */}
              <SubjectAccessSection
                userId={selected.id}
                subscriptions={subscriptions}
                subsLoading={subsLoading}
                subsError={subsError}
                liveCurricula={liveCurricula}
                curriculaLoading={curriculaLoading}
                grantSubject={grantSubject}
                setGrantSubject={setGrantSubject}
                grantBusy={grantBusy}
                onGrant={async () => {
                  if (!grantSubject) return
                  setGrantBusy(true)
                  setSubsError('')
                  try {
                    await adminGrantSubscription(selected.id, grantSubject)
                    setGrantSubject('')
                    await loadSubscriptions(selected.id)
                  } catch (e) {
                    setSubsError(e.message)
                  }
                  setGrantBusy(false)
                }}
                onRevoke={async (subId) => {
                  const sub = subscriptions.find(s => s.id === subId)
                  const msg = sub?.source === 'stripe'
                    ? 'This student is paying for this subject. Removing it takes it off their weekly plan now (ending the plan if it was their only paid subject). Continue?'
                    : 'Remove this subject?'
                  if (!window.confirm(msg)) return
                  setSubsError('')
                  try {
                    await adminRevokeSubscription(selected.id, subId)
                    await loadSubscriptions(selected.id)
                  } catch (e) {
                    setSubsError(e.message)
                  }
                }}
              />

              {/* Role management */}
              <Section title="Role">
                {roleError && (
                  <div style={{ fontSize: 12, color: 'var(--t-danger)', marginBottom: 8 }}>{roleError}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selected.tutor_application_status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn onClick={() => runRole(selected.id, () => adminApproveTutor(selected.id))} disabled={!!busyId} variant="primary">Approve tutor application</Btn>
                      <Btn onClick={() => runRole(selected.id, () => adminRejectTutor(selected.id))} disabled={!!busyId}>Reject</Btn>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {!selected.is_tutor ? (
                      <Btn onClick={() => runRole(selected.id, () => adminSetTutor(selected.id, true))} disabled={!!busyId}>
                        Make tutor
                      </Btn>
                    ) : (
                      <Btn onClick={() => runRole(selected.id, () => adminSetTutor(selected.id, false))} disabled={!!busyId}>
                        Remove tutor
                      </Btn>
                    )}
                    {!selected.is_admin ? (
                      <Btn onClick={() => runRole(selected.id, () => adminSetAdmin(selected.id, true))} disabled={!!busyId}>
                        Make admin
                      </Btn>
                    ) : (
                      <Btn
                        onClick={() => runRole(selected.id, () => adminSetAdmin(selected.id, false))}
                        disabled={!!busyId || selected.id === profile?.id}
                        title={selected.id === profile?.id ? "You can't remove your own admin role" : ''}
                      >
                        Remove admin
                      </Btn>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-textFaint)', lineHeight: 1.5 }}>
                    Now: {[selected.is_tutor && 'tutor', selected.is_admin && 'admin'].filter(Boolean).join(' and ') || 'student'}.
                  </div>
                </div>
              </Section>

              {/* Account management — deactivate (reversible) or delete (permanent) */}
              <Section title="Account">
                {accountError && (
                  <div style={{ fontSize: 12, color: 'var(--t-danger)', marginBottom: 8 }}>{accountError}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Btn
                      onClick={handleToggleActive}
                      disabled={accountBusy || selected.id === profile?.id}
                      title={selected.id === profile?.id ? "You can't deactivate your own account" : ''}
                    >
                      {accountBusy ? '…' : selected.deactivated_at ? 'Reactivate account' : 'Deactivate account'}
                    </Btn>
                    <DangerBtn
                      onClick={handleDelete}
                      disabled={accountBusy || selected.id === profile?.id}
                      title={selected.id === profile?.id ? "You can't delete your own account" : ''}
                    >
                      Delete account
                    </DangerBtn>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-textFaint)', lineHeight: 1.5 }}>
                    Deactivating blocks sign-in and keeps their data, and you can undo it. Deleting removes the account and everything tied to it for good.
                  </div>
                </div>
              </Section>

            </div>
          </aside>
        </>
      )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SubjectAccessSection({
  userId,
  subscriptions,
  subsLoading,
  subsError,
  liveCurricula,
  curriculaLoading,
  grantSubject,
  setGrantSubject,
  grantBusy,
  onGrant,
  onRevoke,
}) {
  // Build a set of already-granted curriculum ids for the dropdown filter
  const grantedKeys = new Set(subscriptions.map(s => `${s.subject_name}||${s.stage || ''}`))

  const availableCurricula = liveCurricula.filter(
    c => !grantedKeys.has(`${c.name}||${c.level_label || ''}`)
  )

  return (
    <Section title="Subject access">
      {subsError && (
        <div style={{ fontSize: 12, color: 'var(--t-danger)', marginBottom: 8 }}>{subsError}</div>
      )}

      {/* Current subscriptions */}
      {subsLoading ? (
        <div style={{ fontSize: 12, color: 'var(--t-textMuted)', marginBottom: 10 }}>Loading…</div>
      ) : subscriptions.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--t-textFaint)', marginBottom: 10 }}>No subjects yet.</div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {subscriptions.map(sub => (
            <span
              key={sub.id}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 8px 4px 10px', borderRadius: 999,
                border: '1px solid var(--t-border)',
                fontSize: 12, fontWeight: 600, color: 'var(--t-text)',
                whiteSpace: 'nowrap',
              }}
            >
              {sub.subject_name}
              {sub.stage && <span style={{ opacity: 0.65, fontSize: 11 }}>{sub.stage}</span>}
              <span style={{ fontSize: 11, fontWeight: 600, color: sub.source === 'stripe' && sub.status !== 'past_due' ? 'var(--t-success)' : sub.status === 'past_due' ? 'var(--t-danger)' : 'var(--t-textMuted)' }}>
                {sub.source === 'stripe' ? (sub.status === 'past_due' ? 'payment overdue' : sub.cancel_at_period_end ? 'paid, ending' : 'paid') : sub.source === 'admin' ? 'given by admin' : sub.source === 'tutor' ? 'included by tutor' : sub.source === 'free' ? 'free, limited' : 'beta'}
              </span>
              <button
                onClick={() => onRevoke(sub.id)}
                title="Remove subscription"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--t-danger)', fontSize: 14, lineHeight: 1, padding: '0 2px',
                  display: 'flex', alignItems: 'center',
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Grant access row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={grantSubject}
          onChange={e => setGrantSubject(e.target.value)}
          disabled={curriculaLoading || grantBusy}
          style={{
            ...selectStyle,
            flex: 1, minWidth: 0,
            opacity: curriculaLoading || grantBusy ? 0.5 : 1,
          }}
        >
          <option value="">
            {curriculaLoading ? 'Loading subjects…' : availableCurricula.length === 0 ? 'No subjects available' : 'Give access to a subject…'}
          </option>
          {availableCurricula.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}{c.level_label ? ` (${c.level_label})` : ''}
            </option>
          ))}
        </select>
        <Btn
          onClick={onGrant}
          disabled={!grantSubject || grantBusy}
          variant="primary"
        >
          {grantBusy ? 'Adding…' : 'Give access'}
        </Btn>
      </div>
    </Section>
  )
}

// A student's tutors: who can see their progress and set them work.
function TutorLinksSection({ studentId, onChange }) {
  const [links, setLinks] = useState(null)
  const [tutors, setTutors] = useState([])
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setError('')
    try { setLinks(await adminListTutorLinks({ studentId })) } catch (e) { setError(e.message); setLinks([]) }
  }, [studentId])
  useEffect(() => { reload() }, [reload])
  useEffect(() => { fetchTutorList().then(setTutors).catch(() => setTutors([])) }, [])

  const run = async (fn) => {
    setBusy(true); setError('')
    try { await fn(); await reload(); onChange?.() } catch (e) { setError(e.message) }
    setBusy(false)
  }

  const linkedIds = new Set((links || []).map(l => l.tutor_id))
  const available = tutors.filter(t => !linkedIds.has(t.id) && t.id !== studentId)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {error && <div style={{ fontSize: 12, color: 'var(--t-danger)' }}>{error}</div>}
      {links === null ? (
        <div style={{ fontSize: 12, color: 'var(--t-textFaint)' }}>Loading…</div>
      ) : links.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--t-textFaint)' }}>No tutor assigned.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {links.map(l => (
            <span key={l.tutor_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--t-border)', fontSize: 12, color: 'var(--t-textSub)' }}>
              {l.tutor_name || 'Unnamed tutor'}
              <button onClick={() => run(() => adminUnlinkTutor(l.tutor_id, studentId))} disabled={busy} title="Unassign tutor"
                style={{ border: 'none', background: 'transparent', color: 'var(--t-danger)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={adding} onChange={e => setAdding(e.target.value)} disabled={busy}
          style={{ flex: 1, padding: '7px 10px', borderRadius: 8, background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', color: 'var(--t-text)', fontSize: 12, fontFamily: FONT_B }}>
          <option value="">Assign a tutor…</option>
          {available.map(t => <option key={t.id} value={t.id}>{t.display_name || 'Unnamed'}{t.is_admin ? ' (admin)' : ''}</option>)}
        </select>
        <Btn onClick={() => run(async () => { await adminLinkTutor(adding, studentId); setAdding('') })} disabled={!adding || busy} variant="primary">Assign</Btn>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-text)', marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
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
        padding: '7px 13px', borderRadius: 9,
        border: isPrimary ? 'none' : '1px solid var(--t-border)',
        background: isPrimary ? 'var(--t-accent)' : 'var(--t-bgCard)',
        color: isPrimary ? '#0c1037' : 'var(--t-text)',
        fontSize: 12.5, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: FONT_B,
        whiteSpace: 'nowrap',
      }}
    >{children}</button>
  )
}

function DangerBtn({ children, onClick, disabled, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '7px 13px', borderRadius: 9,
        border: '1px solid var(--t-danger)',
        background: 'transparent',
        color: 'var(--t-danger)',
        fontSize: 12.5, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: FONT_B,
        whiteSpace: 'nowrap',
      }}
    >{children}</button>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────
const th = {
  padding: '10px 14px', fontSize: 11.5, color: 'var(--t-textMuted)',
  fontWeight: 700, textAlign: 'left', borderBottom: '1px solid var(--t-border)',
  whiteSpace: 'nowrap',
}
const td = { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle', borderBottom: '1px solid var(--t-border)' }

const inputStyle = {
  padding: '7px 12px', borderRadius: 9, flex: 1, minWidth: 180,
  background: 'var(--t-bgInput)', border: '1px solid var(--t-border)',
  color: 'var(--t-text)', fontSize: 13, fontFamily: FONT_B, outline: 'none',
}

const selectStyle = {
  padding: '6px 9px', borderRadius: 9,
  background: 'var(--t-bgInput)', border: '1px solid var(--t-border)',
  color: 'var(--t-textMuted)', fontSize: 12.5, fontFamily: FONT_B, outline: 'none', cursor: 'pointer',
}
