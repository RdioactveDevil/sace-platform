// Pure(-ish) helpers and orchestrators for the remediation flow.
//
// Extracted out of QuizScreen.jsx so the state machine can be unit-tested
// without spinning up the full React component. Every external dependency
// (DB lookup, AI call, persistence, fetch) is injected via the `deps` arg
// so tests can substitute mocks.
//
// Status invariant: every orchestrator path eventually transitions
// remediationStatus AWAY from 'generating' — never leaves it stuck.

import { buildRemediationQueue, getQuestionConceptTag } from './engine.js'

export const REMEDIATION_DB_TIMEOUT_MS = 5000
export const AI_TIMEOUT_MS = 8000
export const BANK_PERSIST_TIMEOUT_MS = 5000

export function withTimeout(promise, ms, label = 'operation') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[gradefarm] ${label} timed out after ${ms}ms`))
    }, ms)
    Promise.resolve(promise)
      .then(value => { clearTimeout(timer); resolve(value) })
      .catch(err => { clearTimeout(timer); reject(err) })
  })
}

export async function fetchRemediationVariantsSafe(
  getVariantsFn,
  parentId,
  conceptTag,
  excludeIds,
  label,
  timeoutMs = REMEDIATION_DB_TIMEOUT_MS,
) {
  try {
    return await withTimeout(
      getVariantsFn(parentId, conceptTag, excludeIds),
      timeoutMs,
      `getRemediationVariants (${label})`,
    )
  } catch (err) {
    console.warn(`[gradefarm] DB variant lookup failed in ${label}:`, err?.message || err)
    return { directVariants: [], conceptVariants: [] }
  }
}

export function extractJsonArray(text = '') {
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

export function scoreLocalCandidate(q, parentQuestion, target) {
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

export function createLocalFallbackVariants(parentQuestion, allQuestions = [], targetDifficulty = null) {
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
    bank_question_id: q.id,
  }))
}

export function normalizeVariantRecord(parentQuestion, variant, index = 0) {
  return {
    ...variant,
    id: variant.id || variant.variant_record_id || `variant__${parentQuestion.id}__${Date.now()}__${index}`,
    variant_record_id: variant.variant_record_id || variant.id || `variant__${parentQuestion.id}__${index}`,
    parent_question_id: variant.parent_question_id || parentQuestion.id,
    concept_tag: variant.concept_tag || parentQuestion.concept_tag || getQuestionConceptTag(parentQuestion),
    topic: parentQuestion.topic,
    subtopic: parentQuestion.subtopic,
    difficulty: Math.max(1, Math.min(5, Number(variant.difficulty || parentQuestion.difficulty || 1))),
    options: Array.isArray(variant.options) ? variant.options : (parentQuestion.options || []),
    source: variant.source || 'prebuilt',
    is_variant: true,
  }
}

export async function generateRemediationVariantsViaAI(
  parentQuestion,
  conceptTag,
  targetDifficulty = null,
  { fetchImpl, timeoutMs = AI_TIMEOUT_MS } = {},
) {
  const fetchFn = fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null)
  if (!fetchFn) return []
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

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

    const res = await fetchFn('/api/chat', {
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

// ─── ORCHESTRATORS ─────────────────────────────────────────────────────────
// All three accept a `ctx` object with everything they need: state values,
// state setters, dependency functions, and an optional `pendingBackground`
// Set used to track fire-and-forget promises (so tests can await them).
//
// Status transitions guaranteed:
//   - runEnterRemediation: ends with status 'activated' (or delegated to
//     runGenerateRemediationQueue which also ends with 'activated').
//   - runGenerateRemediationQueue: always ends with status 'activated' via
//     a `finally` block, even on exceptions.
//   - runLoadNextRemediationQuestion: always ends with status 'activated'
//     when the queue is empty; otherwise leaves status untouched (the next
//     question is being shown).

function trackBackground(ctx, promise) {
  if (ctx.pendingBackground && typeof ctx.pendingBackground.add === 'function') {
    ctx.pendingBackground.add(promise)
    promise.finally(() => {
      try { ctx.pendingBackground.delete(promise) } catch {}
    })
  }
  // Always swallow rejections so they don't surface as unhandled.
  promise.catch(() => {})
  return promise
}

export async function runGenerateRemediationQueue(ctx) {
  const {
    parentQuestion,
    existingUsedIds = [],
    difficultyTarget = null,
    options = {},
    questions = [],
    deps,
    setRemediationStatus,
    setRemediationQueue,
    setRemediationSource,
    pendingBankIds,           // Map | undefined
    onBankQuestionsAdded,
  } = ctx
  const { skipDbLookup = false } = options
  const conceptTag = parentQuestion?.concept_tag || getQuestionConceptTag(parentQuestion)
  const diffTarget = difficultyTarget ?? Math.max(1, (parentQuestion?.difficulty ?? 3) - 1)

  setRemediationStatus?.('generating')

  let resolvedQueue = []
  let resolvedSource = 'generated'

  try {
    if (!skipDbLookup) {
      const { directVariants, conceptVariants } = await fetchRemediationVariantsSafe(
        deps.getRemediationVariants,
        parentQuestion.id, conceptTag, existingUsedIds, 'generateRemediationQueue',
        deps.dbTimeoutMs,
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

    const localFallback = createLocalFallbackVariants(parentQuestion, questions, diffTarget).map((variant, index) =>
      normalizeVariantRecord(parentQuestion, variant, index)
    )

    const localQueue = buildRemediationQueue({
      generatedVariants: localFallback,
      excludeIds: existingUsedIds,
      limit: 5,
    }).map(v => ({ ...v, is_variant: true, source: v.source || 'related' }))

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

    const aiPromise = (async () => {
      try {
        const generated = await deps.generateAIVariants(parentQuestion, conceptTag, diffTarget)
        if (!generated || !generated.length) {
          console.warn('[gradefarm] AI variant generation returned 0 variants')
          return { normalized: [], generated: [] }
        }

        const normalized = generated.map((v, i) => ({
          ...normalizeVariantRecord(parentQuestion, v, i),
          is_variant: true,
          source: 'ai_generated',
          variant_type: v.variant_type || 'ai_variant',
        }))

        // Background bank persistence — bounded, off the critical path.
        trackBackground(ctx, (async () => {
          try {
            const bankRows = await withTimeout(
              deps.insertToBank(parentQuestion, generated),
              deps.bankTimeoutMs ?? BANK_PERSIST_TIMEOUT_MS,
              'insertGeneratedQuestionsToBank',
            )
            if (!bankRows || !bankRows.length) return
            if (typeof onBankQuestionsAdded === 'function') {
              try { onBankQuestionsAdded(bankRows) } catch {}
            }
            bankRows.forEach((row, i) => {
              const vid = normalized[i]?.variant_record_id
              if (vid && pendingBankIds) pendingBankIds.set(vid, row.id)
            })
          } catch (bankErr) {
            console.warn('[gradefarm] background bank persistence failed:', bankErr?.message || bankErr)
          }
        })())

        return { normalized, generated }
      } catch (aiErr) {
        console.warn('[gradefarm] AI variant generation failed (generateRemediationQueue):', aiErr?.message || aiErr)
        return { normalized: [], generated: [] }
      }
    })()

    // Persistence to question_variants table — also background.
    trackBackground(ctx, aiPromise.then(async ({ generated }) => {
      if (!generated.length) return
      try {
        const saved = await deps.insertVariants(parentQuestion, generated)
        if (saved.length < generated.length) {
          console.error(
            `[gradefarm] variant storage partial: ${saved.length}/${generated.length} saved for concept "${parentQuestion.concept_tag || parentQuestion.subtopic}".`
          )
        }
      } catch (insertErr) {
        console.error(
          `[gradefarm] variant storage failed (0/${generated.length} saved) for concept "${parentQuestion.concept_tag || parentQuestion.subtopic}":`,
          insertErr?.message || insertErr,
        )
      }
    }))

    const hasRelatedLocal = localQueue.length > 0

    if (hasRelatedLocal) {
      // Append AI variants to the live queue when they arrive (background).
      trackBackground(ctx, aiPromise.then(({ normalized }) => {
        if (normalized.length && setRemediationQueue) {
          setRemediationQueue(prev => [...(prev || []), ...normalized])
        }
      }))
      resolvedQueue = localQueue
      resolvedSource = 'generated'
      return localQueue
    }

    console.warn('[gradefarm] no related local variants — awaiting AI generation synchronously to seed the queue')
    const { normalized: aiQueue } = await aiPromise

    if (aiQueue.length) {
      resolvedQueue = aiQueue
      resolvedSource = 'generated'
      return aiQueue
    }

    console.warn('[gradefarm] no variants available from any source — activating with empty queue')
    resolvedQueue = []
    resolvedSource = 'generated'
    return []
  } catch (err) {
    console.warn('[gradefarm] generateRemediationQueue unexpected error:', err?.message || err)
    resolvedQueue = []
    resolvedSource = 'generated'
    return []
  } finally {
    // Single exit point — always clear the 'generating' status.
    setRemediationSource?.(resolvedSource)
    setRemediationQueue?.(resolvedQueue)
    setRemediationStatus?.('activated')
  }
}

export async function runEnterRemediation(ctx) {
  const {
    parentQuestion,
    prefetched,           // Map | undefined
    deps,
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
    generateRemediationQueue, // bound async fn
  } = ctx

  if (!parentQuestion) return

  const conceptTag = parentQuestion.concept_tag || getQuestionConceptTag(parentQuestion)
  const diffTarget = Math.max(1, (parentQuestion.difficulty ?? 3) - 1)

  setRemediationMode?.(true)
  setRemediationStreak?.(0)
  setRemediationTarget?.(3)
  setRemediationDifficultyTarget?.(diffTarget)
  setRemediationSource?.('prebuilt')
  setRemediationConcept?.(conceptTag)
  setRemediationParentId?.(parentQuestion.id)
  setRemediationOriginalQ?.(parentQuestion)
  setRemediationUsedIds?.([])

  try {
    let dbResult = prefetched && typeof prefetched.get === 'function'
      ? prefetched.get(parentQuestion.id)
      : null
    if (!dbResult) {
      dbResult = await fetchRemediationVariantsSafe(
        deps.getRemediationVariants,
        parentQuestion.id, conceptTag, [], 'enterRemediation',
        deps.dbTimeoutMs,
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
      // No DB variants (or DB timed out) — go straight to local fallback + AI.
      // skipDbLookup avoids paying the Supabase timeout twice.
      await generateRemediationQueue(parentQuestion, [], diffTarget, { skipDbLookup: true })
    } else {
      setRemediationQueue?.(queue)
      setRemediationStatus?.('activated')
    }
  } catch (err) {
    // Belt-and-braces: never leave the user stuck on 'generating'.
    console.warn('[gradefarm] enterRemediation unexpected error — activating with empty queue:', err?.message || err)
    setRemediationQueue?.([])
    setRemediationStatus?.('activated')
  }
}

export async function runLoadNextRemediationQuestion(ctx) {
  const {
    remediationQueue,
    remediationOriginalQ,
    remediationUsedIds = [],
    remediationDifficultyTarget,
    deps,
    setRemediationQueue,
    setRemediationSource,
    setRemediationStatus,
    setRemediationUsedIds,
    setDisplayQuestion,
    generateRemediationQueue,
  } = ctx

  let queue = remediationQueue || []

  if (!queue.length && remediationOriginalQ) {
    const conceptTag = remediationOriginalQ.concept_tag || getQuestionConceptTag(remediationOriginalQ)
    const { directVariants, conceptVariants } = await fetchRemediationVariantsSafe(
      deps.getRemediationVariants,
      remediationOriginalQ.id, conceptTag, remediationUsedIds, 'loadNextRemediationQuestion',
      deps.dbTimeoutMs,
    )
    const dbQueue = buildRemediationQueue({
      directVariants: (directVariants || []).map((v, i) => normalizeVariantRecord(remediationOriginalQ, v, i)),
      conceptVariants: (conceptVariants || []).map((v, i) => normalizeVariantRecord(remediationOriginalQ, v, i)),
      excludeIds: remediationUsedIds,
      limit: 5,
    }).map(v => ({ ...v, is_variant: true, source: v.source || 'prebuilt' }))

    if (dbQueue.length) {
      queue = dbQueue
      setRemediationQueue?.(dbQueue)
      setRemediationSource?.('prebuilt')
      setRemediationStatus?.('activated')
    }

    if (!queue.length) {
      queue = await generateRemediationQueue(
        remediationOriginalQ,
        remediationUsedIds,
        remediationDifficultyTarget,
        { skipDbLookup: true },
      )
    }
  }

  if (!queue.length) {
    setRemediationQueue?.([])
    setRemediationSource?.('generated')
    setRemediationStatus?.('activated')
    return false
  }

  const [nextVariant, ...rest] = queue
  setRemediationQueue?.(rest)
  setRemediationUsedIds?.(prev => [...new Set([...(prev || []), nextVariant.variant_record_id || nextVariant.id])])
  setDisplayQuestion?.({ ...nextVariant, is_variant: true })
  return true
}
