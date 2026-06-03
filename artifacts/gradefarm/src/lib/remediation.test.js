// Automated coverage for the remediation state machine. Each test exercises
// one branch of enterRemediation / generateRemediationQueue /
// loadNextRemediationQuestion and asserts that:
//   1. The behaviour matches the documented branch.
//   2. remediationStatus NEVER ends on 'generating' — task #40 regressions
//      caused the UI to freeze on 'generating' when a Supabase call hung,
//      so this invariant is checked explicitly on every path.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  withTimeout,
  fetchRemediationVariantsSafe,
  selectBankVariants,
  remediationQuestionDifficulty,
  pickClosestDifficulty,
  runEnterRemediation,
  runGenerateRemediationQueue,
  runLoadNextRemediationQuestion,
} from './remediation.js'

// ─── Test scaffolding ──────────────────────────────────────────────────────

function makeStateRecorder() {
  const calls = {
    status: [],
    queue: [],
    source: [],
    usedIds: [],
    displayQuestion: [],
    mode: [],
    streak: [],
    target: [],
    diffTarget: [],
    concept: [],
    parentId: [],
    originalQ: [],
  }
  return {
    calls,
    setRemediationStatus: v => calls.status.push(v),
    setRemediationQueue: v => calls.queue.push(typeof v === 'function' ? v([]) : v),
    setRemediationSource: v => calls.source.push(v),
    setRemediationUsedIds: v => calls.usedIds.push(typeof v === 'function' ? v([]) : v),
    setDisplayQuestion: v => calls.displayQuestion.push(v),
    setRemediationMode: v => calls.mode.push(v),
    setRemediationStreak: v => calls.streak.push(v),
    setRemediationTarget: v => calls.target.push(v),
    setRemediationDifficultyTarget: v => calls.diffTarget.push(v),
    setRemediationConcept: v => calls.concept.push(v),
    setRemediationParentId: v => calls.parentId.push(v),
    setRemediationOriginalQ: v => calls.originalQ.push(v),
  }
}

function makeParent(overrides = {}) {
  return {
    id: 'q_parent_1',
    subject: 'Chemistry',
    topic: 'Acids',
    subtopic: 'pH',
    concept_tag: 'chemistry|acids|ph',
    difficulty: 3,
    question: 'What is pH?',
    options: ['A', 'B', 'C', 'D'],
    answer_index: 0,
    solution: 'Because.',
    ...overrides,
  }
}

function makeStoredVariant(id, overrides = {}) {
  return {
    id,
    variant_record_id: id,
    parent_question_id: 'q_parent_1',
    concept_tag: 'chemistry|acids|ph',
    topic: 'Acids',
    subtopic: 'pH',
    difficulty: 2,
    question: `variant ${id}`,
    options: ['A', 'B', 'C', 'D'],
    answer_index: 0,
    usage_count: 0,
    ...overrides,
  }
}

function makeBankQuestion(id, overrides = {}) {
  return {
    id,
    subject: 'Chemistry',
    topic: 'Acids',
    subtopic: 'pH',
    concept_tag: 'chemistry|acids|ph',
    difficulty: 2,
    question: `bank ${id}`,
    options: ['A', 'B', 'C', 'D'],
    answer_index: 0,
    is_variant: false,
    ...overrides,
  }
}

const baseDeps = () => ({
  getRemediationVariants: async () => ({ directVariants: [], conceptVariants: [] }),
  generateAIVariants: async () => [],
  insertVariants: async () => [],
  insertToBank: async () => [],
  dbTimeoutMs: 50,
  bankTimeoutMs: 50,
})

async function flushBackground(ctx) {
  if (!ctx.pendingBackground) return
  await Promise.allSettled([...ctx.pendingBackground])
}

// ─── withTimeout ───────────────────────────────────────────────────────────

describe('withTimeout', () => {
  test('resolves with the underlying value when in time', async () => {
    const v = await withTimeout(Promise.resolve('ok'), 100, 'noop')
    assert.equal(v, 'ok')
  })

  test('rejects when the underlying promise hangs longer than the budget', async () => {
    const hung = new Promise(() => {})
    await assert.rejects(
      () => withTimeout(hung, 20, 'hung'),
      /timed out after 20ms/,
    )
  })
})

