// The homepage's "Try it now" box: three sample questions that show what the
// engine does with each answer (see TryItBox.jsx for the screen).
//
//   - A right answer raises the difficulty for the next question.
//   - The first miss opens one Comeback Mode question like it (in the app
//     you'd get 3); the missed question goes to Spaced Repetition.
//   - Later misses go to Spaced Repetition only, so a run is 4 answers at most.
//   - "Skip to the end" goes straight to the finish.
//
// Everything here is pure: each function takes the state and returns the next
// one. Maths is LaTeX between $…$, drawn by MathText.

/** Sample Methods questions by difficulty. Each has one similar question for Comeback Mode. */
export const TRY_QUESTIONS = {
  2: [
    {
      topic: 'Differentiation', stem: 'Differentiate $y = x^3 - 2x$',
      options: ['$3x^2 - 2x$', '$3x^2 - 2$', '$x^2 - 2$', '$3x^3 - 2$'], answer: 1,
      working: 'Bring each power down and take one off: $3x^2 - 2$.',
      similar: {
        topic: 'Differentiation', stem: 'Differentiate $y = x^2 + 5x$',
        options: ['$2x + 5$', '$x + 5$', '$2x + 5x$', '$2x^2 + 5$'], answer: 0,
        working: '$2x$ from $x^2$, and $5$ from $5x$: $2x + 5$.',
      },
    },
    {
      topic: 'Linear functions', stem: 'Find the gradient of the line through $(1, 2)$ and $(3, 8)$',
      options: ['$6$', '$3$', '$2$', '$\\frac{1}{3}$'], answer: 1,
      working: 'Rise over run: $(8 - 2) \\div (3 - 1) = 6 \\div 2 = 3$.',
      similar: {
        topic: 'Linear functions', stem: 'Find the gradient of the line through $(2, 5)$ and $(4, 1)$',
        options: ['$2$', '$-2$', '$-4$', '$-\\frac{1}{2}$'], answer: 1,
        working: '$(1 - 5) \\div (4 - 2) = -4 \\div 2 = -2$.',
      },
    },
    {
      topic: 'Quadratics', stem: 'Solve $x^2 - 5x + 6 = 0$',
      options: ['$x = 2$ or $x = 3$', '$x = -2$ or $x = -3$', '$x = 1$ or $x = 6$', '$x = -1$ or $x = 6$'], answer: 0,
      working: 'It factorises to $(x - 2)(x - 3) = 0$, so $x = 2$ or $x = 3$.',
      similar: {
        topic: 'Quadratics', stem: 'Solve $x^2 - 7x + 12 = 0$',
        options: ['$x = -3$ or $x = -4$', '$x = 3$ or $x = 4$', '$x = 2$ or $x = 6$', '$x = 1$ or $x = 12$'], answer: 1,
        working: '$(x - 3)(x - 4) = 0$, so $x = 3$ or $x = 4$.',
      },
    },
  ],
  3: [
    {
      topic: 'Chain rule', stem: 'Differentiate $y = (2x - 5)^3$',
      options: ['$3(2x - 5)^2$', '$6(2x - 5)^2$', '$6x(2x - 5)^2$', '$(2x - 5)^2$'], answer: 1,
      working: 'Outside first, $3(2x - 5)^2$, then $\\times 2$ for the inside: $6(2x - 5)^2$.',
      similar: {
        topic: 'Chain rule', stem: 'Differentiate $y = (3x + 1)^2$',
        options: ['$2(3x + 1)$', '$6(3x + 1)$', '$3(3x + 1)^2$', '$6x(3x + 1)$'], answer: 1,
        working: 'Outside first, $2(3x + 1)$, then $\\times 3$ for the inside: $6(3x + 1)$.',
      },
    },
    {
      topic: 'Integration', stem: 'Find the area under $y = 3x^2$ from $x = 0$ to $x = 2$',
      options: ['$12$', '$4$', '$8$', '$6$'], answer: 2,
      working: 'The antiderivative is $x^3$, so $2^3 - 0^3 = 8$.',
      similar: {
        topic: 'Integration', stem: 'Find the area under $y = 2x$ from $x = 0$ to $x = 3$',
        options: ['$6$', '$9$', '$18$', '$3$'], answer: 1,
        working: 'The antiderivative is $x^2$, so $3^2 - 0^2 = 9$.',
      },
    },
  ],
  4: [
    {
      topic: 'Product rule', stem: 'Find the gradient of $y = x \\ln x$ at $x = e$',
      options: ['$2$', '$1$', '$e$', '$e + 1$'], answer: 0,
      working: '$\\frac{dy}{dx} = \\ln x + 1$. At $x = e$ that is $1 + 1 = 2$.',
      similar: {
        topic: 'Product rule', stem: 'Find the gradient of $y = x(x + 1)^2$ at $x = 1$',
        options: ['$4$', '$8$', '$6$', '$12$'], answer: 1,
        working: '$\\frac{dy}{dx} = (x + 1)^2 + 2x(x + 1)$. At $x = 1$: $4 + 4 = 8$.',
      },
    },
  ],
}

