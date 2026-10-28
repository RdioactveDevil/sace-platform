import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, School, ClipboardList, Video, Folder, ChartColumn, FlaskConical, Mail, Flame, Bot, Link, CircleCheck, Zap, Search, PenLine, Bell, User, MessageSquare, IdCard, CreditCard, Repeat, Pause, Play } from 'lucide-react'
import SessionsTab from './SessionsTab'
import ResourcesTab from './ResourcesTab'
import StudentsTab from './StudentsTab'
import OverviewTab from './OverviewTab'
import MessagesView from './MessagesView'
import TutorProfileTab from './TutorProfileTab'
import { TutorPlanTab } from './TutorPlan'
import { THEMES } from '../lib/theme'
import MathText from './MathText'
import AssignmentReport from './AssignmentReport'
import './TutorDashboard.css'
import {
  fetchRoster,
  inviteStudent,
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
  fetchTutorList,
  addClassTutor,
  removeClassTutor,
  createTutorClass,
  updateTutorClass,
  deleteTutorClass,
  addStudentsToClass,
  removeStudentFromClass,
  createBatchAssignment,
  fetchAssignmentSchedules,
  createAssignmentSchedule,
  setAssignmentSchedulePaused,
  deleteAssignmentSchedule,
  fetchTutorStudentWritingAttempts,
  downloadWritingReportPdf,
  generateDiagnosticQuestions,
  createDiagnosticAssessment,
  fetchDiagnosticAssessments,
  fetchDiagnosticReport,
  fetchTutorResources,
  fetchTutoringSessions,
  fetchUnreadMessageCount,
} from '../lib/db'
import { fetchLiveCurricula, loadCurriculumMacroGroups } from '../lib/curriculaDb'
import { ASSIGNMENT_DIFFICULTIES, assignmentGoalLabel } from '../lib/engine'
import { WEEKDAYS, defaultDueDays, describeDue, describeRepeat, localYmd } from '../lib/recurring'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