describe('fetchRemediationVariantsSafe', () => {
  test('returns empty shape when underlying call rejects (DB error)', async () => {
    const result = await fetchRemediationVariantsSafe(
      async () => { throw new Error('boom') },
      'q1', 'tag', [], 'unit-test', 50,
    )
    assert.deepEqual(result, { directVariants: [], conceptVariants: [] })
  })

  test('returns empty shape when underlying call hangs past timeout', async () => {
    const result = await fetchRemediationVariantsSafe(
      () => new Promise(() => {}),  // never resolves
      'q1', 'tag', [], 'unit-test', 20,
    )
    assert.deepEqual(result, { directVariants: [], conceptVariants: [] })
  })
})

// ─── selectBankVariants (bank-first tier) ──────────────────────────────────

describe('selectBankVariants', () => {
  test('returns only same topic + same subtopic questions (no off-subtopic leak)', () => {
    const parent = makeParent({ topic: 'Differentiation', subtopic: 'Exponential functions', difficulty: 3 })
    const bank = [
      makeBankQuestion('exp_1', { topic: 'Differentiation', subtopic: 'Exponential functions', difficulty: 3 }),
      makeBankQuestion('log_1', { topic: 'Differentiation', subtopic: 'Logarithmic functions', difficulty: 3 }),
      makeBankQuestion('trig_1', { topic: 'Differentiation', subtopic: 'Trigonometric functions', difficulty: 3 }),
    ]
    const out = selectBankVariants(parent, bank, 3, [])
    assert.equal(out.length, 1, 'only the same-subtopic question is eligible')
    assert.equal(out[0].bank_question_id, 'exp_1')
    assert.ok(out.every(v => v.subtopic === 'Exponential functions'))
  })

  test('ranks exact difficulty first, then one level lower', () => {
    const parent = makeParent({ topic: 'T', subtopic: 'S', difficulty: 3 })
    const bank = [
      makeBankQuestion('d5', { topic: 'T', subtopic: 'S', difficulty: 5 }),
      makeBankQuestion('d2', { topic: 'T', subtopic: 'S', difficulty: 2 }),
      makeBankQuestion('d3', { topic: 'T', subtopic: 'S', difficulty: 3 }),
    ]
    const out = selectBankVariants(parent, bank, 3, [])
    assert.equal(out[0].bank_question_id, 'd3', 'exact difficulty ranks first')
    assert.equal(out[1].bank_question_id, 'd2', 'one level lower ranks second')
    assert.equal(out[2].bank_question_id, 'd5')
  })

  test('excludes the parent and already-served questions', () => {
    const parent = makeParent({ id: 'p', topic: 'T', subtopic: 'S', difficulty: 3 })
    const bank = [
      makeBankQuestion('p', { topic: 'T', subtopic: 'S', difficulty: 3 }), // same id as parent
      makeBankQuestion('seen', { topic: 'T', subtopic: 'S', difficulty: 3 }),
      makeBankQuestion('fresh', { topic: 'T', subtopic: 'S', difficulty: 3 }),
    ]
    const out = selectBankVariants(parent, bank, 3, ['bank__p__seen'])
    assert.deepEqual(out.map(v => v.bank_question_id), ['fresh'])
  })

  test('skips variant rows and returns [] when nothing matches', () => {
    const parent = makeParent({ topic: 'T', subtopic: 'S' })
    const bank = [
      makeBankQuestion('v', { topic: 'T', subtopic: 'S', is_variant: true }),
      makeBankQuestion('other', { topic: 'Other', subtopic: 'S' }),
    ]
    assert.deepEqual(selectBankVariants(parent, bank, 3, []), [])
  })
})

// ─── difficulty curve: reduce by 1, then ramp back ─────────────────────────

describe('remediationQuestionDifficulty', () => {
  test('eases by 1 for early questions, ramps to original on the final mastery question', () => {
    // anchor 3, target 3 (need 3 correct in a row)
    assert.equal(remediationQuestionDifficulty(3, 0, 3), 2, 'Q1 eased')
    assert.equal(remediationQuestionDifficulty(3, 1, 3), 2, 'Q2 eased')
    assert.equal(remediationQuestionDifficulty(3, 2, 3), 3, 'final question back to original')
  })

  test('never goes below 1', () => {
    assert.equal(remediationQuestionDifficulty(1, 0, 3), 1)
  })

  test('struggling path (target scaled to 1) keeps the student eased, never ramps to original', () => {
    // A target of 1 is the "struggling" bar — the student stays on the eased
    // difficulty rather than being handed the original (hard) level.
    assert.equal(remediationQuestionDifficulty(3, 0, 1), 2)
  })

  test('target 2 still ramps the final question back to original', () => {
    assert.equal(remediationQuestionDifficulty(3, 0, 2), 2, 'Q1 eased')
    assert.equal(remediationQuestionDifficulty(3, 1, 2), 3, 'final question back to original')
  })
})

