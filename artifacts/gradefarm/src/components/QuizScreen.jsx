import { useState, useEffect, useCallback, useRef } from 'react'
import {
  selectNextQuestion,
  calcXP,
  calcRemediationXP,
  getRemediationCompletionBonus,
  getLevelProgress,
  getQuestionCounts,
  getQuestionConceptTag,
} from '../lib/engine'
import {
  recordAnswer,
  addXP,
  createSession,
  getRemediationVariants,
  insertGeneratedQuestionVariants,
  insertGeneratedQuestionsToBank,
  fetchAndPersistMoreQuestions,
  incrementQuestionVariantUsage,
  flagQuestion,
  flagTopicForStudyPlan,
  completeAssignment,
} from '../lib/db'
import { THEMES } from '../lib/theme'
import { getTopicCodeByName } from '../lib/adminTopics'
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
import GraphView from './GraphView'
import TableView from './TableView'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const NAVY = '#0c1037'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

/**
 * Derive a target difficulty (1–5) from the last 5 main-quiz results.
 * Returns null when there isn't enough data yet (first 2 questions of a session).
 *
 * Logic:
 *   accuracy ≥ 70% → step up by 1 from the recent average difficulty
 *   accuracy ≤ 40% → step down by 1
 *   otherwise      → hold at the recent average
 */
function getTargetDifficulty(sessionResults, questions) {
  const mainResults = (sessionResults || []).filter(r => !r.remediation)
  const recent = mainResults.slice(-5)
  if (recent.length < 2) return null

  const accuracy = recent.filter(r => r.correct).length / recent.length

  const recentDiffs = recent.flatMap(r => {
    const q = (questions || []).find(qq => qq.id === r.id)
    return q?.difficulty ? [q.difficulty] : []
  })
  const avgDiff = recentDiffs.length > 0
    ? recentDiffs.reduce((a, b) => a + b, 0) / recentDiffs.length
    : 3

  if (accuracy >= 0.7) return Math.min(5, Math.round(avgDiff) + 1)
  if (accuracy <= 0.4) return Math.max(1, Math.round(avgDiff) - 1)
  return Math.round(avgDiff)
}

