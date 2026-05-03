import { useEffect, useState } from 'react'
import { adminListAssignments, adminListTutors, adminListStudents, adminListAssignmentSubjects } from '../lib/db'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusColor(s) {
  if (s === 'completed') return '#4ade80'
  if (s === 'overdue')   return '#f87171'
  return GOLD
}

const PAGE_SIZE = 100

export default function AdminAssignmentsTab() {
  const [assignments, setAssignments] = useState([])
  const [total, setTotal]             = useState(0)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  const [tutors, setTutors]           = useState([])
  const [students, setStudents]       = useState([])
  const [allSubjects, setAllSubjects] = useState([])

  const [filterTutor, setFilterTutor]     = useState('')
  const [filterStudent, setFilterStudent] = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  const [sort, setSort] = useState('created') // 'created' | 'due'
  const [offset, setOffset] = useState(0)

  // Load lookup lists once for filter dropdowns
  useEffect(() => {
    adminListTutors().then(setTutors).catch(() => {})
    adminListStudents().then(j => setStudents(j.students || [])).catch(() => {})
    adminListAssignmentSubjects().then(setAllSubjects).catch(() => {})
  }, [])

  // Load assignments whenever filters change
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    adminListAssignments({
      tutor_id: filterTutor,
      student_id: filterStudent,
      status: filterStatus,
      subject: filterSubject,
      sort,
      limit: PAGE_SIZE,
      offset,
    })
      .then(json => {
        if (cancelled) return
        setAssignments(json.assignments || [])
        setTotal(json.total ?? 0)
        setLoading(false)
      })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [filterTutor, filterStudent, filterStatus, filterSubject, sort, offset])

  // Reset offset when filters change
  useEffect(() => { setOffset(0) }, [filterTutor, filterStudent, filterStatus, filterSubject, sort])

  // Subject options come from the dedicated endpoint (all subjects across
  // all assignments), not the current page, so admins can filter to subjects
  // that don't happen to appear in the visible rows.
  const subjects = allSubjects

  const hasFilters = filterTutor || filterStudent || filterStatus || filterSubject
  const clearFilters = () => { setFilterTutor(''); setFilterStudent(''); setFilterStatus(''); setFilterSubject('') }

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div style={{ fontFamily: FONT_B, color: '#e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, color: GOLD }}>
          Assignments
          <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8, fontWeight: 400 }}>({total.toLocaleString()})</span>
        </h2>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <select value={filterTutor} onChange={e => setFilterTutor(e.target.value)} style={selectStyle}>
          <option value="">All tutors</option>
          {tutors.map(t => <option key={t.id} value={t.id}>{t.display_name || t.email || t.id}</option>)}
        </select>
        <select value={filterStudent} onChange={e => setFilterStudent(e.target.value)} style={selectStyle}>
          <option value="">All students</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.display_name || s.email || s.id}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="completed">Completed</option>
        </select>
        <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)} style={selectStyle}>
          <option value="">All subjects</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} style={selectStyle}>
          <option value="created">Sort: Newest first</option>
          <option value="due">Sort: Due date</option>
        </select>
        {hasFilters && (
          <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>
            Clear filters
          </button>
        )}
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {loading ? (
        <div style={{ color: '#64748b', fontSize: 13, padding: '24px 0' }}>Loading assignments…</div>
      ) : assignments.length === 0 ? (
        <div style={emptyBox}>{hasFilters ? 'No assignments match the current filters.' : 'No assignments have been issued yet.'}</div>
      ) : (
        <>
          <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 980 }}>
              <thead style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
                <tr>
                  <th style={th}>Type</th>
                  <th style={th}>Tutor</th>
                  <th style={th}>Student</th>
                  <th style={th}>Subject / Topics</th>
                  <th style={th}>Created</th>
                  <th style={th}>Due</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map(a => (
                  <tr key={a.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ ...td, fontWeight: 700, color: '#f1f5f9' }}>{a.type}</td>
                    <td style={td}>{a.tutor_name}</td>
                    <td style={td}>{a.student_name}</td>
                    <td style={td}>
                      <div style={{ color: '#cbd5e1' }}>{a.subject}</div>
                      {a.topics?.length > 0 && (
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.topics.join(', ')}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(a.created_at)}</td>
                    <td style={{ ...td, color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(a.due_date)}</td>
                    <td style={td}>
                      <StatusBadge status={a.status} />
                      {a.completed_at && (
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{fmtDate(a.completed_at)}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 12, fontSize: 12, color: '#94a3b8' }}>
              <button
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
                style={pagerBtn(offset === 0)}
              >
                ← Prev
              </button>
              <span>Page {page} of {totalPages}</span>
              <button
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total}
                style={pagerBtn(offset + PAGE_SIZE >= total)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const c = statusColor(status)
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, border: `1px solid ${c}40`, background: `${c}15`, color: c, fontWeight: 700, textTransform: 'capitalize' }}>{status}</span>
  )
}

const th = { padding: '9px 10px', fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }
const td = { padding: '9px 10px', verticalAlign: 'middle' }
const selectStyle = { padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#f1f5f9', fontSize: 12, fontFamily: FONT_B, outline: 'none', cursor: 'pointer' }
const errorBox = { padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: '#f87171', marginBottom: 12 }
const emptyBox = { padding: '32px 16px', textAlign: 'center', color: '#64748b', fontSize: 13, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 10 }
const pagerBtn = (disabled) => ({
  padding: '6px 12px', borderRadius: 7, fontSize: 12, fontFamily: FONT_B, fontWeight: 700,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
  color: disabled ? '#475569' : '#e2e8f0', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
})
