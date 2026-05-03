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
              <div key={s.student_id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: `1px solid ${t.border}` }}>
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
                {confirmRemove === s.student_id ? (
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => handleRemove(s.student_id)} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>Remove</button>
                    <button onClick={() => setConfirmRemove(null)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmRemove(s.student_id)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B, flexShrink: 0 }}>Remove</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Assignments Tab ───────────────────────────────────────────────────────────
function AssignmentsTab({ profile, theme }) {
  const t = THEMES[theme]
  const [assignments, setAssignments] = useState([])
  const [roster, setRoster]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [saving, setSaving]           = useState(false)
  const [form, setForm]               = useState({
    type: 'Quiz',
    subject: 'Chemistry Stage 1',
    topics: [],
    due_date: '',
    student_ids: [],
  })
  const [formError, setFormError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

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
      const [asgns, ros] = await Promise.all([
        fetchAssignmentsForTutor(profile.id),
        fetchRoster(profile.id),
      ])
      setAssignments(asgns)
      setRoster(ros)
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

  const toggleStudent = (id) => {
    setForm(f => ({
      ...f,
      student_ids: f.student_ids.includes(id) ? f.student_ids.filter(s => s !== id) : [...f.student_ids, id],
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    if (form.topics.length === 0) { setFormError('Select at least one topic.'); return }
    if (form.student_ids.length === 0) { setFormError('Select at least one student.'); return }
    if (!form.due_date) { setFormError('Please set a due date.'); return }
    setSaving(true)
    try {
      for (const sid of form.student_ids) {
        await createAssignment(profile.id, sid, {
          type: form.type,
          subject: form.subject,
          topics: form.topics,
          due_date: form.due_date,
        })
      }
      setShowForm(false)
      setForm({ type: 'Quiz', subject: 'Chemistry Stage 1', topics: [], due_date: '', student_ids: [] })
      await load()
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
                Assign To ({form.student_ids.length} selected)
              </label>
              {roster.length === 0 ? (
                <div style={{ fontSize: 12, color: t.textMuted }}>No students on your roster yet. Add students first.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, color: t.text, fontWeight: 600 }}>
                    <input type="checkbox"
                      checked={form.student_ids.length === roster.length && roster.length > 0}
                      onChange={() => setForm(f => ({ ...f, student_ids: f.student_ids.length === roster.length ? [] : roster.map(r => r.student_id) }))}
                      style={{ accentColor: GOLD, width: 15, height: 15 }} />
                    All students
                  </label>
                  {roster.map(s => (
                    <label key={s.student_id} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, color: t.textMuted }}>
                      <input type="checkbox" checked={form.student_ids.includes(s.student_id)} onChange={() => toggleStudent(s.student_id)} style={{ accentColor: GOLD, width: 15, height: 15 }} />
                      {s.profiles?.display_name || 'Unknown'}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {formError && <div style={{ marginBottom: 12, fontSize: 12, color: '#f87171' }}>{formError}</div>}

            <button type="submit" disabled={saving} style={{ padding: '11px 24px', borderRadius: 9, border: 'none', background: saving ? t.border : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: saving ? t.textMuted : '#0c1037', fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}>
              {saving ? 'Creating…' : `Create Assignment${form.student_ids.length > 1 ? ` (${form.student_ids.length} students)` : ''}`}
            </button>
          </form>
        </div>
      )}

      <div style={card}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>All Assignments</div>
          <div style={{ fontSize: 12, color: t.textMuted }}>{assignments.length} total</div>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Loading…</div>
        ) : assignments.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No assignments yet. Create one above.</div>
        ) : (
          <div>
            {assignments.map(a => {
              const status = assignmentStatus(a)
              const sc = statusColor(status)
              return (
                <div key={a.id} style={{ padding: '13px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{a.type}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, border: `1px solid ${sc}40`, background: `${sc}15`, color: sc, fontWeight: 700 }}>{status}</span>
                      <span style={{ fontSize: 11, color: t.textMuted }}>Due {fmtDate(a.due_date)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 3 }}>
                      <strong style={{ color: t.text }}>Student:</strong> {a.profiles?.display_name || a.student_id}
                    </div>
                    <div style={{ fontSize: 12, color: t.textMuted }}>
                      <strong style={{ color: t.text }}>Topics:</strong> {(a.topics || []).join(', ') || a.subject}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(a.id)}
                    disabled={deletingId === a.id}
                    style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#f87171', fontSize: 12, cursor: deletingId === a.id ? 'not-allowed' : 'pointer', fontFamily: FONT_B, flexShrink: 0 }}>
                    {deletingId === a.id ? '…' : 'Delete'}
                  </button>
                </div>
              )
            })}
          </div>
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

// ── Main TutorScreen ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'students',    label: 'Students',    icon: '👥' },
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
        {activeTab === 'assignments' && <AssignmentsTab profile={profile} theme={theme} />}
        {activeTab === 'progress'    && <ProgressTab    profile={profile} theme={theme} />}
      </div>
    </div>
  )
}