async function generateConceptBuilderViaAI(parentQuestion, conceptTag) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const correctAnswer = parentQuestion.options?.[parentQuestion.answer_index] || ''
    const system = [
      'You are a SACE Chemistry teacher generating a concept-builder question for a struggling student.',
      'Return only a valid JSON object (not an array).',
      'The question MUST embed the key fact or hint directly in the question stem — like a teacher explaining in class.',
      'Structure: state the core concept or mechanism first, then ask the student to apply it.',
      'Make it feel like a teacher leading the student step-by-step to the answer.',
      'Required keys: question, options (array of exactly 4 strings), answer_index, solution, tip,',
      'difficulty (always 1), topic, subtopic, concept_tag, variant_type (always "concept_builder").',
      'No markdown, no commentary outside the JSON.',
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
      const parsed = JSON.parse(rawText)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {}

    // Try extracting object from text
    const start = rawText.indexOf('{')
    const end = rawText.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(rawText.slice(start, end + 1))
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
            ⚡ Remediation Mode
          </span>
          <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>
            {remediationSource === 'generated' ? 'Generated reinforcement' : 'Prebuilt reinforcement'}
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
  examMode = false, timerSeconds = 0,
  onOpenLearn, consolidateSubtopic, onClearConsolidate,
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
  activeAssignmentId,
  onAssignmentComplete,
  onBankQuestionsAdded,
  finished: _finished, setFinished,
  sessionTip: _sessionTip, setSessionTip,
  sessionTipLoading: _sessionTipLoading, setSessionTipLoading,
  onGoToStudyPlan,
}) {
  const t = THEMES[theme]

  const [floatXP, setFloatXP] = useState(null)
  const [showExit, setShowExit] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 860)
  const [generatingMore, setGeneratingMore] = useState(false)
  const generatingMoreRef = useRef(false)
  const bankExhaustionAttempted = useRef(false)
  const backgroundPrefetchAttempted = useRef(false)
  const [flaggedMap, setFlaggedMap] = useState({}) // { [questionId]: Set of flag_types }
  const [flagging, setFlagging] = useState(null)   // currently-saving flag tag
  const [remediationWrongCount, setRemediationWrongCount] = useState(0)
  const [remediationDifficultyTarget, setRemediationDifficultyTarget] = useState(null)
  const [assignmentsCompleted, setAssignmentsCompleted] = useState([])
  const [timeLeft, setTimeLeft] = useState(timerSeconds)
  const sessionCompletedRef = useRef(false)
  const startTime = useRef(null)
  // Maps variant_record_id -> real questions.id once background bank
  // persistence finishes; lets handleAnswer still record variant attempts
  // even when the queue item rendered before persistence completed.
  const pendingBankIdsRef = useRef(new Map())
  // Per-question prefetched DB variants — filled in the background while
  // the student reads the question, consumed by enterRemediation.
  const variantPrefetchRef = useRef(new Map())
  // Concept tags already pre-warmed this session — prevents duplicate work.
  const sessionPrewarmedRef = useRef(new Set())

  useEffect(() => {
    const h = () => { setIsMobile(window.innerWidth < 860) }
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  // Reset timer when a new exam session starts
  useEffect(() => { setTimeLeft(timerSeconds) }, [timerSeconds])

  // Countdown tick — auto-ends session when time expires
  // Uses _finished (prop) not finished (const declared later) to avoid TDZ
  useEffect(() => {
    if (!examMode || timerSeconds <= 0 || _finished) return
    if (timeLeft <= 0) { setFinished(true); return }
    const id = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [examMode, timerSeconds, _finished, timeLeft])

  const currentQ = _currentQ ?? null
  const selected = _selected ?? null
  const showAns = _showAns ?? false
  const correct = _correct ?? null
  const earnedXP = _earnedXP ?? 0
  const streak = _streak ?? (profile.streak || 0)
  const sessionXP = _sessionXP ?? 0
  const sessionResults = _sessionResults ?? []
  const sessionAnswered = _sessionAnswered ?? []
  const qNumber = _qNumber ?? 1
  const aiTip = _aiTip ?? ''
  const loadingTip = _loadingTip ?? false
  const quizMode = _quizMode ?? 'new'
  const quizSubtopics = Array.isArray(_quizSubtopics) ? _quizSubtopics : []
  const effectiveSubtopics = consolidateSubtopic ? [consolidateSubtopic] : quizSubtopics
  const remediationMode = _remediationMode ?? false
  const remediationStreak = _remediationStreak ?? 0
  const remediationTarget = _remediationTarget ?? 3
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

  const loadNext = useCallback((answered, map, mode = 'new', subtopics = [], targetDiff = null) => {
    const q = selectNextQuestion(questions, map, answered, mode, subtopics, targetDiff)
    if (!q) {
      setFinished(true)
      return
    }
    setDisplayQuestion(q)
  }, [questions, setDisplayQuestion])

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
    const _targetDiff = getTargetDifficulty(sessionAnswered, questions)
    setStruggleMap(prev => { loadNext(sessionAnswered, prev, quizMode, effectiveSubtopics, _targetDiff); return prev })
  }, [clearRemediation, effectiveSubtopics, loadNext, profile.id, quizMode, questions, remediationConcept, remediationOriginalQ, sessionAnswered, setQNumber, setStruggleMap])

  const remediationDeps = {
    getRemediationVariants,
    generateAIVariants: generateRemediationVariantsViaAI,
    insertVariants: insertGeneratedQuestionVariants,
    insertToBank: insertGeneratedQuestionsToBank,
    dbTimeoutMs: REMEDIATION_DB_TIMEOUT_MS,
  }

  const generateRemediationQueue = useCallback(
    async (parentQuestion, existingUsedIds = [], difficultyTarget = null, options = {}) =>
      runGenerateRemediationQueue({
        parentQuestion,
        existingUsedIds,
        difficultyTarget,
        options,
        questions,
        deps: remediationDeps,
        setRemediationStatus,
        setRemediationQueue,
        setRemediationSource,
        pendingBankIds: pendingBankIdsRef.current,
        onBankQuestionsAdded,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions, setRemediationQueue, setRemediationSource, setRemediationStatus, onBankQuestionsAdded],
  )

  const enterRemediation = useCallback(
    async (parentQuestion) =>
      runEnterRemediation({
        parentQuestion,
        prefetched: variantPrefetchRef.current,
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
      try { await createSession(profile.id, 'Chemistry') } catch {}
    }
    if (!_currentQ) {
      init()
      loadNext([], struggleMap, quizMode, effectiveSubtopics)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_currentQ, loadNext, profile.id, quizMode, quizSubtopics, struggleMap, consolidateSubtopic])

  // Auto-complete the specific tutor assignment that launched this session (if any).
  // Only fires when the student actually answered at least one question.
  useEffect(() => {
    const sessionEnded = finished || (sessionResults.length > 0 && !_currentQ)
    if (!sessionEnded) return
    if (sessionCompletedRef.current) return
    if (!activeAssignmentId) return
    if (sessionResults.length === 0) return  // guard: no questions answered, don't auto-complete
    sessionCompletedRef.current = true

    completeAssignment(activeAssignmentId)
      .then(() => {
        setAssignmentsCompleted([{ id: activeAssignmentId }])
        onAssignmentComplete?.()
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, _currentQ, sessionResults.length, activeAssignmentId])

  // Reset completion ref when a new session starts
  useEffect(() => {
    if (!finished && _currentQ) sessionCompletedRef.current = false
  }, [_currentQ, finished])

  // Bank exhaustion: when 'new' mode runs out of questions, generate more via AI
  // and persist them directly to the live questions table so they're reusable.
  useEffect(() => {
    if (!finished || quizMode !== 'new') return
    if (generatingMoreRef.current) return
    // Only attempt generation once per session to prevent infinite retry loops.
    if (bankExhaustionAttempted.current) return

    // Derive subject + topic from the most-recently-answered main question.
    const lastMain = [...sessionResults].reverse().find(r => !r.remediation)
    const lastQ = lastMain ? questions.find(q => q.id === lastMain.id) : questions[0]
    const subject   = lastQ?.subject
    const topicName = lastQ?.topic
    if (!subject || !topicName) return

    const topicCode = getTopicCodeByName(subject, topicName)
    if (!topicCode) return

    generatingMoreRef.current = true
    bankExhaustionAttempted.current = true
    // Also mark prefetch done so we don't double-generate.
    backgroundPrefetchAttempted.current = true
    setGeneratingMore(true)
    setFinished(false)

    // Derive target difficulty from recent session performance.
    const exhaustionDiff = getTargetDifficulty(sessionResults, questions)

    // Generate 3 questions first so the user gets back into the quiz quickly,
    // then immediately fire a background top-up of 10 more while they answer.
    fetchAndPersistMoreQuestions(subject, topicCode, 3, exhaustionDiff)
      .then(newQs => {
        if (!newQs.length) { setFinished(true); return }
        if (typeof onBankQuestionsAdded === 'function') onBankQuestionsAdded(newQs)
        setDisplayQuestion(newQs[0])
        // Background top-up: generate 10 more while the user answers the 3.
        fetchAndPersistMoreQuestions(subject, topicCode, 10, exhaustionDiff)
          .then(moreQs => {
            if (moreQs.length && typeof onBankQuestionsAdded === 'function') {
              onBankQuestionsAdded(moreQs)
            }
          })
          .catch(() => {})
      })
      .catch(() => { setFinished(true) })
      .finally(() => {
        generatingMoreRef.current = false
        setGeneratingMore(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  // Background prefetch: when the unseen question pool drops to ≤ 3, silently
  // generate more questions in the background so the bank is replenished before
  // the user reaches the end — they never see a loading screen.
  useEffect(() => {
    if (finished || quizMode !== 'new') return
    if (backgroundPrefetchAttempted.current || generatingMoreRef.current) return

    // Count questions still available to pick (unseen + not answered this session).
    const pool = effectiveSubtopics.length > 0
      ? questions.filter(q => effectiveSubtopics.includes(q.subtopic))
      : questions
    const remaining = pool.filter(q => {
      const s = struggleMap[q.id]
      return (!s || s.attempts === 0) && !sessionAnswered.includes(q.id)
    }).length

    if (remaining > 3) return   // still plenty — don't prefetch yet

    // Derive subject + topic from the most-recently-answered main question.
    const lastMain = [...sessionResults].reverse().find(r => !r.remediation)
    const lastQ = lastMain ? questions.find(q => q.id === lastMain.id) : questions[0]
    const subject   = lastQ?.subject
    const topicName = lastQ?.topic
    if (!subject || !topicName) return

    const topicCode = getTopicCodeByName(subject, topicName)
    if (!topicCode) return

    backgroundPrefetchAttempted.current = true

    // Fire-and-forget: no loading state, no UI change.
    const prefetchDiff = getTargetDifficulty(sessionResults, questions)
    fetchAndPersistMoreQuestions(subject, topicCode, 10, prefetchDiff)
      .then(newQs => {
        if (newQs.length && typeof onBankQuestionsAdded === 'function') {
          onBankQuestionsAdded(newQs)
        }
      })
      .catch(() => {
        // Silent failure — exhaustion handler will retry when the bank runs dry.
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
        system: "You are a supportive SACE tutor. Write exactly ONE sentence of coaching advice based on this student's quiz session. Be specific, actionable, and encouraging. No preamble, no markdown.",
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
          getRemediationVariants(qid, ctag, []),
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

          const generated = await generateRemediationVariantsViaAI(
            parent, tag, parent.difficulty
          )
          if (!generated.length) return

          // Persist to the main bank (so they show up in future sessions).
          try {
            const bankRows = await withTimeout(
              insertGeneratedQuestionsToBank(parent, generated),
              5000,
              `prewarm-bank(${tag})`
            )
            if (bankRows.length && typeof onBankQuestionsAdded === 'function') {
              try { onBankQuestionsAdded(bankRows) } catch {}
            }
          } catch (bErr) {
            console.warn(`[gradefarm] prewarm bank persist failed for "${tag}":`, bErr?.message || bErr)
          }

          // Also persist to question_variants so getRemediationVariants finds
          // them next time the student gets this same parent wrong.
          try { await insertGeneratedQuestionVariants(parent, generated) } catch {}

          console.info(`[gradefarm] pre-warmed ${generated.length} variant(s) for "${tag}"`)
        } catch (err) {
          console.warn(`[gradefarm] prewarm failed for "${tag}":`, err?.message || err)
        }
      }))
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  // Clear consolidation filter when leaving the quiz screen
  useEffect(() => {
    return () => {
      if (consolidateSubtopic) onClearConsolidate?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    setSessionResults(r => [...r, { id: currentQ.id, correct: isCorrect, topic: currentQ.topic, remediation: isRemediationQuestion }])

    if (isCorrect) {
      setFloatXP(xpEarned)
      setTimeout(() => setFloatXP(null), 1400)
    }

    try {
      const newXP = await addXP(profile.id, xpEarned, newStreak, profile)
      setProfile(p => ({ ...p, xp: newXP, streak: newStreak, best_streak: Math.max(p.best_streak || 0, newStreak) }))
    } catch {}

    if (isRemediationQuestion) {
      try { await incrementQuestionVariantUsage(currentQ.variant_record_id) } catch {}

      // Track the variant attempt against its real bank id so this question is
      // excluded from future non-'all' sessions (no-repeat rule). Only do this
      // when we have a real questions.id — synthetic queue keys (local_fallback__,
      // variant__) would violate the answer_log foreign key. If the queue item
      // didn't have bank_question_id at render time, look it up via pendingBankIdsRef.
      const trackId =
        currentQ.bank_question_id ||
        (currentQ.variant_record_id && pendingBankIdsRef.current.get(currentQ.variant_record_id)) ||
        null
      if (trackId) {
        try {
          await recordAnswer(profile.id, trackId, isCorrect, idx, null, timeTakenMs)
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
      }

      if (isCorrect) {
        const nextMastery = remediationStreak + 1
        setRemediationStreak(nextMastery)

        if (nextMastery >= remediationTarget) {
          const bonus = getRemediationCompletionBonus()
          try {
            const newXP = await addXP(profile.id, bonus, newStreak, { ...profile, xp: profile.xp + xpEarned })
            setProfile(p => ({ ...p, xp: newXP }))
            setSessionXP(s => s + bonus)
          } catch {}
          setRemediationStatus('complete')
        }
      } else {
        // Option D: concept-builder questions are exempt from wrong count
        const isConceptBuilder = currentQ.variant_type === 'concept_builder'

        if (!isConceptBuilder) {
          setRemediationStreak(0)
          const newWrongCount = remediationWrongCount + 1
          setRemediationWrongCount(newWrongCount)
          const newDiffTarget = Math.max(1, (remediationDifficultyTarget ?? (remediationOriginalQ?.difficulty ?? 3)) - 1)
          setRemediationDifficultyTarget(newDiffTarget)

          if (newWrongCount >= 5) {
            // Option G: hard exit — flag topic for study plan, no failure messaging
            setRemediationStatus('needs_review')
          } else if (newWrongCount === 3) {
            // Option F: soft pause — student gets a choice
            setRemediationTarget(1) // Option I: scale target down to 1
            setRemediationStatus('struggling')
          } else if (newWrongCount === 2) {
            // Option I: scale mastery target down, trigger concept builder
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
        // concept builders: no wrongCount change, no streak reset, student just continues
      }
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

    await recordAnswer(profile.id, currentQ.id, isCorrect, idx, null, timeTakenMs)

    if (!isCorrect) {
      // Immediately lock into remediation so the button changes to "Start Remediation →"
      // before the AI tip fetch runs. Without this, the user could click "Next Question →"
      // during the 3.5s AI timeout window and skip remediation entirely.
      const conceptTagNow = currentQ.concept_tag || getQuestionConceptTag(currentQ)
      const initialDiffTarget = Math.max(1, (currentQ.difficulty ?? 3) - 1)
      setRemediationMode(true)
      setRemediationStreak(0)
      setRemediationTarget(3)
      setRemediationWrongCount(0)
      setRemediationDifficultyTarget(initialDiffTarget)
      setRemediationStatus('generating') // keep button disabled until queue is loaded
      setRemediationSource('prebuilt')
      setRemediationConcept(conceptTagNow)
      setRemediationParentId(currentQ.id)
      setRemediationOriginalQ(currentQ)
      setRemediationUsedIds([])

      // Load remediation queue in background — parallel with AI tip fetch
      enterRemediation(currentQ)

      setLoadingTip(true)
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            max_tokens: 200,
            system: 'You are a SACE Chemistry tutor. Write exactly 2 sentences: one explaining the conceptual mistake, one giving a memory trick. No markdown. No preamble.',
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
  }

  const loadNextRemediationQuestion = async () =>
    runLoadNextRemediationQuestion({
      remediationQueue,
      remediationOriginalQ,
      remediationUsedIds,
      remediationDifficultyTarget,
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

  const counts = getQuestionCounts(questions, struggleMap, effectiveSubtopics)

  if (finished || (!currentQ && sessionResults.length > 0)) {
    const startMode = (mode) => {
      generatingMoreRef.current = false
      bankExhaustionAttempted.current = false
      backgroundPrefetchAttempted.current = false
      setGeneratingMore(false)
      setQuizMode(mode)
      setSessionAnswered([])
      setSessionResults([])
      setQNumber(1)
      setSessionXP(0)
      clearRemediation()
      setFinished(false)
      loadNext([], struggleMap, mode, effectiveSubtopics)
    }

    // ── Session summary calculations ────────────────────────────────────────
    const mainResults   = sessionResults.filter(r => !r.remediation)
    const sessCorrect   = mainResults.filter(r => r.correct).length
    const sessTotal     = mainResults.length
    const sessAccuracy  = sessTotal > 0 ? Math.round((sessCorrect / sessTotal) * 100) : 0
    const accColor      = sessAccuracy >= 70 ? '#4ade80' : sessAccuracy >= 40 ? GOLD : '#f87171'
    const accEmoji      = sessAccuracy >= 70 ? '🏆' : sessAccuracy >= 40 ? '📈' : '💪'

    // Per-topic breakdown (main questions only)
    const topicMap = {}
    mainResults.forEach(r => {
      if (!r.topic) return
      if (!topicMap[r.topic]) topicMap[r.topic] = { correct: 0, total: 0 }
      topicMap[r.topic].total++
      if (r.correct) topicMap[r.topic].correct++
    })
    const topicBreakdown = Object.entries(topicMap)
      .map(([topic, s]) => ({ topic, ...s, pct: Math.round((s.correct / s.total) * 100) }))
      .sort((a, b) => a.pct - b.pct) // weakest first

    const weakTopics = topicBreakdown.filter(t => t.pct < 70)
    const weakSubtopics = [...new Set(
      sessionResults.filter(r => !r.correct && !r.remediation && r.subtopic).map(r => r.subtopic)
    )].slice(0, 4)

    const headlineText = examMode
      ? (timeLeft <= 0 ? "Time's Up!" : 'Exam Complete!')
      : quizMode === 'new'
        ? 'Session Complete!'
        : quizMode === 'wrong'
          ? 'Wrongs Reviewed!'
          : 'Session Complete!'

    return (
      <div style={{ minHeight: '100%', background: t.bg, fontFamily: FONT_B, overflowY: 'auto', position: 'relative' }}>
        <style>{`
          @keyframes ss-fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
          .ss-grid { background-image: linear-gradient(rgba(241,190,67,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(241,190,67,0.03) 1px, transparent 1px); background-size: 52px 52px; }
        `}</style>
        <div className="ss-grid" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 600, height: 300, borderRadius: '50%', background: `radial-gradient(circle,rgba(241,190,67,0.07) 0%,transparent 70%)`, filter: 'blur(40px)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '48px 20px 60px', animation: 'ss-fadeUp 0.35s ease', position: 'relative', zIndex: 1 }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>{accEmoji}</div>
            <div style={{ fontFamily: FONT_D, fontSize: 26, color: t.text, letterSpacing: 1, marginBottom: 6 }}>
              {headlineText}
            </div>
            <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.6 }}>
              {quizMode === 'new' && sessTotal > 0
                ? "You've worked through every question in this set."
                : 'Good work finishing the session.'}
            </div>
          </div>

          {/* Assignments completed banner */}
          {assignmentsCompleted.length > 0 && (
            <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: t.successBg, border: `1px solid ${t.success}55`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>✅</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.success }}>
                  {assignmentsCompleted.length === 1 ? 'Assignment completed!' : `${assignmentsCompleted.length} assignments completed!`}
                </div>
                <div style={{ fontSize: 11, color: t.textFaint, marginTop: 1 }}>Your tutor has been notified.</div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Accuracy',  val: `${sessAccuracy}%`,      color: accColor, isXP: false },
              { label: 'Correct',   val: `${sessCorrect}/${sessTotal}`, color: t.text, isXP: false },
              { label: 'XP Earned', val: `+${sessionXP}`,         color: GOLD, isXP: true },
            ].map(s => (
              <div key={s.label} style={{
                background: s.isXP ? t.accentGlow : t.bgCard,
                border: `1px solid ${s.isXP ? t.borderAccent : t.border}`,
                borderRadius: 14,
                padding: '16px 10px',
                textAlign: 'center',
                boxShadow: t.shadowCard,
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: FONT_D, letterSpacing: 0.5 }}>{s.val}</div>
                <div style={{ fontSize: 10, color: s.isXP ? GOLD : t.textMuted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Topic breakdown */}
          {topicBreakdown.length > 0 && (
            <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 20, boxShadow: t.shadowCard }}>
              <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Topic Breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {topicBreakdown.map(tb => {
                  const tc = tb.pct >= 70 ? t.success : tb.pct >= 40 ? GOLD : t.danger
                  return (
                    <div key={tb.topic}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>{tb.topic}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: tc }}>{tb.correct}/{tb.total}</span>
                      </div>
                      <div style={{ background: t.borderMid || t.border, borderRadius: 999, height: 5, overflow: 'hidden' }}>
                        <div style={{ width: `${tb.pct}%`, height: '100%', background: tc, borderRadius: 999, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Weak spots callout */}
          {weakSubtopics.length > 0 && (
            <div style={{ background: t.dangerBg, border: `1px solid ${t.danger}33`, borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: t.danger, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Needs Work</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {weakSubtopics.map(sub => (
                  <span key={sub} style={{ background: t.dangerBg, border: `1px solid ${t.danger}44`, borderRadius: 6, padding: '4px 10px', fontSize: 12, color: t.danger }}>{sub}</span>
                ))}
              </div>
            </div>
          )}

          {/* AI Coaching Tip */}
          {(sessionTipLoading || sessionTip) && (
            <div style={{ background: t.purpleBg, border: `1px solid ${t.purple}33`, borderRadius: 14, padding: '14px 18px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>AI Coach</div>
              {sessionTipLoading
                ? <div style={{ fontSize: 13, color: t.textFaint, fontStyle: 'italic' }}>Getting your coaching tip…</div>
                : <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.65 }}>🤖 {sessionTip}</div>
              }
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {weakTopics.length > 0 && counts.wrong > 0 && (
              <button onClick={() => startMode('wrong')}
                style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#ef4444,#f87171)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
                Fix {counts.wrong} wrong answer{counts.wrong !== 1 ? 's' : ''} →
              </button>
            )}
            {counts.wrong === 0 && quizMode !== 'all' && (
              <button onClick={() => startMode('all')}
                style={{ width: '100%', padding: '14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
                Repeat all questions
              </button>
            )}
            {onGoToStudyPlan && (
              <button onClick={onGoToStudyPlan}
                style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVY, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
                Go to Study Plan →
              </button>
            )}
            <button onClick={onHome}
              style={{ width: '100%', padding: '14px', borderRadius: 12, border: `1px solid rgba(241,190,67,0.3)`, background: 'transparent', color: GOLD, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
              ← Back to Question Bank
            </button>
          </div>
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
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚡</div>
          <div style={{ fontSize: 13 }}>Loading questions…</div>
        </div>
      </div>
    )
  }

  const { pct } = getLevelProgress(profile.xp)
  const baseQuestionId = remediationMode && remediationParentId ? remediationParentId : currentQ.id
  const isStruggle = (struggleMap[baseQuestionId]?.wrong ?? 0) >= 2
  const sessionCorrect = sessionResults.filter(r => r.correct).length
  const sessionTotal = sessionResults.length
  const accuracy = sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : null
  const inRemediationQuestion = remediationMode && !!currentQ?.is_variant
  const remediationPendingEntry = remediationMode && !currentQ?.is_variant && remediationOriginalQ?.id === currentQ?.id

  const nextButtonLabel = remediationPendingEntry
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

  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: t.bg, fontFamily: FONT_B, overflow: isMobile ? 'visible' : 'hidden' }}>
      <style>{`
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes floatXP { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-70px) scale(1.5)} }
        @keyframes popIn   { 0%{transform:scale(0.95);opacity:0} 100%{transform:scale(1);opacity:1} }
        .qopt { transition: all 0.13s ease; cursor: pointer; }
        .qopt:hover { border-color: ${GOLD} !important; background: rgba(241,190,67,0.05) !important; }
      `}</style>

      {floatXP && (
        <div style={{ position: 'fixed', top: '30%', left: '50%', transform: 'translateX(-50%)', fontSize: 30, fontWeight: 800, color: GOLD, animation: 'floatXP 1.4s ease forwards', pointerEvents: 'none', zIndex: 9999 }}>
          +{floatXP} XP
        </div>
      )}

      {showExit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(8px)' }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.borderAccent}`, borderRadius: 20, padding: '36px 32px', maxWidth: 360, width: '90%', textAlign: 'center', animation: 'popIn 0.2s ease', boxShadow: t.shadowModal }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>⏸</div>
            <div style={{ fontFamily: FONT_D, fontSize: 20, color: t.text, marginBottom: 8, letterSpacing: 0.5 }}>END THIS SESSION?</div>
            <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 28, lineHeight: 1.65 }}>
              You've earned <span style={{ color: GOLD, fontWeight: 700 }}>{sessionXP} XP</span> so far. Your progress is saved — you can resume anytime.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowExit(false)} style={{ flex: 1, padding: '13px', borderRadius: 11, border: `1px solid ${t.border}`, background: t.bgSubtle, color: t.textMuted, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B, transition: 'all 0.15s' }}>Keep going</button>
              <button onClick={onHome} style={{ flex: 1, padding: '13px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, boxShadow: '0 4px 16px rgba(239,68,68,0.3)' }}>End session</button>
            </div>
          </div>
        </div>
      )}

      {/* Top status bar — gold gradient (brand) */}
      <div style={{ background: `linear-gradient(135deg,${GOLD},${GOLDL})`, padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: NAVY }}>Q{qNumber}</span>
          <div style={{ width: 1, height: 14, background: 'rgba(0,0,0,0.15)' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: NAVY, background: 'rgba(0,0,0,0.1)', padding: '2px 10px', borderRadius: 20 }}>{currentQ.subtopic}</span>
          {isStruggle && <span style={{ fontSize: 11, fontWeight: 700, color: '#7f1d1d', background: 'rgba(127,29,29,0.15)', padding: '2px 9px', borderRadius: 20 }}>⚡ Priority</span>}
          {inRemediationQuestion && <span style={{ fontSize: 11, fontWeight: 700, color: NAVY, background: 'rgba(255,255,255,0.2)', padding: '2px 9px', borderRadius: 20 }}>Remediation</span>}
          <span style={{ fontSize: 11, color: 'rgba(12,16,55,0.6)' }}>{'★'.repeat(currentQ.difficulty)}{'☆'.repeat(5 - currentQ.difficulty)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {streak >= 2 && <span style={{ fontSize: 12, fontWeight: 800, color: NAVY }}>🔥 {streak} streak</span>}
          {accuracy !== null && <span style={{ fontSize: 12, fontWeight: 800, color: NAVY }}>{accuracy}% accuracy</span>}
          <span style={{ fontSize: 12, fontWeight: 800, color: NAVY }}>+{sessionXP} XP</span>
          {examMode && timerSeconds > 0 && (() => {
            const m = Math.floor(timeLeft / 60)
            const s = timeLeft % 60
            const urgent = timeLeft < 300
            return (
              <span style={{ fontSize: 12, fontWeight: 800, color: urgent ? '#ef4444' : NAVY, background: urgent ? 'rgba(239,68,68,0.15)' : 'rgba(0,0,0,0.12)', padding: '2px 9px', borderRadius: 20, fontVariantNumeric: 'tabular-nums' }}>
                ⏱ {m}:{String(s).padStart(2, '0')}
              </span>
            )
          })()}
          <button onClick={() => setShowExit(true)} style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', color: NAVY, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>End Session</button>
        </div>
      </div>

      {/* Level progress bar */}
      <div style={{ height: 3, background: t.borderMid, flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, transition: 'width 0.8s' }} />
      </div>

      {/* Session stats strip */}
      <div style={{ background: t.bgSubtle, borderBottom: `1px solid ${t.border}`, padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: t.textFaint, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>This session</span>
        <span style={{ fontSize: 12, color: t.textSub, fontWeight: 700 }}><span style={{ color: t.success }}>{sessionCorrect}</span> correct</span>
        <span style={{ fontSize: 12, color: t.textSub, fontWeight: 700 }}><span style={{ color: t.danger }}>{sessionTotal - sessionCorrect}</span> wrong</span>
        <span style={{ fontSize: 12, color: t.textSub, fontWeight: 700 }}><span style={{ color: GOLD }}>+{sessionXP}</span> XP</span>
        {streak > 0 && <span style={{ fontSize: 12, color: t.textSub, fontWeight: 700 }}>🔥 {streak}</span>}
        {remediationMode && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '3px 10px', borderRadius: 999, border: `1px solid ${t.borderAccent}`, background: t.accentGlow2, fontSize: 11, fontWeight: 700, color: GOLD }}>
            Remediation · {Math.min(remediationStreak, remediationTarget)}/{remediationTarget}
          </span>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: isMobile ? 'visible' : 'hidden' }}>
        <div style={{ flex: 1, padding: isMobile ? '16px' : '32px 28px', overflowY: isMobile ? 'visible' : 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: 600, animation: 'fadeUp 0.3s ease' }}>
            {consolidateSubtopic && (
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
                <span style={{ fontSize: 12, fontWeight: 700, color: t.purple }}>
                  📌 Consolidating: <span style={{ color: t.text }}>{consolidateSubtopic}</span>
                </span>
                <button
                  onClick={onClearConsolidate}
                  style={{ background: 'transparent', border: 'none', color: t.purple, fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}
                  title="Return to full quiz"
                >
                  ✕
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
              {currentQ.graph && (
                <GraphView graph={currentQ.graph} theme={theme} />
              )}
              {currentQ.table_data && (
                <TableView table={currentQ.table_data} theme={theme} />
              )}
              {currentQ.image_url && (
                <img
                  src={currentQ.image_url}
                  alt="Question diagram"
                  style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 10, marginBottom: 16 }}
                />
              )}
              <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 700, color: t.text, lineHeight: 1.7, marginBottom: 22 }}>
                <MathText text={currentQ.question} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {currentQ.options.map((opt, i) => {
                  const isCorrectOpt = i === currentQ.answer_index
                  const isSelectedOpt = i === selected
                  let bg = t.bgSubtle
                  let border = `1px solid ${t.border}`
                  let color = t.textSub
                  let lBg = t.borderMid
                  let lCol = t.text

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
                      onClick={() => handleAnswer(i)}
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
              </div>
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
                        background: `linear-gradient(135deg,${GOLD},${GOLDL})`,
                        color: NAVY,
                        fontSize: 15,
                        fontWeight: 800,
                        cursor: 'pointer',
                        fontFamily: FONT_B,
                        boxShadow: `0 6px 20px rgba(241,190,67,0.3)`,
                        opacity: remediationStatus === 'generating' ? 0.7 : 1,
                        pointerEvents: remediationStatus === 'generating' ? 'none' : 'auto',
                      }}
                    >
                      {nextButtonLabel}
                    </button>
                    {onOpenLearn && !examMode && (
                      <button
                        onClick={() => onOpenLearn(currentQ.topic, {
                          question: currentQ.question,
                          correctAnswer: currentQ.options?.[currentQ.answer_index] || '',
                          subtopic: currentQ.subtopic,
                          topic: currentQ.topic,
                        })}
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
                        🎓 Take this to Titan AI
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
                    {correct ? `✓ Correct · +${earnedXP} XP` : `✗ Incorrect · +${earnedXP} XP`}
                  </div>
                  <div style={{ fontSize: 10, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Explanation</div>
                  <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.75, marginBottom: currentQ.tip ? 10 : 0 }}>
                    <MathText text={currentQ.solution} />
                  </div>
                  {currentQ.tip && (
                    <div style={{ marginTop: 10, padding: '9px 12px', background: t.accentGlow2, borderRadius: '0 8px 8px 0', borderLeft: `2px solid ${GOLD}`, fontSize: 12, color: GOLD, lineHeight: 1.65 }}>
                      💡 <MathText text={currentQ.tip} />
                    </div>
                  )}
                  {loadingTip && <div style={{ fontSize: 12, color: t.textFaint, fontStyle: 'italic', marginTop: 8 }}>Getting AI tip…</div>}
                  {aiTip && (
                    <div style={{ marginTop: 8, padding: '9px 12px', background: t.purpleBg, borderRadius: '0 8px 8px 0', borderLeft: `2px solid ${t.purple}`, fontSize: 12, color: t.purple, lineHeight: 1.65 }}>
                      🤖 <MathText text={aiTip} />
                    </div>
                  )}
                  {(() => {
                    const qid = currentQ?.is_variant ? (currentQ?.parent_question_id || currentQ?.id) : currentQ?.id
                    const myFlags = flaggedMap[qid] || new Set()
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
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          </div>

          {!isMobile && (
            <div style={{ width: 340, flexShrink: 0, borderLeft: `1px solid ${t.border}`, background: t.bgSubtle, overflowY: 'auto', padding: '32px 28px', display: 'flex', flexDirection: 'column' }}>
              {!showAns ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: t.bgCard, border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>💡</div>
                  <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.65, maxWidth: 200 }}>Select an answer to see the explanation</div>
                </div>
              ) : (
                <div style={{ animation: 'popIn 0.25s ease', maxWidth: 500 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 14px', borderRadius: 20, marginBottom: 20, background: correct ? t.successBg : t.dangerBg, border: `1px solid ${correct ? t.success + '55' : t.danger + '55'}`, fontSize: 13, fontWeight: 700, color: correct ? t.success : t.danger }}>
                    {correct ? `✓ Correct · +${earnedXP} XP` : `✗ Incorrect · +${earnedXP} XP`}
                  </div>

                  <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Explanation</div>
                  <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.8, marginBottom: 16 }}><MathText text={currentQ.solution} /></div>

                  {currentQ.tip && (
                    <div style={{ padding: '12px 14px', background: t.accentGlow2, borderRadius: '0 10px 10px 0', borderLeft: `3px solid ${GOLD}`, fontSize: 13, color: GOLD, lineHeight: 1.65, marginBottom: 16 }}>
                      💡 <MathText text={currentQ.tip} />
                    </div>
                  )}

                  {loadingTip && <div style={{ fontSize: 12, color: t.textFaint, fontStyle: 'italic', marginBottom: 12 }}>Getting AI tip…</div>}
                  {aiTip && (
                    <div style={{ padding: '12px 14px', background: t.purpleBg, borderRadius: '0 10px 10px 0', borderLeft: `3px solid ${t.purple}`, fontSize: 13, color: t.purple, lineHeight: 1.65, marginBottom: 16 }}>
                      🤖 <MathText text={aiTip} />
                    </div>
                  )}

                  {(() => {
                    const qid = currentQ?.is_variant ? (currentQ?.parent_question_id || currentQ?.id) : currentQ?.id
                    const myFlags = flaggedMap[qid] || new Set()
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
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
  )
}