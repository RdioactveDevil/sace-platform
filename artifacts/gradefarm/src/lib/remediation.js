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
import { parseLatexJson } from './mathMarkup.js'

export const REMEDIATION_DB_TIMEOUT_MS = 5000
// The server adds an access check and reference exemplars around the Claude call.
export const AI_TIMEOUT_MS = 12000

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
    const parsed = parseLatexJson(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {}

  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []

  try {
    const parsed = parseLatexJson(text.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
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

/**
 * BANK-FIRST remediation selector (highest priority).
 *
 * Returns existing question-bank rows that match the parent's EXACT topic AND
 * subtopic, ranked by difficulty closeness: same difficulty first, then one
 * level lower, then the rest. This is the spec'd first tier — when a student
 * gets a difficulty-3 "Exponential functions" question wrong, they get another
 * difficulty-3 (then -2) "Exponential functions" bank question with NO API call.
 *
 * Subtopic is a HARD filter: same-topic-but-different-subtopic questions are
 * never returned (that was the bug where exponential → trig/log leaked in).
 *
 * Returns [] when the bank has no same-topic+subtopic match → caller escalates
 * to stored variants, then AI generation.
 */
export function selectBankVariants(parentQuestion, allQuestions = [], targetDifficulty = null, excludeIds = []) {
  if (!parentQuestion) return []
  const target = targetDifficulty ?? (parentQuestion.difficulty ?? 3)
  const used = new Set(excludeIds || [])

  const eligible = (allQuestions || []).filter((q) => {
    if (!q || q.is_variant) return false
    if (q.id === parentQuestion.id) return false
    if (q.topic !== parentQuestion.topic) return false
    if (q.subtopic !== parentQuestion.subtopic) return false
    // Exclude anything already served this remediation (we encode bank ids in
    // the variant_record_id as `bank__<parentId>__<bankId>`).
    if (used.has(q.id) || used.has(`bank__${parentQuestion.id}__${q.id}`)) return false
    return true
  })

  const ranked = eligible
    .map((q) => {
      const d = q.difficulty ?? 3
      let score
      if (d === target) score = 100
      else if (d === target - 1) score = 80
      else if (d < target) score = 60 - (target - d) * 5
      else score = 40 - (d - target) * 10 // harder than target — least preferred
      return { q, score: score + Math.random() * 2 }
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.q)

  return ranked.map((q, index) => ({
    ...q,
    id: `bank__${parentQuestion.id}__${q.id}`,
    variant_record_id: `bank__${parentQuestion.id}__${q.id}`,
    variant_type: `bank_${index + 1}`,
    parent_question_id: parentQuestion.id,
    source: 'bank',
    is_variant: true,
    bank_question_id: q.id,
  }))
}

// Max questions held in a remediation pool. Centred on the original difficulty,
// so the pool spans both the eased (original-1) and original levels — the
// per-question picker then chooses the right level for the current streak.
export const REMEDIATION_POOL_SIZE = 8

/**
 * The difficulty the NEXT reinforcement question should be, given how far the
 * student is through their mastery streak. "Reduce by 1, then ramp back":
 *   - earlier questions   → original difficulty − 1 (rebuild confidence)
 *   - final mastery question (streak === target − 1) → original difficulty
 *     (re-prove competence at the level they actually missed)
 *
 * Exception: when the mastery target has been scaled down to 1 (the "struggling"
 * path, after repeated wrong answers), the student stays on the eased difficulty.
 * Ramping a struggling student back to the original level on their one shot would
 * be the opposite of the support the lowered target is meant to provide.
 */
export function remediationQuestionDifficulty(anchorDifficulty, streak = 0, target = 3) {
  const anchor = anchorDifficulty ?? 3
  const t = target ?? 3
  return t >= 2 && streak >= t - 1 ? anchor : Math.max(1, anchor - 1)
}

/**
 * Index of the pool question whose difficulty best matches `wantDiff`.
 * Stable: ties resolve to the earliest item (preserves queue order when
 * difficulties are equal/unknown).
 */
export function pickClosestDifficulty(queue = [], wantDiff = 3) {
  let bestIdx = 0
  let bestScore = -Infinity
  for (let i = 0; i < queue.length; i++) {
    const d = queue[i]?.difficulty ?? 3
    let score
    if (d === wantDiff) score = 100
    else if (d === wantDiff - 1) score = 80
    else if (d < wantDiff) score = 60 - (wantDiff - d) * 5
    else score = 40 - (d - wantDiff) * 10
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  return bestIdx
}

/**
 * Ask the server for AI "similar questions" to a missed bank question. Returns
 * { variants, batch, signature }: the variants are served straight away, and
 * batch + signature go to storeRemediationVariants (db.js), which checks their
 * answer keys and saves the ones that pass to the shared bank. Never throws;
 * { variants: [] } on any failure.
 */
export async function generateRemediationVariantsViaAI(
  parentQuestion,
  _conceptTag,
  targetDifficulty = null,
  { fetchImpl, timeoutMs = AI_TIMEOUT_MS } = {},
) {
  const fetchFn = fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null)
  if (!fetchFn || !parentQuestion?.id) return { variants: [] }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const diffTarget = Math.max(1, Math.min(5, targetDifficulty ?? (parentQuestion.difficulty ?? 3)))

    const res = await fetchFn('/api/remediation/variants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ parentQuestionId: parentQuestion.id, targetDifficulty: diffTarget }),
    })
    clearTimeout(timeout)
    if (!res.ok) return { variants: [] }

    const data = await res.json()
    return {
      variants: Array.isArray(data?.variants) ? data.variants : [],
      batch: data?.batch,
      signature: data?.signature,
    }
  } catch {
    return { variants: [] }
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
    }).catch(() => {})
  }
  // Always swallow rejections so they don't surface as unhandled.
  promise.catch(() => {})
  return promise
}