/** The question cards that drift past on the finish: "You'll never run out." Two rows. */
export const TRY_WALL = [
  ['Differentiate $y = x^3 - 2x$', 'Solve $x^2 - 5x + 6 = 0$', 'Find the area under $y = 3x^2$, $0 \\le x \\le 2$',
    'Find the turning point of $y = x^2 - 6x + 1$', 'Expand $(x + 3)(x - 2)$', 'Find the maximum of $y = 12x - x^3$',
    'Solve $2 \\sin x = 1$ for $0 \\le x \\le 2\\pi$'],
  ['Differentiate $y = (2x - 5)^3$', 'Factorise $x^2 - 16$', 'Find the gradient of $y = x \\ln x$ at $x = e$',
    'Solve $2x + 7 = 15$', 'Find the tangent to $y = x^2$ at $x = 3$', 'Differentiate $y = 5x^2$',
    'How many solutions does $x^3 - 3x = 1$ have?'],
]

export const TRY_RUN_LENGTH = 3
const START_LEVEL = 2
const MAX_LEVEL = 5

/** Where every run starts: question 1 at difficulty 2. */
export function tryStart() {
  return {
    level: START_LEVEL, step: 0, used: { 2: 1, 3: 0, 4: 0 }, question: TRY_QUESTIONS[2][0],
    mode: 'main', phase: 'ask', picked: null, correct: null, levelUp: false,
    missed: [], comebackUsed: false, comebackNext: false, lastMiss: null, answers: 0, key: 0,
  }
}

/** The next unused question at a level (the last one repeats if a level runs out). */
function takeQuestion(level, used) {
  const list = TRY_QUESTIONS[level] || TRY_QUESTIONS[MAX_LEVEL - 1]
  const n = used[level] || 0
  return { question: list[Math.min(n, list.length - 1)], used: { ...used, [level]: n + 1 } }
}

/** Mark the picked answer: the result shows, and the level and the missed list update. */
export function tryAnswer(state, index) {
  if (state.phase !== 'ask') return state
  const correct = index === state.question.answer
  const next = { ...state, phase: 'result', picked: index, correct, levelUp: false, comebackNext: false, answers: state.answers + 1 }
  if (state.mode === 'main' && correct) {
    next.level = Math.min(MAX_LEVEL, state.level + 1)
    next.levelUp = next.level > state.level
  }
  if (state.mode === 'main' && !correct) {
    next.missed = [...state.missed, state.question.topic]
    next.lastMiss = state.question
    next.comebackNext = !state.comebackUsed // only the first miss opens Comeback Mode
  }
  return next
}

/** On to the next question, into Comeback Mode, or to the finish. */
export function tryContinue(state) {
  if (state.phase !== 'result') return state
  if (state.mode === 'main' && state.comebackNext) {
    return { ...state, mode: 'comeback', comebackUsed: true, comebackNext: false, question: state.lastMiss.similar, phase: 'ask', picked: null, correct: null, levelUp: false, key: state.key + 1 }
  }
  const step = state.step + 1
  if (step >= TRY_RUN_LENGTH) return tryFinish(state)
  const { question, used } = takeQuestion(state.level, state.used)
  return { ...state, step, used, question, mode: 'main', phase: 'ask', picked: null, correct: null, levelUp: false, key: state.key + 1 }
}

/** The finish ("You'll never run out"), from the last question or "Skip to the end". */
export function tryFinish(state) {
  return { ...state, phase: 'done', levelUp: false, comebackNext: false }
}

/**
 * What the result says, and what comes next. `answer` is the right option
 * (LaTeX) when the answer was wrong.
 */
export function tryResult(state) {
  const last = state.step >= TRY_RUN_LENGTH - 1
  const nextQuestion = `Question ${state.step + 2} of ${TRY_RUN_LENGTH}`
  const q = state.question
  const out = {
    title: state.correct ? 'Correct.' : 'Not quite.',
    line: '', answer: state.correct ? null : q.options[q.answer],
    button: last ? 'See your results' : 'Next question',
    nextTitle: last ? 'Your results' : nextQuestion, nextNote: '', nextStars: false,
  }
  if (state.mode === 'main' && state.correct) {
    out.line = last ? 'Your difficulty goes up for next time.' : 'Increasing difficulty for the next question.'
    if (last) out.nextNote = 'How your three questions changed things'
    else { out.nextTitle = `${nextQuestion}: a harder one`; out.nextNote = `Difficulty ${state.level} of 5`; out.nextStars = true }
  } else if (state.mode === 'main' && state.comebackNext) {
    out.button = 'Try one like it'
    out.nextTitle = 'Comeback Mode: try one like it'
    out.nextNote = 'In the app you’d get 3 like this to progress.'
  } else if (state.mode === 'main') {
    out.nextNote = 'This one comes back in 1 hour with Spaced Repetition.'
  } else {
    if (state.correct) out.line = 'That’s Comeback Mode: practise it straight after you miss it.'
    out.button = last ? 'See your results' : 'Back to your questions'
    out.nextNote = last ? 'How your three questions changed things' : `Back to your questions at difficulty ${state.level} of 5`
    out.nextStars = !last
  }
  return out
}

/** Which legend card lights up: difficulty on a right answer, the other two on a miss. */
export function tryLegend(state) {
  const result = state.phase === 'result'
  const missNow = result && state.mode === 'main' && state.correct === false
  return {
    difficulty: result && state.mode === 'main' && state.correct === true,
    spaced: missNow,
    comeback: (state.mode === 'comeback' && state.phase !== 'done') || (missNow && state.comebackNext),
  }
}

/** The finish card's three rows. */
export function trySummary(state) {
  return {
    level: state.level,
    spaced: state.missed.length ? `${state.missed.join(', ')} back in 1 hour` : 'Nothing missed, so nothing to bring back',
    comeback: state.comebackUsed ? '1 similar question tried' : 'Not needed this time',
  }
}
