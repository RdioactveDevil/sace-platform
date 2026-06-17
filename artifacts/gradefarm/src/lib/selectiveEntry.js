// Victorian Select Entry — content, curriculum metadata + paper builders for the
// dedicated selective-school-entry section (`/selective`).
//
// The Victorian selective-entry exam (sat in Year 8 for Year 9 entry to schools
// such as Melbourne High, Mac.Robertson Girls', Nossal and Suzanne Cory) is an
// Edutest-style paper with four multiple-choice components plus two written
// expression tasks:
//   • Reading Comprehension
//   • Verbal Reasoning
//   • Numerical Reasoning
//   • Mathematics
//   • Written Expression  (handled by the AI writing module, see WRITING_TASKS)
//
// Each component is a real DB curriculum (see the selective-entry seed migration)
// so practice runs through the platform's full adaptive quiz engine — struggle
// tracking, remediation and AI bank top-up — exactly like every other subject.
// The bundled bank below is the seed content (single source of truth shared with
// the migration generator) and also powers the timed mock + logged-out preview
// through the exam simulator. Questions use the shared multi-format schema so
// grading reuses `questionTypes.gradeResponse` unchanged.

export const SELECTIVE_BRAND = {
  name: 'Victorian Select Entry',
  short: 'Select Entry',
  accent: '#34d399',
  icon: '🎓',
  tagline: 'Year 9 selective-entry exam preparation',
  blurb:
    'Targeted, adaptive practice for the Victorian selective-entry exam — Reading, Verbal Reasoning, Numerical Reasoning, Mathematics and Written Expression, with AI writing feedback and a full timed mock.',
}

// Cohort label used as the curriculum level_label / subject-tile stage.
export const SELECTIVE_LEVEL_LABEL = 'Selective Entry'

// ── Component question banks ────────────────────────────────────────────────
// Every question carries topic + subtopic + difficulty (1–5) so the adaptive
// engine can target difficulty and filter by subtopic, and so remediation can
// group variants by concept.

const READING = [
  {
    id: 'se-rd-1', question_type: 'mcq', topic: 'Reading Comprehension', subtopic: 'Vocabulary in context', difficulty: 2,
    question:
      'Read the sentence: "The hikers were *elated* when they finally reached the summit after the gruelling climb." In this sentence, *elated* most nearly means:',
    options: ['exhausted', 'overjoyed', 'frightened', 'confused'],
    answer_index: 1,
    solution: 'Reaching the summit after a hard climb is a triumph, so "elated" means overjoyed/delighted.',
  },
  {
    id: 'se-rd-2', question_type: 'mcq', topic: 'Reading Comprehension', subtopic: 'Inference', difficulty: 3,
    question:
      'Passage: Maya checked her watch for the third time and tapped her foot. The bus was now twenty minutes late, and her interview started in fifteen. She pulled out her phone to book a taxi.\n\nWhat can we best infer about Maya?',
    options: ['She enjoys waiting for the bus', 'She is anxious about being late', 'She has cancelled her interview', 'She always travels by taxi'],
    answer_index: 1,
    solution: 'Checking her watch repeatedly, tapping her foot and booking a taxi all signal anxiety about being late.',
  },
  {
    id: 'se-rd-3', question_type: 'mcq', topic: 'Reading Comprehension', subtopic: 'Main idea & purpose', difficulty: 2,
    question:
      'Passage: Honeybees share the location of food through a "waggle dance". The direction of the dance shows the angle to the food relative to the sun, while the length of the waggle shows the distance. Through this dance a single bee can guide the whole hive to a rich source of nectar.\n\nThe main idea of this passage is that:',
    options: ['Honeybees prefer nectar to pollen', 'Bees dance to entertain the hive', 'Bees use a dance to communicate where food is', 'The sun decides where bees build hives'],
    answer_index: 2,
    solution: 'Every sentence supports the central point: the waggle dance communicates the location of food.',
  },
  {
    id: 'se-rd-4', question_type: 'mcq', topic: 'Reading Comprehension', subtopic: 'Main idea & purpose', difficulty: 3,
    question:
      'Passage: Plastic waste is choking our oceans. Each year millions of tonnes wash into the sea, killing marine life and poisoning the food chain. We must act now — before it is too late.\n\nThe author\'s main purpose is to:',
    options: ['describe how plastic is manufactured', 'persuade readers to address plastic pollution', 'tell an entertaining story', 'compare oceans with rivers'],
    answer_index: 1,
    solution: 'Emotive language ("choking", "must act now") shows the author is persuading, not merely informing.',
  },
  {
    id: 'se-rd-5', question_type: 'mcq', topic: 'Reading Comprehension', subtopic: 'Detail & logic', difficulty: 1,
    question:
      'Passage: The Wollemi pine was believed extinct for two million years, known only from fossils. Then, in 1994, a park ranger discovered a small grove of living trees in a remote canyon in Australia.\n\nAccording to the passage, the living Wollemi pines were found:',
    options: ['in a museum', 'in 1994', 'two million years ago', 'inside a fossil'],
    answer_index: 1,
    solution: 'The passage states the grove of living trees was discovered in 1994.',
  },
  {
    id: 'se-rd-6', question_type: 'mcq', topic: 'Reading Comprehension', subtopic: 'Vocabulary in context', difficulty: 3,
    question: 'Read: "Despite the *meagre* rations, the explorers pressed on." The word *meagre* most nearly means:',
    options: ['plentiful', 'scarce', 'delicious', 'frozen'],
    answer_index: 1,
    solution: '"Despite" signals a hardship, and meagre rations are small/scarce supplies.',
  },
  {
    id: 'se-rd-7', question_type: 'mcq', topic: 'Reading Comprehension', subtopic: 'Inference', difficulty: 4,
    question:
      'Passage: "Oh, wonderful," said Tom flatly, staring at the mountain of dishes in the sink. "Exactly how I wanted to spend my Saturday."\n\nTom most likely feels:',
    options: ['genuinely delighted', 'sarcastic and annoyed', 'calm and grateful', 'surprised and excited'],
    answer_index: 1,
    solution: 'Saying "wonderful" *flatly* about a chore is verbal irony — Tom is being sarcastic and is annoyed.',
  },
  {
    id: 'se-rd-8', question_type: 'mcq', topic: 'Reading Comprehension', subtopic: 'Detail & logic', difficulty: 3,
    question:
      'Passage: All members of the chess club must attend Friday practice. Priya is a member of the chess club.\n\nWhich conclusion must be true?',
    options: ['Priya dislikes chess', 'Priya must attend Friday practice', 'Priya is the best player in the club', 'Friday practice is optional'],
    answer_index: 1,
    solution: 'If all members must attend and Priya is a member, it follows that Priya must attend.',
  },
]

