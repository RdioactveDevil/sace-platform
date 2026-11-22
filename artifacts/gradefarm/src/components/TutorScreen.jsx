import { confirmDialog } from '../lib/dialog'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, School, ClipboardList, Video, Folder, ChartColumn, FlaskConical, Mail, Flame, Bot, Link, CircleCheck, Zap, Search, PenLine, Bell, User, MessageSquare, IdCard, CreditCard, Repeat, Pause, Play } from 'lucide-react'
import SessionsTab from './SessionsTab'
import ResourcesTab from './ResourcesTab'
import StudentsTab from './StudentsTab'
import { useTestScope, TestScopeFields, TestQuestionList, DIFF_LABEL } from './TestBuilder'
import TutorToday from './TutorToday'
import { reportPortalBadges } from '../lib/portalNav'
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
  resendDiagnostic,
  cancelDiagnostic,
  cancelConsultation,
  fetchBookingSettings,
  fetchDiagnosticAssessments,
  fetchDiagnosticReport,
  fetchQuestionnaire,
  fetchTutorResources,
  fetchTutoringSessions,
  fetchUnreadMessageCount,
} from '../lib/db'
import { loadCurriculumMacroGroups } from '../lib/curriculaDb'
import { statusChip, questionnaireChip } from '../lib/diagnosticStatus'
import { QuestionnaireTab, QuestionnaireSection, QuestionnaireAnswers } from './QuestionnaireBlocks'
import { ASSIGNMENT_DIFFICULTIES, assignmentGoalLabel } from '../lib/engine'
import { WEEKDAYS, defaultDueDays, describeDue, describeRepeat, localYmd } from '../lib/recurring'
import SegmentedToggle from './SegmentedToggle'
import ConsultationModal from './ConsultationModal'
import SignUpModal from './SignUpModal'
import SendTestModal from './SendTestModal'
import { testSentSummary } from '../lib/newConsultation'
import { signUpChip } from '../lib/signUp'
import PresentReport from './PresentReport'
import { formatWhen } from '../lib/bookingFormat'

const GOLD   = 'var(--t-accent)'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

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

function statusColor(s, t) {
  if (s === 'Completed') return t.success
  if (s === 'Overdue' || s === 'Not passed') return t.danger
  return t.goldText
}

// An assignment's report is worth opening once the student has answered something.
const hasReport = (a) => !!a.question_count && ((a.progress_count || 0) > 0 || !!a.completed_at)

function ReportButton({ assignment, onOpen, theme }) {
  if (!onOpen || !hasReport(assignment)) return null
  const t = THEMES[theme]
  return (
    <button type="button" onClick={() => onOpen(assignment.id)}
      style={{ padding: '5px 11px', borderRadius: 7, border: `1px solid var(--t-border)`, background: 'var(--t-bgSubtle)', color: t.goldText, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, flexShrink: 0 }}>
      Report
    </button>
  )
}

const STATUS_OPTIONS = ['All', 'Pending', 'Overdue', 'Completed', 'Not passed']

