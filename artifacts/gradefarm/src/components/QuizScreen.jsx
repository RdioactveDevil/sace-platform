import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  selectNextQuestion,
  calcXP,
  calcRemediationXP,
  getRemediationCompletionBonus,
  getLevelProgress,
  getQuestionCounts,
  getQuestionConceptTag,
  buildRemediationQueue,
  RANKS,
  RANK_ICONS,
} from '../lib/engine'
import {
  recordAnswer,
  addXP,
  createSession,
  getRemediationVariants,
  insertGeneratedQuestionVariants,
  insertGeneratedQuestionsToBank,
  incrementQuestionVariantUsage,
  flagQuestion,
  flagTopicForStudyPlan,
  completeAssignment,
} from '../lib/db'
import { THEMES } from '../lib/theme'
import MathText from './MathText'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const NAVY = '#0c1037'
const NAVYD = '#080d28'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

const NAV_ITEMS = [
  { icon: '⚡', label: 'Question Bank', path: '/question-bank' },
  { icon: '🎓', label: 'Learn', path: '/learn' },
  { icon: '📊', label: 'My Progress', path: '/my-progress' },
  { icon: '🏆', label: 'Leaderboard', path: '/leaderboard' },
  { icon: '📚', label: 'Study Plan', path: '/study-plan' },
  { icon: '🕐', label: 'History', path: '/history' },
]