const VERBAL = [
  {
    id: 'se-vb-1', question_type: 'mcq', topic: 'Verbal Reasoning', subtopic: 'Analogies', difficulty: 2,
    question: 'Choose the word that completes the analogy: Bird is to *flock* as wolf is to ___',
    options: ['pack', 'herd', 'school', 'swarm'],
    answer_index: 0,
    solution: 'A group of birds is a flock; a group of wolves is a pack.',
  },
  {
    id: 'se-vb-2', question_type: 'mcq', topic: 'Verbal Reasoning', subtopic: 'Analogies', difficulty: 3,
    question: '*Author* is to *book* as *composer* is to ___',
    options: ['orchestra', 'symphony', 'piano', 'audience'],
    answer_index: 1,
    solution: 'An author creates a book; a composer creates a symphony.',
  },
  {
    id: 'se-vb-3', question_type: 'mcq', topic: 'Verbal Reasoning', subtopic: 'Odd one out', difficulty: 2,
    question: 'Which word does NOT belong with the others?',
    options: ['Sparrow', 'Eagle', 'Bat', 'Robin'],
    answer_index: 2,
    solution: 'Sparrow, eagle and robin are birds; a bat is a mammal.',
  },
  {
    id: 'se-vb-4', question_type: 'mcq', topic: 'Verbal Reasoning', subtopic: 'Synonyms & antonyms', difficulty: 2,
    question: 'Choose the word closest in meaning to *abundant*.',
    options: ['rare', 'plentiful', 'empty', 'heavy'],
    answer_index: 1,
    solution: '"Abundant" means existing in large quantities — plentiful.',
  },
  {
    id: 'se-vb-5', question_type: 'mcq', topic: 'Verbal Reasoning', subtopic: 'Synonyms & antonyms', difficulty: 3,
    question: 'Choose the word most OPPOSITE in meaning to *expand*.',
    options: ['grow', 'stretch', 'contract', 'widen'],
    answer_index: 2,
    solution: '"Expand" means to get bigger; its opposite is "contract".',
  },
  {
    id: 'se-vb-6', question_type: 'mcq', topic: 'Verbal Reasoning', subtopic: 'Codes & letter patterns', difficulty: 3,
    question: 'Find the next pair in the series: AB, DE, GH, JK, ___',
    options: ['LM', 'MN', 'KL', 'NO'],
    answer_index: 1,
    solution: 'Each pair skips one letter: AB, (c) DE, (f) GH, (i) JK, (l) MN.',
  },
  {
    id: 'se-vb-7', question_type: 'mcq', topic: 'Verbal Reasoning', subtopic: 'Codes & letter patterns', difficulty: 4,
    question: 'In a code each letter is shifted forward by one (A→B, B→C, …). If FRIEND becomes GSJFOE, what does CAT become?',
    options: ['DBU', 'DBT', 'EBV', 'CBU'],
    answer_index: 0,
    solution: 'C→D, A→B, T→U, giving DBU.',
  },
  {
    id: 'se-vb-8', question_type: 'mcq', topic: 'Verbal Reasoning', subtopic: 'Analogies', difficulty: 2,
    question: '*Thermometer* is to *temperature* as *clock* is to ___',
    options: ['speed', 'time', 'weight', 'distance'],
    answer_index: 1,
    solution: 'A thermometer measures temperature; a clock measures time.',
  },
]

