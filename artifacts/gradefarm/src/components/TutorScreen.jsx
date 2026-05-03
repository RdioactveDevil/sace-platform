import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { THEMES } from '../lib/theme'
import {
  fetchRoster,
  addStudentToRoster,
  removeStudentFromRoster,
  createAssignment,
  fetchAssignmentsForTutor,
  deleteAssignment,
  fetchStudentProgressForTutor,
  fetchStudentEmails,
  getQuestions,
  sendAssignmentNotification,
  notifyStudent,
  fetchTutorClasses,
  createTutorClass,
  updateTutorClass,
  deleteTutorClass,
  addStudentsToClass,
  removeStudentFromClass,
  createBatchAssignment,
} from '../lib/db'
import { getTopicConfig } from '../lib/saceTopics'
import { QUESTIONS_SUBJECT_BY_ID } from '../lib/subjects'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

const ASSIGNMENT_TYPES = ['Quiz', 'Test', 'Worksheet', 'Homework']

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function assignmentStatus(a) {
  if (a.completed_at) return 'Completed'
  const due = new Date(a.due_date)
  const now = new Date()
  due.setHours(23, 59, 59, 999)
  if (a.due_date && due < now) return 'Overdue'
  return 'Pending'
}

function statusColor(s) {
  if (s === 'Completed') return '#4ade80'
  if (s === 'Overdue')   return '#f87171'
  return GOLD
}

