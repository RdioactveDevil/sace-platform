import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TRY_QUESTIONS, TRY_WALL, tryStart, tryAnswer, tryContinue, tryFinish, tryResult, tryLegend, trySummary } from './tryIt.js'

const right = (s) => tryAnswer(s, s.question.answer)
const wrong = (s) => tryAnswer(s, (s.question.answer + 1) % 4)

/** Play until the finish, choosing each answer with `choose`; returns the final state. */
function play(choose, limit = 20) {
  let s = tryStart()
  for (let i = 0; i < limit && s.phase !== 'done'; i++) s = tryContinue(choose(s))
  return s
}

test('every question has four options, a valid answer and one similar question', () => {
  for (const list of Object.values(TRY_QUESTIONS)) {
    for (const q of list) {
      for (const x of [q, q.similar]) {
        assert.equal(x.options.length, 4)
        assert.ok(x.answer >= 0 && x.answer < 4)
        assert.ok(x.stem && x.working && x.topic)
        assert.equal(new Set(x.options).size, 4, `duplicate option in "${x.stem}"`)
      }
    }
  }
  assert.equal(TRY_WALL.length, 2)
})

test('all right: three questions, each harder than the last', () => {
  let s = tryStart()
  assert.equal(s.level, 2)
  s = right(s)
  assert.equal(s.level, 3)
  assert.equal(tryResult(s).line, 'Increasing difficulty for the next question.')
  assert.equal(tryResult(s).nextTitle, 'Question 2 of 3: a harder one')
  assert.deepEqual(tryLegend(s), { difficulty: true, spaced: false, comeback: false })
  s = tryContinue(s)
  assert.equal(s.question, TRY_QUESTIONS[3][0])
  s = tryContinue(right(s))
  assert.equal(s.question, TRY_QUESTIONS[4][0])
  s = right(s)
  assert.equal(tryResult(s).button, 'See your results')
  s = tryContinue(s)
  assert.equal(s.phase, 'done')
  assert.equal(s.answers, 3)
  assert.deepEqual(trySummary(s), { level: 5, spaced: 'Nothing missed, so nothing to bring back', comeback: 'Not needed this time' })
})

test('the first miss opens one Comeback Mode question, then back to the run', () => {
  let s = wrong(tryStart())
  const r = tryResult(s)
  assert.equal(r.title, 'Not quite.')
  assert.equal(r.answer, '$3x^2 - 2$')
  assert.equal(r.button, 'Try one like it')
  assert.equal(r.nextTitle, 'Comeback Mode: try one like it')
  assert.deepEqual(tryLegend(s), { difficulty: false, spaced: true, comeback: true })
  assert.equal(s.level, 2, 'a miss keeps the difficulty')
  s = tryContinue(s)
  assert.equal(s.mode, 'comeback')
  assert.equal(s.question, TRY_QUESTIONS[2][0].similar)
  assert.equal(tryLegend(s).comeback, true, 'Comeback Mode stays lit while you are in it')
  s = right(s)
  assert.equal(tryResult(s).button, 'Back to your questions')
  assert.equal(s.level, 2, 'Comeback Mode answers do not change the difficulty')
  s = tryContinue(s)
  assert.equal(s.mode, 'main')
  assert.equal(s.step, 1)
})

test('later misses go to Spaced Repetition only, with no second detour', () => {
  let s = tryContinue(wrong(tryContinue(wrong(tryStart())))) // miss Q1, miss the Comeback question, back to Q2
  assert.equal(s.step, 1)
  s = wrong(s)
  assert.equal(s.comebackNext, false)
  assert.equal(tryResult(s).nextNote, 'This one comes back in 1 hour with Spaced Repetition.')
  assert.deepEqual(tryLegend(s), { difficulty: false, spaced: true, comeback: false })
})

test('a run is never more than 4 answers, however it goes', () => {
  const allWrong = play(wrong)
  assert.equal(allWrong.phase, 'done')
  assert.equal(allWrong.answers, 4)
  assert.equal(trySummary(allWrong).comeback, '1 similar question tried')
  assert.match(trySummary(allWrong).spaced, /^Differentiation, .+ back in 1 hour$/)
  for (let mask = 0; mask < 16; mask++) {
    let n = 0
    const s = play((st) => ((mask >> n++) & 1 ? right(st) : wrong(st)))
    assert.equal(s.phase, 'done')
    assert.ok(s.answers <= 4, `mask ${mask} took ${s.answers} answers`)
  }
})

test('skip goes straight to the finish; answering twice does nothing', () => {
  const s = tryFinish(tryStart())
  assert.equal(s.phase, 'done')
  const answered = right(tryStart())
  assert.equal(tryAnswer(answered, 0), answered)
  assert.equal(tryContinue(tryStart()).phase, 'ask', 'continue before answering does nothing')
})