export async function runGenerateRemediationQueue(ctx) {
  const {
    parentQuestion,
    existingUsedIds = [],
    sessionAnsweredIds = [],
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
  // Anchor on the original question's difficulty (same level first); selectBankVariants
  // prefers that, then one level lower (e.g. "3, then 2").
  const diffTarget = difficultyTarget ?? (parentQuestion?.difficulty ?? 3)

  setRemediationStatus?.('generating')

  let resolvedQueue = []
  let resolvedSource = 'generated'

  // Combine both exclude lists so already-answered main-quiz questions are never
  // offered as remediation variants (prevents the same question appearing twice in
  // one session, particularly in 'all'/consolidation mode).
  const allExcludeIds = [...new Set([...existingUsedIds, ...sessionAnsweredIds])]

  try {
    // ── TIER 1: question bank — same topic + subtopic, matching difficulty. No API.
    const bankQueue = selectBankVariants(parentQuestion, questions, diffTarget, allExcludeIds)
    if (bankQueue.length) {
      console.info(`[gradefarm] bank has ${bankQueue.length} same-subtopic question(s) — no API call needed`)
      resolvedQueue = bankQueue.slice(0, REMEDIATION_POOL_SIZE)
      resolvedSource = 'bank'
      return resolvedQueue
    }

    // ── TIER 2: previously-generated stored variants (same concept/subtopic). No API.
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

    // ── TIER 3: nothing in the bank — generate via AI (same topic + subtopic,
    // varied difficulty) and persist the results back to the bank so future
    // remediations on this subtopic need no API call.
    console.warn(`[gradefarm] no bank/stored questions for subtopic "${parentQuestion.subtopic}" — generating via AI`)

    const aiPromise = (async () => {
      try {
        const result = await deps.generateAIVariants(parentQuestion, conceptTag, diffTarget)
        const generated = Array.isArray(result) ? result : (result?.variants || [])
        if (!generated.length) {
          console.warn('[gradefarm] AI variant generation returned 0 variants')
          return { normalized: [] }
        }

        const normalized = generated.map((v, i) => ({
          ...normalizeVariantRecord(parentQuestion, v, i),
          is_variant: true,
          source: 'ai_generated',
          variant_type: v.variant_type || 'ai_variant',
        }))

        // Background: the server checks the answer keys and saves the ones that
        // pass to the bank, off the critical path. Until then each variant's
        // bank id is a promise, so recording an answer to it can wait for it.
        if (result?.batch && deps.storeVariants) {
          const storing = trackBackground(ctx, (async () => {
            const { stored = [] } = await deps.storeVariants(result.batch, result.signature)
            const rows = stored.map(s => s.question).filter(Boolean)
            if (rows.length && typeof onBankQuestionsAdded === 'function') {
              try { onBankQuestionsAdded(rows) } catch {}
            }
            return new Map(stored.map(s => [s.variant_id, s.question?.id || null]))
          })())
          if (pendingBankIds) {
            for (const v of normalized) {
              const vid = v.variant_record_id
              pendingBankIds.set(vid, storing.then(ids => ids.get(vid) || null, () => null))
            }
          }
          storing.catch(err => console.warn('[gradefarm] storing remediation variants failed:', err?.message || err))
        }

        return { normalized }
      } catch (aiErr) {
        console.warn('[gradefarm] AI variant generation failed (generateRemediationQueue):', aiErr?.message || aiErr)
        return { normalized: [] }
      }
    })()

    // Await AI so the student gets same-subtopic questions (never off-subtopic
    // fallbacks). The ones that pass the answer-key check are saved to the bank
    // in the background (see aiPromise) so the bank grows and API calls taper off.
    const { normalized: aiQueue } = await aiPromise

    if (aiQueue.length) {
      resolvedQueue = aiQueue
      resolvedSource = 'generated'
      return aiQueue
    }

    // AI produced nothing and the bank has no same-subtopic match — exit
    // remediation gracefully rather than serving an unrelated question.
    console.warn(`[gradefarm] no same-subtopic questions available for "${parentQuestion.subtopic}" — activating empty (remediation will exit)`)
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
    questions = [],
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
  // Build the pool centred on the original difficulty (the level they missed) so
  // it spans both the eased (original-1) and original levels. The per-question
  // picker in runLoadNextRemediationQuestion then applies the "reduce by 1, then
  // ramp back" curve based on the mastery streak.
  const diffTarget = parentQuestion.difficulty ?? 3

  setRemediationMode?.(true)
  setRemediationStreak?.(0)
  setRemediationTarget?.(3)
  setRemediationDifficultyTarget?.(diffTarget)
  setRemediationSource?.('bank')
  setRemediationConcept?.(conceptTag)
  setRemediationParentId?.(parentQuestion.id)
  setRemediationOriginalQ?.(parentQuestion)
  setRemediationUsedIds?.([])

  try {
    // ── TIER 1: question bank — same topic + subtopic, matching difficulty. Instant, no API.
    const bankQueue = selectBankVariants(parentQuestion, questions, diffTarget, [])
    if (bankQueue.length) {
      setRemediationQueue?.(bankQueue.slice(0, REMEDIATION_POOL_SIZE))
      setRemediationSource?.('bank')
      setRemediationStatus?.('activated')
      return
    }

    // ── TIER 2: previously-generated stored variants (prefetched while the student read the Q).
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
      // ── TIER 3: nothing stored — AI generation + persist to bank.
      // skipDbLookup avoids paying the Supabase timeout twice.
      await generateRemediationQueue(parentQuestion, [], diffTarget, { skipDbLookup: true })
    } else {
      setRemediationQueue?.(queue)
      setRemediationSource?.('prebuilt')
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
    remediationStreak = 0,
    remediationTarget = 3,
    questions = [],
    deps,
    setRemediationQueue,
    setRemediationSource,
    setRemediationStatus,
    setRemediationUsedIds,
    setDisplayQuestion,
    generateRemediationQueue,
  } = ctx

  let queue = remediationQueue || []

  // ── TIER 1: refill from the bank first (same topic + subtopic, excluding
  // questions already served this remediation). Catches questions newly added
  // to the in-memory bank by a prior AI generation. No API call.
  if (!queue.length && remediationOriginalQ) {
    const bankQueue = selectBankVariants(
      remediationOriginalQ,
      questions,
      remediationDifficultyTarget ?? (remediationOriginalQ.difficulty ?? 3),
      remediationUsedIds,
    ).slice(0, REMEDIATION_POOL_SIZE)
    if (bankQueue.length) {
      queue = bankQueue
      setRemediationQueue?.(bankQueue)
      setRemediationSource?.('bank')
      setRemediationStatus?.('activated')
    }
  }

  // ── TIER 2: stored variants.
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

  // Concept-builder (teacher-style scaffolding) questions are injected at the
  // front to be served immediately, ahead of the normal difficulty curve — so
  // they always jump the queue regardless of difficulty matching.
  let pickIdx = queue.findIndex(
    (q) => q?.variant_type === 'concept_builder' || q?.source === 'concept_builder',
  )

  if (pickIdx === -1) {
    // "Reduce by 1, then ramp back": pick the pool question at the difficulty
    // appropriate to the current mastery streak (eased early, original level for
    // the final mastery question) rather than always taking the head.
    const anchor = remediationOriginalQ?.difficulty ?? remediationDifficultyTarget ?? 3
    const wantDiff = remediationQuestionDifficulty(anchor, remediationStreak, remediationTarget)
    pickIdx = pickClosestDifficulty(queue, wantDiff)
  }

  const nextVariant = queue[pickIdx]
  const rest = queue.filter((_, i) => i !== pickIdx)
  setRemediationQueue?.(rest)
  setRemediationUsedIds?.(prev => [...new Set([...(prev || []), nextVariant.variant_record_id || nextVariant.id])])
  setDisplayQuestion?.({ ...nextVariant, is_variant: true })
  return true
}
