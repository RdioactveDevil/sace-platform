import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Zap, TriangleAlert, CircleCheck, Bot, Flame, Timer, Pin, Lightbulb, Lock, ChevronDown, ChevronRight, Flag } from 'lucide-react'
import {
  selectNextQuestion,
  dueQuestionIds,
  DUE_PER_SESSION,
  nextReviewTime,
  calcXP,
  calcRemediationXP,
  getRemediationCompletionBonus,
  getLevelProgress,
  rankAccuracy,
  sessionWrongIds,
  getQuestionConceptTag,
  seenQuestionChecker,
  questionContentKey,
  ASSIGNMENT_DIFFICULTIES,
  assignmentStanding,
  applyAssignmentAnswer,
} from '../lib/engine'
import {
  recordAnswer,
  addXP,
  createSession,
  getRemediationVariants,
  storeRemediationVariants,
  fetchAndPersistMoreQuestions,
  incrementQuestionVariantUsage,
  flagQuestion,
  reportQuestion, reportOffCourse,
  flagTopicForStudyPlan,
  completeAssignment,
  recordAssignmentAnswer,
  notifyAssignmentFinished,
} from '../lib/db'
import { THEMES } from '../lib/theme'
import { getTopicCodeByName, resolveManagedSubjectName } from '../lib/adminTopics'
import {
  withTimeout,
  normalizeVariantRecord,
  generateRemediationVariantsViaAI,
  runEnterRemediation,
  runGenerateRemediationQueue,
  runLoadNextRemediationQuestion,
  REMEDIATION_DB_TIMEOUT_MS,
} from '../lib/remediation'
import MathText from './MathText'
import { parseLatexJson } from '../lib/mathMarkup'
import GraphView from './GraphView'
import TableView from './TableView'
import DiagramView from './DiagramView'
import PassageView from './PassageView'
import QuizToolsDock, { toolsForSubject } from './QuizToolsDock'
import QuestionRenderer from './questions/QuestionRenderer'
import { getQuestionType, describeCorrectAnswer, gradeResponse, responseIsComplete, isAiMarked } from '../lib/questionTypes'
import { buildQuestionHelpContext, describeResponse } from '../lib/questionHelp'
import { consolidationRound, CONSOLIDATION_STREAK, CONSOLIDATION_MAX_QUESTIONS } from '../lib/consolidation'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
// Question-area width from which a reading passage sits beside the question
// (a ~340px question column + gap + a comfortable reading column). Laptops at
// 125% zoom only have ~890px here, and stacking the passage inside the 600px
// question card there left wide empty margins.
const SIDE_PASSAGE_MIN_WIDTH = 760
// Start generating more questions in the background once this few questions
// new to the student are left in the session.
const PREFETCH_LOW_WATER = 8
const NAVY = '#0c1037'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

/**
 * Derive a target difficulty (1–5) from the student's session performance.
 * Returns null only before the first main-quiz answer.
 *
 * The target ratchets off the student's *demonstrated competence ceiling* —
 * the hardest question they have answered correctly this session — rather than
 * the average difficulty of whatever questions happened to be served. Anchoring
 * on the served average created a feedback trap: a run of easy questions kept
 * the average (and therefore the target) low, so the level could never climb
 * even when every answer was correct.
 *
 * Logic:
 *   recent accuracy ≥ 70% → push one level above the demonstrated ceiling
 *   recent accuracy ≤ 40% → ease one level below the ceiling
 *   otherwise             → hold at the demonstrated ceiling
 */
// Session XP can go negative (wrong answers cost XP): show "-12", not "+-12".
const signedXP = (n) => (n < 0 ? String(n) : `+${n}`)

function getTargetDifficulty(sessionResults, questions) {
  const mainResults = (sessionResults || []).filter(r => !r.remediation)
  if (mainResults.length < 1) return null

  const recent = mainResults.slice(-5)
  const accuracy = recent.filter(r => r.correct).length / recent.length

  const correctDiffs = mainResults
    .filter(r => r.correct)
    .flatMap(r => {
      const q = (questions || []).find(qq => qq.id === r.id)
      return q?.difficulty ? [q.difficulty] : []
    })
  const ceiling = correctDiffs.length > 0 ? Math.max(...correctDiffs) : 1

  if (accuracy >= 0.7) return Math.min(5, ceiling + 1)
  if (accuracy <= 0.4) return Math.max(1, ceiling - 1)
  return Math.min(5, ceiling)
}

async function generateConceptBuilderViaAI(parentQuestion, conceptTag) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const correctAnswer = parentQuestion.options?.[parentQuestion.answer_index] || ''
    const subjectLabel = parentQuestion?.subject || 'school'
    const system = [
      `You are a ${subjectLabel} teacher generating a concept-builder question for a struggling student.`,
      'Return only a valid JSON object (not an array).',
      'The question MUST embed the key fact or hint directly in the question stem — like a teacher explaining in class.',
      'Structure: state the core concept or mechanism first, then ask the student to apply it.',
      'Make it feel like a teacher leading the student step-by-step to the answer.',
      'Required keys: question, options (array of exactly 4 strings), answer_index, solution, tip,',
      'difficulty (always 1), topic, subtopic, concept_tag, variant_type (always "concept_builder").',
      'No markdown, no commentary outside the JSON.',
      'Write all maths in LaTeX inside $...$, escaping backslashes for JSON (e.g. "$\\\\frac{1}{2}$").',
    ].join(' ')

    const user = [
      `Topic: ${parentQuestion.topic}`,
      `Subtopic: ${parentQuestion.subtopic}`,
      `Concept: ${conceptTag}`,
      `Original question: ${parentQuestion.question}`,
      `Correct answer: ${correctAnswer}`,
      `Key explanation: ${parentQuestion.solution}`,
      '',
      'Generate ONE concept-builder question in this style:',
      '"Alcohols contain an -OH group which forms hydrogen bonds with water molecules.',
      ' Based on this property, short-chain alcohols are: A. soluble in water  B. insoluble in water  C. only soluble when heated  D. soluble only in organic solvents"',
      '',
      'The hint/concept MUST be in the question stem itself. Make the student reason from the hint to the answer.',
    ].join('\n')

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })

    clearTimeout(timeout)
    if (!res.ok) return null

    const data = await res.json()
    const rawText = data?.content?.[0]?.text || ''

    // Parse single JSON object
    try {
      const parsed = parseLatexJson(rawText)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {}

    // Try extracting object from text
    const start = rawText.indexOf('{')
    const end = rawText.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        const parsed = parseLatexJson(rawText.slice(start, end + 1))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
      } catch {}
    }
    return null
  } catch {
    return null
  }
}

/**
 * One line above the card while a student practises a question they missed:
 * what's happening, and their run of right answers as dots. Its status
 * changes the message (done, struggling, added to the study plan).
 */
function ExtraPracticeStrip({ streak, target, status, topic, onReturnToQuiz, theme = 'dark' }) {
  const t = THEMES[theme]
  const done = Math.min(streak, target)
  const message = status === 'generating'
    ? 'Getting practice questions like this one ready…'
    : status === 'complete'
      ? `${target} in a row. Back to your session next.`
      : status === 'struggling'
        ? "This one's tricky. Keep going with an easier question, or go back to your session."
        : status === 'needs_review'
          ? 'Added to your study plan to come back to. Continue to go back to your session.'
          : `${target} in a row${topic ? ` on ${topic}` : ''}, then back to your session`
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 14px', borderRadius: 10, background: t.bgCard, border: `1px solid ${status === 'complete' ? t.success : t.border}`, fontSize: 12.5 }}>
      <strong style={{ color: t.text }}>Extra practice</strong>
      <span style={{ color: t.textMuted, flex: 1, minWidth: 0 }}>{message}</span>
      {status === 'struggling' && onReturnToQuiz && (
        <button type="button" onClick={onReturnToQuiz} style={{ border: 'none', background: 'none', padding: 0, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, color: t.text, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: t.accent, textUnderlineOffset: 3 }}>
          Back to my session
        </button>
      )}
      <span aria-label={`${done} of ${target} right in a row`} style={{ display: 'inline-flex', gap: 4 }}>
        {Array.from({ length: target }, (_, i) => (
          <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', border: `1.5px solid ${i < done ? t.success : t.textMuted}`, background: i < done ? t.success : 'transparent' }} />
        ))}
      </span>
    </div>
  )
}