describe('pickClosestDifficulty', () => {
  test('prefers exact difficulty', () => {
    const q = [{ difficulty: 2 }, { difficulty: 3 }, { difficulty: 4 }]
    assert.equal(pickClosestDifficulty(q, 3), 1)
  })

  test('prefers one level lower over one level higher', () => {
    const q = [{ difficulty: 4 }, { difficulty: 2 }]
    assert.equal(pickClosestDifficulty(q, 3), 1)
  })

  test('stable on ties — earliest wins (preserves queue order)', () => {
    const q = [{ difficulty: 3 }, { difficulty: 3 }]
    assert.equal(pickClosestDifficulty(q, 3), 0)
  })
})

// ─── runGenerateRemediationQueue ───────────────────────────────────────────

describe('runGenerateRemediationQueue', () => {
  test('uses stored DB variants when present (prebuilt path)', async () => {
    const rec = makeStateRecorder()
    const ctx = {
      parentQuestion: makeParent(),
      questions: [],
      deps: {
        ...baseDeps(),
        getRemediationVariants: async () => ({
          directVariants: [makeStoredVariant('v1'), makeStoredVariant('v2')],
          conceptVariants: [],
        }),
        generateAIVariants: async () => { throw new Error('AI should not be called') },
      },
      pendingBackground: new Set(),
      ...rec,
    }
    const queue = await runGenerateRemediationQueue(ctx)
    await flushBackground(ctx)

    assert.equal(queue.length, 2)
    assert.equal(rec.calls.source.at(-1), 'prebuilt')
    assert.equal(rec.calls.status.at(-1), 'activated')
    assert.equal(rec.calls.status.at(0), 'generating')
    assert.ok(!rec.calls.status.includes('generating') || rec.calls.status.at(-1) !== 'generating')
  })

  test('falls back to local bank when DB returns empty', async () => {
    const parent = makeParent()
    const rec = makeStateRecorder()
    const ctx = {
      parentQuestion: parent,
      questions: [
        makeBankQuestion('q_other_1'),
        makeBankQuestion('q_other_2'),
        makeBankQuestion('q_other_3'),
        makeBankQuestion('q_other_4'),
      ],
      deps: {
        ...baseDeps(),
        getRemediationVariants: async () => ({ directVariants: [], conceptVariants: [] }),
      },
      pendingBackground: new Set(),
      ...rec,
    }
    const queue = await runGenerateRemediationQueue(ctx)
    await flushBackground(ctx)

    assert.ok(queue.length >= 1, 'expected non-empty bank queue')
    assert.ok(queue.every(v => v.bank_question_id && v.bank_question_id !== parent.id), 'bank queue never includes the parent')
    assert.ok(queue.every(v => v.subtopic === parent.subtopic), 'bank queue is strictly same-subtopic')
    assert.equal(rec.calls.source.at(-1), 'bank')
    assert.equal(rec.calls.status.at(-1), 'activated')
  })

  test('treats DB timeout the same as DB-empty (falls through to fallback)', async () => {
    const rec = makeStateRecorder()
    const ctx = {
      parentQuestion: makeParent(),
      questions: [makeBankQuestion('q_other_1')],
      deps: {
        ...baseDeps(),
        getRemediationVariants: () => new Promise(() => {}),  // hangs
        dbTimeoutMs: 20,
      },
      pendingBackground: new Set(),
      ...rec,
    }
    const queue = await runGenerateRemediationQueue(ctx)
    await flushBackground(ctx)

    // Should not throw, should not stick on 'generating'.
    assert.equal(rec.calls.status.at(-1), 'activated')
    assert.ok(Array.isArray(queue))
  })

  test('AI returning 0 variants with no related local — graceful empty exit', async () => {
    const rec = makeStateRecorder()
    let aiCalled = false
    const ctx = {
      parentQuestion: makeParent(),
      // No same-topic / same-concept questions in the bank → no local fallback.
      questions: [makeBankQuestion('q_unrelated', { topic: 'Other', concept_tag: 'other' })],
      deps: {
        ...baseDeps(),
        generateAIVariants: async () => { aiCalled = true; return [] },
      },
      pendingBackground: new Set(),
      ...rec,
    }
    const queue = await runGenerateRemediationQueue(ctx)
    await flushBackground(ctx)

    assert.deepEqual(queue, [])
    assert.equal(aiCalled, true)
    assert.equal(rec.calls.status.at(-1), 'activated', 'never stuck on generating')
    assert.equal(rec.calls.source.at(-1), 'generated')
    assert.deepEqual(rec.calls.queue.at(-1), [])
  })

  test('AI returning variants with no local — uses AI queue', async () => {
    const rec = makeStateRecorder()
    const ctx = {
      parentQuestion: makeParent(),
      questions: [],
      deps: {
        ...baseDeps(),
        generateAIVariants: async () => [
          { question: 'ai 1', options: ['a', 'b', 'c', 'd'], answer_index: 0, difficulty: 2 },
          { question: 'ai 2', options: ['a', 'b', 'c', 'd'], answer_index: 1, difficulty: 2 },
        ],
        insertVariants: async (_p, gen) => gen,
        insertToBank: async () => [],
      },
      pendingBackground: new Set(),
      ...rec,
    }
    const queue = await runGenerateRemediationQueue(ctx)
    await flushBackground(ctx)

    assert.equal(queue.length, 2)
    assert.ok(queue.every(v => v.source === 'ai_generated'))
    assert.equal(rec.calls.status.at(-1), 'activated')
  })

  test('AI throwing is caught — does not strand status on generating', async () => {
    const rec = makeStateRecorder()
    const ctx = {
      parentQuestion: makeParent(),
      questions: [],
      deps: {
        ...baseDeps(),
        generateAIVariants: async () => { throw new Error('network down') },
      },
      pendingBackground: new Set(),
      ...rec,
    }
    const queue = await runGenerateRemediationQueue(ctx)
    await flushBackground(ctx)

    assert.deepEqual(queue, [])
    assert.equal(rec.calls.status.at(-1), 'activated')
  })

  test('skipDbLookup=true bypasses the DB call entirely', async () => {
    const rec = makeStateRecorder()
    let dbCalled = false
    const ctx = {
      parentQuestion: makeParent(),
      questions: [],
      options: { skipDbLookup: true },
      deps: {
        ...baseDeps(),
        getRemediationVariants: async () => { dbCalled = true; return { directVariants: [], conceptVariants: [] } },
      },
      pendingBackground: new Set(),
      ...rec,
    }
    await runGenerateRemediationQueue(ctx)
    await flushBackground(ctx)

    assert.equal(dbCalled, false, 'DB lookup must be skipped')
    assert.equal(rec.calls.status.at(-1), 'activated')
  })
})

