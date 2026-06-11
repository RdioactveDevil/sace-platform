import { useState, useEffect, useMemo, Fragment } from 'react'
import { THEMES } from '../lib/theme'
import {
  fetchRoster,
  fetchStudentEmails,
  addStudentToRoster,
  removeStudentFromRoster,
  notifyStudent,
  fetchTutorClasses,
  fetchAssignmentsForTutor,
  fetchRosterDetails,
  setStudentYearLevel,
  addStudentSubject,
  removeStudentSubject,
} from '../lib/db'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const YEAR_LEVELS = ['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12']
const STAGES = ['Stage 1', 'Stage 2']

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}
function yearSortVal(y) {
  if (!y) return 999
  const m = /(\d+)/.exec(y)
  return m ? Number(m[1]) : 998
}

const SORTS = [
  { id: 'name',   label: 'Name' },
  { id: 'year',   label: 'Year level' },
  { id: 'xp',     label: 'XP' },
  { id: 'streak', label: 'Streak' },
  { id: 'open',   label: 'Open tasks' },
]
const GROUPS = [
  { id: 'none',  label: 'No grouping' },
  { id: 'year',  label: 'Year level' },
  { id: 'stage', label: 'Stage' },
  { id: 'class', label: 'Class' },
]

export default function StudentsTab({ profile, theme }) {
  const t = THEMES[theme]

  const [roster, setRoster] = useState([])
  const [emails, setEmails] = useState({})
  const [details, setDetails] = useState({})           // { id: { year_level, subjects:[] } }
  const [classes, setClasses] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)

  // toolbar state
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [groupBy, setGroupBy] = useState('none')
  const [fYear, setFYear] = useState('')
  const [fStage, setFStage] = useState('')
  const [fClass, setFClass] = useState('')
  const [attentionOnly, setAttentionOnly] = useState(false)

  // add / edit / notify
  const [email, setEmail] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [notifyId, setNotifyId] = useState(null)
  const [notifyMsg, setNotifyMsg] = useState('')
  const [notifyState, setNotifyState] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [r, cls, asg] = await Promise.all([
        fetchRoster(profile.id),
        fetchTutorClasses().catch(() => []),
        fetchAssignmentsForTutor(profile.id).catch(() => []),
      ])
      setRoster(r); setClasses(cls); setAssignments(asg)
      if (r.length) {
        fetchStudentEmails(r.map(x => x.student_id)).then(setEmails).catch(() => {})
      } else setEmails({})
      fetchRosterDetails().then(setDetails).catch(() => {})
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [profile.id])

  const classesByStudent = useMemo(() => {
    const m = {}
    for (const c of classes) for (const mem of (c.members || [])) {
      (m[mem.student_id] = m[mem.student_id] || []).push(c)
    }
    return m
  }, [classes])

  const tasksByStudent = useMemo(() => {
    const m = {}
    const now = Date.now()
    for (const a of assignments) {
      const e = (m[a.student_id] = m[a.student_id] || { pending: 0, overdue: 0 })
      if (!a.completed_at) {
        e.pending++
        if (a.due_date && new Date(a.due_date).setHours(23, 59, 59, 999) < now) e.overdue++
      }
    }
    return m
  }, [assignments])

  // Enriched per-student model
  const students = useMemo(() => roster.map(r => {
    const d = details[r.student_id] || {}
    const subjects = d.tutored || []                         // subjects this tutor tutors
    const stages = [...new Set(subjects.map(s => s.stage).filter(Boolean))]
    const cls = classesByStudent[r.student_id] || []
    const tasks = tasksByStudent[r.student_id] || { pending: 0, overdue: 0 }
    // Effective year level: tutor override, else the student's onboarding value.
    const effYear = d.override_year_level || (d.profile_year_level != null ? `Year ${d.profile_year_level}` : '')
    return {
      id: r.student_id,
      name: r.profiles?.display_name || 'Unknown',
      email: emails[r.student_id] || '',
      xp: r.profiles?.xp ?? 0,
      streak: r.profiles?.streak ?? 0,
      invited_at: r.invited_at,
      year_level: effYear,
      overrideYear: d.override_year_level || '',
      profileYear: d.profile_year_level ?? null,
      subscriptions: d.subscriptions || [],
      subjects,
      stages,
      classes: cls,
      classNames: cls.map(c => c.name),
      pending: tasks.pending,
      overdue: tasks.overdue,
    }
  }), [roster, details, emails, classesByStudent, tasksByStudent])

  // Distinct filter options
  const yearOptions = useMemo(() => [...new Set(students.map(s => s.year_level).filter(Boolean))].sort((a, b) => yearSortVal(a) - yearSortVal(b)), [students])
  const stageOptions = useMemo(() => [...new Set(students.flatMap(s => s.stages))].sort(), [students])
  const classOptions = useMemo(() => [...new Set(students.flatMap(s => s.classNames))].sort(), [students])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return students.filter(s => {
      if (term && !(s.name.toLowerCase().includes(term) || s.email.toLowerCase().includes(term))) return false
      if (fYear && s.year_level !== fYear) return false
      if (fStage && !s.stages.includes(fStage)) return false
      if (fClass && !s.classNames.includes(fClass)) return false
      if (attentionOnly && s.overdue === 0) return false
      return true
    })
  }, [students, search, fYear, fStage, fClass, attentionOnly])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let av, bv
      switch (sortKey) {
        case 'year': av = yearSortVal(a.year_level); bv = yearSortVal(b.year_level); break
        case 'xp': av = a.xp; bv = b.xp; break
        case 'streak': av = a.streak; bv = b.streak; break
        case 'open': av = a.pending; bv = b.pending; break
        default: av = a.name.toLowerCase(); bv = b.name.toLowerCase()
      }
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1
    })
  }, [filtered, sortKey, sortDir])

  // Grouping → [{ key, rows }]
  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ key: null, rows: sorted }]
    const map = new Map()
    const push = (k, row) => { if (!map.has(k)) map.set(k, []); map.get(k).push(row) }
    for (const s of sorted) {
      if (groupBy === 'year') push(s.year_level || '— No year level', s)
      else if (groupBy === 'stage') { (s.stages.length ? s.stages : ['— No stage']).forEach(k => push(k, s)) }
      else if (groupBy === 'class') { (s.classNames.length ? s.classNames : ['— No class']).forEach(k => push(k, s)) }
    }
    return [...map.entries()].sort((a, b) => {
      if (groupBy === 'year') return yearSortVal(a[0]) - yearSortVal(b[0])
      return a[0] < b[0] ? -1 : 1
    }).map(([key, rows]) => ({ key, rows }))
  }, [sorted, groupBy])

  // ── actions ──
  const handleAdd = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setAddError(''); setAddLoading(true)
    try {
      await addStudentToRoster(profile.id, email.trim().toLowerCase())
      setEmail(''); setShowAdd(false); await load()
    } catch (err) { setAddError(err.message || 'Could not find a student with that email.') }
    setAddLoading(false)
  }
  const handleRemove = async (id) => {
    try { await removeStudentFromRoster(profile.id, id); setConfirmRemove(null); await load() } catch {}
  }
  const handleNotify = async (id) => {
    setNotifyState('sending')
    const res = await notifyStudent(id, notifyMsg.trim() || undefined)
    setNotifyState(res.ok ? 'sent' : 'fail')
    if (res.ok) setTimeout(() => { setNotifyId(null); setNotifyMsg(''); setNotifyState(null) }, 1500)
  }

  const card = theme === 'dark'
    ? { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, boxShadow: '0 4px 28px rgba(0,0,0,0.40)' }
    : { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, boxShadow: t.shadowCard }
  const divider = theme === 'dark' ? 'rgba(255,255,255,0.07)' : t.border
  const ctrl = { padding: '8px 11px', borderRadius: 9, border: theme === 'dark' ? '1px solid rgba(255,255,255,0.10)' : `1px solid ${t.border}`, background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : t.bgInput, color: t.text, fontSize: 13, fontFamily: FONT_B, outline: 'none' }
  const chipStyle = (active) => ({ padding: '7px 13px', borderRadius: 20, border: `1px solid ${active ? GOLD : t.border}`, background: active ? 'rgba(241,190,67,0.14)' : t.bgCard, color: active ? GOLD : t.textMuted, fontSize: 12, fontWeight: active ? 700 : 600, cursor: 'pointer', fontFamily: FONT_B })
  const tag = (text, color, key) => (
    <span key={key} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${color}1f`, color, whiteSpace: 'nowrap' }}>{text}</span>
  )

  const colCount = 7

  const renderRow = (s) => (
    <Fragment key={s.id}>
      <tr style={{ borderBottom: `1px solid ${divider}` }}
        onMouseEnter={e => e.currentTarget.style.background = t.bgHover}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <td style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#0c1037', flexShrink: 0, fontSize: 13 }}>{s.name[0].toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{s.name}</div>
              {s.email && <div style={{ fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{s.email}</div>}
            </div>
          </div>
        </td>
        <td style={{ padding: '12px 16px', fontSize: 13, color: s.year_level ? t.text : t.textFaint, whiteSpace: 'nowrap' }}>{s.year_level || '—'}</td>
        <td style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {s.subjects.length ? s.subjects.map(su => tag(`${su.subject_name}${su.stage ? ` · ${su.stage}` : ''}`, GOLD, su.id)) : <span style={{ color: t.textFaint, fontSize: 13 }}>—</span>}
          </div>
        </td>
        <td style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {s.classes.length ? s.classes.map(c => tag(c.name, c.color || t.blue, c.id)) : <span style={{ color: t.textFaint, fontSize: 13 }}>—</span>}
          </div>
        </td>
        <td style={{ padding: '12px 16px', fontSize: 13, color: t.textSub, whiteSpace: 'nowrap' }}>{s.xp.toLocaleString()} · 🔥{s.streak}</td>
        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
          {s.overdue > 0 ? tag(`${s.overdue} overdue`, t.danger) : s.pending > 0 ? tag(`${s.pending} open`, GOLD) : tag('Up to date', t.success)}
        </td>
        <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
          <button onClick={() => { setEditId(editId === s.id ? null : s.id) }} style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${editId === s.id ? GOLD : t.border}`, background: editId === s.id ? 'rgba(241,190,67,0.12)' : 'transparent', color: editId === s.id ? GOLD : t.textSub, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, marginRight: 6 }}>Edit</button>
          <button onClick={() => { setNotifyId(notifyId === s.id ? null : s.id); setNotifyMsg(''); setNotifyState(null) }} style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textSub, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B, marginRight: 6 }}>✉</button>
          <button onClick={() => setConfirmRemove(s.id)} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: t.danger, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>✕</button>
        </td>
      </tr>

      {editId === s.id && (
        <tr><td colSpan={colCount} style={{ padding: '0 16px 16px', background: t.bgSubtle }}>
          <StudentEditor student={s} theme={theme} onChange={load} />
        </td></tr>
      )}
      {confirmRemove === s.id && (
        <tr><td colSpan={colCount} style={{ padding: '12px 16px', background: t.dangerBg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: t.text }}>Remove <strong>{s.name}</strong> from your roster?</span>
            <button onClick={() => handleRemove(s.id)} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>Remove</button>
            <button onClick={() => setConfirmRemove(null)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Cancel</button>
          </div>
        </td></tr>
      )}
      {notifyId === s.id && (
        <tr><td colSpan={colCount} style={{ padding: '12px 16px', background: t.bgSubtle }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea value={notifyMsg} onChange={e => setNotifyMsg(e.target.value)} rows={2} placeholder={`Message to ${s.name} (blank = default reminder)…`} style={{ ...ctrl, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={() => handleNotify(s.id)} disabled={notifyState === 'sending'} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: '#0c1037', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>{notifyState === 'sending' ? 'Sending…' : 'Send email'}</button>
              {notifyState === 'sent' && <span style={{ fontSize: 12, color: t.success, fontWeight: 600 }}>Sent!</span>}
              {notifyState === 'fail' && <span style={{ fontSize: 12, color: t.danger, fontWeight: 600 }}>Failed.</span>}
            </div>
          </div>
        </td></tr>
      )}
    </Fragment>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...ctrl, padding: '8px 12px', flex: '1 1 220px', minWidth: 180 }}>
          <span style={{ color: t.textMuted, fontSize: 13 }}>🔎</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search this roster…" style={{ border: 'none', background: 'transparent', outline: 'none', color: t.text, fontFamily: FONT_B, fontSize: 13, width: '100%' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Sort</span>
          <select className="td-input-gold" value={sortKey} onChange={e => setSortKey(e.target.value)} style={ctrl}>{SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} title="Toggle direction" style={{ ...ctrl, cursor: 'pointer', width: 36 }}>{sortDir === 'asc' ? '↑' : '↓'}</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Group</span>
          <select className="td-input-gold" value={groupBy} onChange={e => setGroupBy(e.target.value)} style={ctrl}>{GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
        </div>
        <button onClick={() => { setShowAdd(v => !v); setAddError('') }} style={{ marginLeft: 'auto', padding: '9px 16px', borderRadius: 9, border: 'none', background: showAdd ? t.bgHover : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: showAdd ? t.textMuted : '#0c1037', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>{showAdd ? '✕ Cancel' : '+ Add student'}</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={fYear} onChange={e => setFYear(e.target.value)} style={{ ...ctrl, color: fYear ? GOLD : t.textMuted, borderColor: fYear ? GOLD : t.border }}>
          <option value="">All years</option>{yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={fStage} onChange={e => setFStage(e.target.value)} style={{ ...ctrl, color: fStage ? GOLD : t.textMuted, borderColor: fStage ? GOLD : t.border }}>
          <option value="">All stages</option>{stageOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fClass} onChange={e => setFClass(e.target.value)} style={{ ...ctrl, color: fClass ? GOLD : t.textMuted, borderColor: fClass ? GOLD : t.border }}>
          <option value="">All classes</option>{classOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => setAttentionOnly(v => !v)} style={chipStyle(attentionOnly)}>⚠ Needs attention</button>
        {(fYear || fStage || fClass || attentionOnly || search) && (
          <button onClick={() => { setFYear(''); setFStage(''); setFClass(''); setAttentionOnly(false); setSearch('') }} style={{ ...chipStyle(false), color: t.textFaint }}>Clear</button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ ...card, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 10 }}>Enter the student's email to add them to your roster. You can set their year level &amp; subjects after.</div>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input className="td-input-gold" value={email} onChange={e => { setEmail(e.target.value); setAddError('') }} placeholder="student@email.com" type="email" style={{ ...ctrl, flex: 1, minWidth: 220 }} />
            <button type="submit" disabled={addLoading || !email.trim()} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: addLoading || !email.trim() ? t.border : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: addLoading || !email.trim() ? t.textMuted : '#0c1037', fontSize: 13, fontWeight: 800, cursor: addLoading || !email.trim() ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}>{addLoading ? 'Adding…' : 'Add'}</button>
          </form>
          {addError && <div style={{ marginTop: 8, fontSize: 12, color: t.danger }}>{addError}</div>}
        </div>
      )}

      {/* Table */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '13px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>My Students</div>
          <div style={{ fontSize: 12, color: t.textMuted }}>{filtered.length}{filtered.length !== students.length ? ` of ${students.length}` : ''} student{students.length !== 1 ? 's' : ''}</div>
        </div>
        {loading ? (
          <div style={{ padding: 36, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Loading…</div>
        ) : students.length === 0 ? (
          <div style={{ padding: 36, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No students yet. Add one above to get started.</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 36, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No students match the current filters.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr>
                  {['Student', 'Year', 'Subject · Stage', 'Class', 'XP · Streak', 'Tasks', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: i === colCount - 1 ? 'right' : 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textMuted, fontWeight: 700, padding: '11px 16px', borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              {groups.map((g, gi) => (
                <tbody key={gi}>
                  {g.key != null && (
                    <tr><td colSpan={colCount} style={{ padding: '10px 16px', background: t.bgSubtle, borderBottom: `1px solid ${t.border}` }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: GOLD, letterSpacing: '0.02em' }}>{g.key}</span>
                      <span style={{ fontSize: 12, color: t.textMuted, marginLeft: 8 }}>{g.rows.length}</span>
                    </td></tr>
                  )}
                  {g.rows.map(renderRow)}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Inline editor: year-level override + pick which subjects you tutor ──────────
function StudentEditor({ student, theme, onChange }) {
  const t = THEMES[theme]
  const [year, setYear] = useState(student.overrideYear || '')
  const [savingYear, setSavingYear] = useState(false)
  const [tutored, setTutored] = useState(student.subjects || [])  // [{id, subject_name, stage}]
  const [busyKey, setBusyKey] = useState(null)

  const ctrl = { padding: '8px 11px', borderRadius: 9, border: `1px solid ${t.border}`, background: t.bgInput, color: t.text, fontSize: 13, fontFamily: FONT_B, outline: 'none' }
  const subKey = (subject_name, stage) => `${subject_name}::${stage || ''}`
  const tutoredByKey = useMemo(() => {
    const m = {}
    for (const s of tutored) m[subKey(s.subject_name, s.stage)] = s
    return m
  }, [tutored])

  const firstName = student.name.split(' ')[0]

  const saveYear = async (val) => {
    setYear(val); setSavingYear(true)
    try { await setStudentYearLevel(student.id, val) } catch {}
    setSavingYear(false); onChange()
  }

  const toggleSubject = async (sub) => {
    const key = subKey(sub.subject_name, sub.stage)
    setBusyKey(key)
    try {
      const existing = tutoredByKey[key]
      if (existing) {
        setTutored(prev => prev.filter(p => p.id !== existing.id))
        await removeStudentSubject(student.id, existing.id)
      } else {
        const s = await addStudentSubject(student.id, sub.subject_name, sub.stage || null)
        if (s) setTutored(prev => [...prev.filter(p => p.id !== s.id), s])
      }
    } catch {}
    setBusyKey(null); onChange()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Year level</span>
        <select value={year} onChange={e => saveYear(e.target.value)} style={ctrl}>
          <option value="">{student.profileYear != null ? `From onboarding: Year ${student.profileYear}` : '— not set —'}</option>
          {YEAR_LEVELS.map(y => <option key={y} value={y}>{y}{student.profileYear != null && `Year ${student.profileYear}` === y ? ' (onboarding)' : ''}</option>)}
        </select>
        {year && <button onClick={() => saveYear('')} style={{ ...ctrl, cursor: 'pointer', fontSize: 12, color: t.textMuted }}>Reset to onboarding</button>}
        {savingYear && <span style={{ fontSize: 12, color: t.textMuted }}>Saving…</span>}
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Subjects you tutor {firstName} in
        </div>
        {student.subscriptions.length === 0 ? (
          <span style={{ fontSize: 13, color: t.textFaint }}>{firstName} hasn't picked any subjects at onboarding yet — nothing to select.</span>
        ) : (
          <>
            <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>Tick the subject(s) from {firstName}'s enrolled subjects that you tutor them in.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {student.subscriptions.map(sub => {
                const key = subKey(sub.subject_name, sub.stage)
                const on = !!tutoredByKey[key]
                return (
                  <button key={key} onClick={() => toggleSubject(sub)} disabled={busyKey === key}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: FONT_B,
                      border: `1px solid ${on ? GOLD : t.border}`, background: on ? 'rgba(241,190,67,0.14)' : 'transparent', color: on ? GOLD : t.textSub }}>
                    <span>{on ? '✓' : '+'}</span>
                    {sub.subject_name}{sub.stage ? ` · ${sub.stage}` : ''}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