export default function QuizScreen({
  profile, setProfile, questions, struggleMap, setStruggleMap, onHome, theme = 'dark',
  // Exam mode: answers stay hidden until the summary, there's no remediation,
  // and the session ends after questionLimit questions (0 = no limit) or when
  // the timer runs out.
  examMode = false, timerSeconds = 0, questionLimit = 0, subjectTile,
  onOpenLearn,
  // A consolidation round from Titan AI ({ label, subtopics, canReturn }) and how to end it.
  consolidation, onEndConsolidation,
  currentQ: _currentQ, setCurrentQ,
  selected: _selected, setSelected,
  showAns: _showAns, setShowAns,
  correct: _correct, setCorrect,
  earnedXP: _earnedXP, setEarnedXP,
  streak: _streak, setStreak,
  sessionXP: _sessionXP, setSessionXP,
  sessionResults: _sessionResults, setSessionResults,
  sessionAnswered: _sessionAnswered, setSessionAnswered,
  qNumber: _qNumber, setQNumber,
  aiTip: _aiTip, setAiTip,
  loadingTip: _loadingTip, setLoadingTip,
  quizMode: _quizMode, setQuizMode,
  quizSubtopics: _quizSubtopics,
  // 'review' mode: the questions to go back over (a finished session's wrong answers).
  reviewIds: _reviewIds, setReviewIds,
  // This session's sessions row, recorded with each answer so History can group them.
  sessionId: _sessionId, setSessionId,
  remediationMode: _remediationMode, setRemediationMode,
  remediationStreak: _remediationStreak, setRemediationStreak,
  remediationTarget: _remediationTarget, setRemediationTarget,
  remediationQueue: _remediationQueue, setRemediationQueue,
  remediationStatus: _remediationStatus, setRemediationStatus,
  remediationSource: _remediationSource, setRemediationSource,
  remediationConcept: _remediationConcept, setRemediationConcept,
  remediationParentId: _remediationParentId, setRemediationParentId,
  remediationOriginalQ: _remediationOriginalQ, setRemediationOriginalQ,
  remediationUsedIds: _remediationUsedIds, setRemediationUsedIds,
  activeAssignment,
  onAssignmentComplete,
  onAssignmentProgress,
  onBankQuestionsAdded,
  finished: _finished, setFinished,
  sessionTip: _sessionTip, setSessionTip,
  sessionTipLoading: _sessionTipLoading, setSessionTipLoading,
  onGoToStudyPlan,
  // Free subject only: { used, limit, onAnswered, onUpgrade } — questions answered today.
  freeQuota = null,
}) {
  const t = THEMES[theme]
  // Every answered question in the free subject counts toward today's limit.
  const recordAnswerCounted = (...args) => {
    freeQuota?.onAnswered?.()
    return recordAnswer(...args)
  }
  /** Award an answer's XP (server-side) and show the new totals; never throws. */
  const awardAnswerXP = (xpEarned, newStreak, isCorrect) =>
    addXP(profile.id, xpEarned, newStreak, profile, isCorrect)
      .then(({ xp, streak, best_streak, recent_correct, recent_answers }) => setProfile(p => ({
        ...p,
        xp,
        // The day streak (award_xp works it out), not this quiz's run of right answers.
        ...(streak != null && { streak, best_streak, last_active: new Date().toISOString() }),
        ...(recent_answers != null && { recent_correct, recent_answers }),
      })))
      .catch(() => {})

  const [floatXP, setFloatXP] = useState(null)
  // The question on screen was served because it was due back for review.
  const [dueBackId, setDueBackId] = useState(null)
  // Exam mode picks its questions up front so students can move between them,
  // change answers and flag ones to come back to. Everything is graded at the end.
  const [examSet, setExamSet] = useState([])             // the exam's questions, in order
  const [examIndex, setExamIndex] = useState(0)
  const [examResponses, setExamResponses] = useState({}) // question id → response
  const [examFlags, setExamFlags] = useState(() => new Set())
  const [examTimes, setExamTimes] = useState({})         // question id → ms spent on it
  const [showFinishExam, setShowFinishExam] = useState(false)
  const examGradedRef = useRef(false)
  const finishExamRef = useRef(null)
  // "Something wrong with this question?" menu, and what was sent from it.
  const [reportMenuOpen, setReportMenuOpen] = useState(false)
  const [reportThanks, setReportThanks] = useState(false)
  const [showExit, setShowExit] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 860)
  // Width of the question area, to decide whether a passage fits beside the question.
  const [questionAreaEl, setQuestionAreaEl] = useState(null)
  const [questionAreaWidth, setQuestionAreaWidth] = useState(0)
  const [generatingMore, setGeneratingMore] = useState(false)
  // Human-readable reason the last auto-generation attempt failed, shown on the
  // session summary so a silent empty/errored top-up is diagnosable.
  const [generationError, setGenerationError] = useState(null)
  // Bumped on every in-summary session restart so the bank-exhaustion effect
  // re-evaluates even when `finished` stays true across the restart (pool was
  // already empty: setFinished(false) + loadNext→setFinished(true) batch to a
  // true→true non-transition that would otherwise never re-fire the effect).
  const [sessionEpoch, setSessionEpoch] = useState(0)
  const generatingMoreRef = useRef(false)
  const bankExhaustionAttempted = useRef(false)
  const backgroundPrefetchAttempted = useRef(false)
  const [flaggedMap, setFlaggedMap] = useState({}) // { [questionId]: Set of flag_types }
  const [flagging, setFlagging] = useState(null)   // currently-saving flag tag
  const [reporting, setReporting] = useState(false)
  const [reportedIds, setReportedIds] = useState(new Set())
  const [remediationWrongCount, setRemediationWrongCount] = useState(0)
  const [remediationDifficultyTarget, setRemediationDifficultyTarget] = useState(null)
  const [assignmentsCompleted, setAssignmentsCompleted] = useState([])
  // The assignment's standing once the RPC confirms it is complete. Kept
  // locally because App clears activeAssignment as soon as it completes.
  const [completedGoal, setCompletedGoal] = useState(null)
  const [endedForGoal, setEndedForGoal] = useState(false)
  // The exam ended on its question count or its timer, not the bank running out.
  const [endedForExam, setEndedForExam] = useState(false)
  // The student pressed End Session (also not the bank running out).
  const [endedEarly, setEndedEarly] = useState(false)
  // Rows opened in the summary's answer list.
  const [openAnswers, setOpenAnswers] = useState(() => new Set())
  const [timeLeft, setTimeLeft] = useState(timerSeconds)
  const sessionCompletedRef = useRef(false)
  const startTime = useRef(null)
  // Maps variant_record_id -> promise of its real questions.id (null if the
  // server's answer-key check rejected it); lets handleAnswer record variant
  // attempts even when the question was served before it was saved.
  const pendingBankIdsRef = useRef(new Map())
  // Per-question prefetched DB variants — filled in the background while
  // the student reads the question, consumed by enterRemediation.
  const variantPrefetchRef = useRef(new Map())
  // Concept tags already pre-warmed this session — prevents duplicate work.
  const sessionPrewarmedRef = useRef(new Set())
  // Subtopics a background top-up returned nothing for; skipped for the rest
  // of the session so a topic that can't generate isn't retried every answer.
  const prefetchBarrenSubtopicsRef = useRef(new Set())

  useEffect(() => {
    const h = () => { setIsMobile(window.innerWidth < 860) }
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => {
    if (!questionAreaEl || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setQuestionAreaWidth(entry.contentRect.width))
    ro.observe(questionAreaEl)
    return () => ro.disconnect()
  }, [questionAreaEl])

  // Reset timer when a new exam session starts
  useEffect(() => { setTimeLeft(timerSeconds) }, [timerSeconds])

  // Fixing an exam's wrong answers afterwards is ordinary practice: answers
  // shown, no clock.
  const examRun = examMode && _quizMode !== 'review'

  // Countdown tick — auto-ends session when time expires
  // Uses _finished (prop) not finished (const declared later) to avoid TDZ
  useEffect(() => {
    if (!examRun || timerSeconds <= 0 || _finished) return
    if (timeLeft <= 0) { finishExamRef.current?.(); return }
    const id = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [examRun, timerSeconds, _finished, timeLeft])

  const currentQ = _currentQ ?? null
  const selected = _selected ?? null
  const showAns = _showAns ?? false
  const correct = _correct ?? null
  const earnedXP = _earnedXP ?? 0
  const streak = _streak ?? 0
  const sessionXP = _sessionXP ?? 0
  const sessionResults = _sessionResults ?? []
  const sessionAnswered = _sessionAnswered ?? []
  const qNumber = _qNumber ?? 1
  const aiTip = _aiTip ?? ''
  const loadingTip = _loadingTip ?? false
  const quizMode = _quizMode ?? 'new'
  const quizSubtopics = Array.isArray(_quizSubtopics) ? _quizSubtopics : []
  const reviewIds = Array.isArray(_reviewIds) ? _reviewIds : []
  const sessionId = _sessionId ?? null
  const effectiveSubtopics = consolidation ? consolidation.subtopics : quizSubtopics
  const round = consolidation ? consolidationRound(sessionResults) : null
  const remediationMode = _remediationMode ?? false
  const remediationStreak = _remediationStreak ?? 0
  const remediationTarget = _remediationTarget ?? 3

  // Tutor-set goal for the assignment that launched this session: a question
  // count, optionally a pass mark. Legacy assignments have no question_count.
  const assignmentStand = assignmentStanding(activeAssignment)
  const assignmentBand = ASSIGNMENT_DIFFICULTIES[activeAssignment?.difficulty] || null
  const goalReached = !endedForGoal && (!!completedGoal || !!assignmentStand?.complete)
  const goalDisplay = completedGoal || assignmentStand
  // A tutor can run an assignment as a straight quiz, without remediation.
  // Nor inside a consolidation round: the round already is targeted practice on
  // that concept, and remediation on each miss could keep a struggling student
  // in it indefinitely.
  const remediationAllowed = activeAssignment?.remediation !== false && !consolidation && !examRun
  const targetDifficultyFor = (results) =>
    assignmentBand ? assignmentBand.target : getTargetDifficulty(results, questions)
  // Background top-ups for a student working at 4+ ask for exam-grade questions
  // (the server decides whether the subject and allowance permit it). Never
  // while the student is waiting: exam-grade takes minutes.
  const wantsExamGrade = (diff) => diff != null && diff >= 4
  const remediationQueue = Array.isArray(_remediationQueue) ? _remediationQueue : []
  const remediationStatus = _remediationStatus ?? 'idle'
  const remediationSource = _remediationSource ?? 'prebuilt'
  const remediationConcept = _remediationConcept ?? null
  const remediationParentId = _remediationParentId ?? null
  const remediationOriginalQ = _remediationOriginalQ ?? null
  const remediationUsedIds = Array.isArray(_remediationUsedIds) ? _remediationUsedIds : []
  const finished = _finished ?? false
  const sessionTip = _sessionTip ?? ''
  const sessionTipLoading = _sessionTipLoading ?? false


  const handleFlag = async (tag) => {
    if (!currentQ || flagging) return
    const qid = currentQ.is_variant ? (currentQ.parent_question_id || currentQ.id) : currentQ.id
    setFlagging(tag)
    try {
      await flagQuestion(profile.id, qid, tag)
      setFlaggedMap(prev => {
        const existing = new Set(prev[qid] || [])
        existing.add(tag)
        return { ...prev, [qid]: existing }
      })
    } catch {}
    setFlagging(null)
  }

  // "It's not in my course" goes to the subject's course review in Admin (curriculum subjects only).
  const curriculumIdForReports = typeof subjectTile?.id === 'string' && subjectTile.id.startsWith('curriculum_') ? subjectTile.id.slice('curriculum_'.length) : null
  // Question ids reported as not in the student's course this session.
  const [offCourseIds, setOffCourseIds] = useState(() => new Set())
  const handleOffCourse = async () => {
    if (!currentQ || !curriculumIdForReports) return
    const backendId = currentQ.is_variant ? (currentQ.parent_question_id || currentQ.id) : currentQ.id
    try {
      await reportOffCourse(backendId, curriculumIdForReports)
      setOffCourseIds(prev => new Set([...prev, currentQ.id]))
    } catch {}
  }

  const handleReport = async () => {
    if (!currentQ || reporting) return
    // Track the "reported" indicator per concrete question instance so it never
    // bleeds onto a different (e.g. "next similar") question. Variants aren't in
    // the bank, so the backend verifies their parent row instead.
    const reportKey = currentQ.id
    if (!reportKey || reportedIds.has(reportKey)) return
    const backendId = currentQ.is_variant ? (currentQ.parent_question_id || currentQ.id) : currentQ.id
    if (!backendId) return
    setReporting(true)
    try {
      await reportQuestion(backendId)
      setReportedIds(prev => new Set([...prev, reportKey]))
    } catch {}
    setReporting(false)
  }

  const setDisplayQuestion = useCallback((q) => {
    setFinished(false)
    setCurrentQ(q)
    setSelected(null)
    setShowAns(false)
    setCorrect(null)
    setEarnedXP(0)
    setAiTip('')
    startTime.current = Date.now()
  }, [setAiTip, setCorrect, setCurrentQ, setEarnedXP, setSelected, setShowAns])

  // `review` is the list to draw from in 'review' mode; starting a review
  // passes it in, since the reviewIds prop only updates on the next render.
  const loadNext = useCallback((answered, map, mode = 'new', subtopics = [], targetDiff = null, review = reviewIds) => {
    // A consolidation round ends once it has its run of right answers or its
    // question count. Remediation for the last answer finishes first: it calls
    // this when it's done.
    if (consolidation && consolidationRound(sessionResults).done) {
      setFinished(true)
      return
    }
    // Practice opens with questions due back for review (up to DUE_PER_SESSION),
    // whatever the mode, then carries on as chosen. Not for reviews, exams
    // (they pick their set up front), assignments or consolidation rounds.
    if (mode !== 'review' && !consolidation && !activeAssignment && answered.length < DUE_PER_SESSION) {
      const [dueId] = dueQuestionIds(questions, map, { subtopics, exclude: answered, limit: 1 })
      const dueQ = dueId && questions.find(q => q.id === dueId)
      if (dueQ) {
        setDueBackId(dueQ.id)
        setDisplayQuestion(dueQ)
        return
      }
    }
    setDueBackId(null)
    // Reviewing a session's wrong answers: just those, each once.
    const pool = mode === 'review' ? questions.filter(q => review.includes(q.id)) : questions
    const q = selectNextQuestion(
      pool, map, answered, mode === 'review' ? 'all' : mode, subtopics,
      assignmentBand ? assignmentBand.target : targetDiff, assignmentBand,
    )
    if (!q) {
      setFinished(true)
      return
    }
    setDisplayQuestion(q)
  }, [questions, setDisplayQuestion, assignmentBand, consolidation, sessionResults, reviewIds, activeAssignment])

  const clearRemediation = useCallback(() => {
    setRemediationMode(false)
    setRemediationStreak(0)
    setRemediationTarget(3)
    setRemediationQueue([])
    setRemediationStatus('idle')
    setRemediationSource('prebuilt')
    setRemediationConcept(null)
    setRemediationParentId(null)
    setRemediationOriginalQ(null)
    setRemediationUsedIds([])
    setRemediationWrongCount(0)
    setRemediationDifficultyTarget(null)
  }, [
    setRemediationConcept,
    setRemediationMode,
    setRemediationOriginalQ,
    setRemediationParentId,
    setRemediationQueue,
    setRemediationSource,
    setRemediationStatus,
    setRemediationStreak,
    setRemediationTarget,
    setRemediationUsedIds,
    setRemediationWrongCount,
  ])

  // Flags the current remediation topic for study plan and exits remediation.
  // Used by the "Return to Quiz" button in the 'struggling' toast (option F+G).
  const handleReturnToQuiz = useCallback(async () => {
    const q = remediationOriginalQ
    if (q) {
      try {
        await flagTopicForStudyPlan(profile.id, {
          subject: q.subject,
          topic: q.topic,
          subtopic: q.subtopic,
          concept_tag: remediationConcept,
          reason: 'remediation_gave_up',
        })
      } catch {}
    }
    clearRemediation()
    setQNumber(n => n + 1)
    const _targetDiff = getTargetDifficulty(sessionResults, questions)
    setStruggleMap(prev => { loadNext(sessionAnswered, prev, quizMode, effectiveSubtopics, _targetDiff); return prev })
  }, [clearRemediation, effectiveSubtopics, loadNext, profile.id, quizMode, questions, remediationConcept, remediationOriginalQ, sessionAnswered, sessionResults, setQNumber, setStruggleMap])

  // "Has this student already answered this question?" (by id or by content),
  // so remediation never re-serves a question from an earlier session. Kept in
  // a ref too, for async lookups that outlive the render they started in.
  const isSeenQuestion = useMemo(() => seenQuestionChecker(questions, struggleMap), [questions, struggleMap])
  const isSeenRef = useRef(isSeenQuestion)
  isSeenRef.current = isSeenQuestion

  // Bank questions remediation may draw "similar questions" from: not seen
  // before and not answered this session.
  const unseenBankQuestions = useMemo(
    () => questions.filter(q => !isSeenQuestion(q) && !sessionAnswered.includes(q.id)),
    [questions, isSeenQuestion, sessionAnswered],
  )

  // Stored remediation variants minus any the student has already answered
  // (a variant's bank copy shares its content key).
  const getUnseenRemediationVariants = async (...args) => {
    const result = await getRemediationVariants(...args)
    const unseen = (list) => (list || []).filter(v => !isSeenRef.current(v))
    return { directVariants: unseen(result?.directVariants), conceptVariants: unseen(result?.conceptVariants) }
  }

  const remediationDeps = {
    getRemediationVariants: getUnseenRemediationVariants,
    generateAIVariants: generateRemediationVariantsViaAI,
    storeVariants: storeRemediationVariants,
    dbTimeoutMs: REMEDIATION_DB_TIMEOUT_MS,
  }

  const generateRemediationQueue = useCallback(
    async (parentQuestion, existingUsedIds = [], difficultyTarget = null, options = {}) =>
      runGenerateRemediationQueue({
        parentQuestion,
        existingUsedIds,
        sessionAnsweredIds: sessionAnswered,
        difficultyTarget,
        options,
        questions: unseenBankQuestions,
        deps: remediationDeps,
        setRemediationStatus,
        setRemediationQueue,
        setRemediationSource,
        pendingBankIds: pendingBankIdsRef.current,
        onBankQuestionsAdded,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unseenBankQuestions, sessionAnswered, setRemediationQueue, setRemediationSource, setRemediationStatus, onBankQuestionsAdded],
  )

  const enterRemediation = useCallback(
    async (parentQuestion) =>
      runEnterRemediation({
        parentQuestion,
        prefetched: variantPrefetchRef.current,
        questions: unseenBankQuestions,
        deps: remediationDeps,
        setRemediationMode,
        setRemediationStreak,
        setRemediationTarget,
        setRemediationDifficultyTarget,
        setRemediationSource,
        setRemediationConcept,
        setRemediationParentId,
        setRemediationOriginalQ,
        setRemediationUsedIds,
        setRemediationQueue,
        setRemediationStatus,
        generateRemediationQueue,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      unseenBankQuestions,
      generateRemediationQueue,
      setRemediationConcept,
      setRemediationMode,
      setRemediationOriginalQ,
      setRemediationParentId,
      setRemediationQueue,
      setRemediationSource,
      setRemediationStatus,
      setRemediationStreak,
      setRemediationTarget,
      setRemediationUsedIds,
      setRemediationWrongCount,
    ],
  )

  // Start a sessions row for the answers that follow. Cleared first, so a
  // failed insert can't leave them filed under the previous session.
  const beginSession = async () => {
    setSessionId?.(null)
    try {
      const row = await createSession(profile.id, subjectTile?.name || questions[0]?.subject || 'Unknown')
      setSessionId?.(row?.id ?? null)
    } catch {}
  }

  useEffect(() => {
    if (!_currentQ) {
      beginSession()
      if (examRun) startExam()
      else loadNext([], struggleMap, quizMode, effectiveSubtopics)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_currentQ, loadNext, profile.id, quizMode, quizSubtopics, struggleMap, consolidation])

  // Count a main-question answer toward the assignment goal. App holds the
  // running state (updated here the same way the RPC updates the row) so it
  // survives this screen remounting; the RPC decides completion.
  // The question, response and time go into the tutor's assignment report.
  // Reviewing wrong answers is practice: redoing a miss mustn't count.
  const countAssignmentAnswer = (isCorrect, response, timeMs, questionId = currentQ?.id) => {
    if (!activeAssignment?.question_count || quizMode === 'review') return
    const next = applyAssignmentAnswer(activeAssignment, isCorrect)
    onAssignmentProgress?.({ progress_count: next.progress_count, recent_results: next.recent_results })
    const id = activeAssignment.id
    recordAssignmentAnswer(id, isCorrect, { questionId, response, timeMs })
      .then(row => {
        if (!row?.completed_at) return
        setCompletedGoal(assignmentStanding({ ...next, ...row }))
        setAssignmentsCompleted([{ id }])
        onAssignmentComplete?.()
        notifyAssignmentFinished(id).catch(() => {})
      })
      .catch(() => {})
  }

  // Legacy assignments (no question_count): complete when the session ends,
  // provided the student actually answered at least one question.
  useEffect(() => {
    const sessionEnded = finished || (sessionResults.length > 0 && !_currentQ)
    if (!sessionEnded) return
    if (sessionCompletedRef.current) return
    if (!activeAssignment || activeAssignment.question_count) return
    if (quizMode === 'review') return
    if (sessionResults.length === 0) return  // guard: no questions answered, don't auto-complete
    sessionCompletedRef.current = true

    const id = activeAssignment.id
    completeAssignment(id)
      .then(() => {
        setAssignmentsCompleted([{ id }])
        onAssignmentComplete?.()
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, _currentQ, sessionResults.length, activeAssignment])

  // Reset completion ref when a new session starts
  useEffect(() => {
    if (!finished && _currentQ) sessionCompletedRef.current = false
  }, [_currentQ, finished])

  // Resolve the generation target (canonical subject + topic code) for the
  // bank exhaustion / prefetch handlers. Question rows can store alias
  // spellings of the curriculum name, so the subject is resolved against the
  // managed topics cache; the user's selected subtopics take priority over
  // the last-answered question so a session that starts on an already
  // exhausted subtopic still generates for the right one.
  //
  // Returns { subject, topicCode } on success, or { error } with a
  // human-readable reason so the caller can surface WHY generation could not
  // even start (most often: the managed-topics cache is empty/stale, or the
  // question's subtopic label doesn't match a curriculum subtopic).
  const getGenerationTarget = (subtopicOverride = null) => {
    const lastMain = [...sessionResults].reverse().find(r => !r.remediation)
    const lastQ =
      (lastMain ? questions.find(q => q.id === lastMain.id) : null) ||
      (effectiveSubtopics.length > 0
        ? questions.find(q => effectiveSubtopics.includes(q.subtopic))
        : null) ||
      questions[0]
    // The selected subject tile is the authoritative identity of the curriculum
    // this session belongs to (it carries the stage). Resolve the subject from
    // it first — disambiguating bare titles when both Stage 1 and Stage 2 of the
    // same subject are managed — and fall back to the question row's spelling.
    const stageHint = subjectTile?.stage || ''
    const rawSubject = subjectTile?.name || lastQ?.subject
    const subject =
      resolveManagedSubjectName(subjectTile?.name || '', stageHint) ||
      resolveManagedSubjectName(lastQ?.subject || '', stageHint) ||
      rawSubject
    const subtopicName =
      subtopicOverride ||
      (lastQ?.subtopic && (effectiveSubtopics.length === 0 || effectiveSubtopics.includes(lastQ.subtopic))
        ? lastQ.subtopic
        : effectiveSubtopics[0])
    if (!subject || !subtopicName) {
      return { error: `Could not determine the topic to generate for (subject="${rawSubject ?? ''}", subtopic="${subtopicName ?? ''}").` }
    }
    const topicCode = getTopicCodeByName(subject, subtopicName, stageHint)
    if (!topicCode) {
      const known = resolveManagedSubjectName(subject, stageHint)
      const reason = known
        ? `This subtopic ("${subtopicName}") isn't in the curriculum's topic list, so new questions can't be generated for it.`
        : `This subject ("${rawSubject}") isn't set up as a managed curriculum, so new questions can't be generated for it.`
      return { error: reason }
    }
    return { subject, topicCode }
  }

  // Bank exhaustion: when 'new' or 'all' (Repeat selected) mode runs out of
  // questions, generate more via AI and persist them directly to the live
  // questions table so they're reusable.
  useEffect(() => {
    if (!finished || (quizMode !== 'new' && quizMode !== 'all')) return
    // Ending on an assignment's question count or a consolidation round's end
    // is not the bank running out. (The round's end is read from the results,
    // which are settled by now, not from state set alongside `finished`.)
    if (endedForGoal || endedForExam || endedEarly || round?.done) return
    if (generatingMoreRef.current) return
    // Only attempt generation once per session to prevent infinite retry loops.
    if (bankExhaustionAttempted.current) return

    const target = getGenerationTarget()
    if (!target || target.error) {
      // Couldn't even start generation — surface the reason on the summary
      // instead of silently ending the session with no explanation.
      if (target?.error) {
        bankExhaustionAttempted.current = true
        setGenerationError(target.error)
      }
      return
    }
    const { subject, topicCode } = target

    generatingMoreRef.current = true
    bankExhaustionAttempted.current = true
    // Also mark prefetch done so we don't double-generate.
    backgroundPrefetchAttempted.current = true
    setGenerationError(null)
    setGeneratingMore(true)
    setFinished(false)

    // Derive target difficulty from recent session performance.
    const exhaustionDiff = targetDifficultyFor(sessionResults)

    // Request a healthy batch (6) up front: generation + answer-key
    // verification + duplicate filtering all shed some questions, so asking for
    // only 3 can legitimately net zero on a small topic. If the first attempt
    // returns nothing, retry once with a larger batch before giving up.
    const generateWithRetry = async () => {
      let qs = await fetchAndPersistMoreQuestions(subject, topicCode, 6, exhaustionDiff)
      if (!qs.length) {
        qs = await fetchAndPersistMoreQuestions(subject, topicCode, 10, exhaustionDiff)
      }
      return qs
    }

    generateWithRetry()
      .then(newQs => {
        if (!newQs.length) {
          // Generation succeeded but produced no usable questions (all dropped
          // by verification/dedup). Surface it instead of silently ending.
          setGenerationError('No new questions could be generated for this topic right now. Please try again in a moment.')
          setFinished(true)
          return
        }
        if (typeof onBankQuestionsAdded === 'function') onBankQuestionsAdded(newQs)
        setDisplayQuestion(newQs[0])
        // Reset guards so the cycle can repeat when these questions run out.
        bankExhaustionAttempted.current = false
        backgroundPrefetchAttempted.current = false
        // Background top-up: generate 10 more while the user answers the batch.
        fetchAndPersistMoreQuestions(subject, topicCode, 10, exhaustionDiff, { examGrade: wantsExamGrade(exhaustionDiff) })
          .then(moreQs => {
            if (moreQs.length && typeof onBankQuestionsAdded === 'function') {
              onBankQuestionsAdded(moreQs)
            }
          })
          .catch(() => {})
      })
      .catch(err => {
        setGenerationError(err?.message || 'Question generation failed. Please try again.')
        setFinished(true)
      })
      .finally(() => {
        generatingMoreRef.current = false
        setGeneratingMore(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, sessionEpoch])

  // Background prefetch: when the questions still new to this student run low,
  // silently generate more in the background so the bank is replenished well
  // before they reach the end — they never see a loading screen or a repeat.
  useEffect(() => {
    if (finished || (quizMode !== 'new' && quizMode !== 'all')) return
    if (backgroundPrefetchAttempted.current || generatingMoreRef.current) return

    // Count questions still available to pick this session. In 'new' mode that's
    // questions the student hasn't seen (by id or content); in 'all' (Repeat
    // selected) mode every not-yet-answered question still counts.
    const pool = effectiveSubtopics.length > 0
      ? questions.filter(q => effectiveSubtopics.includes(q.subtopic))
      : questions
    const available = pool.filter(q => {
      if (sessionAnswered.includes(q.id)) return false
      if (quizMode === 'all') return true
      return !isSeenQuestion(q)
    })
    const remaining = available.length

    // Difficulty-gap trigger: as the student levels up, the bank often has no
    // questions near their current target (it was seeded mostly easy). Without
    // this, the difficulty would be stuck not because selection is wrong but
    // because there is nothing hard to select. Generate ahead when the target
    // has climbed to 3+ and fewer than 2 available questions sit near it.
    const prefetchDiff = targetDifficultyFor(sessionResults)
    const nearTargetCount = prefetchDiff == null
      ? null
      : available.filter(q => Math.abs((q.difficulty || 3) - prefetchDiff) <= 1).length
    const difficultyGap = prefetchDiff != null && prefetchDiff >= 3 && nearTargetCount < 2

    // Generation takes tens of seconds, so start while a comfortable buffer
    // is left rather than on the last few questions.
    if (remaining > PREFETCH_LOW_WATER && !difficultyGap) return

    // Top up the subtopic in this session that is closest to running out.
    const unseenBySubtopic = new Map()
    for (const q of pool) if (q.subtopic && !prefetchBarrenSubtopicsRef.current.has(q.subtopic)) unseenBySubtopic.set(q.subtopic, 0)
    for (const q of available) if (unseenBySubtopic.has(q.subtopic)) unseenBySubtopic.set(q.subtopic, unseenBySubtopic.get(q.subtopic) + 1)
    const lowestSubtopic = [...unseenBySubtopic.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] || null
    if (!lowestSubtopic && pool.some(q => q.subtopic)) return // every subtopic here came back empty

    // Background prefetch is silent: if the target can't be resolved, just skip
    // (the exhaustion handler surfaces the reason when the bank actually runs dry).
    const target = getGenerationTarget(lowestSubtopic)
    if (!target || target.error) return
    const { subject, topicCode } = target

    backgroundPrefetchAttempted.current = true

    // Fire-and-forget: no loading state, no UI change.
    fetchAndPersistMoreQuestions(subject, topicCode, 10, prefetchDiff, { examGrade: wantsExamGrade(prefetchDiff) })
      .then(newQs => {
        if (newQs.length && typeof onBankQuestionsAdded === 'function') {
          onBankQuestionsAdded(newQs)
        }
        if (!newQs.length && lowestSubtopic) prefetchBarrenSubtopicsRef.current.add(lowestSubtopic)
        // Reset so the prefetch can fire again when these questions run low.
        backgroundPrefetchAttempted.current = false
      })
      .catch(() => {
        // Silent failure — exhaustion handler will retry when the bank runs dry.
        if (lowestSubtopic) prefetchBarrenSubtopicsRef.current.add(lowestSubtopic)
        backgroundPrefetchAttempted.current = false
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAnswered.length])

  // Fetch one-sentence AI coaching tip when the session finishes.
  useEffect(() => {
    if (!finished) return
    if (!sessionResults || sessionResults.length === 0) return
    if (sessionTipLoading || sessionTip) return

    const mainResults = sessionResults.filter(r => !r.remediation)
    if (mainResults.length === 0) return

    const sessCorrect = mainResults.filter(r => r.correct).length
    const sessTotal = mainResults.length
    const wrongByTopic = {}
    mainResults.filter(r => !r.correct).forEach(r => {
      if (r.topic) wrongByTopic[r.topic] = (wrongByTopic[r.topic] || 0) + 1
    })
    const subjectName = questions[0]?.subject || 'this subject'

    setSessionTipLoading(true)
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        max_tokens: 120,
        system: "You are a supportive tutor. Write exactly ONE sentence of coaching advice based on this student's quiz session. Be specific, actionable, and encouraging. No preamble, no markdown.",
        messages: [{ role: 'user', content: `Subject: ${subjectName}. Questions answered: ${sessTotal}. Correct: ${sessCorrect}. Wrong by topic: ${JSON.stringify(wrongByTopic)}.` }],
      }),
    })
      .then(r => r.json())
      .then(d => setSessionTip(d?.content?.[0]?.text || ''))
      .catch(() => {})
      .finally(() => setSessionTipLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  // Prefetch DB variants for the current question while the student reads it
  // so enterRemediation can skip the live lookup. Bounded by withTimeout.
  useEffect(() => {
    if (!_currentQ || _currentQ.is_variant) return
    const qid = _currentQ.id
    if (variantPrefetchRef.current.has(qid)) return
    const ctag = _currentQ.concept_tag || getQuestionConceptTag(_currentQ)
    ;(async () => {
      try {
        const result = await withTimeout(
          getUnseenRemediationVariants(qid, ctag, []),
          3000,
          `prefetchVariants(${qid})`
        )
        variantPrefetchRef.current.set(qid, result || { directVariants: [], conceptVariants: [] })
      } catch {
        // Silent — not having a prefetch just means the live lookup runs on demand.
      }
    })()
  }, [_currentQ])

  // Post-session pre-warm: generate AI variants in the background for up to 3
  // wrong concepts that don't yet have enough stored variants. Populates the
  // bank for next session so future remediations don't need a fresh AI call.
  useEffect(() => {
    if (!finished) return
    if (!sessionResults || sessionResults.length === 0) return

    // Find unique parent questions the student got wrong (skip remediation
    // attempts — those are variants, not bank questions).
    const wrongParents = new Map() // concept_tag -> parent question
    sessionResults.forEach(r => {
      if (r.correct || r.remediation) return
      const q = questions.find(qq => qq.id === r.id)
      if (!q) return
      const tag = q.concept_tag || getQuestionConceptTag(q)
      if (!tag) return
      if (sessionPrewarmedRef.current.has(tag)) return
      if (!wrongParents.has(tag)) wrongParents.set(tag, q)
    })

    if (wrongParents.size === 0) return

    // Cap the burst at 3 concepts to limit API spend.
    const work = [...wrongParents.entries()].slice(0, 3)
    work.forEach(([tag]) => sessionPrewarmedRef.current.add(tag))

    ;(async () => {
      console.info(`[gradefarm] session-end: pre-warming variants for ${work.length} concept(s)`)
      await Promise.all(work.map(async ([tag, parent]) => {
        try {
          // Skip if the bank already has plenty of variants for this concept.
          const existing = await withTimeout(
            getRemediationVariants(parent.id, tag, []),
            3000,
            `prewarm-count(${tag})`
          )
          const have =
            (existing?.directVariants?.length || 0) +
            (existing?.conceptVariants?.length || 0)
          if (have >= 5) {
            console.info(`[gradefarm] prewarm skip "${tag}" — already has ${have} variants`)
            return
          }

          const { variants, batch, signature } = await generateRemediationVariantsViaAI(
            parent, tag, parent.difficulty
          )
          if (!variants.length || !batch) return

          // The server checks the answer keys and saves the ones that pass to
          // the bank and to question_variants, so getRemediationVariants finds
          // them next time a student gets this parent wrong.
          const { stored = [] } = await storeRemediationVariants(batch, signature)
          const bankRows = stored.map(s => s.question).filter(Boolean)
          if (bankRows.length && typeof onBankQuestionsAdded === 'function') {
            try { onBankQuestionsAdded(bankRows) } catch {}
          }

          console.info(`[gradefarm] pre-warmed ${bankRows.length}/${variants.length} variant(s) for "${tag}"`)
        } catch (err) {
          console.warn(`[gradefarm] prewarm failed for "${tag}":`, err?.message || err)
        }
      }))
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  // Leaving the quiz screen ends a consolidation round, back to the quiz they
  // were in. Read through a ref: the cleanup runs with the props of the last
  // render. (App ignores the call when no round is running.)
  const endConsolidationRef = useRef(onEndConsolidation)
  endConsolidationRef.current = onEndConsolidation
  useEffect(() => () => endConsolidationRef.current?.(), [])

  /** End the consolidation round now: back to the quiz they were in. */
  const leaveConsolidation = () => {
    generatingMoreRef.current = false
    bankExhaustionAttempted.current = false
    backgroundPrefetchAttempted.current = false
    setGeneratingMore(false)
    setGenerationError(null)
    setCompletedGoal(null)
    setEndedForGoal(false)
    setEndedEarly(false)
    setRemediationWrongCount(0)
    setRemediationDifficultyTarget(null)
    onEndConsolidation?.()
  }

  // Enter remediation after a wrong MAIN question. SYNCHRONOUS state only — must
  // run with no awaits before it (batched with setShowAns) so a fast "Next"
  // click can't read remediationMode === false and skip remediation entirely.
  const enterRemediationStateSync = (q) => {
    const conceptTagNow = q.concept_tag || getQuestionConceptTag(q)
    // Anchor the reinforcement pool on the difficulty the student just missed.
    const initialDiffTarget = q.difficulty ?? 3
    setRemediationMode(true)
    setRemediationStreak(0)
    setRemediationTarget(3)
    setRemediationWrongCount(0)
    setRemediationDifficultyTarget(initialDiffTarget)
    setRemediationStatus('generating') // keep the button disabled until queue is loaded
    setRemediationSource('prebuilt')
    setRemediationConcept(conceptTagNow)
    setRemediationParentId(q.id)
    setRemediationOriginalQ(q)
    setRemediationUsedIds([])
  }

  // SYNCHRONOUS remediation-variant decision: mastery streak / status /
  // wrong-count progression. Must run before any await (batched with
  // setShowAns) so a fast "Next" click can't bypass the mode change on
  // completion. Returns true when this answer completes remediation, so the
  // caller can award the bonus asynchronously.
  const decideRemediationVariantOutcome = (isCorrect) => {
    if (isCorrect) {
      const nextMastery = remediationStreak + 1
      setRemediationStreak(nextMastery)
      if (nextMastery >= remediationTarget) {
        setRemediationStatus('complete')
        return true
      }
      return false
    }
    // Concept-builder questions are exempt from the wrong count.
    if (currentQ.variant_type !== 'concept_builder') {
      setRemediationStreak(0)
      const newWrongCount = remediationWrongCount + 1
      setRemediationWrongCount(newWrongCount)
      setRemediationDifficultyTarget(remediationDifficultyTarget ?? (remediationOriginalQ?.difficulty ?? 3))

      if (newWrongCount >= 5) {
        setRemediationStatus('needs_review')
      } else if (newWrongCount === 3) {
        setRemediationTarget(1)
        setRemediationStatus('struggling')
      } else if (newWrongCount === 2) {
        setRemediationTarget(2)
        const tag = remediationOriginalQ?.concept_tag || getQuestionConceptTag(remediationOriginalQ)
        ;(async () => {
          const cb = await generateConceptBuilderViaAI(remediationOriginalQ, tag)
          if (!cb) return
          const normalized = {
            ...normalizeVariantRecord(remediationOriginalQ, cb, 0),
            is_variant: true,
            source: 'concept_builder',
            variant_type: 'concept_builder',
          }
          setRemediationQueue(prev => [normalized, ...prev])
        })()
      }
    }
    return false
  }

  // Async persistence for a remediation-variant answer (attempt tracking +
  // completion bonus). Runs AFTER the synchronous decision above, so it never
  // gates the Next button on a network round-trip.
  const persistRemediationVariantOutcome = async (isCorrect, selectedIndex, timeTakenMs, completed, newStreak, xpEarned) => {
    try { await incrementQuestionVariantUsage(currentQ.variant_record_id) } catch {}

    // Track the variant attempt against its real bank id so this question is
    // excluded from future non-'all' sessions. Only when we have a real
    // questions.id — synthetic queue keys would violate the struggle row's FK.
    // A freshly generated variant's id arrives once the server has checked and
    // saved it (null if it didn't pass).
    const contentKey = questionContentKey(currentQ)
    const pendingBankId = currentQ.variant_record_id && pendingBankIdsRef.current.get(currentQ.variant_record_id)
    const trackId =
      currentQ.bank_question_id ||
      (pendingBankId && await pendingBankId) ||
      // A stored variant's bank copy has the same content under its own id.
      (contentKey && questions.find(q => questionContentKey(q) === contentKey)?.id) ||
      null
    if (trackId) {
      try {
        await recordAnswerCounted(profile.id, trackId, isCorrect, selectedIndex ?? null, sessionId, timeTakenMs)
      } catch (recErr) {
        console.warn('[gradefarm] failed to record variant answer:', recErr?.message || recErr)
      }
      setStruggleMap(prev => {
        const old = prev[trackId] ?? { attempts: 0, wrong: 0 }
        return {
          ...prev,
          [trackId]: {
            ...old,
            attempts: old.attempts + 1,
            wrong: old.wrong + (isCorrect ? 0 : 1),
            last_seen: new Date().toISOString(),
          },
        }
      })
      setSessionAnswered(prev => prev.includes(trackId) ? prev : [...prev, trackId])
    }

    if (completed) {
      const bonus = getRemediationCompletionBonus()
      try {
        const { xp: newXP } = await addXP(profile.id, bonus, newStreak, { ...profile, xp: profile.xp + xpEarned })
        setProfile(p => ({ ...p, xp: newXP }))
        setSessionXP(s => s + bonus)
      } catch {}
    }
  }

  // End Session: show the summary for what was answered (nothing answered yet
  // means there's nothing to sum up, so go straight back to Practice).
  const endSession = () => {
    setShowExit(false)
    if (!sessionResults.some(r => !r.remediation)) { onHome(); return }
    clearRemediation()
    if (currentQ && showAns && !sessionAnswered.includes(currentQ.id)) setSessionAnswered([...sessionAnswered, currentQ.id])
    setEndedEarly(true)
    setFinished(true)
  }

  // Exam mode: the answer isn't shown, so answering moves straight on to the
  // next question, or ends the exam once it has its question count.
  const advanceExam = () => {
    const answered = [...sessionAnswered, currentQ.id]
    setSessionAnswered(answered)
    const mainAnswered = sessionResults.filter(r => !r.remediation).length + 1
    if (questionLimit > 0 && mainAnswered >= questionLimit) {
      setEndedForExam(true)
      setFinished(true)
      return
    }
    const targetDiff = getTargetDifficulty(sessionResults, questions)
    setQNumber(n => n + 1)
    setStruggleMap(prev => { loadNext(answered, prev, quizMode, effectiveSubtopics, targetDiff); return prev })
  }

  const handleAnswer = async (idx) => {
    if (showAns || !currentQ) return

    const isRemediationQuestion = !!currentQ.is_variant
    const isCorrect = idx === currentQ.answer_index
    const xpEarned = isRemediationQuestion
      ? calcRemediationXP(isCorrect, currentQ.difficulty)
      : calcXP(isCorrect, currentQ.difficulty, streak)
    const newStreak = isCorrect ? streak + 1 : 0
    const timeTakenMs = startTime.current ? Date.now() - startTime.current : null

    setSelected(idx)
    setShowAns(true)
    setCorrect(isCorrect)
    setEarnedXP(xpEarned)
    setStreak(newStreak)
    setSessionXP(s => s + xpEarned)
    setSessionResults(r => [...r, { id: currentQ.id, correct: isCorrect, topic: currentQ.topic, subtopic: currentQ.subtopic, remediation: isRemediationQuestion, response: idx, timeMs: timeTakenMs }])
    if (!isRemediationQuestion) countAssignmentAnswer(isCorrect, idx, timeTakenMs)

    if (isCorrect && !examRun) {
      setFloatXP(xpEarned)
      setTimeout(() => setFloatXP(null), 1400)
    }

    // Commit the remediation DECISION synchronously, batched with setShowAns,
    // so a fast "Next" click can never read stale state and skip remediation
    // entry (wrong main answer) or the completion mode-change (variant answer).
    let remediationCompleted = false
    if (isRemediationQuestion) {
      remediationCompleted = decideRemediationVariantOutcome(isCorrect)
    } else if (!isCorrect && !currentQ.passage_id && remediationAllowed) {
      // Reading-passage questions skip remediation: a generated "similar
      // question" would have no passage to answer from.
      enterRemediationStateSync(currentQ)
    }

    // The XP award and the answer record are independent writes; neither the
    // remediation queue nor the AI tip needs them, so don't make those wait.
    const xpWrite = awardAnswerXP(xpEarned, newStreak, isCorrect)

    if (isRemediationQuestion) {
      await xpWrite
      await persistRemediationVariantOutcome(isCorrect, idx, timeTakenMs, remediationCompleted, newStreak, xpEarned)
      return
    }

    setStruggleMap(prev => {
      const old = prev[currentQ.id] ?? { attempts: 0, wrong: 0 }
      return {
        ...prev,
        [currentQ.id]: {
          ...old,
          attempts: old.attempts + 1,
          wrong: old.wrong + (isCorrect ? 0 : 1),
          last_seen: new Date().toISOString(),
          // Same schedule the database sets, so a question just answered isn't still "due".
          next_review: nextReviewTime(old.attempts + 1, old.wrong + (isCorrect ? 0 : 1)).toISOString(),
        },
      }
    })

    const answerWrite = recordAnswerCounted(profile.id, currentQ.id, isCorrect, idx, sessionId, timeTakenMs)
      .catch(err => console.warn('[gradefarm] failed to record answer:', err?.message || err))

    if (examRun) {
      advanceExam()
      await Promise.all([xpWrite, answerWrite])
      return
    }

    if (!isCorrect) {
      // Remediation state was already set synchronously above. Load the queue in
      // the background — parallel with the AI tip fetch.
      if (!currentQ.passage_id && remediationAllowed) enterRemediation(currentQ)

      setLoadingTip(true)
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            max_tokens: 200,
            system: `You are a ${currentQ.subject || 'school'} tutor. Write exactly 2 sentences: one explaining the conceptual mistake, one giving a memory trick. No markdown. No preamble. Write any maths in LaTeX inside $...$.`,
            messages: [{ role: 'user', content: `Topic: ${currentQ.topic} — ${currentQ.subtopic}\nQ: ${currentQ.question}\nCorrect: ${currentQ.options[currentQ.answer_index]}\nStudent chose: ${currentQ.options[idx]}\nSolution: ${currentQ.solution}` }],
          }),
        })
        const d = await res.json()
        setAiTip(d.content?.[0]?.text || '')
      } catch {
        setAiTip('')
      }
      setLoadingTip(false)
    }
    await Promise.all([xpWrite, answerWrite])
  }

  // Outcome handler for non-MCQ question types (numeric, multi-select, short
  // text, ordering). The renderer grades the response and calls this with the
  // result. Mirrors the main-question path of handleAnswer, and routes
  // remediation variants through the same shared outcome handler so the mastery
  // streak advances for non-MCQ question types too.
  // Written answers also pass their marks ({ awarded, total }): full marks
  // count as right; part marks count as not yet right (the question comes back
  // for review) but earn that share of the XP instead of losing XP.
  const handleSubmitResponse = async (response, isCorrect, marks = null) => {
    if (showAns || !currentQ) return
    const isVariant = !!currentQ.is_variant
    const partMarks = !!marks && !isCorrect && marks.awarded > 0 && marks.total > 0
    const xpEarned = partMarks
      ? Math.max(1, Math.round(calcXP(true, currentQ.difficulty, 0) * marks.awarded / marks.total))
      : isVariant
        ? calcRemediationXP(isCorrect, currentQ.difficulty)
        : calcXP(isCorrect, currentQ.difficulty, streak)
    const newStreak = isCorrect ? streak + 1 : 0
    const timeTakenMs = startTime.current ? Date.now() - startTime.current : null

    setSelected(response)
    setShowAns(true)
    setCorrect(isCorrect)
    setEarnedXP(xpEarned)
    setStreak(newStreak)
    setSessionXP(s => s + xpEarned)
    setSessionResults(r => [...r, { id: currentQ.id, correct: isCorrect, topic: currentQ.topic, subtopic: currentQ.subtopic, remediation: isVariant, response, timeMs: timeTakenMs }])
    if (!isVariant) countAssignmentAnswer(isCorrect, response, timeTakenMs)

    if (isCorrect && !examRun) {
      setFloatXP(xpEarned)
      setTimeout(() => setFloatXP(null), 1400)
    }

    // Commit the remediation decision synchronously (batched with setShowAns) so
    // a fast "Next" click can't bypass the completion mode-change.
    let remediationCompleted = false
    if (isVariant) remediationCompleted = decideRemediationVariantOutcome(isCorrect)

    const xpWrite = awardAnswerXP(xpEarned, newStreak, isCorrect)

    // Remediation variant: persist attempt + completion bonus (decision already
    // committed above).
    if (isVariant) {
      await xpWrite
      await persistRemediationVariantOutcome(isCorrect, null, timeTakenMs, remediationCompleted, newStreak, xpEarned)
      return
    }

    setStruggleMap(prev => {
      const old = prev[currentQ.id] ?? { attempts: 0, wrong: 0 }
      return {
        ...prev,
        [currentQ.id]: {
          ...old,
          attempts: old.attempts + 1,
          wrong: old.wrong + (isCorrect ? 0 : 1),
          last_seen: new Date().toISOString(),
          // Same schedule the database sets, so a question just answered isn't still "due".
          next_review: nextReviewTime(old.attempts + 1, old.wrong + (isCorrect ? 0 : 1)).toISOString(),
        },
      }
    })

    const answerWrite = recordAnswerCounted(profile.id, currentQ.id, isCorrect, null, sessionId, timeTakenMs).catch(() => {})

    if (examRun) {
      advanceExam()
      await Promise.all([xpWrite, answerWrite])
      return
    }

    // Written answers already come back with mark-by-mark feedback.
    if (!isCorrect && !marks) {
      setLoadingTip(true)
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            max_tokens: 200,
            system: `You are a ${currentQ.subject || 'school'} tutor. Write exactly 2 sentences: one explaining the conceptual mistake, one giving a memory trick. No markdown. No preamble. Write any maths in LaTeX inside $...$.`,
            messages: [{ role: 'user', content: `Topic: ${currentQ.topic} — ${currentQ.subtopic}\nQ: ${currentQ.question}\nCorrect answer: ${describeCorrectAnswer(currentQ)}\nStudent answered: ${JSON.stringify(response)}\nSolution: ${currentQ.solution}` }],
          }),
        })
        const d = await res.json()
        setAiTip(d.content?.[0]?.text || '')
      } catch {
        setAiTip('')
      }
      setLoadingTip(false)
    }
    await Promise.all([xpWrite, answerWrite])
  }

  const loadNextRemediationQuestion = async () =>
    runLoadNextRemediationQuestion({
      remediationQueue,
      remediationOriginalQ,
      remediationUsedIds,
      remediationDifficultyTarget,
      remediationStreak,
      remediationTarget,
      questions: unseenBankQuestions,
      deps: remediationDeps,
      setRemediationQueue,
      setRemediationSource,
      setRemediationStatus,
      setRemediationUsedIds,
      setDisplayQuestion,
      generateRemediationQueue,
    })

  const nextQ = async () => {
    if (!currentQ) return

    // The tutor's goal is met: end on the summary instead of serving another
    // question (or starting remediation on the last one).
    if (goalReached) {
      clearRemediation()
      if (!sessionAnswered.includes(currentQ.id)) setSessionAnswered([...sessionAnswered, currentQ.id])
      setEndedForGoal(true)
      setFinished(true)
      return
    }

    // Compute target difficulty once for all loadNext calls in this transition.
    const targetDiff = getTargetDifficulty(sessionResults, questions)

    const remediationPendingEntry = remediationMode && !currentQ.is_variant && remediationOriginalQ?.id === currentQ.id

    if (remediationPendingEntry) {
      const answered = sessionAnswered.includes(currentQ.id) ? sessionAnswered : [...sessionAnswered, currentQ.id]
      setSessionAnswered(answered)
      const loaded = await loadNextRemediationQuestion()
      if (!loaded) {
        clearRemediation()
        setQNumber(n => n + 1)
        setStruggleMap(prev => { loadNext(answered, prev, quizMode, effectiveSubtopics, targetDiff); return prev })
      }
      return
    }

    if (remediationMode && currentQ.is_variant) {
      if (remediationStatus === 'complete') {
        clearRemediation()
        setQNumber(n => n + 1)
        setStruggleMap(prev => { loadNext(sessionAnswered, prev, quizMode, effectiveSubtopics, targetDiff); return prev })
        return
      }

      // Option F: "Keep Going →" resumes remediation with lower target (already set at wrongCount=3)
      if (remediationStatus === 'struggling') {
        setRemediationStatus('activated')
        const loaded = await loadNextRemediationQuestion()
        if (!loaded) {
          console.warn('[gradefarm] no remediation questions available after "Keep Going" — exiting remediation')
          clearRemediation()
          setQNumber(n => n + 1)
          setStruggleMap(prev => { loadNext(sessionAnswered, prev, quizMode, effectiveSubtopics, targetDiff); return prev })
        }
        return
      }

      // Option G: forced exit — flag topic for study plan then return to main quiz
      if (remediationStatus === 'needs_review') {
        const q = remediationOriginalQ
        if (q) {
          try {
            await flagTopicForStudyPlan(profile.id, {
              subject: q.subject,
              topic: q.topic,
              subtopic: q.subtopic,
              concept_tag: remediationConcept,
              reason: 'remediation_exhausted',
            })
          } catch {}
        }
        clearRemediation()
        setQNumber(n => n + 1)
        setStruggleMap(prev => { loadNext(sessionAnswered, prev, quizMode, effectiveSubtopics, targetDiff); return prev })
        return
      }

      const loaded = await loadNextRemediationQuestion()
      if (!loaded) {
        console.warn('[gradefarm] no remediation questions available — exiting remediation gracefully')
        clearRemediation()
        setQNumber(n => n + 1)
        setStruggleMap(prev => { loadNext(sessionAnswered, prev, quizMode, effectiveSubtopics, targetDiff); return prev })
      }
      return
    }

    const newAnswered = [...sessionAnswered, currentQ.id]
    setSessionAnswered(newAnswered)
    setQNumber(n => n + 1)
    setStruggleMap(prev => { loadNext(newAnswered, prev, quizMode, effectiveSubtopics, targetDiff); return prev })
  }

  // ── Exam mode ────────────────────────────────────────────────────────────
  const EXAM_DEFAULT_COUNT = 20
  function startExam() {
    const n = questionLimit > 0 ? questionLimit : EXAM_DEFAULT_COUNT
    const target = assignmentBand ? assignmentBand.target : getTargetDifficulty([], questions)
    // Written answers are marked by AI one at a time, so they stay out of timed exams.
    const examPool = questions.filter(q => !isAiMarked(q))
    const picked = []
    for (let i = 0; i < n; i++) {
      const q = selectNextQuestion(examPool, struggleMap, picked.map(x => x.id), quizMode, effectiveSubtopics, target, assignmentBand)
      if (!q || picked.some(x => x.id === q.id)) break
      picked.push(q)
    }
    if (!picked.length) { setFinished(true); return }
    examGradedRef.current = false
    setExamSet(picked)
    setExamIndex(0)
    setExamResponses({})
    setExamFlags(new Set())
    setExamTimes({})
    setDisplayQuestion(picked[0])
  }

  const goToExamQuestion = (i) => {
    if (i < 0 || i >= examSet.length || i === examIndex) return
    const leaving = examSet[examIndex]
    const spent = startTime.current ? Date.now() - startTime.current : 0
    if (leaving) setExamTimes(prev => ({ ...prev, [leaving.id]: (prev[leaving.id] || 0) + spent }))
    const next = examSet[i]
    setExamIndex(i)
    setDisplayQuestion(next)
    setSelected(examResponses[next.id] ?? null)
  }

  const chooseExamResponse = (response) => {
    if (!currentQ) return
    setSelected(response)
    const next = { ...examResponses, [currentQ.id]: response }
    setExamResponses(next)
    // Answered questions make leaving the page ask first (App's navigation blocker).
    setSessionAnswered(Object.keys(next).filter(id => next[id] != null))
  }

  const toggleExamFlag = () => {
    if (!currentQ) return
    setExamFlags(prev => {
      const next = new Set(prev)
      if (next.has(currentQ.id)) next.delete(currentQ.id)
      else next.add(currentQ.id)
      return next
    })
  }

  // Grade every question, then record the answers and XP in exam order (so the
  // run of right answers the server works out matches) and show the summary.
  const finishExam = async () => {
    if (examGradedRef.current || !examSet.length) return
    examGradedRef.current = true
    setShowFinishExam(false)
    const cur = examSet[examIndex]
    const times = cur && startTime.current
      ? { ...examTimes, [cur.id]: (examTimes[cur.id] || 0) + (Date.now() - startTime.current) }
      : examTimes
    const graded = examSet.map(q => {
      const r = examResponses[q.id]
      const answered = r != null && responseIsComplete(q, r)
      return { q, r: answered ? r : null, answered, ok: answered && gradeResponse(q, r) }
    })
    let run = streak
    let xpTotal = 0
    const results = graded.map(g => {
      const xp = g.answered ? calcXP(g.ok, g.q.difficulty, run) : 0
      if (g.answered) run = g.ok ? run + 1 : 0
      xpTotal += xp
      g.xp = xp
      g.streakAfter = run
      return { id: g.q.id, correct: g.ok, topic: g.q.topic, subtopic: g.q.subtopic, remediation: false, response: g.r, timeMs: times[g.q.id] || null, skipped: !g.answered }
    })
    setSessionResults(results)
    setSessionXP(s => s + xpTotal)
    setStreak(run)
    setSessionAnswered(examSet.map(q => q.id))
    setStruggleMap(prev => {
      const next = { ...prev }
      for (const g of graded) {
        if (!g.answered) continue
        const old = next[g.q.id] ?? { attempts: 0, wrong: 0 }
        next[g.q.id] = { ...old, attempts: old.attempts + 1, wrong: old.wrong + (g.ok ? 0 : 1), last_seen: new Date().toISOString() }
      }
      return next
    })
    setEndedForExam(true)
    setFinished(true)
    for (const g of graded) {
      if (!g.answered) continue
      const t = times[g.q.id] || null
      await recordAnswerCounted(profile.id, g.q.id, g.ok, getQuestionType(g.q) === 'mcq' ? g.r : null, sessionId, t)
        .catch(err => console.warn('[gradefarm] failed to record answer:', err?.message || err))
      await awardAnswerXP(g.xp, g.streakAfter, g.ok)
      countAssignmentAnswer(g.ok, g.r, t, g.q.id)
    }
  }
  finishExamRef.current = finishExam

  // Keys: 1–9 pick an option, Enter checks the answer or moves on. Not while
  // typing in a field, and not while a dialog is open.
  useEffect(() => {
    if (finished || !currentQ) return
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return
      if (showExit || showFinishExam || reportMenuOpen) return
      const isMcq = getQuestionType(currentQ) === 'mcq'
      const n = Number(e.key)
      if (isMcq && !showAns && n >= 1 && n <= (currentQ.options?.length || 0)) {
        e.preventDefault()
        if (examRun) chooseExamResponse(n - 1)
        else setSelected(n - 1)
        return
      }
      // Enter on a focused button presses it, except on an option, where it checks.
      if (e.key !== 'Enter' || (tag === 'button' && !e.target.classList?.contains('qopt'))) return
      if (examRun) {
        e.preventDefault()
        if (examIndex < examSet.length - 1) goToExamQuestion(examIndex + 1)
        else setShowFinishExam(true)
      } else if (!showAns && isMcq && selected != null) {
        e.preventDefault()
        handleAnswer(selected)
      } else if (showAns && remediationStatus !== 'generating') {
        e.preventDefault()
        nextQ()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // The first wrong answer that offers extra practice asks for its page tip (App's PageTips).
  const offersExtraPractice = !examRun && showAns && !correct && remediationMode && !currentQ?.is_variant && remediationOriginalQ?.id === currentQ?.id
  useEffect(() => {
    if (offersExtraPractice) window.dispatchEvent(new CustomEvent('gf-page-tip', { detail: { page: 'quiz-wrong' } }))
  }, [offersExtraPractice])

  // A new question closes the report menu and its thank-you.
  useEffect(() => { setReportMenuOpen(false); setReportThanks(false) }, [currentQ?.id])

  if (finished || (!currentQ && sessionResults.length > 0)) {
    const startMode = (mode, ids = []) => {
      generatingMoreRef.current = false
      bankExhaustionAttempted.current = false
      backgroundPrefetchAttempted.current = false
      setGeneratingMore(false)
      setGenerationError(null)
      setSessionEpoch(e => e + 1)
      setCompletedGoal(null)
      setEndedForGoal(false)
      setEndedForExam(false)
      setEndedEarly(false)
      setOpenAnswers(new Set())
      setTimeLeft(timerSeconds)
      setQuizMode(mode)
      setReviewIds?.(ids)
      setSessionAnswered([])
      setSessionResults([])
      setQNumber(1)
      setSessionXP(0)
      setSessionTip('')
      setSessionTipLoading(false)
      clearRemediation()
      setFinished(false)
      beginSession()
      loadNext([], struggleMap, mode, effectiveSubtopics, null, ids)
    }

    // ── Session summary ─────────────────────────────────────────────────────
    const mainResults   = sessionResults.filter(r => !r.remediation)
    const sessCorrect   = mainResults.filter(r => r.correct).length
    const sessTotal     = mainResults.length
    const sessWrong     = sessTotal - sessCorrect
    const toneFor = (pct) => (pct < 40 ? t.danger : pct < 70 ? t.goldText : t.success)

    // Time on task: every answer's time, remediation included.
    const totalMs = sessionResults.reduce((sum, r) => sum + (r.timeMs || 0), 0)
    const totalMin = Math.round(totalMs / 60000)
    const timeLabel = totalMs <= 0 ? null : totalMin >= 1 ? `${totalMin} min` : `${Math.max(1, Math.round(totalMs / 1000))} sec`
    const clock = (ms) => {
      if (!ms) return ''
      const s = Math.round(ms / 1000)
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    }

    // Per subtopic (falling back to topic), main questions only, weakest first.
    const topicMap = {}
    mainResults.forEach(r => {
      const key = r.subtopic || r.topic
      if (!key) return
      if (!topicMap[key]) topicMap[key] = { correct: 0, total: 0 }
      topicMap[key].total++
      if (r.correct) topicMap[key].correct++
    })
    const topicBreakdown = Object.entries(topicMap)
      .map(([topic, s]) => ({ topic, ...s, pct: Math.round((s.correct / s.total) * 100) }))
      .sort((a, b) => a.pct - b.pct)

    // This session's misses, not every question ever got wrong in these topics
    // (Home and the Study Plan offer that review).
    const wrongThisSession = sessionWrongIds(sessionResults, questions)
    const questionById = new Map(questions.map(q => [q.id, q]))
    const answerRows = mainResults.map((r, i) => ({ r, q: questionById.get(r.id), key: `${r.id}-${i}` })).filter(x => x.q)

    const timeUp = examRun && timerSeconds > 0 && timeLeft <= 0
    const status = consolidation
      ? (round.byStreak ? 'Nice work' : 'Round complete')
      : examRun
        ? (timeUp ? "Time's up" : 'Exam finished')
        : endedEarly ? 'Session ended' : 'Session finished'
    // A longer note only where there's something specific to say.
    const note = consolidation
      ? round.byStreak
        ? `${CONSOLIDATION_STREAK} in a row on ${consolidation.label}.${consolidation.canReturn ? ' Time to get back to your quiz.' : ''}`
        : round.done
          ? `You've practised ${round.answered} questions on ${consolidation.label}. The ones you missed will come back in your Study Plan.${consolidation.canReturn ? ' Time to get back to your quiz.' : ''}`
          : `That's every question on ${consolidation.label} for now.`
      : endedForGoal && goalDisplay
        ? `You've answered all ${goalDisplay.goal} questions your tutor set${goalDisplay.minAccuracy && goalDisplay.passed !== false ? ` and hit the ${goalDisplay.minAccuracy}% pass mark` : ''}.`
        : null

    const nextStep = consolidation
      ? { text: consolidation.canReturn ? 'This round is done.' : 'This round is done. Carry on with the whole subject.', label: consolidation.canReturn ? 'Back to my quiz' : 'Practise the whole subject', onClick: leaveConsolidation }
      : wrongThisSession.length > 0
        ? { text: `Redo the ${wrongThisSession.length === 1 ? 'question' : `${wrongThisSession.length} questions`} you missed while the working is fresh.`, label: `Redo ${wrongThisSession.length} wrong answer${wrongThisSession.length !== 1 ? 's' : ''}`, onClick: () => startMode('review', wrongThisSession) }
        : sessTotal > 0
          ? { text: 'Every question right. Keep the run going with new questions.', label: 'Practise new questions', onClick: () => startMode('new') }
          : { text: 'Pick some topics on Practice to start a new session.', label: 'Back to Practice', onClick: onHome }

    const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12 }
    const banner = (tone, title, body, Icon) => (
      <div style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10, borderColor: tone }}>
        <Icon size={18} color={tone} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{title}</div>
          {body && <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2, lineHeight: 1.5 }}>{body}</div>}
        </div>
      </div>
    )
    const toggleAnswer = (key) => setOpenAnswers(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

    return (
      <div style={{ height: '100%', minHeight: '100%', background: t.bg, fontFamily: FONT_B, overflowY: 'auto', color: t.text }}>
        <style>{`
          .ss-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
          .ss-row { display: grid; grid-template-columns: 22px minmax(0, 1fr) minmax(0, 180px) 52px 14px; gap: 12px; align-items: center; width: 100%; padding: 11px 16px; border: none; background: transparent; text-align: left; cursor: pointer; font-family: inherit; color: inherit; }
          .ss-row:focus-visible { outline: 2px solid ${GOLD}; outline-offset: -2px; }
          @media (max-width: 760px) {
            .ss-grid { grid-template-columns: 1fr; }
            .ss-row { grid-template-columns: 22px minmax(0, 1fr) 14px; }
            .ss-row .ss-hide { display: none; }
          }
        `}</style>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: isMobile ? '20px 16px 48px' : '32px 32px 56px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Header: status, time (XP) and the score */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: t.textMuted }}>
                {status}
                {timeLabel && <> · <strong style={{ color: t.text }}>{timeLabel}</strong></>}
                {' '}({signedXP(sessionXP)} XP)
              </div>
              <h1 style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: t.text }}>
                {sessTotal > 0 ? `${sessCorrect} of ${sessTotal} correct` : 'No questions answered'}
              </h1>
              {note && <p style={{ margin: '6px 0 0', fontSize: 13, color: t.textMuted, lineHeight: 1.55, maxWidth: 620 }}>{note}</p>}
            </div>
            <button type="button" onClick={onHome}
              style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: FONT_B, fontSize: 13, fontWeight: 700, color: t.text, textDecoration: 'underline', textDecorationColor: GOLD, textDecorationThickness: 2, textUnderlineOffset: 4 }}>
              Back to Practice
            </button>
          </div>

          {generationError && banner(t.danger, 'Couldn’t generate more questions', generationError, TriangleAlert)}
          {assignmentsCompleted.length > 0 && completedGoal?.passed === false && banner(t.borderAccent, `Assignment finished: ${completedGoal.accuracy}% (pass mark ${completedGoal.minAccuracy}%)`, 'You didn’t reach the pass mark this time. Your tutor has your results and will go through them with you.', Pin)}
          {assignmentsCompleted.length > 0 && completedGoal?.passed !== false && banner(t.success, `${assignmentsCompleted.length === 1 ? 'Assignment completed' : `${assignmentsCompleted.length} assignments completed`}${completedGoal?.passed ? `. You scored ${completedGoal.accuracy}%, above the ${completedGoal.minAccuracy}% pass mark.` : ''}`, 'Your tutor has been notified.', CircleCheck)}
          {assignmentsCompleted.length === 0 && assignmentStand && !assignmentStand.complete && banner(t.borderAccent, `Assignment progress: ${assignmentStand.progress}/${assignmentStand.goal} questions`,
            assignmentStand.progress < assignmentStand.goal
              ? `Your progress is saved. Answer ${assignmentStand.goal - assignmentStand.progress} more to ${assignmentStand.oneAttempt ? 'finish' : 'complete'} it${assignmentStand.minAccuracy ? `, scoring at least ${assignmentStand.minAccuracy}%${assignmentStand.oneAttempt ? ' to pass' : ''}` : ''}.`
              : `Score at least ${assignmentStand.minAccuracy}% on your last ${assignmentStand.goal} answers to complete it. You're on ${assignmentStand.accuracy}%. Keep practising.`, Pin)}

          {/* AI summary */}
          {(sessionTipLoading || sessionTip) && (
            <div style={{ ...card, padding: '14px 16px', fontSize: 14, lineHeight: 1.6, color: t.textSub }}>
              {sessionTipLoading ? <span style={{ color: t.textFaint }}>Writing a summary of this session…</span> : sessionTip}
            </div>
          )}

          {sessTotal > 0 && (
            <div className="ss-grid">
              {/* Score: right/wrong bar, then each topic */}
              <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div aria-hidden="true" style={{ display: 'flex', gap: 2, height: 10, borderRadius: 5, overflow: 'hidden', background: t.border }}>
                  {sessCorrect > 0 && <div style={{ flex: sessCorrect, background: t.success }} />}
                  {sessWrong > 0 && <div style={{ flex: sessWrong, background: t.danger }} />}
                </div>
                <div style={{ display: 'flex', gap: 18, fontSize: 13, color: t.textMuted }}>
                  <span><strong style={{ color: t.success }}>{sessCorrect}</strong> right</span>
                  <span><strong style={{ color: t.danger }}>{sessWrong}</strong> wrong</span>
                </div>
                {topicBreakdown.length > 1 && (
                  <div>
                    {topicBreakdown.map((tb, i) => (
                      <div key={tb.topic} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 70px 44px', gap: 12, alignItems: 'center', padding: '9px 0', borderTop: i > 0 ? `1px solid ${t.border}` : 'none', fontSize: 13 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tb.topic}>{tb.topic}</span>
                        <span aria-hidden="true" style={{ height: 5, borderRadius: 3, background: t.border, overflow: 'hidden' }}>
                          <span style={{ display: 'block', height: '100%', width: `${tb.pct}%`, background: toneFor(tb.pct) }} />
                        </span>
                        <span style={{ textAlign: 'right', fontWeight: 700, color: toneFor(tb.pct), fontVariantNumeric: 'tabular-nums' }}>{tb.correct}/{tb.total}</span>
                      </div>
                    ))}
                  </div>
                )}
                {topicBreakdown.length === 1 && (
                  <div style={{ fontSize: 13, color: t.textMuted }}>All in {topicBreakdown[0].topic}</div>
                )}
              </div>

              {/* One recommended next step */}
              <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>Next step</div>
                <p style={{ margin: 0, fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>{nextStep.text}</p>
                <button type="button" onClick={nextStep.onClick}
                  style={{ padding: '12px', borderRadius: 10, border: 'none', background: t.accent, color: NAVY, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
                  {nextStep.label}
                </button>
                {!consolidation && onGoToStudyPlan && (
                  <button type="button" onClick={onGoToStudyPlan}
                    style={{ padding: '11px', borderRadius: 10, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
                    See this week's plan
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Every question answered; open one for your answer, the correct one and the solution */}
          {answerRows.length > 0 && (
            <div style={{ ...card, overflow: 'hidden' }}>
              {answerRows.map(({ r, q, key }, i) => {
                const open = openAnswers.has(key)
                return (
                  <div key={key} style={{ borderTop: i > 0 ? `1px solid ${t.border}` : 'none', background: open ? t.bgSubtle : 'transparent' }}>
                    <button type="button" className="ss-row" aria-expanded={open} onClick={() => toggleAnswer(key)}>
                      <span aria-label={r.correct ? 'Correct' : 'Wrong'} style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: r.correct ? t.successBg : t.dangerBg, color: r.correct ? t.success : t.danger }}>
                        {r.correct ? '✓' : '✗'}
                      </span>
                      <span style={{ fontSize: 13.5, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><MathText text={q.question} /></span>
                      <span className="ss-hide" style={{ fontSize: 12, color: t.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.subtopic || q.topic}</span>
                      <span className="ss-hide" style={{ fontSize: 12, color: t.textFaint, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{clock(r.timeMs)}</span>
                      <span aria-hidden="true" style={{ display: 'flex', color: t.textFaint }}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                    </button>
                    {open && (
                      <div style={{ padding: '0 16px 14px 50px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, lineHeight: 1.6 }}>
                        <div style={{ color: t.text }}><MathText text={q.question} /></div>
                        <div style={{ color: r.correct ? t.success : t.danger }}>
                          <strong>Your answer: </strong><MathText text={describeResponse(q, r.response) || 'No answer'} />
                        </div>
                        {!r.correct && (
                          <div style={{ color: t.success }}><strong>Correct answer: </strong><MathText text={describeCorrectAnswer(q)} /></div>
                        )}
                        {q.solution && <div style={{ color: t.textMuted }}><MathText text={q.solution} /></div>}
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

  if (generatingMore) {
    return (
      <div style={{ minHeight: '100%', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textFaint, fontFamily: FONT_B }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <style>{`@keyframes gf-spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ width: 36, height: 36, borderRadius: '50%', border: `2px solid rgba(241,190,67,0.18)`, borderTopColor: GOLD, animation: 'gf-spin 0.8s linear infinite' }} />
          <div style={{ fontSize: 13 }}>Generating more questions…</div>
        </div>
      </div>
    )
  }

  if (!currentQ && sessionResults.length === 0) {
    return (
      <div style={{ minHeight: '100%', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textFaint, fontFamily: FONT_B }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: NAVY }}><Zap size={22} aria-hidden="true" /></div>
          <div style={{ fontSize: 13 }}>Loading questions…</div>
        </div>
      </div>
    )
  }

  // Free subject: once today's questions are used up, stop before the next one.
  if (freeQuota && freeQuota.used >= freeQuota.limit && !showAns) {
    return (
      <div style={{ minHeight: '100%', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: FONT_B }}>
        <div style={{ maxWidth: 420, textAlign: 'center', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, padding: '32px 28px', boxShadow: t.shadowCard }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVY }}>
            <Lock size={24} aria-hidden="true" />
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: t.text, marginBottom: 6 }}>That's your {freeQuota.limit} free questions for today</div>
          <p style={{ fontSize: 13.5, color: t.textMuted, lineHeight: 1.6, margin: '0 0 20px' }}>
            Nice work! Come back tomorrow for {freeQuota.limit} more, or subscribe for unlimited questions, Exam Mode and more.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" onClick={freeQuota.onUpgrade}
              style={{ height: 44, borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVY, fontFamily: FONT_B, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
              Get unlimited questions
            </button>
            <button type="button" onClick={onHome}
              style={{ height: 40, borderRadius: 12, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontFamily: FONT_B, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Back to Practice
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { pct } = getLevelProgress(profile.xp, rankAccuracy(profile))
  const baseQuestionId = remediationMode && remediationParentId ? remediationParentId : currentQ.id
  const isStruggle = (struggleMap[baseQuestionId]?.wrong ?? 0) >= 2
  const sessionCorrect = sessionResults.filter(r => r.correct).length
  const sessionTotal = sessionResults.length
  const inRemediationQuestion = remediationMode && !!currentQ?.is_variant
  const remediationPendingEntry = remediationMode && !currentQ?.is_variant && remediationOriginalQ?.id === currentQ?.id

  const nextButtonLabel = goalReached
    ? 'Finish assignment'
    : remediationPendingEntry
    ? `Practise ${remediationTarget} like this`
    : inRemediationQuestion && remediationStatus === 'complete'
      ? 'Back to my session'
    : inRemediationQuestion && remediationStatus === 'struggling'
      ? 'Keep going'
    : inRemediationQuestion && remediationStatus === 'needs_review'
      ? 'Continue'
      : 'Next question'

  const chip = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: t.textSub, background: t.bgSubtle, border: `1px solid ${t.border}`, padding: '2px 9px', borderRadius: 999 }
  const sidePassage = !isMobile && questionAreaWidth >= SIDE_PASSAGE_MIN_WIDTH && !!currentQ?.passage?.body
  const isMcq = getQuestionType(currentQ) === 'mcq'
  const tools = toolsForSubject(subjectTile?.name || currentQ?.subject)
  const btn = (kind, disabled = false) => ({
    padding: '9px 16px', borderRadius: 9, fontFamily: FONT_B, fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
    ...(kind === 'primary'
      ? { border: 'none', background: t.accent, color: NAVY }
      : { border: `1px solid ${t.border}`, background: t.bgCard, color: t.text }),
  })
  const linkBtn = { border: 'none', background: 'none', padding: 0, fontFamily: FONT_B, fontSize: 12.5, color: t.textMuted, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: t.border, textUnderlineOffset: 3 }

  // The question's id as stored (practice variants report their parent).
  const reportQid = currentQ?.is_variant ? (currentQ?.parent_question_id || currentQ?.id) : currentQ?.id
  const myFlags = flaggedMap[reportQid] || new Set()
  const alreadyReported = !!currentQ?.id && reportedIds.has(currentQ.id)
  const REPORT_OPTIONS = [
    ['wrong', 'The answer is wrong'],
    ...(curriculumIdForReports ? [['offcourse', "It's not in my course"]] : []),
    ['Typo', "There's a typo"],
    ['Confusing', "It's confusing"],
    ['Too hard', 'Too hard for my level'],
    ['Too easy', 'Too easy'],
  ]
  const sendReport = async (kind) => {
    if (kind === 'wrong') await handleReport()
    else if (kind === 'offcourse') await handleOffCourse()
    else await handleFlag(kind)
    setReportThanks(true)
  }

  // Exam progress for the squares and the finish dialog.
  const examAnswered = examSet.filter(q => examResponses[q.id] != null && responseIsComplete(q, examResponses[q.id])).length
  const examFlagged = examSet.filter(q => examFlags.has(q.id)).length
  const isLastExamQ = examIndex >= examSet.length - 1

  const optionStyle = (i) => {
    const isKey = i === currentQ.answer_index
    const isPicked = i === selected
    if (showAns && isKey) return { box: { borderColor: t.success, background: t.successBg }, key: { background: t.success, color: '#fff', borderColor: t.success }, text: t.text, tag: ['Answer', t.success] }
    if (showAns && isPicked) return { box: { borderColor: t.danger, background: t.dangerBg }, key: { background: t.danger, color: '#fff', borderColor: t.danger }, text: t.text, tag: ['Your answer', t.danger] }
    if (showAns) return { box: {}, key: {}, text: t.textFaint, tag: null }
    if (isPicked) return { box: { borderColor: t.text, boxShadow: `0 0 0 1px ${t.text}` }, key: { background: t.text, color: t.bg, borderColor: t.text }, text: t.text, tag: null }
    return { box: {}, key: {}, text: t.text, tag: null }
  }

  const timer = examRun && timerSeconds > 0 && (() => {
    const m = Math.floor(timeLeft / 60)
    const s = timeLeft % 60
    const urgent = timeLeft < 300
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: urgent ? t.danger : t.textMuted }}>
        <Timer size={14} aria-hidden="true" /><strong style={{ color: urgent ? t.danger : t.text, fontVariantNumeric: 'tabular-nums' }}>{m}:{String(s).padStart(2, '0')}</strong>{!isMobile && ' left'}
      </span>
    )
  })()

  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: t.bg, fontFamily: FONT_B, overflow: isMobile ? 'visible' : 'hidden' }}>
      <style>{`
        @keyframes fadeUp  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes floatXP { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-70px) scale(1.5)} }
        @keyframes popIn   { 0%{transform:scale(0.97);opacity:0} 100%{transform:scale(1);opacity:1} }
        @media (prefers-reduced-motion: reduce) { .qz-anim { animation: none !important; } }
        .qopt { transition: border-color 0.12s ease, background 0.12s ease; }
        .qopt:not(:disabled):hover { border-color: ${t.textMuted} !important; }
        .qopt:focus-visible, .qz-sq:focus-visible { outline: 2px solid ${t.accent}; outline-offset: 2px; }
      `}</style>
      {freeQuota && (
        <div role="status" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '7px 16px', fontSize: 12.5, color: t.textMuted, borderBottom: `1px solid ${t.border}`, background: t.bgSubtle }}>
          <span><strong style={{ color: t.text }}>{Math.max(0, freeQuota.limit - freeQuota.used)}</strong> of {freeQuota.limit} free questions left today</span>
          <button type="button" onClick={freeQuota.onUpgrade} style={{ border: 'none', background: 'none', padding: 0, color: t.text, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: t.accent, textUnderlineOffset: 3 }}>Go unlimited</button>
        </div>
      )}

      {floatXP && (
        <div className="qz-anim" style={{ position: 'fixed', top: '30%', left: '50%', transform: 'translateX(-50%)', fontSize: 30, fontWeight: 800, color: t.goldText, animation: 'floatXP 1.4s ease forwards', pointerEvents: 'none', zIndex: 9999 }}>
          +{floatXP} XP
        </div>
      )}

      {showExit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div role="dialog" aria-modal="true" aria-labelledby="gf-end-title" style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: '22px', maxWidth: 380, width: '90%', animation: 'popIn 0.2s ease' }}>
            <div id="gf-end-title" style={{ fontSize: 17, fontWeight: 800, color: t.text, marginBottom: 6 }}>End this session?</div>
            <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 20, lineHeight: 1.6 }}>
              {sessionResults.some(r => !r.remediation)
                ? <>You've earned <strong style={{ color: t.text }}>{signedXP(sessionXP)} XP</strong>. You'll see a summary of this session next.</>
                : "You haven't answered any questions yet."}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowExit(false)} style={btn('secondary')}>Keep going</button>
              <button type="button" onClick={endSession} style={{ ...btn('primary'), background: t.danger, color: '#fff' }}>End session</button>
            </div>
          </div>
        </div>
      )}

      {showFinishExam && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div role="dialog" aria-modal="true" aria-labelledby="gf-finish-title" style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: '22px', maxWidth: 400, width: '90%', animation: 'popIn 0.2s ease' }}>
            <div id="gf-finish-title" style={{ fontSize: 17, fontWeight: 800, color: t.text, marginBottom: 6 }}>Finish the exam?</div>
            <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 20, lineHeight: 1.6 }}>
              You've answered <strong style={{ color: t.text }}>{examAnswered} of {examSet.length}</strong>.
              {examSet.length - examAnswered > 0 && ' Unanswered questions count as wrong.'}
              {examFlagged > 0 && ` ${examFlagged} ${examFlagged === 1 ? 'is' : 'are'} flagged for review.`}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowFinishExam(false)} style={btn('secondary')}>Keep going</button>
              <button type="button" onClick={finishExam} style={btn('primary')}>Finish exam</button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar: where you are on the left; how it's going, tools and the way out on the right. */}
      <div style={{ background: t.bg, borderBottom: `1px solid ${t.border}`, padding: isMobile ? '10px 16px' : '11px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, fontSize: 12.5, color: t.textMuted }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          {examRun ? (
            <span style={{ fontSize: 13, fontWeight: 800, color: t.text, whiteSpace: 'nowrap' }}>{isMobile ? `Q${examIndex + 1} of ${examSet.length}` : `Exam · Question ${examIndex + 1} of ${examSet.length}`}</span>
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 800, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentQ.subtopic || currentQ.topic}</span>
              {!isMobile && currentQ.difficulty != null && <span style={{ whiteSpace: 'nowrap' }} title="How hard this question is, from 1 to 5">Level {currentQ.difficulty}</span>}
              {dueBackId === currentQ.id && !remediationMode && (
                <span title="You answered this before. It's back on its review schedule." style={{ ...chip, color: t.goldText, borderColor: t.borderAccent, whiteSpace: 'nowrap' }}>Due back</span>
              )}
              {!isMobile && goalDisplay && (
                <span title="Questions answered toward your tutor's assignment" style={chip}>
                  Assignment {goalDisplay.progress}/{goalDisplay.goal}
                  {goalDisplay.minAccuracy && goalDisplay.accuracy !== null && ` · ${goalDisplay.accuracy}% (pass ${goalDisplay.minAccuracy}%)`}
                </span>
              )}
              {!isMobile && isStruggle && <span style={chip} title="You've missed this one before">Missed before</span>}
            </>
          )}
        </div>
        <div data-tutorial-target={examRun ? undefined : 'quiz-bar'} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, flexShrink: 0 }}>
          {!examRun && sessionTotal > 0 && (
            <span style={{ whiteSpace: 'nowrap' }}><strong style={{ color: t.success }}>{sessionCorrect}</strong>{isMobile ? ' · ' : ' right · '}<strong style={{ color: t.danger }}>{sessionTotal - sessionCorrect}</strong>{isMobile ? '' : ' wrong'}</span>
          )}
          {!examRun && !isMobile && streak >= 2 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: t.text, fontWeight: 700 }} title="Right in a row"><Flame size={14} color={t.goldText} aria-hidden="true" />{streak}</span>}
          {!examRun && !isMobile && <span style={{ whiteSpace: 'nowrap' }}>{signedXP(sessionXP)} XP</span>}
          {timer}
          <QuizToolsDock theme={theme} tools={tools} inline />
          <button type="button" onClick={() => (examRun ? setShowFinishExam(true) : setShowExit(true))}
            style={{ padding: '5px 11px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, whiteSpace: 'nowrap' }}>
            {examRun ? (isMobile ? 'Finish' : 'Finish exam') : isMobile ? 'End' : 'End session'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: isMobile ? 'visible' : 'hidden' }}>
        <div ref={setQuestionAreaEl} style={{ flex: 1, padding: isMobile ? '14px' : '28px 28px 48px', overflowY: isMobile ? 'visible' : 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: sidePassage ? 1280 : 640, display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {sidePassage && (
            // The passage is what students read closely, so it gets ~60% of the row.
            <div style={{ flex: '3 1 0', minWidth: 0, position: 'sticky', top: 0 }}>
              <PassageView passage={currentQ.passage} theme={theme} fill />
            </div>
          )}
          <div key={currentQ.id} className="qz-anim" style={{ flex: sidePassage ? '2 1 0' : '0 1 640px', minWidth: sidePassage ? 340 : 0, width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeUp 0.25s ease' }}>

            {/* Exam: every question as a square, to move between them. */}
            {examRun && examSet.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div role="group" aria-label="Questions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0, paddingTop: 4 }}>
                  {examSet.map((q, i) => {
                    const answered = examResponses[q.id] != null && responseIsComplete(q, examResponses[q.id])
                    const flagged = examFlags.has(q.id)
                    const cur = i === examIndex
                    return (
                      <button key={q.id} type="button" className="qz-sq" onClick={() => goToExamQuestion(i)}
                        aria-label={`Question ${i + 1}${answered ? ', answered' : ''}${flagged ? ', flagged' : ''}`} aria-current={cur ? 'step' : undefined}
                        style={{ position: 'relative', width: 30, height: 30, borderRadius: 7, fontFamily: FONT_B, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
                          border: `1px solid ${cur ? t.text : flagged ? t.goldText : t.border}`, boxShadow: cur ? `0 0 0 1px ${t.text}` : 'none',
                          background: answered ? t.bgSubtle : t.bgCard, color: answered || cur ? t.text : t.textMuted }}>
                        {i + 1}
                        {flagged && (
                          <span aria-hidden="true" style={{ position: 'absolute', top: -6, right: -6, width: 15, height: 15, borderRadius: '50%', background: t.bgCard, border: `1px solid ${t.goldText}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Flag size={8} style={{ color: t.goldText }} />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <button type="button" onClick={toggleExamFlag} aria-pressed={examFlags.has(currentQ.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 8, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                    border: `1px solid ${examFlags.has(currentQ.id) ? t.goldText : t.border}`, background: t.bgCard, color: examFlags.has(currentQ.id) ? t.goldText : t.textMuted }}>
                  <Flag size={13} aria-hidden="true" />{examFlags.has(currentQ.id) ? 'Flagged for review' : 'Flag for review'}
                </button>
              </div>
            )}

            {consolidation && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 14px', borderRadius: 10, background: t.bgCard, border: `1px solid ${t.border}`, fontSize: 12.5 }}>
                <Pin size={14} aria-hidden="true" style={{ color: t.textMuted, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, color: t.textMuted }}>
                  <strong style={{ color: t.text }}>Practising {consolidation.label}</strong> · {Math.min(round.inARow, CONSOLIDATION_STREAK)} of {CONSOLIDATION_STREAK} right in a row · question {Math.min(round.answered + (!currentQ?.is_variant && !showAns ? 1 : 0), CONSOLIDATION_MAX_QUESTIONS)} of {CONSOLIDATION_MAX_QUESTIONS}
                </span>
                <button type="button" onClick={leaveConsolidation} style={linkBtn}>{consolidation.canReturn ? 'Back to my quiz' : 'Practise everything'}</button>
              </div>
            )}

            {remediationMode && !remediationPendingEntry && (
              <ExtraPracticeStrip
                streak={remediationStreak}
                target={remediationTarget}
                status={remediationStatus}
                topic={remediationOriginalQ?.subtopic || remediationOriginalQ?.topic || currentQ.subtopic}
                onReturnToQuiz={handleReturnToQuiz}
                theme={theme}
              />
            )}

            <div data-tutorial-target={!examRun && !showAns ? 'quiz-answer' : undefined} style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: isMobile ? '16px' : '22px 24px' }}>
              {currentQ.passage && !sidePassage && <PassageView passage={currentQ.passage} theme={theme} />}
              {currentQ.graph && <GraphView graph={currentQ.graph} theme={theme} />}
              {currentQ.table_data && <TableView table={currentQ.table_data} theme={theme} />}
              {currentQ.diagram && <DiagramView diagram={currentQ.diagram} theme={theme} />}
              {currentQ.image_url && getQuestionType(currentQ) !== 'hotspot' && getQuestionType(currentQ) !== 'image_label' && (
                <img src={currentQ.image_url} alt="Question diagram" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 10, marginBottom: 16 }} />
              )}
              <div style={{ fontSize: isMobile ? 15.5 : 17, fontWeight: 700, color: t.text, lineHeight: 1.6, marginBottom: 18 }}>
                <MathText text={currentQ.question} />
              </div>

              {isMcq ? (
                <div role={showAns ? undefined : 'radiogroup'} aria-label="Answer options" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {currentQ.options.map((opt, i) => {
                    const s = optionStyle(i)
                    return (
                      <button
                        key={i}
                        type="button"
                        className="qopt"
                        role={showAns ? undefined : 'radio'}
                        aria-checked={showAns ? undefined : i === selected}
                        disabled={showAns}
                        // Choosing only selects: a misclick can be changed before Check answer.
                        onClick={() => { if (showAns) return; if (examRun) chooseExamResponse(i); else setSelected(i) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, textAlign: 'left', fontFamily: FONT_B, fontSize: 14.5, fontWeight: 500,
                          border: `1px solid ${t.border}`, background: t.bgCard, color: s.text, cursor: showAns ? 'default' : 'pointer', ...s.box }}
                      >
                        <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800, flexShrink: 0, color: t.textMuted, ...s.key }}>
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span style={{ minWidth: 0, flex: 1, overflowX: 'auto' }}><MathText text={opt} /></span>
                        {s.tag && <span style={{ fontSize: 12, fontWeight: 700, color: s.tag[1], whiteSpace: 'nowrap' }}>{s.tag[0]}</span>}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <QuestionRenderer
                  question={currentQ}
                  response={selected}
                  onChange={examRun ? chooseExamResponse : setSelected}
                  showAns={showAns}
                  onSubmit={handleSubmitResponse}
                  theme={theme}
                  hideCheck={examRun}
                  checkLabel="Check answer"
                />
              )}

              {/* Exam: move between questions; answers are kept until Finish. */}
              {examRun && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
                  <button type="button" onClick={() => goToExamQuestion(examIndex - 1)} disabled={examIndex === 0} style={btn('secondary', examIndex === 0)}>Previous</button>
                  {!isMobile && <span style={{ fontSize: 12, color: t.textFaint, marginLeft: 6 }}>{isMcq ? 'Press 1–4 to choose, Enter for the next question' : ''}</span>}
                  <button type="button" onClick={() => (isLastExamQ ? setShowFinishExam(true) : goToExamQuestion(examIndex + 1))} style={{ ...btn('primary'), marginLeft: 'auto' }}>
                    {isLastExamQ ? 'Finish exam' : 'Next question'}
                  </button>
                </div>
              )}

              {/* Practice, before answering: check the chosen option. */}
              {!examRun && !showAns && isMcq && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                  <button type="button" onClick={() => { if (selected != null) handleAnswer(selected) }} disabled={selected == null} style={btn('primary', selected == null)}>Check answer</button>
                  {!isMobile && <span style={{ fontSize: 12, color: t.textFaint, marginLeft: 'auto' }}>Press 1–{currentQ.options.length} to choose, Enter to check</span>}
                </div>
              )}

              {/* Practice, after answering: the result, why, and what's next. */}
              {!examRun && showAns && (
                <div className="qz-anim" style={{ borderTop: `1px solid ${t.border}`, marginTop: 18, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10, animation: 'popIn 0.2s ease' }}>
                  {/* Written answers show their marks above, with the feedback. */}
                  {!isAiMarked(currentQ) && (
                    <div role="status" style={{ fontSize: 15, fontWeight: 800, color: correct ? t.success : t.text }}>
                      {correct ? 'Right.' : 'Not quite.'}
                      {inRemediationQuestion && remediationStatus !== 'complete' && (
                        <span style={{ fontWeight: 600, color: t.textMuted }}> {Math.min(remediationStreak, remediationTarget)} of {remediationTarget} in a row.</span>
                      )}
                    </div>
                  )}
                  {currentQ.solution && isAiMarked(currentQ) && (
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: t.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: -4 }}>Model answer</div>
                  )}
                  {currentQ.solution && (
                    <div style={{ fontSize: 14, color: t.textSub, lineHeight: 1.7 }}><MathText text={currentQ.solution} /></div>
                  )}
                  {currentQ.tip && (
                    <div style={{ display: 'flex', gap: 8, fontSize: 13, color: t.textSub, lineHeight: 1.6, paddingLeft: 10, borderLeft: `2px solid ${t.accent}` }}>
                      <Lightbulb size={14} style={{ flexShrink: 0, marginTop: 3, color: t.goldText }} aria-hidden="true" /><div style={{ flex: 1, minWidth: 0 }}><MathText text={currentQ.tip} /></div>
                    </div>
                  )}
                  {(aiTip || loadingTip) && (
                    <div style={{ display: 'flex', gap: 8, fontSize: 13, color: t.textSub, lineHeight: 1.6, paddingLeft: 10, borderLeft: `2px solid ${t.accent}` }}>
                      <Bot size={14} style={{ flexShrink: 0, marginTop: 3, color: t.textMuted }} aria-hidden="true" />
                      <div style={{ flex: 1, minWidth: 0 }}>{loadingTip ? <span style={{ color: t.textFaint }}>Titan is looking at your answer…</span> : <><strong style={{ color: t.text }}>Titan: </strong><MathText text={aiTip} /></>}</div>
                    </div>
                  )}
                  {remediationPendingEntry && remediationStatus === 'generating' && (
                    <div style={{ fontSize: 12.5, color: t.textMuted }}>Getting practice questions like this one ready…</div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4, position: 'relative' }}>
                    <button type="button" data-tutorial-target={remediationPendingEntry ? 'quiz-extra-practice' : undefined} onClick={nextQ} disabled={remediationStatus === 'generating'} style={{ ...btn('primary', remediationStatus === 'generating'), ...(isMobile ? { flex: 1 } : {}) }}>
                      {nextButtonLabel}
                    </button>
                    {onOpenLearn && !examMode && (
                      <button type="button" onClick={() => onOpenLearn(currentQ.topic, buildQuestionHelpContext(currentQ, selected, correct))} style={btn('secondary')} title="Talk it through with Titan in Learn">
                        {isMobile ? 'Ask Titan' : correct ? 'Ask Titan about this' : 'Ask Titan why'}
                      </button>
                    )}
                    {!isMobile && <ReportLink />}
                  </div>
                  {isMobile && <ReportLink />}
                </div>
              )}
            </div>

            {!examRun && showAns && (
              <div style={{ fontSize: 12.5, color: t.textFaint, textAlign: 'center' }}>
                {correct ? `+${earnedXP} XP` : `${signedXP(earnedXP)} XP`}
                {!correct && remediationPendingEntry ? '. The practice questions earn XP back.' : ''}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  )

  // "Something wrong with this question?" and its menu. The thank-you stays
  // until the next question.
  function ReportLink() {
    return (
      <span style={{ position: 'relative', marginLeft: isMobile ? 0 : 'auto' }}>
        {reportThanks ? (
          <span role="status" style={{ fontSize: 12.5, color: t.textMuted }}>Thanks. We check every report.</span>
        ) : (
          <button type="button" onClick={() => setReportMenuOpen(o => !o)} aria-expanded={reportMenuOpen} aria-haspopup="menu" style={linkBtn}>
            Something wrong with this question?
          </button>
        )}
        {reportMenuOpen && !reportThanks && (
          <>
            <div onClick={() => setReportMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} aria-hidden="true" />
            <div role="menu" aria-label="What's wrong with it?" style={{ position: 'absolute', right: isMobile ? 'auto' : 0, left: isMobile ? 0 : 'auto', bottom: 'calc(100% + 6px)', zIndex: 51, width: 240, padding: 6, borderRadius: 10, background: t.bgCard, border: `1px solid ${t.border}`, boxShadow: t.shadowModal, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '6px 9px 4px', fontSize: 13, fontWeight: 800, color: t.text }}>What's wrong?</div>
              {REPORT_OPTIONS.map(([kind, label]) => {
                const done = kind === 'wrong' ? alreadyReported : kind === 'offcourse' ? offCourseIds.has(currentQ?.id) : myFlags.has(kind)
                return (
                  <button key={kind} type="button" role="menuitem" disabled={done || reporting || !!flagging}
                    onClick={async () => { setReportMenuOpen(false); await sendReport(kind) }}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 9px', borderRadius: 7, border: 'none', background: 'transparent', textAlign: 'left', fontFamily: FONT_B, fontSize: 13, color: done ? t.textFaint : t.text, cursor: done ? 'default' : 'pointer' }}
                    onMouseEnter={e => { if (!done) e.currentTarget.style.background = t.bgHover }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    {label}{done && <span style={{ fontSize: 11.5 }}>Sent</span>}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </span>
    )
  }
}