// ─── runEnterRemediation ───────────────────────────────────────────────────

describe('runEnterRemediation', () => {
  test('uses stored DB variants when present and never calls AI', async () => {
    const parent = makeParent()
    const rec = makeStateRecorder()
    let aiCalled = false
    const deps = {
      ...baseDeps(),
      getRemediationVariants: async () => ({
        directVariants: [makeStoredVariant('v1'), makeStoredVariant('v2')],
        conceptVariants: [],
      }),
      generateAIVariants: async () => { aiCalled = true; return [] },
    }
    const ctx = {
      parentQuestion: parent,
      prefetched: new Map(),
      deps,
      generateRemediationQueue: async (...args) =>
        runGenerateRemediationQueue({
          parentQuestion: args[0],
          existingUsedIds: args[1],
          difficultyTarget: args[2],
          options: args[3],
          questions: [],
          deps,
          pendingBackground: ctx.pendingBackground,
          ...rec,
        }),
      pendingBackground: new Set(),
      ...rec,
    }
    await runEnterRemediation(ctx)
    await flushBackground(ctx)

    assert.equal(aiCalled, false)
    assert.equal(rec.calls.status.at(-1), 'activated')
    assert.equal(rec.calls.mode.at(-1), true)
    assert.equal(rec.calls.streak.at(-1), 0)
    // Queue setter should have received a non-empty array.
    const lastQueue = rec.calls.queue.at(-1)
    assert.ok(Array.isArray(lastQueue) && lastQueue.length > 0)
  })

  test('DB empty: delegates to generateRemediationQueue (local-fallback path)', async () => {
    const parent = makeParent()
    const rec = makeStateRecorder()
    const deps = {
      ...baseDeps(),
      getRemediationVariants: async () => ({ directVariants: [], conceptVariants: [] }),
    }
    const questions = [makeBankQuestion('q_other_1'), makeBankQuestion('q_other_2')]
    const pendingBackground = new Set()
    const ctx = {
      parentQuestion: parent,
      prefetched: new Map(),
      deps,
      generateRemediationQueue: (parentQ, used, target, opts) =>
        runGenerateRemediationQueue({
          parentQuestion: parentQ,
          existingUsedIds: used,
          difficultyTarget: target,
          options: opts,
          questions,
          deps,
          pendingBackground,
          ...rec,
        }),
      pendingBackground,
      ...rec,
    }
    await runEnterRemediation(ctx)
    await flushBackground(ctx)

    assert.equal(rec.calls.status.at(-1), 'activated', 'never stuck on generating')
  })

  test('DB hangs past timeout: enterRemediation still resolves to activated', async () => {
    const parent = makeParent()
    const rec = makeStateRecorder()
    const deps = {
      ...baseDeps(),
      getRemediationVariants: () => new Promise(() => {}),  // hangs
      dbTimeoutMs: 20,
    }
    const pendingBackground = new Set()
    const ctx = {
      parentQuestion: parent,
      prefetched: new Map(),
      deps,
      generateRemediationQueue: (parentQ, used, target, opts) =>
        runGenerateRemediationQueue({
          parentQuestion: parentQ,
          existingUsedIds: used,
          difficultyTarget: target,
          options: opts,
          questions: [],
          deps,
          pendingBackground,
          ...rec,
        }),
      pendingBackground,
      ...rec,
    }
    await runEnterRemediation(ctx)
    await flushBackground(ctx)

    assert.equal(rec.calls.status.at(-1), 'activated', 'a hung Supabase call must not freeze remediation')
  })

  test('uses prefetched variants and skips the live DB lookup', async () => {
    const parent = makeParent()
    const rec = makeStateRecorder()
    let liveCalled = false
    const prefetch = new Map([[parent.id, {
      directVariants: [makeStoredVariant('pre_1')],
      conceptVariants: [],
    }]])
    const deps = {
      ...baseDeps(),
      getRemediationVariants: async () => { liveCalled = true; return { directVariants: [], conceptVariants: [] } },
    }
    const ctx = {
      parentQuestion: parent,
      prefetched: prefetch,
      deps,
      generateRemediationQueue: async () => [],
      pendingBackground: new Set(),
      ...rec,
    }
    await runEnterRemediation(ctx)
    await flushBackground(ctx)

    assert.equal(liveCalled, false, 'prefetched cache should bypass live lookup')
    assert.equal(rec.calls.status.at(-1), 'activated')
  })
})

