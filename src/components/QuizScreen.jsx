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
  incrementQuestionVariantUsage,
} from '../lib/db'
import { THEMES } from '../lib/theme'

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

function createLocalFallbackVariants(parentQuestion) {
  const correctIndex = parentQuestion.answer_index ?? 0
  const options = Array.isArray(parentQuestion.options) ? parentQuestion.options : []
  const correctAnswer = options[correctIndex] || ''

  return Array.from({ length: 3 }, (_, index) => ({
    id: `local_fallback__${parentQuestion.id}__${Date.now()}__${index}`,
    variant_record_id: `local_fallback__${parentQuestion.id}__${index}`,
    question: `${parentQuestion.question} (Reinforcement check ${index + 1})`,
    options,
    answer_index: correctIndex,
    difficulty: Math.max(1, Math.min(5, Number(parentQuestion.difficulty || 1))),
    topic: parentQuestion.topic,
    subtopic: parentQuestion.subtopic,
    concept_tag: parentQuestion.concept_tag || getQuestionConceptTag(parentQuestion),
    solution: parentQuestion.solution || `The correct answer remains ${correctAnswer}. Focus on the same concept again.`,
    tip: parentQuestion.tip || 'Use the explanation you just saw, then check the key concept again.',
    variant_type: `fallback_${index + 1}`,
    parent_question_id: parentQuestion.id,
    source: 'ai_generated',
    is_variant: true,
  }))
}