const NUMERICAL = [
  {
    id: 'se-nr-1', question_type: 'numeric', topic: 'Numerical Reasoning', subtopic: 'Number sequences', difficulty: 3,
    question: 'What is the next number in the sequence: 3, 6, 11, 18, 27, …?',
    answer: 38, tolerance: 0,
    solution: 'The differences grow by 2 each time (+3, +5, +7, +9, +11), so 27 + 11 = 38.',
  },
  {
    id: 'se-nr-2', question_type: 'numeric', topic: 'Numerical Reasoning', subtopic: 'Number sequences', difficulty: 2,
    question: 'What number is missing? 2, 4, 8, 16, __, 64',
    answer: 32, tolerance: 0,
    solution: 'Each term doubles: 16 × 2 = 32.',
  },
  {
    id: 'se-nr-3', question_type: 'mcq', topic: 'Numerical Reasoning', subtopic: 'Patterns', difficulty: 2,
    question: 'Which number completes the pattern: 1, 4, 9, 16, 25, ___?',
    options: ['30', '36', '35', '49'],
    answer_index: 1,
    solution: 'These are square numbers (1², 2², 3², 4², 5²), so the next is 6² = 36.',
  },
  {
    id: 'se-nr-4', question_type: 'numeric', topic: 'Numerical Reasoning', subtopic: 'Ratios & proportion', difficulty: 2,
    question: 'A shop sold 120 ice creams on Monday and 25% more on Tuesday. How many did it sell on Tuesday?',
    answer: 150, tolerance: 0,
    solution: '25% of 120 is 30, so Tuesday = 120 + 30 = 150.',
  },
  {
    id: 'se-nr-5', question_type: 'numeric', topic: 'Numerical Reasoning', subtopic: 'Ratios & proportion', difficulty: 3,
    question: 'Half of a number is 18. What is one third of the same number?',
    answer: 12, tolerance: 0,
    solution: 'If half the number is 18, the number is 36, and one third of 36 is 12.',
  },
  {
    id: 'se-nr-6', question_type: 'numeric', topic: 'Numerical Reasoning', subtopic: 'Averages & data', difficulty: 4,
    question: 'The average of four numbers is 20. Three of them are 15, 22 and 18. What is the fourth number?',
    answer: 25, tolerance: 0,
    solution: 'The four numbers total 4 × 20 = 80. The known three sum to 55, so the fourth is 80 − 55 = 25.',
  },
  {
    id: 'se-nr-7', question_type: 'mcq', topic: 'Numerical Reasoning', subtopic: 'Ratios & proportion', difficulty: 3,
    question: 'In a class the ratio of girls to boys is 3 : 2. If there are 12 girls, how many boys are there?',
    options: ['6', '8', '10', '18'],
    answer_index: 1,
    solution: '12 girls is 3 parts, so 1 part = 4. Boys are 2 parts = 8.',
  },
  {
    id: 'se-nr-8', question_type: 'numeric', topic: 'Numerical Reasoning', subtopic: 'Averages & data', difficulty: 2,
    question: 'If 3 pencils cost 90 cents, how much do 7 pencils cost, in cents?',
    answer: 210, tolerance: 0,
    solution: 'One pencil costs 30 cents, so 7 pencils cost 7 × 30 = 210 cents.',
  },
]