// ── Assignments Tab ───────────────────────────────────────────────────────────
function AssignmentsTab({ profile, theme, subject, allTutors = false, onOpenReport, newForStudent = null }) {
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
  // /tutor/assignments?student=<id> (Assign work on a student) opens the form set to them.
  useEffect(() => {
    if (!newForStudent) return
    setForm({ ...blankForm(), target_mode: 'single', student_ids: [newForStudent] })
    setShowForm(true)
  }, [newForStudent]) // eslint-disable-line react-hooks/exhaustive-deps
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
    if (!(await confirmDialog('Stop this recurring assignment? Work it has already set stays with the students.', { confirm: 'Stop it', danger: true }))) return
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

  const card = { background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12 }
  const inputStyle = { padding: '9px 12px', borderRadius: 8, border: theme === 'dark' ? '1px solid var(--t-border)' : `1px solid ${t.border}`, background: theme === 'dark' ? 'var(--t-bgSubtle)' : t.bg, color: t.text, fontSize: 13, fontFamily: FONT_B, outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => setFilterStatus(s => (s === 'Overdue' ? 'All' : 'Overdue'))}
          aria-pressed={filterStatus === 'Overdue'}
          title={overdueCount > 0 ? `${overdueCount} overdue assignment${overdueCount !== 1 ? 's' : ''}` : 'No overdue assignments'}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px', height: 38, borderRadius: 9, border: `1px solid ${filterStatus === 'Overdue' ? 'var(--t-danger)' : t.border}`, background: filterStatus === 'Overdue' ? 'var(--t-dangerBg)' : 'transparent', color: overdueCount > 0 ? 'var(--t-danger)' : t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}
        >
          <Bell size={15} aria-hidden="true" />
          {overdueCount > 0 ? `${overdueCount} overdue` : 'None overdue'}
        </button>
        <button
          onClick={() => { setShowForm(v => !v); setFormError('') }}
          style={{ padding: '8px 14px', borderRadius: 9, border: showForm ? `1px solid ${t.border}` : 'none', background: showForm ? t.bgCard : 'var(--t-accent)', color: showForm ? t.text : 'var(--t-onAccent)', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}
        >
          {showForm ? 'Close' : 'New assignment'}
        </button>
      </div>

      {notifyStatus && (
        <div style={{ padding: '12px 16px', borderRadius: 10, border: `1px solid ${notifyStatus.ok ? '#4ade8040' : '#f8717140'}`, background: notifyStatus.ok ? 'var(--t-successBg)' : 'var(--t-dangerBg)', fontSize: 13, color: notifyStatus.ok ? 'var(--t-success)' : 'var(--t-danger)', fontWeight: 600 }}>
          {notifyStatus.msg}
        </div>
      )}

      {showForm && (
        <div style={{ ...card, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 16 }}>New assignment</div>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 6 }}>Type</label>
                <select className="td-input-gold" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
                  {ASSIGNMENT_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 6 }}>Subject</label>
                <div style={{ ...inputStyle, color: t.text, opacity: 0.85 }}>{form.subject || '—'}</div>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 8 }}>Topics ({form.topics.length} selected)</label>
              <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>Tap a topic to assign the whole topic, or expand it to pick individual subtopics.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allTopics.map(tp => {
                  const sel = form.topics.includes(tp)
                  const subs = Array.from(topicSubtopics[tp] || [])
                  const isExpanded = expandedTopic === tp
                  const selectedSubsForTopic = subs.filter(s => form.topics.includes(s))
                  return (
                    <div key={tp} style={{ border: `1px solid ${(sel || selectedSubsForTopic.length > 0) ? 'var(--t-text)' : t.border}`, borderRadius: 10, padding: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button type="button" onClick={() => toggleTopic(tp)}
                          style={{ padding: '5px 11px', borderRadius: 12, border: `1px solid ${sel ? 'var(--t-text)' : t.border}`, background: sel ? 'var(--t-bgSubtle)' : 'transparent', color: sel ? 'var(--t-text)' : t.textMuted, fontSize: 12, fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
                          {tp}
                        </button>
                        {subs.length > 0 && (
                          <button type="button" onClick={() => setExpandedTopic(isExpanded ? null : tp)}
                            style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 11, cursor: 'pointer', fontFamily: FONT_B }}>
                            {isExpanded ? '▾ Hide subtopics' : `▸ ${subs.length} subtopics`}
                          </button>
                        )}
                        {selectedSubsForTopic.length > 0 && !sel && (
                          <span style={{ fontSize: 11, color: 'var(--t-goldText)', fontWeight: 700 }}>{selectedSubsForTopic.length} selected</span>
                        )}
                      </div>
                      {isExpanded && subs.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingLeft: 4 }}>
                          {subs.map(sub => {
                            const subSel = form.topics.includes(sub)
                            return (
                              <button key={sub} type="button" onClick={() => toggleTopic(sub)}
                                style={{ padding: '4px 9px', borderRadius: 12, border: `1px solid ${subSel ? 'var(--t-text)' : t.border}`, background: subSel ? 'var(--t-bgSubtle)' : 'transparent', color: subSel ? 'var(--t-text)' : t.textMuted, fontSize: 11, fontWeight: subSel ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
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
                <label htmlFor="assignment-question-count" style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 8 }}>Questions to complete</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {QUESTION_COUNT_PRESETS.map(n => {
                    const active = Number(form.question_count) === n
                    return (
                      <button key={n} type="button" onClick={() => setForm(f => ({ ...f, question_count: n }))} aria-pressed={active}
                        style={{ padding: '5px 11px', borderRadius: 12, border: `1px solid ${active ? 'var(--t-text)' : t.border}`, background: active ? 'var(--t-bgSubtle)' : 'transparent', color: active ? 'var(--t-text)' : t.textMuted, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
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
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 8 }}>Difficulty</label>
                <div role="radiogroup" aria-label="Difficulty" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DIFFICULTY_OPTIONS.map(opt => {
                    const active = form.difficulty === opt.id
                    return (
                      <button key={opt.id} type="button" role="radio" aria-checked={active} title={opt.hint} onClick={() => setForm(f => ({ ...f, difficulty: opt.id }))}
                        style={{ padding: '5px 11px', borderRadius: 12, border: `1px solid ${active ? 'var(--t-text)' : t.border}`, background: active ? 'var(--t-bgSubtle)' : 'transparent', color: active ? 'var(--t-text)' : t.textMuted, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
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
                <input type="checkbox" checked={form.remediation} onChange={e => setForm(f => ({ ...f, remediation: e.target.checked }))} style={{ accentColor: 'var(--t-text)', width: 15, height: 15 }} />
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
                <input type="checkbox" checked={form.pass_mark_on} onChange={e => setForm(f => ({ ...f, pass_mark_on: e.target.checked }))} style={{ accentColor: 'var(--t-text)', width: 15, height: 15 }} />
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
                        <input type="radio" name="pass_mode" checked={form.pass_mode === opt.id} onChange={() => setForm(f => ({ ...f, pass_mode: opt.id }))} style={{ accentColor: 'var(--t-text)', marginTop: 2 }} />
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
              <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 8 }}>Repeat</label>
              <div role="radiogroup" aria-label="Repeat" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {REPEAT_OPTIONS.map(opt => {
                  const active = form.repeat === opt.id
                  return (
                    <button key={opt.id} type="button" role="radio" aria-checked={active} onClick={() => setRepeat(opt.id)}
                      style={{ padding: '5px 11px', borderRadius: 12, border: `1px solid ${active ? 'var(--t-text)' : t.border}`, background: active ? 'var(--t-bgSubtle)' : 'transparent', color: active ? 'var(--t-text)' : t.textMuted, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
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
                            style={{ width: 38, height: 34, borderRadius: 8, border: `1px solid ${active ? 'var(--t-text)' : t.border}`, background: active ? 'var(--t-bgSubtle)' : 'transparent', color: active ? 'var(--t-text)' : t.textMuted, fontSize: 12, fontWeight: active ? 800 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
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
                    <input type="checkbox" checked={form.notify_each} onChange={e => setForm(f => ({ ...f, notify_each: e.target.checked }))} style={{ accentColor: 'var(--t-text)', width: 15, height: 15 }} />
                    Email students each time it’s set
                  </label>
                  {form.days_of_week.length > 0 && (
                    <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 12px', borderRadius: 8, background: 'var(--t-bgSubtle)', border: `1px solid ${t.border}` }}>
                      {describeRepeat({ days_of_week: form.days_of_week, every_weeks: form.repeat === 'fortnightly' ? 2 : 1 })}, {describeDue(Number(form.due_days))}
                      {form.end_date ? `, until ${fmtDay(form.end_date)}` : ''}. Students who join a class or roster you pick get it from then on.
                    </div>
                  )}
                </div>
              )}
            </div>

            {form.repeat === 'none' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 8 }}>Due date</label>
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={{ ...inputStyle, maxWidth: 220 }} min={new Date().toISOString().slice(0, 10)} />
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 8 }}>
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
                          style={{ padding: '6px 13px', borderRadius: 12, border: `1px solid ${active ? 'var(--t-text)' : t.border}`, background: active ? 'var(--t-bgSubtle)' : 'transparent', color: disabled ? t.textFaint : active ? 'var(--t-text)' : t.textMuted, fontSize: 12, fontWeight: active ? 700 : 500, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: FONT_B, opacity: disabled ? 0.5 : 1 }}>
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>

                  {form.target_mode === 'all' && (
                    <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 12px', borderRadius: 8, background: 'var(--t-bgSubtle)', border: `1px solid ${t.border}` }}>
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
                            style={{ padding: '6px 12px', borderRadius: 12, border: `1px solid ${sel ? accent : t.border}`, background: sel ? `${accent}1f` : 'transparent', color: sel ? accent : t.textMuted, fontSize: 12, fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
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
                              style={{ accentColor: 'var(--t-text)', width: 15, height: 15 }}
                            />
                            {s.profiles?.display_name || 'Unknown'}
                          </label>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ marginTop: 10, fontSize: 12, color: resolvedCount > 0 ? 'var(--t-text)' : t.textMuted, fontWeight: 700 }}>
                    This will be sent to {resolvedCount} student{resolvedCount !== 1 ? 's' : ''}.
                  </div>
                </>
              )}
            </div>

            {formError && <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--t-danger)' }}>{formError}</div>}

            <button type="submit" disabled={saving} style={{ padding: '11px 24px', borderRadius: 9, border: 'none', background: saving ? t.border : 'var(--t-accent)', color: saving ? t.textMuted : 'var(--t-onAccent)', fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}>
              {saving ? 'Creating…' : `${form.repeat !== 'none' ? 'Create recurring assignment' : 'Create assignment'}${resolvedCount > 1 ? ` (${resolvedCount} students)` : ''}`}
            </button>
          </form>
        </div>
      )}

      {schedules.length > 0 && (
        <div style={card}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--t-border)', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text }}>Recurring</div>
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
              <div key={sch.id} style={{ padding: '13px 20px', borderBottom: '1px solid var(--t-border)', display: 'flex', alignItems: 'flex-start', gap: 14, opacity: paused || finished ? 0.75 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                    <Repeat size={14} color={GOLD} aria-hidden="true" />
                    <span style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{sch.type}</span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, border: `1px solid ${stateColor}40`, background: `${stateColor}15`, color: stateColor, fontWeight: 700 }}>{state}</span>
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
                  style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--t-danger)', background: 'transparent', color: 'var(--t-danger)', fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: FONT_B, flexShrink: 0 }}>
                  {finished ? 'Remove' : 'Stop'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div style={card}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--t-border)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text }}>All assignments</div>
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
              style={{ padding: '7px 11px', borderRadius: 8, border: `1px solid ${filterStudent ? 'var(--t-text)' : t.border}`, background: t.bgCard, color: filterStudent ? 'var(--t-text)' : t.textMuted, fontSize: 12, fontFamily: FONT_B, outline: 'none', fontWeight: filterStudent ? 700 : 400, cursor: 'pointer' }}
            >
              <option value="">All students</option>
              {roster.map(s => (
                <option key={s.student_id} value={s.student_id}>{s.profiles?.display_name || 'Unknown'}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map(s => {
                const active = filterStatus === s
                const col = s === 'Completed' ? t.success : s === 'Overdue' ? t.danger : s === 'Pending' ? t.goldText : t.textMuted
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    style={{ padding: '5px 12px', borderRadius: 12, border: `1px solid ${active ? col : t.border}`, background: active ? `${col}18` : 'transparent', color: active ? col : t.textMuted, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}
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
              const sc = statusColor(status, t)
              return (
                <div key={a.id} style={{ padding: indent ? '11px 20px 11px 38px' : '13px 20px', borderBottom: '1px solid var(--t-border)', display: 'flex', alignItems: 'flex-start', gap: 14, background: indent ? 'color-mix(in srgb, var(--t-text) 3%, transparent)' : 'transparent' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                      {!indent && <span style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{a.type}</span>}
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, border: `1px solid ${sc}40`, background: `${sc}15`, color: sc, fontWeight: 700 }}>{status}</span>
                      {!indent && <span style={{ fontSize: 11, color: t.textMuted }}>Due {fmtDate(a.due_date)}</span>}
                      {!indent && a.schedule_id && <span title="Set by a recurring assignment" style={{ fontSize: 11, color: 'var(--t-goldText)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Repeat size={11} aria-hidden="true" />Recurring</span>}
                    </div>
                    <div style={{ fontSize: 12, color: t.textMuted, marginBottom: indent ? 0 : 3 }}>
                      <strong style={{ color: t.text }}>Student:</strong> {a.profiles?.display_name || a.student_id}
                      {a.completed_at && <span style={{ marginLeft: 8, color: 'var(--t-success)' }}>· Completed {fmtDate(a.completed_at)}</span>}
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
                    style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--t-danger)', background: 'transparent', color: 'var(--t-danger)', fontSize: 12, cursor: deletingId === a.id ? 'not-allowed' : 'pointer', fontFamily: FONT_B, flexShrink: 0 }}>
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
                        style={{ width: '100%', textAlign: 'left', padding: '13px 20px', borderBottom: `1px solid ${t.border}`, background: theme === 'dark' ? 'var(--t-bgSubtle)' : 'var(--t-bgSubtle)', border: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer', fontFamily: FONT_B, color: t.text }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: 'var(--t-goldText)', fontWeight: 800 }}>{isExpanded ? '▾' : '▸'}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{head.type}</span>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, border: `1px solid var(--t-border)`, background: 'var(--t-bgSubtle)', color: 'var(--t-goldText)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{head.schedule_id && <Repeat size={11} aria-hidden="true" />}{head.schedule_id ? 'Recurring' : 'Batch'}</span>
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
function ProgressTab({ profile, theme, allTutors = false, onOpenReport, initialStudentId = null }) {
  const t = THEMES[theme]
  const [roster, setRoster]           = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId || '')
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

  const card = { background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12 }
  const divider = 'var(--t-border)'
  const cardSecHdr = { padding: '14px 20px', borderBottom: `1px solid ${divider}` }
  const secTitle = { fontSize: 14.5, fontWeight: 800, color: t.text }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ ...card, padding: '18px 20px' }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 8 }}>Student</label>
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
              { label: 'Total XP', val: progress.xp?.toLocaleString() ?? 0, color: 'var(--t-goldText)' },
              { label: 'Streak', val: <>{progress.streak ?? 0} days <Flame size={22} aria-hidden="true" style={{ verticalAlign: '-2px' }} /></>, color: 'var(--t-goldText)' },
              { label: 'Accuracy', val: `${progress.accuracy ?? 0}%`, color: progress.accuracy >= 70 ? 'var(--t-success)' : progress.accuracy >= 40 ? 'var(--t-text)' : 'var(--t-danger)' },
              { label: 'Questions done', val: progress.totalAttempts ?? 0, color: t.text },
            ].map((s, i) => (
              <div key={s.label} className={`td-fadein td-fadein-${i + 1}`} style={{ ...card, padding: '16px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: s.color, marginBottom: 8 }}>{s.val}</div>
                <div style={{ fontSize: 11.5, color: t.textMuted, fontWeight: 700 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {progress.topicBreakdown && progress.topicBreakdown.length > 0 && (
            <div style={card}>
              <div style={cardSecHdr}>
                <div style={secTitle}>Accuracy by topic</div>
              </div>
              <div>
                {progress.topicBreakdown.map(tb => {
                  const acc = tb.attempts > 0 ? Math.round(((tb.attempts - tb.wrong) / tb.attempts) * 100) : null
                  const color = acc == null ? t.textMuted : acc >= 70 ? 'var(--t-success)' : acc >= 40 ? 'var(--t-goldText)' : 'var(--t-danger)'
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
                  const sc = statusColor(status, t)
                  return (
                    <div key={a.id} style={{ padding: '12px 20px', borderBottom: `1px solid ${divider}`, display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{a.type} — {(a.topics || []).join(', ') || a.subject}</div>
                        <div style={{ fontSize: 11, color: t.textMuted }}>Due {fmtDate(a.due_date)}{a.completed_at ? ` · Completed ${fmtDate(a.completed_at)}` : ''}{assignmentGoalLabel(a) ? ` · ${assignmentGoalLabel(a)}` : ''}</div>
                      </div>
                      <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 12, border: `1px solid ${sc}40`, background: `${sc}15`, color: sc, fontWeight: 700, flexShrink: 0 }}>{status}</span>
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
                <div style={secTitle}>Recent activity</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Last 10 sessions</div>
              </div>
              <div>
                {progress.recentActivity.map((r, i) => (
                  <div key={i} style={{ padding: '10px 20px', borderBottom: `1px solid ${divider}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.correct ? 'var(--t-success)' : 'var(--t-danger)', flexShrink: 0 }} />
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
                  <div style={secTitle}>Off-topic questions</div>
                  <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 12, border: '1px solid var(--t-danger)', background: 'var(--t-dangerBg)', color: 'var(--t-danger)', fontWeight: 700 }}>
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
                      <div style={{ fontSize: 15, fontWeight: 700, color: r.count >= 3 ? 'var(--t-danger)' : GOLD }}>{r.count}×</div>
                      <div style={{ fontSize: 11.5, color: t.textMuted }}>redirect{r.count !== 1 ? 's' : ''}</div>
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
                            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--t-goldText)', marginTop: 8 }}>Overall: {sc}/10</div>
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
                            border: `1px solid var(--t-border)`,
                            background: 'var(--t-bgSubtle)',
                            color: 'var(--t-goldText)',
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

  const card = { background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12 }
  const inputStyle = { padding: '9px 12px', borderRadius: 8, border: theme === 'dark' ? '1px solid var(--t-border)' : `1px solid ${t.border}`, background: theme === 'dark' ? 'var(--t-bgSubtle)' : t.bg, color: t.text, fontSize: 13, fontFamily: FONT_B, outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => { setShowCreate(v => !v); setCreateError('') }}
          style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: showCreate ? t.border : 'var(--t-accent)', color: showCreate ? t.textMuted : 'var(--t-onAccent)', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}
        >
          {showCreate ? 'Close' : 'New class'}
        </button>
      </div>

      {showCreate && (
        <div style={{ ...card, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 14 }}>New class</div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 6 }}>Name *</label>
                <input className="td-input-gold" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Year 10 Chem - Tuesday" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 6 }}>Subject (optional)</label>
                <input className="td-input-gold" value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="e.g. Chemistry Stage 1" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 6 }}>Color</label>
                <input type="color" value={newColor || 'var(--t-accent)'} onChange={e => setNewColor(e.target.value)} style={{ ...inputStyle, padding: 4, height: 36 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 6 }}>Description</label>
                <input className="td-input-gold" value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Optional notes about this class" style={inputStyle} />
              </div>
            </div>
            {createError && <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--t-danger)' }}>{createError}</div>}
            <button type="submit" disabled={creating} style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: creating ? t.border : 'var(--t-accent)', color: creating ? t.textMuted : 'var(--t-onAccent)', fontSize: 13, fontWeight: 800, cursor: creating ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}>
              {creating ? 'Creating…' : 'Create class'}
            </button>
          </form>
        </div>
      )}

      <div style={card}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--t-border)' }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text }}>Your classes</div>
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
                <div key={cls.id} style={{ borderBottom: '1px solid var(--t-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px' }}>
                    <div style={{ width: 8, height: 36, borderRadius: 4, background: accent, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renamingId === cls.id ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input value={renameValue} onChange={e => setRenameValue(e.target.value)} style={{ ...inputStyle, maxWidth: 280 }} autoFocus />
                          <button onClick={() => handleRename(cls)} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: 'var(--t-accent)', color: 'var(--t-onAccent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>Save</button>
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
                          <button onClick={() => handleDelete(cls)} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: 'var(--t-danger)', color: 'var(--t-text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>Delete class</button>
                          <button onClick={() => setConfirmDelete(null)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setExpandedClass(expanded ? null : cls.id)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${expanded ? 'var(--t-text)' : t.border}`, background: expanded ? 'var(--t-bgSubtle)' : 'transparent', color: expanded ? 'var(--t-text)' : t.textMuted, fontSize: 12, fontWeight: expanded ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
                            {expanded ? '▾ Hide' : '▸ View'}
                          </button>
                          <button onClick={() => { setRenamingId(cls.id); setRenameValue(cls.name) }} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Rename</button>
                          {canManageTutors(cls) && <button onClick={() => setConfirmDelete(cls.id)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--t-danger)', background: 'transparent', color: 'var(--t-danger)', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Delete</button>}
                        </>
                      )}
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ padding: '0 20px 16px 38px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: t.textMuted, marginRight: 4 }}>Tutors</span>
                        {(cls.tutors || []).map(tu => (
                          <span key={tu.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999, border: `1px solid ${t.border}`, background: t.bg, fontSize: 12, color: t.text }}>
                            {tu.display_name || 'Unnamed'}{tu.role === 'owner' && <span style={{ fontSize: 11.5, color: t.textMuted }}>owner</span>}
                            {tu.role === 'co' && canManageTutors(cls) && (
                              <button onClick={() => handleRemoveTutor(cls, tu.id)} title="Remove tutor" style={{ border: 'none', background: 'transparent', color: 'var(--t-danger)', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
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
                      {tutorError && expanded && <div style={{ fontSize: 12, color: 'var(--t-danger)' }}>{tutorError}</div>}
                      {memberRows.length === 0 ? (
                        <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 0' }}>No students in this class yet.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {memberRows.map(m => (
                            <div key={m.student_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8, background: t.bg, border: `1px solid ${t.border}` }}>
                              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--t-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--t-onAccent)', flexShrink: 0 }}>
                                {(m.profile?.profiles?.display_name || '?')[0].toUpperCase()}
                              </div>
                              <div style={{ flex: 1, fontSize: 13, color: t.text }}>{m.profile?.profiles?.display_name || 'Unknown student'}</div>
                              <button onClick={() => handleRemoveMember(cls, m.student_id)} style={{ padding: '4px 9px', borderRadius: 6, border: '1px solid var(--t-danger)', background: 'transparent', color: 'var(--t-danger)', fontSize: 11, cursor: 'pointer', fontFamily: FONT_B }}>Remove</button>
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
                                  <input type="checkbox" checked={pickerSelected.includes(r.student_id)} onChange={() => togglePickerStudent(r.student_id)} style={{ accentColor: 'var(--t-text)', width: 15, height: 15 }} />
                                  {r.profiles?.display_name || 'Unknown'}
                                </label>
                              ))}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => handleAddMembers(cls)} disabled={pickerSelected.length === 0 || pickerSaving} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: pickerSelected.length === 0 || pickerSaving ? t.border : 'var(--t-accent)', color: pickerSelected.length === 0 || pickerSaving ? t.textMuted : 'var(--t-onAccent)', fontSize: 12, fontWeight: 800, cursor: pickerSelected.length === 0 || pickerSaving ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}>
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function DiagnosticTab({ profile, theme }) {
  const t = THEMES[theme]
  const navigate = useNavigate()

  // ── Form state ──
  const [step, setStep] = useState('form')  // form | preview | created | list | report
  const scope = useTestScope()
  const [studentName, setStudentName] = useState('')
  const [prospectEmail, setProspectEmail] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [master, setMaster] = useState(null)          // the tutor's own questionnaire, for the create form's summary
  const [masterError, setMasterError] = useState(false)
  const [tailored, setTailored] = useState(null)        // a copy edited for this student, or null to use the master
  const [openAnswers, setOpenAnswers] = useState({})    // diagnostic id -> answers shown

  // ── Generated data ──
  const [generating, setGenerating]   = useState(false)
  const [genError, setGenError]       = useState('')
  const [questions, setQuestions]     = useState([])
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState('')
  const [createdLink, setCreatedLink] = useState('')
  const [createdSend, setCreatedSend] = useState(null) // { id, email, emailed, emailError } when an email was given
  const [rowBusy, setRowBusy] = useState('')            // diagnostic id being resent / cancelled
  const [rowError, setRowError] = useState('')
  const [copied, setCopied]           = useState(false)

  // ── Past diagnostics list ──
  const [diagnostics, setDiagnostics] = useState([])
  const [listLoading, setListLoading] = useState(false)

  // ── Consultation calls: the row being booked or moved, and the tutor's zone for showing times ──
  const [callModal, setCallModal] = useState(null) // { mode: 'book' | 'reschedule', diagnostic?, session? }
  const [signUpRow, setSignUpRow] = useState(null) // the finished diagnostic being signed up
  const [sendTestRow, setSendTestRow] = useState(null) // the test-less consultation record being given a test
  const [testNotice, setTestNotice] = useState(null)   // { ok, text } after "Send a test"
  const [tutorZone, setTutorZone] = useState(null) // null until known: times then show without a zone label
  useEffect(() => {
    let cancelled = false
    fetchBookingSettings().then(s => { if (!cancelled && s?.timeZone) setTutorZone(s.timeZone) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // ── Report panel ──
  const [reportData, setReportData]   = useState(null)
  const [presenting, setPresenting]    = useState(false)
  const presentBtnRef = useRef(null)
  const exitPresent = useCallback(() => {
    setPresenting(false)
    setTimeout(() => presentBtnRef.current?.focus(), 0)
  }, [])
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')

  const loadList = useCallback(async () => {
    setListLoading(true)
    try {
      const json = await fetchDiagnosticAssessments()
      setDiagnostics(json.assessments || [])
    } catch {}
    setListLoading(false)
  }, [])

  useEffect(() => { loadList() }, [loadList])

  // The tutor's own questionnaire (re-read when the create form is shown again, so edits in its tab show).
  useEffect(() => {
    if (step !== 'form') return
    let cancelled = false
    fetchQuestionnaire()
      .then(r => { if (!cancelled) { setMaster(r.questionnaire); setMasterError(false) } })
      .catch(() => { if (!cancelled) setMasterError(true) })
    return () => { cancelled = true }
  }, [step])

  const handleGenerate = async () => {
    setGenError('')
    const scopeProblem = scope.validate()
    if (scopeProblem) { setGenError(scopeProblem); return }
    if (prospectEmail.trim() && !EMAIL_RE.test(prospectEmail.trim())) { setGenError("Enter a valid email address for the student, or leave it blank."); return }
    if (parentEmail.trim() && !EMAIL_RE.test(parentEmail.trim())) { setGenError("Enter a valid email address for the parent, or leave it blank."); return }
    const subjectConfig = scope.buildConfig()


    setGenerating(true)
    try {
      const json = await generateDiagnosticQuestions({ yearLevel: scope.yearLevel, subjects: [subjectConfig] })
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
    const subjectConfig = scope.buildConfig()
    try {
      const json = await createDiagnosticAssessment({
        yearLevel: scope.yearLevel,
        subjects: [subjectConfig],
        questions,
        studentName: studentName.trim() || null,
        questionnaire: tailored || undefined,
        prospectEmail: prospectEmail.trim() || null,
        parentEmail: parentEmail.trim() || null,
      })
      setCreatedLink(json.link)
      setCreatedSend(prospectEmail.trim() ? { id: json.id, email: prospectEmail.trim().toLowerCase(), emailed: !!json.emailed, emailError: json.emailError || '' } : null)
      setStep('created')
      await loadList()
    } catch (err) {
      setSaveError(err.message || 'Failed to save assessment.')
    }
    setSaving(false)
  }

  // Resend or cancel a diagnostic emailed to a prospect, then refresh the list.
  const runRowAction = async (id, fn) => {
    setRowError('')
    setRowBusy(id)
    try {
      await fn()
      await loadList()
      return true
    } catch (err) {
      setRowError(err.message || 'That didn\'t work. Please try again.')
      return false
    } finally {
      setRowBusy('')
    }
  }
  const handleResend = (d) => runRowAction(d.id, () => resendDiagnostic(d.id))
  const handleCancel = async (d) => {
    const ok = await confirmDialog(`Cancel this diagnostic? The link stops working${d.prospect_email ? ` for ${d.prospect_email}` : ''}, and you can't undo this.`, { confirm: 'Cancel diagnostic', cancel: 'Keep it', danger: true })
    if (ok) runRowAction(d.id, () => cancelDiagnostic(d.id))
  }
  const handleCancelCall = async (d) => {
    const ok = await confirmDialog(`Cancel the call with ${d.submitted_by_name || d.student_name || d.prospect_email || 'this prospect'}? They'll be emailed that it's cancelled.`, { confirm: 'Cancel call', cancel: 'Keep it', danger: true })
    if (ok) runRowAction(d.id, () => cancelConsultation(d.booking.sessionId))
  }
  const handleCreatedResend = async () => {
    if (!createdSend) return
    const ok = await runRowAction(createdSend.id, () => resendDiagnostic(createdSend.id))
    if (ok) setCreatedSend(s => ({ ...s, emailed: true, emailError: '' }))
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
    scope.reset()
    setStudentName('')
    setProspectEmail('')
    setParentEmail('')
    setTailored(null)
    setCreatedSend(null)
    setQuestions([])
    setCreatedLink('')
    setGenError('')
    setSaveError('')
  }

  const card = { background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12 }
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 9, border: theme === 'dark' ? '1px solid var(--t-border)' : `1px solid ${t.border}`, background: theme === 'dark' ? 'var(--t-bgSubtle)' : t.bg, color: t.text, fontFamily: FONT_B, fontSize: 13, outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { fontSize: 12, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 6 }
  const sectionHdr = { padding: '14px 20px', borderBottom: '1px solid var(--t-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }

  return (
    <div>
      {/* ── Tab sub-nav ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { key: 'form',          label: 'New diagnostic' },
          { key: 'list',          label: `Sent diagnostics (${diagnostics.length})` },
          { key: 'questionnaire', label: 'Pre-call questionnaire' },
        ].map(btn => {
          const active = step === btn.key || ((step === 'preview' || step === 'created') && btn.key === 'form') || (step === 'report' && btn.key === 'list')
          return (
            <button
              key={btn.key}
              onClick={() => { if (btn.key === 'form') resetForm(); else setStep(btn.key) }}
              aria-current={active ? 'page' : undefined}
              style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${active ? 'var(--t-text)' : t.border}`, background: active ? 'var(--t-bgSubtle)' : 'transparent', color: active ? t.text : t.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}
            >
              {btn.label}
            </button>
          )
        })}
      </div>

      {step === 'questionnaire' && <QuestionnaireTab theme={theme} />}

      {/* ── Step: Form ── */}
      {step === 'form' && (
        <div>
          <div style={card}>
            <div style={sectionHdr}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text }}>New diagnostic test</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>AI creates a 30-mark test tailored to your student's level and topics</div>
              </div>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <TestScopeFields scope={scope} theme={theme} labelStyle={labelStyle} inputStyle={inputStyle} idPrefix="diag" />

              {/* Who it's for: name and, to email it to them, the student's own email */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Student's name <span style={{ fontWeight: 400, textTransform: 'none', color: t.textFaint }}>(optional)</span></label>
                  <input className="td-input-gold" value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="e.g. Sarah Jones" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Student's email <span style={{ fontWeight: 400, textTransform: 'none', color: t.textFaint }}>(optional)</span></label>
                  <input className="td-input-gold" type="email" value={prospectEmail} onChange={e => setProspectEmail(e.target.value)} placeholder="e.g. sarah@example.com" style={inputStyle} />
                  <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>We'll email them the link. Use the student's own email.</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Parent's email <span style={{ fontWeight: 400, textTransform: 'none', color: t.textFaint }}>(optional)</span></label>
                  <input className="td-input-gold" type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} placeholder="e.g. parent@example.com" style={inputStyle} />
                  <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>Gets a copy of the emails about the consultation call.</div>
                </div>
                <QuestionnaireSection master={master} masterError={masterError} tailored={tailored} onTailor={setTailored} theme={theme} labelStyle={labelStyle} />
              </div>

              {genError && <div style={{ fontSize: 13, color: t.danger, padding: '10px 14px', borderRadius: 8, background: t.dangerBg, border: `1px solid ${t.danger}40` }}>{genError}</div>}

              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: generating ? t.border : 'var(--t-accent)', color: generating ? t.textMuted : 'var(--t-onAccent)', fontSize: 14, fontWeight: 800, cursor: generating ? 'not-allowed' : 'pointer', fontFamily: FONT_B, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 10 }}
              >
                {generating ? <><Bot size={17} aria-hidden="true" /> Generating questions… <span style={{ opacity: 0.6 }}>(30–60 sec)</span></> : <><Bot size={17} aria-hidden="true" /> Generate test</>}
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
                { icon: Bot, title: 'A 30-mark test', desc: '10 easy + 10 moderate + 10 exam-style marks, tailored to the selected year level and topics' },
                { icon: Link, title: 'A link to share', desc: "Copy and share the link with the student's parent — the test runs entirely in the browser" },
                { icon: ChartColumn, title: 'Marked by AI', desc: 'As soon as the student submits, AI marks every question and generates a diagnostic report' },
                { icon: ClipboardList, title: 'A report for you', desc: 'Pain points, patterns and recommendations appear here in the tutor portal for your review' },
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
                <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Check the questions</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>{questions.length} questions · {questions.reduce((n, q) => n + q.marks, 0)} marks</div>
              </div>
              <button onClick={resetForm} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>
                ← Regenerate
              </button>
            </div>

            <TestQuestionList questions={questions} theme={theme} />
          </div>

          {/* Save form */}
          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Create the test and get its link</div>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Student name <span style={{ fontWeight: 400, textTransform: 'none', color: t.textFaint }}>(optional)</span></label>
                  <input className="td-input-gold" value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="e.g. Sarah Jones" style={inputStyle} />
                </div>
                <QuestionnaireSection master={master} masterError={masterError} tailored={tailored} onTailor={setTailored} theme={theme} labelStyle={labelStyle} />
              </div>
              {saveError && <div style={{ fontSize: 13, color: t.danger }}>{saveError}</div>}
              <button onClick={handleCreate} disabled={saving}
                style={{ padding: '11px 24px', borderRadius: 9, border: 'none', background: saving ? t.border : 'var(--t-accent)', color: saving ? t.textMuted : 'var(--t-onAccent)', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: FONT_B, alignSelf: 'flex-start' }}>
                {saving ? 'Creating…' : <><CircleCheck size={15} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />Create and get the student's link</>}
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
                <div style={{ fontSize: 17, fontWeight: 800, color: t.text }}>Test created</div>
                <div style={{ fontSize: 13, color: t.textMuted }}>
                  {createdSend?.emailed ? `Sent to ${createdSend.email}. You can also copy the link below.` : 'Share this link with the student'}
                </div>
              </div>
            </div>

            {createdSend && !createdSend.emailed && (
              <div role="alert" style={{ fontSize: 13, color: t.danger, padding: '10px 14px', borderRadius: 8, background: t.dangerBg, border: `1px solid ${t.danger}40`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 200 }}>The test is saved, but the email to {createdSend.email} wasn't sent. {createdSend.emailError}</span>
                <button onClick={handleCreatedResend} disabled={rowBusy === createdSend.id} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.danger}`, background: 'transparent', color: t.danger, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
                  {rowBusy === createdSend.id ? 'Sending…' : 'Resend'}
                </button>
              </div>
            )}
            {createdSend && rowError && <div style={{ fontSize: 12, color: t.danger }}>{rowError}</div>}

            <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--t-goldText)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{createdLink}</div>
              <button
                onClick={() => handleCopy(createdLink)}
                style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${copied ? t.success : t.border}`, background: copied ? t.successBg : 'transparent', color: copied ? t.success : t.textMuted, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, flexShrink: 0 }}
              >
                {copied ? '✓ Copied!' : 'Copy link'}
              </button>
            </div>

            <div style={{ background: 'var(--t-bgSubtle)', border: '1px solid var(--t-border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-goldText)', marginBottom: 6 }}>What happens next?</div>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {!createdSend?.emailed && <li style={{ fontSize: 13, color: t.textMuted }}>Send the link to the student</li>}
                {createdSend?.emailed && <li style={{ fontSize: 13, color: t.textMuted }}>If they haven't started in 2 days, they get one reminder</li>}
                <li style={{ fontSize: 13, color: t.textMuted }}>The student opens the link and completes the test at their own pace</li>
                <li style={{ fontSize: 13, color: t.textMuted }}>AI marks the assessment automatically on submission</li>
                <li style={{ fontSize: 13, color: t.textMuted }}>The full report appears here in your tutor portal, and we email you when it's in</li>
              </ol>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={resetForm} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: 'var(--t-accent)', color: 'var(--t-onAccent)', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
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
            <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Sent diagnostics</div>
            <button onClick={loadList} style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Refresh</button>
          </div>
          {testNotice && (
            <div role={testNotice.ok ? 'status' : 'alert'} style={{ margin: '12px 20px 0', fontSize: 13, color: testNotice.ok ? t.text : t.danger, padding: '10px 14px', borderRadius: 8, background: testNotice.ok ? t.successBg : t.dangerBg, border: `1px solid ${testNotice.ok ? t.success : t.danger}40`, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ flex: 1 }}>{testNotice.text}</span>
              <button type="button" onClick={() => setTestNotice(null)} aria-label="Dismiss" style={{ border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer', fontSize: 16, lineHeight: 1, fontFamily: FONT_B }}>×</button>
            </div>
          )}
          {rowError && <div role="alert" style={{ margin: '12px 20px 0', fontSize: 13, color: t.danger, padding: '10px 14px', borderRadius: 8, background: t.dangerBg, border: `1px solid ${t.danger}40` }}>{rowError}</div>}
          {listLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Loading…</div>
          ) : diagnostics.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No diagnostic assessments yet. Create one to get started.</div>
          ) : (
            <div>
              {diagnostics.map(d => {
                const completed = d.status === 'completed'
                const subjectNames = (d.subjects || []).map(s => s.name).join(', ')
                // A prospect's (link) diagnostic shows where it's up to; a roster student's keeps Pending / Completed.
                const chip = d.student_id
                  ? { label: completed ? 'Completed' : 'Pending', tone: completed ? 'success' : 'gold' }
                  : statusChip(d.status_label)
                const chipColor = { success: t.success, gold: t.goldText, danger: t.danger, muted: t.textMuted }[chip.tone]
                const chipBorder = { success: `${t.success}59`, gold: 'var(--t-border)', danger: `${t.danger}59`, muted: 'var(--t-border)' }[chip.tone]
                const chipBg = { success: t.successBg, gold: 'var(--t-bgSubtle)', danger: t.dangerBg, muted: 'var(--t-bgSubtle)' }[chip.tone]
                const chipStyle = c => ({ fontSize: 11, padding: '2px 8px', borderRadius: 12, border: `1px solid ${{ success: `${t.success}59`, gold: 'var(--t-border)', danger: `${t.danger}59`, muted: 'var(--t-border)' }[c.tone]}`, background: { success: t.successBg, gold: 'var(--t-bgSubtle)', danger: t.dangerBg, muted: 'var(--t-bgSubtle)' }[c.tone], color: { success: t.success, gold: t.goldText, danger: t.danger, muted: t.textMuted }[c.tone], fontWeight: 700 })
                const qChip = d.student_id ? null : questionnaireChip(d.questionnaire_status)
                const hasAnswers = !d.student_id && !!d.questionnaire && !!d.questionnaire_answers
                const answersOpen = !!openAnswers[d.id]
                const busy = rowBusy === d.id
                // A finished prospect's diagnostic can have a call booked; a roster student's can't.
                const isProspect = !d.student_id && d.tutor_id === profile.id
                const canBook = isProspect && completed && !d.booking
                const canSignUp = isProspect && completed && !d.signup
                const suChip = signUpChip(d.signup)
                const canSendTest = isProspect && d.status_label === 'no_test'
                const rowName = d.submitted_by_name || d.student_name || null
                return (
                  <div key={d.id} style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{d.status_label === 'no_test' ? 'Consultation call' : `${d.year_level} · ${subjectNames}`}</span>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, border: `1px solid ${chipBorder}`, background: chipBg, color: chipColor, fontWeight: 700 }}>
                          {chip.label}
                        </span>
                        {qChip && <span style={chipStyle(qChip)}>{qChip.label}</span>}
                        {suChip && <span style={chipStyle(suChip)}>{suChip.label}</span>}
                        {d.red_flags > 0 && <span style={chipStyle({ tone: 'danger' })}>Red flag</span>}
                      </div>
                      <div style={{ fontSize: 11, color: t.textMuted }}>
                        {d.submitted_by_name || d.student_name || 'No name yet'}
                        {d.prospect_email ? ` · ${d.prospect_email}` : ''}
                        {d.prospect_is_parent && <span style={{ color: t.textFaint }}> · Parent contact</span>}
                        {d.set_by ? ` · Set by ${d.set_by}` : ''}
                        {completed && d.score_total != null ? ` · Score: ${d.score_total}/${d.score_max}` : ''}
                        {d.sent_at ? ` · Sent ${fmtDate(d.sent_at)}` : ` · Created ${fmtDate(d.created_at)}`}
                        {completed && d.completed_at ? ` · Submitted ${fmtDate(d.completed_at)}` : ''}
                      </div>
                      {isProspect && d.booking && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginTop: 5 }}>
                          Call {formatWhen(d.booking.start, tutorZone)}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                      {canBook && (
                        <button onClick={() => setCallModal({ mode: 'book', diagnostic: { id: d.id, prospect_email: d.prospect_email, parent_email: d.parent_email, name: rowName } })} disabled={busy} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: FONT_B }}>
                          Book call
                        </button>
                      )}
                      {canSendTest && (
                        <button onClick={() => { setTestNotice(null); setSendTestRow(d) }} disabled={busy} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: 'var(--t-accent)', color: 'var(--t-onAccent)', fontSize: 12, fontWeight: 800, cursor: busy ? 'default' : 'pointer', fontFamily: FONT_B }}>
                          Send a test
                        </button>
                      )}
                      {canSignUp && (
                        <button onClick={() => setSignUpRow(d)} disabled={busy} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: FONT_B }}>
                          Sign them up
                        </button>
                      )}
                      {isProspect && d.booking && (
                        <>
                          <button onClick={() => setCallModal({ mode: 'reschedule', session: { id: d.booking.sessionId, diagnostic_id: d.id, scheduled_at: d.booking.start, guest_name: rowName, guest_email: d.prospect_email } })} disabled={busy} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: FONT_B }}>
                            Reschedule
                          </button>
                          <button onClick={() => handleCancelCall(d)} disabled={busy} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: busy ? 'default' : 'pointer', fontFamily: FONT_B }}>
                            {busy ? '…' : 'Cancel call'}
                          </button>
                        </>
                      )}
                      {d.can_resend && (
                        <button onClick={() => handleResend(d)} disabled={busy} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: FONT_B }}>
                          {busy ? '…' : 'Resend'}
                        </button>
                      )}
                      {d.can_cancel && (
                        <button onClick={() => handleCancel(d)} disabled={busy} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: busy ? 'default' : 'pointer', fontFamily: FONT_B }}>
                          Cancel
                        </button>
                      )}
                      {d.status_label !== 'no_test' && (
                        <button onClick={() => handleCopy(d.link)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>
                          Copy Link
                        </button>
                      )}
                      {hasAnswers && (
                        <button onClick={() => setOpenAnswers(o => ({ ...o, [d.id]: !o[d.id] }))} aria-expanded={answersOpen} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
                          {answersOpen ? 'Hide answers' : 'Show answers'}
                        </button>
                      )}
                      {completed && (
                        <button onClick={() => handleViewReport(d)} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: 'var(--t-accent)', color: 'var(--t-onAccent)', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
                          View Report
                        </button>
                      )}
                    </div>
                    {hasAnswers && answersOpen && (
                      <div style={{ flexBasis: '100%', background: 'var(--t-bgSubtle)', border: '1px solid var(--t-border)', borderRadius: 10, padding: '14px 16px' }}>
                        <QuestionnaireAnswers questionnaire={d.questionnaire} answers={d.questionnaire_answers} submittedAt={d.questionnaire_submitted_at} theme={theme} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {signUpRow && (
        <SignUpModal row={signUpRow} theme={theme} onClose={() => setSignUpRow(null)} onDone={loadList} />
      )}

      {sendTestRow && (
        <SendTestModal row={sendTestRow} theme={theme} onClose={() => setSendTestRow(null)} onDone={async (res) => { setTestNotice(testSentSummary(res)); await loadList() }} />
      )}

      {callModal && (
        <ConsultationModal
          mode={callModal.mode} diagnostic={callModal.diagnostic} session={callModal.session} theme={theme}
          onClose={() => setCallModal(null)} onDone={loadList}
          onOpenSettings={() => navigate('/tutor/sessions?consultation=settings')}
        />
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
            const bandColors = { Outstanding: t.success, High: GOLD, Satisfactory: t.blue, Developing: 'color-mix(in srgb, var(--t-accent) 55%, var(--t-danger))', Beginning: t.danger }
            const bc = bandColors[r.performance_band] || GOLD
            const canPresent = a.status === 'completed' && !a.student_id
            const listRow = diagnostics.find(x => x.id === a.id)
            const canSignUp = canPresent && !!listRow && listRow.tutor_id === profile.id && !listRow.signup
            const suChip = listRow ? signUpChip(listRow.signup) : null
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {canPresent && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {suChip && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, border: `1px solid ${suChip.tone === 'success' ? `${t.success}59` : 'var(--t-border)'}`, background: suChip.tone === 'success' ? t.successBg : 'var(--t-bgSubtle)', color: suChip.tone === 'success' ? t.success : t.goldText, fontWeight: 700 }}>{suChip.label}</span>}
                    {canSignUp && (
                      <button onClick={() => setSignUpRow(listRow)} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
                        Sign them up
                      </button>
                    )}
                    <button ref={presentBtnRef} onClick={() => setPresenting(true)} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--t-accent)', color: 'var(--t-onAccent)', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
                      Present
                    </button>
                  </div>
                )}
                {presenting && canPresent && <PresentReport assessment={a} report={r} theme={theme} onExit={exitPresent} />}
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
                      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, border: `1px solid ${bc}40`, background: `${bc}15`, color: bc, fontWeight: 700 }}>{r.performance_band}</span>
                    </div>
                  </div>
                </div>

                {/* Pre-call questionnaire answers */}
                {a.tutor_id === profile.id && a.questionnaire && a.questionnaire_answers && (
                  <div style={card}>
                    <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Pre-call questionnaire</div>
                    </div>
                    <div style={{ padding: '16px 20px' }}>
                      <QuestionnaireAnswers questionnaire={a.questionnaire} answers={a.questionnaire_answers} submittedAt={a.questionnaire_submitted_at} theme={theme} />
                    </div>
                  </div>
                )}

                {/* Section breakdown */}
                <div style={card}>
                  <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Section scores</div>
                  </div>
                  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { label: 'Section A — Foundation', score: r.easy_score, max: r.easy_max, color: t.success },
                      { label: 'Section B — Core Skills', score: r.moderate_score, max: r.moderate_max, color: 'var(--t-goldText)' },
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
                      <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>By topic</div>
                    </div>
                    <div>
                      {r.topic_breakdown.map(tb => {
                        const pct = tb.percentage
                        const c = pct >= 75 ? t.success : pct >= 50 ? t.goldText : t.danger
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
                  { key: 'pain_points',     label: 'Pain points',        icon: Zap,         color: t.danger,  items: r.pain_points },
                  { key: 'patterns',        label: 'Patterns',  icon: Search,      color: 'var(--t-goldText)',      items: r.patterns },
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
                      <div style={{ fontSize: 14, fontWeight: 700, color: t.text, display: 'flex', alignItems: 'center', gap: 8 }}><PenLine size={16} aria-hidden="true" />Summary for you</div>
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
                        const col = full ? t.success : partial ? t.goldText : t.danger
                        const studentAnswer = qr.student_answer || a.student_answers?.[String(qr.id)] || ''
                        const correctAnswer = q?.correct_answer ?? qr.correct_answer
                        const isMcq = q?.type === 'multiple_choice' && q.options?.length > 0
                        const label = { fontSize: 11, fontWeight: 700, color: t.textFaint, marginBottom: 4 }
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


// A maths answer is the bare LaTeX the MathLive answer box gives (\frac{1}{2},
// x^{2}, a_{n}); wrap it so MathText renders it as maths. Prose and answers
// already written with $…$ are left alone.
function asMath(answer) {
  return !answer.includes('$') && /\\|\^|_\{/.test(answer) ? `$${answer}$` : answer
}

// ── Main TutorScreen ───────────────────────────────────────────────────────────
// The sections are in the app sidebar (lib/portalNav TUTOR_NAV) and live at
// /tutor/<section>. Progress reports sit inside Students; profile and billing
// open from the account menu.
const SECTION_META = {
  overview:    { title: 'Today' },
  students:    { title: 'Students' },
  classes:     { title: 'Classes' },
  assignments: { title: 'Assignments' },
  sessions:    { title: 'Lessons' },
  resources:   { title: 'Resources' },
  diagnostic:  { title: 'Diagnostics' },
  messages:    { title: 'Messages' },
  profile:     { title: 'Tutor profile' },
  plan:        { title: 'Plan and billing' },
}

export default function TutorScreen({ profile, theme, subject }) {
  const t = THEMES[theme]
  const navigate = useNavigate()
  const location = useLocation()
  const section = location.pathname.split('/')[2] || 'overview'
  // Old links: /tutor?tab=messages (message emails) and the Progress section.
  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab')
    if (tab && SECTION_META[tab]) navigate(`/tutor/${tab}${location.search.replace(/[?&]tab=[^&]*/, '').replace(/^&/, '?')}`, { replace: true })
    else if (section === 'progress') navigate('/tutor/students?view=progress', { replace: true })
    else if (!SECTION_META[section]) navigate('/tutor', { replace: true })
  }, [location.pathname, location.search]) // eslint-disable-line react-hooks/exhaustive-deps
  const activeTab = SECTION_META[section] ? section : 'overview'
  const params = new URLSearchParams(location.search)
  const studentsView = params.get('view') === 'progress' ? 'progress' : 'roster'

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

  // Shell-level data — powers Today, the search and the sidebar badges.
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

  // Overdue work, shown as a badge on Assignments in the app sidebar.
  const overdueCount = useMemo(
    () => assignments.filter(a => !a.completed_at && a.due_date && new Date(a.due_date).setHours(23,59,59,999) < Date.now()).length,
    [assignments],
  )
  useEffect(() => { reportPortalBadges('tutor', { assignments: overdueCount }) }, [overdueCount])

  const go = (id) => navigate(id === 'overview' ? '/tutor' : `/tutor/${id}`)
  const meta = SECTION_META[activeTab]
  const isDark = theme === 'dark'

  // A short, true line under each title.
  const context = {
    overview: new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }),
    students: `${roster.length} student${roster.length !== 1 ? 's' : ''} · ${classes.length} class${classes.length !== 1 ? 'es' : ''}`,
    classes: `${classes.length} class${classes.length !== 1 ? 'es' : ''}`,
    assignments: overdueCount ? `${overdueCount} overdue` : `${assignments.filter(a => !a.completed_at).length} open`,
  }[activeTab]

  const btn = (primary) => ({ padding: '8px 14px', borderRadius: 9, fontFamily: FONT_B, fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', border: primary ? 'none' : `1px solid ${t.border}`, background: primary ? t.accent : t.bgCard, color: primary ? 'var(--t-onAccent)' : t.text })
  const segment = (options, value, onChange, label) => (
    <SegmentedToggle size="sm" options={options} value={value} onChange={onChange} label={label} />
  )

  return (
    <div className="td-root" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: t.bg, fontFamily: FONT_B, color: t.text }}>
      <header className="td-header" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '18px 28px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
        <div style={{ minWidth: 0, flex: '1 1 200px' }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: t.text, lineHeight: 1.2 }}>{meta.title}</h1>
          {context && <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>{context}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {isAdmin && segment([[false, 'My students'], [true, 'All tutors']], allTutors, setAllTutors, 'Whose students')}
          <GlobalSearch theme={theme} roster={roster} classes={classes} resources={resources} assignments={assignments} onNavigate={go} width="min(280px, 70vw)" />
          {activeTab === 'overview' && (
            <>
              <button type="button" style={btn(false)} onClick={() => go('sessions')}>Schedule lesson</button>
              <button type="button" style={btn(true)} onClick={() => go('assignments')}>New assignment</button>
            </>
          )}
          {activeTab === 'students' && segment([['roster', 'Roster'], ['progress', 'Progress reports']], studentsView, (v) => navigate(v === 'progress' ? '/tutor/students?view=progress' : '/tutor/students'), 'Students view')}
        </div>
      </header>

      {/* Section content */}
      <div className="td-content" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 56px' }}>
        <div key={`${activeTab}-${studentsView}-${allTutors ? 'all' : 'mine'}`} className="td-content-enter" style={{ maxWidth: 1320, width: '100%', margin: '0 auto' }}>
          {activeTab === 'overview'    && <TutorToday     theme={theme} roster={roster} assignments={assignments} sessions={sessions} onNavigate={go} onJoinSession={(id) => navigate(`/session/${id}`)} onOpenReport={setReportId} />}
          {activeTab === 'students'    && (studentsView === 'progress'
            ? <ProgressTab profile={profile} theme={theme} allTutors={allTutors} onOpenReport={setReportId} initialStudentId={params.get('student')} />
            : <StudentsTab profile={profile} theme={theme} allTutors={allTutors} onNavigate={(to) => navigate(to)} />)}
          {activeTab === 'classes'     && <ClassesTab     profile={profile} theme={theme} allTutors={allTutors} />}
          {activeTab === 'assignments' && <AssignmentsTab profile={profile} theme={theme} subject={subject} allTutors={allTutors} onOpenReport={setReportId} newForStudent={params.get('student')} />}
          {activeTab === 'sessions'    && <SessionsTab    profile={profile} theme={theme} />}
          {activeTab === 'resources'   && <ResourcesTab   profile={profile} theme={theme} />}
          {activeTab === 'diagnostic'  && <DiagnosticTab  profile={profile} theme={theme} />}
          {activeTab === 'messages'    && <MessagesView   theme={theme} initialOtherId={params.get('with')} emptyHint="Invite a student from Students to start a conversation." />}
          {activeTab === 'profile'     && <TutorProfileTab profile={profile} theme={theme} />}
          {activeTab === 'plan'        && <TutorPlanTab theme={theme} />}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme === 'dark' ? 'var(--t-bgSubtle)' : t.bgInput, border: `1px solid ${open ? 'var(--t-text)' : (theme === 'dark' ? 'var(--t-border)' : t.border)}`, borderRadius: 10, padding: '8px 12px', transition: 'border-color 0.15s' }}>
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
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, left: 0, background: t.bgCard, border: '1px solid var(--t-border)', borderRadius: 12, boxShadow: theme === 'dark' ? '0 8px 32px rgba(0,0,0,0.6)' : t.shadowModal, overflow: 'hidden', zIndex: 30, maxHeight: 360, overflowY: 'auto', backdropFilter: 'blur(12px)' }}>
          {results.length === 0 ? (
            <div style={{ padding: '14px 16px', fontSize: 13, color: t.textMuted }}>No matches for “{q.trim()}”.</div>
          ) : results.map((r, i) => (
            <button key={i} onClick={() => { onNavigate(r.to); setOpen(false); setQ('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderBottom: '1px solid var(--t-border)', background: 'transparent', cursor: 'pointer', fontFamily: FONT_B }}
              onMouseEnter={e => e.currentTarget.style.background = theme === 'dark' ? 'var(--t-bgCard)' : t.bgHover}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ display: 'flex', flexShrink: 0, color: t.textMuted }}><r.icon size={16} aria-hidden="true" /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: t.textMuted }}>{r.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