// ─── runLoadNextRemediationQuestion ────────────────────────────────────────

describe('runLoadNextRemediationQuestion', () => {
  test('pops the head off an existing queue', async () => {
    const rec = makeStateRecorder()
    const queueItem = { id: 'v1', variant_record_id: 'v1', question: 'x', is_variant: true }
    const ok = await runLoadNextRemediationQuestion({
      remediationQueue: [queueItem, { id: 'v2', variant_record_id: 'v2', question: 'y' }],
      remediationOriginalQ: makeParent(),
      remediationUsedIds: [],
      remediationDifficultyTarget: 2,
      deps: baseDeps(),
      generateRemediationQueue: async () => [],
      ...rec,
    })
    assert.equal(ok, true)
    assert.equal(rec.calls.displayQuestion.at(-1).id, 'v1')
    assert.equal(rec.calls.usedIds.at(-1)[0], 'v1')
    // status untouched on hot path — but importantly never set to 'generating'
    assert.ok(!rec.calls.status.includes('generating'))
  })

  test('queue empty + DB empty + AI empty → returns false and exits cleanly', async () => {
    const rec = makeStateRecorder()
    const parent = makeParent()
    const deps = {
      ...baseDeps(),
      getRemediationVariants: async () => ({ directVariants: [], conceptVariants: [] }),
      generateAIVariants: async () => [],
    }
    const ctx = {
      remediationQueue: [],
      remediationOriginalQ: parent,
      remediationUsedIds: [],
      remediationDifficultyTarget: 2,
      deps,
      pendingBackground: new Set(),
      generateRemediationQueue: (parentQ, used, target, opts) =>
        runGenerateRemediationQueue({
          parentQuestion: parentQ,
          existingUsedIds: used,
          difficultyTarget: target,
          options: opts,
          questions: [],
          deps,
          pendingBackground: ctx.pendingBackground,
          ...rec,
        }),
      ...rec,
    }
    const ok = await runLoadNextRemediationQuestion(ctx)
    await flushBackground(ctx)

    assert.equal(ok, false, 'must signal "no question loaded" so caller exits remediation')
    assert.equal(rec.calls.status.at(-1), 'activated', 'never stuck on generating')
  })

  test('serves an eased question early and the original-difficulty question for the final mastery step', async () => {
    const parent = makeParent({ difficulty: 3 })
    // Pool spans the eased (2) and original (3) difficulties.
    const pool = [
      { id: 'd3a', variant_record_id: 'd3a', difficulty: 3, is_variant: true, question: 'hard a', options: [], answer_index: 0 },
      { id: 'd2a', variant_record_id: 'd2a', difficulty: 2, is_variant: true, question: 'easy a', options: [], answer_index: 0 },
    ]

    // Early in the streak (streak 0, target 3) → wants the eased (difficulty-2) question.
    const recEarly = makeStateRecorder()
    await runLoadNextRemediationQuestion({
      remediationQueue: pool,
      remediationOriginalQ: parent,
      remediationUsedIds: [],
      remediationDifficultyTarget: 3,
      remediationStreak: 0,
      remediationTarget: 3,
      deps: baseDeps(),
      generateRemediationQueue: async () => [],
      ...recEarly,
    })
    assert.equal(recEarly.calls.displayQuestion.at(-1).id, 'd2a', 'early question is eased (difficulty 2)')

    // Final mastery step (streak 2, target 3) → wants the original (difficulty-3) question.
    const recFinal = makeStateRecorder()
    await runLoadNextRemediationQuestion({
      remediationQueue: pool,
      remediationOriginalQ: parent,
      remediationUsedIds: [],
      remediationDifficultyTarget: 3,
      remediationStreak: 2,
      remediationTarget: 3,
      deps: baseDeps(),
      generateRemediationQueue: async () => [],
      ...recFinal,
    })
    assert.equal(recFinal.calls.displayQuestion.at(-1).id, 'd3a', 'final question is at the original difficulty')
  })

  test('concept-builder jumps the queue ahead of a difficulty-matched question', async () => {
    const parent = makeParent({ difficulty: 3 })
    // streak 0 / target 3 → difficulty curve wants the eased (difficulty-2) question,
    // but a concept-builder is present and must be served first regardless.
    const queue = [
      { id: 'd2', variant_record_id: 'd2', difficulty: 2, is_variant: true, question: 'eased', options: [], answer_index: 0 },
      { id: 'cb', variant_record_id: 'cb', difficulty: 1, is_variant: true, variant_type: 'concept_builder', question: 'teacher q', options: [], answer_index: 0 },
    ]
    const rec = makeStateRecorder()
    await runLoadNextRemediationQuestion({
      remediationQueue: queue,
      remediationOriginalQ: parent,
      remediationUsedIds: [],
      remediationDifficultyTarget: 3,
      remediationStreak: 0,
      remediationTarget: 3,
      deps: baseDeps(),
      generateRemediationQueue: async () => [],
      ...rec,
    })
    assert.equal(rec.calls.displayQuestion.at(-1).id, 'cb', 'concept-builder served first')
  })

  test('queue empty + DB returns variants → loads first variant', async () => {
    const rec = makeStateRecorder()
    const parent = makeParent()
    const ok = await runLoadNextRemediationQuestion({
      remediationQueue: [],
      remediationOriginalQ: parent,
      remediationUsedIds: [],
      remediationDifficultyTarget: 2,
      deps: {
        ...baseDeps(),
        getRemediationVariants: async () => ({
          directVariants: [makeStoredVariant('v1'), makeStoredVariant('v2')],
          conceptVariants: [],
        }),
      },
      generateRemediationQueue: async () => [],
      ...rec,
    })
    assert.equal(ok, true)
    assert.equal(rec.calls.displayQuestion.length, 1)
    assert.equal(rec.calls.source.at(-1), 'prebuilt')
    assert.equal(rec.calls.status.at(-1), 'activated')
  })
})