async function generateRemediationVariantsViaAI(parentQuestion, conceptTag) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3500)

    const correctAnswer = parentQuestion.options?.[parentQuestion.answer_index] || ''
    const system = [
      'You are generating remediation MCQs for a SACE Chemistry student.',
      'Return only a valid JSON array containing exactly 3 objects.',
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
      'Generate 3 targeted remediation questions that test the same concept but are not copies.',
    ].join('\n')

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        max_tokens: 1200,
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
      : 'You are in targeted reinforcement for this concept. Get 3 correct in a row to continue.'

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
          background: remediationStatus === 'complete' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${remediationStatus === 'complete' ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}`,
          color: remediationStatus === 'complete' ? '#4ade80' : '#e2e8f0',
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

function StatusToast({ status }) {
  if (!status || status === 'idle' || status === 'activated') return null

  const isComplete = status === 'complete'
  const title = isComplete ? 'Remediation Complete' : 'Generating Similar Questions'
  const subtitle = isComplete
    ? 'Concept recovered. Returning to the main quiz.'
    : 'Preparing more same-concept reinforcement.'

  return (
    <div style={{
      marginTop: 12,
      borderRadius: 14,
      background: 'linear-gradient(135deg, rgba(8,13,40,0.96), rgba(12,16,55,0.98))',
      border: `1px solid ${isComplete ? 'rgba(16,185,129,0.35)' : 'rgba(241,190,67,0.24)'}`,
      boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
      padding: '14px 16px',
      animation: 'popIn 0.18s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          background: isComplete ? 'rgba(16,185,129,0.12)' : 'rgba(241,190,67,0.12)',
          border: `1px solid ${isComplete ? 'rgba(16,185,129,0.22)' : 'rgba(241,190,67,0.18)'}`,
          flexShrink: 0,
        }}>
          {isComplete ? '✅' : '🧠'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{title}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
    </div>
  )
}

export default function QuizScreen({
  profile, setProfile, questions, struggleMap, setStruggleMap, onHome, theme = 'dark',
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
}) {
  const t = THEMES[theme]

  const [floatXP, setFloatXP] = useState(null)
  const [showExit, setShowExit] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 860)
  const [finished, setFinished] = useState(false)
  const startTime = useRef(null)

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
  ])

  const generateRemediationQueue = useCallback(async (parentQuestion, existingUsedIds = []) => {
    const conceptTag = parentQuestion?.concept_tag || getQuestionConceptTag(parentQuestion)
    setRemediationStatus('generating')

    const localFallback = createLocalFallbackVariants(parentQuestion).map((variant, index) =>
      normalizeVariantRecord(parentQuestion, variant, index)
    )

    const localQueue = buildRemediationQueue({
      generatedVariants: localFallback,
      excludeIds: existingUsedIds,
      limit: 5,
    }).map(v => ({ ...v, is_variant: true, source: 'ai_generated' }))

    ;(async () => {
      try {
        const generated = await generateRemediationVariantsViaAI(parentQuestion, conceptTag)
        if (!generated.length) return
        try {
          await insertGeneratedQuestionVariants(parentQuestion, generated)
        } catch {}
      } catch {}
    })()

    setRemediationSource('generated')
    setRemediationStatus('activated')
    setRemediationQueue(localQueue)
    return localQueue
  }, [setRemediationQueue, setRemediationSource, setRemediationStatus])

  const enterRemediation = useCallback(async (parentQuestion) => {
    if (!parentQuestion) return

    const conceptTag = parentQuestion.concept_tag || getQuestionConceptTag(parentQuestion)

    setRemediationMode(true)
    setRemediationStreak(0)
    setRemediationTarget(3)
    setRemediationStatus('activated')
    setRemediationSource('prebuilt')
    setRemediationConcept(conceptTag)
    setRemediationParentId(parentQuestion.id)
    setRemediationOriginalQ(parentQuestion)
    setRemediationUsedIds([])

    try {
      const { directVariants, conceptVariants } = await getRemediationVariants(parentQuestion.id, conceptTag, [])
      let queue = buildRemediationQueue({
        directVariants: (directVariants || []).map((variant, index) => normalizeVariantRecord(parentQuestion, variant, index)),
        conceptVariants: (conceptVariants || []).map((variant, index) => normalizeVariantRecord(parentQuestion, variant, index)),
        excludeIds: [],
        limit: 5,
      }).map(v => ({ ...v, is_variant: true, source: v.source || 'prebuilt' }))

      if (!queue.length) {
        queue = await generateRemediationQueue(parentQuestion, [])
      } else {
        setRemediationQueue(queue)
      }
    } catch {
      await generateRemediationQueue(parentQuestion, [])
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
  ])

  useEffect(() => {
    async function init() {
      try { await createSession(profile.id, 'Chemistry') } catch {}
    }
    if (!_currentQ) {
      init()
      loadNext([], struggleMap, quizMode, quizSubtopics)
    }
  }, [_currentQ, loadNext, profile.id, quizMode, quizSubtopics, struggleMap])

  useEffect(() => {
    if (remediationStatus !== 'complete') return
    const timeout = setTimeout(() => setRemediationStatus('activated'), 1400)
    return () => clearTimeout(timeout)
  }, [remediationStatus, setRemediationStatus])

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
        setRemediationStreak(0)
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
      await enterRemediation(currentQ)
    }
  }

  const loadNextRemediationQuestion = async () => {
    let queue = remediationQueue

    if (!queue.length && remediationOriginalQ) {
      queue = await generateRemediationQueue(remediationOriginalQ, remediationUsedIds)
    }

    if (!queue.length) {
      const fallbackBase = remediationOriginalQ || currentQ
      const hardFallback = createLocalFallbackVariants(fallbackBase).map((variant, index) =>
        normalizeVariantRecord(fallbackBase, variant, index)
      )

      queue = buildRemediationQueue({
        generatedVariants: hardFallback,
        excludeIds: remediationUsedIds,
        limit: 5,
      }).map(v => ({ ...v, is_variant: true, source: 'ai_generated' }))

      setRemediationQueue(queue)
      setRemediationSource('generated')
      setRemediationStatus('activated')
    }

    if (!queue.length) return false

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
        setStruggleMap(prev => { loadNext(answered, prev, quizMode, quizSubtopics); return prev })
      }
      return
    }

    if (remediationMode && currentQ.is_variant) {
      if (remediationStatus === 'complete') {
        clearRemediation()
        setQNumber(n => n + 1)
        setStruggleMap(prev => { loadNext(sessionAnswered, prev, quizMode, quizSubtopics); return prev })
        return
      }

      await loadNextRemediationQuestion()
      return
    }

    const newAnswered = [...sessionAnswered, currentQ.id]
    setSessionAnswered(newAnswered)
    setQNumber(n => n + 1)
    setStruggleMap(prev => { loadNext(newAnswered, prev, quizMode, quizSubtopics); return prev })
  }

  const counts = getQuestionCounts(questions, struggleMap, quizSubtopics)

  if (finished || (!currentQ && sessionResults.length > 0)) {
    const startMode = (mode) => {
      setQuizMode(mode)
      setSessionAnswered([])
      setSessionResults([])
      setQNumber(1)
      setSessionXP(0)
      clearRemediation()
      setFinished(false)
      loadNext([], struggleMap, mode, quizSubtopics)
    }

    return (
      <div style={{ minHeight: '100vh', background: NAVY, fontFamily: FONT_B, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <div style={{ fontFamily: FONT_D, fontSize: 28, color: '#fff', letterSpacing: 1, marginBottom: 8 }}>
            {quizMode === 'new' ? 'ALL CAUGHT UP!' : quizMode === 'wrong' ? 'WRONGS REVIEWED!' : 'SESSION COMPLETE!'}
          </div>
          <div style={{ fontSize: 15, color: '#64748b', lineHeight: 1.7, marginBottom: 8 }}>
            {quizMode === 'new'
              ? "You've attempted every question on gradefarm. right now — more are being added soon."
              : 'Great work reviewing those questions.'}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 32, flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#4ade80' }}>
              +{sessionXP} XP this session
            </div>
            <div style={{ background: 'rgba(241,190,67,0.1)', border: '1px solid rgba(241,190,67,0.25)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: GOLD }}>
              {sessionResults.filter(r => r.correct).length}/{sessionResults.length} correct
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {counts.wrong > 0 && (
              <button onClick={() => startMode('wrong')} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#ef4444,#f87171)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
                Re-attempt {counts.wrong} wrong answer{counts.wrong !== 1 ? 's' : ''} →
              </button>
            )}
            <button onClick={() => startMode('all')} style={{ width: '100%', padding: '14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
              Repeat all questions
            </button>
            <button onClick={onHome} style={{ width: '100%', padding: '14px', borderRadius: 12, border: '1px solid rgba(241,190,67,0.3)', background: 'transparent', color: GOLD, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(6px)' }}>
          <div style={{ background: '#111a4a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: '32px', maxWidth: 340, width: '90%', textAlign: 'center', animation: 'popIn 0.2s ease' }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 8 }}>End this session?</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24, lineHeight: 1.65 }}>
              You've earned <span style={{ color: GOLD, fontWeight: 700 }}>{sessionXP} XP</span> so far. Your progress is saved.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowExit(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>Keep going</button>
              <button onClick={onHome} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>End session</button>
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
            <span style={{ fontSize: 12, fontWeight: 800, color: NAVY }}>+{sessionXP} XP</span>}
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
              <RemediationChip
                remediationMode={remediationMode}
                remediationStreak={remediationStreak}
                remediationTarget={remediationTarget}
                remediationStatus={remediationStatus}
                remediationSource={remediationSource}
              />

              <div style={{ background: '#ffffff', borderRadius: 20, padding: isMobile ? '20px' : '28px', boxShadow: '0 32px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.25)', marginBottom: showAns ? 14 : 0 }}>
                <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 700, color: NAVY, lineHeight: 1.7, marginBottom: 22 }}>
                  {currentQ.question}
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
                        {opt}
                      </button>
                    )
                  })}
                </div>
              </div>

              {showAns && (
                <div style={{ animation: 'popIn 0.2s ease' }}>
                  <button
                    onClick={nextQ}
                    disabled={remediationStatus === 'generating'}
                    style={{
                      width: '100%',
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

                  <StatusToast
                    status={remediationStatus === 'complete' || remediationStatus === 'generating' ? remediationStatus : null}
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
                          : 'This concept is temporarily locked until you answer 3 similar questions correctly in a row.'}
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
                  <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.75, marginBottom: currentQ.tip ? 10 : 0 }}>{currentQ.solution}</div>
                  {currentQ.tip && (
                    <div style={{ marginTop: 10, padding: '9px 12px', background: 'rgba(241,190,67,0.06)', borderRadius: '0 8px 8px 0', borderLeft: `2px solid ${GOLD}`, fontSize: 12, color: GOLD, lineHeight: 1.65 }}>
                      💡 {currentQ.tip}
                    </div>
                  )}
                  {loadingTip && <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', marginTop: 8 }}>Getting AI tip…</div>}
                  {aiTip && (
                    <div style={{ marginTop: 8, padding: '9px 12px', background: 'rgba(99,102,241,0.08)', borderRadius: '0 8px 8px 0', borderLeft: '2px solid #6366f1', fontSize: 12, color: '#a5b4fc', lineHeight: 1.65 }}>
                      🤖 {aiTip}
                    </div>
                  )}
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
                  <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.8, marginBottom: 16 }}>{currentQ.solution}</div>

                  {currentQ.tip && (
                    <div style={{ padding: '12px 14px', background: 'rgba(241,190,67,0.06)', borderRadius: '0 10px 10px 0', borderLeft: `3px solid ${GOLD}`, fontSize: 13, color: GOLD, lineHeight: 1.65, marginBottom: 16 }}>
                      💡 {currentQ.tip}
                    </div>
                  )}

                  {loadingTip && <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', marginBottom: 12 }}>Getting AI tip…</div>}
                  {aiTip && (
                    <div style={{ padding: '12px 14px', background: 'rgba(99,102,241,0.08)', borderRadius: '0 10px 10px 0', borderLeft: '3px solid #6366f1', fontSize: 13, color: '#a5b4fc', lineHeight: 1.65, marginBottom: 16 }}>
                      🤖 {aiTip}
                    </div>
                  )}

                  <div>
                    <div style={{ fontSize: 11, color: '#334155', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Flag this question</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {['Too easy', 'Too hard', 'Confusing', 'Typo'].map(tag => (
                        <button key={tag} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#475569', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>{tag}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}