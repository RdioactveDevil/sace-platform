// Questions for the browser checks: the cases a printed paper has to get
// right. source_question is set to each question's place, so a built exam
// and the preview number them the same.
const FIG = '/browser-checks/exam-papers/figure.png'
const base = { source: 'Fixture 2024 Trial Exam', source_kind: 'commercial', source_publisher: 'Fixture', source_year: 2024, source_paper: 'Exam' }

export const A = [
  { ...base, id: 'a1', exam_section: 'A', question_type: 'mcq', source_question: '1', question: 'The percentage error in the result obtained, expressed to the correct number of significant figures, is', options: ['0.26', '0.2648', '0.2654', '0.27'], answer_index: 0 },
  { ...base, id: 'a2', exam_section: 'A', question_type: 'mcq', source_question: '2', question: 'The energy profile below represents a reaction.\nWhich statement is correct?', image_url: FIG, options: ['It is exothermic.', 'It is endothermic.', 'It has no activation energy.', '$\\Delta H = 0$'], answer_index: 0 },
  { ...base, id: 'a3', exam_section: 'A', question_type: 'mcq', source_question: '3', question: 'Consider $\\ce{Ru(s) + Cl^- (aq) + NO3^- (aq) + x H^+ (aq) -> RuCl6^3- (aq) + NO2 (g) + y H2O (l)}$. The values of $x$ and $y$ are', options: ['$x = 3; y = 3$', '$x = 6; y = 3$', '$x = 3; y = 6$', '$x = 6; y = 6$'], answer_index: 1 },
]

export const B = [
  { ...base, id: 'b1', exam_section: 'B', question_type: 'extended', source_question: '1', question: 'Methanol is a very useful fuel. The energy profile diagram below represents the uncatalysed reaction.', image_url: FIG, parts: [
    { label: 'a', level: 1, text: 'On the energy profile diagram above, sketch how the catalyst would alter the reaction pathway.', marks: 1 },
    { label: 'b', level: 1, text: '', marks: 0 },
    { label: 'i', level: 2, text: 'How does the reaction temperature affect the yield of methanol? In your answer, refer to Le Chatelier’s principle.', marks: 2 },
    { label: 'ii', level: 2, text: 'How does the reaction pressure affect the yield of methanol?', marks: 2 },
    { label: 'c', level: 1, text: 'Write the expression for the equilibrium constant, $K_c$, for this reaction.', marks: 1 },
  ] },
  { ...base, id: 'b2', exam_section: 'B', question_type: 'extended', source_question: '2', question: 'The table below lists the viscosity of three organic compounds.\n\n| compound | viscosity (cP) |\n|---|---|\n| ethanoic acid | 1.06 |\n| octane | 0.74 |\n| octanoic acid | 4.11 |\n\nExplain the differences in viscosity of these three compounds.', parts: [{ label: '', level: 1, text: '', marks: 5 }] },
  { ...base, id: 'b3', exam_section: 'B', question_type: 'extended', source_question: '3', question: 'A student carried out an electrolysis.', parts: [
    { label: 'a', level: 1, text: 'Draw a labelled diagram of the electrolytic cell the teacher could set up.', marks: 3 },
    { label: 'b', level: 1, text: 'The power supply runs at 8.5 A for exactly 30.0 minutes. Calculate the mass of copper deposited.', marks: 4, image_url: FIG },
  ] },
]

// Questions that share information (lib/questionSets.js): a pair with a shared
// figure, and three questions sharing a method. The shared information is on
// the first question only; the others take it from there (fillShared).
const sets = { ...base, exam_section: 'A', question_type: 'mcq' }
export const SETS = [
  { ...sets, id: 's1', source_question: '4', set_key: 's1', set_position: 1, shared_info: 'A sample of biscuit was burnt under a beaker of water, as shown below.\nInitial temperature of the water: 22.50 °C\nFinal temperature of the water: 38.25 °C', shared_image_url: FIG,
    question: 'The energy released, in kJ, is closest to', options: ['1.65', '3.28', '5.61', '19.1'], answer_index: 2 },
  { ...sets, id: 's2', source_question: '5', set_key: 's1', set_position: 2, question: 'The energy content of the biscuit, in kJ $\\text{g}^{-1}$, is closest to', options: ['0.224', '1.65', '3.28', '19.1'], answer_index: 1 },
  { ...sets, id: 't1', source_question: '6', set_key: 't1', set_position: 1, shared_info: 'The following method was used.\n1. Weigh a clean 250 mL conical flask.\n2. Add 20 mL of deionised water.\n3. Titrate against the $\\ce{I2}$ solution.',
    question: 'Which error would underestimate the concentration?', options: ['w', 'x', 'y', 'z'], answer_index: 0 },
  { ...sets, id: 't2', source_question: '7', set_key: 't1', set_position: 2, question: 'The titre was 21.50 mL. The amount of $\\ce{I2}$, in mol, was', options: ['w', 'x', 'y', 'z'], answer_index: 1 },
  { ...sets, id: 't3', source_question: '8', set_key: 't1', set_position: 3, question: 'The percentage of vitamin C was', options: ['w', 'x', 'y', 'z'], answer_index: 2 },
]