function withTimeout(promise, ms, label = 'operation') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[gradefarm] ${label} timed out after ${ms}ms`))
    }, ms)
    Promise.resolve(promise)
      .then(value => { clearTimeout(timer); resolve(value) })
      .catch(err => { clearTimeout(timer); reject(err) })
  })
}

const REMEDIATION_DB_TIMEOUT_MS = 5000

async function fetchRemediationVariantsSafe(parentId, conceptTag, excludeIds, label) {
  try {
    return await withTimeout(
      getRemediationVariants(parentId, conceptTag, excludeIds),
      REMEDIATION_DB_TIMEOUT_MS,
      `getRemediationVariants (${label})`
    )
  } catch (err) {
    console.warn(`[gradefarm] DB variant lookup failed in ${label}:`, err?.message || err)
    return { directVariants: [], conceptVariants: [] }
  }
}

function extractJsonArray(text = '') {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {}

  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []

  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function scoreLocalCandidate(q, parentQuestion, target) {
  // Concept-tag match > subtopic > topic, then difficulty proximity.
  let s = 0
  if (q.concept_tag && q.concept_tag === parentQuestion.concept_tag) s += 100
  if (q.subtopic === parentQuestion.subtopic) s += 50
  if (q.topic === parentQuestion.topic) s += 20
  const d = q.difficulty ?? 3
  s -= Math.abs(d - target) * 5
  if (d <= target) s += 10
  s += Math.random() * 3
  return s
}

function createLocalFallbackVariants(parentQuestion, allQuestions = [], targetDifficulty = null) {
  // Returns up to 5 same-topic / same-concept questions scored by relevance to
  // the parent. Returns [] when no genuine related question exists — the
  // caller must handle that case rather than ever showing the parent again.
  const target = targetDifficulty ?? (parentQuestion.difficulty ?? 3)

  const eligible = allQuestions.filter(q =>
    q.id !== parentQuestion.id &&
    !q.is_variant &&
    (q.topic === parentQuestion.topic ||
      (q.concept_tag && q.concept_tag === parentQuestion.concept_tag))
  )

  const candidates = eligible
    .map(q => ({ q, s: scoreLocalCandidate(q, parentQuestion, target) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
    .map(x => x.q)

  return candidates.map((q, index) => ({
    ...q,
    id: `local_fallback__${parentQuestion.id}__${Date.now()}__${index}`,
    variant_record_id: `local_fallback__${parentQuestion.id}__${index}`,
    variant_type: `related_${index + 1}`,
    parent_question_id: parentQuestion.id,
    source: 'related',
    is_variant: true,
    // Preserve the real bank id so a correct answer here counts toward the
    // no-repeat rule (recordAnswer needs a real questions.id).
    bank_question_id: q.id,
  }))
}

async function generateRemediationVariantsViaAI(parentQuestion, conceptTag, targetDifficulty = null) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const correctAnswer = parentQuestion.options?.[parentQuestion.answer_index] || ''
    const diffTarget = Math.max(1, Math.min(5, targetDifficulty ?? (parentQuestion.difficulty ?? 3)))
    const system = [
      'You are generating adaptive remediation MCQs for a SACE Chemistry student.',
      'Return only a valid JSON array containing exactly 5 objects.',
      'Each object must have these keys: question, options, answer_index, solution, tip, difficulty, topic, subtopic, concept_tag, variant_type.',
      'Each options array must contain exactly 4 strings.',
      'Keep the same underlying concept, but vary wording, values, or structure.',
      'Do not include markdown or commentary outside the JSON array.',
    ].join(' ')

    const user = [
      `Topic: ${parentQuestion.topic}`,
      `Subtopic: ${parentQuestion.subtopic}`,
      `Concept tag: ${conceptTag}`,
      `Original question: ${parentQuestion.question}`,
      `Correct answer: ${correctAnswer}`,
      `Original solution: ${parentQuestion.solution}`,
      `Target difficulty: ${diffTarget} out of 5 — make these questions easier/more accessible than the original.`,
      'Generate 5 targeted remediation questions that test the same concept but are not copies.',
      'Vary wording, values, or scenario. Each question difficulty should be at or below the target.',
    ].join('\n')

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })

    clearTimeout(timeout)

    if (!res.ok) return []

    const data = await res.json()
    const rawText = data?.content?.[0]?.text || ''
    return extractJsonArray(rawText)
  } catch {
    return []
  }
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

function normalizeVariantRecord(parentQuestion, variant, index = 0) {
  return {
    ...variant,
    id: variant.id || variant.variant_record_id || `variant__${parentQuestion.id}__${Date.now()}__${index}`,
    variant_record_id: variant.variant_record_id || variant.id || `variant__${parentQuestion.id}__${index}`,
    parent_question_id: variant.parent_question_id || parentQuestion.id,
    concept_tag: variant.concept_tag || parentQuestion.concept_tag || getQuestionConceptTag(parentQuestion),
    topic: variant.topic || parentQuestion.topic,
    subtopic: variant.subtopic || parentQuestion.subtopic,
    difficulty: Math.max(1, Math.min(5, Number(variant.difficulty || parentQuestion.difficulty || 1))),
    options: Array.isArray(variant.options) ? variant.options : (parentQuestion.options || []),
    source: variant.source || 'prebuilt',
    is_variant: true,
  }
}

function RemediationChip({ remediationMode, remediationStreak, remediationTarget, remediationStatus, remediationSource }) {
  if (!remediationMode) return null

  const statusText = remediationStatus === 'generating'
    ? 'Generating more similar questions for this same concept.'
    : remediationStatus === 'complete'
      ? 'Mastery confirmed. Returning to the main quiz.'
      : remediationStatus === 'struggling'
        ? "You're finding this one tricky. You can keep going with an easier question, or return to the quiz."
        : remediationStatus === 'needs_review'
          ? 'This topic has been added to your study plan for focused practice later.'
          : `You are in targeted reinforcement. Get ${remediationTarget} correct in a row to continue.`

  const streakBg = remediationStatus === 'complete' ? 'rgba(16,185,129,0.12)'
    : remediationStatus === 'struggling' ? 'rgba(241,190,67,0.12)'
    : remediationStatus === 'needs_review' ? 'rgba(99,102,241,0.12)'
    : 'rgba(255,255,255,0.05)'
  const streakBorder = remediationStatus === 'complete' ? 'rgba(16,185,129,0.3)'
    : remediationStatus === 'struggling' ? 'rgba(241,190,67,0.3)'
    : remediationStatus === 'needs_review' ? 'rgba(99,102,241,0.3)'
    : 'rgba(255,255,255,0.08)'
  const streakColor = remediationStatus === 'complete' ? '#4ade80'
    : remediationStatus === 'struggling' ? GOLD
    : remediationStatus === 'needs_review' ? '#818cf8'
    : '#e2e8f0'

  return (
    <div style={{
      marginBottom: 14,
      padding: '14px 16px',
      borderRadius: 16,
      background: 'linear-gradient(135deg, rgba(8,13,40,0.92), rgba(12,16,55,0.94))',
      border: '1px solid rgba(241,190,67,0.22)',
      boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 999,
            background: 'rgba(241,190,67,0.09)',
            border: '1px solid rgba(241,190,67,0.28)',
            color: GOLD,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            ⚡ Remediation Mode
          </span>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
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
      <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 10, lineHeight: 1.6 }}>{statusText}</div>
    </div>
  )
}

function StatusToast({ status, onReturnToQuiz }) {
  if (!status || status === 'idle' || status === 'activated') return null

  const isComplete = status === 'complete'
  const isStruggling = status === 'struggling'
  const isNeedsReview = status === 'needs_review'

  const borderColor = isComplete ? 'rgba(16,185,129,0.35)'
    : isStruggling ? 'rgba(241,190,67,0.35)'
    : isNeedsReview ? 'rgba(99,102,241,0.35)'
    : 'rgba(241,190,67,0.24)'
  const iconBg = isComplete ? 'rgba(16,185,129,0.12)'
    : isStruggling ? 'rgba(241,190,67,0.12)'
    : isNeedsReview ? 'rgba(99,102,241,0.12)'
    : 'rgba(241,190,67,0.12)'
  const iconBorder = isComplete ? 'rgba(16,185,129,0.22)'
    : isStruggling ? 'rgba(241,190,67,0.22)'
    : isNeedsReview ? 'rgba(99,102,241,0.22)'
    : 'rgba(241,190,67,0.18)'
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
      background: 'linear-gradient(135deg, rgba(8,13,40,0.96), rgba(12,16,55,0.98))',
      border: `1px solid ${borderColor}`,
      boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
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
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{title}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginTop: 2 }}>{subtitle}</div>
          {isStruggling && onReturnToQuiz && (
            <button
              onClick={onReturnToQuiz}
              style={{
                marginTop: 10,
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid rgba(241,190,67,0.35)',
                background: 'rgba(241,190,67,0.08)',
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
}) {
  const t = THEMES[theme]

  const [floatXP, setFloatXP] = useState(null)
  const [showExit, setShowExit] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 860)
  const [finished, setFinished] = useState(false)
  const [flaggedMap, setFlaggedMap] = useState({}) // { [questionId]: Set of flag_types }
  const [flagging, setFlagging] = useState(null)   // currently-saving flag tag
  const [remediationWrongCount, setRemediationWrongCount] = useState(0)
  const [remediationDifficultyTarget, setRemediationDifficultyTarget] = useState(null)
  const [assignmentsCompleted, setAssignmentsCompleted] = useState([])
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
    const h = () => { setIsMobile(window.innerWidth < 860); if (window.innerWidth >= 860) setMenuOpen(false) }
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

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

  const navigate = useNavigate()
  const location = useLocation()

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

  const loadNext = useCallback((answered, map, mode = 'new', subtopics = []) => {
    const q = selectNextQuestion(questions, map, answered, mode, subtopics)
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
    setStruggleMap(prev => { loadNext(sessionAnswered, prev, quizMode, effectiveSubtopics); return prev })
  }, [clearRemediation, effectiveSubtopics, loadNext, profile.id, quizMode, remediationConcept, remediationOriginalQ, sessionAnswered, setQNumber, setStruggleMap])

  const generateRemediationQueue = useCallback(async (parentQuestion, existingUsedIds = [], difficultyTarget = null, options = {}) => {
    const { skipDbLookup = false } = options
    const conceptTag = parentQuestion?.concept_tag || getQuestionConceptTag(parentQuestion)
    const diffTarget = difficultyTarget ?? Math.max(1, (parentQuestion?.difficulty ?? 3) - 1)
    setRemediationStatus('generating')

    let resolvedQueue = []
    let resolvedSource = 'generated'

    try {
      // Step 1: Try DB variants first (with usedIds excluded) before touching AI.
      // Bounded by a timeout so a hung Supabase call can never freeze remediation.
      // Callers who already attempted the DB lookup (e.g. enterRemediation) can pass
      // skipDbLookup=true to avoid paying the timeout twice when Supabase is unreachable.
      if (!skipDbLookup) {
        const { directVariants, conceptVariants } = await fetchRemediationVariantsSafe(
          parentQuestion.id, conceptTag, existingUsedIds, 'generateRemediationQueue'
        )
        const dbQueue = buildRemediationQueue({
          directVariants: (directVariants || []).map((v, i) => normalizeVariantRecord(parentQuestion, v, i)),
          conceptVariants: (conceptVariants || []).map((v, i) => normalizeVariantRecord(parentQuestion, v, i)),
          excludeIds: existingUsedIds,
          limit: 5,
        }).map(v => ({ ...v, is_variant: true, source: v.source || 'prebuilt' }))

        if (dbQueue.length) {
          resolvedQueue = dbQueue
          resolvedSource = 'prebuilt'
          return dbQueue
        }
      }

      console.warn('[gradefarm] no DB variants available — falling back to local related questions')

      // Step 2: Build the local fallback (related questions from the in-memory bank).
      const localFallback = createLocalFallbackVariants(parentQuestion, questions, diffTarget).map((variant, index) =>
        normalizeVariantRecord(parentQuestion, variant, index)
      )

      const localQueue = buildRemediationQueue({
        generatedVariants: localFallback,
        excludeIds: existingUsedIds,
        limit: 5,
      }).map(v => ({ ...v, is_variant: true, source: v.source || 'related' }))

      // Skip the AI call when the bank already supplies at least 3 strong
      // matches (concept_tag or same-subtopic at the target difficulty).
      // Saves API spend on well-covered concepts.
      const strongLocalCount = localQueue.filter(v =>
        ((v.concept_tag && v.concept_tag === parentQuestion.concept_tag) ||
         v.subtopic === parentQuestion.subtopic) &&
        (v.difficulty ?? 3) <= diffTarget + 1
      ).length

      if (strongLocalCount >= 3) {
        console.info(`[gradefarm] local bank has ${strongLocalCount} strong matches — skipping AI generation`)
        resolvedQueue = localQueue
        resolvedSource = 'generated'
        return localQueue
      }

      // AI promise resolves as soon as the model returns. Bank persistence runs
      // off the critical path; pendingBankIdsRef carries the real ids back to
      // handleAnswer so variant attempts are still tracked for no-repeat.
      const aiPromise = (async () => {
        try {
          const generated = await generateRemediationVariantsViaAI(parentQuestion, conceptTag, diffTarget)
          if (!generated.length) {
            console.warn('[gradefarm] AI variant generation returned 0 variants')
            return { normalized: [], generated: [] }
          }

          const normalized = generated.map((v, i) => ({
            ...normalizeVariantRecord(parentQuestion, v, i),
            is_variant: true,
            source: 'ai_generated',
            variant_type: v.variant_type || 'ai_variant',
          }))

          // Background bank persistence — bounded but off the critical path.
          void (async () => {
            try {
              const bankRows = await withTimeout(
                insertGeneratedQuestionsToBank(parentQuestion, generated),
                5000,
                'insertGeneratedQuestionsToBank'
              )
              if (!bankRows.length) return
              if (typeof onBankQuestionsAdded === 'function') {
                try { onBankQuestionsAdded(bankRows) } catch {}
              }
              bankRows.forEach((row, i) => {
                const vid = normalized[i]?.variant_record_id
                if (vid) pendingBankIdsRef.current.set(vid, row.id)
              })
              console.info(`[gradefarm] background-persisted ${bankRows.length}/${generated.length} AI question(s) to the bank`)
            } catch (bankErr) {
              console.warn('[gradefarm] background bank persistence failed:', bankErr?.message || bankErr)
            }
          })()

          return { normalized, generated }
        } catch (aiErr) {
          console.warn('[gradefarm] AI variant generation failed (generateRemediationQueue):', aiErr?.message || aiErr)
          return { normalized: [], generated: [] }
        }
      })()

      // Persistence runs in the background regardless of which path consumes the AI output.
      const persistPromise = aiPromise.then(async ({ generated }) => {
        if (!generated.length) return
        try {
          const saved = await insertGeneratedQuestionVariants(parentQuestion, generated)
          if (saved.length < generated.length) {
            console.error(
              `[gradefarm] variant storage partial: ${saved.length}/${generated.length} saved for concept "${parentQuestion.concept_tag || parentQuestion.subtopic}". ` +
              'Unsaved variants will be regenerated next session — check Supabase RLS on question_variants.'
            )
          } else {
            console.info(`[gradefarm] stored ${saved.length} variant(s) for concept "${parentQuestion.concept_tag || parentQuestion.subtopic}"`)
          }
        } catch (insertErr) {
          console.error(
            `[gradefarm] variant storage failed (0/${generated.length} saved) for concept "${parentQuestion.concept_tag || parentQuestion.subtopic}" — ` +
            'variants will be regenerated next session. Check Supabase RLS on question_variants. Error:',
            insertErr?.message || insertErr
          )
        }
      })
      // Don't let unhandled rejections from the background persist surface to the console as errors.
      persistPromise.catch(() => {})

      // localQueue is either real related questions or empty — never the parent.
      const hasRelatedLocal = localQueue.length > 0

      if (hasRelatedLocal) {
        // We have real related questions to show immediately. Append AI variants to the
        // live queue in the background when they arrive.
        aiPromise.then(({ normalized }) => {
          if (normalized.length) setRemediationQueue(prev => [...prev, ...normalized])
        })
        resolvedQueue = localQueue
        resolvedSource = 'generated'
        return localQueue
      }

      // Step 4: No DB variants and no related local questions — block on AI so the
      // student gets a genuinely new remediation question instead of a duplicate of
      // the original.
      console.warn('[gradefarm] no related local variants — awaiting AI generation synchronously to seed the queue')
      const { normalized: aiQueue } = await aiPromise

      if (aiQueue.length) {
        resolvedQueue = aiQueue
        resolvedSource = 'generated'
        return aiQueue
      }

      // No DB variants, no related local questions, AI returned nothing.
      // Exit remediation gracefully rather than re-showing the parent question.
      console.warn('[gradefarm] no variants available from any source — activating with empty queue; click handler will exit remediation gracefully')
      resolvedQueue = []
      resolvedSource = 'generated'
      return []
    } catch (err) {
      console.warn('[gradefarm] generateRemediationQueue unexpected error:', err?.message || err)
      resolvedQueue = []
      resolvedSource = 'generated'
      return []
    } finally {
      // Single exit point — always clear the 'generating' status no matter what happened above.
      setRemediationSource(resolvedSource)
      setRemediationQueue(resolvedQueue)
      setRemediationStatus('activated')
    }
  }, [questions, setRemediationQueue, setRemediationSource, setRemediationStatus, onBankQuestionsAdded])

  const enterRemediation = useCallback(async (parentQuestion) => {
    if (!parentQuestion) return

    const conceptTag = parentQuestion.concept_tag || getQuestionConceptTag(parentQuestion)
    const diffTarget = Math.max(1, (parentQuestion.difficulty ?? 3) - 1)

    setRemediationMode(true)
    setRemediationStreak(0)
    setRemediationTarget(3)
    setRemediationDifficultyTarget(diffTarget)
    // status stays 'generating' (set by handleAnswer) — button stays disabled until queue loads
    setRemediationSource('prebuilt')
    setRemediationConcept(conceptTag)
    setRemediationParentId(parentQuestion.id)
    setRemediationOriginalQ(parentQuestion)
    setRemediationUsedIds([])

    try {
      // Prefer prefetched variants if available; fall back to a bounded live lookup.
      let dbResult = variantPrefetchRef.current.get(parentQuestion.id)
      if (dbResult) {
        console.info(`[gradefarm] using prefetched variants for question ${parentQuestion.id}`)
      } else {
        dbResult = await fetchRemediationVariantsSafe(
          parentQuestion.id, conceptTag, [], 'enterRemediation'
        )
      }
      const { directVariants, conceptVariants } = dbResult
      const queue = buildRemediationQueue({
        directVariants: (directVariants || []).map((variant, index) => normalizeVariantRecord(parentQuestion, variant, index)),
        conceptVariants: (conceptVariants || []).map((variant, index) => normalizeVariantRecord(parentQuestion, variant, index)),
        excludeIds: [],
        limit: 5,
      }).map(v => ({ ...v, is_variant: true, source: v.source || 'prebuilt' }))

      if (!queue.length) {
        // DB has no stored variants (or DB timed out) — go straight to local fallback + AI.
        // Pass skipDbLookup so we don't pay the Supabase timeout a second time when Supabase is unreachable.
        await generateRemediationQueue(parentQuestion, [], diffTarget, { skipDbLookup: true })
      } else {
        // DB variants found — use them and preserve API credits. AI is only called when these are exhausted.
        setRemediationQueue(queue)
        setRemediationStatus('activated')
      }
    } catch (err) {
      // Belt-and-braces: if anything unexpected escapes, never leave the user stuck on 'generating'.
      console.warn('[gradefarm] enterRemediation unexpected error — activating with empty queue:', err?.message || err)
      setRemediationQueue([])
      setRemediationStatus('activated')
    }
  }, [
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
  ])

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

  const loadNextRemediationQuestion = async () => {
    let queue = remediationQueue

    if (!queue.length && remediationOriginalQ) {
      // Step 1: Check DB for stored variants not yet used before calling AI.
      const conceptTag = remediationOriginalQ.concept_tag || getQuestionConceptTag(remediationOriginalQ)
      const { directVariants, conceptVariants } = await fetchRemediationVariantsSafe(
        remediationOriginalQ.id, conceptTag, remediationUsedIds, 'loadNextRemediationQuestion'
      )
      const dbQueue = buildRemediationQueue({
        directVariants: (directVariants || []).map((v, i) => normalizeVariantRecord(remediationOriginalQ, v, i)),
        conceptVariants: (conceptVariants || []).map((v, i) => normalizeVariantRecord(remediationOriginalQ, v, i)),
        excludeIds: remediationUsedIds,
        limit: 5,
      }).map(v => ({ ...v, is_variant: true, source: v.source || 'prebuilt' }))

      if (dbQueue.length) {
        queue = dbQueue
        setRemediationQueue(dbQueue)
        setRemediationSource('prebuilt')
        setRemediationStatus('activated')
      }

      // Step 2: DB had nothing new — generateRemediationQueue handles local fallback + AI.
      // Skip its internal DB lookup since we already attempted (and possibly timed out on) one above.
      if (!queue.length) {
        queue = await generateRemediationQueue(
          remediationOriginalQ,
          remediationUsedIds,
          remediationDifficultyTarget,
          { skipDbLookup: true }
        )
      }
    }

    if (!queue.length) {
      // Nothing left to show — exit remediation cleanly rather than re-presenting
      // the parent question. Caller advances to the next quiz question.
      setRemediationQueue([])
      setRemediationSource('generated')
      setRemediationStatus('activated')
      return false
    }

    const [nextVariant, ...rest] = queue
    setRemediationQueue(rest)
    setRemediationUsedIds(prev => [...new Set([...prev, nextVariant.variant_record_id || nextVariant.id])])
    setDisplayQuestion({ ...nextVariant, is_variant: true })
    return true
  }

  const nextQ = async () => {
    if (!currentQ) return

    const remediationPendingEntry = remediationMode && !currentQ.is_variant && remediationOriginalQ?.id === currentQ.id

    if (remediationPendingEntry) {
      const answered = sessionAnswered.includes(currentQ.id) ? sessionAnswered : [...sessionAnswered, currentQ.id]
      setSessionAnswered(answered)
      const loaded = await loadNextRemediationQuestion()
      if (!loaded) {
        clearRemediation()
        setQNumber(n => n + 1)
        setStruggleMap(prev => { loadNext(answered, prev, quizMode, effectiveSubtopics); return prev })
      }
      return
    }

    if (remediationMode && currentQ.is_variant) {
      if (remediationStatus === 'complete') {
        clearRemediation()
        setQNumber(n => n + 1)
        setStruggleMap(prev => { loadNext(sessionAnswered, prev, quizMode, effectiveSubtopics); return prev })
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
          setStruggleMap(prev => { loadNext(sessionAnswered, prev, quizMode, effectiveSubtopics); return prev })
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
        setStruggleMap(prev => { loadNext(sessionAnswered, prev, quizMode, effectiveSubtopics); return prev })
        return
      }

      const loaded = await loadNextRemediationQuestion()
      if (!loaded) {
        console.warn('[gradefarm] no remediation questions available — exiting remediation gracefully')
        clearRemediation()
        setQNumber(n => n + 1)
        setStruggleMap(prev => { loadNext(sessionAnswered, prev, quizMode, effectiveSubtopics); return prev })
      }
      return
    }

    const newAnswered = [...sessionAnswered, currentQ.id]
    setSessionAnswered(newAnswered)
    setQNumber(n => n + 1)
    setStruggleMap(prev => { loadNext(newAnswered, prev, quizMode, effectiveSubtopics); return prev })
  }

  const counts = getQuestionCounts(questions, struggleMap, effectiveSubtopics)

  if (finished || (!currentQ && sessionResults.length > 0)) {
    const startMode = (mode) => {
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

    const headlineText = quizMode === 'new'
      ? 'Session Complete!'
      : quizMode === 'wrong'
        ? 'Wrongs Reviewed!'
        : 'Session Complete!'

    return (
      <div style={{ minHeight: '100vh', background: NAVYD, fontFamily: FONT_B, overflowY: 'auto', position: 'relative' }}>
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
            <div style={{ fontFamily: FONT_D, fontSize: 26, color: '#fff', letterSpacing: 1, marginBottom: 6 }}>
              {headlineText}
            </div>
            <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
              {quizMode === 'new' && sessTotal > 0
                ? "You've worked through every question in this set."
                : 'Good work finishing the session.'}
            </div>
          </div>

          {/* Assignments completed banner */}
          {assignmentsCompleted.length > 0 && (
            <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>✅</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>
                  {assignmentsCompleted.length === 1 ? 'Assignment completed!' : `${assignmentsCompleted.length} assignments completed!`}
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>Your tutor has been notified.</div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Accuracy',  val: `${sessAccuracy}%`,      color: accColor, isXP: false },
              { label: 'Correct',   val: `${sessCorrect}/${sessTotal}`, color: '#e2e8f0', isXP: false },
              { label: 'XP Earned', val: `+${sessionXP}`,         color: GOLD, isXP: true },
            ].map(s => (
              <div key={s.label} style={{
                background: s.isXP ? 'linear-gradient(135deg, rgba(241,190,67,0.10), rgba(241,190,67,0.04))' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${s.isXP ? 'rgba(241,190,67,0.25)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 14,
                padding: '16px 10px',
                textAlign: 'center',
                boxShadow: s.isXP ? '0 4px 18px rgba(241,190,67,0.12), inset 0 1px 0 rgba(255,255,255,0.04)' : 'inset 0 1px 0 rgba(255,255,255,0.03)',
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: FONT_D, letterSpacing: 0.5 }}>{s.val}</div>
                <div style={{ fontSize: 10, color: s.isXP ? GOLD : '#64748b', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Topic breakdown */}
          {topicBreakdown.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 20px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Topic Breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {topicBreakdown.map(t => {
                  const tc = t.pct >= 70 ? '#4ade80' : t.pct >= 40 ? GOLD : '#f87171'
                  return (
                    <div key={t.topic}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{t.topic}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: tc }}>{t.correct}/{t.total}</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 999, height: 5, overflow: 'hidden' }}>
                        <div style={{ width: `${t.pct}%`, height: '100%', background: tc, borderRadius: 999, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Weak spots callout */}
          {weakSubtopics.length > 0 && (
            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#f87171', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Needs Work</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {weakSubtopics.map(sub => (
                  <span key={sub} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#fca5a5' }}>{sub}</span>
                ))}
              </div>
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
                style={{ width: '100%', padding: '14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
                Repeat all questions
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

  if (!currentQ && sessionResults.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: NAVYD, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontFamily: FONT_B }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚡</div>
          <div style={{ fontSize: 13 }}>Loading questions…</div>
        </div>
      </div>
    )
  }

  const { pct, level } = getLevelProgress(profile.xp)
  const rank = RANKS[Math.min(level, RANKS.length - 1)]
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

  const SidebarContent = ({ onClose }) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: NAVYD, fontFamily: FONT_B }}>
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontFamily: FONT_D, fontSize: 17, letterSpacing: 1, cursor: 'pointer' }} onClick={() => { onHome(); onClose?.() }}>
          <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
        </span>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: NAVYD, flexShrink: 0 }}>
            {profile.display_name[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name}</div>
            <div style={{ fontSize: 10, color: GOLD, fontWeight: 600 }}>{RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]} {rank}</div>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, transition: 'width 0.8s' }} />
        </div>
      </div>

      <nav style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path || (item.path === '/question-bank' && location.pathname === '/quiz')
          return (
            <button key={item.path} onClick={() => { navigate(item.path); onClose?.() }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: active ? 'rgba(241,190,67,0.12)' : 'transparent', borderLeft: `2px solid ${active ? GOLD : 'transparent'}`, color: active ? GOLD : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B, textAlign: 'left', width: '100%', transition: 'all 0.15s' }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>

      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>This session</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 8 }}>
          {[
            { label: 'Correct', val: sessionCorrect, color: '#10b981' },
            { label: 'Wrong', val: sessionTotal - sessionCorrect, color: '#ef4444' },
            { label: 'XP', val: `+${sessionXP}`, color: GOLD },
            { label: 'Streak', val: streak > 0 ? `🔥 ${streak}` : '—', color: '#f59e0b' },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '6px 8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: stat.color }}>{stat.val}</div>
              <div style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>{stat.label}</div>
            </div>
          ))}
        </div>
        {remediationMode && (
          <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(241,190,67,0.2)', background: 'rgba(241,190,67,0.06)' }}>
            <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Remediation</div>
            <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 700 }}>Mastery Streak: {Math.min(remediationStreak, remediationTarget)}/{remediationTarget}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{remediationSource === 'generated' ? 'Generated reinforcement' : 'Prebuilt reinforcement'}</div>
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <button onClick={() => { setShowExit(true); onClose?.() }} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
          ✕ End Session
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: NAVY, fontFamily: FONT_B, display: 'flex' }}>
      <style>{`
        @font-face{font-family:'Sifonn Pro';src:url('/SIFONN_PRO.otf') format('opentype');font-display:swap;}
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes floatXP { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-70px) scale(1.5)} }
        @keyframes popIn   { 0%{transform:scale(0.95);opacity:0} 100%{transform:scale(1);opacity:1} }
        @keyframes slideIn { from{transform:translateX(-100%)} to{transform:translateX(0)} }
        .qopt { transition: all 0.13s ease; cursor: pointer; }
        .qopt:hover { border-color: ${GOLD} !important; background: rgba(241,190,67,0.05) !important; }
      `}</style>

      {floatXP && (
        <div style={{ position: 'fixed', top: '30%', left: '50%', transform: 'translateX(-50%)', fontSize: 30, fontWeight: 800, color: GOLD, animation: 'floatXP 1.4s ease forwards', pointerEvents: 'none', zIndex: 9999 }}>
          +{floatXP} XP
        </div>
      )}

      {showExit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(8px)' }}>
          <div style={{ background: 'rgba(8,13,40,0.98)', border: '1px solid rgba(241,190,67,0.18)', borderRadius: 20, padding: '36px 32px', maxWidth: 360, width: '90%', textAlign: 'center', animation: 'popIn 0.2s ease', boxShadow: '0 32px 80px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.04)' }}>
            <div style={{ position: 'absolute', top: 0, left: '25%', right: '25%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(241,190,67,0.5), transparent)', borderRadius: 99 }} />
            <div style={{ fontSize: 36, marginBottom: 14 }}>⏸</div>
            <div style={{ fontFamily: FONT_D, fontSize: 20, color: '#fff', marginBottom: 8, letterSpacing: 0.5 }}>END THIS SESSION?</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 28, lineHeight: 1.65 }}>
              You've earned <span style={{ color: GOLD, fontWeight: 700 }}>{sessionXP} XP</span> so far. Your progress is saved — you can resume anytime.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowExit(false)} style={{ flex: 1, padding: '13px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B, transition: 'all 0.15s' }}>Keep going</button>
              <button onClick={onHome} style={{ flex: 1, padding: '13px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, boxShadow: '0 4px 16px rgba(239,68,68,0.3)' }}>End session</button>
            </div>
          </div>
        </div>
      )}

      {isMobile && menuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }}>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: 260, height: '100vh', animation: 'slideIn 0.25s ease', zIndex: 1000 }}>
            <SidebarContent onClose={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      {!isMobile && (
        <div style={{ width: 228, flexShrink: 0, height: '100vh', position: 'sticky', top: 0, borderRight: '1px solid rgba(255,255,255,0.07)' }}>
          <SidebarContent />
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {isMobile && (
          <div style={{ background: NAVYD, borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <button onClick={() => setMenuOpen(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ width: 20, height: 2, background: '#fff', borderRadius: 2 }} />
              <div style={{ width: 14, height: 2, background: '#fff', borderRadius: 2 }} />
              <div style={{ width: 20, height: 2, background: '#fff', borderRadius: 2 }} />
            </button>
            <span style={{ fontFamily: FONT_D, fontSize: 16, letterSpacing: 1 }}>
              <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
            </span>
            <button onClick={() => setShowExit(true)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>End</button>
          </div>
        )}

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
            {!isMobile && (
              <button onClick={() => setShowExit(true)} style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', color: NAVY, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>End Session</button>
            )}
          </div>
        </div>

        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, transition: 'width 0.8s' }} />
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: isMobile ? 'auto' : 'hidden' }}>
          <div style={{ flex: 1, padding: isMobile ? '16px' : '32px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: 600, animation: 'fadeUp 0.3s ease' }}>
              {consolidateSubtopic && (
                <div style={{
                  marginBottom: 14,
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'rgba(99,102,241,0.1)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexWrap: 'wrap',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc' }}>
                    📌 Consolidating: <span style={{ color: '#c7d2fe' }}>{consolidateSubtopic}</span>
                  </span>
                  <button
                    onClick={onClearConsolidate}
                    style={{ background: 'transparent', border: 'none', color: '#6366f1', fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}
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
              />

              <div style={{ background: '#ffffff', borderRadius: 20, padding: isMobile ? '20px' : '28px', boxShadow: '0 32px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.25)', marginBottom: showAns ? 14 : 0 }}>
                <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 700, color: NAVY, lineHeight: 1.7, marginBottom: 22 }}>
                  <MathText text={currentQ.question} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {currentQ.options.map((opt, i) => {
                    const isCorrectOpt = i === currentQ.answer_index
                    const isSelectedOpt = i === selected
                    let bg = '#f5f6ff'
                    let border = '1px solid #e2e5f0'
                    let color = '#334155'
                    let lBg = '#e2e5f0'
                    let lCol = '#0c1037'

                    if (showAns) {
                      if (isCorrectOpt) {
                        bg = '#f0fdf4'
                        border = '1px solid #86efac'
                        color = '#166534'
                        lBg = '#bbf7d0'
                        lCol = '#166534'
                      } else if (isSelectedOpt && !correct) {
                        bg = '#fef2f2'
                        border = '1px solid #fca5a5'
                        color = '#991b1b'
                        lBg = '#fecaca'
                        lCol = '#991b1b'
                      } else {
                        bg = '#fafafa'
                        border = '1px solid #f0f0f0'
                        color = '#9ca3af'
                        lBg = '#f0f0f0'
                        lCol = '#9ca3af'
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
                        <MathText text={opt} />
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
                    {onOpenLearn && (
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
                  />

                  {remediationMode && (
                    <div style={{
                      marginTop: 12,
                      padding: '12px 14px',
                      background: 'rgba(241,190,67,0.06)',
                      borderRadius: 12,
                      border: '1px solid rgba(241,190,67,0.16)',
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
                      <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 700, marginBottom: 4 }}>
                        Mastery Streak: {Math.min(remediationStreak, remediationTarget)}/{remediationTarget}
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
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
                <div style={{ marginTop: 14, background: NAVYD, borderRadius: 14, padding: '18px', border: '1px solid rgba(255,255,255,0.07)', animation: 'popIn 0.25s ease' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 20, marginBottom: 14, background: correct ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${correct ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, fontSize: 12, fontWeight: 700, color: correct ? '#4ade80' : '#f87171' }}>
                    {correct ? `✓ Correct · +${earnedXP} XP` : `✗ Incorrect · +${earnedXP} XP`}
                  </div>
                  <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Explanation</div>
                  <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.75, marginBottom: currentQ.tip ? 10 : 0 }}>
                    <MathText text={currentQ.solution} />
                  </div>
                  {currentQ.tip && (
                    <div style={{ marginTop: 10, padding: '9px 12px', background: 'rgba(241,190,67,0.06)', borderRadius: '0 8px 8px 0', borderLeft: `2px solid ${GOLD}`, fontSize: 12, color: GOLD, lineHeight: 1.65 }}>
                      💡 <MathText text={currentQ.tip} />
                    </div>
                  )}
                  {loadingTip && <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', marginTop: 8 }}>Getting AI tip…</div>}
                  {aiTip && (
                    <div style={{ marginTop: 8, padding: '9px 12px', background: 'rgba(99,102,241,0.08)', borderRadius: '0 8px 8px 0', borderLeft: '2px solid #6366f1', fontSize: 12, color: '#a5b4fc', lineHeight: 1.65 }}>
                      🤖 <MathText text={aiTip} />
                    </div>
                  )}
                  {(() => {
                    const qid = currentQ?.is_variant ? (currentQ?.parent_question_id || currentQ?.id) : currentQ?.id
                    const myFlags = flaggedMap[qid] || new Set()
                    return (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 10, color: '#334155', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Flag this question</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {['Too easy', 'Too hard', 'Confusing', 'Typo'].map(tag => {
                            const active = myFlags.has(tag)
                            const saving = flagging === tag
                            return (
                              <button key={tag} onClick={() => handleFlag(tag)} disabled={!!flagging}
                                style={{
                                  padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: flagging ? 'default' : 'pointer',
                                  fontFamily: FONT_B, transition: 'all 0.15s',
                                  border: `1px solid ${active ? 'rgba(241,190,67,0.5)' : 'rgba(255,255,255,0.08)'}`,
                                  background: active ? 'rgba(241,190,67,0.12)' : 'transparent',
                                  color: active ? GOLD : saving ? '#64748b' : '#475569',
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
            <div style={{ width: 340, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.07)', background: NAVYD, overflowY: 'auto', padding: '32px 28px', display: 'flex', flexDirection: 'column' }}>
              {!showAns ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>💡</div>
                  <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.65, maxWidth: 200 }}>Select an answer to see the explanation</div>
                </div>
              ) : (
                <div style={{ animation: 'popIn 0.25s ease', maxWidth: 500 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 14px', borderRadius: 20, marginBottom: 20, background: correct ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${correct ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, fontSize: 13, fontWeight: 700, color: correct ? '#4ade80' : '#f87171' }}>
                    {correct ? `✓ Correct · +${earnedXP} XP` : `✗ Incorrect · +${earnedXP} XP`}
                  </div>

                  <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Explanation</div>
                  <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.8, marginBottom: 16 }}><MathText text={currentQ.solution} /></div>

                  {currentQ.tip && (
                    <div style={{ padding: '12px 14px', background: 'rgba(241,190,67,0.06)', borderRadius: '0 10px 10px 0', borderLeft: `3px solid ${GOLD}`, fontSize: 13, color: GOLD, lineHeight: 1.65, marginBottom: 16 }}>
                      💡 <MathText text={currentQ.tip} />
                    </div>
                  )}

                  {loadingTip && <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', marginBottom: 12 }}>Getting AI tip…</div>}
                  {aiTip && (
                    <div style={{ padding: '12px 14px', background: 'rgba(99,102,241,0.08)', borderRadius: '0 10px 10px 0', borderLeft: '3px solid #6366f1', fontSize: 13, color: '#a5b4fc', lineHeight: 1.65, marginBottom: 16 }}>
                      🤖 <MathText text={aiTip} />
                    </div>
                  )}

                  {(() => {
                    const qid = currentQ?.is_variant ? (currentQ?.parent_question_id || currentQ?.id) : currentQ?.id
                    const myFlags = flaggedMap[qid] || new Set()
                    return (
                      <div>
                        <div style={{ fontSize: 11, color: '#334155', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Flag this question</div>
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
                                  border: `1px solid ${active ? 'rgba(241,190,67,0.5)' : 'rgba(255,255,255,0.08)'}`,
                                  background: active ? 'rgba(241,190,67,0.12)' : saving ? 'rgba(255,255,255,0.04)' : 'transparent',
                                  color: active ? GOLD : saving ? '#64748b' : '#475569',
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
    </div>
  )
}