const MATHS = [
  {
    id: 'se-mt-1', question_type: 'numeric', topic: 'Mathematics', subtopic: 'Number & percentages', difficulty: 2,
    question: 'What is 15% of 240?',
    answer: 36, tolerance: 0,
    solution: '10% of 240 is 24 and 5% is 12, so 15% = 36.',
  },
  {
    id: 'se-mt-2', question_type: 'mcq', topic: 'Mathematics', subtopic: 'Fractions & decimals', difficulty: 3,
    question: 'Which fraction is the largest?',
    options: ['$\\frac{2}{3}$', '$\\frac{3}{5}$', '$\\frac{5}{8}$', '$\\frac{7}{12}$'],
    answer_index: 0,
    solution: 'As decimals: 0.667, 0.600, 0.625, 0.583. The largest is 2/3.',
  },
  {
    id: 'se-mt-3', question_type: 'numeric', topic: 'Mathematics', subtopic: 'Geometry & measurement', difficulty: 1,
    question: 'A rectangle is 8 cm long and 5 cm wide. What is its area in square centimetres?',
    answer: 40, tolerance: 0, unit: 'cm²',
    solution: 'Area = length × width = 8 × 5 = 40 cm².',
  },
  {
    id: 'se-mt-4', question_type: 'numeric', topic: 'Mathematics', subtopic: 'Algebra & word problems', difficulty: 2,
    question: 'Solve for $x$: $4x + 7 = 31$.',
    answer: 6, tolerance: 0,
    solution: '$4x = 31 - 7 = 24$, so $x = 6$.',
  },
  {
    id: 'se-mt-5', question_type: 'mcq', topic: 'Mathematics', subtopic: 'Number & percentages', difficulty: 3,
    question: 'A bag holds 4 red, 3 green and 5 blue marbles. What is the probability of drawing a green marble?',
    options: ['$\\frac{1}{4}$', '$\\frac{1}{3}$', '$\\frac{3}{5}$', '$\\frac{5}{12}$'],
    answer_index: 0,
    solution: 'There are 12 marbles and 3 are green: 3/12 = 1/4.',
  },
  {
    id: 'se-mt-6', question_type: 'numeric', topic: 'Mathematics', subtopic: 'Number & percentages', difficulty: 3,
    question: 'A car travels 180 km in 2.5 hours. What is its average speed in km/h?',
    answer: 72, tolerance: 0, unit: 'km/h',
    solution: 'Speed = distance ÷ time = 180 ÷ 2.5 = 72 km/h.',
  },
  {
    id: 'se-mt-7', question_type: 'numeric', topic: 'Mathematics', subtopic: 'Algebra & word problems', difficulty: 4,
    question: 'Sarah is twice as old as Tom. In 5 years, their combined age will be 40. How old is Tom now?',
    answer: 10, tolerance: 0,
    solution: 'Let Tom be $t$ and Sarah $2t$. $(t+5)+(2t+5)=40 \\Rightarrow 3t+10=40 \\Rightarrow t=10$.',
  },
  {
    id: 'se-mt-8', question_type: 'order', topic: 'Mathematics', subtopic: 'Fractions & decimals', difficulty: 3,
    question: 'Put these values in order from smallest to largest.',
    items: ['$0.6$', '$\\frac{2}{3}$', '$0.75$', '$\\frac{4}{5}$'],
    solution: 'As decimals: 0.6, 0.667, 0.75, 0.8.',
  },
]

// ── Components (ordered as the student meets them) ───────────────────────────
// `curriculumName` is the canonical `questions.subject` / `curricula.name` used
// by the seed migration and the adaptive subject tile.

export const SELECTIVE_COMPONENTS = [
  {
    id: 'reading',
    name: 'Reading Comprehension',
    short: 'Reading',
    icon: '📖',
    accent: '#60a5fa',
    curriculumName: 'Selective Reading Comprehension',
    topic: 'Reading Comprehension',
    subtopics: ['Vocabulary in context', 'Inference', 'Main idea & purpose', 'Detail & logic'],
    blurb: 'Inference, main idea, vocabulary-in-context and author purpose across short passages.',
    instructions: 'Read each passage carefully and choose the best answer. You can flag questions and return to them before you finish.',
    practiceDurationSec: 12 * 60,
    mockDurationSec: 10 * 60,
    questions: READING,
  },
  {
    id: 'verbal',
    name: 'Verbal Reasoning',
    short: 'Verbal',
    icon: '🔤',
    accent: '#a78bfa',
    curriculumName: 'Selective Verbal Reasoning',
    topic: 'Verbal Reasoning',
    subtopics: ['Analogies', 'Synonyms & antonyms', 'Odd one out', 'Codes & letter patterns'],
    blurb: 'Analogies, odd-one-out, synonyms and antonyms, codes and letter patterns.',
    instructions: 'Work through each word problem and choose the best answer. Eliminate options you are sure are wrong.',
    practiceDurationSec: 10 * 60,
    mockDurationSec: 8 * 60,
    questions: VERBAL,
  },
  {
    id: 'numerical',
    name: 'Numerical Reasoning',
    short: 'Numerical',
    icon: '🔢',
    accent: '#f59e0b',
    curriculumName: 'Selective Numerical Reasoning',
    topic: 'Numerical Reasoning',
    subtopics: ['Number sequences', 'Patterns', 'Ratios & proportion', 'Averages & data'],
    blurb: 'Number sequences, patterns, ratios, averages and quantitative problem solving.',
    instructions: 'Solve each problem — working it out on paper first is encouraged. Type numeric answers as digits.',
    practiceDurationSec: 10 * 60,
    mockDurationSec: 8 * 60,
    questions: NUMERICAL,
  },
  {
    id: 'maths',
    name: 'Mathematics',
    short: 'Maths',
    icon: '🧮',
    accent: '#34d399',
    curriculumName: 'Selective Mathematics',
    topic: 'Mathematics',
    subtopics: ['Number & percentages', 'Fractions & decimals', 'Geometry & measurement', 'Algebra & word problems'],
    blurb: 'Arithmetic, fractions, percentages, geometry, basic algebra and word problems.',
    instructions: 'Solve each question. Some are multiple choice and some need a typed numeric answer.',
    practiceDurationSec: 12 * 60,
    mockDurationSec: 10 * 60,
    questions: MATHS,
  },
]