const ASSIGNMENT_TYPES = ['Quiz', 'Test', 'Worksheet', 'Homework']
const QUESTION_COUNT_PRESETS = [5, 10, 15, 20, 30]
const REPEAT_OPTIONS = [
  { id: 'none',        label: 'Doesn’t repeat' },
  { id: 'daily',       label: 'Daily' },
  { id: 'weekly',      label: 'Weekly' },
  { id: 'fortnightly', label: 'Fortnightly' },
]
const DIFFICULTY_OPTIONS = [
  { id: 'adaptive', label: 'Adaptive', hint: 'Follows the student’s level' },
  ...Object.entries(ASSIGNMENT_DIFFICULTIES).map(([id, d]) => ({
    id, label: d.label, hint: d.min === d.max ? `${d.min}★` : `${d.min}–${d.max}★`,
  })),
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** A YYYY-MM-DD day, e.g. "Thu 29 Oct". */
function fmtDay(ymd) {
  if (!ymd) return '—'
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function assignmentStatus(a) {
  if (a.completed_at) return a.passed === false ? 'Not passed' : 'Completed'
  const due = new Date(a.due_date)
  const now = new Date()
  due.setHours(23, 59, 59, 999)
  if (a.due_date && due < now) return 'Overdue'
  return 'Pending'
}

function statusColor(s) {
  if (s === 'Completed') return '#4ade80'
  if (s === 'Overdue' || s === 'Not passed') return '#f87171'
  return GOLD
}

// ── (legacy Students Tab — superseded by ./StudentsTab.jsx; kept out of the tree) ──
// An assignment's report is worth opening once the student has answered something.
const hasReport = (a) => !!a.question_count && ((a.progress_count || 0) > 0 || !!a.completed_at)

function ReportButton({ assignment, onOpen, theme }) {
  if (!onOpen || !hasReport(assignment)) return null
  const t = THEMES[theme]
  return (
    <button type="button" onClick={() => onOpen(assignment.id)}
      style={{ padding: '5px 11px', borderRadius: 7, border: `1px solid ${GOLD}66`, background: 'rgba(241,190,67,0.10)', color: t.goldText, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, flexShrink: 0 }}>
      Report
    </button>
  )
}

// eslint-disable-next-line no-unused-vars
function _LegacyStudentsTab({ profile, theme }) {
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
      await inviteStudent(email.trim().toLowerCase())
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

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, boxShadow: t.shadowCard }

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
                          <Mail size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Notify
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

const STATUS_OPTIONS = ['All', 'Pending', 'Overdue', 'Completed', 'Not passed']

// ── Assignments Tab ───────────────────────────────────────────────────────────
function AssignmentsTab({ profile, theme, subject, allTutors = false, onOpenReport }) {
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
  const blankForm = () => ({
    type: 'Quiz',
    subject: subject?.name || '',
    topics: [],
    due_date: '',
    question_count: 10,
    difficulty: 'adaptive',
    pass_mark_on: false,    // optional pass mark (min_accuracy)
    min_accuracy: 80,
    pass_mode: 'until_pass', // 'until_pass': practise until passed · 'one_attempt': pass or fail at the count
    remediation: true,       // similar practice questions after a wrong answer; off = straight quiz
    target_mode: 'single',  // 'single' | 'multi' | 'classes' | 'all'
    student_ids: [],
    class_ids: [],
    // Recurring: set again on these weekdays (0 = Sunday) instead of once with a due date.
    repeat: 'none',         // 'none' | 'daily' | 'weekly' | 'fortnightly'
    days_of_week: [],
    due_days: 0,
    start_date: localYmd(),
    end_date: '',
    notify_each: true,
  })
  const [form, setForm]               = useState(blankForm)
  const [schedules, setSchedules]     = useState([])
  const [scheduleBusy, setScheduleBusy] = useState(null)
  const [curriculumMacroGroups, setCurriculumMacroGroups] = useState([])
  const [formError, setFormError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [notifyStatus, setNotifyStatus] = useState(null)

  // Load topics from DB curriculum when subject changes
  const [expandedTopic, setExpandedTopic] = useState(null)
  useEffect(() => {
    if (!form.subject) { setCurriculumMacroGroups([]); return }
    let cancelled = false
    loadCurriculumMacroGroups(form.subject)
      .then(groups => { if (!cancelled) setCurriculumMacroGroups(groups || []) })
      .catch(() => { if (!cancelled) setCurriculumMacroGroups([]) })
    return () => { cancelled = true }
  }, [form.subject])

  // Two-level structure: top chips = curriculum topics, expandable = subtopics
  const allTopics = curriculumMacroGroups.map(g => g.label)
  const topicSubtopics = Object.fromEntries(
    curriculumMacroGroups.map(g => [g.label, new Set(g.topics)])
  )

  const load = async () => {
    setLoading(true)
    try {
      const [asgns, ros, cls, sch] = await Promise.all([
        fetchAssignmentsForTutor(profile.id, { allTutors }),
        fetchRoster(profile.id, { allTutors }),
        fetchTutorClasses({ allTutors }).catch(() => []),
        fetchAssignmentSchedules({ allTutors }).catch(() => []),
      ])
      setAssignments(asgns)
      setRoster(ros)
      setClasses(cls)
      setSchedules(sch)
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [profile.id, allTutors])
  // Keep form.subject in sync when the active subject changes in SubjectPicker
  useEffect(() => {
    if (subject?.name) setForm(f => ({ ...f, subject: subject.name, topics: [] }))
  }, [subject?.name])

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

  const setRepeat = (repeat) => {
    setForm(f => {
      let days = f.days_of_week
      if (repeat === 'daily') days = [0, 1, 2, 3, 4, 5, 6]
      else if (repeat !== 'none' && (days.length === 0 || days.length === 7)) days = [new Date(`${f.start_date}T12:00:00`).getDay()]
      const everyWeeks = repeat === 'fortnightly' ? 2 : 1
      return { ...f, repeat, days_of_week: days, due_days: defaultDueDays(days, everyWeeks) }
    })
  }

  const toggleDay = (day) => {
    setForm(f => {
      const days = f.days_of_week.includes(day) ? f.days_of_week.filter(d => d !== day) : [...f.days_of_week, day]
      // Daily with a day taken off is a weekly schedule on the rest.
      const repeat = f.repeat === 'daily' && days.length < 7 ? 'weekly' : f.repeat
      return { ...f, repeat, days_of_week: days, due_days: defaultDueDays(days, repeat === 'fortnightly' ? 2 : 1) }
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
    const repeating = form.repeat !== 'none'
    if (!repeating && !form.due_date) { setFormError('Please set a due date.'); return }
    if (repeating && form.days_of_week.length === 0) { setFormError('Pick at least one day for it to repeat on.'); return }
    if (repeating && form.end_date && form.end_date < form.start_date) { setFormError('The end date must be on or after the start date.'); return }
    const questionCount = Number(form.question_count)
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100) {
      setFormError('Number of questions must be a whole number from 1 to 100.'); return
    }
    const minAccuracy = form.pass_mark_on ? Number(form.min_accuracy) : null
    if (minAccuracy !== null && (!Number.isInteger(minAccuracy) || minAccuracy < 1 || minAccuracy > 100)) {
      setFormError('Pass mark must be a whole number from 1 to 100.'); return
    }
    if (resolvedCount === 0) { setFormError('Select at least one target (student, class, or roster).'); return }
    setSaving(true)
    if (repeating) {
      try {
        const { schedule, issued } = await createAssignmentSchedule({
          type: form.type,
          subject: form.subject,
          topics: form.topics,
          question_count: questionCount,
          difficulty: form.difficulty,
          min_accuracy: minAccuracy,
          pass_mode: form.pass_mode,
          remediation: form.remediation,
          studentIds: form.target_mode === 'classes' || form.target_mode === 'all' ? [] : form.student_ids,
          classIds: form.target_mode === 'classes' ? form.class_ids : [],
          allRoster: form.target_mode === 'all',
          days_of_week: form.days_of_week,
          every_weeks: form.repeat === 'fortnightly' ? 2 : 1,
          due_days: Number(form.due_days) || 0,
          start_date: form.start_date,
          end_date: form.end_date || null,
          notify: form.notify_each,
        })
        setShowForm(false)
        setForm(blankForm())
        await load()
        let msg = `Recurring assignment set up: ${describeRepeat(schedule)}.`
        if (issued > 0) msg += ` Today’s has been set for ${issued} student${issued !== 1 ? 's' : ''}.`
        else if (schedule.next_on) msg += ` The first one is set on ${fmtDay(schedule.next_on)}.`
        setNotifyStatus({ ok: true, msg })
        setTimeout(() => setNotifyStatus(null), 6000)
      } catch (err) {
        setFormError(err.message || 'Failed to set up the recurring assignment.')
      }
      setSaving(false)
      return
    }
    try {
      const result = await createBatchAssignment({
        type: form.type,
        subject: form.subject,
        topics: form.topics,
        due_date: form.due_date,
        question_count: questionCount,
        difficulty: form.difficulty,
        min_accuracy: minAccuracy,
        pass_mode: form.pass_mode,
        remediation: form.remediation,
        studentIds: form.target_mode === 'classes' || form.target_mode === 'all' ? [] : form.student_ids,
        classIds: form.target_mode === 'classes' ? form.class_ids : [],
        allRoster: form.target_mode === 'all',
        notify: true,
      })
      setShowForm(false)
      setForm(blankForm())
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

  const togglePaused = async (sch) => {
    setScheduleBusy(sch.id)
    try {
      const updated = await setAssignmentSchedulePaused(sch.id, !sch.paused_at)
      setSchedules(list => list.map(x => (x.id === sch.id ? updated : x)))
    } catch {}
    setScheduleBusy(null)
  }

  const stopSchedule = async (sch) => {
    if (!window.confirm('Stop this recurring assignment? Work it has already set stays with the students.')) return
    setScheduleBusy(sch.id)
    try {
      await deleteAssignmentSchedule(sch.id)
      setSchedules(list => list.filter(x => x.id !== sch.id))
    } catch {}
    setScheduleBusy(null)
  }

  const overdueCount = assignments.filter(a => assignmentStatus(a) === 'Overdue').length
  const filteredAssignments = assignments.filter(a => {
    if (filterStudent && a.student_id !== filterStudent) return false
    if (filterStatus !== 'All' && assignmentStatus(a) !== filterStatus) return false
    return true
  })

  const card = theme === 'dark'
    ? { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, boxShadow: '0 4px 28px rgba(0,0,0,0.40)' }
    : { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, boxShadow: t.shadowCard }
  const inputStyle = { padding: '9px 12px', borderRadius: 8, border: theme === 'dark' ? '1px solid rgba(255,255,255,0.10)' : `1px solid ${t.border}`, background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : t.bg, color: t.text, fontSize: 13, fontFamily: FONT_B, outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => setFilterStatus(s => (s === 'Overdue' ? 'All' : 'Overdue'))}
          aria-pressed={filterStatus === 'Overdue'}
          title={overdueCount > 0 ? `${overdueCount} overdue assignment${overdueCount !== 1 ? 's' : ''}` : 'No overdue assignments'}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px', height: 38, borderRadius: 9, border: `1px solid ${filterStatus === 'Overdue' ? '#f87171' : t.border}`, background: filterStatus === 'Overdue' ? 'rgba(248,113,113,0.10)' : 'transparent', color: overdueCount > 0 ? '#f87171' : t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}
        >
          <Bell size={15} aria-hidden="true" />
          {overdueCount > 0 ? `${overdueCount} overdue` : 'None overdue'}
        </button>
        <button
          onClick={() => { setShowForm(v => !v); setFormError('') }}
          style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: showForm ? (theme === 'dark' ? 'rgba(255,255,255,0.07)' : t.border) : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: showForm ? t.textMuted : '#0c1037', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}
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
                <select className="td-input-gold" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
                  {ASSIGNMENT_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Subject</label>
                <div style={{ ...inputStyle, color: t.text, opacity: 0.85 }}>{form.subject || '—'}</div>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div>
                <label htmlFor="assignment-question-count" style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Questions to complete</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {QUESTION_COUNT_PRESETS.map(n => {
                    const active = Number(form.question_count) === n
                    return (
                      <button key={n} type="button" onClick={() => setForm(f => ({ ...f, question_count: n }))} aria-pressed={active}
                        style={{ padding: '5px 11px', borderRadius: 20, border: `1px solid ${active ? GOLD : t.border}`, background: active ? 'rgba(241,190,67,0.15)' : 'transparent', color: active ? GOLD : t.textMuted, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
                        {n}
                      </button>
                    )
                  })}
                  <input id="assignment-question-count" type="number" min={1} max={100} step={1} value={form.question_count}
                    onChange={e => setForm(f => ({ ...f, question_count: e.target.value }))}
                    style={{ ...inputStyle, width: 72 }} />
                </div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 6 }}>Marked complete once the student has answered this many. Progress carries over between sessions.</div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Difficulty</label>
                <div role="radiogroup" aria-label="Difficulty" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DIFFICULTY_OPTIONS.map(opt => {
                    const active = form.difficulty === opt.id
                    return (
                      <button key={opt.id} type="button" role="radio" aria-checked={active} title={opt.hint} onClick={() => setForm(f => ({ ...f, difficulty: opt.id }))}
                        style={{ padding: '5px 11px', borderRadius: 20, border: `1px solid ${active ? GOLD : t.border}`, background: active ? 'rgba(241,190,67,0.15)' : 'transparent', color: active ? GOLD : t.textMuted, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 6 }}>{DIFFICULTY_OPTIONS.find(o => o.id === form.difficulty)?.hint}</div>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: t.text, fontWeight: 600, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.remediation} onChange={e => setForm(f => ({ ...f, remediation: e.target.checked }))} style={{ accentColor: GOLD, width: 15, height: 15 }} />
                Remediation
              </label>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, paddingLeft: 23 }}>
                {form.remediation
                  ? 'After a wrong answer they get similar practice questions before moving on. These don’t count toward the assignment.'
                  : 'Straight quiz: no practice questions between answers, so you see what they can do on their own.'}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: t.text, fontWeight: 600, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.pass_mark_on} onChange={e => setForm(f => ({ ...f, pass_mark_on: e.target.checked }))} style={{ accentColor: GOLD, width: 15, height: 15 }} />
                Require a pass mark <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 500 }}>(optional)</span>
              </label>
              {form.pass_mark_on && (
                <div style={{ marginTop: 8, paddingLeft: 23 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input aria-label="Pass mark percentage" type="number" min={1} max={100} step={1} value={form.min_accuracy}
                      onChange={e => setForm(f => ({ ...f, min_accuracy: e.target.value }))}
                      style={{ ...inputStyle, width: 72 }} />
                    <span style={{ fontSize: 13, color: t.textMuted }}>% correct</span>
                  </div>
                  <div role="radiogroup" aria-label="If they don't reach the pass mark" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                    {[
                      { id: 'until_pass', label: 'Keep going until they pass', hint: `They keep practising until they score at least this on their last ${Number(form.question_count) || 'N'} answers.` },
                      { id: 'one_attempt', label: 'One attempt: pass or fail', hint: `The assignment ends after ${Number(form.question_count) || 'N'} questions and is marked passed or not passed. You get the report either way.` },
                    ].map(opt => (
                      <label key={opt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                        <input type="radio" name="pass_mode" checked={form.pass_mode === opt.id} onChange={() => setForm(f => ({ ...f, pass_mode: opt.id }))} style={{ accentColor: GOLD, marginTop: 2 }} />
                        <span>
                          <span style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>{opt.label}</span>
                          <span style={{ display: 'block', fontSize: 11, color: t.textMuted, marginTop: 2 }}>{opt.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Repeat</label>
              <div role="radiogroup" aria-label="Repeat" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {REPEAT_OPTIONS.map(opt => {
                  const active = form.repeat === opt.id
                  return (
                    <button key={opt.id} type="button" role="radio" aria-checked={active} onClick={() => setRepeat(opt.id)}
                      style={{ padding: '5px 11px', borderRadius: 20, border: `1px solid ${active ? GOLD : t.border}`, background: active ? 'rgba(241,190,67,0.15)' : 'transparent', color: active ? GOLD : t.textMuted, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
                      {opt.id !== 'none' && <Repeat size={11} aria-hidden="true" style={{ marginRight: 5, verticalAlign: '-1px' }} />}
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              {form.repeat !== 'none' && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 6 }}>On</div>
                    <div role="group" aria-label="Days of the week" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {WEEKDAYS.map(d => {
                        const active = form.days_of_week.includes(d.id)
                        return (
                          <button key={d.id} type="button" aria-pressed={active} aria-label={d.short} title={d.short} onClick={() => toggleDay(d.id)}
                            style={{ width: 38, height: 34, borderRadius: 8, border: `1px solid ${active ? GOLD : t.border}`, background: active ? 'rgba(241,190,67,0.15)' : 'transparent', color: active ? GOLD : t.textMuted, fontSize: 12, fontWeight: active ? 800 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
                            {d.short.slice(0, 2)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                    <div>
                      <label htmlFor="schedule-due-days" style={{ fontSize: 12, color: t.textMuted, display: 'block', marginBottom: 6 }}>Each one is due</label>
                      <select id="schedule-due-days" value={form.due_days} onChange={e => setForm(f => ({ ...f, due_days: Number(e.target.value) }))} style={inputStyle}>
                        {Array.from({ length: 14 }, (_, n) => <option key={n} value={n}>{n === 0 ? 'The same day' : n === 1 ? 'The next day' : `${n} days later`}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="schedule-start" style={{ fontSize: 12, color: t.textMuted, display: 'block', marginBottom: 6 }}>Starts</label>
                      <input id="schedule-start" type="date" value={form.start_date} min={localYmd()} onChange={e => setForm(f => ({ ...f, start_date: e.target.value || localYmd() }))} style={inputStyle} />
                    </div>
                    <div>
                      <label htmlFor="schedule-end" style={{ fontSize: 12, color: t.textMuted, display: 'block', marginBottom: 6 }}>Ends <span style={{ fontSize: 11 }}>(optional)</span></label>
                      <input id="schedule-end" type="date" value={form.end_date} min={form.start_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inputStyle} />
                    </div>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: t.text, fontWeight: 600, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.notify_each} onChange={e => setForm(f => ({ ...f, notify_each: e.target.checked }))} style={{ accentColor: GOLD, width: 15, height: 15 }} />
                    Email students each time it’s set
                  </label>
                  {form.days_of_week.length > 0 && (
                    <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 12px', borderRadius: 8, background: 'rgba(241,190,67,0.06)', border: `1px solid ${t.border}` }}>
                      {describeRepeat({ days_of_week: form.days_of_week, every_weeks: form.repeat === 'fortnightly' ? 2 : 1 })}, {describeDue(Number(form.due_days))}
                      {form.end_date ? `, until ${fmtDay(form.end_date)}` : ''}. Students who join a class or roster you pick get it from then on.
                    </div>
                  )}
                </div>
              )}
            </div>

            {form.repeat === 'none' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Due Date</label>
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={{ ...inputStyle, maxWidth: 220 }} min={new Date().toISOString().slice(0, 10)} />
              </div>
            )}

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
              {saving ? 'Creating…' : `${form.repeat !== 'none' ? 'Create Recurring Assignment' : 'Create Assignment'}${resolvedCount > 1 ? ` (${resolvedCount} students)` : ''}`}
            </button>
          </form>
        </div>
      )}

      {schedules.length > 0 && (
        <div style={card}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.07)' : t.border}`, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: 400, fontFamily: "'Sifonn Pro', sans-serif", letterSpacing: '0.04em', color: t.text }}>Recurring</div>
            <div style={{ fontSize: 12, color: t.textMuted }}>{schedules.length} active or paused</div>
          </div>
          {schedules.map(sch => {
            const paused = !!sch.paused_at
            const finished = !paused && !sch.next_on
            const busy = scheduleBusy === sch.id
            const studentNames = (sch.student_ids || []).map(id => roster.find(r => r.student_id === id)?.profiles?.display_name).filter(Boolean)
            const classNames = (sch.class_ids || []).map(id => classes.find(c => c.id === id)?.name).filter(Boolean)
            const who = sch.all_roster ? 'Entire roster'
              : [...classNames.map(n => `Class: ${n}`), ...studentNames].join(', ') || `${(sch.student_ids || []).length + (sch.class_ids || []).length} target${(sch.student_ids || []).length + (sch.class_ids || []).length !== 1 ? 's' : ''}`
            const state = paused ? 'Paused' : finished ? 'Finished' : `Next: ${fmtDay(sch.next_on)}`
            const stateColor = paused ? t.textMuted : finished ? t.textMuted : GOLD
            return (
              <div key={sch.id} style={{ padding: '13px 20px', borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.07)' : t.border}`, display: 'flex', alignItems: 'flex-start', gap: 14, opacity: paused || finished ? 0.75 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                    <Repeat size={14} color={GOLD} aria-hidden="true" />
                    <span style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{sch.type}</span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, border: `1px solid ${stateColor}40`, background: `${stateColor}15`, color: stateColor, fontWeight: 700 }}>{state}</span>
                    <span style={{ fontSize: 11, color: t.textMuted }}>{describeRepeat(sch)}, {describeDue(sch.due_days)}{sch.end_date ? ` · until ${fmtDay(sch.end_date)}` : ''}</span>
                  </div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 3 }}>
                    <strong style={{ color: t.text }}>For:</strong> {who}
                    <span style={{ marginLeft: 8 }}>· {sch.question_count} questions · {ASSIGNMENT_DIFFICULTIES[sch.difficulty]?.label || 'Adaptive'}{sch.min_accuracy ? ` · Pass ${sch.min_accuracy}%` : ''}</span>
                  </div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>
                    <strong style={{ color: t.text }}>Topics:</strong> {(sch.topics || []).join(', ') || sch.subject}
                  </div>
                </div>
                {!finished && (
                  <button type="button" onClick={() => togglePaused(sch)} disabled={busy}
                    style={{ padding: '5px 11px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: FONT_B, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
                    {paused ? 'Resume' : 'Pause'}
                  </button>
                )}
                <button type="button" onClick={() => stopSchedule(sch)} disabled={busy}
                  style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#f87171', fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: FONT_B, flexShrink: 0 }}>
                  {finished ? 'Remove' : 'Stop'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div style={card}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.07)' : t.border}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: 400, fontFamily: "'Sifonn Pro', sans-serif", letterSpacing: '0.04em', color: t.text }}>All Assignments</div>
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
                <div key={a.id} style={{ padding: indent ? '11px 20px 11px 38px' : '13px 20px', borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.07)' : t.border}`, display: 'flex', alignItems: 'flex-start', gap: 14, background: indent ? (theme === 'dark' ? 'rgba(255,255,255,0.015)' : 'rgba(12,16,55,0.02)') : 'transparent' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                      {!indent && <span style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{a.type}</span>}
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, border: `1px solid ${sc}40`, background: `${sc}15`, color: sc, fontWeight: 700 }}>{status}</span>
                      {!indent && <span style={{ fontSize: 11, color: t.textMuted }}>Due {fmtDate(a.due_date)}</span>}
                      {!indent && a.schedule_id && <span title="Set by a recurring assignment" style={{ fontSize: 11, color: GOLD, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Repeat size={11} aria-hidden="true" />Recurring</span>}
                    </div>
                    <div style={{ fontSize: 12, color: t.textMuted, marginBottom: indent ? 0 : 3 }}>
                      <strong style={{ color: t.text }}>Student:</strong> {a.profiles?.display_name || a.student_id}
                      {a.completed_at && <span style={{ marginLeft: 8, color: '#4ade80' }}>· Completed {fmtDate(a.completed_at)}</span>}
                      {assignmentGoalLabel(a) && <span style={{ marginLeft: 8 }}>· {assignmentGoalLabel(a)}</span>}
                    </div>
                    {!indent && (
                      <div style={{ fontSize: 12, color: t.textMuted }}>
                        <strong style={{ color: t.text }}>Topics:</strong> {(a.topics || []).join(', ') || a.subject}
                      </div>
                    )}
                  </div>
                  <ReportButton assignment={a} onOpen={onOpenReport} theme={theme} />
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
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, border: `1px solid ${GOLD}40`, background: 'rgba(241,190,67,0.15)', color: GOLD, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{head.schedule_id && <Repeat size={11} aria-hidden="true" />}{head.schedule_id ? 'Recurring' : 'Batch'}</span>
                          <span style={{ fontSize: 11, color: t.textMuted }}>Due {fmtDate(head.due_date)}</span>
                          {head.question_count > 0 && <span style={{ fontSize: 11, color: t.textMuted }}>{head.question_count} questions · {ASSIGNMENT_DIFFICULTIES[head.difficulty]?.label || 'Adaptive'}{head.min_accuracy ? ` · Pass ${head.min_accuracy}%` : ''}</span>}
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
function ProgressTab({ profile, theme, allTutors = false, onOpenReport }) {
  const t = THEMES[theme]
  const [roster, setRoster]           = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [progress, setProgress]       = useState(null)
  const [loading, setLoading]         = useState(false)
  const [rosterLoading, setRosterLoading] = useState(true)
  const [writingAttempts, setWritingAttempts] = useState([])
  const [writingLoading, setWritingLoading] = useState(false)
  const [pdfBusyId, setPdfBusyId] = useState(null)

  useEffect(() => {
    fetchRoster(profile.id, { allTutors }).then(r => { setRoster(r); setRosterLoading(false) }).catch(() => setRosterLoading(false))
  }, [profile.id, allTutors])

  useEffect(() => {
    if (!selectedStudentId) {
      setProgress(null)
      setWritingAttempts([])
      return
    }
    setLoading(true)
    fetchStudentProgressForTutor(profile.id, selectedStudentId, { allTutors })
      .then(p => { setProgress(p); setLoading(false) })
      .catch(() => setLoading(false))

    setWritingLoading(true)
    fetchTutorStudentWritingAttempts(selectedStudentId)
      .then(rows => { setWritingAttempts(rows); setWritingLoading(false) })
      .catch(() => { setWritingAttempts([]); setWritingLoading(false) })
  }, [selectedStudentId, profile.id, allTutors])

  const card = theme === 'dark'
    ? { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, boxShadow: '0 4px 28px rgba(0,0,0,0.40)' }
    : { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, boxShadow: t.shadowCard }
  const divider = theme === 'dark' ? 'rgba(255,255,255,0.07)' : t.border
  const cardSecHdr = { padding: '14px 20px', borderBottom: `1px solid ${divider}` }
  const secTitle = { fontSize: 13, fontWeight: 400, fontFamily: "'Sifonn Pro', sans-serif", letterSpacing: '0.04em', color: t.text }

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
              { label: 'Streak', val: <>{progress.streak ?? 0} days <Flame size={22} aria-hidden="true" style={{ verticalAlign: '-2px' }} /></>, color: GOLD },
              { label: 'Accuracy', val: `${progress.accuracy ?? 0}%`, color: progress.accuracy >= 70 ? '#4ade80' : progress.accuracy >= 40 ? GOLD : '#f87171' },
              { label: 'Questions Done', val: progress.totalAttempts ?? 0, color: t.text },
            ].map((s, i) => (
              <div key={s.label} className={`td-fadein td-fadein-${i + 1}`} style={{ ...card, padding: '16px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontFamily: "'Sifonn Pro', sans-serif", letterSpacing: '-0.5px', lineHeight: 1, color: s.color, marginBottom: 8 }}>{s.val}</div>
                <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {progress.topicBreakdown && progress.topicBreakdown.length > 0 && (
            <div style={card}>
              <div style={cardSecHdr}>
                <div style={secTitle}>Topic Accuracy</div>
              </div>
              <div>
                {progress.topicBreakdown.map(tb => {
                  const acc = tb.attempts > 0 ? Math.round(((tb.attempts - tb.wrong) / tb.attempts) * 100) : null
                  const color = acc == null ? t.textMuted : acc >= 70 ? '#4ade80' : acc >= 40 ? GOLD : '#f87171'
                  return (
                    <div key={tb.topic} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 20px', borderBottom: `1px solid ${divider}` }}>
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
              <div style={cardSecHdr}>
                <div style={secTitle}>Assignments</div>
              </div>
              <div>
                {progress.assignments.map(a => {
                  const status = assignmentStatus(a)
                  const sc = statusColor(status)
                  return (
                    <div key={a.id} style={{ padding: '12px 20px', borderBottom: `1px solid ${divider}`, display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{a.type} — {(a.topics || []).join(', ') || a.subject}</div>
                        <div style={{ fontSize: 11, color: t.textMuted }}>Due {fmtDate(a.due_date)}{a.completed_at ? ` · Completed ${fmtDate(a.completed_at)}` : ''}{assignmentGoalLabel(a) ? ` · ${assignmentGoalLabel(a)}` : ''}</div>
                      </div>
                      <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, border: `1px solid ${sc}40`, background: `${sc}15`, color: sc, fontWeight: 700, flexShrink: 0 }}>{status}</span>
                      <ReportButton assignment={a} onOpen={onOpenReport} theme={theme} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {progress.recentActivity && progress.recentActivity.length > 0 && (
            <div style={card}>
              <div style={cardSecHdr}>
                <div style={secTitle}>Recent Activity</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Last 10 sessions</div>
              </div>
              <div>
                {progress.recentActivity.map((r, i) => (
                  <div key={i} style={{ padding: '10px 20px', borderBottom: `1px solid ${divider}`, display: 'flex', alignItems: 'center', gap: 12 }}>
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
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${divider}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={secTitle}>Off-Topic Questions</div>
                  <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 20, border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.1)', color: '#f87171', fontWeight: 700 }}>
                    {progress.offTopicAttempts.reduce((s, r) => s + r.count, 0)} total
                  </span>
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>Topics where Titan AI redirected this student away from off-subject questions</div>
              </div>
              <div>
                {progress.offTopicAttempts.map((r, i) => (
                  <div key={i} style={{ padding: '10px 20px', borderBottom: `1px solid ${divider}`, display: 'flex', alignItems: 'center', gap: 14 }}>
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

          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${divider}` }}>
              <div style={secTitle}>English writing</div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Practice submissions (scores from AI rubric)</div>
            </div>
            {writingLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Loading writing…</div>
            ) : writingAttempts.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No writing attempts yet.</div>
            ) : (
              <div>
                {writingAttempts.map(w => {
                  const sc = w.feedback?.overallScore
                  const label = `${w.essay_type || ''} · ${(w.mode || '').replace(/_/g, ' ')}`
                  const stName = roster.find(r => r.student_id === selectedStudentId)?.profiles?.display_name
                  return (
                    <div key={w.id} style={{ padding: '12px 20px', borderBottom: `1px solid ${divider}` }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, textTransform: 'capitalize' }}>{label}</div>
                          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{w.subject} · {fmtDate(w.created_at)}</div>
                          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.prompt}</div>
                          {typeof sc === 'number' && (
                            <div style={{ fontSize: 12, fontWeight: 800, color: GOLD, marginTop: 8 }}>Overall: {sc}/10</div>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!w.feedback || pdfBusyId === w.id}
                          onClick={async () => {
                            setPdfBusyId(w.id)
                            try {
                              await downloadWritingReportPdf(w.id, stName)
                            } catch (e) { console.warn(e) }
                            setPdfBusyId(null)
                          }}
                          style={{
                            flexShrink: 0,
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: `1px solid ${GOLD}55`,
                            background: 'rgba(241,190,67,0.1)',
                            color: GOLD,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: !w.feedback || pdfBusyId === w.id ? 'not-allowed' : 'pointer',
                            fontFamily: FONT_B,
                            opacity: w.feedback ? 1 : 0.4,
                          }}
                        >
                          {pdfBusyId === w.id ? 'PDF…' : 'PDF'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
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
function ClassesTab({ profile, theme, allTutors = false }) {
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
  // Co-tutors: the tutor list (loaded when first needed) and which class's
  // "add tutor" picker is open.
  const [tutorList, setTutorList] = useState(null)
  const [tutorPickerFor, setTutorPickerFor] = useState(null)
  const [tutorError, setTutorError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [cls, ros] = await Promise.all([
        fetchTutorClasses({ allTutors }),
        fetchRoster(profile.id, { allTutors }),
      ])
      setClasses(cls)
      setRoster(ros)
    } catch (err) {
      console.warn('[ClassesTab] load failed', err)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [profile.id, allTutors])

  // The class owner and admins decide who teaches a class.
  const canManageTutors = (cls) => cls.tutor_id === profile.id || !!profile.is_admin

  const openTutorPicker = async (cls) => {
    setTutorError('')
    setTutorPickerFor(cls.id)
    if (!tutorList) {
      try { setTutorList(await fetchTutorList()) } catch (err) { setTutorError(err.message || 'Could not load tutors.') }
    }
  }

  const handleAddTutor = async (cls, tutorId) => {
    if (!tutorId) return
    setTutorError('')
    try {
      await addClassTutor(cls.id, tutorId)
      setTutorPickerFor(null)
      await load()
    } catch (err) { setTutorError(err.message || 'Could not add tutor.') }
  }

  const handleRemoveTutor = async (cls, tutorId) => {
    setTutorError('')
    try {
      await removeClassTutor(cls.id, tutorId)
      await load()
    } catch (err) { setTutorError(err.message || 'Could not remove tutor.') }
  }

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
    setTutorError('')
    try {
      await addStudentsToClass(cls.id, pickerSelected)
      setPickerForClass(null); setPickerSelected([])
      await load()
    } catch (err) { setTutorError(err.message || 'Could not add students to the class.') }
    setPickerSaving(false)
  }

  const handleRemoveMember = async (cls, studentId) => {
    setTutorError('')
    try {
      await removeStudentFromClass(cls.id, studentId)
      await load()
    } catch (err) { setTutorError(err.message || 'Could not remove the student.') }
  }

  const card = theme === 'dark'
    ? { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, boxShadow: '0 4px 28px rgba(0,0,0,0.40)' }
    : { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, boxShadow: t.shadowCard }
  const inputStyle = { padding: '9px 12px', borderRadius: 8, border: theme === 'dark' ? '1px solid rgba(255,255,255,0.10)' : `1px solid ${t.border}`, background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : t.bg, color: t.text, fontSize: 13, fontFamily: FONT_B, outline: 'none', width: '100%', boxSizing: 'border-box' }

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
                <input className="td-input-gold" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Year 10 Chem - Tuesday" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Subject (optional)</label>
                <input className="td-input-gold" value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="e.g. Chemistry Stage 1" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Color</label>
                <input type="color" value={newColor || '#f1be43'} onChange={e => setNewColor(e.target.value)} style={{ ...inputStyle, padding: 4, height: 36 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Description</label>
                <input className="td-input-gold" value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Optional notes about this class" style={inputStyle} />
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
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.07)' : t.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 400, fontFamily: "'Sifonn Pro', sans-serif", letterSpacing: '0.04em', color: t.text }}>My Classes</div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{classes.length} class{classes.length !== 1 ? 'es' : ''}</div>
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
                <div key={cls.id} style={{ borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.07)' : t.border}` }}>
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
                            {(cls.tutors || []).length > 0 ? ` · ${cls.tutors.map(tu => tu.display_name || 'Unnamed').join(', ')}` : ''}
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
                          {canManageTutors(cls) && <button onClick={() => setConfirmDelete(cls.id)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#f87171', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Delete</button>}
                        </>
                      )}
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ padding: '0 20px 16px 38px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Tutors</span>
                        {(cls.tutors || []).map(tu => (
                          <span key={tu.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999, border: `1px solid ${t.border}`, background: t.bg, fontSize: 12, color: t.text }}>
                            {tu.display_name || 'Unnamed'}{tu.role === 'owner' && <span style={{ fontSize: 10, color: t.textMuted }}>owner</span>}
                            {tu.role === 'co' && canManageTutors(cls) && (
                              <button onClick={() => handleRemoveTutor(cls, tu.id)} title="Remove tutor" style={{ border: 'none', background: 'transparent', color: '#f87171', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
                            )}
                          </span>
                        ))}
                        {canManageTutors(cls) && (tutorPickerFor === cls.id ? (
                          <select autoFocus defaultValue="" onChange={e => handleAddTutor(cls, e.target.value)} onBlur={() => setTutorPickerFor(null)} style={{ ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 12 }}>
                            <option value="" disabled>{tutorList ? 'Choose a tutor…' : 'Loading…'}</option>
                            {(tutorList || []).filter(tu => !(cls.tutors || []).some(x => x.id === tu.id)).map(tu => (
                              <option key={tu.id} value={tu.id}>{tu.display_name || 'Unnamed'}{tu.is_admin ? ' (admin)' : ''}</option>
                            ))}
                          </select>
                        ) : (
                          <button onClick={() => openTutorPicker(cls)} style={{ padding: '3px 10px', borderRadius: 999, border: `1px dashed ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>+ Add tutor</button>
                        ))}
                      </div>
                      {tutorError && expanded && <div style={{ fontSize: 12, color: '#f87171' }}>{tutorError}</div>}
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

// ── DiagnosticTab ─────────────────────────────────────────────────────────────

const YEAR_LEVEL_GROUPS = [
  { label: 'Primary',  levels: ['Year 3', 'Year 4', 'Year 5', 'Year 6'] },
  { label: 'Junior Secondary', levels: ['Year 7', 'Year 8', 'Year 9', 'Year 10'] },
  { label: 'Senior Secondary', levels: ['Year 11 / Stage 1', 'Year 12 / Stage 2'] },
]
const YEAR_LEVELS = YEAR_LEVEL_GROUPS.flatMap(g => g.levels)

// All subjects, keyed by id, with topics and which year groups they appear in
const ALL_DIAGNOSTIC_SUBJECTS = [
  // ── Primary ────────────────────────────────────────────────────────────────
  {
    id: 'maths_primary', name: 'Mathematics',
    yearGroups: ['primary'],
    topics: ['Number & Place Value', 'Fractions & Decimals', 'Money & Financial Maths', 'Patterns & Algebra', 'Measurement', 'Geometry & Shape', 'Location & Transformation', 'Data & Graphs', 'Chance & Probability', 'Problem Solving'],
  },
  {
    id: 'english_primary', name: 'English',
    yearGroups: ['primary'], isWriting: true,
    topics: ['Reading Comprehension', 'Narrative Writing', 'Persuasive Writing', 'Grammar & Punctuation', 'Vocabulary', 'Spelling', 'Sentence Structure', 'Handwriting & Presentation'],
  },
  {
    id: 'science_primary', name: 'Science',
    yearGroups: ['primary'],
    topics: ['Biological Sciences', 'Chemical Sciences', 'Earth & Space Sciences', 'Physical Sciences', 'Science Inquiry'],
  },
  // ── Junior Secondary (Year 7–10) ───────────────────────────────────────────
  {
    id: 'science_y7', name: 'Science',
    yearGroups: ['junior'],
    topics: ['Cells & Living Things', 'Body Systems', 'Ecosystems & Ecology', 'Mixtures & Substances', 'Chemical Reactions', 'Forces & Motion', 'Energy Forms & Transfers', 'Waves — Light & Sound', 'Electricity & Magnetism', 'Earth & Space', 'Geology', 'Science Inquiry Skills'],
  },
  {
    id: 'history_y7', name: 'History',
    yearGroups: ['junior'],
    topics: ['Ancient Civilisations', 'The Mediterranean World', 'The Asian World', 'The Americas', 'Medieval Europe', 'Renaissance & Reformation', 'Age of Exploration', 'Industrial Revolution', 'Australian History', 'Source Analysis & Historical Skills'],
  },
  {
    id: 'geography_y7', name: 'Geography',
    yearGroups: ['junior'],
    topics: ['Landforms & Landscapes', 'Water in the World', 'Place & Liveability', 'Interconnections', 'Changing Nations', 'Environmental Change & Management', 'Geographies of Interconnections', 'Geographical Inquiry Skills'],
  },
  // ── Stage 1 (Year 11) ──────────────────────────────────────────────────────
  {
    id: 'maths_methods_s1', name: 'Mathematical Methods',
    yearGroups: ['stage1'],
    topics: ['Functions and graphs', 'Polynomials', 'Trigonometry', 'Counting and statistics', 'Growth and decay', 'Introduction to differential calculus', 'Arithmetic and geometric sequences', 'The logarithmic function', 'Exponential functions'],
  },
  {
    id: 'maths_specialist_s1', name: 'Specialist Mathematics',
    yearGroups: ['stage1'],
    topics: ['Arithmetic and geometric sequences and series', 'Geometry', 'Vectors in the plane', 'Further trigonometry', 'Matrices', 'Real and complex numbers', 'Proof', 'Logic'],
  },
  {
    id: 'maths_general_s1', name: 'General Mathematics',
    yearGroups: ['stage1'],
    topics: ['Investing and borrowing', 'Measurement', 'Statistical investigation', 'Applications of trigonometry', 'Linear functions and graphs', 'Exponential functions and graphs', 'Matrices and networks', 'Financial decisions'],
  },
  {
    id: 'biology_s1', name: 'Biology',
    yearGroups: ['stage1'],
    topics: ['Cells and microorganisms', 'Multicellular organisms', 'Nervous and endocrine systems', 'Biodiversity and evolution', 'Ecosystem dynamics', 'DNA and inheritance', 'Reproduction', 'Adaptations'],
  },
  {
    id: 'physics_s1', name: 'Physics',
    yearGroups: ['stage1'],
    topics: ['Linear motion', 'Forces and Newton\'s laws', 'Energy and momentum', 'Electricity — circuits and charge', 'Magnetism and electromagnetic induction', 'Waves — mechanical and sound', 'Light and optics', 'Nuclear physics', 'Thermodynamics'],
  },
  {
    id: 'english_literary_s1', name: 'English Literary Studies',
    yearGroups: ['stage1'], isWriting: true,
    topics: ['Close reading and analysis', 'Essay writing — analytical', 'Essay writing — comparative', 'Narrative and authorial technique', 'Intertextuality', 'Themes and ideas', 'Character and context', 'Genre conventions', 'Creative writing — responding to texts'],
  },
  {
    id: 'english_s1', name: 'English',
    yearGroups: ['stage1'], isWriting: true,
    topics: ['Reading and responding to texts', 'Analytical essay writing', 'Creative and imaginative writing', 'Multimodal and media texts', 'Language features and techniques', 'Context and purpose', 'Argument and persuasion'],
  },
  {
    id: 'history_modern_s1', name: 'Modern History',
    yearGroups: ['stage1'],
    topics: ['The making of the modern world (1750–1918)', 'World War I', 'The Russian Revolution', 'The Interwar period', 'World War II', 'The Cold War', 'Decolonisation', 'Historical inquiry and source analysis'],
  },
  {
    id: 'geography_s1', name: 'Geography',
    yearGroups: ['stage1'],
    topics: ['Landscapes and landforms', 'Interconnections', 'Hazards and disasters', 'Population and urbanisation', 'Global resource use', 'Environmental sustainability', 'Geographical inquiry skills'],
  },
  {
    id: 'economics_s1', name: 'Economics',
    yearGroups: ['stage1'],
    topics: ['Microeconomics — supply and demand', 'Market structures', 'Macroeconomics — GDP and growth', 'Unemployment', 'Inflation', 'Government policy — fiscal', 'Government policy — monetary', 'International trade', 'Economic indicators'],
  },
  {
    id: 'business_s1', name: 'Business Studies',
    yearGroups: ['stage1'],
    topics: ['Business planning and structure', 'Marketing', 'Human resource management', 'Financial management', 'Operations', 'Business ethics and social responsibility', 'Legal obligations'],
  },
  // ── Stage 2 (Year 12) ──────────────────────────────────────────────────────
  {
    id: 'maths_specialist_s2', name: 'Specialist Mathematics',
    yearGroups: ['stage2'],
    topics: ['Mathematical induction', 'Complex numbers', 'Functions and sketching graphs', 'Vectors in three dimensions', 'Integration techniques and applications', 'Rates of change and differential equations', 'Statistical inference'],
  },
  {
    id: 'maths_general_s2', name: 'General Mathematics',
    yearGroups: ['stage2'],
    topics: ['Modelling with linear relationships', 'Modelling with matrices', 'Statistical models', 'Financial models', 'Discrete models — networks and graph theory', 'Bivariate data', 'Modelling with trigonometry'],
  },
  {
    id: 'biology_s2', name: 'Biology',
    yearGroups: ['stage2'],
    topics: ['DNA and proteins', 'Gene expression and regulation', 'Continuity of life — reproduction and inheritance', 'Humans and disease', 'Immune response', 'Managing ecosystem change', 'Biotechnology', 'Evolution and natural selection'],
  },
  {
    id: 'physics_s2', name: 'Physics',
    yearGroups: ['stage2'],
    topics: ['Motion and relativity', 'Electricity and magnetism', 'Light and matter', 'Thermal physics', 'Gravitational fields', 'Electric and magnetic fields', 'Quantum physics', 'Nuclear and particle physics'],
  },
  {
    id: 'english_literary_s2', name: 'English Literary Studies',
    yearGroups: ['stage2'], isWriting: true,
    topics: ['Close analysis of texts', 'Comparative essay writing', 'Creating literary texts', 'Intertextual connections', 'Authorial choices and techniques', 'Themes, values and context', 'Genre and form', 'Oral communication'],
  },
  {
    id: 'english_s2', name: 'English',
    yearGroups: ['stage2'], isWriting: true,
    topics: ['Responding to and analysing texts', 'Crafting analytical writing', 'Creating texts for audience and purpose', 'Multimodal texts', 'Oral presentation', 'Language and stylistic choices', 'Argument and rhetoric'],
  },
  {
    id: 'history_modern_s2', name: 'Modern History',
    yearGroups: ['stage2'],
    topics: ['Power and people (1750–1918)', 'The twentieth century world (1919–2000)', 'Historical significance and causation', 'Source analysis and evaluation', 'Historical essay writing', 'In-depth case study — Revolution or Conflict', 'Contemporary issues'],
  },
  {
    id: 'geography_s2', name: 'Geography',
    yearGroups: ['stage2'],
    topics: ['Geographies of human wellbeing', 'Geographies of interconnections', 'Environmental change and sustainability', 'Natural hazards and disasters', 'Global population dynamics', 'Geographical inquiry and research', 'Data analysis and spatial technology'],
  },
  {
    id: 'economics_s2', name: 'Economics',
    yearGroups: ['stage2'],
    topics: ['Markets and pricing', 'Competition and market failure', 'Macroeconomic performance', 'Economic policies and their effects', 'Global economy and trade', 'Distribution of income and wealth', 'Evaluating economic outcomes', 'Extended research and analysis'],
  },
  {
    id: 'business_s2', name: 'Business Studies',
    yearGroups: ['stage2'],
    topics: ['Strategic management', 'Marketing strategy', 'Financial analysis and planning', 'Human resource strategy', 'Operations and supply chain', 'Stakeholders and corporate governance', 'Innovation and entrepreneurship'],
  },
]

function getSubjectsForYearLevel(yearLevel, subjectList = ALL_DIAGNOSTIC_SUBJECTS) {
  if (!yearLevel) return []
  const lower = yearLevel.toLowerCase()
  if (lower.includes('stage 2') || lower.includes('year 12')) return subjectList.filter(s => s.yearGroups.includes('stage2'))
  if (lower.includes('stage 1') || lower.includes('year 11')) return subjectList.filter(s => s.yearGroups.includes('stage1'))
  if (['year 7', 'year 8', 'year 9', 'year 10'].some(y => lower.includes(y))) return subjectList.filter(s => s.yearGroups.includes('junior'))
  return subjectList.filter(s => s.yearGroups.includes('primary'))
}

function curriculumToYearGroups(level_label) {
  const l = (level_label || '').toLowerCase()
  if (l.includes('stage 2') || l.includes('year 12')) return ['stage2']
  if (l.includes('stage 1') || l.includes('year 11')) return ['stage1']
  if (['year 7', 'year 8', 'year 9', 'year 10'].some(y => l.includes(y))) return ['junior']
  return ['junior']
}

function DiagnosticTab({ profile, theme }) {
  const t = THEMES[theme]

  // ── Dynamic subjects from DB (merged with static fallback) ──
  const [mergedSubjects, setMergedSubjects] = useState(ALL_DIAGNOSTIC_SUBJECTS)
  useEffect(() => {
    let cancelled = false
    fetchLiveCurricula()
      .then(curricula => {
        if (cancelled) return
        const builtInNames = new Set(ALL_DIAGNOSTIC_SUBJECTS.map(s => s.name.toLowerCase()))
        const dynamic = curricula
          .filter(c => !builtInNames.has(c.name.toLowerCase()))
          .map(c => ({
            id: `db_${c.id}`,
            name: c.name,
            yearGroups: curriculumToYearGroups(c.level_label),
            topics: [],
            isWriting: false,
          }))
        setMergedSubjects([...ALL_DIAGNOSTIC_SUBJECTS, ...dynamic])
      })
      .catch(() => { /* fall back to static list already set */ })
    return () => { cancelled = true }
  }, [])

  // ── Form state ──
  const [step, setStep] = useState('form')  // form | preview | created | list | report
  const [yearLevel, setYearLevel] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedTopics, setSelectedTopics] = useState([])
  const [writingType, setWritingType] = useState('paragraph')
  const [studentName, setStudentName] = useState('')
  const [preCallFormUrl, setPreCallFormUrl] = useState('')

  // ── Generated data ──
  const [generating, setGenerating]   = useState(false)
  const [genError, setGenError]       = useState('')
  const [questions, setQuestions]     = useState([])
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState('')
  const [createdLink, setCreatedLink] = useState('')
  const [copied, setCopied]           = useState(false)

  // ── Past diagnostics list ──
  const [diagnostics, setDiagnostics] = useState([])
  const [listLoading, setListLoading] = useState(false)

  // ── Report panel ──
  const [reportData, setReportData]   = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')

  const availableSubjects = getSubjectsForYearLevel(yearLevel, mergedSubjects)
  const selectedSubject = availableSubjects.find(s => s.id === selectedSubjectId)

  const loadList = useCallback(async () => {
    setListLoading(true)
    try {
      const json = await fetchDiagnosticAssessments()
      setDiagnostics(json.assessments || [])
    } catch {}
    setListLoading(false)
  }, [])

  useEffect(() => { loadList() }, [loadList])

  const toggleTopic = (topic) => {
    setSelectedTopics(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    )
  }

  const handleGenerate = async () => {
    setGenError('')
    if (!yearLevel) { setGenError('Please select a year level.'); return }
    if (!selectedSubjectId) { setGenError('Please select a subject.'); return }
    if (selectedTopics.length === 0) { setGenError('Please select at least one topic.'); return }

    const subjectConfig = {
      name: selectedSubject.name,
      topics: selectedTopics,
      ...(selectedSubject.isWriting ? { writingType } : {}),
    }

    setGenerating(true)
    try {
      const json = await generateDiagnosticQuestions({ yearLevel, subjects: [subjectConfig] })
      setQuestions(json.questions || [])
      setStep('preview')
    } catch (err) {
      setGenError(err.message || 'Generation failed. Please try again.')
    }
    setGenerating(false)
  }

  const handleCreate = async () => {
    setSaveError('')
    setSaving(true)
    const subjectConfig = {
      name: selectedSubject.name,
      topics: selectedTopics,
      ...(selectedSubject.isWriting ? { writingType } : {}),
    }
    try {
      const json = await createDiagnosticAssessment({
        yearLevel,
        subjects: [subjectConfig],
        questions,
        studentName: studentName.trim() || null,
        preCallFormUrl: preCallFormUrl.trim() || null,
      })
      setCreatedLink(json.link)
      setStep('created')
      await loadList()
    } catch (err) {
      setSaveError(err.message || 'Failed to save assessment.')
    }
    setSaving(false)
  }

  const handleCopy = async (link) => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const handleViewReport = async (assessment) => {
    setReportError('')
    setReportData(null)
    setReportLoading(true)
    setStep('report')
    try {
      const json = await fetchDiagnosticReport(assessment.id)
      setReportData(json)
    } catch (err) {
      setReportError(err.message || 'Failed to load report.')
    }
    setReportLoading(false)
  }

  const resetForm = () => {
    setStep('form')
    setYearLevel('')
    setSelectedSubjectId('')
    setSelectedTopics([])
    setWritingType('paragraph')
    setStudentName('')
    setPreCallFormUrl('')
    setQuestions([])
    setCreatedLink('')
    setGenError('')
    setSaveError('')
  }

  const card = theme === 'dark'
    ? { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, overflow: 'hidden', marginBottom: 18 }
    : { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 18, overflow: 'hidden', marginBottom: 18, boxShadow: t.shadowCard }
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 9, border: theme === 'dark' ? '1px solid rgba(255,255,255,0.10)' : `1px solid ${t.border}`, background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : t.bg, color: t.text, fontFamily: FONT_B, fontSize: 13, outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { fontSize: 12, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }
  const sectionHdr = { padding: '14px 20px', borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.07)' : t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }

  // Difficulty totals for preview
  const easyMarks = questions.filter(q => q.difficulty === 'easy').reduce((s, q) => s + q.marks, 0)
  const modMarks  = questions.filter(q => q.difficulty === 'moderate').reduce((s, q) => s + q.marks, 0)
  const examMarks = questions.filter(q => q.difficulty === 'exam').reduce((s, q) => s + q.marks, 0)
  const totalMarks = questions.reduce((s, q) => s + q.marks, 0)

  return (
    <div>
      {/* ── Tab sub-nav ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { key: 'form',    label: '+ New Assessment' },
          { key: 'list',    label: `Past Diagnostics (${diagnostics.length})` },
        ].map(btn => (
          <button
            key={btn.key}
            onClick={() => { if (btn.key === 'form') resetForm(); else setStep('list') }}
            style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${(step === btn.key || (step === 'preview' && btn.key === 'form') || (step === 'created' && btn.key === 'form')) ? GOLD : t.border}`, background: (step === btn.key || (step === 'preview' && btn.key === 'form') || (step === 'created' && btn.key === 'form')) ? 'rgba(241,190,67,0.1)' : 'transparent', color: (step === btn.key || (step === 'preview' && btn.key === 'form') || (step === 'created' && btn.key === 'form')) ? t.goldText : t.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* ── Step: Form ── */}
      {step === 'form' && (
        <div>
          <div style={card}>
            <div style={sectionHdr}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 400, fontFamily: "'Sifonn Pro', sans-serif", letterSpacing: '0.04em', color: t.text }}>Generate Diagnostic Assessment</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>AI creates a 30-mark test tailored to your student's level and topics</div>
              </div>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Year level */}
              <div>
                <label style={labelStyle}>Year Level</label>
                <select className="td-input-gold" value={yearLevel} onChange={e => { setYearLevel(e.target.value); setSelectedSubjectId(''); setSelectedTopics([]) }} style={inputStyle}>
                  <option value="">Select year level…</option>
                  {YEAR_LEVEL_GROUPS.map(g => (
                    <optgroup key={g.label} label={g.label}>
                      {g.levels.map(y => <option key={y} value={y}>{y}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Subject */}
              <div>
                <label style={labelStyle}>Subject</label>
                <select className="td-input-gold" value={selectedSubjectId} onChange={e => { setSelectedSubjectId(e.target.value); setSelectedTopics([]) }} style={inputStyle} disabled={!yearLevel}>
                  <option value="">{yearLevel ? 'Select subject…' : 'Select a year level first…'}</option>
                  {availableSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Topics */}
              {selectedSubject && (
                <div>
                  <label style={labelStyle}>Topics / Subtopics <span style={{ color: t.textFaint, fontWeight: 400, textTransform: 'none' }}>— select all that apply</span></label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {selectedSubject.topics.map(topic => {
                      const sel = selectedTopics.includes(topic)
                      return (
                        <button
                          key={topic}
                          onClick={() => toggleTopic(topic)}
                          style={{ padding: '6px 13px', borderRadius: 20, border: `1px solid ${sel ? GOLD : t.border}`, background: sel ? 'rgba(241,190,67,0.12)' : 'transparent', color: sel ? t.goldText : t.textMuted, fontSize: 12, fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B, transition: 'all 0.15s' }}
                        >
                          {topic}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Writing type — only for English/writing subjects */}
              {selectedSubject?.isWriting && (
                <div>
                  <label style={labelStyle}>Writing Task Type <span style={{ fontWeight: 400, textTransform: 'none', color: t.textFaint }}>(Section C exam task)</span></label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[
                      { value: 'paragraph', label: 'Paragraph / Short Response', desc: 'Structured paragraph or short analytical response (suited to Year 7–10)' },
                      { value: 'essay',     label: 'Essay',     desc: 'Full analytical or creative essay with intro, body, conclusion (suited to Stage 1–2)' },
                    ].map(opt => {
                      const sel = writingType === opt.value
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setWritingType(opt.value)}
                          style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: `2px solid ${sel ? GOLD : t.border}`, background: sel ? 'rgba(241,190,67,0.1)' : 'transparent', color: t.text, cursor: 'pointer', fontFamily: FONT_B, textAlign: 'left' }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: sel ? GOLD : t.text, marginBottom: 2 }}>{opt.label}</div>
                          <div style={{ fontSize: 11, color: t.textMuted }}>{opt.desc}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Optional student name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Student Name <span style={{ fontWeight: 400, textTransform: 'none', color: t.textFaint }}>(optional)</span></label>
                  <input className="td-input-gold" value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="e.g. Sarah Jones" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Pre-Call Questionnaire URL <span style={{ fontWeight: 400, textTransform: 'none', color: t.textFaint }}>(optional)</span></label>
                  <input className="td-input-gold" value={preCallFormUrl} onChange={e => setPreCallFormUrl(e.target.value)} placeholder="https://forms.google.com/…" style={inputStyle} />
                  <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>Student is redirected here after completing the test</div>
                </div>
              </div>

              {genError && <div style={{ fontSize: 13, color: t.danger, padding: '10px 14px', borderRadius: 8, background: t.dangerBg, border: `1px solid ${t.danger}40` }}>{genError}</div>}

              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: generating ? t.border : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: generating ? t.textMuted : '#0c1037', fontSize: 14, fontWeight: 800, cursor: generating ? 'not-allowed' : 'pointer', fontFamily: FONT_B, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 10 }}
              >
                {generating ? <><Bot size={17} aria-hidden="true" /> Generating questions… <span style={{ opacity: 0.6 }}>(30–60 sec)</span></> : <><Bot size={17} aria-hidden="true" /> Generate Assessment</>}
              </button>
            </div>
          </div>

          {/* How it works */}
          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>How it works</div>
            </div>
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 16 }}>
              {[
                { icon: Bot, title: '30-Mark AI Test', desc: '10 easy + 10 moderate + 10 exam-style marks, tailored to the selected year level and topics' },
                { icon: Link, title: 'Unique Link', desc: "Copy and share the link with the student's parent — the test runs entirely in the browser" },
                { icon: ChartColumn, title: 'Auto-Marked by AI', desc: 'As soon as the student submits, AI marks every question and generates a diagnostic report' },
                { icon: ClipboardList, title: 'Report to Tutor', desc: 'Pain points, patterns and recommendations appear here in the tutor portal for your review' },
              ].map(item => (
                <div key={item.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ flexShrink: 0, display: 'flex' }}><item.icon size={22} aria-hidden="true" /></div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 3 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step: Preview ── */}
      {step === 'preview' && questions.length > 0 && (
        <div>
          <div style={card}>
            <div style={sectionHdr}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Preview Generated Questions</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>{questions.length} questions · {totalMarks} marks</div>
              </div>
              <button onClick={resetForm} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>
                ← Regenerate
              </button>
            </div>

            {/* Mark summary */}
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[
                { label: 'Section A — Foundation', marks: easyMarks, color: t.success },
                { label: 'Section B — Core Skills', marks: modMarks,  color: GOLD },
                { label: 'Section C — Exam Style', marks: examMarks, color: t.danger },
                { label: 'TOTAL', marks: totalMarks, color: t.text },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: t.textMuted }}>{s.label}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.marks}</span>
                </div>
              ))}
            </div>

            {/* Questions list */}
            <div style={{ maxHeight: 440, overflowY: 'auto' }}>
              {questions.map((q, i) => {
                const dc = q.difficulty === 'easy' ? t.success : q.difficulty === 'moderate' ? GOLD : t.danger
                return (
                  <div key={q.id} style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: `${dc}15`, border: `1px solid ${dc}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: dc, flexShrink: 0 }}>
                      Q{i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, border: `1px solid ${dc}30`, background: `${dc}10`, color: dc, fontWeight: 700 }}>{DIFF_LABEL[q.difficulty] || q.difficulty}</span>
                        <span style={{ fontSize: 11, color: t.textMuted }}>{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                        <span style={{ fontSize: 11, color: t.textFaint }}>{q.topic}{q.subtopic ? ` · ${q.subtopic}` : ''}</span>
                        <span style={{ fontSize: 11, color: t.textFaint, marginLeft: 'auto' }}>{q.type?.replace(/_/g, ' ')}</span>
                      </div>
                      <div style={{ fontSize: 13, color: t.text, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}><MathText text={q.question} style={{ whiteSpace: 'pre-wrap' }} /></div>
                      {q.options && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {q.options.map(opt => (
                            <div key={opt} style={{ fontSize: 12, color: opt.startsWith(q.correct_answer) ? t.success : t.textMuted, paddingLeft: 4 }}>
                              {opt.startsWith(q.correct_answer) ? '✓ ' : '   '}<MathText text={opt} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Save form */}
          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Create Assessment & Get Link</div>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Student Name <span style={{ fontWeight: 400, textTransform: 'none', color: t.textFaint }}>(optional)</span></label>
                  <input className="td-input-gold" value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="e.g. Sarah Jones" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Pre-Call Questionnaire URL <span style={{ fontWeight: 400, textTransform: 'none', color: t.textFaint }}>(optional)</span></label>
                  <input className="td-input-gold" value={preCallFormUrl} onChange={e => setPreCallFormUrl(e.target.value)} placeholder="https://forms.google.com/…" style={inputStyle} />
                </div>
              </div>
              {saveError && <div style={{ fontSize: 13, color: t.danger }}>{saveError}</div>}
              <button onClick={handleCreate} disabled={saving}
                style={{ padding: '11px 24px', borderRadius: 9, border: 'none', background: saving ? t.border : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: saving ? t.textMuted : '#0c1037', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: FONT_B, alignSelf: 'flex-start' }}>
                {saving ? 'Creating…' : <><CircleCheck size={15} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />Create & Get Student Link</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step: Created ── */}
      {step === 'created' && createdLink && (
        <div style={card}>
          <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: t.successBg, border: `1px solid ${t.success}4d`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><CircleCheck size={24} color={t.success} aria-hidden="true" /></div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: t.text }}>Assessment Created!</div>
                <div style={{ fontSize: 13, color: t.textMuted }}>Share this link with the student or parent</div>
              </div>
            </div>

            <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: GOLD, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{createdLink}</div>
              <button
                onClick={() => handleCopy(createdLink)}
                style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${copied ? t.success : t.border}`, background: copied ? t.successBg : 'transparent', color: copied ? t.success : t.textMuted, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, flexShrink: 0 }}
              >
                {copied ? '✓ Copied!' : 'Copy Link'}
              </button>
            </div>

            <div style={{ background: 'rgba(241,190,67,0.08)', border: '1px solid rgba(241,190,67,0.2)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 6 }}>What happens next?</div>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <li style={{ fontSize: 13, color: t.textMuted }}>Send the link to the student or parent</li>
                <li style={{ fontSize: 13, color: t.textMuted }}>The student opens the link and completes the test at their own pace</li>
                <li style={{ fontSize: 13, color: t.textMuted }}>AI marks the assessment automatically on submission</li>
                <li style={{ fontSize: 13, color: t.textMuted }}>The full report appears here in your tutor portal</li>
                {preCallFormUrl && <li style={{ fontSize: 13, color: t.textMuted }}>After submission, the student is redirected to your pre-call questionnaire</li>}
              </ol>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={resetForm} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: '#0c1037', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
                + New Assessment
              </button>
              <button onClick={() => setStep('list')} style={{ padding: '10px 20px', borderRadius: 9, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 13, cursor: 'pointer', fontFamily: FONT_B }}>
                View All Diagnostics
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step: List ── */}
      {step === 'list' && (
        <div style={card}>
          <div style={{ ...sectionHdr }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Past Diagnostics</div>
            <button onClick={loadList} style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Refresh</button>
          </div>
          {listLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Loading…</div>
          ) : diagnostics.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No diagnostic assessments yet. Create one to get started.</div>
          ) : (
            <div>
              {diagnostics.map(d => {
                const completed = d.status === 'completed'
                const subjectNames = (d.subjects || []).map(s => s.name).join(', ')
                return (
                  <div key={d.id} style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{d.year_level} · {subjectNames}</span>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, border: `1px solid ${completed ? `${t.success}59` : 'rgba(241,190,67,0.35)'}`, background: completed ? t.successBg : 'rgba(241,190,67,0.1)', color: completed ? t.success : t.goldText, fontWeight: 700 }}>
                          {completed ? 'Completed' : 'Pending'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: t.textMuted }}>
                        {d.submitted_by_name || d.student_name || 'No name yet'}
                        {d.set_by ? ` · Set by ${d.set_by}` : ''}
                        {completed && d.score_total != null ? ` · Score: ${d.score_total}/${d.score_max}` : ''}
                        {` · Created ${fmtDate(d.created_at)}`}
                        {completed && d.completed_at ? ` · Submitted ${fmtDate(d.completed_at)}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => handleCopy(d.link)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>
                        Copy Link
                      </button>
                      {completed && (
                        <button onClick={() => handleViewReport(d)} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: '#0c1037', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
                          View Report
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Step: Report ── */}
      {step === 'report' && (
        <div>
          <button onClick={() => setStep('list')} style={{ marginBottom: 16, padding: '8px 16px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 13, cursor: 'pointer', fontFamily: FONT_B }}>
            ← Back to list
          </button>
          {reportLoading && <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Loading report…</div>}
          {reportError && <div style={{ fontSize: 13, color: t.danger, padding: '12px 16px', borderRadius: 8, background: t.dangerBg, border: `1px solid ${t.danger}40` }}>{reportError}</div>}
          {reportData?.report && (() => {
            const r = reportData.report
            const a = reportData.assessment
            const pct = r.percentage
            const bandColors = { Outstanding: t.success, High: GOLD, Satisfactory: t.blue, Developing: '#fbbf24', Beginning: t.danger }
            const bc = bandColors[r.performance_band] || GOLD
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Header */}
                <div style={card}>
                  <div style={{ padding: '20px 24px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: t.text, marginBottom: 4 }}>
                        {a.submitted_by_name || a.student_name || 'Student'} — Diagnostic Report
                      </div>
                      <div style={{ fontSize: 13, color: t.textMuted }}>{a.year_level} · {(a.subjects || []).map(s => s.name).join(', ')} · {fmtDate(a.completed_at)}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 32, fontWeight: 900, color: t.text }}>{r.total_score}<span style={{ fontSize: 18, color: t.textMuted }}>/{r.max_score}</span></div>
                      <div style={{ fontSize: 13, color: t.textMuted }}>{pct}%</div>
                      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, border: `1px solid ${bc}40`, background: `${bc}15`, color: bc, fontWeight: 700 }}>{r.performance_band}</span>
                    </div>
                  </div>
                </div>

                {/* Section breakdown */}
                <div style={card}>
                  <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Section Scores</div>
                  </div>
                  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { label: 'Section A — Foundation', score: r.easy_score, max: r.easy_max, color: t.success },
                      { label: 'Section B — Core Skills', score: r.moderate_score, max: r.moderate_max, color: GOLD },
                      { label: 'Section C — Exam Style', score: r.exam_score, max: r.exam_max, color: t.danger },
                    ].filter(s => s.max > 0).map(s => (
                      <div key={s.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>{s.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.score}/{s.max}</span>
                        </div>
                        <div style={{ height: 7, borderRadius: 4, background: t.border, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${s.max > 0 ? (s.score / s.max) * 100 : 0}%`, background: s.color, borderRadius: 4 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Topic breakdown */}
                {r.topic_breakdown?.length > 0 && (
                  <div style={card}>
                    <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Topic Breakdown</div>
                    </div>
                    <div>
                      {r.topic_breakdown.map(tb => {
                        const pct = tb.percentage
                        const c = pct >= 75 ? t.success : pct >= 50 ? GOLD : t.danger
                        return (
                          <div key={tb.topic} style={{ padding: '11px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ flex: 1, fontSize: 13, color: t.text }}>{tb.topic}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{tb.marks_awarded}/{tb.marks_possible}</div>
                            <div style={{ width: 60, height: 6, borderRadius: 3, background: t.border, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: 3 }} />
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: c, width: 36, textAlign: 'right' }}>{pct}%</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* AI Report sections */}
                {[
                  { key: 'pain_points',     label: 'Pain Points',        icon: Zap,         color: t.danger,  items: r.pain_points },
                  { key: 'patterns',        label: 'Patterns Observed',  icon: Search,      color: GOLD,      items: r.patterns },
                  { key: 'recommendations', label: 'Recommendations',    icon: CircleCheck, color: t.success, items: r.recommendations },
                ].filter(s => s.items?.length > 0).map(section => (
                  <div key={section.key} style={card}>
                    <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: t.text, display: 'flex', alignItems: 'center', gap: 8 }}><section.icon size={16} color={section.color} aria-hidden="true" />{section.label}</div>
                    </div>
                    <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {section.items.map((item, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: section.color, flexShrink: 0, marginTop: 6 }} />
                          <div style={{ fontSize: 13, color: t.text, lineHeight: 1.55 }}>{item}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Summary */}
                {r.summary && (
                  <div style={card}>
                    <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: t.text, display: 'flex', alignItems: 'center', gap: 8 }}><PenLine size={16} aria-hidden="true" />Tutor Summary</div>
                    </div>
                    <div style={{ padding: '14px 20px', fontSize: 13, color: t.text, lineHeight: 1.65 }}>{r.summary}</div>
                  </div>
                )}

                {/* Every question in full: what was asked, the student's answer, the answer, feedback */}
                {r.question_results?.length > 0 && (
                  <div style={card}>
                    <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Questions and Answers</div>
                    </div>
                    <div>
                      {r.question_results.map(qr => {
                        const q = (a.questions || []).find(x => String(x.id) === String(qr.id))
                        const full = qr.marks_awarded === qr.marks_possible
                        const partial = !full && qr.marks_awarded > 0
                        const col = full ? t.success : partial ? GOLD : t.danger
                        const studentAnswer = qr.student_answer || a.student_answers?.[String(qr.id)] || ''
                        const correctAnswer = q?.correct_answer ?? qr.correct_answer
                        const isMcq = q?.type === 'multiple_choice' && q.options?.length > 0
                        const label = { fontSize: 11, fontWeight: 700, color: t.textFaint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
                        const answerBox = (c) => ({ fontSize: 13, color: t.text, lineHeight: 1.55, padding: '8px 12px', borderRadius: 8, background: `${c}10`, border: `1px solid ${c}30`, whiteSpace: 'pre-wrap', overflowX: 'auto' })
                        return (
                          <div key={qr.id} style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: `${col}15`, border: `1px solid ${col}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: col, flexShrink: 0 }}>
                              Q{qr.id}
                            </div>
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: col }}>{qr.marks_awarded}/{qr.marks_possible} marks</span>
                                {q && <span style={{ fontSize: 11, color: t.textFaint }}>{[DIFF_LABEL[q.difficulty], q.topic, q.subtopic].filter(Boolean).join(' · ')}</span>}
                              </div>
                              {q?.question && <div style={{ fontSize: 14, color: t.text, lineHeight: 1.6 }}><MathText text={q.question} /></div>}
                              {isMcq ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {q.options.map((opt, i) => {
                                    const letter = String.fromCharCode(65 + i)
                                    const picked = studentAnswer.trim().toUpperCase() === letter
                                    const right = String(correctAnswer).trim().toUpperCase() === letter
                                    const c = right ? t.success : picked ? t.danger : t.border
                                    return (
                                      <div key={letter} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 12px', borderRadius: 8, border: `1px solid ${right || picked ? `${c}60` : t.border}`, background: right || picked ? `${c}12` : 'transparent', fontSize: 13, color: t.text }}>
                                        <span style={{ fontWeight: 800, color: right ? t.success : picked ? t.danger : t.textMuted }}>{letter}</span>
                                        <span style={{ flex: 1, minWidth: 0 }}><MathText text={opt.replace(/^[A-D]\.\s*/, '')} /></span>
                                        {(right || picked) && <span style={{ fontSize: 11, fontWeight: 700, color: c, whiteSpace: 'nowrap' }}>{right && picked ? 'Correct, their answer' : right ? 'Correct answer' : 'Their answer'}</span>}
                                      </div>
                                    )
                                  })}
                                  {!studentAnswer && <div style={{ fontSize: 12, color: t.textFaint }}>Not answered</div>}
                                </div>
                              ) : (
                                <>
                                  <div>
                                    <div style={label}>Student's answer</div>
                                    {studentAnswer
                                      ? <div style={answerBox(col)}><MathText text={asMath(studentAnswer)} /></div>
                                      : <div style={{ fontSize: 12, color: t.textFaint }}>Not answered</div>}
                                  </div>
                                  {correctAnswer && (
                                    <div>
                                      <div style={label}>Model answer</div>
                                      <div style={answerBox(t.success)}><MathText text={correctAnswer} /></div>
                                    </div>
                                  )}
                                </>
                              )}
                              {qr.feedback && (
                                <div>
                                  <div style={label}>Feedback</div>
                                  <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}><MathText text={qr.feedback} /></div>
                                </div>
                              )}
                              {q?.solution_notes && (
                                <div>
                                  <div style={label}>Solution notes</div>
                                  <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}><MathText text={q.solution_notes} /></div>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

const DIFF_LABEL = { easy: 'Foundation', moderate: 'Core', exam: 'Exam Style' }

// A maths answer is the bare LaTeX the MathLive answer box gives (\frac{1}{2},
// x^{2}, a_{n}); wrap it so MathText renders it as maths. Prose and answers
// already written with $…$ are left alone.
function asMath(answer) {
  return !answer.includes('$') && /\\|\^|_\{/.test(answer) ? `$${answer}$` : answer
}

// ── Main TutorScreen — sidebar shell ───────────────────────────────────────────
const NAV_GROUPS = [
  { label: 'Main', items: [
    { id: 'overview',    label: 'Overview',    icon: LayoutDashboard },
    { id: 'students',    label: 'Students',    icon: Users },
    { id: 'classes',     label: 'Classes',     icon: School },
    { id: 'messages',    label: 'Messages',    icon: MessageSquare },
  ]},
  { label: 'Teaching', items: [
    { id: 'assignments', label: 'Assignments', icon: ClipboardList },
    { id: 'sessions',    label: 'Sessions',    icon: Video },
    { id: 'resources',   label: 'Resources',   icon: Folder },
  ]},
  { label: 'Insights', items: [
    { id: 'progress',    label: 'Progress',    icon: ChartColumn },
    { id: 'diagnostic',  label: 'Diagnostic',  icon: FlaskConical },
  ]},
  { label: 'You', items: [
    { id: 'profile',     label: 'My Profile',  icon: IdCard },
    { id: 'plan',        label: 'Plan & billing', icon: CreditCard },
  ]},
]
const SECTION_META = {
  overview:    { title: 'Overview',    sub: "Welcome back — here's what needs you today." },
  students:    { title: 'Students',    sub: 'Your roster, performance & open tasks at a glance.' },
  classes:     { title: 'Classes',     sub: 'Group students for assignments & sessions.' },
  assignments: { title: 'Assignments', sub: 'Create, batch-assign and track work.' },
  sessions:    { title: 'Sessions',    sub: 'Live video lessons — one-off & recurring.' },
  resources:   { title: 'Resources',   sub: 'Notes, files & class recordings.' },
  progress:    { title: 'Progress',    sub: 'Per-student analytics & reports.' },
  diagnostic:  { title: 'Diagnostic',  sub: 'AI-built diagnostic assessments.' },
  messages:    { title: 'Messages',    sub: 'Conversations with your students.' },
  profile:     { title: 'My Profile',  sub: 'What your students see about you.' },
  plan:        { title: 'Plan & billing', sub: 'Your tutor plan, student limit and payments.' },
}

export default function TutorScreen({ profile, theme, subject }) {
  const t = THEMES[theme]
  const navigate = useNavigate()
  // ?tab=messages (from message emails) opens a tab directly.
  const [activeTab, setActiveTab] = useState(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    return tab && SECTION_META[tab] ? tab : 'overview'
  })
  const [collapsed, setCollapsed] = useState(false)
  const [mobileSearch, setMobileSearch] = useState(false)
  const activeMobileTab = useRef(null)
  // An assignment report open over the portal. ?report=<id> (from the
  // "assignment finished" email) opens one directly.
  const [reportId, setReportId] = useState(() => new URLSearchParams(window.location.search).get('report'))

  // Admins (managers) can switch the portal between their own students and
  // every tutor's. Remembered per browser.
  const isAdmin = !!profile.is_admin
  const [allTutors, setAllTutorsState] = useState(() => {
    try { return isAdmin && localStorage.getItem('gf-tutor-scope') === 'all' } catch { return false }
  })
  const setAllTutors = (v) => {
    setAllTutorsState(v)
    try { localStorage.setItem('gf-tutor-scope', v ? 'all' : 'mine') } catch {}
  }

  // Shell-level data — powers Overview, the global search and sidebar badges.
  const [roster, setRoster] = useState([])
  const [classes, setClasses] = useState([])
  const [assignments, setAssignments] = useState([])
  const [resources, setResources] = useState([])
  const [sessions, setSessions] = useState([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchRoster(profile.id, { allTutors }).catch(() => []),
      fetchTutorClasses({ allTutors }).catch(() => []),
      fetchAssignmentsForTutor(profile.id, { allTutors }).catch(() => []),
      fetchTutorResources().catch(() => []),
      fetchTutoringSessions({ limit: 50 }).catch(() => []),
    ]).then(([r, c, a, res, s]) => {
      if (cancelled) return
      setRoster(r); setClasses(c); setAssignments(a); setResources(res); setSessions(s || [])
    })
    return () => { cancelled = true }
  }, [profile.id, allTutors])

  const overdueCount = useMemo(
    () => assignments.filter(a => !a.completed_at && a.due_date && new Date(a.due_date).setHours(23,59,59,999) < Date.now()).length,
    [assignments],
  )
  // Unread student messages, refreshed every minute and when a conversation changes.
  const [unreadMessages, setUnreadMessages] = useState(0)
  useEffect(() => {
    let cancelled = false
    const refresh = () => { fetchUnreadMessageCount().then(n => { if (!cancelled) setUnreadMessages(n) }).catch(() => {}) }
    refresh()
    const id = setInterval(refresh, 60_000)
    window.addEventListener('gf-messages-changed', refresh)
    return () => { cancelled = true; clearInterval(id); window.removeEventListener('gf-messages-changed', refresh) }
  }, [])

  const badges = { students: roster.length || null, assignments: overdueCount || null, messages: unreadMessages || null }

  const go = (id) => { setActiveTab(id); setMobileSearch(false) }

  // Phones: keep the selected tab visible in the swipeable tab strip.
  useEffect(() => {
    activeMobileTab.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [activeTab])

  const SIDEBAR_W = collapsed ? 74 : 224
  const meta = SECTION_META[activeTab] || { title: '', sub: '' }

  const isDark      = theme === 'dark'
  const sidebarBg   = isDark ? '#07091e' : '#f8f9fc'
  const sidebarBdr  = isDark ? 'rgba(255,255,255,0.07)' : '#e2e6ed'
  const headerBg    = isDark ? 'rgba(6,7,26,0.92)' : 'rgba(255,255,255,0.90)'
  const headerBdr   = isDark ? 'rgba(255,255,255,0.07)' : '#e2e6ed'
  const navGroupLbl = isDark ? 'rgba(255,255,255,0.22)' : '#94a3b8'
  const navItemDflt = isDark ? 'rgba(255,255,255,0.52)' : '#64748b'
  const navAccent   = isDark ? GOLD : '#0f172a'
  // Layout is identical in both themes; only these colours change.
  const goldText    = t.goldText

  const sidebar = (
    <aside className={isDark ? '' : 'td-sidebar-light'} style={{
      width: SIDEBAR_W, flexShrink: 0,
      background: isDark
        ? 'linear-gradient(180deg, #08091f 0%, #070918 100%)'
        : sidebarBg,
      borderRight: `1px solid ${sidebarBdr}`,
      display: 'flex', flexDirection: 'column', height: '100%', transition: 'width 0.18s',
      boxShadow: isDark ? '4px 0 24px rgba(0,0,0,0.28)' : 'none',
    }}>
      {/* Portal label. The app sidebar beside this one already shows the
          gradefarm logo, so it isn't repeated here. */}
      <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? '0 12px' : '0 20px', borderBottom: `1px solid ${sidebarBdr}` }}>
        <div title={collapsed ? 'Tutor Portal' : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: isDark ? 'rgba(241,190,67,0.12)' : 'rgba(241,190,67,0.16)', border: `1px solid ${isDark ? 'rgba(241,190,67,0.28)' : 'rgba(241,190,67,0.45)'}`, borderRadius: 30, padding: collapsed ? '6px' : '6px 14px' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, boxShadow: isDark ? '0 0 8px rgba(241,190,67,0.9)' : 'none', flexShrink: 0 }} />
          {!collapsed && <span style={{ fontFamily: FONT_D, fontSize: 10, letterSpacing: '0.18em', color: goldText, whiteSpace: 'nowrap' }}>TUTOR PORTAL</span>}
        </div>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
        {NAV_GROUPS.map(group => (
          <div key={group.label} style={{ marginTop: 14 }}>
            {!collapsed && (
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: navGroupLbl, padding: '4px 12px 6px' }}>{group.label}</div>
            )}
            {group.items.map(item => {
              const active = activeTab === item.id
              const badge = badges[item.id]
              return (
                <button key={item.id} onClick={() => go(item.id)} title={collapsed ? item.label : undefined}
                  className={`td-nav-item${active ? ' active' : ''}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                    padding: collapsed ? '11px 0' : '10px 14px',
                    justifyContent: collapsed ? 'center' : undefined,
                    margin: '1px 0', cursor: 'pointer',
                    fontFamily: FONT_B, fontSize: 13, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
                    color: active ? navAccent : navItemDflt,
                    background: 'transparent',
                  }}
                >
                  <span style={{ display: 'flex', flexShrink: 0, opacity: active ? 1 : 0.75 }}><item.icon size={17} aria-hidden="true" /></span>
                  {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                  {!collapsed && badge != null && (
                    <span style={{
                      background: item.id === 'assignments' ? 'rgba(248,113,113,0.18)' : item.id === 'messages' ? GOLD : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'),
                      color: item.id === 'assignments' ? '#f87171' : item.id === 'messages' ? '#0c1037' : (isDark ? t.textSub : '#64748b'),
                      fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '2px 7px',
                      border: item.id === 'assignments' ? '1px solid rgba(248,113,113,0.30)' : (isDark ? '1px solid rgba(255,255,255,0.10)' : '1px solid #cbd5e1'),
                    }}>{badge}</span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User profile footer */}
      <div style={{ padding: '10px 10px 12px', borderTop: `1px solid ${sidebarBdr}` }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 10px', borderRadius: 12,
          background: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : '#e2e6ed'}`,
          cursor: 'default',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: `linear-gradient(135deg,${GOLD},${GOLDL})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, color: '#0c1037', flexShrink: 0, fontSize: 14,
            boxShadow: isDark ? '0 0 14px rgba(241,190,67,0.35)' : 'none',
          }}>
            {(profile.display_name || '?')[0].toUpperCase()}
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: isDark ? 'rgba(255,255,255,0.92)' : '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name || 'Tutor'}</div>
              <div style={{ fontSize: 11, color: goldText, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tutor</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )

  return (
    <div
      className="td-root"
      style={{
        flex: 1, display: 'flex',
        background: theme === 'dark' ? '#06071a' : t.bg,
        backgroundImage: theme === 'dark'
          ? 'radial-gradient(ellipse 900px 700px at 85% -8%, rgba(241,190,67,0.055) 0%, transparent 55%), radial-gradient(ellipse 700px 600px at -5% 95%, rgba(99,102,241,0.05) 0%, transparent 60%)'
          : 'none',
        fontFamily: FONT_B, color: t.text, minHeight: 0,
      }}
    >
      <style>{`@font-face{font-family:'Sifonn Pro';src:url('/SIFONN_PRO.otf') format('opentype');font-display:swap;}`}</style>

      {/* Desktop sidebar */}
      <div className="tutor-desktop-sidebar" style={{ display: 'flex', height: '100vh', position: 'sticky', top: 0 }}>{sidebar}</div>

      {/* Main column. On phones the sidebar is replaced by a tab strip in the header. */}
      <div className="td-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Top bar */}
        <header className="td-header" style={{
          position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 14,
          padding: '0 24px',
          background: headerBg, backdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${headerBdr}`,
          minHeight: 64, height: 64,
        }}>
          <span className="td-header-sep" />
          <button className="td-collapse-btn" onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : '#e2e8f0'}`, background: isDark ? 'rgba(255,255,255,0.05)' : 'transparent', color: isDark ? 'rgba(255,255,255,0.5)' : '#94a3b8', cursor: 'pointer', fontSize: 14, flexShrink: 0, transition: 'background 0.12s' }}>☰</button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 18, fontFamily: FONT_D, fontWeight: 400, letterSpacing: '0.04em', color: isDark ? t.text : '#0f172a', lineHeight: 1.1 }}>{meta.title}</div>
            <div className="td-header-sub" style={{ fontSize: 11, color: isDark ? t.textMuted : '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3, letterSpacing: '0.02em' }}>{meta.sub}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {isAdmin && (
              <div role="group" aria-label="Whose students" style={{ display: 'flex', borderRadius: 8, border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0'}`, overflow: 'hidden', flexShrink: 0 }}>
                {[{ v: false, label: 'My students' }, { v: true, label: 'All tutors' }].map(opt => (
                  <button key={opt.label} onClick={() => setAllTutors(opt.v)} aria-pressed={allTutors === opt.v}
                    style={{ padding: '0 12px', height: 32, border: 'none', cursor: 'pointer', fontFamily: FONT_B, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                      background: allTutors === opt.v ? (isDark ? 'rgba(241,190,67,0.16)' : '#0f172a') : 'transparent',
                      color: allTutors === opt.v ? (isDark ? GOLD : '#fff') : (isDark ? 'rgba(255,255,255,0.55)' : '#64748b') }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            <div className="td-search-desktop">
              <GlobalSearch theme={theme} roster={roster} classes={classes} resources={resources} assignments={assignments} onNavigate={go} />
            </div>
            <button type="button" className="tutor-mobile-only" onClick={() => setMobileSearch(v => !v)} aria-label="Search" aria-pressed={mobileSearch}
              style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 9, cursor: 'pointer', display: 'flex',
                border: `1px solid ${mobileSearch ? GOLD : (isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0')}`, background: 'transparent', color: mobileSearch ? GOLD : (isDark ? 'rgba(255,255,255,0.6)' : '#64748b') }}>
              <Search size={16} aria-hidden="true" />
            </button>
          </div>
          {mobileSearch && (
            <div className="tutor-mobile-only" style={{ width: '100%' }}>
              <GlobalSearch theme={theme} roster={roster} classes={classes} resources={resources} assignments={assignments} onNavigate={go} width="100%" autoFocus />
            </div>
          )}
          {/* Phones: every section as a swipeable strip of tabs */}
          <nav className="tutor-mobile-only td-mobile-tabs" aria-label="Tutor portal sections">
            {NAV_GROUPS.flatMap(g => g.items).map(item => {
              const active = activeTab === item.id
              const badge = badges[item.id]
              return (
                <button key={item.id} type="button" ref={active ? activeMobileTab : undefined} onClick={() => go(item.id)} aria-current={active ? 'page' : undefined}
                  style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT_B, fontSize: 12.5, fontWeight: active ? 800 : 600, whiteSpace: 'nowrap',
                    border: `1px solid ${active ? 'rgba(241,190,67,0.55)' : (isDark ? 'rgba(255,255,255,0.10)' : '#e2e8f0')}`,
                    background: active ? (isDark ? 'rgba(241,190,67,0.16)' : '#0f172a') : 'transparent',
                    color: active ? (isDark ? GOLD : '#fff') : navItemDflt }}>
                  <item.icon size={14} aria-hidden="true" />
                  {item.label}
                  {badge != null && (
                    <span style={{ minWidth: 17, height: 17, padding: '0 5px', borderRadius: 9, fontSize: 10, fontWeight: 800, lineHeight: '17px', textAlign: 'center',
                      background: item.id === 'assignments' ? 'rgba(248,113,113,0.2)' : item.id === 'messages' ? GOLD : (isDark ? 'rgba(255,255,255,0.10)' : '#e2e8f0'),
                      color: item.id === 'assignments' ? '#f87171' : item.id === 'messages' ? '#0c1037' : (isDark ? t.textSub : '#64748b') }}>{badge}</span>
                  )}
                </button>
              )
            })}
          </nav>
        </header>

        {/* Section content */}
        <div className="td-content" style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 56px' }}>
          <div key={`${activeTab}-${allTutors ? 'all' : 'mine'}`} className="td-content-enter" style={{ maxWidth: 1320, width: '100%', margin: '0 auto' }}>
            {activeTab === 'overview'    && <OverviewTab    profile={profile} theme={theme} roster={roster} classes={classes} assignments={assignments} resources={resources} sessions={sessions} onNavigate={go} onJoinSession={(id) => navigate(`/session/${id}`)} />}
            {activeTab === 'students'    && <StudentsTab    profile={profile} theme={theme} allTutors={allTutors} />}
            {activeTab === 'classes'     && <ClassesTab     profile={profile} theme={theme} allTutors={allTutors} />}
            {activeTab === 'assignments' && <AssignmentsTab profile={profile} theme={theme} subject={subject} allTutors={allTutors} onOpenReport={setReportId} />}
            {activeTab === 'sessions'    && <SessionsTab    profile={profile} theme={theme} />}
            {activeTab === 'resources'   && <ResourcesTab   profile={profile} theme={theme} />}
            {activeTab === 'progress'    && <ProgressTab    profile={profile} theme={theme} allTutors={allTutors} onOpenReport={setReportId} />}
            {activeTab === 'diagnostic'  && <DiagnosticTab  profile={profile} theme={theme} />}
            {activeTab === 'messages'    && <MessagesView   theme={theme} emptyHint="Invite a student from the Students tab to start a conversation." />}
            {activeTab === 'profile'     && <TutorProfileTab profile={profile} theme={theme} />}
            {activeTab === 'plan'        && <TutorPlanTab theme={theme} />}
          </div>
        </div>
      </div>
      {reportId && <AssignmentReport assignmentId={reportId} theme={theme} onClose={() => setReportId(null)} />}
    </div>
  )
}

// ── Global search (students · classes · resources · assignments) ───────────────
function GlobalSearch({ theme, roster, classes, resources, assignments, onNavigate, width = 'min(320px, 46vw)', autoFocus = false }) {
  const t = THEMES[theme]
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return []
    const out = []
    for (const r of roster) {
      const name = r.profiles?.display_name || ''
      if (name.toLowerCase().includes(term)) out.push({ kind: 'Student', icon: User, label: name, to: 'students' })
    }
    for (const c of classes) {
      if ((c.name || '').toLowerCase().includes(term)) out.push({ kind: 'Class', icon: School, label: c.name, to: 'classes' })
    }
    for (const r of resources) {
      if ((r.title || '').toLowerCase().includes(term)) out.push({ kind: 'Resource', icon: Folder, label: r.title, to: 'resources' })
    }
    for (const a of assignments) {
      const lbl = `${a.type} — ${(a.topics || []).join(', ') || a.subject}`
      if (lbl.toLowerCase().includes(term)) out.push({ kind: 'Assignment', icon: ClipboardList, label: lbl, to: 'assignments' })
    }
    return out.slice(0, 12)
  }, [q, roster, classes, resources, assignments])

  return (
    <div ref={boxRef} style={{ position: 'relative', width }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : t.bgInput, border: `1px solid ${open ? GOLD : (theme === 'dark' ? 'rgba(255,255,255,0.10)' : t.border)}`, borderRadius: 10, padding: '8px 12px', transition: 'border-color 0.15s' }}>
        <Search size={14} color={t.textMuted} aria-hidden="true" style={{ flexShrink: 0 }} />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          autoFocus={autoFocus}
          placeholder="Search students, classes, resources…"
          style={{ border: 'none', background: 'transparent', outline: 'none', color: t.text, fontFamily: FONT_B, fontSize: 13, width: '100%' }}
        />
      </div>
      {open && q.trim() && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, left: 0, background: theme === 'dark' ? 'rgba(7,9,30,0.96)' : t.bgCard, border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : t.border}`, borderRadius: 12, boxShadow: theme === 'dark' ? '0 8px 32px rgba(0,0,0,0.6)' : t.shadowModal, overflow: 'hidden', zIndex: 30, maxHeight: 360, overflowY: 'auto', backdropFilter: 'blur(12px)' }}>
          {results.length === 0 ? (
            <div style={{ padding: '14px 16px', fontSize: 13, color: t.textMuted }}>No matches for “{q.trim()}”.</div>
          ) : results.map((r, i) => (
            <button key={i} onClick={() => { onNavigate(r.to); setOpen(false); setQ('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.07)' : t.border}`, background: 'transparent', cursor: 'pointer', fontFamily: FONT_B }}
              onMouseEnter={e => e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.04)' : t.bgHover}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ display: 'flex', flexShrink: 0, color: t.textMuted }}><r.icon size={16} aria-hidden="true" /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: t.textMuted, letterSpacing: '0.05em' }}>{r.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
