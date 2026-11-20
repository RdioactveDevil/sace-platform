// The homepage's "Try it now" box: pick a subject, then three sample
// questions that show what the engine does with each answer (see TryItBox.jsx
// for the screen).
//
//   - A right answer raises the difficulty for the next question.
//   - The first miss opens one Comeback Mode question like it (in the app
//     you'd get 3); the missed question goes to Spaced Repetition.
//   - Later misses go to Spaced Repetition only, so a run is 4 answers at most.
//   - "Skip to the end" goes straight to the finish.
//
// Everything here is pure: each function takes the state and returns the next
// one. Maths is LaTeX between $…$, drawn by MathText.

/** The subjects you can try, in the order they're offered. */
export const TRY_SUBJECTS = [
  { id: 'chemistry', name: 'Chemistry', note: 'Moles, bonding and reactions' },
  { id: 'english', name: 'English', note: 'Reading and writing' },
  { id: 'methods', name: 'Maths Methods', note: 'Calculus and algebra' },
]

/** Sample Methods questions by difficulty. Each has one similar question for Comeback Mode. */
const METHODS = {
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

/** Sample Chemistry questions (Year 11 and 12) by difficulty, each with one similar question. */
const CHEMISTRY = {
  2: [
    {
      topic: 'Moles', stem: 'How many moles are in $18$ g of water, $\\ce{H2O}$ ($M = 18\\ \\text{g mol}^{-1}$)?',
      options: ['$1$ mol', '$18$ mol', '$0.5$ mol', '$2$ mol'], answer: 0,
      working: '$n = m \\div M = 18 \\div 18 = 1$ mol.',
      similar: {
        topic: 'Moles', stem: 'How many moles are in $88$ g of $\\ce{CO2}$ ($M = 44\\ \\text{g mol}^{-1}$)?',
        options: ['$4$ mol', '$2$ mol', '$0.5$ mol', '$44$ mol'], answer: 1,
        working: '$n = m \\div M = 88 \\div 44 = 2$ mol.',
      },
    },
    {
      topic: 'Atomic structure', stem: 'Which particle has a negative charge?',
      options: ['Proton', 'Neutron', 'Electron', 'Nucleus'], answer: 2,
      working: 'Electrons are negative, protons are positive and neutrons have no charge.',
      similar: {
        topic: 'Atomic structure', stem: 'Which particle has no charge?',
        options: ['Proton', 'Electron', 'Neutron', 'Ion'], answer: 2,
        working: 'Neutrons have no charge. Protons are positive and electrons are negative.',
      },
    },
    {
      topic: 'Acids and bases', stem: 'What is the pH of a neutral solution at $25\\ ^\\circ\\text{C}$?',
      options: ['$0$', '$7$', '$14$', '$1$'], answer: 1,
      working: 'Neutral water at $25\\ ^\\circ\\text{C}$ has $[\\ce{H+}] = 10^{-7}$ mol L$^{-1}$, so the pH is $7$.',
      similar: {
        topic: 'Acids and bases', stem: 'A solution at $25\\ ^\\circ\\text{C}$ has a pH of $3$. It is',
        options: ['acidic', 'basic', 'neutral', 'impossible to tell'], answer: 0,
        working: 'At $25\\ ^\\circ\\text{C}$, a pH below $7$ is acidic.',
      },
    },
  ],
  3: [
    {
      topic: 'Concentration', stem: '$0.50$ mol of $\\ce{NaCl}$ is dissolved to make $250$ mL of solution. What is its concentration?',
      options: ['$0.125$ mol L$^{-1}$', '$2.0$ mol L$^{-1}$', '$0.50$ mol L$^{-1}$', '$125$ mol L$^{-1}$'], answer: 1,
      working: 'Change mL to L first: $c = n \\div V = 0.50 \\div 0.250 = 2.0$ mol L$^{-1}$.',
      similar: {
        topic: 'Concentration', stem: '$0.20$ mol of glucose is dissolved to make $500$ mL of solution. What is its concentration?',
        options: ['$0.10$ mol L$^{-1}$', '$0.40$ mol L$^{-1}$', '$2.5$ mol L$^{-1}$', '$0.20$ mol L$^{-1}$'], answer: 1,
        working: '$c = n \\div V = 0.20 \\div 0.500 = 0.40$ mol L$^{-1}$.',
      },
    },
    {
      topic: 'Intermolecular forces', stem: 'Which force is the strongest between water molecules?',
      options: ['Dispersion forces', 'Hydrogen bonding', 'Ionic bonding', 'Covalent bonding'], answer: 1,
      working: 'Water has O–H bonds, so its molecules hydrogen bond to each other. Covalent bonds are inside molecules, not between them.',
      similar: {
        topic: 'Intermolecular forces', stem: 'Which is the only force between methane ($\\ce{CH4}$) molecules?',
        options: ['Dispersion forces', 'Hydrogen bonding', 'Dipole–dipole forces', 'Ionic bonding'], answer: 0,
        working: 'Methane is non-polar, so only dispersion forces act between its molecules.',
      },
    },
  ],
  4: [
    {
      topic: 'Stoichiometry', stem: 'In $\\ce{2H2 + O2 -> 2H2O}$, how many moles of water form from $3$ mol of $\\ce{H2}$, with plenty of $\\ce{O2}$?',
      options: ['$3$ mol', '$6$ mol', '$1.5$ mol', '$2$ mol'], answer: 0,
      working: '$\\ce{H2}$ to $\\ce{H2O}$ is $2 : 2$, so $3$ mol of $\\ce{H2}$ makes $3$ mol of water.',
      similar: {
        topic: 'Stoichiometry', stem: 'In $\\ce{N2 + 3H2 -> 2NH3}$, how many moles of $\\ce{NH3}$ form from $6$ mol of $\\ce{H2}$, with plenty of $\\ce{N2}$?',
        options: ['$2$ mol', '$4$ mol', '$6$ mol', '$12$ mol'], answer: 1,
        working: '$\\ce{H2}$ to $\\ce{NH3}$ is $3 : 2$, so $6$ mol of $\\ce{H2}$ makes $4$ mol of $\\ce{NH3}$.',
      },
    },
  ],
}

/** Sample English questions (Year 6) by difficulty, each with one similar question. */
const ENGLISH = {
  2: [
    {
      topic: 'Grammar', stem: 'Which word is a noun?',
      options: ['quickly', 'happiness', 'run', 'beautiful'], answer: 1,
      working: 'A noun names a person, place, thing or idea. \u2018Happiness\u2019 is an idea.',
      similar: {
        topic: 'Grammar', stem: 'Which word is a verb?',
        options: ['jump', 'table', 'green', 'slowly'], answer: 0,
        working: 'A verb is an action or a state. \u2018Jump\u2019 is an action.',
      },
    },
    {
      topic: 'Punctuation', stem: 'Which sentence is punctuated correctly?',
      options: ['its raining outside.', 'It\u2019s raining outside.', 'Its\u2019 raining outside.', 'it\u2019s raining outside'], answer: 1,
      working: '\u2018It\u2019s\u2019 means \u2018it is\u2019, and a sentence starts with a capital letter and ends with a full stop.',
      similar: {
        topic: 'Punctuation', stem: 'Choose the right word: The dog wagged ___ tail.',
        options: ['it\u2019s', 'its', 'its\u2019', 'it is'], answer: 1,
        working: '\u2018Its\u2019 with no apostrophe shows belonging. \u2018It\u2019s\u2019 means \u2018it is\u2019.',
      },
    },
    {
      topic: 'Vocabulary', stem: 'Which word means the same as \u2018enormous\u2019?',
      options: ['tiny', 'huge', 'quiet', 'ancient'], answer: 1,
      working: '\u2018Enormous\u2019 means very big, so its synonym is \u2018huge\u2019.',
      similar: {
        topic: 'Vocabulary', stem: 'Which word means the opposite of \u2018ancient\u2019?',
        options: ['old', 'modern', 'broken', 'famous'], answer: 1,
        working: '\u2018Ancient\u2019 means very old, so its opposite is \u2018modern\u2019.',
      },
    },
  ],
  3: [
    {
      topic: 'Figurative language', stem: '\u2018The wind whispered through the trees.\u2019 Which technique is this?',
      options: ['Simile', 'Personification', 'Alliteration', 'Rhyme'], answer: 1,
      working: 'The wind is given a human action, whispering, so it\u2019s personification.',
      similar: {
        topic: 'Figurative language', stem: '\u2018Her smile was as bright as the sun.\u2019 Which technique is this?',
        options: ['Metaphor', 'Personification', 'Simile', 'Onomatopoeia'], answer: 2,
        working: 'It compares two things using \u2018as\u2019, so it\u2019s a simile.',
      },
    },
    {
      topic: 'Sentences', stem: 'Which is a complex sentence?',
      options: ['I ran.', 'I ran and I jumped.', 'Although it rained, we played outside.', 'Run!'], answer: 2,
      working: 'A complex sentence has a main clause and a dependent clause, like \u2018Although it rained\u2019.',
      similar: {
        topic: 'Sentences', stem: 'Which word joins the clauses in \u2018We stayed inside because it was cold.\u2019?',
        options: ['we', 'because', 'inside', 'cold'], answer: 1,
        working: '\u2018Because\u2019 is the conjunction that joins the two clauses.',
      },
    },
  ],
  4: [
    {
      topic: 'Inference', stem: '\u2018Mia\u2019s stomach fluttered as she stepped onto the stage.\u2019 How does Mia most likely feel?',
      options: ['Bored', 'Nervous', 'Angry', 'Sleepy'], answer: 1,
      working: 'A fluttering stomach just before going on stage suggests she\u2019s nervous.',
      similar: {
        topic: 'Inference', stem: '\u2018Tom slammed the door and stomped up the stairs.\u2019 How does Tom most likely feel?',
        options: ['Excited', 'Calm', 'Angry', 'Scared'], answer: 2,
        working: 'Slamming the door and stomping show he\u2019s angry.',
      },
    },
  ],
}

/** Every subject's questions, by subject id. */
export const TRY_QUESTIONS = { chemistry: CHEMISTRY, english: ENGLISH, methods: METHODS }

/** The question cards that drift past on the finish ("You'll never run out"), two rows per subject. */
const METHODS_WALL = [
  ['Differentiate $y = x^3 - 2x$', 'Solve $x^2 - 5x + 6 = 0$', 'Find the area under $y = 3x^2$, $0 \\le x \\le 2$',
    'Find the turning point of $y = x^2 - 6x + 1$', 'Expand $(x + 3)(x - 2)$', 'Find the maximum of $y = 12x - x^3$',
    'Solve $2 \\sin x = 1$ for $0 \\le x \\le 2\\pi$'],
  ['Differentiate $y = (2x - 5)^3$', 'Factorise $x^2 - 16$', 'Find the gradient of $y = x \\ln x$ at $x = e$',
    'Solve $2x + 7 = 15$', 'Find the tangent to $y = x^2$ at $x = 3$', 'Differentiate $y = 5x^2$',
    'How many solutions does $x^3 - 3x = 1$ have?'],
]
export const TRY_WALL = {
  methods: METHODS_WALL,
  chemistry: [
    ['Balance $\\ce{H2 + O2 -> H2O}$', 'Find the moles in $36$ g of $\\ce{H2O}$', 'What is the pH of $0.01$ M $\\ce{HCl}$?',
      'Name the bonding in $\\ce{NaCl}$', 'Which is the oxidising agent?', 'Draw the Lewis structure of $\\ce{NH3}$',
      'Find the concentration of $0.1$ mol in $250$ mL'],
    ['Why does water boil at $100\\ ^\\circ\\text{C}$?', 'Name the functional group in ethanol', 'Find the mass of $\\ce{CO2}$ produced',
      'Write the half-equation for $\\ce{Zn -> Zn^2+}$', 'Which gas turns limewater milky?', 'Find the empirical formula',
      'Predict the shape of $\\ce{H2O}$'],
  ],
  english: [
    ['Find the simile in the poem', 'Where does the apostrophe go?', 'What does \u2018reluctant\u2019 mean?', 'Spot the persuasive technique',
      'Which word is an adverb?', 'Why did the author end it this way?', 'Fix the run-on sentence'],
    ['What is the main idea of paragraph 2?', 'Choose the best synonym for \u2018brave\u2019', 'Who is telling the story?',
      'Which sentence uses a semicolon correctly?', 'Find the metaphor', 'What mood does the setting create?', 'Put these events in order'],
  ],
}

export const TRY_RUN_LENGTH = 3
const START_LEVEL = 2
const MAX_LEVEL = 5

/** Where every run starts: the subject's question 1, at difficulty 2. */
export function tryStart(subject = 'methods') {
  const set = TRY_QUESTIONS[subject] ? subject : 'methods'
  return {
    subject: set, level: START_LEVEL, step: 0, used: { 2: 1, 3: 0, 4: 0 }, question: TRY_QUESTIONS[set][2][0],
    mode: 'main', phase: 'ask', picked: null, correct: null, levelUp: false,
    missed: [], comebackUsed: false, comebackNext: false, lastMiss: null, answers: 0, key: 0,
  }
}

/** The next unused question at a level (the last one repeats if a level runs out). */
function takeQuestion(subject, level, used) {
  const bank = TRY_QUESTIONS[subject]
  const list = bank[level] || bank[MAX_LEVEL - 1]
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
  const { question, used } = takeQuestion(state.subject, state.level, state.used)
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
  const nextQuestion = `Question ${state.step + 2}`
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
    else { out.nextTitle = `${nextQuestion}: a harder one`; out.nextNote = `Difficulty ${state.level}`; out.nextStars = true }
  } else if (state.mode === 'main' && state.comebackNext) {
    out.button = 'Try one like it'
    out.nextTitle = 'Comeback Mode: try one like it'
    out.nextNote = 'In the app you’d get 3 like this to progress.'
  } else if (state.mode === 'main') {
    out.nextNote = 'This one comes back in 1 hour with Spaced Repetition.'
  } else {
    if (state.correct) out.line = 'That’s Comeback Mode: practise it straight after you miss it.'
    out.button = last ? 'See your results' : 'Back to your questions'
    out.nextNote = last ? 'How your three questions changed things' : `Back to your questions at difficulty ${state.level}`
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
