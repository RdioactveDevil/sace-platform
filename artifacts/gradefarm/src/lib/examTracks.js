// Exam-track definitions for the simulator. Each track has presentation
// metadata plus a demo paper (sections with a handful of mixed-format
// questions) so the simulator is fully runnable today. Real, full-length
// content per track is sourced from the question bank later via buildPaper's
// `pick` descriptors.

export const EXAM_TRACKS = [
  {
    id: 'mixed-mock',
    title: 'Mixed Skills Mock',
    short: 'Mock',
    icon: '🎯',
    accent: '#f1be43',
    blurb: 'A short, timed two-section paper that shows off every question format with deferred marking and a full report.',
    sections: [
      {
        id: 'reasoning',
        name: 'Section 1 · Reasoning',
        durationSec: 5 * 60,
        instructions: 'Answer all questions. You can flag questions to revisit. No feedback is shown until you finish the whole paper.',
        questions: [
          { id: 'mm-1', question_type: 'mcq', question: 'If $3x - 7 = 11$, what is $x$?', options: ['4', '6', '9', '18'], answer_index: 1, solution: '$3x = 18$, so $x = 6$.' },
          { id: 'mm-2', question_type: 'numeric', question: 'A train travels 240 km in 3 hours. What is its average speed in km/h?', answer: 80, tolerance: 0, unit: 'km/h', solution: '$240 \\div 3 = 80$ km/h.' },
          { id: 'mm-3', question_type: 'order', question: 'Order these numbers from smallest to largest.', items: ['0.3', '0.45', '0.5', '0.75'], solution: 'Compare decimal place values.' },
        ],
      },
      {
        id: 'science',
        name: 'Section 2 · Science',
        durationSec: 5 * 60,
        instructions: 'Apply core science concepts. Some questions accept more than one answer.',
        questions: [
          { id: 'mm-4', question_type: 'multi_select', question: 'Which of these are noble gases? (Select all that apply.)', options: ['Helium', 'Oxygen', 'Argon', 'Nitrogen'], answer_indices: [0, 2], solution: 'Helium and Argon are in Group 18.' },
          { id: 'mm-5', question_type: 'short_text', question: 'What is the chemical symbol for sodium?', accept: ['Na'], case_sensitive: true, solution: 'Sodium’s symbol is Na (from Latin natrium).' },
          { id: 'mm-6', question_type: 'mcq', question: 'Photosynthesis primarily occurs in which organelle?', options: ['Mitochondrion', 'Chloroplast', 'Nucleus', 'Ribosome'], answer_index: 1, solution: 'Chloroplasts contain chlorophyll and carry out photosynthesis.' },
        ],
      },
    ],
  },
  {
    id: 'ucat',
    title: 'UCAT-style Drill',
    short: 'UCAT',
    icon: '🩺',
    accent: '#60a5fa',
    blurb: 'Fast, timed quantitative and verbal reasoning under pressure — the format used for undergraduate medicine admission.',
    comingSoon: true,
    sections: [
      {
        id: 'quant',
        name: 'Quantitative Reasoning',
        durationSec: 3 * 60,
        instructions: 'Short calculations against the clock. Use the on-screen calculator from the tools dock if you need it.',
        questions: [
          { id: 'uc-1', question_type: 'numeric', question: 'A jacket costs $80 and is reduced by 35%. What is the sale price in dollars?', answer: 52, tolerance: 0, unit: '$', solution: '$80 \\times 0.65 = 52$.' },
          { id: 'uc-2', question_type: 'numeric', question: 'A recipe needs 250 g of flour for 10 biscuits. How many grams are needed for 14 biscuits?', answer: 350, tolerance: 0, unit: 'g', solution: '$250 \\div 10 \\times 14 = 350$ g.' },
          { id: 'uc-3', question_type: 'mcq', question: 'Which is largest?', options: ['$\\frac{3}{5}$', '0.58', '$\\frac{11}{20}$', '0.62'], answer_index: 3, solution: '0.62 > 0.60 > 0.58 > 0.55.' },
        ],
      },
    ],
  },
  {
    id: 'gamsat',
    title: 'GAMSAT-style Set',
    short: 'GAMSAT',
    icon: '🧬',
    accent: '#a78bfa',
    blurb: 'Reasoning across biological and physical sciences with data interpretation — the graduate medicine entry test.',
    comingSoon: true,
    sections: [
      {
        id: 's3',
        name: 'Reasoning in Sciences',
        durationSec: 6 * 60,
        instructions: 'Interpret each scenario and reason to the answer. Stimulus-based questions reward careful reading.',
        questions: [
          { id: 'gm-1', question_type: 'mcq', question: 'Doubling the concentration of reactant A quadruples the reaction rate. The reaction is what order in A?', options: ['Zero', 'First', 'Second', 'Third'], answer_index: 2, solution: 'Rate ∝ [A]²: ×2 concentration → ×4 rate.' },
          { id: 'gm-2', question_type: 'numeric', question: 'A 2.0 mol sample of gas occupies 49.6 L at SLC ($V_m = 24.8$ L/mol). What volume would 0.5 mol occupy at SLC?', answer: 12.4, tolerance: 0.1, unit: 'L', solution: '$0.5 \\times 24.8 = 12.4$ L.' },
          { id: 'gm-3', question_type: 'multi_select', question: 'Which quantities are vectors? (Select all that apply.)', options: ['Velocity', 'Speed', 'Force', 'Temperature'], answer_indices: [0, 2], solution: 'Velocity and force have direction; speed and temperature are scalars.' },
        ],
      },
    ],
  },
  {
    id: 'selective',
    title: 'Selective Entry',
    short: 'Selective',
    icon: '🎓',
    accent: '#34d399',
    blurb: 'Reading, mathematical reasoning and thinking skills for selective-school and scholarship entry tests.',
    comingSoon: true,
    sections: [
      {
        id: 'maths',
        name: 'Mathematical Reasoning',
        durationSec: 4 * 60,
        instructions: 'Solve each problem. Working it out on paper is encouraged before you answer.',
        questions: [
          { id: 'se-1', question_type: 'numeric', question: 'What is the next number in the sequence 2, 6, 12, 20, 30, …?', answer: 42, tolerance: 0, unit: '', solution: 'Differences increase by 2: +4, +6, +8, +10, +12 → 42.' },
          { id: 'se-2', question_type: 'mcq', question: 'A box holds 3 red and 5 blue balls. What is the probability of drawing a red ball?', options: ['$\\frac{3}{8}$', '$\\frac{5}{8}$', '$\\frac{3}{5}$', '$\\frac{1}{3}$'], answer_index: 0, solution: '3 red out of 8 total = 3/8.' },
          { id: 'se-3', question_type: 'order', question: 'Order these fractions from smallest to largest.', items: ['$\\frac{1}{4}$', '$\\frac{1}{3}$', '$\\frac{1}{2}$', '$\\frac{2}{3}$'], solution: 'Convert to a common denominator to compare.' },
        ],
      },
    ],
  },
]

export function getTrack(id) {
  return EXAM_TRACKS.find((t) => t.id === id) || null
}