// ── Students Tab ──────────────────────────────────────────────────────────────
function StudentsTab({ profile, theme }) {
  const t = THEMES[theme]
  const [roster, setRoster]       = useState([])
  const [emails, setEmails]       = useState({})
  const [loading, setLoading]     = useState(true)
  const [email, setEmail]         = useState('')
  const [addError, setAddError]   = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [notifyStudentId, setNotifyStudentId] = useState(null)
  const [notifyMessage, setNotifyMessage] = useState('')
  const [notifySending, setNotifySending] = useState(false)
  const [notifyResult, setNotifyResult] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetchRoster(profile.id)
      setRoster(r)
      if (r.length > 0) {
        try { setEmails(await fetchStudentEmails(r.map(x => x.student_id))) } catch {}
      } else {
        setEmails({})
      }
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [profile.id])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setAddError('')
    setAddLoading(true)
    try {
      await addStudentToRoster(profile.id, email.trim().toLowerCase())
      setEmail('')
      await load()
    } catch (err) {
      setAddError(err.message || 'Could not find a student with that email.')
    }
    setAddLoading(false)
  }

  const handleRemove = async (studentId) => {
    try {
      await removeStudentFromRoster(profile.id, studentId)
      setConfirmRemove(null)
      await load()
    } catch {}
  }

  const handleNotifySend = async (studentId) => {
    setNotifySending(true)
    setNotifyResult(null)
    const result = await notifyStudent(studentId, notifyMessage.trim() || undefined)
    setNotifySending(false)
    if (result.ok) {
      setNotifyResult({ ok: true, msg: 'Email sent!' })
      setTimeout(() => { setNotifyStudentId(null); setNotifyMessage(''); setNotifyResult(null) }, 1800)
    } else {
      setNotifyResult({ ok: false, msg: result.error || 'Failed to send.' })
    }
  }

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ ...card, padding: '18px 20px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 4 }}>Add Student</div>
        <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 14 }}>Enter the student's email address to add them to your roster.</div>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            value={email}
            onChange={e => { setEmail(e.target.value); setAddError('') }}
            placeholder="student@email.com"
            type="email"
            style={{ flex: 1, minWidth: 220, padding: '10px 14px', borderRadius: 9, border: `1px solid ${addError ? '#f87171' : t.border}`, background: t.bgCard, color: t.text, fontSize: 14, fontFamily: FONT_B, outline: 'none' }}
          />
          <button
            type="submit"
            disabled={addLoading || !email.trim()}
            style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: addLoading || !email.trim() ? t.border : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: addLoading || !email.trim() ? t.textMuted : '#0c1037', fontSize: 13, fontWeight: 800, cursor: addLoading || !email.trim() ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}
          >
            {addLoading ? 'Adding…' : 'Add Student'}
          </button>
        </form>
        {addError && <div style={{ marginTop: 8, fontSize: 12, color: '#f87171' }}>{addError}</div>}
      </div>

      <div style={card}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>My Students</div>
          <div style={{ fontSize: 12, color: t.textMuted }}>{roster.length} student{roster.length !== 1 ? 's' : ''} on your roster</div>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Loading…</div>
        ) : roster.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No students yet. Add a student above.</div>
        ) : (
          <div>
            {roster.map(s => (
              <div key={s.student_id} style={{ borderBottom: `1px solid ${t.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#0c1037', flexShrink: 0 }}>
                    {(s.profiles?.display_name || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.profiles?.display_name || 'Unknown'}</div>
                    {emails[s.student_id] && (
                      <div style={{ fontSize: 12, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emails[s.student_id]}</div>
                    )}
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{s.profiles?.xp ?? 0} XP · Streak {s.profiles?.streak ?? 0} · Joined {fmtDate(s.invited_at)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {confirmRemove === s.student_id ? (
                      <>
                        <button onClick={() => handleRemove(s.student_id)} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>Remove</button>
                        <button onClick={() => setConfirmRemove(null)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setNotifyStudentId(notifyStudentId === s.student_id ? null : s.student_id); setNotifyMessage(''); setNotifyResult(null) }}
                          style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${notifyStudentId === s.student_id ? GOLD : t.border}`, background: notifyStudentId === s.student_id ? 'rgba(241,190,67,0.12)' : 'transparent', color: notifyStudentId === s.student_id ? GOLD : t.textMuted, fontSize: 12, fontWeight: notifyStudentId === s.student_id ? 700 : 400, cursor: 'pointer', fontFamily: FONT_B }}
                        >
                          ✉ Notify
                        </button>
                        <button onClick={() => setConfirmRemove(s.student_id)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Remove</button>
                      </>
                    )}
                  </div>
                </div>
                {notifyStudentId === s.student_id && (
                  <div style={{ padding: '0 20px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 12, color: t.textMuted }}>Send an email to <strong style={{ color: t.text }}>{s.profiles?.display_name || 'this student'}</strong>. Leave blank for a default "check your assignments" message.</div>
                    <textarea
                      value={notifyMessage}
                      onChange={e => setNotifyMessage(e.target.value)}
                      placeholder="Optional message… (leave blank for default)"
                      rows={3}
                      style={{ padding: '9px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, fontFamily: FONT_B, outline: 'none', resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        onClick={() => handleNotifySend(s.student_id)}
                        disabled={notifySending}
                        style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: notifySending ? t.border : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: notifySending ? t.textMuted : '#0c1037', fontSize: 13, fontWeight: 800, cursor: notifySending ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}
                      >
                        {notifySending ? 'Sending…' : 'Send Email'}
                      </button>
                      {notifyResult && (
                        <span style={{ fontSize: 12, color: notifyResult.ok ? '#4ade80' : '#f87171', fontWeight: 600 }}>{notifyResult.msg}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const STATUS_OPTIONS = ['All', 'Pending', 'Overdue', 'Completed']

// ── Assignments Tab ───────────────────────────────────────────────────────────
function AssignmentsTab({ profile, theme }) {
  const t = THEMES[theme]
  const [assignments, setAssignments] = useState([])
  const [roster, setRoster]           = useState([])
  const [classes, setClasses]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [saving, setSaving]           = useState(false)
  const [filterStudent, setFilterStudent] = useState('')
  const [filterStatus, setFilterStatus]   = useState('All')
  const [expandedBatches, setExpandedBatches] = useState(() => new Set())
  const [form, setForm]               = useState({
    type: 'Quiz',
    subject: 'Chemistry Stage 1',
    topics: [],
    due_date: '',
    target_mode: 'single',  // 'single' | 'multi' | 'classes' | 'all'
    student_ids: [],
    class_ids: [],
  })
  const [formError, setFormError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [notifyStatus, setNotifyStatus] = useState(null)

  // Topic list for current subject
  const stageMap = {
    'Chemistry Stage 1': 'Stage 1',
    'Chemistry Stage 2': 'Stage 2',
  }
  const { macroGroups, normFn: topicNormFn } = getTopicConfig(stageMap[form.subject] || 'Stage 1')
  const allTopics = macroGroups.flatMap(g => g.topics)

  // Load the question bank for the chosen subject so we can offer subtopic-level chips
  const [subjectQuestions, setSubjectQuestions] = useState([])
  const [expandedTopic, setExpandedTopic] = useState(null)
  useEffect(() => {
    let cancelled = false
    const subjectKey = form.subject === 'Chemistry Stage 1'
      ? QUESTIONS_SUBJECT_BY_ID.chemistry_s1
      : form.subject === 'Chemistry Stage 2'
        ? QUESTIONS_SUBJECT_BY_ID.chemistry_s2
        : 'Chemistry'
    getQuestions(subjectKey).then(qs => { if (!cancelled) setSubjectQuestions(qs || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [form.subject])

  // Build topic → subtopics map from the live question bank
  const topicSubtopics = {}
  subjectQuestions.forEach(q => {
    const tNorm = (topicNormFn?.(q.topic) || q.topic || '').trim()
    if (!tNorm || !q.subtopic) return
    const matched = allTopics.find(t => t.toLowerCase() === tNorm.toLowerCase())
    const key = matched || tNorm
    if (!topicSubtopics[key]) topicSubtopics[key] = new Set()
    topicSubtopics[key].add(q.subtopic)
  })

  const load = async () => {
    setLoading(true)
    try {
      const [asgns, ros, cls] = await Promise.all([
        fetchAssignmentsForTutor(profile.id),
        fetchRoster(profile.id),
        fetchTutorClasses().catch(() => []),
      ])
      setAssignments(asgns)
      setRoster(ros)
      setClasses(cls)
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [profile.id])

  const toggleTopic = (topic) => {
    setForm(f => ({
      ...f,
      topics: f.topics.includes(topic) ? f.topics.filter(t2 => t2 !== topic) : [...f.topics, topic],
    }))
  }

  const setTargetMode = (mode) => {
    setForm(f => ({ ...f, target_mode: mode, student_ids: [], class_ids: [] }))
  }

  const toggleStudent = (id) => {
    setForm(f => {
      if (f.target_mode === 'single') return { ...f, student_ids: [id] }
      return { ...f, student_ids: f.student_ids.includes(id) ? f.student_ids.filter(s => s !== id) : [...f.student_ids, id] }
    })
  }

  const toggleClass = (id) => {
    setForm(f => ({ ...f, class_ids: f.class_ids.includes(id) ? f.class_ids.filter(c => c !== id) : [...f.class_ids, id] }))
  }

  // Resolve preview union of student IDs based on target_mode
  const resolvedStudentIds = (() => {
    const set = new Set()
    if (form.target_mode === 'all') {
      roster.forEach(r => set.add(r.student_id))
    } else if (form.target_mode === 'classes') {
      classes.filter(c => form.class_ids.includes(c.id)).forEach(c => {
        c.members.forEach(m => set.add(m.student_id))
      })
    } else {
      form.student_ids.forEach(id => set.add(id))
    }
    // Always intersect against roster
    const rosterSet = new Set(roster.map(r => r.student_id))
    return Array.from(set).filter(id => rosterSet.has(id))
  })()
  const resolvedCount = resolvedStudentIds.length

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setNotifyStatus(null)
    if (form.topics.length === 0) { setFormError('Select at least one topic.'); return }
    if (!form.due_date) { setFormError('Please set a due date.'); return }
    if (resolvedCount === 0) { setFormError('Select at least one target (student, class, or roster).'); return }
    setSaving(true)
    try {
      const result = await createBatchAssignment({
        type: form.type,
        subject: form.subject,
        topics: form.topics,
        due_date: form.due_date,
        studentIds: form.target_mode === 'classes' || form.target_mode === 'all' ? [] : form.student_ids,
        classIds: form.target_mode === 'classes' ? form.class_ids : [],
        allRoster: form.target_mode === 'all',
        notify: true,
      })
      setShowForm(false)
      setForm({ type: 'Quiz', subject: 'Chemistry Stage 1', topics: [], due_date: '', target_mode: 'single', student_ids: [], class_ids: [] })
      await load()
      const created = result?.created ?? resolvedCount
      const notified = result?.notified ?? 0
      const errs = result?.notify_errors ?? 0
      let msg = `Created ${created} assignment${created !== 1 ? 's' : ''}.`
      if (notified > 0) msg += ` ${notified} student${notified !== 1 ? 's' : ''} notified by email.`
      if (errs > 0) msg += ` ${errs} email${errs !== 1 ? 's' : ''} failed to send.`
      setNotifyStatus({ ok: errs === 0, msg })
      setTimeout(() => setNotifyStatus(null), 5000)
    } catch (err) {
      setFormError(err.message || 'Failed to create assignment.')
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    setDeletingId(id)
    try { await deleteAssignment(id); await load() } catch {}
    setDeletingId(null)
  }

  const filteredAssignments = assignments.filter(a => {
    if (filterStudent && a.student_id !== filterStudent) return false
    if (filterStatus !== 'All' && assignmentStatus(a) !== filterStatus) return false
    return true
  })

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14 }
  const inputStyle = { padding: '9px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, fontFamily: FONT_B, outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => { setShowForm(v => !v); setFormError('') }}
          style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: showForm ? t.border : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: showForm ? t.textMuted : '#0c1037', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}
        >
          {showForm ? '✕ Cancel' : '+ New Assignment'}
        </button>
      </div>

      {notifyStatus && (
        <div style={{ padding: '12px 16px', borderRadius: 10, border: `1px solid ${notifyStatus.ok ? '#4ade8040' : '#f8717140'}`, background: notifyStatus.ok ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)', fontSize: 13, color: notifyStatus.ok ? '#4ade80' : '#f87171', fontWeight: 600 }}>
          {notifyStatus.msg}
        </div>
      )}

      {showForm && (
        <div style={{ ...card, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 16 }}>Create Assignment</div>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
                  {ASSIGNMENT_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Subject</label>
                <select value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value, topics: [] }))} style={inputStyle}>
                  <option value="Chemistry Stage 1">Chemistry — Stage 1</option>
                  <option value="Chemistry Stage 2">Chemistry — Stage 2</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Topics ({form.topics.length} selected)</label>
              <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>Tap a topic to assign the whole topic, or expand it to pick individual subtopics.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allTopics.map(tp => {
                  const sel = form.topics.includes(tp)
                  const subs = Array.from(topicSubtopics[tp] || [])
                  const isExpanded = expandedTopic === tp
                  const selectedSubsForTopic = subs.filter(s => form.topics.includes(s))
                  return (
                    <div key={tp} style={{ border: `1px solid ${(sel || selectedSubsForTopic.length > 0) ? GOLD : t.border}`, borderRadius: 10, padding: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button type="button" onClick={() => toggleTopic(tp)}
                          style={{ padding: '5px 11px', borderRadius: 20, border: `1px solid ${sel ? GOLD : t.border}`, background: sel ? 'rgba(241,190,67,0.15)' : 'transparent', color: sel ? GOLD : t.textMuted, fontSize: 12, fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
                          {tp}
                        </button>
                        {subs.length > 0 && (
                          <button type="button" onClick={() => setExpandedTopic(isExpanded ? null : tp)}
                            style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 11, cursor: 'pointer', fontFamily: FONT_B }}>
                            {isExpanded ? '▾ Hide subtopics' : `▸ ${subs.length} subtopics`}
                          </button>
                        )}
                        {selectedSubsForTopic.length > 0 && !sel && (
                          <span style={{ fontSize: 11, color: GOLD, fontWeight: 700 }}>{selectedSubsForTopic.length} selected</span>
                        )}
                      </div>
                      {isExpanded && subs.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingLeft: 4 }}>
                          {subs.map(sub => {
                            const subSel = form.topics.includes(sub)
                            return (
                              <button key={sub} type="button" onClick={() => toggleTopic(sub)}
                                style={{ padding: '4px 9px', borderRadius: 16, border: `1px solid ${subSel ? GOLD : t.border}`, background: subSel ? 'rgba(241,190,67,0.15)' : 'transparent', color: subSel ? GOLD : t.textMuted, fontSize: 11, fontWeight: subSel ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
                                {sub}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={{ ...inputStyle, maxWidth: 220 }} min={new Date().toISOString().slice(0, 10)} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Assign To
              </label>
              {roster.length === 0 ? (
                <div style={{ fontSize: 12, color: t.textMuted }}>No students on your roster yet. Add students first.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                    {[
                      { id: 'single',  label: 'Single student' },
                      { id: 'multi',   label: 'Multi-select' },
                      { id: 'classes', label: `Classes${classes.length > 0 ? ` (${classes.length})` : ''}` },
                      { id: 'all',     label: 'Entire roster' },
                    ].map(opt => {
                      const active = form.target_mode === opt.id
                      const disabled = opt.id === 'classes' && classes.length === 0
                      return (
                        <button key={opt.id} type="button" disabled={disabled} onClick={() => !disabled && setTargetMode(opt.id)}
                          style={{ padding: '6px 13px', borderRadius: 20, border: `1px solid ${active ? GOLD : t.border}`, background: active ? 'rgba(241,190,67,0.15)' : 'transparent', color: disabled ? t.textFaint : active ? GOLD : t.textMuted, fontSize: 12, fontWeight: active ? 700 : 500, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: FONT_B, opacity: disabled ? 0.5 : 1 }}>
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>

                  {form.target_mode === 'all' && (
                    <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 12px', borderRadius: 8, background: 'rgba(241,190,67,0.06)', border: `1px solid ${t.border}` }}>
                      All {roster.length} student{roster.length !== 1 ? 's' : ''} on your roster will receive this.
                    </div>
                  )}

                  {form.target_mode === 'classes' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {classes.map(c => {
                        const sel = form.class_ids.includes(c.id)
                        const accent = c.color || GOLD
                        return (
                          <button key={c.id} type="button" onClick={() => toggleClass(c.id)}
                            style={{ padding: '6px 12px', borderRadius: 20, border: `1px solid ${sel ? accent : t.border}`, background: sel ? `${accent}1f` : 'transparent', color: sel ? accent : t.textMuted, fontSize: 12, fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
                            {c.name} · {c.members.length}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {(form.target_mode === 'single' || form.target_mode === 'multi') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto', border: `1px solid ${t.border}`, borderRadius: 8, padding: 10 }}>
                      {roster.map(s => {
                        const checked = form.student_ids.includes(s.student_id)
                        return (
                          <label key={s.student_id} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, color: checked ? t.text : t.textMuted, fontWeight: checked ? 600 : 400 }}>
                            <input
                              type={form.target_mode === 'single' ? 'radio' : 'checkbox'}
                              name="assign-target"
                              checked={checked}
                              onChange={() => toggleStudent(s.student_id)}
                              style={{ accentColor: GOLD, width: 15, height: 15 }}
                            />
                            {s.profiles?.display_name || 'Unknown'}
                          </label>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ marginTop: 10, fontSize: 12, color: resolvedCount > 0 ? GOLD : t.textMuted, fontWeight: 700 }}>
                    This will be sent to {resolvedCount} student{resolvedCount !== 1 ? 's' : ''}.
                  </div>
                </>
              )}
            </div>

            {formError && <div style={{ marginBottom: 12, fontSize: 12, color: '#f87171' }}>{formError}</div>}

            <button type="submit" disabled={saving} style={{ padding: '11px 24px', borderRadius: 9, border: 'none', background: saving ? t.border : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: saving ? t.textMuted : '#0c1037', fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}>
              {saving ? 'Creating…' : `Create Assignment${resolvedCount > 1 ? ` (${resolvedCount} students)` : ''}`}
            </button>
          </form>
        </div>
      )}

      <div style={card}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>All Assignments</div>
            <div style={{ fontSize: 12, color: t.textMuted }}>
              {filteredAssignments.length !== assignments.length
                ? `${filteredAssignments.length} of ${assignments.length} shown`
                : `${assignments.length} total`}
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={filterStudent}
              onChange={e => setFilterStudent(e.target.value)}
              style={{ padding: '7px 11px', borderRadius: 8, border: `1px solid ${filterStudent ? GOLD : t.border}`, background: t.bgCard, color: filterStudent ? GOLD : t.textMuted, fontSize: 12, fontFamily: FONT_B, outline: 'none', fontWeight: filterStudent ? 700 : 400, cursor: 'pointer' }}
            >
              <option value="">All students</option>
              {roster.map(s => (
                <option key={s.student_id} value={s.student_id}>{s.profiles?.display_name || 'Unknown'}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 6 }}>
              {STATUS_OPTIONS.map(s => {
                const active = filterStatus === s
                const col = s === 'Completed' ? '#4ade80' : s === 'Overdue' ? '#f87171' : s === 'Pending' ? GOLD : t.textMuted
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${active ? col : t.border}`, background: active ? `${col}18` : 'transparent', color: active ? col : t.textMuted, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Loading…</div>
        ) : assignments.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No assignments yet. Create one above.</div>
        ) : filteredAssignments.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No assignments match the current filters.</div>
        ) : (
          (() => {
            // Group filtered assignments by batch_id (single-row batches and rows
            // without a batch_id render as standalone rows).
            const classNameById = {}
            classes.forEach(c => { classNameById[c.id] = c })

            const batchMap = new Map()
            const standalone = []
            for (const a of filteredAssignments) {
              if (a.batch_id) {
                if (!batchMap.has(a.batch_id)) batchMap.set(a.batch_id, [])
                batchMap.get(a.batch_id).push(a)
              } else {
                standalone.push(a)
              }
            }

            const renderRow = (a, indent = false) => {
              const status = assignmentStatus(a)
              const sc = statusColor(status)
              return (
                <div key={a.id} style={{ padding: indent ? '11px 20px 11px 38px' : '13px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'flex-start', gap: 14, background: indent ? (theme === 'dark' ? 'rgba(255,255,255,0.015)' : 'rgba(12,16,55,0.02)') : 'transparent' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                      {!indent && <span style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{a.type}</span>}
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, border: `1px solid ${sc}40`, background: `${sc}15`, color: sc, fontWeight: 700 }}>{status}</span>
                      {!indent && <span style={{ fontSize: 11, color: t.textMuted }}>Due {fmtDate(a.due_date)}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: t.textMuted, marginBottom: indent ? 0 : 3 }}>
                      <strong style={{ color: t.text }}>Student:</strong> {a.profiles?.display_name || a.student_id}
                      {a.completed_at && <span style={{ marginLeft: 8, color: '#4ade80' }}>· Completed {fmtDate(a.completed_at)}</span>}
                    </div>
                    {!indent && (
                      <div style={{ fontSize: 12, color: t.textMuted }}>
                        <strong style={{ color: t.text }}>Topics:</strong> {(a.topics || []).join(', ') || a.subject}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(a.id)}
                    disabled={deletingId === a.id}
                    style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#f87171', fontSize: 12, cursor: deletingId === a.id ? 'not-allowed' : 'pointer', fontFamily: FONT_B, flexShrink: 0 }}>
                    {deletingId === a.id ? '…' : 'Delete'}
                  </button>
                </div>
              )
            }

            // Combine batches + standalones, ordered by created_at of the first row.
            const groups = []
            for (const [batchId, rows] of batchMap.entries()) {
              groups.push({ kind: 'batch', batchId, rows, order: rows[0]?.created_at || '' })
            }
            for (const a of standalone) {
              groups.push({ kind: 'single', row: a, order: a.created_at || '' })
            }
            groups.sort((a, b) => (a.order < b.order ? 1 : -1))

            return (
              <div>
                {groups.map(g => {
                  if (g.kind === 'single') return renderRow(g.row)
                  // Batch with multiple rows
                  if (g.rows.length === 1) return renderRow(g.rows[0])
                  const head = g.rows[0]
                  const completed = g.rows.filter(r => r.completed_at).length
                  const cls = head.class_id ? classNameById[head.class_id] : null
                  const isExpanded = expandedBatches.has(g.batchId)
                  const headerLabel = cls
                    ? `Sent to Class: ${cls.name} — ${g.rows.length} students — ${completed} completed`
                    : `Sent to ${g.rows.length} students — ${completed} completed`
                  return (
                    <div key={g.batchId}>
                      <button
                        type="button"
                        onClick={() => setExpandedBatches(prev => {
                          const next = new Set(prev)
                          if (next.has(g.batchId)) next.delete(g.batchId)
                          else next.add(g.batchId)
                          return next
                        })}
                        style={{ width: '100%', textAlign: 'left', padding: '13px 20px', borderBottom: `1px solid ${t.border}`, background: theme === 'dark' ? 'rgba(241,190,67,0.05)' : 'rgba(241,190,67,0.06)', border: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer', fontFamily: FONT_B, color: t.text }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: GOLD, fontWeight: 800 }}>{isExpanded ? '▾' : '▸'}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{head.type}</span>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, border: `1px solid ${GOLD}40`, background: 'rgba(241,190,67,0.15)', color: GOLD, fontWeight: 700 }}>Batch</span>
                          <span style={{ fontSize: 11, color: t.textMuted }}>Due {fmtDate(head.due_date)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 3 }}>
                          <strong style={{ color: t.text }}>{headerLabel}</strong>
                        </div>
                        <div style={{ fontSize: 12, color: t.textMuted }}>
                          <strong style={{ color: t.text }}>Topics:</strong> {(head.topics || []).join(', ') || head.subject}
                        </div>
                      </button>
                      {isExpanded && g.rows.map(r => renderRow(r, true))}
                    </div>
                  )
                })}
              </div>
            )
          })()
        )}
      </div>
    </div>
  )
}

// ── Progress Tab ──────────────────────────────────────────────────────────────
function ProgressTab({ profile, theme }) {
  const t = THEMES[theme]
  const [roster, setRoster]           = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [progress, setProgress]       = useState(null)
  const [loading, setLoading]         = useState(false)
  const [rosterLoading, setRosterLoading] = useState(true)

  useEffect(() => {
    fetchRoster(profile.id).then(r => { setRoster(r); setRosterLoading(false) }).catch(() => setRosterLoading(false))
  }, [profile.id])

  useEffect(() => {
    if (!selectedStudentId) { setProgress(null); return }
    setLoading(true)
    fetchStudentProgressForTutor(profile.id, selectedStudentId)
      .then(p => { setProgress(p); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedStudentId])

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ ...card, padding: '18px 20px' }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Select Student</label>
        <select
          value={selectedStudentId}
          onChange={e => setSelectedStudentId(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, fontSize: 14, fontFamily: FONT_B, outline: 'none', minWidth: 240 }}
        >
          <option value="">— Choose a student —</option>
          {roster.map(s => (
            <option key={s.student_id} value={s.student_id}>{s.profiles?.display_name || 'Unknown'}</option>
          ))}
        </select>
        {rosterLoading && <div style={{ fontSize: 12, color: t.textMuted, marginTop: 8 }}>Loading roster…</div>}
      </div>

      {loading && (
        <div style={{ ...card, padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Loading progress…</div>
      )}

      {progress && !loading && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
            {[
              { label: 'Total XP', val: progress.xp?.toLocaleString() ?? 0, color: GOLD },
              { label: 'Streak', val: `${progress.streak ?? 0} days 🔥`, color: GOLD },
              { label: 'Accuracy', val: `${progress.accuracy ?? 0}%`, color: progress.accuracy >= 70 ? '#4ade80' : progress.accuracy >= 40 ? GOLD : '#f87171' },
              { label: 'Questions Done', val: progress.totalAttempts ?? 0, color: t.text },
            ].map(s => (
              <div key={s.label} style={{ ...card, padding: '16px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.val}</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>{s.label}</div>
              </div>
            ))}
          </div>

          {progress.topicBreakdown && progress.topicBreakdown.length > 0 && (
            <div style={card}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Topic Accuracy</div>
              </div>
              <div>
                {progress.topicBreakdown.map(tb => {
                  const acc = tb.attempts > 0 ? Math.round(((tb.attempts - tb.wrong) / tb.attempts) * 100) : null
                  const color = acc == null ? t.textMuted : acc >= 70 ? '#4ade80' : acc >= 40 ? GOLD : '#f87171'
                  return (
                    <div key={tb.topic} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 20px', borderBottom: `1px solid ${t.border}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tb.topic}</div>
                        <div style={{ fontSize: 11, color: t.textMuted }}>{tb.attempts} attempt{tb.attempts !== 1 ? 's' : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color }}>{acc != null ? `${acc}%` : '—'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {progress.assignments && progress.assignments.length > 0 && (
            <div style={card}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Assignments</div>
              </div>
              <div>
                {progress.assignments.map(a => {
                  const status = assignmentStatus(a)
                  const sc = statusColor(status)
                  return (
                    <div key={a.id} style={{ padding: '12px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{a.type} — {(a.topics || []).join(', ') || a.subject}</div>
                        <div style={{ fontSize: 11, color: t.textMuted }}>Due {fmtDate(a.due_date)}{a.completed_at ? ` · Completed ${fmtDate(a.completed_at)}` : ''}</div>
                      </div>
                      <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, border: `1px solid ${sc}40`, background: `${sc}15`, color: sc, fontWeight: 700, flexShrink: 0 }}>{status}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {progress.recentActivity && progress.recentActivity.length > 0 && (
            <div style={card}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Recent Activity</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>Last 10 sessions</div>
              </div>
              <div>
                {progress.recentActivity.map((r, i) => (
                  <div key={i} style={{ padding: '10px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.correct ? '#4ade80' : '#f87171', flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 13, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.question_id ? 'Question answered' : 'Session'}
                    </div>
                    <div style={{ fontSize: 11, color: t.textFaint, flexShrink: 0 }}>{fmtDate(r.answered_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {progress.offTopicAttempts && progress.offTopicAttempts.length > 0 && (
            <div style={card}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Off-Topic Questions</div>
                  <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 20, border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.1)', color: '#f87171', fontWeight: 700 }}>
                    {progress.offTopicAttempts.reduce((s, r) => s + r.count, 0)} total
                  </span>
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>Topics where Titan AI redirected this student away from off-subject questions</div>
              </div>
              <div>
                {progress.offTopicAttempts.map((r, i) => (
                  <div key={i} style={{ padding: '10px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.topic}</div>
                      <div style={{ fontSize: 11, color: t.textMuted }}>{r.subject}{r.last_attempt ? ` · Last ${fmtDate(r.last_attempt)}` : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: r.count >= 3 ? '#f87171' : GOLD }}>{r.count}×</div>
                      <div style={{ fontSize: 10, color: t.textMuted }}>redirect{r.count !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!selectedStudentId && !rosterLoading && (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: t.textMuted, fontSize: 14 }}>
          Select a student above to view their progress.
        </div>
      )}
    </div>
  )
}

// ── Classes Tab ───────────────────────────────────────────────────────────────
function ClassesTab({ profile, theme }) {
  const t = THEMES[theme]
  const [classes, setClasses]       = useState([])
  const [roster, setRoster]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName]       = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [newColor, setNewColor]     = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [createError, setCreateError]   = useState('')
  const [creating, setCreating]         = useState(false)
  const [expandedClass, setExpandedClass] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [pickerForClass, setPickerForClass] = useState(null)
  const [pickerSelected, setPickerSelected] = useState([])
  const [pickerSaving, setPickerSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [cls, ros] = await Promise.all([
        fetchTutorClasses(),
        fetchRoster(profile.id),
      ])
      setClasses(cls)
      setRoster(ros)
    } catch (err) {
      console.warn('[ClassesTab] load failed', err)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [profile.id])

  const rosterById = {}
  roster.forEach(r => { rosterById[r.student_id] = r })

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreateError('')
    if (!newName.trim()) { setCreateError('Class name is required.'); return }
    setCreating(true)
    try {
      await createTutorClass({
        name: newName.trim(),
        subject: newSubject.trim() || null,
        color: newColor.trim() || null,
        description: newDescription.trim() || null,
      })
      setNewName(''); setNewSubject(''); setNewColor(''); setNewDescription('')
      setShowCreate(false)
      await load()
    } catch (err) {
      setCreateError(err.message || 'Failed to create class.')
    }
    setCreating(false)
  }

  const handleRename = async (cls) => {
    if (!renameValue.trim()) return
    try {
      await updateTutorClass(cls.id, { name: renameValue.trim() })
      setRenamingId(null); setRenameValue('')
      await load()
    } catch {}
  }

  const handleDelete = async (cls) => {
    try {
      await deleteTutorClass(cls.id)
      setConfirmDelete(null)
      await load()
    } catch {}
  }

  const openPicker = (cls) => {
    const existing = new Set(cls.members.map(m => m.student_id))
    setPickerForClass(cls.id)
    setPickerSelected(roster.filter(r => !existing.has(r.student_id)).length === 0 ? [] : [])
  }

  const togglePickerStudent = (id) => {
    setPickerSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  const handleAddMembers = async (cls) => {
    if (pickerSelected.length === 0) { setPickerForClass(null); return }
    setPickerSaving(true)
    try {
      await addStudentsToClass(cls.id, pickerSelected)
      setPickerForClass(null); setPickerSelected([])
      await load()
    } catch {}
    setPickerSaving(false)
  }

  const handleRemoveMember = async (cls, studentId) => {
    try {
      await removeStudentFromClass(cls.id, studentId)
      await load()
    } catch {}
  }

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14 }
  const inputStyle = { padding: '9px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, fontFamily: FONT_B, outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => { setShowCreate(v => !v); setCreateError('') }}
          style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: showCreate ? t.border : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: showCreate ? t.textMuted : '#0c1037', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}
        >
          {showCreate ? '✕ Cancel' : '+ New Class'}
        </button>
      </div>

      {showCreate && (
        <div style={{ ...card, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 14 }}>Create Class</div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Name *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Year 10 Chem - Tuesday" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Subject (optional)</label>
                <input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="e.g. Chemistry Stage 1" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Color</label>
                <input type="color" value={newColor || '#f1be43'} onChange={e => setNewColor(e.target.value)} style={{ ...inputStyle, padding: 4, height: 36 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Description</label>
                <input value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Optional notes about this class" style={inputStyle} />
              </div>
            </div>
            {createError && <div style={{ marginBottom: 10, fontSize: 12, color: '#f87171' }}>{createError}</div>}
            <button type="submit" disabled={creating} style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: creating ? t.border : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: creating ? t.textMuted : '#0c1037', fontSize: 13, fontWeight: 800, cursor: creating ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}>
              {creating ? 'Creating…' : 'Create Class'}
            </button>
          </form>
        </div>
      )}

      <div style={card}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>My Classes</div>
          <div style={{ fontSize: 12, color: t.textMuted }}>{classes.length} class{classes.length !== 1 ? 'es' : ''}</div>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Loading…</div>
        ) : classes.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No classes yet. Create one above to group students.</div>
        ) : (
          <div>
            {classes.map(cls => {
              const expanded = expandedClass === cls.id
              const accent = cls.color || GOLD
              const memberRows = (cls.members || []).map(m => ({ ...m, profile: rosterById[m.student_id] || null }))
              const availableToAdd = roster.filter(r => !cls.members.some(m => m.student_id === r.student_id))
              return (
                <div key={cls.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px' }}>
                    <div style={{ width: 8, height: 36, borderRadius: 4, background: accent, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renamingId === cls.id ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input value={renameValue} onChange={e => setRenameValue(e.target.value)} style={{ ...inputStyle, maxWidth: 280 }} autoFocus />
                          <button onClick={() => handleRename(cls)} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: '#0c1037', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>Save</button>
                          <button onClick={() => { setRenamingId(null); setRenameValue('') }} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cls.name}</div>
                          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                            {cls.members.length} student{cls.members.length !== 1 ? 's' : ''}
                            {cls.subject ? ` · ${cls.subject}` : ''}
                            {cls.description ? ` · ${cls.description}` : ''}
                          </div>
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {confirmDelete === cls.id ? (
                        <>
                          <button onClick={() => handleDelete(cls)} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>Delete class</button>
                          <button onClick={() => setConfirmDelete(null)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setExpandedClass(expanded ? null : cls.id)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${expanded ? GOLD : t.border}`, background: expanded ? 'rgba(241,190,67,0.12)' : 'transparent', color: expanded ? GOLD : t.textMuted, fontSize: 12, fontWeight: expanded ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
                            {expanded ? '▾ Hide' : '▸ View'}
                          </button>
                          <button onClick={() => { setRenamingId(cls.id); setRenameValue(cls.name) }} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Rename</button>
                          <button onClick={() => setConfirmDelete(cls.id)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#f87171', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ padding: '0 20px 16px 38px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {memberRows.length === 0 ? (
                        <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 0' }}>No students in this class yet.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {memberRows.map(m => (
                            <div key={m.student_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8, background: t.bg, border: `1px solid ${t.border}` }}>
                              <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#0c1037', flexShrink: 0 }}>
                                {(m.profile?.profiles?.display_name || '?')[0].toUpperCase()}
                              </div>
                              <div style={{ flex: 1, fontSize: 13, color: t.text }}>{m.profile?.profiles?.display_name || 'Unknown student'}</div>
                              <button onClick={() => handleRemoveMember(cls, m.student_id)} style={{ padding: '4px 9px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#f87171', fontSize: 11, cursor: 'pointer', fontFamily: FONT_B }}>Remove</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {pickerForClass === cls.id ? (
                        <div style={{ padding: 12, border: `1px solid ${t.border}`, borderRadius: 10, background: t.bg }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 8 }}>Add students from your roster</div>
                          {availableToAdd.length === 0 ? (
                            <div style={{ fontSize: 12, color: t.textMuted }}>All your students are already in this class.</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                              {availableToAdd.map(r => (
                                <label key={r.student_id} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, color: t.textMuted }}>
                                  <input type="checkbox" checked={pickerSelected.includes(r.student_id)} onChange={() => togglePickerStudent(r.student_id)} style={{ accentColor: GOLD, width: 15, height: 15 }} />
                                  {r.profiles?.display_name || 'Unknown'}
                                </label>
                              ))}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => handleAddMembers(cls)} disabled={pickerSelected.length === 0 || pickerSaving} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: pickerSelected.length === 0 || pickerSaving ? t.border : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: pickerSelected.length === 0 || pickerSaving ? t.textMuted : '#0c1037', fontSize: 12, fontWeight: 800, cursor: pickerSelected.length === 0 || pickerSaving ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}>
                              {pickerSaving ? 'Adding…' : `Add ${pickerSelected.length} student${pickerSelected.length !== 1 ? 's' : ''}`}
                            </button>
                            <button onClick={() => { setPickerForClass(null); setPickerSelected([]) }} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => openPicker(cls)} style={{ alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 7, border: `1px dashed ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>
                          + Add students to class
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main TutorScreen ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'students',    label: 'Students',    icon: '👥' },
  { id: 'classes',     label: 'Classes',     icon: '🏫' },
  { id: 'assignments', label: 'Assignments', icon: '📋' },
  { id: 'progress',    label: 'Progress',    icon: '📊' },
]

export default function TutorScreen({ profile, theme }) {
  const t = THEMES[theme]
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('students')

  return (
    <div style={{ minHeight: '100vh', background: t.bg, fontFamily: FONT_B, color: t.text }}>
      <style>{`@font-face{font-family:'Sifonn Pro';src:url('/SIFONN_PRO.otf') format('opentype');font-display:swap;}`}</style>

      {/* Header */}
      <div style={{ padding: '14px 24px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 16, background: t.bgNav }}>
        <button onClick={() => navigate('/question-bank')} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 13, fontFamily: FONT_B }}>← Back to app</button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: FONT_D, fontSize: 16, letterSpacing: 1 }}>
            <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
          </span>
          <span style={{ color: t.textMuted, fontSize: 13 }}>·</span>
          <span style={{ color: GOLD, fontWeight: 800, fontSize: 15 }}>Tutor Dashboard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#0c1037' }}>
            {(profile.display_name || '?')[0].toUpperCase()}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{profile.display_name}</span>
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: 4, padding: '12px 24px 0', borderBottom: `1px solid ${t.border}`, background: t.bgNav }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '9px 18px',
              borderRadius: '8px 8px 0 0',
              border: 'none',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: FONT_B,
              color: activeTab === tab.id ? GOLD : t.textMuted,
              background: activeTab === tab.id ? 'rgba(241,190,67,0.08)' : 'transparent',
              borderBottom: activeTab === tab.id ? `2px solid ${GOLD}` : '2px solid transparent',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px' }}>
        {activeTab === 'students'    && <StudentsTab    profile={profile} theme={theme} />}
        {activeTab === 'classes'     && <ClassesTab     profile={profile} theme={theme} />}
        {activeTab === 'assignments' && <AssignmentsTab profile={profile} theme={theme} />}
        {activeTab === 'progress'    && <ProgressTab    profile={profile} theme={theme} />}
      </div>
    </div>
  )
}
