import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, GraduationCap, PenLine, FileText, Video, ChartColumn, Folder, Link as LinkIcon, Target, Calendar } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { getQuestionCounts, assignmentGoalLabel } from '../lib/engine'
import { priorityTopics } from '../lib/priorityTopics'
import { supabase } from '../lib/supabase'
import { getAssessments, fetchAssignmentsForStudent, fetchCompletedAssignmentsForStudent, fetchStudentResources, fetchMyInvites, respondToInvite, fetchMyDiagnostics } from '../lib/db'
import { getTopicConfigForSubject, buildCurriculumTopicConfig } from '../lib/topicConfig'
import { subjectHasFeature } from '../lib/subjects'
import { loadCurriculumMacroGroups } from '../lib/curriculaDb'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const NAVY_FILL = '#0c1037'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

export default function HomeScreen({ profile, struggleMap, questions, subject, onStartSession, theme, assignmentsVersion = 0 }) {
  const t = THEMES[theme]
  const [curriculumMacroGroups, setCurriculumMacroGroups] = useState(null)
  const baseTopicConfig = getTopicConfigForSubject(subject)
  const { macroGroups: MACRO_GROUPS, normFn: topicNormFn, isTwoLevel = false } =
    (curriculumMacroGroups ? buildCurriculumTopicConfig(curriculumMacroGroups) : baseTopicConfig)
  const navigate = useNavigate()
  const [selectedSubtopics, setSelectedSubtopics] = useState([])
  const [expandedMacros, setExpandedMacros] = useState(() => new Set(['g1','g2','g3','g4','g5','g6']))
  // Session builder: which questions, and the exam settings.
  const [sessionMode, setSessionMode] = useState('new')
  const [examMode, setExamMode] = useState(false)
  const [examCount, setExamCount] = useState(10)
  const [examMinutes, setExamMinutes] = useState(15)
  const [customMinutes, setCustomMinutes] = useState('45')
  const [assessments, setAssessments] = useState([])
  const [assignments, setAssignments] = useState([])
  // Finished assignments the student got something wrong in, to redo those questions.
  const [finishedAssignments, setFinishedAssignments] = useState([])
  const [resources, setResources] = useState([])
  const [invites, setInvites] = useState([])
  const [diagnostics, setDiagnostics] = useState([])
  const [dismissedDiagnostic, setDismissedDiagnostic] = useState(null)
  const [inviteBusy, setInviteBusy] = useState(null)
  const [inviteError, setInviteError] = useState('')

  useEffect(() => {
    let cancelled = false
    getAssessments(profile.id).then(rows => { if (!cancelled) setAssessments(rows) }).catch(() => {})
    fetchAssignmentsForStudent(profile.id).then(rows => { if (!cancelled) setAssignments(rows) }).catch(() => {})
    fetchCompletedAssignmentsForStudent()
      .then(rows => { if (!cancelled) setFinishedAssignments(rows.filter(a => a.wrong_question_ids?.length > 0)) })
      .catch(() => {})
    fetchStudentResources().then(rows => { if (!cancelled) setResources(rows) }).catch(() => {})
    fetchMyInvites().then(rows => { if (!cancelled) setInvites(rows) }).catch(() => {})
    fetchMyDiagnostics().then(rows => { if (!cancelled) setDiagnostics(rows) }).catch(() => {})
    return () => { cancelled = true }
  }, [profile.id, assignmentsVersion])

  useEffect(() => {
    setCurriculumMacroGroups(null)
    const curriculumName =
      subject?.curriculumName ||
      (subject?.id?.startsWith('curriculum_') ? subject?.name : null)
    if (!curriculumName) return
    let cancelled = false
    loadCurriculumMacroGroups(curriculumName)
      .then(groups => { if (!cancelled && groups) setCurriculumMacroGroups(groups) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [subject?.curriculumName, subject?.id, subject?.name])

  const questionIds = useMemo(() => new Set(questions.map(q => q.id)), [questions])
  const currentStruggleMap = useMemo(() => {
    const filtered = {}
    Object.entries(struggleMap || {}).forEach(([qid, stats]) => {
      if (questionIds.has(qid)) filtered[qid] = stats
    })
    return filtered
  }, [struggleMap, questionIds])

  // ── Normalised topic helpers ───────────────────────────────────────────────
  // Build a set of macro labels so we can detect when q.topic IS a macro label
  const macroLabelToGroup = {}
  MACRO_GROUPS.forEach(macro => { macroLabelToGroup[macro.label.toLowerCase()] = macro })

  const topicNorm = (raw) => {
    if (!raw) return null
    const canonical = topicNormFn(raw)
    if (canonical) return canonical
    // If the raw topic exactly matches a macro label, leave it as-is so the
    // macro-level fallback below can pick it up
    if (macroLabelToGroup[raw.toLowerCase()]) return raw
    return raw
  }

  // Set of all canonical topic keys from MACRO_GROUPS
  const canonicalTopicKeys = new Set(MACRO_GROUPS.flatMap(m => m.topics))

  // Pass 1: build normTopicToSubs.
  // For isTwoLevel (curriculum subjects): q.subtopic is the selectable leaf, self-referential.
  // For standard subjects: q.topic → canonical topic → subtopics list.
  const normTopicToSubs = {}
  questions.forEach(q => {
    if (isTwoLevel) {
      const n = topicNorm(q.subtopic)
      if (!n || !canonicalTopicKeys.has(n)) return
      if (!normTopicToSubs[n]) normTopicToSubs[n] = [n]
    } else {
      const n = topicNorm(q.topic)
      if (!n || !canonicalTopicKeys.has(n)) return
      if (!normTopicToSubs[n]) normTopicToSubs[n] = []
      if (q.subtopic && !normTopicToSubs[n].includes(q.subtopic)) normTopicToSubs[n].push(q.subtopic)
    }
  })
  // Reverse map: subtopic string → canonical topic key (standard subjects only)
  const subToCanonicalTopic = {}
  if (!isTwoLevel) {
    Object.entries(normTopicToSubs).forEach(([normKey, subs]) => {
      subs.forEach(sub => { subToCanonicalTopic[sub] = normKey })
    })
  }

  // Pass 2: count every question.
  const normTopicGroups = {}
  questions.forEach(q => {
    let n
    if (isTwoLevel) {
      n = topicNorm(q.subtopic)
    } else {
      n = topicNorm(q.topic)
      if (!n || !canonicalTopicKeys.has(n)) {
        // Fallback: look up canonical topic via subtopic (handles old DB records with wrong topic strings)
        n = q.subtopic ? subToCanonicalTopic[q.subtopic] : null
      }
      // Ensure normTopicToSubs is populated for questions resolved via subtopic fallback
      if (n) {
        if (!normTopicToSubs[n]) normTopicToSubs[n] = []
        if (q.subtopic && !normTopicToSubs[n].includes(q.subtopic)) normTopicToSubs[n].push(q.subtopic)
      }
    }
    if (!n) return
    if (!normTopicGroups[n]) normTopicGroups[n] = { total: 0, attempted: 0, correct: 0, wrong: 0 }
    normTopicGroups[n].total++
    const s = currentStruggleMap[q.id]
    if (s && s.attempts > 0) {
      normTopicGroups[n].attempted++
      normTopicGroups[n].correct += (s.attempts - s.wrong)
      normTopicGroups[n].wrong += s.wrong
    }
  })
  const allSubtopics = [...new Set(questions.map(q => q.subtopic).filter(Boolean))]
  const topicsInBankCount = MACRO_GROUPS.reduce((n, m) => n + m.topics.filter(tn => normTopicGroups[tn]).length, 0)
  const isAllTopicsSelected = allSubtopics.length > 0 && selectedSubtopics.length === allSubtopics.length
  // Nothing ticked, or everything ticked, means the whole bank: an empty filter
  // also takes in questions that have no subtopic.
  const effectiveSubtopics = isAllTopicsSelected ? [] : selectedSubtopics
  const filteredCounts = getQuestionCounts(questions, currentStruggleMap, effectiveSubtopics)
  const tickedTopicCount = MACRO_GROUPS.reduce((acc, macro) => acc + macro.topics.filter(tn =>
    (normTopicToSubs[tn] || []).some(s => selectedSubtopics.includes(s))).length, 0)
  const answeredCount = Object.values(currentStruggleMap).filter(s => s.attempts > 0).length

  const topStruggles = priorityTopics(normTopicGroups)

  const [weekStats, setWeekStats]       = useState({ total: 0, correct: 0 })
  const [showComeback, setShowComeback] = useState(false)

  useEffect(() => {
    if (!profile?.id) return

    // Comeback check — show banner if away 48h+ and haven't answered today
    const lastActive = profile.last_active ? new Date(profile.last_active) : null
    const hoursSince = lastActive ? (Date.now() - lastActive.getTime()) / 3600000 : 0
    const dismissKey = `gf-comeback-${new Date().toDateString()}`
    if (hoursSince >= 48 && !localStorage.getItem(dismissKey)) setShowComeback(true)

    // Start of this Mon–Sun week
    const now = new Date()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)

    supabase
      .from('answer_log')
      .select('answered_at, correct')
      .eq('user_id', profile.id)
      .gte('answered_at', monday.toISOString())
      .then(({ data }) => {
        if (!data?.length) return
        setWeekStats({ total: data.length, correct: data.filter(a => a.correct).length })
      })
  }, [profile.id, profile.last_active])

  const card = {
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: 16,
    boxShadow: theme === 'light' ? '0 2px 12px rgba(12,16,55,0.07)' : '0 2px 12px rgba(0,0,0,0.25)',
  }

  // ── Session builder ───────────────────────────────────────────────────────
  // Exam mode holds every answer back until the end and turns off remediation,
  // so a set number of questions is exactly what the student gets.
  const examAvailable = subjectHasFeature(subject, 'exam_mode')
  const examOn = examAvailable && examMode
  const examTimerMinutes = examMinutes === 'custom' ? Number(customMinutes) : examMinutes
  const examTimerValid = Number.isInteger(examTimerMinutes) && examTimerMinutes >= 1 && examTimerMinutes <= 180
  // "Got wrong" is a fixed list; New and Mixed keep going because the bank tops itself up.
  const startMode = sessionMode === 'wrong' && filteredCounts.wrong === 0 ? 'new' : sessionMode
  const canStart = questions.length > 0 && (!examOn || examTimerValid)

  const startSession = () => {
    if (!canStart) return
    onStartSession({
      mode: startMode,
      subtopics: effectiveSubtopics,
      examMode: examOn,
      timerSeconds: examOn ? examTimerMinutes * 60 : 0,
      questionLimit: examOn ? examCount : 0,
    })
  }

  const segment = (options, value, onChange, label) => (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', border: `1px solid ${t.border}`, borderRadius: 9, overflow: 'hidden' }}>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on} disabled={o.disabled}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1, padding: '8px 4px', border: 'none', borderLeft: i > 0 ? `1px solid ${t.border}` : 'none',
              background: on ? segOnBg : 'transparent', color: on ? segOnFg : o.disabled ? t.textFaint : t.textMuted,
              fontFamily: FONT_B, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              cursor: o.disabled ? 'not-allowed' : 'pointer', opacity: o.disabled ? 0.6 : 1,
            }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )

  // Selected options: navy on light, gold on dark (navy would vanish there).
  const segOnBg = theme === 'dark' ? GOLD : NAVY_FILL
  const segOnFg = theme === 'dark' ? NAVY_FILL : '#fff'
  const fieldLabel = { display: 'block', fontSize: 12, fontWeight: 600, color: t.textMuted, marginBottom: 6 }

  const renderBuilder = () => (
    <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: t.text }}>Your session</div>
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
          {tickedTopicCount === 0 || isAllTopicsSelected ? 'All topics' : `${tickedTopicCount} topic${tickedTopicCount !== 1 ? 's' : ''} ticked`}
        </div>
      </div>

      <div>
        <span style={fieldLabel}>Questions</span>
        {segment([
          { value: 'new', label: 'New' },
          { value: 'wrong', label: `Got wrong · ${filteredCounts.wrong}`, disabled: filteredCounts.wrong === 0 },
          { value: 'all', label: 'Mixed' },
        ], startMode, setSessionMode, 'Questions')}
      </div>

      {examAvailable && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, borderRadius: 10, background: t.bgSubtle, border: `1px solid ${t.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span id="exam-mode-label" style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Exam mode</span>
            <button type="button" role="switch" aria-checked={examMode} aria-labelledby="exam-mode-label" onClick={() => setExamMode(v => !v)}
              style={{ width: 36, height: 20, borderRadius: 999, border: 'none', padding: 0, position: 'relative', cursor: 'pointer', background: examMode ? segOnBg : t.border, flexShrink: 0 }}>
              <span style={{ position: 'absolute', top: 3, left: examMode ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: examMode ? segOnFg : '#fff', transition: 'left 0.15s' }} />
            </button>
          </div>
          {examMode && (
            <>
              <div>
                <span style={fieldLabel}>How many</span>
                {segment([5, 10, 20, 30, 40].map(n => ({ value: n, label: String(n) })), examCount, setExamCount, 'How many questions')}
              </div>
              <div>
                <span style={fieldLabel}>Time limit</span>
                {segment([
                  ...[10, 15, 20, 30].map(m => ({ value: m, label: `${m}m` })),
                  { value: 'custom', label: 'Custom' },
                ], examMinutes, setExamMinutes, 'Time limit')}
                {examMinutes === 'custom' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <input id="exam-custom-minutes" type="number" min={1} max={180} inputMode="numeric" value={customMinutes}
                      onChange={e => setCustomMinutes(e.target.value)} aria-label="Time limit in minutes"
                      style={{ width: 80, padding: '7px 10px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, fontFamily: FONT_B, fontSize: 13 }} />
                    <span style={{ fontSize: 12, color: t.textMuted }}>minutes</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <button type="button" onClick={startSession} disabled={!canStart}
        style={{
          width: '100%', padding: '13px', borderRadius: 10, border: 'none', fontFamily: FONT_B, fontSize: 14, fontWeight: 800,
          background: canStart ? GOLD : t.bgHover, color: canStart ? NAVY_FILL : t.textFaint, cursor: canStart ? 'pointer' : 'not-allowed',
        }}>
        {examOn ? 'Start exam' : 'Start practice'}
      </button>
    </div>
  )

  const accuracyTone = (pct) => pct < 40 ? t.danger : pct < 70 ? t.goldText : t.success

  const WeakestTopicsCard = () => (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>Weakest topics</div>
      {topStruggles.length > 0 ? (
        <>
          <div style={{ fontSize: 12, color: t.textMuted, margin: '2px 0 6px' }}>Click one to practise it</div>
          {topStruggles.map((s, i) => {
            const pct = Math.round(s.accuracy * 100)
            return (
              <button
                key={s.topic}
                onClick={() => onStartSession({ mode: 'new', subtopics: normTopicToSubs[s.topic] || [] })}
                title={`Practise ${s.topic}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 0', border: 'none', borderTop: i > 0 ? `1px solid ${t.border}` : 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: FONT_B }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.topic}</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{s.correct} of {s.answers} correct</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: accuracyTone(pct), flexShrink: 0 }}>{pct}%</div>
              </button>
            )
          })}
        </>
      ) : (
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4, lineHeight: 1.5 }}>Answer a few questions and the topics you find hardest will show here.</div>
      )}
      <button onClick={() => navigate('/study-plan')}
        style={{ display: 'block', width: '100%', marginTop: 10, padding: '12px 0 0', border: 'none', borderTop: `1px solid ${t.border}`, background: 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: FONT_B, fontSize: 13, fontWeight: 700, color: t.text, textDecoration: 'underline', textDecorationColor: GOLD, textDecorationThickness: 2, textUnderlineOffset: 3 }}>
        Open study plan
      </button>
    </div>
  )

  const respondInvite = async (token, accept) => {
    setInviteBusy(token); setInviteError('')
    try {
      await respondToInvite(token, accept)
      // Reload into the portal so the sidebar picks up the new tutor and the welcome shows.
      if (accept) { window.location.assign('/portal'); return }
      setInvites(prev => prev.filter(i => i.token !== token))
    } catch (e) { setInviteError(e.message) }
    setInviteBusy(null)
  }

  // The diagnostic on this subject, for 30 days after it was done (until dismissed).
  const subjectCurriculumId = String(subject?.id || '').replace(/^curriculum_/, '')
  const diagnostic = diagnostics.find(d =>
    d.curriculum_id === subjectCurriculumId && d.status === 'completed' && d.summary &&
    Date.now() - new Date(d.completed_at).getTime() < 30 * 24 * 60 * 60 * 1000)
  const diagnosticDismissed = !!diagnostic && (dismissedDiagnostic === diagnostic.token || (() => {
    try { return localStorage.getItem(`gf-diagnostic-dismissed-${diagnostic.token}`) === '1' } catch { return false }
  })())
  const dismissDiagnostic = () => {
    try { localStorage.setItem(`gf-diagnostic-dismissed-${diagnostic.token}`, '1') } catch {}
    setDismissedDiagnostic(diagnostic.token)
  }

  const DiagnosticResultsCard = () => {
    if (!diagnostic || diagnosticDismissed) return null
    const { percentage, band, work_on: workOn = [], practise = [] } = diagnostic.summary
    return (
      <div style={{ ...card, padding: '16px 18px', border: `1px solid rgba(241,190,67,0.35)`, background: theme === 'dark' ? 'rgba(241,190,67,0.06)' : t.bgCard }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: GOLD, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}><Target size={16} aria-hidden="true" />Your diagnostic</div>
          <button onClick={dismissDiagnostic} aria-label="Hide your diagnostic results" style={{ border: 'none', background: 'transparent', color: t.textFaint, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2 }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 10 }}>{percentage}% · {band}</div>
        {workOn.length > 0 && (
          <div style={{ fontSize: 13, color: t.text, marginBottom: 12, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700 }}>Work on: </span>{workOn.join(', ')}
          </div>
        )}
        {practise.length > 0 && (
          <button onClick={() => onStartSession({ mode: 'new', subtopics: practise, expandTopics: true })}
            style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: '#0c1037', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
            Practise these →
          </button>
        )}
      </div>
    )
  }

  const TutorInvitesCard = () => {
    if (invites.length === 0) return null
    const btn = (primary) => ({ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B, border: primary ? 'none' : `1px solid ${t.border}`, background: primary ? `linear-gradient(135deg,${GOLD},${GOLDL})` : 'transparent', color: primary ? '#0c1037' : t.textMuted })
    return (
      <div style={{ ...card, padding: '16px 18px', border: `1px solid rgba(241,190,67,0.35)`, background: theme === 'dark' ? 'rgba(241,190,67,0.06)' : t.bgCard }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: GOLD, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}><GraduationCap size={16} aria-hidden="true" />Tutor invite{invites.length > 1 ? 's' : ''}</div>
        <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 12 }}>Accept to open the Student Portal. Your tutor will see your practice progress.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {invites.map(inv => (
            <div key={inv.token} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : '#f8f9fe', border: `1px solid ${t.border}` }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{inv.tutor_name}{inv.recipient === 'parent' && inv.child_name ? <span style={{ fontWeight: 500, color: t.textMuted }}> · for {inv.child_name}</span> : null}</div>
                {inv.subjects?.length > 0 && <div style={{ fontSize: 11, color: GOLD, marginTop: 2 }}>{inv.subjects.join(', ')} included, free</div>}
              </div>
              {inv.recipient === 'parent' ? (
                // The invite page asks which child it's for when that isn't clear.
                <button onClick={() => navigate(`/invite/${encodeURIComponent(inv.token)}`)} style={btn(true)}>Review</button>
              ) : (
                <button onClick={() => respondInvite(inv.token, true)} disabled={!!inviteBusy} style={btn(true)}>{inviteBusy === inv.token ? '…' : 'Accept'}</button>
              )}
              <button onClick={() => respondInvite(inv.token, false)} disabled={!!inviteBusy} style={btn(false)}>Decline</button>
            </div>
          ))}
        </div>
        {inviteError && <div style={{ marginTop: 8, fontSize: 12, color: t.danger }}>{inviteError}</div>}
      </div>
    )
  }

  const AssignedTasksCard = () => {
    if (assignments.length === 0 && finishedAssignments.length === 0) return null
    return (
      <div style={{ ...card, padding: '16px 18px', border: `1px solid rgba(241,190,67,0.25)`, background: theme === 'dark' ? 'rgba(241,190,67,0.04)' : t.bgCard }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: GOLD, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardList size={16} aria-hidden="true" />Assigned Tasks</div>
        <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 12 }}>From your tutor</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {assignments.slice(0, 5).map(a => {
            const due = a.due_date ? new Date(a.due_date) : null
            due?.setHours(23, 59, 59, 999)
            const overdue = due && due < new Date()
            const daysLeft = due ? Math.ceil((due - new Date()) / 86400000) : null
            const color = overdue ? '#f87171' : daysLeft !== null && daysLeft <= 3 ? GOLD : '#4ade80'
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : '#f8f9fe', border: `1px solid ${t.border}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{a.type} · {a.subject}</div>
                  {a.topics?.length > 0 && (
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.topics.join(', ')}</div>
                  )}
                  {a.question_count > 0 && (
                    <div style={{ fontSize: 11, color: t.textSub, fontWeight: 600, marginTop: 3 }}>
                      {assignmentGoalLabel(a)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color }}>
                    {overdue ? 'Overdue' : daysLeft === 0 ? 'Due today' : daysLeft !== null ? `${daysLeft}d left` : 'No due date'}
                  </div>
                  <button
                    onClick={() => onStartSession({ mode: 'new', subtopics: a.topics || [], assignment: a })}
                    style={{ padding: '4px 10px', borderRadius: 7, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: '#0c1037', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}
                  >
                    {a.progress_count > 0 ? 'Continue' : 'Start'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        {assignments.length > 5 && (
          <div style={{ marginTop: 8, fontSize: 11, color: t.textMuted, textAlign: 'center' }}>+{assignments.length - 5} more tasks</div>
        )}
        {finishedAssignments.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: assignments.length > 0 ? '14px 0 8px' : '0 0 8px' }}>Finished</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {finishedAssignments.slice(0, 3).map(a => {
                const wrong = a.wrong_question_ids.length
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : '#f8f9fe', border: `1px solid ${t.border}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{a.type} · {a.subject}</div>
                      {a.score?.total > 0 && (
                        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                          Scored {a.score.correct}/{a.score.total}{a.passed != null ? (a.passed ? ' · Passed' : ' · Not passed') : ''}
                        </div>
                      )}
                    </div>
                    {/* Practice only: a finished assignment doesn't change. */}
                    <button
                      onClick={() => onStartSession({ mode: 'review', subtopics: [], subject: a.subject, reviewIds: a.wrong_question_ids })}
                      style={{ padding: '4px 10px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#ef4444,#f87171)', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B, flexShrink: 0 }}
                    >
                      Redo {wrong} wrong
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  const RESOURCE_ICONS = { notes: PenLine, worksheet: FileText, recording: Video, slides: ChartColumn, resource: Folder, link: LinkIcon }
  const ClassResourcesCard = () => {
    if (resources.length === 0) return null
    return (
      <div style={{ ...card, padding: '16px 18px', border: `1px solid rgba(241,190,67,0.25)`, background: theme === 'dark' ? 'rgba(241,190,67,0.04)' : t.bgCard }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: GOLD, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}><Folder size={16} aria-hidden="true" />Class Resources</div>
        <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 12 }}>Notes, files & recordings from your tutor</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {resources.slice(0, 6).map(r => {
            const ResIcon = RESOURCE_ICONS[r.type] || Folder
            return (
            <a
              key={r.id}
              href={r.download_url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : '#f8f9fe', border: `1px solid ${t.border}`, textDecoration: 'none' }}
            >
              <div style={{ flexShrink: 0, display: 'flex', color: GOLD }}><ResIcon size={18} aria-hidden="true" /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                <div style={{ fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.tutor_name}{r.kind === 'link' ? ' · link' : ''}
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, flexShrink: 0 }}>{r.kind === 'link' ? 'Open' : 'Download'}</div>
            </a>
            )
          })}
        </div>
        {resources.length > 6 && (
          <div style={{ marginTop: 8, fontSize: 11, color: t.textMuted, textAlign: 'center' }}>+{resources.length - 6} more</div>
        )}
      </div>
    )
  }


  // ── Exam Countdown ────────────────────────────────────────────────────────
  const ExamCountdownCard = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const upcoming = assessments
      .filter(a => new Date(a.date) >= today)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
    const next = upcoming[0] || null

    // Only shown once the student has an upcoming test or exam to count down to.
    if (!next) return null

    const daysLeft = Math.max(0, Math.ceil((new Date(next.date) - today) / 86400000))
    const isExam   = next.type === 'Exam'
    const color    = daysLeft > 60 ? '#4ade80' : daysLeft > 21 ? GOLD : '#f87171'
    const message  = daysLeft > 60 ? 'You have time — build strong habits now.'
      : daysLeft > 21 ? 'Crunch mode. Focus on weak topics first.'
      : daysLeft > 7  ? 'Final stretch — revise, revise, revise.'
      : daysLeft > 0  ? 'This week! Review key formulas and past patterns.'
      : 'Today! Best of luck!'

    return (
      <div style={{ ...card, padding: '16px 18px', border: `1px solid ${color}30`, background: `${color}08` }}>
        <div style={{ fontSize: 11, color, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          {isExam ? <><Calendar size={13} aria-hidden="true" />Exam</> : <><ClipboardList size={13} aria-hidden="true" />{next.type}</>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color, lineHeight: 1 }}>{daysLeft}</div>
            <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 600 }}>days left</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{next.label}</div>
            <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>{message}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: t.textFaint, marginBottom: upcoming.length > 1 ? 10 : 0 }}>
          {new Date(next.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        {upcoming.length > 1 && (
          <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {upcoming.slice(1, 4).map(a => {
              const d = Math.max(0, Math.ceil((new Date(a.date) - today) / 86400000))
              const c2 = d > 60 ? '#4ade80' : d > 21 ? GOLD : '#f87171'
              return (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{a.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c2, flexShrink: 0, marginLeft: 8 }}>{d}d</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const toggleMacroExpand = (macroId) => {
    setExpandedMacros(prev => {
      const next = new Set(prev)
      if (next.has(macroId)) next.delete(macroId)
      else next.add(macroId)
      return next
    })
  }

  const toggleMacro = (macroId) => {
    const macro = MACRO_GROUPS.find(g => g.id === macroId)
    if (!macro) return
    const macroSubs = macro.topics.flatMap(tp => normTopicToSubs[tp] || [])
    const allSel = macroSubs.length > 0 && macroSubs.every(s => selectedSubtopics.includes(s))
    if (allSel) setSelectedSubtopics(prev => prev.filter(s => !macroSubs.includes(s)))
    else setSelectedSubtopics(prev => [...new Set([...prev, ...macroSubs])])
  }

  const toggleNormTopic = (topicName) => {
    const subs = normTopicToSubs[topicName] || []
    const allSel = subs.length > 0 && subs.every(s => selectedSubtopics.includes(s))
    if (allSel) setSelectedSubtopics(prev => prev.filter(s => !subs.includes(s)))
    else setSelectedSubtopics(prev => [...new Set([...prev, ...subs])])
  }


  // Answer accuracy for a topic (null before any answers): what the colour shows.
  const topicAccuracy = (groups) => {
    const correct = groups.reduce((n, g) => n + (g?.correct || 0), 0)
    const wrong = groups.reduce((n, g) => n + (g?.wrong || 0), 0)
    return correct + wrong > 0 ? Math.round((correct / (correct + wrong)) * 100) : null
  }

  const checkbox = (state, size = 16) => (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: 4, flexShrink: 0, boxSizing: 'border-box',
      border: `1.5px solid ${state ? segOnBg : t.textFaint}`, background: state === 'all' ? segOnBg : 'transparent',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size - 6, fontWeight: 800, lineHeight: 1, color: state === 'all' ? segOnFg : segOnBg,
    }}>
      {state === 'all' ? '✓' : state === 'some' ? '−' : ''}
    </span>
  )

  const statCell = (answered, total, pct) => (
    <>
      <span style={{ width: 56, textAlign: 'right', fontSize: 12, color: t.textFaint, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{answered}/{total}</span>
      <span style={{ width: 44, textAlign: 'right', fontSize: 12, fontWeight: 700, flexShrink: 0, color: pct === null ? t.textFaint : accuracyTone(pct), fontVariantNumeric: 'tabular-nums' }}>
        {pct === null ? 'New' : `${pct}%`}
      </span>
    </>
  )

  const rowSelected = theme === 'dark' ? 'rgba(241,190,67,0.08)' : '#fdf6e1'
  const weekPct = weekStats.total > 0 ? Math.round((weekStats.correct / weekStats.total) * 100) : null

  return (
    <div style={{ color: t.text, fontFamily: FONT_B, animation: 'hs-fadeUp 0.3s ease', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes hs-fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .hs-wrap  { display: flex; align-items: flex-start; gap: 24px; flex: 1; min-height: 0; }
        .hs-main  { flex: 1; min-width: 0; padding: 28px 8px 32px 32px; overflow-y: auto; height: 100%; box-sizing: border-box; }
        .hs-right { width: 360px; flex-shrink: 0; padding: 28px 32px 32px 0; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; height: 100%; box-sizing: border-box; }
        .hs-mobile-cards { display: none; flex-direction: column; gap: 14px; }
        .hs-row { display: flex; align-items: center; gap: 10px; width: 100%; border: none; background: transparent; font-family: inherit; text-align: left; cursor: pointer; }
        .hs-row:focus-visible { outline: 2px solid ${GOLD}; outline-offset: -2px; }
        .hs-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media (max-width: 1240px) {
          .hs-right { width: 320px; padding-right: 24px; }
        }
        @media (max-width: 860px) {
          .hs-wrap  { display: block !important; flex: none !important; height: auto !important; overflow: visible !important; min-height: auto !important; }
          .hs-main  { height: auto !important; overflow-y: visible !important; padding: 18px 14px !important; }
          .hs-right { display: none !important; }
          .hs-mobile-cards { display: flex; }
          .hs-name { white-space: normal; }
        }
      `}</style>

      <div className="hs-wrap">
        <div className="hs-main">
          {/* Comeback banner */}
          {showComeback && (
            <div style={{ marginBottom: 16, padding: '14px 18px', borderRadius: 12, background: 'rgba(241,190,67,0.08)', border: '1px solid rgba(241,190,67,0.25)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 3 }}>Welcome back</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>You've been away a while. Start with the questions you got wrong last time.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => onStartSession({ mode: 'wrong', subtopics: [] })} style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: GOLD, color: NAVY_FILL, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
                  Start session
                </button>
                <button aria-label="Dismiss" onClick={() => { setShowComeback(false); localStorage.setItem(`gf-comeback-${new Date().toDateString()}`, '1') }}
                  style={{ padding: '8px 10px', borderRadius: 9, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>✕</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: t.text }}>Practice</h1>
              <p style={{ fontSize: 13, color: t.textMuted, margin: '2px 0 0' }}>
                {isTwoLevel ? MACRO_GROUPS.length : topicsInBankCount} topics · {questions.length} questions
              </p>
            </div>
            <div style={{ fontSize: 13, color: t.textMuted }}>
              {weekStats.total > 0
                ? <><strong style={{ color: t.text }}>{weekStats.total}</strong> answered this week · <strong style={{ color: t.text }}>{weekPct}%</strong> correct</>
                : 'Nothing answered yet this week'}
            </div>
          </div>

          <div className="hs-mobile-cards" style={{ marginBottom: 14 }}>
            {renderBuilder()}
          </div>

          <div style={{ ...card, padding: '6px 0', marginBottom: 14 }}>
            <button className="hs-row" onClick={() => setSelectedSubtopics(isAllTopicsSelected ? [] : allSubtopics)} aria-pressed={isAllTopicsSelected}
              style={{ padding: '10px 16px', background: isAllTopicsSelected ? rowSelected : 'transparent', borderBottom: `1px solid ${t.border}` }}>
              {checkbox(isAllTopicsSelected ? 'all' : selectedSubtopics.length > 0 ? 'some' : null)}
              <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: t.text }}>All topics</span>
              <span style={{ fontSize: 12, color: t.textFaint }}>{answeredCount} answered</span>
            </button>

            {MACRO_GROUPS.map((macro, mi) => {
              const macroSubs = macro.topics.flatMap(tp => normTopicToSubs[tp] || [])
              const macroSelected = macroSubs.length > 0 && macroSubs.every(s => selectedSubtopics.includes(s))
              const macroPartial = !macroSelected && macroSubs.some(s => selectedSubtopics.includes(s))
              const isMacroExpanded = expandedMacros.has(macro.id)
              // Also count questions keyed by the macro label itself (when q.topic = macro label)
              const macroLabelGroup = normTopicGroups[macro.label] || { total: 0, attempted: 0 }
              const macroTotal = macro.topics.reduce((sum, tp) => sum + (normTopicGroups[tp]?.total || 0), 0) + macroLabelGroup.total
              const macroAttempted = macro.topics.reduce((sum, tp) => sum + (normTopicGroups[tp]?.attempted || 0), 0) + macroLabelGroup.attempted
              const macroPct = topicAccuracy([...macro.topics.map(tp => normTopicGroups[tp]), normTopicGroups[macro.label]])
              return (
                <div key={macro.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', marginTop: 2, background: macroSelected ? rowSelected : 'transparent' }}>
                    <button className="hs-row" onClick={() => toggleMacro(macro.id)} aria-pressed={macroSelected} aria-label={`Select ${macro.label}`} style={{ width: 'auto', padding: '10px 0' }}>
                      {checkbox(macroSelected ? 'all' : macroPartial ? 'some' : null)}
                    </button>
                    <button className="hs-row" onClick={() => toggleMacroExpand(macro.id)} aria-expanded={isMacroExpanded} style={{ flex: 1, minWidth: 0, padding: '10px 0' }}>
                      <span aria-hidden="true" style={{ width: 12, color: t.textFaint, fontSize: 11, flexShrink: 0 }}>{isMacroExpanded ? '▾' : '▸'}</span>
                      <span className="hs-name" style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: t.text }}>
                        <span style={{ color: t.textFaint, marginRight: 6 }}>{macro.num ?? mi + 1}</span>{macro.label}
                      </span>
                      {statCell(macroAttempted, macroTotal, macroPct)}
                    </button>
                  </div>

                  {isMacroExpanded && macro.topics.map((topicName, ti) => {
                    const tg = normTopicGroups[topicName]
                    if (!tg) return null
                    const subs = normTopicToSubs[topicName] || []
                    const topicSel = subs.length > 0 && subs.every(s => selectedSubtopics.includes(s))
                    const topicPartial = !topicSel && subs.some(s => selectedSubtopics.includes(s))
                    return (
                      <button key={topicName} className="hs-row" onClick={() => toggleNormTopic(topicName)} aria-pressed={topicSel} title={topicName}
                        style={{ padding: '8px 16px 8px 38px', background: topicSel ? rowSelected : 'transparent' }}>
                        {checkbox(topicSel ? 'all' : topicPartial ? 'some' : null, 15)}
                        <span className="hs-name" style={{ flex: 1, minWidth: 0, fontSize: 13, color: t.text }}>
                          {macro.num ?? mi + 1}.{ti + 1} {topicName}
                        </span>
                        {statCell(tg.attempted, tg.total, topicAccuracy([tg]))}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div className="hs-mobile-cards">
            <TutorInvitesCard />
            <DiagnosticResultsCard />
            <AssignedTasksCard />
            <ClassResourcesCard />
            <ExamCountdownCard />
            <WeakestTopicsCard />
          </div>
        </div>

        <div className="hs-right">
          {renderBuilder()}
          <TutorInvitesCard />
          <DiagnosticResultsCard />
          <AssignedTasksCard />
          <ClassResourcesCard />
          <ExamCountdownCard />
          <WeakestTopicsCard />
        </div>
      </div>
    </div>
  )
}
