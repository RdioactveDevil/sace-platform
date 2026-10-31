import { useEffect, useState } from 'react'
import { adminListAssignments, adminListTutors, adminListStudents, adminListAssignmentSubjects } from '../lib/db'

import { ui, chip, btn, note, FONT_B } from '../lib/adminUi'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS = {
  pending:   ['Open', 'var(--t-textSub)'],
  overdue:   ['Overdue', 'var(--t-danger)'],
  completed: ['Done', 'var(--t-success)'],
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
    <div style={{ fontFamily: FONT_B, color: 'var(--t-textSub)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div role="group" aria-label="Status" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['', 'All'], ['pending', 'Open'], ['overdue', 'Overdue'], ['completed', 'Done']].map(([v, label]) => (
            <button key={label} type="button" aria-pressed={filterStatus === v} onClick={() => setFilterStatus(v)} style={chip(filterStatus === v)}>{label}</button>
          ))}
        </div>
        {!loading && <span style={{ fontSize: 12.5, color: 'var(--t-textMuted)' }}>{total.toLocaleString()} assignment{total === 1 ? '' : 's'}</span>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select value={filterTutor} onChange={e => setFilterTutor(e.target.value)} style={selectStyle}>
          <option value="">All tutors</option>
          {tutors.map(t => <option key={t.id} value={t.id}>{t.display_name || t.email || t.id}</option>)}
        </select>
        <select value={filterStudent} onChange={e => setFilterStudent(e.target.value)} style={selectStyle}>
          <option value="">All students</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.display_name || s.email || s.id}</option>)}
        </select>
        <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)} style={selectStyle}>
          <option value="">All subjects</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} style={selectStyle}>
          <option value="created">Newest first</option>
          <option value="due">By due date</option>
        </select>
        {hasFilters && (
          <button type="button" onClick={clearFilters} style={{ background: 'none', border: 'none', color: 'var(--t-textMuted)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
            Clear
          </button>
        )}
      </div>

      {error && <div role="alert" style={note('danger')}>{error}</div>}

      {loading ? (
        <div style={{ color: 'var(--t-textMuted)', fontSize: 13, padding: '24px 0' }}>Loading assignments…</div>
      ) : assignments.length === 0 ? (
        <div style={ui.empty}>{hasFilters ? 'No assignments match these filters.' : 'No tutor has set any work yet.'}</div>
      ) : (
        <>
          <div style={{ ...ui.card, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={th}>Type</th>
                  <th style={th}>Tutor</th>
                  <th style={th}>Student</th>
                  <th style={th}>Subject and topics</th>
                  <th style={th}>Created</th>
                  <th style={th}>Due</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map(a => (
                  <tr key={a.id}>
                    <td style={{ ...td, fontWeight: 700, color: 'var(--t-text)' }}>{a.type}</td>
                    <td style={td}>{a.tutor_name}</td>
                    <td style={td}>{a.student_name}</td>
                    <td style={td}>
                      <div style={{ color: 'var(--t-textSub)' }}>{a.subject}</div>
                      {a.topics?.length > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--t-textMuted)', marginTop: 1, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.topics.join(', ')}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, color: 'var(--t-textMuted)', whiteSpace: 'nowrap' }}>{fmtDate(a.created_at)}</td>
                    <td style={{ ...td, color: 'var(--t-textMuted)', whiteSpace: 'nowrap' }}>{fmtDate(a.due_date)}</td>
                    <td style={td}>
                      <StatusBadge status={a.status} />
                      {a.completed_at && (
                        <div style={{ fontSize: 12, color: 'var(--t-textMuted)', marginTop: 1 }}>{fmtDate(a.completed_at)}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, fontSize: 12.5, color: 'var(--t-textMuted)' }}>
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
  const [label, color] = STATUS[status] || [status, 'var(--t-textSub)']
  return <span style={{ fontSize: 12.5, fontWeight: 700, color }}>{label}</span>
}

const th = ui.th
const td = ui.td
const selectStyle = { ...ui.input, padding: '6px 9px', fontSize: 12.5 }
const pagerBtn = (disabled) => btn('secondary', disabled)