export function getComponent(id) {
  return SELECTIVE_COMPONENTS.find((c) => c.id === id) || null
}

/**
 * Built-in subjects shipped by the Selective Entry version, in the shape the
 * version registry expects: { name (= curriculum/questions.subject), level,
 * componentId }.
 */
export function selectiveBuiltInSubjects() {
  return SELECTIVE_COMPONENTS.map((c) => ({
    name: c.curriculumName,
    level: SELECTIVE_LEVEL_LABEL,
    componentId: c.id,
  }))
}

/**
 * Subject tile for the adaptive quiz engine. The `curriculum_` id prefix makes
 * `questionsBankSubjectKeys` resolve the bank via `bankSubjectAliases(name,
 * stage)`, so the seeded `questions.subject` (= curriculumName) is loaded.
 */
export function selectiveSubjectTile(componentId) {
  const c = getComponent(componentId)
  if (!c) return null
  return {
    id: `curriculum_selective_${c.id}`,
    name: c.curriculumName,
    stage: SELECTIVE_LEVEL_LABEL,
    color: c.accent,
    icon: c.icon,
    topics: [c.topic],
    questionCount: c.questions.length,
    available: true,
  }
}

/** All seeded curricula (used by the seed-migration generator). */
export function selectiveCurriculaSeed() {  return SELECTIVE_COMPONENTS.map((c) => ({
    name: c.curriculumName,
    level_label: SELECTIVE_LEVEL_LABEL,
    subject_description: `${c.name} — ${SELECTIVE_BRAND.name}. ${c.blurb}`,
    topic: c.topic,
    subtopics: c.subtopics,
    questions: c.questions.map((q) => ({ ...q, subject: c.curriculumName })),
  }))
}

// ── Written Expression tasks (AI writing module) ────────────────────────────
// `subject` + `essayType` map to the /api/writing pipeline (see api-server
// routes/writing.ts ESSAY_CONFIG). `selective_vic` sets the Year-8 year range.

export const WRITING_TASKS = [
  { id: 'vse_creative', label: 'Creative Writing', subject: 'selective_vic', blurb: 'Imaginative / narrative response', timed: 15 },
  { id: 'vse_persuasive', label: 'Persuasive Writing', subject: 'selective_vic', blurb: 'Argue a position clearly', timed: 15 },
]

// ── Paper builders (timed mock + logged-out preview via the exam simulator) ──

/** Single-component practice paper (one section, generous timer). */
export function buildPracticePaper(componentId) {
  const c = getComponent(componentId)
  if (!c) return null
  return {
    title: `${SELECTIVE_BRAND.short} · ${c.name} practice`,
    sections: [
      { id: c.id, name: c.name, durationSec: c.practiceDurationSec, instructions: c.instructions, questions: c.questions },
    ],
  }
}

/** Full timed mock — every multiple-choice component as its own timed section. */
export function buildMockPaper() {
  return {
    title: `${SELECTIVE_BRAND.name} — Mock Exam`,
    sections: SELECTIVE_COMPONENTS.map((c) => ({
      id: c.id, name: c.name, durationSec: c.mockDurationSec, instructions: c.instructions, questions: c.questions,
    })),
  }
}

/** Track id used for indicative scoring + percentile (see examScore.js). */
export const SELECTIVE_MOCK_TRACK_ID = 'selective-vic'
