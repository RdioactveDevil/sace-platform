import { useState, useEffect, useMemo, Fragment } from 'react'
import { Flame, Mail, Search, TriangleAlert } from 'lucide-react'
import { THEMES } from '../lib/theme'
import {
  fetchRoster,
  fetchStudentEmails,
  inviteStudent,
  fetchPendingInvites,
  cancelInvite,
  removeStudentFromRoster,
  notifyStudent,
  fetchTutorClasses,
  fetchAssignmentsForTutor,
  fetchRosterDetails,
  setStudentYearLevel,
  addStudentSubject,
  removeStudentSubject,
  fetchIncludableSubjects,
  setIncludedSubject,
  removeIncludedSubject,
  fetchSubjectTopics,
  requireStudentDiagnostic,
  waiveStudentDiagnostic,
  getTutorBilling,
  setStudentParent,
} from '../lib/db'
import { parseEmailList, gettingStartedStatus } from '../lib/rosterOnboarding'

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

export default function StudentsTab({ profile, theme, allTutors = false }) {
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
  const [startingOnly, setStartingOnly] = useState(false) // not practising yet

  // add / edit / notify
  const [email, setEmail] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addNotice, setAddNotice] = useState('')
  // Send the invite to a parent, who sets the account up for their child (one at a time).
  const [toParent, setToParent] = useState(false)
  const [childName, setChildName] = useState('')
  const [invites, setInvites] = useState([])
  // Whether this tutor can include subjects (free for the student), and the subjects.
  const [includable, setIncludable] = useState({ canInclude: false, subjects: [] })
  // Whether the tutor plan includes weekly parent reports (null until known).
  const [parentReports, setParentReports] = useState(null)
  const [inviteSubjects, setInviteSubjects] = useState([]) // curriculum ids
  const [inviteScope, setInviteScope] = useState({})       // { curriculumId: [subtopicId] } each diagnostic covers; none = all
  const [inviteBusy, setInviteBusy] = useState(null)
  const [inviteMsg, setInviteMsg] = useState({})        // { inviteId: text }
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
        fetchRoster(profile.id, { allTutors }),
        fetchTutorClasses({ allTutors }).catch(() => []),
        fetchAssignmentsForTutor(profile.id, { allTutors }).catch(() => []),
      ])
      setRoster(r); setClasses(cls); setAssignments(asg)
      if (r.length) {
        fetchStudentEmails(r.map(x => x.student_id)).then(setEmails).catch(() => {})
      } else setEmails({})
      fetchRosterDetails({ allTutors }).then(setDetails).catch(() => {})
      fetchPendingInvites().then(setInvites).catch(() => {})
      if (!allTutors) fetchIncludableSubjects().then(setIncludable).catch(() => {})
      if (!allTutors) getTutorBilling().then(b => setParentReports(b.features?.parentReports !== false)).catch(() => {})
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [profile.id, allTutors])

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
      tutors: r.tutors || [],
      email: emails[r.student_id] || '',
      xp: r.profiles?.xp ?? 0,
      streak: r.profiles?.streak ?? 0,
      invited_at: r.invited_at,
      year_level: effYear,
      overrideYear: d.override_year_level || '',
      profileYear: d.profile_year_level ?? null,
      subscriptions: d.subscriptions || [],
      included: d.included || [],
      diagnostics: d.diagnostics || [],
      parent: d.parent || null,
      start: gettingStartedStatus({ diagnostics: d.diagnostics || [], xp: r.profiles?.xp ?? 0 }),
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
      if (startingOnly && s.start === 'practising') return false
      return true
    })
  }, [students, search, fYear, fStage, fClass, attentionOnly, startingOnly])
  const startCounts = useMemo(() => ({
    diagnostic: students.filter(s => s.start === 'diagnostic').length,
    notStarted: students.filter(s => s.start === 'not_started').length,
  }), [students])

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
  // One address, or several pasted at once: each gets the same subjects.
  const addresses = parseEmailList(email)
  const handleAdd = async (e) => {
    e.preventDefault()
    if (addLoading || !addresses.length) return
    if (addresses.length > 50) { setAddError('Paste up to 50 addresses at a time.'); return }
    const child = childName.trim()
    if (toParent && addresses.length > 1) { setAddError('Invite one parent at a time, so each invite has their child\'s name.'); return }
    if (toParent && !child) { setAddError("Enter the child's first name."); return }
    setAddError(''); setAddLoading(true)
    setAddNotice('')
    const scope = Object.fromEntries(inviteSubjects.filter(id => inviteScope[id]?.length).map(id => [id, inviteScope[id]]))
    const results = []
    for (const addr of addresses) {
      try {
        const res = await inviteStudent(addr, includable.canInclude ? inviteSubjects : undefined, includable.canInclude ? scope : undefined,
          { parent: toParent, childName: child })
        results.push({ addr, ok: !!res.emailSent, saved: true, error: res.emailError, subjects: res.invite?.subjects || [] })
      } catch (err) {
        results.push({ addr, ok: false, saved: false, error: err.message || 'Could not send the invite.' })
      }
    }
    const sent = results.filter(r => r.ok)
    const failed = results.filter(r => !r.ok)
    const unlocked = sent[0]?.subjects || []
    const withSubjects = unlocked.length ? `, with ${unlocked.join(', ')} unlocked` : ''
    if (sent.length && toParent) {
      setAddNotice(`Invite sent to ${sent[0].addr}. ${child} joins your roster once their parent accepts${withSubjects}.`)
    } else if (sent.length) {
      setAddNotice(sent.length === 1
        ? `Invite sent to ${sent[0].addr}. They'll join your roster once they accept${withSubjects}.`
        : `Invites sent to ${sent.length} students. They'll join your roster as they accept${withSubjects}.`)
    }
    if (failed.length === 1 && results.length === 1) {
      const f = failed[0]
      setAddError(f.saved ? `Invite saved, but the email didn't send: ${String(f.error).replace(/\.+$/, '')}. Try Resend below.` : f.error)
    } else if (failed.length) {
      setAddError(`${failed.length} didn't go out: ${failed.map(f => `${f.addr} (${String(f.error || 'error').replace(/\.+$/, '')})`).join('; ')}.`)
    }
    // Keep only the ones that didn't go out, to fix and retry.
    setEmail(failed.filter(f => !f.saved).map(f => f.addr).join('\n'))
    if (!failed.length) { setInviteSubjects([]); setInviteScope({}); setChildName('') }
    fetchPendingInvites().then(setInvites).catch(() => {})
    setAddLoading(false)
  }
  const handleResend = async (inv) => {
    setInviteBusy(inv.id); setInviteMsg(m => ({ ...m, [inv.id]: '' }))
    try {
      const res = await inviteStudent(inv.email)
      setInviteMsg(m => ({ ...m, [inv.id]: res.emailSent ? 'Sent again.' : `Email failed: ${res.emailError}` }))
      fetchPendingInvites().then(setInvites).catch(() => {})
    } catch (err) { setInviteMsg(m => ({ ...m, [inv.id]: err.message })) }
    setInviteBusy(null)
  }
  const handleCancelInvite = async (inv) => {
    setInviteBusy(inv.id)
    try { await cancelInvite(inv.id); setInvites(prev => prev.filter(i => i.id !== inv.id)) }
    catch (err) { setInviteMsg(m => ({ ...m, [inv.id]: err.message })) }
    setInviteBusy(null)
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
    : { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, boxShadow: t.shadowCard }
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{s.name}</span>
                {s.start === 'diagnostic' && tag('Diagnostic to do', GOLD)}
                {s.start === 'not_started' && tag("Hasn't practised yet", t.textMuted)}
              </div>
              {s.email && <div style={{ fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{s.email}</div>}
              {allTutors && s.tutors.length > 0 && (
                <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>Tutor{s.tutors.length > 1 ? 's' : ''}: {s.tutors.map(tu => tu.display_name || 'Unnamed').join(', ')}</div>
              )}
            </div>
          </div>
        </td>
        <td style={{ padding: '12px 16px', fontSize: 13, color: s.year_level ? t.text : t.textFaint, whiteSpace: 'nowrap' }}>{s.year_level || '—'}</td>
        <td style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {s.subjects.length ? s.subjects.map(su => {
              const free = s.included.some(inc => inc.subject_name === su.subject_name && (inc.stage || '') === (su.stage || ''))
              return tag(`${su.subject_name}${su.stage ? ` · ${su.stage}` : ''}${free ? ' · included' : ''}`, free ? t.success : GOLD, su.id)
            }) : <span style={{ color: t.textFaint, fontSize: 13 }}>—</span>}
          </div>
        </td>
        <td style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {s.classes.length ? s.classes.map(c => tag(c.name, c.color || t.blue, c.id)) : <span style={{ color: t.textFaint, fontSize: 13 }}>—</span>}
          </div>
        </td>
        <td style={{ padding: '12px 16px', fontSize: 13, color: t.textSub, whiteSpace: 'nowrap' }}>{s.xp.toLocaleString()} · <Flame size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} />{s.streak}</td>
        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
          {s.overdue > 0 ? tag(`${s.overdue} overdue`, t.danger) : s.pending > 0 ? tag(`${s.pending} open`, GOLD) : tag('Up to date', t.success)}
        </td>
        <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
          {/* Year level, subjects and removal are per-tutor roster settings. */}
          {!allTutors && <button onClick={() => { setEditId(editId === s.id ? null : s.id) }} style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${editId === s.id ? GOLD : t.border}`, background: editId === s.id ? 'rgba(241,190,67,0.12)' : 'transparent', color: editId === s.id ? GOLD : t.textSub, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, marginRight: 6 }}>Edit</button>}
          <button onClick={() => { setNotifyId(notifyId === s.id ? null : s.id); setNotifyMsg(''); setNotifyState(null) }} style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textSub, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B, marginRight: 6 }} aria-label="Notify student"><Mail size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} /></button>
          {!allTutors && <button onClick={() => setConfirmRemove(s.id)} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: t.danger, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>✕</button>}
        </td>
      </tr>

      {editId === s.id && (
        <tr><td colSpan={colCount} style={{ padding: '0 16px 16px', background: t.bgSubtle }}>
          <StudentEditor student={s} theme={theme} onChange={load} includable={includable} parentReports={parentReports} />
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
          <Search size={14} color={t.textMuted} aria-hidden="true" style={{ flexShrink: 0 }} />
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
        <button onClick={() => { setShowAdd(v => !v); setAddError(''); setAddNotice('') }} style={{ marginLeft: 'auto', padding: '9px 16px', borderRadius: 9, border: 'none', background: showAdd ? t.bgHover : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: showAdd ? t.textMuted : '#0c1037', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>{showAdd ? '✕ Cancel' : '+ Invite student'}</button>
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
        <button onClick={() => setAttentionOnly(v => !v)} style={{ ...chipStyle(attentionOnly), display: 'inline-flex', alignItems: 'center', gap: 5 }}><TriangleAlert size={13} aria-hidden="true" />Needs attention</button>
        <button onClick={() => setStartingOnly(v => !v)} style={chipStyle(startingOnly)}>Getting started</button>
        {(fYear || fStage || fClass || attentionOnly || startingOnly || search) && (
          <button onClick={() => { setFYear(''); setFStage(''); setFClass(''); setAttentionOnly(false); setStartingOnly(false); setSearch('') }} style={{ ...chipStyle(false), color: t.textFaint }}>Clear</button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ ...card, padding: '16px 18px' }}>
          <div role="radiogroup" aria-label="Send the invite to" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, marginRight: 4 }}>Send the invite to</span>
            {[[false, 'The student'], [true, 'A parent']].map(([v, label]) => (
              <button key={label} type="button" role="radio" aria-checked={toParent === v} onClick={() => { setToParent(v); setAddError(''); setAddNotice('') }} style={chipStyle(toParent === v)}>{label}</button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 10 }}>
            {toParent
              ? "For a student without their own email. The parent sets the account up for their child under their own email, and the student joins your roster (and gets the Student Portal) once they accept. The parent also gets a progress email every Sunday."
              : "Enter the student's email and we'll send them an invite. They join your roster (and get the Student Portal) once they accept. They don't need an account yet."}
            {includable.canInclude && ' Pick the subjects you tutor them in and they unlock free when the invite is accepted.'}
          </div>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {toParent ? (
              <>
                <input className="td-input-gold" value={childName} onChange={e => { setChildName(e.target.value); setAddError(''); setAddNotice('') }}
                  placeholder="Child's first name" aria-label="Child's first name" autoComplete="off" maxLength={40}
                  style={{ ...ctrl, flex: '1 1 160px', minWidth: 140 }} />
                <input className="td-input-gold" type="email" value={email} onChange={e => { setEmail(e.target.value); setAddError(''); setAddNotice('') }}
                  placeholder="parent@email.com" aria-label="Parent's email address" autoCapitalize="none" spellCheck={false}
                  style={{ ...ctrl, flex: '2 1 220px', minWidth: 200 }} />
              </>
            ) : (
              <textarea className="td-input-gold" value={email} onChange={e => { setEmail(e.target.value); setAddError(''); setAddNotice('') }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleAdd(e) }}
                placeholder="student@email.com (or paste several, one per line or comma-separated)" aria-label="Student email addresses"
                rows={Math.min(5, Math.max(1, email.split('\n').length))} autoCapitalize="none" spellCheck={false}
                style={{ ...ctrl, flex: 1, minWidth: 220, resize: 'vertical', lineHeight: 1.5 }} />
            )}
            <button type="submit" disabled={addLoading || !addresses.length} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: addLoading || !email.trim() ? t.border : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: addLoading || !email.trim() ? t.textMuted : '#0c1037', fontSize: 13, fontWeight: 800, cursor: addLoading || !email.trim() ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}>{addLoading ? 'Sending…' : addresses.length > 1 ? `Send ${addresses.length} invites` : 'Send invite'}</button>
          </form>
          {includable.canInclude && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>Subjects included free</div>
              <SubjectChips subjects={includable.subjects} selected={inviteSubjects} theme={theme}
                onToggle={id => setInviteSubjects(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))} />
              {inviteSubjects.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: t.textMuted }}>
                    Before practising, they do a 20-question diagnostic on each subject. Choose what it covers, or leave it on all topics.
                  </div>
                  {inviteSubjects.map(id => (
                    <DiagnosticScopePicker key={id} theme={theme}
                      subject={includable.subjects.find(su => su.id === id)}
                      selected={inviteScope[id] || []}
                      onChange={ids => setInviteScope(prev => ({ ...prev, [id]: ids }))} />
                  ))}
                </div>
              )}
            </div>
          )}
          {addError && <div style={{ marginTop: 8, fontSize: 12, color: t.danger }}>{addError}</div>}
          {addNotice && <div style={{ marginTop: 8, fontSize: 12, color: t.success, fontWeight: 600 }}>{addNotice}</div>}
        </div>
      )}

      {/* Pending invites (the caller's own) */}
      {invites.length > 0 && (
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>Pending invites</div>
            <div style={{ fontSize: 12, color: t.textMuted }}>Waiting to be accepted</div>
          </div>
          {invites.map(inv => (
            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '11px 16px', borderBottom: `1px solid ${divider}` }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {inv.recipient === 'parent' ? <>{inv.child_name || 'Student'} <span style={{ fontWeight: 500, color: t.textMuted }}>· Parent: {inv.email}</span></> : inv.email}
                </div>
                <div style={{ fontSize: 11, color: inv.expired ? t.danger : t.textMuted }}>
                  {inv.expired ? 'Expired. Resend to renew' : inv.sent_at ? `Sent ${fmtDate(inv.sent_at)}` : 'Not sent yet'}
                  {inv.subjects?.length ? ` · ${inv.subjects.join(', ')} included` : ''}
                  {inv.reminded_at && !inv.expired ? ` · Reminder sent ${fmtDate(inv.reminded_at)}` : ''}
                  {inviteMsg[inv.id] ? ` · ${inviteMsg[inv.id]}` : ''}
                </div>
              </div>
              <button onClick={() => handleResend(inv)} disabled={inviteBusy === inv.id} style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textSub, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>Resend</button>
              <button onClick={() => handleCancelInvite(inv)} disabled={inviteBusy === inv.id} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: t.danger, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Cancel</button>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '13px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>My Students</div>
          <div style={{ fontSize: 12, color: t.textMuted }}>
            {filtered.length}{filtered.length !== students.length ? ` of ${students.length}` : ''} student{students.length !== 1 ? 's' : ''}
            {[
              invites.length && `${invites.length} invite${invites.length === 1 ? '' : 's'} waiting`,
              startCounts.diagnostic && `${startCounts.diagnostic} diagnostic${startCounts.diagnostic === 1 ? '' : 's'} to do`,
              startCounts.notStarted && `${startCounts.notStarted} not practising yet`,
            ].filter(Boolean).map(text => ` · ${text}`).join('')}
          </div>
        </div>
        {loading ? (
          <div style={{ padding: 36, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Loading…</div>
        ) : students.length === 0 ? (
          <div style={{ padding: 36, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No students yet. Invite one above to get started.</div>
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
function StudentEditor({ student, theme, onChange, includable, parentReports }) {
  const t = THEMES[theme]
  const [year, setYear] = useState(student.overrideYear || '')
  const [savingYear, setSavingYear] = useState(false)
  const [tutored, setTutored] = useState(student.subjects || [])  // [{id, subject_name, stage}]
  const [busyKey, setBusyKey] = useState(null)
  const [subjectError, setSubjectError] = useState('')

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
    setBusyKey(key); setSubjectError('')
    try {
      const existing = tutoredByKey[key]
      if (existing) {
        setTutored(prev => prev.filter(p => p.id !== existing.id))
        await removeStudentSubject(student.id, existing.id)
      } else {
        const s = await addStudentSubject(student.id, sub.subject_name, sub.stage || null)
        if (s) setTutored(prev => [...prev.filter(p => p.id !== s.id), s])
      }
    } catch (e) {
      // e.g. a subject beyond what the tutor plan covers.
      if (!tutoredByKey[key]) setSubjectError(e.message || 'Could not add that subject.')
    }
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

      {includable?.canInclude && <IncludedSubjectsPicker student={student} subjects={includable.subjects} theme={theme} onChange={onChange} />}

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
            {subjectError && <div style={{ fontSize: 12, color: t.danger, marginTop: 8 }}>{subjectError}</div>}
          </>
        )}
      </div>

      <ParentReportEditor student={student} theme={theme} ctrl={ctrl} available={parentReports} onChange={onChange} />
    </div>
  )
}

/** The parent who gets this student's weekly progress email (a tutor plan feature). */
function ParentReportEditor({ student, theme, ctrl, available, onChange }) {
  const t = THEMES[theme]
  const [email, setEmail] = useState(student.parent?.email || '')
  const [name, setName] = useState(student.parent?.name || '')
  const [state, setState] = useState(null) // 'saving' | 'saved' | error message
  const firstName = student.name.split(' ')[0]
  const saved = student.parent

  const save = async (nextEmail = email) => {
    setState('saving')
    try {
      await setStudentParent(student.id, { email: nextEmail.trim(), name: name.trim() })
      if (!nextEmail.trim()) { setEmail(''); setName('') }
      setState('saved'); onChange()
    } catch (e) { setState(e.message || 'Could not save.') }
  }

  const label = <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Weekly parent report</div>
  if (available === false && !saved) {
    return (
      <div>
        {label}
        <span style={{ fontSize: 13, color: t.textFaint }}>Not included on your plan. Upgrade in Plan &amp; billing to email {firstName}'s parent a progress report every week.</span>
      </div>
    )
  }
  const dirty = email.trim().toLowerCase() !== (saved?.email || '') || name.trim() !== (saved?.name || '')
  return (
    <div>
      {label}
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>
        Every Sunday evening the parent gets {firstName}'s week: questions answered, accuracy, strong and weak topics, your assignments and the next lesson.
      </div>
      <form onSubmit={e => { e.preventDefault(); save() }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="email" value={email} onChange={e => { setEmail(e.target.value); setState(null) }} placeholder="Parent's email" aria-label="Parent's email" style={{ ...ctrl, flex: '1 1 200px' }} />
        <input value={name} onChange={e => { setName(e.target.value); setState(null) }} placeholder="Parent's name (optional)" aria-label="Parent's name" maxLength={80} style={{ ...ctrl, flex: '1 1 160px' }} />
        <button type="submit" disabled={!dirty || !email.trim() || state === 'saving'} style={{ ...ctrl, cursor: 'pointer', fontWeight: 700, color: GOLD, borderColor: GOLD, opacity: !dirty || !email.trim() ? 0.5 : 1 }}>
          {state === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {saved && <button type="button" onClick={() => save('')} disabled={state === 'saving'} style={{ ...ctrl, cursor: 'pointer', fontSize: 12, color: t.textMuted }}>Stop reports</button>}
      </form>
      {saved?.unsubscribed && <div style={{ fontSize: 12, color: t.danger, marginTop: 6 }}>{saved.email} unsubscribed from these reports. Changing the address starts them again for the new one.</div>}
      {state === 'saved' && <div style={{ fontSize: 12, color: t.success, marginTop: 6 }}>Saved.</div>}
      {state && state !== 'saving' && state !== 'saved' && <div style={{ fontSize: 12, color: t.danger, marginTop: 6 }}>{state}</div>}
    </div>
  )
}

// ── Toggle chips for picking subjects ──────────────────────────────────────────
function SubjectChips({ subjects, selected, onToggle, busyId = null, theme }) {
  const t = THEMES[theme]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {subjects.map(su => {
        const on = selected.includes(su.id)
        return (
          <button key={su.id} type="button" onClick={() => onToggle(su.id)} disabled={!!busyId} aria-pressed={on}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 9, cursor: busyId ? 'default' : 'pointer', fontFamily: FONT_B, opacity: busyId && busyId !== su.id ? 0.6 : 1,
              border: `1px solid ${on ? GOLD : t.border}`, background: on ? 'rgba(241,190,67,0.14)' : 'transparent', color: on ? GOLD : t.textSub }}>
            <span>{busyId === su.id ? '…' : on ? '✓' : '+'}</span>
            {su.label}
          </button>
        )
      })}
    </div>
  )
}

// ── The subjects this tutor includes, free, for the student ────────────────────
function IncludedSubjectsPicker({ student, subjects, theme, onChange }) {
  const t = THEMES[theme]
  const [selected, setSelected] = useState(() => subjects
    .filter(su => student.included.some(inc => inc.subject_name === su.name && (inc.stage || '') === (su.stage || '')))
    .map(su => su.id))
  const [busyId, setBusyId] = useState(null)
  const [msg, setMsg] = useState(null) // { text, tone }
  const firstName = student.name.split(' ')[0]

  const toggle = async (id) => {
    const on = selected.includes(id)
    setBusyId(id); setMsg(null)
    try {
      if (on) {
        await removeIncludedSubject(student.id, id)
        setSelected(prev => prev.filter(x => x !== id))
        setMsg({ text: `${subjects.find(su => su.id === id)?.label} is no longer included.`, tone: t.textMuted })
      } else {
        const res = await setIncludedSubject(student.id, id)
        if (res.outcome === 'covered') {
          setMsg({ text: `${firstName} already has free access to ${res.label}, so there's nothing to include.`, tone: t.textMuted })
        } else {
          setSelected(prev => [...prev, id])
          setMsg({ text: `${res.label} is unlocked for ${firstName}.`, tone: t.success })
        }
      }
      onChange()
    } catch (e) {
      setMsg({ text: e.message || 'Could not update the included subjects.', tone: t.danger })
    }
    setBusyId(null)
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        Included subjects
      </div>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>
        Free for {firstName}, with unlimited questions, while they're on your roster. If they pay for one now, it comes off their plan.
      </div>
      <SubjectChips subjects={subjects} selected={selected} onToggle={toggle} busyId={busyId} theme={theme} />
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: msg.tone, fontWeight: 600 }}>{msg.text}</div>}
      {selected.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {selected.map(id => (
            <DiagnosticStatus key={id} student={student} subject={subjects.find(su => su.id === id)} theme={theme} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── An included subject's diagnostic: how it went, or waive / set one ──────────
function DiagnosticStatus({ student, subject, theme, onChange }) {
  const t = THEMES[theme]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!subject) return null
  const diag = student.diagnostics.find(d => d.curriculum_id === subject.id)
  const run = async (fn) => {
    setBusy(true); setError('')
    try { await fn(); onChange() } catch (e) { setError(e.message || 'Could not update the diagnostic.') }
    setBusy(false)
  }
  const btn = { padding: '4px 10px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textSub, fontSize: 11, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: FONT_B }
  const text = !diag ? 'No diagnostic'
    : diag.status === 'completed' ? `Diagnostic: ${diag.percentage ?? '—'}%. Full report in the Diagnostic tab`
    : diag.status === 'waived' ? 'Diagnostic waived'
    : 'Diagnostic not done yet. They can\'t practise it until it is'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
      <span style={{ fontWeight: 700, color: t.text }}>{subject.label}</span>
      <span style={{ color: diag?.status === 'completed' ? t.success : t.textMuted }}>{text}</span>
      {diag?.status === 'pending' && <button disabled={busy} onClick={() => run(() => waiveStudentDiagnostic(student.id, subject.id))} style={btn}>{busy ? '…' : 'Waive'}</button>}
      {!diag && <button disabled={busy} onClick={() => run(() => requireStudentDiagnostic(student.id, subject.id))} style={btn}>{busy ? '…' : 'Set diagnostic'}</button>}
      {error && <span style={{ color: t.danger }}>{error}</span>}
    </div>
  )
}

// ── What an invited subject's diagnostic covers: all topics, or the ones picked ──
function DiagnosticScopePicker({ subject, selected, onChange, theme }) {
  const t = THEMES[theme]
  const [open, setOpen] = useState(false)
  const [topics, setTopics] = useState(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState({}) // topicId: bool
  useEffect(() => {
    if (!open || topics || !subject) return
    fetchSubjectTopics(subject.id).then(setTopics).catch(e => setError(e.message || 'Could not load the topics.'))
  }, [open, topics, subject])
  if (!subject) return null

  const chosen = new Set(selected)
  const setTopic = (topic, on) => {
    const ids = topic.subtopics.map(st => st.id)
    onChange(on ? [...new Set([...selected, ...ids])] : selected.filter(id => !ids.includes(id)))
  }
  const toggleSub = (id) => onChange(chosen.has(id) ? selected.filter(x => x !== id) : [...selected, id])
  const summary = selected.length ? `${selected.length} subtopic${selected.length === 1 ? '' : 's'}` : 'All topics'

  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: '8px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{subject.label}</span>
        <span style={{ fontSize: 12, color: t.textMuted }}>· Diagnostic covers: {summary}</span>
        <button type="button" onClick={() => setOpen(o => !o)}
          style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 7, border: `1px solid ${open ? GOLD : t.border}`, background: 'transparent', color: open ? GOLD : t.textSub, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
          {open ? 'Done' : 'Choose topics'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
          {error && <div style={{ fontSize: 12, color: t.danger }}>{error}</div>}
          {!topics && !error && <div style={{ fontSize: 12, color: t.textMuted }}>Loading topics…</div>}
          {topics?.length === 0 && <div style={{ fontSize: 12, color: t.textMuted }}>This subject has no topics yet, so the diagnostic covers the whole subject.</div>}
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: t.textSub, fontSize: 11, cursor: 'pointer', padding: 0, fontFamily: FONT_B, textDecoration: 'underline' }}>
              Back to all topics
            </button>
          )}
          {topics?.map(topic => {
            const ids = topic.subtopics.map(st => st.id)
            const count = ids.filter(id => chosen.has(id)).length
            return (
              <div key={topic.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" disabled={!ids.length} checked={ids.length > 0 && count === ids.length}
                    ref={el => { if (el) el.indeterminate = count > 0 && count < ids.length }}
                    onChange={e => setTopic(topic, e.target.checked)} aria-label={topic.name} style={{ accentColor: GOLD }} />
                  <button type="button" onClick={() => setExpanded(x => ({ ...x, [topic.id]: !x[topic.id] }))} disabled={!ids.length}
                    style={{ border: 'none', background: 'transparent', color: t.text, fontSize: 12, fontWeight: 600, cursor: ids.length ? 'pointer' : 'default', padding: 0, fontFamily: FONT_B, textAlign: 'left' }}>
                    {topic.name}{ids.length ? ` (${count ? `${count}/` : ''}${ids.length}) ${expanded[topic.id] ? '▾' : '▸'}` : ''}
                  </button>
                </div>
                {expanded[topic.id] && (
                  <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                    {topic.subtopics.map(st => (
                      <label key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: t.textSub, cursor: 'pointer' }}>
                        <input type="checkbox" checked={chosen.has(st.id)} onChange={() => toggleSub(st.id)} style={{ accentColor: GOLD }} />
                        {st.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
