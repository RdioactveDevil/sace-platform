import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Zap, TriangleAlert, CircleCheck, Bot, Flame, Timer, Pin, Lightbulb, Lock, ChevronDown, ChevronRight } from 'lucide-react'
import {
  selectNextQuestion,
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
  reportQuestion,
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
import QuizToolsDock from './QuizToolsDock'
import QuestionRenderer from './questions/QuestionRenderer'
import { getQuestionType, describeCorrectAnswer } from '../lib/questionTypes'
import { buildQuestionHelpContext, describeResponse } from '../lib/questionHelp'
import { consolidationRound, CONSOLIDATION_STREAK, CONSOLIDATION_MAX_QUESTIONS } from '../lib/consolidation'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
// Question-area width from which a reading passage sits beside the question
// (a ~340px question column + gap + a comfortable reading column). Laptops at
// 125% zoom only have ~890px here, and stacking the passage inside the 600px
// question card there left wide empty margins.
const SIDE_PASSAGE_MIN_WIDTH = 760
// The explanation panel only opens once a question is answered (before that
// it was a mostly empty column taking a third of the screen).
const EXPLAIN_PANEL_W = 340
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

function RemediationChip({ remediationMode, remediationStreak, remediationTarget, remediationStatus, remediationSource, theme = 'dark' }) {
  if (!remediationMode) return null
  const t = THEMES[theme]

  const statusText = remediationStatus === 'generating'
    ? 'Generating more similar questions for this same concept.'
    : remediationStatus === 'complete'
      ? 'Mastery confirmed. Returning to the main quiz.'
      : remediationStatus === 'struggling'
        ? "You're finding this one tricky. You can keep going with an easier question, or return to the quiz."
        : remediationStatus === 'needs_review'
          ? 'This topic has been added to your study plan for focused practice later.'
          : `You are in targeted reinforcement. Get ${remediationTarget} correct in a row to continue.`

  const streakBg = remediationStatus === 'complete' ? t.successBg
    : remediationStatus === 'struggling' ? t.accentGlow
    : remediationStatus === 'needs_review' ? t.purpleBg
    : t.bgHover
  const streakBorder = remediationStatus === 'complete' ? `${t.success}55`
    : remediationStatus === 'struggling' ? t.borderAccent
    : remediationStatus === 'needs_review' ? `${t.purple}55`
    : t.border
  const streakColor = remediationStatus === 'complete' ? t.success
    : remediationStatus === 'struggling' ? GOLD
    : remediationStatus === 'needs_review' ? t.purple
    : t.text

  return (
    <div style={{
      marginBottom: 14,
      padding: '14px 16px',
      borderRadius: 16,
      background: t.bgCard,
      border: `1px solid ${t.borderAccent}`,
      boxShadow: t.shadowCard,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 999,
            background: t.accentGlow,
            border: `1px solid ${t.borderAccent}`,
            color: GOLD,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            <Zap size={13} aria-hidden="true" />
            Remediation Mode
          </span>
          <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>
            {remediationSource === 'generated' ? 'Generated reinforcement' : 'From question bank'}
          </span>
        </div>
        <span style={{
          padding: '5px 11px',
          borderRadius: 999,
          background: streakBg,
          border: `1px solid ${streakBorder}`,
          color: streakColor,
          fontSize: 12,
          fontWeight: 700,
        }}>
          Mastery Streak: {Math.min(remediationStreak, remediationTarget)}/{remediationTarget}
        </span>
      </div>
      <div style={{ fontSize: 12, color: t.textMuted, marginTop: 10, lineHeight: 1.6 }}>{statusText}</div>
    </div>
  )
}

function StatusToast({ status, onReturnToQuiz, theme = 'dark' }) {
  if (!status || status === 'idle' || status === 'activated') return null
  const t = THEMES[theme]

  const isComplete = status === 'complete'
  const isStruggling = status === 'struggling'
  const isNeedsReview = status === 'needs_review'

  const borderColor = isComplete ? `${t.success}66`
    : isStruggling ? t.borderAccent
    : isNeedsReview ? `${t.purple}66`
    : t.borderAccent
  const iconBg = isComplete ? t.successBg
    : isStruggling ? t.accentGlow
    : isNeedsReview ? t.purpleBg
    : t.accentGlow
  const iconBorder = isComplete ? `${t.success}44`
    : isStruggling ? t.borderAccent
    : isNeedsReview ? `${t.purple}44`
    : t.borderAccent
  const icon = isComplete ? '\u2705' : isStruggling ? '\uD83D\uDCA1' : isNeedsReview ? '\uD83D\uDCDA' : '\uD83E\uDDE0'
  const title = isComplete ? 'Reinforcement Complete'
    : isStruggling ? 'Need a Break?'
    : isNeedsReview ? 'Topic Added to Study Plan'
    : 'Generating Similar Questions'
  const subtitle = isComplete
    ? 'Concept mastered! Returning to the main quiz.'
    : isStruggling
      ? "You've missed a few in a row. Keep going for an easier question, or return to the quiz and revisit this concept in your study plan."
      : isNeedsReview
        ? 'This concept will appear in your study plan for focused practice. Press Continue to return to the quiz.'
        : 'Preparing more same-concept reinforcement.'

  return (
    <div style={{
      marginTop: 12,
      borderRadius: 14,
      background: t.bgCard,
      border: `1px solid ${borderColor}`,
      boxShadow: t.shadowCard,
      padding: '14px 16px',
      animation: 'popIn 0.18s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          background: iconBg,
          border: `1px solid ${iconBorder}`,
          flexShrink: 0,
          marginTop: 1,
        }}>
          {icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{title}</div>
          <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5, marginTop: 2 }}>{subtitle}</div>
          {isStruggling && onReturnToQuiz && (
            <button
              onClick={onReturnToQuiz}
              style={{
                marginTop: 10,
                padding: '6px 14px',
                borderRadius: 8,
                border: `1px solid ${t.borderAccent}`,
                background: t.accentGlow,
                color: GOLD,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: FONT_B,
                display: 'block',
              }}
            >
              Return to Quiz
            </button>
          )}
        </div>
      </div>
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
    if (timeLeft <= 0) { setEndedForExam(true); setFinished(true); return }
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
  }, [questions, setDisplayQuestion, assignmentBand, consolidation, sessionResults, reviewIds])

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

  useEffect(() => {
    async function init() {
      try { await createSession(profile.id, subjectTile?.name || questions[0]?.subject || 'Unknown') } catch {}
    }
    if (!_currentQ) {
      init()
      loadNext([], struggleMap, quizMode, effectiveSubtopics)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_currentQ, loadNext, profile.id, quizMode, quizSubtopics, struggleMap, consolidation])

  // Count a main-question answer toward the assignment goal. App holds the
  // running state (updated here the same way the RPC updates the row) so it
  // survives this screen remounting; the RPC decides completion.
  // The question, response and time go into the tutor's assignment report.
  // Reviewing wrong answers is practice: redoing a miss mustn't count.
  const countAssignmentAnswer = (isCorrect, response, timeMs) => {
    if (!activeAssignment?.question_count || quizMode === 'review') return
    const next = applyAssignmentAnswer(activeAssignment, isCorrect)
    onAssignmentProgress?.({ progress_count: next.progress_count, recent_results: next.recent_results })
    const id = activeAssignment.id
    recordAssignmentAnswer(id, isCorrect, { questionId: currentQ?.id, response, timeMs })
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
        await recordAnswerCounted(profile.id, trackId, isCorrect, selectedIndex ?? null, null, timeTakenMs)
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
        },
      }
    })

    const answerWrite = recordAnswerCounted(profile.id, currentQ.id, isCorrect, idx, null, timeTakenMs)
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
  const handleSubmitResponse = async (response, isCorrect) => {
    if (showAns || !currentQ) return
    const isVariant = !!currentQ.is_variant
    const xpEarned = isVariant
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
        },
      }
    })

    const answerWrite = recordAnswerCounted(profile.id, currentQ.id, isCorrect, null, null, timeTakenMs).catch(() => {})

    if (examRun) {
      advanceExam()
      await Promise.all([xpWrite, answerWrite])
      return
    }

    if (!isCorrect) {
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
    ? 'Finish assignment →'
    : remediationPendingEntry
    ? 'Start Remediation →'
    : inRemediationQuestion && remediationStatus === 'complete'
      ? 'Return to Quiz →'
    : inRemediationQuestion && remediationStatus === 'struggling'
      ? 'Keep Going →'
    : inRemediationQuestion && remediationStatus === 'needs_review'
      ? 'Continue →'
    : inRemediationQuestion
      ? 'Next Similar Question →'
      : 'Next Question →'

  const chip = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: t.textSub, background: t.bgSubtle, border: `1px solid ${t.border}`, padding: '2px 9px', borderRadius: 999 }
  const explainOpen = !isMobile && showAns
  // Decide the passage layout on the width left once the explanation panel is
  // open, so answering doesn't flip the passage from beside to above the question.
  const layoutWidth = explainOpen ? questionAreaWidth : questionAreaWidth - EXPLAIN_PANEL_W
  const sidePassage = !isMobile && layoutWidth >= SIDE_PASSAGE_MIN_WIDTH && !!currentQ?.passage?.body

  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: t.bg, fontFamily: FONT_B, overflow: isMobile ? 'visible' : 'hidden' }}>
      <style>{`
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes floatXP { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-70px) scale(1.5)} }
        @keyframes popIn   { 0%{transform:scale(0.95);opacity:0} 100%{transform:scale(1);opacity:1} }
        @keyframes explainIn { from{opacity:0;transform:translateX(24px)} to{opacity:1;transform:translateX(0)} }
        .qopt { transition: all 0.13s ease; cursor: pointer; }
        .qopt:hover { border-color: ${GOLD} !important; background: rgba(241,190,67,0.05) !important; }
      `}</style>
      {freeQuota && (
        <div role="status" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '7px 16px', fontSize: 12.5, color: t.textMuted, borderBottom: `1px solid ${t.border}`, background: theme === 'dark' ? 'rgba(241,190,67,0.06)' : '#fffbeb' }}>
          <span><strong style={{ color: t.text }}>{Math.max(0, freeQuota.limit - freeQuota.used)}</strong> of {freeQuota.limit} free questions left today</span>
          <button type="button" onClick={freeQuota.onUpgrade} style={{ border: 'none', background: 'none', padding: 0, color: t.goldText, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>Go unlimited →</button>
        </div>
      )}

      {floatXP && (
        <div style={{ position: 'fixed', top: '30%', left: '50%', transform: 'translateX(-50%)', fontSize: 30, fontWeight: 800, color: GOLD, animation: 'floatXP 1.4s ease forwards', pointerEvents: 'none', zIndex: 9999 }}>
          +{floatXP} XP
        </div>
      )}

      {showExit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(8px)' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="gf-end-title" style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: '24px', maxWidth: 380, width: '90%', animation: 'popIn 0.2s ease', boxShadow: t.shadowModal }}>
            <div id="gf-end-title" style={{ fontSize: 18, fontWeight: 800, color: t.text, marginBottom: 6 }}>End this session?</div>
            <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 22, lineHeight: 1.6 }}>
              {sessionResults.some(r => !r.remediation)
                ? examRun
                  ? "The exam ends here and you'll see your answers so far."
                  : <>You've earned <strong style={{ color: t.text }}>{signedXP(sessionXP)} XP</strong>. You'll see a summary of this session next.</>
                : "You haven't answered any questions yet."}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowExit(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>Keep going</button>
              <button onClick={endSession} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: t.danger, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>End session</button>
            </div>
          </div>
        </div>
      )}

      {/* Status bar on the page colour: where you are on the left, how the
          session is going on the right. Score signals are hidden in an exam. */}
      <div style={{ background: t.bg, borderBottom: `1px solid ${t.border}`, padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, flexWrap: 'wrap', gap: 8, fontSize: 12.5, color: t.textMuted, fontVariantNumeric: 'tabular-nums' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Q{qNumber}{examRun && questionLimit > 0 ? ` of ${questionLimit}` : ''}</span>
          <span style={{ color: t.text, fontWeight: 600 }}>{currentQ.subtopic}</span>
          <span aria-label={`Difficulty ${currentQ.difficulty} of 5`} style={{ color: t.textFaint, letterSpacing: 1 }}>{'★'.repeat(currentQ.difficulty)}{'☆'.repeat(5 - currentQ.difficulty)}</span>
          {goalDisplay && (
            <span title="Questions answered toward your tutor's assignment" style={chip}>
              Assignment {goalDisplay.progress}/{goalDisplay.goal}
              {goalDisplay.minAccuracy && goalDisplay.accuracy !== null && ` · ${goalDisplay.accuracy}% (pass ${goalDisplay.minAccuracy}%)`}
            </span>
          )}
          {isStruggle && <span style={{ ...chip, color: t.danger }}><Zap size={12} aria-hidden="true" />Priority</span>}
          {remediationMode && (
            <span style={chip}>Extra practice · {Math.min(remediationStreak, remediationTarget)}/{remediationTarget} in a row</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {!examRun && sessionTotal > 0 && (
            <span><strong style={{ color: t.success }}>{sessionCorrect}</strong> right · <strong style={{ color: t.danger }}>{sessionTotal - sessionCorrect}</strong> wrong</span>
          )}
          {!examRun && streak >= 2 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: t.text, fontWeight: 700 }}><Flame size={14} color={t.goldText} aria-hidden="true" />{streak}</span>}
          {!examRun && <span>{signedXP(sessionXP)} XP</span>}
          {examRun && timerSeconds > 0 && (() => {
            const m = Math.floor(timeLeft / 60)
            const s = timeLeft % 60
            const urgent = timeLeft < 300
            return (
              <span style={{ fontWeight: 800, color: urgent ? t.danger : t.text, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Timer size={14} aria-hidden="true" />{m}:{String(s).padStart(2, '0')}
              </span>
            )
          })()}
          <button onClick={() => setShowExit(true)} style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>End session</button>
        </div>
      </div>

      {/* Level progress */}
      {!examRun && <div style={{ height: 2, background: t.border, flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: t.accent, transition: 'width 0.8s' }} />
      </div>}

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: isMobile ? 'visible' : 'hidden' }}>
        <div ref={setQuestionAreaEl} style={{ flex: 1, padding: isMobile ? '16px' : '32px 28px', overflowY: isMobile ? 'visible' : 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: sidePassage ? 1280 : 600, display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {sidePassage && (
            // The passage is what students read closely, so it gets ~60% of the row.
            <div style={{ flex: '3 1 0', minWidth: 0, position: 'sticky', top: 0 }}>
              <PassageView passage={currentQ.passage} theme={theme} fill />
            </div>
          )}
          <div style={{ flex: sidePassage ? '2 1 0' : '0 1 600px', minWidth: sidePassage ? 340 : 0, width: '100%', maxWidth: 600, animation: 'fadeUp 0.3s ease' }}>
            {consolidation && (
              <div style={{
                marginBottom: 14,
                padding: '10px 14px',
                borderRadius: 12,
                background: t.purpleBg,
                border: `1px solid ${t.purple}55`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.purple }}>
                    <Pin size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} aria-hidden="true" />Consolidating: <span style={{ color: t.text }}>{consolidation.label}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 3 }}>
                    {Math.min(round.inARow, CONSOLIDATION_STREAK)}/{CONSOLIDATION_STREAK} right in a row · question {Math.min(round.answered + (!currentQ?.is_variant && !showAns ? 1 : 0), CONSOLIDATION_MAX_QUESTIONS)} of {CONSOLIDATION_MAX_QUESTIONS}
                  </div>
                </div>
                <button
                  onClick={leaveConsolidation}
                  style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${t.purple}`, background: 'transparent', color: t.purple, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, flexShrink: 0 }}
                >
                  {consolidation.canReturn ? 'Back to my quiz' : 'Practise everything'}
                </button>
              </div>
            )}
            <RemediationChip
              remediationMode={remediationMode}
              remediationStreak={remediationStreak}
              remediationTarget={remediationTarget}
              remediationStatus={remediationStatus}
              remediationSource={remediationSource}
              theme={theme}
            />

            <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, padding: isMobile ? '20px' : '28px', boxShadow: t.shadowCard, marginBottom: showAns ? 14 : 0 }}>
              {currentQ.passage && !sidePassage && <PassageView passage={currentQ.passage} theme={theme} />}
              {currentQ.graph && (
                <GraphView graph={currentQ.graph} theme={theme} />
              )}
              {currentQ.table_data && (
                <TableView table={currentQ.table_data} theme={theme} />
              )}
              {currentQ.diagram && (
                <DiagramView diagram={currentQ.diagram} theme={theme} />
              )}
              {currentQ.image_url && getQuestionType(currentQ) !== 'hotspot' && getQuestionType(currentQ) !== 'image_label' && (
                <img
                  src={currentQ.image_url}
                  alt="Question diagram"
                  style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 10, marginBottom: 16 }}
                />
              )}
              <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 700, color: t.text, lineHeight: 1.7, marginBottom: 22 }}>
                <MathText text={currentQ.question} />
              </div>
              {getQuestionType(currentQ) === 'mcq' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {currentQ.options.map((opt, i) => {
                  const isCorrectOpt = i === currentQ.answer_index
                  const isSelectedOpt = i === selected
                  let bg = t.bgSubtle
                  let border = `1px solid ${t.border}`
                  let color = t.textSub
                  let lBg = t.borderMid
                  let lCol = t.text

                  if (!showAns && isSelectedOpt) {
                    bg = 'rgba(241,190,67,0.10)'
                    border = `1px solid ${GOLD}`
                    color = t.text
                    lBg = GOLD
                    lCol = NAVY
                  }

                  if (showAns) {
                    if (isCorrectOpt) {
                      bg = t.successBg
                      border = `1px solid ${t.success}55`
                      color = t.success
                      lBg = `${t.success}33`
                      lCol = t.success
                    } else if (isSelectedOpt && !correct) {
                      bg = t.dangerBg
                      border = `1px solid ${t.danger}55`
                      color = t.danger
                      lBg = `${t.danger}33`
                      lCol = t.danger
                    } else {
                      bg = 'transparent'
                      border = `1px solid ${t.border}`
                      color = t.textFaint
                      lBg = t.borderMid
                      lCol = t.textFaint
                    }
                  }

                  return (
                    <button
                      key={i}
                      // Choosing only selects: a misclick can be changed before Check answer.
                      onClick={() => { if (!showAns) setSelected(i) }}
                      aria-pressed={!showAns ? isSelectedOpt : undefined}
                      className={showAns ? '' : 'qopt'}
                      style={{
                        background: bg,
                        border,
                        color,
                        padding: '12px 16px',
                        borderRadius: 11,
                        fontSize: 14,
                        fontWeight: 600,
                        textAlign: 'left',
                        cursor: showAns ? 'default' : 'pointer',
                        fontFamily: FONT_B,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        transition: 'all 0.13s',
                      }}
                    >
                      <span style={{ width: 28, height: 28, borderRadius: '50%', background: lBg, color: lCol, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                        {showAns && isCorrectOpt ? '✓' : showAns && isSelectedOpt ? '✗' : String.fromCharCode(65 + i)}
                      </span>
                      <span style={{ minWidth: 0, flex: 1, overflowX: 'auto' }}>
                        <MathText text={opt} />
                      </span>
                    </button>
                  )
                })}
                {!showAns && (
                  <button
                    onClick={() => { if (selected != null) handleAnswer(selected) }}
                    disabled={selected == null}
                    style={{
                      marginTop: 8, width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                      background: selected != null ? t.accent : t.bgHover,
                      color: selected != null ? NAVY : t.textFaint, fontSize: 14, fontWeight: 800,
                      cursor: selected != null ? 'pointer' : 'default', fontFamily: FONT_B,
                    }}
                  >
                    {examRun ? 'Submit answer' : 'Check answer'}
                  </button>
                )}
              </div>
              ) : (
                <QuestionRenderer
                  question={currentQ}
                  response={selected}
                  onChange={setSelected}
                  showAns={showAns}
                  onSubmit={handleSubmitResponse}
                  theme={theme}
                  checkLabel={examRun ? 'Submit answer' : 'Check answer'}
                />
              )}
            </div>

              {showAns && (
                <div style={{ animation: 'popIn 0.2s ease' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
                    <button
                      onClick={nextQ}
                      disabled={remediationStatus === 'generating'}
                      style={{
                        flex: 1,
                        padding: '14px',
                        borderRadius: 12,
                        border: 'none',
                        background: t.accent,
                        color: NAVY,
                        fontSize: 15,
                        fontWeight: 800,
                        cursor: 'pointer',
                        fontFamily: FONT_B,
                        opacity: remediationStatus === 'generating' ? 0.7 : 1,
                        pointerEvents: remediationStatus === 'generating' ? 'none' : 'auto',
                      }}
                    >
                      {nextButtonLabel}
                    </button>
                    {onOpenLearn && !examMode && (
                      <button
                        onClick={() => onOpenLearn(currentQ.topic, buildQuestionHelpContext(currentQ, selected, correct))}
                        title="Explain this concept with Titan AI"
                        style={{
                          flexShrink: 0,
                          padding: '14px 16px',
                          borderRadius: 12,
                          border: `1px solid rgba(241,190,67,0.35)`,
                          background: 'rgba(241,190,67,0.08)',
                          color: GOLD,
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: FONT_B,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Get Titan's Help
                      </button>
                    )}
                  </div>

                  <StatusToast
                    status={['complete', 'struggling', 'needs_review', 'generating'].includes(remediationStatus) ? remediationStatus : null}
                    onReturnToQuiz={handleReturnToQuiz}
                    theme={theme}
                  />

                  {remediationMode && (
                    <div style={{
                      marginTop: 12,
                      padding: '12px 14px',
                      background: t.accentGlow2,
                      borderRadius: 12,
                      border: `1px solid ${t.borderAccent}`,
                      animation: 'popIn 0.18s ease',
                    }}>
                      <div style={{
                        fontSize: 11,
                        color: GOLD,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        marginBottom: 4,
                      }}>
                        Remediation State
                      </div>
                      <div style={{ fontSize: 13, color: t.text, fontWeight: 700, marginBottom: 4 }}>
                        Mastery Streak: {Math.min(remediationStreak, remediationTarget)}/{remediationTarget}
                      </div>
                      <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6 }}>
                        {remediationStatus === 'complete'
                          ? 'Mastery confirmed. Return to the main quiz when you are ready.'
                          : remediationStatus === 'struggling'
                            ? `Keep going with an easier question, or return to the quiz. You only need 1 correct answer to continue.`
                            : remediationStatus === 'needs_review'
                              ? 'This concept has been added to your study plan. Press Continue to return to the quiz.'
                              : `This concept is temporarily locked. Get ${remediationTarget} correct in a row to continue.`}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isMobile && showAns && (
                <div style={{ marginTop: 14, background: t.bgCard, borderRadius: 14, padding: '18px', border: `1px solid ${t.border}`, animation: 'popIn 0.25s ease' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 20, marginBottom: 14, background: correct ? t.successBg : t.dangerBg, border: `1px solid ${correct ? t.success + '55' : t.danger + '55'}`, fontSize: 12, fontWeight: 700, color: correct ? t.success : t.danger }}>
                    {correct ? `✓ Correct · +${earnedXP} XP` : `✗ Incorrect · ${earnedXP >= 0 ? '+' : ''}${earnedXP} XP`}
                  </div>
                  <div style={{ fontSize: 10, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Explanation</div>
                  <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.75, marginBottom: currentQ.tip ? 10 : 0 }}>
                    <MathText text={currentQ.solution} />
                  </div>
                  {currentQ.tip && (
                    <div style={{ marginTop: 10, padding: '9px 12px', background: t.accentGlow2, borderRadius: '0 8px 8px 0', borderLeft: `2px solid ${GOLD}`, fontSize: 12, color: GOLD, lineHeight: 1.65, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <Lightbulb size={14} style={{ flexShrink: 0, marginTop: 3 }} aria-hidden="true" /><div style={{ flex: 1, minWidth: 0 }}><MathText text={currentQ.tip} /></div>
                    </div>
                  )}
                  {loadingTip && <div style={{ fontSize: 12, color: t.textFaint, fontStyle: 'italic', marginTop: 8 }}>Getting AI tip…</div>}
                  {aiTip && (
                    <div style={{ marginTop: 8, padding: '9px 12px', background: t.purpleBg, borderRadius: '0 8px 8px 0', borderLeft: `2px solid ${t.purple}`, fontSize: 12, color: t.purple, lineHeight: 1.65, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <Bot size={14} style={{ flexShrink: 0, marginTop: 3 }} aria-hidden="true" /><div style={{ flex: 1, minWidth: 0 }}><MathText text={aiTip} /></div>
                    </div>
                  )}
                  {(() => {
                    const qid = currentQ?.is_variant ? (currentQ?.parent_question_id || currentQ?.id) : currentQ?.id
                    const myFlags = flaggedMap[qid] || new Set()
                    const alreadyReported = !!currentQ?.id && reportedIds.has(currentQ.id)
                    return (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 10, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Flag this question</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {['Too easy', 'Too hard', 'Confusing', 'Typo'].map(tag => {
                            const active = myFlags.has(tag)
                            const saving = flagging === tag
                            return (
                              <button key={tag} onClick={() => handleFlag(tag)} disabled={!!flagging}
                                style={{
                                  padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: flagging ? 'default' : 'pointer',
                                  fontFamily: FONT_B, transition: 'all 0.15s',
                                  border: `1px solid ${active ? t.borderAccent : t.border}`,
                                  background: active ? t.accentGlow2 : 'transparent',
                                  color: active ? GOLD : saving ? t.textMuted : t.textFaint,
                                  opacity: flagging && !saving ? 0.5 : 1,
                                }}
                              >{saving ? '…' : active ? `✓ ${tag}` : tag}</button>
                            )
                          })}
                          <button
                            onClick={handleReport}
                            disabled={reporting || alreadyReported}
                            style={{
                              padding: '4px 9px', borderRadius: 6, fontSize: 11,
                              cursor: reporting || alreadyReported ? 'default' : 'pointer',
                              fontFamily: FONT_B, transition: 'all 0.15s',
                              border: `1px solid ${alreadyReported ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.25)'}`,
                              background: alreadyReported ? 'rgba(239,68,68,0.1)' : 'transparent',
                              color: alreadyReported ? '#f87171' : reporting ? t.textMuted : 'rgba(239,68,68,0.7)',
                            }}
                          >{reporting ? '…' : alreadyReported ? '✓ Reported' : 'Wrong answer'}</button>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          </div>
          </div>

          {explainOpen && (
            <div style={{ width: EXPLAIN_PANEL_W, flexShrink: 0, borderLeft: `1px solid ${t.border}`, background: t.bgSubtle, overflowY: 'auto', padding: '32px 28px', display: 'flex', flexDirection: 'column', animation: 'explainIn 0.25s ease' }}>
                <div style={{ maxWidth: 500 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 14px', borderRadius: 20, marginBottom: 20, background: correct ? t.successBg : t.dangerBg, border: `1px solid ${correct ? t.success + '55' : t.danger + '55'}`, fontSize: 13, fontWeight: 700, color: correct ? t.success : t.danger }}>
                    {correct ? `✓ Correct · +${earnedXP} XP` : `✗ Incorrect · ${earnedXP >= 0 ? '+' : ''}${earnedXP} XP`}
                  </div>

                  <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Explanation</div>
                  <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.8, marginBottom: 16 }}><MathText text={currentQ.solution} /></div>

                  {currentQ.tip && (
                    <div style={{ padding: '12px 14px', background: t.accentGlow2, borderRadius: '0 10px 10px 0', borderLeft: `3px solid ${GOLD}`, fontSize: 13, color: GOLD, lineHeight: 1.65, marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <Lightbulb size={14} style={{ flexShrink: 0, marginTop: 4 }} aria-hidden="true" /><div style={{ flex: 1, minWidth: 0 }}><MathText text={currentQ.tip} /></div>
                    </div>
                  )}

                  {loadingTip && <div style={{ fontSize: 12, color: t.textFaint, fontStyle: 'italic', marginBottom: 12 }}>Getting AI tip…</div>}
                  {aiTip && (
                    <div style={{ padding: '12px 14px', background: t.purpleBg, borderRadius: '0 10px 10px 0', borderLeft: `3px solid ${t.purple}`, fontSize: 13, color: t.purple, lineHeight: 1.65, marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <Bot size={14} style={{ flexShrink: 0, marginTop: 4 }} aria-hidden="true" /><div style={{ flex: 1, minWidth: 0 }}><MathText text={aiTip} /></div>
                    </div>
                  )}

                  {(() => {
                    const qid = currentQ?.is_variant ? (currentQ?.parent_question_id || currentQ?.id) : currentQ?.id
                    const myFlags = flaggedMap[qid] || new Set()
                    const alreadyReported = !!currentQ?.id && reportedIds.has(currentQ.id)
                    return (
                      <div>
                        <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Flag this question</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {['Too easy', 'Too hard', 'Confusing', 'Typo'].map(tag => {
                            const active = myFlags.has(tag)
                            const saving = flagging === tag
                            return (
                              <button
                                key={tag}
                                onClick={() => handleFlag(tag)}
                                disabled={!!flagging}
                                style={{
                                  padding: '5px 10px', borderRadius: 7, fontSize: 12, cursor: flagging ? 'default' : 'pointer',
                                  fontFamily: FONT_B, transition: 'all 0.15s',
                                  border: `1px solid ${active ? t.borderAccent : t.border}`,
                                  background: active ? t.accentGlow2 : saving ? t.bgHover : 'transparent',
                                  color: active ? GOLD : saving ? t.textMuted : t.textFaint,
                                  opacity: flagging && !saving ? 0.5 : 1,
                                }}
                              >
                                {saving ? '…' : active ? `✓ ${tag}` : tag}
                              </button>
                            )
                          })}
                          <button
                            onClick={handleReport}
                            disabled={reporting || alreadyReported}
                            style={{
                              padding: '5px 10px', borderRadius: 7, fontSize: 12,
                              cursor: reporting || alreadyReported ? 'default' : 'pointer',
                              fontFamily: FONT_B, transition: 'all 0.15s',
                              border: `1px solid ${alreadyReported ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.25)'}`,
                              background: alreadyReported ? 'rgba(239,68,68,0.1)' : 'transparent',
                              color: alreadyReported ? '#f87171' : reporting ? t.textMuted : 'rgba(239,68,68,0.7)',
                            }}
                          >
                            {reporting ? '…' : alreadyReported ? '✓ Reported' : 'Wrong answer'}
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </div>
            </div>
          )}
        </div>
      <QuizToolsDock theme={theme} />
      </div>
  )
}
