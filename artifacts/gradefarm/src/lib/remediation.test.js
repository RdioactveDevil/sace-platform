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

    assert.ok(queue.length >= 1, 'expected non-empty local fallback queue')
    assert.ok(queue.every(v => v.id !== parent.id), 'local fallback never includes the parent')
    assert.equal(rec.calls.source.at(-1), 'generated')
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
